import React from 'react';
import {themeInk} from '../theme/themedStyles';
import Svg, {Circle, Path, Rect} from 'react-native-svg';

// Line icons for the Sprint 9 Story 2 conference UI. They are drawn rather
// than typed so they size and colour predictably - a glyph character picks up a
// different shape on every Android font, which is why the rest of the app's
// call surfaces already draw their icons too.

export type GroupCallIconName =
  | 'add'
  | 'back'
  | 'call'
  | 'camera'
  | 'check'
  | 'close'
  | 'effects'
  | 'end'
  | 'lock'
  | 'microphone'
  | 'minimize'
  | 'more'
  | 'participants'
  | 'pin'
  | 'remove'
  | 'screen'
  | 'entireScreen'
  | 'appWindow'
  | 'search'
  | 'settings'
  | 'speaker'
  | 'status'
  | 'switch'
  | 'grid'
  | 'bell'
  | 'network'
  | 'info'
  | 'phone'
  | 'bluetooth'
  | 'headphones'
  | 'volumeOff'
  | 'reconnect'
  | 'signal';

type Props = {
  color?: string;
  crossed?: boolean;
  name: GroupCallIconName;
  size?: number;
};

const PATHS: Record<GroupCallIconName, string[]> = {
  add: ['M9 12.4a3.7 3.7 0 1 0 0-7.4 3.7 3.7 0 0 0 0 7.4Z', 'M3 19.5a6 6 0 0 1 10.6-3.8', 'M17.5 14.5v6M20.5 17.5h-6'],
  back: ['m14.5 5.5-7 6.5 7 6.5'],
  call: ['M6.2 3.6 8.6 3l2 4.2-2 1.4a10.5 10.5 0 0 0 5 5l1.4-2 4.2 2-.6 2.4a2 2 0 0 1-2.2 1.5C10.5 17 6.8 13.3 4.7 5.8a2 2 0 0 1 1.5-2.2Z'],
  camera: ['M4 6.8h9.6a2 2 0 0 1 2 2v6.4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.8a2 2 0 0 1 2-2Z', 'm15.6 10.4 5-2.6v8.4l-5-2.6'],
  check: ['m5 12.4 4.4 4.4L19 7.2'],
  close: ['M6 6l12 12M18 6 6 18'],
  effects: ['M12 3.5 13.7 8l4.5 1.7-4.5 1.7L12 16l-1.7-4.6L5.8 9.7 10.3 8 12 3.5Z', 'M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2Z'],
  end: ['M6.2 3.6 8.6 3l2 4.2-2 1.4a10.5 10.5 0 0 0 5 5l1.4-2 4.2 2-.6 2.4a2 2 0 0 1-2.2 1.5C10.5 17 6.8 13.3 4.7 5.8a2 2 0 0 1 1.5-2.2Z'],
  lock: ['M5.5 10.5h13v9.2h-13z', 'M8.2 10.5V7.4a3.8 3.8 0 0 1 7.6 0v3.1'],
  microphone: ['M12 2.8a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0v-6a3 3 0 0 1 3-3Z', 'M5.5 11.2a6.5 6.5 0 0 0 13 0M12 17.8V21.4M8.4 21.4h7.2'],
  minimize: ['m6.5 9.5 5.5 5.5 5.5-5.5'],
  more: ['M12 5.6h.01M12 12h.01M12 18.4h.01'],
  participants: ['M9.2 11.6a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2Z', 'M2.8 19.6a6.4 6.4 0 0 1 12.8 0', 'M16.4 4.9a3.6 3.6 0 0 1 0 6.9M18.2 19.6a6.4 6.4 0 0 0-3.1-5.4'],
  pin: ['M14.8 3.4 20.6 9.2l-3 1.1-3.6 3.6-.6 4.2-6.6-6.6 4.2-.6 3.6-3.6 1.2-3.9Z', 'M7.4 16.6 3.6 20.4'],
  remove: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M8 12h8'],
  screen: ['M14 19H3V3h16v6', 'M14 15V8h9v6', 'M18 18h5v5', 'm17 24 6-6'],
  entireScreen: ['M7 2h10a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z', 'm10 7 1-2m-1 12 5-10m-2 12 1-2'],
  appWindow: ['M3 4h18a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z', 'M5 7h.01M8 7h.01'],
  search: ['M10.8 17.6a6.8 6.8 0 1 0 0-13.6 6.8 6.8 0 0 0 0 13.6Z', 'm16 16 4 4'],
  settings: ['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z', 'M19.2 14.6a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.9 2.9l-.1-.1a1.7 1.7 0 0 0-2.9 1.2 2 2 0 1 1-4 0 1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.9-2.9l.1-.1a1.7 1.7 0 0 0-1.2-2.9 2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.9-2.9l.1.1a1.7 1.7 0 0 0 2.9-1.2 2 2 0 1 1 4 0 1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.9 2.9l-.1.1a1.7 1.7 0 0 0 1.2 2.9 2 2 0 1 1 0 4 1.7 1.7 0 0 0-1.6 1.1Z'],
  speaker: ['M4.5 9.2h3.3L12.6 5v14l-4.8-4.2H4.5V9.2Z', 'M16.2 9a4.2 4.2 0 0 1 0 6M18.9 6.4a7.8 7.8 0 0 1 0 11.2'],
  status: ['M4 19.6V13M9.4 19.6V8.4M14.8 19.6v-8.2M20.2 19.6V4.4'],
  switch: ['M7 7.4h9.4l-2.4-2.4M17 16.6H7.6L10 19', 'M17 7.4 14.6 9.8M7 16.6l2.4-2.4'],
  grid: ['M4 4h6.5v6.5H4zM13.5 4H20v6.5h-6.5zM4 13.5h6.5V20H4zM13.5 13.5H20V20h-6.5z'],
  bell: ['M9.5 18.5a2.5 2.5 0 0 0 5 0', 'M6 16.5h12l-1.4-2.2V10a4.6 4.6 0 0 0-9.2 0v4.3L6 16.5Z'],
  network: ['M12 21V11', 'M8.5 7.5a5 5 0 0 1 7 0M5.7 4.7a9 9 0 0 1 12.6 0', 'M12 11a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2Z'],
  info: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M12 11v5.5M12 7.8v.1'],
  phone: ['M8 2.8h8a1.6 1.6 0 0 1 1.6 1.6v15.2a1.6 1.6 0 0 1-1.6 1.6H8a1.6 1.6 0 0 1-1.6-1.6V4.4A1.6 1.6 0 0 1 8 2.8Z', 'M11 18.2h2'],
  bluetooth: ['m7 7.8 10 8.4-5 4.3V3.5l5 4.3-10 8.4'],
  headphones: ['M4 15.5V12a8 8 0 0 1 16 0v3.5', 'M4 15.5a2 2 0 0 1 2-2h1.2v6.5H6a2 2 0 0 1-2-2v-2.5ZM20 15.5a2 2 0 0 0-2-2h-1.2v6.5H18a2 2 0 0 0 2-2v-2.5Z'],
  volumeOff: ['M4.5 9.2h3.3L12.6 5v14l-4.8-4.2H4.5V9.2Z', 'm16 9.5 5 5m0-5-5 5'],
  reconnect: ['M19.5 12a7.5 7.5 0 0 1-12.8 5.3M4.5 12a7.5 7.5 0 0 1 12.8-5.3', 'M17.6 3.5v3.3h-3.3M6.4 20.5v-3.3h3.3'],
  signal: ['M5 19v-3M9.7 19v-6M14.3 19v-9M19 19V6'],
};

