import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { CALL_STATUS, CALL_TYPE } from '../src/utils/callState.js';

const readSource = (path) => readFileSync(new URL(path, import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const socketSource = readSource('../src/utils/socketService.js');
const pageSource = readSource('../src/pages/ChatListPage.jsx');
const presenceSource = readSource('../src/utils/presence.js');
const section = (source, start, end) => {
  const first = source.indexOf(start);
  const last = source.indexOf(end, first);
  assert.ok(first >= 0 && last > first, `Production code must contain ${start}`);
  return source.slice(first, last);
};

// Use the production socket validation/emission methods with a fake transport.
// No real call, microphone, socket connection or history write occurs in tests.
const socketMethods = [
  section(socketSource, '  isUserOnline(userId)', '\n  // True once'),
  section(socketSource, '  hasLivePresence()', '\n  replaceOnlineUsers('),
  section(socketSource, '  emitCallEvent(', '\n  // Shared helper'),
  section(socketSource, '  initiateCall(', '\n  startGroupCall('),
  section(socketSource, '  acceptCall(', '\n  rejectCall('),
].join('\n');
const socketError = section(socketSource, 'const createSocketError =', '\nconst normalizeSocketAckPayload');
const createSocketHarness = ({ online = false, live = true, onRegister = () => {}, ack } = {}) => {
  const emissions = [];
  const timers = new Map();
  let timerId = 0;
  const Socket = runInNewContext(`${socketError}\n(class { ${socketMethods} })`, {
    SOCKET_ACK_TIMEOUT_MS: 10000,
    window: {
      setTimeout(callback) { timers.set(++timerId, callback); return timerId; },
      clearTimeout(id) { timers.delete(id); },
    },
  });
  const service = new Socket();
  service.onlineUserIds = new Set(online ? ['peer-1'] : []);
  service.socketState = { isConnected: true, presenceSyncedAt: live ? 1 : 0 };
  service.ensureRegisteredCurrentUser = async () => { onRegister(service); };
  service.socket = {
    emit(event, payload, callback) {
      emissions.push({ event, payload });
      callback(ack || { success: true, callId: 'real-call-1' });
    },
  };
  return { service, emissions, timers };
};

test('an offline recipient is rejected before a call event or timeout is created', async () => {
  const { service, emissions, timers } = createSocketHarness();
  await assert.rejects(service.initiateCall({ receiverId: 'peer-1' }), { code: 'SOCKET_CALL_RECEIVER_OFFLINE' });
  assert.equal(emissions.length, 0);
  assert.equal(timers.size, 0);
});

test('availability is checked again after registration before sending the call', async () => {
  const { service, emissions } = createSocketHarness({ online: true, onRegister: (socket) => socket.onlineUserIds.clear() });
  await assert.rejects(service.initiateCall({ receiverId: 'peer-1' }), { code: 'SOCKET_CALL_RECEIVER_OFFLINE' });
  assert.equal(emissions.length, 0);
});

test('an unknown live roster cannot create an unverified call record', async () => {
  const { service, emissions } = createSocketHarness({ online: true, live: false });
  await assert.rejects(service.initiateCall({ receiverId: 'peer-1' }), { code: 'SOCKET_CALL_PRESENCE_UNAVAILABLE' });
  assert.equal(emissions.length, 0);
});

test('online audio/video calls keep their existing signaling payload', async () => {
  for (const type of [CALL_TYPE.AUDIO, CALL_TYPE.VIDEO]) {
    const { service, emissions, timers } = createSocketHarness({ online: true });
    const response = await service.initiateCall({ receiverId: ' peer-1 ', type, userId: 'me', token: 'test-token' });
    assert.equal(response.callId, 'real-call-1');
    assert.equal(emissions[0].event, 'call_initiate');
    assert.equal(emissions[0].payload.receiverId, 'peer-1');
    assert.equal(emissions[0].payload.type, type);
    assert.equal(timers.size, 0);
  }
});

test('incoming-call actions and group calls do not require a direct recipient roster entry', async () => {
  const { service, emissions } = createSocketHarness({ live: false });
  await service.emitCallEvent('call_accept', { callId: 'incoming-call' });
  await service.emitCallEvent('group_call_start', { groupId: 'group-1', type: 'audio' });
  assert.deepEqual(emissions.map((item) => item.event), ['call_accept', 'group_call_start']);
});

test('a cancelled incoming accept is revalidated after registration without emitting or starting a timeout', async () => {
  let registered = false;
  const { service, emissions, timers } = createSocketHarness({ onRegister: () => { registered = true; } });
  await assert.rejects(service.acceptCall({
    callId: 'incoming-call',
    beforeEmit() {
      assert.equal(registered, true);
      throw Object.assign(new Error('Answered elsewhere'), { code: 'SOCKET_CALL_ALREADY_HANDLED' });
    },
  }), { code: 'SOCKET_CALL_ALREADY_HANDLED' });
  assert.equal(emissions.length, 0);
  assert.equal(timers.size, 0);
});

test('incoming accept guards remain local and preserve the existing server payload', async () => {
  const { service, emissions } = createSocketHarness();
  let checked = false;
  await service.acceptCall({ callId: ' incoming-call ', beforeEmit: () => { checked = true; } });
  assert.equal(checked, true);
  assert.equal(emissions[0].event, 'call_accept');
  assert.equal(JSON.stringify(emissions[0].payload), '{"callId":"incoming-call"}');
});

const callHandler = section(pageSource, '  const handleStartAudioCall = useCallback(', '\n  }, [')
  .replace('  const handleStartAudioCall = useCallback(', '') + '\n  }';
const failureHelpers = section(pageSource, 'const OFFLINE_CALL_INITIATION_MESSAGE =', '\nconst getContactMergeKey =');

const createPageHarness = (options = {}) => {
  const socket = createSocketHarness(options);
  const effects = [];
  const toasts = [];
  const navigations = [];
  const states = [];
  const snapshots = [];
  const ref = (current = '') => ({ current });
  const contact = { userId: 'peer-1', chatId: 'chat-1', isOnline: true, lastSeen: '2026-10-08T09:00:00.000Z' };
  const getPresence = runInNewContext(
    presenceSource.replace(/^import[^\n]+\n/, '').replaceAll('export ', '') + '\ngetContactPresence;',
    { socketService: socket.service }
  );
  const flowRef = ref();
  const callIdRef = ref();
  const lockedRef = ref(false);
  const stream = { getTracks: () => [{ stop: () => effects.push('stop-track') }] };
  const context = {
    CALL_TYPE, CALL_STATUS,
    CALL_SCREEN_STATE: { FAILED: 'Failed' },
    selectedContact: contact,
    chatId: 'chat-1',
    currentUserId: 'me',
    isOnline: options.appOnline !== false,
    isCallInitiationRoute: Boolean(options.callRoute),
    outgoingCallActionLockedRef: lockedRef,
    localCallRoleRef: ref(),
    activeCallFlowIdRef: flowRef,
    activeCallIdRef: callIdRef,
    activeCallStartedAtRef: ref(),
    callReconnectAttemptsRef: ref(0),
    activeCallStreamRef: ref(null),
    isCallMutedRef: ref(false),
    callStateRef: ref(CALL_STATUS.CALLING),
    getContactUserId: (value) => value.userId,
    getSharedContactPresence: getPresence,
    isGroupThreadContact: (value) => Boolean(value.isGroup),
    showChatActionToast: (value) => toasts.push(value),
    navigate: (path) => navigations.push(path),
    buildChatThreadRoute: (id) => `/chat/${id}`,
    buildChatCallRoute: (id) => `/chat/${id}/call`,
    stopActiveCallStream: () => effects.push('stop-stream'),
    stopActiveCallPeerConnection: () => effects.push('stop-peer'),
    clearIncomingCallCountdown() {},
    resetActiveCallControls() {},
    setCallState: (value) => states.push(value),
    setCallError() {},
    createCallFlowId() { flowRef.current = 'flow-1'; return 'flow-1'; },
    setActiveCallConnectedAt() {},
    setActiveCallElapsedSeconds() {},
    navigator: { mediaDevices: { async getUserMedia() { effects.push('media'); options.onMedia?.(socket.service); return stream; } } },
    setCallVideoStreamVersion() {},
    applyMuteStateToActiveCallStream() {},
    syncActiveCallAudioSender: async () => {},
    flushPendingCallClose: async () => {},
    cleanupPersistedActiveBackendCall: async () => false,
    localStorage: { getItem: () => 'test-token' },
    socketService: socket.service,
    persistActiveBackendCallId: (id) => snapshots.push(id),
    persistActiveCallSnapshot: (snapshot) => snapshots.push(snapshot),
    resolveContactPhoneNumber: () => '',
    resolveContactProfilePicture: () => '',
    defaultProfilePic: 'avatar.png',
    isCallNetworkReady: () => true,
    cancelActiveCallFlow: () => { flowRef.current = ''; },
    console: { error() {} },
  };
  const start = runInNewContext(`${failureHelpers}\n(${callHandler})`, context);
  return { ...socket, start, contact, effects, toasts, navigations, states, snapshots, callIdRef, lockedRef };
};

test('the offline chat action stops before microphone access, call state, navigation or call persistence', async () => {
  const harness = createPageHarness();
  await harness.start();
  assert.match(harness.toasts[0], /offline/i);
  assert.deepEqual(harness.effects, []);
  assert.deepEqual(harness.states, []);
  assert.deepEqual(harness.navigations, []);
  assert.deepEqual(harness.snapshots, []);
  assert.equal(harness.emissions.length, 0);
  assert.equal(harness.lockedRef.current, false);
});

test('redial targets use their own availability, and a blocked auto-start returns to the chat', async () => {
  const harness = createPageHarness({ online: true, callRoute: true });
  await harness.start(CALL_TYPE.AUDIO, { userId: 'offline-peer', chatId: 'other-chat', isOnline: true }, 'other-chat');
  assert.deepEqual(harness.navigations, ['/chat/other-chat']);
  assert.equal(harness.emissions.length, 0);
  assert.deepEqual(harness.effects, []);
});

test('an old last-seen date does not block a currently online recipient or a later retry', async () => {
  const harness = createPageHarness();
  await harness.start();
  harness.service.onlineUserIds.add('peer-1');
  harness.contact.isOnline = false;
  await harness.start();
  assert.equal(harness.emissions.length, 1);
  assert.equal(harness.callIdRef.current, 'real-call-1');
  assert.deepEqual(harness.navigations, ['/chat/chat-1/call']);
});

test('going offline while microphone permission is pending cannot create a call', async () => {
  const harness = createPageHarness({ online: true, onMedia: (service) => service.onlineUserIds.clear() });
  await harness.start();
  assert.equal(harness.emissions.length, 0);
  assert.equal(harness.callIdRef.current, '');
  assert.deepEqual(harness.navigations, []);
  assert.deepEqual(harness.snapshots, []);
  assert.match(harness.toasts.at(-1), /offline/i);
  assert.equal(harness.states.at(-1), 'Failed');
  assert.equal(harness.lockedRef.current, false);
});

test('a server offline rejection is no longer treated as a started local call', async () => {
  const harness = createPageHarness({ online: true, ack: { success: false, message: 'User is offline', callId: 'rejected-attempt' } });
  await harness.start();
  assert.equal(harness.callIdRef.current, '');
  assert.deepEqual(harness.navigations, []);
  assert.deepEqual(harness.snapshots, []);
  assert.match(harness.toasts.at(-1), /offline/i);
  assert.equal(harness.states.at(-1), 'Failed');
});
