import Constants from 'expo-constants';
import type {Notification, NotificationResponse} from 'expo-notifications';
import {AppState, Linking, Platform} from 'react-native';
import type {EventSubscription} from 'expo-modules-core';
import type {ChatListItem, ConversationContact} from '../types/chat';
import type {IncomingCall} from '../types/call';
import {enrichChatList, getChatList, normalizeChatList} from './chatApi';
import {saveDevicePushToken} from './notificationApi';
import {getConversationMuted} from './conversationPreferences';
import {loadStoredNotificationSettings} from './notificationPreferencesApi';
import {getChatListActivities} from './chatListActivity';
import {getSession} from './sessionStore';
import {publishUnreadChatCount} from './unreadBadge';
import {publishCallActivity, subscribeToCallActivity, type CallActivity} from './callActivity';
import {playNotificationTone} from './callRingtone';
import {androidNotificationVibration} from './notificationVibration';
import {subscribeToLiveMessages} from './chatRealtime';
import {messagePreview} from '../utils/messagePreview';
import {vibrateMessageOnce} from './messageVibrationDelivery';

const MESSAGE_CHANNEL_ID = 'messages';
const CALL_CHANNEL_ID = 'calls';
const MISSED_CALL_CATEGORY_ID = 'missed_call';
const CALLBACK_ACTION_ID = 'callback';
const MESSAGE_ACTION_ID = 'message';
const INCOMING_CALL_CATEGORY_ID = 'incoming_call';
const incomingAlerts = new Set<string>();
const appIsActive = () => AppState.currentState === 'active';
const handledResponses = new Map<string, number>();
const presentedCallActivities = new Set<string>();
let activeChatId = '';
let activeContactName = '';

type NotificationsRuntime = typeof import('expo-notifications');

/**
 * Remote notifications were removed from Expo Go on Android in SDK 53. More
 * importantly, importing expo-notifications there throws before React can
 * render. Keep the native package completely out of the Expo Go execution
 * path; a development/release build loads it normally.
 */
function loadNotificationsRuntime(): NotificationsRuntime | null {
  if (Constants.appOwnership === 'expo') { return null; }
  try {
    return require('expo-notifications') as NotificationsRuntime;
  } catch {
    return null;
  }
}

const Notifications = loadNotificationsRuntime();

export type NotificationTarget = {
  chatId?: string;
  contactId?: string;
  contactName?: string;
  groupId?: string;
  groupName?: string;
  callType?: 'audio' | 'video';
  action?: 'callback' | 'message';
};

// Shared with the Android call notification actions.
export type IncomingCallNotificationAction = 'accept' | 'reject';

export function incomingCallFromNotification(notification: Notification): IncomingCall | null {
  const content = notification.request.content;
  const data = content.data || {};
  const kind = stringValue(data.type || data.notificationType || data.kind).toLowerCase().replace(/-/g, '_');
  const callId = stringValue(data.callId || data.id);
  const callerId = stringValue(data.callerId || data.senderId || data.userId);
  if (['missed_call', 'dialed_call', 'answered_call'].includes(kind)) { return null; }
  if (kind !== 'incoming_call' && !(callId && callerId)) { return null; }
  if (!callId || !callerId) { return null; }
  return {
    callId,
    chatId: stringValue(data.chatId || data.conversationId),
    callerId,
    receiverId: stringValue(data.receiverId) || undefined,
    callerName: stringValue(data.callerName || data.senderName || content.title) || 'Unknown caller',
    callerProfilePic: stringValue(
      data.callerProfilePic || data.callerProfilePicture ||
      data.senderProfilePic || data.senderProfilePicture ||
      data.profilePic || data.profilePicture || data.avatar ||
      data.photoURL || data.photoUrl,
    ) || null,
    type: stringValue(data.callType || data.mediaType).toLowerCase() === 'video' ? 'video' : 'audio',
    status: 'calling',
    createdAt: stringValue(data.createdAt) || undefined,
  };
}

