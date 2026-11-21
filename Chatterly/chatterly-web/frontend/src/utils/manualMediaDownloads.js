export const MANUAL_MEDIA_DOWNLOADS_STORAGE_KEY = 'chatterly_manual_media_downloads';

const isPlainObject = (value) =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const normalizeDownloadState = (state = {}) => {
  const status = String(state?.status || '').trim().toLowerCase();
  if (status !== 'downloaded') {
    return null;
  }

  const rawSourceUrl = String(state?.sourceUrl || state?.objectUrl || '').trim();
  const sourceUrl = rawSourceUrl.startsWith('data:') || rawSourceUrl.startsWith('blob:')
    ? ''
    : rawSourceUrl;
  return {
    status,
    error: '',
    loadedBytes: Number(state?.loadedBytes || 0),
    totalBytes: Number(state?.totalBytes || 0),
    sourceUrl,
    objectUrl: sourceUrl,
    mimeType: String(state?.mimeType || '').trim(),
    mediaType: String(state?.mediaType || '').trim(),
    fileName: String(state?.fileName || '').trim(),
    updatedAt: Number(state?.updatedAt || Date.now()),
  };
};

export const readManualMediaDownloadStates = () => {
  if (typeof localStorage === 'undefined') return {};

  try {
    const parsedValue = JSON.parse(
      localStorage.getItem(MANUAL_MEDIA_DOWNLOADS_STORAGE_KEY) || '{}'
    );
    if (!isPlainObject(parsedValue)) return {};

    return Object.entries(parsedValue).reduce((downloads, [key, state]) => {
      const normalizedKey = String(key || '').trim();
      const normalizedState = normalizeDownloadState(state);
      if (normalizedKey && normalizedState) {
        downloads[normalizedKey] = normalizedState;
      }
      return downloads;
    }, {});
  } catch {
    return {};
  }
};

export const saveManualMediaDownloadStates = (downloadStates = {}) => {
  if (typeof localStorage === 'undefined') return {};

  const persistableStates = Object.entries(downloadStates || {}).reduce((downloads, [key, state]) => {
    const normalizedKey = String(key || '').trim();
    const normalizedState = normalizeDownloadState(state);
    if (normalizedKey && normalizedState) {
      downloads[normalizedKey] = normalizedState;
    }
    return downloads;
  }, {});

  try {
    localStorage.setItem(
      MANUAL_MEDIA_DOWNLOADS_STORAGE_KEY,
      JSON.stringify(persistableStates)
    );
  } catch (error) {
    console.error('Unable to save manual media download state:', error);
  }

  return persistableStates;
};
