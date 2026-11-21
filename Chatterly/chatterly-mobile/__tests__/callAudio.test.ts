test.each(['caller', 'receiver'] as const)('protects the %s call before capture and releases protection only when that call ends', async role => {
  jest.resetModules();
  jest.dontMock('react-native-webrtc');
  const {NativeModules, Platform} = require('react-native');
  const os = jest.replaceProperty(Platform, 'OS', 'android');
  const background = {start: jest.fn(async () => undefined), stop: jest.fn(async () => undefined)};
  NativeModules.CallBackground = background;
  const webRTC = require('react-native-webrtc');
  const audio = require('../src/services/callAudio') as typeof import('../src/services/callAudio');
  try {
    await audio.startCallAudio({callId: 'screen-off-call', role, type: 'video', contactName: 'Ram'});
    expect(background.start).toHaveBeenCalledWith('screen-off-call', 'video', 'Ram');
    expect(background.start.mock.invocationCallOrder[0]).toBeLessThan(webRTC.mediaDevices.getUserMedia.mock.invocationCallOrder[0]);
    await audio.startCallAudio({callId: 'screen-off-call', role, type: 'video'});
    expect(background.start).toHaveBeenCalledTimes(1);
    await audio.stopCallAudio('old-call');
    expect(background.stop).not.toHaveBeenCalled();
    expect(webRTC.__peerConnections.at(-1).close).not.toHaveBeenCalled();
    await audio.stopCallAudio('screen-off-call');
    expect(background.stop).toHaveBeenCalledWith('screen-off-call');
    expect(webRTC.__peerConnections.at(-1).close).toHaveBeenCalled();
  } finally {
    await audio.stopCallAudio();
    delete NativeModules.CallBackground;
    os.restore();
  }
});

test('releases native call protection when camera or microphone capture fails', async () => {
  jest.resetModules();
  jest.dontMock('react-native-webrtc');
  const {NativeModules, Platform} = require('react-native');
  const os = jest.replaceProperty(Platform, 'OS', 'android');
  const background = {start: jest.fn(async () => undefined), stop: jest.fn(async () => undefined)};
  NativeModules.CallBackground = background;
  const webRTC = require('react-native-webrtc');
  webRTC.mediaDevices.getUserMedia.mockRejectedValueOnce(new Error('Camera unavailable'));
  const audio = require('../src/services/callAudio') as typeof import('../src/services/callAudio');
  try {
    await expect(audio.startCallAudio({callId: 'failed-media', role: 'receiver', type: 'video'})).rejects.toThrow('Camera unavailable');
    expect(background.stop).toHaveBeenCalledWith('failed-media');
    expect(webRTC.__peerConnections).toHaveLength(0);
  } finally {
    await audio.stopCallAudio();
    delete NativeModules.CallBackground;
    os.restore();
  }
});

