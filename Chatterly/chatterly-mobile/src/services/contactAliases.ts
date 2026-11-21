import AsyncStorage from '@react-native-async-storage/async-storage';
import {useEffect, useSyncExternalStore} from 'react';
import {getSession} from './sessionStore';

// The name a user saved for a contact with Edit Contact. Chatterly has no
// contact-book API - contacts are the phone's address book matched to accounts
// by number - so the edit is written to the address book, and this keeps the
// chosen name for the app's own screens: one-to-one chat header, contact info
// and the chat list show what the user called the person, as an address book
// app would. Stored per signed-in account on this device.

const PREFIX = 'chatterly.contact-names.v1';

type Names = Readonly<Record<string, string>>;

let names: Names = {};
let loadedFor: string | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

const owner = () => String(getSession()?.user?.id || 'anonymous');
const storageKey = (account: string) => `${PREFIX}:${account}`;

function emit(next: Names): void {
  names = next;
  listeners.forEach(listener => listener());
}

/** Reads this account's saved names once per account. */
export function loadContactAliases(): Promise<void> {
  const account = owner();
  if (loadedFor === account) { return Promise.resolve(); }
  if (loading) { return loading; }
  loading = (async () => {
    try {
      const stored = JSON.parse((await AsyncStorage.getItem(storageKey(account))) || '{}');
      const clean: Record<string, string> = {};
      if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
        Object.entries(stored).forEach(([userId, name]) => {
          if (typeof name === 'string' && name.trim()) { clean[userId] = name.trim(); }
        });
      }
      loadedFor = account;
      emit(clean);
    } catch {
      loadedFor = account;
      emit({});
    } finally {
      loading = null;
    }
  })();
  return loading;
}

export function getContactAlias(userId: string): string {
  return names[String(userId || '')] || '';
}

/** Saves (or, with an empty name, forgets) the name for one contact. */
export async function setContactAlias(userId: string, name: string): Promise<void> {
  const id = String(userId || '').trim();
  if (!id) { return; }
  await loadContactAliases();
  const next: Record<string, string> = {...names};
  const trimmed = name.trim();
  if (trimmed) { next[id] = trimmed; } else { delete next[id]; }
  emit(next);
  try {
    await AsyncStorage.setItem(storageKey(owner()), JSON.stringify(next));
  } catch {
    // The name still applies for this session.
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

const getSnapshot = () => names;

/** Every saved name for the signed-in account, kept current. */
export function useContactAliases(): Names {
  useEffect(() => { loadContactAliases().catch(() => undefined); }, []);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** The name to show for a one-to-one contact: the saved one, else the account's. */
export function useContactDisplayName(userId: string | undefined, fallback: string): string {
  const all = useContactAliases();
  return (userId && all[userId]) || fallback;
}
