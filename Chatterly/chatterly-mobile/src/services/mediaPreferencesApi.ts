import AsyncStorage from '@react-native-async-storage/async-storage';
import {apiRequest} from '../api/client';
import {API_BASE_URL} from '../config/api';
import {getToken} from './sessionStore';

const DATA_USAGE_PATH = '/preferences/data-usage';
const AUTO_DOWNLOAD_PATH = '/preferences/auto-download';
const DATA_USAGE_STORAGE_KEY = 'chatterly.media-data-usage.v1';
const AUTO_DOWNLOAD_STORAGE_KEY = 'chatterly.media-auto-download.v1';

export type MediaUploadQuality = 'low' | 'medium' | 'high';
export type DownloadMediaType = 'photos' | 'videos' | 'audio' | 'documents';
export type DownloadNetwork = 'mobileData' | 'wifi' | 'roaming';

export type DataUsageSettings = {
  mediaUploadQuality: MediaUploadQuality;
  storageUsed: number;
  cacheClearedAt: string | null;
};

export type AutoDownloadSettings = {
  mobileData: Record<DownloadMediaType, boolean>;
  wifi: Record<DownloadMediaType, boolean>;
  roaming: Record<DownloadMediaType, boolean>;
  /** Per-device preference; the account API only stores network-level choices. */
  saveToGallery: boolean;
};

export const DEFAULT_DATA_USAGE_SETTINGS: DataUsageSettings = Object.freeze({
  mediaUploadQuality: 'medium',
  storageUsed: 0,
  cacheClearedAt: null,
});

export const DEFAULT_AUTO_DOWNLOAD_SETTINGS: AutoDownloadSettings = Object.freeze({
  mobileData: {photos: true, videos: false, audio: true, documents: false},
  wifi: {photos: true, videos: true, audio: true, documents: true},
  roaming: {photos: false, videos: false, audio: false, documents: false},
  saveToGallery: false,
});

function headers(): Record<string, string> {
  const token = getToken();
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...(token ? {Authorization: `Bearer ${token}`} : {}),
  };
}

async function request(path: string, options: RequestInit = {}): Promise<any> {
  const response = await apiRequest(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {...headers(), ...(options.headers || {})},
  });
  return response.json();
}

function normalizeQuality(value: unknown): MediaUploadQuality {
  const quality = String(value || '').trim().toLowerCase();
  return quality === 'low' || quality === 'high' ? quality : 'medium';
}

/** Accepts the numeric model value and the unit-bearing example used in api.md. */
export function storageValueToBytes(value: unknown): number {
  if (typeof value === 'number') { return Number.isFinite(value) && value > 0 ? value : 0; }
  const match = /^([\d.]+)\s*(b|kb|mb|gb|tb)?$/i.exec(String(value || '').trim());
  if (!match) { return 0; }
  const amount = Number(match[1]);
  const powers: Record<string, number> = {b: 0, kb: 1, mb: 2, gb: 3, tb: 4};
  const power = powers[(match[2] || 'b').toLowerCase()] ?? 0;
  return Number.isFinite(amount) ? Math.max(0, amount * (1024 ** power)) : 0;
}

export function normalizeDataUsageSettings(value: any): DataUsageSettings {
  return {
    mediaUploadQuality: normalizeQuality(value?.mediaUploadQuality),
    storageUsed: storageValueToBytes(value?.storageUsed),
    cacheClearedAt: value?.cacheClearedAt ? String(value.cacheClearedAt) : null,
  };
}

function mediaTypes(value: any, fallback: Record<DownloadMediaType, boolean>): Record<DownloadMediaType, boolean> {
  return {
    photos: typeof value?.photos === 'boolean' ? value.photos : fallback.photos,
    videos: typeof value?.videos === 'boolean' ? value.videos : fallback.videos,
    audio: typeof value?.audio === 'boolean' ? value.audio : fallback.audio,
    documents: typeof value?.documents === 'boolean' ? value.documents : fallback.documents,
  };
}

