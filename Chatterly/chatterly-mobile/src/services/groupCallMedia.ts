import {Dimensions, NativeModules, PixelRatio, Platform} from 'react-native';
import {monitorCallInterruptions} from './callInterruption';
import {startGroupScreenShare, stopGroupScreenShare} from './groupCallRealtime';
import {trackCallDataUsage} from './dataUsage';
import {setAudioModeAsync} from 'expo-audio';
import {
  sendGroupCallAnswer,
  sendGroupCallIceCandidate,
  sendGroupCallOffer,
  type GroupCallSignalPayload,
} from './groupCallRealtime';
import type {CallType} from './chatRealtime';
import {canLoadWebRTC} from './nativeWebRTC';
import {appScreenSharingUnavailableMessage, supportsAppScreenSharing, type ScreenShareSource} from './screenShareSource';
import {startCallBackground, stopCallBackground} from './callBackground';

// Sprint 9 Story 2 media plane: a peer-to-peer mesh over the backend's
// `group_webrtc_offer` / `group_webrtc_answer` / `group_ice_candidate` events.
//
// It is the group-call sibling of callAudio.ts and follows the same two rules:
//
//  1. react-native-webrtc is required lazily, because Expo Go ships no native
//     WebRTC. When it is missing the conference still runs - signalling,
//     presence, the roster and every control are socket-driven - and the grid
//     falls back to avatar tiles with the local camera preview from
//     expo-camera. `isGroupCallMediaAvailable()` is what the screen asks.
//  2. Nothing here throws into the UI. Per-peer failures are isolated so one
//     bad connection cannot take the whole conference down.
//
// Glare control: both ends of a pair learn about each other independently (one
// from the join broadcast, one from the roster it fetched on joining), so the
// offerer is chosen deterministically by comparing user ids. Exactly one side
// offers, and neither has to wait for the other.

type MediaStreamTrackLike = {enabled?: boolean; kind?: string; onended?: (() => void) | null; readyState?: string; stop?: () => void};
type MediaStreamLike = {
  id?: string;
  toURL?: () => string;
  getTracks: () => MediaStreamTrackLike[];
  getAudioTracks: () => MediaStreamTrackLike[];
  getVideoTracks: () => MediaStreamTrackLike[];
  release?: () => void;
};
type SendParameters = {
  encodings: Array<{maxBitrate?: number | null; maxFramerate?: number | null; scaleResolutionDownBy?: number | null}>;
  degradationPreference?: string | null;
};
type Sender = {
  track?: MediaStreamTrackLike | null;
  replaceTrack: (track: MediaStreamTrackLike | null) => Promise<void>;
  getParameters?: () => SendParameters;
  setParameters?: (parameters: SendParameters) => Promise<void>;
};
type GroupCallDataChannel = {
  label: string;
  readyState: string;
  onmessage: ((event: {data: string}) => void) | null;
  send: (data: string) => void;
  close?: () => void;
};
type RTCPeerConnectionLike = {
  getStats?: () => Promise<unknown>;
  addTransceiver: (kind: string, options: {direction: string; streams: MediaStreamLike[]}) => {sender: Sender};
  localDescription?: unknown;
  remoteDescription?: unknown;
  signalingState?: string;
  onicecandidate?: (event: {candidate?: unknown}) => void;
  ontrack?: (event: {streams?: MediaStreamLike[]; track?: MediaStreamTrackLike}) => void;
  onconnectionstatechange?: () => void;
  connectionState?: string;
  createDataChannel?: (label: string) => GroupCallDataChannel;
  ondatachannel?: (event: {channel: GroupCallDataChannel}) => void;
  addTrack: (track: MediaStreamTrackLike, stream: MediaStreamLike) => Sender;
  createOffer: (options: {offerToReceiveAudio: boolean; offerToReceiveVideo: boolean}) => Promise<unknown>;
  setLocalDescription: (description: unknown) => Promise<void>;
  setRemoteDescription: (description: unknown) => Promise<void>;
  createAnswer: () => Promise<unknown>;
  addIceCandidate: (candidate: unknown) => Promise<void>;
  close: () => void;
};
type WebRTCModule = {
  mediaDevices: {getDisplayMedia: (constraints: Record<string, unknown>) => Promise<MediaStreamLike>; getUserMedia: (constraints: {audio: boolean | Record<string, unknown>; video: boolean | Record<string, unknown>}) => Promise<MediaStreamLike>};
  RTCPeerConnection: new (configuration: typeof GROUP_RTC_CONFIGURATION) => RTCPeerConnectionLike;
  RTCSessionDescription: new (description: {type: string; sdp: string}) => unknown;
  RTCIceCandidate: new (candidate: {candidate: string; sdpMid?: string; sdpMLineIndex?: number}) => unknown;
};