test.each(['caller', 'receiver'] as const)('sends and receives reactions over the %s call peer without replacing media', async role => {
  jest.resetModules();
  jest.dontMock('react-native-webrtc');
  jest.doMock('../src/services/chatRealtime', () => ({
    sendCallAnswerOverSocket: jest.fn().mockResolvedValue(undefined),
    sendCallOfferOverSocket: jest.fn().mockResolvedValue(undefined),
    sendIceCandidateOverSocket: jest.fn().mockResolvedValue(undefined),
  }));
  const webRTC = require('react-native-webrtc');
  const callAudio = require('../src/services/callAudio') as typeof import('../src/services/callAudio');
  const reactions = require('../src/services/callReactions') as typeof import('../src/services/callReactions');
  const receive = jest.fn();
  const unsubscribe = reactions.subscribeToCallReactions(receive);
  try {
    await callAudio.startCallAudio({callId: 'reaction-call', role, type: 'audio'});
    const peer = webRTC.__peerConnections.at(-1);
    const channel = role === 'caller' ? peer.createDataChannel.mock.results[0].value : {
      label: 'chatterly.call.reactions', readyState: 'open', onmessage: null, send: jest.fn(), close: jest.fn(),
    };
    if (role === 'receiver') {
      expect(peer.createDataChannel).not.toHaveBeenCalled();
      peer.ondatachannel({channel});
    }
    callAudio.sendCallReaction('reaction-call', '👍');
    expect(channel.send).toHaveBeenCalledWith(JSON.stringify({type: 'reaction', emoji: '👍'}));
    expect(receive).toHaveBeenLastCalledWith({callId: 'reaction-call', emoji: '👍', local: true});
    channel.onmessage({data: JSON.stringify({type: 'reaction', emoji: '❤️'})});
    expect(receive).toHaveBeenLastCalledWith({callId: 'reaction-call', emoji: '❤️', local: false});
    channel.onmessage({data: 'malformed'});
    channel.onmessage({data: JSON.stringify({type: 'reaction', emoji: 'invalid'})});
    expect(receive).toHaveBeenCalledTimes(2);
    expect(peer.close).not.toHaveBeenCalled();
    expect(() => callAudio.sendCallReaction('another-call', '👍')).toThrow('not available');
    channel.readyState = 'connecting';
    expect(() => callAudio.sendCallReaction('reaction-call', '👍')).toThrow('not available');
    await callAudio.stopCallAudio('reaction-call');
    expect(channel.close).toHaveBeenCalledTimes(1);
    expect(channel.onmessage).toBeNull();
  } finally { unsubscribe(); await callAudio.stopCallAudio(); }
});

test('call audio service imports in Expo Go when native WebRTC is unavailable', async () => {
  jest.resetModules();
  jest.doMock('react-native-webrtc', () => {
    throw new Error('Native module is unavailable');
  });

  const callAudio = require('../src/services/callAudio') as typeof import('../src/services/callAudio');

  await expect(callAudio.stopCallAudio()).resolves.toBeUndefined();
  await expect(callAudio.startCallAudio({
    callId: 'call-1',
    role: 'caller',
    type: 'audio',
  })).rejects.toThrow('Expo Go does not include native WebRTC audio');
});

test('in Expo Go react-native-webrtc is never required, so Metro has no load error to report', async () => {
  // On a device Metro reports a module that throws on first load as a fatal
  // error before the caller's try/catch sees it, so the check has to come first.
  jest.resetModules();
  const loadPackage = jest.fn(() => {
    throw new Error('WebRTC native module not found.');
  });
  jest.doMock('react-native-webrtc', loadPackage);
  const {NativeModules} = require('react-native');
  NativeModules.WebRTCModule = null;
  try {
    const callAudio = require('../src/services/callAudio') as typeof import('../src/services/callAudio');
    const groupCallMedia = require('../src/services/groupCallMedia') as typeof import('../src/services/groupCallMedia');

    await expect(callAudio.startCallAudio({callId: 'call-1', role: 'caller', type: 'audio'})).rejects.toThrow('Expo Go does not include native WebRTC audio');
    expect(groupCallMedia.isGroupCallMediaAvailable()).toBe(false);
    expect(loadPackage).not.toHaveBeenCalled();
  } finally {
    delete NativeModules.WebRTCModule;
  }
});

test('video calls capture video and negotiate a video track', async () => {
  jest.resetModules();
  jest.dontMock('react-native-webrtc');
  jest.doMock('../src/services/chatRealtime', () => ({
    sendCallAnswerOverSocket: jest.fn().mockResolvedValue(undefined),
    sendCallOfferOverSocket: jest.fn().mockResolvedValue(undefined),
    sendIceCandidateOverSocket: jest.fn().mockResolvedValue(undefined),
  }));
  const webRTC = require('react-native-webrtc');
  const callAudio = require('../src/services/callAudio') as typeof import('../src/services/callAudio');

  await callAudio.startCallAudio({callId: 'video-call', role: 'caller', type: 'video'});
  await callAudio.startCallAudioOffer('video-call');

  expect(webRTC.mediaDevices.getUserMedia).toHaveBeenCalledWith({audio: true, video: {facingMode: 'user', width: 1280, height: 720, frameRate: 30}});
  const peer = webRTC.RTCPeerConnection.mock?.instances?.[0];
  if (peer) {
    expect(peer.createOffer).toHaveBeenCalledWith({offerToReceiveAudio: true, offerToReceiveVideo: true});
  }
  await callAudio.stopCallAudio();
});

