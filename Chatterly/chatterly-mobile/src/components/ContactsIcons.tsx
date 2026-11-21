import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import Svg, {Circle, Defs, Ellipse, LinearGradient, Path, Rect, Stop} from 'react-native-svg';
import {useMissedCallCount} from '../services/missedCallBadge';
import {useUnreadChatCount} from '../services/unreadBadge';
import {themeInk} from '../theme/themedStyles';

export function ContactPermissionIcon() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={9} r={3.25} stroke={themeInk('#6C2EEB')} strokeWidth={1.5} />
      <Path d="M6.8 18.2c.65-2.65 2.4-4 5.2-4s4.55 1.35 5.2 4" stroke={themeInk('#6C2EEB')} strokeWidth={1.5} strokeLinecap="round" />
      <Rect x={3.5} y={3.5} width={17} height={17} rx={4} stroke={themeInk('#6C2EEB')} strokeWidth={1.5} />
    </Svg>
  );
}

export function SearchIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Circle cx={10.5} cy={10.5} r={6.25} stroke={themeInk('#344256')} strokeWidth={1.5} />
      <Path d="m15.2 15.2 4.1 4.1" stroke={themeInk('#344256')} strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}

export function SearchContactsGridIcon() {
  return (
    <Svg width={40} height={40} viewBox="0 0 40 40" fill="none">
      <Path d="M20 11C19.337 11 18.7011 11.2634 18.2322 11.7322C17.7634 12.2011 17.5 12.837 17.5 13.5C17.5 14.163 17.7634 14.7989 18.2322 15.2678C18.7011 15.7366 19.337 16 20 16C20.663 16 21.2989 15.7366 21.7678 15.2678C22.2366 14.7989 22.5 14.163 22.5 13.5C22.5 12.837 22.2366 12.2011 21.7678 11.7322C21.2989 11.2634 20.663 11 20 11ZM13.5 11C12.837 11 12.2011 11.2634 11.7322 11.7322C11.2634 12.2011 11 12.837 11 13.5C11 14.163 11.2634 14.7989 11.7322 15.2678C12.2011 15.7366 12.837 16 13.5 16C14.163 16 14.7989 15.7366 15.2678 15.2678C15.7366 14.7989 16 14.163 16 13.5C16 12.837 15.7366 12.2011 15.2678 11.7322C14.7989 11.2634 14.163 11 13.5 11ZM26.5 11C25.837 11 25.2011 11.2634 24.7322 11.7322C24.2634 12.2011 24 12.837 24 13.5C24 14.163 24.2634 14.7989 24.7322 15.2678C25.2011 15.7366 25.837 16 26.5 16C27.163 16 27.7989 15.7366 28.2678 15.2678C28.7366 14.7989 29 14.163 29 13.5C29 12.837 28.7366 12.2011 28.2678 11.7322C27.7989 11.2634 27.163 11 26.5 11ZM20 17.5C19.337 17.5 18.7011 17.7634 18.2322 18.2322C17.7634 18.7011 17.5 19.337 17.5 20C17.5 20.663 17.7634 21.2989 18.2322 21.7678C18.7011 22.2366 19.337 22.5 20 22.5C20.663 22.5 21.2989 22.2366 21.7678 21.7678C22.2366 21.2989 22.5 20.663 22.5 20C22.5 19.337 22.2366 18.7011 21.7678 18.2322C21.2989 17.7634 20.663 17.5 20 17.5ZM13.5 17.5C12.837 17.5 12.2011 17.7634 11.7322 18.2322C11.2634 18.7011 11 19.337 11 20C11 20.663 11.2634 21.2989 11.7322 21.7678C12.2011 22.2366 12.837 22.5 13.5 22.5C14.163 22.5 14.7989 22.2366 15.2678 21.7678C15.7366 21.2989 16 20.663 16 20C16 19.337 15.7366 18.7011 15.2678 18.2322C14.7989 17.7634 14.163 17.5 13.5 17.5ZM26.5 17.5C25.837 17.5 25.2011 17.7634 24.7322 18.2322C24.2634 18.7011 24 19.337 24 20C24 20.663 24.2634 21.2989 24.7322 21.7678C25.2011 22.2366 25.837 22.5 26.5 22.5C27.163 22.5 27.7989 22.2366 28.2678 21.7678C28.7366 21.2989 29 20.663 29 20C29 19.337 28.7366 18.7011 28.2678 18.2322C27.7989 17.7634 27.163 17.5 26.5 17.5ZM20 24C19.337 24 18.7011 24.2634 18.2322 24.7322C17.7634 25.2011 17.5 25.837 17.5 26.5C17.5 27.163 17.7634 27.7989 18.2322 28.2678C18.7011 28.7366 19.337 29 20 29C20.663 29 21.2989 28.7366 21.7678 28.2678C22.2366 27.7989 22.5 27.163 22.5 26.5C22.5 25.837 22.2366 25.2011 21.7678 24.7322C21.2989 24.2634 20.663 24 20 24Z" fill={themeInk('#0B1220')}/>
    </Svg>
  );
}

