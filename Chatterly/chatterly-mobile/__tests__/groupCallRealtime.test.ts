import {
  addGroupCallParticipant,
  endGroupCall,
  joinGroupCall,
  keepGroupCallRoomJoined,
  muteGroupCallParticipant,
  removeGroupCallParticipantOverSocket,
  sendGroupCallOffer,
  startGroupCall,
  subscribeToGroupCall,
  subscribeToGroupCallInvitations,
  unmuteSelfInGroupCall,
} from '../src/services/groupCallRealtime';
import {disconnectRealtime} from '../src/services/chatRealtime';

// A stand-in socket that lets a test play the backend: it records emits and can
// fire the handlers the service registered, the same way chatRealtime.test does.
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
  disconnect: jest.fn(),
  removeAllListeners: jest.fn(() => mockListeners.clear()),
  io: {on: jest.fn()},
};

const fire = (event: string, ...args: unknown[]) =>
  (mockListeners.get(event) || []).forEach(handler => handler(...args));

const emitsOf = (event: string) => mockSocket.emit.mock.calls.filter(call => call[0] === event);

jest.mock('socket.io-client', () => ({io: () => mockSocket}));
jest.mock('../src/services/sessionStore', () => ({
  getSession: () => ({token: 'jwt', user: {id: 'me'}}),
}));

/** Answers the most recent emit of `event` the way the server's callback would. */
const acknowledge = (event: string, ack: Record<string, unknown>) => {
  const calls = emitsOf(event);
  const callback = calls[calls.length - 1]?.[2] as ((value: unknown) => void) | undefined;
  callback?.(ack);
};

// An emit the server never answers arms a 12s ACK timeout. Fake timers keep
// those from holding the worker open after the suite finishes.
beforeAll(() => { jest.useFakeTimers(); });
afterAll(() => { jest.useRealTimers(); });

beforeEach(() => {
  mockSocket.emit.mockClear();
  mockSocket.on.mockClear();
  mockSocket.off.mockClear();
  mockSocket.connected = true;
  mockListeners.clear();
});

afterEach(() => {
  disconnectRealtime();
});

test('starting a conference sends the group and normalizes the call type', async () => {
  const pending = startGroupCall('group-1', 'video');
  const [event, payload] = emitsOf('group_call_start')[0];
  expect(event).toBe('group_call_start');
  expect(payload).toEqual({groupId: 'group-1', type: 'video'});

  acknowledge('group_call_start', {success: true, groupCallId: 'call-9'});
  await expect(pending).resolves.toMatchObject({success: true, groupCallId: 'call-9'});
});

test('an unknown call type falls back to video, the way the backend defaults', async () => {
  const pending = startGroupCall('group-1', 'audio');
  expect(emitsOf('group_call_start')[0][1]).toEqual({groupId: 'group-1', type: 'audio'});
  acknowledge('group_call_start', {success: true, groupCallId: 'call-9'});
  await pending;
});

test('a missing id is rejected before anything reaches the socket', async () => {
  await expect(startGroupCall('')).rejects.toThrow(/group id is required/i);
  await expect(joinGroupCall('  ')).rejects.toThrow(/group call id is required/i);
  await expect(muteGroupCallParticipant('call-1', '')).rejects.toThrow(/participant id is required/i);
  expect(mockSocket.emit).not.toHaveBeenCalled();
});

test('the host-only events carry the call and the target participant', async () => {
  const pending = removeGroupCallParticipantOverSocket('call-1', 'u2');
  expect(emitsOf('group_call_remove_user')[0][1]).toEqual({groupCallId: 'call-1', targetUserId: 'u2'});
  acknowledge('group_call_remove_user', {success: true});
  await expect(pending).resolves.toMatchObject({success: true});

  const invite = addGroupCallParticipant('call-1', 'u3');
  expect(emitsOf('group_call_add_participant')[0][1]).toEqual({groupCallId: 'call-1', targetUserId: 'u3'});
  acknowledge('group_call_add_participant', {success: true});
  await invite;
});

test("a refusal keeps the server's own message instead of inventing one", async () => {
  const pending = endGroupCall('call-1');
  acknowledge('group_call_end', {success: false, message: 'Only admins can perform this action'});
  await expect(pending).resolves.toEqual({success: false, message: 'Only admins can perform this action'});
});

test('an ack with no message still resolves with a usable one', async () => {
  const pending = unmuteSelfInGroupCall('call-1');
  acknowledge('group_call_unmute_self', {success: true});
  await expect(pending).resolves.toEqual({success: true, message: 'Microphone on'});
});

test('WebRTC signalling is addressed to one peer inside the call', async () => {
  const pending = sendGroupCallOffer('call-1', 'u2', {type: 'offer', sdp: 'sdp'});
  expect(emitsOf('group_webrtc_offer')[0][1]).toEqual({
    groupCallId: 'call-1',
    targetUserId: 'u2',
    offer: {type: 'offer', sdp: 'sdp'},
  });
  acknowledge('group_webrtc_offer', {success: true});
  await pending;
});

