import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getActiveChatRoute,
  isNotificationForActiveChat,
} from '../src/utils/notification.js';

test('recognizes only conversation routes as active chats', () => {
  assert.deepEqual(getActiveChatRoute('/chat/chat-1'), { chatId: 'chat-1', chatType: 'chat' });
  assert.deepEqual(getActiveChatRoute('/groups/chat/group%201'), { chatId: 'group 1', chatType: 'group' });
  assert.deepEqual(getActiveChatRoute('/broadcasts/chat/news'), { chatId: 'news', chatType: 'broadcast' });
  assert.equal(getActiveChatRoute('/chat/chat-1/call'), null);
  assert.equal(getActiveChatRoute('/chats'), null);
});

test('suppresses alerts only for the conversation currently open', () => {
  assert.equal(
    isNotificationForActiveChat({ chatId: 'chat-1', senderId: 'peer-1' }, '/chat/chat-1'),
    true
  );
  assert.equal(
    isNotificationForActiveChat({ senderId: 'peer-1' }, '/chat/peer-1'),
    true
  );
  assert.equal(
    isNotificationForActiveChat({ chatId: 'chat-2', senderId: 'peer-2' }, '/chat/chat-1'),
    false
  );
  assert.equal(
    isNotificationForActiveChat({ chatId: 'chat-1' }, '/chats'),
    false
  );
});

test('does not confuse group, broadcast, and direct conversations', () => {
  assert.equal(
    isNotificationForActiveChat(
      { chatId: 'shared-id', chatType: 'group', isGroup: true },
      '/groups/chat/shared-id'
    ),
    true
  );
  assert.equal(
    isNotificationForActiveChat(
      { chatId: 'shared-id', chatType: 'group', isGroup: true },
      '/chat/shared-id'
    ),
    false
  );
  assert.equal(
    isNotificationForActiveChat(
      { targetUrl: '/broadcasts/chat/broadcast-1', chatType: 'broadcast' },
      '/broadcasts/chat/broadcast-1'
    ),
    true
  );
});
