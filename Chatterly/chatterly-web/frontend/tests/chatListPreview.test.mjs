import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createMessageId, getMessageStatusPriority, normalizeMessageData, normalizeMessageStatus } from '../src/utils/message.js';

const apiSource = readFileSync(new URL('../src/api/chat.js', import.meta.url), 'utf8')
  .split('export const pinChatThread =')[0]
  .replace(/^import .+;\r?$/gm, '')
  .replace(/^export /gm, '');
const pageSource = readFileSync(new URL('../src/pages/ChatListPage.jsx', import.meta.url), 'utf8');
const ME = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const PEER = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const CHAT = 'cccccccccccccccccccccccc';
const OLD = '2026-11-12T09:00:00.000Z';
const LATEST = '2026-11-12T10:00:00.000Z';

// Run the actual API adapter with isolated transport/storage, without Firebase
// or a backend. Decryption is represented by an envelope-to-plaintext fixture.
const loadChatList = async (overrides = {}, messages = []) => {
  const requests = [];
  const storage = new Map([['user', JSON.stringify({ _id: ME, name: 'Me' })]]);
  const decrypt = async (message) => message?.encryptedContent === 'encrypted-fixture'
    ? { ...message, content: 'Decrypted latest message' }
    : message;
  const context = {
    console: { log() {}, error() {} },
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    },
    requestCollection: async (config) => {
      requests.push(config.url);
      return config.url === '/api/chats/list'
        ? [{ _id: CHAT, receiverId: { _id: PEER, name: 'Alex' }, ...overrides }]
        : messages;
    },
    retryTransient: (request) => request(),
    decryptMessageRecord: decrypt,
    decryptMessageRecords: (records) => Promise.all(records.map(decrypt)),
    normalizeProfilePictureValue: (value) => typeof value === 'string' ? value : '',
    hasContactBlockedCurrentUser: () => false,
    createMessageId,
    normalizeMessageData,
    normalizeMessageStatus,
  };
  const getChatList = runInNewContext(`${apiSource}\ngetChatList`, context);
  return { chats: await getChatList(), requests };
};

for (const field of ['lastMessage', 'latestMessage', 'last_message']) {
  test(`chat list displays a text preview supplied directly in ${field}`, async () => {
    const { chats, requests } = await loadChatList({ [field]: 'Latest hello', lastMessageAt: LATEST });
    assert.equal(chats[0].lastMessageText, 'Latest hello');
    assert.equal(requests.length, 1, 'Readable list previews should not need a history lookup');
  });
}

test('chat list decrypts a populated last-message record before resolving its preview', async () => {
  const { chats, requests } = await loadChatList({
    lastMessage: { _id: 'message-1', sender: PEER, encryptedContent: 'encrypted-fixture', createdAt: LATEST },
  });
  assert.equal(chats[0].lastMessageText, 'Decrypted latest message');
  assert.equal(chats[0].lastMessageSenderId, PEER);
  assert.equal(chats[0].lastMessageAt, LATEST);
  assert.equal(requests.length, 1);
});

for (const sender of [ME, PEER]) {
  test(`an unpopulated message ID resolves the latest ${sender === ME ? 'sent' : 'received'} history preview`, async () => {
    const { chats } = await loadChatList({ lastMessage: 'dddddddddddddddddddddddd' }, [
      { _id: 'new', sender: { _id: sender, name: sender === ME ? 'Me' : 'Alex' }, receiver: { _id: sender === ME ? PEER : ME }, content: 'Newest message', createdAt: LATEST },
      { _id: 'old', sender: { _id: PEER, name: 'Alex' }, receiver: { _id: ME }, content: 'Older message', createdAt: OLD },
    ]);
    assert.equal(chats[0].lastMessageText, 'Newest message');
    assert.equal(chats[0].lastMessageSenderId, sender);
    assert.equal(chats[0].lastMessageAt, LATEST);
  });
}

test('a genuinely empty chat keeps an empty preview for the existing No messages label', async () => {
  const { chats } = await loadChatList();
  assert.equal(chats[0].lastMessageText, '');
});

test('a populated media message retains its existing preview label', async () => {
  const { chats } = await loadChatList({
    lastMessage: { _id: 'photo', messageType: 'image', mediaUrl: 'https://example.com/photo.jpg', createdAt: LATEST },
  });
  assert.equal(chats[0].lastMessageText, 'Photo');
});

const mergeStart = pageSource.indexOf('const normalizeOptionalPreviewStatus =');
const mergeEnd = pageSource.indexOf('const mergeChatWithCachedPreview =', mergeStart);
assert.ok(mergeStart >= 0 && mergeEnd > mergeStart);
const mergePreview = runInNewContext(
  `${pageSource.slice(mergeStart, mergeEnd)}\nmergeContactLastMessagePreview`,
  {
    normalizeMessageStatus,
    getMessageStatusPriority,
    getPreviewTimestampValue: (value) => new Date(value || 0).getTime() || 0,
  }
);

test('an empty refreshed preview cannot erase the last sent or received message', () => {
  for (const authoritative of [false, true]) {
    const merged = mergePreview(
      { lastMessageText: 'Cached latest message', lastMessageAt: OLD, lastMessageStatus: 'read', lastMessageSenderId: PEER },
      { lastMessageText: '', lastMessageAt: LATEST, _hasAuthoritativeLastMessageAt: authoritative }
    );
    assert.equal(merged.lastMessageText, 'Cached latest message');
    assert.equal(merged.lastMessageAt, OLD, 'Keep the timestamp paired with the readable message');
    assert.equal(merged.lastMessageSenderId, PEER);
    assert.equal(merged.lastMessageStatus, 'read');
  }
});

test('a cached empty row accepts readable history even when its row timestamp is newer', () => {
  const merged = mergePreview(
    { lastMessageText: '', lastMessageAt: LATEST },
    { lastMessageText: 'Latest actual message', lastMessageAt: OLD }
  );
  assert.equal(merged.lastMessageText, 'Latest actual message');
  assert.equal(merged.lastMessageAt, OLD);
});

test('a readable newer message updates the preview and read receipts still advance', () => {
  const merged = mergePreview(
    { lastMessageText: 'Old', lastMessageAt: OLD, lastMessageStatus: 'read' },
    { lastMessageText: 'New', lastMessageAt: LATEST, lastMessageStatus: 'sent', lastMessageSenderId: ME }
  );
  assert.equal(merged.lastMessageText, 'New');
  assert.equal(merged.lastMessageSenderId, ME);
  assert.equal(mergePreview(merged, { ...merged, lastMessageStatus: 'read' }).lastMessageStatus, 'read');
});