test('invitations are normalized and a payload with no call id is ignored', () => {
  const onInvitation = jest.fn();
  const unsubscribe = subscribeToGroupCallInvitations(onInvitation);

  fire('group_call_invitation', {groupCallId: 'call-1', groupId: 'group-1', type: 'audio', startedBy: 'u9'});
  fire('group_call_invitation', {invitedBy: 'u9'});
  fire('group_call_invitation', {groupCallId: 'call-2', invitedBy: 'u9', isMidCallInvite: true});

  expect(onInvitation).toHaveBeenCalledTimes(2);
  expect(onInvitation).toHaveBeenNthCalledWith(1, {
    groupCallId: 'call-1',
    groupId: 'group-1',
    type: 'audio',
    startedBy: 'u9',
    invitedBy: undefined,
    isMidCallInvite: false,
  });
  // A mid-call invite carries no group at all, which is why the caller has to
  // read the call record to fill in the rest.
  expect(onInvitation).toHaveBeenNthCalledWith(2, {
    groupCallId: 'call-2',
    groupId: undefined,
    type: 'video',
    startedBy: undefined,
    invitedBy: 'u9',
    isMidCallInvite: true,
  });

  unsubscribe();
  fire('group_call_invitation', {groupCallId: 'call-3', groupId: 'group-1'});
  expect(onInvitation).toHaveBeenCalledTimes(2);
});

test('room broadcasts for another conference are ignored', () => {
  const handlers = {
    onUserJoined: jest.fn(),
    onUserLeft: jest.fn(),
    onEnded: jest.fn(),
    onUserRemoved: jest.fn(),
    onActiveSpeaker: jest.fn(),
    onScreenShareStarted: jest.fn(),
    onMutedByHost: jest.fn(),
    onLocked: jest.fn(),
  };
  const unsubscribe = subscribeToGroupCall('call-1', handlers);

  fire('group_call_user_joined', {groupCallId: 'call-1', userId: 'u2'});
  fire('group_call_user_joined', {groupCallId: 'call-2', userId: 'u3'});
  fire('group_call_user_left', {groupCallId: 'call-1', userId: 'u2'});
  fire('group_call_user_removed', {groupCallId: 'call-1', targetUserId: 'u4'});
  fire('group_call_active_speaker', {groupCallId: 'call-1', userId: 'u5'});
  fire('group_screen_share_started', {groupCallId: 'call-1', userId: 'u2'});
  fire('group_call_muted', {groupCallId: 'call-1'});
  fire('group_call_locked');
  fire('group_call_ended', {groupCallId: 'call-1', duration: 125, reason: 'No participants joined'});

  expect(handlers.onUserJoined).toHaveBeenCalledTimes(1);
  expect(handlers.onUserJoined).toHaveBeenCalledWith('u2');
  expect(handlers.onUserLeft).toHaveBeenCalledWith('u2');
  // The removal broadcast names the participant as `targetUserId`.
  expect(handlers.onUserRemoved).toHaveBeenCalledWith('u4');
  expect(handlers.onActiveSpeaker).toHaveBeenCalledWith('u5');
  expect(handlers.onScreenShareStarted).toHaveBeenCalledWith('u2');
  expect(handlers.onMutedByHost).toHaveBeenCalledTimes(1);
  expect(handlers.onLocked).toHaveBeenCalledWith(true);
  expect(handlers.onEnded).toHaveBeenCalledWith({duration: 125, reason: 'No participants joined'});

  unsubscribe();
  fire('group_call_user_joined', {groupCallId: 'call-1', userId: 'u6'});
  expect(handlers.onUserJoined).toHaveBeenCalledTimes(1);
});

test('signalling payloads are routed with the peer that sent them', () => {
  const handlers = {onOffer: jest.fn(), onAnswer: jest.fn(), onIceCandidate: jest.fn()};
  const unsubscribe = subscribeToGroupCall('call-1', handlers);

  fire('group_webrtc_offer', {groupCallId: 'call-1', fromUserId: 'u2', offer: {sdp: 'o'}});
  fire('group_webrtc_answer', {groupCallId: 'call-1', fromUserId: 'u2', answer: {sdp: 'a'}});
  fire('group_ice_candidate', {groupCallId: 'call-1', fromUserId: 'u2', candidate: {candidate: 'c'}});

  expect(handlers.onOffer).toHaveBeenCalledWith({groupCallId: 'call-1', fromUserId: 'u2', offer: {sdp: 'o'}, answer: undefined, candidate: undefined});
  expect(handlers.onAnswer).toHaveBeenCalledWith({groupCallId: 'call-1', fromUserId: 'u2', offer: undefined, answer: {sdp: 'a'}, candidate: undefined});
  expect(handlers.onIceCandidate).toHaveBeenCalledWith({groupCallId: 'call-1', fromUserId: 'u2', offer: undefined, answer: undefined, candidate: {candidate: 'c'}});

  unsubscribe();
});

test('a reconnect re-joins the conference room, but subscribing does not', () => {
  const unsubscribe = keepGroupCallRoomJoined('call-1');
  // The join that opened the call is owned by the caller, not by this watcher.
  expect(emitsOf('group_call_join')).toHaveLength(0);

  fire('connect');
  expect(emitsOf('group_call_join')).toHaveLength(1);
  expect(emitsOf('group_call_join')[0][1]).toEqual({groupCallId: 'call-1'});

  unsubscribe();
  fire('connect');
  expect(emitsOf('group_call_join')).toHaveLength(1);
});

test('an offline socket rejects rather than silently dropping the request', async () => {
  mockSocket.connected = false;
  await expect(joinGroupCall('call-1')).rejects.toThrow(/no connection/i);
});
