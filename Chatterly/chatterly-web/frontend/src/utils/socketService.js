import { io } from 'socket.io-client';
import { getMessageIdentityKeys, hasMessageContent, normalizeMessageData, resolveMessageMediaUrl } from './message';
import { getStoredUser } from './profile';
import { resolveSocketBaseUrl } from './backendUrl';
import { decryptMessageRecord } from '../api/encryption';

const SOCKET_SERVICE_KEY = '__CHATTERLY_SOCKET_SERVICE__';
const SOCKET_STATE_DEFAULTS = Object.freeze({
  isConnected: false,
  status: 'disconnected',
  socketId: '',
  transport: '',
  userId: '',
  lastError: '',
  reconnectAttempt: 0,
  reconnectTimeoutAt: 0,
  reconnectRetryAt: 0,
  recoveredAt: 0,
  recoveredAfterAttempts: 0,
  // When the server's complete online roster last arrived on this connection.
  // 0 means the roster is not known, so nobody may be judged online/offline by it.
  presenceSyncedAt: 0,
});
const SOCKET_TOTAL_MESSAGE_TIMEOUT_MS = 15000;
const SOCKET_ACK_TIMEOUT_MS = 10000;
const SOCKET_CALL_CONNECT_TIMEOUT_MS = 12000;
const SOCKET_INBOUND_MESSAGE_DEDUPE_TTL_MS = 10000;
const SOCKET_INCOMING_CALL_DEDUPE_TTL_MS = 2 * 60 * 1000;
const SOCKET_REPLAY_MESSAGE_SOURCE = 'missed_messages';
const SOCKET_CONNECT_TIMEOUT_MS = 10000;

const globalScope = typeof window !== 'undefined' ? window : globalThis;

const resolveSession = () => {
  const storedUser = getStoredUser() || {};
  const token =
    String(localStorage.getItem('token') || localStorage.getItem('userToken') || '').trim();
  const userId =
    storedUser?._id ||
    storedUser?.userId ||
    storedUser?.id ||
    null;

  return {
    token,
    userId: userId ? String(userId) : '',
  };
};

const resolveSocketUrl = () => resolveSocketBaseUrl();

const resolveSocketPath = () => {
  const configuredPath = String(import.meta.env.VITE_SOCKET_PATH || '').trim();
  return configuredPath || '/socket.io';
};

const createSocketError = (message, code = 'SOCKET_ERROR') => {
  const error = new Error(message);
  error.code = code;
  return error;
};

const normalizeSocketAckPayload = (payload = {}, fallbackTempId = '') => ({
  ...payload,
  tempId: String(payload?.tempId || fallbackTempId || '').trim(),
  messageId: payload?.messageId || payload?.data?._id || payload?.data?.id ? String(payload.messageId || payload.data?._id || payload.data?.id) : '',
  status: payload?.status || (payload?.success === false ? 'failed' : 'sent'),
  success: payload?.success !== false,
  error: String(payload?.error || '').trim(),
});

const getSocketEntityId = (value) => {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
  if (typeof value !== 'object' || Array.isArray(value)) return '';
  return String(value.userId || value.id || value._id || value.memberId || '').trim();
};

const normalizeSocketReactionPayload = (payload = {}) => {
  const source =
    payload?.data && typeof payload.data === 'object' && !Array.isArray(payload.data)
      ? { ...payload, ...payload.data }
      : payload;
  const message =
    source?.message && typeof source.message === 'object' && !Array.isArray(source.message)
      ? source.message
      : {};
  const targetMessage =
    source?.targetMessage && typeof source.targetMessage === 'object' && !Array.isArray(source.targetMessage)
      ? source.targetMessage
      : {};
  const reaction =
    source?.reaction && typeof source.reaction === 'object' && !Array.isArray(source.reaction)
      ? source.reaction
      : {};
  const emoji = String(
    source?.emoji ||
      source?.reactionEmoji ||
      source?.reactionValue ||
      reaction?.emoji ||
      reaction?.value ||
      (typeof source?.reaction === 'string' ? source.reaction : '') ||
      ''
  ).trim();
  const action = String(source?.action || source?.type || source?.operation || '').trim().toLowerCase();
  const isRemoved = Boolean(
    source?.removed ||
      source?.isRemoved ||
      source?.deleted ||
      source?.isDeleted ||
      action === 'remove' ||
      action === 'removed' ||
      action === 'delete' ||
      action === 'deleted' ||
      (!emoji && action === 'clear')
  );

  return {
    ...source,
    messageId: String(
      source?.messageId ||
        source?.message_id ||
        source?.id ||
        source?._id ||
        message?.messageId ||
        message?.id ||
        message?._id ||
        targetMessage?.messageId ||
        targetMessage?.id ||
        targetMessage?._id ||
        ''
    ).trim(),
    clientMessageId: String(
      source?.clientMessageId ||
        source?.client_message_id ||
        source?.tempId ||
        source?.localId ||
        message?.clientMessageId ||
        message?.tempId ||
        message?.localId ||
        ''
    ).trim(),
    chatId: String(
      source?.chatId ||
        source?.chat_id ||
        source?.roomId ||
        message?.chatId ||
        message?.chat?._id ||
        message?.chat?.id ||
        ''
    ).trim(),
    senderId: getSocketEntityId(source?.senderId || source?.sender || source?.from),
    receiverId: getSocketEntityId(source?.receiverId || source?.receiver || source?.to),
    userId: getSocketEntityId(
      source?.userId ||
        source?.reactedBy ||
        source?.actorId ||
        source?.ownerId ||
        reaction?.userId ||
        reaction?.reactedBy ||
        source?.user ||
        reaction?.user
    ),
    emoji,
    removed: isRemoved,
    reactedAt: String(source?.reactedAt || source?.createdAt || reaction?.reactedAt || '').trim(),
  };
};

const extractPresenceUserId = (value) => {
  if (!value) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (typeof value !== 'object') return '';

  const directCandidates = [
    value.userId,
    value.user_id,
    value.userid,
    value.id,
    value._id,
    value.receiverId,
    value.receiver_id,
    value.contactId,
    value.contact_id,
    value.participantId,
    value.participant_id,
    value.senderId,
    value.sender_id,
  ];

  for (const candidate of directCandidates) {
    if (candidate === undefined || candidate === null || candidate === '') continue;
    return String(candidate);
  }

  const nestedCandidates = [
    value.user,
    value.receiver,
    value.contact,
    value.otherUser,
    value.participant,
    value.data,
    value.payload,
  ];
  for (const candidate of nestedCandidates) {
    const resolvedId = extractPresenceUserId(candidate);
    if (resolvedId) return resolvedId;
  }

  return '';
};

const normalizePresenceStatus = (value, fallback = 'offline') => {
  if (typeof value === 'boolean') return value ? 'online' : 'offline';
  if (typeof value === 'number') return value > 0 ? 'online' : 'offline';

  const normalizedValue = String(value || fallback || '').trim().toLowerCase();
  if (['online', 'active', 'available', 'connected', 'true', '1'].includes(normalizedValue)) {
    return 'online';
  }
  if (['offline', 'inactive', 'away', 'disconnected', 'false', '0'].includes(normalizedValue)) {
    return 'offline';
  }
  return fallback === 'online' ? 'online' : 'offline';
};

const normalizeSocketMessage = (message = {}, fallback = {}) => {
  const currentUserId = resolveSession().userId;
  const senderId =
    message?.senderId ||
    message?.sender?._id ||
    message?.sender?.id ||
    message?.sender ||
    fallback?.senderId ||
    null;
  const receiverId =
    message?.receiverId ||
    message?.receiver?._id ||
    message?.receiver?.id ||
    message?.receiver ||
    fallback?.receiverId ||
    null;
  const timestamp =
    message?.timestamp ||
    message?.createdAt ||
    fallback?.timestamp ||
    fallback?.createdAt ||
    new Date().toISOString();

  return normalizeMessageData(
    {
      ...fallback,
      ...message,
      id: message?._id || message?.id || message?.messageId || message?.tempId || fallback?.id,
      clientMessageId:
        message?.tempId ||
        message?.clientMessageId ||
        fallback?.clientMessageId ||
        fallback?.localId ||
        null,
      localId:
        message?.localId ||
        message?.tempId ||
        fallback?.localId ||
        fallback?.clientMessageId ||
        null,
      chatId: message?.chatId || message?.groupId || message?.chat?._id || message?.chat?.id || fallback?.chatId || null,
      groupId: message?.groupId || fallback?.groupId || null,
      chatType: message?.chatType || fallback?.chatType || (message?.groupId ? 'group' : ''),
      senderId,
      receiverId,
      content:
        message?.content ||
        message?.attachment ||
        message?.media ||
        message?.mediaUrl ||
        message?.imageUrl ||
        message?.videoUrl ||
        message?.audioUrl ||
        message?.message ||
        message?.text ||
        fallback?.content ||
        fallback?.mediaUrl ||
        fallback?.imageUrl ||
        fallback?.videoUrl ||
        fallback?.audioUrl ||
        fallback?.text ||
        '',
      mediaUrl:
        resolveMessageMediaUrl(message, fallback, message?.type || fallback?.type || '') ||
        fallback?.mediaUrl ||
        null,
      fileUrl:
        message?.fileUrl ||
        message?.attachment?.fileUrl ||
        message?.content?.fileUrl ||
        fallback?.fileUrl ||
        null,
      fileName:
        message?.fileName ||
        message?.attachment?.fileName ||
        message?.attachment?.name ||
        message?.content?.fileName ||
        message?.content?.name ||
        fallback?.fileName ||
        null,
      fileSize:
        message?.fileSize ||
        message?.attachment?.fileSize ||
        message?.attachment?.size ||
        message?.content?.fileSize ||
        message?.content?.size ||
        fallback?.fileSize ||
        0,
      caption: message?.caption || fallback?.caption || '',
      metadata: message?.metadata || fallback?.metadata || null,
      isForwarded: Boolean(message?.isForwarded ?? fallback?.isForwarded ?? false),
      timestamp,
      createdAt: message?.createdAt || timestamp,
      status: message?.status || fallback?.status || 'sent',
      tempId: message?.tempId || fallback?.tempId || null,
    },
    {
      currentUserId,
      fallback,
    }
  );
};

