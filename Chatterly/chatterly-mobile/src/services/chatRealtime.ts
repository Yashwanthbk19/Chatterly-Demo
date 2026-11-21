import NetInfo from '@react-native-community/netinfo';
import {io, type Socket} from 'socket.io-client';
import {SOCKET_BASE_URL} from '../config/api';
import type {ChatMessage} from '../types/chat';
import type {IncomingCall} from '../types/call';
import {normalizeMessage} from './chatApi';
import {getSession} from './sessionStore';
import {AckTimeoutError} from '../utils/sendErrors';
import {recordMessageData} from './dataUsage';

export type PresenceState = 'online' | 'away' | 'offline';
export type ConnectionState = 'connected' | 'connecting' | 'offline';

/**
 * The `sendMessage` ACK the backend replies with. `duplicate` is set when the
 * server matched our `tempId` against a message it had already stored, which is
 * how retrying a send that actually succeeded avoids creating a second copy.
 */
export type SendAck = {
  success: boolean;
  tempId: string;
  messageId?: string;
  status?: string;
  duplicate?: boolean;
  error?: string;
};

export type SocketSendPayload = {
  receiverId: string;
  tempId: string;
  text?: string;
  replyTo?: string | null;
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'audio' | 'file';
  caption?: string;
  audioDuration?: number;
  waveform?: number[];
};

export type GroupSocketSendPayload = {
  groupId: string;
  tempId: string;
  text?: string;
  replyTo?: string | null;
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'audio' | 'file';
  caption?: string;
};

export type GroupForwardPayload = {
  groupId: string;
  originalMessageId: string;
  tempId: string;
};

type RealtimeHandlers = {
  onMessage: (message: ChatMessage) => void;
  onDelivered: (messageId: string) => void;
  onRead: (messageIds: string[]) => void;
  onPresence: (state: PresenceState, lastSeen?: string | null) => void;
  onTyping: (typing: boolean) => void;
  onDeleted?: (messageId: string, scope: 'me' | 'everyone') => void;
  onPinned?: (messageId: string, pinnedAt: string | null) => void;
  onUnpinned?: (messageId: string) => void;
  onReaction?: (payload: MessageReactionPayload) => void;
};

export type MessageReactionPayload = {
  messageId?: string;
  clientMessageId?: string;
  targetMessageIds?: string[];
  chatId?: string;
  groupId?: string;
  senderId?: string;
  receiverId?: string;
  userId?: string;
  emoji?: string;
  remove?: boolean;
  removed?: boolean;
  reactedAt?: string;
};

/** Everything the chat list needs to stay live without a conversation open. */
type InboxHandlers = {
  onMessage?: (message: ChatMessage) => void;
  onDelivered?: (messageId: string) => void;
  onRead?: (chatId: string, messageIds: string[]) => void;
  onPresence?: (userId: string, state: PresenceState, lastSeen?: string | null) => void;
  onTyping?: (userId: string, typing: boolean) => void;
};

export type CallType = 'audio' | 'video';

export type CallAck = {
  success: boolean;
  message: string;
  callId: string;
  chatId: string;
  status?: string;
};

export type CallEventPayload = {
  callId?: string;
  chatId?: string;
  status?: string;
  startedAt?: string;
  duration?: number;
  endedBy?: string;
  cancelledBy?: string;
  rejectedBy?: string;
  userId?: string;
  reason?: string;
  type?: string;
};

export type CallSignalPayload = CallEventPayload & {
  type: 'offer' | 'answer' | 'ice';
  offer?: unknown;
  answer?: unknown;
  candidate?: unknown;
  from?: string;
};

type IncomingCallSocketPayload = Partial<IncomingCall> & {
  callerProfilePicture?: string;
  profilePic?: string;
  callType?: string;
};

type CallHandlers = {
  onStatus?: (payload: CallEventPayload) => void;
  onConnected?: (payload: CallEventPayload) => void;
  onEnded?: (payload: CallEventPayload) => void;
  onMissed?: (payload: CallEventPayload) => void;
  onRejected?: (payload: CallEventPayload) => void;
  onCancelled?: (payload: CallEventPayload) => void;
  onMedia?: (payload: CallEventPayload) => void;
  onConnectionChange?: (payload: CallEventPayload) => void;
  onSignal?: (payload: CallSignalPayload) => void;
};

// How long to wait for the `sendMessage` ACK before treating the send as
// failed. The backend answers right after the Message.create call, so anything
// past this is a dead connection rather than a slow database.
const ACK_TIMEOUT_MS = 10000;
const CALL_ACK_TIMEOUT_MS = 12000;
const MESSAGE_REACTION_CONTROL_PREFIX = '__CHATTERLY_MESSAGE_REACTION__:';

// Inbound de-duplication window. The same message legitimately arrives twice -
// once from the room broadcast and once from the `missed_messages` replay the
// server sends on registration - and those are seconds apart at most.
const DEDUPE_TTL_MS = 30000;

let socket: Socket | null = null;
let connectionState: ConnectionState = 'offline';
// Who this socket is currently registered as. Registration is expensive on the
// server - it re-reads the online set, flips queued messages to delivered and
// replays missed ones - so it must happen once per connection, not on every
// call that happens to need the socket.
let registeredAs = '';
const connectionListeners = new Set<(state: ConnectionState) => void>();

const currentUserId = () => String(getSession()?.user?.id || '');

// Keep typing across screen navigation. The backend sends direct-chat events
// with the sender id, so each sender belongs only to their own inbox row.
const typingTimers = new Map<string, ReturnType<typeof setTimeout>>();
const typingListeners = new Set<(userId: string, typing: boolean) => void>();
const TYPING_EXPIRY_MS = 5000;

function updateTyping(userId: string, typing: boolean): void {
  if (!userId || (typing && userId === currentUserId())) { return; }
  const previous = typingTimers.get(userId);
  if (previous !== undefined) { clearTimeout(previous); }
  typingTimers.delete(userId);
  if (typing) {
    typingTimers.set(userId, setTimeout(() => updateTyping(userId, false), TYPING_EXPIRY_MS));
  }
  if (typing || previous !== undefined) { typingListeners.forEach(listener => listener(userId, typing)); }
}

