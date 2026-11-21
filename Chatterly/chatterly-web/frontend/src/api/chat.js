import { requestCollection, requestEntity, requestPayload } from './client';
import { createMessageId, hasMessageContent, normalizeMessageData, normalizeMessageStatus } from '../utils/message';
import { normalizeProfilePictureValue } from '../utils/profile';
import { hasContactBlockedCurrentUser } from '../utils/blockPrivacy';
import { decryptMessageRecord, decryptMessageRecords, encryptMessageContent } from './encryption';
import { retryTransient } from '../utils/transientRetry';

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;
const PLACEHOLDER_NAME_PATTERN = /^user\s+[a-z0-9]{4,}$/i;
const CHAT_IDENTITY_CACHE_KEY = 'chatterly_chat_identity_cache';
const BLOCKED_CHAT_THREADS_STORAGE_KEY = 'chatterly_blocked_chat_threads';
const CHAT_LIST_REQUEST_TIMEOUT_MS = 20000;
const CHAT_MESSAGES_REQUEST_TIMEOUT_MS = 25000;
const CHAT_PROFILE_LOOKUP_TIMEOUT_MS = 15000;
const CHAT_UPLOAD_BASE_TIMEOUT_MS = 120000;
const CHAT_UPLOAD_MAX_TIMEOUT_MS = 900000;
const CHAT_UPLOAD_TIMEOUT_BYTES_PER_MS = 1024;
const MESSAGE_REACTION_CONTROL_PREFIX = '__CHATTERLY_MESSAGE_REACTION__:';

const resolveUploadRequestTimeout = (fileSize = 0) => {
  const normalizedFileSize = Number(fileSize || 0);
  if (!Number.isFinite(normalizedFileSize) || normalizedFileSize <= 0) {
    return CHAT_UPLOAD_BASE_TIMEOUT_MS;
  }

  return Math.max(
    CHAT_UPLOAD_BASE_TIMEOUT_MS,
    Math.min(CHAT_UPLOAD_MAX_TIMEOUT_MS, CHAT_UPLOAD_BASE_TIMEOUT_MS + Math.ceil(normalizedFileSize / CHAT_UPLOAD_TIMEOUT_BYTES_PER_MS))
  );
};
 
const formatMessageTime = (dateValue) => {
  const date = new Date(dateValue || Date.now());
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};
 
const formatChatListTimestamp = (dateValue) => {
  if (!dateValue) return '';
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '';
 
  const now = new Date();
  const isSameDay =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();
 
  if (isSameDay) return formatMessageTime(date);
  return date.toLocaleDateString([], { day: '2-digit', month: 'short' });
};

const resolveClientTempId = (value, prefix = 'temp') => {
  const normalizedValue = String(value ?? '').trim();
  return normalizedValue || createMessageId(prefix);
};

const appendClientUploadIdentifiers = (formData, uploadId) => {
  const normalizedUploadId = String(uploadId ?? '').trim();
  if (!normalizedUploadId) return;

  // Keep the multipart payload compatible with the message id names already
  // used throughout the frontend while preserving the existing backend API.
  formData.append('tempId', normalizedUploadId);
  formData.append('tempid', normalizedUploadId);
  formData.append('messageId', normalizedUploadId);
  formData.append('clientMessageId', normalizedUploadId);
  formData.append('localId', normalizedUploadId);
};

const resolveReplyToMessageId = (replyTo) => {
  if (!replyTo) return '';
  if (typeof replyTo === 'string' || typeof replyTo === 'number') {
    return String(replyTo).trim();
  }
  if (typeof replyTo !== 'object' || Array.isArray(replyTo)) return '';

  return String(
    replyTo.messageId ||
      replyTo.id ||
      replyTo._id ||
      replyTo.originalMessageId ||
      ''
  ).trim();
};
 
const getCurrentUser = () => {
  try {
    return JSON.parse(localStorage.getItem('user') || 'null');
  } catch (error) {
    console.error('Error parsing current user:', error);
    return null;
  }
};
 
const getCurrentUserId = () => {
  const currentUser = getCurrentUser();
  return currentUser?._id || currentUser?.userId || currentUser?.id || null;
};

const getBlockedChatThreadsStorageUserKey = (user = {}) =>
  String(user?.userId || user?.id || user?._id || 'me').trim() || 'me';

const normalizeStoredBlockedChatThreadIds = (value) => {
  const values = Array.isArray(value)
    ? value
    : value && typeof value === 'object'
      ? Object.values(value).flat()
      : [];

  return new Set(
    values
      .map((chatId) => String(chatId || '').trim())
      .filter(Boolean)
  );
};

const readStoredBlockedChatThreads = (user = {}) => {
  try {
    const parsedValue = JSON.parse(localStorage.getItem(BLOCKED_CHAT_THREADS_STORAGE_KEY) || '{}');
    if (Array.isArray(parsedValue)) {
      return normalizeStoredBlockedChatThreadIds(parsedValue);
    }

    return normalizeStoredBlockedChatThreadIds(
      parsedValue?.[getBlockedChatThreadsStorageUserKey(user)] || []
    );
  } catch {
    return new Set();
  }
};

const isCollectiveChatRecord = (chat = {}) => {
  const recordType = String(chat?.type || chat?.chatType || '').trim().toLowerCase();
  return Boolean(
    chat?.isGroup ||
      chat?.isBroadcast ||
      recordType === 'group' ||
      recordType === 'broadcast' ||
      chat?.groupId ||
      chat?.broadcastId
  );
};
 
const readChatIdentityCache = () => {
  try {
    const parsedValue = JSON.parse(localStorage.getItem(CHAT_IDENTITY_CACHE_KEY) || '{}');
    return parsedValue && typeof parsedValue === 'object' ? parsedValue : {};
  } catch (error) {
    console.error('Error parsing chat identity cache:', error);
    return {};
  }
};
 
