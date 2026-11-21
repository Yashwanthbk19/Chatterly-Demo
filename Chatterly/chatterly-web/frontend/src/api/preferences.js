import axiosInstance from './axios';
import { toApiError } from './helpers';

// Backend commit "Naming error in api.md and route" renamed this router from
// /api/preference to /api/preferences (and /wallpaper to /chat-wallpaper), so
// every path here is built from one base to keep them in step with docs/api.md.
const PREFERENCES_BASE = '/api/preferences';
const NOTIFICATION_PREFERENCES_ENDPOINT = `${PREFERENCES_BASE}/notifications`;
const THEME_PREFERENCES_ENDPOINT = `${PREFERENCES_BASE}/theme`;
const VALID_THEME_PREFERENCES = new Set(['light', 'dark', 'system']);

// Sprint 11 - Story 1: Preferences Main Screen (Settings Entry)
// Loads the categorized settings menu and the app version from the backend so
// the settings hub reflects the server-defined list and version.
export const getSettingsScreen = async () => {
  try {
    const response = await axiosInstance({
      method: 'get',
      url: `${PREFERENCES_BASE}/settings`,
      skipGlobalLoading: true,
      skipGlobalError: true,
    });
    const body = response?.data || {};

    return {
      items: Array.isArray(body.data) ? body.data : [],
      appVersion: body.appVersion || '',
    };
  } catch (error) {
    throw toApiError(error, 'Failed to load the settings menu.');
  }
};

export const getThemePreference = async () => {
  try {
    const response = await axiosInstance({
      method: 'get',
      url: THEME_PREFERENCES_ENDPOINT,
      skipGlobalLoading: true,
      skipGlobalError: true,
    });
    const theme = String(response?.data?.theme || '').trim().toLowerCase();
    return VALID_THEME_PREFERENCES.has(theme) ? theme : 'system';
  } catch (error) {
    throw toApiError(error, 'Failed to load your theme preference.');
  }
};

export const updateThemePreference = async (theme) => {
  const normalizedTheme = String(theme || '').trim().toLowerCase();
  if (!VALID_THEME_PREFERENCES.has(normalizedTheme)) {
    throw new Error('Theme must be light, dark or system.');
  }

  try {
    const response = await axiosInstance({
      method: 'put',
      url: THEME_PREFERENCES_ENDPOINT,
      data: { theme: normalizedTheme },
      skipGlobalLoading: true,
      skipGlobalError: true,
    });
    const savedTheme = String(response?.data?.theme || '').trim().toLowerCase();
    return VALID_THEME_PREFERENCES.has(savedTheme) ? savedTheme : normalizedTheme;
  } catch (error) {
    throw toApiError(error, 'Failed to save your theme preference.');
  }
};

// Sprint 11 - Story 3: Chat Wallpaper Customization
// The preferences API persists the global wallpaper. Per-chat overrides and the
// readability overlay are intentionally kept client-side because api.md does not
// expose fields for either of those advanced settings.
export const getChatWallpaper = async () => {
  try {
    const response = await axiosInstance({
      method: 'get',
      url: `${PREFERENCES_BASE}/chat-wallpaper`,
      skipGlobalLoading: true,
      skipGlobalError: true,
    });

    return String(response?.data?.chatWallpaper || '');
  } catch (error) {
    throw toApiError(error, 'Failed to load your chat wallpaper.');
  }
};

export const updateChatWallpaper = async (chatWallpaper = '') => {
  try {
    const response = await axiosInstance({
      method: 'put',
      url: `${PREFERENCES_BASE}/chat-wallpaper`,
      data: { chatWallpaper: String(chatWallpaper || '') },
      skipGlobalLoading: true,
      skipGlobalError: true,
    });

    return {
      chatWallpaper: String(response?.data?.chatWallpaper ?? chatWallpaper ?? ''),
      message: response?.data?.message || 'Chat wallpaper updated successfully.',
    };
  } catch (error) {
    throw toApiError(error, 'Failed to update your chat wallpaper.');
  }
};

export const getNotificationSettings = async () => {
  try {
    const response = await axiosInstance({ method: 'get', url: NOTIFICATION_PREFERENCES_ENDPOINT, skipGlobalLoading: true, skipGlobalError: true });
    return response?.data?.data || {};
  } catch (error) {
    throw toApiError(error, 'Failed to load notification settings.');
  }
};

export const updateNotificationSettings = async (settings) => {
  try {
    const response = await axiosInstance({ method: 'put', url: NOTIFICATION_PREFERENCES_ENDPOINT, data: settings, skipGlobalLoading: true, skipGlobalError: true });
    return response?.data?.data || settings;
  } catch (error) {
    throw toApiError(error, 'Failed to update notification settings.');
  }
};
