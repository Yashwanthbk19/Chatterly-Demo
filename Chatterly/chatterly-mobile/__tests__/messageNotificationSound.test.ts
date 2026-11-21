import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import {Platform} from 'react-native';
import {setActiveNotificationChat} from '../src/services/notificationService';
import {playNotificationTone} from '../src/services/callRingtone';
import {getConversationMuted} from '../src/services/conversationPreferences';
import {vibrateNotification} from '../src/services/notificationVibration';
import {DEFAULT_NOTIFICATION_SETTINGS, storeNotificationSettings} from '../src/services/notificationPreferencesApi';
import type {NotificationSettings} from '../src/services/notificationPreferencesApi';

jest.mock('../src/services/chatApi', () => ({}));
jest.mock('../src/services/notificationApi', () => ({}));
jest.mock('../src/services/callRingtone', () => ({playNotificationTone: jest.fn()}));
jest.mock('../src/services/notificationVibration', () => ({vibrateNotification: jest.fn()}));
jest.mock('../src/services/conversationPreferences', () => ({getConversationMuted: jest.fn(async () => false)}));

const handler = jest.mocked(Notifications.setNotificationHandler).mock.calls[0][0]!;
const incomingMessage = {request: {content: {title: 'Sender', body: 'New message', data: {chatId: 'chat'}}}};

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  setActiveNotificationChat(null);
  jest.mocked(getConversationMuted).mockResolvedValue(false);
});

afterEach(() => {
  setActiveNotificationChat(null);
  jest.restoreAllMocks();
});

test.each(['Default', 'Chime', 'Bell', 'Pop'] as const)('Android delegates the saved %s tone to the native presenter exactly once', async notificationTone => {
  jest.replaceProperty(Platform, 'OS', 'android');
  await storeNotificationSettings({...DEFAULT_NOTIFICATION_SETTINGS, notificationTone});
  const result = await handler.handleNotification(incomingMessage as never);
  expect(result.shouldPlaySound).toBe(true);
  expect(playNotificationTone).not.toHaveBeenCalled();
  expect(vibrateNotification).not.toHaveBeenCalled();
});

test.each(['Default', 'Chime', 'Bell', 'Pop'] as const)('iOS plays the saved %s tone once through the existing player', async notificationTone => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  await storeNotificationSettings({...DEFAULT_NOTIFICATION_SETTINGS, notificationTone});
  const result = await handler.handleNotification(incomingMessage as never);
  expect(result.shouldPlaySound).toBe(false);
  expect(playNotificationTone).toHaveBeenCalledTimes(1);
  expect(playNotificationTone).toHaveBeenCalledWith(notificationTone);
});

test.each(['notifications', 'messageNotifications', 'soundEnabled'] as const)('%s=false suppresses message ringtone playback', async key => {
  jest.replaceProperty(Platform, 'OS', 'android');
  await storeNotificationSettings({...DEFAULT_NOTIFICATION_SETTINGS, [key]: false});
  const result = await handler.handleNotification(incomingMessage as never);
  expect(result.shouldPlaySound).toBe(false);
  expect(playNotificationTone).not.toHaveBeenCalled();
});

test.each(['muted', 'open'] as const)('the %s conversation does not ring', async state => {
  jest.replaceProperty(Platform, 'OS', 'android');
  if (state === 'muted') { jest.mocked(getConversationMuted).mockResolvedValue(true); }
  else { setActiveNotificationChat('chat'); }
  const result = await handler.handleNotification(incomingMessage as never);
  expect(result.shouldPlaySound).toBe(false);
  expect(result.shouldShowList).toBe(false);
  expect(playNotificationTone).not.toHaveBeenCalled();
});

test('disabling popup previews keeps the selected message ringtone enabled', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  await storeNotificationSettings({...DEFAULT_NOTIFICATION_SETTINGS, popupPreview: false});
  const result = await handler.handleNotification(incomingMessage as never);
  expect(result.shouldShowBanner).toBe(false);
  expect(result.shouldShowList).toBe(true);
  expect(result.shouldPlaySound).toBe(true);
});

test('disabled group notifications stay silent without disabling direct message sounds', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  await storeNotificationSettings({...DEFAULT_NOTIFICATION_SETTINGS, groupNotifications: false} as NotificationSettings);
  const group = {request: {content: {title: 'Group', data: {chatId: 'group', groupId: 'group'}}}};
  expect((await handler.handleNotification(group as never)).shouldPlaySound).toBe(false);
  expect((await handler.handleNotification(incomingMessage as never)).shouldPlaySound).toBe(true);
});


test.each(['Short', 'Medium', 'Long'] as const)('foreground messages and groups vibrate with the selected %s mode even without sound', async mode => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  await storeNotificationSettings({...DEFAULT_NOTIFICATION_SETTINGS, vibrationEnabled: true, soundEnabled: false, messageVibration: mode, groupVibration: mode});
  await handler.handleNotification(incomingMessage as never);
  expect(vibrateNotification).toHaveBeenLastCalledWith(mode);
  const group = {request: {content: {title: 'Group', data: {chatId: 'group', groupId: 'group'}}}};
  await handler.handleNotification(group as never);
  expect(vibrateNotification).toHaveBeenCalledTimes(2);
  expect(vibrateNotification).toHaveBeenLastCalledWith(mode);
  expect(playNotificationTone).not.toHaveBeenCalled();
});

test('foreground muted messages do not trigger vibration', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  await storeNotificationSettings({...DEFAULT_NOTIFICATION_SETTINGS, vibrationEnabled: true, messageVibration: 'Long'});
  jest.mocked(getConversationMuted).mockResolvedValue(true);
  await handler.handleNotification(incomingMessage as never);
  expect(vibrateNotification).not.toHaveBeenCalled();
});
