import Constants from 'expo-constants';
import {NativeModules} from 'react-native';

// The deployed backend. This is the default for development and release builds
// alike, which is how the app has always worked - flipping the switch below is
// a personal setting, not a team one, so please don't commit it.
const LIVE_API_BASE_URL = 'https://chatterly.stacklycloud.com/api';

// Set to true to work against a backend running on your own machine
// (chatterly-web/backend, port 5000).
const USE_LOCAL_BACKEND = false;

// Leave empty to detect this machine automatically. That is what you want with
// Expo Go on a physical phone: the address is read from the Expo dev server, so
// there is no IP to look up and it survives a new DHCP address.
//
// Set it only for a case detection cannot cover, such as an Android emulator,
// which reaches the host machine at 10.0.2.2:
//
//   LOCAL_API_BASE_URL = 'http://10.0.2.2:5000/api'
const LOCAL_API_BASE_URL = '';

const API_PORT = 5000;

// Accepts "192.168.1.20:8081" as well as "http://192.168.1.20:8081/index.bundle".
function extractHost(value: string): string {
  const withoutScheme = value.replace(/^[a-z+]+:\/\//i, '');
  return withoutScheme.split(/[/:?]/)[0] || '';
}

// localhost is right for an emulator but useless on a physical device.
function isRoutable(host: string): boolean {
  return host !== 'localhost' && host !== '127.0.0.1';
}

function resolveLocalHost(): string {
  // Read in order and stop at the first routable answer.
  const sources: Array<() => string> = [
    // Expo Go and dev clients report the serving machine here.
    () => extractHost((Constants.expoConfig as {hostUri?: string} | null | undefined)?.hostUri || ''),
    // Undefined under the New Architecture, hence the Expo source above.
    () => extractHost(NativeModules.SourceCode?.scriptURL || ''),
  ];

  let firstAnswer = '';
  for (const read of sources) {
    const host = read();
    if (!host) { continue; }
    if (isRoutable(host)) { return host; }
    if (!firstAnswer) { firstAnswer = host; }
  }

  return firstAnswer;
}

function resolveApiBaseUrl(): string {
  if (!USE_LOCAL_BACKEND) { return LIVE_API_BASE_URL; }
  if (LOCAL_API_BASE_URL) { return LOCAL_API_BASE_URL; }

  const host = resolveLocalHost();
  // Falling back to the live URL beats guessing an unreachable address.
  return host ? `http://${host}:${API_PORT}/api` : LIVE_API_BASE_URL;
}

export const API_BASE_URL = resolveApiBaseUrl();
export const SOCKET_BASE_URL = API_BASE_URL.replace(/\/api\/?$/, '');
export const API_TIMEOUT_MS = 15000;
export const API_FALLBACK_TIMEOUT_MS = 5000;

function uniqueUrls(urls: string[]): string[] {
  return [...new Set(urls.filter(Boolean))];
}

const detectedLocalHost = resolveLocalHost();

export const DEV_API_FALLBACK_BASE_URLS = uniqueUrls([
  detectedLocalHost ? `http://${detectedLocalHost}:${API_PORT}/api` : '',
  'http://10.0.2.2:5000/api',
  'http://localhost:5000/api',
]).filter(url => url !== API_BASE_URL);
