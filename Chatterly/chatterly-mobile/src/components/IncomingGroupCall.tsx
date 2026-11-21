import {createThemedStyles} from '../theme/themedStyles';
import React, {useEffect, useRef} from 'react';
import {ActivityIndicator, Animated, Image, Modal, Platform, Pressable, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {GroupCallIcon} from './GroupCallIcons';
import {CallRingtone} from './CallRingtone';
import {CALL_RINGTONE_STATE} from '../services/callRingtone';
import {useIncomingCallNotificationSettings} from '../hooks/useIncomingCallNotificationSettings';
import type {GroupCallInvite} from '../types/groupCall';

// The full-screen prompt for an inbound `group_call_invitation`. It mirrors the
// Sprint 8 one-to-one incoming screen so answering a conference feels the same
// as answering a call, and it is what turns the backend's invitation broadcast
// into something a member can actually act on.
//
// There is no "decline" event in the group-call socket contract - the server
// only tracks who joined - so dismissing simply stops ringing on this device
// and leaves the conference running for everyone else.

const FONT_FAMILY = Platform.select({android: 'sans-serif', ios: 'System'});

const initialsOf = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || '?';

type Props = {
  busy: boolean;
  invite: GroupCallInvite | null;
  onDismiss: () => void;
  onJoin: () => void;
};

export function IncomingGroupCall({busy, invite, onDismiss, onJoin}: Props) {
  const insets = useSafeAreaInsets();
  const pulse = useRef(new Animated.Value(0)).current;
  const notificationSettings = useIncomingCallNotificationSettings(invite?.groupCallId);

  useEffect(() => {
    if (!invite) { return; }
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {toValue: 1, duration: 900, useNativeDriver: true}),
        Animated.timing(pulse, {toValue: 0, duration: 900, useNativeDriver: true}),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [invite, pulse]);

  if (!invite || !notificationSettings?.notifications || !notificationSettings.callNotifications) { return null; }

  const callLabel = `${invite.type === 'audio' ? 'Voice' : 'Video'} group call`;
  const ringtoneEnabled = notificationSettings.notifications &&
    notificationSettings.callNotifications &&
    notificationSettings.callRingtone &&
    notificationSettings.soundEnabled;

  return (
    <>
      <CallRingtone
        state={ringtoneEnabled ? CALL_RINGTONE_STATE.INCOMING_RINGING : CALL_RINGTONE_STATE.ENDED}
        tone={notificationSettings.notificationTone}
      />
      <Modal animationType="fade" onRequestClose={onDismiss} statusBarTranslucent visible>
      <View accessibilityLabel={`Incoming ${callLabel}`} style={[styles.screen, {paddingTop: Math.max(insets.top, 24), paddingBottom: Math.max(insets.bottom, 24)}]}>
        <Text style={styles.kicker}>{invite.isMidCallInvite ? 'You were added to a call' : `Incoming ${callLabel}`}</Text>

        <Animated.View style={[styles.avatarRing, {transform: [{scale: pulse.interpolate({inputRange: [0, 1], outputRange: [1, 1.06]})}]}]}>
          {invite.groupPhoto
            ? <Image source={{uri: invite.groupPhoto}} style={styles.avatar} />
            : <View style={[styles.avatar, styles.avatarFallback]}><Text style={styles.avatarInitials}>{initialsOf(invite.groupName)}</Text></View>}
        </Animated.View>

        <Text numberOfLines={2} style={styles.groupName}>{invite.groupName}</Text>
        <Text numberOfLines={1} style={styles.startedBy}>{invite.startedByName} started this call</Text>

        <View style={styles.actions}>
          <Pressable
            accessibilityLabel="Dismiss the group call"
            accessibilityState={{disabled: busy}}
            disabled={busy}
            onPress={onDismiss}
            style={styles.action}>
            <View style={[styles.actionButton, styles.decline]}><GroupCallIcon color="#FFFFFF" name="end" size={24} /></View>
            <Text style={styles.actionLabel}>Dismiss</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="Join the group call"
            accessibilityState={{busy, disabled: busy}}
            disabled={busy}
            onPress={onJoin}
            style={styles.action}>
            <View style={[styles.actionButton, styles.join]}>
              {busy ? <ActivityIndicator color="#FFFFFF" size="small" /> : <GroupCallIcon color="#FFFFFF" name={invite.type === 'audio' ? 'call' : 'camera'} size={24} />}
            </View>
            <Text style={styles.actionLabel}>Join</Text>
          </Pressable>
        </View>
      </View>
      </Modal>
    </>
  );
}

const styles = createThemedStyles({
  screen: {flex: 1, paddingHorizontal: 28, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center'},
  kicker: {color: '#64748B', fontFamily: FONT_FAMILY, fontSize: 11, fontWeight: '600'},
  avatarRing: {marginTop: 26, padding: 6, borderRadius: 999, backgroundColor: '#F3ECFF'},
  avatar: {width: 124, height: 124, borderRadius: 62},
  avatarFallback: {backgroundColor: '#EDE5FC', alignItems: 'center', justifyContent: 'center'},
  avatarInitials: {color: '#7137DD', fontFamily: FONT_FAMILY, fontSize: 34, fontWeight: '800'},
  groupName: {marginTop: 20, color: '#111827', fontFamily: FONT_FAMILY, fontSize: 18, fontWeight: '700', textAlign: 'center'},
  startedBy: {marginTop: 6, color: '#758196', fontFamily: FONT_FAMILY, fontSize: 11},
  actions: {marginTop: 54, flexDirection: 'row', gap: 56},
  action: {alignItems: 'center'},
  actionButton: {width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center'},
  decline: {backgroundColor: '#E9282D'},
  join: {backgroundColor: '#18B777'},
  actionLabel: {marginTop: 9, color: '#64748B', fontFamily: FONT_FAMILY, fontSize: 10, fontWeight: '600'},
});
