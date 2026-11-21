import { PROFILE_DOB_CACHE_STORAGE_KEY, preserveStoredProfileDateOfBirth } from './profile';

const LOGOUT_STORAGE_KEYS = new Set([
  'token',
  'userToken',
  'user',
  'contactsPermissionGranted',
  'chat_message_reactions_persistent_v1',
]);

const PRESERVED_LOGOUT_STORAGE_KEYS = new Set([
  // Account-specific DOB is frontend-owned on current deployments and must
  // survive logout. This record contains dates and account IDs only.
  PROFILE_DOB_CACHE_STORAGE_KEY,
  'chatterly_auto_download_media_preferences',
  // Keep the last theme through the signed-out screens and use it as an
  // immediate fallback until the account preference is hydrated after login.
  'chatterly_theme_preference',
  // Identifies the browser, not the account. The backend stores trusted devices
  // per (user, deviceId), so wiping this on logout would silently void every
  // "trust this device" the user ever ticked at the 2FA challenge.
  'chatterly_device_id',
]);

const shouldClearStorageKey = (key = '') =>
  !PRESERVED_LOGOUT_STORAGE_KEYS.has(key) &&
  // Favorites are durable account data, not session cache. Preserve only
  // account-scoped records so another login cannot inherit anonymous stars.
  !/^chatterly_personal_group_favorites:[^:]+:[^:]+$/.test(key) &&
  !(/^chatterly_starred_media_v1:[^:]+$/.test(key) && key !== 'chatterly_starred_media_v1:anonymous') &&
  (LOGOUT_STORAGE_KEYS.has(key) ||
    String(key).startsWith('chatterly') ||
    String(key).startsWith('firebase:authUser:'));

const clearStorageEntries = (storage) => {
  if (!storage) {
    return;
  }

  try {
    Array.from({ length: storage.length }, (_, index) => storage.key(index))
      .filter(Boolean)
      .filter(shouldClearStorageKey)
      .forEach((key) => storage.removeItem(key));
  } catch (error) {
    console.error('Unable to clear stored logout cache:', error);
  }
};

const clearCacheStorage = async () => {
  if (typeof caches === 'undefined') {
    return;
  }

  try {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
  } catch (error) {
    console.error('Unable to clear browser caches during logout:', error);
  }
};

const clearIndexedDbDatabases = async () => {
  if (typeof indexedDB === 'undefined' || typeof indexedDB.databases !== 'function') {
    return;
  }

  try {
    const databases = await indexedDB.databases();
    await Promise.all(
      databases
        .map((database) => database?.name)
        .filter(Boolean)
        .map(
          (databaseName) =>
            new Promise((resolve) => {
              const request = indexedDB.deleteDatabase(databaseName);
              request.onsuccess = resolve;
              request.onerror = resolve;
              request.onblocked = resolve;
            })
        )
    );
  } catch (error) {
    console.error('Unable to clear IndexedDB during logout:', error);
  }
};

export const clearLogoutCache = async () => {
  if (typeof localStorage !== 'undefined') {
    try {
      preserveStoredProfileDateOfBirth();
    } catch (error) {
      console.error('Unable to preserve date of birth during logout:', error);
    }
    clearStorageEntries(localStorage);
  }

  if (typeof sessionStorage !== 'undefined') {
    clearStorageEntries(sessionStorage);
  }

  await Promise.all([
    clearCacheStorage(),
    clearIndexedDbDatabases(),
  ]);
};
