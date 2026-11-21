jest.mock('../src/services/chatRealtime', () => ({subscribeToLiveMessages: jest.fn(() => () => undefined)}));
import {AppState, Platform} from 'react-native';
import * as Notifications from 'expo-notifications';
import {notifyIncomingCall, notifyCallActivity, incomingCallFromNotification, startNotificationLifecycle} from '../src/services/notificationService';
import {DEFAULT_NOTIFICATION_SETTINGS, loadStoredNotificationSettings} from '../src/services/notificationPreferencesApi';
import type {IncomingCall} from '../src/types/call';

jest.mock('../src/services/chatApi', () => ({getChatList: jest.fn(async () => []), normalizeChatList: jest.fn(() => []), enrichChatList: jest.fn(async () => [])}));
jest.mock('../src/services/notificationApi', () => ({saveDevicePushToken: jest.fn()}));
jest.mock('../src/services/sessionStore', () => ({getSession: () => ({user: {id: 'me'}})}));
jest.mock('../src/services/notificationPreferencesApi', () => ({
  ...jest.requireActual('../src/services/notificationPreferencesApi'), loadStoredNotificationSettings: jest.fn(),
}));
const handler = jest.mocked(Notifications.setNotificationHandler).mock.calls[0][0]!;
const appStateDescriptor = Object.getOwnPropertyDescriptor(AppState, 'currentState')!;
let sequence = 0;
const call = (): IncomingCall => ({callId: `incoming-${++sequence}`, chatId: 'chat', callerId: 'caller', callerName: 'Ananya', type: 'video', status: 'calling'});

beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(AppState, 'currentState', {configurable: true, value: 'background'});
  jest.mocked(loadStoredNotificationSettings).mockResolvedValue(DEFAULT_NOTIFICATION_SETTINGS);
  jest.mocked(Notifications.getPresentedNotificationsAsync).mockResolvedValue([]);
});
afterEach(() => { jest.restoreAllMocks(); Object.defineProperty(AppState, 'currentState', appStateDescriptor); });

test.each(['android', 'ios'] as const)('presents a background socket call once with its original payload on %s', async platform => {
  jest.replaceProperty(Platform, 'OS', platform);
  const incoming = call();
  await notifyIncomingCall(incoming);
  await notifyIncomingCall(incoming);
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
  const request = jest.mocked(Notifications.scheduleNotificationAsync).mock.calls[0][0];
  expect(request.content).toEqual(expect.objectContaining({title: 'Ananya', body: 'Incoming video call', categoryIdentifier: 'incoming_call'}));
  expect(request.trigger).toEqual(platform === 'android' ? {channelId: 'incoming-calls-v2-sound-off'} : null);
  const notification = {date: 1, request: {identifier: 'test', content: request.content}} as unknown as Notifications.Notification;
  expect(incomingCallFromNotification(notification)).toEqual(expect.objectContaining({callId: incoming.callId, callerId: incoming.callerId, type: 'video'}));
  expect((await handler.handleNotification(notification)).shouldShowBanner).toBe(true);
});

test.each(['active', 'background', 'inactive'] as const)('only shows the system banner outside the active app (%s)', async state => {
  Object.defineProperty(AppState, 'currentState', {configurable: true, value: state});
  const incoming = call();
  const notification = {date: 1, request: {content: {data: {type: 'incoming_call', callId: incoming.callId, callerId: incoming.callerId}}}} as unknown as Notifications.Notification;
  expect((await handler.handleNotification(notification)).shouldShowBanner).toBe(state !== 'active');
  await notifyIncomingCall(incoming);
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(state === 'active' ? 0 : 1);
});

test('keeps disabled calls silent and does not duplicate a remote call alert', async () => {
  jest.mocked(loadStoredNotificationSettings).mockResolvedValue({...DEFAULT_NOTIFICATION_SETTINGS, callNotifications: false});
  await notifyIncomingCall(call());
  expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  jest.mocked(loadStoredNotificationSettings).mockResolvedValue(DEFAULT_NOTIFICATION_SETTINGS);
  const incoming = call();
  jest.mocked(Notifications.getPresentedNotificationsAsync).mockResolvedValue([{
    date: 1,
    request: {content: {data: {type: 'incoming_call', callId: incoming.callId, callerId: incoming.callerId}}},
  } as unknown as Notifications.Notification]);
  await notifyIncomingCall(incoming);
  expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
});

test('registers answer and reject actions and clears a ringing alert when a call ends', async () => {
  const stop = startNotificationLifecycle(jest.fn());
  expect(Notifications.setNotificationCategoryAsync).toHaveBeenCalledWith('incoming_call', expect.arrayContaining([
    expect.objectContaining({identifier: 'accept_call'}), expect.objectContaining({identifier: 'reject_call'}),
  ]));
  const incoming = call();
  jest.mocked(Notifications.getPresentedNotificationsAsync).mockResolvedValue([{
    date: 1,
    request: {identifier: 'ringing-alert', content: {data: {type: 'incoming_call', callId: incoming.callId, callerId: incoming.callerId}}},
  } as unknown as Notifications.Notification]);
  await notifyCallActivity({callId: incoming.callId, chatId: 'chat', contactId: 'caller', contactName: 'Ananya', type: 'video', direction: 'incoming', status: 'ended'});
  expect(Notifications.dismissNotificationAsync).toHaveBeenCalledWith('ringing-alert');
  stop();
});


test.each([
  ['Short', [0, 150]], ['Medium', [0, 250, 120, 250]], ['Long', [0, 500, 180, 500]],
] as const)('Android incoming alerts use the selected %s vibration even with sound off', async (mode, pattern) => {
  jest.replaceProperty(Platform, 'OS', 'android');
  jest.mocked(loadStoredNotificationSettings).mockResolvedValue({...DEFAULT_NOTIFICATION_SETTINGS, callVibration: mode, vibrationEnabled: true, soundEnabled: false});
  await notifyIncomingCall(call());
  const channelId = `incoming-calls-v2-silent-${mode.toLowerCase()}`;
  expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith(channelId, expect.objectContaining({enableVibrate: true, vibrationPattern: pattern, sound: null}));
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(expect.objectContaining({trigger: {channelId}}));
});

test('Android disables call channel vibration when the global setting is off', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  jest.mocked(loadStoredNotificationSettings).mockResolvedValue({...DEFAULT_NOTIFICATION_SETTINGS, callVibration: 'Long', vibrationEnabled: false});
  await notifyIncomingCall(call());
  expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith('incoming-calls-v2-sound-off', expect.objectContaining({enableVibrate: false, vibrationPattern: undefined}));
});
