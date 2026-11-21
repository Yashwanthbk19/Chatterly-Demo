import {
  addCallParticipantOverSocket,
  emitTyping,
  emitMessageDeletedForEveryone,
  emitMessagePinned,
  emitMessageUnpinned,
  forwardGroupMessageOverSocket,
  sendGroupMessageOverSocket,
  sendMessageOverSocket,
  sendCallAnswerOverSocket,
  sendCallOfferOverSocket,
  sendIceCandidateOverSocket,
  subscribeToCall,
  subscribeToChat,
  subscribeToInbox,
  subscribeToLiveMessages,
  subscribeToGroup,
  subscribeToGroupFileShares,
  subscribeToGroupChanges,
  subscribeToOnlineUsers,
  disconnectRealtime,
  initiateCallOverSocket,
  subscribeToIncomingCalls,
  joinConferenceOverSocket,
} from '../src/services/chatRealtime';

// A stand-in for the socket.io client that lets a test play the server: it
// records emits and can fire the handlers the service registered.
type Listener = (...args: unknown[]) => void;
const mockListeners = new Map<string, Listener[]>();

const mockSocket = {
  connected: true,
  on: jest.fn((event: string, handler: Listener) => {
    mockListeners.set(event, [...(mockListeners.get(event) || []), handler]);
  }),
  off: jest.fn((event: string, handler?: Listener) => {
    if (!handler) { mockListeners.delete(event); return; }
    mockListeners.set(event, (mockListeners.get(event) || []).filter(item => item !== handler));
  }),
  emit: jest.fn(),
  timeout: jest.fn(),
  connect: jest.fn(),
  disconnect: jest.fn(),
  removeAllListeners: jest.fn(() => mockListeners.clear()),
  io: {on: jest.fn()},
};

/** Fires everything registered for `event`, the way the server would. */
const fire = (event: string, ...args: unknown[]) =>
  (mockListeners.get(event) || []).forEach(handler => handler(...args));

/** The payload of the nth emit of a given event. */
const emitsOf = (event: string) =>
  mockSocket.emit.mock.calls.filter(call => call[0] === event);

jest.mock('socket.io-client', () => ({io: () => mockSocket}));
jest.mock('../src/services/sessionStore', () => ({
  getSession: () => ({token: 'jwt', user: {id: 'me'}}),
}));

const handlers = () => ({
  onMessage: jest.fn(),
  onDelivered: jest.fn(),
  onRead: jest.fn(),
  onPresence: jest.fn(),
  onTyping: jest.fn(),
  onDeleted: jest.fn(),
  onPinned: jest.fn(),
  onUnpinned: jest.fn(),
});

beforeEach(() => {
  disconnectRealtime();
  mockListeners.clear();
  jest.clearAllMocks();
  mockSocket.connected = true;
});

test('presents conference invitations and detaches the listener when signed out', () => {
  const incoming = jest.fn();
  const unsubscribe = subscribeToIncomingCalls(incoming);
  fire('conference_call_invite', {callId: 'live-call', invitedBy: 'inviter'});
  expect(incoming).toHaveBeenCalledWith(expect.objectContaining({callId: 'live-call', callerId: 'inviter', conference: true, status: 'calling'}));
  unsubscribe();
  fire('conference_call_invite', {callId: 'another-call', invitedBy: 'inviter'});
  expect(incoming).toHaveBeenCalledTimes(1);
});

test('accepts an added participant using the existing conference join contract', async () => {
  const pending = joinConferenceOverSocket('live-call');
  await Promise.resolve();
  const [event, payload, acknowledge] = emitsOf('call_join_conference')[0];
  expect(event).toBe('call_join_conference');
  expect(payload).toEqual({callId: 'live-call'});
  acknowledge({success: true});
  await expect(pending).resolves.toEqual(expect.objectContaining({success: true}));
});