type Peer = {
  stopUsage?: () => void;
  userId: string;
  connection: RTCPeerConnectionLike;
  stream: MediaStreamLike | null;
  pendingCandidates: unknown[];
  negotiating: boolean;
  videoSender?: Sender;
  cameraParameters?: SendParameters;
  controlChannel?: GroupCallDataChannel;
  pendingControls: Map<string, {resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout>}>;
};

type GroupCallMediaSession = {
  groupCallId: string;
  selfId: string;
  type: CallType;
  muted: boolean;
  interrupted?: boolean;
  stopInterruption?: () => void;
  cameraOn: boolean;
  speaker: boolean;
  /** False while Audio Output is "No Audio": nobody else is played. */
  remoteAudioEnabled?: boolean;
  localStream: MediaStreamLike | null;
  peers: Map<string, Peer>;
  displayStream?: MediaStreamLike | null;
  screenLowBandwidth?: boolean;
  screenAdaptive?: boolean;
  screenRequest?: number;
  ready?: Promise<void>;
};

export type GroupCallRemoteStream = {userId: string; url: string};
export type GroupCallControlResult = {success: boolean; message?: string};
export type GroupCallControlMessage = {
  groupCallId: string;
  fromUserId: string;
  type: 'unmute-request';
  /** Confirms that the participant's local track and server state were updated. */
  respond: (result: GroupCallControlResult) => void;
};

/**
 * The parts of the in-call Settings screen that reach the capture pipeline.
 * Echo cancellation and noise suppression are real `getUserMedia` audio
 * constraints, and the video height is what Video Quality and Low Bandwidth
 * Mode resolve to.
 */
export type GroupCallCaptureOptions = {
  echoCancellation?: boolean;
  noiseSuppression?: boolean;
  videoHeight?: number;
};

const GROUP_RTC_CONFIGURATION = {
  iceServers: [
    {urls: 'stun:stun.l.google.com:19302'},
    {urls: 'stun:stun1.l.google.com:19302'},
  ],
};
const GROUP_CALL_CONTROL_CHANNEL = 'chatterly.group-call.controls';
const GROUP_CALL_CONTROL_TIMEOUT_MS = 7000;

let session: GroupCallMediaSession | null = null;
let webRTCModule: WebRTCModule | null | undefined;
let controlRequestSequence = 0;
const streamListeners = new Set<(streams: GroupCallRemoteStream[]) => void>();
const controlListeners = new Set<(message: GroupCallControlMessage) => void>();

function loadWebRTCModule(): WebRTCModule | null {
  if (webRTCModule !== undefined) { return webRTCModule; }
  if (!canLoadWebRTC()) {
    webRTCModule = null;
    return webRTCModule;
  }
  try {
    const loaded = require('react-native-webrtc') as Partial<WebRTCModule>;
    webRTCModule = loaded.mediaDevices?.getUserMedia && loaded.RTCPeerConnection && loaded.RTCSessionDescription && loaded.RTCIceCandidate
      ? (loaded as WebRTCModule)
      : null;
  } catch {
    webRTCModule = null;
  }
  return webRTCModule;
}

/**
 * Whether live audio/video can actually flow. False in Expo Go, where the
 * conference still works as a socket-driven session with avatar tiles.
 */
export const isGroupCallMediaAvailable = (): boolean => Boolean(loadWebRTCModule());

const callAudioMode = (speaker: boolean) => ({
  allowsRecording: true,
  allowsBackgroundRecording: true,
  playsInSilentMode: true,
  shouldPlayInBackground: true,
  shouldRouteThroughEarpiece: !speaker,
});

const idleAudioMode = {
  allowsRecording: false,
  allowsBackgroundRecording: false,
  playsInSilentMode: true,
  shouldPlayInBackground: false,
  shouldRouteThroughEarpiece: false,
};

