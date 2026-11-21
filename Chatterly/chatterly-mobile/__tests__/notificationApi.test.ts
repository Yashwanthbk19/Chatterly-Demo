import {apiRequest} from '../src/api/client';
import {API_BASE_URL} from '../src/config/api';
import {notifyGroupMessageOnce, notifyMessageOnce, saveDevicePushToken} from '../src/services/notificationApi';

jest.mock('../src/api/client', () => ({apiRequest: jest.fn()}));
jest.mock('../src/services/sessionStore', () => ({
  getToken: () => 'jwt-token',
  getSession: jest.fn(() => ({token: 'jwt-token', user: {id: 'sender-1', profilePic: 'https://cdn.example/sender.jpg'}})),
}));

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(apiRequest).mockResolvedValue({} as Response);
});

test('registers the native push token through the documented endpoint', async () => {
  await saveDevicePushToken('native-fcm-or-apns-token');

  expect(apiRequest).toHaveBeenCalledWith(`${API_BASE_URL}/chats/save-token`, expect.objectContaining({
    method: 'POST',
    body: JSON.stringify({userId: 'sender-1', fcmToken: 'native-fcm-or-apns-token'}),
  }));
});

test('notifies only once for the same persisted message id', async () => {
  await notifyMessageOnce('message-unique-1', 'receiver-1', 'Are you free?', 'chat-1');
  await notifyMessageOnce('message-unique-1', 'receiver-1', 'Are you free?', 'chat-1');

  expect(apiRequest).toHaveBeenCalledTimes(1);
  expect(apiRequest).toHaveBeenCalledWith(`${API_BASE_URL}/chats/notify`, expect.objectContaining({
    method: 'POST',
    body: JSON.stringify({
      receiverId: 'receiver-1',
      senderId: 'sender-1',
      senderProfilePic: 'https://cdn.example/sender.jpg',
      body: 'Are you free?',
      redir: '/chat/chat-1?senderId=sender-1',
    }),
  }));
});

test('fans a group message out to every member except its sender', async () => {
  await notifyGroupMessageOnce(
    'group-message-1',
    ['sender-1', 'receiver-1', 'receiver-2'],
    'Friends: Hello everyone',
    'group-1',
  );

  expect(apiRequest).toHaveBeenCalledTimes(2);
  expect(apiRequest).toHaveBeenCalledWith(`${API_BASE_URL}/chats/notify`, expect.objectContaining({
    method: 'POST',
    body: JSON.stringify({
      receiverId: 'receiver-1',
      senderId: 'sender-1',
      senderProfilePic: 'https://cdn.example/sender.jpg',
      body: 'Friends: Hello everyone',
      type: 'group_message',
      groupId: 'group-1',
      redir: '/chat/group-1?groupId=group-1',
    }),
  }));
});

test('omits sender image metadata when the sender has no profile image', async () => {
  const {getSession} = require('../src/services/sessionStore');
  jest.mocked(getSession).mockReturnValueOnce({token: 'jwt-token', user: {id: 'sender-1'}});

  await notifyMessageOnce('message-unique-no-avatar', 'receiver-1', 'Hello', 'chat-1');

  expect(apiRequest).toHaveBeenCalledWith(`${API_BASE_URL}/chats/notify`, expect.objectContaining({
    body: JSON.stringify({
      receiverId: 'receiver-1',
      senderId: 'sender-1',
      body: 'Hello',
      redir: '/chat/chat-1?senderId=sender-1',
    }),
  }));
});