test('publishes remote media when a track event has no associated stream', async () => {
  jest.resetModules();
  jest.dontMock('react-native-webrtc');
  jest.doMock('../src/services/chatRealtime', () => ({
    sendCallAnswerOverSocket: jest.fn().mockResolvedValue(undefined),
    sendCallOfferOverSocket: jest.fn().mockResolvedValue(undefined),
    sendIceCandidateOverSocket: jest.fn().mockResolvedValue(undefined),
  }));
  const webRTC = require('react-native-webrtc');
  const callAudio = require('../src/services/callAudio') as typeof import('../src/services/callAudio');
  const updates: Array<{localUrl: string; remoteUrl: string}> = [];
  const unsubscribe = callAudio.subscribeToCallMedia(streams => updates.push(streams));

  await callAudio.startCallAudio({callId: 'streamless-video-call', role: 'receiver', type: 'video'});
  const peer = webRTC.__peerConnections.at(-1);
  const remoteVideoTrack = {enabled: true, kind: 'video', stop: jest.fn()};
  peer.ontrack({streams: [], track: remoteVideoTrack});

  expect(updates.at(-1)?.remoteUrl).toBe('mock://media-stream');
  expect(remoteVideoTrack.enabled).toBe(true);
  unsubscribe();
  await callAudio.stopCallAudio();
});

test('shares one camera capture when call setup races with the connected event', async () => {
  jest.resetModules();
  jest.dontMock('react-native-webrtc');
  jest.doMock('../src/services/chatRealtime', () => ({
    sendCallAnswerOverSocket: jest.fn().mockResolvedValue(undefined),
    sendCallOfferOverSocket: jest.fn().mockResolvedValue(undefined),
    sendIceCandidateOverSocket: jest.fn().mockResolvedValue(undefined),
  }));
  const webRTC = require('react-native-webrtc');
  const callAudio = require('../src/services/callAudio') as typeof import('../src/services/callAudio');
  let resolveCapture: ((stream: InstanceType<typeof webRTC.MediaStream>) => void) | undefined;
  jest.mocked(webRTC.mediaDevices.getUserMedia).mockImplementation(() => new Promise(resolve => { resolveCapture = resolve; }));

  const initialSetup = callAudio.startCallAudio({callId: 'overlapping-video-call', role: 'caller', type: 'video'});
  const connectedSetup = callAudio.startCallAudio({callId: 'overlapping-video-call', role: 'caller', type: 'video'});
  expect(webRTC.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1);

  resolveCapture?.(new webRTC.MediaStream([
    {enabled: true, kind: 'audio', stop: jest.fn()},
    {enabled: true, kind: 'video', stop: jest.fn()},
  ]));
  await Promise.all([initialSetup, connectedSetup]);
  expect(webRTC.__peerConnections).toHaveLength(1);
  await callAudio.stopCallAudio();
});

