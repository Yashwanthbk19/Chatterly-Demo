import NetInfo from '@react-native-community/netinfo';
import {AppState, DeviceEventEmitter, NativeModules, Platform} from 'react-native';
import {connectRealtime} from './chatRealtime';

const STOPPED_EVENT = 'chatterly.callAvailabilityStopped';
const owners = new Map<string, symbol>();

/** Keep the authenticated call listener available; backgrounding is not logout. */
export function startCallAvailabilityLifecycle(userId: string): () => void {
  if (!userId) return () => undefined;
  const owner = Symbol(userId);
  owners.set(userId, owner);
  let disposed = false;
  let starting: Promise<void> | null = null;
  let started = false;
  const release = () => {
    if (owners.get(userId) !== owner) return;
    owners.delete(userId);
    if (Platform.OS === 'android') NativeModules.CallAvailability?.stop(userId).catch(() => undefined);
  };
  const ensureAvailable = () => {
    if (disposed) return;
    connectRealtime();
    // Android requires this service to start while the activity is visible.
    // Once started, it continues across background, inactive and locked states.
    if (Platform.OS !== 'android' || AppState.currentState !== 'active' || started || starting || !NativeModules.CallAvailability?.start) return;
    starting = Promise.resolve(NativeModules.CallAvailability.start(userId))
      .then(() => { started = true; })
      .catch(() => { /* Retry on the next foreground or network transition. */ })
      .finally(() => {
        starting = null;
        if (disposed) release();
      });
  };
  const appState = AppState.addEventListener('change', state => {
    if (state === 'active') ensureAvailable();
  });
  const stopNetwork = NetInfo.addEventListener(state => {
    if (state.isConnected !== false && state.isInternetReachable !== false) ensureAvailable();
  });
  const runtimeStopped = DeviceEventEmitter.addListener(STOPPED_EVENT, (event: {userId: string}) => {
    if (event.userId !== userId || disposed) return;
    started = false;
    if (AppState.currentState === 'active') ensureAvailable();
  });
  ensureAvailable();
  return () => {
    disposed = true;
    appState.remove();
    stopNetwork();
    runtimeStopped.remove();
    if (!starting) release();
  };
}

/** The task keeps the existing React instance's socket heartbeat timers running. */
export function keepCallAvailabilityAlive({userId}: {userId: string}): Promise<void> {
  return new Promise(resolve => {
    const finish = () => { subscription.remove(); resolve(); };
    const subscription = DeviceEventEmitter.addListener(STOPPED_EVENT, (event: {userId: string}) => {
      if (event.userId === userId) finish();
    });
    Promise.resolve(NativeModules.CallAvailability?.isActive(userId))
      .then(active => { if (!active) finish(); }).catch(finish);
  });
}
