type Role = 'caller' | 'receiver';

function loadServices(initialType = 'wifi') {
  jest.resetModules();
  jest.dontMock('react-native-webrtc');
  let networkChanged!: (state: any) => void;
  let socketReady!: () => void;
  const stopNetwork = jest.fn();
  const stopSocket = jest.fn();
  const signals = {
    sendCallOfferOverSocket: jest.fn(async () => ({success: true})),
    sendCallAnswerOverSocket: jest.fn(async () => ({success: true})),
    sendIceCandidateOverSocket: jest.fn(async () => ({success: true})),
    onSocketReady: jest.fn(listener => { socketReady = listener; return stopSocket; }),
  };
  jest.doMock('../src/services/chatRealtime', () => signals);
  const net = require('@react-native-community/netinfo');
  net.addEventListener.mockImplementation((listener: typeof networkChanged) => {
    networkChanged = listener;
    listener({type: initialType, isConnected: true, isInternetReachable: true, details: {}});
    return stopNetwork;
  });
  const media = require('../src/services/callAudio') as typeof import('../src/services/callAudio');
  const rtc = require('react-native-webrtc');
  return {media, rtc, signals, network: (type: string, online = true) => networkChanged({type, isConnected: online, isInternetReachable: online, details: {}}), reconnected: () => socketReady(), stopNetwork, stopSocket};
}

async function connected(role: Role, type = 'wifi') {
  const services = loadServices(type);
  await services.media.startCallAudio({callId: 'handover', role, type: 'video', muted: true});
  if (role === 'caller') {
    await services.media.startCallAudioOffer('handover');
    await services.media.handleCallAudioSignal({callId: 'handover', type: 'answer', answer: {type: 'answer', sdp: 'initial-answer'}});
  } else {
    await services.media.handleCallAudioSignal({callId: 'handover', type: 'offer', offer: {type: 'offer', sdp: 'initial-offer'}});
  }
  services.media.setCallVideoEnabled(false);
  return {...services, peer: services.rtc.__peerConnections.at(-1)};
}

afterEach(() => { jest.useRealTimers(); });

test.each([
  ['caller', 'wifi', 'cellular'], ['caller', 'cellular', 'wifi'],
  ['receiver', 'wifi', 'cellular'], ['receiver', 'cellular', 'wifi'],
] as const)('%s migrates %s to %s using the same call, tracks and peer', async (role, from, to) => {
  jest.useFakeTimers();
  const {media, rtc, peer, network, signals, stopNetwork, stopSocket} = await connected(role, from);
  try {
    const capture = rtc.mediaDevices.getUserMedia.mock.results[0].value;
    const stream = await capture;
    network('none', false);
    await jest.advanceTimersByTimeAsync(1000);
    const before = signals.sendCallOfferOverSocket.mock.calls.length;
    network(to);
    await jest.advanceTimersByTimeAsync(500);
    expect(signals.sendCallOfferOverSocket).toHaveBeenCalledTimes(before + 1);
    expect(peer.createOffer).toHaveBeenLastCalledWith(expect.objectContaining({iceRestart: true}));
    await media.handleCallAudioSignal({callId: 'handover', type: 'answer', answer: {type: 'answer', sdp: 'new-network-answer'}});
    expect(peer.remoteDescription.sdp).toBe('new-network-answer');
    expect(rtc.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1);
    expect(rtc.__peerConnections).toHaveLength(1);
    expect(peer.close).not.toHaveBeenCalled();
    expect(stream.getAudioTracks()[0].enabled).toBe(false);
    expect(stream.getVideoTracks()[0].enabled).toBe(false);
    await jest.advanceTimersByTimeAsync(10000);
    expect(signals.sendCallOfferOverSocket).toHaveBeenCalledTimes(before + 1);
  } finally {
    await media.stopCallAudio();
    expect(stopNetwork).toHaveBeenCalledTimes(1);
    expect(stopSocket).toHaveBeenCalledTimes(1);
  }
});

