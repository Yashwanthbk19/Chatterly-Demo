import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import {
  getMessageExpiryTimestamp,
  getPinnedMessages,
  isMessageExpired,
  normalizeStoredMessageListData,
  removeExpiredMessageCopies,
  toPersistedMessageData,
} from '../src/utils/message.js';

const DAY = 24 * 60 * 60 * 1000;
const sentAt = Date.parse('2026-10-26T09:00:00.000Z');
const favorite = (overrides = {}) => ({
  id: 'message-1',
  chatId: 'group-1',
  senderId: 'member-1',
  content: 'Favorite message',
  type: 'text',
  timestamp: new Date(sentAt).toISOString(),
  status: 'sent',
  isPinned: true,
  pinnedAt: new Date(sentAt + DAY / 2).toISOString(),
  disappearAfter: '24h',
  expiresAt: new Date(sentAt + DAY).toISOString(),
  ...overrides,
});

test('favorites disappear at the 24-hour deadline, regardless of when they were favorited', () => {
  const message = favorite();
  assert.equal(getPinnedMessages([message], sentAt + DAY - 1).length, 1);
  assert.equal(getPinnedMessages([message], sentAt + DAY).length, 0);
  assert.equal(getPinnedMessages([message], sentAt + 2 * DAY).length, 0);
});

test('the server deadline takes priority over the duration and pin timestamp', () => {
  const message = favorite({ expiresAt: new Date(sentAt + 1000).toISOString(), disappearAfter: '7d' });
  assert.equal(getMessageExpiryTimestamp(message), sentAt + 1000);
  assert.equal(isMessageExpired(message, sentAt + 1000), true);
});

test('legacy messages use their own 24-hour, 7-day or 30-day duration', () => {
  for (const [disappearAfter, days] of [['24h', 1], ['7d', 7], ['30d', 30]]) {
    const message = favorite({ expiresAt: undefined, disappearAfter });
    assert.equal(getMessageExpiryTimestamp(message), sentAt + days * DAY);
    assert.equal(isMessageExpired(message, sentAt + days * DAY - 1), false);
    assert.equal(isMessageExpired(message, sentAt + days * DAY), true);
  }
});

test('ordinary favorites and messages with no valid expiry remain available', () => {
  const messages = [
    favorite({ id: 'off', disappearAfter: 'off', expiresAt: null }),
    favorite({ id: 'legacy', disappearAfter: undefined, expiresAt: undefined }),
    favorite({ id: 'invalid', disappearAfter: 'invalid', expiresAt: 'invalid' }),
  ];
  assert.equal(getPinnedMessages(messages, sentAt + 100 * DAY).length, 3);
  assert.equal(getMessageExpiryTimestamp(favorite({ disappearAfter: 'constructor', expiresAt: null })), 0);
});

test('expiry fields survive saving and restoring the chat cache', () => {
  const persisted = toPersistedMessageData(favorite());
  assert.equal(persisted.disappearAfter, '24h');
  assert.equal(persisted.expiresAt, favorite().expiresAt);
  const restored = normalizeStoredMessageListData(JSON.parse(JSON.stringify([persisted])));
  assert.equal(getPinnedMessages(restored, sentAt + DAY).length, 0);
});

test('expiration removes both cached copies and matches server/client id aliases within the same chat', () => {
  const expired = favorite({ clientMessageId: 'temp-1' });
  const ordinary = favorite({ id: 'ordinary', expiresAt: null, disappearAfter: 'off' });
  const pinCopy = favorite({ id: 'temp-1', expiresAt: undefined, disappearAfter: undefined });
  const chats = { 'group-1': [expired, ordinary], 'group-2': [ordinary] };
  const pins = { 'group-1': [pinCopy, ordinary], 'group-2': [pinCopy] };
  const [remainingChats, remainingPins] = removeExpiredMessageCopies([chats, pins], sentAt + DAY);
  assert.deepEqual(remainingChats['group-1'], [ordinary]);
  assert.deepEqual(remainingPins['group-1'], [ordinary]);
  assert.equal(remainingChats['group-2'], chats['group-2']);
  assert.equal(remainingPins['group-2'], pins['group-2']);
  assert.equal(chats['group-1'].length, 2, 'Cleanup must not mutate existing React state');
});