function stopStream(stream: MediaStreamLike | null): void {
  stream?.getTracks().forEach(track => { track.stop?.(); });
  stream?.release?.();
}

// MediaProjection owns the display track's native lifetime. Stop it once, but
// do not release the stream wrapper while React Native WebRTC is restoring the
// camera sender; release() can tear down more than the capture on Android.
function stopDisplayStream(stream: MediaStreamLike | null): void {
  stream?.getTracks().forEach(track => {
    track.onended = null;
    if (track.readyState !== 'ended') { track.stop?.(); }
  });
}

function publishStreams(): void {
  const streams: GroupCallRemoteStream[] = [];
  session?.peers.forEach(peer => {
    const url = peer.stream?.toURL?.();
    if (url) { streams.push({userId: peer.userId, url}); }
  });
  streamListeners.forEach(listener => listener(streams));
}

/** Remote tile sources, republished whenever a peer's stream arrives or drops. */
export function subscribeToGroupCallStreams(listener: (streams: GroupCallRemoteStream[]) => void): () => void {
  streamListeners.add(listener);
  publishStreams();
  return () => { streamListeners.delete(listener); };
}

/** Peer-addressed controls that need to run on the participant's own device. */
export function subscribeToGroupCallControls(listener: (message: GroupCallControlMessage) => void): () => void {
  controlListeners.add(listener);
  return () => { controlListeners.delete(listener); };
}

function applyLocalTrackState(target: GroupCallMediaSession): void {
  target.localStream?.getAudioTracks().forEach(track => { track.enabled = !target.muted && !target.interrupted; });
  target.localStream?.getVideoTracks().forEach(track => { track.enabled = target.cameraOn && !target.interrupted; });
}

/**
 * Exactly one side of a pair offers. Comparing ids is arbitrary but stable, and
 * both peers compute the same answer without another round trip.
 */
const shouldOfferTo = (selfId: string, peerUserId: string): boolean => selfId > peerUserId;

function createPeer(target: GroupCallMediaSession, peerUserId: string): Peer | null {
  const existing = target.peers.get(peerUserId);
  if (existing) { return existing; }

  const module = loadWebRTCModule();
  if (!module) { return null; }

  const connection = new module.RTCPeerConnection(GROUP_RTC_CONFIGURATION);
  const peer: Peer = {userId: peerUserId, connection, stream: null, pendingCandidates: [], pendingControls: new Map(), negotiating: false};
  target.peers.set(peerUserId, peer);
  peer.stopUsage = trackCallDataUsage(connection);

  const bindControlChannel = (channel: GroupCallDataChannel) => {
    if (channel.label !== GROUP_CALL_CONTROL_CHANNEL) { return; }
    peer.controlChannel = channel;
    channel.onmessage = event => {
      if (session !== target || typeof event.data !== 'string' || event.data.length > 512) { return; }
      try {
        const message = JSON.parse(event.data) as {type?: unknown; requestId?: unknown; success?: unknown; message?: unknown};
        const requestId = typeof message.requestId === 'string' ? message.requestId.trim().slice(0, 64) : '';

        if (message.type === 'unmute-result') {
          if (!requestId) { return; }
          const pending = peer.pendingControls.get(requestId);
          if (!pending) { return; }
          clearTimeout(pending.timer);
          peer.pendingControls.delete(requestId);
          if (message.success === true) { pending.resolve(); }
          else { pending.reject(new Error(typeof message.message === 'string' && message.message.trim() ? message.message : 'The participant could not be unmuted.')); }
          return;
        }
        if (message.type !== 'unmute-request') { return; }
        let responded = false;
        // Earlier app versions send the request without an id and never read a
        // result. They are still honoured; only the reply is skipped.
        const respond = (result: GroupCallControlResult) => {
          if (!requestId || responded || session !== target || channel.readyState !== 'open') { return; }
          responded = true;
          try {
            channel.send(JSON.stringify({
              type: 'unmute-result',
              requestId,
              success: result.success,
              ...(result.message ? {message: result.message.slice(0, 240)} : {}),
            }));
          } catch { /* The requesting peer will report its acknowledgement timeout. */ }
        };
        if (!controlListeners.size) {
          respond({success: false, message: 'The participant is not ready to change microphone state.'});
          return;
        }
        controlListeners.forEach(listener => listener({
          groupCallId: target.groupCallId,
          fromUserId: peer.userId,
          type: 'unmute-request',
          respond,
        }));
      } catch { /* Ignore malformed peer controls without interrupting media. */ }
    };
  };
  connection.ondatachannel = event => bindControlChannel(event.channel);
  if (shouldOfferTo(target.selfId, peerUserId) && connection.createDataChannel) {
    try { bindControlChannel(connection.createDataChannel(GROUP_CALL_CONTROL_CHANNEL)); }
    catch { /* Calls still work on peers without data-channel support. */ }
  }

  connection.onicecandidate = event => {
    if (!event.candidate) { return; }
    sendGroupCallIceCandidate(target.groupCallId, peerUserId, event.candidate).catch(() => undefined);
  };

  connection.ontrack = event => {
    const [remoteStream] = event.streams || [];
    if (!remoteStream) { return; }
    peer.stream = remoteStream;
    remoteStream.getAudioTracks().forEach(track => { track.enabled = target.remoteAudioEnabled !== false && !target.interrupted; });
    publishStreams();
  };

  connection.onconnectionstatechange = () => {
    if (['failed', 'closed'].includes(String(connection.connectionState || ''))) {
      peer.stream = null;
      publishStreams();
    }
  };

  if (target.localStream) {
    target.localStream.getTracks().forEach(track => {
      try {
        const sender = connection.addTrack(track.kind === 'video' ? target.displayStream?.getVideoTracks()[0] || track : track, target.localStream as MediaStreamLike);
        if (track.kind === 'video') { peer.videoSender = sender; }
      } catch { /* already added */ }
    });
  }

  if (!peer.videoSender && target.localStream) {
    peer.videoSender = connection.addTransceiver('video', {direction: 'sendrecv', streams: [target.localStream]}).sender;
    if (target.displayStream) { peer.videoSender.replaceTrack(target.displayStream.getVideoTracks()[0]).catch(() => undefined); }
  }
  if (target.displayStream) { configureScreenSender(peer, target.screenLowBandwidth || false, target.screenAdaptive !== false).catch(() => undefined); }
  return peer;
}

