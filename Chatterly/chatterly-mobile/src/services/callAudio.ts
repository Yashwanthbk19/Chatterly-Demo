import {setAudioModeAsync} from 'expo-audio';
import {monitorCallInterruptions} from './callInterruption';
import NetInfo from '@react-native-community/netinfo';
import {Dimensions, NativeModules, PixelRatio, Platform} from 'react-native';
import {canLoadWebRTC} from './nativeWebRTC';
import {isConferenceSignal, startCallConferenceMedia} from './callConferenceMedia';
import {trackCallDataUsage} from './dataUsage';
import {startCallBackground, stopCallBackground} from './callBackground';
import {isCallReactionEmoji, publishCallReaction, type CallReactionEmoji} from './callReactions';
import {
  sendCallAnswerOverSocket,
  sendCallOfferOverSocket,
  sendIceCandidateOverSocket,
  onSocketReady,
  type CallSignalPayload,
  type CallType,
} from './chatRealtime';

type CallAudioRole = 'caller' | 'receiver';
type MediaStreamTrackLike = {enabled?: boolean; kind?: string; muted?: boolean; readyState?: string; stop?: () => void; onended?: (() => void) | null; onmute?: (() => void) | null; onunmute?: (() => void) | null; _switchCamera?: () => void};
export type MediaStreamLike = {
  getTracks: () => MediaStreamTrackLike[];
  getAudioTracks: () => MediaStreamTrackLike[];
  getVideoTracks: () => MediaStreamTrackLike[];
  addTrack?: (track: MediaStreamTrackLike) => void;
  toURL?: () => string;
  release?: () => void;
};
export type RTCPeerConnectionLike = {
  getStats?: () => Promise<unknown>;
  signalingState?: string;
  connectionState?: string;
  iceConnectionState?: string;
  onconnectionstatechange?: () => void;
  oniceconnectionstatechange?: () => void;
  createDataChannel?: (label: string) => CallDataChannel;
  ondatachannel?: (event: {channel: CallDataChannel}) => void;
  localDescription?: unknown;
  remoteDescription?: unknown;
  onicecandidate?: (event: {candidate?: unknown}) => void;
  ontrack?: (event: {streams?: MediaStreamLike[]; track?: MediaStreamTrackLike}) => void;
  addTrack: (track: MediaStreamTrackLike, stream: MediaStreamLike) => RTCRtpSenderLike;
  addTransceiver?: (kind: 'audio' | 'video', init?: {direction?: string}) => RTCRtpTransceiverLike;
  getTransceivers?: () => RTCRtpTransceiverLike[];
  createOffer: (options: {offerToReceiveAudio: boolean; offerToReceiveVideo: boolean; iceRestart?: boolean}) => Promise<unknown>;
  setLocalDescription: (description: unknown) => Promise<void>;
  setRemoteDescription: (description: unknown) => Promise<void>;
  createAnswer: () => Promise<unknown>;
  addIceCandidate: (candidate: unknown) => Promise<void>;
  close: () => void;
};

type CallDataChannel = {
  label: string;
  readyState: string;
  onmessage: ((event: {data: string}) => void) | null;
  send: (data: string) => void;
  close: () => void;
};
type VideoSendParameters = {
  encodings: Array<{maxBitrate?: number | null; maxFramerate?: number | null; scaleResolutionDownBy?: number | null}>;
  degradationPreference?: string | null;
};
type RTCRtpSenderLike = {
  replaceTrack: (track: MediaStreamTrackLike | null) => Promise<void>;
  getParameters?: () => VideoSendParameters;
  setParameters?: (parameters: VideoSendParameters) => Promise<void>;
};
type RTCRtpTransceiverLike = {
  mid?: string | null;
  stopped?: boolean;
  direction?: string;
  sender?: RTCRtpSenderLike & {track?: MediaStreamTrackLike | null};
  receiver?: {track?: MediaStreamTrackLike | null};
};
export type WebRTCModule = {
  MediaStream: new (tracks?: MediaStreamTrackLike[]) => MediaStreamLike;
  mediaDevices: {getUserMedia: (constraints: {audio: boolean; video: boolean | {facingMode: string; width: number; height: number; frameRate: number}}) => Promise<MediaStreamLike>; getDisplayMedia: (constraints: Record<string, unknown>) => Promise<MediaStreamLike>};
  RTCPeerConnection: new (configuration: typeof CALL_RTC_CONFIGURATION) => RTCPeerConnectionLike;
  RTCSessionDescription: new (description: {type: string; sdp: string}) => unknown;
  RTCIceCandidate: new (candidate: {candidate: string; sdpMid?: string; sdpMLineIndex?: number}) => unknown;
};