/** Socket-delivered calls also need a system alert when the app is not visible. */
export async function notifyIncomingCall(call: IncomingCall): Promise<void> {
  if (AppState.currentState === 'active' || call.conference || call.status !== 'calling' ||
      !Notifications?.scheduleNotificationAsync || incomingAlerts.has(call.callId)) return;
  incomingAlerts.add(call.callId);
  try {
    const settings = await loadStoredNotificationSettings();
    if (!settings.notifications || !settings.callNotifications) return;
    const existing = await Notifications.getPresentedNotificationsAsync?.() || [];
    if (existing.some(notification => incomingCallFromNotification(notification)?.callId === call.callId)) return;
    const soundEnabled = settings.soundEnabled && settings.callRingtone;
    const vibrationMode = settings.vibrationEnabled ? settings.callVibration : 'Turned Off';
    const vibrationPattern = androidNotificationVibration(vibrationMode);
    const channelId = `incoming-calls-v2-${soundEnabled ? 'sound' : 'silent'}-${vibrationMode === 'Turned Off' ? 'off' : vibrationMode.toLowerCase()}`;
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync?.(channelId, {
        name: 'Incoming calls', importance: Notifications.AndroidImportance.HIGH,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        sound: soundEnabled ? 'incoming_call.wav' : null,
        enableVibrate: Boolean(vibrationPattern),
        vibrationPattern,
      });
    }
    if (!incomingAlerts.has(call.callId)) return;
    if (appIsActive()) { incomingAlerts.delete(call.callId); return; }
    await Notifications.scheduleNotificationAsync({
      identifier: `incoming-call:${call.callId}`,
      content: {
        title: call.callerName || 'Incoming call', body: `Incoming ${call.type} call`,
        categoryIdentifier: INCOMING_CALL_CATEGORY_ID,
        sound: soundEnabled ? 'default' : false,
        data: {type: 'incoming_call', callId: call.callId, callerId: call.callerId,
          callerName: call.callerName, callerProfilePic: call.callerProfilePic || '',
          chatId: call.chatId || '', callType: call.type},
      },
      trigger: Platform.OS === 'android' ? {channelId} : null,
    });
    if (!incomingAlerts.has(call.callId)) {
      await Notifications.dismissNotificationAsync?.(`incoming-call:${call.callId}`);
    }
  } catch {
    incomingAlerts.delete(call.callId);
  }
}

/** A conference invitation delivered as a push (backend groupCallSocket FCM). */
export type GroupCallNotification = {
  groupCallId: string;
  groupId: string;
  groupName: string;
  type: 'audio' | 'video';
};

