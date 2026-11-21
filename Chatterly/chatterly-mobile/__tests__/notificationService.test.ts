jest.mock('../src/services/chatRealtime', () => ({subscribeToLiveMessages: jest.fn(() => () => undefined)}));
import {incomingCallFromNotification, resolveNotificationConversation, startNotificationLifecycle, targetFromNotification} from '../src/services/notificationService';
import {enrichChatList, getChatList, normalizeChatList} from '../src/services/chatApi';
import * as Notifications from 'expo-notifications';
import type {NotificationResponse} from 'expo-notifications';
import {Platform} from 'react-native';
import {saveDevicePushToken} from '../src/services/notificationApi';
import * as Messaging from '@react-native-firebase/messaging';
import {getChatListActivities} from '../src/services/chatListActivity';

jest.mock('../src/services/chatApi', () => ({
  getChatList: jest.fn(),
  normalizeChatList: jest.fn(),
  enrichChatList: jest.fn(),
}));
jest.mock('../src/services/notificationApi', () => ({saveDevicePushToken: jest.fn(async () => undefined)}));
jest.mock('../src/services/sessionStore', () => ({getSession: () => ({user: {id: 'me'}})}));
jest.mock('../src/services/chatListActivity', () => ({getChatListActivities: jest.fn(() => [])}));
jest.mock('@react-native-firebase/messaging', () => ({
  getMessaging: jest.fn(() => ({app: 'ios'})),
  getToken: jest.fn(async () => 'ios-fcm-token'),
  onTokenRefresh: jest.fn(() => jest.fn()),
}));

let responseNumber = 0;
function response(content: {title?: string; data?: Record<string, unknown>}): NotificationResponse {
  return {
    actionIdentifier: 'expo.modules.notifications.actions.DEFAULT',
    notification: {date: 1000, request: {identifier: `notification-${++responseNumber}`, content}},
  } as unknown as NotificationResponse;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getChatList).mockResolvedValue([]);
  jest.mocked(normalizeChatList).mockReturnValue([]);
  jest.mocked(enrichChatList).mockResolvedValue([]);
  jest.mocked(getChatListActivities).mockReturnValue([]);
  jest.mocked(Notifications.getLastNotificationResponseAsync).mockResolvedValue(null);
});

test('summary routing prefers the conversation ID over an earlier matching sender name', async () => {
  const wrong = {id: 'wrong-chat', contact: {userId: 'wrong-person', name: 'Rahul'}};
  const right = {id: 'chat-42', contact: {userId: 'rahul-1', name: 'Rahul'}};
  jest.mocked(normalizeChatList).mockReturnValue([wrong, right] as never);
  await expect(resolveNotificationConversation({chatId: 'chat-42', contactName: 'Rahul'}))
    .resolves.toEqual({chatId: right.id, contact: right.contact});
});

test('opens group summaries as groups and retains the group redirect', async () => {
  const target = targetFromNotification(response({title: 'Rahul', data: {
    redir: '/chat/group-42?groupId=group-42', groupName: 'Friends',
  }}));
  expect(target.groupId).toBe('group-42');
  jest.mocked(getChatList).mockRejectedValueOnce(new Error('offline'));
  await expect(resolveNotificationConversation(target)).resolves.toEqual({
    chatId: 'group-42', contact: {userId: 'group-42', name: 'Friends', kind: 'group'},
  });
});

test('uses known conversation metadata when the inbox request cannot connect', async () => {
  jest.mocked(getChatList).mockRejectedValueOnce(new Error('offline'));
  await expect(resolveNotificationConversation({chatId: 'chat-42', contactId: 'rahul-1', contactName: 'Rahul'}))
    .resolves.toEqual({chatId: 'chat-42', contact: {userId: 'rahul-1', name: 'Rahul'}});
});

test('opens cached conversations without waiting for a network request', async () => {
  const contact = {userId: 'rahul-1', name: 'Rahul'};
  jest.mocked(getChatListActivities).mockReturnValue([{chatId: 'chat-42', contact}] as never);
  await expect(resolveNotificationConversation({chatId: 'chat-42'}))
    .resolves.toEqual({chatId: 'chat-42', contact});
  expect(getChatList).not.toHaveBeenCalled();
});