type CallAudioSession = {
  stopUsage?: () => void;
  conference?: ReturnType<typeof startCallConferenceMedia>;
  conferenceOnly?: boolean;
  conferenceRemote?: MediaStreamLike;
  reactionChannel: CallDataChannel | null;
  callId: string;
  role: CallAudioRole;
  type: CallType;
  muted: boolean;
  speaker: boolean;
  localStream: MediaStreamLike | null;
  remoteStream: MediaStreamLike | null;
  displayStream: MediaStreamLike | null;
  videoSender: RTCRtpSenderLike | null;
  originalVideoParameters: VideoSendParameters | null;
  /** False while the user picked "No Audio": the other side is not played. */
  remoteAudioEnabled: boolean;
  held: boolean;
  interrupted?: boolean;
  videoEnabled?: boolean;
  stopInterruption?: () => void;
  peerConnection: RTCPeerConnectionLike | null;
  pendingIceCandidates: unknown[];
  offerInProgress: boolean;
  mediaReady: Promise<void> | null;
  offerAttempts: number;
  offerRetryTimer: ReturnType<typeof setTimeout> | null;
  awaitingAnswer: boolean;
  ignoreOffer: boolean;
  signalingWork: Promise<void>;
  recoveryTimer: ReturnType<typeof setTimeout> | null;
  recoveryAttempts: number;
  restartRequested: boolean;
  networkOnline: boolean;
  stopNetwork?: () => void;
  stopSocket?: () => void;
};

const CALL_OFFER_RETRY_MS = 2500;
const CALL_OFFER_MAX_ATTEMPTS = 3;
const CALL_RECOVERY_MAX_ATTEMPTS = 5;
const connectionListeners = new Set<(state: 'connected' | 'reconnecting' | 'failed') => void>();
const holdListeners = new Set<(callId: string, held: boolean) => void>();
export function subscribeToCallHold(listener: (callId: string, held: boolean) => void): () => void {
  holdListeners.add(listener);
  if (session) listener(session.callId, session.held || Boolean(session.interrupted));
  return () => { holdListeners.delete(listener); };
}

function applyHoldState(target: CallAudioSession): void {
  const held = target.held || Boolean(target.interrupted);
  target.conference?.setRemoteAudio(!held && target.remoteAudioEnabled);
  applyMutedState(target);
  target.remoteStream?.getAudioTracks().forEach(track => { track.enabled = !held && target.remoteAudioEnabled; });
  target.localStream?.getVideoTracks().forEach(track => { track.enabled = !target.interrupted && target.videoEnabled !== false; });
  target.displayStream?.getTracks().forEach(track => { track.enabled = !target.interrupted; });
  holdListeners.forEach(listener => listener(target.callId, held));
}

export function subscribeToCallConnection(listener: (state: 'connected' | 'reconnecting' | 'failed') => void): () => void {
  connectionListeners.add(listener);
  return () => { connectionListeners.delete(listener); };
}

function publishConnection(state: 'connected' | 'reconnecting' | 'failed'): void {
  connectionListeners.forEach(listener => listener(state));
}

function signalWork(target: CallAudioSession, work: () => Promise<void>): Promise<void> {
  const pending = target.signalingWork.then(async () => { if (session === target) await work(); });
  target.signalingWork = pending.catch(() => undefined);
  return pending;
}

function scheduleRecovery(target: CallAudioSession, delay = 500): void {
  if (session !== target || !target.peerConnection?.remoteDescription || !target.networkOnline) return;
  if (target.recoveryTimer) clearTimeout(target.recoveryTimer);
  target.recoveryTimer = setTimeout(() => {
    target.recoveryTimer = null;
    if (session !== target || !target.networkOnline) return;
    if (target.recoveryAttempts >= CALL_RECOVERY_MAX_ATTEMPTS) {
      publishConnection('failed');
      return;
    }
    target.recoveryAttempts += 1;
    target.restartRequested = false;
    signalWork(target, async () => {
      const peer = target.peerConnection;
      if (!peer) return;
      // Roll back an unanswered restart before retrying with fresh ICE details.
      if (target.awaitingAnswer || (peer.signalingState && peer.signalingState !== 'stable')) {
        await peer.setLocalDescription({type: 'rollback'});
      }
      target.awaitingAnswer = true;
      const offer = await peer.createOffer({offerToReceiveAudio: true, offerToReceiveVideo: target.type === 'video', iceRestart: true});
      if (session !== target) return;
      await peer.setLocalDescription(offer);
      const ack = await sendCallOfferOverSocket(target.callId, peer.localDescription || offer);
      if (ack?.success === false) throw new Error(ack.message || 'Unable to reconnect call.');
    }).catch(() => { /* Retry after signaling reconnects, retaining the existing media. */ })
      .finally(() => {
        if (session === target && (target.awaitingAnswer || target.restartRequested)) scheduleRecovery(target, 3000);
      });
  }, delay);
}