function clearTyping(): void {
  [...typingTimers.keys()].forEach(userId => updateTyping(userId, false));
}

function subscribeToTyping(listener: (userId: string, typing: boolean) => void): () => void {
  typingListeners.add(listener);
  typingTimers.forEach((_timer, userId) => listener(userId, true));
  return () => { typingListeners.delete(listener); };
}

function setConnectionState(next: ConnectionState): void {
  if (connectionState === next) { return; }
  connectionState = next;
  connectionListeners.forEach(listener => listener(next));
}

export function getConnectionState(): ConnectionState {
  return connectionState;
}

export function subscribeToConnection(listener: (state: ConnectionState) => void): () => void {
  connectionListeners.add(listener);
  listener(connectionState);
  return () => { connectionListeners.delete(listener); };
}

/**
 * Builds a de-duplicator for one subscription.
 *
 * It is deliberately per-subscription rather than shared: the conversation and
 * the chat list both listen for `receiveMessage`, and with a single global set
 * whichever one ran first would consume the token and silence the other.
 *
 * The returned function is true the first time a message is seen and false for
 * a repeat inside the window. Both the server id and our own `tempId` are
 * checked, so a message echoed back before its ACK resolves is still matched.
 */
function createDeduper() {
  const seen = new Map<string, number>();

  return (...keys: Array<string | null | undefined>): boolean => {
    const now = Date.now();
    seen.forEach((expiry, key) => { if (expiry < now) { seen.delete(key); } });

    const identifiers = keys.map(key => String(key || '')).filter(Boolean);
    if (identifiers.length === 0) { return true; }
    if (identifiers.some(key => seen.has(key))) { return false; }

    identifiers.forEach(key => seen.set(key, now + DEDUPE_TTL_MS));
    return true;
  };
}

/** Unwraps a persisted message and rejects transport-only status payloads. */
function messageRecordFromSocket(payload: unknown): Parameters<typeof normalizeMessage>[0] | null {
  if (!payload || typeof payload !== 'object') return null;
  const wrapper = payload as Record<string, unknown>;
  const candidate = wrapper.data && typeof wrapper.data === 'object'
    ? wrapper.data as Record<string, unknown>
    : wrapper;
  // A wrapper such as `{message: "New Message Sent"}` is an acknowledgement,
  // not conversation content. Requiring a stable id also prevents it from
  // receiving normalizeMessage's generated timestamp id and becoming a bubble.
  if (!candidate._id && !candidate.id && !candidate.tempId) return null;
  return candidate as Parameters<typeof normalizeMessage>[0];
}


let onlineUserIds = new Set<string>();
const onlineUserListeners = new Set<(ids: ReadonlySet<string>) => void>();

function publishOnlineUsers(ids: Set<string>) {
  onlineUserIds = ids;
  onlineUserListeners.forEach(listener => listener(new Set(ids)));
}

/** Replay the current server snapshot when the list opens after registration. */
export function subscribeToOnlineUsers(listener: (ids: ReadonlySet<string>) => void): () => void {
  ensureSocket();
  onlineUserListeners.add(listener);
  listener(new Set(onlineUserIds));
  return () => { onlineUserListeners.delete(listener); };
}

const SOCKET_CHECK_TIMEOUT_MS = 4000;
const REASSERT_MIN_GAP_MS = 1000;
let stopWatchingNetwork: (() => void) | null = null;
let lastReassertAt = 0;

/**
 * The server announces `user_offline` whenever any connection of ours closes. If
 * we are still connected, it was an old connection that the server only now gave
 * up on - after a Wi-Fi to mobile data switch that is up to 85 seconds late - and
 * it has marked us offline and started the 10-second clock that ends a connected
 * call. Registering again puts us back online and cancels that clock.
 */
function reassertRegistration(): void {
  const active = socket;
  const userId = currentUserId();
  const now = Date.now();
  if (!active?.connected || !userId || now - lastReassertAt < REASSERT_MIN_GAP_MS) { return; }
  lastReassertAt = now;
  active.emit('registerUser', userId);
}

/**
 * Switching between Wi-Fi and mobile data leaves the socket's old TCP connection
 * dead while Socket.IO still reports it connected; it only notices when its ping
 * times out, which on this server is up to 85 seconds. A call cannot wait that
 * long to resend its signalling, so after a network change the connection is
 * checked and replaced at once if it does not answer.
 */
function verifySocket(): void {
  const active = socket;
  if (!active) { return; }
  if (!active.connected) {
    // Socket.IO may be waiting out a reconnect delay; there is a network now.
    if (typeof active.connect === 'function') { active.connect(); }
    return;
  }
  const userId = currentUserId();
  if (!userId || typeof active.timeout !== 'function') { return; }
  // `registerUser` is what a reconnect sends anyway, and it is acknowledged, so
  // it doubles as the liveness check.
  active.timeout(SOCKET_CHECK_TIMEOUT_MS).emit('registerUser', userId, (error: unknown) => {
    if (!error || socket !== active) { return; }
    active.disconnect();
    active.connect();
  });
}

function watchNetwork(): () => void {
  let lastOnline = '';
  let wasOffline = false;
  return NetInfo.addEventListener(state => {
    if (state.isConnected === false || state.isInternetReachable === false) { wasOffline = true; return; }
    const address = state.details && 'ipAddress' in state.details ? state.details.ipAddress || '' : '';
    const key = state.type && state.type !== 'unknown' && state.type !== 'none' ? `${state.type}:${address}` : '';
    const changed = Boolean(lastOnline && key && key !== lastOnline);
    if (key) { lastOnline = key; }
    if (changed || wasOffline) {
      wasOffline = false;
      verifySocket();
    }
  });
}