const writeChatIdentityCache = (cache) => {
  try {
    localStorage.setItem(CHAT_IDENTITY_CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    console.error('Error writing chat identity cache:', error);
  }
};
 
const getInitials = (name) =>
  String(name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || '?';
 
const combineName = (value) => {
  if (!value || typeof value !== 'object') return '';
  const firstName = String(value.firstName || '').trim();
  const lastName = String(value.lastName || '').trim();
  const fullName = `${firstName} ${lastName}`.trim();
  return fullName || String(value.name || value.fullName || value.username || '').trim();
};
 
const isValidDisplayName = (value) => {
  const normalizedValue = String(value || '').trim();
  if (!normalizedValue) return false;
  if (OBJECT_ID_PATTERN.test(normalizedValue)) return false;
  if (PLACEHOLDER_NAME_PATTERN.test(normalizedValue)) return false;
  if (/^your profile$/i.test(normalizedValue)) return false;
  return !/^unknown user$/i.test(normalizedValue);
};
 
const pickDisplayName = (...values) =>
  values
    .map((value) => String(value || '').trim())
    .find((value) => isValidDisplayName(value)) || '';

const normalizeDisappearingMessageTimer = (...timerCandidates) => {
  for (const timerCandidate of timerCandidates) {
    if (timerCandidate === undefined || timerCandidate === null) continue;
    if (typeof timerCandidate === 'boolean') return timerCandidate ? '24h' : 'off';

    if (typeof timerCandidate === 'object') {
      const nestedTimer = normalizeDisappearingMessageTimer(
        timerCandidate.timer,
        timerCandidate.value,
        timerCandidate.duration,
        timerCandidate.disappearingTimer,
        timerCandidate.disappearingMessages
      );
      if (nestedTimer) return nestedTimer;
      continue;
    }

    const normalizedTimer = String(timerCandidate || '').trim().toLowerCase();
    if (['off', '24h', '7d', '30d'].includes(normalizedTimer)) return normalizedTimer;
    if (['none', 'disabled', 'false', '0'].includes(normalizedTimer)) return 'off';
    if (['24', '1d', '1day', '1 day', '24 hours', '24hour', '24 hour'].includes(normalizedTimer)) return '24h';
    if (['7', '7day', '7 days', '7days', '1w', '1 week', 'week'].includes(normalizedTimer)) return '7d';
    if (['30', '30day', '30 days', '30days', '1m', '1 month', 'month'].includes(normalizedTimer)) return '30d';
  }

  return '';
};

const getComparablePhoneNumber = (value) => String(value || '').replace(/\D/g, '');

const arePhoneNumbersEquivalent = (firstValue, secondValue) => {
  const normalizedFirstValue = getComparablePhoneNumber(firstValue);
  const normalizedSecondValue = getComparablePhoneNumber(secondValue);
  if (!normalizedFirstValue || !normalizedSecondValue) return false;
  return (
    normalizedFirstValue === normalizedSecondValue ||
    normalizedFirstValue.endsWith(normalizedSecondValue.slice(-10)) ||
    normalizedSecondValue.endsWith(normalizedFirstValue.slice(-10))
  );
};

const resolvePhoneNumber = (value = {}) =>
  String(
    value?.phone ||
      value?.mobile ||
      value?.phoneNumber ||
      value?.contactNumber ||
      value?.mobileNumber ||
      value?.user?.phone ||
      value?.user?.mobile ||
      value?.profile?.phone ||
      value?.profile?.mobile ||
      ''
  ).trim();
 
const normalizeChatAvatarValue = (value) => {
  if (!value || typeof value !== 'object') {
    return '';
  }

  return normalizeProfilePictureValue(
    value?.profilePic ?? value?.avatar ?? value?.avatarUrl ?? value?.photo ?? value?.photoURL ?? ''
  );
};

const getProfilePic = (value) => normalizeChatAvatarValue(value);

const hasExplicitProfileImageField = (value) =>
  value && typeof value === 'object' && (
    Object.prototype.hasOwnProperty.call(value, 'profilePic') ||
    Object.prototype.hasOwnProperty.call(value, 'avatar') ||
    Object.prototype.hasOwnProperty.call(value, 'avatarUrl') ||
    Object.prototype.hasOwnProperty.call(value, 'photo') ||
    Object.prototype.hasOwnProperty.call(value, 'photoURL')
  );

const shouldClearProfilePic = (value) =>
  hasExplicitProfileImageField(value) && !normalizeChatAvatarValue(value);
 
const getIdentityCacheKeys = ({ participantId, chatId, phone }) =>
  [
    participantId ? `user:${String(participantId)}` : '',
    chatId ? `chat:${String(chatId)}` : '',
    phone ? `phone:${String(phone)}` : '',
  ].filter(Boolean);
 
const getCachedChatIdentity = ({ participantId, chatId, phone } = {}) => {
  const cache = readChatIdentityCache();
  return getIdentityCacheKeys({ participantId, chatId, phone }).reduce((identity, key) => {
    const cachedValue = cache[key];
    return cachedValue && typeof cachedValue === 'object' ? { ...identity, ...cachedValue } : identity;
  }, {});
};
 
const persistChatIdentity = ({ participantId, chatId, phone, name, profilePic, status, publicKey, clearProfilePic = false } = {}) => {
  const trimmedName = String(name || '').trim();
  const trimmedPhone = String(phone || '').trim();
  const trimmedProfilePic = String(profilePic || '').trim();
  const trimmedStatus = String(status || '').trim();
  const trimmedPublicKey = String(publicKey || '').trim();
  const keys = getIdentityCacheKeys({ participantId, chatId, phone: trimmedPhone });
 
  if (!keys.length) return;
 
  const nextIdentity = {};
  if (isValidDisplayName(trimmedName)) nextIdentity.name = trimmedName;
  if (trimmedPhone) nextIdentity.phone = trimmedPhone;
  if (trimmedProfilePic) nextIdentity.profilePic = trimmedProfilePic;
  if (trimmedStatus) nextIdentity.status = trimmedStatus;
  if (trimmedPublicKey) nextIdentity.publicKey = trimmedPublicKey;
  if (clearProfilePic) nextIdentity.profilePic = '';
 
  if (!Object.keys(nextIdentity).length) return;
 
  const cache = readChatIdentityCache();
  keys.forEach((key) => {
    cache[key] = {
      ...(cache[key] && typeof cache[key] === 'object' ? cache[key] : {}),
      ...nextIdentity,
    };
  });
  writeChatIdentityCache(cache);
};
 
const extractUserId = (value) => {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value.user === 'string') return value.user;
  if (typeof value.receiver === 'string') return value.receiver;
  if (typeof value.receiverId === 'string') return value.receiverId;
  if (typeof value.contactId === 'string') return value.contactId;
  if (typeof value.participantId === 'string') return value.participantId;
  if (value.user && typeof value.user === 'object') return value.user._id || value.user.userId || value.user.id || null;
  if (value.receiver && typeof value.receiver === 'object') return extractUserId(value.receiver);
  if (value.receiverId && typeof value.receiverId === 'object') return extractUserId(value.receiverId);
  if (value.contact && typeof value.contact === 'object') return extractUserId(value.contact);
  if (value.otherUser && typeof value.otherUser === 'object') return extractUserId(value.otherUser);
  return value._id || value.id || value.userId || value.receiverId || null;
};
 
const resolveUserRecord = (value) => {
  if (!value || typeof value !== 'object') return null;
  if (value.user && typeof value.user === 'object') return value.user;
  if (value.receiver && typeof value.receiver === 'object') return resolveUserRecord(value.receiver);
  if (value.receiverId && typeof value.receiverId === 'object') return resolveUserRecord(value.receiverId);
  if (value.contact && typeof value.contact === 'object') return resolveUserRecord(value.contact);
  if (value.otherUser && typeof value.otherUser === 'object') return resolveUserRecord(value.otherUser);
  if (value.sender && typeof value.sender === 'object') return resolveUserRecord(value.sender);
  return value;
};

const isCurrentUserRecord = (value) => {
  const currentUser = getCurrentUser();
  if (!currentUser || !value) return false;

  const currentUserId = currentUser?._id || currentUser?.userId || currentUser?.id || '';
  const valueId = extractUserId(value);
  if (currentUserId && valueId && String(valueId) === String(currentUserId)) {
    return true;
  }

  const valueRecord = resolveUserRecord(value) || value;
  return arePhoneNumbersEquivalent(resolvePhoneNumber(valueRecord), resolvePhoneNumber(currentUser));
};
 
const extractMessageContent = (value) => {
  if (!value) return '';
  if (typeof value === 'string') return OBJECT_ID_PATTERN.test(value) ? '' : value;
  return value.content || value.text || value.message || value.url || value.uri || '';
};

const extractText = (value) => {
  if (!value) return '';
  if (typeof value === 'string') return OBJECT_ID_PATTERN.test(value) ? '' : value;
  return normalizeMessageData(value).text;
};

const isMessageReactionControlText = (value = '') =>
  String(value || '').trim().startsWith(MESSAGE_REACTION_CONTROL_PREFIX);

const parseMessageReactionControlText = (value = '') => {
  const normalizedValue = String(value || '').trim();
  if (!isMessageReactionControlText(normalizedValue)) return null;

  try {
    const payload = JSON.parse(normalizedValue.slice(MESSAGE_REACTION_CONTROL_PREFIX.length));
    return payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : null;
  } catch {
    return null;
  }
};

const getMessageReactionControlPayload = (message = {}) =>
  parseMessageReactionControlText(
    message?.content ||
      message?.text ||
      message?.message ||
      ''
  );

const getTimestampValue = (value) => {
  const timestamp = new Date(value || 0).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
};

const getPreviewTextFromNormalizedMessage = (message = {}) => {
  const directText = String(message?.text || message?.message || '').trim();
  if (directText && !isMessageReactionControlText(directText)) return directText;

  const caption = String(message?.caption || '').trim();
  if (caption) return caption;

  const content = String(message?.content || '').trim();
  if (content && !/^(data:|blob:)/i.test(content) && !isMessageReactionControlText(content)) {
    return content;
  }

  const messageType = String(message?.type || message?.mediaType || '').trim().toLowerCase();
  if (messageType === 'image') return 'Photo';
  if (messageType === 'video') return 'Video';
  if (messageType === 'audio') return 'Voice message';
  if (messageType === 'file') return String(message?.fileName || '').trim() || 'Document';
  return '';
};

const getMessageIdentityValues = (message = {}) =>
  new Set(
    [
      message?.id,
      message?._id,
      message?.messageId,
      message?.clientMessageId,
      message?.tempId,
      message?.localId,
    ]
      .map((value) => String(value || '').trim())
      .filter(Boolean)
  );

const findReactionTargetMessage = (messages = [], payload = {}) => {
  const payloadIds = getMessageIdentityValues({
    id: payload?.messageId,
    messageId: payload?.messageId,
    clientMessageId: payload?.clientMessageId,
    tempId: payload?.tempId,
    localId: payload?.localId,
  });

  if (!payloadIds.size) return null;

  return messages.find((message) => {
    const messageIds = getMessageIdentityValues(message);
    return [...messageIds].some((messageId) => payloadIds.has(messageId));
  }) || null;
};

const buildReactionPreviewText = (payload = {}, targetMessage = null, currentUserId = '') => {
  const emoji = String(payload?.emoji || payload?.reaction || payload?.value || '').trim();
  if (!emoji || payload?.remove || payload?.removed) return '';

  const actorId = String(payload?.userId || payload?.senderId || payload?.reactedBy || '').trim();
  const prefix = actorId && actorId === String(currentUserId || '').trim() ? 'You reacted' : 'Reacted';
  const targetText = getPreviewTextFromNormalizedMessage(targetMessage);
  return targetText ? `${prefix} ${emoji} to ${targetText}` : `${prefix} ${emoji}`;
};

const CHAT_LAST_MESSAGE_RECORD_KEYS = [
  'lastMessage',
  'lastMessageData',
  'latestMessage',
  'latestMessageData',
  'recentMessage',
  'messageData',
  'lastMsg',
  'last_message',
];

const CHAT_LAST_MESSAGE_TEXT_KEYS = [
  'lastMessageText',
  'latestMessageText',
  'recentMessageText',
  'messageText',
  'preview',
  'messagePreview',
  'content',
  'message',
  'caption',
];

const pickChatValue = (chat, keys = []) => {
  if (!chat || typeof chat !== 'object') return null;

  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(chat, key)) {
      const value = chat[key];
      if (value !== undefined && value !== null && value !== '') {
        return value;
      }
    }
  }

  return null;
};