class SocketService {
  constructor() {
    this.socket = null;
    this.connectionListeners = new Set();
    this.messageListeners = new Set();
    this.messageAckListeners = new Set();
    this.messageDeliveredListeners = new Set();
    this.messagesReadListeners = new Set();
    this.messageDeletedListeners = new Set();
    this.messageReactionListeners = new Set();
    this.groupMediaCompressedListeners = new Set();
    this.contactBlockStateListeners = new Set();
    this.presenceListeners = new Set();
    this.profileUpdatedListeners = new Set();
    this.typingListeners = new Set();
    this.errorListeners = new Set();
    // Realtime call-signaling listeners (mirror the backend callSocket.js
    // contract). Each set is fanned out to by the socket.on handlers wired in
    // ensureSocket(); the public onCall* methods add/remove subscribers.
    this.incomingCallListeners = new Set();
    this.callStatusListeners = new Set();
    this.callConnectedListeners = new Set();
    this.callEndedListeners = new Set();
    this.callMissedListeners = new Set();
    this.callRejectedListeners = new Set();
    this.callCancelledListeners = new Set();
    this.callMediaListeners = new Set();
    this.callScreenShareListeners = new Set();
    this.callSignalListeners = new Set();
    this.callConnectionListeners = new Set();
    this.groupCallListeners = new Set();
    this.groupCallSignalListeners = new Set();
    this.groupChangeListeners = new Set();
    this.activeGroupCalls = new Map();
    this.endedGroupCallIds = new Set();
    this.socketState = { ...SOCKET_STATE_DEFAULTS };
    this.currentSession = resolveSession();
    this.joinedRooms = new Set();
    this.joinedGroupRooms = new Set();
    this.onlineUserIds = new Set();
    this.pendingMessages = new Map();
    this.pendingReadReceipts = new Map();
    this.recentInboundMessageKeys = new Map();
    this.recentIncomingCallKeys = new Map();
    this.hasRegisteredCurrentUser = false;
    this.registeredUserId = '';
    this.registrationPromise = null;
    this.hasConnectedOnce = false;
    this.connectionSuspended = false;
    this.logoutInProgress = false;
  }

  getSnapshot() {
    return { ...this.socketState };
  }

  isConnected() {
    return this.socketState.isConnected;
  }

  isUserOnline(userId) {
    const normalizedUserId = String(userId || '').trim();
    return Boolean(normalizedUserId) && this.onlineUserIds.has(normalizedUserId);
  }

  // True once the server has sent the full online roster for the current
  // connection (`online_users`, which follows every registration). From then on
  // the roster is complete, so a user missing from it really is offline instead
  // of merely unknown.
  hasLivePresence() {
    return Boolean(this.socketState.isConnected && this.socketState.presenceSyncedAt);
  }

  replaceOnlineUsers(userIds = []) {
    this.onlineUserIds = new Set(
      userIds
        .map((userId) => String(userId || '').trim())
        .filter(Boolean)
    );
  }

  updateOnlineUser(userId, status) {
    const normalizedUserId = String(userId || '').trim();
    if (!normalizedUserId) return;
    if (normalizePresenceStatus(status, 'offline') === 'online') {
      this.onlineUserIds.add(normalizedUserId);
      return;
    }
    this.onlineUserIds.delete(normalizedUserId);
  }

  subscribeConnection(callback) {
    this.connectionListeners.add(callback);
    callback(this.getSnapshot());

    return () => {
      this.connectionListeners.delete(callback);
    };
  }

  onMessage(callback) {
    this.messageListeners.add(callback);
    return () => {
      this.messageListeners.delete(callback);
    };
  }

  onGroupMediaCompressed(callback) {
    this.groupMediaCompressedListeners.add(callback);
    return () => {
      this.groupMediaCompressedListeners.delete(callback);
    };
  }

  onMessageAck(callback) {
    this.messageAckListeners.add(callback);
    return () => {
      this.messageAckListeners.delete(callback);
    };
  }

  onMessageDelivered(callback) {
    this.messageDeliveredListeners.add(callback);
    return () => {
      this.messageDeliveredListeners.delete(callback);
    };
  }

  onMessagesRead(callback) {
    this.messagesReadListeners.add(callback);
    return () => {
      this.messagesReadListeners.delete(callback);
    };
  }

  onMessageDeleted(callback) {
    this.messageDeletedListeners.add(callback);
    return () => {
      this.messageDeletedListeners.delete(callback);
    };
  }

  onMessageReaction(callback) {
    this.messageReactionListeners.add(callback);
    return () => {
      this.messageReactionListeners.delete(callback);
    };
  }

  onContactBlockState(callback) {
    this.contactBlockStateListeners.add(callback);
    return () => {
      this.contactBlockStateListeners.delete(callback);
    };
  }

  onPresence(callback) {
    this.presenceListeners.add(callback);
    return () => {
      this.presenceListeners.delete(callback);
    };
  }

  // Someone (this account on another device, or a contact) saved a profile edit.
  // Payload: { userId, name, profilePic, status }. The backend broadcasts it to
  // every connected socket from PATCH /auth/update-profile.
  onProfileUpdated(callback) {
    return this.subscribeCallListener(this.profileUpdatedListeners, callback);
  }

  onTyping(callback) {
    this.typingListeners.add(callback);
    return () => {
      this.typingListeners.delete(callback);
    };
  }

  onError(callback) {
    this.errorListeners.add(callback);
    return () => {
      this.errorListeners.delete(callback);
    };
  }

  // --- Realtime call signaling -------------------------------------------------
  //
  // The backend (src/sockets/callSocket.js) drives the whole call lifecycle over
  // Socket.IO. These subscribe helpers expose each inbound call event to the UI,
  // and the emit* methods below send the matching client->server events. Together
  // they let both ends ring, answer, and hang up in sync. Every subscribe method
  // returns an unsubscribe function, mirroring onMessage/onPresence above.

  subscribeCallListener(listeners, callback) {
    if (typeof callback !== 'function') {
      return () => {};
    }
    listeners.add(callback);
    return () => {
      listeners.delete(callback);
    };
  }

  // Receiver side: a new call is ringing in. Payload:
  // { callId, chatId, callerId, callerName, callerProfilePic, receiverId, type, status, createdAt }
  onIncomingCall(callback) {
    return this.subscribeCallListener(this.incomingCallListeners, callback);
  }

  // Caller side: the call is now ringing on the receiver. Payload: { callId, chatId, status }
  onCallStatus(callback) {
    return this.subscribeCallListener(this.callStatusListeners, callback);
  }

  // Both sides: the receiver answered. Payload: { callId, status, startedAt }
  onCallConnected(callback) {
    return this.subscribeCallListener(this.callConnectedListeners, callback);
  }

  // Both sides: the call finished. Payload: { callId, duration }
  onCallEnded(callback) {
    return this.subscribeCallListener(this.callEndedListeners, callback);
  }

  // Both sides: an unanswered call rang out. Payload: {} (no body from the server)
  onCallMissed(callback) {
    return this.subscribeCallListener(this.callMissedListeners, callback);
  }

  // Both sides: the receiver declined while it was ringing. Payload:
  // { callId, status, rejectedBy, endedAt }
  onCallRejected(callback) {
    return this.subscribeCallListener(this.callRejectedListeners, callback);
  }

  // Both sides: the caller hung up before it was answered. Payload:
  // { callId, status, cancelledBy, endedAt }
  onCallCancelled(callback) {
    return this.subscribeCallListener(this.callCancelledListeners, callback);
  }

  // In-call media control toggled on the other side. Payload:
  // { type: 'muted'|'unmuted'|'speaker_on'|'speaker_off', callId, userId }
  onCallMedia(callback) {
    return this.subscribeCallListener(this.callMediaListeners, callback);
  }

  // In-call screen share changed on either side. Payload:
  // { type: 'started'|'stopped', callId, userId }
  onCallScreenShare(callback) {
    return this.subscribeCallListener(this.callScreenShareListeners, callback);
  }

  // WebRTC signaling relayed from the peer. Payload:
  // { type: 'offer', callId, offer, from } | { type: 'answer', callId, answer, from }
  // | { type: 'ice', callId, candidate }
  onCallSignal(callback) {
    return this.subscribeCallListener(this.callSignalListeners, callback);
  }

  // Transport health of a live call. Payload:
  // { type: 'reconnecting'|'reconnected'|'disconnected', callId, userId?, reason? }
  onCallConnectionChange(callback) {
    return this.subscribeCallListener(this.callConnectionListeners, callback);
  }

  normalizeGroupCallPayload(payload = {}) {
    const payloadType = String(payload?.type || '').trim().toLowerCase();
    const callType = String(
      payload?.callType || (payloadType === 'group_call' ? '' : payloadType) || 'video'
    ).trim().toLowerCase();

    return {
      ...payload,
      groupCallId: String(payload?.groupCallId || payload?.callId || '').trim(),
      groupId: String(payload?.groupId || payload?.chatId || '').trim(),
      type: callType === 'audio' ? 'audio' : 'video',
      callType: callType === 'audio' ? 'audio' : 'video',
    };
  }

  publishGroupCallEvent(eventType, payload = {}) {
    let normalizedPayload = this.normalizeGroupCallPayload(payload);
    const normalizedGroupCallId = normalizedPayload.groupCallId;

    if (eventType === 'ended') {
      // The backend's group_call_ended broadcast currently contains the call id
      // and duration, but not the group id/type. Preserve the context cached by
      // the preceding invitation/start event before removing the active call so
      // chat consumers can write the completion record into the correct thread.
      const activeCall = Array.from(this.activeGroupCalls.values()).find(
        (call) => call.groupCallId === normalizedPayload.groupCallId
      );
      if (activeCall) {
        normalizedPayload = this.normalizeGroupCallPayload({
          ...activeCall,
          ...payload,
          groupCallId: normalizedPayload.groupCallId,
        });
      }

      this.clearActiveGroupCall(normalizedPayload.groupCallId, { markEnded: true });
    } else if (normalizedPayload.groupId && normalizedPayload.groupCallId) {
      if (this.endedGroupCallIds.has(normalizedGroupCallId)) {
        return normalizedPayload;
      }
      this.activeGroupCalls.set(normalizedPayload.groupId, normalizedPayload);
    }

    this.groupCallListeners.forEach((listener) =>
      listener({ type: eventType, payload: normalizedPayload })
    );
    return normalizedPayload;
  }

  receiveGroupCallInvitation(payload = {}) {
    return this.publishGroupCallEvent('invitation', payload);
  }

