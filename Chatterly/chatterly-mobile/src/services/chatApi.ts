import {apiRequest, handleApiResponseStatus} from '../api/client';
import {API_BASE_URL} from '../config/api';
import {getRegisteredUser} from './contactsApi';
import type {ChatListItem, ChatMessage, ChatProfile, ConversationContact, ForwardDestination, SharedLink} from '../types/chat';
import {getSession, getToken} from './sessionStore';
import {formatCallLogText, isCallLogMessage} from '../utils/callLog';
import {parseAlbumFileName} from '../utils/mediaAlbum';
import {messagePreview} from '../utils/messagePreview';
import {disappearingTimerEventCopy, parseDisappearingTimerEventText} from './disappearingMessages';
import {getChatListActivities} from './chatListActivity';
import {createUsageTransfer} from './dataUsage';

// A reference to a user is either a bare ObjectId string - which is what the
// chat-list aggregation returns - or the populated document the message and
// start-chat endpoints return.
type UserReference = string | {
  _id?: string;
  id?: string;
  userId?: string;
  name?: string;
  fullName?: string;
  profilePic?: string;
  avatar?: string;
  status?: string;
  lastSeen?: string;
};

export type ChatRecord = {
  _id?: string;
  id?: string;
  chatId?: string;
  type?: string;
  groupName?: string;
  groupPhoto?: string;
  description?: string;
  participants?: Array<{user?: UserReference; archived?: boolean; pinned?: boolean; markedUnread?: boolean; markedUnreadAt?: string | null} | UserReference>;
  isPinned?: boolean;
  pinned?: boolean;
  lastMessage?: MessageRecord | string;
  unreadCount?: number;
  updatedAt?: string;
};

export function normalizeForwardDestinations(chats: ChatRecord[]): ForwardDestination[] {
  const currentUserId = getSession()?.user?.id || '';
  const seen = new Set<string>();
  return chats.map(chat => {
    if (chat.type === 'group') {
      const id = chatIdOf(chat);
      return {id, chatId: id, name: String(chat.groupName || 'Group'), thumbnail: chat.groupPhoto || null, subtitle: chat.description || 'Group chat', kind: 'group' as const, recent: true};
    }
    const participant = chat.participants?.find(entry => {
      const reference = typeof entry === 'object' && entry !== null && 'user' in entry ? entry.user : entry as UserReference;
      return entityId(reference) !== currentUserId;
    });
    const reference = typeof participant === 'object' && participant !== null && 'user' in participant ? participant.user : participant as UserReference;
    const contact = userFromReference(reference);
    return {id: contact.userId, chatId: chatIdOf(chat), name: contact.name, thumbnail: contact.thumbnail, subtitle: contact.status || 'Recent chat', kind: 'contact' as const, recent: true};
  }).filter(item => Boolean(item.id) && !seen.has(item.id) && Boolean(seen.add(item.id)));
}

export async function getForwardDestinations(): Promise<ForwardDestination[]> {
  const records = await getChatList();
  const groups = normalizeForwardDestinations(records.filter(chat => chat.type === 'group'));
  // Direct chat rows can contain only participant ObjectIds. Reuse the inbox
  // enrichment path so the forward picker still shows real names and avatars.
  const directChats = await enrichChatList(normalizeChatList(records.filter(chat => chat.type !== 'group')));
  const direct: ForwardDestination[] = directChats.map(chat => ({
    id: chat.contact.userId,
    chatId: chat.id,
    name: chat.contact.name,
    thumbnail: chat.contact.thumbnail,
    subtitle: chat.contact.status || chat.lastMessage || 'Recent chat',
    kind: 'contact',
    recent: true,
  }));
  const local: ForwardDestination[] = getChatListActivities(getSession()?.user?.id || '').map(activity => ({
    id: activity.contact.kind === 'group' ? activity.chatId : activity.contact.userId,
    chatId: activity.chatId,
    name: activity.contact.name,
    thumbnail: activity.contact.thumbnail,
    subtitle: activity.contact.status || activity.preview || 'Recent chat',
    kind: activity.contact.kind === 'group' ? 'group' : 'contact',
    recent: true,
  }));
  return [...local, ...groups, ...direct].filter((item, index, all) => all.findIndex(candidate => candidate.id === item.id) === index);
}

type MessageRecord = {
  _id?: string;
  id?: string;
  sender?: UserReference;
  senderId?: UserReference;
  receiver?: UserReference;
  chatId?: UserReference;
  groupId?: UserReference;
  content?: string;
  encryptedContent?: string;
  caption?: string;
  createdAt?: string;
  status?: string;
  messageType?: ChatMessage['messageType'];
  mediaType?: ChatMessage['messageType'];
  callId?: UserReference | null;
  callStatus?: string;
  mediaUrl?: string;
  thumbnailUrl?: string;
  audioDuration?: number;
  mediaSize?: number;
  fileSize?: number;
  fileName?: string;
  fileType?: string;
  waveform?: number[];
  isForwarded?: boolean;
  forwardedFrom?: UserReference | null;
  isPinned?: boolean;
  pinnedAt?: string | null;
  isDeleted?: boolean;
  deletedFor?: UserReference[];
  replyTo?: string | null;
  replyPreview?: ChatMessage['replyPreview'];
  tempId?: string | null;
  senderRole?: ChatMessage['senderRole'];
  role?: ChatMessage['senderRole'];
};

