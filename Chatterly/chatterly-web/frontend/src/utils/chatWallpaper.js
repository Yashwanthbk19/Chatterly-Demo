export const CHAT_WALLPAPER_STORAGE_KEY = 'chatterly_chat_wallpaper';
export const CHAT_WALLPAPER_OVERRIDES_STORAGE_KEY = 'chatterly_chat_wallpaper_overrides';

export const DEFAULT_CHAT_WALLPAPER = Object.freeze({
  type: 'default',
  value: '',
  transparency: 28,
  zoom: 1,
  positionX: 50,
  positionY: 50,
  doodle: true,
  messageColor: '#8B5CF6',
});

const WALLPAPER_TYPES = new Set(['default', 'color', 'image']);
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

export const isGifImageFile = async (file) => {
  if (!file) return false;

  const mimeType = String(file.type || '').toLowerCase();
  const fileName = String(file.name || '').toLowerCase();
  if (mimeType === 'image/gif' || fileName.endsWith('.gif')) return true;

  try {
    const header = new Uint8Array(await file.slice(0, 6).arrayBuffer());
    const signature = String.fromCharCode(...header);
    return signature === 'GIF87a' || signature === 'GIF89a';
  } catch {
    return false;
  }
};

const getAccountStorageKey = (key, userId = '') => {
  const normalizedUserId = String(userId || '').trim();
  return normalizedUserId
    ? `user_preference_${encodeURIComponent(normalizedUserId)}_${key}`
    : key;
};

export const clampWallpaperTransparency = (value) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return DEFAULT_CHAT_WALLPAPER.transparency;
  return Math.min(90, Math.max(0, Math.round(numericValue)));
};

export const clampWallpaperZoom = (value) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return DEFAULT_CHAT_WALLPAPER.zoom;
  return Math.min(3, Math.max(1, Math.round(numericValue * 4) / 4));
};

export const clampWallpaperPosition = (value) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return 50;
  return Math.min(100, Math.max(0, Math.round(numericValue)));
};

export const normalizeChatWallpaper = (wallpaper = {}) => {
  const type = WALLPAPER_TYPES.has(wallpaper?.type) ? wallpaper.type : 'default';
  const rawValue = String(wallpaper?.value || '').trim();
  const value = type === 'color' && COLOR_PATTERN.test(rawValue)
    ? rawValue.toUpperCase()
    : type === 'image'
      ? rawValue
      : '';

  return {
    type: (type === 'color' && !value) || (type === 'image' && !value) ? 'default' : type,
    value,
    transparency: clampWallpaperTransparency(wallpaper?.transparency),
    zoom: clampWallpaperZoom(wallpaper?.zoom),
    positionX: clampWallpaperPosition(wallpaper?.positionX),
    positionY: clampWallpaperPosition(wallpaper?.positionY),
    doodle: wallpaper?.doodle !== false,
    messageColor: COLOR_PATTERN.test(String(wallpaper?.messageColor || '').trim())
      ? String(wallpaper.messageColor).toUpperCase()
      : DEFAULT_CHAT_WALLPAPER.messageColor,
  };
};

const readJson = (key, fallback) => {
  if (typeof window === 'undefined') return fallback;
  try {
    const parsedValue = JSON.parse(window.localStorage.getItem(key) || 'null');
    return parsedValue ?? fallback;
  } catch {
    return fallback;
  }
};

export const readStoredGlobalWallpaper = (userId = '') =>
  normalizeChatWallpaper(readJson(getAccountStorageKey(CHAT_WALLPAPER_STORAGE_KEY, userId), DEFAULT_CHAT_WALLPAPER));

export const persistGlobalWallpaper = (wallpaper, userId = '') => {
  const normalizedWallpaper = normalizeChatWallpaper(wallpaper);
  window.localStorage.setItem(
    getAccountStorageKey(CHAT_WALLPAPER_STORAGE_KEY, userId),
    JSON.stringify(normalizedWallpaper)
  );
  return normalizedWallpaper;
};

export const readStoredWallpaperOverrides = (userId = '') => {
  const storedOverrides = readJson(getAccountStorageKey(CHAT_WALLPAPER_OVERRIDES_STORAGE_KEY, userId), {});
  if (!storedOverrides || typeof storedOverrides !== 'object' || Array.isArray(storedOverrides)) return {};

  return Object.fromEntries(
    Object.entries(storedOverrides)
      .filter(([chatId]) => String(chatId || '').trim())
      .map(([chatId, wallpaper]) => [String(chatId), normalizeChatWallpaper(wallpaper)])
  );
};