  onGroupCallEvent(callback) {
    const unsubscribe = this.subscribeCallListener(this.groupCallListeners, callback);
    if (typeof callback === 'function') {
      this.activeGroupCalls.forEach((call) => {
        callback({ type: 'snapshot', payload: { ...call } });
      });
    }
    return unsubscribe;
  }

  onGroupCallSignal(callback) {
    return this.subscribeCallListener(this.groupCallSignalListeners, callback);
  }

  getActiveGroupCalls() {
    return Array.from(this.activeGroupCalls.values(), (call) => ({ ...call }));
  }

  clearActiveGroupCall(groupCallId, { markEnded = true } = {}) {
    const normalizedGroupCallId = String(groupCallId || '').trim();
    if (!normalizedGroupCallId) return;

    if (markEnded) {
      this.endedGroupCallIds.add(normalizedGroupCallId);
    }
    this.activeGroupCalls.forEach((call, groupId) => {
      if (String(call?.groupCallId || call?.callId || '').trim() === normalizedGroupCallId) {
        this.activeGroupCalls.delete(groupId);
      }
    });
  }

  // A group changed on the backend (membership / info / photo / settings) and
  // was broadcast to the group room. Payload: { type, payload }. Listeners
  // typically re-fetch the group so the change appears without a manual reload.
  onGroupChange(callback) {
    return this.subscribeCallListener(this.groupChangeListeners, callback);
  }

  updateSocketState(nextState) {
    this.socketState = {
      ...this.socketState,
      ...nextState,
    };

    const snapshot = this.getSnapshot();
    this.connectionListeners.forEach((listener) => listener(snapshot));
  }

  emitError(error) {
    const normalizedError =
      error instanceof Error
        ? error
        : createSocketError(String(error?.message || error || 'Socket error'));
    const message = String(normalizedError.message || 'Socket error');

    this.updateSocketState({ lastError: message });
    this.errorListeners.forEach((listener) => listener(normalizedError));
  }

  resetSocketInstance({ disconnect = true, clearJoinedRooms = false } = {}) {
    if (!this.socket) {
      if (clearJoinedRooms) {
        this.joinedRooms.clear();
        this.joinedGroupRooms.clear();
        this.activeGroupCalls.clear();
        this.endedGroupCallIds.clear();
        this.recentIncomingCallKeys.clear();
      }
      if (disconnect) {
        this.onlineUserIds.clear();
        this.hasConnectedOnce = false;
      }
      this.hasRegisteredCurrentUser = false;
      this.registeredUserId = '';
      this.registrationPromise = null;
      return;
    }

    const activeSocket = this.socket;
    this.socket = null;
    this.hasRegisteredCurrentUser = false;
    this.registeredUserId = '';
    this.registrationPromise = null;

    if (clearJoinedRooms) {
      this.joinedRooms.clear();
      this.joinedGroupRooms.clear();
      this.activeGroupCalls.clear();
      this.endedGroupCallIds.clear();
      this.recentIncomingCallKeys.clear();
    }

    if (disconnect) {
      this.onlineUserIds.clear();
      this.hasConnectedOnce = false;
    }

    const manager = activeSocket.io;
    manager?.reconnection?.(false);
    activeSocket.removeAllListeners();

    if (disconnect) {
      activeSocket.disconnect();
      manager?._close?.();
      manager?.engine?.close?.();
      manager?.backoff?.reset?.();
    }

    manager?.removeAllListeners?.();
  }

  resolveReadReceiptKey({ chatId, userId }) {
    const normalizedChatId = String(chatId || '').trim();
    const normalizedUserId = String(userId || '').trim();
    return normalizedChatId && normalizedUserId ? `${normalizedChatId}:${normalizedUserId}` : '';
  }

  flushPendingReadReceipts() {
    if (!this.socket?.connected || !this.pendingReadReceipts.size) {
      return;
    }

    this.pendingReadReceipts.forEach((receipt, key) => {
      this.socket.emit('markAsRead', receipt);
      this.pendingReadReceipts.delete(key);
    });
  }

  rejectActivePendingMessages(error) {
    this.pendingMessages.forEach((record, tempId) => {
      if (!record.wasDispatched) {
        return;
      }

      window.clearTimeout(record.ackTimeoutId);
      window.clearTimeout(record.totalTimeoutId);
      record.reject(error);
      this.pendingMessages.delete(tempId);
    });
  }

  resolvePendingMessage(tempId, payload = {}) {
    const normalizedTempId = String(tempId || payload?.tempId || '').trim();
    if (!normalizedTempId) {
      return null;
    }

    const record = this.pendingMessages.get(normalizedTempId);
    if (!record || record.rejected) {
      return null;
    }

    const normalizedPayload = normalizeSocketAckPayload(payload, normalizedTempId);
    window.clearTimeout(record.ackTimeoutId);
    window.clearTimeout(record.totalTimeoutId);
    this.pendingMessages.delete(normalizedTempId);

    if (!normalizedPayload.success) {
      record.reject(
        createSocketError(
          normalizedPayload.error || 'Message send failed.',
          'SOCKET_MESSAGE_REJECTED'
        )
      );
      return normalizedPayload;
    }

    record.resolve(normalizedPayload);
    return normalizedPayload;
  }

  ensureSocket(session = resolveSession()) {
    const nextSession = {
      token: String(session?.token || '').trim(),
      userId: String(session?.userId || '').trim(),
    };

    if (this.connectionSuspended || !nextSession.token || !nextSession.userId) {
      return null;
    }

    if (
      this.socket &&
      (this.currentSession.userId !== nextSession.userId ||
        this.currentSession.token !== nextSession.token)
    ) {
      this.resetPendingAckTimers();
      this.rejectPendingMessages(
        createSocketError('Socket session changed.', 'SOCKET_SESSION_CHANGED')
      );
      this.pendingReadReceipts.clear();
      this.resetSocketInstance({ disconnect: true, clearJoinedRooms: true });
    }

    this.currentSession = nextSession;

    if (this.socket) {
      this.socket.auth = {
        ...(this.socket.auth || {}),
        token: this.currentSession.token,
      };
      return this.socket;
    }

    const socket = io(resolveSocketUrl(), {
      autoConnect: false,
      transports: ['websocket', 'polling'],
      path: resolveSocketPath(),
      reconnection: false,
      timeout: SOCKET_CONNECT_TIMEOUT_MS,
      auth: {
        token: this.currentSession.token,
      },
    });

    socket.on('connect', () => {
      const recoveredAfterAttempts =
        this.hasConnectedOnce && !this.socketState.isConnected
          ? Math.max(1, Number(this.socketState.reconnectAttempt || 0))
          : 0;

      this.hasConnectedOnce = true;
      this.hasRegisteredCurrentUser = false;
      this.registeredUserId = '';
      this.registrationPromise = null;
      this.updateSocketState({
        isConnected: true,
        status: 'connected',
        socketId: socket.id || '',
        transport: socket.io.engine?.transport?.name || '',
        userId: this.currentSession.userId,
        lastError: '',
        reconnectAttempt: 0,
        reconnectTimeoutAt: 0,
        reconnectRetryAt: 0,
        recoveredAt: recoveredAfterAttempts ? Date.now() : this.socketState.recoveredAt,
        recoveredAfterAttempts,
      });
      this.registerCurrentUser();
      this.rejoinKnownRooms();
      this.flushPendingReadReceipts();
      this.flushPendingMessages();
    });

    socket.on('disconnect', () => {
      this.hasRegisteredCurrentUser = false;
      this.registeredUserId = '';
      this.registrationPromise = null;
      this.resetPendingAckTimers();
      this.updateSocketState({
        isConnected: false,
        status: 'disconnected',
        socketId: '',
        transport: '',
        reconnectAttempt: 0,
        reconnectTimeoutAt: 0,
        reconnectRetryAt: 0,
        recoveredAfterAttempts: 0,
        presenceSyncedAt: 0,
      });
    });

    socket.on('connect_error', (error) => {
      this.resetPendingAckTimers();
      this.updateSocketState({
        isConnected: false,
        status: 'disconnected',
        socketId: '',
        transport: '',
        reconnectAttempt: 0,
        reconnectTimeoutAt: 0,
        reconnectRetryAt: 0,
        recoveredAfterAttempts: 0,
        presenceSyncedAt: 0,
      });
      this.emitError(createSocketError(error?.message || 'Socket connection failed.', 'SOCKET_CONNECT_ERROR'));
    });

    const emitNormalizedMessage = async (message) => {
      const identityCandidate = normalizeSocketMessage(message);
      const now = Date.now();
      this.recentInboundMessageKeys.forEach((timestamp, key) => {
        if (now - timestamp > SOCKET_INBOUND_MESSAGE_DEDUPE_TTL_MS) {
          this.recentInboundMessageKeys.delete(key);
        }
      });
      const identityKeys = getMessageIdentityKeys(identityCandidate).filter(Boolean);
      if (identityKeys.length && identityKeys.some((identityKey) => this.recentInboundMessageKeys.has(identityKey))) {
        return;
      }
      identityKeys.forEach((identityKey) => this.recentInboundMessageKeys.set(identityKey, now));
      const readableMessage = await decryptMessageRecord(message);
      const normalizedMessage = normalizeSocketMessage(readableMessage);
      const groupCallId = String(
        normalizedMessage?.groupCallId || normalizedMessage?.callId || ''
      ).trim();
      const groupId = String(
        normalizedMessage?.groupId || normalizedMessage?.chatId || ''
      ).trim();
      const callStatus = String(normalizedMessage?.callStatus || '').trim().toLowerCase();

      // Group-call start/end records are broadcast through the normal group
      // message room as well as the dedicated call events. Use that existing
      // delivery path as a fallback when a personal-room invitation is missed.
      if (groupCallId && groupId && callStatus === 'started') {
        this.publishGroupCallEvent('started', {
          groupCallId,
          groupId,
          startedBy: normalizedMessage?.senderId || normalizedMessage?.sender || '',
          startedAt:
            normalizedMessage?.createdAt ||
            normalizedMessage?.timestamp ||
            new Date().toISOString(),
          type: /\baudio\b|\bvoice\b/i.test(
            String(normalizedMessage?.content || normalizedMessage?.text || '')
          )
            ? 'audio'
            : 'video',
        });
      } else if (groupCallId && ['ended', 'not_answered'].includes(callStatus)) {
        this.publishGroupCallEvent('ended', { groupCallId, groupId });
      }

      this.messageListeners.forEach((listener) => listener(normalizedMessage));
    };

    const emitPresence = (presenceStatus, payload = {}) => {
      const userId = extractPresenceUserId(payload);
      if (!userId) return;

      const normalizedStatus = normalizePresenceStatus(
        presenceStatus ||
          payload?.status ||
          payload?.presence ||
          payload?.isOnline ||
          payload?.online ||
          payload?.is_online,
        'offline'
      );

      this.updateOnlineUser(userId, normalizedStatus);

      this.presenceListeners.forEach((listener) =>
        listener({
          userId,
          status: normalizedStatus,
          lastSeen:
            payload?.lastSeen ||
            payload?.lastSeenAt ||
            payload?.lastActiveAt ||
            payload?.last_seen ||
            payload?.last_active_at ||
            null,
        })
      );
    };

    const emitPresenceSnapshot = (payload = {}) => {
      const rawUserIds = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.userIds)
          ? payload.userIds
          : Array.isArray(payload?.users)
            ? payload.users
            : [];
      const normalizedUserIds = rawUserIds
        .map((entry) => extractPresenceUserId(entry))
        .filter(Boolean);
      const previousOnlineUserIds = new Set(this.onlineUserIds);
      this.replaceOnlineUsers(normalizedUserIds);
      // The roster is complete now. Publishing it through the connection state
      // re-renders every contact row, so avatars drawn from the placeholder
      // flags before this arrived pick up who is actually online.
      this.updateSocketState({ presenceSyncedAt: Date.now() });

      previousOnlineUserIds.forEach((userId) => {
        if (!this.onlineUserIds.has(userId)) {
          this.presenceListeners.forEach((listener) =>
            listener({
              userId,
              status: 'offline',
              lastSeen: null,
            })
          );
        }
      });

      this.onlineUserIds.forEach((userId) => {
        this.presenceListeners.forEach((listener) =>
          listener({
            userId,
            status: 'online',
            lastSeen: null,
          })
        );
      });
    };

