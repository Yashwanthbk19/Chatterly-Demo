import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import * as messageUtils from '../src/utils/message.js';
import { applyPersonalGroupFavorites, readPersonalGroupFavorites, setPersonalGroupFavorite } from '../src/utils/groupMessageFavorites.js';

const source = readFileSync(new URL('../src/pages/ChatListPage.jsx', import.meta.url), 'utf8');
const section = (startMarker, endMarker) => {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `Missing production section: ${startMarker}`);
  return source.slice(start, end);
};
const favoriteModeStart = source.indexOf('  const isGroupFavoritesThread =');
const favoriteModeSource = source.slice(favoriteModeStart, source.indexOf('  const ', favoriteModeStart + 10));
const GROUP = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const group = { chatId: GROUP, isGroup: true };
const message = messageUtils.normalizeMessageData({
  id: 'bbbbbbbbbbbbbbbbbbbbbbbb', chatId: GROUP, groupId: GROUP,
  senderId: 'alice', content: 'Group message', timestamp: '2026-11-13T08:00:00Z',
  isPinned: true, pinnedBy: 'alice',
});
const data = new Map();
const storage = { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
test.beforeEach(() => data.clear());

const contextFor = (overrides = {}) => ({
  ...messageUtils,
  applyPersonalGroupFavorites,
  readPersonalGroupFavorites: (user, id) => readPersonalGroupFavorites(user, id, storage),
  setPersonalGroupFavorite: (user, id, item, favorite) => setPersonalGroupFavorite(user, id, item, favorite, storage),
  useMemo: (callback) => callback(), useCallback: (callback) => callback,
  currentUserId: 'alice', currentUserProfile: {}, storedUser: {}, chatId: GROUP,
  isGroupsModule: true, isBroadcastsModule: false,
  selectedContact: group, activeGroupThread: group, broadcasts: [],
  chatMessages: { [GROUP]: [message] }, pinnedMessagesByChatId: {},
  clearedChatThreads: {}, deletedChatThreads: {}, messageEditsByChatId: {},
  stateRef: { current: { groups: [group], broadcasts: [] } },
  pendingPinnedMessageUnpinsRef: { current: new Map() },
  isBroadcastThreadId: () => false,
  isGroupThreadContact: (value) => Boolean(value?.isGroup),
  isBroadcastThreadContact: (value) => Boolean(value?.isBroadcast),
  getGroupThreadChatId: (value) => value?.chatId || '',
  getGroupThreadName: () => 'Group',
  isBackendObjectId: (value) => /^[a-f\d]{24}$/i.test(value),
  getHiddenHistoryCutoffTimestamp: () => 0,
  filterMessagesByDeletedChatTimestamp: (messages) => messages,
  filterGroupMessagesByHistoryVisibility: (messages) => messages,
  applyStoredMessageEditsToList: (messages) => messages,
  normalizeGroupBlockStateMessageForDisplay: (value) => value,
  isGroupBlockStateNotificationMessage: () => false,
  isContactBlockStateNotificationMessage: () => false,
  isGroupMembershipNotificationMessage: () => false,
  isGroupRoleChangeNotificationMessage: () => false,
  isDisappearingTimerNotificationMessage: () => false,
  filterGeneratedVideoLabelMessages: (messages) => messages,
  ...overrides,
});
const select = (overrides = {}) => runInNewContext(
  favoriteModeSource +
  section('  const activeMessages = useMemo(', '  const syncPinnedMessagesForChat =') +
  section('  const pinnedMessages = getPinnedMessages([', '  const activePinnedMessage =') +
  '\n({ activeMessages, pinnedMessages, isGroupFavoritesThread })',
  contextFor(overrides)
);

test('group routes hide shared favorite flags and banners before group details load', () => {
  const result = select({ activeGroupThread: null, selectedContact: null, pinnedMessagesByChatId: { [GROUP]: [message] } });
  assert.equal(result.isGroupFavoritesThread, true);
  assert.equal(result.activeMessages[0].isPinned, false);
  assert.equal(result.pinnedMessages.length, 0);
});

test('switching accounts ignores another account\'s stale favorite snapshots', () => {
  setPersonalGroupFavorite('alice', GROUP, message, true, storage);
  assert.equal(select().pinnedMessages.length, 1);
  const bob = select({
    currentUserId: 'bob', chatMessages: {}, pinnedMessagesByChatId: { [GROUP]: [message] },
  });
  assert.equal(bob.pinnedMessages.length, 0);
  assert.equal(bob.activeMessages.length, 0, 'A private snapshot must not be injected from another account\'s cached list');
  assert.equal(readPersonalGroupFavorites('alice', GROUP, storage).length, 1);
});

test('favorite and unfavorite markers depend only on each group member\'s private choices', () => {
  for (const user of ['alice', 'bob']) setPersonalGroupFavorite(user, GROUP, message, true, storage);
  setPersonalGroupFavorite('alice', GROUP, message, false, storage);
  assert.equal(select().pinnedMessages.length, 0);
  assert.equal(select({ currentUserId: 'bob' }).pinnedMessages.length, 1);
  assert.equal(message.isPinned, true, 'Reading favorites must not change the shared server record');
});

const sync = async (overrides = {}) => {
  let pins = {};
  const context = contextFor({
    setPinnedMessagesByChatId: (update) => { pins = update(pins); },
    setChatMessages: () => assert.fail('Personal favorite synchronization must not write to the shared message cache'),
    getPinnedMessagesRequest: async () => assert.fail('Group favorites must not load shared pin APIs'),
    console: { error: (...args) => assert.fail(String(args)) },
    ...overrides,
  });
  const callback = runInNewContext(
    section('const normalizePinnedMessageApiItem =', 'const extractPinnedMessageItemsFromThreadPayload =') +
    section('  const syncPinnedMessagesForChat =', '\n  useEffect(() => {') +
    '\nsyncPinnedMessagesForChat', context
  );
  return { favorites: await callback(GROUP), pins };
};

test('favorite synchronization reads only personal storage and leaves shared history untouched', async () => {
  setPersonalGroupFavorite('alice', GROUP, message, true, storage);
  const result = await sync();
  assert.equal(result.favorites.length, 1);
  assert.equal(result.pins[GROUP].length, 1);
});

test('group routes never fall back to shared pin APIs while group metadata is loading', async () => {
  setPersonalGroupFavorite('alice', GROUP, message, true, storage);
  const result = await sync({ selectedContact: null, stateRef: { current: { groups: [], broadcasts: [] } } });
  assert.equal(result.favorites.length, 1);
});

test('local group favorites survive the background refresh without a backend group id', async () => {
  setPersonalGroupFavorite('alice', GROUP, message, true, storage);
  const result = await sync({ isBackendObjectId: () => false });
  assert.equal(result.favorites.length, 1);
  assert.equal(result.pins[GROUP].length, 1);
});

test('favoriting from a group route remains private while the selected contact is unresolved', () => {
  const unexpected = () => assert.fail('A personal favorite must never call shared pin APIs or mutate shared history');
  const context = contextFor({
    selectedContact: null, activeGroupThread: null, activeMessages: [message],
    getSelectableMessageId: (value) => value.id,
    doesMessageMatchSelection: (value, id) => value.id === id,
    setPinnedMessagesByChatId() {}, syncSelectedMessagePinnedState() {},
    updateCurrentChatMessage: unexpected, pinMessageRequest: unexpected, unpinMessageRequest: unexpected,
    syncPinnedMessagesForChat: unexpected, showChatActionToast: unexpected,
  });
  const toggle = runInNewContext(
    favoriteModeSource + section('  const applyPinnedStateToMessage = useCallback(', '  const handleTogglePinMessage =') +
    '\napplyPinnedStateToMessage', context
  );
  assert.ok(toggle(message, true));
  assert.equal(readPersonalGroupFavorites('alice', GROUP, storage).length, 1);
  assert.equal(readPersonalGroupFavorites('bob', GROUP, storage).length, 0);
});
