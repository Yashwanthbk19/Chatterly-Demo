import {getSession} from './sessionStore';
import {trackCallDataUsage} from './dataUsage';
import type {MediaStreamLike, RTCPeerConnectionLike, WebRTCModule} from './callAudio';
import {sendCallAnswerOverSocket, sendCallOfferOverSocket, sendIceCandidateOverSocket, subscribeToSocketEvents, type CallSignalPayload} from './chatRealtime';

// Personal-call signaling is broadcast by the existing server. Keep a target
// inside each relayed payload so an SDP/ICE packet reaches only its own peer.
export function isConferenceSignal(payload: CallSignalPayload): boolean {
  const value = (payload.offer || payload.answer || payload.candidate) as {conferenceTarget?: string} | undefined;
  return Boolean(value?.conferenceTarget);
}

type Packet = {conferenceTarget?: string; type: string; sdp: string; candidate: string};
type Event = {callId?: string; from?: string; participant?: string; userId?: string; offer?: Packet; answer?: Packet; candidate?: Packet};

export function startCallConferenceMedia(callId: string, stream: MediaStreamLike, rtc: WebRTCModule, onRemote?: (stream: MediaStreamLike | undefined) => void): {
  stop: () => void;
  setRemoteAudio: (enabled: boolean) => void;
  replaceVideo: (track: ReturnType<MediaStreamLike['getVideoTracks']>[number] | null) => Promise<void>;
} {
  const selfId = getSession()?.user?.id;
  if (!selfId) return {stop: () => undefined, setRemoteAudio: () => undefined, replaceVideo: async () => undefined};
  type Sender = ReturnType<RTCPeerConnectionLike['addTrack']>;
  // Direct-call participants can be rendered through this targeted peer path,
  // so it must use the same HD camera policy as the legacy one-to-one peer.
  // Apply it only after SDP negotiation, when native WebRTC has populated the
  // sender encodings. Tuning failure must never interrupt call signalling.
  const configureCameraVideo = async (sender?: Sender): Promise<void> => {
    if (!sender?.getParameters || !sender.setParameters) return;
    try {
      const parameters = sender.getParameters();
      if (!parameters.encodings.length) return;
      parameters.degradationPreference = 'maintain-resolution';
      parameters.encodings.forEach(encoding => {
        encoding.maxBitrate = 2500000;
        encoding.maxFramerate = 30;
        encoding.scaleResolutionDownBy = 1;
      });
      await sender.setParameters(parameters);
    } catch {
      // Older native implementations may reject tuning; keep media connected.
    }
  };
  const peers = new Map<string, {connection: RTCPeerConnectionLike; stopUsage: () => void; pending: unknown[]; work: Promise<void>; remote?: MediaStreamLike; videoSender?: Sender}>();
  let videoTrack: ReturnType<MediaStreamLike['getVideoTracks']>[number] | null = stream.getVideoTracks()[0] || null;
  let stopped = false;
  let audible = true;
  const targeted = (value: unknown, target: string) => {
    const native = value as {toJSON?: () => Record<string, unknown>};
    return {...(native.toJSON?.() || value as Record<string, unknown>), conferenceTarget: target};
  };
  const peerFor = (userId: string) => {
    const existing = peers.get(userId);
    if (existing) return existing;
    const connection = new rtc.RTCPeerConnection({iceServers: [{urls: 'stun:stun.l.google.com:19302'}, {urls: 'stun:stun1.l.google.com:19302'}]});
    const peer = {connection, stopUsage: trackCallDataUsage(connection), pending: [] as unknown[], work: Promise.resolve(), remote: undefined as MediaStreamLike | undefined, videoSender: undefined as Sender | undefined};
    peers.set(userId, peer);
    stream.getTracks().forEach(track => {
      const sender = connection.addTrack(track.kind === 'video' && videoTrack ? videoTrack : track, stream);
      if (track.kind === 'video') peer.videoSender = sender;
    });
    connection.onicecandidate = event => {
      const candidate = event.candidate as {toJSON?: () => unknown} | undefined;
      if (!stopped && candidate) sendIceCandidateOverSocket(callId, targeted(candidate.toJSON?.() || candidate, userId)).catch(() => undefined);
    };
    connection.ontrack = event => {
      peer.remote = event.streams?.[0] || peer.remote || new rtc.MediaStream();
      if (event.track && !peer.remote.getTracks().includes(event.track)) peer.remote.addTrack?.(event.track);
      peer.remote.getAudioTracks().forEach(track => { track.enabled = audible; });
      onRemote?.(peer.remote);
    };
    return peer;
  };
  const enqueue = (userId: string, work: (peer: ReturnType<typeof peerFor>) => Promise<void>) => {
    const peer = peerFor(userId);
    peer.work = peer.work.then(async () => { if (!stopped && peers.get(userId) === peer) await work(peer); }).catch(() => undefined);
  };
  const signal = (type: 'offer' | 'answer' | 'ice', payload: Event) => {
    const value = payload[type === 'ice' ? 'candidate' : type];
    const from = String(payload.from || '');
    if (stopped || payload.callId !== callId || !selfId || !from || from === selfId || !value || value.conferenceTarget !== selfId) return;
    enqueue(from, async peer => {
      const connection = peer.connection;
      if (type === 'ice') {
        const candidate = new rtc.RTCIceCandidate(value);
        if (!connection.remoteDescription) peer.pending.push(candidate);
        else await connection.addIceCandidate(candidate);
        return;
      }
      await connection.setRemoteDescription(new rtc.RTCSessionDescription({type: value.type, sdp: value.sdp}));
      for (const candidate of peer.pending.splice(0)) await connection.addIceCandidate(candidate);
      if (type === 'offer') {
        const answer = await connection.createAnswer();
        await connection.setLocalDescription(answer);
        await sendCallAnswerOverSocket(callId, targeted(connection.localDescription || answer, from));
      }
      configureCameraVideo(peer.videoSender).catch(() => undefined);
    });
  };
  const unsubscribe = subscribeToSocketEvents({
    participant_joined: (payload: Event) => {
      const userId = String(payload.participant || '');
      if (payload.callId !== callId || !selfId || !userId || userId === selfId || peers.has(userId)) return;
      // Only existing participants receive the newcomer broadcast. The
      // newcomer answers their offers, avoiding simultaneous negotiation.
      enqueue(userId, async peer => {
        const offer = await peer.connection.createOffer({offerToReceiveAudio: true, offerToReceiveVideo: true});
        await peer.connection.setLocalDescription(offer);
        await sendCallOfferOverSocket(callId, targeted(peer.connection.localDescription || offer, userId));
      });
    },
    participant_left: (payload: Event) => {
      if (payload.callId !== callId) return;
      const userId = String(payload.participant || payload.userId || '');
      peers.get(userId)?.stopUsage();
      peers.get(userId)?.connection.close();
      peers.get(userId)?.remote?.release?.();
      peers.delete(userId);
      onRemote?.([...peers.values()].find(peer => peer.remote)?.remote);
    },
    webrtc_offer: payload => signal('offer', payload),
    webrtc_answer: payload => signal('answer', payload),
    ice_candidate: payload => signal('ice', payload),
  });
  return {
    replaceVideo: async track => {
      videoTrack = track;
      await Promise.all([...peers.values()].map(peer => peer.videoSender?.replaceTrack(track)));
    },
    stop: () => {
      stopped = true;
      unsubscribe();
      peers.forEach(peer => { peer.stopUsage(); peer.connection.close(); peer.remote?.release?.(); });
      peers.clear();
    },
    setRemoteAudio: enabled => {
      audible = enabled;
      peers.forEach(peer => peer.remote?.getAudioTracks().forEach(track => { track.enabled = enabled; }));
    },
  };
}