async function flushCandidates(peer: Peer): Promise<void> {
  if (!peer.connection.remoteDescription) { return; }
  const pending = peer.pendingCandidates;
  peer.pendingCandidates = [];
  for (const candidate of pending) {
    await peer.connection.addIceCandidate(candidate).catch(() => undefined);
  }
}

/**
 * Acquire the microphone (and camera on a video call) and take ownership of the
 * audio route. Resolves to false when native WebRTC is unavailable so the
 * caller can fall back without treating it as an error.
 */
export async function startGroupCallMedia(options: {
  groupCallId: string;
  selfId: string;
  type: CallType;
  groupName?: string;
  muted?: boolean;
  cameraOn?: boolean;
  speaker?: boolean;
  capture?: GroupCallCaptureOptions;
}): Promise<boolean> {
  const groupCallId = String(options.groupCallId || '').trim();
  if (!groupCallId) { return false; }

  if (session && session.groupCallId !== groupCallId) { await stopGroupCallMedia(); }

  const speaker = options.speaker ?? true;
  await setAudioModeAsync(callAudioMode(speaker)).catch(() => undefined);

  if (!session) {
    session = {
      groupCallId,
      selfId: String(options.selfId || '').trim(),
      type: options.type,
      muted: Boolean(options.muted),
      cameraOn: options.cameraOn ?? options.type === 'video',
      speaker,
      localStream: null,
      peers: new Map(),
    };
  }

  const module = loadWebRTCModule();
  if (!module) { return false; }

  if (!session.localStream) {
    const capture = options.capture || {};
    const height = capture.videoHeight && capture.videoHeight > 0 ? capture.videoHeight : 720;
    const target = session;
    target.ready = (async () => {
      // Group calls need the same foreground lifetime as direct calls. Without
      // it, ending Android's MediaProjection service can suspend or kill the
      // app while the conference itself is still active.
      const backgroundStart = startCallBackground(groupCallId, options.type, options.groupName || 'Group Call');
      if (backgroundStart) { await backgroundStart; }
      if (session !== target) {
        await stopCallBackground(groupCallId);
        return;
      }
      let stream: MediaStreamLike;
      try {
        stream = await module.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: capture.echoCancellation !== false,
            noiseSuppression: capture.noiseSuppression !== false,
            autoGainControl: true,
          },
          video: options.type === 'video'
            ? {facingMode: 'user', width: Math.round((height * 16) / 9), height, frameRate: height <= 480 ? 20 : 30}
            : false,
        });
      } catch (error) {
        await stopCallBackground(groupCallId);
        throw error;
      }
      if (session !== target) {
        stopStream(stream);
        await stopCallBackground(groupCallId);
        return;
      }
      target.localStream = stream;
      target.stopInterruption = monitorCallInterruptions(interrupted => {
        if (session !== target) return;
        target.interrupted = interrupted;
        applyLocalTrackState(target);
        target.displayStream?.getTracks().forEach(track => { track.enabled = !interrupted; });
        target.peers.forEach(peer => peer.stream?.getAudioTracks().forEach(track => {
          track.enabled = !interrupted && target.remoteAudioEnabled !== false;
        }));
        if (!interrupted) setAudioModeAsync(callAudioMode(target.speaker)).catch(() => undefined);
      });
    })();
    await target.ready;
    if (session !== target) { return false; }
  }
  applyLocalTrackState(session);
  return true;
}

