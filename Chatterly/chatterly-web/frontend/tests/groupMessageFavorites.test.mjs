import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { applyPersonalGroupFavorites, readPersonalGroupFavorites, setPersonalGroupFavorite } from '../src/utils/groupMessageFavorites.js';
import { buildPinnedMessagePatch } from '../src/utils/message.js';

const createStorage = () => {
  const data = new Map();
  return { getItem: (key) => data.get(key) || null, setItem: (key, value) => data.set(key, value) };
};
const message = (overrides = {}) => ({
  id: 'abcdef123456abcdef123456', chatId: 'group-1', groupId: 'group-1', senderId: 'alice',
  content: 'Important message', type: 'text', timestamp: new Date().toISOString(), ...overrides,
});

test('favorites persist separately for each user and group in the same browser', () => {
  const storage = createStorage();
  setPersonalGroupFavorite('alice', 'group-1', message(), true, storage);
  assert.equal(readPersonalGroupFavorites('alice', 'group-1', storage)[0].content, 'Important message');
  assert.equal(readPersonalGroupFavorites('bob', 'group-1', storage).length, 0);
  assert.equal(readPersonalGroupFavorites('alice', 'group-2', storage).length, 0);
  assert.equal(readPersonalGroupFavorites('', 'group-1', storage).length, 0);
});

test('shared pins from server history, cache or sockets never become personal favorites', () => {
  const shared = message({ isPinned: true, pinnedBy: 'alice', pinnedAt: new Date().toISOString() });
  const projected = applyPersonalGroupFavorites([shared], []);
  assert.equal(projected[0].isPinned, false);
  assert.equal(projected[0].pinnedAt, null);
  assert.equal(shared.isPinned, true, 'Projection must not mutate server data');
});

test('one user can unfavorite without affecting another and stale shared pins stay hidden', () => {
  const storage = createStorage();
  for (const user of ['alice', 'bob']) setPersonalGroupFavorite(user, 'group-1', message(), true, storage);
  setPersonalGroupFavorite('alice', 'group-1', message(), false, storage);
  assert.equal(readPersonalGroupFavorites('alice', 'group-1', storage).length, 0);
  assert.equal(readPersonalGroupFavorites('bob', 'group-1', storage).length, 1);
  assert.equal(applyPersonalGroupFavorites([message({ isPinned: true })], readPersonalGroupFavorites('alice', 'group-1', storage))[0].isPinned, false);
});

test('favorites match server/client aliases, retain edits, and do not duplicate', () => {
  const storage = createStorage();
  setPersonalGroupFavorite('alice', 'group-1', message({ clientMessageId: 'temp-1' }), true, storage);
  setPersonalGroupFavorite('alice', 'group-1', message({ id: 'temp-1', clientMessageId: 'temp-1' }), true, storage);
  const favorites = readPersonalGroupFavorites('alice', 'group-1', storage);
  assert.equal(favorites.length, 1);
  const projected = applyPersonalGroupFavorites([message({ clientMessageId: 'temp-1', content: 'Edited message' })], favorites);
  assert.equal(projected[0].isPinned, true);
  assert.equal(projected[0].content, 'Edited message');
});

test('deleted and expired messages cannot be restored as favorites', () => {
  const storage = createStorage();
  for (const overrides of [{ isDeleted: true }, { isHiddenForMe: true }, { expiresAt: '2000-01-01T00:00:00Z' }]) {
    setPersonalGroupFavorite('alice', 'group-1', message(overrides), true, storage);
    assert.equal(readPersonalGroupFavorites('alice', 'group-1', storage).length, 0);
    assert.equal(applyPersonalGroupFavorites([message(overrides)], [message({ isPinned: true })])[0].isPinned, false);
  }
});

test('storage failures are reported instead of silently losing favorites', () => {
  assert.throws(() => setPersonalGroupFavorite('alice', 'group-1', message(), true, {
    getItem: () => null, setItem: () => { throw new Error('Storage full'); },
  }), /Storage full/);
});