function ensureSocket(): Socket | null {
  const userId = currentUserId();
  if (!userId) { return null; }

  if (!socket) {
    setConnectionState('connecting');
    socket = io(SOCKET_BASE_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 750,
      reconnectionDelayMax: 5000,
    });
    // Count once at the transport, regardless of how many screens subscribe.
    const messageEvents = new Set(['receiveMessage', 'receiveGroupMessage', 'sendMessage', 'sendGroupMessage', 'replyGroupMessage', 'forwardMessage', 'forwardGroupMessage']);
    socket.onAny?.((event, ...args) => { if (messageEvents.has(event)) { recordMessageData('received', args[0]); } });
    socket.onAnyOutgoing?.((event, ...args) => { if (messageEvents.has(event)) { recordMessageData('sent', args[0]); } });

    socket.on('userTyping', (payload: {sender?: string}) => updateTyping(String(payload?.sender || ''), true));
    socket.on('userStopTyping', (payload: {sender?: string}) => updateTyping(String(payload?.sender || ''), false));
    socket.on('receiveMessage', (record: unknown) => {
      const messageRecord = messageRecordFromSocket(record);
      if (!messageRecord) return;
      const message = normalizeMessage(messageRecord);
      if (!message.isOwn && message.contactId) { updateTyping(message.contactId, false); }
    });

    socket.on('online_users', (payload: {userIds?: unknown[]}) => {
      if (Array.isArray(payload?.userIds)) {
        publishOnlineUsers(new Set(payload.userIds.map(String)));
      }
    });
    socket.on('user_online', (payload: {userId?: string}) => {
      if (payload?.userId) {
        publishOnlineUsers(new Set([...onlineUserIds, String(payload.userId)]));
      }
    });
    socket.on('user_offline', (payload: {userId?: string}) => {
      if (payload?.userId && String(payload.userId) === currentUserId()) { reassertRegistration(); }
      if (payload?.userId) {
        updateTyping(String(payload.userId), false);
        const next = new Set(onlineUserIds);
        next.delete(String(payload.userId));
        publishOnlineUsers(next);
      }
    });

    // `registerUser` is what puts this user in the server's online set, joins
    // their personal room - where `message_delivered` and `messages_read` are
    // sent - and triggers the missed-message replay. It has to run on every
    // connect, not just the first, or a reconnected app goes silently deaf.
    socket.on('connect', () => {
      const id = currentUserId();
      socket?.emit('registerUser', id);
      registeredAs = id;
      setConnectionState('connected');
    });
    socket.on('disconnect', () => {
      clearTyping();
      publishOnlineUsers(new Set());
      // A dropped connection leaves nothing registered, so the next connect
      // has to register again even though the user has not changed.
      registeredAs = '';
      setConnectionState('offline');
    });
    socket.on('connect_error', () => setConnectionState('connecting'));
    socket.io.on('reconnect_attempt', () => setConnectionState('connecting'));
    stopWatchingNetwork = watchNetwork();
  }

  if (socket.connected) {
    setConnectionState('connected');
    // Only when this connection is not already registered as this user. Without
    // the guard every keystroke - which reaches here through emitTyping - would
    // make the server redo the whole registration workload.
    if (registeredAs !== userId) {
      socket.emit('registerUser', userId);
      registeredAs = userId;
    }
  }

  return socket;
}

function normalizeCallAck(ack: Partial<CallAck> | undefined, fallbackMessage: string): CallAck {
  return {
    success: ack?.success !== false,
    message: String(ack?.message || fallbackMessage),
    callId: String(ack?.callId || ''),
    chatId: String(ack?.chatId || ''),
    status: ack?.status ? String(ack.status) : undefined,
  };
}

async function emitCallEvent(eventName: string, payload: Record<string, unknown>, fallbackMessage: string): Promise<CallAck> {
  const active = ensureSocket();
  if (!active) {
    return Promise.reject(new Error('You are signed out. Sign in again to start a call.'));
  }
  if (!active.connected) {
    // A cold Call List callback or a network handover can race the socket.
    // Wait for registration on the existing connection rather than dropping
    // the user's action or starting a second call through the REST fallback.
    await new Promise<void>((resolve, reject) => {
      const ready = () => { cleanup(); resolve(); };
      const cleanup = () => { clearTimeout(timer); active.off('connect', ready); };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('No connection. Reconnecting...'));
      }, CALL_ACK_TIMEOUT_MS);
      active.on('connect', ready);
      if (typeof active.connect === 'function' && !active.active) active.connect();
    });
    if (socket !== active || !active.connected) throw new Error('The call connection is no longer available.');
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) { return; }
      settled = true;
      reject(new Error('The server did not confirm the call in time.'));
    }, CALL_ACK_TIMEOUT_MS);

    active.emit(eventName, payload, (ack: Partial<CallAck> | undefined) => {
      if (settled) { return; }
      settled = true;
      clearTimeout(timer);
      resolve(normalizeCallAck(ack, fallbackMessage));
    });
  });
}

/**
 * Generic acknowledged emit for the socket contracts whose ACK is not the
 * one-to-one call shape - group conferencing answers `{success, groupCallId}`
 * rather than `{success, callId, chatId}`. It shares the one socket instance
 * (and therefore the one `registerUser` registration) with everything else in
 * this module, so a feature never opens a second connection.
 */
export function emitWithAck<TAck extends {success?: boolean; message?: string}>(
  eventName: string,
  payload: Record<string, unknown>,
  fallbackMessage: string,
): Promise<TAck & {success: boolean; message: string}> {
  const active = ensureSocket();
  if (!active) {
    return Promise.reject(new Error('You are signed out. Sign in again to continue.'));
  }
  if (!active.connected) {
    return Promise.reject(new Error('No connection. Reconnecting...'));
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) { return; }
      settled = true;
      reject(new Error('The server did not confirm the request in time.'));
    }, CALL_ACK_TIMEOUT_MS);

    active.emit(eventName, payload, (ack: Partial<TAck> | undefined) => {
      if (settled) { return; }
      settled = true;
      clearTimeout(timer);
      resolve({
        ...(ack || {}),
        success: ack?.success !== false,
        message: String(ack?.message || fallbackMessage),
      } as TAck & {success: boolean; message: string});
    });
  });
}

/**
 * Attach several server-event listeners at once and detach them together. The
 * returned unsubscribe is safe to call twice, which matters because a React
 * effect cleanup can race a call that is already tearing itself down.
 */
export function subscribeToSocketEvents(handlers: Record<string, (payload: any) => void>): () => void {
  const active = ensureSocket();
  if (!active) { return () => undefined; }
  const entries = Object.entries(handlers);
  entries.forEach(([event, handler]) => active.on(event, handler));
  let detached = false;
  return () => {
    if (detached) { return; }
    detached = true;
    entries.forEach(([event, handler]) => active.off(event, handler));
  };
}

