import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import {
  applyDisappearingMessageTimer,
  getMessageExpiryTimestamp,
  isMessageExpired,
  normalizeMessageData,
  removeExpiredMessageCopies,
  toPersistedMessageData,
} from '../src/utils/message.js';

const source = readFileSync(new URL('../src/pages/ChatListPage.jsx', import.meta.url), 'utf8')
  .replaceAll('\r\n', '\n');
const section = (startMarker, endMarker) => {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `Missing section: ${startMarker}`);
  return source.slice(start, end);
};
const timerHelpers = section('const DISAPPEARING_MESSAGE_OPTION_ITEMS =', 'const getReportedContactsStorageUserKey =');
const accountDefaults = section('  const applyAccountDefaultTimerToChat =', '  const ensureForwardTargetChat =');
const CHAT = '111111111111111111111111';
const PEER = '222222222222222222222222';
const DAY = 86400000;
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
};
const harness = ({ request = async () => ({}), contact = {}, timer = '24h' } = {}) => {
  const storage = new Map([['chatterly_default_message_timer', timer]]);
  const listeners = new Map();
  const calls = [];
  let contacts = [{ chatId: CHAT, userId: PEER, disappearingTimer: 'off', ...contact }];
  let selectedContact = contacts[0];
  const stateRef = { current: { contacts, selectedContact } };
  const context = {
    DISAPPEARING_TIMERS_STORAGE_KEY: 'chatterly_disappearing_timers',
    useCallback: (callback) => callback,
    currentUserId: 'me-id',
    createMessageId: () => 'notice',
    localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    CustomEvent: class { constructor(type, { detail }) { this.type = type; this.detail = detail; } },
    window: {
      dispatchEvent: (event) => listeners.get(event.type)?.(event),
      addEventListener: (type, callback) => listeners.set(type, callback),
      removeEventListener: (type) => listeners.delete(type),
    },
    stateRef,
    pendingDefaultTimerUpdatesRef: { current: new Map() },
    setContacts: (update) => { contacts = update(contacts); stateRef.current.contacts = contacts; },
    setSelectedContact: (update) => { selectedContact = update(selectedContact); stateRef.current.selectedContact = selectedContact; },
    setDisappearingMessageTimer: async (payload) => { calls.push(payload); return request(payload); },
    startChat: async () => ({ chatId: CHAT, created: true }),
  };
  const helpers = runInNewContext(timerHelpers + accountDefaults + `
    ({ applyAccountDefaultTimerToChat, startChatWithAccountDefaults, persistDefaultMessageTimer,
       getStoredDisappearingTimerRecord, persistStoredDisappearingTimerRecord, normalizeDisappearingMessageTimer });
  `, context);
  return {
    ...helpers, context, calls, listeners,
    selected: () => selectedContact,
    apply: () => helpers.applyAccountDefaultTimerToChat({ chatId: CHAT, receiverId: PEER }),
  };
};

test('Privacy default updates an existing unconfigured conversation and its persisted timer', async () => {
  const chat = harness();
  await chat.apply();
  assert.equal(chat.calls[0].timer, '24h');
  assert.equal(chat.selected().disappearingTimer, '24h');
  assert.equal(chat.getStoredDisappearingTimerRecord(CHAT).source, 'account-default');
});

test('opening a new conversation waits for its timer before allowing the first message', async () => {
  const saved = deferred();
  const chat = harness({ request: () => saved.promise });
  let ready = false;
  const opening = chat.startChatWithAccountDefaults(PEER).then(() => { ready = true; });
  await Promise.resolve();
  assert.equal(ready, false);
  assert.equal(chat.selected().disappearingTimer, 'off');
  saved.resolve({});
  await opening;
  assert.equal(ready, true);
  assert.equal(chat.selected().disappearingTimer, '24h');
});

