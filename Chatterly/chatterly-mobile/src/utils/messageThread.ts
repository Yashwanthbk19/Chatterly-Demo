import type {ChatMessage} from '../types/chat';
import {isUnacknowledged, mergeStatus} from './messageStatus';

/**
 * Thread bookkeeping for Sprint 3 Stories 1 and 2.
 *
 * A single outgoing message is described to us up to four times: the optimistic
 * bubble we render immediately, the `sendMessage` ACK, the `receiveMessage`
 * broadcast echoed back into the room, and the REST list on the next open. All
 * four have to collapse onto one bubble whose status only ever moves forward,
 * which is what these helpers do.
 */

/** Whether two records describe the same message. */
function isSameMessage(existing: ChatMessage, incoming: ChatMessage): boolean {
  if (existing.id === incoming.id) { return true; }
  // The optimistic bubble is keyed by tempId until the server hands us a real
  // id, so this is the match that stops a send from rendering twice.
  if (existing.tempId && incoming.tempId && existing.tempId === incoming.tempId) { return true; }
  // Group membership notices are inserted optimistically before the REST
  // request. The server's room broadcast may arrive before its response and
  // does not echo our client id, so collapse matching notices from the same
  // operation instead of showing the update twice.
  return Boolean(
    existing.systemEvent && incoming.systemEvent &&
    existing.text === incoming.text &&
    Math.abs(Date.parse(existing.createdAt) - Date.parse(incoming.createdAt)) < 15000
  );
}

/**
 * Inserts `incoming`, or folds it into the bubble it belongs to. Fields the
 * server left blank keep whatever the optimistic bubble already had - notably
 * the text, which the broadcast can omit once the message is stored encrypted.
 */
export function upsertMessage(messages: ChatMessage[], incoming: ChatMessage): ChatMessage[] {
  const serverIndex = incoming.id
    ? messages.findIndex(message => message.id === incoming.id)
    : -1;
  const tempIndex = incoming.tempId
    ? messages.findIndex(message => message.tempId === incoming.tempId || message.id === incoming.tempId)
    : -1;
  let index = serverIndex !== -1
    ? serverIndex
    : tempIndex !== -1
    ? tempIndex
    : messages.findIndex(message => isSameMessage(message, incoming));
  let existing = index === -1 ? undefined : messages[index];

  // A group upload can broadcast its server record before the HTTP response
  // comes back. That echo has a server id but no tempId, while the optimistic
  // bubble has the tempId. When the response brings both ids, fold the echo
  // into the optimistic message and remove the extra row.
  if (serverIndex !== -1 && tempIndex !== -1 && serverIndex !== tempIndex) {
    const optimistic = messages[tempIndex];
    const echoed = messages[serverIndex];
    existing = {
      ...optimistic,
      ...echoed,
      tempId: optimistic.tempId || incoming.tempId || null,
    };
    messages = messages.filter((_, candidate) => candidate !== tempIndex);
    index = serverIndex - (tempIndex < serverIndex ? 1 : 0);
  }
  // Deletion is final even if history, a socket echo, or an in-flight upload
  // returns an older copy. Still adopt the server ID so future echoes without
  // the temporary ID match this same content-free record.
  const deletedForMe = Boolean(existing?.deletedForMe || incoming.deletedForMe);
  const isDeleted = Boolean(existing?.isDeleted || incoming.isDeleted);
  if (deletedForMe || isDeleted) {
    const deleted = deletedTombstone({
      ...existing,
      ...incoming,
      id: existing && existing.id !== existing.tempId && incoming.id === existing.tempId
        ? existing.id
        : incoming.id || existing?.id || '',
      tempId: existing?.tempId || incoming.tempId || null,
      deletedForMe,
      isDeleted,
    }, deletedForMe ? 'me' : 'everyone');
    if (index === -1) return [...messages, deleted];
    const next = [...messages];
    next[index] = deleted;
    return next;
  }
  if (!existing) { return [...messages, incoming]; }
  const merged: ChatMessage = {
    ...existing,
    ...incoming,
    // A real server id must win over the temporary one, but a payload that
    // arrives without an id must not wipe the id we already hold.
    id: incoming.id || existing.id,
    text: incoming.text || existing.text,
    tempId: existing.tempId || incoming.tempId || null,
    isOwn: existing.isOwn || incoming.isOwn,
    status: mergeStatus(existing.status, incoming.status),
    // Some socket ACK/broadcast payloads currently return `replyTo: null` and
    // an empty replyPreview even though the persisted message is a reply. The
    // optimistic bubble already has the source selected by the user, so do not
    // let that partial echo erase the quoted card before the full history is
    // fetched.
    replyTo: incoming.replyTo || existing.replyTo || null,
    replyPreview: incoming.replyPreview?.content ? incoming.replyPreview : existing.replyPreview || null,
  };

  const next = [...messages];
  next[index] = merged;
  return next;
}