test('a Call List callback waits for the existing socket to reconnect and initiates exactly once', async () => {
  mockSocket.connected = false;
  const pending = initiateCallOverSocket('selected-contact', 'video');
  expect(emitsOf('call_initiate')).toHaveLength(0);
  mockSocket.connected = true;
  fire('connect');
  await Promise.resolve();
  const attempts = emitsOf('call_initiate');
  expect(attempts).toHaveLength(1);
  expect(attempts[0][1]).toEqual({receiverId: 'selected-contact', type: 'video'});
  attempts[0][2]({success: true, callId: 'new-call', chatId: 'existing-chat'});
  await expect(pending).resolves.toEqual(expect.objectContaining({success: true, callId: 'new-call'}));
});

test('an unavailable call connection fails after a bounded wait and never emits a late initiation', async () => {
  jest.useFakeTimers();
  try {
    mockSocket.connected = false;
    const pending = initiateCallOverSocket('selected-contact', 'audio');
    const rejected = pending.catch(error => error as Error);
    await jest.advanceTimersByTimeAsync(12000);
    expect(await rejected).toEqual(new Error('No connection. Reconnecting...'));
    mockSocket.connected = true;
    fire('connect');
    expect(emitsOf('call_initiate')).toHaveLength(0);
  } finally { jest.useRealTimers(); }
});

test('replays presence, replaces snapshots, handles offline events and clears on disconnect', () => {
  const first = jest.fn();
  const unsubscribeFirst = subscribeToOnlineUsers(first);
  expect(first).toHaveBeenLastCalledWith(new Set());
  fire('online_users', {userIds: ['user-1', 'user-2']});
  const second = jest.fn();
  const unsubscribeSecond = subscribeToOnlineUsers(second);
  expect(second).toHaveBeenLastCalledWith(new Set(['user-1', 'user-2']));
  fire('user_offline', {userId: 'user-1'});
  expect(second).toHaveBeenLastCalledWith(new Set(['user-2']));
  fire('user_online', {userId: 'user-3'});
  expect(second).toHaveBeenLastCalledWith(new Set(['user-2', 'user-3']));
  fire('online_users', {userIds: ['user-3']});
  expect(second).toHaveBeenLastCalledWith(new Set(['user-3']));
  fire('disconnect');
  expect(second).toHaveBeenLastCalledWith(new Set());
  fire('connect');
  fire('online_users', {userIds: ['user-2']});
  expect(second).toHaveBeenLastCalledWith(new Set(['user-2']));
  unsubscribeFirst();
  unsubscribeSecond();
  const count = second.mock.calls.length;
  fire('user_online', {userId: 'user-4'});
  expect(second).toHaveBeenCalledTimes(count);
});

test('group admin changes reach only their group and stop after unsubscribing', () => {
  const onChange = jest.fn();
  const unsubscribe = subscribeToGroupChanges('group-1', onChange);
  expect(emitsOf('joinGroup')).toEqual([['joinGroup', {groupId: 'group-1'}]]);

  fire('group_member_muted', {groupId: 'group-2', userId: 'u1', isMuted: true});
  fire('group_member_muted', {groupId: 'group-1', userId: 'u1', isMuted: true});
  fire('group_settings_updated', {groupId: 'group-1', settings: {onlyAdminsCanMessage: true}});
  expect(onChange.mock.calls).toEqual([
    [{type: 'group_member_muted', userId: 'u1', isMuted: true}],
    [{type: 'group_settings_updated', userId: undefined, isMuted: undefined}],
  ]);

  unsubscribe();
  fire('group_member_muted', {groupId: 'group-1', userId: 'u1', isMuted: false});
  expect(onChange).toHaveBeenCalledTimes(2);
  // The open conversation owns room membership, so this subscription never leaves.
  expect(emitsOf('leaveGroup')).toHaveLength(0);
});

test('registers once per connection instead of on every call that needs the socket', () => {
  // Registration is expensive server-side - it re-reads the online set, flips
  // queued messages to delivered and replays missed ones - and emitTyping runs
  // on every keystroke.
  emitTyping('friend', true);
  emitTyping('friend', false);
  emitTyping('friend', true);

  expect(emitsOf('registerUser')).toHaveLength(1);
});