export function QrIcon({color = '#111827'}: {color?: string}) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Rect x={4} y={4} width={5} height={5} rx={0.8} stroke={color} strokeWidth={1.55} />
      <Rect x={15} y={4} width={5} height={5} rx={0.8} stroke={color} strokeWidth={1.55} />
      <Rect x={4} y={15} width={5} height={5} rx={0.8} stroke={color} strokeWidth={1.55} />
      <Path d="M14.5 14.5h2.1v2.1h-2.1zM18.1 14.5H20M14.5 18.1H20M18.1 18.1V20" stroke={color} strokeWidth={1.55} strokeLinecap="round" />
    </Svg>
  );
}

export function AddContactIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Circle cx={9} cy={7.5} r={3} stroke={themeInk('#111827')} strokeWidth={1.45} />
      <Path d="M3.8 17c.55-2.75 2.28-4.15 5.2-4.15 1.12 0 2.08.21 2.86.65M17.5 12.5v7M14 16h7" stroke={themeInk('#111827')} strokeWidth={1.45} strokeLinecap="round" />
    </Svg>
  );
}

export function MoreIcon() {
  return (
    <Svg width={20} height={22} viewBox="0 0 20 24">
      <Circle cx={10} cy={5} r={1.25} fill={themeInk('#111827')} />
      <Circle cx={10} cy={12} r={1.25} fill={themeInk('#111827')} />
      <Circle cx={10} cy={19} r={1.25} fill={themeInk('#111827')} />
    </Svg>
  );
}

export function CloseIcon() {
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
      <Path d="M6 6l12 12M18 6 6 18" stroke={themeInk('#111827')} strokeWidth={1.45} strokeLinecap="round" />
    </Svg>
  );
}

/**
 * Every tab bar draws this icon, so the unread-message count (Sprint 3's push
 * notification badge) lives here and shows on Contacts, Calls and Settings as
 * well as on Chats.
 */
export function ChatTabIcon({active = false}: {active?: boolean}) {
  const color = active ? '#641CFF' : '#344256';
  const unread = useUnreadChatCount();
  return (
    <View style={tabBadgeStyles.anchor}>
      <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
        <Path d="M6.4 6.1h11.2a2.5 2.5 0 0 1 2.5 2.5v5.8a2.5 2.5 0 0 1-2.5 2.5H11l-4.7 2.6.9-2.6h-.8a2.5 2.5 0 0 1-2.5-2.5V8.6a2.5 2.5 0 0 1 2.5-2.5Z" stroke={color} strokeWidth={1.45} strokeLinejoin="round" />
        <Path d="M8.4 11.4h.1M12 11.4h.1M15.6 11.4h.1" stroke={color} strokeWidth={1.9} strokeLinecap="round" />
      </Svg>
      {unread > 0 ? (
        <View accessibilityLabel={`${unread} unread ${unread === 1 ? 'message' : 'messages'}`} style={tabBadgeStyles.badge}>
          <Text style={tabBadgeStyles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
        </View>
      ) : null}
    </View>
  );
}

export function ContactTabIcon({active = false}: {active?: boolean}) {
  const color = active ? '#641CFF' : '#344256';
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={9} r={3.2} stroke={color} strokeWidth={1.5} />
      <Path d="M6.5 18.4c.65-2.95 2.47-4.45 5.5-4.45s4.85 1.5 5.5 4.45" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
      <Rect x={4.3} y={3.7} width={15.4} height={16.6} rx={4} stroke={color} strokeWidth={1.35} />
    </Svg>
  );
}

/**
 * Every tab bar draws this icon, so the missed-call badge (Sprint 9 Story 4)
 * lives here and shows on Chats, Contacts and Settings as well as on Calls.
 */
export function CallsTabIcon({active = false}: {active?: boolean}) {
  const color = active ? '#641CFF' : '#344256';
  const missed = useMissedCallCount();
  return (
    <View style={tabBadgeStyles.anchor}>
      <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
        <Path d="M8.2 5.2 10 9.3 8.5 11c1.1 2.2 2.8 3.9 5.1 5l1.7-1.5 4.1 1.8c.35.15.56.53.48.91l-.5 2.2c-.08.4-.43.68-.84.68C10.8 20.1 3.9 13.2 3.9 5.46c0-.41.28-.76.68-.84l2.2-.5c.38-.08.76.12.91.47Z" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
      </Svg>
      {missed > 0 ? (
        <View accessibilityLabel={`${missed} missed ${missed === 1 ? 'call' : 'calls'}`} style={tabBadgeStyles.badge}>
          <Text style={tabBadgeStyles.badgeText}>{missed > 99 ? '99+' : missed}</Text>
        </View>
      ) : null}
    </View>
  );
}