/** Runs `callback` now when the socket is up, and again after every reconnect. */
export function onSocketReady(callback: () => void): () => void {
  const active = ensureSocket();
  if (!active) { return () => undefined; }
  active.on('connect', callback);
  if (active.connected) { callback(); }
  return () => { active.off('connect', callback); };
}

function emitCallById(eventName: string, callId: string, fallbackMessage: string): Promise<CallAck> {
  const normalizedCallId = String(callId || '').trim();
  if (!normalizedCallId) {
    return Promise.reject(new Error('Call id is required.'));
  }
  return emitCallEvent(eventName, {callId: normalizedCallId}, fallbackMessage);
}

/** Opens the connection early so the first send is not also a cold start. */
export function connectRealtime(): void {
  const active = ensureSocket();
  if (active && !active.connected && !active.active && typeof active.connect === 'function') active.connect();
}

export function disconnectRealtime(): void {
  clearTyping();
  typingListeners.clear();
  publishOnlineUsers(new Set());
  stopWatchingNetwork?.();
  stopWatchingNetwork = null;
  socket?.removeAllListeners();
  socket?.disconnect();
  socket = null;
  registeredAs = '';
  setConnectionState('offline');
}

export function initiateCallOverSocket(receiverId: string, type: CallType = 'audio'): Promise<CallAck> {
  const normalizedReceiverId = String(receiverId || '').trim();
  if (!normalizedReceiverId) {
    return Promise.reject(new Error('Receiver id is required to start a call.'));
  }
  return emitCallEvent('call_initiate', {receiverId: normalizedReceiverId, type}, 'Call initiated successfully');
}

/** Listens at app level so a call can arrive on any authenticated screen. */
export function subscribeToIncomingCalls(onIncoming: (call: IncomingCall) => void): () => void {
  const active = ensureSocket();
  if (!active) { return () => undefined; }

  const receive = (payload: IncomingCallSocketPayload = {}) => {
    const callId = String(payload.callId || '').trim();
    const callerId = String(payload.callerId || '').trim();
    if (!callId || !callerId) { return; }
    onIncoming({
      callId,
      chatId: String(payload.chatId || '').trim(),
      callerId,
      receiverId: payload.receiverId ? String(payload.receiverId) : undefined,
      callerName: String(payload.callerName || 'Unknown caller').trim() || 'Unknown caller',
      callerProfilePic: String(payload.callerProfilePic || payload.callerProfilePicture || payload.profilePic || '').trim() || null,
      type: String(payload.type || payload.callType || '').toLowerCase() === 'video' ? 'video' : 'audio',
      status: 'calling',
      createdAt: payload.createdAt ? String(payload.createdAt) : new Date().toISOString(),
    });
  };

  active.on('call_incoming', receive);
  const conference = (payload: {callId?: string; invitedBy?: string}) => {
    if (!payload?.callId || !payload.invitedBy) return;
    onIncoming({callId: payload.callId, chatId: '', callerId: payload.invitedBy, callerName: 'Conference call', type: 'video', status: 'calling', conference: true});
  };
  active.on('conference_call_invite', conference);
  return () => { active.off('call_incoming', receive); active.off('conference_call_invite', conference); };
}

export const joinCallRoom = (callId: string) => emitCallById('call_join_room', callId, 'Joined call room');
export const acceptCallOverSocket = (callId: string) => emitCallById('call_accept', callId, 'Call accepted');
export const joinConferenceOverSocket = (callId: string) => emitCallById('call_join_conference', callId, 'Joined conference call');
export const rejectCallOverSocket = (callId: string) => emitCallById('call_reject', callId, 'Call rejected');
export const endCallOverSocket = (callId: string) => emitCallById('call_end', callId, 'Call ended');
export const cancelCallOverSocket = (callId: string) => emitCallById('call_cancel', callId, 'Call cancelled');
export const setCallMutedOverSocket = (callId: string, muted: boolean) => emitCallById(muted ? 'call_mute' : 'call_unmute', callId, muted ? 'Call muted' : 'Call unmuted');
export const setCallSpeakerOverSocket = (callId: string, enabled: boolean) => emitCallById(enabled ? 'speaker_on' : 'speaker_off', callId, enabled ? 'Speaker on' : 'Speaker off');
/** Tells the call room this user started or stopped sharing their screen (`call_screen_share_started/stopped`). */
export const setCallScreenShareOverSocket = (callId: string, sharing: boolean) => emitCallById(sharing ? 'call_screen_share_start' : 'call_screen_share_stop', callId, sharing ? 'Screen sharing started' : 'Screen sharing stopped');
export const sendCallOfferOverSocket = (callId: string, offer: unknown) => emitCallEvent('webrtc_offer', {callId: String(callId || '').trim(), offer}, 'Call offer sent');
export const sendCallAnswerOverSocket = (callId: string, answer: unknown) => emitCallEvent('webrtc_answer', {callId: String(callId || '').trim(), answer}, 'Call answer sent');
export const sendIceCandidateOverSocket = (callId: string, candidate: unknown) => emitCallEvent('ice_candidate', {callId: String(callId || '').trim(), candidate}, 'ICE candidate sent');
export function addCallParticipantOverSocket(callId: string, targetUserId: string): Promise<CallAck> {
  const normalizedCallId = String(callId || '').trim();
  const normalizedTargetUserId = String(targetUserId || '').trim();
  if (!normalizedCallId) { return Promise.reject(new Error('Call id is required.')); }
  if (!normalizedTargetUserId) { return Promise.reject(new Error('Participant id is required.')); }
  return emitCallEvent('call_add_participant', {callId: normalizedCallId, targetUserId: normalizedTargetUserId}, 'Conference invitation sent');
}