/** The local preview source, or '' when no native stream exists. */
export const getGroupCallLocalStreamUrl = (): string => session?.localStream?.toURL?.() || '';

/** The local display preview used by the dedicated presentation stage. */
export const getGroupCallScreenStreamUrl = (): string => session?.displayStream?.toURL?.() || '';

/**
 * Make sure a media path exists to `peerUserId`, offering when this device is
 * the designated offerer for the pair. Safe to call repeatedly.
 */
export async function connectGroupCallPeer(peerUserId: string): Promise<void> {
  const target = session;
  const peerId = String(peerUserId || '').trim();
  if (!target || !peerId || peerId === target.selfId) { return; }

  await target.ready;
  if (session !== target || !target.localStream) { return; }
  const peer = createPeer(target, peerId);
  if (!peer || peer.negotiating || peer.connection.localDescription) { return; }
  if (!shouldOfferTo(target.selfId, peerId)) { return; }

  peer.negotiating = true;
  try {
    const offer = await peer.connection.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true,
    });
    await peer.connection.setLocalDescription(offer);
    await sendGroupCallOffer(target.groupCallId, peerId, peer.connection.localDescription || offer);
    if (target.displayStream) { await configureScreenSender(peer, target.screenLowBandwidth || false, target.screenAdaptive !== false); }
  } catch {
    // A peer that cannot be reached is dropped rather than retried forever; the
    // next join/roster refresh creates a fresh connection.
    dropGroupCallPeer(peerId);
  } finally {
    peer.negotiating = false;
  }
}

/** Route one inbound `group_webrtc_*` payload into the matching peer. */
export async function handleGroupCallSignal(kind: 'offer' | 'answer' | 'ice', payload: GroupCallSignalPayload): Promise<void> {
  const target = session;
  const peerId = String(payload.fromUserId || '').trim();
  if (!target || !peerId || target.groupCallId !== payload.groupCallId) { return; }

  const module = loadWebRTCModule();
  if (!module) { return; }

  await target.ready;
  if (session !== target || !target.localStream) { return; }
  const peer = createPeer(target, peerId);
  if (!peer) { return; }

  try {
    if (kind === 'offer') {
      if (!payload.offer) { return; }
      await peer.connection.setRemoteDescription(new module.RTCSessionDescription(payload.offer as {type: string; sdp: string}));
      await flushCandidates(peer);
      const answer = await peer.connection.createAnswer();
      await peer.connection.setLocalDescription(answer);
      await sendGroupCallAnswer(target.groupCallId, peerId, peer.connection.localDescription || answer);
      if (target.displayStream) { await configureScreenSender(peer, target.screenLowBandwidth || false, target.screenAdaptive !== false); }
      return;
    }

    if (kind === 'answer') {
      if (!payload.answer || peer.connection.remoteDescription) { return; }
      await peer.connection.setRemoteDescription(new module.RTCSessionDescription(payload.answer as {type: string; sdp: string}));
      await flushCandidates(peer);
      return;
    }

    if (!payload.candidate) { return; }
    const candidate = new module.RTCIceCandidate(payload.candidate as {candidate: string; sdpMid?: string; sdpMLineIndex?: number});
    if (!peer.connection.remoteDescription) {
      peer.pendingCandidates.push(candidate);
      return;
    }
    await peer.connection.addIceCandidate(candidate);
  } catch {
    // Signalling is best-effort: a malformed or out-of-order payload must not
    // surface as a crash in the middle of a live call.
  }
}

