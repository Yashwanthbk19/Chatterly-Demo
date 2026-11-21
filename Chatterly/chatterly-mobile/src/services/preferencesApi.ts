// Sprint 11 Story 2 - the theme preference, on the device and on the server.
//
// The backend router is `/api/preferences` (plural), and the theme endpoints
// answer `{success, theme}` with the enum the Preference model validates:
// light | dark | system. Every path is built from one base so a rename upstream
// is a one-line change here, the same way the web client does it.
//
// The device copy is what makes the app open in the right theme: it is read
// synchronously into state before the first paint, while the server copy is
// fetched afterwards and only overwrites it once it arrives. Signing in on a
// second device therefore inherits the saved theme, and a device with no network
// still opens the way the user last left it.

import AsyncStorage from '@react-native-async-storage/async-storage';
import {apiRequest} from '../api/client';
import {API_BASE_URL} from '../config/api';
import {getToken} from './sessionStore';
import {normalizeThemePreference, type ThemePreference} from '../theme/palette';

const PREFERENCES_BASE = '/preferences';
const THEME_STORAGE_KEY = 'chatterly.theme-preference.v1';
const CHAT_WALLPAPER_STORAGE_KEY = 'chatterly.chat-wallpaper.v1';
const CHAT_WALLPAPER_SYNCED_KEY = 'chatterly.chat-wallpaper.synced.v1';

export type ChatWallpaperType = 'default' | 'preset' | 'color' | 'image';

export type ChatWallpaperPreference = {
  type: ChatWallpaperType;
  value: string;
  transparency: number;
  messageColor: string;
};

export const DEFAULT_CHAT_WALLPAPER: ChatWallpaperPreference = Object.freeze({
  type: 'default',
  value: '',
  transparency: 12,
  messageColor: '#8B27E9',
});

const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

export function normalizeChatWallpaper(value: Partial<ChatWallpaperPreference> | null | undefined): ChatWallpaperPreference {
  const type: ChatWallpaperType = value?.type === 'preset' || value?.type === 'color' || value?.type === 'image'
    ? value.type
    : 'default';
  const rawValue = String(value?.value || '').trim();
  const validValue = type === 'color'
    ? (COLOR_PATTERN.test(rawValue) ? rawValue.toUpperCase() : '')
    : rawValue;
  const rawTransparency = Number(value?.transparency);
  const transparency = Number.isFinite(rawTransparency)
    ? Math.max(0, Math.min(80, Math.round(rawTransparency)))
    : DEFAULT_CHAT_WALLPAPER.transparency;
  const rawMessageColor = String(value?.messageColor || '');

  return {
    type: type !== 'default' && !validValue ? 'default' : type,
    value: type !== 'default' && validValue ? validValue : '',
    transparency,
    messageColor: COLOR_PATTERN.test(rawMessageColor) ? rawMessageColor.toUpperCase() : DEFAULT_CHAT_WALLPAPER.messageColor,
  };
}

export function wallpaperFromApiValue(value: unknown, local?: ChatWallpaperPreference): ChatWallpaperPreference {
  const normalized = String(value || '').trim();
  const shared = {
    transparency: local?.transparency ?? DEFAULT_CHAT_WALLPAPER.transparency,
    messageColor: local?.messageColor ?? DEFAULT_CHAT_WALLPAPER.messageColor,
  };
  if (!normalized) { return normalizeChatWallpaper({type: 'default', ...shared}); }
  if (COLOR_PATTERN.test(normalized)) { return normalizeChatWallpaper({type: 'color', value: normalized, ...shared}); }
  if (normalized.startsWith('preset:')) { return normalizeChatWallpaper({type: 'preset', value: normalized.slice(7), ...shared}); }
  return normalizeChatWallpaper({type: 'image', value: normalized, ...shared});
}

export function wallpaperToApiValue(wallpaper: ChatWallpaperPreference): string {
  const normalized = normalizeChatWallpaper(wallpaper);
  if (normalized.type === 'default') { return ''; }
  if (normalized.type === 'preset') { return `preset:${normalized.value}`; }
  return normalized.value;
}

