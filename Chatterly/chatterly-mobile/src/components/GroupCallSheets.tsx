import {createThemedStyles, themeInk} from '../theme/themedStyles';
import React from 'react';
import {Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import Svg, {Circle, Defs, LinearGradient, Path, Rect, Stop} from 'react-native-svg';
import {GroupCallIcon, GroupCallToggle, type GroupCallIconName} from './GroupCallIcons';
import {
  GROUP_CALL_VIDEO_EFFECTS,
  type GroupCallSettings,
  type GroupCallVideoEffect,
} from '../services/groupCallSettings';
import type {CallAudioRoute} from '../services/callAudioRoutes';
import type {GroupCallParticipant} from '../utils/groupCallModel';

const FONT_FAMILY = Platform.select({android: 'sans-serif', ios: 'System'});

/** The in-call reactions strip from the More sheet, as the design draws it. */
export const GROUP_CALL_REACTIONS = ['😟', '😎', '😍', '🧐', '😅', '🥳'];

const initialsOf = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || '?';

function SheetShell({accessibilityLabel, children, bottomInset, onClose, onDismiss, visible}: {accessibilityLabel: string; children: React.ReactNode; bottomInset: number; onClose: () => void; onDismiss?: () => void; visible: boolean}) {
  return (
    <Modal animationType="slide" onDismiss={onDismiss} onRequestClose={onClose} statusBarTranslucent transparent visible={visible}>
      <View style={styles.backdrop}>
        <Pressable accessibilityLabel={`Close ${accessibilityLabel} backdrop`} onPress={onClose} style={StyleSheet.absoluteFill} />
        <View accessibilityLabel={accessibilityLabel} style={[styles.sheet, {paddingBottom: Math.max(bottomInset, 12)}]}>{children}</View>
      </View>
    </Modal>
  );
}

function SubSheetHeader({onBack, onClose, title}: {onBack?: () => void; onClose: () => void; title: string}) {
  return (
    <View style={styles.subHeader}>
      <Pressable accessibilityLabel={`Back from ${title}`} hitSlop={8} onPress={onBack || onClose} style={styles.subHeaderButton}>
        <GroupCallIcon color="#344256" name="back" size={18} />
      </Pressable>
      <Text accessibilityRole="header" style={styles.subTitle}>{title}</Text>
      <Pressable accessibilityLabel={`Close ${title}`} hitSlop={8} onPress={onClose} style={styles.subHeaderButton}>
        <GroupCallIcon color="#344256" name="close" size={16} />
      </Pressable>
    </View>
  );
}

// --- More options -------------------------------------------------------------

type MoreSheetProps = {
  /** The route the call is on now, shown beside Audio Output. */
  audioOutputLabel?: string;
  onDismiss?: () => void;
  bottomInset: number;
  canAddPeople: boolean;
  isScreenSharing: boolean;
  onAddPeople: () => void;
  onAudioOutput: () => void;
  onCallStatus: () => void;
  onClose: () => void;
  onMicrophoneSettings: () => void;
  onReact: (emoji: string) => void;
  onSettings: () => void;
  onShareScreen: () => void;
  onToggleAutoReconnect: () => void;
  onVideoEffects: () => void;
  settings: GroupCallSettings;
  visible: boolean;
};

export function GroupCallMoreSheet({
  audioOutputLabel,
  onDismiss,
  bottomInset,
  canAddPeople,
  isScreenSharing,
  onAddPeople,
  onAudioOutput,
  onCallStatus,
  onClose,
  onMicrophoneSettings,
  onReact,
  onSettings,
  onShareScreen,
  onToggleAutoReconnect,
  onVideoEffects,
  settings,
  visible,
}: MoreSheetProps) {
  const tile = (name: GroupCallIconName, label: string, onPress: () => void, disabled = false) => (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{disabled}}
      disabled={disabled}
      key={label}
      onPress={onPress}
      style={[styles.moreTile, disabled && styles.disabled]}>
      <GroupCallIcon color="#1E293B" name={name} size={21} />
      <Text numberOfLines={1} style={styles.moreTileLabel}>{label}</Text>
    </Pressable>
  );

  const row = (name: GroupCallIconName, label: string, onPress: () => void, trailing?: React.ReactNode) => (
    <Pressable accessibilityLabel={label} key={label} onPress={onPress} style={styles.optionRow}>
      <View style={styles.optionIconBox}><GroupCallIcon color="#1E293B" name={name} size={19} /></View>
      <Text style={styles.optionLabel}>{label}</Text>
      {trailing}
    </Pressable>
  );

  return (
    <SheetShell accessibilityLabel="More Options" onDismiss={onDismiss} bottomInset={bottomInset} onClose={onClose} visible={visible}>
      <View style={styles.grabber} />
      {settings.showReactions ? (
        <View accessibilityLabel="Send a reaction" style={styles.reactionRow}>
          {GROUP_CALL_REACTIONS.map(emoji => (
            <Pressable accessibilityLabel={`React ${emoji}`} key={emoji} onPress={() => onReact(emoji)} style={styles.reaction}>
              <Text style={styles.reactionText}>{emoji}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={styles.moreRow}>
        {tile('add', 'Add', onAddPeople, !canAddPeople)}
        {tile('screen', isScreenSharing ? 'Stop Share' : 'Share Screen', onShareScreen)}
      </View>
      <View style={styles.moreRow}>
        {tile('effects', 'Video Effects', onVideoEffects)}
        {tile('info', 'Call Status', onCallStatus)}
        {tile('settings', 'Settings', onSettings)}
      </View>

      <View style={styles.optionRows}>
        {row('microphone', 'Microphone Settings', onMicrophoneSettings)}
        {row('speaker', 'Audio Output', onAudioOutput, (
          <View style={styles.optionValue}><Text numberOfLines={1} style={styles.optionValueText}>{audioOutputLabel || settings.audioOutput}</Text></View>
        ))}
        {row('reconnect', 'Auto Reconnect', onToggleAutoReconnect, (
          <GroupCallToggle enabled={settings.autoReconnect} label="Auto Reconnect" />
        ))}
      </View>
    </SheetShell>
  );
}

// --- Audio output -------------------------------------------------------------

const ROUTE_ICONS: Record<CallAudioRoute['kind'], GroupCallIconName> = {
  speaker: 'speaker',
  earpiece: 'phone',
  wired: 'headphones',
  bluetooth: 'bluetooth',
  none: 'volumeOff',
};

/**
 * Audio Output lists the devices actually connected - a Bluetooth headset under
 * its own name only while it is paired and on - not a fixed sample list.
 */
export function GroupCallAudioOutputSheet({bottomInset, onBack, onClose, onSelect, routes, selected, visible}: {bottomInset: number; onBack: () => void; onClose: () => void; onSelect: (route: CallAudioRoute) => void; routes: CallAudioRoute[]; selected: string; visible: boolean}) {
  return (
    <SheetShell accessibilityLabel="Audio Output options" bottomInset={bottomInset} onClose={onClose} visible={visible}>
      <SubSheetHeader onBack={onBack} onClose={onClose} title="Audio Output" />
      {routes.map(route => (
        <Pressable
          accessibilityLabel={`Use ${route.label}`}
          accessibilityRole="radio"
          accessibilityState={{selected: route.id === selected}}
          key={route.id}
          onPress={() => onSelect(route)}
          style={styles.listRow}>
          <View style={styles.optionIcon}>
            <GroupCallIcon color="#0B1220" name={ROUTE_ICONS[route.kind]} size={19} />
          </View>
          <Text numberOfLines={1} style={styles.listLabel}>{route.label}</Text>
          <View style={styles.listTrailing}>
            {route.id === selected ? <GroupCallIcon color="#111827" name="check" size={16} /> : null}
          </View>
        </Pressable>
      ))}
    </SheetShell>
  );
}

// --- Microphone settings ------------------------------------------------------

export function GroupCallMicrophoneSheet({bottomInset, onBack, onClose, onToggleEcho, onToggleNoise, settings, visible}: {bottomInset: number; onBack: () => void; onClose: () => void; onToggleEcho: () => void; onToggleNoise: () => void; settings: GroupCallSettings; visible: boolean}) {
  const row = (label: string, enabled: boolean, onPress: () => void) => (
    <Pressable accessibilityLabel={label} key={label} onPress={onPress} style={styles.listRow}>
      <View style={styles.optionIcon}><GroupCallIcon color="#0B1220" name="microphone" size={18} /></View>
      <Text style={styles.listLabel}>{label}</Text>
      <GroupCallToggle enabled={enabled} label={label} />
    </Pressable>
  );
  return (
    <SheetShell accessibilityLabel="Microphone Settings options" bottomInset={bottomInset} onClose={onClose} visible={visible}>
      <SubSheetHeader onBack={onBack} onClose={onClose} title="Microphone Settings" />
      {row('Echo Cancellation', settings.echoCancellation, onToggleEcho)}
      {row('Noise Suppression', settings.noiseSuppression, onToggleNoise)}
    </SheetShell>
  );
}

// --- Call status --------------------------------------------------------------

export type GroupCallNetwork = 'Stable' | 'Unstable' | 'Offline';

export function GroupCallStatusSheet({bottomInset, network, onBack, onClose, settings, visible}: {bottomInset: number; network: GroupCallNetwork; onBack: () => void; onClose: () => void; settings: GroupCallSettings; visible: boolean}) {
  const online = network !== 'Offline';
  const rows: Array<{label: string; value: string; positive: boolean}> = [
    {label: 'Network Status', value: network, positive: network === 'Stable'},
    {label: 'Audio Quality', value: !online ? 'Unavailable' : network === 'Unstable' ? 'Fair' : 'Excellent', positive: online && network === 'Stable'},
    {label: 'Auto Reconnect', value: settings.autoReconnect ? 'Enabled' : 'Disabled', positive: settings.autoReconnect},
    {label: 'Echo Cancellation', value: settings.echoCancellation ? 'Active' : 'Off', positive: settings.echoCancellation},
    {label: 'Noise Suppression', value: settings.noiseSuppression ? 'Active' : 'Off', positive: settings.noiseSuppression},
  ];
  return (
    <SheetShell accessibilityLabel="Call Status details" bottomInset={bottomInset} onClose={onClose} visible={visible}>
      <SubSheetHeader onBack={onBack} onClose={onClose} title="Call Status" />
      {rows.map(row => (
        <View accessibilityLabel={`${row.label}: ${row.value}`} key={row.label} style={styles.statusRow}>
          <Text style={styles.statusLabel}>{row.label}</Text>
          {/* The design pills the network state green when it is healthy and
              every other value in neutral grey. */}
          <View style={[styles.statusPill, row.label === 'Network Status' && row.positive && styles.statusPillPositive]}>
            <Text style={[styles.statusValue, row.label === 'Network Status' && row.positive && styles.statusValuePositive]}>{row.value}</Text>
          </View>
        </View>
      ))}
    </SheetShell>
  );
}

// --- Video effects ------------------------------------------------------------

const EFFECT_COLORS: Record<GroupCallVideoEffect, [string, string]> = {
  None: ['#F4F6FA', '#E7ECF3'],
  Blur: ['#D8CFC3', '#B7AA99'],
  Office: ['#B9C6D8', '#7F91AA'],
  Home: ['#1F3B4D', '#0E2331'],
  Forest: ['#3F7A32', '#1E4A1B'],
};

function EffectThumbnail({effect}: {effect: GroupCallVideoEffect}) {
  const [from, to] = EFFECT_COLORS[effect];
  return (
    <Svg width={44} height={44} viewBox="0 0 44 44">
      <Defs>
        <LinearGradient id={`effect-${effect}`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={from} />
          <Stop offset="1" stopColor={to} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={44} height={44} rx={9} fill={effect === 'None' ? '#F3EEFE' : `url(#effect-${effect})`} />
      {effect === 'None' ? <>
        <Circle cx={22} cy={22} r={9} stroke={themeInk('#7C3AED')} strokeWidth={1.8} fill="none" />
        <Path d="M15.6 28.4 28.4 15.6" stroke={themeInk('#7C3AED')} strokeLinecap="round" strokeWidth={1.8} />
      </> : null}
    </Svg>
  );
}

export function GroupCallVideoEffectsSheet({bottomInset, onBack, onClose, onSelect, onToggleMirror, settings, visible}: {bottomInset: number; onBack: () => void; onClose: () => void; onSelect: (effect: GroupCallVideoEffect) => void; onToggleMirror: () => void; settings: GroupCallSettings; visible: boolean}) {
  return (
    <SheetShell accessibilityLabel="Video Effects options" bottomInset={bottomInset} onClose={onClose} visible={visible}>
      <SubSheetHeader onBack={onBack} onClose={onClose} title="Video Effects" />
      <ScrollView contentContainerStyle={styles.effectRow} horizontal showsHorizontalScrollIndicator={false}>
        {GROUP_CALL_VIDEO_EFFECTS.map(effect => {
          const active = settings.videoEffect === effect;
          return (
            <Pressable
              accessibilityLabel={`${effect} background`}
              accessibilityRole="radio"
              accessibilityState={{selected: active}}
              key={effect}
              onPress={() => onSelect(effect)}
              style={styles.effect}>
              <View style={[styles.effectThumb, active && styles.effectThumbActive]}><EffectThumbnail effect={effect} /></View>
              <Text style={[styles.effectLabel, active && styles.effectLabelActive]}>{effect}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <Pressable accessibilityLabel="Mirror my video" onPress={onToggleMirror} style={styles.listRow}>
        <Text style={styles.listLabel}>Mirror my video</Text>
        <GroupCallToggle enabled={settings.mirrorVideo} label="Mirror my video" />
      </Pressable>
    </SheetShell>
  );
}

// --- Participant actions ------------------------------------------------------

export function GroupCallParticipantSheet({bottomInset, busy, canManage, onClose, onMute, onPin, onRemove, participant, pinned, visible}: {bottomInset: number; busy: boolean; canManage: boolean; onClose: () => void; onMute: () => void; onPin: () => void; onRemove: () => void; participant: GroupCallParticipant | null; pinned: boolean; visible: boolean}) {
  if (!participant) { return null; }
  const action = (name: GroupCallIconName, label: string, onPress: () => void, danger = false, crossed = false) => (
    <Pressable
      accessibilityLabel={label}
      accessibilityState={{busy, disabled: busy}}
      disabled={busy}
      key={label}
      onPress={onPress}
      style={[styles.listRow, busy && styles.disabled]}>
      <View style={styles.optionIcon}><GroupCallIcon color={danger ? '#E11D48' : '#0B1220'} crossed={crossed} name={name} size={18} /></View>
      <Text style={[styles.listLabel, danger && styles.dangerLabel]}>{label}</Text>
    </Pressable>
  );

  return (
    <SheetShell accessibilityLabel={`${participant.name} call actions`} bottomInset={bottomInset} onClose={onClose} visible={visible}>
      <View style={styles.participantHeader}>
        {participant.profilePic
          ? <Image source={{uri: participant.profilePic}} style={styles.participantAvatar} />
          : <View style={[styles.participantAvatar, styles.avatarFallback]}><Text style={styles.avatarInitials}>{initialsOf(participant.name)}</Text></View>}
        <View style={styles.participantCopy}>
          <Text numberOfLines={1} style={styles.participantName}>{participant.name}{participant.isCurrentUser ? ' (You)' : ''}</Text>
          <Text numberOfLines={1} style={styles.participantPhone}>{participant.phone || (participant.isOrganizer ? 'Organizer' : 'Group member')}</Text>
        </View>
        <Pressable accessibilityLabel="Close participant actions" hitSlop={8} onPress={onClose} style={styles.subHeaderButton}>
          <GroupCallIcon color="#344256" name="close" size={16} />
        </Pressable>
      </View>
      {action('pin', pinned ? 'Unpin participant' : 'Pin participant', onPin, false, pinned)}
      {canManage && !participant.isCurrentUser ? action('microphone', participant.isMuted ? 'Unmute participant' : 'Mute participant', onMute, false, !participant.isMuted) : null}
      {canManage && !participant.isCurrentUser && !participant.isOrganizer ? action('remove', 'Remove from the call', onRemove, true) : null}
    </SheetShell>
  );
}

const styles = createThemedStyles({
  backdrop: {flex: 1, backgroundColor: 'rgba(15,23,42,.42)', justifyContent: 'flex-end'},
  sheet: {paddingHorizontal: 10, borderTopLeftRadius: 16, borderTopRightRadius: 16, backgroundColor: '#FFFFFF'},
  grabber: {alignSelf: 'center', width: 44, height: 4, marginTop: 9, marginBottom: 6, borderRadius: 2, backgroundColor: '#E2E8F0'},
  subHeader: {height: 48, flexDirection: 'row', alignItems: 'center'},
  subHeaderButton: {width: 40, height: 40, alignItems: 'center', justifyContent: 'center'},
  subTitle: {flex: 1, color: '#111827', fontFamily: FONT_FAMILY, fontSize: 12, fontWeight: '600', textAlign: 'center'},
  reactionRow: {marginBottom: 8, paddingHorizontal: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  reaction: {width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center'},
  reactionText: {fontSize: 24},
  moreRow: {marginBottom: 8, paddingHorizontal: 4, flexDirection: 'row', gap: 8},
  moreTile: {flex: 1, height: 76, borderWidth: 1, borderColor: '#EEF1F5', borderRadius: 10, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', gap: 8},
  moreTileLabel: {maxWidth: '92%', color: '#1F2937', fontFamily: FONT_FAMILY, fontSize: 11, fontWeight: '500'},
  optionRows: {marginTop: 6, paddingHorizontal: 4},
  optionRow: {height: 58, flexDirection: 'row', alignItems: 'center'},
  optionIcon: {width: 34, alignItems: 'center', justifyContent: 'center'},
  optionIconBox: {width: 40, height: 40, marginRight: 12, borderRadius: 8, backgroundColor: '#F7F8FA', alignItems: 'center', justifyContent: 'center'},
  optionLabel: {flex: 1, color: '#111827', fontFamily: FONT_FAMILY, fontSize: 12, fontWeight: '500'},
  optionValue: {maxWidth: 140, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 5, backgroundColor: '#F4F5F7'},
  optionValueText: {color: '#475569', fontFamily: FONT_FAMILY, fontSize: 10, fontWeight: '500'},
  listRow: {minHeight: 52, paddingHorizontal: 4, flexDirection: 'row', alignItems: 'center'},
  listLabel: {flex: 1, color: '#111827', fontFamily: FONT_FAMILY, fontSize: 11, fontWeight: '500'},
  listTrailing: {width: 30, alignItems: 'center', justifyContent: 'center'},
  dangerLabel: {color: '#E11D48'},
  disabled: {opacity: .45},
  statusRow: {minHeight: 54, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  statusLabel: {color: '#1F2937', fontFamily: FONT_FAMILY, fontSize: 12, fontWeight: '500'},
  statusPill: {paddingHorizontal: 9, paddingVertical: 5, borderRadius: 5, backgroundColor: '#F4F5F7'},
  statusPillPositive: {backgroundColor: '#E9FBF3'},
  statusValue: {color: '#475569', fontFamily: FONT_FAMILY, fontSize: 10, fontWeight: '500'},
  statusValuePositive: {color: '#15945D'},
  effectRow: {paddingHorizontal: 4, paddingVertical: 8, gap: 12},
  effect: {alignItems: 'center', gap: 6},
  effectThumb: {padding: 2, borderWidth: 2, borderColor: 'transparent', borderRadius: 12},
  effectThumbActive: {borderColor: '#8B5CF6'},
  effectLabel: {color: '#64748B', fontFamily: FONT_FAMILY, fontSize: 9},
  effectLabelActive: {color: '#7C3AED', fontWeight: '700'},
  participantHeader: {minHeight: 68, paddingHorizontal: 4, flexDirection: 'row', alignItems: 'center'},
  participantAvatar: {width: 44, height: 44, borderRadius: 8},
  avatarFallback: {backgroundColor: '#EDE5FC', alignItems: 'center', justifyContent: 'center'},
  avatarInitials: {color: '#7137DD', fontFamily: FONT_FAMILY, fontSize: 12, fontWeight: '700'},
  participantCopy: {flex: 1, minWidth: 0, marginLeft: 10},
  participantName: {color: '#111827', fontFamily: FONT_FAMILY, fontSize: 12, fontWeight: '700'},
  participantPhone: {marginTop: 3, color: '#758196', fontFamily: FONT_FAMILY, fontSize: 9},
});
