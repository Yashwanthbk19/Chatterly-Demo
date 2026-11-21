const DEFAULT_MESSAGE_ID_PREFIX = 'msg';
const STATUS_ALIAS_MAP = {
  pending: 'pending',
  queued: 'pending',
  offline: 'pending',
  sending: 'sending',
  retrying: 'sending',
  sent: 'sent',
  delivered: 'delivered',
  received: 'delivered',
  read: 'read',
  seen: 'read',
  opened: 'read',
  failed: 'failed',
  error: 'failed',
};
export const MESSAGE_STATUS_FLOW = Object.freeze(['pending', 'sending', 'sent', 'delivered', 'read']);
export const MESSAGE_STATUSES = Object.freeze([...MESSAGE_STATUS_FLOW, 'failed']);
export const MESSAGE_MEDIA_TYPES = Object.freeze(['text', 'image', 'video', 'file', 'audio']);
export const MESSAGE_DIRECTIONS = Object.freeze(['sent', 'received']);
export const MESSAGE_DELETE_TARGETS = Object.freeze(['me', 'everyone']);
export const MESSAGE_UPLOAD_STATUS_FLOW = Object.freeze(['compressing', 'uploading', 'sent', 'failed']);
export const MESSAGE_UPLOAD_STATUSES = Object.freeze([...MESSAGE_UPLOAD_STATUS_FLOW]);
export const MESSAGE_SENDER_FIELDS = Object.freeze([
  'sender',
  'senderId',
  'senderName',
  'senderProfilePic',
]);
export const MESSAGE_REQUIRED_FIELDS = Object.freeze([
  'id',
  'chatId',
  'senderId',
  'type',
  'content',
  'timestamp',
  'status',
]);
export const MESSAGE_PERSISTED_FIELDS = Object.freeze([
  'id',
  'serverMessageId',
  'clientMessageId',
  'localId',
  'chatId',
  'groupId',
  'senderId',
  'sender',
  'senderName',
  'senderProfilePic',
  'receiverId',
  'type',
  'mediaType',
  'direction',
  'content',
  'mediaUrl',
  'audioUrl',
  'duration',
  'fileUrl',
  'fileName',
  'fileSize',
  'mimeType',
  'caption',
  'metadata',
  'callId',
  'groupCallId',
  'callStatus',
  'callType',
  'sharedContact',
  'replyTo',
  'timestamp',
  'disappearAfter',
  'expiresAt',
  'status',
  'pendingReason',
  'isPinned',
  'isForwarded',
  'isDeleted',
  'deletedFor',
  'isUnread',
  'pinnedAt',
]);
export const MESSAGE_SCHEMA = Object.freeze({
  required: MESSAGE_REQUIRED_FIELDS,
  persistedFields: MESSAGE_PERSISTED_FIELDS,
  statuses: MESSAGE_STATUSES,
  mediaTypes: MESSAGE_MEDIA_TYPES,
  directions: MESSAGE_DIRECTIONS,
  deleteTargets: MESSAGE_DELETE_TARGETS,
  uploadStatuses: MESSAGE_UPLOAD_STATUSES,
  senderFields: MESSAGE_SENDER_FIELDS,
});

