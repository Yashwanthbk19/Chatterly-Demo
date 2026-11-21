import {Platform} from 'react-native';

export type ScreenShareSource = 'screen' | 'app';

/** Android's MediaProjection app chooser was introduced in API 34. */
export function supportsAppScreenSharing(): boolean {
  return Platform.OS === 'android' && Number(Platform.Version) >= 34;
}

export function appScreenSharingUnavailableMessage(): string {
  return Platform.OS === 'ios'
    ? 'Specific App sharing is not supported by iOS screen broadcasting. Use Entire Screen instead.'
    : 'Specific App sharing requires Android 14 or later. Use Entire Screen instead.';
}