const resolveChatLastMessageRecord = (chat) => {
  const candidate = pickChatValue(chat, CHAT_LAST_MESSAGE_RECORD_KEYS);
  return candidate && typeof candidate === 'object' && !Array.isArray(candidate) ? candidate : null;
};

const resolveChatLastMessageText = (chat, lastMessage) => {
  const candidateValues = [
    lastMessage,
    ...CHAT_LAST_MESSAGE_RECORD_KEYS.map((key) => chat?.[key]),
    ...CHAT_LAST_MESSAGE_TEXT_KEYS.map((key) => chat?.[key]),
  ];

  for (const candidateValue of candidateValues) {
    const extractedText = String(extractText(candidateValue) || '').trim();
    if (extractedText) {
      return extractedText;
    }
  }

  return '';
};

const resolveChatLastMessageTimestamp = (chat, lastMessage, profileData = {}) => {
  const messageTimestamp =
    lastMessage?.createdAt ||
    lastMessage?.updatedAt ||
    lastMessage?.timestamp ||
    lastMessage?.time ||
    null;
  const explicitChatMessageTimestamp = pickChatValue(chat, [
    'lastMessageAt',
    'latestMessageAt',
    'recentMessageAt',
    'timestamp',
    'lastMessageTime',
  ]);
  const fetchedLatestMessageTimestamp =
    profileData?.lastMessageAt ||
    profileData?.lastMessageTime ||
    null;

  // `chat.updatedAt` describes the chat document and can change for reasons
  // unrelated to its latest message. Only use it after message timestamps.
  return (
    messageTimestamp ||
    explicitChatMessageTimestamp ||
    fetchedLatestMessageTimestamp ||
    chat?.updatedAt ||
    chat?.createdAt ||
    null
  );
};

const resolveLatestChatPreviewFromMessages = (messages = [], currentUserId, chatId = '') => {
  const normalizedChatId = String(chatId || '').trim();
  if (!Array.isArray(messages) || !messages.length) {
    return null;
  }

  const normalizedMessages = messages
    .map((message) =>
      normalizeMessageData(
        {
          ...message,
          chatId: message?.chatId || message?.chat?._id || message?.chat?.id || normalizedChatId || null,
        },
        {
          currentUserId,
          fallback: normalizedChatId ? { chatId: normalizedChatId } : {},
        }
      )
    )
    .sort(
      (firstMessage, secondMessage) =>
        new Date(firstMessage.timestamp || firstMessage.createdAt || 0).getTime() -
        new Date(secondMessage.timestamp || secondMessage.createdAt || 0).getTime()
    );

  const visibleMessages = normalizedMessages.filter((message) => !getMessageReactionControlPayload(message));
  const activityPreviews = visibleMessages
    .map((message) => {
      const lastMessageAt = message.timestamp || message.createdAt || message.time || null;
      return {
        lastMessageText: getPreviewTextFromNormalizedMessage(message),
        lastMessageStatus: normalizeMessageStatus(
          message.status,
          message.direction === 'received' ? 'read' : 'sent'
        ),
        lastMessageSenderId: message.senderId || null,
        lastMessageAt,
        lastMessageTime: lastMessageAt,
        updatedAt: lastMessageAt,
      };
    })
    .filter((preview) => String(preview.lastMessageText || '').trim());

  normalizedMessages.forEach((message) => {
    const reactionPayload = getMessageReactionControlPayload(message);
    if (!reactionPayload) return;

    const targetMessage = findReactionTargetMessage(visibleMessages, reactionPayload);
    const reactionText = buildReactionPreviewText(reactionPayload, targetMessage, currentUserId);
    if (!reactionText) return;

    const reactedAt =
      reactionPayload.reactedAt ||
      message.timestamp ||
      message.createdAt ||
      message.time ||
      null;
    activityPreviews.push({
      lastMessageText: reactionText,
      lastMessageStatus: normalizeMessageStatus(message.status, 'sent'),
      lastMessageSenderId: reactionPayload.senderId || reactionPayload.userId || message.senderId || null,
      lastMessageAt: reactedAt,
      lastMessageTime: reactedAt,
      updatedAt: reactedAt,
    });
  });

  return activityPreviews.sort(
    (firstPreview, secondPreview) =>
      getTimestampValue(firstPreview.lastMessageAt || firstPreview.updatedAt || firstPreview.lastMessageTime) -
      getTimestampValue(secondPreview.lastMessageAt || secondPreview.updatedAt || secondPreview.lastMessageTime)
  ).at(-1) || null;
};
 
const getOtherParticipant = (chat, currentUserId) => {
  const directParticipant =
    chat?.otherUser || chat?.otherParticipant || chat?.contact || chat?.user ||
    chat?.receiverId || chat?.receiver || chat?.recipient || chat?.participant || null;

  if (directParticipant && !isCurrentUserRecord(directParticipant)) return directParticipant;

  const participants = Array.isArray(chat?.participants) ? chat.participants : [];
  return (
    participants.find((participant) => {
      const participantId = extractUserId(participant);
      return participantId
        ? String(participantId) !== String(currentUserId) && !isCurrentUserRecord(participant)
        : !isCurrentUserRecord(participant);
    }) || participants[0] || null
  );
};

const hasOwnValue = (value, key) =>
  Boolean(value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, key));

const getCurrentUserParticipant = (chat, currentUserId) => {
  if (!chat || !currentUserId || !Array.isArray(chat.participants)) {
    return null;
  }

  return chat.participants.find((participant) => {
    const nestedUserId = extractUserId(participant?.user);
    const flatId = extractUserId(participant);
    const participantUserId = nestedUserId || flatId;
    return participantUserId && String(participantUserId) === String(currentUserId);
  }) || null;
};

const normalizeUnreadCountValue = (value) => {
  const unreadCount = Number(value);
  return Number.isFinite(unreadCount) && unreadCount > 0 ? unreadCount : 0;
};

const hasExplicitUnreadState = (chat, currentUserId) => {
  if (!chat || typeof chat !== 'object') return false;

  const participant = getCurrentUserParticipant(chat, currentUserId);

  return (
    hasOwnValue(chat, 'unreadCount') ||
    hasOwnValue(chat, 'isUnread') ||
    hasOwnValue(chat, 'markedUnread') ||
    hasOwnValue(chat, 'unreadMessages') ||
    hasOwnValue(chat?.unread, 'count') ||
    hasOwnValue(chat?.unread, 'isUnread') ||
    hasOwnValue(participant, 'unreadCount') ||
    hasOwnValue(participant, 'markedUnread') ||
    hasOwnValue(participant, 'isUnread')
  );
};

const getUnreadCountForCurrentUser = (chat, currentUserId) => {
  const participant = getCurrentUserParticipant(chat, currentUserId);

  if (hasOwnValue(chat, 'unreadCount')) return normalizeUnreadCountValue(chat.unreadCount);
  if (Array.isArray(chat?.unreadMessages)) return chat.unreadMessages.length;
  if (hasOwnValue(chat?.unread, 'count')) return normalizeUnreadCountValue(chat.unread.count);
  if (hasOwnValue(participant, 'unreadCount')) return normalizeUnreadCountValue(participant.unreadCount);

  return 0;
};