const MESSAGE_ID_KEYS = ['id', '_id', 'messageId', 'clientMessageId', 'tempId', 'localId'];
const MESSAGE_PREVIEW_LABELS = Object.freeze({
  text: '',
  image: 'Photo',
  video: 'Video',
  file: 'File',
  audio: 'Audio',
});
const GENERIC_MEDIA_PREVIEW_LABELS = Object.freeze({
  image: new Set(['photo', 'image']),
  video: new Set(['video']),
  audio: new Set(['audio', 'voice message']),
});
const STANDARD_MEDIA_TYPES = Object.freeze(['image', 'video', 'audio']);
const UPLOAD_TRACKED_MEDIA_TYPES = Object.freeze(['image', 'video', 'audio', 'file']);
const MEDIA_URL_PLACEHOLDER_PATTERN = /^\[[A-Z_]+\]$/;
export const PROFILE_TAB_CONTENT_KEYS = Object.freeze(['media', 'audios', 'files', 'links', 'chats']);
const PROFILE_TAB_MEDIA_TYPES = Object.freeze(['image', 'video']);
// A web address typed into a message is one of two shapes. With a scheme or a "www." prefix it
// is recognised anywhere in the text:
const MESSAGE_PREFIXED_LINK_PATTERN = /(?:https?:\/\/|www\.)[^\s<>"]+/gi;
// ...and a bare name.tld[/path] is recognised only as a whole word, with a top-level domain
// people actually type. Bare names such as "file.txt", "v1.2.3" or "e.g." are deliberately not
// links. (Anchored to one word at a time so a long unbroken string stays cheap to scan.)
const MESSAGE_BARE_DOMAIN_PATTERN = /^(?:[a-z0-9-]+\.)+(?:com|net|org|edu|gov|info|biz|io|co|in|me|us|uk|ca|au|de|fr|jp|ai|app|dev|tv|xyz|online|site|store|tech|cloud|link|page)(?![a-z0-9-])(?::\d{2,5})?(?:[/?#][^\s<>"]*)?/i;
const LINK_WORD_PATTERN = /\S+/g;
// Punctuation that can open a word in front of a bare address: (google.com) or "google.com".
const LINK_LEADING_PUNCTUATION = '([{<"\'';
// Sentence punctuation and unmatched closing brackets belong to the sentence, not the link.
const LINK_TRAILING_PUNCTUATION = '.,;:!?\'"';
const LINK_BRACKET_PAIRS = Object.freeze({ ')': '(', ']': '[', '}': '{' });
// A "www." or scheme match preceded by one of these is the tail of something else (an e-mail
// address, a longer host name or a path), not the start of a link.
const LINK_LEFT_BOUNDARY_BLOCKERS = '@._-/\\%';
const FILE_EXTENSION_TO_MEDIA_TYPE = Object.freeze({
  jpg: 'image',
  jpeg: 'image',
  png: 'image',
  gif: 'image',
  webp: 'image',
  svg: 'image',
  bmp: 'image',
  heic: 'image',
  heif: 'image',
  mp4: 'video',
  mov: 'video',
  webm: 'video',
  m4v: 'video',
  mkv: 'video',
  avi: 'video',
  mp3: 'audio',
  wav: 'audio',
  ogg: 'audio',
  m4a: 'audio',
  aac: 'audio',
  pdf: 'file',
  doc: 'file',
  docx: 'file',
  xls: 'file',
  xlsx: 'file',
  csv: 'file',
  ppt: 'file',
  pptx: 'file',
  txt: 'file',
  zip: 'file',
  rar: 'file',
});
const MIME_TYPE_TO_FALLBACK_FILE_NAME = Object.freeze({
  'application/pdf': 'Document.pdf',
  'application/msword': 'Document.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Document.docx',
  'application/vnd.ms-excel': 'Document.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Document.xlsx',
  'application/zip': 'Archive.zip',
  'application/x-zip-compressed': 'Archive.zip',
  'text/plain': 'Document.txt',
});

export const createMessageId = (prefix = DEFAULT_MESSAGE_ID_PREFIX) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const isObjectRecord = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const getNestedUserId = (value) => {
  if (!value) return null;
  if (typeof value === 'string' || typeof value === 'number') return value;
  if (typeof value !== 'object') return null;
  return (
    value.userId ||
    value.user_id ||
    value.userid ||
    value.id ||
    value._id ||
    value.uid ||
    value.participantId ||
    value.participant_id ||
    null
  );
};

const normalizeUnicodeText = (value, { trim = true } = {}) => {
  if (value === undefined || value === null) return '';

  const stringValue = String(value);
  const unicodeSafeValue =
    typeof stringValue.normalize === 'function' ? stringValue.normalize('NFC') : stringValue;

  return trim ? unicodeSafeValue.trim() : unicodeSafeValue;
};

const normalizeOptionalText = (value) => normalizeUnicodeText(value);
const normalizeOptionalFileName = (value) => String(value || '').trim();
const combineDisplayName = (value = {}) => {
  if (!isObjectRecord(value)) return '';

  const firstName = normalizeOptionalText(value?.firstName);
  const lastName = normalizeOptionalText(value?.lastName);
  return normalizeOptionalText(`${firstName} ${lastName}`);
};
const normalizeOptionalMediaUrl = (value) => {
  if (value === undefined || value === null) return '';
  const normalizedValue = String(value).trim();
  return MEDIA_URL_PLACEHOLDER_PATTERN.test(normalizedValue) ? '' : normalizedValue;
};
const normalizeOptionalFileSize = (value) => {
  if (value === undefined || value === null || value === '') return 0;
  const normalizedValue = Number(value);
  return Number.isFinite(normalizedValue) && normalizedValue >= 0 ? normalizedValue : 0;
};
const normalizeOptionalDuration = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const normalizedValue = Number(value);
  return Number.isFinite(normalizedValue) && normalizedValue >= 0 ? normalizedValue : null;
};

const isValidMessageMediaType = (value) =>
  MESSAGE_MEDIA_TYPES.includes(String(value || '').trim().toLowerCase());
const isStandardMediaType = (value) =>
  STANDARD_MEDIA_TYPES.includes(String(value || '').trim().toLowerCase());
const isUploadTrackedMediaType = (value) =>
  UPLOAD_TRACKED_MEDIA_TYPES.includes(String(value || '').trim().toLowerCase());

const isLegacyMessageDirection = (value) =>
  MESSAGE_DIRECTIONS.includes(String(value || '').trim().toLowerCase());

export const hasMessageContent = (value) => {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return Boolean(value.trim());
  if (Array.isArray(value)) return value.length > 0;
  return true;
};

const pickFirstPresentValue = (...values) => values.find((value) => hasMessageContent(value));

const resolveNestedMediaUrl = (value) => {
  if (!isObjectRecord(value)) return '';

  return normalizeOptionalMediaUrl(
    pickFirstPresentValue(
      value?.mediaUrl,
      value?.previewUrl,
      value?.imageUrl,
      value?.videoUrl,
      value?.fileUrl,
      value?.audioUrl,
      value?.metadata?.mediaUrl,
      value?.metadata?.imageUrl,
      value?.metadata?.videoUrl,
      value?.metadata?.fileUrl,
      value?.metadata?.audioUrl,
      value?.url,
      value?.uri,
      value?.src,
      value?.path
    )
  );
};

const normalizeMediaContentValue = (value) => {
  if (!isObjectRecord(value)) {
    return value;
  }

  const nestedMediaUrl = resolveNestedMediaUrl(value);
  if (nestedMediaUrl) {
    return nestedMediaUrl;
  }

  const nestedContent = pickFirstPresentValue(value?.content, value?.message, value?.text);
  if (nestedContent !== undefined) {
    return nestedContent;
  }

  return value;
};

const inferMediaTypeFromMime = (value) => {
  const mimeType = String(value || '').trim().toLowerCase();
  if (!mimeType) return '';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'file';
};

const getExtensionFromValue = (value = '') => {
  const normalizedValue = String(value || '').trim();
  if (!normalizedValue || normalizedValue.startsWith('data:')) return '';

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
  return String(extension || '').trim().toLowerCase();
};

const inferMimeTypeFromMediaValue = (value = '') => {
  const normalizedValue = String(value || '').trim();
  if (!normalizedValue) return '';

  const dataUrlMatch = normalizedValue.match(/^data:([^;,]+)[;,]/i);
  if (dataUrlMatch?.[1]) {
    return String(dataUrlMatch[1]).trim().toLowerCase();
  }

  const extension = getExtensionFromValue(normalizedValue);
  if (!extension) return '';

  switch (extension) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    case 'svg':
      return 'image/svg+xml';
    case 'bmp':
      return 'image/bmp';
    case 'heic':
      return 'image/heic';
    case 'heif':
      return 'image/heif';
    case 'mp4':
      return 'video/mp4';
    case 'mov':
      return 'video/quicktime';
    case 'webm':
      return 'video/webm';
    case 'm4v':
      return 'video/x-m4v';
    case 'mkv':
      return 'video/x-matroska';
    case 'avi':
      return 'video/x-msvideo';
    case 'mp3':
      return 'audio/mpeg';
    case 'wav':
      return 'audio/wav';
    case 'ogg':
      return 'audio/ogg';
    case 'm4a':
      return 'audio/mp4';
    case 'aac':
      return 'audio/aac';
    case 'pdf':
      return 'application/pdf';
    case 'doc':
      return 'application/msword';
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'xls':
      return 'application/vnd.ms-excel';
    case 'xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case 'csv':
      return 'text/csv';
    case 'ppt':
      return 'application/vnd.ms-powerpoint';
    case 'pptx':
      return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    case 'txt':
      return 'text/plain';
    case 'zip':
      return 'application/zip';
    case 'rar':
      return 'application/vnd.rar';
    default:
      return '';
  }
};

const inferMediaTypeFromValue = (value = '') => {
  const inferredFromMime = inferMediaTypeFromMime(inferMimeTypeFromMediaValue(value));
  if (inferredFromMime) {
    return inferredFromMime;
  }

  const extension = getExtensionFromValue(value);
  return FILE_EXTENSION_TO_MEDIA_TYPE[extension] || '';
};

const URL_LIKE_MEDIA_VALUE_PATTERN = /^(blob:|data:|https?:\/\/|\/\/|\/|\.\/|\.\.\/)/i;

const isLikelyResolvableMediaValue = (value = '', expectedMediaType = '') => {
  const normalizedValue = normalizeOptionalMediaUrl(value);
  if (!normalizedValue || /\s/.test(normalizedValue)) {
    return false;
  }

  const normalizedExpectedMediaType = String(expectedMediaType || '').trim().toLowerCase();
  const inferredMediaType = inferMediaTypeFromValue(normalizedValue);

  if (normalizedValue.startsWith('data:')) {
    if (!normalizedExpectedMediaType) {
      return true;
    }

    if (normalizedExpectedMediaType === 'file') {
      return !isStandardMediaType(inferredMediaType);
    }

    return normalizedValue.toLowerCase().startsWith(`data:${normalizedExpectedMediaType}/`);
  }

  if (URL_LIKE_MEDIA_VALUE_PATTERN.test(normalizedValue)) {
    if (!normalizedExpectedMediaType || !inferredMediaType) {
      return true;
    }

    if (normalizedExpectedMediaType === 'file') {
      return !isStandardMediaType(inferredMediaType);
    }

    return normalizedExpectedMediaType === inferredMediaType;
  }

  if (!inferredMediaType) {
    return false;
  }

  if (!normalizedExpectedMediaType) {
    return true;
  }

  if (normalizedExpectedMediaType === 'file') {
    return !isStandardMediaType(inferredMediaType);
  }

  return normalizedExpectedMediaType === inferredMediaType;
};

const deriveFileNameFromValue = (value = '', fallbackMimeType = '') => {
  const normalizedValue = String(value || '').trim();
  if (normalizedValue && !normalizedValue.startsWith('data:')) {
    let candidatePath = normalizedValue;

    try {
      const parsedUrl = new URL(normalizedValue);
      candidatePath = parsedUrl.pathname || normalizedValue;
    } catch {
      candidatePath = normalizedValue;
    }

    const normalizedPath = candidatePath.split('#')[0].split('?')[0];
    const baseName = normalizedPath.split('/').pop() || '';
    if (baseName.includes('.')) {
      return decodeURIComponent(baseName);
    }
  }

  const normalizedMimeType =
    String(fallbackMimeType || inferMimeTypeFromMediaValue(normalizedValue) || '').trim().toLowerCase();
  return MIME_TYPE_TO_FALLBACK_FILE_NAME[normalizedMimeType] || '';
};

const inferMediaTypeFromContent = (content) => {
  if (!content || typeof content !== 'object') return '';

  const explicitType = [content?.mediaType, content?.messageType].find((value) =>
    isValidMessageMediaType(value)
  );
  if (explicitType) {
    return String(explicitType).trim().toLowerCase();
  }

  return inferMediaTypeFromMime(
    content?.mimeType || content?.mimetype || content?.type || content?.fileType || ''
  );
};

const resolveLegacyMessageText = (message = {}, fallback = {}) =>
  normalizeOptionalText(message?.text || message?.message || fallback?.text || fallback?.message || '');

const resolveMediaContent = (message = {}, fallback = {}) => {
  const directContent = pickFirstPresentValue(
    message?.content,
    message?.media,
    message?.attachment,
    message?.file,
    message?.image,
    message?.video,
    message?.audio,
    message?.mediaUrl,
    message?.fileUrl,
    message?.imageUrl,
    message?.videoUrl,
    message?.audioUrl,
    message?.url,
    message?.uri,
    message?.src,
    message?.path,
    fallback?.content,
    fallback?.media,
    fallback?.attachment,
    fallback?.file,
    fallback?.image,
    fallback?.video,
    fallback?.audio,
    fallback?.mediaUrl,
    fallback?.fileUrl,
    fallback?.imageUrl,
    fallback?.videoUrl,
    fallback?.audioUrl,
    fallback?.url,
    fallback?.uri,
    fallback?.src,
    fallback?.path
  );

  if (directContent !== undefined) {
    return normalizeMediaContentValue(directContent);
  }

  return resolveLegacyMessageText(message, fallback);
};

const resolveMessageFileUrl = ({ message = {}, fallback = {}, mediaType, content }) => {
  if (mediaType !== 'file') {
    return '';
  }

  const directFileUrl = pickFirstPresentValue(
    message?.fileUrl,
    message?.attachment?.fileUrl,
      message?.file?.fileUrl,
      message?.content?.fileUrl,
      message?.media?.fileUrl,
      message?.mediaUrl,
      fallback?.fileUrl,
      fallback?.attachment?.fileUrl,
      fallback?.file?.fileUrl,
      fallback?.content?.fileUrl,
      fallback?.media?.fileUrl,
      fallback?.mediaUrl
    );

  const normalizedDirectFileUrl = normalizeOptionalMediaUrl(directFileUrl);
  if (normalizedDirectFileUrl) {
    return normalizedDirectFileUrl;
  }

  return typeof content === 'string' && isLikelyResolvableMediaValue(content, 'file')
    ? normalizeOptionalMediaUrl(content)
    : '';
};

const resolveMessageFileName = ({ message = {}, fallback = {}, mediaType }) => {
  // Audio carries a file name too so uploaded audio files can be told apart
  // from recorded voice notes in the UI (see the audio message rendering).
  if (mediaType !== 'file' && mediaType !== 'audio') {
    return '';
  }

  const explicitFileName = normalizeOptionalFileName(
    pickFirstPresentValue(
      message?.fileName,
      message?.attachment?.fileName,
      message?.attachment?.name,
      message?.file?.fileName,
      message?.file?.name,
      message?.content?.fileName,
      message?.content?.name,
      message?.media?.fileName,
      message?.media?.name,
      fallback?.fileName,
      fallback?.attachment?.fileName,
      fallback?.attachment?.name,
      fallback?.file?.fileName,
      fallback?.file?.name,
      fallback?.content?.fileName,
      fallback?.content?.name,
      fallback?.media?.fileName,
      fallback?.media?.name
    )
  );

  if (explicitFileName) {
    return explicitFileName;
  }

  return normalizeOptionalFileName(
    deriveFileNameFromValue(
      pickFirstPresentValue(
        message?.fileUrl,
        message?.mediaUrl,
        message?.content,
        fallback?.fileUrl,
        fallback?.mediaUrl,
        fallback?.content
      ),
      resolveMessageMimeType({ message, fallback })
    )
  );
};

const resolveMessageFileSize = ({ message = {}, fallback = {}, mediaType }) => {
  if (!['image', 'video', 'audio', 'file'].includes(mediaType)) {
    return 0;
  }

  return normalizeOptionalFileSize(
    pickFirstPresentValue(
      message?.fileSize,
      message?.mediaSize,
      message?.size,
      message?.attachment?.fileSize,
      message?.attachment?.size,
      message?.file?.fileSize,
      message?.file?.size,
      message?.content?.fileSize,
      message?.content?.size,
      message?.media?.fileSize,
      message?.media?.mediaSize,
      message?.media?.size,
      fallback?.fileSize,
      fallback?.mediaSize,
      fallback?.size,
      fallback?.attachment?.fileSize,
      fallback?.attachment?.size,
      fallback?.file?.fileSize,
      fallback?.file?.size,
      fallback?.content?.fileSize,
      fallback?.content?.size,
      fallback?.media?.fileSize,
      fallback?.media?.mediaSize,
      fallback?.media?.size
    )
  );
};

const resolveExplicitMediaType = ({ message = {}, fallback = {} }) => {
  const explicitType = [
    message?.type,
    message?.mediaType,
    message?.messageType,
    message?.metadata?.type,
    message?.metadata?.mediaType,
    message?.metadata?.messageType,
    fallback?.type,
    fallback?.mediaType,
    fallback?.messageType,
    fallback?.metadata?.type,
    fallback?.metadata?.mediaType,
    fallback?.metadata?.messageType,
  ].find((value) => isValidMessageMediaType(value));

  return explicitType ? String(explicitType).trim().toLowerCase() : '';
};

// Text someone typed stays text even when it reads like a file name or a web address
// ("report.pdf", "https://site.com/report.pdf"): sniffing its extension turned such a message
// into a Document / Photo card and hid the link. Only an inline payload (data:/blob:, e.g. a
// recorded voice note) in a text message's content makes it media.
const pickContentForMediaInference = (value, explicitType) =>
  explicitType === 'text' && typeof value === 'string' && !/^(?:data|blob):/i.test(value.trim())
    ? undefined
    : value;

const resolveMessageMimeType = ({ message = {}, fallback = {} }) => {
  const explicitType = resolveExplicitMediaType({ message, fallback });

  return normalizeOptionalText(
    pickFirstPresentValue(
      message?.mimeType,
      message?.mimetype,
      message?.fileType,
      message?.attachment?.mimeType,
      message?.attachment?.mimetype,
      message?.attachment?.type,
      message?.file?.mimeType,
      message?.file?.mimetype,
      message?.file?.type,
      message?.content?.mimeType,
      message?.content?.mimetype,
      message?.content?.type,
      message?.media?.mimeType,
      message?.media?.mimetype,
      message?.media?.type,
      fallback?.mimeType,
      fallback?.mimetype,
      fallback?.fileType,
      fallback?.attachment?.mimeType,
      fallback?.attachment?.mimetype,
      fallback?.attachment?.type,
      fallback?.file?.mimeType,
      fallback?.file?.mimetype,
      fallback?.file?.type,
      fallback?.content?.mimeType,
      fallback?.content?.mimetype,
      fallback?.content?.type,
      fallback?.media?.mimeType,
      fallback?.media?.mimetype,
      fallback?.media?.type
    )
  ) ||
  inferMimeTypeFromMediaValue(
    pickFirstPresentValue(
      message?.mediaUrl,
      message?.fileUrl,
      pickContentForMediaInference(message?.content, explicitType),
      fallback?.mediaUrl,
      fallback?.fileUrl,
      pickContentForMediaInference(fallback?.content, explicitType)
    )
  );
};

const resolveMediaType = ({ message = {}, fallback = {} }) => {
  const normalizedExplicitType = resolveExplicitMediaType({ message, fallback });
  const inferredTypeFromValue = inferMediaTypeFromValue(
    pickFirstPresentValue(
      message?.mediaUrl,
      message?.metadata?.mediaUrl,
      message?.metadata?.imageUrl,
      message?.metadata?.videoUrl,
      message?.metadata?.fileUrl,
      message?.metadata?.audioUrl,
      message?.fileUrl,
      pickContentForMediaInference(message?.content, normalizedExplicitType),
      fallback?.mediaUrl,
      fallback?.metadata?.mediaUrl,
      fallback?.metadata?.imageUrl,
      fallback?.metadata?.videoUrl,
      fallback?.metadata?.fileUrl,
      fallback?.metadata?.audioUrl,
      fallback?.fileUrl,
      pickContentForMediaInference(fallback?.content, normalizedExplicitType)
    )
  );
  const inferredTypeFromMime =
    inferMediaTypeFromMime(message?.mimeType || message?.mimetype || message?.fileType || '') ||
    inferMediaTypeFromContent(message?.content) ||
    inferMediaTypeFromContent(message?.media) ||
    inferMediaTypeFromContent(message?.attachment) ||
    inferMediaTypeFromContent(message?.file) ||
    inferMediaTypeFromMime(fallback?.mimeType || fallback?.mimetype || fallback?.fileType || '') ||
    inferMediaTypeFromContent(fallback?.content) ||
    inferMediaTypeFromContent(fallback?.media) ||
    inferMediaTypeFromContent(fallback?.attachment) ||
    inferMediaTypeFromContent(fallback?.file);
  const inferredStandardType =
    [inferredTypeFromValue, inferredTypeFromMime].find((value) => isStandardMediaType(value)) || '';

  if (
    normalizedExplicitType &&
    normalizedExplicitType !== 'text' &&
    normalizedExplicitType !== 'file'
  ) {
    return normalizedExplicitType;
  }

  if (normalizedExplicitType === 'text') {
    return inferredTypeFromValue || inferredTypeFromMime || normalizedExplicitType;
  }

  if (normalizedExplicitType) {
    return normalizedExplicitType;
  }

  if (
    hasMessageContent(message?.image) ||
    hasMessageContent(message?.imageUrl) ||
    hasMessageContent(fallback?.image) ||
    hasMessageContent(fallback?.imageUrl)
  ) {
    return 'image';
  }

  if (
    hasMessageContent(message?.video) ||
    hasMessageContent(message?.videoUrl) ||
    hasMessageContent(fallback?.video) ||
    hasMessageContent(fallback?.videoUrl)
  ) {
    return 'video';
  }

  if (
    hasMessageContent(message?.audio) ||
    hasMessageContent(message?.audioUrl) ||
    hasMessageContent(fallback?.audio) ||
    hasMessageContent(fallback?.audioUrl)
  ) {
    return 'audio';
  }

  if (
    hasMessageContent(message?.attachment) ||
    hasMessageContent(message?.file) ||
    hasMessageContent(message?.fileUrl) ||
    hasMessageContent(fallback?.attachment) ||
    hasMessageContent(fallback?.file) ||
    hasMessageContent(fallback?.fileUrl)
  ) {
    return 'file';
  }

  return inferredTypeFromMime || inferredTypeFromValue || 'text';
};

export const resolveMessageMediaUrl = (message = {}, fallback = {}, explicitMediaType = '') => {
  const mediaType = explicitMediaType || resolveMediaType({ message, fallback });

  if (!isStandardMediaType(mediaType)) {
    return '';
  }

  const directMediaUrl = pickFirstPresentValue(
    message?.mediaUrl,
    message?.previewUrl,
    message?.imageUrl,
    message?.videoUrl,
    message?.fileUrl,
    message?.audioUrl,
    message?.metadata?.mediaUrl,
    message?.metadata?.imageUrl,
    message?.metadata?.videoUrl,
    message?.metadata?.fileUrl,
    message?.metadata?.audioUrl,
    message?.url,
    message?.uri,
    message?.src,
    message?.path,
    resolveNestedMediaUrl(message?.content),
    resolveNestedMediaUrl(message?.media),
    resolveNestedMediaUrl(message?.attachment),
    resolveNestedMediaUrl(message?.file),
    resolveNestedMediaUrl(message?.image),
    resolveNestedMediaUrl(message?.video),
    fallback?.mediaUrl,
    fallback?.previewUrl,
    fallback?.imageUrl,
    fallback?.videoUrl,
    fallback?.fileUrl,
    fallback?.audioUrl,
    fallback?.metadata?.mediaUrl,
    fallback?.metadata?.imageUrl,
    fallback?.metadata?.videoUrl,
    fallback?.metadata?.fileUrl,
    fallback?.metadata?.audioUrl,
    fallback?.url,
    fallback?.uri,
    fallback?.src,
    fallback?.path,
    resolveNestedMediaUrl(fallback?.content),
    resolveNestedMediaUrl(fallback?.media),
    resolveNestedMediaUrl(fallback?.attachment),
    resolveNestedMediaUrl(fallback?.file),
    resolveNestedMediaUrl(fallback?.image),
    resolveNestedMediaUrl(fallback?.video)
  );

  if (directMediaUrl !== undefined) {
    const normalizedMediaUrl = normalizeOptionalMediaUrl(directMediaUrl);
    if (normalizedMediaUrl) {
      return normalizedMediaUrl;
    }
  }

  const resolvedContent = resolveMediaContent(message, fallback);
  return typeof resolvedContent === 'string' && isLikelyResolvableMediaValue(resolvedContent, mediaType)
    ? normalizeOptionalMediaUrl(resolvedContent)
    : '';
};

const resolveMessageCaption = ({ message = {}, fallback = {}, mediaType, content }) => {
  const explicitCaption = normalizeOptionalText(message?.caption || fallback?.caption || '');
  if (explicitCaption) {
    return explicitCaption;
  }

  if (mediaType === 'text') {
    return '';
  }

  const legacyText = resolveLegacyMessageText(message, fallback);
  const comparableContent = typeof content === 'string' ? normalizeUnicodeText(content) : '';
  const isGenericLegacyLabel = Boolean(
    legacyText &&
      GENERIC_MEDIA_PREVIEW_LABELS[mediaType]?.has(String(legacyText).trim().toLowerCase())
  );

  if (legacyText && legacyText !== comparableContent && !isGenericLegacyLabel) {
    return legacyText;
  }

  return '';
};

const resolveMessageDuration = ({ message = {}, fallback = {}, mediaType }) => {
  if (mediaType !== 'audio') {
    return null;
  }

  return normalizeOptionalDuration(
    pickFirstPresentValue(
      message?.duration,
      message?.audio?.duration,
      message?.content?.duration,
      message?.media?.duration,
      fallback?.duration,
      fallback?.audio?.duration,
      fallback?.content?.duration,
      fallback?.media?.duration
    )
  );
};

const resolveMessagePreviewText = ({
  message = {},
  fallback = {},
  mediaType,
  content,
  caption,
  fileName,
}) => {
  if (mediaType === 'text') {
    if (typeof content === 'string') {
      return normalizeUnicodeText(content);
    }

    return resolveLegacyMessageText(message, fallback);
  }

  if (caption) {
    return caption;
  }

  const legacyText = resolveLegacyMessageText(message, fallback);
  const comparableContent = typeof content === 'string' ? normalizeUnicodeText(content) : '';

  if (legacyText && legacyText !== comparableContent) {
    return legacyText;
  }

  if (mediaType === 'file' && fileName) {
    return fileName;
  }

  return MESSAGE_PREVIEW_LABELS[mediaType] || 'Media';
};

const resolveTimestamp = (message = {}, fallback = {}) =>
  message?.timestamp ||
  message?.createdAt ||
  fallback?.timestamp ||
  fallback?.createdAt ||
  new Date().toISOString();

const normalizeComparableValue = (value) => {
  if (value === undefined || value === null) return '';
  return normalizeUnicodeText(value);
};

const normalizeComparableTimestamp = (value) => {
  if (!value) return '';

  const parsedDate = new Date(value);
  return Number.isNaN(parsedDate.getTime()) ? String(value).trim() : parsedDate.toISOString();
};

const hasInconsistentComparableValues = (values = [], normalizer = normalizeComparableValue) => {
  const normalizedValues = values
    .map((value) => normalizer(value))
    .filter(Boolean);

  if (normalizedValues.length <= 1) {
    return false;
  }

  return normalizedValues.some((value) => value !== normalizedValues[0]);
};

const resolveMessageDirection = ({ message = {}, fallback = {}, currentUserId, senderId }) => {
  const explicitDirection = [
    message?.direction,
    message?.messageDirection,
    fallback?.direction,
    fallback?.messageDirection,
    message?.type,
    fallback?.type,
  ].find((value) => isLegacyMessageDirection(value));

  if (explicitDirection) {
    return String(explicitDirection).trim().toLowerCase();
  }

  if (currentUserId && senderId && String(senderId) === String(currentUserId)) {
    return 'sent';
  }

  return 'received';
};

const resolveUserDisplayName = (value = {}) => {
  if (!isObjectRecord(value)) return '';

  return normalizeOptionalText(
    value?.name ||
      value?.fullName ||
      combineDisplayName(value) ||
      value?.username ||
      value?.displayName ||
      value?.phone ||
      value?.email ||
      ''
  );
};

const resolveUserProfilePic = (value = {}) => {
  if (!isObjectRecord(value)) return '';

  return normalizeOptionalMediaUrl(
    value?.profilePic ||
      value?.profilePicture ||
      value?.profileImage ||
      value?.avatar ||
      value?.photo ||
      value?.image ||
      value?.imageUrl ||
      value?.picture ||
      ''
  );
};

const resolveMessageSenderInfo = ({ message = {}, fallback = {}, senderId }) => {
  const senderRecord = isObjectRecord(message?.sender)
    ? message.sender
    : isObjectRecord(fallback?.sender)
      ? fallback.sender
      : {};
  const normalizedSenderId = senderId ? String(senderId) : '';
  const senderName = normalizeOptionalText(
    message?.senderName ||
      fallback?.senderName ||
      resolveUserDisplayName(senderRecord)
  );
  const senderProfilePic = normalizeOptionalMediaUrl(
    message?.senderProfilePic ||
      message?.senderProfilePicture ||
      message?.senderAvatar ||
      fallback?.senderProfilePic ||
      fallback?.senderProfilePicture ||
      fallback?.senderAvatar ||
      resolveUserProfilePic(senderRecord)
  );
  const sender = {
    ...(isObjectRecord(senderRecord) ? senderRecord : {}),
  };

  if (normalizedSenderId) {
    sender.id = sender.id || normalizedSenderId;
    sender._id = sender._id || normalizedSenderId;
    sender.userId = sender.userId || normalizedSenderId;
  }

  if (senderName) {
    sender.name = sender.name || senderName;
    sender.fullName = sender.fullName || senderName;
  }

  if (senderProfilePic) {
    sender.profilePic = sender.profilePic || senderProfilePic;
  }

  return {
    sender: Object.keys(sender).length ? sender : null,
    senderName,
    senderProfilePic: senderProfilePic || null,
  };
};

export const normalizeMessageStatus = (status, fallbackStatus = 'sent') => {
  const resolvedStatus = String(status || fallbackStatus || 'sent').trim().toLowerCase();
  return STATUS_ALIAS_MAP[resolvedStatus] || resolvedStatus || 'sent';
};

export const normalizeMessageUploadStatus = (uploadStatus, fallbackUploadStatus = 'sent') => {
  const resolvedStatus = String(uploadStatus || fallbackUploadStatus || 'sent').trim().toLowerCase();
  return MESSAGE_UPLOAD_STATUSES.includes(resolvedStatus) ? resolvedStatus : 'sent';
};

export const normalizeMessageDeletedFor = (deletedFor, fallbackDeletedFor = '') => {
  const resolvedDeletedFor = String(deletedFor || fallbackDeletedFor || '').trim().toLowerCase();
  return MESSAGE_DELETE_TARGETS.includes(resolvedDeletedFor) ? resolvedDeletedFor : null;
};

const hasValidTimestamp = (value) => {
  if (!value) return false;

  const parsedDate = new Date(value);
  return !Number.isNaN(parsedDate.getTime());
};

const isValidMessageStatus = (status) => {
  if (!status) return false;
  return MESSAGE_STATUSES.includes(normalizeMessageStatus(status));
};

const isValidMessageUploadStatus = (uploadStatus) => {
  if (!uploadStatus) return false;
  return MESSAGE_UPLOAD_STATUSES.includes(normalizeMessageUploadStatus(uploadStatus));
};

const isValidMessageDeletedFor = (deletedFor) => {
  if (!deletedFor) return false;
  return MESSAGE_DELETE_TARGETS.includes(normalizeMessageDeletedFor(deletedFor));
};

const resolveMessageDeletedFor = (message = {}, fallback = {}) => {
  const explicitDeletedFor = normalizeMessageDeletedFor(message?.deletedFor, fallback?.deletedFor);
  if (explicitDeletedFor) {
    return explicitDeletedFor;
  }

  if (message?.isHiddenForMe ?? fallback?.isHiddenForMe ?? false) {
    return 'me';
  }

  if (message?.isDeleted ?? fallback?.isDeleted ?? false) {
    return 'everyone';
  }

  return null;
};

const resolveMessageUploadStatus = ({
  message = {},
  fallback = {},
  mediaType,
  normalizedStatus,
}) => {
  if (!isUploadTrackedMediaType(mediaType)) {
    return null;
  }

  const explicitUploadStatus = pickFirstPresentValue(
    message?.uploadStatus,
    fallback?.uploadStatus
  );

  if (explicitUploadStatus !== undefined) {
    return normalizeMessageUploadStatus(explicitUploadStatus, 'sent');
  }

  if (['pending', 'sending', 'failed'].includes(normalizedStatus)) {
    return 'uploading';
  }

  return 'sent';
};

export const validateMessageDataFormat = (message = {}, options = {}) => {
  if (!isObjectRecord(message)) {
    return {
      isValid: false,
      errors: ['Message must be an object.'],
    };
  }

  const normalizedMessage = normalizeMessageData(message, options);
  const errors = [];

  if (!normalizedMessage.id) {
    errors.push('Message id is required.');
  }

  if (!normalizedMessage.chatId) {
    errors.push('Message chat id is required.');
  }

  if (!normalizedMessage.senderId) {
    errors.push('Message sender id is required.');
  }

  if (!normalizedMessage.type) {
    errors.push('Message type is required.');
  } else if (!isValidMessageMediaType(normalizedMessage.type)) {
    errors.push('Message type is invalid.');
  }

  if (!hasMessageContent(normalizedMessage.content)) {
    errors.push('Message content is required.');
  }

  if (!normalizedMessage.timestamp) {
    errors.push('Message timestamp is required.');
  } else if (!hasValidTimestamp(normalizedMessage.timestamp)) {
    errors.push('Message timestamp must be a valid date.');
  }

  if (!normalizedMessage.status) {
    errors.push('Message status is required.');
  } else if (!isValidMessageStatus(normalizedMessage.status)) {
    errors.push('Message status is invalid.');
  }

  if (
    normalizedMessage.uploadStatus !== null &&
    normalizedMessage.uploadStatus !== undefined &&
    !isValidMessageUploadStatus(normalizedMessage.uploadStatus)
  ) {
    errors.push('Message upload status is invalid.');
  }

  if (
    normalizedMessage.deletedFor !== null &&
    normalizedMessage.deletedFor !== undefined &&
    !isValidMessageDeletedFor(normalizedMessage.deletedFor)
  ) {
    errors.push('Message deletedFor is invalid.');
  }

  if (hasInconsistentComparableValues([message?.text, message?.message])) {
    errors.push('Message text aliases must match.');
  }

  if (hasInconsistentComparableValues([message?.timestamp, message?.createdAt], normalizeComparableTimestamp)) {
    errors.push('Message timestamp aliases must match.');
  }

  if (hasInconsistentComparableValues([message?.senderId, getNestedUserId(message?.sender)])) {
    errors.push('Message sender ids must match.');
  }

  if (hasInconsistentComparableValues([message?.receiverId, getNestedUserId(message?.receiver)])) {
    errors.push('Message receiver ids must match.');
  }

  if (
    hasInconsistentComparableValues([
      message?.chatId,
      message?.chat?._id,
      message?.chat?.id,
    ])
  ) {
    errors.push('Message chat ids must match.');
  }

  return {
    isValid: errors.length === 0,
    errors,
    normalizedMessage,
  };
};
 
export const validateStoredMessageListFormat = (messages = [], options = {}) => {
  if (!Array.isArray(messages)) {
    return {
      isValid: false,
      errors: ['Stored messages must be an array.'],
    };
  }

  const errors = messages.flatMap((message, index) =>
    validateMessageDataFormat(message, options).errors.map(
      (error) => `Message at index ${index}: ${error}`
    )
  );
 
  return {
    isValid: errors.length === 0,
    errors,
  };
};
 
export const validateStoredMessagesByChatFormat = (messagesByChat = {}, options = {}) => {
  if (!isObjectRecord(messagesByChat)) {
    return {
      isValid: false,
      errors: ['Stored chat messages must be an object keyed by chat id.'],
    };
  }

  const errors = Object.entries(messagesByChat).flatMap(([chatId, messages]) => {
    if (!chatId) {
      return ['Stored chat id is required.'];
    }

    return validateStoredMessageListFormat(messages, {
      ...options,
      fallback: {
        ...(options?.fallback || {}),
        chatId: String(chatId),
      },
    }).errors.map(
      (error) => `Chat ${chatId}: ${error}`
    );
  });

  return {
    isValid: errors.length === 0,
    errors,
  };
};
 
export const getMessageStatusPriority = (status) => {
  switch (normalizeMessageStatus(status)) {
    case 'failed':
      return -1;
    case 'pending':
      return 0;
    case 'sending':
      return 1;
    case 'sent':
      return 2;
    case 'delivered':
      return 3;
    case 'read':
      return 4;
    default:
      return 2;
  }
};
 
export const isPendingMessageStatus = (status) => {
  const normalizedStatus = normalizeMessageStatus(status, 'sent');
  return normalizedStatus === 'pending' || normalizedStatus === 'sending';
};
 
export const isFailedMessageStatus = (status) =>
  normalizeMessageStatus(status, 'sent') === 'failed';
 
export const getMessageStatusLabel = (status) => {
  const normalizedStatus = normalizeMessageStatus(status, 'sent');
 
  if (normalizedStatus === 'pending') {
    return 'Pending...';
  }
 
  if (normalizedStatus === 'sending') {
    return 'Sending...';
  }
 
  if (normalizedStatus === 'failed') {
    return 'Failed to send';
  }
 
  return '';
};
 
export const getMessageStatusFlow = (status = 'sent') => {
  const normalizedStatus = normalizeMessageStatus(status, 'sent');
  const startIndex = MESSAGE_STATUS_FLOW.indexOf(normalizedStatus);
 
  if (startIndex === -1) {
    return [...MESSAGE_STATUS_FLOW];
  }
 
  return MESSAGE_STATUS_FLOW.slice(startIndex);
};
 
export const getNextMessageStatus = (status) => {
  const normalizedStatus = normalizeMessageStatus(status, 'sent');
  const currentIndex = MESSAGE_STATUS_FLOW.indexOf(normalizedStatus);
 
  if (currentIndex === -1 || currentIndex === MESSAGE_STATUS_FLOW.length - 1) {
    return normalizedStatus;
  }
 
  return MESSAGE_STATUS_FLOW[currentIndex + 1];
};
 
export const getMessageIdentityKeys = (message = {}) =>
  MESSAGE_ID_KEYS.reduce((keys, key) => {
    const value = message?.[key];
    if (!value) return keys;
    keys.push(String(value));
    return keys;
  }, []);

export const messagesShareIdentity = (firstMessage = {}, secondMessage = {}) => {
  const firstIds = getMessageIdentityKeys(firstMessage);
  const secondIds = new Set(getMessageIdentityKeys(secondMessage));
  return firstIds.some((messageId) => secondIds.has(messageId));
};

export const getPinnedMessageListKey = (message = {}) => {
  const identityKeys = getMessageIdentityKeys(message).filter(Boolean);
  return identityKeys[0] || String(message?.id || message?.clientMessageId || message?.localId || '').trim();
};

const buildPinnedMessageOriginalFields = (message = {}, fallback = {}) => {
  if (!isObjectRecord(message) && !isObjectRecord(fallback)) {
    return {};
  }

  const sourceMessage = isObjectRecord(message) ? message : {};
  const fallbackMessage = isObjectRecord(fallback) ? fallback : {};
  const originalFields = {};
  const content = pickFirstPresentValue(
    sourceMessage?.content,
    sourceMessage?.text,
    sourceMessage?.message,
    fallbackMessage?.content,
    fallbackMessage?.text,
    fallbackMessage?.message
  );
  const sender =
    sourceMessage?.sender ??
    fallbackMessage?.sender ??
    sourceMessage?.senderId ??
    fallbackMessage?.senderId;
  const senderId =
    sourceMessage?.senderId ||
    getNestedUserId(sourceMessage?.sender) ||
    fallbackMessage?.senderId ||
    getNestedUserId(fallbackMessage?.sender);
  const timestamp = resolveTimestamp(sourceMessage, fallbackMessage);

  if (content !== undefined) originalFields.content = content;
  if (sender !== undefined && sender !== null) originalFields.sender = sender;
  if (senderId) originalFields.senderId = senderId;
  if (timestamp) {
    originalFields.timestamp = timestamp;
    originalFields.createdAt = timestamp;
  }

  return originalFields;
};

export const buildPinnedMessagePatch = (isPinned, options = {}) => {
  const nextPinnedState = Boolean(isPinned);

  if (!nextPinnedState) {
    return {
      isPinned: false,
      pinnedAt: null,
    };
  }

  const pinnedAt =
    String(options?.pinnedAt || '').trim() || new Date().toISOString();

  return {
    ...buildPinnedMessageOriginalFields(options?.message, options?.fallback),
    isPinned: true,
    pinnedAt,
  };
};

export const getMessageExpiryTimestamp = (message = {}) => {
  const explicitExpiry = new Date(message?.expiresAt || 0).getTime();
  if (Number.isFinite(explicitExpiry) && explicitExpiry > 0) return explicitExpiry;

  // Older cached messages may carry their own duration without a deadline.
  // Never apply the chat's current timer to messages sent before it was enabled.
  const duration = { '24h': 86400000, '7d': 604800000, '30d': 2592000000 }[message?.disappearAfter];
  if (!Number.isFinite(duration)) return 0;
  const sentAt = new Date(message?.timestamp || message?.createdAt || message?.sentAt || 0).getTime();
  return Number.isFinite(sentAt) && sentAt > 0 ? sentAt + duration : 0;
};

export const applyDisappearingMessageTimer = (message = {}, timerRecord = null) => {
  // Preserve each message's deadline, including an explicit non-expiring value.
  if (message.expiresAt || message.disappearAfter) return message;
  const duration = { '24h': 86400000, '7d': 604800000, '30d': 2592000000 }[timerRecord?.timer];
  const enabledAt = new Date(timerRecord?.updatedAt || 0).getTime();
  const sentAt = new Date(message.timestamp || message.createdAt || 0).getTime();
  if (!Number.isFinite(duration) || !enabledAt || !sentAt || sentAt < enabledAt) return message;

  return { ...message, disappearAfter: timerRecord.timer, expiresAt: new Date(sentAt + duration).toISOString() };
};

export const isMessageExpired = (message = {}, now = Date.now()) => {
  const expiresAt = getMessageExpiryTimestamp(message);
  return expiresAt > 0 && expiresAt <= now;
};

export const mergeGroupConversationMessages = (messages = [], pinnedMessages = [], chatId = '') => {
  const mergedMessages = [...messages];
  pinnedMessages.forEach((pinnedMessage) => {
    if (
      !chatId ||
      String(pinnedMessage?.chatId || pinnedMessage?.groupId || '') !== String(chatId) ||
      !pinnedMessage?.isPinned || pinnedMessage?.isDeleted || pinnedMessage?.isHiddenForMe ||
      isMessageExpired(pinnedMessage)
    ) return;

    const existingIndex = mergedMessages.findIndex((message) => messagesShareIdentity(message, pinnedMessage));
    if (existingIndex < 0) {
      mergedMessages.push(pinnedMessage);
    } else {
      // Conversation content/edits/deletions take priority over a pin snapshot.
      const existingMessage = mergedMessages[existingIndex];
      if (!existingMessage.isDeleted && !existingMessage.isHiddenForMe && !isMessageExpired(existingMessage)) {
        mergedMessages[existingIndex] = {
          ...existingMessage,
          isPinned: true,
          pinnedAt: pinnedMessage.pinnedAt || existingMessage.pinnedAt,
        };
      }
    }
  });
  return mergedMessages.sort((firstMessage, secondMessage) =>
    new Date(firstMessage.timestamp || firstMessage.createdAt || 0).getTime() -
    new Date(secondMessage.timestamp || secondMessage.createdAt || 0).getTime()
  );
};

export const removeExpiredMessageCopies = (messageCaches = [], now = Date.now()) => {
  const expiredKeysByChat = new Map();
  messageCaches.forEach((messagesByChat) => {
    Object.entries(messagesByChat).forEach(([chatId, messages]) => {
      messages.forEach((message) => {
        if (!isMessageExpired(message, now)) return;
        const keys = expiredKeysByChat.get(chatId) || new Set();
        getMessageIdentityKeys(message).forEach((key) => keys.add(key));
        expiredKeysByChat.set(chatId, keys);
      });
    });
  });

  return messageCaches.map((messagesByChat) => {
    let nextMessagesByChat = messagesByChat;
    Object.entries(messagesByChat).forEach(([chatId, messages]) => {
      const expiredKeys = expiredKeysByChat.get(chatId);
      const remainingMessages = messages.filter((message) =>
        !isMessageExpired(message, now) &&
        !getMessageIdentityKeys(message).some((key) => expiredKeys?.has(key))
      );
      if (remainingMessages.length === messages.length) return;
      if (nextMessagesByChat === messagesByChat) nextMessagesByChat = { ...messagesByChat };
      nextMessagesByChat[chatId] = remainingMessages;
    });
    return nextMessagesByChat;
  });
};

export const getPinnedMessages = (messages = [], now = Date.now()) => {
  if (!Array.isArray(messages) || !messages.length) {
    return [];
  }

  const sortedPinnedCandidates = [...messages]
    .filter((message) => Boolean(message?.isPinned) && !isMessageExpired(message, now))
    .sort((firstMessage, secondMessage) => {
      const firstPinnedTime = new Date(
        firstMessage?.pinnedAt || firstMessage?.timestamp || firstMessage?.createdAt || 0
      ).getTime();
      const secondPinnedTime = new Date(
        secondMessage?.pinnedAt || secondMessage?.timestamp || secondMessage?.createdAt || 0
      ).getTime();
      return secondPinnedTime - firstPinnedTime;
    });

  const pinnedMessages = [];
  const seenIdentityKeys = new Set();

  sortedPinnedCandidates.forEach((message) => {
    const identityKeys = getMessageIdentityKeys(message).filter(Boolean);
    const fallbackKey = String(message?.id || message?.clientMessageId || message?.localId || '').trim();
    const comparableKeys = identityKeys.length ? identityKeys : fallbackKey ? [fallbackKey] : [];

    if (!comparableKeys.length) {
      return;
    }

    if (comparableKeys.some((identityKey) => seenIdentityKeys.has(identityKey))) {
      return;
    }

    comparableKeys.forEach((identityKey) => seenIdentityKeys.add(identityKey));
    pinnedMessages.push(message);
  });

  return pinnedMessages;
};
 
export const formatMessageTime = (dateInput) => {
  if (!dateInput) return '';

  const parsedDate = new Date(dateInput);
  if (Number.isNaN(parsedDate.getTime())) {
    return typeof dateInput === 'string' ? dateInput : '';
  }

  return parsedDate.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
};

const formatProfileTabTime = (value) => {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const formatProfileTabFileSize = (value) => {
  const normalizedValue = Number(value || 0);
  if (!Number.isFinite(normalizedValue) || normalizedValue <= 0) {
    return '';
  }

  if (normalizedValue >= 1024 * 1024) {
    return `${(normalizedValue / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (normalizedValue >= 1024) {
    return `${Math.round(normalizedValue / 1024)} KB`;
  }

  return `${normalizedValue} B`;
};

const trimLinkEnd = (candidate) => {
  let end = candidate.length;
  while (end > 0) {
    const lastCharacter = candidate[end - 1];
    if (LINK_TRAILING_PUNCTUATION.includes(lastCharacter)) {
      end -= 1;
      continue;
    }

    const openingCharacter = LINK_BRACKET_PAIRS[lastCharacter];
    if (openingCharacter) {
      // Keep a closing bracket the address itself opened, e.g. .../Chat_(disambiguation).
      const head = candidate.slice(0, end);
      if (head.split(lastCharacter).length > head.split(openingCharacter).length) {
        end -= 1;
        continue;
      }
    }

    break;
  }

  return candidate.slice(0, end);
};

const LINK_SCHEME_PREFIX_PATTERN = /^https?:\/\//i;
const LINK_SCHEME_OR_WWW_PREFIX_PATTERN = /^(?:https?:\/\/|www\.)/i;
const toLinkHref = (value) => (LINK_SCHEME_PREFIX_PATTERN.test(value) ? value : `https://${value}`);

/**
 * Every web address in a piece of message text, in order. `value` is the text as typed
 * (what the bubble shows); `href` is what the link opens (a bare "www.site.com" gets https://).
 */
export const findLinksInText = (value = '') => {
  const text = String(value || '');
  if (!text) {
    return [];
  }

  const candidates = [];

  // 1. Addresses with a scheme or a "www." prefix, wherever they sit in the text.
  const prefixedPattern = new RegExp(MESSAGE_PREFIXED_LINK_PATTERN.source, 'gi');
  let prefixedMatch = prefixedPattern.exec(text);
  while (prefixedMatch) {
    const start = Number(prefixedMatch.index || 0);
    const previousCharacter = start > 0 ? text[start - 1] : '';
    const isTailOfSomethingElse =
      Boolean(previousCharacter) &&
      (/[a-z0-9]/i.test(previousCharacter) || LINK_LEFT_BOUNDARY_BLOCKERS.includes(previousCharacter));

    if (!isTailOfSomethingElse) {
      candidates.push({ start, raw: String(prefixedMatch[0] || '') });
    }

    prefixedMatch = prefixedPattern.exec(text);
  }

  // 2. A bare name.tld, only as a whole word and only where step 1 found nothing.
  const prefixedCandidates = candidates.slice();
  let nextPrefixedIndex = 0;
  const wordPattern = new RegExp(LINK_WORD_PATTERN.source, 'g');
  let wordMatch = wordPattern.exec(text);
  while (wordMatch) {
    const word = String(wordMatch[0] || '');
    const wordStart = Number(wordMatch.index || 0);
    let leadingLength = 0;
    while (leadingLength < word.length && LINK_LEADING_PUNCTUATION.includes(word[leadingLength])) {
      leadingLength += 1;
    }

    const bareStart = wordStart + leadingLength;
    while (
      nextPrefixedIndex < prefixedCandidates.length &&
      prefixedCandidates[nextPrefixedIndex].start + prefixedCandidates[nextPrefixedIndex].raw.length <= bareStart
    ) {
      nextPrefixedIndex += 1;
    }
    const isCoveredByPrefixedLink =
      nextPrefixedIndex < prefixedCandidates.length &&
      prefixedCandidates[nextPrefixedIndex].start < wordStart + word.length;

    if (!isCoveredByPrefixedLink) {
      const bareMatch = MESSAGE_BARE_DOMAIN_PATTERN.exec(word.slice(leadingLength));
      if (bareMatch) {
        candidates.push({ start: bareStart, raw: String(bareMatch[0] || '') });
      }
    }

    wordMatch = wordPattern.exec(text);
  }

  return candidates
    .sort((first, second) => first.start - second.start)
    .reduce((links, candidate) => {
      const value = trimLinkEnd(candidate.raw);
      if (value.replace(LINK_SCHEME_OR_WWW_PREFIX_PATTERN, '').length > 0) {
        links.push({
          start: candidate.start,
          end: candidate.start + value.length,
          value,
          href: toLinkHref(value),
        });
      }
      return links;
    }, []);
};

export const extractLinksFromMessage = (message = {}) => {
  const attachmentUrls = new Set(
    [message?.mediaUrl, message?.fileUrl, message?.audioUrl]
      .map((value) => String(value || '').trim())
      .filter(Boolean)
  );
  const values = [
    message?.text,
    typeof message?.message === 'string' ? message.message : '',
    typeof message?.content === 'string' ? message.content : '',
    message?.caption,
  ];

  return Array.from(
    new Set(
      values.flatMap((value) =>
        findLinksInText(value)
          .filter((link) => !attachmentUrls.has(link.value) && !attachmentUrls.has(link.href))
          .map((link) => link.href)
      )
    )
  );
};

const extractLinksFromProfileMessage = (message = {}) => extractLinksFromMessage(message);

export const splitMessageTextWithLinks = (value = '') => {
  const text = String(value || '');
  if (!text) {
    return [];
  }

  const segments = [];
  let lastIndex = 0;

  findLinksInText(text).forEach((link) => {
    if (link.start > lastIndex) {
      segments.push({
        type: 'text',
        value: text.slice(lastIndex, link.start),
      });
    }

    segments.push({
      type: 'link',
      value: link.value,
      href: link.href,
    });

    lastIndex = link.end;
  });

  if (lastIndex < text.length) {
    segments.push({
      type: 'text',
      value: text.slice(lastIndex),
    });
  }

  return segments.length
    ? segments
    : [
        {
          type: 'text',
          value: text,
        },
      ];
};

const resolveProfileMessagePreviewText = (message = {}) => {
  const messageType = String(message?.type || message?.messageType || message?.mediaType || '')
    .trim()
    .toLowerCase();

  if (messageType === 'image') return message?.caption || 'Photo';
  if (messageType === 'video') return message?.caption || 'Video';
  if (messageType === 'audio') return message?.caption || 'Voice message';
  if (messageType === 'file') return message?.fileName || message?.caption || 'Document';

  return String(message?.text || message?.message || message?.content || '').trim() || 'Message';
};

const normalizeReplySenderValue = (senderValue) => {
  if (!senderValue) return '';
  if (typeof senderValue === 'string' || typeof senderValue === 'number') {
    return normalizeOptionalText(senderValue);
  }
  if (!isObjectRecord(senderValue)) return '';

  return normalizeOptionalText(
    senderValue?.name ||
      senderValue?.fullName ||
      senderValue?.username ||
      senderValue?.phone ||
      senderValue?.id ||
      senderValue?._id ||
      ''
  );
};

const resolveReplySource = (message = {}, fallback = {}) => {
  const candidates = [
    message?.replyTo,
    message?.reply,
    message?.repliedTo,
    message?.replyMessage,
    message?.replyToMessage,
    message?.quotedMessage,
    message?.parentMessage,
    fallback?.replyTo,
    fallback?.reply,
    fallback?.repliedTo,
    fallback?.replyMessage,
    fallback?.replyToMessage,
    fallback?.quotedMessage,
    fallback?.parentMessage,
  ];

  return candidates.find((candidate) => hasMessageContent(candidate)) || null;
};

const resolveReplyMessageId = (source) => {
  if (source === undefined || source === null) return '';
  if (typeof source === 'string' || typeof source === 'number') {
    return normalizeOptionalText(source);
  }
  if (!isObjectRecord(source)) return '';

  return normalizeOptionalText(
    source?.messageId ||
      source?.id ||
      source?._id ||
      source?.clientMessageId ||
      source?.localId ||
      source?.tempId ||
      (typeof source?.replyTo === 'object' ? '' : source?.replyTo) ||
      source?.message?.id ||
      source?.message?._id ||
      source?.message?.messageId ||
      source?.originalMessage?.id ||
      source?.originalMessage?._id ||
      source?.originalMessage?.messageId ||
      ''
  );
};

const resolveReplyContentCandidate = (value) => {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string' || typeof value === 'number') {
    return normalizeUnicodeText(value);
  }
  if (!isObjectRecord(value)) return '';

  const primitiveCandidate = pickFirstPresentValue(
    value?.text,
    typeof value?.message === 'object' ? '' : value?.message,
    value?.messageText,
    value?.preview,
    value?.caption,
    value?.fileName,
    value?.name,
    typeof value?.content === 'object' ? '' : value?.content
  );

  if (primitiveCandidate !== undefined) {
    return normalizeUnicodeText(primitiveCandidate);
  }

  return (
    resolveReplyContentCandidate(value?.content) ||
    resolveReplyContentCandidate(value?.media) ||
    resolveReplyContentCandidate(value?.attachment) ||
    resolveReplyContentCandidate(value?.file) ||
    ''
  );
};

const resolveReplyContentPreview = (source) => {
  if (source === undefined || source === null) return 'Message';

  const directContent = resolveReplyContentCandidate(source);
  if (directContent) {
    return directContent;
  }

  if (!isObjectRecord(source)) return 'Message';

  const nestedMessage = isObjectRecord(source?.message)
    ? source.message
    : isObjectRecord(source?.originalMessage)
      ? source.originalMessage
      : null;
  const nestedContent = resolveReplyContentCandidate(nestedMessage);
  if (nestedContent) {
    return nestedContent;
  }

  const messageType = String(
    source?.type ||
      source?.mediaType ||
      source?.messageType ||
      nestedMessage?.type ||
      nestedMessage?.mediaType ||
      nestedMessage?.messageType ||
      ''
  ).trim().toLowerCase();

  if (messageType === 'image') return 'Photo';
  if (messageType === 'video') return 'Video';
  if (messageType === 'audio') return 'Voice message';
  if (messageType === 'file') {
    return (
      normalizeOptionalFileName(source?.fileName || nestedMessage?.fileName || '') ||
      'Document'
    );
  }

  return 'Message';
};

const normalizeReplyToData = (message = {}, fallback = {}) => {
  const source = resolveReplySource(message, fallback);

  if (!source) return null;

  const messageId = resolveReplyMessageId(source);

  if (!messageId) return null;

  const content = isObjectRecord(source) ? resolveReplyContentPreview(source) : 'Message';
  const sender =
    isObjectRecord(source)
      ? normalizeReplySenderValue(
          source?.sender ||
            source?.senderName ||
            source?.author ||
            source?.message?.sender ||
            source?.message?.senderName ||
            source?.originalMessage?.sender ||
            source?.originalMessage?.senderName
        ) || 'Unknown'
      : 'Unknown';

  return {
    messageId,
    content,
    sender,
  };
};

const normalizeMessageMetadata = (message = {}, fallback = {}) => {
  if (isObjectRecord(message?.metadata)) {
    return { ...message.metadata };
  }

  if (isObjectRecord(fallback?.metadata)) {
    return { ...fallback.metadata };
  }

  return null;
};

const getProfileTabFileUrl = (message = {}) =>
  normalizeOptionalMediaUrl(
    message?.fileUrl ||
      message?.mediaUrl ||
      message?.attachment?.fileUrl ||
      message?.file?.fileUrl ||
      (typeof message?.content === 'string' ? message.content : '')
  );

export const createProfileTabContentModel = () => ({
  media: [],
  audios: [],
  files: [],
  links: [],
  chats: [],
});

export const buildProfileTabContent = (messages = [], options = {}) => {
  const normalizedMessages = normalizeStoredMessageListData(messages, options);
  const currentUserId = String(options?.currentUserId || '').trim();
  const contactName = String(options?.contactName || 'Contact').trim() || 'Contact';

  return normalizedMessages.reduce((tabContent, message, index) => {
    const messageType = String(message?.type || '').trim().toLowerCase();
    const messageId = String(
      message?.id ||
        message?.clientMessageId ||
        message?.localId ||
        `${message?.timestamp || 'message'}-${index}`
    );
    const time = formatProfileTabTime(
      message?.timestamp || message?.createdAt || message?.time
    );
    const isSentByCurrentUser =
      String(message?.senderId || '') === currentUserId || message?.direction === 'sent';

    if (PROFILE_TAB_MEDIA_TYPES.includes(messageType)) {
      const mediaUrl = resolveMessageMediaUrl(message, {}, messageType);
      if (mediaUrl) {
        tabContent.media.push({
          id: messageId,
          messageId,
          message,
          type: messageType,
          url: mediaUrl,
          caption: String(message?.caption || '').trim(),
          time,
          timestamp: message?.timestamp || message?.createdAt || message?.time || '',
          mimeType: String(message?.mimeType || '').trim(),
          duration: message?.duration ?? null,
          fileSize: Number(message?.fileSize || 0),
          name: String(message?.fileName || '').trim(),
          isSentByCurrentUser,
        });
      }
    }

    if (messageType === 'audio') {
      const audioUrl =
        resolveMessageMediaUrl(message, {}, messageType) ||
        String(message?.audioUrl || message?.content || '').trim();

      if (audioUrl) {
        tabContent.audios.push({
          id: messageId,
          messageId,
          message,
          type: 'audio',
          url: audioUrl,
          caption: String(message?.caption || '').trim(),
          time,
          timestamp: message?.timestamp || message?.createdAt || message?.time || '',
          mimeType: String(message?.mimeType || '').trim(),
          duration: message?.duration ?? null,
          fileSize: Number(message?.fileSize || 0),
          name: String(message?.fileName || 'Voice message').trim() || 'Voice message',
          isSentByCurrentUser,
        });
      }
    }

    if (messageType === 'file') {
      const fileUrl = getProfileTabFileUrl(message);
      const fileName = String(message?.fileName || 'Document').trim() || 'Document';

      if (fileName || fileUrl) {
        tabContent.files.push({
          id: messageId,
          messageId,
          message,
          name: fileName,
          url: fileUrl,
          size: formatProfileTabFileSize(message?.fileSize),
          caption: String(message?.caption || '').trim(),
          time,
          timestamp: message?.timestamp || message?.createdAt || message?.time || '',
        });
      }
    }

    extractLinksFromProfileMessage(message).forEach((url, linkIndex) => {
      tabContent.links.push({
        id: `${messageId}-${linkIndex}-${url}`,
        messageId,
        message,
        url,
        text: resolveProfileMessagePreviewText(message),
        time,
        timestamp: message?.timestamp || message?.createdAt || message?.time || '',
      });
    });

    tabContent.chats.push({
      id:
        messageId ||
        `${message?.timestamp || 'chat'}-${resolveProfileMessagePreviewText(message)}`,
      messageId,
      message,
      author: isSentByCurrentUser ? 'You' : contactName,
      text: resolveProfileMessagePreviewText(message),
      time,
      isSentByCurrentUser,
    });

    return tabContent;
  }, createProfileTabContentModel());
};
 
const BROADCAST_MEDIA_CONTROL_PREFIX = '__CHATTERLY_BROADCAST_MEDIA__:';

const expandBroadcastMediaControlMessage = (message = {}) => {
  const rawContent = [message?.content, message?.message, message?.text, message?.caption, message?.encryptedContent]
    .find((value) => typeof value === 'string' && value.trim().startsWith(BROADCAST_MEDIA_CONTROL_PREFIX));

  if (!rawContent) return message;

  try {
    const payload = JSON.parse(rawContent.trim().slice(BROADCAST_MEDIA_CONTROL_PREFIX.length));
    const mediaType = String(payload?.type || '').trim().toLowerCase();
    const fallbackMediaUrl = String(
      message?.mediaUrl ||
        message?.fileUrl ||
        message?.audioUrl ||
        message?.url ||
        message?.content ||
        ''
    ).trim();
    const mediaUrl = String(payload?.mediaUrl || payload?.url || fallbackMediaUrl || '').trim();
    if (!['image', 'video', 'audio', 'file'].includes(mediaType) || !mediaUrl) {
      return message;
    }

    return {
      ...message,
      type: mediaType,
      mediaType,
      content: mediaUrl,
      mediaUrl: mediaType === 'file' ? '' : mediaUrl,
      audioUrl: mediaType === 'audio' ? mediaUrl : '',
      fileUrl: mediaType === 'file' ? mediaUrl : '',
      fileName: String(payload?.fileName || '').trim(),
      fileSize: Number(payload?.fileSize || 0),
      mimeType: String(payload?.mimeType || '').trim(),
      caption: String(payload?.caption || '').trim(),
      duration: mediaType === 'audio' ? Number(payload?.duration || 0) : null,
    };
  } catch {
    return message;
  }
};

export const normalizeMessageData = (message = {}, options = {}) => {
  const expandedMessage = expandBroadcastMediaControlMessage(message);
  const fallback = expandBroadcastMediaControlMessage(options?.fallback || {});
  const timestamp = resolveTimestamp(expandedMessage, fallback);
  const mediaType = resolveMediaType({ message: expandedMessage, fallback });
  const resolvedContent = resolveMediaContent(expandedMessage, fallback);
  const content =
    mediaType === 'text' && typeof resolvedContent === 'string'
      ? normalizeUnicodeText(resolvedContent)
      : resolvedContent;
  const mediaUrl = resolveMessageMediaUrl(expandedMessage, fallback, mediaType);
  const fileUrl = resolveMessageFileUrl({
    message: expandedMessage,
    fallback,
    mediaType,
    content,
  });
  const fileName = resolveMessageFileName({
    message: expandedMessage,
    fallback,
    mediaType,
  });
  const fileSize = resolveMessageFileSize({
    message: expandedMessage,
    fallback,
    mediaType,
  });
  const mimeType = resolveMessageMimeType({
    message: expandedMessage,
    fallback,
  });
  const duration = resolveMessageDuration({
    message: expandedMessage,
    fallback,
    mediaType,
  });
  const caption = resolveMessageCaption({
    message: expandedMessage,
    fallback,
    mediaType,
    content,
  });
  const text = resolveMessagePreviewText({
    message: expandedMessage,
    fallback,
    mediaType,
    content,
    caption,
    fileName,
  });
  const normalizedStatus = normalizeMessageStatus(expandedMessage?.status, fallback?.status || 'sent');
  const uploadStatus = resolveMessageUploadStatus({
    message: expandedMessage,
    fallback,
    mediaType,
    normalizedStatus,
  });
  const senderId =
    expandedMessage?.senderId ||
    getNestedUserId(expandedMessage?.sender) ||
    fallback?.senderId ||
    getNestedUserId(fallback?.sender) ||
    null;
  const senderInfo = resolveMessageSenderInfo({
    message: expandedMessage,
    fallback,
    senderId,
  });
  const receiverId =
    expandedMessage?.receiverId ||
    getNestedUserId(expandedMessage?.receiver) ||
    fallback?.receiverId ||
    getNestedUserId(fallback?.receiver) ||
    null;
  const chatId = expandedMessage?.chatId || expandedMessage?.chat?._id || expandedMessage?.chat?.id || fallback?.chatId || null;
  const resolvedId = String(expandedMessage?.id || expandedMessage?._id || fallback?.id || createMessageId());
  const clientMessageId =
    expandedMessage?.clientMessageId ||
    fallback?.clientMessageId ||
    expandedMessage?.localId ||
    fallback?.localId ||
    (resolvedId.startsWith('temp-') ? resolvedId : '');
  const localId = expandedMessage?.localId || fallback?.localId || clientMessageId || null;
  const pendingReason =
    expandedMessage?.pendingReason ||
    fallback?.pendingReason ||
    (normalizedStatus === 'pending' ? 'offline' : '');
  const replyTo = normalizeReplyToData(expandedMessage, fallback);
  const metadata = normalizeMessageMetadata(expandedMessage, fallback);
  const isPinned = Boolean(expandedMessage?.isPinned ?? fallback?.isPinned ?? false);
  const isForwarded = Boolean(expandedMessage?.isForwarded ?? fallback?.isForwarded ?? false);
  const deletedFor = resolveMessageDeletedFor(expandedMessage, fallback);
  const isDeleted = Boolean(expandedMessage?.isDeleted ?? fallback?.isDeleted ?? false) || Boolean(deletedFor);
  const isUnread = Boolean(expandedMessage?.isUnread ?? fallback?.isUnread ?? false);
  const isHiddenForMe = deletedFor === 'me';
  const pinnedAt = isPinned
    ? String(expandedMessage?.pinnedAt || fallback?.pinnedAt || timestamp || '').trim() || null
    : null;

  return {
    ...fallback,
    ...expandedMessage,
    id: resolvedId,
    clientMessageId: clientMessageId || null,
    localId,
    chatId: chatId ? String(chatId) : null,
    type: mediaType,
    mediaType,
    direction: resolveMessageDirection({
      message: expandedMessage,
      fallback,
      currentUserId: options?.currentUserId,
      senderId,
    }),
    content,
    mediaUrl: mediaUrl || null,
    audioUrl:
      mediaType === 'audio'
        ? mediaUrl || normalizeOptionalMediaUrl(expandedMessage?.audioUrl || fallback?.audioUrl || '') || null
        : null,
    fileUrl: mediaType === 'file' ? fileUrl || null : null,
    fileName: mediaType === 'file' || mediaType === 'audio' ? fileName || null : null,
    fileSize: ['image', 'video', 'audio', 'file'].includes(mediaType) ? fileSize : null,
    mimeType: mimeType || null,
    duration,
    caption,
    metadata,
    text,
    message: text,
    timestamp,
    createdAt: timestamp,
    senderId,
    sender: senderInfo.sender,
    senderName: senderInfo.senderName,
    senderProfilePic: senderInfo.senderProfilePic,
    receiverId,
    status: normalizedStatus,
    uploadStatus,
    pendingReason,
    replyTo,
    isPinned,
    isForwarded,
    isDeleted,
    deletedFor: isDeleted ? deletedFor || 'everyone' : null,
    isUnread,
    isHiddenForMe,
    pinnedAt,
    isPending: isPendingMessageStatus(normalizedStatus),
    isFailed: normalizedStatus === 'failed',
    isDelivered: normalizedStatus === 'delivered' || normalizedStatus === 'read',
    isRead: normalizedStatus === 'read',
    time: expandedMessage?.time || fallback?.time || formatMessageTime(timestamp),
  };
};
 
export const toPersistedMessageData = (message = {}, options = {}) => {
  const normalizedMessage = normalizeMessageData(message, options);
  const validation = validateMessageDataFormat(normalizedMessage);
 
  if (!validation.isValid) {
    return null;
  }
 
  return MESSAGE_SCHEMA.persistedFields.reduce((persistedMessage, fieldName) => {
    const value = normalizedMessage[fieldName];
 
    if (value !== undefined) {
      persistedMessage[fieldName] = value;
    }
 
    return persistedMessage;
  }, {});
};
 
export const normalizeStoredMessageData = (message = {}, options = {}) => {
  if (!isObjectRecord(message)) {
    return null;
  }
 
  const normalizedMessage = normalizeMessageData(message, options);
  const validation = validateMessageDataFormat(normalizedMessage, options);
 
  if (!validation.isValid) {
    return null;
  }
 
  return normalizedMessage;
};
 
export const normalizeStoredMessageListData = (messages = [], options = {}) => {
  if (!Array.isArray(messages)) {
    return [];
  }
 
  return messages
    .map((message) => normalizeStoredMessageData(message, options))
    .filter(Boolean);
};
 
export const normalizeStoredMessagesByChatData = (messagesByChat = {}, options = {}) => {
  if (!isObjectRecord(messagesByChat)) {
    return {};
  }
 
  return Object.entries(messagesByChat).reduce((storedMessages, [chatId, messages]) => {
    if (!chatId || !Array.isArray(messages)) {
      return storedMessages;
    }
 
    const nextMessages = normalizeStoredMessageListData(messages, {
      ...options,
      fallback: {
        ...(options?.fallback || {}),
        chatId: String(chatId),
      },
    });
 
    if (nextMessages.length) {
      storedMessages[String(chatId)] = nextMessages;
    }
 
    return storedMessages;
  }, {});
};
 
export const toPersistedMessageListData = (messages = [], options = {}) => {
  if (!Array.isArray(messages)) {
    return [];
  }
 
  const persistedMessages = messages
    .map((message) => toPersistedMessageData(message, options))
    .filter(Boolean);
  const maxMessages = Number(options?.maxMessages || 0);
 
  return maxMessages > 0 ? persistedMessages.slice(-maxMessages) : persistedMessages;
};
 
export const toPersistedMessagesByChatData = (messagesByChat = {}, options = {}) => {
  if (!isObjectRecord(messagesByChat)) {
    return {};
  }
 
  return Object.entries(messagesByChat).reduce((storedMessages, [chatId, messages]) => {
    if (!chatId || !Array.isArray(messages) || !messages.length) {
      return storedMessages;
    }
 
    const nextMessages = toPersistedMessageListData(messages, {
      ...options,
      fallback: {
        ...(options?.fallback || {}),
        chatId: String(chatId),
      },
    });
 
    if (nextMessages.length) {
      storedMessages[String(chatId)] = nextMessages;
    }
 
    return storedMessages;
  }, {});
};
 
const buildSampleFlowMessage = (baseMessage, status) =>
  normalizeMessageData({
    ...baseMessage,
    id: `${baseMessage.id}-${status}`,
    status,
  });
 
const sampleStatusFlowBaseMessage = {
  id: 'sample-status-flow-message',
  chatId: 'sample-chat',
  senderId: 'sample-user-me',
  receiverId: 'sample-user-you',
  type: 'text',
  direction: 'sent',
  content: 'This sample message shows the standard status flow.',
  timestamp: '2026-04-17T09:00:00.000Z',
};
 
export const SAMPLE_MESSAGE_STATUS_FLOW = MESSAGE_STATUS_FLOW.map((status) =>
  buildSampleFlowMessage(sampleStatusFlowBaseMessage, status)
);
 
export const SAMPLE_SENDER_MESSAGE = SAMPLE_MESSAGE_STATUS_FLOW[0];
 
export const SAMPLE_RECEIVER_MESSAGE = normalizeMessageData({
  id: 'sample-receiver-message',
  chatId: 'sample-chat',
  senderId: 'sample-user-you',
  receiverId: 'sample-user-me',
  type: 'text',
  direction: 'received',
  content: 'Hi! This is a sample receiver message.',
  timestamp: '2026-04-17T09:01:00.000Z',
  status: 'read',
});
 
 
