import {AppState, Platform} from 'react-native';
import * as Notifications from 'expo-notifications';
import {subscribeToLiveMessages} from '../src/services/chatRealtime';
import {startNotificationLifecycle, setActiveNotificationChat} from '../src/services/notificationService';
import {DEFAULT_NOTIFICATION_SETTINGS, loadStoredNotificationSettings} from '../src/services/notificationPreferencesApi';
import {getConversationMuted} from '../src/services/conversationPreferences';
import {vibrateNotification} from '../src/services/notificationVibration';
import type {ChatMessage} from '../src/types/chat';
jest.mock('../src/services/chatRealtime', () => ({subscribeToLiveMessages: jest.fn()}));
jest.mock('../src/services/chatApi', () => ({}));
jest.mock('../src/services/notificationApi', () => ({}));
jest.mock('../src/services/notificationVibration', () => ({vibrateNotification: jest.fn()}));
jest.mock('../src/services/callRingtone', () => ({playNotificationTone: jest.fn()}));
jest.mock('../src/services/conversationPreferences', () => ({getConversationMuted: jest.fn()}));
jest.mock('../src/services/notificationPreferencesApi', () => ({...jest.requireActual('../src/services/notificationPreferencesApi'), loadStoredNotificationSettings: jest.fn()}));
let receive: (message: ChatMessage, group: boolean) => void;
let stop: () => void = () => undefined;
const originalState = Object.getOwnPropertyDescriptor(AppState, 'currentState')!;
let id = 0;
const detached = jest.fn();
const message = (): ChatMessage => ({id: 'live-' + ++id, chatId: 'chat', contactId: 'sender', text: 'message-' + id, createdAt: new Date().toISOString(), isOwn: false});
const flush = () => new Promise<void>(resolve => setImmediate(resolve));
beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(AppState, 'currentState', {configurable: true, value: 'active'});
  setActiveNotificationChat(null);
  jest.mocked(loadStoredNotificationSettings).mockResolvedValue({...DEFAULT_NOTIFICATION_SETTINGS, vibrationEnabled: true, messageVibration: 'Short', groupVibration: 'Long', soundEnabled: false});
  jest.mocked(getConversationMuted).mockResolvedValue(false);
  jest.mocked(subscribeToLiveMessages).mockImplementation(callback => { receive = callback; return detached; });
  stop = startNotificationLifecycle(jest.fn());
});
afterEach(() => { stop(); setActiveNotificationChat(null); Object.defineProperty(AppState, 'currentState', originalState); jest.restoreAllMocks(); });
test('live messages vibrate without a push and groups use their own saved mode', async () => {
  receive(message(), false);
  await flush();
  expect(vibrateNotification).toHaveBeenLastCalledWith('Short');
  receive(message(), true);
  await flush();
  expect(vibrateNotification).toHaveBeenLastCalledWith('Long');
});
test('the matching push does not repeat a live message vibration', async () => {
  const incoming = message();
  receive(incoming, false);
  await flush();
  await pushHandler.handleNotification({request: {identifier: 'push-' + incoming.id, content: {body: incoming.text, data: {chatId: 'chat', messageId: incoming.id}}}} as never);
  expect(vibrateNotification).toHaveBeenCalledTimes(1);
});
const pushHandler = jest.mocked(Notifications.setNotificationHandler).mock.calls[0][0]!;
test.each(['muted', 'open', 'background', 'disabled'] as const)('%s messages do not vibrate', async reason => {
  if (reason === 'muted') jest.mocked(getConversationMuted).mockResolvedValue(true);
  if (reason === 'open') setActiveNotificationChat('chat');
  if (reason === 'background') Object.defineProperty(AppState, 'currentState', {configurable: true, value: 'background'});
  if (reason === 'disabled') jest.mocked(loadStoredNotificationSettings).mockResolvedValue({...DEFAULT_NOTIFICATION_SETTINGS, vibrationEnabled: false, messageVibration: 'Long'});
  receive(message(), false);
  await flush();
  expect(vibrateNotification).not.toHaveBeenCalled();
});
test('signing out detaches live receipts and cancels an in-flight settings read', async () => {
  receive(message(), false);
  stop();
  await flush();
  expect(detached).toHaveBeenCalled();
  expect(vibrateNotification).not.toHaveBeenCalled();
});

test('Android foreground push vibrates with sound disabled when no socket event arrives', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  const incoming = message();
  const result = await pushHandler.handleNotification({request: {identifier: 'only-push-' + incoming.id, content: {body: incoming.text, data: {chatId: 'chat', messageId: incoming.id}}}} as never);
  expect(result.shouldPlaySound).toBe(false);
  expect(vibrateNotification).toHaveBeenCalledTimes(1);
  expect(vibrateNotification).toHaveBeenCalledWith('Short');
});