function requestRecovery(target: CallAudioSession): void {
  if (session !== target || !target.peerConnection?.remoteDescription) return;
  target.restartRequested = true;
  target.recoveryAttempts = 0;
  publishConnection('reconnecting');
  scheduleRecovery(target);
}

function monitorCallNetwork(target: CallAudioSession): void {
  let networkKey = '';
  target.stopNetwork = NetInfo.addEventListener(state => {
    const online = state.isConnected !== false && state.isInternetReachable !== false;
    const wasOffline = !target.networkOnline;
    target.networkOnline = online;
    if (!online) { requestRecovery(target); return; }
    const details = state.details;
    const address = details && 'ipAddress' in details ? details.ipAddress || '' : '';
    const key = state.type && state.type !== 'unknown' && state.type !== 'none' ? `${state.type}:${address}` : '';
    const changed = Boolean(networkKey && key && key !== networkKey);
    if (key) networkKey = key;
    if (changed || wasOffline) requestRecovery(target);
  });
  if (typeof onSocketReady === 'function') {
    target.stopSocket = onSocketReady(() => { requestRecovery(target); });
  }
}

const CALL_RTC_CONFIGURATION = {
  iceServers: [
    {urls: 'stun:stun.l.google.com:19302'},
    {urls: 'stun:stun1.l.google.com:19302'},
  ],
};

let session: CallAudioSession | null = null;
let webRTCModule: WebRTCModule | null | undefined;
export type CallMediaStreams = {
  localUrl: string;
  remoteUrl: string;
  /**
   * Whether the other side is actually sending video right now. In a voice
   * call the reserved video lane exists but idles - its track is muted - until
   * someone shares their screen, so "there is a video track" is not enough.
   */
  remoteVideoLive: boolean;
  /** Whether this device is sharing its screen. */
  sharingScreen: boolean;
};
const mediaListeners = new Set<(streams: CallMediaStreams) => void>();

function hasLiveVideo(stream: MediaStreamLike | null | undefined): boolean {
  return Boolean(stream?.getVideoTracks().some(track => track.readyState !== 'ended' && track.muted !== true && track.enabled !== false));
}

function publishMediaStreams(): void {
  const remote = session?.conferenceRemote || session?.remoteStream;
  const streams: CallMediaStreams = {
    localUrl: session?.localStream?.toURL?.() || '',
    // RTCView binds the first video track only when streamURL changes. Mounting
    // it for an audio-only stream leaves it blank when video arrives later.
    remoteUrl: remote?.getVideoTracks().length ? remote.toURL?.() || '' : '',
    remoteVideoLive: hasLiveVideo(remote),
    sharingScreen: Boolean(session?.displayStream),
  };
  mediaListeners.forEach(listener => listener(streams));
}

export function subscribeToCallMedia(listener: (streams: CallMediaStreams) => void): () => void {
  mediaListeners.add(listener);
  publishMediaStreams();
  return () => { mediaListeners.delete(listener); };
}

function loadWebRTCModule(): WebRTCModule {
  if (webRTCModule !== undefined) {
    if (!webRTCModule) { throw new Error('Voice calls need a development build because Expo Go does not include native WebRTC audio.'); }
    return webRTCModule;
  }

  if (!canLoadWebRTC()) {
    webRTCModule = null;
    throw new Error('Voice calls need a development build because Expo Go does not include native WebRTC audio.');
  }
  try {
    const loaded = require('react-native-webrtc') as Partial<WebRTCModule>;
    if (!loaded.MediaStream || !loaded.mediaDevices?.getUserMedia || !loaded.RTCPeerConnection || !loaded.RTCSessionDescription || !loaded.RTCIceCandidate) {
      throw new Error('Missing native WebRTC audio module.');
    }
    webRTCModule = loaded as WebRTCModule;
    return webRTCModule;
  } catch {
    webRTCModule = null;
    throw new Error('Voice calls need a development build because Expo Go does not include native WebRTC audio.');
  }
}

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
  stream?.getTracks().forEach(track => {
    track.stop?.();
  });
  stream?.release?.();
}

