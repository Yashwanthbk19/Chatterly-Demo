import {NativeModules} from 'react-native';

/**
 * Whether react-native-webrtc can be loaded in this build.
 *
 * The package throws while it loads when its native module is missing, as in
 * Expo Go. A lazy `require` does not help: Metro reports a module that throws
 * on first load as a fatal "Uncaught Error" before any try/catch around the
 * require sees it. The package's own test is `NativeModules.WebRTCModule ===
 * null`, so asking the same question first lets the call code fall back to
 * its "needs a development build" message instead.
 */
export function canLoadWebRTC(): boolean {
  return NativeModules.WebRTCModule !== null;
}
