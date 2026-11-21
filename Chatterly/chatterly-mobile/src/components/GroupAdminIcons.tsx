import React from 'react';
import {ActivityIndicator, Pressable, StyleSheet, View} from 'react-native';
import Svg, {Circle, Path, Rect} from 'react-native-svg';
import {themeInk} from '../theme/themedStyles';

export type AdminIconName = 'more' | 'close' | 'add-member' | 'settings' | 'permissions' | 'similar-group' | 'view' | 'message' | 'crown' | 'shield' | 'restrict' | 'remove-member' | 'info' | 'lock' | 'plus' | 'link' | 'media' | 'pin' | 'edit' | 'report' | 'roles';

type Glyph = {paths?: string[]; circles?: Array<[number, number, number]>; dots?: Array<[number, number, number]>};

const GLYPHS: Record<AdminIconName, Glyph> = {
  more: {dots: [[12, 5, 1.6], [12, 12, 1.6], [12, 19, 1.6]]},
  close: {paths: ['M6 6l12 12M18 6 6 18']},
  'add-member': {circles: [[9, 8, 3]], paths: ['M3.8 19c.5-3 2.2-4.5 5.2-4.5 1.3 0 2.3.3 3.1.8', 'M18 11v7M14.5 14.5h7']},
  settings: {circles: [[12, 12, 3]], paths: ['M10.3 3.9c.4-1.8 3-1.8 3.4 0a1.8 1.8 0 0 0 2.6 1.1c1.6-1 3.4.9 2.5 2.5a1.8 1.8 0 0 0 1.1 2.6c1.8.4 1.8 3 0 3.4a1.8 1.8 0 0 0-1.1 2.6c.9 1.6-.9 3.5-2.5 2.5a1.8 1.8 0 0 0-2.6 1.1c-.4 1.8-3 1.8-3.4 0a1.8 1.8 0 0 0-2.6-1.1c-1.6 1-3.4-.9-2.5-2.5a1.8 1.8 0 0 0-1.1-2.6c-1.8-.4-1.8-3 0-3.4a1.8 1.8 0 0 0 1.1-2.6c-.9-1.6.9-3.5 2.5-2.5a1.8 1.8 0 0 0 2.6-1.1Z']},
  permissions: {circles: [[10, 7.5, 3.5], [16.5, 15.5, 2.3]], paths: ['M3.5 20v-1.2A4.8 4.8 0 0 1 8.3 14H11', 'm18.2 17.2 3.3 3.3M20.2 19.2l-1.2 1.2']},
  'similar-group': {circles: [[8, 8, 2.5], [16, 8, 2.5]], paths: ['M3.5 18c.4-3 1.9-4.5 4.5-4.5s4.1 1.5 4.5 4.5', 'M12.5 14.1c.8-.4 1.8-.6 3-.6 2.6 0 4.1 1.5 4.5 4.5']},
  view: {circles: [[12, 12, 2.5]], paths: ['M2.5 12C5 7.7 8.2 5.5 12 5.5s7 2.2 9.5 6.5c-2.5 4.3-5.7 6.5-9.5 6.5S5 16.3 2.5 12Z']},
  message: {paths: ['M4 5.5h16v11H9l-5 3v-14Z', 'M8 9.5h8M8 12.5h5']},
  crown: {paths: ['M4 8.5 8 12l4-6 4 6 4-3.5-1.6 9.5H5.6L4 8.5Z', 'M6 20.5h12']},
  shield: {paths: ['M12 3 19.5 6v5.2c0 4.8-3 8-7.5 9.8-4.5-1.8-7.5-5-7.5-9.8V6L12 3Z']},
  restrict: {circles: [[12, 12, 8.5]], paths: ['M6 6l12 12']},
  'remove-member': {circles: [[9, 8, 3]], paths: ['M3.8 19c.5-3 2.2-4.5 5.2-4.5s4.7 1.5 5.2 4.5', 'M16 12h6']},
  info: {circles: [[12, 12, 9]], paths: ['M12 11v5', 'M12 7.8v.1']},
  lock: {paths: ['M7.5 11V8a4.5 4.5 0 0 1 9 0v3', 'M5.5 11h13v9h-13z']},
  plus: {paths: ['M12 5v14M5 12h14']},
  link: {paths: ['m10 14 4-4', 'M8.2 15.8l-1.5 1.5a2.5 2.5 0 0 1-3.5-3.5l3-3a2.5 2.5 0 0 1 3.5 0', 'M15.8 8.2l1.5-1.5a2.5 2.5 0 0 1 3.5 3.5l-3 3a2.5 2.5 0 0 1-3.5 0']},
  media: {circles: [[9, 9, 1.4]], paths: ['M4.5 4.5h15v15h-15z', 'm6.5 17 4-4 2.5 2.5 2-2 2.5 3']},
  pin: {paths: ['M9 3.5h6', 'M10 3.5v6l-2.5 4h9L14 9.5v-6', 'M12 13.5v7']},
  edit: {paths: ['m14 5 5 5', 'M5 19l3.5-.8L18 8.7a2 2 0 0 0-2.8-2.8l-9.5 9.5L5 19Z']},
  report: {paths: ['M5 5h14v11H9l-4 3V5Z', 'M12 8v4', 'M12 14v.1']},
  roles: {circles: [[9, 8, 2.8]], paths: ['M4 18.5c.4-2.9 2-4.3 5-4.3s4.6 1.4 5 4.3', 'M17.5 7v6M14.5 10h6']},
};

export function AdminIcon({name, size = 20, color = '#0B1220', strokeWidth = 1.5}: {name: AdminIconName; size?: number; color?: string; strokeWidth?: number}) {
  const glyph = GLYPHS[name];
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    {glyph.circles?.map(([cx, cy, r], index) => <Circle cx={cx} cy={cy} key={`c${index}`} r={r} stroke={color} strokeWidth={strokeWidth}/>)}
    {glyph.dots?.map(([cx, cy, r], index) => <Circle cx={cx} cy={cy} fill={color} key={`d${index}`} r={r}/>)}
    {glyph.paths?.map((d, index) => <Path d={d} key={`p${index}`} stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth}/>)}
  </Svg>;
}

/** The squared switch used across group settings, matching the Mute Notification toggle. */
export function AdminToggle({value, label, disabled, busy, onChange}: {value: boolean; label: string; disabled?: boolean; busy?: boolean; onChange: (next: boolean) => void}) {
  return <Pressable accessibilityLabel={label} accessibilityRole="switch" accessibilityState={{checked: value, disabled: Boolean(disabled), busy: Boolean(busy)}} disabled={disabled || busy} hitSlop={8} onPress={() => onChange(!value)} style={disabled && !busy ? styles.disabled : undefined}>
    {busy ? <View style={styles.busy}><ActivityIndicator color="#7442E8" size="small"/></View> : <Svg width={44} height={24} viewBox="0 0 44 24" fill="none">
      <Rect x={0.25} y={0.25} width={43.5} height={23.5} rx={3.75} fill={value ? themeInk('#8B5CF6') : themeInk('#E2E8F0')} stroke={themeInk('#E2E8F0')} strokeWidth={0.5}/>
      <Rect x={value ? 22 : 2} y={2} width={20} height={20} rx={2} fill="white"/>
    </Svg>}
  </Pressable>;
}

const styles = StyleSheet.create({
  disabled: {opacity: 0.45},
  busy: {width: 44, height: 24, alignItems: 'center', justifyContent: 'center'},
});
