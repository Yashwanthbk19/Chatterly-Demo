import {DeviceEventEmitter, NativeModules, Platform} from 'react-native';
import {keepCallRuntimeAlive, startCallBackground, stopCallBackground, subscribeToBackgroundCallEnd} from '../src/services/callBackground';

const runtime = {
  start: jest.fn(async () => undefined),
  stop: jest.fn(async () => undefined),
  isActive: jest.fn(async () => true),
};
let os: ReturnType<typeof jest.replaceProperty>;

beforeEach(() => {
  jest.clearAllMocks();
  os = jest.replaceProperty(Platform, 'OS', 'android');
  NativeModules.CallBackground = runtime;
  runtime.isActive.mockResolvedValue(true);
});

afterEach(() => {
  delete NativeModules.CallBackground;
  os.restore();
});

test('starts and stops native call protection without using a screen wake lock', async () => {
  await startCallBackground('call-164', 'video', 'Ram');
  expect(runtime.start).toHaveBeenCalledWith('call-164', 'video', 'Ram');
  await stopCallBackground('call-164');
  expect(runtime.stop).toHaveBeenCalledWith('call-164');
});

test('keeps the call runtime alive across screen-off until that call stops', async () => {
  const finished = jest.fn();
  const task = keepCallRuntimeAlive({callId: 'call-164'}).then(finished);
  await Promise.resolve();
  DeviceEventEmitter.emit('chatterly.callBackgroundStopped', {callId: 'other-call'});
  await Promise.resolve();
  expect(finished).not.toHaveBeenCalled();
  DeviceEventEmitter.emit('chatterly.callBackgroundStopped', {callId: 'call-164'});
  await task;
  expect(finished).toHaveBeenCalledTimes(1);
});

test('finishes a task whose call stopped before its listener was ready', async () => {
  runtime.isActive.mockResolvedValue(false);
  await expect(keepCallRuntimeAlive({callId: 'ended-call'})).resolves.toBeUndefined();
});

test('notification hang-up reaches only its call and unsubscribes cleanly', () => {
  const end = jest.fn();
  const unsubscribe = subscribeToBackgroundCallEnd('call-164', end);
  DeviceEventEmitter.emit('chatterly.callBackgroundEnd', {callId: 'old-call'});
  expect(end).not.toHaveBeenCalled();
  DeviceEventEmitter.emit('chatterly.callBackgroundEnd', {callId: 'call-164'});
  expect(end).toHaveBeenCalledTimes(1);
  unsubscribe();
  DeviceEventEmitter.emit('chatterly.callBackgroundEnd', {callId: 'call-164'});
  expect(end).toHaveBeenCalledTimes(1);
});

test('iOS and older native clients retain their existing call path', async () => {
  delete NativeModules.CallBackground;
  await expect(Promise.resolve(startCallBackground('call-164', 'audio'))).resolves.toBeUndefined();
  await expect(stopCallBackground('call-164')).resolves.toBeUndefined();
  jest.replaceProperty(Platform, 'OS', 'ios');
  NativeModules.CallBackground = runtime;
  await startCallBackground('call-164', 'video');
  await stopCallBackground('call-164');
  expect(runtime.start).not.toHaveBeenCalled();
  expect(runtime.stop).not.toHaveBeenCalled();
});
