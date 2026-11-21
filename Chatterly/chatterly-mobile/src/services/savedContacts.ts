import AsyncStorage from '@react-native-async-storage/async-storage';
import {getSession} from './sessionStore';

export type SavedContact = {
  id: string;
  fullName?: string | null;
  givenName?: string | null;
  familyName?: string | null;
  phones?: Array<{number?: string | null}>;
  emails?: Array<{address?: string | null}>;
  thumbnail?: string | null;
};

const storageKey = () => `chatterly.saved-contacts.v1:${getSession()?.user?.id || 'anonymous'}`;

/** App-only contacts must survive leaving Contacts, even without address-book access. */
export async function loadSavedContacts(): Promise<SavedContact[]> {
  const stored = await AsyncStorage.getItem(storageKey());
  if (!stored) { return []; }
  try {
    const records: unknown = JSON.parse(stored);
    if (!Array.isArray(records)) { return []; }
    return records.filter((record): record is SavedContact =>
      Boolean(record && typeof record.id === 'string' && Array.isArray(record.phones) &&
        record.phones.some((phone: {number?: unknown} | null) => typeof phone?.number === 'string')),
    );
  } catch {
    return [];
  }
}

export async function saveLocalContact(contact: SavedContact): Promise<void> {
  const key = storageKey();
  const existing = await loadSavedContacts();
  await AsyncStorage.setItem(key, JSON.stringify([
    contact, ...existing.filter(record => record.id !== contact.id),
  ]));
}
