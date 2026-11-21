import React, { Suspense, Component, useCallback, useEffect, useRef, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import ApiFeedbackLayer from './components/ApiFeedbackLayer';
import Loader from './components/loader'; 
import NetworkStatusBanner from './components/NetworkStatusBanner';
import SessionExpiryManager from './components/SessionExpiryManager';
import { SocketProvider } from './context/SocketContext';
import { NetworkStatusProvider } from './context/NetworkStatusContext';
import { CallStateProvider } from './context/CallStateContext';
import { getStoredUser, hasCompletedProfileSetup } from './utils/profile';
import { hasPendingTwoFactor, readPendingTwoFactor } from './utils/twoFactorSession';
import TwoFactorLoginChallenge from './components/TwoFactorLoginChallenge';
import { getNotificationSettings } from './api/preferences';
import {
  CHAT_NOTIFICATION_RECEIVED_EVENT,
  GROUP_MEMBERSHIP_SYNC_EVENT,
  LOCAL_CHAT_NOTIFICATION_EVENT,
  MESSAGE_REACTION_NOTIFICATION_KIND,
  buildMessageReactionNotificationText,
  buildRealtimeReactionNotification,
  getMessageReactionNotificationEmoji,
  isMessageReactionControlMessage,
  isMessageReactionNotification,
  isNotificationForActiveChat,
  normalizeChatNotification,
  validateChatNotificationDataFormat,
} from './utils/notification';
import {
  CALL_RINGING_RESOLVED_EVENT,
  PUSH_NOTIFICATION_CLICK_EVENT,
  clearStalePushRegistration,
  dismissIncomingCallNotifications,
  ensureBrowserNotificationPermission,
  getStoredGlobalNotificationsEnabled,
  getStoredNotificationSoundEnabled,
  getStoredNotificationPreviewEnabled,
  ensurePushNotificationsForUser,
  playNotificationSound,
  prepareNotificationSound,
  setStoredNotificationAlertPreferences,
  showForegroundPushNotification,
  subscribeToForegroundPushMessages,
  triggerNotificationVibration,
} from './utils/pushNotifications';
import {
  prepareIncomingCallRingtone,
  startIncomingCallRingtone,
  stopIncomingCallRingtone,
} from './utils/callRingtone';
import socketService from './utils/socketService';
import { expireStoredSession, getStoredSessionExpiryReason } from './utils/sessionExpiry';

const HomePage = React.lazy(() => import('./pages/HomePage'));
const MarketingPage = React.lazy(() => import('./pages/MarketingPage'));
const LoginPage = React.lazy(() => import('./pages/LoginPage'));
const OtpPage = React.lazy(() => import('./pages/OtpPage'));
const ProfilePage = React.lazy(() => import('./pages/ProfilePage'));
const Profile = React.lazy(() => import('./pages/Profile'));
const ContactProfile = React.lazy(() => import('./pages/ContactProfile'));
const ChatListPage = React.lazy(() => import('./pages/ChatListPage'));
const NotificationPreviewPage = React.lazy(() => import('./pages/NotificationPreviewPage'));
const AdminDashboardPage = React.lazy(() => import('./pages/AdminDashboardPage'));

const SYNCED_CONTACTS_STORAGE_KEY = 'chatterly_synced';
const RECENT_CHAT_NOTIFICATION_STORAGE_KEY_PREFIX = 'chatterly_recent_chat_notifications';
const RECENT_CHAT_NOTIFICATION_TTL_MS = 60 * 1000;
const MAX_RECENT_CHAT_NOTIFICATIONS = 100;
const CHAT_NOTIFICATION_TOAST_TTL_MS = 5000;
const normalizeComparableId = (value) => String(value || '').trim();
const CALL_HISTORY_NOTIFICATION_KINDS = new Set([
  'missed-call',
  'missed_call',
  'call-missed',
  'call_missed',
  'call-ended',
  'call_ended',
  'call-rejected',
  'call_rejected',
  'call-cancelled',
  'call_cancelled',
]);
const CALL_HISTORY_STATUSES = new Set([
  'missed',
  'not_answered',
  'not-answered',
  'rejected',
  'declined',
  'cancelled',
  'canceled',
  'completed',
  'ended',
]);
const normalizeIncomingCallMediaType = (value) => {
  const normalizedValue = String(value || '').trim().toLowerCase();
  return normalizedValue === 'video' || normalizedValue === 'audio' ? normalizedValue : '';
};
const resolveIncomingCallMediaType = (payload = {}) => {
  const directType =
    normalizeIncomingCallMediaType(payload?.callType) ||
    normalizeIncomingCallMediaType(payload?.mediaType) ||
    normalizeIncomingCallMediaType(payload?.type) ||
    normalizeIncomingCallMediaType(payload?.mode) ||
    normalizeIncomingCallMediaType(payload?.callMode) ||
    normalizeIncomingCallMediaType(payload?.call?.callType) ||
    normalizeIncomingCallMediaType(payload?.call?.mediaType) ||
    normalizeIncomingCallMediaType(payload?.call?.type);
  if (directType) return directType;
  if (payload?.isVideo === true || payload?.video === true) return 'video';
  const typeHint = String([
    payload?.title,
    payload?.body,
    payload?.message,
    payload?.text,
    payload?.notification?.title,
    payload?.notification?.body,
  ].filter(Boolean).join(' ')).trim().toLowerCase();
  if (/\bvideo\b/.test(typeHint)) return 'video';
  if (/\baudio\b|\bvoice\b/.test(typeHint)) return 'audio';
  return '';
};

const normalizeIncomingCallPayload = (payload = {}) => ({
  ...payload,
  callType: resolveIncomingCallMediaType(payload) || 'audio',
  callId: normalizeComparableId(
    payload?.callId || payload?.id || payload?._id || payload?.requestId
  ),
  chatId: normalizeComparableId(
    payload?.chatId ||
      payload?.conversationId ||
      payload?.threadId ||
      payload?.roomId ||
      payload?.callerId ||
      payload?.senderId
  ),
  callerId: normalizeComparableId(
    payload?.callerId ||
      payload?.senderId ||
      payload?.fromUserId ||
      (typeof payload?.caller === 'object'
        ? payload?.caller?._id || payload?.caller?.id || payload?.caller?.userId
        : payload?.caller) ||
      (typeof payload?.sender === 'object'
        ? payload?.sender?._id || payload?.sender?.id || payload?.sender?.userId
        : payload?.sender)
  ),
  receiverId: normalizeComparableId(
    payload?.receiverId ||
      payload?.userId ||
      payload?.toUserId ||
      (typeof payload?.receiver === 'object'
        ? payload?.receiver?._id || payload?.receiver?.id || payload?.receiver?.userId
        : payload?.receiver)
  ),
  senderName: String(
    payload?.senderName ||
      payload?.callerName ||
      payload?.name ||
      (typeof payload?.caller === 'object'
        ? payload?.caller?.name || payload?.caller?.fullName || payload?.caller?.username
        : '') ||
      ''
  ).trim(),
  profilePic: String(
    payload?.profilePic ||
      payload?.callerProfilePic ||
      payload?.callerAvatar ||
      payload?.avatar ||
      (typeof payload?.caller === 'object'
        ? payload?.caller?.profilePic || payload?.caller?.avatar || payload?.caller?.photo
        : '') ||
      ''
  ).trim(),
  startedAt:
    payload?.startedAt || payload?.timestamp || payload?.createdAt || new Date().toISOString(),
});

const resolveIncomingCallTargetUrl = (payload = {}) => {
  const normalizedIncomingCall = normalizeIncomingCallPayload(payload);
  const targetChatId = normalizeComparableId(
    normalizedIncomingCall?.chatId || normalizedIncomingCall?.callerId
  );
  return targetChatId ? `/chat/${encodeURIComponent(targetChatId)}/call` : '';
};

const isCallHistoryNotificationPayload = (payload = {}) => {
  const notificationKind = String(
    payload?.kind || payload?.type || payload?.event || payload?.action || ''
  ).trim().toLowerCase();
  const callStatus = String(
    payload?.callStatus || payload?.status || payload?.metadata?.callStatus || ''
  ).trim().toLowerCase();
  const messageType = String(
    payload?.messageType || payload?.metadata?.messageType || ''
  ).trim().toLowerCase();
  const notificationText = String(
    payload?.text || payload?.message || payload?.body || payload?.notification?.body || ''
  ).trim();
  const hasResolvedCallText = /^(?:missed\s+(?:audio|video|voice)\s+(?:group\s+)?call\b|(?:(?:outgoing|incoming)\s+)?(?:audio|video|voice)\s+(?:group\s+)?call\b.*\b(?:not answered|missed|rejected|declined|cancelled|canceled|completed|ended)\b)/i.test(
    notificationText
  );
  const hasCallIdentity = Boolean(
    payload?.callId ||
      messageType === 'call' ||
      notificationKind.includes('call') ||
      /\bcall\b/i.test(notificationText)
  );

  return (
    CALL_HISTORY_NOTIFICATION_KINDS.has(notificationKind) ||
    (hasCallIdentity && CALL_HISTORY_STATUSES.has(callStatus)) ||
    (messageType === 'call' && hasResolvedCallText) ||
    hasResolvedCallText
  );
};

// The backend writes a chat-log line for every call and delivers it like any
// message, addressed from the caller. For a call the user already watched end —
// answered, declined, or a group call starting/ending — that produced a stray
// "audio call completed" toast right after the call, on top of the Calls screen.
// Missed and cancelled calls are left alone: those the user may not have seen.
const RESOLVED_CALL_LOG_STATUSES = new Set(['completed', 'ended', 'rejected', 'declined', 'started']);

const isResolvedCallLogNotification = (notification = {}) => {
  const messageType = String(
    notification?.messageType || notification?.metadata?.messageType || ''
  ).trim().toLowerCase();
  const callStatus = String(
    notification?.callStatus || notification?.metadata?.callStatus || ''
  ).trim().toLowerCase();
  const isCallLogRecord = messageType === 'call' || Boolean(notification?.callId || notification?.groupCallId);

  return isCallLogRecord && RESOLVED_CALL_LOG_STATUSES.has(callStatus);
};

const isIncomingCallNotificationPayload = (payload = {}) => {
  if (isCallHistoryNotificationPayload(payload)) return false;

  const normalizedType = String(
    payload?.kind || payload?.type || payload?.event || payload?.action || ''
  )
    .trim()
    .toLowerCase();
  const targetUrl = String(
    payload?.targetUrl ||
      payload?.redir ||
      payload?.redirect ||
      payload?.click_action ||
      payload?.link ||
      ''
  ).trim();

  return (
    ['call', 'incoming-call', 'incoming_call', 'call-request', 'call_request', 'callrequest'].includes(
      normalizedType
    ) ||
    /\/chat\/[^/]+\/call\/?(?:[?#].*)?$/.test(targetUrl) ||
    Boolean(payload?.callId && (payload?.callerId || payload?.callType || payload?.mediaType))
  );
};

const resolveInternalNotificationTarget = (targetUrl = '/chats') => {
  try {
    const parsedUrl = new URL(String(targetUrl || '/chats'), window.location.origin);
    if (parsedUrl.origin !== window.location.origin) return '/chats';
    return `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}` || '/chats';
  } catch {
    return '/chats';
  }
};

const getRecentChatNotificationStorageKey = (userId) =>
  `${RECENT_CHAT_NOTIFICATION_STORAGE_KEY_PREFIX}:${normalizeComparableId(userId) || 'anonymous'}`;

const REACTION_NOTIFICATION_DEDUPE_PREFIX = 'message-reaction|';
// A reaction reaches this tab twice (the socket control message and the push
// the reactor's browser sends), with different ids and no shared sender id, so
// the two are matched on chat + emoji inside a short window.
const REACTION_NOTIFICATION_DEDUPE_WINDOW_MS = 10 * 1000;

const getChatNotificationDedupeKey = (notification = {}) => {
  if (isMessageReactionNotification(notification)) {
    return `${REACTION_NOTIFICATION_DEDUPE_PREFIX}${normalizeComparableId(notification?.chatId)}|${getMessageReactionNotificationEmoji(notification)}`;
  }

  const explicitKey = normalizeComparableId(notification?.id || notification?.messageId || notification?._id);
  if (explicitKey) {
    return explicitKey;
  }

  return [
    notification?.kind || 'message',
    notification?.chatId,
    notification?.senderId,
    notification?.timestamp || notification?.createdAt,
    notification?.text || notification?.message,
  ]
    .map((value) => normalizeComparableId(value))
    .filter(Boolean)
    .join('|');
};

const pruneRecentChatNotificationEntries = (recentNotificationKeys, now = Date.now()) => {
  Array.from(recentNotificationKeys.entries()).forEach(([notificationKey, timestamp]) => {
    if (!Number.isFinite(timestamp) || now - timestamp > RECENT_CHAT_NOTIFICATION_TTL_MS) {
      recentNotificationKeys.delete(notificationKey);
    }
  });
};

const readRecentChatNotificationKeys = (userId) => {
  const recentNotificationKeys = new Map();

  if (typeof localStorage === 'undefined') {
    return recentNotificationKeys;
  }

  try {
    const parsedValue = JSON.parse(
      localStorage.getItem(getRecentChatNotificationStorageKey(userId)) || '[]'
    );
    const entries = Array.isArray(parsedValue)
      ? parsedValue
      : Object.entries(parsedValue || {});

    entries.forEach((entry) => {
      const [notificationKey, timestamp] = Array.isArray(entry)
        ? entry
        : [entry?.key, entry?.timestamp];
      const normalizedKey = normalizeComparableId(notificationKey);
      const normalizedTimestamp = Number(timestamp);

      if (normalizedKey && Number.isFinite(normalizedTimestamp)) {
        recentNotificationKeys.set(normalizedKey, normalizedTimestamp);
      }
    });

    pruneRecentChatNotificationEntries(recentNotificationKeys);
  } catch (error) {
    console.error('Unable to parse recent chat notifications:', error);
  }

  return recentNotificationKeys;
};

const persistRecentChatNotificationKeys = (userId, recentNotificationKeys) => {
  if (typeof localStorage === 'undefined') {
    return;
  }

  try {
    const entries = Array.from(recentNotificationKeys.entries())
      .sort(([, firstTimestamp], [, secondTimestamp]) => secondTimestamp - firstTimestamp)
      .slice(0, MAX_RECENT_CHAT_NOTIFICATIONS);

    localStorage.setItem(
      getRecentChatNotificationStorageKey(userId),
      JSON.stringify(entries)
    );
  } catch (error) {
    console.error('Unable to persist recent chat notifications:', error);
  }
};

const readStoredContactsForNotifications = () => {
  try {
    const parsedValue = JSON.parse(localStorage.getItem(SYNCED_CONTACTS_STORAGE_KEY) || '[]');
    return Array.isArray(parsedValue) ? parsedValue : [];
  } catch (error) {
    console.error('Unable to parse stored contacts for notifications:', error);
    return [];
  }
};

const isStoredContactMutedForNotifications = (contact = {}) => {
  if (!contact?.isMuted) {
    return false;
  }

  const mutedUntilValue = String(contact?.mutedUntil || '').trim();
  if (!mutedUntilValue) {
    return true;
  }

  const mutedUntilTime = new Date(mutedUntilValue).getTime();
  return Number.isFinite(mutedUntilTime) && mutedUntilTime > Date.now();
};

const isChatNotificationMuted = (notification = {}) => {
  const normalizedChatId = normalizeComparableId(notification?.chatId);
  const normalizedSenderId = normalizeComparableId(notification?.senderId);

  if (!normalizedChatId && !normalizedSenderId) {
    return false;
  }

  return readStoredContactsForNotifications().some((contact) => {
    if (!isStoredContactMutedForNotifications(contact)) {
      return false;
    }

    const contactChatId = normalizeComparableId(contact?.chatId);
    if (normalizedChatId && contactChatId === normalizedChatId) {
      return true;
    }

    const contactComparableIds = [
      contact?.userId,
      contact?.id,
      contact?._id,
      contact?.receiverId,
      contact?.contactId,
      contact?.participantId,
    ]
      .map((value) => normalizeComparableId(value))
      .filter(Boolean);

    return Boolean(normalizedSenderId) && contactComparableIds.includes(normalizedSenderId);
  });
};

const isContactBlockStateNotification = (notification = {}) => {
  const normalizedKind = String(
    notification?.kind ||
      notification?.systemNoticeKind ||
      ''
  ).trim().toLowerCase();
  const normalizedAction = String(notification?.action || '').trim().toLowerCase();
  const normalizedText = String(
    notification?.text ||
      notification?.message ||
      notification?.body ||
      ''
  ).trim();

  return (
    normalizedKind === 'contact-block-state' ||
    normalizedAction === 'contact_blocked' ||
    normalizedAction === 'contact_unblocked' ||
    normalizedText.startsWith('**CHATTERLY_CONTACT_BLOCK_STATE**')
  );
};

const resolveRealtimeMessageNotification = (message = {}) =>
  normalizeChatNotification({
    ...message,
    id:
      message?.id ||
      message?.messageId ||
      message?.clientMessageId ||
      message?.localId ||
      '',
    chatId:
      message?.chatId ||
      message?.chat?._id ||
      message?.chat?.id ||
      null,
    senderId:
      message?.senderId ||
      (typeof message?.sender === 'object'
        ? message?.sender?._id || message?.sender?.id || message?.sender?.userId
        : message?.sender) ||
      '',
    senderName:
      message?.senderName ||
      (typeof message?.sender === 'object'
        ? message?.sender?.name || message?.sender?.fullName || message?.sender?.username
        : '') ||
      'New message',
    message:
      message?.text ||
      message?.message ||
      message?.caption ||
      '',
    timestamp:
      message?.timestamp ||
      message?.createdAt ||
      new Date().toISOString(),
    __chatterlySocketEvent: message?.__chatterlySocketEvent || '',
    isMissedMessageReplay: Boolean(message?.isMissedMessageReplay),
    metadata: message?.metadata || null,
  });

const resolveNotificationTargetUrl = (notification = {}) => {
  if (isCallHistoryNotificationPayload(notification)) {
    return '/calls';
  }

  const explicitTargetUrl = String(
    notification?.targetUrl ||
      notification?.redir ||
      notification?.redirect ||
      notification?.click_action ||
      notification?.link ||
      ''
  ).trim();
  if (explicitTargetUrl) {
    return explicitTargetUrl;
  }

  const normalizedChatId = normalizeComparableId(
    notification?.chatId || notification?.senderId
  );
  if (!normalizedChatId) {
    return '/chats';
  }

  const isGroupNotification =
    Boolean(notification?.isGroup) ||
    String(notification?.chatType || '').trim().toLowerCase() === 'group';
  const isBroadcastNotification =
    Boolean(notification?.isBroadcast) ||
    String(notification?.chatType || '').trim().toLowerCase() === 'broadcast';

  return isBroadcastNotification
    ? `/broadcasts/chat/${encodeURIComponent(normalizedChatId)}`
    : isGroupNotification
    ? `/groups/chat/${encodeURIComponent(normalizedChatId)}`
    : `/chat/${encodeURIComponent(normalizedChatId)}`;
};

// The notification for a reaction that arrived as a socket control message, or
// null when the user should not be told about it (see buildRealtimeReactionNotification).
const resolveRealtimeReactionNotification = (message = {}, userId = '') => {
  const reaction = buildRealtimeReactionNotification(message, { userId });
  if (!reaction) return null;

  const messageSender = typeof message?.sender === 'object' ? message.sender : null;
  const storedContactName = readStoredContactsForNotifications().find((contact) =>
    [contact?.userId, contact?.id, contact?._id, contact?.receiverId, contact?.contactId, contact?.participantId]
      .some((contactId) => normalizeComparableId(contactId) === normalizeComparableId(reaction.senderId))
  )?.name;
  const senderName = String(
    reaction.senderName ||
      messageSender?.name ||
      messageSender?.fullName ||
      messageSender?.username ||
      storedContactName ||
      'Someone'
  ).trim();
  const notification = normalizeChatNotification({ ...reaction, senderName });

  return { ...notification, targetUrl: resolveNotificationTargetUrl(notification) };
};

// A push for a reaction carries only a title (the reactor) and a body, so the
// kind, emoji and wording are rebuilt here; older builds sent "<name> reacted 😀
// to your message.", which is reworded to the same sentence.
const normalizeReactionPushNotification = (notification = {}) => {
  if (!isMessageReactionNotification(notification)) return notification;

  const emoji = getMessageReactionNotificationEmoji(notification);
  if (!emoji) return notification;

  const text = buildMessageReactionNotificationText(emoji);
  return {
    ...notification,
    kind: MESSAGE_REACTION_NOTIFICATION_KIND,
    action: 'message_reaction',
    emoji,
    message: text,
    text,
  };
};

const buildBrowserNotificationPayload = (notification = {}) => ({
  notification: {
    title: getStoredNotificationPreviewEnabled()
      ? notification?.senderName || 'New message'
      : 'New Message',
    body: getStoredNotificationPreviewEnabled()
      ? notification?.text || 'You have a new message.'
      : '',
  },
  data: {
    id: notification?.id || '',
    messageId: notification?.id || '',
    notificationId: notification?.id || '',
    chatId: notification?.chatId || '',
    senderId: notification?.senderId || '',
    senderName: notification?.senderName || '',
    text: notification?.text || '',
    timestamp: notification?.timestamp || new Date().toISOString(),
    chatType: notification?.chatType || '',
    kind: notification?.kind || '',
    action: notification?.action || '',
    groupId: notification?.groupId || '',
    groupName: notification?.groupName || '',
    isGroup: notification?.isGroup ? 'true' : '',
    callId: notification?.callId || '',
    callerId: notification?.callerId || notification?.senderId || '',
    receiverId: notification?.receiverId || '',
    callType: notification?.callType || notification?.mediaType || '',
    callStatus: notification?.callStatus || notification?.status || notification?.metadata?.callStatus || '',
    messageType: notification?.messageType || notification?.metadata?.messageType || '',
    startedAt: notification?.startedAt || notification?.timestamp || '',
    profilePic: notification?.profilePic || notification?.callerProfilePic || '',
    redir: resolveNotificationTargetUrl(notification),
    targetUrl: resolveNotificationTargetUrl(notification),
  },
});

const IncomingChatNotificationToast = ({
  notification,
  onOpen,
  onDismiss,
}) => {
  if (!notification) {
    return null;
  }

  const showMessagePreview = getStoredNotificationPreviewEnabled();

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[100000] w-[calc(100vw-2rem)] max-w-sm sm:right-6 sm:top-6">
      <div
        onClick={onOpen}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onOpen();
          }
        }}
        className="pointer-events-auto w-full overflow-hidden rounded-[28px] border border-[#E8ECF4] bg-white/95 p-4 text-left shadow-[0_18px_55px_rgba(24,39,75,0.18)] backdrop-blur-md transition-transform duration-200 hover:-translate-y-0.5"
        role="button"
        tabIndex={0}
      >
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,#7C3AED_0%,#A855F7_100%)] text-sm font-semibold uppercase tracking-[0.08em] text-white">
            {String(notification?.senderName || 'C').trim().charAt(0) || 'C'}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#8A94A6]">
                  Chatterly
                </p>
                <p className="mt-1 truncate text-[16px] font-semibold text-[#111827]">
                  {showMessagePreview ? notification?.senderName || 'New message' : 'New Message'}
                </p>
              </div>

              <button
                type="button"
                aria-label="Dismiss notification"
                onClick={(event) => {
                  event.stopPropagation();
                  onDismiss();
                }}
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[#94A3B8] transition-colors hover:bg-[#F8FAFC] hover:text-[#475569]"
              >
                <span className="text-lg leading-none">x</span>
              </button>
            </div>

            {showMessagePreview ? (
              <p className="mt-2 line-clamp-2 text-[14px] leading-6 text-[#5B6475]">
                {notification?.text || 'You have a new message.'}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};

const IncomingCallPrompt = ({ call, onAnswer, onReject }) => {
  if (!call) return null;

  const isGroupCall = Boolean(call?.isGroupCall || call?.groupCallId);
  const callerName = call?.senderName || call?.groupName || (isGroupCall ? 'Group call' : 'Incoming call');
  const callType = call?.callType === 'video' ? 'Video' : 'Voice';

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[100001] w-[calc(100vw-2rem)] max-w-sm sm:right-6 sm:top-6">
      <div className="pointer-events-auto overflow-hidden rounded-[28px] border border-[#E8ECF4] bg-white/95 p-4 shadow-[0_18px_55px_rgba(24,39,75,0.22)] backdrop-blur-md" role="dialog" aria-label={`Incoming ${callType.toLowerCase()} call from ${callerName}`}>
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-[linear-gradient(135deg,#7C3AED_0%,#A855F7_100%)] text-base font-semibold text-white">
            {call?.profilePic ? <img src={call.profilePic} alt="" className="h-full w-full object-cover" /> : String(callerName).charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#8A94A6]">Incoming {callType} call</p>
            <p className="mt-1 truncate text-[16px] font-semibold text-[#111827]">{callerName}</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <button type="button" onClick={onReject} className="h-10 rounded-full bg-[#FEE2E2] text-sm font-semibold text-[#DC2626] transition-colors hover:bg-[#FECACA]">Reject</button>
          <button type="button" onClick={onAnswer} className="h-10 rounded-full bg-[#DCFCE7] text-sm font-semibold text-[#15803D] transition-colors hover:bg-[#BBF7D0]">Answer</button>
        </div>
      </div>
    </div>
  );
};

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-screen bg-[#F8F9FB]">
          <h2 className="text-2xl font-bold text-[#1A1A1A]">Something went wrong.</h2>
          <p className="text-[#71767A] mb-4">We encountered an unexpected error.</p>
          <button 
            onClick={() => window.location.href = '/'}
            className="px-4 py-2 bg-[#4C6EF5] text-white rounded-md"
          >
            Go to Home
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// A sign-in stopped at the 2FA challenge holds no token yet, so the chat routes
// render the challenge instead of ChatListPage: the code popup sits over a
// blurred chat backdrop, and the app mounts only once the JWT arrives.
const TwoFactorChallengeGate = ({ children }) => {
  const navigate = useNavigate();
  const [pending, setPending] = useState(() => readPendingTwoFactor());

  if (!pending) return children;

  return (
    <TwoFactorLoginChallenge
      pending={pending}
      onVerified={({ isProfileComplete }) => {
        setPending(null);
        if (!isProfileComplete) navigate('/create-profile', { replace: true });
      }}
      onCancel={() => {
        setPending(null);
        navigate('/login', { replace: true });
      }}
    />
  );
};

// Route Protections
const ProtectedRoute = ({ children }) => {
  if (getStoredSessionExpiryReason()) {
    expireStoredSession();
    return <Navigate to="/login" replace />;
  }
  const token = localStorage.getItem('token');
  const storedUser = getStoredUser();

  if (!token) {
    // The challenge owns this case: it is a half-finished login, not a signed-out
    // visitor, and bouncing to /login would strand the user in a loop.
    if (hasPendingTwoFactor()) {
      return <TwoFactorChallengeGate>{children}</TwoFactorChallengeGate>;
    }
    return <Navigate to="/login" replace />;
  }

  if (!hasCompletedProfileSetup(storedUser)) {
    return <Navigate to="/create-profile" replace />;
  }

  return children;
};

const PublicRoute = ({ children }) => {
  if (getStoredSessionExpiryReason()) {
    expireStoredSession();
    return children;
  }
  const token = localStorage.getItem('token');
  const storedUser = getStoredUser();

  // A finished account goes straight to its chats. A sign-in still in Profile
  // Setup (say, by mail in another tab) gets the page it asked for, so Get
  // Started / Log In open the login screen instead of dropping into Profile
  // Setup (BUG_USR_314). /chats and /create-profile still send that account
  // to setup.
  if (token && hasCompletedProfileSetup(storedUser)) {
    return <Navigate to="/chats" replace />;
  }

  return children;
};

const ProfileSetupRoute = ({ children }) => {
  if (getStoredSessionExpiryReason()) {
    expireStoredSession();
    return <Navigate to="/login" replace />;
  }
  const token = localStorage.getItem('token');
  const storedUser = getStoredUser();

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return hasCompletedProfileSetup(storedUser) 
    ? <Navigate to="/chats" replace /> 
    : children;
};

const hasActivePushSession = (token, userId) =>
  Boolean(token && userId && !getStoredSessionExpiryReason());

const PushNotificationBootstrap = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const locationRef = useRef(location);
  const recentNotificationKeysRef = useRef(new Map());
  const notificationToastTimeoutRef = useRef(null);
  const activeIncomingCallKeyRef = useRef('');
  const notifiedIncomingCallKeyRef = useRef('');
  const [activeNotificationToast, setActiveNotificationToast] = useState(null);
  const [activeIncomingCall, setActiveIncomingCall] = useState(null);
  const pushSessionToken = String(
    localStorage.getItem('token') || localStorage.getItem('userToken') || ''
  ).trim();
  const pushSessionUser = getStoredUser() || {};
  const pushSessionUserId = String(
    pushSessionUser?._id || pushSessionUser?.userId || pushSessionUser?.id || ''
  ).trim();

  useEffect(() => prepareIncomingCallRingtone(), []);

  useEffect(() => {
    const removeUnlockListeners = () => {
      window.removeEventListener('pointerdown', unlockNotificationSound, true);
      window.removeEventListener('keydown', unlockNotificationSound, true);
    };
    const unlockNotificationSound = () => {
      void prepareNotificationSound();
      removeUnlockListeners();
    };

    window.addEventListener('pointerdown', unlockNotificationSound, true);
    window.addEventListener('keydown', unlockNotificationSound, true);
    return removeUnlockListeners;
  }, []);

  useEffect(() => {
    locationRef.current = location;
  }, [location]);

  const dismissNotificationToast = useCallback(() => {
    if (notificationToastTimeoutRef.current) {
      window.clearTimeout(notificationToastTimeoutRef.current);
      notificationToastTimeoutRef.current = null;
    }
    setActiveNotificationToast(null);
  }, []);

  const showNotificationToast = useCallback((notification) => {
    setActiveNotificationToast(notification);

    if (notificationToastTimeoutRef.current) {
      window.clearTimeout(notificationToastTimeoutRef.current);
    }

    notificationToastTimeoutRef.current = window.setTimeout(() => {
      notificationToastTimeoutRef.current = null;
      setActiveNotificationToast(null);
    }, CHAT_NOTIFICATION_TOAST_TTL_MS);
  }, []);

  const openNotificationToastChat = useCallback(() => {
    const targetNotification = activeNotificationToast;
    dismissNotificationToast();

    if (isCallHistoryNotificationPayload(targetNotification)) {
      navigate('/calls', {
        state: { callHistoryNotification: targetNotification },
      });
      return;
    }

    const notificationTargetUrl = resolveNotificationTargetUrl(targetNotification);
    const notificationKind = String(targetNotification?.kind || 'message').trim().toLowerCase();

    if (!notificationTargetUrl) {
      navigate('/chats');
      return;
    }

    if (notificationKind !== 'message') {
      navigate(notificationTargetUrl);
      return;
    }

    navigate(notificationTargetUrl, {
      state: {
        notificationPayload: targetNotification,
      },
    });
  }, [activeNotificationToast, dismissNotificationToast, navigate]);

  // The incoming-call alert is shown with `requireInteraction`, so nothing takes
  // it off screen on its own for 32 seconds. Every way a call can stop ringing -
  // answered, declined, missed, cancelled, ended - routes through here so the
  // alert and the ringtone are cleared together.
  const resolveRingingIncomingCall = useCallback(() => {
    activeIncomingCallKeyRef.current = '';
    notifiedIncomingCallKeyRef.current = '';
    stopIncomingCallRingtone();
    void dismissIncomingCallNotifications();
    setActiveIncomingCall(null);
  }, []);

  const presentIncomingCall = useCallback((incomingCallPayload = {}) => {
    const normalizedIncomingCall = normalizeIncomingCallPayload(incomingCallPayload);
    const incomingCallKey = normalizeComparableId(
      normalizedIncomingCall.callId || normalizedIncomingCall.groupCallId || [
        normalizedIncomingCall.chatId,
        normalizedIncomingCall.callerId,
        normalizedIncomingCall.startedAt,
      ].filter(Boolean).join('|')
    );
    if (!incomingCallKey || activeIncomingCallKeyRef.current === incomingCallKey) return false;

    activeIncomingCallKeyRef.current = incomingCallKey;
    dismissNotificationToast();
    setActiveIncomingCall({ ...normalizedIncomingCall, notificationKey: incomingCallKey });
    if (getStoredGlobalNotificationsEnabled()) void startIncomingCallRingtone();
    return true;
  }, [dismissNotificationToast]);

  useEffect(() => {
    const handleLocalCallResolved = () => resolveRingingIncomingCall();
    window.addEventListener(CALL_RINGING_RESOLVED_EVENT, handleLocalCallResolved);

    // The peer's side of the same transitions: the receiver answering raises
    // `call_connected` on both ends, and the rest resolve the call outright.
    const unsubscribeCallLifecycle = [
      socketService.onCallConnected(handleLocalCallResolved),
      socketService.onCallEnded(handleLocalCallResolved),
      socketService.onCallRejected(handleLocalCallResolved),
      socketService.onCallMissed(handleLocalCallResolved),
      socketService.onCallCancelled(handleLocalCallResolved),
    ];

    return () => {
      window.removeEventListener(CALL_RINGING_RESOLVED_EVENT, handleLocalCallResolved);
      unsubscribeCallLifecycle.forEach((unsubscribe) => unsubscribe());
    };
  }, [resolveRingingIncomingCall]);

  const openIncomingCallScreen = useCallback((incomingCallPayload = {}, { autoAccept = false } = {}) => {
    const normalizedIncomingCall = normalizeIncomingCallPayload(incomingCallPayload);
    const targetUrl = resolveIncomingCallTargetUrl(normalizedIncomingCall);

    if (!targetUrl) {
      return false;
    }

    const incomingCallKey = normalizeComparableId(
      normalizedIncomingCall.callId ||
        [
          normalizedIncomingCall.chatId,
          normalizedIncomingCall.callerId,
          normalizedIncomingCall.startedAt,
        ]
          .filter(Boolean)
          .join('|')
    );
    const currentLocation = locationRef.current;
    const currentRouteHasIncomingCall =
      currentLocation?.pathname === targetUrl &&
      (
        Boolean(currentLocation?.state?.openedFromIncomingCall) ||
        new URLSearchParams(String(currentLocation?.search || '')).get('incomingCall') === '1'
      );

    // A service-worker click restores the call from URL parameters. If the
    // socket reports the same call while that URL is mounting, preserve the
    // current page instead of issuing a second navigation.
    if (currentRouteHasIncomingCall) {
      activeIncomingCallKeyRef.current = incomingCallKey;
      dismissNotificationToast();
      if (autoAccept) {
        const nextLocationState = {
          ...currentLocation?.state,
          callType: normalizedIncomingCall.callType,
          incomingCallPayload: {
            ...(currentLocation?.state?.incomingCallPayload || {}),
            ...normalizedIncomingCall,
          },
          openedFromIncomingCall: true,
          autoAcceptIncomingCall: true,
        };
        locationRef.current = {
          ...currentLocation,
          pathname: targetUrl,
          search: '',
          state: nextLocationState,
        };
        navigate(targetUrl, { replace: true, state: nextLocationState });
      }
      return true;
    }

    if (incomingCallKey && activeIncomingCallKeyRef.current === incomingCallKey) {
      // Socket delivery, foreground FCM, and an OS-notification click can all
      // describe the same call. Once its call route is open, treating another
      // delivery as a new navigation remounts the large chat screen and causes
      // repeated loading flashes.
      if (currentLocation?.pathname === targetUrl) {
        dismissNotificationToast();
        return true;
      }

      const nextLocationState = {
        ...currentLocation?.state,
        callType: normalizedIncomingCall.callType,
        incomingCallPayload: {
          ...(currentLocation?.state?.incomingCallPayload || {}),
          ...normalizedIncomingCall,
        },
        openedFromIncomingCall: true,
        autoAcceptIncomingCall: autoAccept,
      };
      locationRef.current = {
        ...currentLocation,
        pathname: targetUrl,
        search: '',
        state: nextLocationState,
      };
      navigate(targetUrl, {
        replace: true,
        state: nextLocationState,
      });
      return true;
    }

    activeIncomingCallKeyRef.current = incomingCallKey;
    dismissNotificationToast();

    if (getStoredGlobalNotificationsEnabled()) {
      void startIncomingCallRingtone();
    }

    const nextLocationState = {
      callType: normalizedIncomingCall.callType,
      incomingCallPayload: normalizedIncomingCall,
      openedFromIncomingCall: true,
      autoAcceptIncomingCall: autoAccept,
    };
    locationRef.current = {
      ...currentLocation,
      pathname: targetUrl,
      search: '',
      state: nextLocationState,
    };
    navigate(targetUrl, {
      state: nextLocationState,
    });
    return true;
  }, [dismissNotificationToast, navigate]);

  const answerIncomingCall = useCallback(() => {
    const call = activeIncomingCall;
    if (!call) return;
    setActiveIncomingCall(null);
    stopIncomingCallRingtone();

    if (call.isGroupCall || call.groupCallId) {
      const groupId = normalizeComparableId(call.groupId || call.chatId);
      if (!groupId) return;
      navigate(`/groups/chat/${encodeURIComponent(groupId)}`, {
        state: { answerGroupCallPayload: call },
      });
      return;
    }
    openIncomingCallScreen(call, { autoAccept: true });
  }, [activeIncomingCall, navigate, openIncomingCallScreen]);

  const rejectIncomingCall = useCallback(() => {
    const call = activeIncomingCall;
    if (!call) return;
    if (!call.isGroupCall && call.callId) {
      void socketService.rejectCall({ callId: call.callId }).catch((error) => {
        console.error('Unable to reject incoming call:', error);
      });
    }
    resolveRingingIncomingCall();
  }, [activeIncomingCall, resolveRingingIncomingCall]);

  useEffect(() => {
    const handlePushNotificationClick = (notificationData = {}) => {
      const embeddedPayload = notificationData?.notificationPayload || notificationData?.payload || {};
      const targetUrl = resolveInternalNotificationTarget(
        notificationData?.targetUrl || embeddedPayload?.targetUrl || embeddedPayload?.redir || '/chats'
      );
      const notificationPayload = {
        ...embeddedPayload,
        chatId: embeddedPayload?.chatId || notificationData?.chatId || '',
        senderId: embeddedPayload?.senderId || notificationData?.senderId || '',
        targetUrl,
        redir: targetUrl,
      };

      if (isIncomingCallNotificationPayload(notificationPayload)) {
        openIncomingCallScreen(notificationPayload);
        return;
      }

      if (isCallHistoryNotificationPayload(notificationPayload)) {
        navigate('/calls', {
          state: { callHistoryNotification: notificationPayload },
        });
        return;
      }

      navigate(targetUrl, { state: { notificationPayload } });
    };
    const handleWindowNotificationClick = (event) => handlePushNotificationClick(event?.detail || {});
    const handleServiceWorkerMessage = (event) => {
      if (event?.data?.type !== PUSH_NOTIFICATION_CLICK_EVENT) return;
      handlePushNotificationClick(event.data.notificationData || event.data.data || {});
    };

    window.addEventListener(PUSH_NOTIFICATION_CLICK_EVENT, handleWindowNotificationClick);
    navigator.serviceWorker?.addEventListener?.('message', handleServiceWorkerMessage);
    return () => {
      window.removeEventListener(PUSH_NOTIFICATION_CLICK_EVENT, handleWindowNotificationClick);
      navigator.serviceWorker?.removeEventListener?.('message', handleServiceWorkerMessage);
    };
  }, [navigate, openIncomingCallScreen]);

  useEffect(() => {
    let isActive = true;
    let unsubscribeForegroundMessages = () => {};
    let unsubscribeSocketMessages = () => {};
    let unsubscribeIncomingCallListeners = () => {};
    let cleanupNotificationPermissionInteraction = () => {};
    let registrationRetryTimeoutId = null;

    const token = pushSessionToken;
    const userId = pushSessionUserId;

    const isCurrentPushSession = () => {
      const currentToken = String(
        localStorage.getItem('token') || localStorage.getItem('userToken') || ''
      ).trim();
      const currentUser = getStoredUser() || {};
      const currentUserId = String(
        currentUser?._id || currentUser?.userId || currentUser?.id || ''
      ).trim();

      return currentToken === token && currentUserId === userId && hasActivePushSession(currentToken, currentUserId);
    };

    if (!isCurrentPushSession()) {
      // Signed out. A session that ended without the logout button (it expired, or
      // the server rejected it) leaves this browser's push registration behind, and
      // its service worker keeps showing that account's notifications on the login
      // page. A device with nothing registered is left alone.
      void clearStalePushRegistration().catch((error) => {
        console.error('Unable to clear push notifications for a signed-out device:', error);
      });
      return undefined;
    }

    const notificationSettingsReady = getNotificationSettings()
      .then((settings) => setStoredNotificationAlertPreferences(settings))
      .catch((error) => {
        console.error('Failed to load notification alert settings:', error);
        return null;
      });

    recentNotificationKeysRef.current = readRecentChatNotificationKeys(userId);

    const hasRecentlyShownNotification = (normalizedNotification) => {
      const now = Date.now();
      const recentNotificationKeys = recentNotificationKeysRef.current;

      pruneRecentChatNotificationEntries(recentNotificationKeys, now);

      const notificationKey = getChatNotificationDedupeKey(normalizedNotification);
      if (!notificationKey) {
        return false;
      }

      const isRecentlyShown =
        recentNotificationKeys.has(notificationKey) &&
        (!notificationKey.startsWith(REACTION_NOTIFICATION_DEDUPE_PREFIX) ||
          now - recentNotificationKeys.get(notificationKey) < REACTION_NOTIFICATION_DEDUPE_WINDOW_MS);
      if (isRecentlyShown) {
        persistRecentChatNotificationKeys(userId, recentNotificationKeys);
        return true;
      }

      recentNotificationKeys.set(notificationKey, now);
      persistRecentChatNotificationKeys(userId, recentNotificationKeys);
      return false;
    };

    const shouldSuppressChatNotification = (normalizedNotification) => {
      const normalizedSenderId = String(normalizedNotification?.senderId || '').trim();
      if (normalizedSenderId && normalizedSenderId === userId) {
        return true;
      }

      if (isNotificationForActiveChat(normalizedNotification, locationRef.current)) {
        // Record the delivery even though it is silent. If the same message is
        // then delivered through FCM after its socket event, navigating away in
        // between must not turn that duplicate into a late notification.
        hasRecentlyShownNotification(normalizedNotification);
        return true;
      }

      if (isContactBlockStateNotification(normalizedNotification)) {
        return true;
      }

      if (isResolvedCallLogNotification(normalizedNotification)) {
        return true;
      }

      if (isChatNotificationMuted(normalizedNotification)) {
        return true;
      }

      return hasRecentlyShownNotification(normalizedNotification);
    };

    const showNotificationUsingCurrentContext = async (normalizedNotification) => {
      await notificationSettingsReady;
      if (!isActive || !isCurrentPushSession() || !getStoredGlobalNotificationsEnabled()) {
        return;
      }

      const isDocumentVisible =
        typeof document !== 'undefined' && document.visibilityState === 'visible';
      const isDocumentFocused =
        typeof document !== 'undefined' &&
        typeof document.hasFocus === 'function' &&
        document.hasFocus();

      if (getStoredNotificationSoundEnabled()) {
        void playNotificationSound();
      }
      if (isDocumentVisible) {
        triggerNotificationVibration();
      }

      if (isDocumentVisible) {
        showNotificationToast(normalizedNotification);
        if (!isDocumentFocused) {
          void showForegroundPushNotification(
            buildBrowserNotificationPayload(normalizedNotification)
          );
        }
        return;
      }

      const didShowForegroundNotification = await showForegroundPushNotification(
        buildBrowserNotificationPayload(normalizedNotification)
      );

      if (!didShowForegroundNotification && isDocumentVisible) {
        showNotificationToast(normalizedNotification);
      }
    };

    const maybeShowChatNotification = async (normalizedNotification) => {
      window.dispatchEvent(new CustomEvent(CHAT_NOTIFICATION_RECEIVED_EVENT, {
        detail: normalizedNotification,
      }));

      if (shouldSuppressChatNotification(normalizedNotification)) {
        return;
      }

      await showNotificationUsingCurrentContext(normalizedNotification);
    };

    const maybeShowLocalNotification = async (normalizedNotification) => {
      if (shouldSuppressChatNotification(normalizedNotification)) {
        return;
      }

      await showNotificationUsingCurrentContext(normalizedNotification);
    };

    const showIncomingCallDesktopNotification = async (payload = {}) => {
      if (!getStoredGlobalNotificationsEnabled()) {
        return;
      }

      const call = normalizeIncomingCallPayload(payload);
      const callKey = call.callId || `${call.chatId}|${call.callerId}|${call.startedAt}`;
      if (!callKey || notifiedIncomingCallKeyRef.current === callKey) return;
      notifiedIncomingCallKeyRef.current = callKey;
      await ensureBrowserNotificationPermission({ requestPermission: true });
      const didShow = await showForegroundPushNotification({
        notification: { title: call.senderName || 'Incoming call', body: `Incoming ${call.callType === 'video' ? 'video' : 'voice'} call` },
        data: {
          id: callKey,
          kind: 'incoming-call',
          callId: call.callId,
          chatId: call.chatId,
          callerId: call.callerId,
          receiverId: call.receiverId,
          senderId: call.callerId,
          senderName: call.senderName,
          callType: call.callType,
          startedAt: call.startedAt,
          profilePic: call.profilePic,
          targetUrl: resolveIncomingCallTargetUrl(call),
        },
      });
      if (!didShow && notifiedIncomingCallKeyRef.current === callKey) notifiedIncomingCallKeyRef.current = '';
    };

    const initializePushNotifications = async ({
      requestPermission = false,
      forceRequest = false,
    } = {}) => {
      try {
        const permissionState = await ensureBrowserNotificationPermission({
          requestPermission,
          forceRequest,
        });
        if (!isActive || !permissionState?.granted) {
          return;
        }

        const pushState = await ensurePushNotificationsForUser({
          userId,
          requestPermission: false,
        });

        if (!isActive || !pushState?.enabled) {
          return;
        }

        unsubscribeForegroundMessages = subscribeToForegroundPushMessages(async (payload, normalizedNotification) => {
          if (!isActive || !isCurrentPushSession()) return;
          if (String(payload?.data?.type || '').trim().toLowerCase() === 'group_call') {
            const groupInvitation = socketService.receiveGroupCallInvitation({
              ...payload.data,
              callType: payload?.data?.callType || 'video',
            });
            presentIncomingCall({
              ...groupInvitation,
              isGroupCall: true,
              groupCallId: groupInvitation?.groupCallId,
              groupId: groupInvitation?.groupId,
              chatId: groupInvitation?.groupId,
              senderName: groupInvitation?.groupName || groupInvitation?.name || 'Group call',
            });
            await showForegroundPushNotification({
              notification: payload?.notification || {
                title: groupInvitation?.groupName || 'Group call',
                body: `Incoming group ${groupInvitation?.callType === 'audio' ? 'voice' : 'video'} call`,
              },
              data: {
                ...payload.data,
                id: `group-call-${groupInvitation?.groupCallId}`,
                kind: 'group_call',
                chatId: groupInvitation?.groupId,
                groupId: groupInvitation?.groupId,
                targetUrl: `/groups/chat/${encodeURIComponent(groupInvitation?.groupId || '')}`,
              },
            });
            return;
          }
          const normalizedIncomingCall = {
            ...payload?.data,
            callType: resolveIncomingCallMediaType({
              ...payload?.data,
              ...normalizedNotification,
              notification: payload?.notification,
            }),
            ...normalizedNotification,
            targetUrl:
              payload?.fcmOptions?.link ||
              normalizedNotification?.targetUrl ||
              normalizedNotification?.redir ||
              '',
          };

          if (isIncomingCallNotificationPayload(normalizedIncomingCall)) {
            void showIncomingCallDesktopNotification(normalizedIncomingCall);
            presentIncomingCall(normalizedIncomingCall);
            return;
          }

          const normalizedChatPushNotification = normalizeReactionPushNotification(normalizeChatNotification({
            ...normalizedNotification,
            targetUrl: normalizedIncomingCall.targetUrl,
            redir: normalizedIncomingCall.targetUrl,
          }, {
              fallback: {
                senderName:
                  payload?.notification?.title ||
                  normalizedNotification?.senderName ||
                  'New message',
                message:
                  payload?.notification?.body ||
                  normalizedNotification?.text ||
                  'You have a new message.',
              },
            }));
          const groupRouteMatch = String(normalizedIncomingCall.targetUrl || '')
            .match(/\/groups\/chat\/([^/?#]+)/i);
          if (
            groupRouteMatch?.[1] &&
            /\b(?:added|removed)\b/i.test(normalizedChatPushNotification.text || '')
          ) {
            window.dispatchEvent(new CustomEvent(GROUP_MEMBERSHIP_SYNC_EVENT, {
              detail: {
                ...normalizedChatPushNotification,
                chatId: decodeURIComponent(groupRouteMatch[1]),
                groupId: decodeURIComponent(groupRouteMatch[1]),
              },
            }));
          }
          await maybeShowChatNotification(normalizedChatPushNotification);
        });
      } catch (error) {
        console.error('Failed to initialize push notifications:', error);
      }
    };

    const socket = socketService.connect({ userId, token });
    const handleIncomingCall = (incomingCallPayload) => {
      if (!isActive || !isCurrentPushSession()) return;
      void showIncomingCallDesktopNotification(incomingCallPayload);
      presentIncomingCall(incomingCallPayload);
    };

    // Subscribe through SocketService rather than attaching to the current raw
    // socket. Socket.IO can replace that instance after a background-tab
    // reconnect; this subscription remains registered and still receives the
    // next `call_incoming` event, allowing the native desktop alert to fire.
    const unsubscribeIncomingCall = socketService.onIncomingCall(handleIncomingCall);
    unsubscribeIncomingCallListeners = unsubscribeIncomingCall;

    if (socket?.on) {

      const handleGroupCallInvitation = async (payload = {}) => {
        if (!isActive || !isCurrentPushSession()) return;
        const invitation = socketService.receiveGroupCallInvitation(payload);
        const groupCallId = String(invitation?.groupCallId || '').trim();
        const groupId = String(invitation?.groupId || '').trim();
        if (!groupCallId || !groupId) return;

        presentIncomingCall({
          ...invitation,
          isGroupCall: true,
          groupCallId,
          groupId,
          chatId: groupId,
          senderName: invitation?.groupName || invitation?.name || 'Group call',
          callType: invitation.callType || 'video',
        });

        await ensureBrowserNotificationPermission({ requestPermission: true });
        await showForegroundPushNotification({
          notification: {
            title: invitation?.groupName || 'Group call',
            body: `Incoming group ${invitation.callType === 'audio' ? 'voice' : 'video'} call`,
          },
          data: {
            id: `group-call-${groupCallId}`,
            kind: 'group_call',
            groupCallId,
            chatId: groupId,
            groupId,
            senderId: String(invitation?.startedBy || groupId).trim(),
            senderName: invitation?.groupName || 'Group call',
            callType: invitation.callType,
            targetUrl: `/groups/chat/${encodeURIComponent(groupId)}`,
          },
        });
      };

      socket.on('group_call_invitation', handleGroupCallInvitation);

      unsubscribeIncomingCallListeners = () => {
        unsubscribeIncomingCall();
        socket.off('group_call_invitation', handleGroupCallInvitation);
      };
    }

    let registrationAttempts = 0;
    const ensurePersonalSocketRoom = () => {
      registrationAttempts += 1;
      socketService.ensureRegisteredCurrentUser({ userId, token }).catch((error) => {
        if (!isActive || registrationAttempts >= 3) {
          console.error('Failed to register for realtime group-call invitations:', error);
          return;
        }
        registrationRetryTimeoutId = window.setTimeout(ensurePersonalSocketRoom, 1500);
      });
    };
    ensurePersonalSocketRoom();

    unsubscribeSocketMessages = socketService.onMessage(async (incomingMessage) => {
      if (!isActive || !isCurrentPushSession()) return;
      // A reaction is a hidden control message: never show its raw text. Tell the
      // author of the reacted message, and nobody else.
      if (isMessageReactionControlMessage(incomingMessage)) {
        const reactionNotification = resolveRealtimeReactionNotification(incomingMessage, userId);
        if (reactionNotification) await maybeShowChatNotification(reactionNotification);
        return;
      }

      await maybeShowChatNotification(resolveRealtimeMessageNotification(incomingMessage));
    });

    const handleLocalChatNotification = async (event) => {
      const { isValid, normalizedNotification } = validateChatNotificationDataFormat(event?.detail || {});
      if (!isValid) {
        return;
      }

      await maybeShowLocalNotification(normalizedNotification);
    };

    window.addEventListener(LOCAL_CHAT_NOTIFICATION_EVENT, handleLocalChatNotification);

    void initializePushNotifications();

    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      const requestNotificationPermissionFromInteraction = () => {
        cleanupNotificationPermissionInteraction();
        void initializePushNotifications({
          requestPermission: true,
          forceRequest: true,
        });
      };
      cleanupNotificationPermissionInteraction = () => {
        window.removeEventListener('pointerdown', requestNotificationPermissionFromInteraction, true);
        window.removeEventListener('keydown', requestNotificationPermissionFromInteraction, true);
      };
      window.addEventListener('pointerdown', requestNotificationPermissionFromInteraction, true);
      window.addEventListener('keydown', requestNotificationPermissionFromInteraction, true);
    }

    const cleanupRealtimeSubscriptions = () => {
      isActive = false;
      cleanupNotificationPermissionInteraction();
      unsubscribeForegroundMessages();
      unsubscribeSocketMessages();
      unsubscribeIncomingCallListeners();
      dismissNotificationToast();
      setActiveIncomingCall(null);
      window.clearTimeout(registrationRetryTimeoutId);
      registrationRetryTimeoutId = null;
      window.removeEventListener(LOCAL_CHAT_NOTIFICATION_EVENT, handleLocalChatNotification);
    };

    window.addEventListener('chatterly:logout-start', cleanupRealtimeSubscriptions);

    return () => {
      window.removeEventListener('chatterly:logout-start', cleanupRealtimeSubscriptions);
      cleanupRealtimeSubscriptions();
    };
  }, [
    dismissNotificationToast,
    openIncomingCallScreen,
    presentIncomingCall,
    pushSessionToken,
    pushSessionUserId,
    showNotificationToast,
  ]);

  useEffect(() => () => {
    if (notificationToastTimeoutRef.current) {
      window.clearTimeout(notificationToastTimeoutRef.current);
      notificationToastTimeoutRef.current = null;
    }
  }, []);

  return activeIncomingCall ? (
    <IncomingCallPrompt call={activeIncomingCall} onAnswer={answerIncomingCall} onReject={rejectIncomingCall} />
  ) : (
    <IncomingChatNotificationToast notification={activeNotificationToast} onOpen={openNotificationToastChat} onDismiss={dismissNotificationToast} />
  );
};

function App() {
  return (
    <ErrorBoundary>
      <NetworkStatusProvider>
        <SocketProvider>
          <CallStateProvider>
            <Router>
              <SessionExpiryManager />
              <PushNotificationBootstrap />
            <ApiFeedbackLayer>
              <NetworkStatusBanner />
              <div className="font-sans antialiased text-[#1A1A1A] bg-[#F8F9FB] min-h-screen">
                <Suspense fallback={<Loader fullScreen={true} text="Loading page..." />}>
                  <Routes>
                    <Route path="/" element={<HomePage />} />
                    <Route path="/features" element={<MarketingPage page="features" />} />
                    <Route path="/platform" element={<MarketingPage page="platform" />} />
                    <Route path="/help" element={<MarketingPage page="help" />} />
                    <Route path="/blog" element={<MarketingPage page="blog" />} />

                    <Route path="/login" element={
                      <PublicRoute>
                        <LoginPage />
                      </PublicRoute>
                    } />
                    
                    <Route path="/otp" element={
                      <PublicRoute>
                        <OtpPage />
                      </PublicRoute>
                    } />

                    <Route path="/create-profile" element={
                      <ProfileSetupRoute>
                        <ProfilePage />
                      </ProfileSetupRoute>
                    } />

                    <Route path="/profile" element={
                      <ProtectedRoute>
                        <Profile />
                      </ProtectedRoute>
                    } />

                    <Route path="/profile/:contactId" element={
                      <ProtectedRoute>
                        <ContactProfile />
                      </ProtectedRoute>
                    } />

                    <Route path="/chats" element={<ProtectedRoute><ChatListPage /></ProtectedRoute>} />
                    <Route path="/calls" element={<ProtectedRoute><ChatListPage /></ProtectedRoute>} />
                    <Route path="/chat" element={<ProtectedRoute><ChatListPage /></ProtectedRoute>} />
                    <Route path="/chat/:chatId/call" element={<ProtectedRoute><ChatListPage /></ProtectedRoute>} />
                    <Route path="/chat/:chatId" element={<ProtectedRoute><ChatListPage /></ProtectedRoute>} />
                    <Route path="/groups" element={<ProtectedRoute><ChatListPage /></ProtectedRoute>} />
                    <Route path="/groups/create" element={<ProtectedRoute><ChatListPage /></ProtectedRoute>} />
                    <Route path="/groups/chat/:chatId" element={<ProtectedRoute><ChatListPage /></ProtectedRoute>} />
                    <Route path="/broadcasts" element={<ProtectedRoute><ChatListPage /></ProtectedRoute>} />
                    <Route path="/broadcasts/create" element={<ProtectedRoute><ChatListPage /></ProtectedRoute>} />
                    <Route path="/broadcasts/chat/:chatId" element={<ProtectedRoute><ChatListPage /></ProtectedRoute>} />
                    <Route path="/profile/edit" element={<ProtectedRoute><ChatListPage /></ProtectedRoute>} />

                    <Route path="/notification-preview" element={<NotificationPreviewPage />} />

                    {/* Sprint 12 · Story 1 — Production Dashboard (admin overview). */}
                    <Route path='/admin/release' element={<ProtectedRoute><AdminDashboardPage initialTab='release' /></ProtectedRoute>} />
                    <Route path="/admin" element={<ProtectedRoute><AdminDashboardPage /></ProtectedRoute>} />
                    <Route path="/admin/production" element={<ProtectedRoute><AdminDashboardPage initialTab="health" /></ProtectedRoute>} />
                    <Route path="/admin/bugs" element={<ProtectedRoute><AdminDashboardPage initialTab="bugs" /></ProtectedRoute>} />
                    <Route path="/admin/analytics" element={<ProtectedRoute><AdminDashboardPage initialTab="analytics" /></ProtectedRoute>} />
                    
                    <Route path="*" element={
                      <div className="flex flex-col items-center justify-center h-screen">
                        <h1 className="text-4xl font-bold mb-2">404</h1>
                        <p className="text-gray-600 mb-4">Page not found</p>
                        <button onClick={() => window.location.replace('/')} className="text-[#4C6EF5] hover:underline">
                          Return Home
                        </button>
                      </div>
                    } />
                  </Routes>
                </Suspense>
              </div>
            </ApiFeedbackLayer>
            </Router>
          </CallStateProvider>
        </SocketProvider>
      </NetworkStatusProvider>
    </ErrorBoundary>
  );
}

export default App;
