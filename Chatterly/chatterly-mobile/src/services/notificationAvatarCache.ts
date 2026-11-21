import AsyncStorage from '@react-native-async-storage/async-storage';

export const NOTIFICATION_AVATAR_CACHE_KEY = 'chatterly.notification-avatars.v1';

type AvatarContact = {
  userId?: string | null;
  name?: string | null;
  thumbnail?: string | null;
};

function nameKey(name: string): string {
  return `name:${name.trim().toLowerCase()}`;
}

/**
 * Android can receive the documented notification payload without sender data.
 * Keep a small durable index from the already-loaded chat list so the native
 * presenter can still resolve the person's photo while JavaScript is stopped.
 */
export async function cacheNotificationAvatars(contacts: AvatarContact[]): Promise<void> {
  if (!contacts.some(contact => contact.thumbnail && (contact.userId || contact.name))) return;
  let current: Record<string, string> = {};
  try {
    current = JSON.parse(await AsyncStorage.getItem(NOTIFICATION_AVATAR_CACHE_KEY) || '{}');
  } catch { /* A corrupt cache is safe to replace. */ }
  contacts.forEach(contact => {
    const url = String(contact.thumbnail || '').trim();
    if (!url) return;
    const id = String(contact.userId || '').trim();
    const name = String(contact.name || '').trim();
    if (id) current[`id:${id}`] = url;
    if (name) current[nameKey(name)] = url;
  });
  await AsyncStorage.setItem(NOTIFICATION_AVATAR_CACHE_KEY, JSON.stringify(current));
}
