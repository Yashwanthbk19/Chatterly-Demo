import {useSyncExternalStore} from 'react';
import type {ChatListItem} from '../types/chat';

// Sprint 3's push notification flow promises a badge count for unread messages.
// The app-icon badge only works on launchers that support a numeric badge, and
// is only written while the app is running, so the same number is kept here for
// the Chats tab: it shows on every tab bar, like the Calls tab's missed-call
// badge, whichever launcher the phone has.

type Listener = (count: number) => void;

let count = 0;
const listeners = new Set<Listener>();

/**
 * What the Chats tab counts: the unread messages across the inbox. A chat the
 * user marked as unread by hand has no unread message, so it shows its dot on
 * the row and adds nothing here.
 */
export function unreadMessageCount(chats: ReadonlyArray<Pick<ChatListItem, 'unreadCount'>>): number {
  return chats.reduce((sum, chat) => sum + Math.max(0, chat.unreadCount), 0);
}

/** Makes `next` the number the Chats tab shows. */
export function publishUnreadChatCount(next: number): void {
  const value = Math.max(0, Math.floor(Number.isFinite(next) ? next : 0));
  if (value === count) { return; }
  count = value;
  listeners.forEach(listener => listener(count));
}

/** The count as last published; 0 until the chat list has loaded. */
export function getUnreadChatCount(): number {
  return count;
}

/** Signing out must not carry one account's count onto the next. */
export function resetUnreadChatCount(): void {
  publishUnreadChatCount(0);
}

export function subscribeToUnreadChatCount(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useUnreadChatCount(): number {
  return useSyncExternalStore(subscribeToUnreadChatCount, getUnreadChatCount, getUnreadChatCount);
}
