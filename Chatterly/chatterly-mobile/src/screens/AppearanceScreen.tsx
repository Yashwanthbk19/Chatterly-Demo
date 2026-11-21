// Sprint 11 Story 2 - Appearance.
//
// Settings -> Appearance. App-wide theme selection lives here; per-chat
// wallpaper and bubble choices live under Personalisation so the two Settings
// destinations have separate responsibilities.

import React, {useState} from 'react';
import {Platform, Pressable, ScrollView, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Svg, {Path} from 'react-native-svg';
import {ThemeSheet} from '../components/ThemeSheet';
import {useTheme} from '../theme/ThemeProvider';
import {createThemedStyles, themeInk} from '../theme/themedStyles';

const FONT = Platform.select({android: 'sans-serif', ios: 'System'});

function BackIcon() {
  return <Svg width={24} height={24} viewBox="0 0 24 24" fill="none"><Path d="M15 6L9 12L15 18" stroke={themeInk('#0B1220')} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/></Svg>;
}

/** Theme: a sun, which is how the design marks the appearance row. */
function ThemeIcon() {
  const stroke = themeInk('#0B1220');
  return (
    <Svg width={22} height={22} viewBox="0 0 32 32" fill="none">
      <Path
        d="M7 16H8M16 7V8M24 16H25M16 24V25M9.6 9.6L10.3 10.3M22.4 9.6L21.7 10.3M21.7 21.7L22.4 22.4M10.3 21.7L9.6 22.4M12 16C12 17.0609 12.4214 18.0783 13.1716 18.8284C13.9217 19.5786 14.9391 20 16 20C17.0609 20 18.0783 19.5786 18.8284 18.8284C19.5786 18.0783 20 17.0609 20 16C20 14.9391 19.5786 13.9217 18.8284 13.1716C18.0783 12.4214 17.0609 12 16 12C14.9391 12 13.9217 12.4214 13.1716 13.1716C12.4214 13.9217 12 14.9391 12 16Z"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"/>
    </Svg>
  );
}

export function AppearanceScreen({onBack}: {onBack: () => void}): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const {label} = useTheme();
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={[styles.content, {paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24}]}>
        <View style={styles.header}>
          <Pressable accessibilityLabel="Back to settings" accessibilityRole="button" onPress={onBack} hitSlop={12} style={styles.back}>
            <BackIcon/>
          </Pressable>
          <Text style={styles.title}>Appearance</Text>
        </View>

        <View style={styles.rows}>
          <Pressable
            accessibilityLabel="Theme"
            accessibilityRole="button"
            accessibilityValue={{text: label}}
            onPress={() => setSheetOpen(true)}
            style={({pressed}) => [styles.row, pressed && styles.rowPressed]}>
            <ThemeIcon/>
            <View style={styles.copy}>
              <Text style={styles.rowTitle}>Theme</Text>
              <Text style={styles.rowDescription}>Choose your app theme.</Text>
            </View>
            <View style={styles.pill}><Text style={styles.pillText}>{label}</Text></View>
          </Pressable>

        </View>
      </ScrollView>

      <ThemeSheet visible={sheetOpen} onClose={() => setSheetOpen(false)}/>
    </View>
  );
}

const styles = createThemedStyles({
  root: {flex: 1, backgroundColor: '#FFFFFF'},
  content: {paddingHorizontal: 16, flexGrow: 1},
  header: {flexDirection: 'row', alignItems: 'center'},
  back: {width: 26, height: 42, justifyContent: 'center', alignItems: 'flex-start', marginRight: 9},
  title: {fontFamily: FONT, fontSize: 14, fontWeight: '700', color: '#121826'},
  rows: {marginTop: 14},
  row: {minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 11, borderRadius: 6, paddingHorizontal: 4},
  rowPressed: {backgroundColor: '#F7F8FA'},
  copy: {flex: 1},
  rowTitle: {fontFamily: FONT, fontSize: 12, fontWeight: '600', color: '#172033'},
  rowDescription: {fontFamily: FONT, fontSize: 9, color: '#758196', marginTop: 3},
  pill: {backgroundColor: '#F1EBFF', borderRadius: 11, paddingHorizontal: 10, height: 22, justifyContent: 'center'},
  pillText: {fontFamily: FONT, fontSize: 9, fontWeight: '600', color: '#7137DD'},
});