/** Paths drawn filled rather than stroked (the dot-style and solid glyphs). */
const FILLED: GroupCallIconName[] = ['more'];

export function GroupCallIcon({color = '#334155', crossed = false, name, size = 22}: Props) {
  const ink = themeInk(color);
  const filled = FILLED.includes(name);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {PATHS[name].map(path => (
        <Path
          d={path}
          fill={filled ? ink : 'none'}
          key={path}
          stroke={ink}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={name === 'more' ? 2.6 : 1.7}
          transform={name === 'end' ? 'rotate(135 12 12)' : undefined}
        />
      ))}
      {crossed ? <Path d="M4 3.6 20.4 20.4" stroke={ink} strokeLinecap="round" strokeWidth={1.9} /> : null}
    </Svg>
  );
}

/** The pill switch used across the in-call settings, matching Sprint 8's. */
export function GroupCallToggle({disabled = false, enabled, label}: {disabled?: boolean; enabled: boolean; label: string}) {
  const track = disabled ? '#E9EDF3' : enabled ? '#8B5CF6' : '#E2E8F0';
  return (
    <Svg
      accessibilityLabel={`${label} ${enabled ? 'On' : 'Off'}`}
      accessibilityRole="switch"
      accessibilityState={{checked: enabled, disabled}}
      width={40}
      height={22}
      viewBox="0 0 44 24"
      fill="none">
      <Rect x={0.25} y={0.25} width={43.5} height={23.5} rx={3.75} fill={track} />
      <Rect x={0.25} y={0.25} width={43.5} height={23.5} rx={3.75} stroke={enabled && !disabled ? '#7C3AED' : '#CBD5E1'} strokeWidth={0.5} />
      <Rect x={enabled ? 22 : 2} y={2} width={20} height={20} rx={2} fill="#FFFFFF" />
    </Svg>
  );
}

/** Round check used by the Add People selection rows. */
export function GroupCallCheck({checked, size = 20}: {checked: boolean; size?: number}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={10} fill={checked ? '#7C3AED' : 'transparent'} stroke={checked ? '#7C3AED' : '#C6CEDB'} strokeWidth={1.6} />
      {checked ? <Path d="m7.6 12.3 3 3 5.8-6" fill="none" stroke="#FFFFFF" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} /> : null}
    </Svg>
  );
}
