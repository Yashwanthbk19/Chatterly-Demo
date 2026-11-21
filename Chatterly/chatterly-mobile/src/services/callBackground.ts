import {DeviceEventEmitter, NativeModules, Platform} from 'react-native';

const STOPPED_EVENT = 'chatterly.callBackgroundStopped';
const END_EVENT = 'chatterly.callBackgroundEnd';

export function startCallBackground(callId: string, type: 'audio' | 'video', contactName?: string): Promise<void> | undefined {
  if (Platform.OS !== 'android') return;
  return NativeModules.CallBackground?.start(callId, type, contactName || 'Chatterly');
}

export async function stopCallBackground(callId: string): Promise<void> {
  if (Platform.OS !== 'android') return;
  await NativeModules.CallBackground?.stop(callId);
}

/** A running headless task keeps React Native's socket/ACK timers alive while locked. */
export function keepCallRuntimeAlive({callId}: {callId: string}): Promise<void> {
  return new Promise(resolve => {
    const finish = () => { subscription.remove(); resolve(); };
    const subscription = DeviceEventEmitter.addListener(STOPPED_EVENT, (event: {callId: string}) => {
      if (event.callId === callId) finish();
    });
    // Cover a call ending before the task has attached its event listener.
    Promise.resolve(NativeModules.CallBackground?.isActive(callId))
      .then(active => { if (!active) finish(); }).catch(finish);
  });
}

export function subscribeToBackgroundCallEnd(callId: string, onEnd: () => void): () => void {
  if (Platform.OS !== 'android') return () => undefined;
  const subscription = DeviceEventEmitter.addListener(END_EVENT, (event: {callId: string}) => {
    if (event.callId === callId) onEnd();
  });
  return () => subscription.remove();
}