/** Whether the current user manually marked this chat unread (participant flag from API). */
const getMarkedUnreadForCurrentUser = (chat, currentUserId) => {
  if (!chat) return false;
  const participant = getCurrentUserParticipant(chat, currentUserId);

  if (participant) {
    return Boolean(participant.markedUnread || participant.isUnread);
  }

  return Boolean(chat.markedUnread || chat.isUnread || chat?.unread?.isUnread);
};
 
const extractNameFromChat = (chat, otherUser) => {
  const chatDirectName =
    chat?.name || chat?.contactName || chat?.receiverName || chat?.participantName ||
    chat?.userName || chat?.title || chat?.displayName || '';
  if (isValidDisplayName(chatDirectName)) return chatDirectName;
 
  const chatCombinedName = combineName(chat);
  if (isValidDisplayName(chatCombinedName)) return chatCombinedName;
 
  const otherUserName =
    otherUser?.name || otherUser?.fullName || otherUser?.username || otherUser?.displayName || combineName(otherUser);
  if (!isCurrentUserRecord(otherUser) && isValidDisplayName(otherUserName)) return otherUserName;
 
  if (chat?.receiver && typeof chat.receiver === 'object' && !isCurrentUserRecord(chat.receiver)) {
    const receiverName =
      chat.receiver.name || chat.receiver.fullName || chat.receiver.username || chat.receiver.displayName || combineName(chat.receiver);
    if (isValidDisplayName(receiverName)) return receiverName;
  }
 
  if (chat?.user && typeof chat.user === 'object' && !isCurrentUserRecord(chat.user)) {
    const userName =
      chat.user.name || chat.user.fullName || chat.user.username || chat.user.displayName || combineName(chat.user);
    if (isValidDisplayName(userName)) return userName;
  }
 
  if (chat?.otherUser && typeof chat.otherUser === 'object' && !isCurrentUserRecord(chat.otherUser)) {
    const otherUserDirectName =
      chat.otherUser.name || chat.otherUser.fullName || chat.otherUser.username || chat.otherUser.displayName || combineName(chat.otherUser);
    if (isValidDisplayName(otherUserDirectName)) return otherUserDirectName;
  }
 
  if (chat?.contact && typeof chat.contact === 'object' && !isCurrentUserRecord(chat.contact)) {
    const contactName =
      chat.contact.name || chat.contact.fullName || chat.contact.username || chat.contact.displayName || combineName(chat.contact);
    if (isValidDisplayName(contactName)) return contactName;
  }
 
  if (Array.isArray(chat?.participants)) {
    const otherParticipant = chat.participants.find((participant) => !isCurrentUserRecord(participant));
    if (otherParticipant) {
      const participantName =
        otherParticipant.name || otherParticipant.fullName || otherParticipant.username || otherParticipant.displayName || combineName(otherParticipant);
      if (isValidDisplayName(participantName)) return participantName;
    }
  }
 
  return '';
};
 
// DEBUG VERSION with extensive logging
const fetchChatUserProfiles = async (chats, options = {}) => {
  const currentUserId = getCurrentUserId();
  console.log('🔍 [fetchChatUserProfiles] Starting with', chats.length, 'chats');
 
  // Get all chat IDs that need profile data
  const chatsNeedingProfiles = chats.filter((chat, index) => {
    const otherParticipant = getOtherParticipant(chat, currentUserId);
    const otherUser = resolveUserRecord(otherParticipant);
    const extractedName = extractNameFromChat(chat, otherUser);
    const chatId = String(chat?._id || chat?.chatId || chat?.id || '');
    const existingPreviewText = resolveChatLastMessageText(chat, resolveChatLastMessageRecord(chat));
   
    console.log(`📋 Chat ${index}:`, {
      chatId,
      extractedName,
      hasValidName: isValidDisplayName(extractedName),
      hasPreviewText: Boolean(existingPreviewText),
      otherUserKeys: otherUser ? Object.keys(otherUser) : null,
      rawChat: chat
    });
   
    return !isValidDisplayName(extractedName) || !existingPreviewText;
  });
 
  console.log('🎯 Chats needing profiles:', chatsNeedingProfiles.length);
 
  if (chatsNeedingProfiles.length === 0) {
    console.log('✅ All chats already have valid names');
    return {};
  }
 
  // Create fetch promises for each chat
  const profilePromises = chatsNeedingProfiles.map(async (chat) => {
    const chatId = String(chat?._id || chat?.chatId || chat?.id || '');
   
    try {
      console.log(`🌐 Fetching messages for chat ${chatId}...`);
     
      // This lookup supplies the row's name and last-message preview and runs once
      // per sign-in, so a transient failure would leave "User 1234 / No messages"
      // on the chat until the app was reloaded.
      const messages = await retryTransient(() => requestCollection(
        {
          method: 'get',
          url: `/api/chats/messages/${chatId}`,
          timeout: CHAT_PROFILE_LOOKUP_TIMEOUT_MS,
          skipGlobalError: true,
          skipGlobalLoading: Boolean(options?.skipGlobalLoading),
        },
        {
          keys: ['messages', 'chatMessages', 'items', 'results', 'data'],
          fallbackMessage: '',
          dedupeKey: `chat-profile-${chatId}`,
        }
      ), { retries: 2, delaysMs: [700, 1800] });
 
      console.log(`📨 Messages for ${chatId}:`, messages?.length || 0, 'messages');
 
      if (!messages || messages.length === 0) {
        console.log(`⚠️ No messages found for chat ${chatId}`);
        return { status: 'fulfilled', value: null, chatId };
      }
 
      const readableMessages = await decryptMessageRecords(messages);
      const message = readableMessages[0] || messages[0];
      console.log(`💬 First message:`, {
        sender: message?.sender,
        receiver: message?.receiver,
        senderKeys: message?.sender ? Object.keys(message.sender) : null,
        receiverKeys: message?.receiver ? Object.keys(message.receiver) : null,
      });
 
      const senderId = extractUserId(message?.sender);
      const receiverId = extractUserId(message?.receiver);
      const isSenderCurrentUser = isCurrentUserRecord(message?.sender);
      const otherUserRecord = isSenderCurrentUser
        ? resolveUserRecord(message?.receiver)
        : resolveUserRecord(message?.sender);
      const latestPreview = resolveLatestChatPreviewFromMessages(readableMessages, currentUserId, chatId);
 
      console.log(`👤 Other user record:`, otherUserRecord);
 
      if (!otherUserRecord && !latestPreview) {
        console.log(`⚠️ No other user record found for chat ${chatId}`);
        return { status: 'fulfilled', value: null, chatId };
      }
 
      const profileData = {
        chatId,
        userId: isSenderCurrentUser ? receiverId : senderId,
        name: otherUserRecord?.name || otherUserRecord?.fullName || otherUserRecord?.username || '',
        profilePic: getProfilePic(otherUserRecord),
        status: otherUserRecord?.status || '',
        phone: resolvePhoneNumber(otherUserRecord),
        clearProfilePic: shouldClearProfilePic(otherUserRecord),
        ...(latestPreview || {}),
      };
 
      console.log(`✅ Profile data for ${chatId}:`, profileData);
 
      return { status: 'fulfilled', value: profileData, chatId };
    } catch (error) {
      console.error(`❌ Error fetching messages for ${chatId}:`, error.message);
      return { status: 'rejected', reason: error.message, chatId };
    }
  });
 
  const results = await Promise.allSettled(profilePromises);
 
  console.log('📊 All results:', results);
 
  const profiles = {};
 
  results.forEach((result) => {
    if (result.status === 'fulfilled' && result.value && result.value.value) {
      const profile = result.value.value;
      if (profile && profile.chatId) {
        profiles[profile.chatId] = profile;
       
        if (profile.userId && (profile.name || profile.profilePic || profile.clearProfilePic)) {
          persistChatIdentity({
            participantId: profile.userId,
            chatId: profile.chatId,
            phone: profile.phone,
            name: profile.name,
            profilePic: profile.profilePic,
            status: profile.status,
            clearProfilePic: profile.clearProfilePic,
          });
        }
      }
    } else if (result.status === 'fulfilled' && result.value?.status === 'rejected' && result.value.chatId) {
      // The lookup itself failed (not "this chat has no messages"). Say so, so the
      // caller knows the row's name/preview are unresolved and worth loading again.
      profiles[result.value.chatId] = { chatId: result.value.chatId, lookupFailed: true };
    }
  });

  console.log('📦 Final profiles map:', profiles);
  return profiles;
};
 
