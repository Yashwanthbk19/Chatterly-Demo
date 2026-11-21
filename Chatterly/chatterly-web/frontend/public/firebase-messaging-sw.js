importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyDJlrzgpLLZ46c_3bcKcsHPw_hfL_e6ivQ',
  authDomain: 'stackly-chatterly.firebaseapp.com',
  projectId: 'stackly-chatterly',
  storageBucket: 'stackly-chatterly.firebasestorage.app',
  messagingSenderId: '899974576436',
  appId: '1:899974576436:web:d9bfeee4332f00e2184d61',
});

const DEFAULT_NOTIFICATION_ICON = '/favicon.svg';
const FALLBACK_TARGET_URL = '/chats';
const NOTIFICATION_VIBRATION_PATTERN = [180, 80, 180];
const PUSH_NOTIFICATION_CLICK_EVENT = 'chatterly:push-notification-click';
const NOTIFICATION_PREFERENCES_CACHE = 'chatterly-notification-preferences-v1';
const NOTIFICATION_PREFERENCES_URL = new URL(
  '/__chatterly_notification_preferences__',
  self.location.origin
).toString();
const DEFAULT_NOTIFICATION_PREFERENCES = {
  sessionActive: false,
  notifications: true,
  soundEnabled: true,
  vibrationEnabled: true,
  popupPreview: true,
};
let notificationPreferences = { ...DEFAULT_NOTIFICATION_PREFERENCES };

const normalizeNotificationPreferences = (preferences = {}) => ({
  sessionActive:
    preferences.sessionActive === true ||
    (preferences.sessionActive === undefined && notificationPreferences.sessionActive === true),
  notifications: preferences.notifications !== false,
  soundEnabled: preferences.soundEnabled !== false,
  vibrationEnabled: preferences.vibrationEnabled !== false,
  popupPreview: preferences.popupPreview !== false,
});

const persistNotificationPreferences = async (preferences = {}) => {
  notificationPreferences = normalizeNotificationPreferences(preferences);
  try {
    const cache = await caches.open(NOTIFICATION_PREFERENCES_CACHE);
    await cache.put(
      NOTIFICATION_PREFERENCES_URL,
      new Response(JSON.stringify(notificationPreferences), {
        headers: { 'Content-Type': 'application/json' },
      })
    );
  } catch {
    // The current worker can still use the in-memory preference snapshot.
  }
  return notificationPreferences;
};

const readNotificationPreferences = async () => {
  try {
    const cache = await caches.open(NOTIFICATION_PREFERENCES_CACHE);
    const response = await cache.match(NOTIFICATION_PREFERENCES_URL);
    if (response) {
      notificationPreferences = normalizeNotificationPreferences(await response.json());
    }
  } catch {
    // Use defaults until the signed-in page sends the current server settings.
  }
  return notificationPreferences;
};

self.addEventListener('message', (event) => {
  if (event?.data?.type !== 'chatterly:notification-preferences') return;
  event.waitUntil(persistNotificationPreferences(event.data.preferences));
});
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

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

const normalizeOptionalValue = (value, fallback = '') =>
  String(value || fallback || '').trim();

const isCallHistoryNotification = (notification = {}) => {
  const notificationType = normalizeOptionalValue(
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
      notificationType.includes('call') ||
      /\bcall\b/i.test(notificationText)
  );

  return (
    CALL_HISTORY_NOTIFICATION_KINDS.has(notificationType) ||
    (hasCallIdentity && CALL_HISTORY_STATUSES.has(callStatus)) ||
    (messageType === 'call' && hasResolvedCallText) ||
    hasResolvedCallText
  );
};