const LOCATION_MESSAGE_PATTERN = /^📍 (.+)\nhttps:\/\/www\.google\.com\/maps\?q=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/;

export function locationMessage(latitude: number, longitude: number, name = 'Shared location'): string {
  return `📍 ${name}\nhttps://www.google.com/maps?q=${latitude.toFixed(6)},${longitude.toFixed(6)}`;
}

function authenticatedHeaders(): Record<string, string> {
  const token = getToken();
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...(token ? {Authorization: `Bearer ${token}`} : {}),
  };
}

function entityId(value: UserReference | null | undefined): string {
  if (!value) { return ''; }
  if (typeof value === 'string') { return value; }
  return String(value._id || value.id || value.userId || '');
}

export function chatIdOf(chat: ChatRecord | null | undefined): string {
  return String(chat?._id || chat?.chatId || chat?.id || '');
}

export function findDirectChatForUser(chats: ChatRecord[], userId: string): ChatRecord | null {
  const targetId = String(userId);
  return chats.find(chat => (
    chat.type !== 'group' &&
    chat.participants?.some(participant => {
      const reference = typeof participant === 'object' && participant !== null && 'user' in participant
        ? participant.user
        : participant as UserReference;
      return entityId(reference) === targetId;
    })
  )) || null;
}

export async function getChatList(): Promise<ChatRecord[]> {
  const response = await apiRequest(`${API_BASE_URL}/chats/list`, {
    method: 'GET',
    headers: authenticatedHeaders(),
  });
  const payload = await response.json();
  const data = payload?.data || payload?.chats || payload?.chatList || [];
  return Array.isArray(data) ? data : [];
}

export type SearchContact = {
  userId: string;
  name: string;
  phone?: string;
  thumbnail?: string | null;
};

export async function searchChatContacts(query: string): Promise<SearchContact[]> {
  const response = await apiRequest(`${API_BASE_URL}/chats/contacts/search?q=${encodeURIComponent(query.trim())}`, {
    method: 'GET',
    headers: authenticatedHeaders(),
  });
  const payload = await response.json();
  const records = Array.isArray(payload) ? payload : payload?.data || payload?.users || [];
  if (!Array.isArray(records)) { return []; }
  return records.map(record => ({
    userId: String(record?._id || record?.id || record?.userId || ''),
    name: String(record?.name || record?.fullName || UNKNOWN_CONTACT_NAME),
    phone: record?.phone || record?.phoneNumber,
    thumbnail: record?.profilePic || record?.avatar || null,
  })).filter(contact => contact.userId);
}

// The placeholder shown when a record carries no readable name. Named because
// enrichChatList has to recognise it to know a row still needs a real identity.
const UNKNOWN_CONTACT_NAME = 'Chatterly user';

function userFromReference(value: UserReference | null | undefined): ConversationContact {
  if (!value || typeof value === 'string') { return {userId: entityId(value), name: UNKNOWN_CONTACT_NAME}; }
  const record = value;
  return {userId: entityId(record), name: String(record.name || record.fullName || UNKNOWN_CONTACT_NAME), thumbnail: record.profilePic || record.avatar || null, status: record.status, lastSeen: record.lastSeen || null};
}

export function normalizeChatList(chats: ChatRecord[]): ChatListItem[] {
  const currentUserId = getSession()?.user?.id || '';
  return chats.map(chat => {
    const isGroup = chat.type === 'group';
    const currentParticipant = chat.participants?.find(entry => {
      const user = typeof entry === 'object' && entry !== null && 'user' in entry ? entry.user : entry as UserReference;
      return entityId(user) === currentUserId;
    });
    const participant = chat.participants?.find(entry => {
      const reference = typeof entry === 'object' && entry !== null && 'user' in entry ? entry.user : entry as UserReference;
      return entityId(reference) !== currentUserId;
    });
    const reference = typeof participant === 'object' && participant !== null && 'user' in participant ? participant.user : participant as UserReference;
    const last = typeof chat.lastMessage === 'object' ? chat.lastMessage : undefined;
    const lastSenderId = entityId(last?.senderId || last?.sender);
    return {
      id: chatIdOf(chat),
      contact: isGroup ? {
        userId: chatIdOf(chat),
        name: String(chat.groupName || 'Group'),
        thumbnail: chat.groupPhoto || null,
        status: `${chat.participants?.length || 0} Members`,
        kind: 'group' as const,
      } : {...userFromReference(reference), kind: 'contact' as const},
      // A media message has no words of its own, so the preview is built from
      // the normalized message rather than read straight off the record.
      lastMessage: last ? messagePreview(normalizeMessage(last)) : '',
      // `updatedAt` also changes when the conversation is opened/read. Using it
      // as message activity incorrectly moves an old chat to the top of Recents.
      // When the list endpoint returns only a message id, enrichChatList fills
      // this from the actual newest message record below.
      lastMessageAt: String(last?.createdAt || ''),
      unreadCount: Number(chat.unreadCount || 0),
      // Mark-as-unread is stored on the authenticated participant and does not
      // create a fake unread Message record. Keep it separate so the inbox can
      // render the wireframe dot instead of an invented numeric counter.
      markedUnread: Boolean(typeof currentParticipant === 'object' && currentParticipant !== null && 'markedUnread' in currentParticipant && currentParticipant.markedUnread),
      archived: Boolean(typeof currentParticipant === 'object' && currentParticipant !== null && 'archived' in currentParticipant && currentParticipant.archived),
      pinned: Boolean(
        chat.isPinned ?? chat.pinned ??
        (typeof currentParticipant === 'object' && currentParticipant !== null && 'pinned' in currentParticipant && currentParticipant.pinned),
      ),
      // Only a preview of our own message carries ticks, matching how the
      // conversation itself only shows a status under our own bubbles.
      lastMessageIsOwn: Boolean(currentUserId && lastSenderId === currentUserId),
      lastMessageStatus: String(last?.status || ''),
      lastMessageId: String(last?._id || last?.id || ''),
    };
  }).filter(chat => chat.id && chat.contact.userId);
}