test('a stale favorites response is rejected even when the conversation no longer has the message', () => {
  const chats = { 'group-1': [] };
  const pins = { 'group-1': [favorite()] };
  const [remainingChats, remainingPins] = removeExpiredMessageCopies([chats, pins], sentAt + DAY);
  assert.equal(remainingChats, chats);
  assert.deepEqual(remainingPins['group-1'], []);
});

test('cleanup preserves cache references when nothing has expired', () => {
  const chats = { 'group-1': [favorite()] };
  const pins = { 'group-1': [favorite()] };
  const result = removeExpiredMessageCopies([chats, pins], sentAt + DAY - 1);
  assert.equal(result[0], chats);
  assert.equal(result[1], pins);
});

// Run the production expiry effect with a controllable browser clock. No real
// waiting, backend requests or changes to the system clock are needed.
const source = readFileSync(new URL('../src/pages/ChatListPage.jsx', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const effectStart = source.indexOf('  useEffect(() => {\n    let expiryTimeoutId;');
const effectEnd = source.indexOf('  }, [chatMessages, pinnedMessagesByChatId]);', effectStart);
assert.ok(effectStart >= 0 && effectEnd > effectStart, 'Message expiry effect must exist');
const effectBody = source.slice(effectStart + '  useEffect(() => {'.length, effectEnd);

const createExpiryHarness = (message = favorite()) => {
  let now = sentAt;
  let nextTimerId = 0;
  const timers = new Map();
  const windowListeners = new Map();
  const documentListeners = new Map();
  let chats = { 'group-1': [message] };
  let pins = { 'group-1': [message] };
  const start = runInNewContext(`({ chatMessages, pinnedMessagesByChatId, setChatMessages, setPinnedMessagesByChatId }) => {${effectBody}\n}`, {
    Date: { now: () => now },
    getMessageExpiryTimestamp,
    removeExpiredMessageCopies,
    window: {
      setTimeout(callback, delay) { timers.set(++nextTimerId, { callback, delay }); return nextTimerId; },
      clearTimeout(id) { timers.delete(id); },
      addEventListener: (name, callback) => windowListeners.set(name, callback),
      removeEventListener: (name) => windowListeners.delete(name),
    },
    document: {
      addEventListener: (name, callback) => documentListeners.set(name, callback),
      removeEventListener: (name) => documentListeners.delete(name),
    },
  });
  const cleanup = start({
    chatMessages: chats,
    pinnedMessagesByChatId: pins,
    setChatMessages(update) { chats = update(chats); },
    setPinnedMessagesByChatId(update) { pins = update(pins); },
  });
  return {
    timers, windowListeners, documentListeners, cleanup,
    setNow(value) { now = value; },
    getChats: () => chats,
    getPins: () => pins,
  };
};

test('an open chat and favorites panel are cleaned automatically at the deadline', () => {
  const harness = createExpiryHarness();
  const timer = [...harness.timers.values()][0];
  assert.equal(timer.delay, DAY);
  harness.setNow(sentAt + DAY);
  timer.callback();
  assert.deepEqual(harness.getChats()['group-1'], []);
  assert.deepEqual(harness.getPins()['group-1'], []);
  harness.cleanup();
  assert.equal(harness.timers.size, 0);
  assert.equal(harness.windowListeners.size, 0);
  assert.equal(harness.documentListeners.size, 0);
});

test('returning to a suspended tab removes expired favorites immediately', () => {
  for (const event of ['focus', 'visibilitychange']) {
    const harness = createExpiryHarness();
    harness.setNow(sentAt + 2 * DAY);
    const listeners = event === 'focus' ? harness.windowListeners : harness.documentListeners;
    listeners.get(event)();
    assert.deepEqual(harness.getPins()['group-1'], []);
    harness.cleanup();
  }
});

test('30-day expiration stays within browser timeout limits without expiring early', () => {
  const harness = createExpiryHarness(favorite({ disappearAfter: '30d', expiresAt: new Date(sentAt + 30 * DAY).toISOString() }));
  const timer = [...harness.timers.values()][0];
  assert.equal(timer.delay, 2147483647);
  harness.setNow(sentAt + timer.delay);
  timer.callback();
  assert.equal(harness.getPins()['group-1'].length, 1);
  assert.equal([...harness.timers.values()][0].delay, 30 * DAY - 2147483647);
  harness.cleanup();
});