test('adds a selected participant through the active call socket', async () => {
  const pending = addCallParticipantOverSocket('call-1', 'user-aarav');
  const [, payload, ack] = mockSocket.emit.mock.calls.find(call => call[0] === 'call_add_participant')!;

  expect(payload).toEqual({callId: 'call-1', targetUserId: 'user-aarav'});
  (ack as (value: unknown) => void)({success: true, message: 'Conference invitation sent'});

  await expect(pending).resolves.toEqual(expect.objectContaining({success: true, message: 'Conference invitation sent'}));
});

test('relays one-to-one WebRTC signaling through the active call socket', async () => {
  const offer = {type: 'offer', sdp: 'offer-sdp'};
  const answer = {type: 'answer', sdp: 'answer-sdp'};
  const candidate = {candidate: 'candidate-line', sdpMid: '0', sdpMLineIndex: 0};

  const offerPending = sendCallOfferOverSocket('call-1', offer);
  const [, offerPayload, offerAck] = mockSocket.emit.mock.calls.find(call => call[0] === 'webrtc_offer')!;
  expect(offerPayload).toEqual({callId: 'call-1', offer});
  (offerAck as (value: unknown) => void)({success: true});
  await expect(offerPending).resolves.toEqual(expect.objectContaining({success: true}));

  const answerPending = sendCallAnswerOverSocket('call-1', answer);
  const [, answerPayload, answerAck] = mockSocket.emit.mock.calls.find(call => call[0] === 'webrtc_answer')!;
  expect(answerPayload).toEqual({callId: 'call-1', answer});
  (answerAck as (value: unknown) => void)({success: true});
  await expect(answerPending).resolves.toEqual(expect.objectContaining({success: true}));

  const icePending = sendIceCandidateOverSocket('call-1', candidate);
  const [, icePayload, iceAck] = mockSocket.emit.mock.calls.find(call => call[0] === 'ice_candidate')!;
  expect(icePayload).toEqual({callId: 'call-1', candidate});
  (iceAck as (value: unknown) => void)({success: true});
  await expect(icePending).resolves.toEqual(expect.objectContaining({success: true}));
});

test('routes WebRTC signal events only to the subscribed call', () => {
  const onSignal = jest.fn();
  subscribeToCall('call-1', {onSignal});

  fire('webrtc_offer', {callId: 'other-call', offer: {type: 'offer'}});
  expect(onSignal).not.toHaveBeenCalled();

  fire('webrtc_offer', {callId: 'call-1', offer: {type: 'offer', sdp: 'offer-sdp'}, from: 'friend'});
  fire('webrtc_answer', {callId: 'call-1', answer: {type: 'answer', sdp: 'answer-sdp'}, from: 'friend'});
  fire('ice_candidate', {callId: 'call-1', candidate: {candidate: 'candidate-line'}, from: 'friend'});

  expect(onSignal.mock.calls).toEqual([
    [expect.objectContaining({callId: 'call-1', type: 'offer', offer: expect.objectContaining({sdp: 'offer-sdp'}), from: 'friend'})],
    [expect.objectContaining({callId: 'call-1', type: 'answer', answer: expect.objectContaining({sdp: 'answer-sdp'}), from: 'friend'})],
    [expect.objectContaining({callId: 'call-1', type: 'ice', candidate: expect.objectContaining({candidate: 'candidate-line'}), from: 'friend'})],
  ]);
});

test('rejoins the existing call room after a network handover and detaches on cleanup', () => {
  const unsubscribe = subscribeToCall('active-call', {});
  fire('disconnect');
  fire('connect');
  expect(emitsOf('call_join_room').map(([, payload]) => payload)).toEqual([{callId: 'active-call'}]);
  unsubscribe();
  fire('connect');
  expect(emitsOf('call_join_room')).toHaveLength(1);
});

test('sends text under encryptedContent with the client id, and resolves on the ACK', async () => {
  const pending = sendMessageOverSocket({receiverId: 'friend', tempId: 'temp-1', text: 'Hi'});

  const [, payload, ack] = mockSocket.emit.mock.calls.find(call => call[0] === 'sendMessage')!;
  // The backend persists one-to-one text from `encryptedContent`; any other key
  // makes it store an empty body and reject the send as empty.
  expect(payload).toEqual(expect.objectContaining({
    sender: 'me',
    receiver: 'friend',
    tempId: 'temp-1',
    encryptedContent: 'Hi',
  }));

  (ack as (value: unknown) => void)({success: true, tempId: 'temp-1', messageId: 'server-1', status: 'sent'});

  await expect(pending).resolves.toEqual(expect.objectContaining({messageId: 'server-1', status: 'sent'}));
});