test('does not open an arbitrary chat when two senders have the same name', async () => {
  const rows = ['one', 'two'].map(id => ({id, contact: {userId: id, name: 'Rahul'}}));
  jest.mocked(normalizeChatList).mockReturnValue(rows as never);
  jest.mocked(enrichChatList).mockResolvedValue(rows as never);
  await expect(resolveNotificationConversation({contactName: 'Rahul'})).resolves.toBeNull();
});

test('a malformed redirect cannot prevent other notification metadata from routing', () => {
  expect(() => targetFromNotification(response({title: 'Rahul', data: {redir: '/chat/%broken'}}))).not.toThrow();
});

test('handles a cold-start summary once and routes later updates of the same summary', async () => {
  const first = response({title: 'Rahul', data: {chatId: 'chat-42'}});
  jest.mocked(Notifications.getLastNotificationResponseAsync).mockResolvedValueOnce(first);
  const onOpen = jest.fn();
  const cleanup = startNotificationLifecycle(onOpen);
  await Promise.resolve();
  await Promise.resolve();
  const receive = jest.mocked(Notifications.addNotificationResponseReceivedListener).mock.calls[0][0];
  receive(first);
  expect(onOpen).toHaveBeenCalledTimes(1);
  receive({...first, notification: {...first.notification, date: 2000}});
  expect(onOpen).toHaveBeenCalledTimes(2);
  expect(onOpen).toHaveBeenLastCalledWith(expect.objectContaining({chatId: 'chat-42'}));
  cleanup();
  receive({...first, notification: {...first.notification, date: 3000}});
  expect(onOpen).toHaveBeenCalledTimes(2);
});

test('saves an iOS FCM token instead of the APNs token and tracks FCM rotation', async () => {
  const previousPlatform = Platform.OS;
  Object.defineProperty(Platform, 'OS', {configurable: true, value: 'ios'});
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValueOnce({granted: true} as never);
  jest.mocked(Notifications.getDevicePushTokenAsync).mockResolvedValueOnce({type: 'ios', data: 'apns-token'});
  try {
    const cleanup = startNotificationLifecycle(jest.fn());
    for (let index = 0; index < 8; index++) { await Promise.resolve(); }
    expect(saveDevicePushToken).toHaveBeenCalledWith('ios-fcm-token');
    expect(saveDevicePushToken).not.toHaveBeenCalledWith('apns-token');
    const refresh = jest.mocked(Messaging.onTokenRefresh).mock.calls[0][1];
    refresh('rotated-fcm-token');
    expect(saveDevicePushToken).toHaveBeenCalledWith('rotated-fcm-token');
    const unsubscribe = jest.mocked(Messaging.onTokenRefresh).mock.results[0].value;
    cleanup();
    expect(unsubscribe).toHaveBeenCalled();
  } finally {
    Object.defineProperty(Platform, 'OS', {configurable: true, value: previousPlatform});
  }
});

test('parses explicit native data and the documented redirect route', () => {
  expect(targetFromNotification(response({
    title: 'Rahul',
    data: {redir: '/chat/chat-42?senderId=rahul-1'},
  }))).toEqual({chatId: 'chat-42', contactId: 'rahul-1', contactName: 'Rahul'});
});

test('reads the caller profile picture aliases used by push payloads', () => {
  const notification = response({title: 'Rahul', data: {
    type: 'incoming_call', callId: 'call-1', callerId: 'rahul-1',
    callerProfilePicture: 'https://cdn.example/rahul.jpg',
  }}).notification;
  expect(incomingCallFromNotification(notification)).toEqual(expect.objectContaining({
    callerProfilePic: 'https://cdn.example/rahul.jpg',
  }));
});

