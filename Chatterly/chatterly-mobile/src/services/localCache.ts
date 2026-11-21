import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import {clearTemporaryMediaCache} from './mediaStorage';
import {clearChatListActivities} from './chatListActivity';

const CACHE_KEY_PREFIXES = [
  'chatterly.messages.v1.',
  'chatterly.hidden-call-history.v1:',
  '@chatterly/broadcast-messages-v1:',
  '@chatterly/deleted-broadcasts-v1:',
];
const GLOBAL_CACHE_KEYS = [
  '@chatterly/broadcast-images',
  'chatterly.notification-preferences.v1',
  'chatterly.media-data-usage.v1',
  'chatterly.media-auto-download.v1',
  'privacy.localTwoFactorEnabled',
  'privacy.twoFactorMethod',
  'privacy.recoveryCodes',
  'privacy.lastTwoFactorVerifiedAt',
];

/** Removes locally cached account content and temporary files on explicit logout. */
export async function clearLocalCache(): Promise<void> {
  clearChatListActivities();
  const keys = await AsyncStorage.getAllKeys().catch(() => []);
  const cachedKeys = keys.filter(key =>
    CACHE_KEY_PREFIXES.some(prefix => key.startsWith(prefix)) ||
    GLOBAL_CACHE_KEYS.includes(key) ||
    key.startsWith('chat.disappearingTimer.'),
  );

  await Promise.allSettled([
    cachedKeys.length ? AsyncStorage.multiRemove(cachedKeys) : Promise.resolve(),
    SecureStore.deleteItemAsync('privacy.recoveryCodes'),
    clearTemporaryMediaCache(),
  ]);
}
