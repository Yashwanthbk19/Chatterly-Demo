import AsyncStorage from '@react-native-async-storage/async-storage';
import {Platform} from 'react-native';

// Ported from the web app's utils/deviceIdentity.js. The same deviceId goes out
// on every login call: the backend's handleTrustedDeviceLogin() looks it up and
// skips the second factor when this device was trusted before, so it has to
// stay stable.
//
// The web persists it in localStorage. Mobile keeps the same identifier in
// AsyncStorage so a trusted device remains the same device after an app restart.
const DEVICE_ID_STORAGE_KEY = 'chatterly.device-id.v1';

function createDeviceId(): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `device-${Date.now().toString(36)}-${random}`;
}

let cachedDeviceId: string | null = null;
let deviceIdPromise: Promise<string> | null = null;

export function getDeviceId(): Promise<string> {
  if (cachedDeviceId) { return Promise.resolve(cachedDeviceId); }
  if (deviceIdPromise) { return deviceIdPromise; }
  deviceIdPromise = AsyncStorage.getItem(DEVICE_ID_STORAGE_KEY).then(async stored => {
    cachedDeviceId = stored || createDeviceId();
    if (!stored) { await AsyncStorage.setItem(DEVICE_ID_STORAGE_KEY, cachedDeviceId); }
    return cachedDeviceId;
  }).catch(() => {
    cachedDeviceId = cachedDeviceId || createDeviceId();
    return cachedDeviceId;
  });
  return deviceIdPromise;
}

// The backend restricts platform to android | ios | web.
export function getPlatformName(): 'android' | 'ios' | 'web' {
  if (Platform.OS === 'android') { return 'android'; }
  if (Platform.OS === 'ios') { return 'ios'; }
  return 'web';
}

export async function getDeviceIdentity() {
  return {
    deviceId: await getDeviceId(),
    deviceName: `${Platform.OS} ${Platform.Version}`,
    platform: getPlatformName(),
    browser: Platform.OS === 'web' ? 'Web' : 'React Native',
  };
}
