import AsyncStorage from '@react-native-async-storage/async-storage';
import {apiRequest} from '../src/api/client';
import {API_BASE_URL} from '../src/config/api';
import {DEFAULT_NOTIFICATION_SETTINGS, getNotificationSettings, loadStoredNotificationSettings, normalizeNotificationSettings, storeNotificationSettings, updateNotificationSettings} from '../src/services/notificationPreferencesApi';

jest.mock('../src/api/client', () => ({apiRequest: jest.fn()}));
jest.mock('../src/services/sessionStore', () => ({getToken: () => 'jwt-token'}));

const respond = (payload: unknown) => ({json: jest.fn().mockResolvedValue(payload)}) as unknown as Response;

beforeEach(async () => { jest.clearAllMocks(); await AsyncStorage.clear(); });

test('loads backend notification settings and keeps device-only controls', async () => {
  await AsyncStorage.setItem('chatterly.notification-preferences.v1', JSON.stringify({...DEFAULT_NOTIFICATION_SETTINGS, messageReactions: false}));
  jest.mocked(apiRequest).mockResolvedValue(respond({success: true, data: {notifications: true, messageNotifications: false, groupNotifications: true, callNotifications: true, soundEnabled: true, notificationTone: 'Bell', vibrationEnabled: false, popupPreview: true}}));

  const settings = await getNotificationSettings();

  expect(apiRequest).toHaveBeenCalledWith(`${API_BASE_URL}/preferences/notifications`, expect.objectContaining({method: 'GET', headers: expect.objectContaining({Authorization: 'Bearer jwt-token'})}));
  expect(settings.notificationTone).toBe('Bell');
  expect(settings.messageNotifications).toBe(false);
  expect(settings.messageReactions).toBe(false);
  await expect(loadStoredNotificationSettings()).resolves.toEqual(settings);
});

test('normalizes invalid tones to a valid API tone', () => {
  expect(normalizeNotificationSettings({...DEFAULT_NOTIFICATION_SETTINGS, notificationTone: 'not-a-tone' as never}).notificationTone).toBe('Default');
});

test('saves notification settings using only fields supported by api.md', async () => {
  jest.mocked(apiRequest).mockResolvedValue(respond({success: true, data: {notificationTone: 'Chime'}}));
  const settings = {...DEFAULT_NOTIFICATION_SETTINGS, notificationTone: 'Chime' as const, messageReactions: false, messageVibration: 'Long' as const};

  await updateNotificationSettings(settings);

  expect(apiRequest).toHaveBeenCalledWith(`${API_BASE_URL}/preferences/notifications`, expect.objectContaining({
    method: 'PUT',
    body: JSON.stringify({notifications: true, messageNotifications: true, groupNotifications: true, callNotifications: true, soundEnabled: true, notificationTone: 'Chime', vibrationEnabled: true, popupPreview: true}),
  }));
  await expect(loadStoredNotificationSettings()).resolves.toEqual(expect.objectContaining({notificationTone: 'Chime', messageReactions: false, messageVibration: 'Long'}));
});

test('a delayed settings read cannot overwrite a newly saved notification tone', async () => {
  let resolveRemote!: (response: Response) => void;
  jest.mocked(apiRequest).mockImplementationOnce(() => new Promise(resolve => { resolveRemote = resolve; }));
  const pendingRead = getNotificationSettings();
  // Allow the request to start before the user saves a different tone.
  await Promise.resolve();
  await Promise.resolve();
  await storeNotificationSettings({...DEFAULT_NOTIFICATION_SETTINGS, notificationTone: 'Pop'});
  resolveRemote(respond({success: true, data: {notificationTone: 'Default'}}));

  await expect(pendingRead).resolves.toEqual(expect.objectContaining({notificationTone: 'Pop'}));
  await expect(loadStoredNotificationSettings()).resolves.toEqual(expect.objectContaining({notificationTone: 'Pop'}));
});
