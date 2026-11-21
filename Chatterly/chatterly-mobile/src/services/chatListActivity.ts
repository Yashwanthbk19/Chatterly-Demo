import type {ChatListItem, ConversationContact} from '../types/chat';

export type ChatListActivity = {
  ownerId: string;
  chatId: string;
  contact: ConversationContact;
  preview: string;
  createdAt: string;
  messageId: string;
  status: string;
};

type Listener = (activity: ChatListActivity) => void;

const activities = new Map<string, ChatListActivity>();
const listeners = new Set<Listener>();

function keyOf(ownerId: string, chatId: string): string {
  return `${ownerId}:${chatId}`;
}

/**
 * Carries a confirmed send from an open conversation to list screens. The
 * backend remains authoritative; this only covers the short interval before
 * its asynchronous last-message update is visible through GET /chats/list.
 */
export function recordChatListActivity(activity: ChatListActivity): void {
  if (!activity.ownerId || !activity.chatId || !activity.contact.userId) return;
  const key = keyOf(activity.ownerId, activity.chatId);
  const current = activities.get(key);
  if (!current || Date.parse(activity.createdAt) >= Date.parse(current.createdAt)) {
    activities.set(key, activity);
  }
  listeners.forEach(listener => listener(activity));
}

export function getChatListActivities(ownerId: string): ChatListActivity[] {
  return [...activities.values()]
    .filter(activity => activity.ownerId === ownerId)
    .sort((first, second) => Date.parse(second.createdAt) - Date.parse(first.createdAt));
}

export function subscribeToChatListActivity(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function clearChatListActivity(ownerId: string, chatId: string): void {
  activities.delete(keyOf(ownerId, chatId));
}

export function mergeChatListActivities(
  rows: ChatListItem[],
  ownerId: string,
): ChatListItem[] {
  const merged = new Map(rows.map(row => [row.id, row]));
  getChatListActivities(ownerId).forEach(activity => {
    const current = merged.get(activity.chatId);
    const activityIsNewer = !current?.lastMessageAt ||
      Date.parse(activity.createdAt) >= Date.parse(current.lastMessageAt);
    merged.set(activity.chatId, {
      ...(current || {
        id: activity.chatId,
        unreadCount: 0,
        markedUnread: false,
        pinned: false,
      }),
      contact: current?.contact?.name && current.contact.name !== 'Chatterly user'
        ? current.contact
        : activity.contact,
      archived: false,
      lastMessage: activityIsNewer ? activity.preview : current?.lastMessage || '',
      lastMessageAt: activityIsNewer ? activity.createdAt : current?.lastMessageAt || '',
      lastMessageId: activityIsNewer ? activity.messageId : current?.lastMessageId || '',
      lastMessageIsOwn: activityIsNewer ? true : current?.lastMessageIsOwn || false,
      lastMessageStatus: activityIsNewer ? activity.status : current?.lastMessageStatus || '',
    });
  });
  return [...merged.values()].sort(
    (first, second) => Date.parse(second.lastMessageAt || '') - Date.parse(first.lastMessageAt || ''),
  );
}

export function clearChatListActivities(): void {
  activities.clear();
}