async function chatAction(path: string, chatId: string, method = 'POST'): Promise<void> {
  await apiRequest(`${API_BASE_URL}${path}`, {method, headers: authenticatedHeaders(), body: JSON.stringify({chatId})});
}

export const archiveChat = (chatId: string) => chatAction('/chats/archive', chatId);
export const unarchiveChat = (chatId: string) => chatAction('/chats/unarchive', chatId);
// Every chat route is mounted under /api/chats - "/delete" alone resolves to
// /api/delete, which does not exist and 404s.
export const deleteChat = (chatId: string) => chatAction('/chats/delete', chatId);
export const markChatUnread = (chatId: string) => chatAction('/chats/mark-unread', chatId, 'PUT');
export const pinChatThread = (chatId: string) => chatAction('/chats/pin-chat', chatId);
export const unpinChatThread = (chatId: string) => chatAction('/chats/unpin-chat', chatId);

export async function startChat(receiverId: string): Promise<{chatId: string; chat: ChatRecord}> {
  const response = await apiRequest(`${API_BASE_URL}/chats/start`, {
    method: 'POST',
    headers: authenticatedHeaders(),
    body: JSON.stringify({receiverId}),
  });
  const payload = await response.json();
  const chat = (payload?.chat || payload?.data?.chat || payload?.data || {}) as ChatRecord;
  const chatId = chatIdOf(chat) || String(payload?.chatId || payload?.data?.chatId || '');
  if (!chatId) { throw new Error('The server did not return a conversation.'); }

  // POST /chats/start returns an existing chat when these users have spoken
  // before. A locally deleted chat is server-side archived, so restore this
  // participant's row before opening it again or the sent message remains
  // hidden from the All Chats filter.
  const currentUserId = getSession()?.user?.id || '';
  const currentParticipant = chat.participants?.find(entry => {
    const reference = typeof entry === 'object' && entry !== null && 'user' in entry
      ? entry.user
      : entry as UserReference;
    return entityId(reference) === currentUserId;
  });
  if (typeof currentParticipant === 'object' && currentParticipant !== null && 'archived' in currentParticipant && currentParticipant.archived) {
    await unarchiveChat(chatId);
    currentParticipant.archived = false;
  }
  return {chatId, chat};
}

