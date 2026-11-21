import {NativeModules, Platform} from 'react-native';
import {startGroupScreenShare, stopGroupScreenShare} from '../src/services/groupCallRealtime';
import {confirmGroupCallParticipantUnmuted, connectGroupCallPeer, isGroupCallScreenCapturing, requestGroupCallParticipantUnmute, setGroupCallMuted, startGroupCallMedia, startGroupCallScreenCapture, stopGroupCallMedia, stopGroupCallScreenCapture, subscribeToGroupCallControls} from '../src/services/groupCallMedia';

jest.mock('../src/services/callBackground', () => ({
  startCallBackground: jest.fn(async () => undefined),
  stopCallBackground: jest.fn(async () => undefined),
}));

jest.mock('../src/services/groupCallRealtime', () => ({
  startGroupScreenShare: jest.fn(async () => ({success: true})),
  stopGroupScreenShare: jest.fn(async () => ({success: true})),
  sendGroupCallOffer: jest.fn(async () => ({success: true})),
  sendGroupCallIceCandidate: jest.fn(async () => ({success: true})),
}));

beforeEach(() => { jest.clearAllMocks(); NativeModules.ScreenBroadcast = {start: jest.fn(async () => true), stop: jest.fn()}; });
afterEach(async () => { await stopGroupCallMedia(); jest.restoreAllMocks(); });

const start = (type: 'audio' | 'video' = 'video') => startGroupCallMedia({groupCallId: 'call', selfId: 'z', type});
// `react-native-webrtc` ships no types until the native package is installed,
// so the jest-mapped mock is reached through `require` rather than an import
// that `tsc` cannot resolve.
const {mediaDevices} = require('react-native-webrtc') as {mediaDevices: {getDisplayMedia: jest.Mock; getUserMedia: jest.Mock}};

const captureStream = async () => mediaDevices.getDisplayMedia.mock.results.at(-1)!.value;

test('Android app sharing uses native app selection and stopping restores the call camera', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  jest.spyOn(Platform, 'Version', 'get').mockReturnValue(34);
  await start();
  await connectGroupCallPeer('a');
  await startGroupCallScreenCapture(jest.fn(), false, 720, true, 'app');
  expect(mediaDevices.getDisplayMedia).toHaveBeenLastCalledWith({android: expect.objectContaining({createConfigForDefaultDisplay: false})});
  expect(startGroupScreenShare).toHaveBeenCalledWith('call');
  await stopGroupCallScreenCapture();
  expect(isGroupCallScreenCapturing()).toBe(false);
  const local = await mediaDevices.getUserMedia.mock.results.at(-1)!.value;
  expect(local.getAudioTracks()[0].stop).not.toHaveBeenCalled();
});

test.each(['ios', 'android'] as const)('%s: unsupported app capture never falls back to sharing the entire screen', async os => {
  jest.replaceProperty(Platform, 'OS', os);
  jest.spyOn(Platform, 'Version', 'get').mockReturnValue(os === 'ios' ? '18.0' : 33);
  await start();
  await expect(startGroupCallScreenCapture(jest.fn(), false, 720, true, 'app')).rejects.toThrow('Specific App sharing');
  expect(mediaDevices.getDisplayMedia).not.toHaveBeenCalled();
  expect(startGroupScreenShare).not.toHaveBeenCalled();
});

test('Entire Screen requests full-display consent', async () => {
  await start();
  await startGroupCallScreenCapture(jest.fn());
  expect(mediaDevices.getDisplayMedia).toHaveBeenLastCalledWith({android: expect.objectContaining({createConfigForDefaultDisplay: true})});
});

test.each(['audio', 'video'] as const)('%s call captures after consent and releases capture without stopping microphone', async type => {
  const background = require('../src/services/callBackground');
  await start(type);
  expect(background.startCallBackground).toHaveBeenCalledWith('call', type, 'Group Call');
  await connectGroupCallPeer('a');
  await startGroupCallScreenCapture(jest.fn());
  const stream = await captureStream();
  expect(isGroupCallScreenCapturing()).toBe(true);
  expect(startGroupScreenShare).toHaveBeenCalledWith('call');
  await setGroupCallMuted(true);
  expect(stream.getVideoTracks()[0].enabled).toBe(true);
  await stopGroupCallScreenCapture();
  expect(stream.getVideoTracks()[0].stop).toHaveBeenCalledTimes(1);
  expect(stream.release).not.toHaveBeenCalled();
  expect(stopGroupScreenShare).toHaveBeenCalledWith('call');
  expect(background.stopCallBackground).not.toHaveBeenCalled();
  expect(isGroupCallScreenCapturing()).toBe(false);
  const local = await (mediaDevices.getUserMedia as jest.Mock).mock.results.at(-1)!.value;
  expect(local.getAudioTracks()[0].stop).not.toHaveBeenCalled();
  await stopGroupCallMedia('call');
  expect(background.stopCallBackground).toHaveBeenCalledWith('call');
});

