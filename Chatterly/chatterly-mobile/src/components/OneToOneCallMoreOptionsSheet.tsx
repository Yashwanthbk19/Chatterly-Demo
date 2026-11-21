import {createThemedStyles} from '../theme/themedStyles';
import React from 'react';
import {Modal, Platform, Pressable, StyleSheet, Text, View} from 'react-native';
import Svg, {Rect} from 'react-native-svg';
import {OneToOneCallOptionIcon, type OneToOneCallOptionIconName} from './OneToOneCallOptionIcon';
import {IncomingCallMoreOptions} from './IncomingCallMoreOptions';
import type {CallReactionEmoji} from '../services/callReactions';

type Props = {
  incomingCallType?: 'audio' | 'video';
  microphoneModeLabel?: string;
  onMicrophoneMode?: () => void;
  onReaction?: (emoji: CallReactionEmoji) => void;
  onSendMessage?: () => void;
  /** The route the call is on, shown beside Audio Output. */
  audioOutputLabel?: string;
  autoReconnect: boolean;
  bottomInset: number;
  /** False where this side has no way to add people; the tile is shown disabled. */
  canAddPeople?: boolean;
  onAddPeople: () => void;
  onAudioOutput: () => void;
  onCallStatus: () => void;
  onClose: () => void;
  onMicrophoneSettings: () => void;
  onShareScreen: () => void;
  onToggleAutoReconnect: () => void;
  onViewContact: () => void;
  sharingScreen?: boolean;
  visible: boolean;
};

function ReconnectToggle({enabled}: {enabled: boolean}) {
  return <Svg accessibilityLabel={`Auto Reconnect ${enabled ? 'On' : 'Off'}`} accessibilityRole="switch" width={44} height={24} viewBox="0 0 44 24" fill="none">
    <Rect x={0.25} y={0.25} width={43.5} height={23.5} rx={3.75} fill={enabled ? '#8B5CF6' : '#E2E8F0'}/>
    <Rect x={0.25} y={0.25} width={43.5} height={23.5} rx={3.75} stroke={enabled ? '#7C3AED' : '#CBD5E1'} strokeWidth={0.5}/>
    <Rect x={enabled ? 22 : 2} y={2} width={20} height={20} rx={2} fill="white"/>
  </Svg>;
}

