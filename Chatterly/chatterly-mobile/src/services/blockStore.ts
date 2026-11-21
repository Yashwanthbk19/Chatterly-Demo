import { useSyncExternalStore } from 'react';
import { getToken } from './sessionStore';
import { getBlockedUsers, unblockUser, type BlockedUser } from './privacyApi';
import { blockChatUser } from './chatApi';

let owner = '';
let users: BlockedUser[] = [];
let revision = 0;
const listeners = new Set<() => void>();
function scope() {
  const token = getToken();
  if (owner !== token) {
    owner = token;
    users = [];
    revision++;
  }
  return token;
}
function emit() {
  revision++;
  listeners.forEach(listener => listener());
}
export function blockedSnapshot() {
  scope();
  return users;
}
export function isUserBlocked(id: string) {
  return blockedSnapshot().some(user => user.id === id);
}
export function useBlockedContacts() {
  return useSyncExternalStore(listener => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, blockedSnapshot);
}
export async function refreshBlockedContacts() {
  const token = scope();
  const version = revision;
  const records = await getBlockedUsers();
  if (scope() === token && version === revision) {
    users = records;
    emit();
  }
  return users;
}
export async function changeContactBlock(user: BlockedUser, blocked: boolean) {
  const token = scope();
  if (blocked) await blockChatUser(user.id);
  else await unblockUser(user.id);
  if (scope() !== token) return;
  users = blocked
    ? [...users.filter(item => item.id !== user.id), user]
    : users.filter(item => item.id !== user.id);
  emit();
}
