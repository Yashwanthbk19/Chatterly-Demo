import AsyncStorage from '@react-native-async-storage/async-storage';
import {apiRequest} from '../src/api/client';
import {API_BASE_URL} from '../src/config/api';
import {
  getChatWallpaper,
  getThemePreference,
  loadStoredChatWallpaper,
  normalizeChatWallpaper,
  storeChatWallpaper,
  loadStoredThemePreference,
  storeThemePreference,
  updateChatWallpaper,
  updateThemePreference,
  wallpaperFromApiValue,
  wallpaperToApiValue,
} from '../src/services/preferencesApi';

// Sprint 11 Story 2: the theme lives behind /api/preferences/theme (plural).

jest.mock('../src/api/client', () => ({apiRequest: jest.fn()}));
jest.mock('../src/services/sessionStore', () => ({getToken: () => 'jwt-token'}));

function respond(payload: unknown): Response {
  return {json: jest.fn().mockResolvedValue(payload)} as unknown as Response;
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
});

test('reads the theme from the plural preferences route', async () => {
  jest.mocked(apiRequest).mockResolvedValue(respond({success: true, theme: 'dark'}));
  await expect(getThemePreference()).resolves.toBe('dark');
  expect(apiRequest).toHaveBeenCalledWith(`${API_BASE_URL}/preferences/theme`, expect.objectContaining({method: 'GET'}));
});

test('a theme the app does not know becomes System Default rather than breaking the palette', async () => {
  for (const theme of ['midnight', '', null, undefined]) {
    jest.mocked(apiRequest).mockResolvedValue(respond({success: true, theme}));
    await expect(getThemePreference()).resolves.toBe('system');
  }
});

test('saving sends the enum the backend validates and keeps what came back', async () => {
  jest.mocked(apiRequest).mockResolvedValue(respond({success: true, message: 'Theme updated successfully', theme: 'light'}));
  await expect(updateThemePreference('light')).resolves.toBe('light');
  expect(apiRequest).toHaveBeenLastCalledWith(
    `${API_BASE_URL}/preferences/theme`,
    expect.objectContaining({method: 'PUT', body: JSON.stringify({theme: 'light'})}),
  );

  // A server that stores something else is believed, not argued with.
  jest.mocked(apiRequest).mockResolvedValue(respond({success: true, theme: 'system'}));
  await expect(updateThemePreference('dark')).resolves.toBe('system');
});

test('a refusal is surfaced with the server message', async () => {
  jest.mocked(apiRequest).mockResolvedValue(respond({success: false, message: 'Theme must be light, dark or system'}));
  await expect(updateThemePreference('dark')).rejects.toThrow('Theme must be light, dark or system');
});

test('the device remembers the theme, and answers null before anything is stored', async () => {
  await expect(loadStoredThemePreference()).resolves.toBeNull();

  await storeThemePreference('dark');
  await expect(loadStoredThemePreference()).resolves.toBe('dark');

  // Whatever is on the device is still put through the enum on the way out.
  await AsyncStorage.setItem('chatterly.theme-preference.v1', 'midnight');
  await expect(loadStoredThemePreference()).resolves.toBe('system');
});

test('reads and updates the documented chat wallpaper endpoint', async () => {
  jest.mocked(apiRequest).mockResolvedValue(respond({success: true, chatWallpaper: 'preset:warm-waves'}));
  await expect(getChatWallpaper()).resolves.toBe('preset:warm-waves');
  expect(apiRequest).toHaveBeenLastCalledWith(`${API_BASE_URL}/preferences/chat-wallpaper`, expect.objectContaining({method: 'GET'}));

  jest.mocked(apiRequest).mockResolvedValue(respond({success: true, chatWallpaper: '#D8EEE4'}));
  await expect(updateChatWallpaper('#D8EEE4')).resolves.toBe('#D8EEE4');
  expect(apiRequest).toHaveBeenLastCalledWith(
    `${API_BASE_URL}/preferences/chat-wallpaper`,
    expect.objectContaining({method: 'PUT', body: JSON.stringify({chatWallpaper: '#D8EEE4'})}),
  );
});

test('normalizes, serializes and remembers complete wallpaper settings', async () => {
  const wallpaper = normalizeChatWallpaper({type: 'preset', value: 'warm-waves', transparency: 37, messageColor: '#6366f1'});
  expect(wallpaperToApiValue(wallpaper)).toBe('preset:warm-waves');
  expect(wallpaperFromApiValue('#d8eee4', wallpaper)).toEqual({...wallpaper, type: 'color', value: '#D8EEE4'});

  await storeChatWallpaper(wallpaper);
  await expect(loadStoredChatWallpaper()).resolves.toEqual(wallpaper);
});

test('an unwritable device does not stop the app', async () => {
  const failing = jest.spyOn(AsyncStorage, 'setItem').mockRejectedValue(new Error('disk full'));
  await expect(storeThemePreference('dark')).resolves.toBeUndefined();
  failing.mockRestore();

  const unreadable = jest.spyOn(AsyncStorage, 'getItem').mockRejectedValue(new Error('unavailable'));
  await expect(loadStoredThemePreference()).resolves.toBeNull();
  unreadable.mockRestore();
});
