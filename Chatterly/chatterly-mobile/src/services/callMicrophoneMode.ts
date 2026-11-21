import {NativeModules, Platform} from 'react-native';

export async function getCallMicrophoneMode(): Promise<string> {
  if (Platform.OS !== 'ios' || !NativeModules.CallMicrophoneMode?.getMode) return 'Standard';
  return NativeModules.CallMicrophoneMode.getMode();
}

export async function openCallMicrophoneMode(): Promise<void> {
  if (Platform.OS !== 'ios' || !NativeModules.CallMicrophoneMode?.show) {
    throw new Error('Microphone modes require an updated iOS native build.');
  }
  await NativeModules.CallMicrophoneMode.show();
}