const normalizeChat = (chat, userProfiles = {}) => {
  const currentUser = getCurrentUser();
  const currentUserId = currentUser?._id || currentUser?.userId || currentUser?.id || null;
  const currentUserPhone = resolvePhoneNumber(currentUser);
  const ownBlockedChatIds = readStoredBlockedChatThreads(currentUser);
  const otherParticipant = getOtherParticipant(chat, currentUserId);
  const otherUser = resolveUserRecord(otherParticipant);
  const normalizedChatId = String(chat?._id || chat?.chatId || chat?.id || '');
  const otherParticipantId =
    extractUserId(otherParticipant) ||
    extractUserId(chat?.receiverId) ||
    extractUserId(chat?.contactId) ||
    extractUserId(chat?.userId) ||
    extractUserId(chat?.participantId) ||
    null;
 
  const profileData = userProfiles[normalizedChatId] || {};
  const enrichedOtherUser = { ...otherUser, ...profileData };
   
  const lastMessage = resolveChatLastMessageRecord(chat);
  const resolvedPreviewText =
    resolveChatLastMessageText(chat, lastMessage) || String(profileData?.lastMessageText || '').trim();
   
  const cachedIdentity = getCachedChatIdentity({
    participantId: otherParticipantId,
    chatId: normalizedChatId,
    phone: resolvePhoneNumber(enrichedOtherUser) || resolvePhoneNumber(chat),
  });
  const sanitizedCachedIdentity =
    String(cachedIdentity?.name || '').trim().toLowerCase() === 'your profile' ||
    arePhoneNumbersEquivalent(cachedIdentity?.phone, currentUserPhone)
      ? {}
      : cachedIdentity;
 
  const extractedName = extractNameFromChat(chat, enrichedOtherUser);
  const cachedName = sanitizedCachedIdentity.name || '';
  const profileName = profileData?.name || '';
 
  console.log(`🏷️ Normalizing chat ${normalizedChatId}:`, {
    extractedName,
    profileName,
    cachedName,
    finalName: pickDisplayName(
      extractedName,
      profileName,
      cachedName,
      resolvePhoneNumber(enrichedOtherUser),
      resolvePhoneNumber(chat)
    ) ||
      (otherParticipantId ? `User ${String(otherParticipantId).slice(-4)}` : 'Unknown user')
  });
 
  // BUG_USR_073 FIX: Check stored contacts before falling back to auto-generated name
  const storedContacts = (() => {
    try {
      return JSON.parse(localStorage.getItem('chatterly_synced') || '[]');
    } catch {
      return [];
    }
  })();

  const matchedStoredContact = storedContacts.find((contact) => {
    const contactUserId = String(
      contact?.userId || contact?.receiverId || contact?.contactId ||
      contact?.participantId || contact?.id || contact?._id || ''
    ).trim();
    const contactPhone = String(resolvePhoneNumber(contact)).replace(/\D/g, '');
    const otherUserPhone = String(resolvePhoneNumber(enrichedOtherUser) || resolvePhoneNumber(chat)).replace(/\D/g, '');
    const otherUserIdStr = String(otherParticipantId || '').trim();

    if (
      String(contact?.name || '').trim().toLowerCase() === 'your profile' ||
      (currentUserId && contactUserId === String(currentUserId).trim()) ||
      arePhoneNumbersEquivalent(contactPhone, currentUserPhone)
    ) {
      return false;
    }

    const matchesById = contactUserId && otherUserIdStr && contactUserId === otherUserIdStr;
    const matchesByPhone = contactPhone && otherUserPhone &&
      (contactPhone === otherUserPhone ||
        contactPhone.endsWith(otherUserPhone.slice(-10)) ||
        otherUserPhone.endsWith(contactPhone.slice(-10)));

    return matchesById || matchesByPhone;
  });

  const storedContactName = matchedStoredContact?.name &&
    !/^user\s+[a-z0-9]{4,}$/i.test(matchedStoredContact.name) &&
    !/^unknown user$/i.test(matchedStoredContact.name)
      ? matchedStoredContact.name
      : '';

  const resolvedName =
    pickDisplayName(
      storedContactName,
      extractedName,
      profileName,
      cachedName,
      resolvePhoneNumber(enrichedOtherUser),
      resolvePhoneNumber(chat)
    ) || (otherParticipantId ? `User ${String(otherParticipantId).slice(-4)}` : 'Unknown user');
 
  const lastMessageAt =
    resolveChatLastMessageTimestamp(chat, lastMessage, profileData) ||
    profileData?.updatedAt ||
    null;
  const hasAuthoritativeLastMessageAt = Boolean(
    lastMessage?.createdAt ||
      lastMessage?.updatedAt ||
      lastMessage?.timestamp ||
      lastMessage?.time ||
      profileData?.lastMessageAt ||
      profileData?.lastMessageTime
  );
  const lastMessageSenderId =
    extractUserId(lastMessage?.sender) ||
    extractUserId(lastMessage?.senderId) ||
    extractUserId(lastMessage?.user) ||
    extractUserId(lastMessage?.userId) ||
    extractUserId(chat?.lastMessageSenderId) ||
    profileData?.lastMessageSenderId ||
    null;
 
  const enrichedProfilePic = getProfilePic(enrichedOtherUser);
  const chatProfilePic = getProfilePic(chat);
  const hasUnreadState = hasExplicitUnreadState(chat, currentUserId);
  const unreadCountRaw = getUnreadCountForCurrentUser(chat, currentUserId);
  const manuallyMarkedUnread = getMarkedUnreadForCurrentUser(chat, currentUserId);
  const isBlockedByContact = hasContactBlockedCurrentUser(chat, currentUserId, {
    blockedChatIds: ownBlockedChatIds,
  });
  const disappearingTimer = normalizeDisappearingMessageTimer(
    chat?.disappearingTimer,
    chat?.disappearingMessages,
    chat?.disappearAfter,
    chat?.timer,
    chat?.setting,
    chat?.settings,
    chat?.chatSetting,
    chat?.chatSettings,
    chat?.messageSettings,
    lastMessage?.disappearingTimer,
    lastMessage?.disappearAfter,
    profileData?.disappearingTimer
  );
  const disappearingTimerUpdatedAt =
    chat?.disappearingTimerUpdatedAt ||
    chat?.disappearingMessagesUpdatedAt ||
    chat?.setting?.updatedAt ||
    chat?.settings?.updatedAt ||
    chat?.chatSetting?.updatedAt ||
    chat?.chatSettings?.updatedAt ||
    chat?.messageSettings?.updatedAt ||
    null;
  const normalizedChat = {
    ...chat,
    id: otherParticipantId || normalizedChatId || `chat-${Date.now()}`,
    userId: otherParticipantId || chat?.receiverId || chat?.userId || chat?.contactId || null,
    chatId: normalizedChatId,
    name: resolvedName,
    initials: getInitials(resolvedName),
    phone: resolvePhoneNumber(enrichedOtherUser) || resolvePhoneNumber(chat) || sanitizedCachedIdentity.phone || '',
    profilePic: isBlockedByContact ? '' : (enrichedProfilePic || chatProfilePic || sanitizedCachedIdentity.profilePic || ''),
    status: isBlockedByContact ? '' : (enrichedOtherUser?.status || chat?.status || sanitizedCachedIdentity.status || ''),
    publicKey: enrichedOtherUser?.publicKey || chat?.publicKey || sanitizedCachedIdentity.publicKey || '',
    presence: isBlockedByContact ? '' : (chat?.presence || enrichedOtherUser?.presence || ''),
    presenceLabel: isBlockedByContact ? '' : (chat?.presenceLabel || ''),
    isOnline: isBlockedByContact ? false : Boolean(chat?.isOnline || chat?.online || enrichedOtherUser?.isOnline || enrichedOtherUser?.online),
    online: isBlockedByContact ? false : Boolean(chat?.online || chat?.isOnline || enrichedOtherUser?.online || enrichedOtherUser?.isOnline),
    lastSeen: isBlockedByContact ? null : (chat?.lastSeen || enrichedOtherUser?.lastSeen || null),
    lastSeenAt: isBlockedByContact ? null : (chat?.lastSeenAt || chat?.lastSeen || enrichedOtherUser?.lastSeenAt || enrichedOtherUser?.lastSeen || null),
    isBlockedByContact,
    blockedByContact: isBlockedByContact,
    privacyRestricted: isBlockedByContact,
    // Not persisted: only tells the chat list that this row's name and preview could not be loaded yet.
    _profileLookupFailed: Boolean(profileData?.lookupFailed),
    lastMessageText: resolvedPreviewText,
    lastMessageStatus: normalizeMessageStatus(
      lastMessage?.status || profileData?.lastMessageStatus,
      chat?.lastMessageStatus || profileData?.lastMessageStatus || 'sent'
    ),
    lastMessageSenderId,
    unreadCount: unreadCountRaw,
    isUnread: Boolean(manuallyMarkedUnread || unreadCountRaw > 0),
    isPinned: Boolean(chat?.isPinned ?? chat?.pinned),
    _hasExplicitUnreadState: hasUnreadState,
    lastMessageAt,
    lastMessageTime: formatChatListTimestamp(lastMessageAt),
    updatedAt: lastMessageAt,
    _hasAuthoritativeLastMessageAt: hasAuthoritativeLastMessageAt,
    ...(disappearingTimer ? { disappearingTimer } : {}),
    ...(disappearingTimerUpdatedAt ? { disappearingTimerUpdatedAt } : {}),
  };
 
  if (!isBlockedByContact && (isValidDisplayName(normalizedChat.name) || normalizedChat.profilePic || shouldClearProfilePic(enrichedOtherUser) || shouldClearProfilePic(chat))) {
    persistChatIdentity({
      participantId: normalizedChat.userId,
      chatId: normalizedChat.chatId,
      phone: normalizedChat.phone,
      name: normalizedChat.name,
      profilePic: normalizedChat.profilePic,
      status: normalizedChat.status,
      publicKey: normalizedChat.publicKey,
      clearProfilePic: shouldClearProfilePic(enrichedOtherUser) || shouldClearProfilePic(chat),
    });
  }
 
  return normalizedChat;
};
 