test('rejects when the server refuses the send', async () => {
  const pending = sendMessageOverSocket({receiverId: 'friend', tempId: 'temp-2', text: 'Hi'});
  const [, , ack] = mockSocket.emit.mock.calls.find(call => call[0] === 'sendMessage')!;

  (ack as (value: unknown) => void)({success: false, error: 'You are blocked by this user'});

  await expect(pending).rejects.toThrow('You are blocked by this user');
});

test('rejects without emitting while the socket is down', async () => {
  mockSocket.connected = false;

  await expect(sendMessageOverSocket({receiverId: 'friend', tempId: 'temp-3', text: 'Hi'})).rejects.toThrow();
  expect(emitsOf('sendMessage')).toHaveLength(0);
});

test('sends a group message through the group room and reconciles the server record', async () => {
  const pending = sendGroupMessageOverSocket({groupId: 'group-1', tempId: 'group-temp-1', text: 'Hello group'});

  expect(emitsOf('joinGroup')).toContainEqual(['joinGroup', {groupId: 'group-1'}]);
  const [, payload, ack] = mockSocket.emit.mock.calls.find(call => call[0] === 'sendGroupMessage')!;
  expect(payload).toEqual({sender: 'me', groupId: 'group-1', tempId: 'group-temp-1', message: 'Hello group'});

  (ack as (value: unknown) => void)({
    success: true,
    data: {
      _id: 'group-message-1',
      sender: {_id: 'me', name: 'Me'},
      groupId: 'group-1',
      content: 'Hello group',
      status: 'sent',
      createdAt: '2026-09-18T10:00:00.000Z',
    },
  });

  await expect(pending).resolves.toEqual(expect.objectContaining({
    id: 'group-message-1',
    tempId: 'group-temp-1',
    text: 'Hello group',
    isOwn: true,
    status: 'sent',
  }));
});

test('forwards a group message through the server event that preserves its forwarded status', async () => {
  const pending = forwardGroupMessageOverSocket({
    groupId: 'group-1', originalMessageId: 'original-1', tempId: 'forward-temp-1',
  });
  const [, payload, ack] = mockSocket.emit.mock.calls.find(call => call[0] === 'forwardGroupMessage')!;

  expect(payload).toEqual({
    sender: 'me', groupId: 'group-1', originalMessageId: 'original-1', tempId: 'forward-temp-1',
  });
  (ack as (value: unknown) => void)({success: true});

  await expect(pending).resolves.toBeUndefined();
});

test('keeps the forwarded flag on received group messages for the message label', () => {
  const onMessage = jest.fn();
  subscribeToGroup('group-1', onMessage);

  fire('receiveGroupMessage', {
    _id: 'group-forwarded-1', groupId: 'group-1', sender: {_id: 'friend'},
    content: 'Forwarded update', isForwarded: true,
  });

  expect(onMessage).toHaveBeenCalledWith(expect.objectContaining({
    id: 'group-forwarded-1', isForwarded: true,
  }));
});

test('group-call file watchers receive one remote file for their group without leaving its shared room', () => {
  const onFile = jest.fn();
  const unsubscribe = subscribeToGroupFileShares('group-1', onFile);

  fire('receiveGroupMessage', {
    _id: 'other-group-file', groupId: 'group-2', sender: {_id: 'friend', name: 'Bishod'},
    messageType: 'file', fileName: 'other.pdf', mediaUrl: 'https://cdn.example/other.pdf',
  });
  fire('receiveGroupMessage', {
    _id: 'plain-text', groupId: 'group-1', sender: {_id: 'friend', name: 'Bishod'},
    messageType: 'text', content: 'Hello',
  });
  const shared = {
    _id: 'shared-file', groupId: 'group-1', sender: {_id: 'friend', name: 'Bishod Thomas'},
    messageType: 'file', fileName: 'sprint.pdf', mediaUrl: 'https://cdn.example/sprint.pdf',
  };
  fire('receiveGroupMessage', shared);
  fire('receiveGroupMessage', shared);

  expect(onFile).toHaveBeenCalledTimes(1);
  expect(onFile).toHaveBeenCalledWith(expect.objectContaining({
    id: 'shared-file', chatId: 'group-1', fileName: 'sprint.pdf', senderName: 'Bishod Thomas',
  }));

  unsubscribe();
  expect(emitsOf('leaveGroup')).toHaveLength(0);
  fire('receiveGroupMessage', {...shared, _id: 'after-unsubscribe'});
  expect(onFile).toHaveBeenCalledTimes(1);
});

