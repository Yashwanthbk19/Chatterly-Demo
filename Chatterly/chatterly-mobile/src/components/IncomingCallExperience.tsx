import {useCallKeepAwake} from '../hooks/useCallKeepAwake';
import {createThemedStyles, themeInk} from '../theme/themedStyles';
import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Animated, Image, Modal, PanResponder, Platform, Pressable, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Svg, {Path} from 'react-native-svg';
import {ActiveIncomingCallScreen} from './ActiveIncomingCallScreen';
import {cancelNotificationVibration, vibrateNotification} from '../services/notificationVibration';
import type {CallAudioRoute} from '../services/callAudioRoutes';
import {CallRingtone} from './CallRingtone';
import {incomingRingtoneState} from '../services/callRingtone';
import type {IncomingCall} from '../types/call';
import {useIncomingCallNotificationSettings} from '../hooks/useIncomingCallNotificationSettings';

export type IncomingCallPresentation = 'banner' | 'full' | 'dismissed';

type Props = {
  call: IncomingCall;
  presentation: IncomingCallPresentation;
  onAccept: () => void;
  onDecline: () => void;
  onDismissBanner: () => void;
  onMinimize: () => void;
  onOpen: () => void;
  onClose?: () => void;
  onMessage?: () => void;
  onCallAgain?: () => void;
  onSelectAudioOutput?: (route: CallAudioRoute) => void;
  onToggleMute?: () => void;
  onToggleHold?: () => void;
  onToggleVideo?: () => void;
  busy?: boolean;
};

const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || '?';

function PhoneActionIcon() {
  return <Svg width={27} height={27} viewBox="28 24 32 32" fill="none">
    <Path
      d="M52.3394 45.3346L55.3719 42.2172C55.7741 41.8038 56 41.2431 56 40.6585C56 40.0739 55.7741 39.5132 55.3719 39.0998C48.8808 33.1907 39.1192 33.1907 32.6281 39.0998C32.2259 39.5132 32 40.0739 32 40.6585C32 41.2431 32.2259 41.8038 32.6281 42.2172L35.6606 45.3346L40.9675 42.9966L40.2094 39.8791C42.6676 39.0214 45.3324 39.0214 47.7906 39.8791L47.0325 42.9966L52.3394 45.3346Z"
      stroke={themeInk('#FFFFFF')}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>;
}

function CallerAvatar({call, banner = false}: {call: IncomingCall; banner?: boolean}) {
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const avatarStyle = banner ? styles.bannerAvatar : styles.fullAvatar;
  return call.callerProfilePic && failedUri !== call.callerProfilePic
    ? <Image source={{uri: call.callerProfilePic}} onError={() => setFailedUri(call.callerProfilePic || null)} style={avatarStyle}/>
    : <View style={[avatarStyle, styles.avatarFallback]}><Text style={[styles.avatarInitial, banner && styles.bannerAvatarInitial]}>{initialsOf(call.callerName)}</Text></View>;
}

function CallAction({accept = false, label, onPress, small = false, disabled = false}: {disabled?: boolean; accept?: boolean; label: string; onPress: () => void; small?: boolean}) {
  return <View style={small ? styles.bannerActionWrap : styles.fullActionWrap}>
    <Pressable accessibilityRole="button" accessibilityState={{disabled}} disabled={disabled} accessibilityLabel={label} onPress={onPress} style={[small ? styles.bannerAction : styles.fullAction, accept ? styles.acceptAction : styles.declineAction]}>
      <PhoneActionIcon/>
    </Pressable>
    {!small ? <Text style={[styles.actionLabel, accept ? styles.acceptLabel : styles.declineLabel]}>{label}</Text> : null}
  </View>;
}

