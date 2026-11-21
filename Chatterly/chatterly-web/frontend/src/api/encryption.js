import { requestEntity } from './client';
import { formatCallLogDurationText } from '../utils/callLog';

const E2EE_PREFIX = 'CHT-E2EE-v1:';
const E2EE_KEY_STORAGE_PREFIX = 'chatterly_e2ee_keypair';
const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();

const getRecordId = (message = {}) =>
  String(message?._id || message?.id || message?.messageId || '').trim();

const getUserId = (value) =>
  String(value?._id || value?.id || value?.userId || value || '').trim();

const getCurrentUser = () => {
  try {
    return JSON.parse(localStorage.getItem('user') || 'null') || {};
  } catch {
    return {};
  }
};

const getCurrentUserId = () => getUserId(getCurrentUser());

const hasReadableText = (message = {}) =>
  Boolean(String(message?.content || message?.message || message?.text || '').trim());

const isCallLogContent = (value = '') =>
  /^(?:(?:audio|video) call(?: completed \(\d+s\)| rejected| cancelled)?|missed (?:audio|video) call|(?:audio|video) group call(?: started| ended \(\d+s\)| - not answered)?)$/i.test(
    String(value || '').trim()
  );

const formatCallLogText = (value = '') =>
  formatCallLogDurationText(
    String(value || '')
      .replace(/^audio call/i, 'Voice Call')
      .replace(/^missed audio call/i, 'Missed Voice Call')
      .replace(/^video call/i, 'Video Call')
      .replace(/^missed video call/i, 'Missed Video Call')
      .replace(/^audio group call/i, 'Voice group call')
      .replace(/^video group call/i, 'Video group call')
      .replace(/ call completed/i, ' Call Answered')
      .replace(/ - not answered/i, ' - Not Answered')
  );

const toBase64 = (value) => {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
};

const fromBase64 = (value = '') => {
  const binary = atob(String(value || ''));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

const arrayBufferToPem = (buffer, label) => {
  const base64 = toBase64(buffer);
  const wrapped = base64.match(/.{1,64}/g)?.join('\n') || base64;
  return `-----BEGIN ${label}-----\n${wrapped}\n-----END ${label}-----`;
};

const pemToArrayBuffer = (pem = '') => {
  const base64 = String(pem || '')
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '');
  return fromBase64(base64).buffer;
};

const getKeyStorageKey = (userId = getCurrentUserId()) =>
  `${E2EE_KEY_STORAGE_PREFIX}:${String(userId || 'anonymous').trim() || 'anonymous'}`;

export const isEncryptedMessageContent = (value = '') =>
  String(value || '').trim().startsWith(E2EE_PREFIX);

const parseEnvelope = (value = '') => {
  const normalizedValue = String(value || '').trim();
  if (!isEncryptedMessageContent(normalizedValue)) return null;

  try {
    const decoded = TEXT_DECODER.decode(fromBase64(normalizedValue.slice(E2EE_PREFIX.length)));
    const envelope = JSON.parse(decoded);
    return envelope && typeof envelope === 'object' ? envelope : null;
  } catch {
    return null;
  }
};

const getCrypto = () => globalThis.crypto?.subtle ? globalThis.crypto : null;

const generateKeyPair = async () => {
  const cryptoRef = getCrypto();
  if (!cryptoRef) throw new Error('Web Crypto is unavailable.');

  const keyPair = await cryptoRef.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['encrypt', 'decrypt']
  );

  const [publicJwk, privateJwk, spki] = await Promise.all([
    cryptoRef.subtle.exportKey('jwk', keyPair.publicKey),
    cryptoRef.subtle.exportKey('jwk', keyPair.privateKey),
    cryptoRef.subtle.exportKey('spki', keyPair.publicKey),
  ]);

  return {
    publicJwk,
    privateJwk,
    publicKey: arrayBufferToPem(spki, 'PUBLIC KEY'),
  };
};

const readStoredKeyPair = (userId = getCurrentUserId()) => {
  try {
    const parsedValue = JSON.parse(localStorage.getItem(getKeyStorageKey(userId)) || 'null');
    return parsedValue && typeof parsedValue === 'object' ? parsedValue : null;
  } catch {
    return null;
  }
};

const persistKeyPair = (keyPair, userId = getCurrentUserId()) => {
  localStorage.setItem(getKeyStorageKey(userId), JSON.stringify(keyPair));
};

const writeCurrentUserPublicKey = (publicKey) => {
  const currentUser = getCurrentUser();
  if (!currentUser || !publicKey || currentUser.publicKey === publicKey) return;
  localStorage.setItem('user', JSON.stringify({ ...currentUser, publicKey }));
};

export const ensureLocalE2EEKeyPair = async () => {
  const currentUserId = getCurrentUserId();
  if (!currentUserId) return null;

  let keyPair = readStoredKeyPair(currentUserId);
  if (!keyPair?.publicKey || !keyPair?.privateJwk) {
    keyPair = await generateKeyPair();
    persistKeyPair(keyPair, currentUserId);
  }

  const storedPublicKey = String(getCurrentUser()?.publicKey || '').trim();
  if (keyPair.publicKey && storedPublicKey !== keyPair.publicKey) {
    await requestEntity(
      {
        method: 'post',
        url: '/api/key-rotation/rotate',
        data: { publicKey: keyPair.publicKey },
        skipGlobalLoading: true,
        skipGlobalError: true,
      },
      {
        fallbackMessage: 'Failed to register encryption key.',
        dedupeKey: `e2ee-key-rotation-${currentUserId}`,
      }
    );
  }

  writeCurrentUserPublicKey(keyPair.publicKey);

  return keyPair;
};