    socket.on('receiveMessage', emitNormalizedMessage);
    socket.on('receiveGroupMessage', emitNormalizedMessage);
    socket.on('group_media_compressed', (payload = {}) => {
      this.groupMediaCompressedListeners.forEach((listener) => listener(payload));
    });
    socket.on('new_message', emitNormalizedMessage);
    socket.on('broadcast_message', (payload = {}) => {
      emitNormalizedMessage({
        ...payload,
        id: payload?.messageId || payload?.id || payload?._id || '',
        _id: payload?.messageId || payload?._id || payload?.id || '',
        senderId: getSocketEntityId(payload?.senderId || payload?.sender),
        receiverId: getSocketEntityId(payload?.receiverId || payload?.receiver),
        type: 'text',
        messageType: 'text',
        content: payload?.content || payload?.message || '',
        timestamp: payload?.createdAt || payload?.timestamp || new Date().toISOString(),
        metadata: {
          ...(payload?.metadata || {}),
          broadcastId: String(payload?.broadcastId || '').trim(),
          isBroadcast: true,
        },
      });
    });

    socket.on('missed_messages', (messages = []) => {
      if (!Array.isArray(messages)) return;

      messages.forEach((message) => {
        emitNormalizedMessage({
          ...message,
          metadata: {
            ...(message?.metadata || {}),
            realtimeSource: SOCKET_REPLAY_MESSAGE_SOURCE,
          },
          __chatterlySocketEvent: SOCKET_REPLAY_MESSAGE_SOURCE,
          isMissedMessageReplay: true,
        });
      });
    });

    socket.on('message_ack', (payload = {}) => {
      const tempId = String(payload?.tempId || '').trim();
      const normalizedPayload = normalizeSocketAckPayload(payload, tempId);
      this.resolvePendingMessage(tempId, normalizedPayload);

      this.messageAckListeners.forEach((listener) => listener(normalizedPayload));
    });

    socket.on('message_delivered', (payload = {}) => {
      const normalizedPayload = {
        ...payload,
        messageId: payload?.messageId ? String(payload.messageId) : '',
      };
      this.messageDeliveredListeners.forEach((listener) => listener(normalizedPayload));
    });

    socket.on('messages_read', (payload = {}) => {
      const normalizedPayload = {
        ...payload,
        chatId: payload?.chatId ? String(payload.chatId) : '',
        messageIds: Array.isArray(payload?.messageIds)
          ? payload.messageIds.map((messageId) => String(messageId))
          : [],
      };
      this.messagesReadListeners.forEach((listener) => listener(normalizedPayload));
    });

    // Realtime message deletion (backend `message_deleted` broadcast). For a
    // "delete for everyone" the backend emits this to the whole conversation
    // room so the recipient updates instantly; "delete for me" is only emitted
    // back to the requesting socket.
    socket.on('message_deleted', (payload = {}) => {
      const normalizedPayload = {
        ...payload,
        messageId: payload?.messageId ? String(payload.messageId) : '',
        type: String(payload?.type || 'everyone').trim().toLowerCase() || 'everyone',
      };
      if (!normalizedPayload.messageId) return;
      this.messageDeletedListeners.forEach((listener) => listener(normalizedPayload));
    });

    const emitMessageReaction = (payload = {}) => {
      const normalizedPayload = normalizeSocketReactionPayload(payload);
      if (!normalizedPayload.messageId && !normalizedPayload.clientMessageId) return;
      this.messageReactionListeners.forEach((listener) => listener(normalizedPayload));
    };

    const emitContactBlockState = (payload = {}, fallbackAction = '') => {
      const source =
        payload?.data && typeof payload.data === 'object' && !Array.isArray(payload.data)
          ? { ...payload, ...payload.data }
          : payload;
      const normalizedAction = String(
        source?.action ||
          source?.type ||
          source?.event ||
          fallbackAction ||
          ''
      ).trim().toLowerCase();
      const action = /\bunblock|unblocked/.test(normalizedAction) ? 'unblock' : 'block';
      const blockerId = getSocketEntityId(
        source?.blockerId ||
          source?.blockedBy ||
          source?.blockedByUser ||
          source?.senderId ||
          source?.sender ||
          source?.actorId ||
          source?.userId ||
          source?.user
      );
      const blockedUserId = getSocketEntityId(
        source?.blockedUserId ||
          source?.blockedId ||
          source?.blockedUser ||
          source?.receiverId ||
          source?.receiver ||
          source?.targetUserId ||
          source?.contactId ||
          source?.contact
      );
      const chatId = String(
        source?.chatId ||
          source?.conversationId ||
          source?.threadId ||
          source?.roomId ||
          ''
      ).trim();

      if (!blockerId && !blockedUserId && !chatId) return;

      this.contactBlockStateListeners.forEach((listener) =>
        listener({
          ...source,
          action,
          chatId,
          blockerId,
          blockedUserId,
          blockerName:
            source?.blockerName ||
            source?.senderName ||
            source?.actorName ||
            source?.name ||
            '',
          timestamp:
            source?.timestamp ||
            source?.createdAt ||
            source?.updatedAt ||
            new Date().toISOString(),
        })
      );
    };

    socket.on('message_reaction', emitMessageReaction);
    socket.on('messageReaction', emitMessageReaction);
    socket.on('message_reacted', emitMessageReaction);
    socket.on('messageReacted', emitMessageReaction);
    socket.on('reaction_updated', emitMessageReaction);
    socket.on('reactionUpdated', emitMessageReaction);

    socket.on('contact_block_state', emitContactBlockState);
    socket.on('contactBlockState', emitContactBlockState);
    socket.on('block_state_updated', emitContactBlockState);
    socket.on('blockStateUpdated', emitContactBlockState);
    socket.on('contact_blocked', (payload = {}) => emitContactBlockState(payload, 'blocked'));
    socket.on('contactBlocked', (payload = {}) => emitContactBlockState(payload, 'blocked'));
    socket.on('user_blocked', (payload = {}) => emitContactBlockState(payload, 'blocked'));
    socket.on('userBlocked', (payload = {}) => emitContactBlockState(payload, 'blocked'));
    socket.on('contact_unblocked', (payload = {}) => emitContactBlockState(payload, 'unblocked'));
    socket.on('contactUnblocked', (payload = {}) => emitContactBlockState(payload, 'unblocked'));
    socket.on('user_unblocked', (payload = {}) => emitContactBlockState(payload, 'unblocked'));
    socket.on('userUnblocked', (payload = {}) => emitContactBlockState(payload, 'unblocked'));

    socket.on('user_online', (payload = {}) => {
      emitPresence('online', payload);
    });

    socket.on('userOnline', (payload = {}) => {
      emitPresence('online', payload);
    });

    socket.on('user_offline', (payload = {}) => {
      emitPresence('offline', payload);
    });

    socket.on('userOffline', (payload = {}) => {
      emitPresence('offline', payload);
    });

    socket.on('presence_update', (payload = {}) => {
      emitPresence(payload?.status || payload?.presence, payload);
    });

    socket.on('presenceUpdate', (payload = {}) => {
      emitPresence(payload?.status || payload?.presence, payload);
    });

    const emitProfileUpdated = (payload = {}) => {
      const userId = String(payload?.userId || payload?._id || payload?.id || '').trim();
      if (!userId) return;

      this.profileUpdatedListeners.forEach((listener) =>
        listener({
          userId,
          name: typeof payload?.name === 'string' ? payload.name : undefined,
          profilePic: typeof payload?.profilePic === 'string' ? payload.profilePic : undefined,
          status: typeof payload?.status === 'string' ? payload.status : undefined,
        })
      );
    };

    socket.on('profile_updated', emitProfileUpdated);
    socket.on('profileUpdated', emitProfileUpdated);

    socket.on('online_users', (payload = {}) => {
      emitPresenceSnapshot(payload);
    });

    socket.on('onlineUsers', (payload = {}) => {
      emitPresenceSnapshot(payload);
    });

    socket.on('userTyping', (payload = {}) => {
      this.typingListeners.forEach((listener) =>
        listener({
          type: 'typing',
          senderId: payload?.sender ? String(payload.sender) : '',
        })
      );
    });

    socket.on('userStopTyping', (payload = {}) => {
      this.typingListeners.forEach((listener) =>
        listener({
          type: 'stop-typing',
          senderId: payload?.sender ? String(payload.sender) : '',
        })
      );
    });

    // Realtime call events — forward each to its listener set. Event names match
    // the server emits in backend/src/sockets/callSocket.js and socketServer.js.
    const fanOutToCallListeners = (listeners, payload) => {
      listeners.forEach((listener) => listener(payload));
    };