export function normalizeMessage(message: MessageRecord, forceOwn = false): ChatMessage {
  const currentUserId = getSession()?.user?.id || '';
  const senderId = entityId(message.senderId || message.sender);
  const receiverId = entityId(message.receiver);
  const isOwn = forceOwn || Boolean(currentUserId && senderId === currentUserId);
  const rawText = String(message.encryptedContent || message.content || message.caption || '');
  const sharedLocation = LOCATION_MESSAGE_PATTERN.exec(rawText);
  const isCallLog = isCallLogMessage(message.messageType);
  const isGroupRoleChange = /\bwas\s+(?:promoted\s+to|removed\s+as)\s+(?:an?\s+)?(?:admin|moderator)\.?$/i.test(rawText);
  const isGroupRulesChange = /^group rules updated\.?$/i.test(rawText);
  const isGroupPhotoChange = /^(?:(?:new\s+)?group photo (?:added|updated|removed)|.+ (?:changed|updated|removed) the group photo)\.?$/i.test(rawText);
  const disappearingTimer = parseDisappearingTimerEventText(rawText);
  // Both call services store their log as an ordinary message. It belongs in
  // the timeline as a centered notice, the way a membership change does, rather
  // than as a chat bubble from whoever happened to start the call.
  const systemEvent = Boolean(disappearingTimer) || isCallLog || isGroupRoleChange || isGroupPhotoChange || isGroupRulesChange || /(?:added to|removed from) the group\.?$/i.test(rawText);
  const disappearingCopy = disappearingTimer ? disappearingTimerEventCopy(disappearingTimer) : null;
  // A multi-select send is stored as one message per file; the batch id the
  // sender tagged the upload with is what puts them back into one album when the
  // thread is loaded from the server (after a reinstall, or on another phone).
  const declaredMediaKind = message.messageType || message.mediaType;
  // A few send-file responses have been observed with an incorrect `image`
  // discriminator. The original file identity is authoritative: otherwise a
  // PDF/Office/archive selected from Document renders as a broken image card.
  const documentName = String(message.fileName || '');
  const documentMime = String(message.fileType || '');
  const isDocumentFile = /\.(?:pdf|doc|docx|xls|xlsx|ppt|pptx|zip|txt|csv|rtf|vcf)$/i.test(documentName) ||
    /^(?:application\/(?:pdf|zip|x-zip-compressed|msword|vnd\.(?:ms-[^;]+|openxmlformats-[^;]+))|text\/(?:plain|csv|rtf|vcard|x-vcard))(?:;|$)/i.test(documentMime);
  // Older uploads can be returned as generic files even though their MIME type
  // or extension identifies a video. Normalize them here so the chat uses the
  // video player and Gallery download path instead of the document share path.
  const isVideoFile = declaredMediaKind === 'file' && (
    /^video\//i.test(String(message.fileType || '')) ||
    /\.(?:mp4|mov|m4v|webm|avi|mkv|3gp)$/i.test(String(message.fileName || ''))
  );
  const mediaKind = isVideoFile ? 'video' : isDocumentFile ? 'file' : declaredMediaKind;
  const album = mediaKind === 'image' || mediaKind === 'video' ? parseAlbumFileName(message.fileName) : null;
  return {
    id: String(message._id || message.id || `${message.createdAt || Date.now()}`),
    text: sharedLocation ? '' : disappearingCopy ? disappearingCopy.title : isCallLog ? formatCallLogText(rawText) : rawText,
    createdAt: String(message.createdAt || new Date().toISOString()),
    isOwn,
    isDeleted: Boolean(message.isDeleted),
    deletedForMe: Boolean(currentUserId && message.deletedFor?.some(user => entityId(user) === currentUserId)),
    status: message.status,
    messageType: sharedLocation ? 'location' : isCallLog ? 'call' : mediaKind || 'text',
    callId: isCallLog ? entityId(message.callId) || null : null,
    callStatus: isCallLog ? String(message.callStatus || '') || null : null,
    latitude: sharedLocation ? Number(sharedLocation[2]) : undefined,
    longitude: sharedLocation ? Number(sharedLocation[3]) : undefined,
    locationName: sharedLocation?.[1],
    mediaUrl: message.mediaUrl,
    thumbnailUrl: message.thumbnailUrl,
    audioDuration: message.audioDuration,
    mediaSize: Number(message.mediaSize || message.fileSize || 0),
    fileName: album ? album.fileName : message.fileName,
    // Only set when the server's record says so: a plain history reload must not
    // overwrite the id this device already holds for a message it sent itself.
    ...(album ? {mediaGroupId: album.mediaGroupId} : {}),
    fileType: message.fileType,
    waveform: message.waveform,
    isForwarded: message.isForwarded,
    forwardedFrom: entityId(message.forwardedFrom) || null,
    isPinned: Boolean(message.isPinned),
    pinnedAt: message.pinnedAt || null,
    replyTo: message.replyTo,
    replyPreview: message.replyPreview,
    // Echoed back on both the ACK and the room broadcast, so the optimistic
    // bubble can be matched to the stored message instead of duplicated.
    tempId: message.tempId ? String(message.tempId) : null,
    chatId: entityId(message.chatId || message.groupId) || null,
    // Whichever end of the message is not us is the conversation's other party.
    contactId: (isOwn ? receiverId : senderId) || null,
    systemEvent,
    senderId: senderId || null,
    senderName: typeof message.sender === 'object' ? String(message.sender?.name || '') : undefined,
    senderThumbnail: typeof message.sender === 'object' ? (message.sender?.profilePic || null) : null,
    senderRole: message.senderRole || message.role,
    systemEventType: disappearingTimer ? 'disappearing_timer' : undefined,
    disappearingTimer: disappearingTimer || undefined,
  };
}

async function fetchMessageRecords(chatId: string): Promise<MessageRecord[]> {
  const response = await apiRequest(`${API_BASE_URL}/chats/messages/${encodeURIComponent(chatId)}`, {
    method: 'GET',
    headers: authenticatedHeaders(),
  });
  const payload = await response.json();
  const records = payload?.data || payload?.messages || [];
  return Array.isArray(records) ? records : [];
}

/**
 * Fills in what `GET /chats/list` leaves out.
 *
 * That endpoint is a raw aggregation: it matches on `participants.user` and
 * counts unread messages, but never `$lookup`s the participant or the last
 * message. Both therefore come back as bare ObjectId strings, so a list built
 * from it alone shows "Chatterly user" on every row with no preview and no
 * ticks.
 *
 * The messages endpoint *does* populate `sender` and `receiver`, so the missing
 * identity and preview are read from a chat's newest message - the same
 * work-around the web client uses. Only rows that actually need it are fetched,
 * and a failure leaves that row as-is rather than failing the whole list.
 */
const NO_ANSWER_CALL_STATUSES = new Set(['not_answered', 'notanswered', 'no_answer', 'noanswer', 'unanswered', 'timeout', 'timed_out']);