test('group-call file watchers deliver the sender own successful upload exactly once', () => {
  const onFile = jest.fn();
  const unsubscribe = subscribeToGroupFileShares('group-1', onFile);
  const upload = {
    _id: 'own-file', groupId: 'group-1', sender: 'me',
    messageType: 'file', fileName: 'mine.pdf', mediaUrl: 'https://cdn.example/mine.pdf',
  };

  fire('receiveGroupMessage', upload);
  fire('receiveGroupMessage', {data: upload});

  expect(onFile).toHaveBeenCalledTimes(1);
  expect(onFile).toHaveBeenCalledWith(expect.objectContaining({
    id: 'own-file', chatId: 'group-1', isOwn: true, fileName: 'mine.pdf',
  }));
  unsubscribe();
});

test('uses the group reply event when replying to a group message', async () => {
  const pending = sendGroupMessageOverSocket({
    groupId: 'group-1', tempId: 'group-temp-2', text: 'Reply', replyTo: 'original-1',
  });
  const [, payload, ack] = mockSocket.emit.mock.calls.find(call => call[0] === 'replyGroupMessage')!;

  expect(payload).toEqual(expect.objectContaining({
    sender: 'me', groupId: 'group-1', tempId: 'group-temp-2', message: 'Reply', replyTo: 'original-1',
  }));
  (ack as (value: unknown) => void)({
    success: true,
    data: {_id: 'group-reply-1', sender: {_id: 'me'}, groupId: 'group-1', content: 'Reply', replyTo: 'original-1'},
  });

  await expect(pending).resolves.toEqual(expect.objectContaining({id: 'group-reply-1', replyTo: 'original-1'}));
});

test('delivers a message that belongs to the open conversation', () => {
  const given = handlers();
  subscribeToChat('chat-1', 'friend', given);

  fire('receiveMessage', {
    _id: 'message-1',
    chatId: 'chat-1',
    sender: {_id: 'friend'},
    receiver: {_id: 'me'},
    encryptedContent: 'Hello',
    createdAt: '2026-08-24T00:55:00.000Z',
  });

  expect(given.onMessage).toHaveBeenCalledWith(expect.objectContaining({id: 'message-1', text: 'Hello'}));
});

test('unwraps a forwarded message event and ignores its transport status text', () => {
  const given = handlers();
  subscribeToChat('chat-1', 'friend', given);

  fire('receiveMessage', {
    message: 'New Message Sent',
    data: {
      _id: 'forwarded-1', chatId: 'chat-1', sender: {_id: 'me'},
      receiver: {_id: 'friend'}, encryptedContent: 'Original text', isForwarded: true,
    },
  });

  expect(given.onMessage).toHaveBeenCalledTimes(1);
  expect(given.onMessage).toHaveBeenCalledWith(expect.objectContaining({
    id: 'forwarded-1', text: 'Original text', isForwarded: true,
  }));
});

test('does not render a New Message Sent status acknowledgement as a message', () => {
  const given = handlers();
  subscribeToChat('chat-1', 'friend', given);
  fire('receiveMessage', {message: 'New Message Sent', success: true});
  expect(given.onMessage).not.toHaveBeenCalled();
});

test('ignores a message from another conversation', () => {
  // `registerUser` auto-joins this socket to every one-to-one room, so the open
  // thread hears about messages it must not render.
  const given = handlers();
  subscribeToChat('chat-1', 'friend', given);

  fire('receiveMessage', {
    _id: 'message-2',
    chatId: 'chat-2',
    sender: {_id: 'someone-else'},
    receiver: {_id: 'me'},
    encryptedContent: 'Meant for another chat',
    createdAt: '2026-08-24T00:56:00.000Z',
  });

  expect(given.onMessage).not.toHaveBeenCalled();
});