    socket.on('call_incoming', (payload = {}) => {
      const callId = String(
        payload?.callId || payload?.id || payload?._id || payload?.requestId || ''
      ).trim();
      const now = Date.now();

      this.recentIncomingCallKeys.forEach((receivedAt, key) => {
        if (now - receivedAt > SOCKET_INCOMING_CALL_DEDUPE_TTL_MS) {
          this.recentIncomingCallKeys.delete(key);
        }
      });

      if (callId && this.recentIncomingCallKeys.has(callId)) {
        return;
      }
      if (callId) {
        this.recentIncomingCallKeys.set(callId, now);
      }

      fanOutToCallListeners(this.incomingCallListeners, payload);
    });
    socket.on('call_status', (payload = {}) =>
      fanOutToCallListeners(this.callStatusListeners, payload)
    );
    socket.on('call_connected', (payload = {}) =>
      fanOutToCallListeners(this.callConnectedListeners, payload)
    );
    socket.on('call_ended', (payload = {}) =>
      fanOutToCallListeners(this.callEndedListeners, payload)
    );
    socket.on('call_missed', (payload = {}) =>
      fanOutToCallListeners(this.callMissedListeners, payload)
    );
    socket.on('call_rejected', (payload = {}) =>
      fanOutToCallListeners(this.callRejectedListeners, payload)
    );
    socket.on('call_cancelled', (payload = {}) =>
      fanOutToCallListeners(this.callCancelledListeners, payload)
    );

    socket.on('call_muted', (payload = {}) =>
      fanOutToCallListeners(this.callMediaListeners, { type: 'muted', ...payload })
    );
    socket.on('call_unmuted', (payload = {}) =>
      fanOutToCallListeners(this.callMediaListeners, { type: 'unmuted', ...payload })
    );
    socket.on('speaker_on', (payload = {}) =>
      fanOutToCallListeners(this.callMediaListeners, { type: 'speaker_on', ...payload })
    );
    socket.on('speaker_off', (payload = {}) =>
      fanOutToCallListeners(this.callMediaListeners, { type: 'speaker_off', ...payload })
    );
    socket.on('call_hold', (payload = {}) =>
      fanOutToCallListeners(this.callMediaListeners, { type: 'held', ...payload })
    );
    socket.on('call_resume', (payload = {}) =>
      fanOutToCallListeners(this.callMediaListeners, { type: 'resumed', ...payload })
    );
    socket.on('call_screen_share_started', (payload = {}) =>
      fanOutToCallListeners(this.callScreenShareListeners, { type: 'started', ...payload })
    );
    socket.on('call_screen_share_stopped', (payload = {}) =>
      fanOutToCallListeners(this.callScreenShareListeners, { type: 'stopped', ...payload })
    );

    socket.on('webrtc_offer', (payload = {}) =>
      fanOutToCallListeners(this.callSignalListeners, { type: 'offer', ...payload })
    );
    socket.on('webrtc_answer', (payload = {}) =>
      fanOutToCallListeners(this.callSignalListeners, { type: 'answer', ...payload })
    );
    socket.on('ice_candidate', (payload = {}) =>
      fanOutToCallListeners(this.callSignalListeners, { type: 'ice', ...payload })
    );

    socket.on('call_reconnecting', (payload = {}) =>
      fanOutToCallListeners(this.callConnectionListeners, { type: 'reconnecting', ...payload })
    );
    socket.on('call_reconnected', (payload = {}) =>
      fanOutToCallListeners(this.callConnectionListeners, { type: 'reconnected', ...payload })
    );
    socket.on('call_disconnected', (payload = {}) =>
      fanOutToCallListeners(this.callConnectionListeners, { type: 'disconnected', ...payload })
    );

    const fanOutGroupCallEvent = (type) => (payload = {}) =>
      this.publishGroupCallEvent(type, payload);

    socket.on('group_call_invitation', fanOutGroupCallEvent('invitation'));
    socket.on('group_call_started', fanOutGroupCallEvent('started'));
    socket.on('group_call_ended', fanOutGroupCallEvent('ended'));
    socket.on('group_call_reconnecting', fanOutGroupCallEvent('reconnecting'));
    socket.on('group_call_user_joined', fanOutGroupCallEvent('user_joined'));
    socket.on('group_call_user_left', fanOutGroupCallEvent('user_left'));
    socket.on('group_webrtc_offer', (payload = {}) =>
      fanOutToCallListeners(this.groupCallSignalListeners, { type: 'offer', ...payload })
    );
    socket.on('group_webrtc_answer', (payload = {}) =>
      fanOutToCallListeners(this.groupCallSignalListeners, { type: 'answer', ...payload })
    );
    socket.on('group_ice_candidate', (payload = {}) =>
      fanOutToCallListeners(this.groupCallSignalListeners, { type: 'ice', ...payload })
    );

    // Group changes the backend broadcasts to the group room (see
    // backend/src/controllers/groupController.js). Each notifies subscribers so
    // they can re-fetch the authoritative group roster/info.
    const fanOutGroupChange = (type) => (payload = {}) => {
      this.groupChangeListeners.forEach((listener) => listener({ type, payload }));
    };
    socket.on('group_participant_added', fanOutGroupChange('participant_added'));
    socket.on('group_participant_removed', fanOutGroupChange('participant_removed'));
    socket.on('group_updated', fanOutGroupChange('updated'));
    socket.on('group_photo_updated', fanOutGroupChange('photo_updated'));
    socket.on('group_settings_updated', fanOutGroupChange('settings_updated'));

    socket.on('error', (payload = {}) => {
      const error = createSocketError(
        String(payload?.message || payload?.error || 'Socket request failed.'),
        'SOCKET_SERVER_ERROR'
      );

      this.rejectActivePendingMessages(error);
      this.emitError(error);
    });