function applyMutedState(target: CallAudioSession): void {
  target.localStream?.getAudioTracks().forEach(track => {
    track.enabled = !target.muted && !target.held && !target.interrupted;
  });
}

function applyVideoState(target: CallAudioSession, enabled: boolean): void {
  target.videoEnabled = enabled;
  target.localStream?.getVideoTracks().forEach(track => { track.enabled = enabled && !target.interrupted; });
}

function createPeerConnection(target: CallAudioSession): RTCPeerConnectionLike {
  if (target.peerConnection) { return target.peerConnection; }

  const {RTCPeerConnection} = loadWebRTCModule();
  const peerConnection = new RTCPeerConnection(CALL_RTC_CONFIGURATION);
  target.peerConnection = peerConnection;
  target.stopUsage = trackCallDataUsage(peerConnection);
  const connectionChanged = () => {
    if (session !== target) return;
    const state = peerConnection.connectionState;
    const ice = peerConnection.iceConnectionState;
    if (state === 'disconnected' || state === 'failed' || ice === 'disconnected' || ice === 'failed') {
      requestRecovery(target);
    } else if (state === 'connected' || ice === 'connected' || ice === 'completed') {
      target.recoveryAttempts = 0;
      if (!target.awaitingAnswer && !target.restartRequested && target.recoveryTimer) {
        clearTimeout(target.recoveryTimer); target.recoveryTimer = null;
      }
      publishConnection('connected');
    }
  };
  peerConnection.onconnectionstatechange = connectionChanged;
  peerConnection.oniceconnectionstatechange = connectionChanged;
  monitorCallNetwork(target);

  const bindReactions = (channel: CallDataChannel) => {
    if (channel.label !== 'chatterly.call.reactions') return;
    target.reactionChannel = channel;
    channel.onmessage = event => {
      if (session !== target || typeof event.data !== 'string' || event.data.length > 256) return;
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'reaction' && isCallReactionEmoji(message.emoji)) {
          publishCallReaction({callId: target.callId, emoji: message.emoji, local: false});
        }
      } catch { /* Ignore malformed peer data without interrupting media. */ }
    };
  };
  peerConnection.ondatachannel = event => bindReactions(event.channel);
  if (target.role === 'caller' && peerConnection.createDataChannel) {
    try { bindReactions(peerConnection.createDataChannel('chatterly.call.reactions')); }
    catch { /* A peer without data-channel support can still carry the call. */ }
  }

  peerConnection.onicecandidate = (event: {candidate?: unknown}) => {
    if (!event.candidate) { return; }
    sendIceCandidateOverSocket(target.callId, event.candidate).catch(() => undefined);
  };

  peerConnection.ontrack = (event: {streams?: MediaStreamLike[]; track?: MediaStreamTrackLike}) => {
    // Collect tracks into one renderer-owned stream. React Native WebRTC can
    // report streamless tracks (and distinct streams for separate m-lines).
    const remoteStream = target.remoteStream || event.streams?.[0] || new (loadWebRTCModule().MediaStream)();
    if (event.track && !remoteStream.getTracks().includes(event.track)) {
      remoteStream.addTrack?.(event.track);
    }
    target.remoteStream = remoteStream;
    if (event.track?.kind === 'audio') { event.track.enabled = target.remoteAudioEnabled && !target.held && !target.interrupted; }
    if (event.track) {
      const publishTrackState = () => publishMediaStreams();
      event.track.onended = publishTrackState;
      event.track.onmute = publishTrackState;
      event.track.onunmute = publishTrackState;
    }
    publishMediaStreams();
  };

  target.localStream?.getTracks().forEach(track => {
    const sender = peerConnection.addTrack(track, target.localStream as MediaStreamLike);
    if (track.kind === 'video') { target.videoSender = sender; }
  });

  // A voice call has no camera track, so it would have no video sender to put
  // a screen share on, and the signalling cannot renegotiate mid-call. The
  // caller therefore reserves an idle video lane in its first offer, as the web
  // client does. Only the caller may add it: a transceiver the receiver adds is
  // never matched to the offer's m-line (see prepareLocalTracksForAnswer).
  if (target.role === 'caller' && target.type === 'audio' && !target.videoSender && peerConnection.addTransceiver) {
    try {
      target.videoSender = peerConnection.addTransceiver('video', {direction: 'sendrecv'}).sender || null;
    } catch {
      // Without the lane the call still works; only screen sharing is lost.
    }
  }

  return peerConnection;
}