test('retries the initial call offer until an answer is received', async () => {
  jest.resetModules();
  jest.dontMock('react-native-webrtc');
  const sendCallOfferOverSocket = jest.fn().mockResolvedValue({success: true});
  jest.doMock('../src/services/chatRealtime', () => ({
    sendCallAnswerOverSocket: jest.fn().mockResolvedValue(undefined),
    sendCallOfferOverSocket,
    sendIceCandidateOverSocket: jest.fn().mockResolvedValue(undefined),
  }));
  const webRTC = require('react-native-webrtc');
  const callAudio = require('../src/services/callAudio') as typeof import('../src/services/callAudio');
  jest.useFakeTimers();
  try {
    await callAudio.startCallAudio({callId: 'offer-retry-call', role: 'caller', type: 'video'});
    await callAudio.startCallAudioOffer('offer-retry-call');
    expect(sendCallOfferOverSocket).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(2500);
    expect(sendCallOfferOverSocket).toHaveBeenCalledTimes(2);
    const peer = webRTC.__peerConnections.at(-1);
    expect(peer.createOffer).toHaveBeenLastCalledWith({offerToReceiveAudio: true, offerToReceiveVideo: true, iceRestart: true});

    await callAudio.handleCallAudioSignal({callId: 'offer-retry-call', type: 'answer', answer: {type: 'answer', sdp: 'answer-sdp'}});
    await jest.advanceTimersByTimeAsync(5000);
    expect(sendCallOfferOverSocket).toHaveBeenCalledTimes(2);
  } finally {
    await callAudio.stopCallAudio();
    jest.useRealTimers();
  }
});

test('answers incoming video with local audio and video senders enabled', async () => {
  jest.resetModules();
  jest.dontMock('react-native-webrtc');
  const sendCallAnswerOverSocket = jest.fn().mockResolvedValue({success: true});
  jest.doMock('../src/services/chatRealtime', () => ({
    sendCallAnswerOverSocket,
    sendCallOfferOverSocket: jest.fn().mockResolvedValue({success: true}),
    sendIceCandidateOverSocket: jest.fn().mockResolvedValue(undefined),
  }));
  const webRTC = require('react-native-webrtc');
  const callAudio = require('../src/services/callAudio') as typeof import('../src/services/callAudio');
  await callAudio.startCallAudio({callId: 'two-way-video-call', role: 'receiver', type: 'video'});

  await callAudio.handleCallAudioSignal({callId: 'two-way-video-call', type: 'offer', offer: {type: 'offer', sdp: 'offer-sdp'}});

  const peer = webRTC.__peerConnections.at(-1);
  expect(peer.createAnswer).toHaveBeenCalledTimes(1);
  expect(peer.getTransceivers().map((transceiver: {direction: string}) => transceiver.direction)).toEqual(['sendrecv', 'sendrecv']);
  expect(sendCallAnswerOverSocket).toHaveBeenCalledWith('two-way-video-call', {type: 'answer', sdp: 'answer-sdp'});
  await callAudio.stopCallAudio();
});


test.each(['caller', 'receiver'] as const)('negotiates HD camera encoding for the %s', async role => {
  jest.resetModules();
  jest.dontMock('react-native-webrtc');
  jest.doMock('../src/services/chatRealtime', () => ({
    sendCallAnswerOverSocket: jest.fn().mockResolvedValue(undefined),
    sendCallOfferOverSocket: jest.fn().mockResolvedValue(undefined),
    sendIceCandidateOverSocket: jest.fn().mockResolvedValue(undefined),
  }));
  const webRTC = require('react-native-webrtc');
  const media = require('../src/services/callAudio') as typeof import('../src/services/callAudio');
  try {
    await media.startCallAudio({callId: 'hd-call', role, type: 'video'});
    const peer = webRTC.__peerConnections.at(-1);
    if (role === 'caller') {
      await media.startCallAudioOffer('hd-call');
      await media.handleCallAudioSignal({callId: 'hd-call', type: 'answer', answer: {type: 'answer', sdp: 'answer'}});
    } else {
      await media.handleCallAudioSignal({callId: 'hd-call', type: 'offer', offer: {type: 'offer', sdp: 'offer'}});
    }
    const video = peer.senders.find((sender: any) => sender.track?.kind === 'video');
    const audio = peer.senders.find((sender: any) => sender.track?.kind === 'audio');
    expect(video.setParameters).toHaveBeenLastCalledWith(expect.objectContaining({
      degradationPreference: 'maintain-resolution',
      encodings: [expect.objectContaining({maxBitrate: 2500000, maxFramerate: 30, scaleResolutionDownBy: 1})],
    }));
    expect(audio.setParameters).not.toHaveBeenCalled();
    await media.startCallScreenCapture(jest.fn());
    expect(video.setParameters).toHaveBeenLastCalledWith(expect.objectContaining({degradationPreference: null, encodings: [expect.objectContaining({maxBitrate: undefined})]}));
    await media.stopCallScreenCapture();
    expect(video.setParameters).toHaveBeenLastCalledWith(expect.objectContaining({degradationPreference: 'maintain-resolution', encodings: [expect.objectContaining({maxBitrate: 2500000})]}));
    media.setCallVideoEnabled(false);
    expect(video.track.enabled).toBe(false);
    media.setCallVideoEnabled(true);
    expect(video.track.enabled).toBe(true);
  } finally { await media.stopCallAudio(); }
});