    this.socket = socket;
    return socket;
  }

  connect(options = {}) {
    const storedSession = resolveSession();
    const session = {
      token: String(options?.token ?? storedSession.token ?? '').trim(),
      userId: String(options?.userId ?? storedSession.userId ?? '').trim(),
    };

    if (this.connectionSuspended) {
      const matchesNewStoredSession = Boolean(
        !this.logoutInProgress &&
        storedSession.token &&
        storedSession.userId &&
        session.token === storedSession.token &&
        session.userId === storedSession.userId
      );

      if (!matchesNewStoredSession) {
        this.disconnect();
        return null;
      }

      this.connectionSuspended = false;
    }

    if (!session.token || !session.userId) {
      this.disconnect();
      return null;
    }

    const socket = this.ensureSocket(session);
    if (!socket) return null;

    if (socket.connected) {
      this.updateSocketState({
        isConnected: true,
        status: 'connected',
        socketId: socket.id || '',
        transport: socket.io.engine?.transport?.name || '',
        userId: this.currentSession.userId,
        lastError: '',
        reconnectAttempt: 0,
        reconnectTimeoutAt: 0,
        reconnectRetryAt: 0,
      });
      this.registerCurrentUser();
      this.rejoinKnownRooms();
      this.flushPendingMessages();
      return socket;
    }

    if (!socket.active) {
      this.updateSocketState({
        isConnected: false,
        status: 'connecting',
        userId: this.currentSession.userId,
        reconnectTimeoutAt: Date.now() + SOCKET_CONNECT_TIMEOUT_MS,
        reconnectRetryAt: 0,
      });
    }

    socket.connect();
    return socket;
  }

  disconnect() {
    this.hasConnectedOnce = false;
    this.resetPendingAckTimers();
    this.rejectPendingMessages(createSocketError('Socket disconnected.', 'SOCKET_DISCONNECTED'));
    this.pendingReadReceipts.clear();

    this.resetSocketInstance({ disconnect: true, clearJoinedRooms: true });
    this.currentSession = { token: '', userId: '' };
    this.updateSocketState({
      ...SOCKET_STATE_DEFAULTS,
    });
  }

  suspendForLogout() {
    this.logoutInProgress = true;
    this.connectionSuspended = true;
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('chatterly:logout-start'));
    }
    this.disconnect();
  }

  completeLogout() {
    this.disconnect();
    this.logoutInProgress = false;
    this.connectionSuspended = true;
  }

  registerCurrentUser() {
    if (!this.socket?.connected || !this.currentSession.userId) {
      return Promise.reject(createSocketError('Socket is not connected.', 'SOCKET_DISCONNECTED'));
    }

    if (
      this.hasRegisteredCurrentUser &&
      this.registeredUserId === this.currentSession.userId
    ) {
      return Promise.resolve({ success: true });
    }

    if (this.registrationPromise) {
      return this.registrationPromise;
    }

    this.registrationPromise = new Promise((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        this.registrationPromise = null;
        this.hasRegisteredCurrentUser = false;
        this.registeredUserId = '';
        reject(createSocketError('Socket registration timed out.', 'SOCKET_REGISTER_TIMEOUT'));
      }, SOCKET_ACK_TIMEOUT_MS);

      this.socket.emit('registerUser', this.currentSession.userId, (ack = {}) => {
        window.clearTimeout(timeoutId);
        this.registrationPromise = null;

        if (ack?.success === false) {
          this.hasRegisteredCurrentUser = false;
          this.registeredUserId = '';
          reject(createSocketError(ack.message || ack.error || 'Socket registration failed.', 'SOCKET_REGISTER_REJECTED'));
          return;
        }

        this.hasRegisteredCurrentUser = true;
        this.registeredUserId = this.currentSession.userId;
        resolve(ack || { success: true });
      });
    });

    return this.registrationPromise;
  }

  ensureRegisteredCurrentUser(session = {}) {
    const normalizedSession = {
      token: String(session?.token || '').trim(),
      userId: String(session?.userId || '').trim(),
    };
    const socket = this.connect(
      normalizedSession.userId || normalizedSession.token ? normalizedSession : undefined
    );

    return new Promise((resolve, reject) => {
      let settled = false;
      const timeoutId = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(createSocketError('Socket registration timed out.', 'SOCKET_REGISTER_TIMEOUT'));
      }, SOCKET_CALL_CONNECT_TIMEOUT_MS);

      const finishRegistration = () => {
        this.registerCurrentUser()
          .then((ack) => {
            if (settled) return;
            settled = true;
            window.clearTimeout(timeoutId);
            resolve(ack);
          })
          .catch((error) => {
            if (settled) return;
            settled = true;
            window.clearTimeout(timeoutId);
            reject(error);
          });
      };

      const handleConnect = () => {
        socket?.off?.('connect', handleConnect);
        finishRegistration();
      };

      if (this.socket?.connected) {
        finishRegistration();
        return;
      }

      if (!socket) {
        window.clearTimeout(timeoutId);
        settled = true;
        reject(createSocketError('Socket is not connected.', 'SOCKET_DISCONNECTED'));
        return;
      }

      socket.once('connect', handleConnect);
    });
  }

  buildRoomKey(user1, user2) {
    const comparableIds = [String(user1 || '').trim(), String(user2 || '').trim()]
      .filter(Boolean)
      .sort();

    return comparableIds.length === 2 ? comparableIds.join('_') : '';
  }

  joinChat({ user1, user2 }) {
    const roomKey = this.buildRoomKey(user1, user2);
    if (!roomKey) return;

    this.joinedRooms.add(roomKey);
    this.connect({
      userId: this.currentSession.userId,
      token: this.currentSession.token,
    });

    if (this.socket?.connected) {
      this.socket.emit('joinchat', { user1, user2 });
    }
  }

  joinGroup(groupId) {
    const normalizedGroupId = String(groupId || '').trim();
    if (!normalizedGroupId) return;

    this.joinedGroupRooms.add(normalizedGroupId);
    this.connect({
      userId: this.currentSession.userId,
      token: this.currentSession.token,
    });

    if (this.socket?.connected) {
      this.socket.emit('joinGroup', { groupId: normalizedGroupId });
    }
  }

  leaveGroup(groupId) {
    const normalizedGroupId = String(groupId || '').trim();
    if (!normalizedGroupId) return;

    this.joinedGroupRooms.delete(normalizedGroupId);

    if (this.socket?.connected) {
      this.socket.emit('leaveGroup', { groupId: normalizedGroupId });
    }
  }

  emitMessageReaction({
    messageId,
    clientMessageId = '',
    chatId = '',
    senderId = '',
    receiverId = '',
    emoji = '',
    remove = false,
    reactedAt = '',
  } = {}) {
    const session = resolveSession();
    const normalizedMessageId = String(messageId || '').trim();
    const normalizedClientMessageId = String(clientMessageId || '').trim();
    const normalizedSenderId = String(senderId || session.userId || '').trim();
    const normalizedReceiverId = String(receiverId || '').trim();
    const normalizedEmoji = String(emoji || '').trim();

    if ((!normalizedMessageId && !normalizedClientMessageId) || !normalizedSenderId || !normalizedReceiverId) {
      return Promise.reject(
        createSocketError('Message, sender, and receiver are required to react.', 'SOCKET_REACTION_INVALID')
      );
    }

    this.joinChat({ user1: normalizedSenderId, user2: normalizedReceiverId });

    const payload = {
      messageId: normalizedMessageId,
      clientMessageId: normalizedClientMessageId,
      chatId: String(chatId || '').trim(),
      sender: normalizedSenderId,
      senderId: normalizedSenderId,
      receiver: normalizedReceiverId,
      receiverId: normalizedReceiverId,
      emoji: normalizedEmoji,
      reaction: normalizedEmoji,
      removed: Boolean(remove),
      reactedAt: reactedAt || new Date().toISOString(),
    };

    return new Promise((resolve, reject) => {
      this.connect({ userId: session.userId || normalizedSenderId, token: session.token });

      if (!this.socket?.connected) {
        reject(createSocketError('Socket is not connected.', 'SOCKET_REACTION_DISCONNECTED'));
        return;
      }

      let settled = false;
      const timeoutId = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        resolve({ success: true, timedOut: true });
      }, SOCKET_ACK_TIMEOUT_MS);

      const handleAck = (ack = {}) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        if (ack && ack.success === false) {
          reject(createSocketError(ack?.error || ack?.message || 'Reaction failed.', 'SOCKET_REACTION_REJECTED'));
          return;
        }
        resolve(ack || { success: true });
      };

      this.socket.emit('message_reaction', payload, handleAck);
      this.socket.emit('messageReaction', payload);
    });
  }

  rejoinKnownRooms() {
    if (!this.socket?.connected || (!this.joinedRooms.size && !this.joinedGroupRooms.size)) {
      return;
    }

    this.joinedRooms.forEach((roomKey) => {
      const [user1, user2] = roomKey.split('_');
      if (user1 && user2) {
        this.socket.emit('joinchat', { user1, user2 });
      }
    });

    this.joinedGroupRooms.forEach((groupId) => {
      if (groupId) {
        this.socket.emit('joinGroup', { groupId });
      }
    });
  }

  sendTyping({ senderId, receiverId }) {
    if (!senderId || !receiverId) return;
    this.connect();
    if (this.socket?.connected) {
      this.socket.emit('typing', { sender: senderId, receiver: receiverId });
    }
  }

  stopTyping({ senderId, receiverId }) {
    if (!senderId || !receiverId) return;
    this.connect();
    if (this.socket?.connected) {
      this.socket.emit('stopTyping', { sender: senderId, receiver: receiverId });
    }
  }

  // Notify the conversation room that a message was deleted for everyone. The
  // backend persists `isDeleted` and re-broadcasts `message_deleted` to both
  // participants, which is what lets the recipient update in realtime (the REST
  // delete endpoint does not push anything to the peer).
  deleteMessageForEveryone({ messageId, userId } = {}) {
    const normalizedMessageId = String(messageId || '').trim();
    const normalizedUserId = String(userId || this.currentSession.userId || '').trim();
    if (!normalizedMessageId || !normalizedUserId) return;

    this.connect({
      userId: this.currentSession.userId || normalizedUserId,
      token: this.currentSession.token,
    });
    if (this.socket?.connected) {
      this.socket.emit('deleteMessageForEveryone', {
        messageId: normalizedMessageId,
        userId: normalizedUserId,
      });
    }
  }

  deleteMessageForMe({ messageId, userId } = {}) {
    const normalizedMessageId = String(messageId || '').trim();
    const normalizedUserId = String(userId || this.currentSession.userId || '').trim();
    if (!normalizedMessageId || !normalizedUserId) return;

    this.connect({
      userId: this.currentSession.userId || normalizedUserId,
      token: this.currentSession.token,
    });
    if (this.socket?.connected) {
      this.socket.emit('deleteMessageForMe', {
        messageId: normalizedMessageId,
        userId: normalizedUserId,
      });
    }
  }

  markAsRead({ chatId, userId }) {
    const normalizedChatId = String(chatId || '').trim();
    const normalizedUserId = String(userId || this.currentSession.userId || '').trim();

    if (!normalizedChatId || !normalizedUserId) return;

    const receipt = {
      chatId: normalizedChatId,
      userId: normalizedUserId,
    };
    const receiptKey = this.resolveReadReceiptKey(receipt);
    if (receiptKey) {
      this.pendingReadReceipts.set(receiptKey, receipt);
    }

    this.connect({
      userId: this.currentSession.userId || normalizedUserId,
      token: this.currentSession.token,
    });
    if (this.socket?.connected) {
      this.flushPendingReadReceipts();
    }
  }

  // Emit a client->server call event and resolve with the server's ack. The
  // backend acks every call event with { success, message, ... }; a falsy
  // `success` rejects so callers can surface the reason (busy, offline, ...).
  emitCallEvent(eventName, payload = {}, session = {}, options = {}) {
    return new Promise((resolve, reject) => {
      let settled = false;

      this.ensureRegisteredCurrentUser(session)
        .then(() => {
        if (settled) return;

        // Registration/reconnection and media permission can take time. Check
        // the current roster at emission so an offline attempt creates no call.
        if (eventName === 'call_initiate') {
          if (!this.hasLivePresence()) {
            settled = true;
            reject(createSocketError('Unable to verify call availability. Please try again.', 'SOCKET_CALL_PRESENCE_UNAVAILABLE'));
            return;
          }
          if (!this.isUserOnline(payload.receiverId)) {
            settled = true;
            reject(createSocketError('Cannot place call - user is offline.', 'SOCKET_CALL_RECEIVER_OFFLINE'));
            return;
          }
        }

        // A remote answer can arrive while registration/reconnection is pending.
        // Revalidate locally immediately before dispatching an incoming accept.
        options.beforeEmit?.();
        const ackTimeoutId = window.setTimeout(() => {
          if (settled) return;
          settled = true;
          reject(createSocketError('Call request timed out.', 'SOCKET_CALL_TIMEOUT'));
        }, SOCKET_ACK_TIMEOUT_MS);

        this.socket.emit(eventName, payload, (ack = {}) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(ackTimeoutId);

          if (ack && ack.success === false) {
            const rejection = createSocketError(ack.message || 'Call request failed.', 'SOCKET_CALL_REJECTED');
            // Keep the server's reply: for an offline receiver it still carries
            // the callId of the attempt it logged.
            rejection.ack = ack;
            reject(rejection);
            return;
          }

          resolve(ack || { success: true });
        });
      })
      .catch((error) => {
        if (settled) return;
        settled = true;
        reject(error);
      });
    });
  }

  // Shared helper for the call events whose only argument is the callId.
  emitCallByEvent(eventName, callId) {
    const normalizedCallId = String(callId || '').trim();
    if (!normalizedCallId) {
      return Promise.reject(createSocketError('callId is required.', 'SOCKET_CALL_INVALID'));
    }
    return this.emitCallEvent(eventName, { callId: normalizedCallId });
  }

  // Place a call. Resolves with { success, message, callId, chatId }.
  initiateCall({ receiverId, type = 'audio', userId = '', token = '' } = {}) {
    const normalizedReceiverId = String(receiverId || '').trim();
    if (!normalizedReceiverId) {
      return Promise.reject(
        createSocketError('receiverId is required to start a call.', 'SOCKET_CALL_INVALID')
      );
    }
    return this.emitCallEvent('call_initiate', {
      receiverId: normalizedReceiverId,
      type: type || 'audio',
    }, {
      userId,
      token,
    });
  }

  startGroupCall({ groupId, type = 'video' } = {}) {
    const normalizedGroupId = String(groupId || '').trim();
    if (!normalizedGroupId) {
      return Promise.reject(createSocketError('groupId is required.', 'SOCKET_GROUP_CALL_INVALID'));
    }
    return this.emitCallEvent('group_call_start', {
      groupId: normalizedGroupId,
      type: type === 'audio' ? 'audio' : 'video',
    });
  }

  joinGroupCall({ groupCallId } = {}) {
    const normalizedGroupCallId = String(groupCallId || '').trim();
    if (!normalizedGroupCallId) {
      return Promise.reject(createSocketError('groupCallId is required.', 'SOCKET_GROUP_CALL_INVALID'));
    }
    return this.emitCallEvent('group_call_join', { groupCallId: normalizedGroupCallId });
  }

  leaveGroupCall({ groupCallId } = {}) {
    const normalizedGroupCallId = String(groupCallId || '').trim();
    if (!normalizedGroupCallId) {
      return Promise.reject(createSocketError('groupCallId is required.', 'SOCKET_GROUP_CALL_INVALID'));
    }

    return this.emitCallEvent('group_call_leave', {
      groupCallId: normalizedGroupCallId,
    });
  }

  endGroupCall({ groupCallId } = {}) {
    const normalizedGroupCallId = String(groupCallId || '').trim();
    if (!normalizedGroupCallId) {
      return Promise.reject(createSocketError('groupCallId is required.', 'SOCKET_GROUP_CALL_INVALID'));
    }
    return this.emitCallEvent('group_call_end', { groupCallId: normalizedGroupCallId });
  }

  sendGroupCallOffer({ groupCallId, targetUserId, offer } = {}) {
    const normalizedGroupCallId = String(groupCallId || '').trim();
    const normalizedTargetUserId = String(targetUserId || '').trim();
    if (!normalizedGroupCallId || !normalizedTargetUserId) {
      return Promise.reject(createSocketError('groupCallId and targetUserId are required.', 'SOCKET_GROUP_CALL_INVALID'));
    }
    return this.emitCallEvent('group_webrtc_offer', {
      groupCallId: normalizedGroupCallId,
      targetUserId: normalizedTargetUserId,
      offer,
    });
  }

  sendGroupCallAnswer({ groupCallId, targetUserId, answer } = {}) {
    const normalizedGroupCallId = String(groupCallId || '').trim();
    const normalizedTargetUserId = String(targetUserId || '').trim();
    if (!normalizedGroupCallId || !normalizedTargetUserId) {
      return Promise.reject(createSocketError('groupCallId and targetUserId are required.', 'SOCKET_GROUP_CALL_INVALID'));
    }
    return this.emitCallEvent('group_webrtc_answer', {
      groupCallId: normalizedGroupCallId,
      targetUserId: normalizedTargetUserId,
      answer,
    });
  }

  sendGroupIceCandidate({ groupCallId, targetUserId, candidate } = {}) {
    const normalizedGroupCallId = String(groupCallId || '').trim();
    const normalizedTargetUserId = String(targetUserId || '').trim();
    if (!normalizedGroupCallId || !normalizedTargetUserId) {
      return Promise.reject(createSocketError('groupCallId and targetUserId are required.', 'SOCKET_GROUP_CALL_INVALID'));
    }
    return this.emitCallEvent('group_ice_candidate', {
      groupCallId: normalizedGroupCallId,
      targetUserId: normalizedTargetUserId,
      candidate,
    });
  }

  acceptCall({ callId, beforeEmit } = {}) {
    const normalizedCallId = String(callId || '').trim();
    if (!normalizedCallId) {
      return Promise.reject(createSocketError('callId is required.', 'SOCKET_CALL_INVALID'));
    }
    return this.emitCallEvent('call_accept', { callId: normalizedCallId }, {}, { beforeEmit });
  }

  joinCallRoom({ callId } = {}) {
    return this.emitCallByEvent('call_join_room', callId);
  }

  rejectCall({ callId } = {}) {
    return this.emitCallByEvent('call_reject', callId);
  }

  endCall({ callId } = {}) {
    return this.emitCallByEvent('call_end', callId);
  }

  cancelCall({ callId } = {}) {
    return this.emitCallByEvent('call_cancel', callId);
  }

  setCallMuted({ callId, muted } = {}) {
    return this.emitCallByEvent(muted ? 'call_mute' : 'call_unmute', callId);
  }

  setCallSpeaker({ callId, enabled } = {}) {
    return this.emitCallByEvent(enabled ? 'speaker_on' : 'speaker_off', callId);
  }

  setCallOnHold({ callId, onHold } = {}) {
    return this.emitCallByEvent(onHold ? 'call_hold' : 'call_resume', callId);
  }

  startCallScreenShare({ callId } = {}) {
    return this.emitCallByEvent('call_screen_share_start', callId);
  }

  stopCallScreenShare({ callId } = {}) {
    return this.emitCallByEvent('call_screen_share_stop', callId);
  }

  sendCallOffer({ callId, offer } = {}) {
    const normalizedCallId = String(callId || '').trim();
    if (!normalizedCallId) {
      return Promise.reject(createSocketError('callId is required.', 'SOCKET_CALL_INVALID'));
    }
    return this.emitCallEvent('webrtc_offer', { callId: normalizedCallId, offer });
  }

  sendCallAnswer({ callId, answer } = {}) {
    const normalizedCallId = String(callId || '').trim();
    if (!normalizedCallId) {
      return Promise.reject(createSocketError('callId is required.', 'SOCKET_CALL_INVALID'));
    }
    return this.emitCallEvent('webrtc_answer', { callId: normalizedCallId, answer });
  }

  sendIceCandidate({ callId, candidate } = {}) {
    const normalizedCallId = String(callId || '').trim();
    if (!normalizedCallId) {
      return Promise.reject(createSocketError('callId is required.', 'SOCKET_CALL_INVALID'));
    }
    return this.emitCallEvent('ice_candidate', { callId: normalizedCallId, candidate });
  }

  dispatchPendingMessage(record) {
    if (!this.socket?.connected || !record || record.rejected) {
      return;
    }

    const tempId = String(record.payload.tempId || '').trim();
    if (!tempId) {
      record.reject(createSocketError('Missing client message id.', 'SOCKET_MESSAGE_INVALID'));
      return;
    }

    window.clearTimeout(record.ackTimeoutId);
    record.ackTimeoutId = window.setTimeout(() => {
      this.pendingMessages.delete(tempId);
      record.reject(createSocketError('Message acknowledgement timed out.', 'SOCKET_ACK_TIMEOUT'));
    }, record.ackTimeoutMs);

    record.wasDispatched = true;
    this.socket.emit(record.eventName || 'sendMessage', record.payload, (payload = {}) => {
      const normalizedPayload = this.resolvePendingMessage(tempId, payload);
      if (!normalizedPayload) {
        return;
      }

      this.messageAckListeners.forEach((listener) => listener(normalizedPayload));
    });
  }

  flushPendingMessages() {
    this.pendingMessages.forEach((record) => {
      if (!record.wasDispatched) {
        this.dispatchPendingMessage(record);
      }
    });
  }

  resetPendingAckTimers() {
    this.pendingMessages.forEach((record) => {
      window.clearTimeout(record.ackTimeoutId);
      record.ackTimeoutId = null;
      record.wasDispatched = false;
    });
  }

  rejectPendingMessages(error) {
    this.pendingMessages.forEach((record) => {
      window.clearTimeout(record.ackTimeoutId);
      window.clearTimeout(record.totalTimeoutId);
      record.reject(error);
    });
    this.pendingMessages.clear();
  }

  // Forward an existing message through the backend's dedicated `forwardMessage`
  // event. Unlike re-sending via `sendMessage`, this persists `isForwarded`
  // (and `forwardedFrom`) and re-broadcasts the copy to the recipient, so the
  // "Forwarded" label shows for them too — not just on the sender's optimistic
  // bubble. Resolves with the ack `{ success, messageId }`.
  forwardMessage({ originalMessageId, senderId, receiverId, tempId } = {}) {
    const session = resolveSession();
    const normalizedOriginalId = String(originalMessageId || '').trim();
    const normalizedSenderId = String(senderId || session.userId || '').trim();
    const normalizedReceiverId = String(receiverId || '').trim();
    const normalizedTempId = String(tempId || '').trim();

    if (!normalizedOriginalId || !normalizedSenderId || !normalizedReceiverId) {
      return Promise.reject(
        createSocketError(
          'Original message, sender and receiver are required to forward.',
          'SOCKET_FORWARD_INVALID'
        )
      );
    }

    this.connect({ userId: session.userId, token: session.token });
    if (!this.socket?.connected) {
      return Promise.reject(
        createSocketError('Socket is not connected.', 'SOCKET_FORWARD_DISCONNECTED')
      );
    }

    this.joinChat({ user1: normalizedSenderId, user2: normalizedReceiverId });

    return new Promise((resolve, reject) => {
      let settled = false;
      const timeoutId = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(createSocketError('Forward timed out.', 'SOCKET_FORWARD_TIMEOUT'));
      }, SOCKET_TOTAL_MESSAGE_TIMEOUT_MS);

      this.socket.emit(
        'forwardMessage',
        {
          originalMessageId: normalizedOriginalId,
          sender: normalizedSenderId,
          receiver: normalizedReceiverId,
          tempId: normalizedTempId,
        },
        (ack = {}) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeoutId);
          if (ack && ack.success === false) {
            reject(createSocketError(ack?.error || 'Forward failed.', 'SOCKET_FORWARD_REJECTED'));
            return;
          }
          resolve(ack || {});
        }
      );
    });
  }

  sendMessage(messageContent = {}, options = {}) {
    const session = resolveSession();
    const normalizedMessage = normalizeSocketMessage(messageContent, {
      senderId: messageContent?.senderId || session.userId,
      receiverId: messageContent?.receiverId || null,
      chatId: messageContent?.chatId || null,
      status: 'sending',
    });
    const senderId = String(
      normalizedMessage.senderId || messageContent?.sender || session.userId || ''
    ).trim();
    const receiverId = String(
      normalizedMessage.receiverId || messageContent?.receiver || ''
    ).trim();
    const mediaType = normalizedMessage.type || 'text';
    const content = normalizedMessage.content;
    const mediaUrl =
      normalizedMessage.mediaUrl ||
      resolveMessageMediaUrl(messageContent, normalizedMessage, mediaType);
    const caption = String(normalizedMessage.caption || messageContent?.caption || '').trim();
    const fileName = String(normalizedMessage.fileName || messageContent?.fileName || '').trim();
    const fileContentUrl =
      mediaType === 'file' && typeof content === 'string'
        ? String(content).trim()
        : '';
    const fileUrl = String(
      normalizedMessage.fileUrl ||
        messageContent?.fileUrl ||
        (mediaType === 'file' ? mediaUrl || fileContentUrl : '')
    ).trim();
    const fileSize = Number(normalizedMessage.fileSize || messageContent?.fileSize || 0);
    const audioUrl = String(
      normalizedMessage.audioUrl || messageContent?.audioUrl || (mediaType === 'audio' ? mediaUrl || '' : '')
    ).trim();
    const duration = Number(messageContent?.duration ?? normalizedMessage.duration);
    const normalizedDuration = Number.isFinite(duration) && duration >= 0 ? duration : null;
    const sharedContact = normalizedMessage.sharedContact || messageContent?.sharedContact || null;
    const replyTo = normalizedMessage.replyTo || messageContent?.replyTo || null;
    const metadata = normalizedMessage.metadata || messageContent?.metadata || null;
    const isForwarded = Boolean(normalizedMessage.isForwarded || messageContent?.isForwarded);
    const mimeType = String(
      normalizedMessage.mimeType ||
        messageContent?.mimeType ||
        (typeof content === 'object' ? content?.mimeType || content?.type || '' : '')
    ).trim();
    const tempId = String(
      messageContent?.tempId ||
        messageContent?.clientMessageId ||
        messageContent?.localId ||
        normalizedMessage.clientMessageId ||
        normalizedMessage.localId ||
        normalizedMessage.id ||
        ''
    ).trim();
    const timestamp = normalizedMessage.timestamp || messageContent?.timestamp || new Date().toISOString();
    const ackTimeoutMs = Number(options?.ackTimeoutMs || SOCKET_ACK_TIMEOUT_MS);
    const totalTimeoutMs = Number(options?.timeoutMs || SOCKET_TOTAL_MESSAGE_TIMEOUT_MS);
    const payloadContent =
      mediaType === 'file'
        ? fileUrl || (typeof content === 'string' ? content : '')
        : hasMessageContent(content)
          ? content
          : mediaUrl;

    if (!senderId || !receiverId || !hasMessageContent(payloadContent) || !tempId) {
      return Promise.reject(
        createSocketError('Sender, receiver, message content, and client id are required.', 'SOCKET_MESSAGE_INVALID')
      );
    }

    this.joinChat({ user1: senderId, user2: receiverId });

    return new Promise((resolve, reject) => {
      const payload = {
        sender: senderId,
        receiver: receiverId,
        caption,
        tempId,
        timestamp,
      };
      const normalizedChatId = String(messageContent?.chatId || normalizedMessage.chatId || '').trim();
      const normalizedGroupId = String(
        messageContent?.groupId ||
          normalizedMessage.groupId ||
          normalizedMessage.metadata?.groupId ||
          normalizedMessage.metadata?.group?.groupId ||
          ''
      ).trim();
      const normalizedChatType = String(
        messageContent?.chatType ||
          normalizedMessage.chatType ||
          normalizedMessage.metadata?.chatType ||
          (normalizedGroupId ? 'group' : '')
      ).trim();

      if (normalizedChatId) {
        payload.chatId = normalizedChatId;
      }

      if (normalizedGroupId) {
        payload.groupId = normalizedGroupId;
      }

      if (normalizedChatType) {
        payload.chatType = normalizedChatType;
      }

      if (mediaType === 'text' && typeof payloadContent === 'string') {
        // The one-to-one socket contract persists text from `encryptedContent`.
        // Sending it as `message` makes the server treat an otherwise valid
        // text message as empty, leaving the optimistic bubble unresolved.
        payload.encryptedContent = payloadContent.trim();
      }

      if (mediaType === 'image' || mediaType === 'video') {
        const resolvedMediaUrl =
          mediaUrl || (typeof payloadContent === 'string' ? payloadContent : '');
        payload.mediaType = mediaType;
        payload.mediaUrl = resolvedMediaUrl;
      }

      if (mediaType === 'audio') {
        if (audioUrl) {
          payload.mediaType = 'audio';
          payload.mediaUrl = audioUrl;
        }
        if (normalizedDuration !== null) {
          payload.audioDuration = normalizedDuration;
        }
      }

      if (mediaType === 'file') {
        payload.mediaType = 'file';
        payload.mediaUrl = fileUrl || (typeof payloadContent === 'string' ? payloadContent : '');
      }

      if (sharedContact) {
        payload.sharedContact = sharedContact;
      }

      if (replyTo) {
        // The backend resolves the quoted message with `Message.findById(replyTo)`,
        // so it expects `replyTo` to be the original message id string — not the
        // rich `{ messageId, content, sender }` preview object the UI keeps for
        // local rendering. Sending the object makes the cast/lookup fail and the
        // whole reply send is rejected, so forward only the id here.
        const replyToMessageId =
          typeof replyTo === 'string' || typeof replyTo === 'number'
            ? String(replyTo).trim()
            : String(
                replyTo?.messageId ||
                  replyTo?.id ||
                  replyTo?._id ||
                  ''
              ).trim();
        if (replyToMessageId) {
          payload.replyTo = replyToMessageId;
        }
      }

      if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
        payload.metadata = metadata;
      }

      if (isForwarded) {
        payload.isForwarded = true;
      }

      if (mimeType) {
        payload.mimeType = mimeType;
      }

      if (fileName) {
        payload.fileName = fileName;
      }

      if (fileSize > 0) {
        payload.fileSize = fileSize;
      }

      const record = {
        eventName: 'sendMessage',
        payload,
        ackTimeoutId: null,
        totalTimeoutId: window.setTimeout(() => {
          this.pendingMessages.delete(tempId);
          reject(createSocketError('Socket send timed out.', 'SOCKET_MESSAGE_TIMEOUT'));
        }, totalTimeoutMs),
        ackTimeoutMs,
        wasDispatched: false,
        rejected: false,
        resolve,
        reject: (error) => {
          if (record.rejected) return;
          record.rejected = true;
          window.clearTimeout(record.ackTimeoutId);
          window.clearTimeout(record.totalTimeoutId);
          reject(error);
        },
      };

      this.pendingMessages.set(tempId, record);
      this.connect({ userId: session.userId, token: session.token });
      this.flushPendingMessages();
    });
  }

  sendGroupMessage(messageContent = {}, options = {}) {
    const session = resolveSession();
    const normalizedMessage = normalizeSocketMessage(messageContent, {
      senderId: messageContent?.senderId || session.userId,
      chatId: messageContent?.chatId || messageContent?.groupId || null,
      groupId: messageContent?.groupId || messageContent?.chatId || null,
      chatType: 'group',
      status: 'sending',
    });
    const senderId = String(
      normalizedMessage.senderId || messageContent?.sender || session.userId || ''
    ).trim();
    const groupId = String(
      messageContent?.groupId || normalizedMessage.groupId || normalizedMessage.chatId || ''
    ).trim();
    const mediaType = normalizedMessage.type || 'text';
    const content = normalizedMessage.content;
    const mediaUrl =
      normalizedMessage.mediaUrl ||
      resolveMessageMediaUrl(messageContent, normalizedMessage, mediaType);
    const caption = String(normalizedMessage.caption || messageContent?.caption || '').trim();
    const fileName = String(normalizedMessage.fileName || messageContent?.fileName || '').trim();
    const fileContentUrl =
      mediaType === 'file' && typeof content === 'string'
        ? String(content).trim()
        : '';
    const fileUrl = String(
      normalizedMessage.fileUrl ||
        messageContent?.fileUrl ||
        (mediaType === 'file' ? mediaUrl || fileContentUrl : '')
    ).trim();
    const fileSize = Number(normalizedMessage.fileSize || messageContent?.fileSize || 0);
    const mimeType = String(
      normalizedMessage.mimeType ||
        messageContent?.mimeType ||
        (typeof content === 'object' ? content?.mimeType || content?.type || '' : '')
    ).trim();
    const tempId = String(
      messageContent?.tempId ||
        messageContent?.clientMessageId ||
        messageContent?.localId ||
        normalizedMessage.clientMessageId ||
        normalizedMessage.localId ||
        normalizedMessage.id ||
        ''
    ).trim();
    const payloadContent =
      hasMessageContent(content)
        ? content
        : mediaUrl;

    if (!senderId || !groupId || !hasMessageContent(payloadContent) || !tempId) {
      return Promise.reject(
        createSocketError('Sender, group, message content, and client id are required.', 'SOCKET_MESSAGE_INVALID')
      );
    }

    return new Promise((resolve, reject) => {
      const resolvedGroupMediaUrl =
        mediaType === 'file'
          ? fileUrl || mediaUrl || payloadContent
          : mediaUrl || payloadContent;
      const payload = {
        sender: senderId,
        groupId,
        message: mediaType === 'text' && typeof payloadContent === 'string' ? payloadContent.trim() : '',
        mediaUrl: mediaType !== 'text' ? String(resolvedGroupMediaUrl || '').trim() : '',
        mediaType,
        caption,
        tempId,
      };
      if (mediaType === 'file' && fileUrl) {
        payload.fileUrl = fileUrl;
      }
      if (mimeType) {
        payload.mimeType = mimeType;
      }
      if (fileName) {
        payload.fileName = fileName;
      }
      if (fileSize > 0) {
        payload.fileSize = fileSize;
      }
      const tempKey = tempId;
      const ackTimeoutMs = Number(options?.ackTimeoutMs || SOCKET_ACK_TIMEOUT_MS);
      const totalTimeoutMs = Number(options?.timeoutMs || SOCKET_TOTAL_MESSAGE_TIMEOUT_MS);
      const record = {
        eventName: 'sendGroupMessage',
        payload,
        ackTimeoutId: null,
        totalTimeoutId: window.setTimeout(() => {
          this.pendingMessages.delete(tempKey);
          reject(createSocketError('Socket send timed out.', 'SOCKET_MESSAGE_TIMEOUT'));
        }, totalTimeoutMs),
        ackTimeoutMs,
        wasDispatched: false,
        rejected: false,
        resolve,
        reject: (error) => {
          if (record.rejected) return;
          record.rejected = true;
          window.clearTimeout(record.ackTimeoutId);
          window.clearTimeout(record.totalTimeoutId);
          reject(error);
        },
      };

      this.pendingMessages.set(tempKey, record);
      this.connect({ userId: session.userId, token: session.token });
      this.flushPendingMessages();
    });
  }
}

const socketService =
  globalScope[SOCKET_SERVICE_KEY] instanceof SocketService
    ? globalScope[SOCKET_SERVICE_KEY]
    : new SocketService();

globalScope[SOCKET_SERVICE_KEY] = socketService;

export default socketService;
