jest.mock('../src/services/chatRealtime', () => ({subscribeToLiveMessages: jest.fn(() => () => undefined)}));
import {AppState, Platform} from 'react-native';
import * as Notifications from 'expo-notifications';
import type {Notification} from 'expo-notifications';
import {clearNotificationsForChat, incomingCallFromNotification, notifyCallActivity, setActiveNotificationChat, startNotificationLifecycle, targetFromNotification} from '../src/services/notificationService';
import {publishCallActivity, type CallActivity} from '../src/services/callActivity';
import {DEFAULT_NOTIFICATION_SETTINGS, loadStoredNotificationSettings} from '../src/services/notificationPreferencesApi';
import {getConversationMuted} from '../src/services/conversationPreferences';
import {playNotificationTone} from '../src/services/callRingtone';
import {vibrateNotification} from '../src/services/notificationVibration';

jest.mock('../src/services/chatApi', () => ({getChatList: jest.fn(async () => []), normalizeChatList: jest.fn(() => []), enrichChatList: jest.fn(async () => [])}));
jest.mock('../src/services/notificationApi', () => ({saveDevicePushToken: jest.fn()}));
jest.mock('../src/services/sessionStore', () => ({getSession: () => ({user: {id: 'me'}})}));
jest.mock('../src/services/conversationPreferences', () => ({getConversationMuted: jest.fn(async () => true)}));
jest.mock('../src/services/callRingtone', () => ({playNotificationTone: jest.fn()}));
jest.mock('../src/services/notificationVibration', () => ({vibrateNotification: jest.fn()}));
jest.mock('../src/services/notificationPreferencesApi', () => ({
  ...jest.requireActual('../src/services/notificationPreferencesApi'),
  loadStoredNotificationSettings: jest.fn(),
}));
jest.mock('@react-native-firebase/messaging', () => ({getMessaging: jest.fn(), getToken: jest.fn(async () => ''), onTokenRefresh: jest.fn(() => jest.fn())}));

const handler = jest.mocked(Notifications.setNotificationHandler).mock.calls[0][0]!;
const appStateDescriptor = Object.getOwnPropertyDescriptor(AppState, 'currentState')!;
let sequence = 0;
const activity = (status: CallActivity['status'] = 'missed'): CallActivity => ({
  callId: `call-${++sequence}`, chatId: 'chat-1', contactId: 'ananya', contactName: 'Ananya',
  type: 'audio', direction: 'incoming', status,
});
const notification = (data: Record<string, unknown>, identifier = 'notification-1'): Notification => ({
  date: 1, request: {identifier, content: {title: 'Missed Call', data}},
} as Notification);

beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(AppState, 'currentState', {configurable: true, value: 'active'});
  jest.mocked(loadStoredNotificationSettings).mockResolvedValue({...DEFAULT_NOTIFICATION_SETTINGS, messageNotifications: false});
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({granted: true} as never);
  jest.mocked(Notifications.getPresentedNotificationsAsync).mockResolvedValue([]);
});
afterEach(() => { setActiveNotificationChat(null); jest.restoreAllMocks(); Object.defineProperty(AppState, 'currentState', appStateDescriptor); });

test.each(['android', 'ios'] as const)('shows missed, dialed and answered alerts under call settings on %s', async platform => {
  jest.replaceProperty(Platform, 'OS', platform);
  setActiveNotificationChat('chat-1', 'Ananya');
  for (const status of ['missed', 'dialed', 'answered'] as const) {
    const call = activity(status);
    await notifyCallActivity(call);
    const request = jest.mocked(Notifications.scheduleNotificationAsync).mock.calls.at(-1)![0];
    expect(request.content).toEqual(expect.objectContaining({title: `${status[0].toUpperCase()}${status.slice(1)} audio call`, body: 'Ananya'}));
    expect(request.trigger).toEqual(platform === 'android' ? {channelId: 'calls'} : null);
    const alert = notification(request.content.data!);
    expect(incomingCallFromNotification(alert)).toBeNull();
    await expect(handler.handleNotification(alert)).resolves.toEqual(expect.objectContaining({shouldShowBanner: true, shouldShowList: true, shouldSetBadge: false}));
    await notifyCallActivity(call);
  }
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(3);
});

test('presents a remote missed call even for an open, muted chat with message alerts disabled', async () => {
  setActiveNotificationChat('chat-1', 'Ananya');
  await expect(handler.handleNotification(notification({type: 'missed_call', callId: activity().callId, callerId: 'ananya', chatId: 'chat-1'})))
    .resolves.toEqual(expect.objectContaining({shouldShowBanner: true, shouldShowList: true}));
});

test('plays the selected custom sound for a new foreground notification', async () => {
  jest.mocked(loadStoredNotificationSettings).mockResolvedValue({...DEFAULT_NOTIFICATION_SETTINGS, messageNotifications: true, notificationTone: 'Chime'});
  jest.mocked(getConversationMuted).mockResolvedValue(false);

  await expect(handler.handleNotification(notification({chatId: 'chat-2'}))).resolves.toEqual(expect.objectContaining({shouldPlaySound: false}));
  expect(playNotificationTone).toHaveBeenCalledWith('Chime');
});