export function dropGroupCallPeer(peerUserId: string): void {
  const peer = session?.peers.get(String(peerUserId || '').trim());
  if (!peer) { return; }
  session?.peers.delete(peer.userId);
  peer.pendingControls.forEach(pending => {
    clearTimeout(pending.timer);
    pending.reject(new Error('The participant left before confirming the microphone change.'));
  });
  peer.pendingControls.clear();
  if (peer.controlChannel) { peer.controlChannel.onmessage = null; peer.controlChannel.close?.(); }
  peer.stopUsage?.();
  try { peer.connection.close(); } catch { /* already closed */ }
  peer.stream = null;
  publishStreams();
}

/**
 * Ask one participant's device to restore its microphone. This resolves only
 * after that device has enabled its audio track and the existing authenticated
 * `group_call_unmute_self` action has succeeded, so replacing a video sender
 * with a screen-share track cannot produce a false unmute success.
 */
export async function requestGroupCallParticipantUnmute(peerUserId: string): Promise<void> {
  const target = session;
  const peerId = String(peerUserId || '').trim();
  if (!target || !peerId) { throw new Error('The participant is no longer connected.'); }

  // A newly joined peer can still be completing ICE when the admin opens the
  // participant sheet. Give the negotiated control lane time to become ready
  // instead of surfacing a transient channel error over the call controls.
  await connectGroupCallPeer(peerId);
  const deadline = Date.now() + 5000;
  let peer = target.peers.get(peerId);
  while (session === target && peer?.controlChannel?.readyState !== 'open' && Date.now() < deadline) {
    await new Promise<void>(resolve => setTimeout(resolve, 100));
    peer = target.peers.get(peerId);
  }
  if (session !== target || peer?.controlChannel?.readyState !== 'open') {
    throw new Error('Unable to reach this participant. Try again in a moment.');
  }
  const channel = peer.controlChannel;
  const requestId = `${Date.now().toString(36)}-${(++controlRequestSequence).toString(36)}`;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      peer?.pendingControls.delete(requestId);
      reject(new Error('The participant did not confirm the microphone change. Try again.'));
    }, GROUP_CALL_CONTROL_TIMEOUT_MS);
    peer.pendingControls.set(requestId, {resolve, reject, timer});
    try {
      channel.send(JSON.stringify({type: 'unmute-request', requestId}));
    } catch {
      clearTimeout(timer);
      peer.pendingControls.delete(requestId);
      reject(new Error('Unable to reach this participant. Try again in a moment.'));
    }
  });
}

/**
 * The room's `group_call_user_unmuted` broadcast is the server's own proof
 * that a participant is unmuted. It settles any pending admin request for that
 * participant, which covers devices on builds that never send `unmute-result`.
 */
export function confirmGroupCallParticipantUnmuted(peerUserId: string): void {
  const peer = session?.peers.get(String(peerUserId || '').trim());
  if (!peer) { return; }
  peer.pendingControls.forEach(pending => {
    clearTimeout(pending.timer);
    pending.resolve();
  });
  peer.pendingControls.clear();
}

export async function setGroupCallMuted(muted: boolean): Promise<void> {
  if (!session) { return; }
  session.muted = muted;
  applyLocalTrackState(session);
}

export async function setGroupCallCameraOn(cameraOn: boolean): Promise<void> {
  if (!session) { return; }
  session.cameraOn = cameraOn;
  applyLocalTrackState(session);
}

export async function setGroupCallSpeaker(enabled: boolean): Promise<void> {
  if (!session) { return; }
  session.speaker = enabled;
  await setAudioModeAsync(callAudioMode(enabled)).catch(() => undefined);
}

/**
 * "No Audio": stop playing everyone else without muting this microphone.
 * Peers that connect afterwards start silenced too.
 */