export function subscribeToCall(callId: string, handlers: CallHandlers): () => void {
  const active = ensureSocket();
  if (!active) { return () => undefined; }
  const normalizedCallId = String(callId || '').trim();
  let socketWasConnected = active.connected;
  const belongsHere = (payload?: CallEventPayload) => !payload?.callId || String(payload.callId) === normalizedCallId;
  const wire = (callback?: (payload: CallEventPayload) => void) => (payload: CallEventPayload = {}) => {
    if (belongsHere(payload)) { callback?.({...payload, callId: payload.callId ? String(payload.callId) : normalizedCallId}); }
  };
  const status = wire(handlers.onStatus);
  const connected = wire(handlers.onConnected);
  const ended = wire(handlers.onEnded);
  const missed = wire(handlers.onMissed);
  const rejected = wire(handlers.onRejected);
  const cancelled = wire(handlers.onCancelled);
  const muted = wire(payload => handlers.onMedia?.({...payload, type: 'muted'}));
  const unmuted = wire(payload => handlers.onMedia?.({...payload, type: 'unmuted'}));
  const speakerOn = wire(payload => handlers.onMedia?.({...payload, type: 'speaker_on'}));
  const speakerOff = wire(payload => handlers.onMedia?.({...payload, type: 'speaker_off'}));
  const shareStarted = wire(payload => handlers.onMedia?.({...payload, type: 'screen_share_started'}));
  const shareStopped = wire(payload => handlers.onMedia?.({...payload, type: 'screen_share_stopped'}));
  const offer = wire(payload => handlers.onSignal?.({...payload, type: 'offer', offer: (payload as CallSignalPayload).offer, from: (payload as CallSignalPayload).from}));
  const answer = wire(payload => handlers.onSignal?.({...payload, type: 'answer', answer: (payload as CallSignalPayload).answer, from: (payload as CallSignalPayload).from}));
  const ice = wire(payload => handlers.onSignal?.({...payload, type: 'ice', candidate: (payload as CallSignalPayload).candidate, from: (payload as CallSignalPayload).from}));
  const reconnecting = wire(payload => handlers.onConnectionChange?.({...payload, type: 'reconnecting'}));
  const reconnected = wire(payload => handlers.onConnectionChange?.({...payload, type: 'reconnected'}));
  const disconnected = wire(payload => handlers.onConnectionChange?.({...payload, type: 'disconnected'}));
  const socketReconnected = () => {
    // Socket rooms belong to the transport, so a handover must restore them.
    active.emit('call_join_room', {callId: normalizedCallId});
    if (socketWasConnected) {
      handlers.onConnectionChange?.({callId: normalizedCallId, type: 'reconnected'});
    }
    socketWasConnected = true;
  };
  const socketDisconnected = () => {
    handlers.onConnectionChange?.({callId: normalizedCallId, type: 'disconnected'});
  };

  active.on('call_status', status);
  active.on('call_connected', connected);
  active.on('call_ended', ended);
  active.on('call_missed', missed);
  active.on('call_rejected', rejected);
  active.on('call_cancelled', cancelled);
  active.on('call_muted', muted);
  active.on('call_unmuted', unmuted);
  active.on('speaker_on', speakerOn);
  active.on('speaker_off', speakerOff);
  active.on('call_screen_share_started', shareStarted);
  active.on('call_screen_share_stopped', shareStopped);
  active.on('webrtc_offer', offer);
  active.on('webrtc_answer', answer);
  active.on('ice_candidate', ice);
  active.on('call_reconnecting', reconnecting);
  active.on('call_reconnected', reconnected);
  active.on('call_disconnected', disconnected);
  active.on('connect', socketReconnected);
  active.on('disconnect', socketDisconnected);

  return () => {
    active.off('call_status', status);
    active.off('call_connected', connected);
    active.off('call_ended', ended);
    active.off('call_missed', missed);
    active.off('call_rejected', rejected);
    active.off('call_cancelled', cancelled);
    active.off('call_muted', muted);
    active.off('call_unmuted', unmuted);
    active.off('speaker_on', speakerOn);
    active.off('speaker_off', speakerOff);
    active.off('call_screen_share_started', shareStarted);
    active.off('call_screen_share_stopped', shareStopped);
    active.off('webrtc_offer', offer);
    active.off('webrtc_answer', answer);
    active.off('ice_candidate', ice);
    active.off('call_reconnecting', reconnecting);
    active.off('call_reconnected', reconnected);
    active.off('call_disconnected', disconnected);
    active.off('connect', socketReconnected);
    active.off('disconnect', socketDisconnected);
  };
}

/**
 * Sprint 3 Story 1's send path: the socket carries the message and the ACK is
 * what turns the optimistic "Sending..." bubble into "Sent". The REST route is
 * only the fallback for when this rejects.
 */
export function sendMessageOverSocket(payload: SocketSendPayload): Promise<SendAck> {
  const sender = currentUserId();
  const active = ensureSocket();

  if (!active || !sender) {
    return Promise.reject(new Error('You are signed out. Sign in again to send messages.'));
  }
  if (!active.connected) {
    return Promise.reject(new Error('No connection. Reconnecting...'));
  }

  // The room is keyed on the two user ids and the server only broadcasts into
  // it, so joining before sending is what makes our own message come back.
  active.emit('joinchat', {user1: sender, user2: payload.receiverId});

  return new Promise<SendAck>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) { return; }
      settled = true;
      reject(new AckTimeoutError());
    }, ACK_TIMEOUT_MS);

    active.emit(
      'sendMessage',
      {
        sender,
        receiver: payload.receiverId,
        tempId: payload.tempId,
        // The backend persists one-to-one text from `encryptedContent`; under
        // any other key it stores an empty body and rejects the send as empty.
        ...(payload.text ? {encryptedContent: payload.text} : {}),
        ...(payload.replyTo ? {replyTo: payload.replyTo} : {}),
        ...(payload.mediaUrl ? {mediaUrl: payload.mediaUrl} : {}),
        ...(payload.mediaType ? {mediaType: payload.mediaType} : {}),
        ...(payload.caption ? {caption: payload.caption} : {}),
        ...(payload.audioDuration !== undefined ? {audioDuration: payload.audioDuration} : {}),
        ...(payload.waveform ? {waveform: payload.waveform} : {}),
      },
      (ack: SendAck | undefined) => {
        if (settled) { return; }
        settled = true;
        clearTimeout(timer);

        if (!ack?.success) {
          reject(new Error(ack?.error || 'The message could not be sent.'));
          return;
        }
        resolve({...ack, tempId: String(ack.tempId || payload.tempId)});
      },
    );
  });
}