export function normalizeAutoDownloadSettings(value: any): AutoDownloadSettings {
  // api.md originally illustrated network values as booleans. Supporting both
  // that shape and the backend model's per-media object keeps older accounts valid.
  const mobile = typeof value?.mobileData === 'boolean'
    ? {photos: value.mobileData, videos: value.mobileData, audio: value.mobileData, documents: value.mobileData}
    : mediaTypes(value?.mobileData, DEFAULT_AUTO_DOWNLOAD_SETTINGS.mobileData);
  const wifi = typeof value?.wifi === 'boolean'
    ? {photos: value.wifi, videos: value.wifi, audio: value.wifi, documents: value.wifi}
    : mediaTypes(value?.wifi, DEFAULT_AUTO_DOWNLOAD_SETTINGS.wifi);
  const legacyRoaming = typeof value?.roaming?.allMedia === 'boolean'
    ? {photos: value.roaming.allMedia, videos: value.roaming.allMedia, audio: value.roaming.allMedia, documents: value.roaming.allMedia}
    : value?.roaming;
  const roaming = typeof legacyRoaming === 'boolean'
    ? {photos: legacyRoaming, videos: legacyRoaming, audio: legacyRoaming, documents: legacyRoaming}
    : mediaTypes(legacyRoaming, DEFAULT_AUTO_DOWNLOAD_SETTINGS.roaming);
  return {
    mobileData: mobile,
    wifi,
    roaming,
    saveToGallery: typeof value?.saveToGallery === 'boolean' ? value.saveToGallery : false,
  };
}

async function readStored<T>(key: string, normalize: (value: any) => T, fallback: T): Promise<T> {
  try {
    const value = await AsyncStorage.getItem(key);
    return value ? normalize(JSON.parse(value)) : fallback;
  } catch {
    return fallback;
  }
}

async function store(key: string, value: unknown): Promise<void> {
  try { await AsyncStorage.setItem(key, JSON.stringify(value)); } catch { /* Keep the in-memory selection active. */ }
}

type AutoDownloadListener = (settings: AutoDownloadSettings) => void;
const autoDownloadListeners = new Set<AutoDownloadListener>();
let autoDownloadRevision = 0;
let dataUsageRevision = 0;
let dataUsageRead = 0;

/**
 * Told whenever the auto-download choices change - saved in Media & Links or
 * refreshed from the account - so an open chat applies them straight away
 * rather than on its next visit.
 */
export function subscribeToAutoDownloadSettings(listener: AutoDownloadListener): () => void {
  autoDownloadListeners.add(listener);
  return () => { autoDownloadListeners.delete(listener); };
}

async function storeAutoDownload(settings: AutoDownloadSettings): Promise<number> {
  const revision = ++autoDownloadRevision;
  await store(AUTO_DOWNLOAD_STORAGE_KEY, settings);
  if (revision === autoDownloadRevision) { autoDownloadListeners.forEach(listener => listener(settings)); }
  return revision;
}

export const loadStoredDataUsageSettings = () => readStored(DATA_USAGE_STORAGE_KEY, normalizeDataUsageSettings, DEFAULT_DATA_USAGE_SETTINGS);
export const loadStoredAutoDownloadSettings = () => readStored(AUTO_DOWNLOAD_STORAGE_KEY, normalizeAutoDownloadSettings, DEFAULT_AUTO_DOWNLOAD_SETTINGS);

/** GET /api/preferences/data-usage. */
export async function getDataUsageSettings(): Promise<DataUsageSettings> {
  const read = ++dataUsageRead;
  const revision = dataUsageRevision;
  const payload = await request(DATA_USAGE_PATH, {method: 'GET'});
  if (revision !== dataUsageRevision || read !== dataUsageRead) { return loadStoredDataUsageSettings(); }
  if (payload?.success === false) { throw new Error(payload?.message || 'Unable to refresh data usage.'); }
  const settings = normalizeDataUsageSettings(payload?.data ?? payload);
  await store(DATA_USAGE_STORAGE_KEY, settings);
  return settings;
}