export function OneToOneCallMoreOptionsSheet({incomingCallType, microphoneModeLabel = 'Standard', onMicrophoneMode, onReaction, onSendMessage, audioOutputLabel = 'Speaker', autoReconnect, bottomInset, canAddPeople = true, onAddPeople, onAudioOutput, onCallStatus, onClose, onMicrophoneSettings, onShareScreen, onToggleAutoReconnect, onViewContact, sharingScreen = false, visible}: Props) {
  if (incomingCallType) return visible ? <IncomingCallMoreOptions bottomInset={bottomInset} callType={incomingCallType} microphoneModeLabel={microphoneModeLabel} onClose={onClose} onMicrophoneMode={onMicrophoneMode || onMicrophoneSettings} onReaction={emoji => onReaction?.(emoji)} onSendMessage={onSendMessage} onShareScreen={onShareScreen} sharingScreen={sharingScreen}/> : null;
  const row = (icon: OneToOneCallOptionIconName, label: string, onPress: () => void, trailing?: React.ReactNode) => <Pressable accessibilityLabel={label} key={label} onPress={onPress} style={styles.row}>
    <View style={styles.rowIcon}><OneToOneCallOptionIcon name={icon}/></View>
    <Text style={styles.rowLabel}>{label}</Text>
    {trailing}
  </Pressable>;

  return <Modal animationType="slide" onRequestClose={onClose} statusBarTranslucent transparent visible={visible}>
    <View style={styles.backdrop}>
      <Pressable accessibilityLabel="Close call options backdrop" onPress={onClose} style={StyleSheet.absoluteFill}/>
      <View accessibilityLabel="More Options" style={[styles.sheet, {paddingBottom: Math.max(bottomInset, 14)}]}>
        <View style={styles.header}>
          <Text accessibilityRole="header" style={styles.title}>More Options</Text>
          <Pressable accessibilityLabel="Close more options" hitSlop={10} onPress={onClose} style={styles.close}><Text style={styles.closeText}>×</Text></Pressable>
        </View>
        <View style={styles.quickOptions}>
          <Pressable accessibilityHint={canAddPeople ? undefined : 'The caller can add people to this call'} accessibilityLabel="Add People to Call" accessibilityState={{disabled: !canAddPeople}} disabled={!canAddPeople} onPress={onAddPeople} style={[styles.quickOption, !canAddPeople && styles.quickOptionDisabled]}>
            <OneToOneCallOptionIcon name="add"/>
            <Text style={styles.quickOptionLabel}>Add People to Call</Text>
          </Pressable>
          <Pressable accessibilityLabel={sharingScreen ? 'Stop screen sharing' : 'Share Screen'} accessibilityState={{selected: sharingScreen}} onPress={onShareScreen} style={[styles.quickOption, sharingScreen && styles.quickOptionActive]}>
            <OneToOneCallOptionIcon name="share"/>
            <Text style={styles.quickOptionLabel}>{sharingScreen ? 'Stop Sharing' : 'Share Screen'}</Text>
          </Pressable>
        </View>
        <View style={styles.rows}>
          {row('speaker', 'Audio Output', onAudioOutput, <View style={styles.value}><Text numberOfLines={1} style={styles.valueText}>{audioOutputLabel}</Text></View>)}
          {row('microphone', 'Microphone Settings', onMicrophoneSettings)}
          {row('reconnect', 'Auto Reconnect', onToggleAutoReconnect, <ReconnectToggle enabled={autoReconnect}/>)}
          {row('contact', 'View Contact', onViewContact)}
          {row('status', 'Call Status', onCallStatus)}
        </View>
      </View>
    </View>
  </Modal>;
}

const FONT_FAMILY = Platform.select({android: 'sans-serif', ios: 'System'});

const styles = createThemedStyles({
  backdrop: {flex: 1, backgroundColor: 'rgba(15,23,42,.38)', justifyContent: 'flex-end'},
  sheet: {minHeight: 475, paddingHorizontal: 12, paddingTop: 7, borderTopLeftRadius: 15, borderTopRightRadius: 15, backgroundColor: '#FFFFFF'},
  header: {height: 39, alignItems: 'center', justifyContent: 'center'},
  title: {color: '#111827', fontFamily: FONT_FAMILY, fontSize: 12, fontWeight: '600'},
  close: {position: 'absolute', right: 0, width: 38, height: 38, alignItems: 'center', justifyContent: 'center'},
  closeText: {color: '#344256', fontFamily: FONT_FAMILY, fontSize: 22, lineHeight: 24, fontWeight: '300'},
  quickOptions: {height: 88, flexDirection: 'row', gap: 8},
  quickOption: {flex: 1, borderWidth: 1, borderColor: '#E8ECF2', borderRadius: 6, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center'},
  quickOptionLabel: {marginTop: 8, color: '#1F2937', fontFamily: FONT_FAMILY, fontSize: 9, fontWeight: '500'},
  quickOptionDisabled: {opacity: 0.45},
  quickOptionActive: {borderColor: '#DDD0FB', backgroundColor: '#F5F0FF'},
  rows: {marginTop: 7, overflow: 'hidden', borderRadius: 7},
  row: {height: 57, paddingHorizontal: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#EDF0F4', backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center'},
  rowIcon: {width: 48, height: 48, marginRight: 2, alignItems: 'center', justifyContent: 'center'},
  rowLabel: {flex: 1, color: '#111827', fontFamily: FONT_FAMILY, fontSize: 10, fontWeight: '500'},
  value: {maxWidth: 140, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 4, backgroundColor: '#F4F5F7'},
  valueText: {color: '#344256', fontFamily: FONT_FAMILY, fontSize: 8, fontWeight: '500'},
});
