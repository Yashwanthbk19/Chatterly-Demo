import React from 'react';
import Svg, {Path, Rect, Circle} from 'react-native-svg';
import {themeInk} from '../theme/themedStyles';
export function GroupProfileIcon({name, color = '#0B1220', size = 24}: {name: 'camera' | 'gallery' | 'edit' | 'up' | 'down' | 'back'; color?: string; size?: number}) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">{name === 'up' || name === 'down' || name === 'back' ? <Path d={name === 'up' ? 'm6 15 6-6 6 6' : name === 'down' ? 'm6 9 6 6 6-6' : 'm15 6-6 6 6 6'}/> : name === 'camera' ? <><Path d="M8 5 9.5 3h5L16 5h3a2 2 0 0 1 2 2v12H3V7a2 2 0 0 1 2-2Z"/><Circle cx={12} cy={12} r={4}/></> : name === 'gallery' ? <><Rect x={3} y={3} width={18} height={18} rx={3}/><Circle cx={8} cy={8} r={1}/><Path d="m3 17 5-5 4 4 3-3 6 6"/></> : <><Path d="M12 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7M15 4l5 5M10 14l-1 4 4-1 9-9a2 2 0 0 0-5-5Z"/></>}</Svg>;
}

export function GroupRulesEditIcon() {
  return <Svg width="20" height="20" viewBox="0 0 20 20" fill="none">
<Path d="M5.83337 5.83342H5.00004C4.55801 5.83342 4.13409 6.00902 3.82153 6.32158C3.50897 6.63414 3.33337 7.05806 3.33337 7.50009V15.0001C3.33337 15.4421 3.50897 15.866 3.82153 16.1786C4.13409 16.4912 4.55801 16.6668 5.00004 16.6668H12.5C12.9421 16.6668 13.366 16.4912 13.6786 16.1786C13.9911 15.866 14.1667 15.4421 14.1667 15.0001V14.1668M13.3438 4.17717L14.5125 3.01259C14.8407 2.68438 15.2859 2.5 15.75 2.5C16.2142 2.5 16.6593 2.68438 16.9875 3.01259C17.3157 3.34079 17.5001 3.78594 17.5001 4.25009C17.5001 4.71424 17.3157 5.15938 16.9875 5.48759L15.823 6.65634M13.3438 4.17717L7.50004 10.0001V12.5001H10L15.823 6.65634M13.3438 4.17717L13.3334 4.16676M13.3438 4.17717L15.823 6.65634M15.823 6.65634L15.8334 6.66676" stroke={themeInk('#5121BF')} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
</Svg>;
}

export function GroupPictureEditIcon() {
  return <Svg width="40" height="40" viewBox="0 0 40 40" fill="none">
<Path d="M15 15.0001H14C13.4696 15.0001 12.9609 15.2108 12.5858 15.5859C12.2107 15.961 12 16.4697 12 17.0001V26.0001C12 26.5305 12.2107 27.0392 12.5858 27.4143C12.9609 27.7894 13.4696 28.0001 14 28.0001H23C23.5304 28.0001 24.0391 27.7894 24.4142 27.4143C24.7893 27.0392 25 26.5305 25 26.0001V25.0001M24.0125 13.0126L25.415 11.6151C25.8088 11.2213 26.343 11 26.9 11C27.457 11 27.9912 11.2213 28.385 11.6151C28.7788 12.009 29.0001 12.5431 29.0001 13.1001C29.0001 13.6571 28.7788 14.1913 28.385 14.5851L26.9875 15.9876M24.0125 13.0126L17 20.0001V23.0001H20L26.9875 15.9876M24.0125 13.0126L24 13.0001M24.0125 13.0126L26.9875 15.9876M26.9875 15.9876L27 16.0001" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
</Svg>;
}
