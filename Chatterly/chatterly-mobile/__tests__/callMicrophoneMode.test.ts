import {NativeModules, Platform} from 'react-native';
import {getCallMicrophoneMode, openCallMicrophoneMode} from '../src/services/callMicrophoneMode';

const previousModule = NativeModules.CallMicrophoneMode;
afterEach(() => { NativeModules.CallMicrophoneMode = previousModule; jest.restoreAllMocks(); });

test('reads the actual iOS microphone mode and opens the native system picker', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  const getMode = jest.fn(async () => 'Voice Isolation');
  const show = jest.fn(async () => undefined);
  NativeModules.CallMicrophoneMode = {getMode, show};
  await expect(getCallMicrophoneMode()).resolves.toBe('Voice Isolation');
  await openCallMicrophoneMode();
  expect(getMode).toHaveBeenCalledTimes(1);
  expect(show).toHaveBeenCalledTimes(1);
});

test('an older native build reports the missing microphone picker', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  NativeModules.CallMicrophoneMode = undefined;
  await expect(getCallMicrophoneMode()).resolves.toBe('Standard');
  await expect(openCallMicrophoneMode()).rejects.toThrow('updated iOS native build');
});