// Red with white digits in both themes, like every other unread count.
const tabBadgeStyles = StyleSheet.create({
  anchor: {width: 20, height: 20},
  badge: {position: 'absolute', top: -6, left: 12, minWidth: 16, height: 16, paddingHorizontal: 4, borderRadius: 8, backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center'},
  badgeText: {color: '#FFFFFF', fontSize: 9, fontWeight: '700', lineHeight: 11},
});

export function SettingsTabIcon({active = false}: {active?: boolean}) {
  const color = active ? '#641CFF' : '#344256';
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path d="M13.8 4.3 14.5 6c.3.13.58.29.85.48l1.8-.25 1.55 2.68-1.1 1.45c.03.31.03.62 0 .93l1.1 1.46-1.55 2.68-1.8-.25c-.27.19-.55.35-.85.48l-.7 1.68h-3.1L10 15.66a6.3 6.3 0 0 1-.85-.48l-1.8.25-1.55-2.68 1.1-1.46a5.2 5.2 0 0 1 0-.93L5.8 8.91l1.55-2.68 1.8.25c.27-.19.55-.35.85-.48l.7-1.7h3.1Z" stroke={color} strokeWidth={1.35} strokeLinejoin="round" />
      <Circle cx={12.25} cy={10.82} r={2.35} stroke={color} strokeWidth={1.35} />
    </Svg>
  );
}

export function ChevronDownIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Path d="m6 9 6 6 6-6" stroke={themeInk('#5D6A7E')} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function PhoneInputIcon() {
  return (
    <Svg width={15} height={15} viewBox="0 0 24 24" fill="none">
      <Rect x={7.4} y={3.2} width={9.2} height={17.6} rx={2} stroke={themeInk('#344256')} strokeWidth={1.45} />
      <Path d="M10.8 5.8h2.4M11.7 17.8h.6" stroke={themeInk('#344256')} strokeWidth={1.55} strokeLinecap="round" />
    </Svg>
  );
}

export function EmailInputIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Rect x={3.6} y={6.3} width={16.8} height={11.4} rx={1.7} stroke={themeInk('#344256')} strokeWidth={1.45} />
      <Path d="m4.7 7.6 7.3 5.3 7.3-5.3" stroke={themeInk('#344256')} strokeWidth={1.45} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function RefreshDownIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Path d="M12 4v11M7.5 10.5 12 15l4.5-4.5" stroke={themeInk('#641CFF')} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M6.5 19h11" stroke={themeInk('#641CFF')} strokeWidth={1.7} strokeLinecap="round" />
    </Svg>
  );
}

export function TinyPlusIcon({color = '#641CFF'}: {color?: string}) {
  return (
    <Svg width={13} height={13} viewBox="0 0 24 24" fill="none">
      <Path d="M12 5v14M5 12h14" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

export function ContactBookIllustration() {
  return (
    <Svg width={86} height={82} viewBox="0 0 86 82" fill="none">
      <Defs>
        <LinearGradient id="book" x1={26} y1={18} x2={61} y2={59} gradientUnits="userSpaceOnUse">
          <Stop stopColor="#B778FF" />
          <Stop offset={1} stopColor="#641CFF" />
        </LinearGradient>
        <LinearGradient id="pages" x1={52} y1={24} x2={72} y2={54} gradientUnits="userSpaceOnUse">
          <Stop stopColor="#9EFF42" />
          <Stop offset={1} stopColor="#FF4668" />
        </LinearGradient>
      </Defs>
      <Ellipse cx={43} cy={67} rx={24} ry={5} fill={themeInk('#D7DDE8')} opacity={0.55} />
      <Path d="M51 19.5h16c3.2 0 5.8 2.6 5.8 5.8V56c0 3.2-2.6 5.8-5.8 5.8H51V19.5Z" fill="url(#pages)" />
      <Rect x={29} y={16} width={33} height={48} rx={8} fill="url(#book)" />
      <Path d="M29 24h-9.5M29 39h-9.5M29 54h-9.5" stroke={themeInk('#8C96AA')} strokeWidth={4} strokeLinecap="round" />
      <Circle cx={22.2} cy={24} r={5.5} fill={themeInk('#C8CFDB')} />
      <Circle cx={22.2} cy={39} r={5.5} fill={themeInk('#C8CFDB')} />
      <Circle cx={22.2} cy={54} r={5.5} fill={themeInk('#C8CFDB')} />
      <Circle cx={45.5} cy={34} r={8.2} fill={themeInk('#FFFFFF')} opacity={0.9} />
      <Path d="M33.8 52c1.3-7.1 5.2-10.65 11.7-10.65 6.5 0 10.4 3.55 11.7 10.65" fill={themeInk('#FFFFFF')} opacity={0.9} />
      <Rect x={52} y={47} width={15} height={15} rx={4} fill={themeInk('#FFFFFF')} />
      <Path d="M59.5 50.9v7.2M55.9 54.5h7.2" stroke={themeInk('#641CFF')} strokeWidth={1.9} strokeLinecap="round" />
    </Svg>
  );
}

export function RegisteredBadge() {
  return (
    <Svg width={14} height={14} viewBox="0 0 14 14" fill="none">
      <Rect x={1} y={1} width={12} height={12} rx={3} fill={themeInk('#20C36A')} />
      <Path d="m4 7 1.8 1.8L10.1 4.6" stroke={themeInk('#FFFFFF')} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