test.each(['Default', 'Chime', 'Bell', 'Pop'] as const)('plays %s for an incoming group message', async tone => {
  jest.mocked(loadStoredNotificationSettings).mockResolvedValue({...DEFAULT_NOTIFICATION_SETTINGS, groupNotifications: true, notificationTone: tone});
  jest.mocked(getConversationMuted).mockResolvedValue(false);

  await expect(handler.handleNotification(notification({chatId: 'group-chat', groupId: 'group-2', type: 'group_message'})))
    .resolves.toEqual(expect.objectContaining({shouldPlaySound: false}));
  expect(playNotificationTone).toHaveBeenCalledWith(tone);
});

test('vibrates using the selected message pattern for a new notification', async () => {
  jest.mocked(loadStoredNotificationSettings).mockResolvedValue({...DEFAULT_NOTIFICATION_SETTINGS, messageNotifications: true, messageVibration: 'Long'});
  jest.mocked(getConversationMuted).mockResolvedValue(false);

  await handler.handleNotification(notification({chatId: 'chat-2'}));
  expect(vibrateNotification).toHaveBeenCalledWith('Long');
});

test('does not ring for answered or dialed call summaries containing caller metadata', () => {
  for (const type of ['answered_call', 'dialed_call']) {
    expect(incomingCallFromNotification(notification({type, callId: 'call-1', callerId: 'ananya'}))).toBeNull();
  }
});

test('respects disabled call alerts and denied system permission', async () => {
  jest.mocked(loadStoredNotificationSettings).mockResolvedValueOnce({...DEFAULT_NOTIFICATION_SETTINGS, callNotifications: false});
  await notifyCallActivity(activity());
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValueOnce({granted: false} as never);
  await notifyCallActivity(activity());
  expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
});

test('suppresses the remote duplicate of a locally displayed missed call', async () => {
  const call = activity();
  await notifyCallActivity(call);
  await expect(handler.handleNotification(notification({type: 'missed_call', callId: call.callId, callerId: 'ananya'})))
    .resolves.toEqual(expect.objectContaining({shouldShowBanner: false, shouldShowList: false}));
});

test('leaves background missed-call presentation to the backend push', async () => {
  Object.defineProperty(AppState, 'currentState', {configurable: true, value: 'background'});
  await notifyCallActivity(activity());
  expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
});

test('replaces the matching incoming alert when answered and preserves other calls', async () => {
  const call = activity('answered');
  jest.mocked(Notifications.getPresentedNotificationsAsync).mockResolvedValue([
    notification({type: 'incoming_call', callId: call.callId, callerId: 'ananya'}, 'ringing'),
    notification({type: 'incoming_call', callId: 'other-call', callerId: 'other'}, 'other-ringing'),
  ]);
  await notifyCallActivity(call);
  expect(Notifications.dismissNotificationAsync).toHaveBeenCalledTimes(1);
  expect(Notifications.dismissNotificationAsync).toHaveBeenCalledWith('ringing');
});

test('disables remote call alerts using call settings independently of message settings', async () => {
  jest.mocked(loadStoredNotificationSettings).mockResolvedValue({...DEFAULT_NOTIFICATION_SETTINGS, callNotifications: false, messageNotifications: true});
  await expect(handler.handleNotification(notification({type: 'missed_call', callId: activity().callId})))
    .resolves.toEqual(expect.objectContaining({shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false}));
});

test('reading a chat preserves call alerts while removing message alerts', async () => {
  jest.mocked(Notifications.getPresentedNotificationsAsync).mockResolvedValue([
    notification({type: 'missed_call', chatId: 'chat-1'}, 'missed'),
    notification({type: 'dialed_call', chatId: 'chat-1'}, 'dialed'),
    notification({type: 'answered_call', chatId: 'chat-1'}, 'answered'),
    notification({chatId: 'chat-1'}, 'message'),
  ]);
  await clearNotificationsForChat('chat-1');
  expect(Notifications.dismissNotificationAsync).toHaveBeenCalledTimes(1);
  expect(Notifications.dismissNotificationAsync).toHaveBeenCalledWith('message');
});

test('routes call summaries by contact identity without using the alert title as a name', () => {
  expect(targetFromNotification({notification: notification({type: 'missed_call', callId: 'call-1', callerId: 'ananya'})} as never))
    .toEqual(expect.objectContaining({contactId: 'ananya', contactName: ''}));
});

test('the notification lifecycle subscribes to confirmed call activity and cleans up', async () => {
  const cleanup = startNotificationLifecycle(jest.fn());
  publishCallActivity(activity('dialed'));
  for (let index = 0; index < 12; index++) await Promise.resolve();
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
  cleanup();
  publishCallActivity(activity('answered'));
  for (let index = 0; index < 12; index++) await Promise.resolve();
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
});