/** Sends an already-hosted message into a group without downloading and
 * uploading the attachment again. The group socket persists the new message,
 * updates the group's last message and broadcasts it to group members. */
export function sendGroupMessageOverSocket(payload: GroupSocketSendPayload): Promise<ChatMessage> {
  const sender = currentUserId();
  const active = ensureSocket();
  if (!active || !sender) { return Promise.reject(new Error('You are signed out. Sign in again to send messages.')); }
  if (!active.connected) { return Promise.reject(new Error('No connection. Reconnecting...')); }
  active.emit('joinGroup', {groupId: payload.groupId});
  return new Promise<ChatMessage>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) { return; }
      settled = true;
      reject(new AckTimeoutError());
    }, ACK_TIMEOUT_MS);
    const event = payload.replyTo ? 'replyGroupMessage' : 'sendGroupMessage';
    active.emit(event, {
      sender,
      groupId: payload.groupId,
      tempId: payload.tempId,
      ...(payload.text ? {message: payload.text} : {}),
      ...(payload.replyTo ? {replyTo: payload.replyTo} : {}),
      ...(payload.mediaUrl ? {mediaUrl: payload.mediaUrl} : {}),
      ...(payload.mediaType ? {mediaType: payload.mediaType} : {}),
      ...(payload.caption ? {caption: payload.caption} : {}),
    }, (ack: {success?: boolean; error?: string; data?: Parameters<typeof normalizeMessage>[0]} | undefined) => {
      if (settled) { return; }
      settled = true;
      clearTimeout(timer);
      if (!ack?.success) { reject(new Error(ack?.error || 'The group message could not be sent.')); return; }
      if (!ack.data) { reject(new Error('The server did not confirm the group message.')); return; }
      resolve(normalizeMessage({...ack.data, tempId: ack.data.tempId || payload.tempId}, true));
    });
  });
}

/** Persists a group forward so the server marks it as forwarded. */
export function forwardGroupMessageOverSocket(payload: GroupForwardPayload): Promise<void> {
  const sender = currentUserId();
  const active = ensureSocket();
  if (!active || !sender) { return Promise.reject(new Error('You are signed out. Sign in again to send messages.')); }
  if (!active.connected) { return Promise.reject(new Error('No connection. Reconnecting...')); }
  active.emit('joinGroup', {groupId: payload.groupId});
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) { return; }
      settled = true;
      reject(new AckTimeoutError());
    }, ACK_TIMEOUT_MS);
    active.emit('forwardGroupMessage', {
      sender,
      groupId: payload.groupId,
      originalMessageId: payload.originalMessageId,
      tempId: payload.tempId,
    }, (ack: {success?: boolean; error?: string} | undefined) => {
      if (settled) { return; }
      settled = true;
      clearTimeout(timer);
      if (!ack?.success) { reject(new Error(ack?.error || 'The message could not be forwarded.')); return; }
      resolve();
    });
  });
}

export function subscribeToChat(chatId: string, contactId: string, handlers: RealtimeHandlers): () => void {
  const active = ensureSocket();
  const userId = currentUserId();
  if (!active || !userId) { return () => undefined; }

  const join = () => active.emit('joinchat', {user1: userId, user2: contactId});
  const isFirstSighting = createDeduper();

  /**
   * `registerUser` auto-joins this socket to *every* one-to-one room the user
   * belongs to, so `receiveMessage` fires here for conversations other than the
   * open one. Without this check a message from a different contact would be
   * appended to the thread currently on screen.
   *
   * Chat id is the reliable discriminator; `contactId` is the fallback for a
   * payload that predates a stored chatId.
   */
  const belongsHere = (message: ChatMessage) => {
    if (message.chatId) { return message.chatId === chatId; }
    return !message.contactId || message.contactId === contactId;
  };

  const receive = (record: unknown) => {
    const messageRecord = messageRecordFromSocket(record);
    if (!messageRecord) return;
    const message = normalizeMessage(messageRecord);
    if (!message.id || !belongsHere(message)) { return; }
    // Our own message comes back here as well as through the ACK. The screen
    // reconciles it by tempId, so let it through and let the screen decide.
    if (message.isOwn) { handlers.onMessage(message); return; }
    if (!isFirstSighting(message.id, message.tempId)) { return; }
    handlers.onMessage(message);
  };

  // The registration replay carries every message addressed to us across all
  // conversations, so it goes through the same filter.
  const missed = (records: unknown) => {
    if (Array.isArray(records)) { records.forEach(receive); }
  };

  const delivered = (payload: {messageId?: string}) => {
    if (payload?.messageId) { handlers.onDelivered(String(payload.messageId)); }
  };
  const read = (payload: {chatId?: string; messageIds?: unknown[]}) => {
    if (payload?.chatId && String(payload.chatId) !== chatId) { return; }
    handlers.onRead(Array.isArray(payload?.messageIds) ? payload.messageIds.map(String) : []);
  };
  const deleted = (payload: {messageId?: string; type?: string}) => {
    if (payload?.messageId) { handlers.onDeleted?.(String(payload.messageId), payload.type === 'me' ? 'me' : 'everyone'); }
  };
  const pinned = (payload: {messageId?: string; pinnedAt?: string | Date | null}) => {
    if (payload?.messageId) { handlers.onPinned?.(String(payload.messageId), payload.pinnedAt ? String(payload.pinnedAt) : null); }
  };
  const unpinned = (payload: {messageId?: string}) => {
    if (payload?.messageId) { handlers.onUnpinned?.(String(payload.messageId)); }
  };
  const reaction = (payload: MessageReactionPayload) => handlers.onReaction?.(payload || {});
  const onlineUsers = (payload: {userIds?: unknown[]}) =>
    handlers.onPresence(payload?.userIds?.map(String).includes(contactId) ? 'online' : 'offline');
  const online = (payload: {userId?: string}) =>
    String(payload?.userId || '') === contactId && handlers.onPresence('online', null);
  const offline = (payload: {userId?: string; lastSeen?: string}) =>
    String(payload?.userId || '') === contactId && handlers.onPresence('offline', payload.lastSeen);
  handlers.onTyping(typingTimers.has(contactId));
  const unsubscribeTyping = subscribeToTyping((sender, typing) => {
    if (sender === contactId) { handlers.onTyping(typing); }
  });

  active.on('connect', join);
  active.on('receiveMessage', receive);
  active.on('missed_messages', missed);
  active.on('message_delivered', delivered);
  active.on('messages_read', read);
  active.on('message_deleted', deleted);
  active.on('message_pinned', pinned);
  active.on('message_unpinned', unpinned);
  active.on('message_reaction', reaction);
  active.on('messageReaction', reaction);
  active.on('message_reacted', reaction);
  active.on('messageReacted', reaction);
  active.on('reaction_updated', reaction);
  active.on('reactionUpdated', reaction);
  active.on('online_users', onlineUsers);
  active.on('user_online', online);
  active.on('user_offline', offline);
  join();

  return () => {
    active.off('connect', join);
    active.off('receiveMessage', receive);
    active.off('missed_messages', missed);
    active.off('message_delivered', delivered);
    active.off('messages_read', read);
    active.off('message_deleted', deleted);
    active.off('message_pinned', pinned);
    active.off('message_unpinned', unpinned);
    active.off('message_reaction', reaction);
    active.off('messageReaction', reaction);
    active.off('message_reacted', reaction);
    active.off('messageReacted', reaction);
    active.off('reaction_updated', reaction);
    active.off('reactionUpdated', reaction);
    active.off('online_users', onlineUsers);
    active.off('user_online', online);
    active.off('user_offline', offline);
    unsubscribeTyping();
  };
}