async function flushPendingIceCandidates(target: CallAudioSession): Promise<void> {
  const peerConnection = target.peerConnection;
  if (!peerConnection?.remoteDescription) { return; }

  const pendingCandidates = target.pendingIceCandidates;
  target.pendingIceCandidates = [];
  for (const candidate of pendingCandidates) {
    await peerConnection.addIceCandidate(candidate).catch(() => undefined);
  }
}

export async function startCallAudio({
  callId,
  role,
  type,
  muted = false,
  speaker = type === 'video',
  conferenceOnly = false,
  contactName,
}: {
  callId: string;
  role: CallAudioRole;
  type: CallType;
  muted?: boolean;
  speaker?: boolean;
  conferenceOnly?: boolean;
  contactName?: string;
}): Promise<void> {
  const normalizedCallId = String(callId || '').trim();
  if (!normalizedCallId) { throw new Error('Call id is required to start call audio.'); }

  if (session && session.callId !== normalizedCallId) {
    await stopCallAudio();
  }

  if (!session) {
    session = {
      reactionChannel: null,
      conferenceOnly,
      callId: normalizedCallId,
      role,
      type,
      muted,
      speaker,
      localStream: null,
      remoteStream: null,
      displayStream: null,
      videoSender: null,
      originalVideoParameters: null,
      remoteAudioEnabled: true,
      held: false,
      peerConnection: null,
      pendingIceCandidates: [],
      offerInProgress: false,
      mediaReady: null,
      offerAttempts: 0,
      offerRetryTimer: null,
      awaitingAnswer: false,
      ignoreOffer: false,
      signalingWork: Promise.resolve(),
      recoveryTimer: null,
      recoveryAttempts: 0,
      restartRequested: false,
      networkOnline: true,
    };
  } else {
    session.role = role;
    session.type = type;
    session.muted = muted;
    session.speaker = speaker;
  }

  const target = session;
  const {mediaDevices} = loadWebRTCModule();
  if (!target.mediaReady && !target.localStream) {
    const pending = (async () => {
      // Start while the activity and microphone/camera permissions are still
      // foreground eligible, before Android can suspend media or socket timers.
      const backgroundStart = startCallBackground(normalizedCallId, type, contactName);
      if (backgroundStart) await backgroundStart;
      if (session !== target) {
        await stopCallBackground(normalizedCallId);
        throw new Error('The call ended before media could start.');
      }
      let stream: MediaStreamLike;
      try {
        stream = await mediaDevices.getUserMedia({audio: true, video: type === 'video' ? {facingMode: 'user', width: 1280, height: 720, frameRate: 30} : false});
      } catch (error) {
        await stopCallBackground(normalizedCallId);
        throw error;
      }
      if (session !== target) {
        stopStream(stream);
        throw new Error('The call ended before media could start.');
      }
      target.localStream = stream;
      target.conference = startCallConferenceMedia(normalizedCallId, stream, loadWebRTCModule(), remote => {
        if (session === target) {
          target.conferenceRemote = remote;
          publishMediaStreams();
        }
      });
      publishMediaStreams();
      target.stopInterruption = monitorCallInterruptions(interrupted => {
        if (session !== target) return;
        target.interrupted = interrupted;
        applyHoldState(target);
        if (!interrupted) setAudioModeAsync(callAudioMode(target.speaker)).catch(() => undefined);
      });
    })();
    target.mediaReady = pending;
  }
  try {
    if (target.mediaReady) { await target.mediaReady; }
  } catch (error) {
    if (target.mediaReady) { target.mediaReady = null; }
    throw error;
  }
  if (session !== target) { throw new Error('The call ended before media could start.'); }
  try {
    await setAudioModeAsync(callAudioMode(speaker));
    applyMutedState(target);
    if (!target.conferenceOnly) createPeerConnection(target);
  } catch (error) {
    await stopCallAudio(normalizedCallId);
    throw error;
  }
}

// Apply after SDP negotiation, when the native sender has its encodings.
// A ceiling is not a forced bitrate: congestion control can still use less.
async function configureCameraVideo(target: CallAudioSession): Promise<void> {
  if (target.type !== 'video' || target.displayStream) return;
  const sender = target.videoSender;
  if (!sender?.getParameters || !sender.setParameters) return;
  try {
    const parameters = sender.getParameters();
    if (!parameters.encodings.length) return;
    if (!target.originalVideoParameters) {
      target.originalVideoParameters = {
        degradationPreference: parameters.degradationPreference,
        encodings: parameters.encodings.map(encoding => ({
          maxBitrate: encoding.maxBitrate, maxFramerate: encoding.maxFramerate,
          scaleResolutionDownBy: encoding.scaleResolutionDownBy,
        })),
      };
    }
    parameters.degradationPreference = 'maintain-resolution';
    for (const encoding of parameters.encodings) {
      encoding.maxBitrate = 2500000;
      encoding.maxFramerate = 30;
      encoding.scaleResolutionDownBy = 1;
    }
    await sender.setParameters(parameters);
  } catch {
    // Older native implementations may reject tuning; keep the call connected.
  }
}

