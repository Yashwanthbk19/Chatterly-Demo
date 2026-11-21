import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { CALL_STATUS, CALL_TYPE } from '../src/utils/callState.js';

const source = readFileSync(new URL('../src/pages/ChatListPage.jsx', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const section = (start, end) => {
  const first = source.indexOf(start);
  const last = source.indexOf(end, first);
  assert.ok(first >= 0 && last > first, `Missing production section: ${start}`);
  return source.slice(first, last);
};
const handlers = section('  const dismissCallAnsweredOnAnotherDevice = useCallback', '\n  const handleVideoCallOption =');
const connectedListener = section('    const unsubscribeConnected =', '\n    const unsubscribeEnded =');
const signalListener = section('    const unsubscribeSignals =', '\n    const unsubscribeConnectionChange =');
const reconnectListener = section('    const unsubscribeConnectionChange =', '\n    const unsubscribeMedia =');
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const flush = () => new Promise((resolve) => setImmediate(resolve));
const firstStart = '2026-11-13T09:00:00.000Z';
const secondStart = '2026-11-13T09:00:00.001Z';

// Exercise the production callbacks together with controllable media and socket
// timing. No network, device permissions or backend call writes are involved.
const harness = (options = {}) => {
  const ref = (current = '') => ({ current });
  const effects = { accepts: [], answers: [], persisted: [], navigations: [], toasts: [], cleanup: 0, stopped: 0 };
  const stream = { getTracks: () => [{ stop: () => { effects.stopped += 1; } }] };
  const context = {
    CALL_STATUS, CALL_TYPE,
    CALL_SCREEN_STATE: { IDLE: 'idle', FAILED: 'failed' },
    CALL_UI_ACTION: { ACCEPT: 'accept' }, CHAT_MODULES: { chats: 'chats' },
    useCallback: (callback) => callback,
    hasIncomingCallRequest: true, callState: CALL_STATUS.RINGING,
    activeCallType: options.type || CALL_TYPE.VIDEO,
    incomingCallPayload: { callId: 'call-1', callerName: 'Caller' },
    chatId: 'chat-1', selectedContact: { name: 'Caller' }, defaultProfilePic: 'avatar.png',
    isCallInitiationRoute: false,
    incomingCallActionLockedRef: ref(false), incomingCallAcceptanceRef: ref(null),
    hasIncomingCallRequestRef: ref(true), outgoingCallActionLockedRef: ref(false),
    activeCallFlowIdRef: ref(0), localCallRoleRef: ref(), activeCallIdRef: ref('call-1'),
    activeCallStartedAtRef: ref(), callConnectionPendingRef: ref(true),
    pendingCallCloseRef: ref({ callId: 'call-1' }), activeCallStreamRef: ref(null),
    isCallMutedRef: ref(false), callStateRef: ref(CALL_STATUS.RINGING),
    setCallUiAction() {}, setCallError() {}, setIsCallMinimized() {}, setMinimizedCallInfo() {},
    clearIncomingCallCountdown() {}, resetActiveCallControls() {}, clearPendingCallStateTransitions() {},
    setCallVideoStreamVersion() {}, applyMuteStateToActiveCallStream() {},
    resolveContactProfilePicture: () => '', isCallNetworkReady: () => true,
    buildChatThreadRoute: () => '/chat/chat-1', buildChatCallRoute: () => '/chat/chat-1/call',
    navigate: (...args) => effects.navigations.push(args),
    showChatActionToast: (message) => effects.toasts.push(message),
    persistActiveBackendCallId: (id) => effects.persisted.push(id),
    persistActiveCallSnapshot: (snapshot) => effects.persisted.push(snapshot),
    clearPersistedActiveBackendCallId: () => { effects.persisted.length = 0; },
    cleanupPersistedActiveBackendCall: async () => { effects.cleanup += 1; },
    stopActiveCallPeerConnection() {},
    syncActiveCallAudioSender: options.sync || (async () => {}),
    acceptWebRtcOffer: async (payload) => { effects.answers.push(payload); },
    acceptWebRtcAnswer: async () => {}, addWebRtcIceCandidate: async () => {},
    startCallerWebRtcOffer: async () => {},
    navigator: { mediaDevices: { getUserMedia: options.media || (async () => stream) } },
    console: { error() {} },
  };
  context.setCallState = (state) => { context.state = state; };
  context.createCallFlowId = () => ++context.activeCallFlowIdRef.current;
  context.cancelActiveCallFlow = () => { context.activeCallFlowIdRef.current += 1; };
  context.stopActiveCallStream = () => {
    context.activeCallStreamRef.current?.getTracks().forEach((track) => track.stop());
    context.activeCallStreamRef.current = null;
  };
  context.adoptBackendCallId = () => false;
  context.matchesActiveCall = (id) => Boolean(id && context.activeCallIdRef.current === id);
  let onConnected;
  let onSignal;
  let onConnectionChange;
  context.socketService = {
    onCallConnected: (callback) => { onConnected = callback; return () => {}; },
    onCallSignal: (callback) => { onSignal = callback; return () => {}; },
    onCallConnectionChange: (callback) => { onConnectionChange = callback; return () => {}; },
    async acceptCall(payload) {
      await options.registration;
      payload.beforeEmit();
      effects.accepts.push(payload.callId);
      if (options.ack) return options.ack.promise;
      onConnected({ callId: payload.callId, startedAt: firstStart });
      return { success: true };
    },
  };
  const callbacks = runInNewContext(`${handlers}\n${connectedListener}\n${signalListener}\n${reconnectListener}
    ({ accept: handleAcceptIncomingCall, dismiss: dismissCallAnsweredOnAnotherDevice });`, context);
  return {
    ...callbacks, context, effects, stream,
    connected: (startedAt = firstStart, callId = 'call-1') => onConnected({ callId, startedAt }),
    reconnected: () => onConnectionChange({ type: 'reconnected', callId: 'call-1' }),
    offer: (callId = 'call-1') => onSignal({ callId, type: 'offer', offer: { type: 'offer', sdp: 'test' } }),
  };
};

const assertDismissed = (h) => {
  assert.equal(h.context.state, 'idle');
  assert.equal(h.context.activeCallIdRef.current, '');
  assert.equal(h.context.activeCallStreamRef.current, null);
  assert.equal(h.effects.cleanup, 0, 'must not end the call on the answering device');
  assert.deepEqual(h.effects.persisted, []);
  assert.match(h.effects.toasts.at(-1), /answered on another device/i);
};

test('a mobile answer dismisses the ringing web call without ending the remote call', () => {
  const h = harness();
  h.connected();
  assertDismissed(h);
  assert.deepEqual(h.effects.accepts, []);
});

test('a mobile answer while camera permission is pending cancels the web accept and stops late media', async () => {
  const media = deferred();
  const h = harness({ media: () => media.promise });
  const accepting = h.accept();
  assert.equal(h.context.callStateRef.current, CALL_STATUS.CONNECTING);
  h.connected();
  media.resolve(h.stream);
  await accepting;
  assertDismissed(h);
  assert.equal(h.effects.stopped, 1);
  assert.deepEqual(h.effects.accepts, []);
  assert.deepEqual(h.effects.navigations, []);
});

test('an answer during media sender setup cancels before sending call_accept', async () => {
  const sync = deferred();
  const h = harness({ sync: () => sync.promise });
  const accepting = h.accept();
  await flush();
  h.connected();
  sync.resolve();
  await accepting;
  assertDismissed(h);
  assert.equal(h.effects.stopped, 1);
  assert.deepEqual(h.effects.accepts, []);
});

test('an answer during socket registration prevents a late accept dispatch', async () => {
  const registration = deferred();
  const h = harness({ registration: registration.promise });
  const accepting = h.accept();
  await flush();
  h.connected();
  registration.resolve();
  await accepting;
  assertDismissed(h);
  assert.deepEqual(h.effects.accepts, []);
});

for (const type of [CALL_TYPE.VIDEO, CALL_TYPE.AUDIO]) {
  test(`${type} accepts wait for their own acknowledgement and buffer the caller's early offer`, async () => {
    const ack = deferred();
    const h = harness({ type, ack });
    const accepting = h.accept();
    await flush();
    h.connected();
    h.offer();
    assert.equal(h.context.state, CALL_STATUS.CONNECTING);
    assert.deepEqual(h.effects.answers, []);
    assert.deepEqual(h.effects.persisted, []);
    ack.resolve({ success: true });
    await accepting;
    assert.equal(h.context.state, CALL_STATUS.CONNECTED);
    assert.equal(h.effects.answers.length, 1);
    assert.equal(h.effects.persisted[1].startedAt, firstStart);
    assert.equal(h.effects.persisted[1].callType, type);
    assert.equal(h.effects.navigations.length, 1);
    h.connected();
    assert.equal(h.context.state, CALL_STATUS.CONNECTED, 'duplicate delivery must not dismiss the winning browser');
  });
}

test('a rejected second accept closes only local media and never ends the mobile call', async () => {
  const ack = deferred();
  const h = harness({ ack });
  const accepting = h.accept();
  await flush();
  h.connected();
  h.offer();
  ack.reject(Object.assign(new Error('Cannot accept a connected call'), { code: 'SOCKET_CALL_REJECTED' }));
  await accepting;
  assertDismissed(h);
  assert.deepEqual(h.effects.answers, []);
  assert.equal(h.effects.stopped, 1);
});

test('a second connection transition cancels a racing web accept despite a late successful acknowledgement', async () => {
  const ack = deferred();
  const h = harness({ ack });
  const accepting = h.accept();
  await flush();
  h.connected();
  h.connected(secondStart);
  ack.resolve({ success: true });
  await accepting;
  assertDismissed(h);
  assert.deepEqual(h.effects.navigations, []);
});

test('a second connection transition releases an already connected web receiver', async () => {
  const h = harness();
  await h.accept();
  assert.equal(h.context.state, CALL_STATUS.CONNECTED);
  h.connected(secondStart);
  assertDismissed(h);
  assert.equal(h.effects.stopped, 1);
  h.offer();
  assert.deepEqual(h.effects.answers, []);
});

test('events for other calls do not dismiss or take ownership of the incoming call', () => {
  const h = harness();
  h.connected(firstStart, 'another-call');
  h.offer('another-call');
  assert.equal(h.context.activeCallIdRef.current, 'call-1');
  assert.deepEqual(h.effects.toasts, []);
  assert.deepEqual(h.effects.answers, []);
});

test('an old accept click cannot revive a call already answered on mobile', async () => {
  const h = harness();
  h.connected();
  await h.accept();
  assertDismissed(h);
  assert.deepEqual(h.effects.accepts, []);
});

test('account reconnection during camera permission reflects the connected mobile call', async () => {
  const media = deferred();
  const h = harness({ media: () => media.promise });
  const accepting = h.accept();
  h.reconnected();
  media.resolve(h.stream);
  await accepting;
  assertDismissed(h);
  assert.deepEqual(h.effects.accepts, []);
});

test('account reconnection cannot confirm a pending web accept before its acknowledgement', async () => {
  const ack = deferred();
  const h = harness({ ack });
  const accepting = h.accept();
  await flush();
  h.reconnected();
  assert.equal(h.context.state, CALL_STATUS.CONNECTING);
  ack.resolve({ success: true });
  await accepting;
  h.reconnected();
  assert.equal(h.context.state, CALL_STATUS.CONNECTED);
});

test('an in-flight WebRTC answer is not sent after another device takes the call', async () => {
  const localDescription = deferred();
  const flow = { current: 1 };
  const callId = { current: 'call-1' };
  const sent = [];
  const peer = {
    async setRemoteDescription() {}, async createAnswer() { return { type: 'answer', sdp: 'test' }; },
    setLocalDescription: () => localDescription.promise,
  };
  const acceptOffer = runInNewContext(
    section('  const acceptWebRtcOffer = useCallback', '\n  const acceptWebRtcAnswer =') + '\nacceptWebRtcOffer;',
    {
      useCallback: (callback) => callback,
      activeCallIdRef: callId, activeCallFlowIdRef: flow,
      localCallRoleRef: { current: 'receiver' }, acceptingCallOfferRef: { current: false },
      activeCallStreamRef: { current: null },
      createActiveCallPeerConnection: () => peer,
      RTCSessionDescription: function (value) { return value; },
      findAssociatedCallAudioTransceiver: () => null, findAssociatedCallVideoTransceiver: () => null,
      syncActiveCallAudioSender: async () => {}, attachPendingIceCandidates: async () => {},
      socketService: { sendCallAnswer: async (payload) => sent.push(payload) },
    }
  );
  const answering = acceptOffer({ callId: 'call-1', offer: { type: 'offer', sdp: 'test' } });
  await flush();
  flow.current += 1;
  callId.current = '';
  localDescription.resolve();
  await answering;
  assert.deepEqual(sent, []);
});