const importPublicKey = async (publicKeyPem = '') => {
  const cryptoRef = getCrypto();
  if (!cryptoRef) throw new Error('Web Crypto is unavailable.');

  return cryptoRef.subtle.importKey(
    'spki',
    pemToArrayBuffer(publicKeyPem),
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt']
  );
};

const importPrivateKey = async (privateJwk) => {
  const cryptoRef = getCrypto();
  if (!cryptoRef) throw new Error('Web Crypto is unavailable.');

  return cryptoRef.subtle.importKey(
    'jwk',
    privateJwk,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['decrypt']
  );
};

const wrapAesKeyForUser = async (aesRawKey, publicKeyPem) => {
  const cryptoRef = getCrypto();
  const publicKey = await importPublicKey(publicKeyPem);
  const wrappedKey = await cryptoRef.subtle.encrypt(
    { name: 'RSA-OAEP' },
    publicKey,
    aesRawKey
  );
  return toBase64(wrappedKey);
};

export const encryptMessageContent = async ({
  plaintext = '',
  senderId = '',
  receiverId = '',
  receiverPublicKey = '',
} = {}) => {
  const normalizedPlaintext = String(plaintext || '');
  const normalizedSenderId = String(senderId || getCurrentUserId()).trim();
  const normalizedReceiverId = String(receiverId || '').trim();
  const normalizedReceiverPublicKey = String(receiverPublicKey || '').trim();

  if (!normalizedPlaintext || isEncryptedMessageContent(normalizedPlaintext)) {
    return normalizedPlaintext;
  }
  if (!normalizedSenderId || !normalizedReceiverId || !normalizedReceiverPublicKey) {
    return normalizedPlaintext;
  }

  const cryptoRef = getCrypto();
  if (!cryptoRef) return normalizedPlaintext;

  const localKeyPair = await ensureLocalE2EEKeyPair();
  if (!localKeyPair?.publicKey) return normalizedPlaintext;

  const aesKey = await cryptoRef.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
  const iv = cryptoRef.getRandomValues(new Uint8Array(12));
  const cipherBuffer = await cryptoRef.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    TEXT_ENCODER.encode(normalizedPlaintext)
  );
  const aesRawKey = await cryptoRef.subtle.exportKey('raw', aesKey);
  const keyEntries = await Promise.all([
    [normalizedSenderId, await wrapAesKeyForUser(aesRawKey, localKeyPair.publicKey)],
    [normalizedReceiverId, await wrapAesKeyForUser(aesRawKey, normalizedReceiverPublicKey)],
  ]);
  const envelope = {
    v: 1,
    alg: 'RSA-OAEP-256+A256GCM',
    iv: toBase64(iv),
    ciphertext: toBase64(cipherBuffer),
    keys: Object.fromEntries(keyEntries),
  };

  return `${E2EE_PREFIX}${toBase64(TEXT_ENCODER.encode(JSON.stringify(envelope)))}`;
};

const getMessageParticipantIds = (message = {}) => [
  getUserId(message?.receiver),
  getUserId(message?.receiverId),
  getUserId(message?.sender),
  getUserId(message?.senderId),
].filter(Boolean);

export const decryptMessageContent = async (encryptedContent = '', message = {}) => {
  const envelope = parseEnvelope(encryptedContent);
  if (!envelope?.keys || !envelope?.iv || !envelope?.ciphertext) {
    return String(encryptedContent || '');
  }

  const currentUserId = getCurrentUserId();
  const localKeyPair = readStoredKeyPair(currentUserId);
  if (!currentUserId || !localKeyPair?.privateJwk) {
    return '';
  }

  const recipientIds = [currentUserId, ...getMessageParticipantIds(message)];
  const wrappedKey = recipientIds
    .map((participantId) => envelope.keys?.[participantId])
    .find(Boolean);
  if (!wrappedKey) return '';

  const cryptoRef = getCrypto();
  if (!cryptoRef) return '';

  try {
    const privateKey = await importPrivateKey(localKeyPair.privateJwk);
    const aesRawKey = await cryptoRef.subtle.decrypt(
      { name: 'RSA-OAEP' },
      privateKey,
      fromBase64(wrappedKey)
    );
    const aesKey = await cryptoRef.subtle.importKey(
      'raw',
      aesRawKey,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );
    const plaintextBuffer = await cryptoRef.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(envelope.iv) },
      aesKey,
      fromBase64(envelope.ciphertext)
    );
    return TEXT_DECODER.decode(plaintextBuffer);
  } catch (error) {
    console.warn('Failed to decrypt message locally:', error);
    return '';
  }
};

export const decryptMessageRecord = async (message = {}) => {
  const messageId = getRecordId(message);
  const encryptedContent = String(message?.encryptedContent || '').trim();

  if (isCallLogContent(encryptedContent)) {
    return {
      ...message,
      content: formatCallLogText(encryptedContent),
    };
  }

  const currentUserId = getCurrentUserId();

  if (!messageId || !encryptedContent || hasReadableText(message) || !currentUserId) {
    return message;
  }

  if (isEncryptedMessageContent(encryptedContent)) {
    const plaintext = await decryptMessageContent(encryptedContent, message);
    return plaintext ? { ...message, content: plaintext } : message;
  }

  // Existing messages may have been stored before client-side E2EE envelopes
  // were introduced. Keep those readable without making any backend decrypt call.
  return { ...message, content: encryptedContent };
};

export const decryptMessageRecords = async (messages = []) =>
  Promise.all(
    (Array.isArray(messages) ? messages : []).map((message) =>
      decryptMessageRecord(message)
    )
  );
