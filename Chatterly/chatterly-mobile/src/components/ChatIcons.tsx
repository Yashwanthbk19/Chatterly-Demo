import React from 'react';
import {Image, StyleSheet} from 'react-native';
import Svg, {Circle, Defs, LinearGradient, Path, Rect, Stop} from 'react-native-svg';
import {themeInk} from '../theme/themedStyles';

/** Resolved per render, because the theme can change between renders. */
const dark = () => themeInk('#152033');

export function BackIcon() {
  return <Svg width={20} height={20} viewBox="0 0 24 24" fill="none"><Path d="m15 5-7 7 7 7" stroke={dark()} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" /></Svg>;
}

export function VideoCallIcon() {
  return <Svg width={21} height={21} viewBox="0 0 24 24" fill="none"><Rect x={3.5} y={6.3} width={11.5} height={11.4} rx={2} stroke={dark()} strokeWidth={1.45} /><Path d="m15 10 5-2.7v9.4L15 14" stroke={dark()} strokeWidth={1.45} strokeLinejoin="round" /></Svg>;
}

export function PhoneCallIcon() {
  return <Svg width={20} height={20} viewBox="0 0 24 24" fill="none"><Path d="m8 4.7 2 4.5-1.7 1.9c1.2 2.4 3 4.2 5.5 5.4l1.9-1.7 4.5 2-.7 3c-.1.4-.5.7-.9.7C10.3 20.5 3.5 13.7 3.5 5.4c0-.4.3-.8.7-.9l3-.7.8.9Z" stroke={dark()} strokeWidth={1.45} strokeLinejoin="round" /></Svg>;
}

export function ChatSearchIcon() {
  return <Svg width={20} height={20} viewBox="0 0 24 24" fill="none"><Circle cx={10.8} cy={10.8} r={6.3} stroke={dark()} strokeWidth={1.5} /><Path d="m15.5 15.5 4.2 4.2" stroke={dark()} strokeWidth={1.5} strokeLinecap="round" /></Svg>;
}

// `active` tints the glyph while the emoji panel is open, which is the only
// thing distinguishing the composer's toggle from the attachment button beside
// it once the keyboard has been replaced by the picker.
export function EmojiIcon({active = false}: {active?: boolean}) {
  const color = active ? '#8B27E9' : '#526176';
  return <Svg width={20} height={20} viewBox="0 0 24 24" fill="none"><Circle cx={12} cy={12} r={8} stroke={color} strokeWidth={1.45} /><Circle cx={9.2} cy={10} r={0.8} fill={color} /><Circle cx={14.8} cy={10} r={0.8} fill={color} /><Path d="M8.8 14c.8 1.1 1.85 1.65 3.2 1.65S14.4 15.1 15.2 14" stroke={color} strokeWidth={1.4} strokeLinecap="round" /></Svg>;
}

// The other half of the emoji toggle: while the emoji panel has the keyboard's
// place, this is the button that brings the keyboard back.
export function KeyboardIcon({active = false}: {active?: boolean}) {
  const color = active ? '#8B27E9' : '#526176';
  return <Svg width={20} height={20} viewBox="0 0 24 24" fill="none"><Rect x={3} y={6.2} width={18} height={11.6} rx={2.4} stroke={color} strokeWidth={1.45} /><Path d="M6.7 10.1h.1M9.9 10.1h.1M13.1 10.1h.1M16.3 10.1h.1M7.8 14.2h8.4" stroke={color} strokeWidth={1.7} strokeLinecap="round" /></Svg>;
}

export function PaperclipIcon({active = false}: {active?: boolean}) {
  return <Svg width={21} height={21} viewBox="0 0 24 24" fill="none"><Path d="m8.3 12.8 5.9-5.9a3.1 3.1 0 1 1 4.4 4.4l-7.2 7.2a4.5 4.5 0 0 1-6.4-6.4l7-7" stroke={active ? themeInk('#7939EA') : themeInk('#526176')} strokeWidth={1.55} strokeLinecap="round" /><Path d="m9.1 14.9 7-7" stroke={active ? themeInk('#7939EA') : themeInk('#526176')} strokeWidth={1.55} strokeLinecap="round" /></Svg>;
}