const extractChatIdFromTargetUrl = (targetUrl = '') => {
  const normalizedTargetUrl = normalizeOptionalValue(targetUrl);
  if (!normalizedTargetUrl) {
    return '';
  }

  try {
    const parsedUrl = new URL(normalizedTargetUrl, self.location.origin);
    const matchedChatPath = parsedUrl.pathname.match(/^\/chat\/([^/?#]+)/i);
    return matchedChatPath?.[1] ? decodeURIComponent(matchedChatPath[1]) : '';
  } catch {
    const matchedChatPath = normalizedTargetUrl.match(/\/chat\/([^/?#]+)/i);
    return matchedChatPath?.[1] ? decodeURIComponent(matchedChatPath[1]) : '';
  }
};

const normalizePushNotificationPayload = (payload = {}) => {
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

  return {
    id:
      normalizeOptionalValue(
        data?.id ||
          data?.messageId ||
          data?.notificationId ||
          payload?.messageId ||
          notification?.tag
      ) || `push-${Date.now()}`,
    chatId: normalizeOptionalValue(
      data?.chatId ||
        data?.conversationId ||
        data?.threadId ||
        derivedChatIdFromTargetUrl ||
        data?.senderId
    ),
    senderId: normalizeOptionalValue(
      data?.senderId ||
        data?.userId ||
        data?.fromUserId
    ),
    senderName:
      normalizeOptionalValue(
        data?.senderName ||
          data?.name ||
          notification?.title
      ) || 'New message',
    text:
      normalizeOptionalValue(
        data?.text ||
          data?.message ||
          data?.body ||
          notification?.body
      ) || 'You have a new message.',
    timestamp:
      normalizeOptionalValue(
        data?.timestamp ||
          data?.createdAt
      ) || new Date().toISOString(),
    targetUrl: explicitTargetUrl || '',
    redir: explicitTargetUrl || '',
    kind: normalizeOptionalValue(data?.kind || data?.type),
    type: normalizeOptionalValue(data?.type || data?.kind),
    action: normalizeOptionalValue(data?.action),
    callStatus: normalizeOptionalValue(data?.callStatus || data?.status),
    messageType: normalizeOptionalValue(data?.messageType),
    callId: normalizeOptionalValue(data?.callId || data?.requestId),
    callerId: normalizeOptionalValue(data?.callerId || data?.senderId || data?.fromUserId),
    receiverId: normalizeOptionalValue(data?.receiverId || data?.userId || data?.toUserId),
    callType: normalizeOptionalValue(data?.callType || data?.mediaType || data?.mode),
    startedAt: normalizeOptionalValue(data?.startedAt || data?.timestamp || data?.createdAt),
    profilePic: normalizeOptionalValue(data?.profilePic || data?.callerProfilePic || data?.callerAvatar),
  };
};

const isIncomingCallNotification = (notification = {}) => {
  if (isCallHistoryNotification(notification)) return false;

  const notificationType = normalizeOptionalValue(
    notification?.kind || notification?.type || notification?.event || notification?.action
  ).toLowerCase();
  const targetUrl = normalizeOptionalValue(
    notification?.targetUrl || notification?.redir || notification?.redirect || notification?.click_action || notification?.link
  );

  return (
    INCOMING_CALL_NOTIFICATION_KINDS.has(notificationType) ||
    /\/chat\/[^/]+\/call\/?(?:[?#].*)?$/i.test(targetUrl) ||
    Boolean(notification?.callId && (notification?.callerId || notification?.callType))
  );
};

const getNotificationTargetUrl = (normalizedNotification = {}, payload = {}) => {
  const data = payload?.data || {};
  const notification = payload?.notification || {};
  const notificationType = normalizeOptionalValue(data?.type || data?.kind).toLowerCase();
  const explicitTarget =
    normalizeOptionalValue(
      data?.redir ||
        data?.redirect ||
      data?.click_action ||
        data?.link ||
        payload?.fcmOptions?.link ||
        notification?.click_action ||
        notification?.redir ||
        notification?.link
    );

  const normalizedChatId = normalizeOptionalValue(normalizedNotification?.chatId);
  if (isCallHistoryNotification(normalizedNotification)) {
    return '/calls';
  }

  if (
    normalizedChatId &&
    (
      INCOMING_CALL_NOTIFICATION_KINDS.has(notificationType) ||
      isIncomingCallNotification(normalizedNotification)
    )
  ) {
    return `/chat/${encodeURIComponent(normalizedChatId)}/call`;
  }
  if (explicitTarget) {
    return explicitTarget;
  }

  if (normalizedChatId) {
    return `/chat/${encodeURIComponent(normalizedChatId)}`;
  }

  return FALLBACK_TARGET_URL;
};

const buildNotificationOptions = (payload = {}, normalizedNotification = {}, preferences = DEFAULT_NOTIFICATION_PREFERENCES) => {
  const notification = payload?.notification || {};
  const data = payload?.data || {};
  const isIncomingCall = isIncomingCallNotification(normalizedNotification);
  const showMessagePreview = isIncomingCall || preferences.popupPreview !== false;

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
                data?.callId || data?.id || normalizedNotification.id || normalizedNotification.chatId,
                'chatterly'
              )
            }`
          : normalizedNotification.chatId
          ? `chat-${normalizedNotification.chatId}`
          : normalizedNotification.senderId
            ? `chat-${normalizedNotification.senderId}`
            : 'chatterly-chat'
      ),
    silent: preferences.soundEnabled === false,
    renotify: true,
    requireInteraction: isIncomingCall,
    ...(preferences.vibrationEnabled !== false
      ? { vibrate: NOTIFICATION_VIBRATION_PATTERN }
      : {}),
    data: {
      chatId: normalizedNotification.chatId || '',
      senderId: normalizedNotification.senderId || '',
      notificationPayload: normalizedNotification,
      targetUrl: getNotificationTargetUrl(normalizedNotification, payload),
    },
  };
};

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const notificationData = event.notification?.data || {};
  const firebaseMessage = notificationData?.FCM_MSG || {};
  const embeddedPayload = notificationData?.notificationPayload || firebaseMessage?.data || notificationData;
  const normalizedNotification = normalizePushNotificationPayload({
    data: embeddedPayload,
    notification: firebaseMessage?.notification || {},
    fcmOptions: firebaseMessage?.fcmOptions || {},
  });
  const normalizedPayloadIsIncomingCall = isIncomingCallNotification({
    ...embeddedPayload,
    ...normalizedNotification,
  });
  const resolvedTargetUrl = getNotificationTargetUrl(normalizedNotification, {
      data: embeddedPayload,
      notification: firebaseMessage?.notification || {},
      fcmOptions: firebaseMessage?.fcmOptions || {},
    });
  const targetUrl = normalizeOptionalValue(
    normalizedPayloadIsIncomingCall
      ? resolvedTargetUrl
      : notificationData?.targetUrl || resolvedTargetUrl,
    FALLBACK_TARGET_URL
  );
  const isIncomingCall = isIncomingCallNotification({
    ...embeddedPayload,
    ...normalizedNotification,
    targetUrl,
  });
  const isCallHistory = isCallHistoryNotification({
    ...embeddedPayload,
    ...normalizedNotification,
    targetUrl,
  });
  if (isIncomingCall || isCallHistory) event.stopImmediatePropagation();
  const notificationPayload = {
    ...embeddedPayload,
    ...normalizedNotification,
    targetUrl,
    redir: targetUrl,
  };

  const buildLaunchUrl = () => {
    const launchUrl = new URL(targetUrl, self.location.origin);
    if (isCallHistory) {
      launchUrl.searchParams.set('callHistory', '1');
      [
        ['callId', notificationPayload.callId],
        ['callerId', notificationPayload.callerId || notificationPayload.senderId],
        ['callType', notificationPayload.callType],
        ['callStatus', notificationPayload.callStatus || 'missed'],
        ['startedAt', notificationPayload.startedAt || notificationPayload.timestamp],
        ['callerName', notificationPayload.senderName],
        ['profilePic', notificationPayload.profilePic],
      ].forEach(([key, value]) => {
        if (normalizeOptionalValue(value)) launchUrl.searchParams.set(key, value);
      });
      return launchUrl.toString();
    }

    if (!isIncomingCall) return launchUrl.toString();

    launchUrl.searchParams.set('incomingCall', '1');
    [
      ['callId', notificationPayload.callId],
      ['callerId', notificationPayload.callerId || notificationPayload.senderId],
      ['callType', notificationPayload.callType],
      ['startedAt', notificationPayload.startedAt || notificationPayload.timestamp],
      ['callerName', notificationPayload.senderName],
      ['profilePic', notificationPayload.profilePic],
    ].forEach(([key, value]) => {
      if (normalizeOptionalValue(value)) launchUrl.searchParams.set(key, value);
    });
    return launchUrl.toString();
  };
  const absoluteTargetUrl = buildLaunchUrl();

  event.waitUntil(
    Promise.all([
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }),
      isIncomingCall && self.registration.getNotifications
        ? self.registration.getNotifications()
        : Promise.resolve([]),
    ]).then(([clientList, notifications]) => {
      if (isIncomingCall) {
        notifications.forEach((notification) => {
          const data = notification?.data || {};
          const candidatePayload = data?.notificationPayload || data?.FCM_MSG?.data || data;
          if (isIncomingCallNotification(candidatePayload)) notification.close();
        });
      }

      const matchingClient =
        clientList.find((client) => client.url.startsWith(self.location.origin) && client.focused) ||
        clientList.find((client) => client.url.startsWith(self.location.origin) && client.visibilityState === 'visible') ||
        clientList.find((client) => client.url.startsWith(self.location.origin));

      if (matchingClient) {
        // A background/frozen tab can miss postMessage while React is still
        // mounting. Incoming calls therefore navigate the client to the
        // metadata-bearing URL itself; ChatListPage can restore the ringing
        // screen from its query string even after a full tab wake-up.
        if ((isIncomingCall || isCallHistory) && typeof matchingClient.navigate === 'function') {
          return matchingClient
            .navigate(absoluteTargetUrl)
            .then((navigatedClient) => (navigatedClient || matchingClient).focus())
            .catch(() => matchingClient.focus().then(() => {
              matchingClient.postMessage({
                type: PUSH_NOTIFICATION_CLICK_EVENT,
                notificationData: {
                  chatId: normalizedNotification.chatId || '',
                  senderId: normalizedNotification.senderId || '',
                  targetUrl,
                  notificationPayload,
                },
              });
            }));
        }

        return matchingClient.focus().then(() => {
          matchingClient.postMessage({
            type: PUSH_NOTIFICATION_CLICK_EVENT,
            notificationData: {
              chatId: normalizedNotification.chatId || '',
              senderId: normalizedNotification.senderId || '',
              targetUrl,
              notificationPayload,
            },
          });
        });
      }

      return self.clients.openWindow(absoluteTargetUrl);
    })
  );
});

// Register Firebase Messaging only after Chatterly's click listener. Firebase
// installs its own listener for automatically displayed notification payloads;
// registering ours first lets incoming-call clicks retain their call metadata
// instead of being reduced to Firebase's generic app-root navigation.
const messaging = firebase.messaging();

messaging.onBackgroundMessage(async (payload = {}) => {
  const normalizedNotification = normalizePushNotificationPayload(payload);
  const preferences = await readNotificationPreferences();
  const notificationTitle =
    preferences.popupPreview === false && !isIncomingCallNotification(normalizedNotification)
      ? 'New Message'
      : normalizeOptionalValue(
          payload?.notification?.title,
          normalizedNotification.senderName
        ) || 'New message';

  // FCM notification payloads can be displayed automatically before this
  // callback runs. Remove that copy before showing the Chatterly-owned one so a
  // single incoming call cannot leave two independently clickable alerts.
  if (payload?.notification && typeof self.registration.getNotifications === 'function') {
    try {
      const displayedNotifications = await self.registration.getNotifications();
      displayedNotifications.forEach((notification) => {
        const firebaseData = notification?.data?.FCM_MSG?.data || {};
        const sameMessage =
          normalizeOptionalValue(notification?.data?.FCM_MSG?.messageId) === normalizeOptionalValue(payload?.messageId);
        const sameCall =
          normalizeOptionalValue(firebaseData?.callId) &&
          normalizeOptionalValue(firebaseData.callId) === normalizeOptionalValue(payload?.data?.callId);
        if (sameMessage || sameCall) notification.close();
      });
    } catch {
      // The custom notification below is still usable if enumeration is blocked.
    }
  }

  if (!preferences.sessionActive || preferences.notifications === false) return;

  await self.registration.showNotification(
    notificationTitle,
    buildNotificationOptions(payload, normalizedNotification, preferences)
  );
});
