import { deleteToken, getMessaging, getToken, isSupported as isMessagingSupported, onMessage } from 'firebase/messaging';
import { app } from '../firebase';
import { saveFcmToken } from '../api/chat';
import { normalizeChatNotification } from './notification';
import { getTonePattern } from './callRingtone';
import { getStoredSessionExpiryReason } from './sessionExpiry';

const FIREBASE_MESSAGING_SW_PATH = '/firebase-messaging-sw.js';
const DEFAULT_NOTIFICATION_ICON = '/favicon.svg';
const PUSH_FCM_TOKEN_STORAGE_KEY = 'chatterly_push_fcm_token';
const PUSH_FCM_TOKEN_USER_STORAGE_KEY = 'chatterly_push_fcm_user';
const PUSH_PERMISSION_PROMPTED_SESSION_KEY = 'chatterly_push_permission_prompted';
const NOTIFICATION_SOUND_VOLUME = 0.28;
// Where the Notification settings screen stores the chosen alert tone. The
// setting used to be written and never read, so every message arrived with the
// same two-note chime whichever tone was picked.
export const NOTIFICATION_TONE_STORAGE_KEY = 'chatterly_notification_tone';
export const GLOBAL_NOTIFICATIONS_ENABLED_STORAGE_KEY = 'chatterly_global_notifications_enabled';
export const NOTIFICATION_SOUND_ENABLED_STORAGE_KEY = 'chatterly_notification_sound_enabled';
export const NOTIFICATION_VIBRATION_ENABLED_STORAGE_KEY = 'chatterly_notification_vibration_enabled';
export const NOTIFICATION_PREVIEW_ENABLED_STORAGE_KEY = 'chatterly_notification_preview_enabled';
export const PUSH_NOTIFICATION_CLICK_EVENT = 'chatterly:push-notification-click';
const NOTIFICATION_VIBRATION_PATTERN = [180, 80, 180];
const INCOMING_CALL_NOTIFICATION_KINDS = new Set([
  'call',
  'incoming-call',
  'incoming_call',
  'call-request',
  'call_request',
  'callrequest',
]);
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

let messagingServiceWorkerRegistrationPromise = null;
let notificationAudioContext = null;
// One clean-up at a time: the logout button, a session expiring and a signed-out
// page load can all ask for it together.
let pushTeardownPromise = null;
// Bumped every time a session ends, so a registration that was still being set
// up for that session can tell it has to be undone.
let pushSessionEpoch = 0;
// deleteToken talks to FCM; a stalled request must not hold up the steps that
// actually stop this browser receiving pushes.
const PUSH_TEARDOWN_TOKEN_TIMEOUT_MS = 6000;

const getCurrentOrigin = () =>
  (typeof window !== 'undefined' && window.location?.origin) || '';

const normalizeOptionalValue = (value, fallback = '') =>
  String(value || fallback || '').trim();

