import AsyncStorage from '@react-native-async-storage/async-storage';
import {apiRequest} from '../api/client';
import {API_BASE_URL} from '../config/api';
import {getToken} from './sessionStore';

export const NOTIFICATION_TONES = ['Default', 'Chime', 'Bell', 'Pop'] as const;
export type NotificationTone = typeof NOTIFICATION_TONES[number];
export type VibrationPattern = 'Turned Off' | 'Short' | 'Medium' | 'Long';

export type NotificationSettings = {
  notifications: boolean;
  messageNotifications: boolean;
  groupNotifications: boolean;
  callNotifications: boolean;
  soundEnabled: boolean;
  notificationTone: NotificationTone;
  vibrationEnabled: boolean;
  popupPreview: boolean;
  messageReactions: boolean;
  sentMessageSound: boolean;
  groupReactions: boolean;
  groupSentMessageSound: boolean;
  callRingtone: boolean;
  messageVibration: VibrationPattern;
  groupVibration: VibrationPattern;
  callVibration: VibrationPattern;
};

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  notifications: true,
  messageNotifications: true,
  groupNotifications: true,
  callNotifications: true,
  soundEnabled: true,
  notificationTone: 'Default',
  vibrationEnabled: true,
  popupPreview: true,
  messageReactions: true,
  sentMessageSound: true,
  groupReactions: true,
  groupSentMessageSound: true,
  callRingtone: true,
  messageVibration: 'Turned Off',
  groupVibration: 'Turned Off',
  callVibration: 'Turned Off',
};

const STORAGE_KEY = 'chatterly.notification-preferences.v1';
const PATH = '/preferences/notifications';
const VIBRATION_PATTERNS: VibrationPattern[] = ['Turned Off', 'Short', 'Medium', 'Long'];
let settingsRevision = 0;
const settingsListeners = new Set<(settings: NotificationSettings) => void>();

export function subscribeToNotificationSettings(listener: (settings: NotificationSettings) => void): () => void {
  settingsListeners.add(listener);
  return () => { settingsListeners.delete(listener); };
}

function boolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function normalizeNotificationSettings(value: Partial<NotificationSettings> | null | undefined): NotificationSettings {
  const tone = NOTIFICATION_TONES.find(option => option === value?.notificationTone) || 'Default';
  const vibration = (key: 'messageVibration' | 'groupVibration' | 'callVibration') =>
    VIBRATION_PATTERNS.includes(value?.[key] as VibrationPattern) ? value?.[key] as VibrationPattern : 'Turned Off';
  return {
    notifications: boolean(value?.notifications, DEFAULT_NOTIFICATION_SETTINGS.notifications),
    messageNotifications: boolean(value?.messageNotifications, DEFAULT_NOTIFICATION_SETTINGS.messageNotifications),
    groupNotifications: boolean(value?.groupNotifications, DEFAULT_NOTIFICATION_SETTINGS.groupNotifications),
    callNotifications: boolean(value?.callNotifications, DEFAULT_NOTIFICATION_SETTINGS.callNotifications),
    soundEnabled: boolean(value?.soundEnabled, DEFAULT_NOTIFICATION_SETTINGS.soundEnabled),
    notificationTone: tone,
    vibrationEnabled: boolean(value?.vibrationEnabled, DEFAULT_NOTIFICATION_SETTINGS.vibrationEnabled),
    popupPreview: boolean(value?.popupPreview, DEFAULT_NOTIFICATION_SETTINGS.popupPreview),
    messageReactions: boolean(value?.messageReactions, DEFAULT_NOTIFICATION_SETTINGS.messageReactions),
    sentMessageSound: boolean(value?.sentMessageSound, DEFAULT_NOTIFICATION_SETTINGS.sentMessageSound),
    groupReactions: boolean(value?.groupReactions, DEFAULT_NOTIFICATION_SETTINGS.groupReactions),
    groupSentMessageSound: boolean(value?.groupSentMessageSound, DEFAULT_NOTIFICATION_SETTINGS.groupSentMessageSound),
    callRingtone: boolean(value?.callRingtone, DEFAULT_NOTIFICATION_SETTINGS.callRingtone),
    messageVibration: vibration('messageVibration'),
    groupVibration: vibration('groupVibration'),
    callVibration: vibration('callVibration'),
  };
}

export async function loadStoredNotificationSettings(): Promise<NotificationSettings> {
  try {
    const value = await AsyncStorage.getItem(STORAGE_KEY);
    return value ? normalizeNotificationSettings(JSON.parse(value)) : DEFAULT_NOTIFICATION_SETTINGS;
  } catch {
    return DEFAULT_NOTIFICATION_SETTINGS;
  }
}

export async function storeNotificationSettings(settings: NotificationSettings): Promise<void> {
  settingsRevision += 1;
  try { await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { /* Keep current in-memory settings usable. */ }
  settingsListeners.forEach(listener => listener(settings));
}

function headers(): Record<string, string> {
  const token = getToken();
  return {'Content-Type': 'application/json', Accept: 'application/json', ...(token ? {Authorization: `Bearer ${token}`} : {})};
}

export async function getNotificationSettings(): Promise<NotificationSettings> {
  const revision = settingsRevision;
  const local = await loadStoredNotificationSettings();
  const response = await apiRequest(`${API_BASE_URL}${PATH}`, {method: 'GET', headers: headers()});
  const payload = await response.json();
  // A settings read started before Save must not restore the previous tone.
  if (revision !== settingsRevision) { return loadStoredNotificationSettings(); }
  const remote = payload?.data ?? payload;
  const settings = normalizeNotificationSettings({...local, ...remote});
  await storeNotificationSettings(settings);
  return settings;
}

export async function updateNotificationSettings(value: NotificationSettings): Promise<NotificationSettings> {
  const settings = normalizeNotificationSettings(value);
  await storeNotificationSettings(settings);
  const token = getToken();
  if (!token) { return settings; }
  const response = await apiRequest(`${API_BASE_URL}${PATH}`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify({
      notifications: settings.notifications,
      messageNotifications: settings.messageNotifications,
      groupNotifications: settings.groupNotifications,
      callNotifications: settings.callNotifications,
      soundEnabled: settings.soundEnabled,
      notificationTone: settings.notificationTone,
      vibrationEnabled: settings.vibrationEnabled,
      popupPreview: settings.popupPreview,
    }),
  });
  const payload = await response.json();
  if (payload?.success === false) {
    throw new Error(String(payload?.message || 'Notification settings could not be saved.'));
  }
  const saved = normalizeNotificationSettings({...settings, ...(payload?.data ?? {})});
  await storeNotificationSettings(saved);
  return saved;
}