test('shows the same message once when the room broadcast and the replay overlap', () => {
  const given = handlers();
  subscribeToChat('chat-1', 'friend', given);

  const record = {
    _id: 'message-3',
    chatId: 'chat-1',
    sender: {_id: 'friend'},
    receiver: {_id: 'me'},
    encryptedContent: 'Hello',
    createdAt: '2026-08-24T00:57:00.000Z',
  };

  fire('receiveMessage', record);
  fire('missed_messages', [record]);

  expect(given.onMessage).toHaveBeenCalledTimes(1);
});

test('routes delivery and read receipts, filtering reads by conversation', () => {
  const given = handlers();
  subscribeToChat('chat-1', 'friend', given);

  fire('message_delivered', {messageId: 'message-1'});
  expect(given.onDelivered).toHaveBeenCalledWith('message-1');

  fire('messages_read', {chatId: 'chat-1', messageIds: ['message-1']});
  expect(given.onRead).toHaveBeenCalledWith(['message-1']);

  given.onRead.mockClear();
  fire('messages_read', {chatId: 'chat-2', messageIds: ['message-9']});
  expect(given.onRead).not.toHaveBeenCalled();
});

test('broadcasts a sender deletion and routes the everyone tombstone event', () => {
  const given = handlers();
  subscribeToChat('chat-1', 'friend', given);

  emitMessageDeletedForEveryone('message-1');
  expect(emitsOf('deleteMessageForEveryone')).toContainEqual([
    'deleteMessageForEveryone', {messageId: 'message-1', userId: 'me'},
  ]);

  fire('message_deleted', {messageId: 'message-1', type: 'everyone'});
  expect(given.onDeleted).toHaveBeenCalledWith('message-1', 'everyone');
});

test('broadcasts and routes pin state events', () => {
  const given = handlers();
  subscribeToChat('chat-1', 'friend', given);

  emitMessagePinned('message-1');
  expect(emitsOf('pinMessage')).toContainEqual([
    'pinMessage', {messageId: 'message-1', userId: 'me'},
  ]);

  fire('message_pinned', {messageId: 'message-1', pinnedAt: '2026-08-24T00:58:00.000Z'});
  expect(given.onPinned).toHaveBeenCalledWith('message-1', '2026-08-24T00:58:00.000Z');

  emitMessageUnpinned('message-1');
  expect(emitsOf('unpinMessage')).toContainEqual([
    'unpinMessage', {messageId: 'message-1'},
  ]);

  fire('message_unpinned', {messageId: 'message-1'});
  expect(given.onUnpinned).toHaveBeenCalledWith('message-1');
});

test('reports the contact typing only for the open conversation', () => {
  const given = handlers();
  subscribeToChat('chat-1', 'friend', given);

  fire('userTyping', {sender: 'friend'});
  expect(given.onTyping).toHaveBeenCalledWith(true);

  given.onTyping.mockClear();
  fire('userTyping', {sender: 'someone-else'});
  expect(given.onTyping).not.toHaveBeenCalled();
});

test('shares typing between the inbox and open chat, replays it across navigation and ignores our own events', () => {
  const onTyping = jest.fn();
  const unsubscribeInbox = subscribeToInbox({onTyping});
  fire('userTyping', {sender: 'friend'});
  expect(onTyping).toHaveBeenLastCalledWith('friend', true);
  unsubscribeInbox();

  const given = handlers();
  const unsubscribeChat = subscribeToChat('chat-1', 'friend', given);
  expect(given.onTyping).toHaveBeenLastCalledWith(true);
  fire('userStopTyping', {sender: 'friend'});
  expect(given.onTyping).toHaveBeenLastCalledWith(false);
  const calls = given.onTyping.mock.calls.length;
  fire('userTyping', {sender: 'me'});
  fire('userTyping', {});
  expect(given.onTyping).toHaveBeenCalledTimes(calls);

  unsubscribeChat();
  const nextInbox = jest.fn();
  const unsubscribeNext = subscribeToInbox({onTyping: nextInbox});
  fire('userTyping', {sender: 'friend'});
  expect(nextInbox).toHaveBeenLastCalledWith('friend', true);
  expect(onTyping).toHaveBeenCalledTimes(1);
  expect(given.onTyping).toHaveBeenCalledTimes(calls);
  fire('userStopTyping', {sender: 'friend'});
  unsubscribeNext();
});

