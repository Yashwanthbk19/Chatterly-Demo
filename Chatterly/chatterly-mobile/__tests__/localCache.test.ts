import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import {clearTemporaryMediaCache} from '../src/services/mediaStorage';
import {clearLocalCache} from '../src/services/localCache';

jest.mock('../src/services/mediaStorage', () => ({clearTemporaryMediaCache: jest.fn().mockResolvedValue(undefined)}));

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
});

test('clears cached account content and private local auth data while preserving app preferences and device identity', async () => {
  await AsyncStorage.multiSet([
    ['chatterly.messages.v1.user-1.chat-1', 'cached messages'],
    ['chatterly.hidden-call-history.v1:user-1', '["call-1"]'],
    ['@chatterly/broadcast-messages-v1:user-1', '{"broadcast-1":[]}'],
    ['@chatterly/deleted-broadcasts-v1:user-1', '{"broadcast-2":true}'],
    ['@chatterly/broadcast-images', '{"broadcast-1":"file://cached.jpg"}'],
    ['chatterly.notification-preferences.v1', '{"messageNotifications":false}'],
    ['chatterly.media-auto-download.v1', '{"mobileData":false}'],
    ['chat.disappearingTimer.chat-1', '7d'],
    ['privacy.localTwoFactorEnabled', 'true'],
    ['chatterly.device-id.v1', 'stable-device-id'],
    ['chatterly.theme-preference.v1', 'dark'],
    ['chatterly.chat-wallpaper.v1', '{"type":"preset"}'],
  ]);

  await clearLocalCache();

  expect(await AsyncStorage.getItem('chatterly.messages.v1.user-1.chat-1')).toBeNull();
  expect(await AsyncStorage.getItem('@chatterly/broadcast-messages-v1:user-1')).toBeNull();
  expect(await AsyncStorage.getItem('privacy.localTwoFactorEnabled')).toBeNull();
  expect(await AsyncStorage.getItem('chatterly.notification-preferences.v1')).toBeNull();
  expect(await AsyncStorage.getItem('chatterly.media-auto-download.v1')).toBeNull();
  expect(await AsyncStorage.getItem('chatterly.device-id.v1')).toBe('stable-device-id');
  expect(await AsyncStorage.getItem('chatterly.theme-preference.v1')).toBe('dark');
  expect(await AsyncStorage.getItem('chatterly.chat-wallpaper.v1')).not.toBeNull();
  expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('privacy.recoveryCodes');
  expect(clearTemporaryMediaCache).toHaveBeenCalledTimes(1);
});

test('continues logout cleanup if one cache provider fails', async () => {
  jest.mocked(clearTemporaryMediaCache).mockRejectedValueOnce(new Error('cache unavailable'));
  await expect(clearLocalCache()).resolves.toBeUndefined();
  expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('privacy.recoveryCodes');
});