export function subscribeToGroup(groupId: string, onMessage: (message: ChatMessage) => void, onMessageEdited?: (messageId: string, content: string) => void): () => void {
  const active = ensureSocket();
  if (!active) return () => undefined;
  const first = createDeduper();
  const join = () => active.emit('joinGroup', {groupId});
  const receive = (record: unknown) => {
    const messageRecord = messageRecordFromSocket(record);
    if (!messageRecord) return;
    const message = normalizeMessage(messageRecord);
    if (message.id && first(message.id, message.tempId)) onMessage(message);
  };
  const edited = (payload: {messageId?: string; content?: string}) => {
    if (payload?.messageId && typeof payload.content === 'string') {
      onMessageEdited?.(String(payload.messageId), payload.content);
    }
  };
  active.on('connect', join);
  active.on('receiveGroupMessage', receive);
  active.on('group_message_edited', edited);
  join();
  return () => {
    active.off('connect', join);
    active.off('receiveGroupMessage', receive);
    active.off('group_message_edited', edited);
    active.emit('leaveGroup', {groupId});
  };
}

/** Repairs a blank text body copied by the group-forward socket handler. */
export function editGroupMessageOverSocket(groupId: string, messageId: string, content: string): Promise<void> {
  const sender = currentUserId();
  const active = ensureSocket();
  if (!active || !sender) { return Promise.reject(new Error('You are signed out. Sign in again to edit this message.')); }
  if (!active.connected) { return Promise.reject(new Error('No connection. Reconnecting...')); }
  active.emit('joinGroup', {groupId});
  active.emit('editGroupMessage', {messageId, sender, content});
  return Promise.resolve();
}

/**
 * Watches document uploads while the group call is covering the conversation.
 *
 * Unlike `subscribeToGroup`, cleanup deliberately does not leave the socket
 * room: the chat screen or another app-level subscriber may still own that
 * membership. The message's group id is checked because an authenticated
 * socket can already belong to several group rooms.
 */
export function subscribeToGroupFileShares(groupId: string, onFile: (message: ChatMessage) => void): () => void {
  const active = ensureSocket();
  const normalizedGroupId = String(groupId || '').trim();
  if (!active || !normalizedGroupId) return () => undefined;
  const first = createDeduper();
  const join = () => active.emit('joinGroup', {groupId: normalizedGroupId});
  const receive = (record: unknown) => {
    const messageRecord = messageRecordFromSocket(record);
    if (!messageRecord) return;
    const message = normalizeMessage(messageRecord);
    if (message.chatId !== normalizedGroupId || message.messageType !== 'file' || !message.id) return;
    if (first(message.id, message.tempId)) onFile(message);
  };
  active.on('connect', join);
  active.on('receiveGroupMessage', receive);
  join();
  return () => {
    active.off('connect', join);
    active.off('receiveGroupMessage', receive);
  };
}

export type GroupChange = {type: string; userId?: string; isMuted?: boolean};

const GROUP_CHANGE_EVENTS = ['group_member_muted', 'group_role_updated', 'group_settings_updated', 'group_participant_added', 'group_participant_removed', 'group_updated', 'group_photo_updated', 'group_rules_updated'];

/**
 * Admin changes to a group arrive as room broadcasts with partial payloads (a
 * role change carries no name, a settings change no roster), so callers treat
 * an event as a signal to refetch the group rather than as state.
 *
 * `registerUser` already joins every group room; joining again covers a group
 * this user was added to after registering. It never leaves the room, because
 * the open conversation's subscription owns that membership.
 */
export function subscribeToGroupChanges(groupId: string, onChange: (change: GroupChange) => void): () => void {
  const active = ensureSocket();
  if (!active) return () => undefined;
  const join = () => active.emit('joinGroup', {groupId});
  const listeners = GROUP_CHANGE_EVENTS.map(type => {
    const listener = (payload?: {groupId?: unknown; userId?: unknown; isMuted?: unknown}) => {
      if (String(payload?.groupId || '') !== groupId) return;
      onChange({
        type,
        userId: payload?.userId ? String(payload.userId) : undefined,
        isMuted: typeof payload?.isMuted === 'boolean' ? payload.isMuted : undefined,
      });
    };
    active.on(type, listener);
    return {type, listener};
  });
  active.on('connect', join);
  join();
  return () => {
    active.off('connect', join);
    listeners.forEach(({type, listener}) => active.off(type, listener));
  };
}

/**
 * Chat-list level subscription. The server auto-joins every one-to-one room on
 * registration, so a message in any conversation reaches this app even with no
 * conversation open - that is what keeps list previews, unread badges and the
 * row ticks live instead of only refreshing on a pull.
 */