test.each(['screen', 'app'] as const)('%s: native consent denial never announces sharing', async source => {
  jest.replaceProperty(Platform, 'OS', 'android');
  jest.spyOn(Platform, 'Version', 'get').mockReturnValue(34);
  await start();
  (mediaDevices.getDisplayMedia as jest.Mock).mockRejectedValueOnce(new Error('Permission denied'));
  await expect(startGroupCallScreenCapture(jest.fn(), false, 720, true, source)).rejects.toThrow('Permission denied');
  expect(startGroupScreenShare).not.toHaveBeenCalled();
  expect(isGroupCallScreenCapturing()).toBe(false);
});

test('backend refusal rolls back capture', async () => {
  await start();
  (startGroupScreenShare as jest.Mock).mockResolvedValueOnce({success: false, message: 'Another participant is sharing'});
  await expect(startGroupCallScreenCapture(jest.fn())).rejects.toThrow('Another participant');
  const stream = await captureStream();
  expect(stream.getVideoTracks()[0].stop).toHaveBeenCalled();
  expect(isGroupCallScreenCapturing()).toBe(false);
});

test('system stop releases capture and notifies the screen', async () => {
  await start();
  const stopped = jest.fn();
  await startGroupCallScreenCapture(stopped);
  const stream = await captureStream();
  stream.getVideoTracks()[0].onended();
  await new Promise<void>(resolve => setImmediate(() => resolve()));
  expect(stopped).toHaveBeenCalledTimes(1);
  expect(isGroupCallScreenCapturing()).toBe(false);
});

test('ending the call while the native consent dialog is open cannot resurrect sharing', async () => {
  await start();
  let grant!: (stream: any) => void;
  const stream = await mediaDevices.getDisplayMedia({});
  (mediaDevices.getDisplayMedia as jest.Mock).mockImplementationOnce(() => new Promise(resolve => { grant = resolve; }));
  const pending = startGroupCallScreenCapture(jest.fn());
  const rejected = expect(pending).rejects.toThrow('call has ended');
  await new Promise<void>(resolve => setImmediate(() => resolve()));
  await stopGroupCallMedia();
  grant(stream);
  await rejected;
  expect(startGroupScreenShare).not.toHaveBeenCalled();
  expect(stream.getVideoTracks()[0].stop).toHaveBeenCalled();
});

test('existing and late-joining peers receive the screen track, then regain the camera', async () => {
  const rtc = require('react-native-webrtc');
  const firstConnection = rtc.__peerConnections.length;
  const senders = jest.spyOn(rtc.RTCPeerConnection.prototype, 'makeSender');
  await start('video');
  await connectGroupCallPeer('a');
  const camera = (await (mediaDevices.getUserMedia as jest.Mock).mock.results.at(-1)!.value).getVideoTracks()[0];
  const first = senders.mock.results[1].value;
  expect(first.track).toBe(camera);
  await startGroupCallScreenCapture(jest.fn(), true);
  const display = (await captureStream()).getVideoTracks()[0];
  expect(first.track).toBe(display);
  expect(first.setParameters).toHaveBeenCalledWith(expect.objectContaining({degradationPreference: 'balanced'}));
  await connectGroupCallPeer('b');
  const late = senders.mock.results[3].value;
  expect(late.track).toBe(display);
  await stopGroupCallScreenCapture();
  expect(first.track).toBe(camera);
  expect(late.track).toBe(camera);
  // The display source is released only after every sender is back on the
  // camera, and stopping a share never closes the call's peer connections.
  expect(first.replaceTrack.mock.invocationCallOrder.at(-1)).toBeLessThan(display.stop.mock.invocationCallOrder[0]);
  expect(late.replaceTrack.mock.invocationCallOrder.at(-1)).toBeLessThan(display.stop.mock.invocationCallOrder[0]);
  expect(rtc.__peerConnections.slice(firstConnection).every((peer: {close: jest.Mock}) => peer.close.mock.calls.length === 0)).toBe(true);
  senders.mockRestore();
});