export function groupCallFromNotification(notification: Notification): GroupCallNotification | null {
  const content = notification.request.content;
  const data = content.data || {};
  const kind = stringValue(data.type || data.notificationType || data.kind).toLowerCase().replace(/-/g, '_');
  const groupCallId = stringValue(data.groupCallId);
  if (kind !== 'group_call' || !groupCallId) { return null; }

  // The backend titles every one of these "Group Call" and puts the group in
  // the body: "<group> started a <type> call".
  const body = stringValue(content.body);
  const named = /^(.*?)\s+started a\s+(?:audio|video)\s+call$/i.exec(body);

  return {
    groupCallId,
    groupId: stringValue(data.groupId),
    groupName: named?.[1]?.trim() || 'Group Call',
    type: stringValue(data.callType).toLowerCase() === 'audio' ? 'audio' : 'video',
  };
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function callActivityKind(notification: Notification): string {
  const data = notification.request.content.data || {};
  const kind = stringValue(data.type || data.notificationType || data.kind).toLowerCase().replace(/-/g, '_');
  return ['missed_call', 'dialed_call', 'answered_call'].includes(kind) ? kind : '';
}

function callActivityKey(callId: string, kind: string): string {
  return `${getSession()?.user?.id || ''}:${callId}:${kind}`;
}

function rememberCallActivity(key: string): void {
  presentedCallActivities.add(key);
  if (presentedCallActivities.size > 256) presentedCallActivities.delete(presentedCallActivities.values().next().value!);
}

/** Local alerts for call states the backend exposes over sockets, not pushes. */
export async function notifyCallActivity(activity: CallActivity): Promise<void> {
  incomingAlerts.delete(activity.callId);
  if (activity.status !== 'dialed' && typeof Notifications?.getPresentedNotificationsAsync === 'function') {
    try {
      const presented = await Notifications.getPresentedNotificationsAsync();
      await Promise.all(presented.filter(notification => incomingCallFromNotification(notification)?.callId === activity.callId)
        .map(notification => Notifications.dismissNotificationAsync(notification.request.identifier)));
    } catch { /* Replacing a ringing alert is best-effort. */ }
  }
  if (activity.status === 'ended' || (activity.status === 'missed' && activity.direction !== 'incoming')) return;
  if (!activity.callId || typeof Notifications?.scheduleNotificationAsync !== 'function') return;
  // In the background the backend's missed-call push is the system alert.
  if (activity.status === 'missed' && AppState.currentState !== 'active') return;
  const kind = `${activity.status}_call`;
  const key = callActivityKey(activity.callId, kind);
  if (presentedCallActivities.has(key)) return;
  rememberCallActivity(key);
  try {
    const settings = await loadStoredNotificationSettings();
    if (!settings.notifications || !settings.callNotifications) return;
    const permission = await Notifications.getPermissionsAsync();
    if (!permission.granted) return;
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CALL_CHANNEL_ID, {
        name: 'Call activity', importance: Notifications.AndroidImportance.HIGH,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
      });
    }
    const label = activity.status === 'missed' ? 'Missed' : activity.status === 'dialed' ? 'Dialed' : 'Answered';
    const missed = activity.status === 'missed';
    await Notifications.scheduleNotificationAsync({
      identifier: `call-activity:${activity.callId}:${activity.status}`,
      content: {
        title: missed ? activity.contactName : `${label} ${activity.type} call`,
        body: missed ? `Missed ${activity.type} call` : activity.contactName,
        categoryIdentifier: missed ? MISSED_CALL_CATEGORY_ID : undefined,
        sound: settings.soundEnabled ? 'default' : false,
        data: {type: kind, callId: activity.callId, chatId: activity.chatId, contactId: activity.contactId, contactName: activity.contactName, localCallActivity: true},
      },
      trigger: Platform.OS === 'android' ? {channelId: CALL_CHANNEL_ID} : null,
    });
  } catch {
    presentedCallActivities.delete(key);
  }
}