export function IncomingCallExperience({call, presentation, onAccept, onDecline, onDismissBanner, onMinimize, onOpen, onClose, onMessage, onCallAgain, onSelectAudioOutput, onToggleHold, onToggleMute, onToggleVideo, busy = false}: Props) {
  useCallKeepAwake(call.type === 'video' && call.status === 'connected');
  const insets = useSafeAreaInsets();
  const translateX = useRef(new Animated.Value(0)).current;
  const result = call.status === 'rejected';
  const missed = call.status === 'missed';
  const [callOptionsOpen, setCallOptionsOpen] = useState(false);
  const [closeOptionsRequest, setCloseOptionsRequest] = useState(0);
  const ringing = call.status === 'calling';
  const notificationSettings = useIncomingCallNotificationSettings(call.callId);
  const callAlertsEnabled = Boolean(notificationSettings?.notifications && notificationSettings.callNotifications);
  const callVibration = notificationSettings?.callVibration;
  const shouldVibrate = callAlertsEnabled && notificationSettings?.vibrationEnabled && notificationSettings.callVibration !== 'Turned Off' && ringing && presentation !== 'dismissed';

  useEffect(() => {
    if (!shouldVibrate || !callVibration) { return; }
    vibrateNotification(callVibration);
    return () => {
      cancelNotificationVibration();
    };
  }, [shouldVibrate, callVibration]);

  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dx) > 8 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
    onPanResponderMove: (_event, gesture) => translateX.setValue(gesture.dx),
    onPanResponderRelease: (_event, gesture) => {
      if (Math.abs(gesture.dx) >= 72 || Math.abs(gesture.vx) >= 0.65) {
        Animated.timing(translateX, {toValue: gesture.dx < 0 ? -500 : 500, duration: 180, useNativeDriver: true}).start(() => {
          translateX.setValue(0);
          onDismissBanner();
        });
      } else {
        Animated.spring(translateX, {toValue: 0, useNativeDriver: true}).start();
      }
    },
    onPanResponderTerminate: () => Animated.spring(translateX, {toValue: 0, useNativeDriver: true}).start(),
  }), [onDismissBanner, translateX]);

  const accept = () => { onOpen(); onAccept(); };

  if (ringing && !callAlertsEnabled) { return null; }

  return <>
    <CallRingtone
      state={callAlertsEnabled && notificationSettings?.callRingtone && notificationSettings.soundEnabled ? incomingRingtoneState(call.status) : 'ENDED'}
      tone={notificationSettings?.notificationTone}
    />
    {presentation === 'banner' && !result && !missed ? <View pointerEvents="box-none" style={[styles.bannerLayer, {paddingTop: Math.max(insets.top, 10)}]}>
      <Animated.View accessibilityLabel={`Incoming ${call.type} call from ${call.callerName}`} style={[styles.banner, {transform: [{translateX}]}]} {...panResponder.panHandlers}>
        <Pressable accessibilityHint="Opens the full incoming call screen" onPress={onOpen} style={styles.bannerIdentity}>
          <CallerAvatar banner call={call}/>
          <View style={styles.bannerCopy}>
            <Text style={styles.bannerKicker}>Incoming {call.type === 'video' ? 'Video' : 'Audio'} Call</Text>
            <Text numberOfLines={1} style={styles.bannerName}>{call.callerName}</Text>
          </View>
        </Pressable>
        <CallAction label="Decline call" onPress={onDecline} disabled={busy} small/>
        <CallAction accept label="Accept call" onPress={accept} disabled={busy} small/>
      </Animated.View>
    </View> : null}

    <Modal animationType="fade" onRequestClose={() => { if (callOptionsOpen) setCloseOptionsRequest(value => value + 1); else if (result) onClose?.(); else onMinimize(); }} statusBarTranslucent visible={presentation === 'full' && !missed}>
      {call.status === 'connected' ? <ActiveIncomingCallScreen
        busy={busy}
        closeOptionsRequest={closeOptionsRequest}
        onOptionsVisibilityChange={setCallOptionsOpen}
        call={call}
        insets={insets}
        onEnd={onDecline}
        onMinimize={onMinimize}
        onOpenChat={onMessage}
        onSelectAudioOutput={onSelectAudioOutput}
        onToggleHold={onToggleHold}
        onToggleMute={onToggleMute}
        onToggleVideo={onToggleVideo}
      /> : <View accessibilityLabel={`Incoming ${call.type} call screen`} style={[styles.fullScreen, {paddingTop: Math.max(insets.top, 24), paddingBottom: Math.max(insets.bottom, 12)}]}>
        <View style={styles.topBar}>
          {result ? <Pressable accessibilityRole="button" accessibilityLabel="Close call result" onPress={onClose} style={styles.topButton}><Svg width={24} height={24} viewBox="0 0 24 24"><Path d="m5 5 14 14M19 5 5 19" stroke={themeInk('#111827')} strokeWidth={1.7}/></Svg></Pressable> : null}
        </View>
        <View style={styles.identity}>
          <Text numberOfLines={2} style={styles.fullName}>{call.callerName}</Text>
          <Text style={styles.fullSubtitle}>{call.status === 'rejected' ? 'Call Rejected' : call.status === 'missed' ? 'No Answer' : call.status === 'connecting' ? 'Connecting...' : `Incoming ${call.type === 'video' ? 'Video' : 'Audio'} Call`}</Text>
          <View style={styles.fullAvatarWrap}><CallerAvatar call={call}/></View>
        </View>
        <View style={styles.actionsRow}>
          {result ? <>
            <View style={styles.fullActionWrap}>
              <Pressable accessibilityRole="button" accessibilityLabel="Message" accessibilityState={{disabled: busy}} disabled={busy} onPress={onMessage} style={[styles.fullAction, styles.messageAction]}>
                <Svg width={30} height={30} viewBox="0 0 24 24"><Path d="M5 3h14a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3h-7l-6 4v-4H5a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3Z" fill={themeInk('#344256')}/><Path d="M7 8h10M7 12h7" stroke="white" strokeWidth={2} strokeLinecap="round"/></Svg>
              </Pressable><Text style={[styles.actionLabel, styles.messageLabel]}>Message</Text>
            </View>
            <CallAction accept label="Call Again" disabled={busy} onPress={() => onCallAgain?.()}/>
          </> : <><CallAction disabled={busy || call.status === 'connecting'} label="Decline" onPress={onDecline}/>
          {ringing ? <CallAction accept label="Accept" disabled={busy} onPress={onAccept}/> : <View style={styles.fullActionPlaceholder}/>}</>}
        </View>
      </View>}
    </Modal>
  </>;
}