function scheduleCallOfferRetry(target: CallAudioSession): void {
  if (target.offerRetryTimer || target.offerAttempts >= CALL_OFFER_MAX_ATTEMPTS || target.peerConnection?.remoteDescription) { return; }
  target.offerRetryTimer = setTimeout(() => {
    target.offerRetryTimer = null;
    if (session === target && !target.peerConnection?.remoteDescription) {
      startCallAudioOffer(target.callId).catch(() => undefined);
    }
  }, CALL_OFFER_RETRY_MS);
}

export async function startCallAudioOffer(callId: string): Promise<void> {
  const target = session;
  if (!target || target.callId !== String(callId || '').trim() || target.role !== 'caller' || target.offerInProgress) { return; }

  target.offerInProgress = true;
  try {
    await signalWork(target, async () => {
      if (target.mediaReady) await target.mediaReady;
      if (session !== target) return;
      const peerConnection = createPeerConnection(target);
      target.offerAttempts += 1;
      const offer = await peerConnection.createOffer({offerToReceiveAudio: true, offerToReceiveVideo: target.type === 'video', iceRestart: target.offerAttempts > 1});
      target.awaitingAnswer = true;
      await peerConnection.setLocalDescription(offer);
      const acknowledgement = await sendCallOfferOverSocket(target.callId, peerConnection.localDescription || offer);
      if (acknowledgement?.success === false) { throw new Error(acknowledgement.message || 'The video call offer was rejected.'); }
      scheduleCallOfferRetry(target);
    });
  } catch (error) {
    scheduleCallOfferRetry(target);
    throw error;
  } finally {
    target.offerInProgress = false;
  }
}

export async function handleCallAudioSignal(payload: CallSignalPayload): Promise<void> {
  const target = session;
  const callId = String(payload.callId || '').trim();
  if (!target || !callId || target.callId !== callId) { return; }
  if (target.conferenceOnly || isConferenceSignal(payload)) return;

  // SDP/ICE may arrive while getUserMedia is still resolving. Never create an
  // empty peer that startCallAudio will later reuse without attaching tracks.
  if (target.mediaReady) await target.mediaReady;
  if (session !== target) return;
  const peerConnection = createPeerConnection(target);
  return signalWork(target, () => applyCallAudioSignal(target, peerConnection, payload));
}

async function applyCallAudioSignal(target: CallAudioSession, peerConnection: RTCPeerConnectionLike, payload: CallSignalPayload): Promise<void> {
  const {RTCIceCandidate, RTCSessionDescription} = loadWebRTCModule();
  if (payload.type === 'offer') {
    if (!payload.offer) { return; }
    const collision = target.awaitingAnswer || Boolean(peerConnection.signalingState && peerConnection.signalingState !== 'stable');
    // The receiver yields during simultaneous network switches; the caller
    // keeps its offer. Both sides can initiate a restart when otherwise stable.
    target.ignoreOffer = collision && target.role === 'caller';
    if (target.ignoreOffer) return;
    if (collision) await peerConnection.setLocalDescription({type: 'rollback'});
    target.awaitingAnswer = false;
    await peerConnection.setRemoteDescription(new RTCSessionDescription(payload.offer as {type: string; sdp: string}));
    await flushPendingIceCandidates(target);
    await prepareLocalTracksForAnswer(target, peerConnection);
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    await sendCallAnswerOverSocket(target.callId, peerConnection.localDescription || answer);
    if (target.recoveryTimer) { clearTimeout(target.recoveryTimer); target.recoveryTimer = null; }
    if (target.restartRequested) scheduleRecovery(target);
    else publishConnection('connected');
    // Encoder tuning must never delay the media handshake.
    void configureCameraVideo(target);
    return;
  }

  if (payload.type === 'answer') {
    if (!payload.answer || (peerConnection.remoteDescription && !target.awaitingAnswer && peerConnection.signalingState !== 'have-local-offer')) { return; }
    await peerConnection.setRemoteDescription(new RTCSessionDescription(payload.answer as {type: string; sdp: string}));
    target.awaitingAnswer = false;
    target.ignoreOffer = false;
    target.recoveryAttempts = 0;
    if (target.recoveryTimer) { clearTimeout(target.recoveryTimer); target.recoveryTimer = null; }
    if (target.restartRequested) scheduleRecovery(target);
    else publishConnection('connected');
    void configureCameraVideo(target);
    if (target.offerRetryTimer) { clearTimeout(target.offerRetryTimer); target.offerRetryTimer = null; }
    target.offerAttempts = 0;
    await flushPendingIceCandidates(target);
    return;
  }

  if (payload.type === 'ice' && payload.candidate) {
    if (target.ignoreOffer) return;
    const candidate = new RTCIceCandidate(payload.candidate as {candidate: string; sdpMid?: string; sdpMLineIndex?: number});
    if (!peerConnection.remoteDescription) {
      target.pendingIceCandidates = [...target.pendingIceCandidates, candidate];
      return;
    }
    try { await peerConnection.addIceCandidate(candidate); }
    catch { target.pendingIceCandidates.push(candidate); }
  }
}

