const VIDEO_EXTENSION_TO_MIME_TYPE = Object.freeze({
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  m4v: 'video/x-m4v',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
});

const URL_LIKE_PREFIX_PATTERN = /^(blob:|data:|https?:\/\/|\/\/|\/|\.\/|\.\.\/)/i;

const normalizeVideoValue = (value) => String(value || '').trim();

export const getVideoFileExtension = (value = '') => {
  const normalizedValue = normalizeVideoValue(value);
  if (!normalizedValue) return '';

  let candidatePath = normalizedValue;

  try {
    const parsedUrl = new URL(normalizedValue);
    candidatePath = parsedUrl.pathname || normalizedValue;
  } catch {
    candidatePath = normalizedValue;
  }

  const normalizedPath = candidatePath.split('#')[0].split('?')[0];
  const baseName = normalizedPath.split('/').pop() || '';
  const extension = baseName.includes('.') ? baseName.split('.').pop() : '';
  return normalizeVideoValue(extension).toLowerCase();
};

export const isVideoMimeType = (value = '') =>
  normalizeVideoValue(value).toLowerCase().startsWith('video/');

export const inferVideoMimeType = (value = '') =>
  VIDEO_EXTENSION_TO_MIME_TYPE[getVideoFileExtension(value)] || '';

const inferDataUrlVideoMimeType = (value = '') => {
  const match = normalizeVideoValue(value).match(/^data:(video\/[^;,]+)[;,]/i);
  return match?.[1] ? match[1].toLowerCase() : '';
};

export const resolveVideoMimeType = ({
  mimeType = '',
  src = '',
  fileName = '',
} = {}) =>
  inferDataUrlVideoMimeType(src) ||
  normalizeVideoValue(mimeType).toLowerCase() ||
  inferVideoMimeType(fileName) ||
  inferVideoMimeType(src);

export const isSupportedVideoExtension = (value = '') =>
  Boolean(inferVideoMimeType(value));

export const isLikelyVideoSource = (value = '', mimeType = '') => {
  const normalizedValue = normalizeVideoValue(value);
  if (!normalizedValue) return false;

  if (isVideoMimeType(mimeType)) return true;

  const normalizedLowerValue = normalizedValue.toLowerCase();
  if (normalizedLowerValue.startsWith('data:video/')) return true;
  if (normalizedLowerValue.startsWith('blob:')) return true;
  if (inferVideoMimeType(normalizedValue)) return true;

  return URL_LIKE_PREFIX_PATTERN.test(normalizedValue);
};

export const canBrowserPlayVideoType = (mimeType = '') => {
  const resolvedMimeType = resolveVideoMimeType({ mimeType });
  if (!resolvedMimeType || typeof document === 'undefined') {
    return true;
  }

  const videoElement = document.createElement('video');
  if (typeof videoElement.canPlayType !== 'function') {
    return true;
  }

  return Boolean(videoElement.canPlayType(resolvedMimeType));
};

export const buildUniqueMediaSources = (sources = []) => {
  const uniqueSources = [];
  const seenSources = new Set();

  sources.forEach((source) => {
    const normalizedSource = normalizeVideoValue(source);
    if (!normalizedSource || seenSources.has(normalizedSource)) {
      return;
    }

    seenSources.add(normalizedSource);
    uniqueSources.push(normalizedSource);
  });

  return uniqueSources;
};
