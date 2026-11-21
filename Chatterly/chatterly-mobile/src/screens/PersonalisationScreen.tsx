import React, {useState} from 'react';
import {Platform, Pressable, ScrollView, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Svg, {Path} from 'react-native-svg';
import {createThemedStyles, themeInk} from '../theme/themedStyles';
import {ChatCustomizationScreen} from './ChatCustomizationScreen';

const FONT = Platform.select({android: 'sans-serif', ios: 'System'});

function BackIcon() {
  return <Svg width={24} height={24} viewBox="0 0 24 24" fill="none"><Path d="M15 6L9 12L15 18" stroke={themeInk('#0B1220')} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/></Svg>;
}

function ChevronIcon() {
  return <Svg width={18} height={18} viewBox="0 0 24 24" fill="none"><Path d="m9 5 7 7-7 7" stroke={themeInk('#526177')} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/></Svg>;
}

function CustomizationIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 32 32" fill="none">
      <Path
        d="M12 10H22C22.5304 10 23.0391 10.2107 23.4142 10.5858C23.7893 10.9609 24 11.4696 24 12V22C24 22.5304 23.7893 23.0391 23.4142 23.4142C23.0391 23.7893 22.5304 24 22 24H10M12 10V22M12 10C12 9.46957 11.7893 8.96086 11.4142 8.58579C11.0391 8.21071 10.5304 8 10 8C9.46957 8 8.96086 8.21071 8.58579 8.58579C8.21071 8.96086 8 9.46957 8 10V22M10 24C9.46957 24 8.96086 23.7893 8.58579 23.4142C8.21071 23.0391 8 22.5304 8 22M10 24C10.5304 24 11.0391 23.7893 11.4142 23.4142C11.7893 23.0391 12 22.5304 12 22M8 22C8 21.4696 8.21071 20.9609 8.58579 20.5858C8.96086 20.2107 9.46957 20 10 20C10.5304 20 11.0391 20.2107 11.4142 20.5858 11.7893 20.9609 12 21.4696 12 22"
        stroke={themeInk('#0B1220')}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"/>
    </Svg>
  );
}

export function PersonalisationScreen({onBack}: {onBack: () => void}): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const [customizationOpen, setCustomizationOpen] = useState(false);

  if (customizationOpen) {
    return <ChatCustomizationScreen onBack={() => setCustomizationOpen(false)}/>;
  }

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={[styles.content, {paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24}]}>
        <View style={styles.header}>
          <Pressable accessibilityLabel="Back to settings" accessibilityRole="button" onPress={onBack} hitSlop={12} style={styles.back}>
            <BackIcon/>
          </Pressable>
          <Text style={styles.title}>Personalisation</Text>
        </View>

        <View style={styles.rows}>
          <Pressable
            accessibilityLabel="Chat Customization"
            accessibilityRole="button"
            onPress={() => setCustomizationOpen(true)}
            style={({pressed}) => [styles.row, pressed && styles.rowPressed]}>
            <CustomizationIcon/>
            <View style={styles.copy}>
              <Text style={styles.rowTitle}>Chat Customization</Text>
              <Text style={styles.rowDescription}>Customize your wallpaper and message bubble colors.</Text>
            </View>
            <ChevronIcon/>
          </Pressable>
        </View>
      </ScrollView>
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
});