export const persistWallpaperOverrides = (overrides = {}, userId = '') => {
  const normalizedOverrides = Object.fromEntries(
    Object.entries(overrides)
      .filter(([chatId]) => String(chatId || '').trim())
      .map(([chatId, wallpaper]) => [String(chatId), normalizeChatWallpaper(wallpaper)])
  );
  window.localStorage.setItem(
    getAccountStorageKey(CHAT_WALLPAPER_OVERRIDES_STORAGE_KEY, userId),
    JSON.stringify(normalizedOverrides)
  );
  return normalizedOverrides;
};

export const wallpaperFromApiValue = (
  apiValue = '',
  transparency = DEFAULT_CHAT_WALLPAPER.transparency,
  doodle = DEFAULT_CHAT_WALLPAPER.doodle,
  messageColor = DEFAULT_CHAT_WALLPAPER.messageColor,
  zoom = DEFAULT_CHAT_WALLPAPER.zoom,
  positionX = DEFAULT_CHAT_WALLPAPER.positionX,
  positionY = DEFAULT_CHAT_WALLPAPER.positionY
) => {
  const value = String(apiValue || '').trim();
  const localSettings = { transparency, doodle, messageColor, zoom, positionX, positionY };
  if (!value) return normalizeChatWallpaper({ type: 'default', ...localSettings });
  if (COLOR_PATTERN.test(value)) return normalizeChatWallpaper({ type: 'color', value, ...localSettings });
  return normalizeChatWallpaper({ type: 'image', value, ...localSettings });
};

export const wallpaperToApiValue = (wallpaper) => {
  const normalizedWallpaper = normalizeChatWallpaper(wallpaper);
  return normalizedWallpaper.type === 'default' ? '' : normalizedWallpaper.value;
};

const escapeCssUrl = (value = '') => String(value).replace(/["\\\n\r]/g, (character) => `\\${character}`);

export const createChatWallpaperStyle = (wallpaper, { isDark = false } = {}) => {
  const normalizedWallpaper = normalizeChatWallpaper(wallpaper);

  // Dark mode default: render a proper deep canvas with the doodle kept as a
  // faint texture. Without this, the light doodle art shows through the thin
  // overlay and the chat area reads as a washed-out grey.
  if (isDark && normalizedWallpaper.type === 'default') {
    const veil = 'rgba(9,14,26,0.94)';
    return {
      backgroundColor: '#0A1020',
      backgroundImage: `linear-gradient(${veil}, ${veil}), url("/chat-list-bg.png")`,
      backgroundBlendMode: 'normal, soft-light',
      backgroundSize: 'cover, 520px auto',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat, repeat',
    };
  }

  const overlayColor = isDark ? '15,23,42' : '251,253,255';
  const overlayOpacity = normalizedWallpaper.transparency / 100;
  const overlay = `linear-gradient(rgba(${overlayColor},${overlayOpacity}), rgba(${overlayColor},${overlayOpacity}))`;

  if (normalizedWallpaper.type === 'color') {
    return {
      backgroundColor: normalizedWallpaper.value,
      backgroundImage: normalizedWallpaper.doodle
        ? `${overlay}, url("/chat-list-bg.png")`
        : overlay,
      backgroundBlendMode: normalizedWallpaper.doodle ? 'normal, multiply' : 'normal',
      backgroundSize: normalizedWallpaper.doodle ? 'cover, 570px auto' : 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: normalizedWallpaper.doodle ? 'no-repeat, repeat' : 'no-repeat',
    };
  }

  const imageUrl = normalizedWallpaper.type === 'image'
    ? normalizedWallpaper.value
    : '/chat-list-bg.png';
  const imageSize = normalizedWallpaper.zoom === 1
    ? 'cover'
    : `${Math.round(normalizedWallpaper.zoom * 100)}% auto`;
  const imagePosition = `${normalizedWallpaper.positionX}% ${normalizedWallpaper.positionY}%`;

  if (normalizedWallpaper.type === 'image' && normalizedWallpaper.doodle) {
    return {
      backgroundColor: isDark ? '#0F172A' : '#FBFDFF',
      backgroundImage: `${overlay}, url("/chat-list-bg.png"), url("${escapeCssUrl(imageUrl)}")`,
      backgroundBlendMode: 'normal, multiply, normal',
      backgroundSize: `cover, 570px auto, ${imageSize}`,
      backgroundPosition: `center, center, ${imagePosition}`,
      backgroundRepeat: 'no-repeat, repeat, no-repeat',
    };
  }

  return {
    backgroundColor: isDark ? '#0F172A' : '#FBFDFF',
    backgroundImage: `${overlay}, url("${escapeCssUrl(imageUrl)}")`,
    backgroundSize: imageSize,
    backgroundPosition: `center, ${imagePosition}`,
    backgroundRepeat: 'no-repeat',
  };
};
