import type {DisappearingMessageDuration} from '../services/privacyApi';

export type ConversationContact = {
  userId: string;
  name: string;
  phone?: string;
  thumbnail?: string | null;
  status?: string;
  lastSeen?: string | null;
  kind?: 'contact' | 'group' | 'broadcast';
};

export type ForwardDestination = {
  id: string;
  chatId?: string;
  name: string;
  thumbnail?: string | null;
  subtitle?: string;
  kind: 'contact' | 'group';
  recent?: boolean;
};

export type ChatListItem = {
  id: string;
  contact: ConversationContact;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
  /** User-created unread marker, independent of unread messages from the server. */
  markedUnread: boolean;
  archived: boolean;
  /** Server-persisted pin state for this authenticated user's inbox. */
  pinned?: boolean;
  /** Whose message the preview belongs to - only our own row shows ticks. */
  lastMessageIsOwn: boolean;
  /** Status of the preview message, driving the ticks on the row. */
  lastMessageStatus: string;
  /** Id of the preview message, so live receipts can update the row's ticks. */
  lastMessageId: string;
};

export type ChatMessage = {
  id: string;
  text: string;
  createdAt: string;
  isOwn: boolean;
  /** The server removed the message for every participant. */
  isDeleted?: boolean;
  /** This authenticated user deleted only their local view of the message. */
  deletedForMe?: boolean;
  status?: string;
  messageType?: 'text' | 'image' | 'video' | 'audio' | 'file' | 'location' | 'call';
  /** On a call log: the call the line belongs to, used to rejoin a live one. */
  callId?: string | null;
  /** On a call log: `started`, `ended`, `missed`, `rejected`, `not_answered`… */
  callStatus?: string | null;
  mediaUrl?: string;
  thumbnailUrl?: string;
  audioDuration?: number;
  mediaSize?: number;
  fileName?: string;
  fileType?: string;
  waveform?: number[];
  latitude?: number;
  longitude?: number;
  locationName?: string;
  isForwarded?: boolean;
  forwardedFrom?: string | null;
  isPinned?: boolean;
  pinnedAt?: string | null;
  /** Most recent visible reaction, synchronized through the chat's reaction event. */
  myReaction?: string | null;
  replyTo?: string | null;
  replyPreview?: {
    content?: string;
    messageType?: string;
    createdAt?: string;
    mediaUrl?: string;
  } | null;
  /**
   * The client-generated id carried on the send. The server stores it under a
   * unique index, which is what makes a retry idempotent, and echoes it back on
   * both the ACK and the broadcast so an optimistic bubble can be reconciled
   * with the persisted message rather than duplicated beside it.
   */
  tempId?: string | null;
  /** Device-local marker for a message waiting for network restoration. */
  queued?: boolean;
  /** Which conversation the message belongs to, used to route socket events. */
  chatId?: string | null;
  /** The other party, needed when a socket event arrives with no chat open. */
  contactId?: string | null;
  /** Device-side batch identifier used to render one multi-select send as an album card. */
  mediaGroupId?: string | null;
  /** Membership and role activity rendered as a centered group timeline notice. */
  systemEvent?: boolean;
  systemEventType?: 'disappearing_timer';
  disappearingTimer?: DisappearingMessageDuration;
  senderId?: string | null;
  senderName?: string;
  senderRole?: 'superadmin' | 'admin' | 'moderator' | 'member';
  senderThumbnail?: string | null;
};

export type ChatProfile = {
  userId: string;
  name: string;
  profilePic?: string | null;
  status: string;
  lastSeen?: string | null;
  online: boolean;
  phone?: string;
};

export type SharedLink = {
  id: string;
  url: string;
  senderId?: string;
  createdAt: string;
};