const cacheIdentityFromMessage = (message) => {
  const senderRecord = resolveUserRecord(message?.sender);
  const receiverRecord = resolveUserRecord(message?.receiver);
  const senderId = extractUserId(message?.sender);
  const receiverId = extractUserId(message?.receiver);
  const isSenderCurrentUser = isCurrentUserRecord(message?.sender);
  const participantRecord = isSenderCurrentUser ? receiverRecord : senderRecord;
  const participantId = isSenderCurrentUser ? receiverId : senderId;
  const chatId = String(message?.chatId || message?.chat?._id || message?.chat?.id || '');
 
  persistChatIdentity({
    participantId,
    chatId,
    phone: resolvePhoneNumber(participantRecord),
    name: pickDisplayName(
      combineName(participantRecord),
      participantRecord?.username,
      resolvePhoneNumber(participantRecord)
    ),
    profilePic: getProfilePic(participantRecord),
    status: String(participantRecord?.status || '').trim(),
    publicKey: String(participantRecord?.publicKey || '').trim(),
  });
};
 
const normalizeMessage = (message, currentUserId, fallback = {}) => {
  const senderId = extractUserId(message?.sender);
  const receiverId = extractUserId(message?.receiver);
  const createdAt = message?.createdAt || fallback?.createdAt || new Date().toISOString();
  const resolvedChatId =
    message?.chatId || message?.chat?._id || message?.chat?.id || fallback?.chatId || null;
 
  return normalizeMessageData(
    {
      ...fallback,
      ...message,
      id: message?._id || message?.id,
      chatId: resolvedChatId ? String(resolvedChatId) : null,
      senderId,
      receiverId,
      content: message?.content || extractMessageContent(message),
      status: message?.status || 'sent',
      createdAt,
    },
    {
      currentUserId,
    }
  );
};
 
export const getChatList = async (options = {}) => {
  console.log('🚀 [getChatList] Starting...');
 
  // Right after sign-in this is the request every individual chat depends on; one
  // failed attempt must not leave the list empty for the whole session.
  const chats = await retryTransient(() => requestCollection(
    {
      method: 'get',
      url: '/api/chats/list',
      timeout: CHAT_LIST_REQUEST_TIMEOUT_MS,
      skipGlobalLoading: Boolean(options?.skipGlobalLoading),
      // Background re-loads of a list that failed to appear stay silent.
      skipGlobalError: Boolean(options?.skipGlobalError),
    },
    {
      keys: ['chats', 'chatList', 'items', 'results', 'data'],
      fallbackMessage: 'Failed to load chats.',
      dedupeKey: 'chat-list',
    }
  ), { retries: 2, delaysMs: [800, 2200] });
 
  console.log('📥 Raw chats from API:', chats);
 
  if (!chats || chats.length === 0) return [];
 
  // The backend chat-list response contains direct chats and groups. Groups are
  // loaded through the dedicated group API; treating them as contacts assigns a
  // group id/type to one of the group's members and breaks direct-chat routing.
  const directChats = await Promise.all(
    chats.filter((chat) => !isCollectiveChatRecord(chat)).map(async (chat) => {
      const lastMessage = resolveChatLastMessageRecord(chat);
      if (!lastMessage) return chat;

      // Use the same local decryption as conversation history before reading
      // the list preview. Message IDs still use the existing history lookup.
      const readableLastMessage = await decryptMessageRecord(lastMessage);
      return { ...chat, lastMessage: readableLastMessage };
    })
  );
  const userProfiles = await fetchChatUserProfiles(directChats, {
    skipGlobalLoading: Boolean(options?.skipGlobalLoading),
  });
 
  console.log('👥 User profiles fetched:', userProfiles);
 
  const normalized = directChats
    .map((chat) => ({
      ...normalizeChat(chat, userProfiles),
      type: 'chat',
      chatType: 'chat',
      isGroup: false,
      isBroadcast: false,
    }))
    .sort((firstChat, secondChat) => new Date(secondChat.updatedAt || 0) - new Date(firstChat.updatedAt || 0));
   
  console.log('✅ Final normalized chats:', normalized.map(c => ({ id: c.chatId, name: c.name })));
 
  return normalized;
};

export const pinChatThread = async (chatId) =>
  requestEntity(
    { method: 'post', url: '/api/chats/pin-chat', data: { chatId: assertChatId(chatId) } },
    { fallbackMessage: 'Failed to pin chat.' }
  );

export const unpinChatThread = async (chatId) =>
  requestEntity(
    { method: 'post', url: '/api/chats/unpin-chat', data: { chatId: assertChatId(chatId) } },
    { fallbackMessage: 'Failed to unpin chat.' }
  );

export const markChatUnread = async (chatId) => {
  const normalizedChatId = String(chatId || '').trim();
  if (!normalizedChatId) throw new Error('Chat id is required.');

  return requestEntity(
    {
      method: 'put',
      url: '/api/chats/mark-unread',
      data: { chatId: normalizedChatId },
    },
    {
      fallbackMessage: 'Failed to mark chat as unread.',
    }
  );
};

export const getMessages = async (chatId, options = {}) => {
  const currentUserId = getCurrentUserId();
  const messages = await retryTransient(() => requestCollection(
    {
      method: 'get',
      url: `/api/chats/messages/${chatId}`,
      timeout: CHAT_MESSAGES_REQUEST_TIMEOUT_MS,
      skipGlobalError: true,
      skipGlobalLoading: Boolean(options?.skipGlobalLoading),
      signal: options?.signal,
    },
    {
      keys: ['messages', 'chatMessages', 'items', 'results', 'data'],
      fallbackMessage: 'Failed to load messages.',
      dedupeKey: chatId ? `chat-messages-${chatId}` : '',
    }
  ), { retries: 2, delaysMs: [700, 1800] });
 
  messages.forEach((message) => cacheIdentityFromMessage(message));
  const readableMessages = await decryptMessageRecords(messages);
 
  return readableMessages
    .map((message) =>
      normalizeMessage(message, currentUserId, {
        chatId: String(chatId || ''),
      })
    )
    .sort((firstMessage, secondMessage) => new Date(firstMessage.createdAt) - new Date(secondMessage.createdAt));
};
 
export const startChat = async (receiverId) => {
  const payload = await requestEntity(
    {
      method: 'post',
      url: '/api/chats/start',
      data: { receiverId },
    },
    {
      fallbackMessage: 'Failed to start chat.',
    }
  );
  const data = payload?.data || payload || {};
 
  return {
    chatId: String(data.chatId || payload.chatId || data.chat?._id || payload.chat?._id || ''),
    chat: data.chat || payload.chat || null,
    message: payload.message || '',
    created: Boolean(data.created),
  };
};