test('the production group favorite handler saves privately without calling pin APIs or changing shared message state', () => {
  const source = readFileSync(new URL('../src/pages/ChatListPage.jsx', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
  const start = source.indexOf('  const applyPinnedStateToMessage = useCallback(');
  const end = source.indexOf('  const handleTogglePinMessage =', start);
  const storage = createStorage();
  let pins = {};
  const unexpected = () => assert.fail('Group favorites must not use shared message state or pin APIs');
  const toggle = runInNewContext(source.slice(start, end) + '\napplyPinnedStateToMessage;', {
    useCallback: (fn) => fn, activeMessages: [message()], chatId: 'group-1', currentUserId: 'alice',
    isGroupFavoritesThread: true,
    selectedContact: { chatId: 'group-1', isGroup: true },
    getSelectableMessageId: (item) => item.id,
    doesMessageMatchSelection: (item, id) => item.id === id,
    buildPinnedMessagePatch,
    isGroupThreadContact: () => true, isBroadcastThreadContact: () => false,
    getGroupThreadChatId: (contact) => contact.chatId,
    setPersonalGroupFavorite: (userId, groupId, item, favorite) => setPersonalGroupFavorite(userId, groupId, item, favorite, storage),
    setPinnedMessagesByChatId: (update) => { pins = update(pins); },
    syncSelectedMessagePinnedState() {},
    showChatActionToast: unexpected, syncPinnedMessagesForChat: unexpected,
    updateCurrentChatMessage: unexpected, pinMessageRequest: unexpected, unpinMessageRequest: unexpected,
  });
  toggle(message(), true);
  assert.equal(pins['group-1'].length, 1);
  assert.equal(readPersonalGroupFavorites('bob', 'group-1', storage).length, 0);
  toggle(message(), false);
  assert.equal(pins['group-1'].length, 0);
});

test('group chats hide saved favorite notices while keeping other notices and direct/broadcast pin notices', () => {
  const source = readFileSync(new URL('../src/pages/ChatListPage.jsx', import.meta.url), 'utf8');
  const start = source.indexOf('  const isGroupFavoritesThread =');
  const modeEnd = source.indexOf('  const activeMessages =', start);
  const noticesStart = source.indexOf('  const activeStoredChatPinNotices =');
  const end = source.indexOf('  const activeChatPinNotices =', noticesStart);
  for (const thread of [{ isGroup: true }, { isBroadcast: true }, {}]) {
    const notices = runInNewContext(source.slice(start, modeEnd) + source.slice(noticesStart, end) + '\nactiveStoredChatPinNotices;', {
      activeGroupThread: thread, selectedContact: thread, chatId: 'group-1',
      isGroupsModule: Boolean(thread.isGroup), isBroadcastsModule: Boolean(thread.isBroadcast),
      isGroupThreadContact: (contact) => Boolean(contact?.isGroup || contact?.isBroadcast),
      isBroadcastThreadContact: (contact) => Boolean(contact?.isBroadcast),
      chatPinNotices: [
        { chatId: 'group-1', kind: 'message-pinned' },
        { chatId: 'group-1', kind: 'message-unpinned' },
        { chatId: 'group-1', kind: 'member-added' },
        { chatId: 'other-chat', kind: 'member-added' },
      ],
    });
    assert.deepEqual(Array.from(notices, (notice) => notice.kind), thread.isGroup
      ? ['member-added'] : ['message-pinned', 'message-unpinned', 'member-added']);
  }
});

test('favoriting and unfavoriting a group message create no timeline notice or scroll action', () => {
  const source = readFileSync(new URL('../src/pages/ChatListPage.jsx', import.meta.url), 'utf8');
  const start = source.indexOf('  const showChatPinNotice = useCallback(');
  const end = source.indexOf('  const resolveCurrentUserDisplayName =', start);
  for (const isGroupFavoritesThread of [true, false]) {
    let notices = [];
    const notify = runInNewContext(source.slice(start, end) + '\nshowChatPinNotice;', {
      useCallback: (fn) => fn, chatId: 'group-1', selectedContact: {}, isGroupFavoritesThread,
      getPinnedContentLabels: () => ({ pinNoticeText: 'Pinned', unpinNoticeText: 'Unpinned' }),
      createMessageId: (prefix) => prefix,
      setChatPinNotices: (update) => { notices = update(notices); },
      shouldStickToBottomRef: {}, messagesEndRef: {},
      window: { requestAnimationFrame: () => assert.equal(isGroupFavoritesThread, false) },
    });
    notify(true);
    notify(false);
    assert.equal(notices.length, isGroupFavoritesThread ? 0 : 2);
  }
});