test('falls back to the sender title when the backend omits mobile route data', async () => {
  const row = {id: 'chat-42', contact: {userId: 'rahul-1', name: 'Rahul'}};
  jest.mocked(getChatList).mockResolvedValue([{}]);
  jest.mocked(normalizeChatList).mockReturnValue([row as never]);
  jest.mocked(enrichChatList).mockResolvedValue([row as never]);

  await expect(resolveNotificationConversation({contactName: 'Rahul'})).resolves.toEqual({
    chatId: 'chat-42',
    contact: row.contact,
  });
});

test('normalizes the documented incoming-call FCM payload', () => {
  const notificationResponse = response({
    title: 'Ananya',
    data: {
      type: 'incoming_call',
      callId: 'call-7',
      callerId: 'caller-2',
      receiverId: 'receiver-3',
      chatId: 'chat-9',
      callType: 'audio',
    },
  });

  expect(incomingCallFromNotification(notificationResponse.notification)).toEqual({
    callId: 'call-7',
    chatId: 'chat-9',
    callerId: 'caller-2',
    receiverId: 'receiver-3',
    callerName: 'Ananya',
    callerProfilePic: null,
    type: 'audio',
    status: 'calling',
    createdAt: undefined,
  });
});

test('does not treat an ordinary message notification as a call', () => {
  const notificationResponse = response({title: 'Ananya', data: {chatId: 'chat-9'}});
  expect(incomingCallFromNotification(notificationResponse.notification)).toBeNull();
});


test('never rings again for a missed-call push containing caller metadata', () => {
  const notificationResponse = response({title: 'Missed Call', data: {type: 'missed_call', callId: 'call-7', callerId: 'caller-2'}});
  expect(incomingCallFromNotification(notificationResponse.notification)).toBeNull();
});

test.each([['accept_call', 'accept'], ['reject_call', 'reject']] as const)(
  'routes %s to the incoming call handler once and dismisses its alert', async (identifier, action) => {
    const callResponse = response({title: 'Ananya', data: {
      type: 'incoming_call', callId: 'video-7', callerId: 'caller-2', callType: 'video',
    }});
    callResponse.actionIdentifier = identifier;
    jest.mocked(Notifications.getLastNotificationResponseAsync).mockResolvedValueOnce(callResponse);
    const onOpen = jest.fn();
    const onCall = jest.fn();
    const cleanup = startNotificationLifecycle(onOpen, onCall);
    await Promise.resolve();
    await Promise.resolve();
    const receive = jest.mocked(Notifications.addNotificationResponseReceivedListener).mock.calls[0][0];
    receive(callResponse);
    expect(onCall).toHaveBeenCalledTimes(1);
    expect(onCall).toHaveBeenCalledWith(expect.objectContaining({callId: 'video-7', type: 'video'}), true, action);
    expect(Notifications.dismissNotificationAsync).toHaveBeenCalledWith(callResponse.notification.request.identifier);
    expect(onOpen).not.toHaveBeenCalled();
    cleanup();
  },
);

test('a normal incoming call notification tap opens the call without accepting or rejecting', () => {
  const onCall = jest.fn();
  const cleanup = startNotificationLifecycle(jest.fn(), onCall);
  const receive = jest.mocked(Notifications.addNotificationResponseReceivedListener).mock.calls[0][0];
  receive(response({title: 'Ananya', data: {
    type: 'incoming_call', callId: 'video-tap', callerId: 'caller-2', callType: 'video',
  }}));
  expect(onCall).toHaveBeenCalledWith(expect.objectContaining({callId: 'video-tap'}), true);
  expect(Notifications.dismissNotificationAsync).not.toHaveBeenCalled();
  cleanup();
});

test('creates the Android message channel without treating default as a custom sound asset', () => {
  const previousPlatform = Platform.OS;
  Object.defineProperty(Platform, 'OS', {configurable: true, value: 'android'});
  try {
    jest.mocked(Notifications.setNotificationChannelAsync).mockClear();
    const cleanup = startNotificationLifecycle(jest.fn());

    expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledTimes(1);
    expect(jest.mocked(Notifications.setNotificationChannelAsync).mock.calls[0][1]).not.toHaveProperty('sound');
    cleanup();
  } finally {
    Object.defineProperty(Platform, 'OS', {configurable: true, value: previousPlatform});
  }
});
