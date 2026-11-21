export const CHAT_NOTIFICATION_CLICK_EVENT = 'chatterly:notification-click';
export const LOCAL_CHAT_NOTIFICATION_EVENT = 'chatterly:local-chat-notification';
export const CHAT_NOTIFICATION_RECEIVED_EVENT = 'chatterly:notification-received';
export const GROUP_MEMBERSHIP_SYNC_EVENT = 'chatterly:group-membership-sync';

// Notification preferences can come from the API or older local caches as
// strings. Boolean("false") is true, so normalize the known wire values before
// using them to drive a mute toggle.
export const normalizeNotificationMuted = (value, mutedUntil = null) => {
  let isMuted;

  if (typeof value === 'boolean') {
    isMuted = value;
  } else if (typeof value === 'number') {
    isMuted = value !== 0;
  } else {
    const normalizedValue = String(value ?? '').trim().toLowerCase();
    if (['true', '1', 'yes', 'on', 'muted'].includes(normalizedValue)) {
      isMuted = true;
    } else if (['false', '0', 'no', 'off', 'unmuted', 'active', ''].includes(normalizedValue)) {
      isMuted = false;
    } else {
      isMuted = false;
    }
  }

  if (!isMuted || !mutedUntil) return isMuted;

  const mutedUntilTime = new Date(mutedUntil).getTime();
  return !Number.isFinite(mutedUntilTime) || mutedUntilTime > Date.now();
};
 
export const CHAT_NOTIFICATION_REQUIRED_FIELDS = Object.freeze([
  'id',
  'senderId',
  'senderName',
  'text',
  'timestamp',
]);
 
export const CHAT_NOTIFICATION_FIELDS = Object.freeze([
  'id',
  'chatId',
  'senderId',
  'senderName',
  'message',
  'text',
  'timestamp',
  'createdAt',
]);
 
export const CHAT_NOTIFICATION_SCHEMA = Object.freeze({
  required: CHAT_NOTIFICATION_REQUIRED_FIELDS,
  fields: CHAT_NOTIFICATION_FIELDS,
});