function authenticatedHeaders(): Record<string, string> {
  const token = getToken();
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...(token ? {Authorization: `Bearer ${token}`} : {}),
  };
}

async function jsonRequest(path: string, options: RequestInit = {}): Promise<any> {
  const response = await apiRequest(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {...authenticatedHeaders(), ...(options.headers || {})},
  });
  return response.json();
}

/** The theme this device last used, or null when nothing has been stored yet. */
export async function loadStoredThemePreference(): Promise<ThemePreference | null> {
  try {
    const stored = await AsyncStorage.getItem(THEME_STORAGE_KEY);
    return stored ? normalizeThemePreference(stored) : null;
  } catch {
    return null;
  }
}

export async function storeThemePreference(preference: ThemePreference): Promise<void> {
  try {
    await AsyncStorage.setItem(THEME_STORAGE_KEY, normalizeThemePreference(preference));
  } catch {
    // A device that cannot write its preference still honours it for this run.
  }
}

export async function loadStoredChatWallpaper(): Promise<ChatWallpaperPreference | null> {
  try {
    const stored = await AsyncStorage.getItem(CHAT_WALLPAPER_STORAGE_KEY);
    return stored ? normalizeChatWallpaper(JSON.parse(stored)) : null;
  } catch {
    return null;
  }
}

export async function storeChatWallpaper(wallpaper: ChatWallpaperPreference): Promise<void> {
  try {
    await AsyncStorage.setItem(CHAT_WALLPAPER_STORAGE_KEY, JSON.stringify(normalizeChatWallpaper(wallpaper)));
  } catch {
    // The selected wallpaper remains active for this run when storage is full.
  }
}

/**
 * The account's wallpaper value as this device last read or wrote it. A photo
 * wallpaper is shown here from the full-resolution original but synced as a
 * small inline copy, so when the account still holds the copy this device
 * uploaded, the original is kept rather than swapped for the copy.
 */
export async function loadSyncedChatWallpaperValue(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(CHAT_WALLPAPER_SYNCED_KEY);
  } catch {
    return null;
  }
}

export async function storeSyncedChatWallpaperValue(value: string): Promise<void> {
  try {
    await AsyncStorage.setItem(CHAT_WALLPAPER_SYNCED_KEY, String(value || ''));
  } catch {
    // Worst case the next sync replaces a local photo with its synced copy.
  }
}

/** `GET /api/preferences/chat-wallpaper`. */
export async function getChatWallpaper(): Promise<string> {
  const payload = await jsonRequest(`${PREFERENCES_BASE}/chat-wallpaper`, {method: 'GET'});
  return String(payload?.chatWallpaper ?? payload?.data?.chatWallpaper ?? '');
}

/** `PUT /api/preferences/chat-wallpaper`. */
export async function updateChatWallpaper(chatWallpaper: string): Promise<string> {
  const payload = await jsonRequest(`${PREFERENCES_BASE}/chat-wallpaper`, {
    method: 'PUT',
    body: JSON.stringify({chatWallpaper: String(chatWallpaper || '')}),
  });
  if (payload?.success === false) {
    throw new Error(String(payload?.message || 'Your chat wallpaper could not be saved.'));
  }
  return String(payload?.chatWallpaper ?? chatWallpaper ?? '');
}

/** `GET /api/preferences/theme`. */
export async function getThemePreference(): Promise<ThemePreference> {
  const payload = await jsonRequest(`${PREFERENCES_BASE}/theme`, {method: 'GET'});
  return normalizeThemePreference(payload?.theme ?? payload?.data?.theme);
}

/**
 * `PUT /api/preferences/theme`. Resolves to the theme the server stored, which
 * is what the app keeps, so a server that clamps the value is not argued with.
 */
export async function updateThemePreference(preference: ThemePreference): Promise<ThemePreference> {
  const theme = normalizeThemePreference(preference);
  const payload = await jsonRequest(`${PREFERENCES_BASE}/theme`, {
    method: 'PUT',
    body: JSON.stringify({theme}),
  });
  if (payload?.success === false) {
    throw new Error(String(payload?.message || 'Your theme could not be saved.'));
  }
  return normalizeThemePreference(payload?.theme ?? theme);
}
