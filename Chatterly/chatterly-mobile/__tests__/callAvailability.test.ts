import NetInfo from '@react-native-community/netinfo';
import {AppState, DeviceEventEmitter, NativeModules, Platform} from 'react-native';
import {connectRealtime} from '../src/services/chatRealtime';
import {keepCallAvailabilityAlive, startCallAvailabilityLifecycle} from '../src/services/callAvailability';

jest.mock('../src/services/chatRealtime', () => ({connectRealtime: jest.fn()}));

const native = {
  start: jest.fn(async (): Promise<void> => undefined),
  stop: jest.fn(async () => undefined),
  isActive: jest.fn(async () => true),
};
let changeState: (state: string) => void;
let network: (state: {isConnected: boolean; isInternetReachable: boolean}) => void;
let restoreOs: ReturnType<typeof jest.replaceProperty>;
const originalCurrentState = Object.getOwnPropertyDescriptor(AppState, 'currentState')!;
const removeState = jest.fn();
const removeNetwork = jest.fn();
const originalStateListener = jest.mocked(AppState.addEventListener).getMockImplementation();
const originalNetworkListener = jest.mocked(NetInfo.addEventListener).getMockImplementation();

beforeEach(() => {
  jest.clearAllMocks();
  native.start.mockResolvedValue(undefined);
  native.isActive.mockResolvedValue(true);
  restoreOs = jest.replaceProperty(Platform, 'OS', 'android');
  Object.defineProperty(AppState, 'currentState', {configurable: true, writable: true, value: 'active'});
  NativeModules.CallAvailability = native;
  jest.mocked(AppState.addEventListener).mockImplementation((_event, listener) => {
    changeState = state => { AppState.currentState = state as typeof AppState.currentState; listener(state as typeof AppState.currentState); };
    return {remove: removeState};
  });
  jest.mocked(NetInfo.addEventListener).mockImplementation(listener => {
    network = state => listener(state as never);
    return removeNetwork;
  });
});

afterEach(() => {
  delete NativeModules.CallAvailability;
  restoreOs.restore(); Object.defineProperty(AppState, 'currentState', originalCurrentState);
  if (originalStateListener) jest.mocked(AppState.addEventListener).mockImplementation(originalStateListener);
  if (originalNetworkListener) jest.mocked(NetInfo.addEventListener).mockImplementation(originalNetworkListener);
});

test('background inactive and locked states retain authenticated availability until logout', async () => {
  const stop = startCallAvailabilityLifecycle('user-167');
  await Promise.resolve();
  changeState('inactive'); changeState('background');
  expect(native.start).toHaveBeenCalledTimes(1);
  expect(native.start).toHaveBeenCalledWith('user-167');
  expect(native.stop).not.toHaveBeenCalled();
  changeState('active');
  await Promise.resolve(); await Promise.resolve();
  expect(native.start).toHaveBeenCalledTimes(1);
  stop();
  await Promise.resolve();
  expect(native.stop).toHaveBeenCalledWith('user-167');
  expect(removeState).toHaveBeenCalled();
  expect(removeNetwork).toHaveBeenCalled();
});

test('restores the existing socket on network recovery even while minimized', () => {
  const stop = startCallAvailabilityLifecycle('user-167');
  changeState('background');
  jest.mocked(connectRealtime).mockClear();
  network({isConnected: false, isInternetReachable: false});
  expect(connectRealtime).not.toHaveBeenCalled();
  network({isConnected: true, isInternetReachable: true});
  expect(connectRealtime).toHaveBeenCalledTimes(1);
  expect(native.stop).not.toHaveBeenCalled();
  stop();
});

test('defers a cold background service start until Android permits a foreground start', () => {
  AppState.currentState = 'background';
  const stop = startCallAvailabilityLifecycle('user-167');
  expect(native.start).not.toHaveBeenCalled();
  changeState('active');
  expect(native.start).toHaveBeenCalledTimes(1);
  stop();
});

test('logout during native startup stops availability after startup completes', async () => {
  let complete!: () => void;
  native.start.mockImplementationOnce(() => new Promise<void>(resolve => { complete = resolve; }));
  const stop = startCallAvailabilityLifecycle('user-167');
  stop();
  complete();
  for (let index = 0; index < 5; index++) await Promise.resolve();
  expect(native.stop).toHaveBeenCalledWith('user-167');
});

test('cleanup from a previous mount cannot stop the current signed-in availability', async () => {
  let completeFirst!: () => void;
  native.start.mockImplementationOnce(() => new Promise<void>(resolve => { completeFirst = resolve; }));
  const stopFirst = startCallAvailabilityLifecycle('user-167');
  stopFirst();
  const stopCurrent = startCallAvailabilityLifecycle('user-167');
  completeFirst();
  for (let index = 0; index < 6; index++) await Promise.resolve();
  expect(native.stop).not.toHaveBeenCalled();
  stopCurrent();
  expect(native.stop).toHaveBeenCalledTimes(1);
});

test('restarts availability if the native service exits while the app is visible', async () => {
  const stop = startCallAvailabilityLifecycle('user-167');
  for (let index = 0; index < 5; index++) await Promise.resolve();
  DeviceEventEmitter.emit('chatterly.callAvailabilityStopped', {userId: 'user-167'});
  expect(native.start).toHaveBeenCalledTimes(2);
  stop();
});

test('the idle headless task ends only for its own account', async () => {
  const finished = jest.fn();
  const task = keepCallAvailabilityAlive({userId: 'user-167'}).then(finished);
  await Promise.resolve();
  DeviceEventEmitter.emit('chatterly.callAvailabilityStopped', {userId: 'other-user'});
  await Promise.resolve();
  expect(finished).not.toHaveBeenCalled();
  DeviceEventEmitter.emit('chatterly.callAvailabilityStopped', {userId: 'user-167'});
  await task;
  expect(finished).toHaveBeenCalledTimes(1);
});

test('signed-out sessions and iOS never start the Android service', () => {
  startCallAvailabilityLifecycle('')();
  expect(native.start).not.toHaveBeenCalled();
  jest.replaceProperty(Platform, 'OS', 'ios');
  startCallAvailabilityLifecycle('user-167')();
  expect(native.start).not.toHaveBeenCalled();
  expect(native.stop).not.toHaveBeenCalled();
});