/**
 * The forward endpoint can acknowledge a newly persisted message with only its
 * id, receiver, type and status. Hydrate that sparse record from the source so
 * an already-open destination can paint the forwarded bubble immediately,
 * without waiting for the next history fetch.
 */
export function forwardedMessageForActiveThread(source: ChatMessage, persisted: ChatMessage, contactId: string): ChatMessage {
  return {
    ...source,
    ...persisted,
    text: persisted.text || source.text,
    messageType: source.messageType || persisted.messageType,
    mediaUrl: persisted.mediaUrl || source.mediaUrl,
    thumbnailUrl: persisted.thumbnailUrl || source.thumbnailUrl,
    audioDuration: persisted.audioDuration ?? source.audioDuration,
    mediaSize: persisted.mediaSize || source.mediaSize,
    fileName: persisted.fileName || source.fileName,
    fileType: persisted.fileType || source.fileType,
    waveform: persisted.waveform || source.waveform,
    latitude: persisted.latitude ?? source.latitude,
    longitude: persisted.longitude ?? source.longitude,
    locationName: persisted.locationName || source.locationName,
    contactId,
    isOwn: true,
    isForwarded: true,
    isPinned: false,
    pinnedAt: null,
    isDeleted: false,
    deletedForMe: false,
    systemEvent: false,
    replyTo: persisted.replyTo || null,
    replyPreview: persisted.replyPreview || null,
  };
}

type DeletionScope = 'me' | 'everyone';

function deletedTombstone(message: ChatMessage, scope: DeletionScope): ChatMessage {
  return {
    ...message,
    text: '',
    messageType: 'text',
    mediaUrl: undefined,
    thumbnailUrl: undefined,
    audioDuration: undefined,
    mediaSize: undefined,
    fileName: undefined,
    fileType: undefined,
    waveform: undefined,
    latitude: undefined,
    longitude: undefined,
    locationName: undefined,
    isForwarded: false,
    isPinned: false,
    pinnedAt: null,
    myReaction: null,
    replyTo: null,
    replyPreview: null,
    mediaGroupId: null,
    queued: false,
    ...(scope === 'me' ? {deletedForMe: true} : {isDeleted: true}),
  };
}

function markDeleted(messages: ChatMessage[], messageId: string, scope: DeletionScope): ChatMessage[] {
  return messages.map(message =>
    message.id === messageId || message.tempId === messageId
      ? deletedTombstone(message, scope)
      : message,
  );
}

/** Replaces one local message with a content-free recipient-only tombstone. */
export const markDeletedForMe = (messages: ChatMessage[], messageId: string): ChatMessage[] =>
  markDeleted(messages, messageId, 'me');

/** Replaces a message with the content-free tombstone shared by both users. */
export const markDeletedForEveryone = (messages: ChatMessage[], messageId: string): ChatMessage[] =>
  markDeleted(messages, messageId, 'everyone');

/** Applies a status change to one message, never letting the ticks regress. */
export function applyStatus(messages: ChatMessage[], messageId: string, status: string): ChatMessage[] {
  return messages.map(message =>
    message.id === messageId || message.tempId === messageId
      ? {...message, status: mergeStatus(message.status, status)}
      : message,
  );
}

/**
 * Applies a `messages_read` receipt. The server sends the ids it just flipped,
 * but an empty list means "the whole chat was read", which is how it behaves
 * when the receiver opens a conversation with nothing new left to mark.
 *
 * A message the server has never acknowledged is excluded either way: the
 * receiver cannot have read something still sitting in our outbox, and letting
 * the blanket form reach it would paint read ticks on a failed send.
 */
export function applyReadReceipt(messages: ChatMessage[], messageIds: string[]): ChatMessage[] {
  const targeted = new Set(messageIds);
  return messages.map(message => {
    if (!message.isOwn || isUnacknowledged(message.status)) { return message; }
    if (targeted.size > 0 && !targeted.has(message.id)) { return message; }
    return {...message, status: mergeStatus(message.status, 'read')};
  });
}

/** Oldest first, which is the order the thread renders in. */
export function sortByTime(messages: ChatMessage[]): ChatMessage[] {
  return [...messages].sort((first, second) => Date.parse(first.createdAt) - Date.parse(second.createdAt));
}

/**
 * Reconciles a fresh cloud snapshot with device-only work. The server is
 * authoritative for stored history. Preserve pending device work and durable
 * deletion markers so a delayed remote copy cannot restore deleted content.
 */
export function reconcileStoredAndRemote(stored: ChatMessage[], remote: ChatMessage[]): ChatMessage[] {
  let merged = stored.filter(message => {
    const representedRemotely = remote.some(item =>
      item.id === message.id || Boolean(item.tempId && message.tempId && item.tempId === message.tempId),
    );
    return representedRemotely || message.deletedForMe || message.isDeleted || message.queued || message.status === 'pending' || message.status === 'failed';
  });
  remote.forEach(message => { merged = upsertMessage(merged, message); });
  return sortByTime(merged);
}