export async function setCallAudioMuted(muted: boolean): Promise<void> {
  if (!session) { return; }
  session.muted = muted;
  applyMutedState(session);
}

/** Pause local sending and remote playback while keeping the call connection alive. */
export async function setCallAudioHeld(held: boolean): Promise<void> {
  if (!session) { return; }
  session.held = held;
  applyHoldState(session);
}

export async function setCallAudioSpeaker(enabled: boolean): Promise<void> {
  if (!session) { return; }
  session.speaker = enabled;
  await setAudioModeAsync(callAudioMode(enabled));
}

export function setCallVideoEnabled(enabled: boolean): void {
  if (!session || session.type !== 'video') { return; }
  applyVideoState(session, enabled);
}

export function switchCallCamera(): void {
  session?.localStream?.getVideoTracks()[0]?._switchCamera?.();
}

/** Share a selected app or the full display during a direct video call. */
export async function startCallScreenCapture(onStopped: () => void, qualityHeight = 720): Promise<void> {
  const target = session;
  if (!target || (!target.peerConnection && !target.conferenceOnly)) {
    throw new Error('Screen sharing is available once the call is connected.');
  }
  if (!target.videoSender && !target.conferenceOnly) {
    // The other side answered without a video lane (an older app version), so
    // there is nothing to carry the screen on in this call.
    throw new Error('Screen sharing is not available in this call. Start a video call to share your screen.');
  }
  if (target.displayStream) { return; }
  const module = loadWebRTCModule();
  if (!module.mediaDevices.getDisplayMedia) { throw new Error('Screen sharing is unavailable on this device.'); }
  const screen = Dimensions.get('screen');
  const height = Math.max(360, Math.min(1080, Number.isFinite(qualityHeight) ? qualityHeight : 720));
  const resolutionScale = Math.min(1, height / (Math.min(screen.width, screen.height) * PixelRatio.get()));
  const stream = await module.mediaDevices.getDisplayMedia({android: {createConfigForDefaultDisplay: false, resolutionScale}});
  if (session !== target) { stream.getTracks().forEach(track => track.stop?.()); throw new Error('The call has ended or sharing was cancelled.'); }
  const track = stream.getVideoTracks()[0];
  if (!track) { stream.getTracks().forEach(item => item.stop?.()); throw new Error('No screen capture track was returned.'); }
  target.displayStream = stream;
  stream.getTracks().forEach(mediaTrack => { mediaTrack.enabled = !target.interrupted; });
  track.onended = () => { stopCallScreenCapture().catch(() => undefined).finally(onStopped); };
  try {
    if (Platform.OS === 'ios') { await NativeModules.ScreenBroadcast?.start(height); }
    // Screen sharing keeps its existing encoder policy; HD tuning is camera-only.
    if (target.originalVideoParameters && target.videoSender?.getParameters && target.videoSender.setParameters) {
      try {
        const parameters = target.videoSender.getParameters();
        parameters.encodings.forEach((encoding, index) => {
          Object.assign(encoding, target.originalVideoParameters?.encodings[index]);
        });
        parameters.degradationPreference = target.originalVideoParameters.degradationPreference || null;
        await target.videoSender.setParameters(parameters);
      } catch { /* Tuning support must not prevent sharing. */ }
    }
    await target.videoSender?.replaceTrack(track);
    await target.conference?.replaceVideo(track);
    if (session !== target || target.displayStream !== stream) { throw new Error('Screen sharing ended.'); }
    publishMediaStreams();
  } catch (error) {
    await stopCallScreenCapture();
    throw error;
  }
}