const extractChatIdFromTargetUrl = (targetUrl = '') => {
  const normalizedTargetUrl = normalizeOptionalValue(targetUrl);
  if (!normalizedTargetUrl) {
    return '';
  }

  try {
    const parsedUrl = new URL(normalizedTargetUrl, getCurrentOrigin() || 'http://localhost');
    const matchedChatPath = parsedUrl.pathname.match(/^\/chat\/([^/?#]+)/i);
    return matchedChatPath?.[1] ? decodeURIComponent(matchedChatPath[1]) : '';
  } catch {
    const matchedChatPath = normalizedTargetUrl.match(/\/chat\/([^/?#]+)/i);
    return matchedChatPath?.[1] ? decodeURIComponent(matchedChatPath[1]) : '';
  }
};

const isCallHistoryNotification = (notification = {}) => {
  const notificationKind = normalizeOptionalValue(
    notification?.kind || notification?.type || notification?.event || notification?.action
  ).toLowerCase();
  const callStatus = normalizeOptionalValue(
    notification?.callStatus || notification?.status || notification?.metadata?.callStatus
  ).toLowerCase();
  const messageType = normalizeOptionalValue(
    notification?.messageType || notification?.metadata?.messageType
  ).toLowerCase();
  const notificationText = normalizeOptionalValue(
    notification?.text || notification?.message || notification?.body
  );
  const hasResolvedCallText = /^(?:missed\s+(?:audio|video|voice)\s+(?:group\s+)?call\b|(?:(?:outgoing|incoming)\s+)?(?:audio|video|voice)\s+(?:group\s+)?call\b.*\b(?:not answered|missed|rejected|declined|cancelled|canceled|completed|ended)\b)/i.test(
    notificationText
  );
  const hasCallIdentity = Boolean(
    notification?.callId ||
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

const isIncomingCallNotification = (notification = {}) => {
  if (isCallHistoryNotification(notification)) return false;

  const notificationKind = normalizeOptionalValue(
    notification?.kind || notification?.type || notification?.event || notification?.action
  ).toLowerCase();
  const targetUrl = normalizeOptionalValue(
    notification?.targetUrl || notification?.redir || notification?.redirect || notification?.click_action || notification?.link
  );

  return (
    INCOMING_CALL_NOTIFICATION_KINDS.has(notificationKind) ||
    /\/chat\/[^/]+\/call\/?(?:[?#].*)?$/i.test(targetUrl) ||
    Boolean(notification?.callId && (notification?.callerId || notification?.callType || notification?.mediaType))
  );
};

const getNotificationAudioContext = () => {
  if (typeof window === 'undefined') {
    return null;
  }

  const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextConstructor) {
    return null;
  }

  if (!notificationAudioContext) {
    notificationAudioContext = new AudioContextConstructor();
  }

  return notificationAudioContext;
};

export const getStoredNotificationTone = () => {
  try {
    return localStorage.getItem(NOTIFICATION_TONE_STORAGE_KEY) || 'Default';
  } catch {
    return 'Default';
  }
};

export const prepareNotificationSound = async () => {
  const audioContext = getNotificationAudioContext();
  if (!audioContext) return false;

  try {
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }
    return audioContext.state === 'running';
  } catch {
    return false;
  }
};

export const triggerNotificationVibration = () => {
  if (
    !getStoredGlobalNotificationsEnabled() ||
    !getStoredNotificationVibrationEnabled() ||
    typeof navigator === 'undefined' ||
    typeof navigator.vibrate !== 'function'
  ) {
    return false;
  }

  return navigator.vibrate(NOTIFICATION_VIBRATION_PATTERN);
};

export const getStoredGlobalNotificationsEnabled = () => {
  try {
    return localStorage.getItem(GLOBAL_NOTIFICATIONS_ENABLED_STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
};

export const setStoredGlobalNotificationsEnabled = (enabled) => {
  const nextEnabled = Boolean(enabled);
  try {
    localStorage.setItem(GLOBAL_NOTIFICATIONS_ENABLED_STORAGE_KEY, String(nextEnabled));
    window.dispatchEvent(new CustomEvent('chatterly-global-notifications-changed', {
      detail: { enabled: nextEnabled },
    }));
  } catch {
    // Ignore storage/event failures in restricted browser contexts.
  }
  syncAlertPreferencesToServiceWorker({
    notifications: nextEnabled,
    soundEnabled: getStoredNotificationSoundEnabled(),
    vibrationEnabled: getStoredNotificationVibrationEnabled(),
    popupPreview: getStoredNotificationPreviewEnabled(),
  });
  return nextEnabled;
};

const getStoredBooleanPreference = (key, fallback = true) => {
  try {
    const storedValue = localStorage.getItem(key);
    return storedValue === null ? fallback : storedValue !== 'false';
  } catch {
    return fallback;
  }
};

export const getStoredNotificationSoundEnabled = () =>
  getStoredBooleanPreference(NOTIFICATION_SOUND_ENABLED_STORAGE_KEY);

export const getStoredNotificationVibrationEnabled = () =>
  getStoredBooleanPreference(NOTIFICATION_VIBRATION_ENABLED_STORAGE_KEY);

export const getStoredNotificationPreviewEnabled = () =>
  getStoredBooleanPreference(NOTIFICATION_PREVIEW_ENABLED_STORAGE_KEY);

const syncAlertPreferencesToServiceWorker = (preferences) => {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker) return;

  void navigator.serviceWorker.ready.then((registration) => {
    const workers = new Set([
      navigator.serviceWorker.controller,
      registration.active,
      registration.waiting,
      registration.installing,
    ]);
    workers.forEach((worker) => worker?.postMessage?.({
      type: 'chatterly:notification-preferences',
      preferences,
    }));
  }).catch(() => {});
};

const hasValidStoredPushSession = () => {
  try {
    const token = String(localStorage.getItem('token') || localStorage.getItem('userToken') || '').trim();
    return Boolean(token && !getStoredSessionExpiryReason());
  } catch {
    return false;
  }
};

export const setStoredNotificationAlertPreferences = (settings = {}) => {
  if (settings.notifications !== undefined) {
    setStoredGlobalNotificationsEnabled(settings.notifications !== false);
  }

  try {
    if (settings.soundEnabled !== undefined) {
      localStorage.setItem(
        NOTIFICATION_SOUND_ENABLED_STORAGE_KEY,
        String(settings.soundEnabled !== false)
      );
    }
    if (settings.vibrationEnabled !== undefined) {
      localStorage.setItem(
        NOTIFICATION_VIBRATION_ENABLED_STORAGE_KEY,
        String(settings.vibrationEnabled !== false)
      );
    }
    if (settings.notificationTone !== undefined) {
      localStorage.setItem(
        NOTIFICATION_TONE_STORAGE_KEY,
        String(settings.notificationTone || 'Default')
      );
    }
    if (settings.popupPreview !== undefined) {
      localStorage.setItem(
        NOTIFICATION_PREVIEW_ENABLED_STORAGE_KEY,
        String(settings.popupPreview !== false)
      );
    }
  } catch {
    // Keep the in-memory notification flow usable in restricted contexts.
  }

  const preferences = {
    notifications: getStoredGlobalNotificationsEnabled(),
    soundEnabled: getStoredNotificationSoundEnabled(),
    vibrationEnabled: getStoredNotificationVibrationEnabled(),
    popupPreview: getStoredNotificationPreviewEnabled(),
  };
  syncAlertPreferencesToServiceWorker(preferences);
  return preferences;
};

/**
 * Play the alert for an arriving message. With no argument it plays whichever
 * tone the user selected, which is also what the Settings preview calls - so
 * what is heard there is exactly what a message will sound like.
 */
export const playNotificationSound = async (tone) => {
  if (!getStoredGlobalNotificationsEnabled()) {
    return false;
  }

  const audioContext = getNotificationAudioContext();
  if (!audioContext) {
    return false;
  }

  try {
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    const pattern = getTonePattern(tone || getStoredNotificationTone());
    const now = audioContext.currentTime;
    const lastNoteEnd = pattern.reduce(
      (latest, note) => Math.max(latest, note.delay + note.duration),
      0
    );

    const gain = audioContext.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(NOTIFICATION_SOUND_VOLUME, now + 0.015);
    gain.gain.setValueAtTime(NOTIFICATION_SOUND_VOLUME, now + lastNoteEnd);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + lastNoteEnd + 0.12);
    gain.connect(audioContext.destination);

    pattern.forEach(({ delay, frequency, duration }) => {
      const oscillator = audioContext.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, now + delay);
      oscillator.connect(gain);
      oscillator.start(now + delay);
      oscillator.stop(now + delay + duration);
    });

    window.setTimeout(() => {
      try {
        gain.disconnect();
      } catch {
        // Ignore cleanup errors from already-disconnected audio nodes.
      }
    }, (lastNoteEnd + 0.4) * 1000);

    return true;
  } catch (error) {
    console.error('Unable to play notification sound:', error);
    return false;
  }
};

export const isPushNotificationSupported = async () => {
  if (
    typeof window === 'undefined' ||
    typeof navigator === 'undefined' ||
    typeof Notification === 'undefined' ||
    !('serviceWorker' in navigator)
  ) {
    return false;
  }

  try {
    return await isMessagingSupported();
  } catch (error) {
    console.error('Unable to detect Firebase messaging support:', error);
    return false;
  }
};

export const ensureBrowserNotificationPermission = async ({
  requestPermission = true,
  forceRequest = false,
} = {}) => {
  if (typeof Notification === 'undefined') {
    return {
      supported: false,
      granted: false,
      permission: 'unsupported',
    };
  }

  let permission = Notification.permission;
  if (
    permission === 'default' &&
    requestPermission &&
    typeof sessionStorage !== 'undefined' &&
    (
      forceRequest ||
      sessionStorage.getItem(PUSH_PERMISSION_PROMPTED_SESSION_KEY) !== 'true'
    )
  ) {
    permission = await Notification.requestPermission();
    if (permission === 'default') {
      sessionStorage.removeItem(PUSH_PERMISSION_PROMPTED_SESSION_KEY);
    } else {
      sessionStorage.setItem(PUSH_PERMISSION_PROMPTED_SESSION_KEY, 'true');
    }
  }

  return {
    supported: true,
    granted: permission === 'granted',
    permission,
  };
};

export const getPushNotificationTargetUrl = (notification = {}) => {
  if (isCallHistoryNotification(notification)) {
    return '/calls';
  }

  const explicitTargetUrl = normalizeOptionalValue(
    notification?.targetUrl ||
      notification?.redir ||
      notification?.redirect ||
      notification?.click_action ||
      notification?.link
  );
  const normalizedChatId = normalizeOptionalValue(
    notification?.chatId || notification?.conversationId || notification?.threadId || notification?.callerId || notification?.senderId
  );
  if (isIncomingCallNotification(notification) && normalizedChatId) {
    return `/chat/${encodeURIComponent(normalizedChatId)}/call`;
  }
  if (explicitTargetUrl) {
    return explicitTargetUrl;
  }

  if (normalizedChatId) {
    const normalizedChatType = normalizeOptionalValue(notification?.chatType).toLowerCase();
    const isGroupNotification =
      notification?.isGroup === true ||
      notification?.isGroup === 'true' ||
      normalizedChatType === 'group';
    const isBroadcastNotification =
      notification?.isBroadcast === true ||
      notification?.isBroadcast === 'true' ||
      normalizedChatType === 'broadcast';

    if (isBroadcastNotification) {
      return `/broadcasts/chat/${encodeURIComponent(normalizedChatId)}`;
    }
    if (isGroupNotification) {
      return `/groups/chat/${encodeURIComponent(normalizedChatId)}`;
    }
    return `/chat/${encodeURIComponent(normalizedChatId)}`;
  }
  return '/chats';
};

export const normalizePushNotificationPayload = (payload = {}) => {
  const data = payload?.data || {};
  const notification = payload?.notification || {};
  const explicitTargetUrl = normalizeOptionalValue(
    data?.redir ||
      data?.redirect ||
      data?.click_action ||
      data?.link ||
      payload?.fcmOptions?.link ||
      notification?.click_action ||
      notification?.redir ||
      notification?.link
  );
  const derivedChatIdFromTargetUrl = extractChatIdFromTargetUrl(explicitTargetUrl);

  return normalizeChatNotification({
    id:
      data?.id ||
      data?.messageId ||
      data?.notificationId ||
      payload?.messageId ||
      notification?.tag ||
      '',
    chatId:
      data?.chatId ||
      data?.groupId ||
      data?.conversationId ||
      data?.threadId ||
      derivedChatIdFromTargetUrl ||
      data?.senderId ||
      null,
    senderId:
      data?.senderId ||
      data?.userId ||
      data?.fromUserId ||
      '',
    senderName:
      data?.senderName ||
      data?.name ||
      notification?.title ||
      'New message',
    message:
      data?.text ||
      data?.message ||
      data?.body ||
      notification?.body ||
      'You have a new message.',
    timestamp:
      data?.timestamp ||
      data?.createdAt ||
      new Date().toISOString(),
    kind: data?.kind || data?.type || '',
    type: data?.type || data?.kind || '',
    action: data?.action || '',
    callId: data?.callId || data?.requestId || '',
    callerId: data?.callerId || data?.senderId || data?.fromUserId || '',
    receiverId: data?.receiverId || data?.userId || data?.toUserId || '',
    callType: data?.callType || data?.mediaType || data?.mode || '',
    callStatus: data?.callStatus || data?.status || '',
    messageType: data?.messageType || '',
    startedAt: data?.startedAt || data?.timestamp || data?.createdAt || '',
    profilePic: data?.profilePic || data?.callerProfilePic || data?.callerAvatar || '',
    chatType: data?.chatType || '',
    groupId: data?.groupId || '',
    groupName: data?.groupName || '',
    blockerId: data?.blockerId || '',
    blockerName: data?.blockerName || '',
    blockedUserId: data?.blockedUserId || '',
    systemNoticeKind: data?.systemNoticeKind || '',
    isGroup: data?.isGroup === true || data?.isGroup === 'true',
    targetUrl: explicitTargetUrl || '',
    redir: explicitTargetUrl || '',
  });
};

export const buildPushNotificationOptions = (payload = {}) => {
  const normalizedNotification = normalizePushNotificationPayload(payload);
  const notification = payload?.notification || {};
  const data = payload?.data || {};
  const isIncomingCall = isIncomingCallNotification(normalizedNotification);
  const isSystemNotification = String(data?.kind || normalizedNotification?.kind || '').trim() === 'profile-update';
  const showMessagePreview = isIncomingCall || isSystemNotification || getStoredNotificationPreviewEnabled();

  return {
    body: showMessagePreview
      ? normalizedNotification.text || 'You have a new message.'
      : '',
    icon: normalizeOptionalValue(
      notification?.icon || data?.icon,
      DEFAULT_NOTIFICATION_ICON
    ),
    badge: normalizeOptionalValue(
      notification?.badge || data?.badge,
      DEFAULT_NOTIFICATION_ICON
    ),
    tag:
      normalizeOptionalValue(
        notification?.tag || data?.tag,
        isIncomingCall
          ? `incoming-call-${
              normalizeOptionalValue(
                data?.id || data?.callId || normalizedNotification?.id || normalizedNotification.chatId,
                'chatterly'
              )
            }`
          : normalizedNotification.chatId
          ? `chat-${normalizedNotification.chatId}`
          : normalizedNotification.senderId
            ? `chat-${normalizedNotification.senderId}`
            : 'chatterly-chat'
      ),
    silent: !getStoredNotificationSoundEnabled(),
    renotify: true,
    requireInteraction: isIncomingCall,
    ...(getStoredNotificationVibrationEnabled()
      ? { vibrate: NOTIFICATION_VIBRATION_PATTERN }
      : {}),
    data: {
      chatId: normalizedNotification.chatId || '',
      senderId: normalizedNotification.senderId || '',
      notificationPayload: normalizedNotification,
      targetUrl: getPushNotificationTargetUrl(normalizedNotification),
    },
  };
};

export const registerMessagingServiceWorker = async () => {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker) {
    return null;
  }

  if (!messagingServiceWorkerRegistrationPromise) {
    messagingServiceWorkerRegistrationPromise = navigator.serviceWorker
      .register(FIREBASE_MESSAGING_SW_PATH)
      .then(async (registration) => {
        await navigator.serviceWorker.ready;
        syncAlertPreferencesToServiceWorker({
          notifications: getStoredGlobalNotificationsEnabled(),
          soundEnabled: getStoredNotificationSoundEnabled(),
          vibrationEnabled: getStoredNotificationVibrationEnabled(),
          popupPreview: getStoredNotificationPreviewEnabled(),
          sessionActive: hasValidStoredPushSession(),
        });
        return registration;
      });
  }

  try {
    return await messagingServiceWorkerRegistrationPromise;
  } catch (error) {
    messagingServiceWorkerRegistrationPromise = null;
    throw error;
  }
};

// Incoming-call alerts are shown with `requireInteraction`, so the browser keeps
// them on screen until they are closed explicitly. Every one that is opened is
// tracked here (and, for the service-worker path, by tag) so answering, declining
// or ending the call can take the alert down instead of leaving it up for its
// full 32-second life.
const INCOMING_CALL_NOTIFICATION_TAG_PREFIX = 'incoming-call-';
const openIncomingCallNotifications = new Map();

// Broadcast by whichever screen observes the call leaving its ringing state, so
// the alert can be closed from the one place that opened it.
export const CALL_RINGING_RESOLVED_EVENT = 'chatterly:call-ringing-resolved';

export const notifyIncomingCallResolved = () => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(CALL_RINGING_RESOLVED_EVENT));
};

const isIncomingCallNotificationTag = (tag = '') =>
  String(tag || '').startsWith(INCOMING_CALL_NOTIFICATION_TAG_PREFIX);

const trackIncomingCallNotification = (tag, browserNotification) => {
  if (!isIncomingCallNotificationTag(tag) || !browserNotification) return;

  const trackedNotifications = openIncomingCallNotifications.get(tag) || new Set();
  trackedNotifications.add(browserNotification);
  openIncomingCallNotifications.set(tag, trackedNotifications);

  const forget = () => {
    const currentNotifications = openIncomingCallNotifications.get(tag);
    if (!currentNotifications) return;
    currentNotifications.delete(browserNotification);
    if (!currentNotifications.size) openIncomingCallNotifications.delete(tag);
  };

  browserNotification.addEventListener?.('close', forget);
  browserNotification.addEventListener?.('error', forget);
};

/**
 * Close every incoming-call alert this tab opened. Called when the call stops
 * ringing for any reason - answered, declined, missed, cancelled or ended.
 */
export const dismissIncomingCallNotifications = async () => {
  openIncomingCallNotifications.forEach((trackedNotifications) => {
    trackedNotifications.forEach((browserNotification) => {
      try {
        browserNotification.close();
      } catch {
        // The alert may already have been dismissed by the user.
      }
    });
  });
  openIncomingCallNotifications.clear();

  // The service-worker path owns its own notifications, so they have to be
  // looked up by tag and closed separately.
  try {
    const registration = await registerMessagingServiceWorker();
    if (typeof registration?.getNotifications !== 'function') return;

    const notifications = await registration.getNotifications();
    notifications
      .filter((notification) => isIncomingCallNotificationTag(notification?.tag))
      .forEach((notification) => notification.close());
  } catch {
    // No service worker (or it is unavailable) - the window notifications above
    // are then the only delivery path and have already been closed.
  }
};

export const showForegroundPushNotification = async (payload = {}) => {
  if (!hasValidStoredPushSession() || !getStoredGlobalNotificationsEnabled()) {
    return false;
  }

  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
    return false;
  }

  const normalizedNotification = normalizePushNotificationPayload(payload);
  const notificationTitle =
    normalizeOptionalValue(
      payload?.notification?.title,
      normalizedNotification.senderName || 'New message'
    ) || 'New message';
  const notificationOptions = buildPushNotificationOptions(payload);
  const showWindowNotification = () => {
    const browserNotification = new Notification(notificationTitle, notificationOptions);
    trackIncomingCallNotification(notificationOptions.tag, browserNotification);
    window.setTimeout(() => browserNotification.close(), 32000);
    browserNotification.onclick = () => {
      browserNotification.close();
      window.focus();
      window.dispatchEvent(new CustomEvent(PUSH_NOTIFICATION_CLICK_EVENT, {
        detail: notificationOptions.data,
      }));
    };
    return true;
  };

  // Use one service-worker-owned delivery path for incoming calls and FCM.
  // Socket and background-push delivery then share the same call-specific tag,
  // so the browser replaces a duplicate instead of leaving a second clickable
  // alert behind. A window Notification remains the compatibility fallback.
  try {
    const registration = await registerMessagingServiceWorker();
    if (registration?.showNotification) {
      await registration.showNotification(notificationTitle, notificationOptions);
      if (
        notificationOptions.requireInteraction &&
        typeof registration.getNotifications === 'function'
      ) {
        window.setTimeout(() => {
          registration
            .getNotifications({ tag: notificationOptions.tag })
            .then((notifications = []) => notifications.forEach((notification) => notification.close()))
            .catch(() => {});
        }, 32000);
      }
      return true;
    }
  } catch (error) {
    console.error('Unable to show notification using service worker registration:', error);
  }

  try {
    return showWindowNotification();
  } catch (error) {
    console.error('Unable to show browser notification:', error);
    return false;
  }
};

export const ensurePushNotificationsForUser = async ({
  userId,
  requestPermission = true,
} = {}) => {
  const normalizedUserId = normalizeOptionalValue(userId);
  if (!normalizedUserId) {
    return { enabled: false, reason: 'missing-user' };
  }

  // A sign-out clean-up that is still running would otherwise unregister the
  // service worker this call is about to register.
  await pushTeardownPromise;
  const sessionEpoch = pushSessionEpoch;
  if (!hasValidStoredPushSession()) {
    return { enabled: false, reason: 'session-ended' };
  }

  const notificationPermissionState = await ensureBrowserNotificationPermission({
    requestPermission,
  });
  const permission = notificationPermissionState.permission;

  const isSupported = await isPushNotificationSupported();
  if (!isSupported) {
    return { enabled: false, permission, reason: 'unsupported' };
  }

  if (permission !== 'granted') {
    return { enabled: false, permission, reason: 'permission-not-granted' };
  }

  const vapidKey = normalizeOptionalValue(import.meta.env.VITE_FIREBASE_VAPID_KEY);
  if (!vapidKey) {
    console.error('VITE_FIREBASE_VAPID_KEY is missing. Push notifications cannot be enabled.');
    return { enabled: false, permission, reason: 'missing-vapid-key' };
  }

  // The permission prompt can sit open for as long as the user likes; the
  // session may have ended by the time it is answered.
  if (sessionEpoch !== pushSessionEpoch || !hasValidStoredPushSession()) {
    return { enabled: false, permission, reason: 'session-ended' };
  }

  const registration = await registerMessagingServiceWorker();
  const messaging = getMessaging(app);
  const fcmToken = await getToken(messaging, {
    vapidKey,
    serviceWorkerRegistration: registration,
  });

  // Creating the subscription takes a network round trip. If the session ended
  // meanwhile, undo it - otherwise the browser keeps receiving that account's
  // notifications while signed out (BUG_USR_199).
  if (sessionEpoch !== pushSessionEpoch || !hasValidStoredPushSession()) {
    await pushTeardownPromise;
    await disablePushNotificationsForCurrentDevice();
    return { enabled: false, permission, reason: 'session-ended' };
  }

  if (!fcmToken) {
    return { enabled: false, permission, registration, reason: 'missing-token' };
  }

  const storedToken =
    typeof localStorage !== 'undefined'
      ? localStorage.getItem(PUSH_FCM_TOKEN_STORAGE_KEY)
      : '';
  const storedUserId =
    typeof localStorage !== 'undefined'
      ? localStorage.getItem(PUSH_FCM_TOKEN_USER_STORAGE_KEY)
      : '';

  if (storedToken !== fcmToken || storedUserId !== normalizedUserId) {
    await saveFcmToken(normalizedUserId, fcmToken);
    // If the session ended while the token was being saved, its clean-up has
    // already forgotten this token; writing it back would leave a stale record
    // on a signed-out device.
    if (sessionEpoch !== pushSessionEpoch) {
      return { enabled: false, permission, reason: 'session-ended' };
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(PUSH_FCM_TOKEN_STORAGE_KEY, fcmToken);
      localStorage.setItem(PUSH_FCM_TOKEN_USER_STORAGE_KEY, normalizedUserId);
    }
  }

  return {
    enabled: true,
    permission,
    registration,
    token: fcmToken,
  };
};

const isMessagingServiceWorkerRegistration = (registration) => {
  const scriptUrl =
    registration?.active?.scriptURL ||
    registration?.waiting?.scriptURL ||
    registration?.installing?.scriptURL ||
    '';
  return scriptUrl.includes('firebase-messaging-sw.js');
};

const removePushRegistration = async () => {
  syncAlertPreferencesToServiceWorker({
    notifications: false,
    sessionActive: false,
  });
  // Remove the FCM registration token so the backend stops targeting this
  // device with push notifications after the user logs out.
  try {
    if (await isPushNotificationSupported()) {
      const messaging = getMessaging(app);
      await Promise.race([
        deleteToken(messaging),
        new Promise((resolve) => setTimeout(resolve, PUSH_TEARDOWN_TOKEN_TIMEOUT_MS)),
      ]);
    }
  } catch (error) {
    console.error('Unable to delete FCM token during logout:', error);
  }

  // Unregister the messaging service worker so any queued background pushes are
  // not displayed once the user is signed out (e.g. on the login page).
  try {
    if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        registrations
          .filter(isMessagingServiceWorkerRegistration)
          .map(async (registration) => {
            // deleteToken only unsubscribes the registration Firebase holds for
            // this page load; drop this one's browser subscription directly so
            // pushes stop being delivered to it.
            try {
              const subscription = await registration.pushManager?.getSubscription?.();
              await subscription?.unsubscribe();
            } catch {
              // Unregistering below removes the subscription as well.
            }
            return registration.unregister();
          })
      );
    }
  } catch (error) {
    console.error('Unable to unregister messaging service worker during logout:', error);
  }

  messagingServiceWorkerRegistrationPromise = null;

  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(PUSH_FCM_TOKEN_STORAGE_KEY);
    localStorage.removeItem(PUSH_FCM_TOKEN_USER_STORAGE_KEY);
  }

  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem(PUSH_PERMISSION_PROMPTED_SESSION_KEY);
  }
};