export function MicrophoneIcon() {
  return (
    <Svg width={42} height={38} viewBox="0 0 60 52" fill="none">
      <Defs>
        <LinearGradient id="microphoneButtonGradient" x1={-2.56109} y1={29.1158} x2={59.7043} y2={41.2667} gradientUnits="userSpaceOnUse">
          <Stop stopColor="#8B5CF6" />
          <Stop offset={1} stopColor="#8A24E4" />
        </LinearGradient>
      </Defs>
      <Rect x={2} y={2} width={56} height={48} rx={6} fill="url(#microphoneButtonGradient)" />
      <Path
        d="M23 24C23 25.8565 23.7375 27.637 25.0503 28.9497C26.363 30.2625 28.1435 31 30 31M30 31C31.8565 31 33.637 30.2625 34.9497 28.9497C36.2625 27.637 37 25.8565 37 24M30 31V35M26 35H30M30 35H34M27 19C27 18.2044 27.3161 17.4413 27.8787 16.8787C28.4413 16.3161 29.2044 16 30 16C30.7956 16 31.5587 16.3161 32.1213 16.8787C32.6839 17.4413 33 18.2044 33 19V24C33 24.7956 32.6839 25.5587 32.1213 26.1213C31.5587 26.6839 30.7956 27 30 27C29.2044 27 28.4413 26.6839 27.8787 26.1213C27.3161 25.5587 27 24.7956 27 24V19Z"
        stroke={themeInk('#FFFFFF')}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// `onDark` is for the filled purple composer button in the attached design,
// where the microphone sits on the accent colour rather than on white.
export function CompactMicrophoneIcon({active = false, onDark = false}: {active?: boolean; onDark?: boolean}) {
  const color = onDark ? '#FFFFFF' : active ? '#8B27E9' : '#526176';
  return <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
    <Rect x={9} y={3.5} width={6} height={11} rx={3} stroke={color} strokeWidth={1.5} />
    <Path d="M6.8 11.5a5.2 5.2 0 0 0 10.4 0M12 16.8V21M9.2 21h5.6" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
  </Svg>;
}

export function RedMicrophoneIcon() {
  return <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
    <Rect x={9} y={3.5} width={6} height={10.8} rx={3} stroke={themeInk('#FF3B3B')} strokeWidth={1.65} />
    <Path d="M6.8 11.6a5.2 5.2 0 0 0 10.4 0M12 16.7V21M9.2 21h5.6" stroke={themeInk('#FF3B3B')} strokeWidth={1.65} strokeLinecap="round" />
  </Svg>;
}

export function PlayTriangleIcon({color = '#111827'}: {color?: string}) {
  return <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
    <Path d="M7.2 5.4v13.2L18 12 7.2 5.4Z" fill={color} />
  </Svg>;
}

export function PauseBarsIcon({color = '#111827'}: {color?: string}) {
  return <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
    <Rect x={7} y={5} width={3.8} height={14} rx={1.1} fill={color} />
    <Rect x={13.2} y={5} width={3.8} height={14} rx={1.1} fill={color} />
  </Svg>;
}

export function TrashIcon({color = '#FF3B3B'}: {color?: string}) {
  return <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
    <Path d="M8 7.2V5.8c0-.7.6-1.3 1.3-1.3h5.4c.7 0 1.3.6 1.3 1.3v1.4M5.8 7.2h12.4M9 10v7M12 10v7M15 10v7M7.1 7.2l.7 12.1c0 .7.6 1.2 1.3 1.2h5.8c.7 0 1.2-.5 1.3-1.2l.7-12.1" stroke={color} strokeWidth={1.55} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>;
}

export function LockIcon({locked = true, color = '#344256'}: {locked?: boolean; color?: string}) {
  return <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
    <Path d={locked ? 'M8 10V8a4 4 0 0 1 8 0v2' : 'M8 10V8a4 4 0 0 1 7.3-2.2'} stroke={color} strokeWidth={1.55} strokeLinecap="round" />
    <Rect x={6.5} y={10} width={11} height={9.5} rx={2} stroke={color} strokeWidth={1.55} />
    <Path d="M12 14v2" stroke={color} strokeWidth={1.55} strokeLinecap="round" />
  </Svg>;
}

export function PinMarkerIcon({color = '#6D28D9', size = 14, strokeWidth = 1.8}: {color?: string; size?: number; strokeWidth?: number}) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M8.5 4.5h7M10 4.5v6.2l-2 3.8v1.8h8v-1.8l-2-3.8V4.5M12 16.3v4.2" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>;
}

export function SendIcon() {
  return <Svg width={20} height={20} viewBox="0 0 24 24" fill="none"><Path d="m4 5 16 7-16 7 2.2-7L4 5Z" stroke={themeInk('#FFFFFF')} strokeWidth={1.5} strokeLinejoin="round" /><Path d="M6.2 12H14" stroke={themeInk('#FFFFFF')} strokeWidth={1.5} strokeLinecap="round" /></Svg>;
}

export function ConnectionStatusIcon({status}: {status: 'connected' | 'connecting' | 'offline'}) {
  if (status === 'connected') {
    return <Svg width={20} height={20} viewBox="0 0 20 20" fill="none">
      <Path d="M4 16L6.14468 13.8258M13.8553 6.17421L16 4M7.43149 8.17285L11.7208 12.5213L10.434 13.8258C10.1541 14.119 9.81938 14.3527 9.44942 14.5135C9.07946 14.6742 8.68164 14.7587 8.27916 14.762C7.87667 14.7653 7.47756 14.6874 7.10507 14.5328C6.73259 14.3781 6.39418 14.1499 6.10957 13.8614C5.82496 13.5729 5.59983 13.2298 5.44732 12.8522C5.2948 12.4746 5.21793 12.0699 5.2212 11.6619C5.22447 11.2539 5.3078 10.8506 5.46635 10.4755C5.6249 10.1005 5.85548 9.76118 6.14468 9.47737L7.43149 8.17285ZM12.5685 11.8272L8.27916 7.47873L9.56596 6.17421C9.84592 5.88103 10.1806 5.64727 10.5506 5.48654C10.9205 5.32581 11.3184 5.24133 11.7208 5.23801C12.1233 5.2347 12.5224 5.31262 12.8949 5.46724C13.2674 5.62186 13.6058 5.85009 13.8904 6.13862C14.175 6.42715 14.4002 6.77021 14.5527 7.14783C14.7052 7.52544 14.7821 7.93005 14.7788 8.33808C14.7755 8.74611 14.6922 9.1494 14.5337 9.52445C14.3751 9.8995 14.1445 10.2388 13.8553 10.5226L12.5685 11.8272Z" stroke={themeInk('#0B1220')} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>;
  }

  if (status === 'offline') {
    return <Svg width={20} height={20} viewBox="0 0 20 20" fill="none">
      <Path d="M16.6667 13.3333L13.3333 16.6667M2.5 17.5L4.58333 15.4167M15.4167 4.58333L17.5 2.5M8.33333 9.16667L6.66667 10.8333M10.8333 11.6667L9.16667 13.3333M13.3333 13.3333L16.6667 16.6667M5.83333 10L10 14.1667L8.75 15.4167C8.47805 15.6976 8.15292 15.9216 7.79354 16.0756C7.43417 16.2296 7.04773 16.3106 6.65676 16.3137C6.26578 16.3169 5.87809 16.2422 5.51626 16.0941C5.15443 15.9459 4.8257 15.7272 4.54923 15.4508C4.27276 15.1743 4.05407 14.8456 3.90592 14.4837C3.75776 14.1219 3.68309 13.7342 3.68627 13.3432C3.68944 12.9523 3.77039 12.5658 3.92441 12.2065C4.07842 11.8471 4.30241 11.5219 4.58333 11.25L5.83333 10ZM14.1667 10L10 5.83333L11.25 4.58333C11.5219 4.30241 11.8471 4.07842 12.2065 3.92441C12.5658 3.77039 12.9523 3.68944 13.3432 3.68627C13.7342 3.68309 14.1219 3.75776 14.4837 3.90592C14.8456 4.05407 15.1743 4.27276 15.4508 4.54923C15.7272 4.8257 15.9459 5.15443 16.0941 5.51626C16.2422 5.87809 16.3169 6.26578 16.3137 6.65676C16.3106 7.04773 16.2296 7.43417 16.0756 7.79354C15.9216 8.15292 15.6976 8.47805 15.4167 8.75L14.1667 10Z" stroke={themeInk('#0B1220')} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>;
  }

  return <Svg width={20} height={20} viewBox="0 0 20 20" fill="none">
    <Path d="M15.4508 4.54923C15.1743 4.27276 14.8456 4.05407 14.4837 3.90592C14.1219 3.75776 13.7342 3.68309 13.3432 3.68627C12.9523 3.68944 12.5658 3.77039 12.2065 3.92441C11.8471 4.07842 11.5219 4.30241 11.25 4.58333L10 5.83333L14.1667 10L15.4167 8.75C15.6976 8.47806 15.9216 8.15292 16.0756 7.79354C16.2296 7.43417 16.3106 7.04773 16.3137 6.65676C16.3169 6.26578 16.2422 5.87809 16.0941 5.51626C15.9459 5.15443 15.7272 4.8257 15.4508 4.54923ZM15.4508 4.54923L17.5 2.5" stroke={themeInk('#0B1220')} strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M7.97937 8.81043C8.17458 8.61522 8.49113 8.61533 8.6864 8.81043C8.88167 9.00569 8.88167 9.3222 8.6864 9.51746L7.37293 10.83L7.83937 11.2964C7.61484 11.5178 7.41267 11.7637 7.23719 12.0311L5.83289 10.704L4.93054 11.6063C4.69742 11.832 4.51152 12.102 4.38367 12.4003C4.25579 12.6987 4.18904 13.02 4.1864 13.3446C4.18377 13.6692 4.24503 13.9914 4.36804 14.2919C4.49103 14.5922 4.67277 14.8651 4.90222 15.0946C5.13178 15.3242 5.4055 15.5058 5.70594 15.6288C6.00616 15.7517 6.32784 15.814 6.65222 15.8114C6.66657 15.8113 6.68092 15.811 6.69525 15.8107C6.79839 16.1494 6.94079 16.4736 7.11864 16.7769C6.96737 16.7985 6.8145 16.8101 6.66101 16.8114C6.20375 16.8151 5.75022 16.7269 5.32703 16.5536C5.05871 16.4437 4.80559 16.3012 4.5741 16.1288L2.8534 17.8505C2.65813 18.0457 2.34163 18.0457 2.14636 17.8505C1.95127 17.6552 1.95116 17.3386 2.14636 17.1434L3.86707 15.4218C3.69523 15.1908 3.55286 14.9384 3.44324 14.6708C3.26999 14.2477 3.18274 13.794 3.1864 13.3368C3.19012 12.8795 3.28458 12.4271 3.46472 12.0067C3.64487 11.5864 3.90666 11.2057 4.23523 10.8876L5.47937 9.64344C5.67453 9.44828 5.99112 9.4485 6.1864 9.64344L6.6659 10.1229L7.97937 8.81043Z" fill={themeInk('#0B1220')} />
    <Path d="M10.1485 11.1056C11.0007 10.8918 11.9022 11.0058 12.6739 11.4259C13.0787 11.6463 13.4304 11.9442 13.7159 12.296L14.0245 11.3458C14.1097 11.0832 14.3917 10.9393 14.6543 11.0245C14.917 11.1097 15.0608 11.3918 14.9756 11.6544L14.3155 13.6886L14.2022 14.0401L13.8331 14.0343L11.4932 14.0001C11.2173 13.9961 10.9963 13.7692 11.0001 13.4933C11.0041 13.2173 11.231 12.9963 11.5069 13.0001L13.0127 13.0216C12.7973 12.7283 12.5204 12.4818 12.1954 12.3048C11.6442 12.0047 11.0004 11.9226 10.3917 12.0753C9.78291 12.228 9.25346 12.6042 8.90923 13.129C8.56512 13.6538 8.43088 14.2892 8.53325 14.9083C8.63567 15.5272 8.96744 16.0848 9.46196 16.4708C9.95682 16.8568 10.5796 17.0427 11.2051 16.9913C11.8304 16.9398 12.4138 16.6558 12.8389 16.1944C13.026 15.9914 13.3419 15.9781 13.545 16.1651C13.748 16.3522 13.7612 16.6681 13.5743 16.8712C12.9789 17.5174 12.1619 17.9165 11.2862 17.9884C10.4107 18.0602 9.54036 17.8001 8.84771 17.2599C8.15498 16.7195 7.69033 15.9382 7.54693 15.0714C7.40357 14.2045 7.59136 13.3149 8.07329 12.5802C8.55523 11.8455 9.29627 11.3194 10.1485 11.1056Z" fill={themeInk('#0B1220')} />
  </Svg>;
}

export function ConnectedChatIllustration() {
  return <Image source={require('../assets/connected-chat.png')} style={styles.connectedChat} />;
}

// Sprint 3 Story 2's four states. The wireframe legend is:
//   (clock) Sending | (/) Sent | (//) Delivered | (//) in blue  Read
const STATUS_GREY = '#8792A4';
const STATUS_READ = '#8B27E9';

/** Sending - the message has left the composer but no ACK has come back. */
export function ClockStatusIcon({color = STATUS_GREY}: {color?: string}) {
  return <Svg width={12} height={12} viewBox="0 0 24 24" fill="none">
    <Circle cx={12} cy={12} r={8.4} stroke={color} strokeWidth={1.8} />
    <Path d="M12 7.4V12l3 1.9" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>;
}

/** Sent - stored by the server, receiver has not picked it up yet. */
export function SingleCheckIcon({color = STATUS_GREY}: {color?: string}) {
  return <Svg width={13} height={12} viewBox="0 0 16 12" fill="none">
    <Path d="M1.8 6.4 5.4 10l8-8.4" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>;
}

/** Delivered (grey) and Read (purple) share one glyph and differ only in tint. */
export function DoubleCheckIcon({read = false}: {read?: boolean}) {
  const color = read ? STATUS_READ : STATUS_GREY;
  return <Svg width={17} height={12} viewBox="0 0 21 12" fill="none">
    <Path d="M1.5 6.3 4.9 9.7l7.4-7.6" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    <Path d="m8.4 9.5 1 1 8.2-8.4" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>;
}

/** Presence badge from the inline-profile Figma component. */
export function AvatarStatusBadge({status}: {status: 'online' | 'away' | 'offline'}) {
  const color = status === 'online' ? '#22B573' : status === 'away' ? '#A85B1A' : '#94A3B8';
  return <Svg width={14} height={13} viewBox="0 0 16 15" fill="none">
    <Path d="M4 1.5h8a2.5 2.5 0 0 1 2.5 2.5v5A2.5 2.5 0 0 1 12 11.5H8l-2.7 2v-2H4A2.5 2.5 0 0 1 1.5 9V4A2.5 2.5 0 0 1 4 1.5Z" fill={color} stroke={themeInk('#FFFFFF')} strokeWidth={1.4}/>
    {status === 'online' ? <Path d="m5 6.6 1.7 1.6L10.8 4" stroke={themeInk('#FFF')} strokeWidth={1.45} strokeLinecap="round" strokeLinejoin="round"/> : status === 'away' ? <Path d="M5 7.5h5M8.2 5.5l2 2-2 2" stroke={themeInk('#FFF')} strokeWidth={1.25} strokeLinecap="round" strokeLinejoin="round"/> : <Path d="m6 5 4 4m0-4L6 9" stroke={themeInk('#FFF')} strokeWidth={1.3} strokeLinecap="round"/>}
  </Svg>;
}

/** Kept for existing consumers; verified/available means online. */
export function VerifiedAvatarBadge() { return <AvatarStatusBadge status="online"/>; }

const styles = StyleSheet.create({
  connectedChat: {width: 128, height: 128},
});
