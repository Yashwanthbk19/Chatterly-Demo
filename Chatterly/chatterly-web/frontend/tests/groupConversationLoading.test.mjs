import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { normalizeStoredMessageListData } from '../src/utils/message.js';

// Exercise the production loading effect without mounting the entire chat page
// (calls, Firebase, sockets and browser media are unrelated to history loading).
const source = readFileSync(new URL('../src/pages/ChatListPage.jsx', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const effectStart = source.indexOf('  useEffect(() => {\n    if (!chatId) {\n    ');
const effectEnd = source.indexOf('  }, [activeGroupThreadChatId,', effectStart);
assert.ok(effectStart >= 0 && effectEnd > effectStart, 'Conversation loading effect must exist');
const effectBody = source.slice(effectStart + '  useEffect(() => {'.length, effectEnd);

const GROUP_A = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const GROUP_B = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const message = (id, groupId = GROUP_A) => ({
  _id: id,
  groupId,
  senderId: 'member-1',
  content: `Existing message ${id}`,
  createdAt: '2026-10-26T09:00:00.000Z',
});
const flush = () => new Promise((resolve) => setImmediate(resolve));

const createHarness = () => {
  const requests = [];
  const errors = [];
  const ref = (current = '') => ({ current });
  const context = {
    AbortController,
    // Repeated effect runs may happen in the same millisecond.
    Date: { now: () => 1000 },
    console: { error: (...args) => errors.push(args) },
    chatId: GROUP_A,
    currentUserId: 'current-user',
    activeGroupThreadChatId: GROUP_A,
    activeGroupThreadIsBroadcast: false,
    isCollectiveModule: true,
    previousChatIdRef: ref(null),
    previousMessageCountRef: ref(0),
    activeMessagesLoadKeyRef: ref(),
    pendingMessagesLoadKeyRef: ref(),
    activeMessagesRequestRef: ref(),
    shouldStickToBottomRef: ref(false),
    forceLatestMessageUntilRef: ref(0),
    deletedChatThreadsRef: ref({}),
    clearedChatThreadsRef: ref({}),
    markCurrentUserRemovedFromGroupRef: ref(() => {}),
    stateRef: ref({ groups: [], broadcasts: [], chatMessages: {} }),
    isLoading: false,
    previews: {},
    getGroupThreadChatId: (group) => group.chatId,
    isBroadcastThreadContact: (group) => Boolean(group.isBroadcast),
    isBackendObjectId: (value) => /^[a-f\d]{24}$/i.test(value),
    scheduleScrollToBottom() {},
    setIsLoadingMessages(value) { context.isLoading = value; },
    getGroupMessages(groupId, { signal }) {
      return new Promise((resolve, reject) => requests.push({ groupId, signal, resolve, reject }));
    },
    splitReactionControlMessages: (messages) => ({ visibleMessages: messages, reactionPayloads: [] }),
    normalizeStoredMessageListData,
    applyAutoDownloadStateToIncomingMessage: (value) => value,
    applyReactionControlMessages() {},
    getHiddenHistoryCutoffTimestamp: () => 0,
    filterMessagesByDeletedChatTimestamp: (messages) => messages,
    mergeFetchedMessagesWithLocalCache: ({ fetchedMessages }) => fetchedMessages,
    mergeStoredGroupCallLogMessages: ({ messages }) => messages,
    setChatMessages(update) {
      context.stateRef.current.chatMessages = update(context.stateRef.current.chatMessages);
    },
    getLatestMessagePreview(messages) {
      return { lastMessageText: messages.at(-1)?.content || '' };
    },
    updateThreadPreview(groupId, preview) { context.previews[groupId] = preview; },
    normalizeContactUnreadCount: (value) => Number(value || 0),
  };
  const load = runInNewContext(`() => {${effectBody}\n}`, context);
  return { context, requests, errors, load };
};

test('restarting a group history load replaces the canceled request and displays existing messages', async () => {
  const { context, requests, errors, load } = createHarness();
  const cleanup = load();
  assert.equal(context.isLoading, true);
  cleanup();
  assert.equal(requests[0].signal.aborted, true);

  const cleanupReplacement = load();
  assert.equal(requests.length, 2, 'Canceled requests must not suppress the replacement load');
  assert.equal(context.isLoading, true);
  requests[1].resolve([message('oldest'), message('latest')]);
  await flush();

  const messages = context.stateRef.current.chatMessages[GROUP_A];
  assert.deepEqual(messages.map((item) => item.id), ['oldest', 'latest']);
  assert.equal(context.previews[GROUP_A].lastMessageText, messages.at(-1).content);
  assert.equal(context.isLoading, false);
  assert.deepEqual(errors, []);
  requests[0].reject(Object.assign(new Error('Canceled'), { code: 'ERR_CANCELED' }));
  await flush();
  cleanupReplacement();
});

test('an old request settling cannot clear the replacement request or its loading state', async () => {
  const { context, requests, load } = createHarness();
  load()();
  const cleanup = load();
  const replacementKey = context.pendingMessagesLoadKeyRef.current;

  requests[0].resolve([message('stale')]);
  await flush();
  assert.equal(context.pendingMessagesLoadKeyRef.current, replacementKey);
  assert.equal(context.isLoading, true);
  assert.equal(context.stateRef.current.chatMessages[GROUP_A], undefined);

  requests[1].resolve([message('latest')]);
  await flush();
  assert.equal(context.stateRef.current.chatMessages[GROUP_A][0].id, 'latest');
  cleanup();
});

test('switching groups and immediately returning still loads the correct conversation', async () => {
  const { context, requests, load } = createHarness();
  load()();
  context.chatId = context.activeGroupThreadChatId = GROUP_B;
  load()();
  context.chatId = context.activeGroupThreadChatId = GROUP_A;
  const cleanup = load();
  assert.equal(requests.length, 3);

  requests[0].resolve([message('stale-a')]);
  requests[1].resolve([message('stale-b', GROUP_B)]);
  await flush();
  assert.equal(context.isLoading, true);
  requests[2].resolve([message('current-a')]);
  await flush();
  assert.equal(context.stateRef.current.chatMessages[GROUP_A][0].id, 'current-a');
  assert.equal(context.stateRef.current.chatMessages[GROUP_B], undefined);
  cleanup();
});

test('an empty refresh preserves messages already loaded for the group preview', async () => {
  const { context, requests, load } = createHarness();
  context.stateRef.current.chatMessages[GROUP_A] = normalizeStoredMessageListData([message('cached')], {
    currentUserId: context.currentUserId,
    fallback: { chatId: GROUP_A, groupId: GROUP_A, chatType: 'group' },
  });
  const cleanup = load();
  requests[0].resolve([]);
  await flush();
  assert.equal(context.stateRef.current.chatMessages[GROUP_A][0].id, 'cached');
  assert.equal(context.previews[GROUP_A].lastMessageText, 'Existing message cached');
  cleanup();
});