test('refreshes typing expiry while keystrokes arrive and clears a missing stop event', () => {
  jest.useFakeTimers();
  try {
    const onTyping = jest.fn();
    const unsubscribe = subscribeToInbox({onTyping});
    fire('userTyping', {sender: 'friend'});
    jest.advanceTimersByTime(4000);
    fire('userTyping', {sender: 'friend'});
    jest.advanceTimersByTime(4000);
    expect(onTyping).toHaveBeenLastCalledWith('friend', true);
    jest.advanceTimersByTime(1000);
    expect(onTyping).toHaveBeenLastCalledWith('friend', false);
    unsubscribe();
  } finally {
    disconnectRealtime();
    jest.useRealTimers();
  }
});

test.each(['message', 'offline', 'disconnect'])('clears typing in both views on %s', event => {
  const onTyping = jest.fn();
  subscribeToInbox({onTyping});
  const given = handlers();
  subscribeToChat('chat-1', 'friend', given);
  fire('userTyping', {sender: 'friend'});
  if (event === 'message') {
    fire('receiveMessage', {_id: 'new-message', sender: 'friend', receiver: 'me', chatId: 'chat-1', content: 'Hello'});
  } else if (event === 'offline') {
    fire('user_offline', {userId: 'friend'});
  } else {
    fire('disconnect');
  }
  expect(onTyping).toHaveBeenLastCalledWith('friend', false);
  expect(given.onTyping).toHaveBeenLastCalledWith(false);
});


test('rules changes refresh only the matching group and unsubscribe cleanly', () => {
  const onChange = jest.fn();
  const unsubscribe = subscribeToGroupChanges('g1', onChange);
  fire('group_rules_updated', {groupId: 'other', rules: []});
  expect(onChange).not.toHaveBeenCalled();
  fire('group_rules_updated', {groupId: 'g1', rules: ['Updated']});
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({type: 'group_rules_updated'}));
  unsubscribe();
  fire('group_rules_updated', {groupId: 'g1', rules: []});
  expect(onChange).toHaveBeenCalledTimes(1);
});

test('persisted rules notices reach both group conversations and list previews', () => {
  const onMessage = jest.fn();
  const inbox = handlers();
  const stopGroup = subscribeToGroup('g1', onMessage);
  const stopInbox = subscribeToInbox(inbox);
  fire('receiveGroupMessage', {_id: 'notice-1', groupId: 'g1', sender: 'other', encryptedContent: 'Group rules updated.', messageType: 'text', createdAt: '2026-10-16T10:00:00Z'});
  expect(onMessage).toHaveBeenCalledWith(expect.objectContaining({id: 'notice-1', text: 'Group rules updated.', systemEvent: true}));
  expect(inbox.onMessage).toHaveBeenCalledWith(expect.objectContaining({chatId: 'g1', text: 'Group rules updated.', systemEvent: true}));
  stopGroup(); stopInbox();
});

// After a Wi-Fi to mobile data switch the server only drops the old connection
// about a minute later. It then marks the user offline and starts the 10-second
// clock that ends a connected call, even though a new connection is already up.
test('registers again when the server announces us offline while we are still connected', () => {
  subscribeToOnlineUsers(jest.fn());
  mockSocket.emit.mockClear();

  fire('user_offline', {userId: 'someone-else'});
  expect(emitsOf('registerUser')).toHaveLength(0);

  fire('user_offline', {userId: 'me'});
  expect(emitsOf('registerUser')).toEqual([['registerUser', 'me']]);

  // Two old connections timing out together must not flood the server.
  fire('user_offline', {userId: 'me'});
  expect(emitsOf('registerUser')).toHaveLength(1);
});

