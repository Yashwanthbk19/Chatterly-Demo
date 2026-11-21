export const AUTO_DOWNLOAD_MEDIA_PREFERENCES_KEY = 'chatterly_auto_download_media_preferences';
export const AUTO_DOWNLOAD_MEDIA_PREFERENCES_CHANGED_EVENT = 'chatterly:auto-download-preferences-changed';

export const DEFAULT_AUTO_DOWNLOAD_MEDIA_PREFERENCES = {
  mobileData: { photos: true, videos: false, audio: true, documents: false },
  wifi: { photos: true, videos: false, audio: true, documents: false },
  roaming: { allMedia: false },
};

const normalizePreferences = (preferences = {}) => ({
  mobileData: {
    ...DEFAULT_AUTO_DOWNLOAD_MEDIA_PREFERENCES.mobileData,
    ...(preferences.mobileData || {}),
  },
  wifi: {
    ...DEFAULT_AUTO_DOWNLOAD_MEDIA_PREFERENCES.wifi,
    ...(preferences.wifi || {}),
  },
  roaming: {
    ...DEFAULT_AUTO_DOWNLOAD_MEDIA_PREFERENCES.roaming,
    ...(preferences.roaming || {}),
  },
});

export const readAutoDownloadMediaPreferences = () => {
  if (typeof localStorage === 'undefined') {
    return DEFAULT_AUTO_DOWNLOAD_MEDIA_PREFERENCES;
  }

  try {
    const parsedValue = JSON.parse(
      localStorage.getItem(AUTO_DOWNLOAD_MEDIA_PREFERENCES_KEY) || 'null'
    );
    return normalizePreferences(parsedValue && typeof parsedValue === 'object' ? parsedValue : {});
  } catch {
    return DEFAULT_AUTO_DOWNLOAD_MEDIA_PREFERENCES;
  }
};

export const saveAutoDownloadMediaPreferences = (preferences = {}) => {
  const normalizedPreferences = normalizePreferences(preferences);

  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(
      AUTO_DOWNLOAD_MEDIA_PREFERENCES_KEY,
      JSON.stringify(normalizedPreferences)
    );
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(AUTO_DOWNLOAD_MEDIA_PREFERENCES_CHANGED_EVENT, {
        detail: normalizedPreferences,
      })
    );
  }

  return normalizedPreferences;
};

export const getCurrentAutoDownloadNetworkSection = () => {
  if (typeof navigator === 'undefined') return 'wifi';

  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (connection?.roaming === true) return 'roaming';

  const connectionType = String(connection?.type || '').trim().toLowerCase();

  if (connectionType === 'cellular') return 'mobileData';
  if (connectionType === 'wifi' || connectionType === 'ethernet') return 'wifi';

  // Browser support is uneven. Default to Wi-Fi on unknown desktop/web
  // connections so the Wi-Fi preferences are still respected.
  return 'wifi';
};

const getPreferenceKeyForMediaType = (mediaType = '') => {
  const normalizedType = String(mediaType || '').trim().toLowerCase();
  if (normalizedType === 'image') return 'photos';
  if (normalizedType === 'video') return 'videos';
  if (normalizedType === 'audio') return 'audio';
  if (normalizedType === 'file') return 'documents';
  return '';
};

export const shouldAutoDownloadMediaType = ({
  mediaType,
  preferences = readAutoDownloadMediaPreferences(),
  networkSection = getCurrentAutoDownloadNetworkSection(),
} = {}) => {
  const preferenceKey = getPreferenceKeyForMediaType(mediaType);
  if (!preferenceKey) return true;

  const normalizedPreferences = normalizePreferences(preferences);

  if (networkSection === 'roaming') {
    return Boolean(normalizedPreferences.roaming.allMedia);
  }

  return Boolean(normalizedPreferences[networkSection]?.[preferenceKey]);
};

export const getManualMediaDownloadKey = (message = {}) =>
  String(
    message?.id ||
      message?.clientMessageId ||
      message?.localId ||
      `${message?.fileName || message?.mediaUrl || message?.fileUrl || message?.content || 'media'}-${
        message?.timestamp || message?.createdAt || ''
      }`
  ).trim();
