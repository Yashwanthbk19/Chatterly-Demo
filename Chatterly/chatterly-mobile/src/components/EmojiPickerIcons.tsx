import React from 'react';
import Svg, {Circle, Path} from 'react-native-svg';

/**
 * The emoji picker's chrome, ported from the web client's SVG set so the rail
 * reads the same on both platforms. Every glyph is a stroked 24x24 outline that
 * takes its colour from the caller, which is how a tab shows selected.
 */

const IDLE = '#718099';
const SIZE = 19;

type IconProps = {color?: string; size?: number};

type StrokeProps = IconProps & {children: React.ReactNode};

function StrokeIcon({color = IDLE, size = SIZE, children}: StrokeProps) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">{children}</Svg>;
}

export function SmileyCategoryIcon({color, size}: IconProps) {
  return <StrokeIcon color={color} size={size}>
    <Circle cx={12} cy={12} r={8.1} />
    <Path d="M8.7 14.2c.95 1.15 2.12 1.72 3.3 1.72 1.18 0 2.35-.57 3.3-1.72" />
    <Circle cx={9.25} cy={10.1} r={0.7} fill={color || IDLE} stroke="none" />
    <Circle cx={14.75} cy={10.1} r={0.7} fill={color || IDLE} stroke="none" />
  </StrokeIcon>;
}

export function RecentCategoryIcon({color, size}: IconProps) {
  return <StrokeIcon color={color} size={size}>
    <Path d="M3.8 10.8A8.3 8.3 0 1 0 7 5.1" />
    <Path d="M3.6 4.85v5.05h5.05" />
    <Path d="M12 7.9v4.55l3.1 1.85" />
  </StrokeIcon>;
}

export function NatureCategoryIcon({color, size}: IconProps) {
  return <StrokeIcon color={color} size={size}>
    <Path d="M12 11.45c0-2.7 1.6-5 3.9-5 1.75 0 2.85 1.45 2.85 3.05 0 2.55-2.55 4.25-5.95 4.7" />
    <Path d="M12 11.45c0-2.7-1.6-5-3.9-5-1.75 0-2.85 1.45-2.85 3.05 0 2.55 2.55 4.25 5.95 4.7" />
    <Path d="M12 12.55c0 2.7 1.6 5 3.9 5 1.75 0 2.85-1.45 2.85-3.05 0-2.55-2.55-4.25-5.95-4.7" />
    <Path d="M12 12.55c0 2.7-1.6 5-3.9 5-1.75 0-2.85-1.45-2.85-3.05 0-2.55 2.55-4.25 5.95-4.7" />
  </StrokeIcon>;
}

export function CarCategoryIcon({color, size}: IconProps) {
  return <StrokeIcon color={color} size={size}>
    <Path d="M5.2 13.65h13.6l-1.3-4.1a2 2 0 0 0-1.9-1.45H8.4a2 2 0 0 0-1.9 1.45l-1.3 4.1Z" />
    <Path d="M5 13.65v2.25a1.1 1.1 0 0 0 1.1 1.1h.7" />
    <Path d="M19 13.65v2.25a1.1 1.1 0 0 1-1.1 1.1h-.7" />
    <Circle cx={8.2} cy={16.35} r={1.15} />
    <Circle cx={15.8} cy={16.35} r={1.15} />
  </StrokeIcon>;
}

export function SymbolsCategoryIcon({color, size}: IconProps) {
  return <StrokeIcon color={color} size={size}>
    <Path d="M12 4.8v2.9" />
    <Path d="M12 16.3v2.9" />
    <Path d="M4.8 12h2.9" />
    <Path d="M16.3 12h2.9" />
    <Path d="m7 7 2 2-2 2-2-2 2-2Z" />
    <Path d="m15 14 2 2-2 2-2-2 2-2Z" />
    <Path d="m15.5 5.25.7 1.45 1.45.7-1.45.7-.7 1.45-.7-1.45-1.45-.7 1.45-.7.7-1.45Z" />
    <Path d="m7 15 2 2" />
    <Path d="m9 15-2 2" />
  </StrokeIcon>;
}

export function BallCategoryIcon({color, size}: IconProps) {
  return <StrokeIcon color={color} size={size}>
    <Circle cx={12} cy={12} r={8.1} />
    <Path d="M9.05 4.55c1.95 1.55 3.1 4.15 3.1 7.45 0 3.3-1.15 5.9-3.1 7.45" />
    <Path d="M14.95 4.55c-1.95 1.55-3.1 4.15-3.1 7.45 0 3.3 1.15 5.9 3.1 7.45" />
  </StrokeIcon>;
}

export function FlagCategoryIcon({color, size}: IconProps) {
  return <StrokeIcon color={color} size={size}>
    <Path d="M6.3 20V4.3" />
    <Path d="M6.3 5.1h10.25l-1.85 3.1 1.85 3.1H6.3" />
  </StrokeIcon>;
}

// The web client's rail stops at seven tabs. These three complete the mobile
// rail so every category in the catalogue can be browsed, not only searched.

export function PeopleCategoryIcon({color, size}: IconProps) {
  return <StrokeIcon color={color} size={size}>
    <Path d="M8.9 11.1V6.6a1.15 1.15 0 0 1 2.3 0v3.5" />
    <Path d="M11.2 10.1V5.5a1.15 1.15 0 0 1 2.3 0v4.6" />
    <Path d="M13.5 10.4V6.9a1.15 1.15 0 0 1 2.3 0v3.8" />
    <Path d="M15.8 11.1V8.8a1.15 1.15 0 0 1 2.3 0v4.6a5.6 5.6 0 0 1-5.6 5.6h-.9a5 5 0 0 1-4.3-2.5L5 13.2a1.2 1.2 0 0 1 2-1.3l1.9 2.2" />
  </StrokeIcon>;
}

export function FoodCategoryIcon({color, size}: IconProps) {
  return <StrokeIcon color={color} size={size}>
    <Path d="M5.4 10.6h13.2a6.6 6.6 0 0 1-6.6 5.6 6.6 6.6 0 0 1-6.6-5.6Z" />
    <Path d="M6.6 10.6c0-2.2 2.4-3.9 5.4-3.9s5.4 1.7 5.4 3.9" />
    <Path d="M4.9 18.4h14.2" />
  </StrokeIcon>;
}

export function ObjectsCategoryIcon({color, size}: IconProps) {
  return <StrokeIcon color={color} size={size}>
    <Path d="M9.4 16.3a5.2 5.2 0 1 1 5.2 0v1.5H9.4v-1.5Z" />
    <Path d="M10 20.1h4" />
  </StrokeIcon>;
}

export function PickerSearchIcon({color = '#64748B'}: IconProps) {
  return <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <Circle cx={11} cy={11} r={7} />
    <Path d="m20 20-3.5-3.5" />
  </Svg>;
}