test('restoring camera limits preserves WebRTC encoding objects and omits native-crashing null fields', async () => {
  const rtc = require('react-native-webrtc');
  const senders = jest.spyOn(rtc.RTCPeerConnection.prototype, 'makeSender');
  await start('video');
  await connectGroupCallPeer('a');
  const sender = senders.mock.results[1].value;
  const encoding = {
    active: true,
    maxBitrate: null,
    maxFramerate: null,
    scaleResolutionDownBy: null,
    toJSON() {
      return {
        active: this.active,
        ...(this.maxBitrate == null ? {} : {maxBitrate: this.maxBitrate}),
        ...(this.maxFramerate == null ? {} : {maxFramerate: this.maxFramerate}),
        ...(this.scaleResolutionDownBy == null ? {} : {scaleResolutionDownBy: this.scaleResolutionDownBy}),
      };
    },
  };
  const parameters = {
    encodings: [encoding],
    degradationPreference: null,
    toJSON() {
      return {
        encodings: this.encodings.map(item => item.toJSON()),
        ...(this.degradationPreference == null ? {} : {degradationPreference: this.degradationPreference}),
      };
    },
  };
  sender.getParameters.mockReturnValue(parameters);

  await startGroupCallScreenCapture(jest.fn());
  await stopGroupCallScreenCapture();

  const restored = sender.setParameters.mock.calls.at(-1)[0];
  expect(restored.encodings[0]).toBe(encoding);
  expect(JSON.parse(JSON.stringify(restored))).toEqual({encodings: [{active: true}]});
  senders.mockRestore();
});

test('an unmute request stays available while screen sharing and resolves after participant confirmation', async () => {
  const rtc = require('react-native-webrtc');
  await start('video');
  await connectGroupCallPeer('a');
  await startGroupCallScreenCapture(jest.fn());
  const peer = rtc.__peerConnections.at(-1);
  const channel = peer.createDataChannel.mock.results[0].value;
  const receive = jest.fn();
  const unsubscribe = subscribeToGroupCallControls(receive);

  const pending = requestGroupCallParticipantUnmute('a');
  await new Promise<void>(resolve => setImmediate(resolve));
  const request = JSON.parse(channel.send.mock.calls.at(-1)[0]);
  expect(request).toEqual({type: 'unmute-request', requestId: expect.any(String)});
  channel.onmessage({data: JSON.stringify({type: 'unmute-result', requestId: request.requestId, success: true})});
  await expect(pending).resolves.toBeUndefined();

  channel.onmessage({data: JSON.stringify({type: 'unmute-request', requestId: 'remote-1'})});
  expect(receive).toHaveBeenCalledWith(expect.objectContaining({groupCallId: 'call', fromUserId: 'a', type: 'unmute-request', respond: expect.any(Function)}));
  receive.mock.calls.at(-1)[0].respond({success: true});
  expect(JSON.parse(channel.send.mock.calls.at(-1)[0])).toEqual({type: 'unmute-result', requestId: 'remote-1', success: true});

  unsubscribe();
  await stopGroupCallMedia('call');
  expect(channel.close).toHaveBeenCalledTimes(1);
  expect(channel.onmessage).toBeNull();
});

test('an unmute request also settles on the server unmute broadcast and accepts legacy requests', async () => {
  const rtc = require('react-native-webrtc');
  await start('video');
  await connectGroupCallPeer('a');
  const peer = rtc.__peerConnections.at(-1);
  const channel = peer.createDataChannel.mock.results[0].value;
  const receive = jest.fn();
  const unsubscribe = subscribeToGroupCallControls(receive);

  // A participant on an older build never replies with `unmute-result`; the
  // room's `group_call_user_unmuted` broadcast confirms the change instead.
  const pending = requestGroupCallParticipantUnmute('a');
  await new Promise<void>(resolve => setImmediate(resolve));
  confirmGroupCallParticipantUnmuted('a');
  await expect(pending).resolves.toBeUndefined();

  // An older admin build sends the request without an id; it is still honoured.
  const sent = channel.send.mock.calls.length;
  channel.onmessage({data: JSON.stringify({type: 'unmute-request'})});
  expect(receive).toHaveBeenCalledWith(expect.objectContaining({fromUserId: 'a', type: 'unmute-request'}));
  receive.mock.calls.at(-1)[0].respond({success: true});
  expect(channel.send).toHaveBeenCalledTimes(sent);

  unsubscribe();
  await stopGroupCallMedia('call');
});