test('explicit conversation timers, including Off, take priority over the Privacy default', async () => {
  for (const timer of ['off', '7d', '30d']) {
    const chat = harness();
    chat.persistStoredDisappearingTimerRecord({ chatId: CHAT, timer });
    await chat.apply();
    assert.equal(chat.calls.length, 0);
    assert.equal(chat.getStoredDisappearingTimerRecord(CHAT).timer, timer);
  }
  const chat = harness({ contact: { disappearingTimer: '7d' } });
  await chat.apply();
  assert.equal(chat.calls.length, 0, 'A timer loaded from the server must also be respected');
});

test('changing and disabling the default updates inherited chats without changing explicit chats', async () => {
  const chat = harness();
  await chat.apply();
  for (const timer of ['7d', '30d', 'off']) {
    chat.persistDefaultMessageTimer(timer);
    await chat.apply();
    assert.equal(chat.selected().disappearingTimer, timer);
    assert.equal(chat.getStoredDisappearingTimerRecord(CHAT).source, 'account-default');
  }
  assert.deepEqual(chat.calls.map((call) => call.timer), ['24h', '7d', '30d', 'off']);
  chat.persistStoredDisappearingTimerRecord({ chatId: CHAT, timer: '7d' });
  chat.persistDefaultMessageTimer('24h');
  await chat.apply();
  assert.equal(chat.calls.length, 4);
  assert.equal(chat.getStoredDisappearingTimerRecord(CHAT).timer, '7d');
});

test('concurrent open/send requests share the timer save and a newer Privacy duration wins', async () => {
  const saved = deferred();
  const chat = harness({ request: () => saved.promise });
  const first = chat.apply();
  const second = chat.apply();
  assert.equal(chat.calls.length, 1);
  chat.persistDefaultMessageTimer('7d');
  saved.resolve({});
  await Promise.all([first, second]);
  assert.equal(chat.calls.length, 2);
  assert.equal(chat.selected().disappearingTimer, '7d');
});

test('a failed timer save does not advertise an enabled timer and remains retryable', async () => {
  let fail = true;
  const chat = harness({ request: async () => { if (fail) throw new Error('Offline'); } });
  await assert.rejects(chat.apply(), /Offline/);
  assert.equal(chat.selected().disappearingTimer, 'off');
  assert.equal(chat.getStoredDisappearingTimerRecord(CHAT), null);
  fail = false;
  await chat.apply();
  assert.equal(chat.selected().disappearingTimer, '24h');
});

test('history reconciliation retains inheritance and explicit timer changes stop inheritance', async () => {
  const chat = harness();
  await chat.apply();
  const saved = chat.getStoredDisappearingTimerRecord(CHAT);
  const reconcile = runInNewContext(section(
    '  const applyDisappearingTimerUpdateToThread =',
    '  useEffect(() => {\n    if (!chatId) return;',
  ) + '\napplyDisappearingTimerUpdateToThread;', {
    ...chat.context, ...chat,
    sortContactsByRecent: (contacts) => contacts,
    setGroups: (update) => update([]),
    setBroadcasts: (update) => update([]),
    getGroupThreadChatId: (group) => group?.chatId || '',
    isGroupThreadContact: () => false,
  });
  reconcile({ chatId: CHAT, ...saved });
  assert.equal(chat.getStoredDisappearingTimerRecord(CHAT).source, 'account-default');
  chat.persistDefaultMessageTimer('7d');
  await chat.apply();
  assert.equal(chat.selected().disappearingTimer, '7d');
  reconcile({ chatId: CHAT, timer: 'off', updatedAt: '2099-01-01T00:00:00Z' });
  chat.persistDefaultMessageTimer('30d');
  await chat.apply();
  assert.equal(chat.selected().disappearingTimer, 'off');
  assert.equal(chat.calls.length, 2);
});

