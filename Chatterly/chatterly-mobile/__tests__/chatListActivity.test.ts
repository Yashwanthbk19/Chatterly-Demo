import {
  clearChatListActivities,
  clearChatListActivity,
  getChatListActivities,
  mergeChatListActivities,
  recordChatListActivity,
} from '../src/services/chatListActivity';

afterEach(clearChatListActivities);

test('adds a confirmed conversation to an empty chat list immediately', () => {
  recordChatListActivity({
    ownerId: 'current-user',
    chatId: 'chat-anil',
    contact: {userId: 'user-anil', name: 'Anil - Anil', kind: 'contact'},
    preview: 'Yes',
    createdAt: '2026-10-13T12:01:00.000Z',
    messageId: 'message-yes',
    status: 'sent',
  });

  expect(mergeChatListActivities([], 'current-user')).toEqual([
    expect.objectContaining({
      id: 'chat-anil',
      contact: expect.objectContaining({name: 'Anil - Anil'}),
      archived: false,
      lastMessage: 'Yes',
      lastMessageId: 'message-yes',
      lastMessageIsOwn: true,
    }),
  ]);
});

test('restores and moves an existing row after a newer sent message', () => {
  recordChatListActivity({
    ownerId: 'current-user',
    chatId: 'chat-anil',
    contact: {userId: 'user-anil', name: 'Anil - Anil', kind: 'contact'},
    preview: 'Latest message',
    createdAt: '2026-10-13T12:05:00.000Z',
    messageId: 'message-latest',
    status: 'delivered',
  });
  const rows = mergeChatListActivities([{
    id: 'chat-anil',
    contact: {userId: 'user-anil', name: 'Anil - Anil', kind: 'contact'},
    lastMessage: 'Old message',
    lastMessageAt: '2026-10-13T12:00:00.000Z',
    unreadCount: 0,
    markedUnread: false,
    archived: true,
    pinned: false,
    lastMessageIsOwn: false,
    lastMessageStatus: 'read',
    lastMessageId: 'message-old',
  }], 'current-user');

  expect(rows[0]).toEqual(expect.objectContaining({
    archived: false,
    lastMessage: 'Latest message',
    lastMessageStatus: 'delivered',
  }));
});

test('does not leak recent activity between signed-in accounts', () => {
  recordChatListActivity({
    ownerId: 'first-user', chatId: 'chat-1',
    contact: {userId: 'friend', name: 'Friend'}, preview: 'Hello',
    createdAt: '2026-10-13T12:00:00.000Z', messageId: 'message-1', status: 'sent',
  });
  expect(getChatListActivities('second-user')).toEqual([]);
});

test('drops a temporary handoff after the backend catches up or the chat is archived', () => {
  recordChatListActivity({
    ownerId: 'current-user', chatId: 'chat-1',
    contact: {userId: 'friend', name: 'Friend'}, preview: 'Hello',
    createdAt: '2026-10-13T12:00:00.000Z', messageId: 'message-1', status: 'sent',
  });
  clearChatListActivity('current-user', 'chat-1');
  expect(getChatListActivities('current-user')).toEqual([]);
});
