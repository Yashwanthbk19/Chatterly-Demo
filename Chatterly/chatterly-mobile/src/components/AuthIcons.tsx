import React from 'react';
import Svg, {Path} from 'react-native-svg';
import {themeInk} from '../theme/themedStyles';

export function EmailIcon({color}: {color?: string} = {}) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 7C3 6.46957 3.21071 5.96086 3.58579 5.58579C3.96086 5.21071 4.46957 5 5 5H19C19.5304 5 20.0391 5.21071 20.4142 5.58579C20.7893 5.96086 21 6.46957 21 7M3 7V17C3 17.5304 3.21071 18.0391 3.58579 18.4142C3.96086 18.7893 4.46957 19 5 19H19C19.5304 19 20.0391 18.7893 20.4142 18.4142C20.7893 18.0391 21 17.5304 21 17V7M3 7L12 13L21 7"
        stroke={color || themeInk('#0B1220')}
        strokeWidth={1.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function GoogleIcon() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Path
        d="M19.8444 10.4332H19.2V10.4H12V13.6H16.5212C15.8616 15.4628 14.0892 16.8 12 16.8C9.3492 16.8 7.2 14.6508 7.2 12C7.2 9.3492 9.3492 7.2 12 7.2C13.2236 7.2 14.3368 7.6616 15.1844 8.4156L17.4472 6.1528C16.0184 4.8212 14.1072 4 12 4C7.582 4 4 7.582 4 12C4 16.418 7.582 20 12 20C16.418 20 20 16.418 20 12C20 11.4636 19.9448 10.94 19.8444 10.4332Z"
        fill={themeInk('#FFC107')}
      />
      <Path
        d="M4.9224 8.2764L7.5508 10.204C8.262 8.4432 9.9844 7.2 12 7.2C13.2236 7.2 14.3368 7.6616 15.1844 8.4156L17.4472 6.1528C16.0184 4.8212 14.1072 4 12 4C8.9272 4 6.2624 5.7348 4.9224 8.2764Z"
        fill={themeInk('#FF3D00')}
      />
      <Path
        d="M12 20C14.0664 20 15.944 19.2092 17.3636 17.9232L14.8876 15.828C14.0576 16.4596 13.043 16.8011 12 16.8C9.9192 16.8 8.1524 15.4732 7.4868 13.6216L4.878 15.6316C6.202 18.2224 8.8908 20 12 20Z"
        fill={themeInk('#4CAF50')}
      />
      <Path
        d="M19.8444 10.4332H19.2V10.4H12V13.6H16.5212C16.2057 14.4866 15.6373 15.2613 14.8864 15.8284L14.8876 15.828L17.3636 17.9232C17.1884 18.0824 20 16 20 12C20 11.4636 19.9448 10.94 19.8444 10.4332Z"
        fill={themeInk('#1976D2')}
      />
    </Svg>
  );
}

export function SupportIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Path d="M4 14V10A8 8 0 0 1 20 10V14" stroke={themeInk('#0B1220')} strokeWidth={1.5}
        strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M4 11H6.5V17H6A2 2 0 0 1 4 15V11ZM20 11H17.5V17H18A2 2 0 0 0 20 15V11Z"
        stroke={themeInk('#0B1220')} strokeWidth={1.5} strokeLinejoin="round" />
      <Path d="M17.5 17C17.5 19 15.5 20 13.5 20H12" stroke={themeInk('#0B1220')} strokeWidth={1.5}
        strokeLinecap="round" />
    </Svg>
  );
}

/** The pencil-on-a-square beside "Change" on the OTP screen. */
export function EditDestinationIcon({color = '#8B4CF6'}: {color?: string}) {
  return (
    <Svg width={13} height={13} viewBox="0 0 24 24" fill="none">
      <Path d="M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"
        stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M18.4 3.6a1.9 1.9 0 0 1 2.7 2.7L12.8 14.6l-3.5.8.8-3.5 8.3-8.3Z"
        stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
