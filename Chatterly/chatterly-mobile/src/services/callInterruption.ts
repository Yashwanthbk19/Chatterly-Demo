import {PermissionsAndroid, Platform} from 'react-native';

type InterruptionModule = {
  addListener: (event: string, listener: (event: {type: 'began' | 'ended'}) => void) => {remove: () => void};
  startMonitoring: () => void;
  stopMonitoring: () => void;
};
/** Subscribe before starting so a phone call already ringing is not missed. */
export function monitorCallInterruptions(onChange: (interrupted: boolean) => void): () => void {
  let native: InterruptionModule | null;
  try {
    const {requireOptionalNativeModule} = require('expo-modules-core') as typeof import('expo-modules-core');
    native = requireOptionalNativeModule<InterruptionModule>('CallInterruption');
  } catch { return () => undefined; }
  if (!native) return () => undefined;
  let disposed = false;
  const subscription = native.addListener('callInterruption', event => {
    if (!disposed) onChange(event.type === 'began');
  });
  const start = async () => {
    if (Platform.OS === 'android') {
      const permission = PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE;
      try {
        if (!await PermissionsAndroid.check(permission)) await PermissionsAndroid.request(permission);
      } catch { /* Still monitor audio focus if phone-state permission is unavailable. */ }
    }
    if (!disposed) native.startMonitoring();
  };
  start().catch(() => { /* Audio-focus monitoring remains optional in unsupported builds. */ });
  return () => { disposed = true; subscription.remove(); native.stopMonitoring(); };
}
