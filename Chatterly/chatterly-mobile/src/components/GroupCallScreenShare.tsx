import {createThemedStyles} from '../theme/themedStyles';
import React from 'react';
import {ActivityIndicator, Modal, Pressable, StyleSheet, Text, View} from 'react-native';
import {BlurView} from 'expo-blur';
import {GroupCallIcon} from './GroupCallIcons';
import {appScreenSharingUnavailableMessage, supportsAppScreenSharing, type ScreenShareSource} from '../services/screenShareSource';

export function GroupCallScreenShare({step, source = 'screen', bottomInset, busy, onClose, onSelect, onStart}: {
  step: '' | 'choose' | 'confirm'; bottomInset: number; busy: boolean;
  source?: ScreenShareSource;
  onClose: () => void; onSelect: (source: ScreenShareSource) => void; onStart: () => void;
}) {
  const appSharingAvailable = supportsAppScreenSharing();
  return <Modal transparent visible={!!step} animationType="fade" statusBarTranslucent onRequestClose={onClose}>
    <View style={[styles.backdrop, step === 'confirm' && styles.center]}>
      {step === 'confirm' ? <BlurView intensity={24} style={StyleSheet.absoluteFill} /> : null}
      <Pressable accessibilityLabel="Close screen sharing" onPress={onClose} style={StyleSheet.absoluteFill} />
      {step === 'choose' ? <View style={[styles.sheet, {paddingBottom: Math.max(bottomInset, 24)}]}>
        <View style={styles.handle} />
        <View style={styles.header}><Text style={styles.heading}>Share Screen</Text>
          <Pressable accessibilityLabel="Close Share Screen" onPress={onClose} style={styles.close}><GroupCallIcon name="close" size={24} /></Pressable>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Entire Screen" onPress={() => onSelect('screen')} style={styles.option}>
          <GroupCallIcon name="entireScreen" size={26} /><View style={styles.copy}><Text style={styles.title}>Entire Screen</Text>
            <Text style={styles.description}>Share everything on your screen, including notifications and other apps.</Text></View>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Specific App" accessibilityState={{disabled: !appSharingAvailable}} disabled={!appSharingAvailable} onPress={() => onSelect('app')} style={styles.option}>
          <GroupCallIcon name="appWindow" size={26} /><View style={styles.copy}><Text style={styles.title}>Specific App</Text>
            <Text style={styles.description}>{appSharingAvailable ? 'Select a single app in the Android sharing dialog.' : appScreenSharingUnavailableMessage()}</Text></View>
        </Pressable>
      </View> : <View accessibilityViewIsModal style={styles.dialog}>
        <View style={styles.icon}><GroupCallIcon name="screen" color="#5925DC" size={30} /></View>
        <Text accessibilityRole="header" style={styles.dialogTitle}>{source === 'app' ? 'Share a Specific App?' : 'Share Your Screen?'}</Text>
        <Text style={styles.message}>{source === 'app' ? 'In the Android sharing dialog, choose a single app, then select the app to share. Choosing the entire screen there will share everything instead.' : 'Everything displayed on your screen will be visible to participants.'}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Start Sharing" accessibilityState={{busy, disabled: busy}} disabled={busy} onPress={onStart} style={styles.action}>
          {busy ? <ActivityIndicator color="#5925DC" /> : <Text style={styles.start}>Start Sharing</Text>}
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onClose} style={styles.cancel}><Text style={styles.title}>Cancel</Text></Pressable>
      </View>}
    </View>
  </Modal>;
}
const styles = createThemedStyles({
  backdrop: {flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.40)'},
  center: {justifyContent: 'center', paddingHorizontal: 28},
  sheet: {backgroundColor: '#FFFFFF', borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingHorizontal: 24},
  handle: {width: 48, height: 4, borderRadius: 4, backgroundColor: '#E2E8F0', alignSelf: 'center', marginTop: 8},
  header: {height: 60, alignItems: 'center', justifyContent: 'center'},
  heading: {fontSize: 19, color: '#101828', fontWeight: '500'},
  close: {position: 'absolute', right: -10, padding: 12},
  option: {flexDirection: 'row', alignItems: 'center', paddingVertical: 16, gap: 22},
  copy: {flex: 1}, title: {fontSize: 18, color: '#101828'},
  description: {fontSize: 15, lineHeight: 23, color: '#526078', marginTop: 6},
  dialog: {backgroundColor: '#FFFFFF', borderRadius: 18, alignItems: 'center', paddingHorizontal: 26, paddingTop: 24, elevation: 12, shadowOpacity: .18, shadowRadius: 12, shadowOffset: {width: 0, height: 6}},
  icon: {width: 68, height: 68, borderRadius: 34, backgroundColor: '#F0EAFF', alignItems: 'center', justifyContent: 'center', marginBottom: 26},
  dialogTitle: {fontSize: 22, fontWeight: '700', color: '#1E293B', textAlign: 'center'},
  message: {fontSize: 16, lineHeight: 24, textAlign: 'center', color: '#526078', marginTop: 14},
  action: {minHeight: 60, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', marginTop: 28},
  start: {fontSize: 19, color: '#5925DC'},
  cancel: {minHeight: 60, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', marginBottom: 4},
});