function comparableCallStatus(status?: string | null): string {
  return String(status || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

export function countOutgoingMissedCopies(records: MessageRecord[], userId: string): number {
  // The socket service stores a receiver-specific missed copy with reversed
  // endpoints. Do not count that copy as incoming activity for the caller.
  const outgoing = records.filter(record => record.messageType === 'call' &&
    NO_ANSWER_CALL_STATUSES.has(comparableCallStatus(record.callStatus)) &&
    entityId(record.senderId || record.sender) === userId);
  const used = new Set<MessageRecord>();
  return records.filter(record => {
    if (record.messageType !== 'call' || comparableCallStatus(record.callStatus) !== 'missed' ||
        entityId(record.receiver) !== userId || String(record.status || '').toLowerCase() === 'read' || record.isDeleted) return false;
    const match = outgoing.find(candidate => !used.has(candidate) &&
      entityId(candidate.receiver) === entityId(record.senderId || record.sender) &&
      (record.callId && candidate.callId
        ? entityId(record.callId) === entityId(candidate.callId)
        : Math.abs(Date.parse(record.createdAt || '') - Date.parse(candidate.createdAt || '')) < 5000));
    if (!match) return false;
    used.add(match);
    return true;
  }).length;
}

export async function enrichChatList(chats: ChatListItem[]): Promise<ChatListItem[]> {
  const currentUserId = getSession()?.user?.id || '';
  const needsDetail = (chat: ChatListItem) =>
    chat.contact.name === UNKNOWN_CONTACT_NAME || !chat.lastMessage ||
    (chat.contact.kind !== 'group' && chat.unreadCount > 0);

  const details = await Promise.all(chats.map(async chat => {
    if (!needsDetail(chat)) { return null; }
    try {
      if (chat.contact.kind === 'group') {
        const newest = (await getGroupMessages(chat.id))
          .slice()
          .sort((first, second) => Date.parse(second.createdAt) - Date.parse(first.createdAt))[0];
        return newest ? {chatId: chat.id, contact: chat.contact, message: newest} : null;
      }
      const records = await fetchMessageRecords(chat.id);
      // The endpoint sorts newest first, but sorting here keeps this correct
      // if that ever changes.
      const newest = records
        .slice()
        .sort((first, second) => Date.parse(String(second.createdAt || 0)) - Date.parse(String(first.createdAt || 0)))[0];
      if (!newest) { return null; }

      const senderIsMe = entityId(newest.senderId || newest.sender) === currentUserId;
      const other = senderIsMe ? newest.receiver : (newest.senderId || newest.sender);
      return {chatId: chat.id, contact: userFromReference(other), message: normalizeMessage(newest), outgoingMissedCopies: countOutgoingMissedCopies(records, currentUserId)};
    } catch {
      return null;
    }
  }));

  const byChatId = new Map(details.filter(Boolean).map(detail => [detail!.chatId, detail!]));

  return chats.map(chat => {
    const detail = byChatId.get(chat.id);
    if (!detail) { return chat; }
    return {
      ...chat,
      unreadCount: Math.max(0, chat.unreadCount - ('outgoingMissedCopies' in detail ? Number(detail.outgoingMissedCopies || 0) : 0)),
      contact: {
        ...chat.contact,
        // Keep the id from the list: it is the one field the aggregation gets
        // right, and the message lookup can be missing on an empty chat.
        name: detail.contact.name !== UNKNOWN_CONTACT_NAME ? detail.contact.name : chat.contact.name,
        thumbnail: detail.contact.thumbnail || chat.contact.thumbnail || null,
      },
      lastMessage: chat.lastMessage || messagePreview(detail.message),
      lastMessageAt: chat.lastMessageAt || detail.message.createdAt,
      lastMessageId: chat.lastMessageId || detail.message.id,
      lastMessageIsOwn: chat.lastMessage ? chat.lastMessageIsOwn : detail.message.isOwn,
      lastMessageStatus: chat.lastMessageStatus || detail.message.status || '',
    };
  });
}

export async function getChatMessages(chatId: string): Promise<ChatMessage[]> {
  const records = await fetchMessageRecords(chatId);
  if (!Array.isArray(records)) { return []; }
  return collapseMirroredMissedCallLogs(records
    .map(message => normalizeMessage(message))
    .sort((first, second) => Date.parse(first.createdAt) - Date.parse(second.createdAt)));
}

function missedCallType(message: ChatMessage): 'audio' | 'video' {
  return /\bvideo\b/i.test(message.text) ? 'video' : 'audio';
}

function isMirroredMissedCallPair(first: ChatMessage, second: ChatMessage): boolean {
  if (first.messageType !== 'call' || second.messageType !== 'call' || first.isOwn === second.isOwn) return false;

  const firstStatus = comparableCallStatus(first.callStatus);
  const secondStatus = comparableCallStatus(second.callStatus);
  const complementaryStatuses = (firstStatus === 'missed' && NO_ANSWER_CALL_STATUSES.has(secondStatus)) ||
    (secondStatus === 'missed' && NO_ANSWER_CALL_STATUSES.has(firstStatus));
  if (!complementaryStatuses || missedCallType(first) !== missedCallType(second)) return false;
  if (first.contactId && second.contactId && first.contactId !== second.contactId) return false;

  if (first.callId && second.callId) return first.callId === second.callId;
  const firstTime = Date.parse(first.createdAt);
  const secondTime = Date.parse(second.createdAt);
  return Number.isFinite(firstTime) && Number.isFinite(secondTime) && Math.abs(firstTime - secondTime) < 5000;
}

/**
 * A one-to-one timeout is persisted twice by the call service: the caller's
 * `not_answered` row and a receiver-specific `missed` row with reversed
 * endpoints. The messages endpoint returns both rows to both participants,
 * even though the live socket correctly sends just the participant's copy.
 * Keep the viewer-specific (own) row so a single unanswered attempt renders
 * as one timeline event without hiding independent missed calls.
 */
export function collapseMirroredMissedCallLogs(messages: ChatMessage[]): ChatMessage[] {
  const collapsed: ChatMessage[] = [];
  messages.forEach(message => {
    const duplicateIndex = collapsed.findIndex(candidate => isMirroredMissedCallPair(candidate, message));
    if (duplicateIndex < 0) {
      collapsed.push(message);
      return;
    }
    if (message.isOwn && !collapsed[duplicateIndex].isOwn) {
      // The input is chronological, so replacing at the later row's position
      // preserves ordering if another message arrived between the two writes.
      collapsed.splice(duplicateIndex, 1);
      collapsed.push(message);
    }
  });
  return collapsed;
}

export async function getGroupMessages(groupId: string): Promise<ChatMessage[]> {
  const response = await apiRequest(`${API_BASE_URL}/group/messages/${encodeURIComponent(groupId)}`, {method: 'GET', headers: authenticatedHeaders()});
  const payload = await response.json();
  const records = payload?.data || payload?.messages || [];
  if (!Array.isArray(records)) return [];
  let members: any[] = [];
  try {
    const detailsResponse = await apiRequest(`${API_BASE_URL}/group/${encodeURIComponent(groupId)}`, {method: 'GET', headers: authenticatedHeaders()});
    const detailsPayload = await detailsResponse.json();
    members = detailsPayload?.data?.participants || [];
  } catch { /* Messages remain usable if metadata refresh is unavailable. */ }
  return records.map(message => {
    const normalized = normalizeMessage(message);
    const membership = members.find(entry => entityId(entry?.user || entry) === normalized.senderId);
    const user = membership?.user || membership;
    return membership ? {...normalized, senderName: user?.name || normalized.senderName, senderThumbnail: user?.profilePic || normalized.senderThumbnail, senderRole: membership?.role || 'member'} : normalized;
  }).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

/**
 * The REST fallback for a send. The socket route is the primary one because it
 * is the only path that broadcasts to the receiver in real time and answers
 * with the delivery ACK; this exists for when the socket is unreachable, so the
 * message is at least persisted and shows up for both sides on next load.
 */
export async function sendChatMessage(receiverId: string, text: string, replyTo?: string): Promise<ChatMessage> {
  const response = await apiRequest(`${API_BASE_URL}/chats/send`, {
    method: 'POST',
    headers: authenticatedHeaders(),
    body: JSON.stringify({receiverId, encryptedContent: text.trim(), ...(replyTo ? {replyTo} : {})}),
  });
  const payload = await response.json();
  const message = (payload?.data || payload?.messageData || payload?.sentMessage || {}) as MessageRecord;
  return normalizeMessage(message, true);
}

export async function markChatRead(chatId: string): Promise<void> {
  await apiRequest(`${API_BASE_URL}/chats/mark-read`, {
    method: 'POST', headers: authenticatedHeaders(), body: JSON.stringify({chatId}),
  });
}

export async function deleteMessage(messageId: string, forEveryone = false): Promise<void> {
  // Mounted under /api/chats, so the path is /api/chats/message/delete/... -
  // not /api/message/delete/..., which 404s.
  await apiRequest(`${API_BASE_URL}/chats/message/delete/${forEveryone ? 'everyone' : 'me'}`, {
    method: 'POST', headers: authenticatedHeaders(), body: JSON.stringify({messageId}),
  });
}

export async function forwardMessage(originalMessageId: string, receiverId: string): Promise<ChatMessage> {
  const response = await apiRequest(`${API_BASE_URL}/chats/forward`, {
    method: 'POST', headers: authenticatedHeaders(), body: JSON.stringify({originalMessageId, receiverId}),
  });
  const payload = await response.json();
  // The forward endpoint may omit the populated receiver from its response.
  // Keep the destination supplied to the request so an open thread can match
  // and render the persisted message immediately without reloading history.
  return {...normalizeMessage(payload?.data || {}, true), contactId: receiverId};
}

export async function forwardMessages(originalMessageIds: string[], receiverIds: string[]): Promise<ChatMessage[]> {
  const delivered: ChatMessage[] = [];
  // Keep message order stable within every destination. Destinations can be
  // processed together without changing the order recipients see.
  await Promise.all(receiverIds.map(async receiverId => {
    for (const messageId of originalMessageIds) {
      delivered.push(await forwardMessage(messageId, receiverId));
    }
  }));
  return delivered;
}

async function messageAction(path: '/chats/pin' | '/chats/unpin', messageId: string): Promise<void> {
  await apiRequest(`${API_BASE_URL}${path}`, {
    method: 'POST', headers: authenticatedHeaders(), body: JSON.stringify({messageId}),
  });
}

export const pinMessage = (messageId: string) => messageAction('/chats/pin', messageId);
export const unpinMessage = (messageId: string) => messageAction('/chats/unpin', messageId);

export type MediaUpload = {uri: string; name: string; type: string};

// The documented endpoint accepts large video/audio payloads. Two minutes is
// shorter than a legitimate mobile upload can take, especially when Expo Go
// sends the original video, so retain a bounded but practical timeout.
const MEDIA_UPLOAD_TIMEOUT_MS = 15 * 60 * 1000;

/**
 * React Native's native XMLHttpRequest upload path is more reliable for files
 * selected from Android's content providers than the generic fetch wrapper.
 * In particular, it does not replay a consumed FormData body through the JSON
 * client's development fallbacks. Content-Type is intentionally omitted so
 * Android supplies the multipart boundary required by multer.
 */
function uploadForm(
  path: '/chats/send-media' | '/chats/send-file',
  form: FormData,
  token: string,
  onProgress?: (progress: number) => void,
  onUploadComplete?: () => void,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    const recordSent = createUsageTransfer('sent');
    request.open('POST', `${API_BASE_URL}${path}`);
    request.timeout = MEDIA_UPLOAD_TIMEOUT_MS;
    request.setRequestHeader('Accept', 'application/json');
    if (token) { request.setRequestHeader('Authorization', `Bearer ${token}`); }

    if (request.upload) {
      request.upload.onprogress = event => {
        recordSent(event.loaded);
        if (event.lengthComputable && event.total > 0) {
          onProgress?.(Math.max(0, Math.min(1, event.loaded / event.total)));
        }
      };
    }
    if (request.upload && onUploadComplete) {
      // The bytes have left the device. The request can now remain pending
      // while the authenticated backend secures the object in cloud storage
      // and creates the delivered message record.
      request.upload.onload = onUploadComplete;
    }

    request.onerror = () => reject(new Error('Attachment upload could not reach Chatterly. Please check your connection and try again.'));
    request.ontimeout = () => reject(new Error('Attachment upload took too long. Please try again.'));
    request.onload = () => {
      let payload: any = {};
      try { payload = request.responseText ? JSON.parse(request.responseText) : {}; } catch { /* The server returned non-JSON text. */ }
      if (request.status < 200 || request.status >= 300) {
        handleApiResponseStatus(request.status);
        reject(new Error(String(payload?.message || payload?.error || `Attachment upload failed (${request.status}).`)));
        return;
      }
      onProgress?.(1);
      recordSent(Number(payload?.data?.mediaSize || payload?.data?.fileSize || 0));
      resolve(payload);
    };
    request.send(form);
  });
}

export async function sendChatMedia(
  receiverId: string,
  media: MediaUpload,
  options: {caption?: string; duration?: number; waveform?: number[]; onUploadProgress?: (progress: number) => void; onUploadComplete?: () => void} = {},
): Promise<ChatMessage> {
  const token = getToken();
  const form = new FormData();
  form.append('receiverId', receiverId);
  if (options.caption) { form.append('caption', options.caption); }
  if (options.duration !== undefined) { form.append('duration', String(options.duration)); }
  if (options.waveform) { form.append('waveform', JSON.stringify(options.waveform)); }
  form.append('media', media as unknown as Blob);
  const payload = await uploadForm('/chats/send-media', form, token, options.onUploadProgress, options.onUploadComplete) as any;
  return normalizeMessage(payload?.data || {}, true);
}

export async function sendChatFile(
  receiverId: string,
  file: MediaUpload,
  options: {onUploadProgress?: (progress: number) => void} = {},
): Promise<ChatMessage> {
  const token = getToken();
  const form = new FormData();
  form.append('receiverId', receiverId);
  form.append('file', file as unknown as Blob);
  const payload = await uploadForm('/chats/send-file', form, token, options.onUploadProgress) as any;
  const normalized = normalizeMessage(payload?.data || {}, true);
  // The endpoint chosen by the caller is definitive even when an older backend
  // response uses the media discriminator. Preserve response fields, but never
  // let a document sent via /send-file render as an image on the sending device.
  return {
    ...normalized,
    messageType: 'file',
    fileName: normalized.fileName || file.name,
    fileType: normalized.fileType || file.type,
  };
}

export async function getChatFiles(chatId: string): Promise<ChatMessage[]> {
  const response = await apiRequest(`${API_BASE_URL}/chats/files/${encodeURIComponent(chatId)}`, {
    method: 'GET', headers: authenticatedHeaders(),
  });
  const payload = await response.json();
  const records = payload?.data || payload?.files || [];
  if (!Array.isArray(records)) return [];
  return records
    .map(record => normalizeMessage(record as MessageRecord))
    .sort((first, second) => Date.parse(second.createdAt) - Date.parse(first.createdAt));
}

export async function getChatProfile(userId: string): Promise<ChatProfile> {
  const [response, registered] = await Promise.all([
    apiRequest(`${API_BASE_URL}/chats/profile/${encodeURIComponent(userId)}`, {
      method: 'GET', headers: authenticatedHeaders(),
    }),
    // The profile view selects name, photo, status and last seen only - never
    // the phone number - so the number comes from the registered-user lookup,
    // fetched alongside rather than after it. It is best-effort: a profile
    // without a number still opens.
    getRegisteredUser(userId).catch(() => null),
  ]);
  const payload = await response.json();
  const profile = payload?.data || payload?.user || {};
  return {
    userId: String(profile?._id || profile?.id || userId),
    name: String(profile?.name || profile?.fullName || 'Chatterly user'),
    profilePic: profile?.profilePic || profile?.avatar || null,
    status: String(profile?.status || (profile?.online ? 'Online' : 'Offline')),
    lastSeen: profile?.lastSeen || null,
    online: Boolean(profile?.online || profile?.status === 'online'),
    phone: profile?.phone || profile?.phoneNumber || registered?.phone || undefined,
  };
}

export async function getSharedMedia(userId: string): Promise<ChatMessage[]> {
  const response = await apiRequest(`${API_BASE_URL}/chats/profile/${encodeURIComponent(userId)}/media`, {
    method: 'GET', headers: authenticatedHeaders(),
  });
  const payload = await response.json();
  const records = payload?.data || payload?.media || [];
  if (!Array.isArray(records)) return [];
  return records.map(record => normalizeMessage(record as MessageRecord));
}

export async function getSharedLinks(userId: string): Promise<SharedLink[]> {
  const response = await apiRequest(`${API_BASE_URL}/chats/profile/${encodeURIComponent(userId)}/link`, {
    method: 'GET', headers: authenticatedHeaders(),
  });
  const payload = await response.json();
  const records = payload?.data || payload?.links || [];
  if (!Array.isArray(records)) return [];
  return records.map((record, index) => ({
    id: String(record?._id || record?.id || `${record?.url || 'link'}-${record?.createdAt || index}`),
    url: String(record?.url || ''),
    senderId: entityId(record?.sender),
    createdAt: String(record?.createdAt || new Date().toISOString()),
  })).filter(link => /^https?:\/\//i.test(link.url));
}

export async function getPinnedMessages(chatId: string): Promise<ChatMessage[]> {
  const response = await apiRequest(`${API_BASE_URL}/chats/pinned/${encodeURIComponent(chatId)}`, {
    method: 'GET', headers: authenticatedHeaders(),
  });
  const payload = await response.json();
  const records = payload?.data || payload?.messages || [];
  return Array.isArray(records) ? records.map(record => normalizeMessage(record as MessageRecord)) : [];
}

export async function reportChatUser(reportedUserId: string, reason = 'Spam', description = 'Reported from chat profile'): Promise<string> {
  const reporterId = String(getSession()?.user?.id || '');
  const response = await apiRequest(`${API_BASE_URL}/report/report-user`, {
    method: 'POST', headers: authenticatedHeaders(), body: JSON.stringify({reporterId, reportedUserId, reason, description}),
  });
  const payload = await response.json();
  return String(payload?.message || 'Report submitted successfully.');
}

export async function blockChatUser(blockedUserId: string): Promise<string> {
  const response = await apiRequest(`${API_BASE_URL}/block/blocked`, {
    method: 'POST', headers: authenticatedHeaders(), body: JSON.stringify({blockedUserId}),
  });
  const payload = await response.json();
  return String(payload?.message || 'User blocked successfully.');
}

export async function getMediaDownloadUrl(messageId: string): Promise<string> {
  const response = await apiRequest(`${API_BASE_URL}/chats/download/${encodeURIComponent(messageId)}`, {
    method: 'GET', headers: authenticatedHeaders(),
  }, {timeoutMs: 5000, allowDevelopmentFallback: false});
  const payload = await response.json();
  const url = String(payload?.downloadUrl || payload?.data?.downloadUrl || '');
  if (!url) { throw new Error('The server did not provide a download link.'); }
  return url;
}

export async function startCall(receiverId: string, type: 'audio' | 'video'): Promise<{message: string; callId: string; status: string}> {
  const response = await apiRequest(`${API_BASE_URL}/calls/start`, {
    method: 'POST', headers: authenticatedHeaders(), body: JSON.stringify({receiverId, type}),
  });
  const payload = await response.json();
  const call = payload?.data?.call || payload?.call || {};
  return {message: String(payload?.message || 'Call started.'), callId: String(call?._id || call?.id || ''), status: String(call?.status || 'calling')};
}

/** Server-authoritative status also recovers terminal events missed while offline. */
export async function getCallStatus(callId: string): Promise<string> {
  const response = await apiRequest(`${API_BASE_URL}/call/details/${encodeURIComponent(callId)}?type=personal`, {
    method: 'GET', headers: authenticatedHeaders(),
  });
  const payload = await response.json();
  if (payload?.success === false || !payload?.data?.status) {
    throw new Error(payload?.message || 'Unable to retrieve call status.');
  }
  return String(payload.data.status);
}
