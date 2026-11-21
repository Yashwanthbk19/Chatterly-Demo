import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { applyPersonalGroupFavorites } from '../src/utils/groupMessageFavorites.js';
import {
  getPinnedMessages,
  buildPinnedMessagePatch,
  getMessageIdentityKeys,
  isMessageExpired,
  mergeGroupConversationMessages,
  normalizeMessageData,
  normalizeStoredMessageListData,
  messagesShareIdentity,
} from '../src/utils/message.js';

const GROUP = 'group-1';
const message = (overrides = {}) => normalizeMessageData({
  id: 'message-1',
  chatId: GROUP,
  groupId: GROUP,
  senderId: 'member-1',
  content: 'An important announcement',
  createdAt: '2026-10-26T09:00:00.000Z',
  isPinned: true,
  ...overrides,
});

test('a pin loaded before group history supplies the real message to the conversation', () => {
  const pin = message();
  assert.deepEqual(mergeGroupConversationMessages([], [pin], GROUP), [pin]);
});

test('pins supplement history in chronological order without duplicating client/server aliases', () => {
  const local = message({ id: 'temp-1', clientMessageId: 'client-1', content: 'Edited announcement', isPinned: false });
  const serverPin = message({ id: 'server-1', clientMessageId: 'client-1' });
  const earlierPin = message({ id: 'earlier', createdAt: '2026-10-26T08:00:00.000Z' });
  const laterMessage = message({ id: 'later', createdAt: '2026-10-26T10:00:00.000Z', isPinned: false });
  const merged = mergeGroupConversationMessages([local, laterMessage], [serverPin, earlierPin], GROUP);
  assert.deepEqual(merged.map((item) => item.id), ['earlier', 'temp-1', 'later']);
  assert.equal(merged[1].content, 'Edited announcement');
  assert.equal(merged[1].isPinned, true);
  assert.equal(local.isPinned, false, 'Existing React state must not be mutated');
});

test('pin snapshots cannot replace a deleted or expired conversation message', () => {
  for (const overrides of [
    { isDeleted: true },
    { isHiddenForMe: true, deletedFor: 'me' },
    { expiresAt: '2000-01-01T00:00:00.000Z' },
  ]) {
    const existing = message(overrides);
    const result = mergeGroupConversationMessages([existing], [message()], GROUP);
    assert.deepEqual(result, [existing]);
    assert.equal(result[0], existing);
  }
});

test('only valid pins belonging to the selected group can supplement the conversation', () => {
  const pins = [
    message({ chatId: 'another-group', groupId: 'another-group' }),
    message({ isDeleted: true }),
    message({ isPinned: false }),
    message({ deletedFor: 'me' }),
    message({ expiresAt: '2000-01-01T00:00:00.000Z' }),
  ];
  assert.deepEqual(mergeGroupConversationMessages([], pins, GROUP), []);
  assert.deepEqual(mergeGroupConversationMessages([], [message()], ''), []);
});