/** Live receipts only: reconnect history must not replay notification vibrations. */
export function subscribeToLiveMessages(onMessage: (message: ChatMessage, group: boolean) => void): () => void {
  const first = createDeduper();
  const receive = (record: unknown, group: boolean) => {
    const value = messageRecordFromSocket(record);
    if (!value) return;
    const message = normalizeMessage(value);
    if (!message.id || message.isOwn || message.isDeleted || message.deletedForMe || message.systemEvent ||
        message.messageType === 'call' || message.text.trim().startsWith(MESSAGE_REACTION_CONTROL_PREFIX) ||
        !first(message.id, message.tempId)) return;
    onMessage(message, group);
  };
  return subscribeToSocketEvents({
    receiveMessage: record => receive(record, false),
    receiveGroupMessage: record => receive(record, true),
  });
}

export function subscribeToInbox(handlers: InboxHandlers): () => void {
  const active = ensureSocket();
  if (!active) { return () => undefined; }

  const isFirstSighting = createDeduper();
  const unsubscribeTyping = subscribeToTyping((userId, typing) => handlers.onTyping?.(userId, typing));

  const receive = (record: unknown) => {
    const messageRecord = messageRecordFromSocket(record);
    if (!messageRecord) return;
    const message = normalizeMessage(messageRecord);
    if (!message.id) { return; }
    if (message.text.trim().startsWith(MESSAGE_REACTION_CONTROL_PREFIX)) { return; }
    // The registration replay repeats messages the room broadcast already
    // delivered. Counting one twice would inflate the row's unread badge.
    if (!isFirstSighting(message.id, message.tempId)) { return; }
    handlers.onMessage?.(message);
  };
  const missed = (records: unknown) => {
    if (Array.isArray(records)) { records.forEach(receive); }
  };
  const delivered = (payload: {messageId?: string}) => {
    if (payload?.messageId) { handlers.onDelivered?.(String(payload.messageId)); }
  };
  const read = (payload: {chatId?: string; groupId?: string; messageIds?: unknown[]}) =>
    handlers.onRead?.(
      String(payload?.chatId || payload?.groupId || ''),
      Array.isArray(payload?.messageIds) ? payload.messageIds.map(String) : [],
    );
  const onlineUsers = (payload: {userIds?: unknown[]}) =>
    payload?.userIds?.map(String).forEach(id => handlers.onPresence?.(id, 'online'));
  const online = (payload: {userId?: string}) => {
    if (payload?.userId) { handlers.onPresence?.(String(payload.userId), 'online', null); }
  };
  const offline = (payload: {userId?: string; lastSeen?: string}) => {
    if (payload?.userId) { handlers.onPresence?.(String(payload.userId), 'offline', payload.lastSeen); }
  };

  active.on('receiveMessage', receive);
  active.on('receiveGroupMessage', receive);
  active.on('missed_messages', missed);
  active.on('message_delivered', delivered);
  active.on('messages_read', read);
  active.on('group_messages_read', read);
  active.on('online_users', onlineUsers);
  active.on('user_online', online);
  active.on('user_offline', offline);

  return () => {
    active.off('receiveMessage', receive);
    active.off('receiveGroupMessage', receive);
    active.off('missed_messages', missed);
    active.off('message_delivered', delivered);
    active.off('messages_read', read);
    active.off('group_messages_read', read);
    active.off('online_users', onlineUsers);
    active.off('user_online', online);
    active.off('user_offline', offline);
    unsubscribeTyping();
  };
}

export function emitTyping(contactId: string, typing: boolean): void {
  const sender = currentUserId();
  const active = ensureSocket();
  if (active && sender) {
    active.emit(typing ? 'typing' : 'stopTyping', {sender, receiver: contactId});
  }
}

/** Notify the other participant of a direct-message reaction in real time. */
export function emitMessageReaction(payload: MessageReactionPayload): Promise<void> {
  const active = ensureSocket();
  const senderId = String(payload.senderId || currentUserId() || '').trim();
  const receiverId = String(payload.receiverId || '').trim();
  if (!active || !senderId || !receiverId || (!payload.messageId && !payload.clientMessageId)) {
    return Promise.reject(new Error('Message, sender, and receiver are required to react.'));
  }
  if (!active.connected) { return Promise.reject(new Error('No connection. Reconnecting...')); }
  active.emit('joinchat', {user1: senderId, user2: receiverId});
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) { return; }
      settled = true;
      resolve();
    }, ACK_TIMEOUT_MS);
    active.emit('message_reaction', {
      ...payload,
      sender: senderId,
      senderId,
      receiver: receiverId,
      receiverId,
      emoji: payload.remove ? '' : String(payload.emoji || ''),
      reaction: payload.remove ? '' : String(payload.emoji || ''),
      removed: Boolean(payload.remove || payload.removed),
      reactedAt: payload.reactedAt || new Date().toISOString(),
    }, (ack: {success?: boolean; error?: string; message?: string} = {}) => {
      if (settled) { return; }
      settled = true;
      clearTimeout(timer);
      if (ack.success === false) { reject(new Error(ack.error || ack.message || 'Reaction failed.')); }
      else { resolve(); }
    });
  });
}

/**
 * Tells the server we have read the chat. It flips every inbound message to
 * "read" and emits `messages_read` back to the *sender*, which is the last rung
 * of the Story 2 ladder on their device.
 */
export function emitChatRead(chatId: string): void {
  const userId = currentUserId();
  const active = ensureSocket();
  if (active && userId) { active.emit('markAsRead', {chatId, userId}); }
}

/**
 * Broadcasts an already-authorized REST deletion through the backend's
 * existing room event so both open conversations replace the same message.
 */
export function emitMessageDeletedForEveryone(messageId: string): void {
  const userId = currentUserId();
  const active = ensureSocket();
  if (active && userId) { active.emit('deleteMessageForEveryone', {messageId, userId}); }
}

export function emitMessagePinned(messageId: string): void {
  const userId = currentUserId();
  const active = ensureSocket();
  if (active && userId) { active.emit('pinMessage', {messageId, userId}); }
}

export function emitMessageUnpinned(messageId: string): void {
  const active = ensureSocket();
  if (active) { active.emit('unpinMessage', {messageId}); }
}