/** PUT /api/preferences/data-usage. */
export async function updateDataUsageSettings(update: Partial<DataUsageSettings>): Promise<DataUsageSettings> {
  const current = await loadStoredDataUsageSettings();
  const optimistic = normalizeDataUsageSettings({...current, ...update});
  const revision = ++dataUsageRevision;
  await store(DATA_USAGE_STORAGE_KEY, optimistic);
  const payload = await request(DATA_USAGE_PATH, {
    method: 'PUT',
    body: JSON.stringify({
      ...(update.mediaUploadQuality ? {mediaUploadQuality: normalizeQuality(update.mediaUploadQuality)[0].toUpperCase() + normalizeQuality(update.mediaUploadQuality).slice(1)} : {}),
      // A numeric byte string satisfies the documented String field and the
      // deployed numeric model without rounding the measured storage value.
      ...(update.storageUsed !== undefined ? {storageUsed: String(Math.round(storageValueToBytes(update.storageUsed)))} : {}),
      ...(update.cacheClearedAt !== undefined ? {cacheClearedAt: update.cacheClearedAt} : {}),
    }),
  });
  if (payload?.success === false) { throw new Error(payload?.message || 'Unable to save data usage.'); }
  if (revision !== dataUsageRevision) { return loadStoredDataUsageSettings(); }
  const saved = normalizeDataUsageSettings({...optimistic, ...(payload?.data ?? {})});
  // Also invalidate reads begun while the PUT was still pending: their
  // responses can contain the previous server value even after Save finishes.
  dataUsageRevision += 1;
  await store(DATA_USAGE_STORAGE_KEY, saved);
  return saved;
}

/** GET /api/preferences/auto-download. */
export async function getAutoDownloadSettings(): Promise<AutoDownloadSettings> {
  const revision = autoDownloadRevision;
  const local = await loadStoredAutoDownloadSettings();
  const storedValue = await AsyncStorage.getItem(AUTO_DOWNLOAD_STORAGE_KEY).catch(() => null);
  const payload = await request(AUTO_DOWNLOAD_PATH, {method: 'GET'});
  if (revision !== autoDownloadRevision) { return loadStoredAutoDownloadSettings(); }
  const server = payload?.data ?? payload;
  // The API stores one network toggle; per-media choices remain local. A server
  // disabled network always wins, while an enabled network restores local detail -
  // unless that detail has every type off, which would quietly overrule the account.
  const networkSettings = (value: unknown, previous: Record<DownloadMediaType, boolean>) => {
    if (typeof value !== 'boolean') { return value; }
    if (!value) { return {photos: false, videos: false, audio: false, documents: false}; }
    return storedValue && Object.values(previous).some(Boolean) ? previous : {photos: true, videos: true, audio: true, documents: true};
  };
  const normalizedRoaming = typeof server?.roaming === 'boolean'
    ? server.roaming
      ? (storedValue && Object.values(local.roaming).some(Boolean)
          ? local.roaming
          : {photos: true, videos: true, audio: true, documents: true})
      : {photos: false, videos: false, audio: false, documents: false}
    : server?.roaming ?? local.roaming;
  const settings = normalizeAutoDownloadSettings({
    ...local,
    ...server,
    mobileData: networkSettings(server?.mobileData, local.mobileData),
    wifi: networkSettings(server?.wifi, local.wifi),
    roaming: normalizedRoaming,
    saveToGallery: local.saveToGallery,
  });
  await storeAutoDownload(settings);
  return settings;
}

/** PUT /api/preferences/auto-download. */
export async function updateAutoDownloadSettings(settings: AutoDownloadSettings): Promise<AutoDownloadSettings> {
  const normalized = normalizeAutoDownloadSettings(settings);
  const revision = await storeAutoDownload(normalized);
  const serverUpdate = {
    mobileData: Object.values(normalized.mobileData).some(Boolean),
    wifi: Object.values(normalized.wifi).some(Boolean),
    roaming: Object.values(normalized.roaming).some(Boolean),
  };
  const payload = await request(AUTO_DOWNLOAD_PATH, {method: 'PUT', body: JSON.stringify(serverUpdate)});
  if (revision !== autoDownloadRevision) { return loadStoredAutoDownloadSettings(); }
  const response = payload?.data ?? serverUpdate;
  const saved = normalizeAutoDownloadSettings({
    ...normalized, ...response,
    mobileData: response.mobileData === true ? normalized.mobileData : response.mobileData ?? normalized.mobileData,
    wifi: response.wifi === true ? normalized.wifi : response.wifi ?? normalized.wifi,
    roaming: typeof response.roaming === 'boolean'
      ? response.roaming ? normalized.roaming : DEFAULT_AUTO_DOWNLOAD_SETTINGS.roaming
      : response.roaming ?? normalized.roaming,
    saveToGallery: normalized.saveToGallery,
  });
  await storeAutoDownload(saved);
  return saved;
}