// Exercise the page's actual memoized selector and banner selector together,
// including its production history filters. Rendering markup is unchanged.
const source = readFileSync(new URL('../src/pages/ChatListPage.jsx', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const selectorStart = source.indexOf('  const activeMessages = useMemo(');
const favoriteModeStart = source.indexOf('  const isGroupFavoritesThread =');
const selectorEnd = source.indexOf('  const syncPinnedMessagesForChat =', selectorStart);
const pinnedStart = source.indexOf('  const pinnedMessages = getPinnedMessages([', selectorEnd);
const pinnedEnd = source.indexOf('  const activePinnedMessage =', pinnedStart);
assert.ok(selectorStart >= 0 && selectorEnd > selectorStart && pinnedStart > selectorEnd && pinnedEnd > pinnedStart);
const select = (overrides = {}) => runInNewContext(
  source.slice(favoriteModeStart, selectorStart) + source.slice(selectorStart, selectorEnd) + source.slice(pinnedStart, pinnedEnd) + '\n({ activeMessages, pinnedMessages });',
  {
    useMemo: (factory) => factory(),
    activeGroupThread: { chatId: GROUP, isGroup: true },
    broadcasts: [],
    chatId: GROUP,
    chatMessages: {},
    pinnedMessagesByChatId: { [GROUP]: [message()] },
    clearedChatThreads: {},
    deletedChatThreads: {},
    currentUserId: 'me',
    currentUserProfile: {},
    storedUser: {},
    isBroadcastsModule: false,
    isGroupsModule: false,
    messageEditsByChatId: {},
    selectedContact: { chatId: GROUP, isGroup: true },
    isGroupThreadContact: (contact) => Boolean(contact?.isGroup),
    isBroadcastThreadContact: (contact) => Boolean(contact?.isBroadcast),
    mergeGroupConversationMessages,
    applyPersonalGroupFavorites,
    readPersonalGroupFavorites: () => overrides.pinnedMessagesByChatId?.[GROUP] || [message()],
    getPinnedMessages,
    isMessageExpired,
    getGroupThreadName: () => 'Group',
    filterGroupMessagesByHistoryVisibility: (messages) => messages,
    getHiddenHistoryCutoffTimestamp: () => 0,
    filterMessagesByDeletedChatTimestamp: (messages) => messages,
    applyStoredMessageEditsToList: (messages) => messages,
    normalizeGroupBlockStateMessageForDisplay: (value) => value,
    isGroupBlockStateNotificationMessage: () => false,
    isContactBlockStateNotificationMessage: () => false,
    isGroupMembershipNotificationMessage: () => false,
    isGroupRoleChangeNotificationMessage: () => false,
    isDisappearingTimerNotificationMessage: () => false,
    filterGeneratedVideoLabelMessages: (messages) => messages,
    ...overrides,
  }
);

test('a visible group pin also appears in the actual timeline when history is empty', () => {
  const result = select();
  assert.equal(result.activeMessages.length, 1);
  assert.equal(result.pinnedMessages.length, 1);
  assert.equal(result.activeMessages[0].id, result.pinnedMessages[0].id);
});

test('pins obey the same clear-history and group-history visibility filters as the timeline', () => {
  // Extract and execute the actual filter functions with controlled cutoffs.
  const groupFilterStart = source.indexOf('const filterGroupMessagesByHistoryVisibility =');
  const groupFilterEnd = source.indexOf('\nconst resolveGroupPinnedState =', groupFilterStart);
  const clearFilterStart = source.indexOf('const filterMessagesByDeletedChatTimestamp =');
  const clearFilterEnd = source.indexOf('\nconst applyDeletedChatPreviewState =', clearFilterStart);
  const filters = runInNewContext(
    source.slice(groupFilterStart, groupFilterEnd) + source.slice(clearFilterStart, clearFilterEnd) +
    '\n({ filterGroupMessagesByHistoryVisibility, filterMessagesByDeletedChatTimestamp });',
    {
      getGroupHistoryVisibilityCutoffTimestamp: () => Date.parse('2026-10-26T10:00:00.000Z'),
      isGroupCallLogNotificationMessage: () => false,
      getPreviewTimestampValue: (value) => new Date(value || 0).getTime(),
    }
  );
  for (const overrides of [
    { filterGroupMessagesByHistoryVisibility: filters.filterGroupMessagesByHistoryVisibility },
    { filterMessagesByDeletedChatTimestamp: filters.filterMessagesByDeletedChatTimestamp, getHiddenHistoryCutoffTimestamp: () => Date.parse('2026-10-26T10:00:00.000Z') },
  ]) {
    const result = select(overrides);
    assert.equal(result.activeMessages.length, 0);
    assert.equal(result.pinnedMessages.length, 0);
  }
});

test('expired pins cannot leave a banner above an empty group conversation', () => {
  const result = select({ pinnedMessagesByChatId: { [GROUP]: [message({ expiresAt: '2000-01-01T00:00:00.000Z' })] } });
  assert.equal(result.activeMessages.length, 0);
  assert.equal(result.pinnedMessages.length, 0);
});

test('direct and broadcast pinned messages keep their existing separate-list behavior', () => {
  for (const activeGroupThread of [null, { chatId: GROUP, isBroadcast: true }]) {
    const result = select({ activeGroupThread });
    assert.equal(result.activeMessages.length, 0);
    assert.equal(result.pinnedMessages.length, 1);
  }
});

test('favorite synchronization leaves shared history unchanged and unpinning retains the conversation message', async () => {
  const syncStart = source.indexOf('  const syncPinnedMessagesForChat =');
  const syncEnd = source.indexOf('\n  useEffect(() => {', syncStart);
  const normalizerStart = source.indexOf('const normalizePinnedMessageApiItem =');
  const normalizerEnd = source.indexOf('\nconst extractPinnedMessageItemsFromThreadPayload =', normalizerStart);
  let chats = { [GROUP]: [message({ isPinned: false })] };
  const originalChats = chats;
  let pins = {};
  const group = { chatId: GROUP, isGroup: true };
  const sync = runInNewContext(
    source.slice(normalizerStart, normalizerEnd) + source.slice(syncStart, syncEnd) + '\nsyncPinnedMessagesForChat;',
    {
      useCallback: (callback) => callback,
      currentUserId: 'me',
      chatId: GROUP,
      isGroupsModule: true,
      selectedContact: group,
      stateRef: { current: { groups: [group], broadcasts: [] } },
      pendingPinnedMessageUnpinsRef: { current: new Map() },
      isBroadcastThreadId: () => false,
      isBroadcastThreadContact: () => false,
      getGroupThreadChatId: (value) => value?.chatId || '',
      isGroupThreadContact: (value) => Boolean(value?.isGroup),
      isBackendObjectId: () => true,
      readPersonalGroupFavorites: () => [message()],
      getGroupPinnedMessages: async () => assert.fail('Personal favorites must not fetch shared group pins'),
      normalizeStoredMessageListData,
      normalizeMessageData,
      buildPinnedMessagePatch,
      getMessageIdentityKeys,
      messagesShareIdentity,
      mergeGroupConversationMessages,
      isMessageExpired,
      setChatMessages: (update) => { chats = update(chats); },
      setPinnedMessagesByChatId: (update) => { pins = update(pins); },
      console: { error: (...args) => assert.fail(String(args)) },
    }
  );
  await sync(GROUP);
  assert.equal(chats, originalChats, 'Personal selections must not be copied into shared history');
  assert.equal(chats[GROUP].length, 1);
  assert.equal(pins[GROUP].length, 1);

  // The unpin operation clears the pin list and flag, not the conversation.
  chats[GROUP] = chats[GROUP].map((item) => ({ ...item, isPinned: false }));
  pins[GROUP] = [];
  const result = select({ chatMessages: chats, pinnedMessagesByChatId: pins });
  assert.equal(result.activeMessages.length, 1);
  assert.equal(result.pinnedMessages.length, 0);
});

test('delete for me removes the pin copy so it cannot restore the deleted group message', () => {
  const deleteStart = source.indexOf('  const handleDeleteMessageForMe =');
  const deleteEnd = source.indexOf('\n  const handleDeleteMessageForEveryone =', deleteStart);
  const target = message();
  let chats = { [GROUP]: [target] };
  let pins = { [GROUP]: [target] };
  const pendingUnpins = new Map();
  let personalFavorites = [target];
  const remove = runInNewContext(source.slice(deleteStart, deleteEnd) + '\nhandleDeleteMessageForMe;', {
    chatId: GROUP,
    currentUserId: 'me',
    isGroupFavoritesThread: true,
    selectedContact: { chatId: GROUP, isGroup: true },
    isGroupThreadContact: (contact) => Boolean(contact?.isGroup),
    isBroadcastThreadContact: () => false,
    getGroupThreadChatId: (contact) => contact.chatId,
    setPersonalGroupFavorite: (_userId, _groupId, targetMessage) => {
      personalFavorites = personalFavorites.filter((item) => !messagesShareIdentity(item, targetMessage));
    },
    deleteMessageModalTargets: [target],
    getSelectableMessageId: (item) => item.id,
    queueDeletedMessageScrollRestore() {},
    setChatMessages: (update) => { chats = update(chats); },
    setPinnedMessagesByChatId: (update) => { pins = update(pins); },
    doesMessageMatchSelection: (item, id, candidate) => item.id === id || messagesShareIdentity(item, candidate),
    getLatestMessagePreview: () => ({}),
    updateThreadPreview() {},
    PENDING_PINNED_MESSAGE_UNPIN_GRACE_MS: 30000,
    getMessageIdentityKeys,
    pendingPinnedMessageUnpinsRef: { current: pendingUnpins },
    resetMessageLongPressState() {},
    setOpenMessageMenuId() {},
    clearSelectedMessage() {},
    clearSelectedMessages() {},
    closeChatActionModal() {},
  });
  remove();
  assert.equal(chats[GROUP].length, 0);
  assert.equal(pins[GROUP].length, 0);
  assert.equal(personalFavorites.length, 0);
  assert.ok(pendingUnpins.has(target.id));
  const result = select({ chatMessages: chats, pinnedMessagesByChatId: pins });
  assert.equal(result.activeMessages.length, 0);
  assert.equal(result.pinnedMessages.length, 0);
});