export const disablePushNotificationsForCurrentDevice = () => {
  // The logout button, a session expiring and a signed-out page load can all
  // ask for this at once; they share one run instead of racing each other.
  if (!pushTeardownPromise) {
    pushTeardownPromise = removePushRegistration()
      .catch((error) => {
        console.error('Unable to finish removing push notifications:', error);
      })
      .finally(() => {
        pushTeardownPromise = null;
      });
  }
  return pushTeardownPromise;
};

const hasPushRegistrationToClear = async () => {
  try {
    if (localStorage.getItem(PUSH_FCM_TOKEN_STORAGE_KEY)) return true;
  } catch {
    // Storage can be blocked; the service worker check below still applies.
  }

  try {
    if (typeof navigator === 'undefined' || !navigator.serviceWorker?.getRegistrations) {
      return false;
    }
    const registrations = await navigator.serviceWorker.getRegistrations();
    return registrations.some(isMessagingServiceWorkerRegistration);
  } catch {
    return false;
  }
};

// Removes the push registration a finished session leaves in this browser. Does
// nothing unless one exists, so it is safe on every signed-out page load.
export const clearStalePushRegistration = async () => {
  if (!(await hasPushRegistrationToClear())) return false;
  await disablePushNotificationsForCurrentDevice();
  return true;
};

if (typeof window !== 'undefined') {
  // Every way a session ends - the logout button, inactivity expiry, a rejected
  // token, the admin sign-out - raises this event. The registration used to be
  // removed only by the chat screen's logout button, so any other way of signing
  // out left the service worker showing that account's notifications on the
  // login page (BUG_USR_199).
  window.addEventListener('chatterly:logout-start', () => {
    pushSessionEpoch += 1;
    void clearStalePushRegistration().catch((error) => {
      console.error('Unable to clear push notifications after the session ended:', error);
    });
  });
}

export const subscribeToForegroundPushMessages = (callback) => {
  let isSubscribed = true;

  const unsubscribePromise = (async () => {
    const isSupported = await isPushNotificationSupported();
    if (!isSupported) {
      return () => {};
    }

    const messaging = getMessaging(app);
    return onMessage(messaging, (payload) => {
      if (!isSubscribed) return;
      callback?.(payload, normalizePushNotificationPayload(payload));
    });
  })();

  return () => {
    isSubscribed = false;
    void unsubscribePromise.then((unsubscribe) => {
      try {
        unsubscribe?.();
      } catch (error) {
        console.error('Unable to unsubscribe from foreground push messages:', error);
      }
    });
  };
};
