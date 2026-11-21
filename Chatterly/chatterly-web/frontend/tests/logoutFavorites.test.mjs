import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { readPersonalGroupFavorites, setPersonalGroupFavorite } from '../src/utils/groupMessageFavorites.js';
import { getStarredMediaStorageKey, isMediaItemStarred, persistStoredStarredMedia, readStoredStarredMedia, setMediaItemStarred } from '../src/utils/starredMedia.js';

const createStorage = () => {
  const data = new Map();
  return {
    get length() { return data.size; },
    key: (index) => Array.from(data.keys())[index] ?? null,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  };
};

const logoutSource = readFileSync(new URL('../src/utils/logoutCache.js', import.meta.url), 'utf8')
  .replace(/^import[^\n]+\n/, '').replaceAll('export ', '');
const message = { id: 'message-1', content: 'Keep this message', senderId: 'alice', type: 'text', timestamp: new Date().toISOString() };

test('logout/login retains group favorites and direct/group starred items for their original account', async () => {
  const storage = createStorage();
  const sessionStorage = createStorage();
  const previousStorage = globalThis.localStorage;
  globalThis.localStorage = storage;
  try {
    storage.setItem('token', 'session-token');
    storage.setItem('user', JSON.stringify({ _id: 'alice' }));
    storage.setItem('chatterly_chat_messages', 'cached conversations');
    storage.setItem('chatterly_starred_media_v1:anonymous', '{"old-item":true}');
    sessionStorage.setItem('userToken', 'old-token');
    setPersonalGroupFavorite('alice', 'group-1', message, true, storage);
    const directItem = { id: 'direct-message', url: 'direct-image.jpg' };
    const groupItem = { id: 'group-message', url: 'group-image.jpg' };
    persistStoredStarredMedia(getStarredMediaStorageKey('alice'),
      setMediaItemStarred(setMediaItemStarred({}, directItem, true), groupItem, true));
    let cachesCleared = 0;
    const clearLogoutCache = runInNewContext(logoutSource + '\nclearLogoutCache;', {
      localStorage: storage, sessionStorage,
      PROFILE_DOB_CACHE_STORAGE_KEY: 'chatterly_profile_dates',
      preserveStoredProfileDateOfBirth() {},
      caches: { keys: async () => ['old-cache'], delete: async () => { cachesCleared++; } },
      console,
    });
    await clearLogoutCache();
    assert.equal(storage.getItem('token'), null);
    assert.equal(storage.getItem('user'), null);
    assert.equal(storage.getItem('chatterly_chat_messages'), null);
    assert.equal(storage.getItem('chatterly_starred_media_v1:anonymous'), null);
    assert.equal(sessionStorage.getItem('userToken'), null);
    assert.equal(cachesCleared, 1);

    // A fresh login reads persisted data, without any previous React state.
    storage.setItem('user', JSON.stringify({ _id: 'alice' }));
    assert.equal(readPersonalGroupFavorites('alice', 'group-1', storage)[0].content, message.content);
    const restoredStars = readStoredStarredMedia(getStarredMediaStorageKey('alice'));
    assert.equal(isMediaItemStarred(restoredStars, directItem), true);
    assert.equal(isMediaItemStarred(restoredStars, groupItem), true);
    assert.equal(readPersonalGroupFavorites('bob', 'group-1', storage).length, 0);
    assert.deepEqual(readStoredStarredMedia(getStarredMediaStorageKey('bob')), {});

    setPersonalGroupFavorite('alice', 'group-1', message, false, storage);
    persistStoredStarredMedia(getStarredMediaStorageKey('alice'), setMediaItemStarred(restoredStars, directItem, false));
    await clearLogoutCache();
    assert.equal(readPersonalGroupFavorites('alice', 'group-1', storage).length, 0);
    const afterSecondLogin = readStoredStarredMedia(getStarredMediaStorageKey('alice'));
    assert.equal(isMediaItemStarred(afterSecondLogin, directItem), false);
    assert.equal(isMediaItemStarred(afterSecondLogin, groupItem), true);
  } finally {
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
  }
});