export function setGroupCallRemoteAudioEnabled(enabled: boolean): void {
  if (!session) { return; }
  session.remoteAudioEnabled = enabled;
  const target = session;
  target.peers.forEach(peer => { peer.stream?.getAudioTracks().forEach(track => { track.enabled = enabled && !target.interrupted; }); });
}

export async function stopGroupCallMedia(groupCallId?: string): Promise<void> {
  const normalized = String(groupCallId || '').trim();
  if (!session || (normalized && session.groupCallId !== normalized)) { return; }

  const current = session;
  current.stopInterruption?.();
  const backgroundStopped = stopCallBackground(current.groupCallId).catch(() => undefined);
  if (current.displayStream) { stopGroupScreenShare(current.groupCallId).catch(() => undefined); }
  session = null;
  current.peers.forEach(peer => {
    peer.pendingControls.forEach(pending => {
      clearTimeout(pending.timer);
      pending.reject(new Error('The call ended before the microphone change was confirmed.'));
    });
    peer.pendingControls.clear();
    if (peer.controlChannel) { peer.controlChannel.onmessage = null; peer.controlChannel.close?.(); }
    peer.stopUsage?.();
    try { peer.connection.close(); } catch { /* already closed */ }
  });
  current.peers.clear();
  if (Platform.OS === 'ios') { NativeModules.ScreenBroadcast?.stop(); }
  stopDisplayStream(current.displayStream || null);
  stopStream(current.localStream);
  publishStreams();
  await setAudioModeAsync(idleAudioMode).catch(() => undefined);
  await backgroundStopped;
}

/** Capture only after explicit consent; publish presence only after attaching media. */
export async function startGroupCallScreenCapture(onStopped: () => void, lowBandwidth = false, qualityHeight = 720, adaptive = true, source: ScreenShareSource = 'screen'): Promise<void> {
  if (source === 'app' && !supportsAppScreenSharing()) { throw new Error(appScreenSharingUnavailableMessage()); }
  const target = session;
  const module = loadWebRTCModule();
  if (!target || !module) { throw new Error('Screen sharing requires an active native call.'); }
  await target.ready;
  if (session !== target || !target.localStream) { throw new Error('Call media is not ready.'); }
  if (target.displayStream) { return; }
  const request = (target.screenRequest || 0) + 1;
  target.screenRequest = request;
  const screen = Dimensions.get('screen');
  const requestedHeight = Number.isFinite(qualityHeight) ? Math.max(360, Math.min(1080, qualityHeight)) : 720;
  const height = lowBandwidth ? Math.min(480, requestedHeight) : requestedHeight;
  const resolutionScale = Math.min(1, height / (Math.min(screen.width, screen.height) * PixelRatio.get()));
  const stream = await module.mediaDevices.getDisplayMedia({android: {
    // Only app sharing uses the OS region chooser. Android owns final consent
    // and app selection; full-display capture must never be its fallback here.
    createConfigForDefaultDisplay: source === 'screen',
    resolutionScale,
  }});
  if (session !== target || target.screenRequest !== request) { stopStream(stream); throw new Error('The call has ended or sharing was cancelled.'); }
  const track = stream.getVideoTracks()[0];
  if (!track) { stopStream(stream); throw new Error('No screen capture track was returned.'); }
  target.displayStream = stream;
  stream.getTracks().forEach(track => { track.enabled = !target.interrupted; });
  target.screenLowBandwidth = lowBandwidth;
  target.screenAdaptive = adaptive;
  track.onended = () => { stopGroupCallScreenCapture().catch(() => undefined).finally(onStopped); };
  try {
    if (Platform.OS === 'ios') { await NativeModules.ScreenBroadcast.start(height); }
    if (session !== target || target.displayStream !== stream) { throw new Error('Screen sharing ended.'); }
    await Promise.all([...target.peers.values()].map(async peer => {
      const sender = peer.videoSender;
      if (!sender) { throw new Error('A participant media channel is not ready. Try sharing again.'); }
      await sender.replaceTrack(track);
      // The native wrapper may swallow a rejected replaceTrack operation.
      if ('track' in sender && sender.track !== track) { throw new Error('Unable to send screen video to a participant.'); }
    }));
    await Promise.all([...target.peers.values()].map(peer => configureScreenSender(peer, lowBandwidth, adaptive)));
    const ack = await startGroupScreenShare(target.groupCallId);
    if (!ack.success) { throw new Error(ack.message || 'Unable to start sharing.'); }
    if (session !== target || target.displayStream !== stream) { throw new Error('Screen sharing ended.'); }
  } catch (error) {
    await stopGroupCallScreenCapture();
    throw error;
  }
}

