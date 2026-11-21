import {createThemedStyles, themeInk} from '../theme/themedStyles';
import React, {useState} from 'react';
import {Image, Modal, Platform, Pressable, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Svg, {Path} from 'react-native-svg';
import {formatEndedDuration} from '../utils/callSummary';

type Props = {
  name: string;
  picture?: string | null;
  duration: number;
  status?: 'ended' | 'declined';
  onMessage: () => void;
  onAudioCallAgain: () => void;
  onClose: () => void;
  busy?: boolean;
};

export function CallEndedScreen({name, picture, duration, status = 'ended', onMessage, onAudioCallAgain, onClose, busy = false}: Props) {
  const insets = useSafeAreaInsets();
  const [failedPicture, setFailedPicture] = useState<string | null>(null);
  return <Modal visible animationType="fade" statusBarTranslucent onRequestClose={onClose}>
    <View style={[styles.screen, {paddingTop: Math.max(insets.top, 24), paddingBottom: Math.max(insets.bottom, 12)}]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} disabled={busy} style={styles.close}>
        <Svg width={24} height={24} viewBox="0 0 24 24"><Path d="m6 6 12 12M18 6 6 18" stroke={themeInk('#141824')} strokeWidth={1.5}/></Svg>
      </Pressable>
      <View style={styles.identity}>
        <Text style={styles.name}>{name}</Text>
        <Text accessibilityRole="text" style={styles.status}>{status === 'declined' ? 'Call Declined' : 'Call Ended'}</Text>
        <Text accessibilityLabel={`Call duration ${formatEndedDuration(duration)}`} style={styles.duration}>{formatEndedDuration(duration)}</Text>
        {picture && picture !== failedPicture ? <Image accessibilityLabel={`${name}'s picture`} source={{uri: picture}} onError={() => setFailedPicture(picture)} style={styles.avatar}/> :
          <View style={[styles.avatar, styles.fallback]}><Text style={styles.initials}>{name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || '?'}</Text></View>}
      </View>
      <View style={styles.actions}>
        <View style={styles.action}>
          <Pressable accessibilityRole="button" accessibilityLabel="Message" accessibilityState={{disabled: busy}} disabled={busy} onPress={onMessage} style={styles.message}>
            <Svg width={28} height={28} viewBox="0 0 28 28"><Path d="M6 3h16a4 4 0 0 1 4 4v12a4 4 0 0 1-4 4h-8l-6 4v-4H6a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4Z" fill={themeInk('#374151')}/><Path d="M9 10h10M9 15h7" stroke="white" strokeWidth={2} strokeLinecap="round"/></Svg>
          </Pressable><Text style={styles.label}>Message</Text>
        </View>
        <View style={styles.action}>
          <Pressable accessibilityRole="button" accessibilityLabel="Audio Call Again" accessibilityState={{disabled: busy}} disabled={busy} onPress={onAudioCallAgain} style={[styles.message, styles.again]}>
            <Svg width={28} height={28} viewBox="0 0 28 28" fill="none"><Path d="M8.2 4.5 11.6 10l-2.5 2a16.5 16.5 0 0 0 6.9 6.9l2-2.5 5.5 3.4-.9 3.7a2.5 2.5 0 0 1-2.4 1.9C11.5 24.9 3.1 16.5 2.6 7.8A2.5 2.5 0 0 1 4.5 5.4l3.7-.9Z" stroke="white" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"/></Svg>
          </Pressable><Text style={[styles.label, styles.green]}>Audio Call Again</Text>
        </View>
      </View>
    </View>
  </Modal>;
}

const styles = createThemedStyles({
  screen: {flex: 1, backgroundColor: '#FFFFFF', fontFamily: Platform.select({ios: 'System', android: 'sans-serif'})},
  close: {marginTop: 20, marginLeft: 15, width: 44, height: 44, borderRadius: 12, backgroundColor: '#F5F5F5', alignItems: 'center', justifyContent: 'center'},
  identity: {flex: 1, alignItems: 'center', paddingTop: 21},
  name: {fontSize: 22, fontWeight: '700', color: '#141824', textAlign: 'center', paddingHorizontal: 24},
  status: {marginTop: 14, fontSize: 14, color: '#465168'},
  duration: {marginTop: 15, fontSize: 14, color: '#465168', fontVariant: ['tabular-nums']},
  avatar: {marginTop: 73, width: 120, height: 120, borderRadius: 20},
  fallback: {backgroundColor: '#F0E7FF', alignItems: 'center', justifyContent: 'center'},
  initials: {fontSize: 32, color: '#7137DD', fontWeight: '700'},
  actions: {flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 36, paddingBottom: 38},
  action: {width: 76, alignItems: 'center'},
  message: {width: 75, height: 75, borderRadius: 16, borderWidth: 1, borderColor: '#EEF0F5', alignItems: 'center', justifyContent: 'center'},
  again: {backgroundColor: '#62B587', borderColor: '#62B587'},
  label: {marginTop: 8, fontSize: 13, color: '#596579'},
  green: {color: '#52AD7C'},
});