test.each(['caller', 'receiver'] as const)('%s also recovers a direct transport change without an offline notification', async role => {
  jest.useFakeTimers();
  const {media, peer, network} = await connected(role);
  try {
    network('cellular');
    await jest.advanceTimersByTimeAsync(500);
    expect(peer.createOffer).toHaveBeenLastCalledWith(expect.objectContaining({iceRestart: true}));
  } finally { await media.stopCallAudio(); }
});

test.each(['caller', 'receiver'] as const)('%s resolves simultaneous ICE restart offers without replacing media', async role => {
  jest.useFakeTimers();
  const {media, peer, network, signals} = await connected(role);
  try {
    network('cellular');
    await jest.advanceTimersByTimeAsync(500);
    const answers = signals.sendCallAnswerOverSocket.mock.calls.length;
    await media.handleCallAudioSignal({callId: 'handover', type: 'offer', offer: {type: 'offer', sdp: 'colliding-offer'}});
    if (role === 'receiver') {
      expect(peer.setLocalDescription).toHaveBeenCalledWith({type: 'rollback'});
      expect(signals.sendCallAnswerOverSocket).toHaveBeenCalledTimes(answers + 1);
      expect(peer.remoteDescription.sdp).toBe('colliding-offer');
    } else {
      expect(signals.sendCallAnswerOverSocket).toHaveBeenCalledTimes(answers);
      expect(peer.remoteDescription.sdp).toBe('initial-answer');
    }
    expect(peer.close).not.toHaveBeenCalled();
  } finally { await media.stopCallAudio(); }
});

test('socket reconnection retries signaling and ignores late network events after hang-up', async () => {
  jest.useFakeTimers();
  const {media, peer, network, reconnected, signals} = await connected('receiver');
  try {
    signals.sendCallOfferOverSocket.mockRejectedValueOnce(new Error('Changing networks'));
    reconnected();
    await jest.advanceTimersByTimeAsync(500);
    expect(signals.sendCallOfferOverSocket).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(3000);
    expect(signals.sendCallOfferOverSocket).toHaveBeenCalledTimes(2);
    expect(peer.setLocalDescription).toHaveBeenCalledWith({type: 'rollback'});
    await media.stopCallAudio();
    network('cellular');
    reconnected();
    await jest.advanceTimersByTimeAsync(20000);
    expect(signals.sendCallOfferOverSocket).toHaveBeenCalledTimes(2);
  } finally { await media.stopCallAudio(); }
});

test('the original caller answers a stable callee-initiated restart', async () => {
  const {media, peer, signals} = await connected('caller');
  try {
    await media.handleCallAudioSignal({callId: 'handover', type: 'offer', offer: {type: 'offer', sdp: 'callee-new-network'}});
    expect(signals.sendCallAnswerOverSocket).toHaveBeenCalledTimes(1);
    expect(peer.remoteDescription.sdp).toBe('callee-new-network');
    expect(peer.close).not.toHaveBeenCalled();
  } finally { await media.stopCallAudio(); }
});

test('ICE renegotiation preserves the active screen-sharing sender', async () => {
  const {media, peer, rtc} = await connected('caller');
  try {
    await media.startCallScreenCapture(jest.fn());
    const display = await rtc.mediaDevices.getDisplayMedia.mock.results[0].value;
    const sharedTrack = display.getVideoTracks()[0];
    const sender = peer.senders.find((item: any) => item.track === sharedTrack);
    await media.handleCallAudioSignal({callId: 'handover', type: 'offer', offer: {type: 'offer', sdp: 'new-network'}});
    expect(sender.track).toBe(sharedTrack);
    expect(media.isSharingCallScreen()).toBe(true);
    expect(sharedTrack.stop).not.toHaveBeenCalled();
  } finally { await media.stopCallAudio(); }
});