function routeValues(value: string): NotificationTarget {
  if (!value) { return {}; }
  // Handles /chat/:id, chatterly://chat/:id and absolute links alike.
  const match = value.match(/(?:^|\/|:)chat\/([^/?#]+)/i);
  const sender = value.match(/[?&](?:senderId|contactId|userId)=([^&#]+)/i);
  const group = value.match(/[?&]groupId=([^&#]+)/i);
  const decode = (part?: string) => {
    try { return part ? decodeURIComponent(part) : undefined; } catch { return undefined; }
  };
  return {
    chatId: decode(match?.[1]),
    contactId: decode(sender?.[1]),
    ...(group ? {groupId: decode(group[1])} : {}),
  };
}

export function targetFromNotification(
  response: NotificationResponse,
): NotificationTarget {
  const content = response.notification.request.content;
  const data = content.data || {};
  const routed = routeValues(
    stringValue(data.redir || data.url || data.link || data.deepLink),
  );
  return {
    chatId: stringValue(data.chatId || data.conversationId) || routed.chatId,
    contactId:
      stringValue(data.senderId || data.contactId || data.userId || data.callerId) || routed.contactId,
    // The current backend does not copy `redir` into its Android/iOS data
    // payload. Its notification title is the sender name, which is a safe
    // fallback for an already-existing direct chat.
    contactName: stringValue(data.contactName || data.callerName) || (callActivityKind(response.notification) ? '' : stringValue(content.title)),
    ...(data.groupId || routed.groupId ? {groupId: stringValue(data.groupId) || routed.groupId} : {}),
    ...(data.groupName ? {groupName: stringValue(data.groupName)} : {}),
    ...(callActivityKind(response.notification) === 'missed_call' ? {
      callType: stringValue(data.callType).toLowerCase() === 'video' ? 'video' : 'audio',
    } : {}),
  };
}

function contentTargetsActiveChat(notification: Notification): boolean {
  if (!activeChatId) { return false; }
  const title = stringValue(notification.request.content.title).toLocaleLowerCase();
  const data = notification.request.content.data || {};
  const routed = routeValues(stringValue(data.redir || data.url || data.link || data.deepLink));
  return stringValue(data.chatId || data.conversationId) === activeChatId ||
    routed.chatId === activeChatId ||
    Boolean(activeContactName && title === activeContactName);
}

if (typeof Notifications?.setNotificationHandler === 'function') {
  Notifications.setNotificationHandler({
    handleNotification: async notification => {
      const incomingCall = incomingCallFromNotification(notification);
      const settings = await loadStoredNotificationSettings();
      const activityKind = callActivityKind(notification);
      if (activityKind) {
        const data = notification.request.content.data || {};
        const callId = stringValue(data.callId);
        const key = callActivityKey(callId, activityKind);
        const duplicate = !data.localCallActivity && Boolean(callId) && presentedCallActivities.has(key);
        if (callId) rememberCallActivity(key);
        const enabled = settings.notifications && settings.callNotifications && !duplicate;
        return {
          shouldShowBanner: enabled, shouldShowList: enabled,
          shouldPlaySound: enabled && settings.soundEnabled, shouldSetBadge: false,
          priority: Notifications?.AndroidNotificationPriority?.HIGH,
        };
      }
      if (incomingCall) {
        // The app renders the richer caller card while foregrounded. Keeping
        // the item in the system list preserves the call alert when the app is
        // backgrounded, while avoiding two simultaneous foreground banners.
        return {
          shouldShowBanner: AppState.currentState !== 'active' && settings.notifications && settings.callNotifications,
          shouldShowList: settings.notifications && settings.callNotifications,
          shouldPlaySound: settings.notifications && settings.callNotifications && settings.callRingtone && settings.soundEnabled,
          shouldSetBadge: false,
          priority: Notifications?.AndroidNotificationPriority?.HIGH,
        };
      }
      const isOpenConversation = contentTargetsActiveChat(notification);
      const data = notification.request.content.data || {};
      const routed = routeValues(stringValue(data.redir || data.url || data.link || data.deepLink));
      const targetChatId = stringValue(data.chatId || data.conversationId) || routed.chatId || '';
      const isMuted = targetChatId ? await getConversationMuted(targetChatId) : false;
      const isGroup = Boolean(data.groupId || data.groupName || data.type === 'group_message');
      const typeEnabled = isGroup ? settings.groupNotifications : settings.messageNotifications;
      const shouldPresent = settings.notifications && typeEnabled && !isOpenConversation && !isMuted;
      const vibration = isGroup ? settings.groupVibration : settings.messageVibration;
      if (shouldPresent && settings.soundEnabled && Platform.OS !== 'android') {
        playNotificationTone(settings.notificationTone);
      }
      if (shouldPresent && settings.vibrationEnabled) {
        vibrateMessageOnce('push', {
          id: stringValue(data.messageId || notification.request.identifier), chatId: targetChatId,
          body: stringValue(notification.request.content.body),
        }, vibration);
      }
      return {
        shouldShowBanner: shouldPresent && settings.popupPreview,
        shouldShowList: shouldPresent,
        // Android's presenter uses the saved tone on a notification channel,
        // including when JS is suspended. Other platforms use the player above.
        shouldPlaySound: shouldPresent && settings.soundEnabled && Platform.OS === 'android',
        shouldSetBadge: shouldPresent,
        // Android uses priority to decide whether a foreground notification
        // becomes a heads-up popup. LOW keeps it in the notification drawer
        // without popping over the current screen.
        priority: settings.popupPreview
          ? Notifications?.AndroidNotificationPriority?.HIGH
          : Notifications?.AndroidNotificationPriority?.LOW,
      };
    },
  });
}

export function setActiveNotificationChat(chatId: string | null, contactName?: string): void {
  activeChatId = String(chatId || '');
  activeContactName = activeChatId ? String(contactName || '').trim().toLocaleLowerCase() : '';
}

export async function syncApplicationBadge(): Promise<number> {
  if (
    typeof Notifications?.setBadgeCountAsync !== 'function' ||
    typeof Notifications?.getBadgeCountAsync !== 'function'
  ) { return 0; }
  try {
    // The raw list can include a receiver-facing missed-call copy in the
    // caller's unread count. Use the same detail reconciliation as Recents so
    // app activation cannot put that transient count back on the tab/icon.
    const chats = normalizeChatList(await getChatList());
    // Only positive direct-chat counts can contain the mirrored one-to-one
    // call copy. Avoid fetching message history for unrelated zero-count rows.
    const directUnread = chats.filter(chat =>
      chat.contact.kind !== 'group' && chat.unreadCount > 0,
    );
    const reconciled = new Map(
      (await enrichChatList(directUnread)).map(chat => [chat.id, chat.unreadCount]),
    );
    const unread = chats.reduce((sum, chat) =>
      sum + Math.max(0, reconciled.get(chat.id) ?? chat.unreadCount), 0);
    // The Chats tab shows the same number, and must not depend on whether this
    // phone's launcher can draw a numeric icon badge.
    publishUnreadChatCount(unread);
    await Notifications.setBadgeCountAsync(unread);
    return unread;
  } catch {
    return Notifications.getBadgeCountAsync().catch(() => 0);
  }
}

export function setApplicationBadge(count: number): void {
  if (typeof Notifications?.setBadgeCountAsync !== 'function') { return; }
  Notifications.setBadgeCountAsync(Math.max(0, Math.floor(count))).catch(() => undefined);
}

export async function clearNotificationsForChat(chatId: string, contactName?: string): Promise<void> {
  try {
    if (
      typeof Notifications?.getPresentedNotificationsAsync === 'function' &&
      typeof Notifications?.dismissNotificationAsync === 'function'
    ) {
      const presented = await Notifications.getPresentedNotificationsAsync();
      await Promise.all(presented.map(async notification => {
        const data = notification.request.content.data || {};
        // Reading a conversation must not erase its call activity alerts.
        if (callActivityKind(notification) || incomingCallFromNotification(notification)) return;
        const routed = routeValues(stringValue(data.redir || data.url || data.link || data.deepLink));
        const targetId = stringValue(data.chatId || data.conversationId) || routed.chatId;
        const title = stringValue(notification.request.content.title).toLocaleLowerCase();
        if (targetId === chatId || (contactName && title === contactName.trim().toLocaleLowerCase())) {
          await Notifications.dismissNotificationAsync(notification.request.identifier);
        }
      }));
    }
  } catch {
    // Notification-center cleanup is best-effort; read state still syncs below.
  }
  await syncApplicationBadge();
}

export async function resolveNotificationConversation(
  target: NotificationTarget,
): Promise<{chatId: string; contact: ConversationContact} | null> {
  const find = (rows: Array<Pick<ChatListItem, 'id' | 'contact'>>) => {
    // An explicit identity must win over a matching display name, regardless
    // of the order of inbox rows or another contact sharing that name.
    if (target.groupId) {
      return rows.find(row => row.contact.kind === 'group' &&
        (row.id === target.groupId || row.contact.userId === target.groupId));
    }
    if (target.chatId) { return rows.find(row => row.id === target.chatId); }
    if (target.contactId) { return rows.find(row => row.contact.userId === target.contactId); }
    const name = (target.groupName || target.contactName)?.trim().toLocaleLowerCase();
    const matches = name ? rows.filter(row => row.contact.name.trim().toLocaleLowerCase() === name) : [];
    return matches.length === 1 ? matches[0] : undefined;
  };
  const cached = getChatListActivities(getSession()?.user?.id || '').map(activity => ({
    id: activity.chatId, contact: activity.contact,
  }));
  let chat = find(cached);
  if (!chat) {
    try {
      const rows = normalizeChatList(await getChatList());
      // IDs are already usable before slow name/profile enrichment.
      chat = find(rows) || find(await enrichChatList(rows));
    } catch { /* Explicit metadata below still supports opening while offline. */ }
  }
  if (chat) { return {chatId: chat.id, contact: chat.contact}; }
  if (target.groupId) {
    return {chatId: target.groupId, contact: {
      userId: target.groupId, kind: 'group', name: target.groupName || target.contactName || 'Group',
    }};
  }
  if (target.chatId && target.contactId) {
    return {chatId: target.chatId, contact: {userId: target.contactId, name: target.contactName || 'Contact'}};
  }
  return null;
}

function loadIosMessaging(): typeof import('@react-native-firebase/messaging') | null {
  if (Platform.OS !== 'ios' || Constants.appOwnership === 'expo') { return null; }
  try { return require('@react-native-firebase/messaging'); } catch { return null; }
}

async function saveNativeToken(token: {data: string | number[]}): Promise<void> {
  if (Platform.OS === 'ios') {
    // Expo returns an APNs token on iOS; the existing backend sends via FCM.
    // Register with APNs first, then save Firebase's corresponding FCM token.
    const runtime = loadIosMessaging();
    if (!runtime) { return; }
    const value = await runtime.getToken(runtime.getMessaging());
    if (value) { await saveDevicePushToken(value); }
    return;
  }
  const value = stringValue(token.data);
  if (value) { await saveDevicePushToken(value); }
}

async function requestAndSaveToken(): Promise<void> {
  if (
    typeof Notifications?.getPermissionsAsync !== 'function' ||
    typeof Notifications?.requestPermissionsAsync !== 'function' ||
    typeof Notifications?.getDevicePushTokenAsync !== 'function'
  ) { return; }

  if (Platform.OS === 'android' && typeof Notifications?.setNotificationChannelAsync === 'function') {
    await Notifications.setNotificationChannelAsync(MESSAGE_CHANNEL_ID, {
      name: 'Messages and calls',
      description: 'Chatterly message and incoming call alerts',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 150, 250],
      lightColor: '#6F28F5',
      showBadge: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  const permission = existing.granted ? existing : await Notifications.requestPermissionsAsync({
    ios: {allowAlert: true, allowBadge: true, allowSound: true},
  });
  if (!permission.granted) { return; }

  const token = await Notifications.getDevicePushTokenAsync();
  await saveNativeToken(token);
}

/** Starts token registration, tap routing, rotation handling, and badge sync. */
export function startNotificationLifecycle(
  onOpen: (target: NotificationTarget) => void,
  onIncomingCall?: (call: IncomingCall, opened: boolean, action?: IncomingCallNotificationAction) => void,
  onGroupCall?: (invitation: GroupCallNotification, opened: boolean) => void,
): () => void {
  let disposed = false;
  const unsubscribeMessages = subscribeToLiveMessages((message, group) => {
    if (!appIsActive()) return;
    const chatId = message.chatId || '';
    const isOpen = () => Boolean(activeChatId && (activeChatId === chatId ||
      (!group && (activeChatId === message.contactId || (activeContactName && activeContactName === message.senderName?.trim().toLocaleLowerCase())))));
    if (isOpen()) return;
    Promise.all([
      loadStoredNotificationSettings(),
      getConversationMuted(chatId || message.contactId || ''),
    ]).then(([settings, muted]) => {
      if (disposed || !appIsActive() || isOpen() || muted || !settings.notifications ||
          !settings.vibrationEnabled || !(group ? settings.groupNotifications : settings.messageNotifications)) return;
      vibrateMessageOnce('socket', {id: message.id, chatId, body: messagePreview(message)},
        group ? settings.groupVibration : settings.messageVibration);
    }).catch(() => undefined);
  });
  if (
    typeof Notifications?.addNotificationResponseReceivedListener !== 'function' ||
    typeof Notifications?.addNotificationReceivedListener !== 'function' ||
    typeof Notifications?.addPushTokenListener !== 'function'
  ) { return () => { disposed = true; unsubscribeMessages(); }; }

  Notifications.setNotificationCategoryAsync?.(INCOMING_CALL_CATEGORY_ID, [
    {identifier: 'accept_call', buttonTitle: 'Accept', options: {opensAppToForeground: true}},
    {identifier: 'reject_call', buttonTitle: 'Reject', options: {opensAppToForeground: true}},
  ]).catch(() => undefined);
  Notifications.setNotificationCategoryAsync?.(MISSED_CALL_CATEGORY_ID, [
    {identifier: CALLBACK_ACTION_ID, buttonTitle: 'Callback', options: {opensAppToForeground: true}},
    {identifier: MESSAGE_ACTION_ID, buttonTitle: 'Message', options: {opensAppToForeground: true}},
  ]).catch(() => undefined);
  const consume = (response: NotificationResponse | null) => {
    if (!response || disposed) { return; }
    const now = Date.now();
    handledResponses.forEach((expiry, id) => { if (expiry <= now) { handledResponses.delete(id); } });
    const key = `${response.notification.request.identifier}:${response.notification.date}:${response.actionIdentifier}`;
    if (handledResponses.has(key)) { return; }
    handledResponses.set(key, now + 5 * 60 * 1000);
    if (handledResponses.size > 256) { handledResponses.delete(handledResponses.keys().next().value!); }
    const incomingCall = incomingCallFromNotification(response.notification);
    const groupCall = incomingCall ? null : groupCallFromNotification(response.notification);
    if (incomingCall) {
      const action = response.actionIdentifier === 'accept_call' ? 'accept'
        : response.actionIdentifier === 'reject_call' ? 'reject' : undefined;
      if (action) {
        Notifications.dismissNotificationAsync?.(response.notification.request.identifier).catch(() => undefined);
        onIncomingCall?.(incomingCall, true, action);
      } else { onIncomingCall?.(incomingCall, true); }
    }
    else if (groupCall) { onGroupCall?.(groupCall, true); }
    else {
      const target = targetFromNotification(response);
      if (callActivityKind(response.notification) === 'missed_call') {
        target.action = response.actionIdentifier === CALLBACK_ACTION_ID ? 'callback' : 'message';
      }
      onOpen(target);
    }
    Notifications.clearLastNotificationResponseAsync?.().catch(() => undefined);
  };

  const responseSubscription = Notifications.addNotificationResponseReceivedListener(consume);
  const unsubscribeCallActivity = subscribeToCallActivity(activity => { notifyCallActivity(activity).catch(() => undefined); });
  const receivedSubscription = Notifications.addNotificationReceivedListener(notification => {
    const incomingCall = incomingCallFromNotification(notification);
    const groupCall = incomingCall ? null : groupCallFromNotification(notification);
    if (incomingCall) { onIncomingCall?.(incomingCall, false); }
    else if (groupCall) { onGroupCall?.(groupCall, false); }
    else if (callActivityKind(notification)) {
      const data = notification.request.content.data || {};
      // A missed-call push can arrive after reconnecting without a live call UI.
      if (!data.localCallActivity) publishCallActivity({
        callId: stringValue(data.callId), chatId: stringValue(data.chatId),
        contactId: stringValue(data.contactId || data.callerId), contactName: stringValue(data.contactName || data.callerName),
        type: stringValue(data.callType) === 'video' ? 'video' : 'audio', direction: 'incoming', status: 'ended',
      });
    }
    else { syncApplicationBadge().catch(() => undefined); }
  });
  const tokenSubscription = Notifications.addPushTokenListener(token => {
    saveNativeToken(token).catch(() => undefined);
  });
  let removeFcmTokenListener: (() => void) | undefined;
  try {
    const runtime = loadIosMessaging();
    if (runtime) {
      removeFcmTokenListener = runtime.onTokenRefresh(runtime.getMessaging(), token => {
        saveDevicePushToken(token).catch(() => undefined);
      });
    }
  } catch { /* An older native build may not yet contain Firebase messaging. */ }
  const appStateSubscription = AppState.addEventListener('change', state => {
    if (state === 'active') { syncApplicationBadge().catch(() => undefined); }
  });
  const linkingSubscription = Linking.addEventListener('url', event => {
    const target = routeValues(event.url);
    if (target.chatId || target.contactId) { onOpen(target); }
  });

  requestAndSaveToken().catch(() => undefined);
  Notifications.getLastNotificationResponseAsync?.().then(consume).catch(() => undefined);
  Linking.getInitialURL().then(url => {
    const target = routeValues(url || '');
    if (!disposed && (target.chatId || target.contactId)) { onOpen(target); }
  }).catch(() => undefined);
  syncApplicationBadge().catch(() => undefined);

  return () => {
    disposed = true;
    unsubscribeMessages();
    unsubscribeCallActivity();
    (responseSubscription as EventSubscription).remove();
    (receivedSubscription as EventSubscription).remove();
    (tokenSubscription as EventSubscription).remove();
    removeFcmTokenListener?.();
    appStateSubscription.remove();
    linkingSubscription.remove();
  };
}