test('HD tuning rejection does not interrupt signalling or enable an audio camera', async () => {
  jest.resetModules();
  jest.dontMock('react-native-webrtc');
  const sendCallOfferOverSocket = jest.fn().mockResolvedValue(undefined);
  jest.doMock('../src/services/chatRealtime', () => ({sendCallOfferOverSocket, sendCallAnswerOverSocket: jest.fn(), sendIceCandidateOverSocket: jest.fn()}));
  const webRTC = require('react-native-webrtc');
  const media = require('../src/services/callAudio') as typeof import('../src/services/callAudio');
  try {
    await media.startCallAudio({callId: 'hd-fallback', role: 'caller', type: 'video'});
    const peer = webRTC.__peerConnections.at(-1);
    peer.senders.find((sender: any) => sender.track?.kind === 'video').setParameters.mockRejectedValue(new Error('Unsupported'));
    await expect(media.startCallAudioOffer('hd-fallback')).resolves.toBeUndefined();
    expect(sendCallOfferOverSocket).toHaveBeenCalled();
    expect(peer.close).not.toHaveBeenCalled();
    await media.stopCallAudio();
    webRTC.mediaDevices.getUserMedia.mockClear();
    await media.startCallAudio({callId: 'audio-only', role: 'caller', type: 'audio'});
    await media.startCallAudioOffer('audio-only');
    expect(webRTC.mediaDevices.getUserMedia).toHaveBeenCalledWith({audio: true, video: false});
    const audioPeer = webRTC.__peerConnections.at(-1);
    audioPeer.senders.forEach((sender: any) => expect(sender.setParameters).not.toHaveBeenCalled());
  } finally { await media.stopCallAudio(); }
});


function loadVideoRegressionServices() {
  jest.resetModules();
  jest.dontMock('react-native-webrtc');
  const signals = {
    sendCallAnswerOverSocket: jest.fn().mockResolvedValue(undefined),
    sendCallOfferOverSocket: jest.fn().mockResolvedValue(undefined),
    sendIceCandidateOverSocket: jest.fn().mockResolvedValue(undefined),
  };
  jest.doMock('../src/services/chatRealtime', () => signals);
  return {
    media: require('../src/services/callAudio') as typeof import('../src/services/callAudio'),
    webRTC: require('react-native-webrtc'), signals,
  };
}