const CHAT_ROUTE_PATTERNS = Object.freeze([
  { type: 'chat', pattern: /^\/chat\/([^/?#]+)\/?$/i },
  { type: 'group', pattern: /^\/groups\/chat\/([^/?#]+)\/?$/i },
  { type: 'broadcast', pattern: /^\/broadcasts\/chat\/([^/?#]+)\/?$/i },
]);
 
const isObjectRecord = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));
 
const hasValidTimestamp = (value) => {
  if (!value) return false;
 
  const parsedDate = new Date(value);
  return !Number.isNaN(parsedDate.getTime());
};
 
const getNestedId = (value) => {
  if (!value) return null;
  if (typeof value === 'string' || typeof value === 'number') return value;
  if (typeof value !== 'object') return null;
  return value.id || value._id || value.userId || null;
};
 
const resolveNotificationText = (notification = {}, fallback = {}) =>
  String(
    notification?.text ||
      notification?.message ||
      notification?.body ||
      fallback?.text ||
      fallback?.message ||
      fallback?.body ||
      ''
  ).trim();
 
const resolveNotificationTimestamp = (notification = {}, fallback = {}) =>
  notification?.timestamp ||
  notification?.createdAt ||
  fallback?.timestamp ||
  fallback?.createdAt ||
  new Date().toISOString();
 
const resolveNotificationChatId = (notification = {}, fallback = {}) =>
  notification?.chatId ||
  notification?.groupId ||
  notification?.chat?.id ||
  notification?.chat?._id ||
  notification?.conversationId ||
  notification?.threadId ||
  fallback?.chatId ||
  fallback?.groupId ||
  fallback?.chat?.id ||
  fallback?.chat?._id ||
  null;
 
const resolveNotificationSenderId = (notification = {}, fallback = {}) => {
  const sender = notification?.sender || fallback?.sender || {};
 
  return String(
    notification?.senderId ||
      getNestedId(sender) ||
      notification?.userId ||
      fallback?.senderId ||
      fallback?.userId ||
      ''
  ).trim();
};
 
const resolveNotificationSenderName = (notification = {}, fallback = {}) => {
  const sender = notification?.sender || fallback?.sender || {};
 
  return (
    String(
      notification?.senderName ||
        sender?.name ||
        notification?.name ||
        fallback?.senderName ||
        sender?.fullName ||
        sender?.username ||
        'Unknown user'
    ).trim() || 'Unknown user'
  );
};
 
const normalizeComparableValue = (value) => {
  if (value === undefined || value === null) return '';
  return String(value).trim();
};

const decodeRouteValue = (value = '') => {
  try {
    return decodeURIComponent(String(value || '').trim());
  } catch {
    return String(value || '').trim();
  }
};

const normalizeChatType = (value = '') => {
  const normalizedValue = String(value || '').trim().toLowerCase();
  if (['group', 'group-chat', 'group_chat'].includes(normalizedValue)) return 'group';
  if (['broadcast', 'broadcast-chat', 'broadcast_chat'].includes(normalizedValue)) return 'broadcast';
  if (['chat', 'direct', 'personal', 'private'].includes(normalizedValue)) return 'chat';
  return '';
};

const getPathname = (locationOrPathname = '') => {
  if (locationOrPathname && typeof locationOrPathname === 'object') {
    return String(locationOrPathname.pathname || '').trim();
  }

  const value = String(locationOrPathname || '').trim();
  if (!value) return '';

  try {
    return new URL(value, 'http://localhost').pathname;
  } catch {
    return value;
  }
};

export const getActiveChatRoute = (locationOrPathname = '') => {
  const pathname = getPathname(locationOrPathname);
  const matchedRoute = CHAT_ROUTE_PATTERNS.find(({ pattern }) => pattern.test(pathname));
  if (!matchedRoute) return null;

  const routeMatch = pathname.match(matchedRoute.pattern);
  const chatId = decodeRouteValue(routeMatch?.[1]);
  return chatId ? { chatId, chatType: matchedRoute.type } : null;
};

const getNotificationTargetRoute = (notification = {}) => {
  const targetUrl =
    notification?.targetUrl ||
    notification?.redir ||
    notification?.redirect ||
    notification?.click_action ||
    notification?.link ||
    '';
  return getActiveChatRoute(targetUrl);
};

/**
 * A message for the conversation already on screen still needs to flow through
 * realtime state so its bubble is rendered, but it must not also create an
 * alert. Keep that decision route-based so leaving the thread (for example for
 * Contacts) immediately restores normal notification behaviour.
 */
export const isNotificationForActiveChat = (notification = {}, locationOrPathname = '') => {
  const activeRoute = getActiveChatRoute(locationOrPathname);
  if (!activeRoute) return false;

  const targetRoute = getNotificationTargetRoute(notification);
  const notificationType = normalizeChatType(
    notification?.chatType ||
      (notification?.isBroadcast ? 'broadcast' : '') ||
      (notification?.isGroup ? 'group' : '') ||
      targetRoute?.chatType ||
      ''
  );

  if (notificationType && notificationType !== activeRoute.chatType) {
    return false;
  }

  const comparableActiveChatId = normalizeComparableValue(activeRoute.chatId);
  const candidateIds = [
    notification?.chatId,
    notification?.groupId,
    notification?.conversationId,
    notification?.threadId,
    notification?.chat?.id,
    notification?.chat?._id,
    targetRoute?.chatId,
  ];

  // Some direct-message socket payloads identify a thread only by the peer.
  // Group sender IDs identify individual members, so they must not participate
  // in the group/broadcast comparison.
  if (activeRoute.chatType === 'chat') {
    candidateIds.push(notification?.senderId);
  }

  return candidateIds
    .map((value) => normalizeComparableValue(decodeRouteValue(value)))
    .filter(Boolean)
    .includes(comparableActiveChatId);
};
 
const normalizeComparableTimestamp = (value) => {
  if (!value) return '';
 
  const parsedDate = new Date(value);
  return Number.isNaN(parsedDate.getTime()) ? String(value).trim() : parsedDate.toISOString();
};
 
const hasInconsistentComparableValues = (values = [], normalizer = normalizeComparableValue) => {
  const normalizedValues = values
    .map((value) => normalizer(value))
    .filter(Boolean);
 
  if (normalizedValues.length <= 1) {
    return false;
  }
 
  return normalizedValues.some((value) => value !== normalizedValues[0]);
};
 
const createNotificationId = (notification = {}, fallback = {}) => {
  const explicitId = notification?.id || notification?._id || fallback?.id;
  if (explicitId) return String(explicitId);
 
  const senderId = resolveNotificationSenderId(notification, fallback) || 'unknown';
  const timestamp = resolveNotificationTimestamp(notification, fallback);
  const message = resolveNotificationText(notification, fallback)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24) || 'message';
 
  return `notification-${senderId}-${timestamp}-${message}`;
};
 
export const normalizeChatNotification = (notification = {}, options = {}) => {
  const fallback = options?.fallback || {};
  const timestamp = resolveNotificationTimestamp(notification, fallback);
  const senderId = resolveNotificationSenderId(notification, fallback);
  const senderName = resolveNotificationSenderName(notification, fallback);
  const message = resolveNotificationText(notification, fallback);
  const chatId = resolveNotificationChatId(notification, fallback);
 
  return {
    ...fallback,
    ...notification,
    id: createNotificationId(notification, fallback),
    chatId: chatId ? String(chatId).trim() : null,
    senderId,
    senderName,
    message,
    text: message,
    timestamp,
    createdAt: timestamp,
  };
};
 
export const validateChatNotificationDataFormat = (notification = {}, options = {}) => {
  if (!isObjectRecord(notification)) {
    return {
      isValid: false,
      errors: ['Notification must be an object.'],
    };
  }
 
  const normalizedNotification = normalizeChatNotification(notification, options);
  const errors = [];
 
  if (!normalizedNotification.id) {
    errors.push('Notification id is required.');
  }
 
  if (!normalizedNotification.senderId) {
    errors.push('Notification sender id is required.');
  }
 
  if (!normalizedNotification.senderName) {
    errors.push('Notification sender name is required.');
  }
 
  if (!normalizedNotification.text) {
    errors.push('Notification message is required.');
  }
 
  if (!normalizedNotification.timestamp) {
    errors.push('Notification timestamp is required.');
  } else if (!hasValidTimestamp(normalizedNotification.timestamp)) {
    errors.push('Notification timestamp must be a valid date.');
  }
 
  if (hasInconsistentComparableValues([notification?.text, notification?.message, notification?.body])) {
    errors.push('Notification text aliases must match.');
  }
 
  if (
    hasInconsistentComparableValues(
      [notification?.timestamp, notification?.createdAt],
      normalizeComparableTimestamp
    )
  ) {
    errors.push('Notification timestamp aliases must match.');
  }
 
  if (
    hasInconsistentComparableValues([
      notification?.senderId,
      getNestedId(notification?.sender),
      notification?.userId,
    ])
  ) {
    errors.push('Notification sender ids must match.');
  }
 
  if (
    hasInconsistentComparableValues([
      notification?.chatId,
      notification?.chat?.id,
      notification?.chat?._id,
      notification?.conversationId,
      notification?.threadId,
    ])
  ) {
    errors.push('Notification chat ids must match.');
  }
 
  return {
    isValid: errors.length === 0,
    errors,
    normalizedNotification,
  };
};
 
// --- Message reactions -------------------------------------------------------
//
// A reaction travels as a hidden control message (`__CHATTERLY_MESSAGE_REACTION__:{json}`)
// and, from web senders, as a push whose body is the readable sentence below.
// Neither the raw control text nor an ad-hoc sentence belongs in a notification:
// the reaction notice always reads `Reacted to your message "😀"` under the
// reactor's name.

export const MESSAGE_REACTION_CONTROL_PREFIX = '__CHATTERLY_MESSAGE_REACTION__:';
export const MESSAGE_REACTION_NOTIFICATION_KIND = 'message-reaction';

const CHAT_MESSAGES_CACHE_KEY = 'chatterly_chat_messages';
const REACTION_NOTIFICATION_TEXT_PATTERN = /^reacted to your message\s+["“](.+)["”]\.?$/i;
// Wording used by earlier builds: "<name> reacted 😀 to your message."
const LEGACY_REACTION_NOTIFICATION_TEXT_PATTERN = /^.{1,120}?\s+reacted\s+(\S+)\s+to your message\.?$/i;

export const buildMessageReactionNotificationText = (emoji = '') =>
  `Reacted to your message "${String(emoji || '').trim()}"`;

export const parseMessageReactionControlText = (value = '') => {
  const normalizedValue = String(value || '').trim();
  if (!normalizedValue.startsWith(MESSAGE_REACTION_CONTROL_PREFIX)) return null;

  try {
    const payload = JSON.parse(normalizedValue.slice(MESSAGE_REACTION_CONTROL_PREFIX.length));
    return isObjectRecord(payload) ? payload : null;
  } catch {
    return null;
  }
};

export const isMessageReactionControlMessage = (message = {}) =>
  String(message?.content || message?.text || message?.message || '')
    .trim()
    .startsWith(MESSAGE_REACTION_CONTROL_PREFIX);

export const getMessageReactionNotificationEmoji = (notification = {}) => {
  const explicitEmoji = String(notification?.emoji || '').trim();
  if (explicitEmoji) return explicitEmoji;

  const text = String(notification?.text || notification?.message || notification?.body || '').trim();
  const match = text.match(REACTION_NOTIFICATION_TEXT_PATTERN) || text.match(LEGACY_REACTION_NOTIFICATION_TEXT_PATTERN);
  return match ? String(match[1] || '').trim() : '';
};

export const isMessageReactionNotification = (notification = {}) => {
  const kind = String(notification?.kind || '').trim().toLowerCase();
  const action = String(notification?.action || '').trim().toLowerCase();
  if (kind === MESSAGE_REACTION_NOTIFICATION_KIND || action === 'message_reaction') return true;

  const text = String(notification?.text || notification?.message || notification?.body || '').trim();
  return text.startsWith(MESSAGE_REACTION_CONTROL_PREFIX) ||
    Boolean(getMessageReactionNotificationEmoji({ text }));
};

// Whether the reacted-to message was written by `userId`, read from the messages
// this browser has stored. `null` means the message is not stored here.
const wasStoredMessageSentByUser = ({ chatId, messageIds, userId }) => {
  try {
    const storedMessages = JSON.parse(localStorage.getItem(CHAT_MESSAGES_CACHE_KEY) || '{}');
    const chatMessages = storedMessages?.[chatId];
    if (!Array.isArray(chatMessages) || !messageIds.length) return null;

    const targetMessage = chatMessages.find((candidate) =>
      [
        candidate?.id,
        candidate?.messageId,
        candidate?._id,
        candidate?.clientMessageId,
        candidate?.localId,
        candidate?.tempId,
      ].some((candidateId) => candidateId && messageIds.includes(String(candidateId).trim()))
    );
    if (!targetMessage) return null;

    return (
      String(targetMessage.senderId || '').trim() === userId ||
      targetMessage.direction === 'sent' ||
      targetMessage.isOwn === true
    );
  } catch {
    return null;
  }
};

// Turns a reaction control message that arrived over the socket into the
// notification to show for it, or `null` when nothing should be shown: removed
// reactions, the user's own reactions, and reactions on messages the user did not
// write. A target that is not stored here is assumed to be the user's own in a
// one-to-one chat (the only other person reacted) and not in a group (every
// member receives the control message, so guessing would notify all of them).
export const buildRealtimeReactionNotification = (message = {}, { userId = '' } = {}) => {
  const payload = parseMessageReactionControlText(message?.content || message?.text || message?.message || '');
  if (!payload) return null;

  const normalizedUserId = String(userId || '').trim();
  const emoji = String(payload.emoji || '').trim();
  const reactorId = String(payload.userId || payload.senderId || message?.senderId || '').trim();
  const chatId = String(payload.groupId || payload.chatId || message?.chatId || '').trim();
  const isGroup = Boolean(payload.groupId) ||
    Boolean(message?.groupId) ||
    String(message?.chatType || '').trim().toLowerCase() === 'group';

  if (payload.remove || payload.removed || !emoji || !reactorId || !chatId) return null;
  if (normalizedUserId && reactorId === normalizedUserId) return null;

  const messageIds = [
    payload.messageId,
    payload.clientMessageId,
    ...(Array.isArray(payload.targetMessageIds) ? payload.targetMessageIds : []),
  ]
    .map((messageId) => String(messageId || '').trim())
    .filter(Boolean);
  const isTargetOwn = wasStoredMessageSentByUser({ chatId, messageIds, userId: normalizedUserId });
  if (isTargetOwn === false || (isTargetOwn === null && isGroup)) return null;

  const timestamp = payload.reactedAt || message?.timestamp || message?.createdAt || new Date().toISOString();
  const text = buildMessageReactionNotificationText(emoji);

  return {
    id: `message-reaction-${reactorId}-${chatId}-${messageIds[0] || 'message'}-${emoji}-${timestamp}`,
    kind: MESSAGE_REACTION_NOTIFICATION_KIND,
    action: 'message_reaction',
    chatId,
    senderId: reactorId,
    senderName: String(message?.senderName || '').trim(),
    message: text,
    text,
    emoji,
    timestamp,
    isGroup,
    chatType: isGroup ? 'group' : 'chat',
    groupId: isGroup ? chatId : '',
  };
};

export const SIMULATED_CHAT_NOTIFICATION = Object.freeze(
  normalizeChatNotification({
    id: 'simulated-chat-notification',
    chatId: 'chat-user2',
    senderId: 'user2',
    senderName: 'Rahul',
    message: 'Hey! Are you free?',
    timestamp: '2026-04-17T09:01:00.000Z',
  })
);
 
export const triggerChatNotificationClick = (notification = SIMULATED_CHAT_NOTIFICATION) => {
  if (typeof window === 'undefined') return;
 
  const { isValid, errors, normalizedNotification } = validateChatNotificationDataFormat(notification);
  if (!isValid) {
    console.warn('Skipping invalid chat notification payload:', errors);
    return;
  }
 
  window.dispatchEvent(
    new CustomEvent(CHAT_NOTIFICATION_CLICK_EVENT, {
      detail: normalizedNotification,
    })
  );
};

export const triggerLocalChatNotification = (notification = {}, options = {}) => {
  if (typeof window === 'undefined') return;

  const { isValid, errors, normalizedNotification } = validateChatNotificationDataFormat(notification, options);
  if (!isValid) {
    console.warn('Skipping invalid local chat notification payload:', errors);
    return;
  }

  window.dispatchEvent(
    new CustomEvent(LOCAL_CHAT_NOTIFICATION_EVENT, {
      detail: normalizedNotification,
    })
  );
};