const FONT_FAMILY = Platform.select({android: 'sans-serif', ios: 'System'});

const styles = createThemedStyles({
  bannerLayer: {position: 'absolute', zIndex: 100, elevation: 20, top: 0, left: 0, right: 0, paddingHorizontal: 20},
  banner: {height: 72, borderRadius: 13, paddingHorizontal: 10, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', shadowColor: '#111827', shadowOffset: {width: 0, height: 4}, shadowOpacity: 0.13, shadowRadius: 12, elevation: 8},
  bannerIdentity: {flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center'},
  bannerAvatar: {width: 46, height: 46, borderRadius: 9},
  bannerAvatarInitial: {fontSize: 16},
  avatarFallback: {backgroundColor: '#F0E7FF', alignItems: 'center', justifyContent: 'center'},
  avatarInitial: {color: '#7137DD', fontFamily: FONT_FAMILY, fontSize: 28, fontWeight: '800'},
  bannerCopy: {flex: 1, minWidth: 0, marginLeft: 10},
  bannerKicker: {color: '#6B7280', fontFamily: FONT_FAMILY, fontSize: 10},
  bannerName: {marginTop: 4, color: '#111827', fontFamily: FONT_FAMILY, fontSize: 12, fontWeight: '600'},
  bannerActionWrap: {marginLeft: 9},
  bannerAction: {width: 44, height: 44, borderRadius: 9, alignItems: 'center', justifyContent: 'center'},
  declineAction: {backgroundColor: '#E9252A'},
  acceptAction: {backgroundColor: '#10B981'},
  fullScreen: {flex: 1, backgroundColor: '#FFFFFF', justifyContent: 'space-between'},
  topBar: {height: 48, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  topButton: {width: 38, height: 38, borderRadius: 8, backgroundColor: '#F5F6F8', alignItems: 'center', justifyContent: 'center'},
  identity: {flex: 1, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 4},
  fullName: {textAlign: 'center', paddingHorizontal: 20, color: '#111827', fontFamily: FONT_FAMILY, fontSize: 16, fontWeight: '700'},
  fullSubtitle: {marginTop: 6, color: '#526176', fontFamily: FONT_FAMILY, fontSize: 10},
  fullAvatarWrap: {flex: 1, justifyContent: 'center', paddingBottom: 46},
  fullAvatar: {width: 84, height: 84, borderRadius: 15},
  actionsRow: {paddingHorizontal: 28, paddingBottom: 18, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between'},
  fullActionWrap: {width: 72, alignItems: 'center'},
  fullAction: {width: 60, height: 60, borderRadius: 11, alignItems: 'center', justifyContent: 'center', shadowColor: '#111827', shadowOffset: {width: 0, height: 3}, shadowOpacity: 0.12, shadowRadius: 5, elevation: 4},
  fullActionPlaceholder: {width: 72},
  actionLabel: {marginTop: 7, fontFamily: FONT_FAMILY, fontSize: 10},
  messageAction: {backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', elevation: 0, shadowOpacity: 0},
  messageLabel: {color: '#526176'},
  declineLabel: {color: '#E9252A'},
  acceptLabel: {color: '#10B981'},
});