export const createGroup = async ({
  groupName,
  description = '',
  participants = [],
} = {}) => {
  const normalizedGroupName = String(groupName || '').trim();
  const participantIds = Array.from(
    new Set(
      (Array.isArray(participants) ? participants : [participants])
        .map((participant) => String(participant || '').trim())
        .filter(Boolean)
    )
  );

  if (!normalizedGroupName) throw new Error('Group name is required.');
  if (participantIds.length < 2) throw new Error('Minimum 2 participants required.');

  const payload = await requestEntity(
    {
      method: 'post',
      url: '/api/group/create',
      skipGlobalError: true,
      data: {
        groupName: normalizedGroupName,
        description,
        participants: participantIds,
      },
    },
    {
      keys: ['data', 'group'],
      fallbackMessage: 'Failed to create group.',
      dedupeKey: `create-group:${normalizedGroupName}:${participantIds.join(',')}`,
    }
  );

  return payload;
};
 
export const sendMessage = async ({
  receiverId,
  text,
  type = 'text',
  content,
  mediaUrl,
  fileUrl = '',
  fileName = '',
  fileSize = 0,
  audioUrl = '',
  duration = null,
  mimeType = '',
  caption = '',
  replyTo = null,
  encryptedContent = '',
  receiverPublicKey = '',
}) => {
  if (!receiverId) throw new Error('Receiver is required to send a message.');
  const currentUserId = getCurrentUserId();
  const normalizedDraft = normalizeMessageData(
    {
      senderId: currentUserId || 'unknown',
      receiverId,
      type,
      content: content ?? text,
      mediaUrl,
      fileUrl,
      fileName,
      fileSize,
      audioUrl: type === 'audio' ? audioUrl || mediaUrl : '',
      caption,
      duration: type === 'audio' ? duration : null,
      mimeType,
      replyTo,
      status: 'sending',
    },
    {
      currentUserId,
    }
  );
  if (!hasMessageContent(normalizedDraft.content)) throw new Error('Message content is required.');

  const replyToMessageId = resolveReplyToMessageId(normalizedDraft.replyTo);
  const wireContent =
    encryptedContent ||
    (normalizedDraft.type === 'text'
      ? await encryptMessageContent({
          plaintext: String(normalizedDraft.content || '').trim(),
          senderId: currentUserId,
          receiverId,
          receiverPublicKey,
        })
      : '');
  const response = await requestEntity(
    {
      method: 'post',
      url: '/api/chats/send',
      timeout: CHAT_MESSAGES_REQUEST_TIMEOUT_MS,
      skipGlobalLoading: true,
      skipGlobalError: true,
      data: {
        receiverId,
        encryptedContent:
          normalizedDraft.type === 'text'
            ? wireContent
            : undefined,
        replyTo: replyToMessageId || undefined,
      },
    },
    {
      keys: ['message', 'chatMessage', 'sentMessage', 'data'],
      fallbackMessage: 'Failed to send message.',
    }
  );
 
  const readableResponse = await decryptMessageRecord(response);
  return normalizeMessage(readableResponse, currentUserId, {
    content: normalizedDraft.content,
  });
};

export const sendMediaUpload = async ({
  receiverId,
  file,
  tempId = '',
  caption = '',
  duration = null,
  waveform = null,
  replyTo = null,
  onUploadProgress,
} = {}) => {
  if (!receiverId) throw new Error('Receiver is required to send media.');
  if (!file) throw new Error('Media file is required.');

  const resolvedTempId = resolveClientTempId(tempId, 'temp-media');
  const formData = new FormData();
  formData.append('receiverId', receiverId);
  appendClientUploadIdentifiers(formData, resolvedTempId);
  formData.append('caption', caption);
  if (replyTo) {
    formData.append('replyTo', JSON.stringify(replyTo));
  }
  if (duration !== null && duration !== undefined) {
    formData.append('duration', String(duration));
  }
  if (Array.isArray(waveform) && waveform.length) {
    formData.append('waveform', JSON.stringify(waveform));
  }
  formData.append('media', file, file.name || 'media');

  return requestEntity(
    {
      method: 'post',
      url: '/api/chats/send-media',
      data: formData,
      timeout: resolveUploadRequestTimeout(file.size),
      // Chat messages already expose upload progress in the conversation.
      // Avoid showing the unrelated app-wide "Loading data" banner as well.
      skipGlobalLoading: true,
      skipGlobalError: true,
      onUploadProgress,
    },
    {
      fallbackMessage: 'Failed to upload media.',
      dedupeKey: `send-media:${receiverId}:${resolvedTempId}`,
    }
  );
};

export const sendGroupMediaUpload = async ({
  groupId,
  file,
  tempId = '',
  caption = '',
  replyTo = null,
  onUploadProgress,
} = {}) => {
  if (!groupId) throw new Error('Group is required to send media.');
  if (!file) throw new Error('Media file is required.');

  const resolvedTempId = resolveClientTempId(tempId, 'temp-group-media');
  const formData = new FormData();
  formData.append('groupId', groupId);
  appendClientUploadIdentifiers(formData, resolvedTempId);
  formData.append('caption', caption);
  if (replyTo) {
    formData.append('replyTo', JSON.stringify(replyTo));
  }
  formData.append('media', file, file.name || 'media');

  return requestEntity(
    {
      method: 'post',
      url: '/api/group/send-media',
      data: formData,
      timeout: resolveUploadRequestTimeout(file.size),
      skipGlobalLoading: true,
      skipGlobalError: true,
      onUploadProgress,
    },
    {
      fallbackMessage: 'Failed to upload media.',
      dedupeKey: `send-group-media:${groupId}:${resolvedTempId}`,
    }
  );
};

export const sendGroupFileUpload = async ({
  groupId,
  file,
  tempId = '',
  caption = '',
  replyTo = null,
  onUploadProgress,
} = {}) => {
  if (!groupId) throw new Error('Group is required to send a file.');
  if (!file) throw new Error('File is required.');

  const resolvedTempId = resolveClientTempId(tempId, 'temp-group-file');
  const formData = new FormData();
  formData.append('groupId', groupId);
  appendClientUploadIdentifiers(formData, resolvedTempId);
  formData.append('caption', caption);
  if (replyTo) {
    formData.append('replyTo', JSON.stringify(replyTo));
  }
  formData.append('file', file, file.name || 'attachment');

  return requestEntity(
    {
      method: 'post',
      url: '/api/group/send-file',
      data: formData,
      timeout: resolveUploadRequestTimeout(file.size),
      onUploadProgress,
    },
    {
      fallbackMessage: 'Failed to upload file.',
      dedupeKey: `send-group-file:${groupId}:${resolvedTempId}`,
    }
  );
};

export const sendFileUpload = async ({
  receiverId,
  file,
  tempId = '',
  replyTo = null,
  onUploadProgress,
} = {}) => {
  if (!receiverId) throw new Error('Receiver is required to send a file.');
  if (!file) throw new Error('File is required.');

  const resolvedTempId = resolveClientTempId(tempId, 'temp-file');
  const formData = new FormData();
  formData.append('receiverId', receiverId);
  appendClientUploadIdentifiers(formData, resolvedTempId);
  if (replyTo) {
    formData.append('replyTo', JSON.stringify(replyTo));
  }
  formData.append('file', file, file.name || 'attachment');

  return requestEntity(
    {
      method: 'post',
      url: '/api/chats/send-file',
      data: formData,
      timeout: resolveUploadRequestTimeout(file.size),
      onUploadProgress,
    },
    {
      fallbackMessage: 'Failed to upload file.',
      dedupeKey: `send-file:${receiverId}:${resolvedTempId}`,
    }
  );
};

export const saveFcmToken = async (userId, fcmToken) => {
  if (!userId || !fcmToken) return;
  try {
    await requestEntity(
      {
        method: 'post',
        url: '/api/chats/save-token',
        data: { userId, fcmToken },
      },
      {
        fallbackMessage: 'Failed to save FCM token.',
      }
    );
    if (!import.meta.env.DEV) return;
    console.log("✅ FCM Token successfully saved to backend!");
  } catch (error) {
    console.error('Error saving FCM token to backend:', error);
  }
};
 
// ── Chat actions (REST) ──────────────────────────────────────────────────────
// Thin clients for the remaining documented chat endpoints (see docs/api.md).
// Each maps 1:1 to a route in backend/src/routes/chatRoutes.js.

const assertChatId = (value, label = 'Chat id') => {
  const normalized = String(value || '').trim();
  if (!normalized) throw new Error(`${label} is required.`);
  return normalized;
};