test('does not bind RTCView to an audio-only stream before the remote video arrives', async () => {
  const {media, webRTC} = loadVideoRegressionServices();
  const updates: import('../src/services/callAudio').CallMediaStreams[] = [];
  const unsubscribe = media.subscribeToCallMedia(streams => updates.push(streams));
  try {
    await media.startCallAudio({callId: 'late-video', role: 'caller', type: 'video'});
    const peer = webRTC.__peerConnections.at(-1);
    const audio = {kind: 'audio', enabled: true, stop: jest.fn()};
    const stream = new webRTC.MediaStream([audio]);
    peer.ontrack({streams: [stream], track: audio});
    expect(updates.at(-1)?.remoteUrl).toBe('');
    const video = {kind: 'video', enabled: true, stop: jest.fn()};
    stream.addTrack(video);
    peer.ontrack({streams: [stream], track: video});
    expect(updates.at(-1)).toEqual(expect.objectContaining({remoteUrl: stream.toURL(), remoteVideoLive: true}));
    expect(stream.getAudioTracks()).toContain(audio);
  } finally { unsubscribe(); await media.stopCallAudio(); }
});

test.each(['caller', 'receiver'] as const)('waits for camera capture before early %s signalling creates a peer', async role => {
  const {media, webRTC, signals} = loadVideoRegressionServices();
  let resolveCapture: (stream: unknown) => void = () => {};
  webRTC.mediaDevices.getUserMedia.mockImplementationOnce(() => new Promise(resolve => {resolveCapture = resolve;}));
  try {
    const setup = media.startCallAudio({callId: 'capture-race', role, type: 'video'});
    const signal = role === 'receiver'
      ? media.handleCallAudioSignal({callId: 'capture-race', type: 'offer', offer: {type: 'offer', sdp: 'offer'}})
      : media.handleCallAudioSignal({callId: 'capture-race', type: 'ice', candidate: {candidate: 'candidate', sdpMid: '0', sdpMLineIndex: 0}});
    await Promise.resolve();
    expect(webRTC.__peerConnections).toHaveLength(0);
    expect(signals.sendCallAnswerOverSocket).not.toHaveBeenCalled();
    const stream = new webRTC.MediaStream([
      {kind: 'audio', enabled: true, stop: jest.fn()},
      {kind: 'video', enabled: true, stop: jest.fn()},
    ]);
    resolveCapture(stream);
    await Promise.all([setup, signal]);
    const peer = webRTC.__peerConnections.at(-1);
    expect(peer.addTrack).toHaveBeenCalledTimes(2);
    expect(peer.senders.some((sender: any) => sender.track?.kind === 'video')).toBe(true);
    if (role === 'receiver') {
      expect(signals.sendCallAnswerOverSocket).toHaveBeenCalledTimes(1);
      expect(peer.getTransceivers().map((item: any) => item.direction)).toEqual(['sendrecv', 'sendrecv']);
    } else {
      await media.startCallAudioOffer('capture-race');
      expect(signals.sendCallOfferOverSocket).toHaveBeenCalledTimes(1);
    }
  } finally { await media.stopCallAudio(); }
});

test.each(['caller', 'receiver'] as const)('a pending HD encoder update cannot block the %s handshake', async role => {
  const {media, webRTC, signals} = loadVideoRegressionServices();
  try {
    await media.startCallAudio({callId: 'slow-encoder', role, type: 'video'});
    const peer = webRTC.__peerConnections.at(-1);
    const video = peer.senders.find((sender: any) => sender.track?.kind === 'video');
    video.setParameters.mockImplementation(() => new Promise(() => {}));
    if (role === 'caller') {
      await media.startCallAudioOffer('slow-encoder');
      expect(signals.sendCallOfferOverSocket).toHaveBeenCalledTimes(1);
      await media.handleCallAudioSignal({callId: 'slow-encoder', type: 'answer', answer: {type: 'answer', sdp: 'answer'}});
    } else {
      await media.handleCallAudioSignal({callId: 'slow-encoder', type: 'offer', offer: {type: 'offer', sdp: 'offer'}});
      expect(signals.sendCallAnswerOverSocket).toHaveBeenCalledTimes(1);
    }
    expect(video.setParameters).toHaveBeenCalledWith(expect.objectContaining({encodings: [expect.objectContaining({maxBitrate: 2500000})]}));
  } finally { await media.stopCallAudio(); }
});
