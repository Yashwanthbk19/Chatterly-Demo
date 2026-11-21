import React from 'react';
import {Image, StyleSheet, View, type ImageSourcePropType, type StyleProp, type ViewStyle} from 'react-native';
import {useTheme} from '../theme/ThemeProvider';
import {DARK_THEME} from '../theme/palette';
import {PatternBackground} from '../components/PatternBackground';
import type {ChatWallpaperPreference} from '../services/preferencesApi';

const WARM_WAVES = require('../assets/wallpapers/warm-waves.png');
const MIDNIGHT_WAVES = require('../assets/wallpapers/midnight-waves.png');
const CHATTERLY_DOODLE = require('../assets/wallpapers/chatterly-doodle.png');

export type WallpaperPreset = {
  id: string;
  label: string;
  source: ImageSourcePropType;
  tint?: string;
};

export const WALLPAPER_PRESETS: readonly WallpaperPreset[] = [
  {id: 'warm-waves', label: 'Warm waves', source: WARM_WAVES},
  {id: 'midnight-waves', label: 'Midnight waves', source: MIDNIGHT_WAVES},
  {id: 'lavender-doodle', label: 'Lavender doodle', source: CHATTERLY_DOODLE, tint: '#EDE4FF'},
  {id: 'ocean-doodle', label: 'Ocean doodle', source: CHATTERLY_DOODLE, tint: '#DDF5F5'},
  {id: 'sand-doodle', label: 'Sand doodle', source: CHATTERLY_DOODLE, tint: '#F6E9D7'},
  {id: 'rose-doodle', label: 'Rose doodle', source: CHATTERLY_DOODLE, tint: '#F8E0E8'},
  {id: 'slate-doodle', label: 'Slate doodle', source: CHATTERLY_DOODLE, tint: '#DCE3EE'},
  {id: 'mint-doodle', label: 'Mint doodle', source: CHATTERLY_DOODLE, tint: '#DDF1E8'},
];

export const SOLID_WALLPAPER_COLORS = [
  '#FFFFFF', '#F5EEE4', '#F8DFD7', '#F3D7E4', '#E6DDF8', '#D8E8FA',
  '#D7F0F1', '#D8EEE4', '#EEF0D2', '#F7E4B6', '#CAD5E1', '#202936',
] as const;

export function wallpaperPreset(id: string): WallpaperPreset {
  return WALLPAPER_PRESETS.find(item => item.id === id) || WALLPAPER_PRESETS[0];
}

export function WallpaperBackground({wallpaper, style}: {wallpaper: ChatWallpaperPreference; style?: StyleProp<ViewStyle>}): React.JSX.Element {
  const {isDark} = useTheme();
  const dimOpacity = wallpaper.transparency / 100;

  if (wallpaper.type === 'default') {
    return <View pointerEvents="none" style={[styles.fill, {backgroundColor: isDark ? DARK_THEME.surface : '#FBFAFE'}, style]}><PatternBackground/><View style={[StyleSheet.absoluteFill, styles.dimOverlay, {opacity: dimOpacity}]}/></View>;
  }

  if (wallpaper.type === 'color') {
    return <View pointerEvents="none" style={[styles.fill, {backgroundColor: wallpaper.value}, style]}><PatternBackground/><View style={[StyleSheet.absoluteFill, styles.dimOverlay, {opacity: dimOpacity}]}/></View>;
  }

  const preset = wallpaper.type === 'preset' ? wallpaperPreset(wallpaper.value) : null;
  const source = preset?.source || {uri: wallpaper.value};
  return (
    <View pointerEvents="none" style={[styles.fill, {backgroundColor: preset?.tint || '#F4F1EE'}, style]}>
      <Image resizeMode="cover" source={source} style={[StyleSheet.absoluteFill, preset?.tint ? styles.doodleImage : null]}/>
      {preset?.tint ? <View style={[StyleSheet.absoluteFill, styles.tintOverlay, {backgroundColor: preset.tint}]}/> : null}
      <View style={[StyleSheet.absoluteFill, styles.dimOverlay, {opacity: dimOpacity}]}/>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, overflow: 'hidden'},
  doodleImage: {opacity: 0.45},
  dimOverlay: {backgroundColor: '#000000'},
  tintOverlay: {opacity: 0.56},
});