export const archiveChat = async (chatId) =>
  requestEntity(
    { method: 'post', url: '/api/chats/archive', data: { chatId: assertChatId(chatId) } },
    { fallbackMessage: 'Failed to archive chat.' }
  );

export const unarchiveChat = async (chatId) =>
  requestEntity(
    { method: 'post', url: '/api/chats/unarchive', data: { chatId: assertChatId(chatId) } },
    { fallbackMessage: 'Failed to unarchive chat.' }
  );

export const blockChat = async (blockedUserId) =>
  requestEntity(
    { method: 'post', url: '/api/block/blocked', data: { blockedUserId: assertChatId(blockedUserId, 'Blocked user id') } },
    { fallbackMessage: 'Failed to block user.' }
  );

export const unblockChat = async (blockedUserId) =>
  requestEntity(
    { method: 'post', url: '/api/block/unblock', data: { blockedUserId: assertChatId(blockedUserId, 'Blocked user id') } },
    { fallbackMessage: 'Failed to unblock user.' }
  );

export const getBlockedUsers = async () =>
  requestCollection(
    { method: 'get', url: '/api/block/blocked-users', skipGlobalLoading: true, skipGlobalError: true },
    { keys: ['blockedUsers', 'data'], fallbackMessage: 'Failed to load blocked users.', dedupeKey: 'blocked-users' }
  );

export const searchContacts = async (query) =>
  requestCollection(
    {
      method: 'get',
      url: '/api/chats/contacts/search',
      params: { q: String(query || '').trim() },
      skipGlobalError: true,
    },
    { keys: ['data', 'results', 'users'], fallbackMessage: 'Failed to search contacts.' }
  );

export const deleteMessageForMe = async (messageId) =>
  requestEntity(
    { method: 'post', url: '/api/chats/message/delete/me', data: { messageId: assertChatId(messageId, 'Message id') } },
    { fallbackMessage: 'Failed to delete message.' }
  );

export const deleteMessageForEveryone = async (messageId) =>
  requestEntity(
    { method: 'post', url: '/api/chats/message/delete/everyone', data: { messageId: assertChatId(messageId, 'Message id') } },
    { fallbackMessage: 'Failed to delete message for everyone.' }
  );

export const deleteChat = async (chatId) =>
  requestEntity(
    { method: 'post', url: '/api/chats/delete', data: { chatId: assertChatId(chatId) } },
    { fallbackMessage: 'Failed to delete chat.' }
  );

export const getChatFiles = async (chatId) =>
  requestCollection(
    { method: 'get', url: `/api/chats/files/${assertChatId(chatId)}` },
    { keys: ['data', 'files'], fallbackMessage: 'Failed to load shared files.', dedupeKey: `chat-files-${chatId}` }
  );

export const getDownloadUrl = async (messageId, options = {}) => {
  const payload = await requestPayload(
    {
      method: 'get',
      url: `/api/chats/download/${assertChatId(messageId, 'Message id')}`,
      skipGlobalLoading: Boolean(options?.skipGlobalLoading),
      skipGlobalError: Boolean(options?.skipGlobalError),
    },
    { fallbackMessage: 'Failed to generate download link.' }
  );
  const downloadUrl = payload?.downloadUrl || payload?.url || '';
  if (options?.includeMetadata) {
    return {
      ...payload,
      downloadUrl,
      url: payload?.url || downloadUrl,
    };
  }
  return downloadUrl;
};

export const getUserProfileView = async (userId, options = {}) =>
  requestEntity(
    {
      method: 'get',
      url: `/api/chats/profile/${assertChatId(userId, 'User id')}`,
      skipGlobalLoading: Boolean(options?.skipGlobalLoading),
      skipGlobalError: Boolean(options?.skipGlobalError),
    },
    { keys: ['data'], fallbackMessage: 'Failed to load profile.', dedupeKey: `chat-profile-view-${userId}` }
  );

export const getSharedMedia = async (userId) =>
  requestCollection(
    { method: 'get', url: `/api/chats/profile/${assertChatId(userId, 'User id')}/media` },
    { keys: ['data', 'media'], fallbackMessage: 'Failed to load shared media.', dedupeKey: `chat-media-${userId}` }
  );

export const getSharedLinks = async (userId) =>
  requestCollection(
    { method: 'get', url: `/api/chats/profile/${assertChatId(userId, 'User id')}/link` },
    { keys: ['data', 'links'], fallbackMessage: 'Failed to load shared links.', dedupeKey: `chat-links-${userId}` }
  );

export const forwardMessage = async ({ originalMessageId, receiverId } = {}) =>
  requestEntity(
    {
      method: 'post',
      url: '/api/chats/forward',
      data: {
        originalMessageId: assertChatId(originalMessageId, 'Message id'),
        receiverId: assertChatId(receiverId, 'Receiver id'),
      },
    },
    { keys: ['data'], fallbackMessage: 'Failed to forward message.' }
  );

export const pinMessage = async (messageId) =>
  requestEntity(
    { method: 'post', url: '/api/chats/pin', data: { messageId: assertChatId(messageId, 'Message id') } },
    { fallbackMessage: 'Failed to pin message.' }
  );

export const unpinMessage = async (messageId) =>
  requestEntity(
    { method: 'post', url: '/api/chats/unpin', data: { messageId: assertChatId(messageId, 'Message id') } },
    { fallbackMessage: 'Failed to unpin message.' }
  );

export const getPinnedMessages = async (chatId, options = {}) =>
  requestCollection(
    {
      method: 'get',
      url: `/api/chats/pinned/${assertChatId(chatId)}`,
      skipGlobalLoading: Boolean(options?.skipGlobalLoading),
      skipGlobalError: Boolean(options?.skipGlobalError),
    },
    {
      keys: ['data', 'messages', 'pinnedMessages', 'pins'],
      fallbackMessage: 'Failed to load pinned messages.',
      dedupeKey: `chat-pinned-${chatId}`,
    }
  );

export const markChatRead = async (chatId) =>
  requestEntity(
    {
      method: 'post',
      url: '/api/chats/mark-read',
      data: { chatId: assertChatId(chatId) },
      skipGlobalLoading: true,
      skipGlobalError: true,
    },
    { fallbackMessage: 'Failed to mark chat as read.' }
  );

export const setDisappearingMessageTimer = async ({ senderId, receiverId, timer } = {}) => {
  const normalizedTimer = String(timer || '').trim();
  if (!['off', '24h', '7d', '30d'].includes(normalizedTimer)) {
    throw new Error('Choose a valid disappearing message duration.');
  }

  return requestEntity(
    {
      method: 'post',
      url: '/api/chats/set-disappearing-timer',
      data: {
        sender: assertChatId(senderId, 'Sender id'),
        receiver: assertChatId(receiverId, 'Receiver id'),
        timer: normalizedTimer,
      },
    },
    { keys: ['setting', 'data'], fallbackMessage: 'Failed to update disappearing messages.' }
  );
};

export const reportUser = async ({ reporterId, reportedUserId, reason, description = '' } = {}) =>
  requestEntity(
    {
      method: 'post',
      url: '/api/report/report-user',
      data: {
        reporterId: assertChatId(reporterId, 'Reporter id'),
        reportedUserId: assertChatId(reportedUserId, 'Reported user id'),
        reason: String(reason || '').trim(),
        description: String(description || '').trim(),
      },
    },
    { keys: ['report', 'data'], fallbackMessage: 'Failed to submit report.' }
  );

export const reportGroup = async ({ reporterId, reportedGroupId, reason, description = '' } = {}) =>
  requestEntity(
    {
      method: 'post',
      url: '/api/report/report-group',
      data: {
        reporterId: assertChatId(reporterId, 'Reporter id'),
        reportedGroupId: assertChatId(reportedGroupId, 'Reported group id'),
        reason: String(reason || '').trim(),
        description: String(description || '').trim(),
      },
    },
    { keys: ['report', 'data'], fallbackMessage: 'Failed to submit group report.' }
  );

export const notifyUser = async ({ receiverId, senderId, body, redir = '', ...metadata } = {}) =>
  requestEntity(
    {
      method: 'post',
      url: '/api/chats/notify',
      skipGlobalLoading: true,
      skipGlobalError: true,
      data: {
        receiverId: assertChatId(receiverId, 'Receiver id'),
        senderId: assertChatId(senderId, 'Sender id'),
        body: String(body || ''),
        redir,
        ...metadata,
      },
    },
    { fallbackMessage: 'Failed to send notification.' }
  );

export { getCachedChatIdentity, persistChatIdentity };



