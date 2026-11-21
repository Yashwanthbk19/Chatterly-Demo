const STARRED_MEDIA_STORAGE_KEY = 'chatterly_starred_media_v1';

const normalizeKey = (value) => String(value || '').trim();

export const getStarredMediaStorageKey = (userId = '') =>
  `${STARRED_MEDIA_STORAGE_KEY}:${normalizeKey(userId) || 'anonymous'}`;

export const getMediaActionKeys = (item = {}) => {
  const message = item?.message && typeof item.message === 'object'
    ? item.message
    : item;

  return Array.from(new Set([
    message?._id,
    message?.id,
    message?.messageId,
    message?.clientMessageId,
    message?.tempId,
    message?.localId,
    item?.messageId,
    item?.id,
    item?.url,
    message?.mediaUrl,
    message?.videoUrl,
    message?.fileUrl,
  ].map(normalizeKey).filter(Boolean)));
};

export const getMediaActionKey = (item = {}) => getMediaActionKeys(item)[0] || '';

export const readStoredStarredMedia = (storageKey) => {
  if (!storageKey || typeof localStorage === 'undefined') return {};

  try {
    const storedValue = JSON.parse(localStorage.getItem(storageKey) || '{}');
    return storedValue && typeof storedValue === 'object' && !Array.isArray(storedValue)
      ? storedValue
      : {};
  } catch {
    return {};
  }
};

export const persistStoredStarredMedia = (storageKey, starredMedia = {}) => {
  if (!storageKey || typeof localStorage === 'undefined') return;

  try {
    localStorage.setItem(storageKey, JSON.stringify(starredMedia));
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
};

export const isMediaItemStarred = (starredMedia = {}, item = {}) =>
  getMediaActionKeys(item).some((key) => Boolean(starredMedia?.[key]));

export const setMediaItemStarred = (starredMedia = {}, item = {}, starred = true) => {
  const mediaKeys = getMediaActionKeys(item);
  if (!mediaKeys.length) return { ...starredMedia };

  const nextStarredMedia = { ...starredMedia };
  mediaKeys.forEach((mediaKey) => {
    if (starred) {
      nextStarredMedia[mediaKey] = true;
    } else {
      delete nextStarredMedia[mediaKey];
    }
  });
  return nextStarredMedia;
};