export async function stopGroupCallScreenCapture(): Promise<void> {
  const target = session;
  if (!target) { return; }
  target.screenRequest = (target.screenRequest || 0) + 1;
  if (!target.displayStream) { return; }
  const stream = target.displayStream;
  target.displayStream = null;
  stream.getVideoTracks().forEach(track => { track.onended = null; });

  // Restore the call's camera sender before ending the display track. Stopping
  // the track first can make native WebRTC treat the sender as ended and tear
  // down the media path on some devices. A failed peer restore is isolated so
  // it can never turn "Stop sharing" into "leave call" for everyone else.
  const cameraTrack = target.localStream?.getVideoTracks()[0] || null;
  await Promise.all([...target.peers.values()].map(peer =>
    peer.videoSender?.replaceTrack(cameraTrack).catch(() => undefined)));
  applyLocalTrackState(target);
  await Promise.all([...target.peers.values()].map(async peer => {
    try {
      if (peer.cameraParameters && peer.videoSender?.setParameters) {
        const cameraParameters = peer.cameraParameters;
        // Keep WebRTC's RTCRtpEncodingParameters instances intact. Replacing
        // this array with the plain snapshot bypasses their toJSON() method,
        // leaving null maxBitrate/maxFramerate values in the native payload.
        // Android's WebRTC bridge reads present values with getInt(), so those
        // null fields crash the process instead of rejecting the Promise.
        const parameters = peer.videoSender.getParameters?.();
        if (parameters) {
          parameters.encodings.forEach((encoding, index) => {
            const cameraEncoding = cameraParameters.encodings[index];
            if (!cameraEncoding) { return; }
            encoding.maxBitrate = cameraEncoding.maxBitrate ?? null;
            encoding.maxFramerate = cameraEncoding.maxFramerate ?? null;
            encoding.scaleResolutionDownBy = cameraEncoding.scaleResolutionDownBy ?? null;
          });
          parameters.degradationPreference = cameraParameters.degradationPreference ?? null;
          await peer.videoSender.setParameters(parameters).catch(() => undefined);
        }
        peer.cameraParameters = undefined;
      }
    } catch { peer.cameraParameters = undefined; }
  }));

  if (Platform.OS === 'ios') { NativeModules.ScreenBroadcast?.stop(); }
  // Capture ownership is separate from the call session: only the display
  // stream is released here. Microphone, camera, peers and audio mode stay up.
  stopDisplayStream(stream);
  await stopGroupScreenShare(target.groupCallId).catch(() => undefined);
}

// WebRTC's congestion controller reduces resolution and frame rate as bandwidth
// changes. Apply a per-peer budget so a mesh call cannot multiply full-HD traffic.
async function configureScreenSender(peer: Peer, lowBandwidth: boolean, adaptive: boolean): Promise<void> {
  const sender = peer.videoSender;
  const parameters = sender?.getParameters?.();
  if (!parameters?.encodings.length || !sender?.setParameters) { return; }
  if (!peer.cameraParameters) {
    peer.cameraParameters = {
      encodings: parameters.encodings.map(encoding => ({
        maxBitrate: encoding.maxBitrate, maxFramerate: encoding.maxFramerate,
        scaleResolutionDownBy: encoding.scaleResolutionDownBy,
      })),
      degradationPreference: parameters.degradationPreference,
    };
  }
  parameters.degradationPreference = adaptive ? 'balanced' : 'maintain-resolution';
  parameters.encodings.forEach(encoding => {
    encoding.maxBitrate = lowBandwidth ? 450000 : 1500000;
    encoding.maxFramerate = 15;
    encoding.scaleResolutionDownBy = 1;
  });
  await sender.setParameters(parameters).catch(() => undefined);
}

export const isGroupCallScreenCapturing = (): boolean => Boolean(session?.displayStream);