async function prepareLocalTracksForAnswer(target: CallAudioSession, peerConnection: RTCPeerConnectionLike): Promise<void> {
  const transceivers = peerConnection.getTransceivers?.() || [];
  for (const kind of ['audio', 'video']) {
    const localTrack = (kind === 'video' ? target.displayStream?.getVideoTracks()[0] : undefined)
      || target.localStream?.getTracks().find(track => track.kind === kind);
    // Only a transceiver matched to the offer (mid set) carries anything.
    const transceiver = transceivers.find(item => item.mid != null && !item.stopped && item.receiver?.track?.kind === kind);
    if (!transceiver) { continue; }
    if (localTrack) {
      if (transceiver.sender && transceiver.sender.track !== localTrack) {
        await transceiver.sender.replaceTrack(localTrack);
      }
      if (kind === 'video' && transceiver.sender) { target.videoSender = transceiver.sender; }
    } else if (kind === 'video') {
      // A voice call whose caller reserved a video lane: answer it sendrecv
      // now, while there is still no track, so this side can share its screen
      // later. An answer that says recvonly locks the lane one way for good.
      if (transceiver.sender) { target.videoSender = transceiver.sender; }
    } else {
      continue;
    }
    if (transceiver.direction !== 'sendrecv') { transceiver.direction = 'sendrecv'; }
  }
}

export async function stopCallScreenCapture(): Promise<void> {
  const target = session;
  if (!target?.displayStream) { return; }
  const stream = target.displayStream;
  target.displayStream = null;
  if (Platform.OS === 'ios') { NativeModules.ScreenBroadcast?.stop(); }
  stream.getTracks().forEach(track => { track.onended = null; track.stop?.(); });
  await target.videoSender?.replaceTrack(target.localStream?.getVideoTracks()[0] || null);
  await target.conference?.replaceVideo(target.localStream?.getVideoTracks()[0] || null);
  await configureCameraVideo(target);
  publishMediaStreams();
}

export function isSharingCallScreen(): boolean {
  return Boolean(session?.displayStream);
}

/**
 * "No Audio" in Audio Output: stop playing the other side without touching the
 * microphone. Remote tracks are switched off where they are, and ones arriving
 * later (a renegotiated or late track) start off too.
 */
export function setCallRemoteAudioEnabled(enabled: boolean): void {
  if (!session) { return; }
  session.remoteAudioEnabled = enabled;
  session.conference?.setRemoteAudio(enabled && !session.held && !session.interrupted);
  session.remoteStream?.getAudioTracks().forEach(track => { track.enabled = enabled && !session?.held && !session?.interrupted; });
}

export function sendCallReaction(callId: string, emoji: CallReactionEmoji): void {
  const target = session;
  if (!target || target.callId !== callId || target.reactionChannel?.readyState !== 'open') {
    throw new Error('Call reactions are not available yet. Both participants need the updated mobile app.');
  }
  if (!isCallReactionEmoji(emoji)) return;
  target.reactionChannel.send(JSON.stringify({type: 'reaction', emoji}));
  publishCallReaction({callId, emoji, local: true});
}

export async function stopCallAudio(callId?: string): Promise<void> {
  const normalizedCallId = String(callId || '').trim();
  if (!session || (normalizedCallId && session.callId !== normalizedCallId)) { return; }

  const current = session;
  session = null;
  current.stopInterruption?.();
  current.conference?.stop();
  current.stopNetwork?.();
  current.stopSocket?.();
  current.stopUsage?.();
  if (current.recoveryTimer) { clearTimeout(current.recoveryTimer); current.recoveryTimer = null; }
  if (current.peerConnection) {
    current.peerConnection.onconnectionstatechange = undefined;
    current.peerConnection.oniceconnectionstatechange = undefined;
  }
  // Release native background resources even if media teardown fails.
  const backgroundStopped = stopCallBackground(current.callId).catch(() => undefined);
  if (current.reactionChannel) {
    current.reactionChannel.onmessage = null;
    try { current.reactionChannel.close(); } catch { /* Media teardown must still finish. */ }
  }
  if (current.offerRetryTimer) { clearTimeout(current.offerRetryTimer); current.offerRetryTimer = null; }
  if (current.displayStream) {
    if (Platform.OS === 'ios') { NativeModules.ScreenBroadcast?.stop(); }
    current.displayStream.getTracks().forEach(track => { track.onended = null; track.stop?.(); });
  }
  publishMediaStreams();
  current.peerConnection?.close();
  stopStream(current.localStream);
  stopStream(current.remoteStream);
  await setAudioModeAsync(idleAudioMode).catch(() => undefined);
  await backgroundStopped;
}