test('does not register again when the connection that closed was our only one', () => {
  subscribeToOnlineUsers(jest.fn());
  mockSocket.emit.mockClear();
  mockSocket.connected = false;

  fire('user_offline', {userId: 'me'});

  expect(emitsOf('registerUser')).toHaveLength(0);
});

const netInfo = () => require('@react-native-community/netinfo') as {addEventListener: jest.Mock};
const networkListener = () => netInfo().addEventListener.mock.calls.at(-1)![0] as (state: unknown) => void;
const wifi = {type: 'wifi', isConnected: true, isInternetReachable: true, details: {ipAddress: '192.168.1.5'}};
const mobileData = {type: 'cellular', isConnected: true, isInternetReachable: true, details: {}};

describe('checking the socket after the network changes', () => {
  const timedEmit = jest.fn();
  beforeEach(() => {
    timedEmit.mockClear();
    mockSocket.timeout.mockReturnValue({emit: timedEmit});
    subscribeToOnlineUsers(jest.fn());
  });

  test('asks the server to answer after a switch to mobile data and keeps the connection when it does', () => {
    const changed = networkListener();
    changed(wifi);
    expect(mockSocket.timeout).not.toHaveBeenCalled();

    changed(mobileData);

    expect(mockSocket.timeout).toHaveBeenCalledWith(4000);
    expect(timedEmit).toHaveBeenCalledWith('registerUser', 'me', expect.any(Function));
    timedEmit.mock.calls[0][2](null, {success: true});
    expect(mockSocket.disconnect).not.toHaveBeenCalled();
  });

  test('replaces the connection at once when the server does not answer', () => {
    const changed = networkListener();
    changed(wifi);
    changed(mobileData);

    timedEmit.mock.calls[0][2](new Error('operation has timed out'));

    expect(mockSocket.disconnect).toHaveBeenCalledTimes(1);
    expect(mockSocket.connect).toHaveBeenCalledTimes(1);
  });

  test('checks again when the network comes back, and leaves an unchanged network alone', () => {
    const changed = networkListener();
    changed(wifi);
    changed({...wifi});
    expect(mockSocket.timeout).not.toHaveBeenCalled();

    changed({type: 'none', isConnected: false, isInternetReachable: false, details: null});
    expect(mockSocket.timeout).not.toHaveBeenCalled();
    changed(wifi);

    expect(mockSocket.timeout).toHaveBeenCalledTimes(1);
  });

  test('does not wait out a reconnect delay when the network changes while the socket is down', () => {
    const changed = networkListener();
    changed(wifi);
    mockSocket.connected = false;

    changed(mobileData);

    expect(mockSocket.connect).toHaveBeenCalledTimes(1);
    expect(mockSocket.timeout).not.toHaveBeenCalled();
  });

  test('stops watching the network when realtime is disconnected', () => {
    const stop = netInfo().addEventListener.mock.results.at(-1)!.value as jest.Mock;

    disconnectRealtime();

    expect(stop).toHaveBeenCalledTimes(1);
  });
});


test('live notification receipts exclude history, own messages, call logs and duplicate delivery', () => {
  const receive = jest.fn();
  const stop = subscribeToLiveMessages(receive);
  const message = {_id: 'live-receipt', sender: 'other', receiver: 'me', chatId: 'chat', content: 'hello', messageType: 'text'};
  fire('missed_messages', [message]);
  expect(receive).not.toHaveBeenCalled();
  fire('receiveMessage', {...message, _id: 'mine', sender: 'me'});
  fire('receiveMessage', {...message, _id: 'log', messageType: 'call'});
  expect(receive).not.toHaveBeenCalled();
  fire('receiveMessage', message);
  fire('receiveMessage', {data: message});
  expect(receive).toHaveBeenCalledTimes(1);
  expect(receive).toHaveBeenLastCalledWith(expect.objectContaining({id: 'live-receipt'}), false);
  fire('receiveGroupMessage', {...message, _id: 'group-live', groupId: 'group'});
  expect(receive).toHaveBeenLastCalledWith(expect.objectContaining({id: 'group-live'}), true);
  stop();
  fire('receiveMessage', {...message, _id: 'after-stop'});
  expect(receive).toHaveBeenCalledTimes(2);
});