test('the production message insertion path stamps new messages and excludes timer notifications', async () => {
  const chat = harness();
  await chat.apply();
  let messages = {};
  const insert = runInNewContext(section(
    '  const upsertChatMessageRecord =',
    '  const applyEditedMessageRecord =',
  ) + '\nupsertChatMessageRecord;', {
    ...chat.context, ...chat,
    normalizeMessageData, applyDisappearingMessageTimer,
    isDisappearingTimerNotificationMessage: (message) => message.content === 'timer-notice',
    setChatMessages: (update) => { messages = update(messages); },
    upsertMessage: (items, _id, message) => [...items, message],
    getLatestMessagePreview: () => ({}),
    updateThreadPreview() {},
  });
  const timestamp = new Date(Date.now() + 1000).toISOString();
  insert(CHAT, 'new', { id: 'new', chatId: CHAT, content: 'Hello', senderId: 'me', timestamp });
  insert(CHAT, 'notice', { id: 'notice', chatId: CHAT, content: 'timer-notice', senderId: 'me', timestamp });
  assert.equal(messages[CHAT][0].disappearAfter, '24h');
  assert.equal(getMessageExpiryTimestamp(messages[CHAT][0]), Date.parse(timestamp) + DAY);
  assert.equal(getMessageExpiryTimestamp(messages[CHAT][1]), 0);
});

test('a slow privacy fetch cannot overwrite a selection saved while the request was in flight', async () => {
  const settings = deferred();
  const chat = harness({ timer: 'off' });
  let accountDefaultMessageTimer = 'off';
  let cleanup;
  runInNewContext(section(
    '  // Keep the account-wide default timer in step with Settings.',
    '  useEffect(() => {\n    if (!selectedContact || isGroupThreadContact(selectedContact)',
  ), {
    ...chat.context, ...chat,
    useEffect: (effect) => { cleanup = effect(); },
    DEFAULT_MESSAGE_TIMER_CHANGED_EVENT: 'chatterly:default-message-timer-changed',
    getPrivacySettings: () => settings.promise,
    setAccountDefaultMessageTimer: (value) => { accountDefaultMessageTimer = value; },
  });
  chat.persistDefaultMessageTimer('7d');
  settings.resolve({ disappearingMessages: 'off' });
  await settings.promise;
  await Promise.resolve();
  assert.equal(accountDefaultMessageTimer, '7d');
  cleanup();
  assert.equal(chat.listeners.size, 0);
});

test('new messages get the selected duration and expire from the conversation and favorites', () => {
  const enabledAt = Date.parse('2026-10-26T09:00:00Z');
  for (const [timer, days] of [['24h', 1], ['7d', 7], ['30d', 30]]) {
    const record = { timer, updatedAt: new Date(enabledAt).toISOString() };
    const message = applyDisappearingMessageTimer(normalizeMessageData({
      id: 'message', chatId: CHAT, senderId: 'me', content: 'New message',
      timestamp: new Date(enabledAt + 1000).toISOString(), isPinned: true,
    }), record);
    const deadline = enabledAt + 1000 + days * DAY;
    assert.equal(getMessageExpiryTimestamp(message), deadline);
    assert.equal(isMessageExpired(message, deadline - 1), false);
    assert.equal(isMessageExpired(message, deadline), true);
    const persisted = toPersistedMessageData(message);
    assert.equal(persisted.expiresAt, new Date(deadline).toISOString());
    const [chats, pins] = removeExpiredMessageCopies([{ [CHAT]: [message] }, { [CHAT]: [message] }], deadline);
    assert.equal(chats[CHAT].length, 0);
    assert.equal(pins[CHAT].length, 0);
  }
});

test('old messages, explicit deadlines and messages sent while Off keep their original expiry', () => {
  const record = { timer: '24h', updatedAt: '2026-10-26T09:00:00Z' };
  for (const message of [
    { timestamp: '2026-10-25T09:00:00Z' },
    { timestamp: '2026-10-26T09:00:01Z', disappearAfter: 'off' },
    { timestamp: '2026-10-26T09:00:01Z', expiresAt: '2026-11-26T09:00:00Z' },
    { timestamp: '2026-10-26T09:00:01Z', disappearAfter: '7d' },
  ]) {
    assert.equal(applyDisappearingMessageTimer(message, record), message);
  }
  const message = { timestamp: '2026-10-26T09:00:01Z' };
  assert.equal(applyDisappearingMessageTimer(message, { ...record, timer: 'off' }), message);
});
