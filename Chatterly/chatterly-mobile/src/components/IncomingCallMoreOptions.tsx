import React, {useEffect} from 'react';
import {BackHandler, Platform, Pressable, StyleSheet, Text, View} from 'react-native';
import {BlurView} from 'expo-blur';
import Svg, {Path, Rect} from 'react-native-svg';
import {CALL_REACTIONS, type CallReactionEmoji} from '../services/callReactions';

type Props = {
  bottomInset: number;
  callType: 'audio' | 'video';
  microphoneModeLabel: string;
  onClose: () => void;
  onMicrophoneMode: () => void;
  onReaction: (emoji: CallReactionEmoji) => void;
  onSendMessage?: () => void;
  onShareScreen: () => void;
  sharingScreen: boolean;
};

function MenuIcon({name}: {name: 'share' | 'message' | 'mic'}) {
  return <Svg width={25} height={25} viewBox="0 0 24 24" fill="none">
    {name === 'mic' ? <Path d="M9 5a3 3 0 0 1 6 0v6a3 3 0 0 1-6 0V5ZM6 11a6 6 0 0 0 12 0M12 17v4M9 21h6" stroke="white" strokeWidth={1.7} strokeLinecap="round"/> : name === 'share' ? <><Rect x={3} y={4} width={18} height={14} rx={2} stroke="white" strokeWidth={1.7}/><Path d="M12 14V7m-3 3 3-3 3 3M8 21h8" stroke="white" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"/></> : <><Rect x={3} y={5} width={18} height={15} rx={2} stroke="white" strokeWidth={1.7}/><Path d="M7 10h10M7 14h7" stroke="white" strokeWidth={1.7} strokeLinecap="round"/></>}
  </Svg>;
}

/** In-call overlay: stays inside the incoming call's existing native modal. */
export function IncomingCallMoreOptions({bottomInset, callType, microphoneModeLabel, onClose, onMicrophoneMode, onReaction, onSendMessage, onShareScreen, sharingScreen}: Props) {
  const ios = Platform.OS === 'ios';
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { onClose(); return true; });
    return () => subscription.remove();
  }, [onClose]);
  const row = (icon: 'share' | 'message' | 'mic', label: string, action?: () => void, subtitle?: string) =>
    <Pressable accessibilityLabel={label} accessibilityRole="button" accessibilityState={{disabled: !action}} disabled={!action} onPress={action} style={[styles.row, !action && styles.disabled]}>
      <View style={styles.icon}><MenuIcon name={icon}/></View>
      <View style={styles.copy}><Text style={styles.label}>{label}</Text>{subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}</View>
    </Pressable>;
  return <View accessibilityViewIsModal style={styles.overlay}>
    <Pressable accessibilityLabel="Close call options backdrop" onPress={onClose} style={StyleSheet.absoluteFill}/>
    <View accessibilityLabel="More Options" style={[styles.menu, ios ? styles.iosWidth : styles.androidWidth, {bottom: Math.max(bottomInset, 12) + 12}]}>
      <View style={[styles.reactions, ios ? styles.iosPanel : styles.androidPanel]}>
        {ios ? <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill}/> : null}
        {CALL_REACTIONS.map(emoji => <Pressable accessibilityLabel={`Send call reaction ${emoji}`} accessibilityRole="button" key={emoji} onPress={() => onReaction(emoji)} style={styles.reaction}><Text style={styles.emoji}>{emoji}</Text></Pressable>)}
      </View>
      <View style={[styles.actions, ios ? styles.iosPanel : styles.androidPanel]}>
        {ios ? <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill}/> : null}
        {callType === 'video' ? row('share', sharingScreen ? 'Stop sharing' : 'Share screen', onShareScreen) : null}
        {ios ? row('mic', 'Mic Mode', onMicrophoneMode, microphoneModeLabel) : row('message', 'Send message', onSendMessage)}
      </View>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  overlay: {position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, zIndex: 100, elevation: 20},
  menu: {position: 'absolute', left: 16, maxWidth: 360, gap: 9},
  androidWidth: {width: '85%'}, iosWidth: {width: '72%'},
  androidPanel: {backgroundColor: '#182224'}, iosPanel: {backgroundColor: 'rgba(35,35,35,0.74)'},
  reactions: {height: 68, borderRadius: 36, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', overflow: 'hidden'},
  reaction: {flex: 1, height: 60, alignItems: 'center', justifyContent: 'center'},
  emoji: {fontSize: 28},
  actions: {paddingVertical: 8, borderRadius: 36, overflow: 'hidden'},
  row: {minHeight: 65, paddingHorizontal: 16, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 12},
  icon: {width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.09)', alignItems: 'center', justifyContent: 'center'},
  copy: {flex: 1}, label: {color: '#FFFFFF', fontSize: 18}, subtitle: {color: 'rgba(255,255,255,0.48)', marginTop: 3, fontSize: 14},
  disabled: {opacity: 0.45},
});
