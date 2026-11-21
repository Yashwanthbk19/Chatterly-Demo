import {createThemedStyles} from '../theme/themedStyles';
import NetInfo from '@react-native-community/netinfo';
import {applyCallAudioRoute, EARPIECE_ROUTE, listCallAudioRoutes, SPEAKER_ROUTE, type CallAudioControls, type CallAudioRoute} from '../services/callAudioRoutes';
import {Camera, type CameraType} from 'expo-camera';
import {getRecordingPermissionsAsync, RecordingPresets, requestRecordingPermissionsAsync, useAudioRecorder} from 'expo-audio';
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {ActivityIndicator, Animated, AppState, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {useCallKeepAwake} from '../hooks/useCallKeepAwake';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {GroupCallIcon, type GroupCallIconName} from '../components/GroupCallIcons';
import {
  GroupCallAddPeoplePanel,
  GroupCallParticipantsPanel,
  GroupCallSettingsPanel,
  type AddableParticipant,
} from '../components/GroupCallPanels';
import {
  GroupCallAudioOutputSheet,
  GroupCallMicrophoneSheet,
  GroupCallMoreSheet,
  GroupCallParticipantSheet,
  GroupCallStatusSheet,
  GroupCallVideoEffectsSheet,
  type GroupCallNetwork,
} from '../components/GroupCallSheets';
import {GroupCallScreenShare} from '../components/GroupCallScreenShare';
import {appScreenSharingUnavailableMessage, supportsAppScreenSharing, type ScreenShareSource} from '../services/screenShareSource';
import {Snackbar} from '../components/Snackbar';
import {getGroupDetails, type GroupDetails, type GroupMemberRole} from '../services/groupApi';
import {activeGroupCallParticipants, getGroupCallDetails, type GroupCallDetails} from '../services/groupCallApi';
import {
  connectGroupCallPeer,
  dropGroupCallPeer,
  getGroupCallLocalStreamUrl,
  getGroupCallScreenStreamUrl,
  handleGroupCallSignal,
  setGroupCallCameraOn,
  setGroupCallMuted,
  setGroupCallRemoteAudioEnabled,
  setGroupCallSpeaker,
  isGroupCallScreenCapturing,
  requestGroupCallParticipantUnmute,
  confirmGroupCallParticipantUnmuted,
  startGroupCallScreenCapture,
  stopGroupCallScreenCapture,
  startGroupCallMedia,
  stopGroupCallMedia,
  subscribeToGroupCallControls,
  subscribeToGroupCallStreams,
  type GroupCallRemoteStream,
} from '../services/groupCallMedia';
import {
  addGroupCallParticipant,
  endGroupCall,
  keepGroupCallRoomJoined,
  leaveGroupCall,
  muteGroupCallParticipant,
  pinGroupCallParticipant,
  removeGroupCallParticipantOverSocket,
  subscribeToGroupCall,
  unmuteSelfInGroupCall,
  unpinGroupCallParticipant,
} from '../services/groupCallRealtime';
import {
  DEFAULT_GROUP_CALL_SETTINGS,
  captureVideoHeight,
  gridSizeLimit,
  loadGroupCallSettings,
  saveGroupCallSettings,
  type GroupCallSettings,
  type GroupCallVideoEffect,
} from '../services/groupCallSettings';
import {canLoadWebRTC} from '../services/nativeWebRTC';
import {getSession} from '../services/sessionStore';
import {subscribeToGroupFileShares} from '../services/chatRealtime';
import {
  GROUP_CALL_PARTICIPANT_STATUS,
  addGroupCallParticipants,
  canManageGroupCall,
  connectedParticipants,
  createGroupCallState,
  findParticipant,
  formatGroupCallDuration,
  groupCallElapsedSeconds,
  groupCallGridColumns,
  isConnectedParticipant,
  offCallParticipants,
  participantFromGroupMember,
  pinParticipant,
  setActiveSpeaker,
  setMeetingLocked,
  setParticipantCameraOn,
  setParticipantMuted,
  setParticipantSharingScreen,
  setParticipantStatus,
  spotlightParticipantId,
  type GroupCallParticipant,
  type GroupCallState,
} from '../utils/groupCallModel';
import type {GroupCallOutcome, GroupCallSession} from '../types/groupCall';

// Sprint 9 Story 2 - Group Conferencing.
//
// The conference surface: an auto-adjusting participant grid with active
// speaker and pin highlighting, the call control bar, the Participants panel
// with the host's mute/remove controls, Add People, the More sheet and the
// in-call Settings screen.
//
// Presentation state lives in the pure model (utils/groupCallModel), the live
// state comes from the backend's group-call socket contract
// (services/groupCallRealtime), the roster from the group REST routes, and the
// media plane from services/groupCallMedia. Starting and joining are owned by
// the caller, so this screen always opens on a call this device is already in.

const FONT_FAMILY = Platform.select({android: 'sans-serif', ios: 'System'});
const PURPLE = '#7442E8';
const REACTION_LIFETIME_MS = 2600;
// Height of the Speaker View filmstrip under the spotlighted tile.
const STRIP_HEIGHT = 84;
/** The grid area's padding; tiles are sized from the space inside it. */
const GRID_PADDING_X = 14;
const GRID_PADDING_TOP = 4;
const SCREEN_SHARE_INFO_HEIGHT = 40;
// Socket events stay primary. This small reconciliation loop covers older app
// versions and sockets that reconnected without regaining the server's
// transient group-call room.
const CALL_STATE_RECONCILE_MS = 2000;

type GroupCallServerSnapshot = {
  mutedByUser: Map<string, boolean>;
  screenSharingUserId: string;
};

const serverSnapshotOf = (details: GroupCallDetails | null): GroupCallServerSnapshot | null => {
  if (!details) { return null; }
  return {
    mutedByUser: new Map(activeGroupCallParticipants(details).map(participant => [participant.userId, participant.isMuted])),
    screenSharingUserId: details.isScreenSharing ? details.screenSharingUserId : '',
  };
};

type Props = {
  onClose: (outcome: GroupCallOutcome) => void;
  onMinimize: () => void;
  session: GroupCallSession;
  visible: boolean;
};

type Overlay = '' | 'more' | 'audio' | 'microphone' | 'status' | 'effects';
type Panel = '' | 'participants' | 'add' | 'settings';

const errorText = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

const initialsOf = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || '?';

/**
 * `RTCView` only exists in a development build. Requiring it lazily keeps the
 * conference usable in Expo Go, where the grid falls back to avatar tiles.
 */
let remoteVideoComponent: React.ComponentType<any> | null | undefined;
function loadRemoteVideo(): React.ComponentType<any> | null {
  if (remoteVideoComponent !== undefined) { return remoteVideoComponent; }
  if (!canLoadWebRTC()) {
    remoteVideoComponent = null;
    return remoteVideoComponent;
  }
  try {
    const module = require('react-native-webrtc') as {RTCView?: React.ComponentType<any>};
    remoteVideoComponent = module.RTCView || null;
  } catch {
    remoteVideoComponent = null;
  }
  return remoteVideoComponent;
}

function ControlButton({accessibilityLabel, active = false, crossed = false, danger = false, disabled = false, label, name, onPress}: {accessibilityLabel?: string; active?: boolean; crossed?: boolean; danger?: boolean; disabled?: boolean; label: string; name: GroupCallIconName; onPress: () => void}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel || label}
      accessibilityRole="button"
      accessibilityState={{disabled, selected: active}}
      disabled={disabled}
      onPress={onPress}
      style={styles.control}>
      <View style={[styles.controlButton, active && styles.controlButtonActive, danger && styles.controlButtonDanger, disabled && styles.disabled]}>
        <GroupCallIcon color={danger ? '#FFFFFF' : active ? PURPLE : '#334155'} crossed={crossed} name={name} size={22} />
      </View>
      <Text numberOfLines={1} style={[styles.controlLabel, danger && styles.controlLabelDanger]}>{label}</Text>
    </Pressable>
  );
}

/**
 * The design's pastel avatar tints, picked from the person's id so a tile keeps
 * its colour for the whole call.
 */
const AVATAR_TINTS: ReadonlyArray<readonly [string, string]> = [
  ['#F1DDF7', '#9B3FC0'],
  ['#F3E6C9', '#946512'],
  ['#D9E4F7', '#3557A6'],
  ['#DCEFD9', '#3E7F35'],
  ['#F8DEDE', '#B23B3B'],
  ['#DDEFF2', '#2E6E7C'],
];

function tintFor(id: string): readonly [string, string] {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) { hash = (hash * 31 + id.charCodeAt(index)) >>> 0; }
  return AVATAR_TINTS[hash % AVATAR_TINTS.length];
}

function ParticipantTile({cameraFacing, contentOnly = false, floating = false, height, isLocal, mirror, onPress, participant, showName, showNetwork, spotlighted, streamUrl, videoCall, width}: {
  cameraFacing: CameraType;
  /** Shared-screen stages keep participant chrome outside the shared content. */
  contentOnly?: boolean;
  /** The design floats your own tile over the grid's corner. */
  floating?: boolean;
  height: number;
  isLocal: boolean;
  mirror: boolean;
  onPress: () => void;
  participant: GroupCallParticipant;
  showName: boolean;
  showNetwork: boolean;
  spotlighted: boolean;
  streamUrl: string;
  videoCall: boolean;
  width: number;
}) {
  const RemoteVideo = streamUrl ? loadRemoteVideo() : null;
  const cameraLive = videoCall && participant.isCameraOn;
  const showVideo = Boolean(RemoteVideo && streamUrl && (cameraLive || participant.isSharingScreen));
  const [tint, ink] = tintFor(participant.id);
  const avatarSize = Math.round(Math.max(34, Math.min(width, height) * 0.4));
  const networkColor = participant.connection === 'Moderate' ? '#F59E0B' : '#EF4444';
  const label = participant.isCurrentUser ? `${participant.name} (You)` : participant.name;
  void cameraFacing;

  return (
    <Pressable
      accessibilityLabel={`${participant.name}${participant.isCurrentUser ? ' (You)' : ''}${participant.isSharingScreen ? ', sharing screen' : ''}${participant.isMuted ? ', muted' : ''}`}
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.tile, {width, height}, !showVideo && styles.tileIdle, spotlighted && styles.tileSpotlighted, floating && styles.tileFloating]}>
      {showVideo && RemoteVideo ? (
        <RemoteVideo
          key={participant.isSharingScreen ? 'screen' : 'camera'}
          mirror={participant.isSharingScreen ? false : isLocal && mirror}
          objectFit={participant.isSharingScreen ? 'contain' : 'cover'}
          streamURL={streamUrl}
          style={participant.isSharingScreen ? styles.sharedContentVideo : StyleSheet.absoluteFill}
          zOrder={floating ? 1 : 0}
        />
      ) : participant.profilePic ? (
        <Image resizeMode="cover" source={{uri: participant.profilePic}} style={{width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2}} />
      ) : (
        <View style={[styles.tileAvatar, {width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2, backgroundColor: tint}]}>
          <Text style={[styles.tileInitials, {color: ink, fontSize: Math.round(avatarSize * 0.3)}]}>{initialsOf(participant.name)}</Text>
        </View>
      )}

      {!contentOnly && participant.isSharingScreen ? (
        <View accessibilityLabel={`${participant.name} is sharing their screen`} style={styles.tileSharing}>
          <GroupCallIcon color="#FFFFFF" name="screen" size={11} />
        </View>
      ) : null}

      {/* The design marks every tile's microphone, on or off. */}
      {!contentOnly ? (
        <View accessibilityLabel={participant.isMuted ? `${participant.name} is muted` : `${participant.name}'s microphone is on`} style={styles.tileMic}>
          <GroupCallIcon color="#FFFFFF" crossed={participant.isMuted} name="microphone" size={11} />
        </View>
      ) : null}

      {!contentOnly ? <View pointerEvents="none" style={styles.tileFooter}>
        {showName ? (
          <View style={styles.tileNamePill}>
            <Text numberOfLines={1} style={styles.tileName}>{label}</Text>
          </View>
        ) : <View />}
        {showNetwork && participant.connection !== 'Good' ? (
          <View accessibilityLabel={`${participant.connection} network`} style={styles.tileNetwork}>
            <GroupCallIcon color={networkColor} name="signal" size={11} />
          </View>
        ) : null}
      </View> : null}
    </Pressable>
  );
}

function EndCallDialog({canEndForEveryone, onCancel, onEndForEveryone, onLeave, visible}: {canEndForEveryone: boolean; onCancel: () => void; onEndForEveryone: () => void; onLeave: () => void; visible: boolean}) {
  return (
    <Modal animationType="fade" onRequestClose={onCancel} statusBarTranslucent transparent visible={visible}>
      <View style={styles.dialogBackdrop}>
        <Pressable accessibilityLabel="Dismiss end call options" onPress={onCancel} style={StyleSheet.absoluteFill} />
        <View accessibilityLabel="End Group Call" accessibilityRole="alert" style={styles.dialog}>
          <Text style={styles.dialogTitle}>Leave this call?</Text>
          <Text style={styles.dialogCopy}>
            {canEndForEveryone
              ? 'Leaving keeps the conference running for everyone else. Ending it disconnects every participant.'
              : 'You will stop receiving audio and video from this conference.'}
          </Text>
          <Pressable accessibilityLabel="Leave call" onPress={onLeave} style={styles.dialogPrimary}>
            <Text style={styles.dialogPrimaryText}>Leave Call</Text>
          </Pressable>
          {canEndForEveryone ? (
            <Pressable accessibilityLabel="End call for everyone" onPress={onEndForEveryone} style={styles.dialogDanger}>
              <Text style={styles.dialogDangerText}>End for Everyone</Text>
            </Pressable>
          ) : null}
          <Pressable accessibilityLabel="Cancel leaving the call" onPress={onCancel} style={styles.dialogCancel}>
            <Text style={styles.dialogCancelText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function FloatingReaction({emoji, onDone}: {emoji: string; onDone: () => void}) {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(progress, {toValue: 1, duration: REACTION_LIFETIME_MS, useNativeDriver: true}).start(({finished}) => {
      if (finished) { onDone(); }
    });
  }, [onDone, progress]);
  return (
    <Animated.Text
      accessibilityLabel={`Reaction ${emoji}`}
      style={[styles.floatingReaction, {
        opacity: progress.interpolate({inputRange: [0, .7, 1], outputRange: [1, 1, 0]}),
        transform: [{translateY: progress.interpolate({inputRange: [0, 1], outputRange: [0, -120]})}],
      }]}>
      {emoji}
    </Animated.Text>
  );
}

export function GroupCallScreen({onClose, onMinimize, session, visible}: Props): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const currentUserId = String(getSession()?.user?.id || '');

  const [call, setCall] = useState<GroupCallState>(() => createGroupCallState({
    callId: session.groupCallId,
    groupId: session.groupId,
    groupName: session.groupName,
    hostId: session.startedBy,
    startedAt: session.startedAt,
  }));
  const [group, setGroup] = useState<GroupDetails | null>(null);
  const [settings, setSettings] = useState<GroupCallSettings>(DEFAULT_GROUP_CALL_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [callEventNotice, setCallEventNotice] = useState<{id: number; text: string} | null>(null);
  const [ownFileNotices, setOwnFileNotices] = useState<Array<{id: string; text: string}>>([]);
  const [appState, setAppState] = useState(AppState.currentState);
  const callEventSequence = useRef(0);
  const [overlay, setOverlay] = useState<Overlay>('');
  const [panel, setPanel] = useState<Panel>('');
  const [openPicker, setOpenPicker] = useState<keyof GroupCallSettings | ''>('');
  const [participantSheet, setParticipantSheet] = useState<GroupCallParticipant | null>(null);
  const [endDialogOpen, setEndDialogOpen] = useState(false);
  const [participantSearch, setParticipantSearch] = useState('');
  const [addSearch, setAddSearch] = useState('');
  const [addSelection, setAddSelection] = useState<Set<string>>(new Set());
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [busyParticipantId, setBusyParticipantId] = useState('');
  const [muted, setMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(session.type === 'video');
  const [speakerOn, setSpeakerOn] = useState(true);
  const [cameraFacing, setCameraFacing] = useState<CameraType>('front');
  const [shareStep, setShareStep] = useState<'' | 'choose' | 'confirm'>('');
  const [shareSource, setShareSource] = useState<ScreenShareSource>('screen');
  const [shareBusy, setShareBusy] = useState(false);
  const shareBusyRef = useRef(false);
  const shareAfterDismiss = useRef(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [network, setNetwork] = useState<GroupCallNetwork>('Stable');
  const [remoteStreams, setRemoteStreams] = useState<GroupCallRemoteStream[]>([]);
  const [localStreamUrl, setLocalStreamUrl] = useState('');
  const [localScreenStreamUrl, setLocalScreenStreamUrl] = useState('');
  const [reactions, setReactions] = useState<Array<{id: string; emoji: string}>>([]);
  const [gridArea, setGridArea] = useState({width: 0, height: 0});
  const [sharedViewport, setSharedViewport] = useState({width: 0, height: 0});
  // Audio Output lists the hardware actually connected (callAudioRoutes);
  // this recorder handle only reads and selects devices, it never records.
  const audioDevices = useAudioRecorder(RecordingPresets.LOW_QUALITY);
  const [audioRoutes, setAudioRoutes] = useState<CallAudioRoute[]>(() => listCallAudioRoutes(null));
  const [audioRouteId, setAudioRouteId] = useState(SPEAKER_ROUTE.id);

  const videoCall = session.type === 'video';
  useCallKeepAwake(videoCall);
  const closedRef = useRef(false);
  const callRef = useRef(call);
  const mutedRef = useRef(muted);
  const cameraOnRef = useRef(cameraOn);
  const settingsRef = useRef(settings);
  const groupRef = useRef(group);
  const serverCallStateRef = useRef<GroupCallServerSnapshot | null>(null);
  // Bumped on every live mute change. A reconcile read that started before one
  // is discarded, so a stale call record cannot flip a fresh mute or unmute.
  const muteSyncGenerationRef = useRef(0);
  callRef.current = call;
  mutedRef.current = muted;
  cameraOnRef.current = cameraOn;
  settingsRef.current = settings;
  groupRef.current = group;

  const showCallEvent = useCallback((text: string) => {
    callEventSequence.current += 1;
    setCallEventNotice({id: callEventSequence.current, text});
  }, []);

  const myRole: GroupMemberRole | undefined = useMemo(
    () => group?.participants.find(member => member.userId === currentUserId)?.role,
    [currentUserId, group],
  );
  const canManage = canManageGroupCall(myRole);

  const finish = useCallback((outcome: GroupCallOutcome) => {
    if (closedRef.current) { return; }
    closedRef.current = true;
    stopGroupCallMedia(session.groupCallId).catch(() => undefined);
    onClose(outcome);
  }, [onClose, session.groupCallId]);

  // --- Roster + server-side call state ---------------------------------------

  useEffect(() => {
    let active = true;
    setLoading(true);

    const hydrate = async () => {
      // The roster is what names the tiles; the call record is what says who is
      // already on them. A joiner only ever hears about *changes* over the
      // socket, so without this read their grid would start empty.
      const [details, callDetails] = await Promise.all([
        getGroupDetails(session.groupId).catch(() => null),
        getGroupCallDetails(session.groupCallId).catch(() => null),
      ]);
      if (!active) { return; }

      if (details) { setGroup(details); }

      serverCallStateRef.current = serverSnapshotOf(callDetails);

      const liveIds = new Set(activeGroupCallParticipants(callDetails).map(participant => participant.userId));
      liveIds.add(currentUserId);
      const mutedIds = new Set(activeGroupCallParticipants(callDetails).filter(participant => participant.isMuted).map(participant => participant.userId));
      const cameraOffIds = new Set(activeGroupCallParticipants(callDetails).filter(participant => !participant.videoEnabled).map(participant => participant.userId));
      const hostId = callDetails?.startedBy || session.startedBy;

      const members = details?.participants || [];
      setCall(createGroupCallState({
        callId: session.groupCallId,
        groupId: session.groupId,
        groupName: callDetails?.groupName || details?.name || session.groupName,
        hostId,
        isLocked: callDetails?.status === 'locked',
        startedAt: callDetails?.startedAt || session.startedAt,
        participants: members.map(member => ({
          ...participantFromGroupMember(member, {
            currentUserId,
            hostId,
            status: liveIds.has(member.userId)
              ? GROUP_CALL_PARTICIPANT_STATUS.CONNECTED
              : GROUP_CALL_PARTICIPANT_STATUS.CALLING,
          }),
          // The server has no record of this device's own toggles, so the
          // local state wins for self and the call record for everyone else.
          isMuted: member.userId === currentUserId ? mutedRef.current : mutedIds.has(member.userId),
          isCameraOn: member.userId === currentUserId
            ? cameraOnRef.current
            : videoCall && !cameraOffIds.has(member.userId),
          isSharingScreen: Boolean(callDetails?.isScreenSharing) && callDetails?.screenSharingUserId === member.userId,
        })),
      }));

      if (callDetails?.isScreenSharing && callDetails.screenSharingUserId === currentUserId) {
        const capturing = isGroupCallScreenCapturing();
        setIsScreenSharing(capturing);
        setLocalScreenStreamUrl(capturing ? getGroupCallScreenStreamUrl() : '');
      }

      // Open a media path to everyone already on the call. The peer with the
      // higher id offers, so calling this for every peer is glare-free.
      liveIds.forEach(userId => {
        if (userId !== currentUserId) { connectGroupCallPeer(userId).catch(() => undefined); }
      });
    };

    hydrate()
      .catch(error => { if (active) { setNotice(errorText(error, 'Unable to load this group call.')); } })
      .finally(() => { if (active) { setLoading(false); } });

    return () => { active = false; };
  }, [currentUserId, session.groupCallId, session.groupId, session.groupName, session.startedAt, session.startedBy, videoCall]);

  // --- Device preferences -----------------------------------------------------

  useEffect(() => {
    let active = true;
    loadGroupCallSettings().then(stored => {
      if (!active) { return; }
      setSettings(stored);
      setSpeakerOn(stored.audioOutput === 'Speaker');
      setAudioRouteId(stored.audioOutput === 'Speaker' ? SPEAKER_ROUTE.id : EARPIECE_ROUTE.id);
    }).finally(() => { if (active) { setSettingsLoaded(true); } });
    return () => { active = false; };
  }, []);

  const updateSettings = useCallback(<TKey extends keyof GroupCallSettings>(key: TKey, value: GroupCallSettings[TKey]) => {
    setSettings(current => {
      const next = {...current, [key]: value};
      saveGroupCallSettings(next).catch(() => undefined);
      return next;
    });
  }, []);

  // --- Media ------------------------------------------------------------------

  // Capture starts once the stored preferences are in, because echo
  // cancellation, noise suppression and the video height are getUserMedia
  // constraints that cannot be changed on an already-open stream.
  useEffect(() => {
    if (!settingsLoaded) { return; }
    let active = true;

    const prepare = async () => {
      // A conference can be answered from any screen, so the permission gate
      // lives here rather than on the button that started it.
      const existingMicrophone = await getRecordingPermissionsAsync();
      const microphone = existingMicrophone.granted ? existingMicrophone : await requestRecordingPermissionsAsync();
      if (!active) { return; }
      if (!microphone.granted) { setNotice('Allow microphone access so the group can hear you.'); }

      let cameraGranted = false;
      if (session.type === 'video') {
        const existingCamera = await Camera.getCameraPermissionsAsync();
        const camera = existingCamera.granted ? existingCamera : await Camera.requestCameraPermissionsAsync();
        if (!active) { return; }
        cameraGranted = camera.granted;
        if (!cameraGranted) {
          setCameraOn(false);
          setNotice('Allow camera access to share your video.');
        }
      }

      const started = await startGroupCallMedia({
        groupCallId: session.groupCallId,
        selfId: currentUserId,
        type: session.type,
        groupName: callRef.current.groupName || session.groupName,
        muted: false,
        cameraOn: cameraGranted,
        speaker: settingsRef.current.audioOutput === 'Speaker',
        capture: {
          echoCancellation: settingsRef.current.echoCancellation,
          noiseSuppression: settingsRef.current.noiseSuppression,
          videoHeight: captureVideoHeight(settingsRef.current),
        },
      });
      if (active && started) {
        setLocalStreamUrl(getGroupCallLocalStreamUrl());
        connectedParticipants(callRef.current).forEach(participant => {
          connectGroupCallPeer(participant.id).catch(() => undefined);
        });
      }
      if (active && !started) {
        setNotice('Live audio and video need a development build, so this conference runs without them.');
      }
    };

    prepare().catch(error => {
      if (active) { setNotice(errorText(error, 'Unable to start call audio.')); }
    });

    return () => { active = false; };
  }, [currentUserId, session.groupCallId, session.groupName, session.type, settingsLoaded]);

  // Releasing the microphone, camera and every peer connection is tied to the
  // screen's lifetime, not only to the End button, so navigating away or an
  // unexpected unmount can never leave the devices held.
  useEffect(() => () => { stopGroupCallMedia(session.groupCallId).catch(() => undefined); }, [session.groupCallId]);

  useEffect(() => subscribeToGroupCallStreams(setRemoteStreams), []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', setAppState);
    return () => subscription.remove();
  }, []);

  useEffect(() => subscribeToGroupFileShares(session.groupId, message => {
    // Ordinary chat notifications keep their existing behavior. This in-call
    // banner is only needed while presentation content occupies the stage.
    if (!callRef.current.participants.some(participant => participant.isSharingScreen)) return;
    if (message.isOwn) {
      if (!findParticipant(callRef.current, currentUserId)?.isSharingScreen) return;
      // Sending a document usually requires minimizing the call. Keep each
      // successful upload until its banner can actually be seen on return.
      setOwnFileNotices(current => current.some(item => item.id === message.id) ? current : [
        ...current, {id: message.id, text: `You shared ${message.fileName || 'a file'}.`},
      ]);
      return;
    }
    const sender = findParticipant(callRef.current, message.senderId || '');
    const senderName = sender?.name || message.senderName || 'A participant';
    showCallEvent(`${senderName} shared ${message.fileName || 'a file'}.`);
  }), [currentUserId, session.groupId, showCallEvent]);

  const ownFileNotice = ownFileNotices[0];
  const fileNoticeVisible = visible && appState === 'active' && !panel && !overlay && !participantSheet && !endDialogOpen && !shareStep;
  const bannerNotice = ownFileNotice || callEventNotice;

  useEffect(() => {
    if (!ownFileNotice || !fileNoticeVisible) return;
    const timer = setTimeout(() => {
      setOwnFileNotices(current => current.filter(item => item.id !== ownFileNotice.id));
    }, 3500);
    return () => clearTimeout(timer);
  }, [fileNoticeVisible, ownFileNotice]);

  useEffect(() => {
    if (!callEventNotice) { return; }
    const timer = setTimeout(() => setCallEventNotice(current => current?.id === callEventNotice.id ? null : current), 3500);
    return () => clearTimeout(timer);
  }, [callEventNotice]);

  // Older releases do not publish every participant action to the room, and
  // the backend currently sends a host mute only to the affected user's
  // personal socket. Reconcile the persisted call record so every updated
  // participant still sees mute/unmute and screen-share activity. The socket
  // handlers below also update this snapshot, preventing duplicate banners.
  useEffect(() => {
    if (!visible || loading) { return; }
    let active = true;
    let inFlight = false;

    const reconcile = async () => {
      if (inFlight) { return; }
      inFlight = true;
      const generation = muteSyncGenerationRef.current;
      try {
        const details = await getGroupCallDetails(session.groupCallId);
        if (!active || generation !== muteSyncGenerationRef.current) { return; }

        const previous = serverCallStateRef.current;
        const next = serverSnapshotOf(details);
        if (!next) { return; }
        serverCallStateRef.current = next;

        const current = callRef.current;
        let reconciled = current;
        const recordsById = new Map(activeGroupCallParticipants(details).map(participant => [participant.userId, participant]));

        next.mutedByUser.forEach((isMutedOnServer, userId) => {
          if (userId === currentUserId) {
            // This device's ordinary self-mute is intentionally local because
            // the backend has no self-mute event. Only a host mute this device
            // missed (for example across a socket reconnect) is applied here.
            if (previous?.mutedByUser.get(userId) === false && isMutedOnServer && !mutedRef.current) {
              mutedRef.current = true;
              setMuted(true);
              setGroupCallMuted(true).catch(() => undefined);
              reconciled = setParticipantMuted(reconciled, userId, true);
              showCallEvent('A group admin muted your microphone.');
            }
            return;
          }
          const participant = findParticipant(current, userId);
          if (!participant || participant.isMuted === isMutedOnServer) { return; }

          reconciled = setParticipantMuted(reconciled, userId, isMutedOnServer);
          const priorMute = previous?.mutedByUser.get(userId);
          if (priorMute !== undefined && priorMute !== isMutedOnServer) {
            const name = participant.name || recordsById.get(userId)?.name || 'A participant';
            showCallEvent(`${name} was ${isMutedOnServer ? 'muted' : 'unmuted'}.`);
          }
        });

        const priorPresenterId = previous?.screenSharingUserId || '';
        const nextPresenterId = next.screenSharingUserId;
        if (priorPresenterId !== nextPresenterId) {
          if (priorPresenterId) {
            const previousPresenter = findParticipant(current, priorPresenterId);
            reconciled = setParticipantSharingScreen(reconciled, priorPresenterId, false);
            if (previous) {
              showCallEvent(priorPresenterId === currentUserId
                ? 'You stopped sharing your screen.'
                : `${previousPresenter?.name || 'A participant'} stopped sharing their screen.`);
            }
          }
          if (nextPresenterId) {
            const nextPresenter = findParticipant(current, nextPresenterId);
            reconciled = setParticipantSharingScreen(reconciled, nextPresenterId, true);
            if (previous) {
              showCallEvent(nextPresenterId === currentUserId
                ? 'You started sharing your screen.'
                : `${nextPresenter?.name || recordsById.get(nextPresenterId)?.name || 'A participant'} started sharing their screen.`);
            }
          }
        }

        if (reconciled !== current) { setCall(reconciled); }
      } catch {
        // Live socket state remains authoritative while a refresh is
        // temporarily unavailable; a background check should not show errors.
      } finally {
        inFlight = false;
      }
    };

    const timer = setInterval(() => { reconcile().catch(() => undefined); }, CALL_STATE_RECONCILE_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [currentUserId, loading, session.groupCallId, showCallEvent, visible]);

  useEffect(() => subscribeToGroupCallControls(message => {
    if (message.groupCallId !== session.groupCallId || message.type !== 'unmute-request') { return; }

    const roleOf = (details: GroupDetails | null) => details?.participants.find(member => member.userId === message.fromUserId)?.role;
    const senderIsAdmin = async () => {
      if (canManageGroupCall(roleOf(groupRef.current))) { return true; }
      // The roster is read once when the call opens, so a member promoted
      // mid-call (or a roster that failed to load) is checked again first.
      const latest = await getGroupDetails(session.groupId).catch(() => null);
      if (latest) { setGroup(latest); }
      return canManageGroupCall(roleOf(latest));
    };

    senderIsAdmin().then(allowed => {
      if (!allowed) {
        message.respond({success: false, message: 'Only a group admin can unmute another participant.'});
        return;
      }

      const wasMuted = mutedRef.current;
      muteSyncGenerationRef.current += 1;
      mutedRef.current = false;
      setMuted(false);
      setCall(current => setParticipantMuted(current, currentUserId, false));
      setGroupCallMuted(false).catch(() => undefined);
      // Always clear the server's flag, even when this device already shows the
      // microphone on: a host mute missed across a reconnect leaves the call
      // record muted, and the admin would otherwise see the unmute snap back.
      unmuteSelfInGroupCall(session.groupCallId).then(ack => {
        if (!ack.success) { throw new Error(ack.message); }
        message.respond({success: true});
      }).catch(error => {
        const failure = errorText(error, 'Unable to restore your microphone.');
        if (wasMuted) {
          muteSyncGenerationRef.current += 1;
          mutedRef.current = true;
          setMuted(true);
          setCall(current => setParticipantMuted(current, currentUserId, true));
          setGroupCallMuted(true).catch(() => undefined);
        }
        setNotice(failure);
        message.respond({success: false, message: failure});
      });
    }).catch(() => undefined);
  }), [currentUserId, session.groupCallId, session.groupId]);

  const streamByUser = useMemo(() => {
    const map = new Map<string, string>();
    remoteStreams.forEach(stream => map.set(stream.userId, stream.url));
    return map;
  }, [remoteStreams]);

  // --- Live call events -------------------------------------------------------

  useEffect(() => keepGroupCallRoomJoined(session.groupCallId), [session.groupCallId]);

  useEffect(() => subscribeToGroupCall(session.groupCallId, {
    onUserJoined: userId => {
      if (userId !== currentUserId) {
        const participant = findParticipant(callRef.current, userId);
        showCallEvent(`${participant?.name || 'A participant'} joined the call.`);
      }
      setCall(current => setParticipantStatus(current, userId, GROUP_CALL_PARTICIPANT_STATUS.CONNECTED));
      if (userId !== currentUserId) { connectGroupCallPeer(userId).catch(() => undefined); }
    },
    onUserLeft: userId => {
      if (userId === currentUserId) { return; }
      const participant = findParticipant(callRef.current, userId);
      showCallEvent(`${participant?.name || 'A participant'} left the call.`);
      dropGroupCallPeer(userId);
      setCall(current => setParticipantStatus(current, userId, GROUP_CALL_PARTICIPANT_STATUS.LEFT));
    },
    onUserRemoved: userId => {
      if (userId === currentUserId) {
        finish({durationSeconds: groupCallElapsedSeconds(callRef.current), endedForEveryone: false, reason: 'You were removed from the call.'});
        return;
      }
      dropGroupCallPeer(userId);
      setCall(current => setParticipantStatus(current, userId, GROUP_CALL_PARTICIPANT_STATUS.REMOVED));
    },
    onParticipantAdded: userId => {
      setCall(current => findParticipant(current, userId)
        ? setParticipantStatus(current, userId, GROUP_CALL_PARTICIPANT_STATUS.CALLING)
        : addGroupCallParticipants(current, {id: userId, name: 'Group member'}));
    },
    onEnded: payload => {
      finish({
        durationSeconds: payload.duration ?? groupCallElapsedSeconds(callRef.current),
        endedForEveryone: true,
        reason: payload.reason,
      });
    },
    onLocked: locked => setCall(current => setMeetingLocked(current, locked)),
    onMutedByHost: () => {
      const snapshot = serverCallStateRef.current;
      if (snapshot) { snapshot.mutedByUser.set(currentUserId, true); }
      muteSyncGenerationRef.current += 1;
      mutedRef.current = true;
      setMuted(true);
      setGroupCallMuted(true).catch(() => undefined);
      setCall(current => setParticipantMuted(current, currentUserId, true));
      showCallEvent('A group admin muted your microphone.');
    },
    onUserUnmuted: userId => {
      const snapshot = serverCallStateRef.current;
      if (snapshot) { snapshot.mutedByUser.set(userId, false); }
      muteSyncGenerationRef.current += 1;
      confirmGroupCallParticipantUnmuted(userId);
      const participant = findParticipant(callRef.current, userId);
      setCall(current => setParticipantMuted(current, userId, false));
      showCallEvent(userId === currentUserId ? 'Your microphone was unmuted.' : `${participant?.name || 'A participant'} was unmuted.`);
    },
    onActiveSpeaker: userId => setCall(current => setActiveSpeaker(current, userId)),
    onParticipantPinned: userId => setCall(current => (current.pinnedId === userId ? current : {...current, pinnedId: userId})),
    onParticipantUnpinned: userId => setCall(current => (current.pinnedId === userId ? {...current, pinnedId: ''} : current)),
    onScreenShareStarted: userId => {
      const snapshot = serverCallStateRef.current;
      if (snapshot) { snapshot.screenSharingUserId = userId; }
      const participant = findParticipant(callRef.current, userId);
      setCall(current => setParticipantSharingScreen(current, userId, true));
      showCallEvent(userId === currentUserId ? 'You started sharing your screen.' : `${participant?.name || 'A participant'} started sharing their screen.`);
      if (userId === currentUserId) {
        const capturing = isGroupCallScreenCapturing();
        setIsScreenSharing(capturing);
        setLocalScreenStreamUrl(capturing ? getGroupCallScreenStreamUrl() : '');
      }
    },
    onScreenShareStopped: userId => {
      const snapshot = serverCallStateRef.current;
      if (snapshot?.screenSharingUserId === userId) { snapshot.screenSharingUserId = ''; }
      const participant = findParticipant(callRef.current, userId);
      setCall(current => setParticipantSharingScreen(current, userId, false));
      showCallEvent(userId === currentUserId ? 'You stopped sharing your screen.' : `${participant?.name || 'A participant'} stopped sharing their screen.`);
      if (userId === currentUserId) {
        setIsScreenSharing(false);
        setLocalScreenStreamUrl('');
        if (isGroupCallScreenCapturing()) { stopGroupCallScreenCapture().catch(() => undefined); }
      }
    },
    onOffer: payload => { handleGroupCallSignal('offer', payload).catch(() => undefined); },
    onAnswer: payload => { handleGroupCallSignal('answer', payload).catch(() => undefined); },
    onIceCandidate: payload => { handleGroupCallSignal('ice', payload).catch(() => undefined); },
  }), [currentUserId, finish, session.groupCallId, showCallEvent]);

  // --- Timer and network -------------------------------------------------------

  useEffect(() => {
    const tick = () => setElapsed(groupCallElapsedSeconds(callRef.current));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [call.startedAt]);

  useEffect(() => NetInfo.addEventListener(state => {
    if (state.isConnected === false || state.isInternetReachable === false) { setNetwork('Offline'); return; }
    const generation = String(state.details && 'cellularGeneration' in state.details ? state.details.cellularGeneration || '' : '');
    setNetwork(generation === '2g' || generation === '3g' ? 'Unstable' : 'Stable');
  }), []);

  // --- Derived ------------------------------------------------------------------

  const connected = useMemo(() => connectedParticipants(call), [call]);
  // Grid Size caps how many tiles a page shows; the Participants panel always
  // lists everyone who is actually on the call.
  const tiles = useMemo(() => connected.slice(0, gridSizeLimit(settings)), [connected, settings]);
  const offCall = useMemo(() => offCallParticipants(call), [call]);
  const spotlightId = useMemo(() => (settings.focusOnSpeaker ? spotlightParticipantId(call) : call.pinnedId), [call, settings.focusOnSpeaker]);

  // Speaker View puts the spotlighted tile on its own and files everyone else
  // into a strip beneath it; Grid View lays every tile out equally.
  const presenter = connected.find(participant => participant.isSharingScreen);
  const speakerView = settings.defaultView === 'Speaker View' && tiles.length > 1;
  const stage = useMemo(
    () => presenter || (speakerView ? tiles.find(participant => participant.id === spotlightId) || tiles[0] : null),
    [presenter, speakerView, spotlightId, tiles],
  );
  const strip = useMemo(
    () => (stage ? tiles.filter(participant => participant.id !== stage.id) : []),
    [stage, tiles],
  );

  // Video calls keep every participant, including this device, in the grid so
  // four callers fit together in the available video surface. Audio calls
  // retain the compact floating-self layout.
  const selfTile = tiles.find(participant => participant.isCurrentUser) || null;
  const floatSelf = !videoCall && !stage && Boolean(selfTile) && tiles.length > 1;
  const gridTiles = useMemo(() => (floatSelf ? tiles.filter(participant => !participant.isCurrentUser) : tiles), [floatSelf, tiles]);
  const gridColumns = useMemo(() => groupCallGridColumns(gridTiles.length), [gridTiles.length]);

  const tileSize = useMemo(() => {
    const gap = 8;
    const rows = Math.max(1, Math.ceil(gridTiles.length / gridColumns));
    const width = gridArea.width > 0 ? (gridArea.width - gap * (gridColumns - 1)) / gridColumns : 0;
    const fit = gridArea.height > 0 ? (gridArea.height - gap * (rows - 1)) / rows : 0;
    const height = fit > 0 ? videoCall ? fit : Math.max(96, Math.min(fit, width * 1.25)) : 0;
    return {width, height};
  }, [gridArea, gridColumns, gridTiles.length, videoCall]);

  const floatingSize = useMemo(() => {
    const width = Math.round(Math.min(gridArea.width * 0.42, tileSize.width || gridArea.width * 0.42));
    return {width, height: Math.round(width * 1.18)};
  }, [gridArea.width, tileSize.width]);

  const sharedStage = Boolean(stage?.isSharingScreen);
  const stageSize = useMemo(() => {
    const stripSpace = strip.length ? STRIP_HEIGHT + 6 : 0;
    const availableHeight = gridArea.height > 0 ? Math.max(0, gridArea.height - stripSpace) : 0;
    return {
      width: gridArea.width,
      // Never impose a minimum larger than the measured grid. Call-event and
      // sharing banners legitimately reduce this area on compact devices.
      height: sharedStage ? availableHeight : availableHeight > 0 ? Math.max(160, availableHeight) : 0,
    };
  }, [gridArea, sharedStage, strip.length]);

  const addCandidates: AddableParticipant[] = useMemo(() => {
    const onCallIds = new Set(call.participants.filter(isConnectedParticipant).map(participant => participant.id));
    return (group?.participants || [])
      .filter(member => !onCallIds.has(member.userId))
      .map(member => ({
        userId: member.userId,
        name: member.name,
        phone: member.phone,
        profilePic: member.profilePic,
        status: member.status,
      }));
  }, [call.participants, group]);

  // "Recently Contacted" means people who were genuinely on this call and left,
  // rather than an invented ordering.
  const recentIds = useMemo(
    () => call.participants
      .filter(participant => participant.status === GROUP_CALL_PARTICIPANT_STATUS.LEFT)
      .map(participant => participant.id),
    [call.participants],
  );

  // --- Controls -----------------------------------------------------------------

  const toggleMute = useCallback(async () => {
    const next = !muted;
    muteSyncGenerationRef.current += 1;
    setMuted(next);
    setCall(current => setParticipantMuted(current, currentUserId, next));
    await setGroupCallMuted(next).catch(() => undefined);
    if (next) {
      // The backend only models host-initiated muting plus `unmute_self`, so
      // muting yourself stays local while unmuting tells the room.
      return;
    }
    try {
      const ack = await unmuteSelfInGroupCall(session.groupCallId);
      if (!ack.success) { throw new Error(ack.message); }
    } catch (error) {
      setNotice(errorText(error, 'Unable to update your microphone.'));
    }
  }, [currentUserId, muted, session.groupCallId]);

  const toggleCamera = useCallback(async () => {
    if (!videoCall) { setNotice('This is a voice conference, so there is no camera to turn on.'); return; }
    let next = !cameraOn;
    if (next) {
      const existing = await Camera.getCameraPermissionsAsync();
      const permission = existing.granted ? existing : await Camera.requestCameraPermissionsAsync();
      next = permission.granted;
      if (!next) { setNotice('Allow camera access to share your video.'); return; }
    }
    setCameraOn(next);
    setCall(current => setParticipantCameraOn(current, currentUserId, next));
    await setGroupCallCameraOn(next).catch(() => undefined);
  }, [cameraOn, currentUserId, videoCall]);

  const applyAudioOutput = useCallback(async (route: CallAudioRoute) => {
    setAudioRouteId(route.id);
    // Only the loudspeaker / earpiece choice is remembered between calls; a
    // headset may not be connected next time.
    if (route.kind === 'speaker' || route.kind === 'earpiece') { updateSettings('audioOutput', route.kind === 'speaker' ? 'Speaker' : 'Headset'); }
    // "No Audio" silences everyone else; it is not a microphone mute.
    if (route.kind !== 'none') { setSpeakerOn(route.kind === 'speaker'); }
    const controls: CallAudioControls = {setSpeaker: setGroupCallSpeaker, setRemoteAudio: setGroupCallRemoteAudioEnabled};
    await applyCallAudioRoute(route, audioDevices, controls).catch(() => undefined);
  }, [audioDevices, updateSettings]);

  const openAudioOutputs = useCallback(() => {
    // Read the devices each time: a headset may have been connected mid-call.
    setAudioRoutes(listCallAudioRoutes(audioDevices));
    setOverlay('audio');
  }, [audioDevices]);

  const toggleSpeaker = useCallback(() => {
    applyAudioOutput(speakerOn ? EARPIECE_ROUTE : SPEAKER_ROUTE).catch(() => undefined);
  }, [applyAudioOutput, speakerOn]);

  const toggleScreenShare = useCallback(async () => {
    if (shareBusyRef.current) { return; }
    setOverlay('');
    if (!isScreenSharing && shareStep !== 'confirm') {
      if (Platform.OS === 'ios' && overlay === 'more') { shareAfterDismiss.current = true; }
      else { setShareStep('choose'); }
      return;
    }
    shareBusyRef.current = true;
    setShareBusy(true);
    const stopped = () => {
      setIsScreenSharing(false);
      setLocalScreenStreamUrl('');
      setCall(current => setParticipantSharingScreen(current, currentUserId, false));
    };
    try {
      if (isScreenSharing) {
        await stopGroupCallScreenCapture();
        stopped();
      } else {
        await startGroupCallScreenCapture(stopped, settings.lowBandwidthMode, parseInt(settings.screenShareQuality, 10), settings.adaptiveBitrate, shareSource);
        setIsScreenSharing(true);
        setLocalScreenStreamUrl(getGroupCallScreenStreamUrl());
        setCall(current => setParticipantSharingScreen(current, currentUserId, true));
      }
      setShareStep('');
    } catch (error) {
      stopped();
      setShareStep('');
      setNotice(errorText(error, 'Unable to start screen sharing.'));
    } finally {
      shareBusyRef.current = false;
      setShareBusy(false);
    }
  }, [currentUserId, isScreenSharing, overlay, shareStep, shareSource, settings.lowBandwidthMode, settings.screenShareQuality, settings.adaptiveBitrate]);

  const react = useCallback((emoji: string) => {
    setOverlay('');
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setReactions(current => [...current, {id, emoji}]);
  }, []);

  const togglePin = useCallback(async (participant: GroupCallParticipant) => {
    setParticipantSheet(null);
    const pinning = call.pinnedId !== participant.id;
    setCall(current => pinParticipant(current, participant.id));
    if (!canManage) { return; }
    try {
      const ack = pinning
        ? await pinGroupCallParticipant(session.groupCallId, participant.id)
        : await unpinGroupCallParticipant(session.groupCallId, participant.id);
      if (!ack.success) { throw new Error(ack.message); }
    } catch (error) {
      // The pin still applies on this device; only the broadcast failed.
      setNotice(errorText(error, 'Pinned on this device only.'));
    }
  }, [call.pinnedId, canManage, session.groupCallId]);

  const toggleParticipantMute = useCallback(async (selected: GroupCallParticipant) => {
    setParticipantSheet(null);
    if (selected.isCurrentUser) { await toggleMute(); return; }
    if (!canManage) { setNotice('Only group admins can mute other participants.'); return; }
    // The action sheet keeps the participant as it was when opened; act on the
    // live mute state so a change that arrived meanwhile picks the right action.
    const participant = findParticipant(callRef.current, selected.id) || selected;
    const unmuting = participant.isMuted;
    setBusyParticipantId(participant.id);
    try {
      if (unmuting) {
        await requestGroupCallParticipantUnmute(participant.id);
        const snapshot = serverCallStateRef.current;
        if (snapshot) { snapshot.mutedByUser.set(participant.id, false); }
        muteSyncGenerationRef.current += 1;
        setCall(current => setParticipantMuted(current, participant.id, false));
        showCallEvent(`${participant.name} was unmuted.`);
        return;
      }
      const ack = await muteGroupCallParticipant(session.groupCallId, participant.id);
      if (!ack.success) { throw new Error(ack.message); }
      const snapshot = serverCallStateRef.current;
      if (snapshot) { snapshot.mutedByUser.set(participant.id, true); }
      muteSyncGenerationRef.current += 1;
      setCall(current => setParticipantMuted(current, participant.id, true));
      showCallEvent(`${participant.name} was muted.`);
    } catch (error) {
      const message = errorText(error, unmuting ? 'Unable to unmute this participant.' : 'Unable to mute this participant.');
      if (unmuting) { showCallEvent(message); }
      else { setNotice(message); }
    } finally {
      setBusyParticipantId('');
    }
  }, [canManage, session.groupCallId, showCallEvent, toggleMute]);

  const removeParticipant = useCallback(async (participant: GroupCallParticipant) => {
    setParticipantSheet(null);
    if (!canManage) { setNotice('Only group admins can remove participants.'); return; }
    const currentParticipant = findParticipant(callRef.current, participant.id) || participant;
    const blockedMessage = `${currentParticipant.name} cannot be removed while sharing their screen.`;
    if (currentParticipant.isSharingScreen) {
      showCallEvent(blockedMessage);
      return;
    }
    setBusyParticipantId(participant.id);
    try {
      // Recheck the authoritative call record before the destructive action.
      // This closes the short gap where a share-start broadcast and an already
      // open participant sheet can cross on different devices.
      const latestCall = await getGroupCallDetails(session.groupCallId);
      if (latestCall?.isScreenSharing && latestCall.screenSharingUserId === participant.id) {
        setCall(current => setParticipantSharingScreen(current, participant.id, true));
        showCallEvent(blockedMessage);
        return;
      }
      const ack = await removeGroupCallParticipantOverSocket(session.groupCallId, participant.id);
      if (!ack.success) { throw new Error(ack.message); }
      dropGroupCallPeer(participant.id);
      setCall(current => setParticipantStatus(current, participant.id, GROUP_CALL_PARTICIPANT_STATUS.REMOVED));
      setNotice(`${participant.name} was removed from the call.`);
    } catch (error) {
      setNotice(errorText(error, 'Unable to remove this participant.'));
    } finally {
      setBusyParticipantId('');
    }
  }, [canManage, session.groupCallId, showCallEvent]);

  const invite = useCallback(async (userIds: string[]) => {
    const targets = userIds.filter(Boolean);
    if (!targets.length) { return; }
    if (!canManage) { setNotice('Only group admins can add people to a call.'); return; }

    setAddSubmitting(true);
    const failures: string[] = [];
    for (const userId of targets) {
      try {
        const ack = await addGroupCallParticipant(session.groupCallId, userId);
        if (!ack.success) { throw new Error(ack.message); }
        setCall(current => setParticipantStatus(current, userId, GROUP_CALL_PARTICIPANT_STATUS.CALLING));
      } catch (error) {
        failures.push(errorText(error, 'invitation failed'));
      }
    }
    setAddSubmitting(false);
    setAddSelection(new Set());
    setNotice(failures.length
      ? `${targets.length - failures.length} of ${targets.length} invited. ${failures[0]}`
      : targets.length === 1 ? 'Invitation sent.' : `${targets.length} invitations sent.`);
    if (!failures.length) { setPanel('participants'); }
  }, [canManage, session.groupCallId]);

  const leave = useCallback(async () => {
    setEndDialogOpen(false);
    const durationSeconds = groupCallElapsedSeconds(callRef.current);
    try {
      await leaveGroupCall(session.groupCallId);
    } catch {
      // The server also drops a participant when the socket disconnects, so a
      // failed leave must never trap the user inside the call UI.
    }
    finish({durationSeconds, endedForEveryone: false});
  }, [finish, session.groupCallId]);

  const endForEveryone = useCallback(async () => {
    setEndDialogOpen(false);
    const durationSeconds = groupCallElapsedSeconds(callRef.current);
    try {
      const ack = await endGroupCall(session.groupCallId);
      if (!ack.success) { throw new Error(ack.message); }
      finish({durationSeconds, endedForEveryone: true});
    } catch (error) {
      setNotice(errorText(error, 'Unable to end the call for everyone.'));
    }
  }, [finish, session.groupCallId]);

  // --- Render --------------------------------------------------------------------

  const headerTitle = call.groupName || session.groupName;
  const sheetInset = insets.bottom;
  const stageTile = stage ? (
    <ParticipantTile
      cameraFacing={cameraFacing}
      contentOnly={sharedStage}
      height={sharedStage ? sharedViewport.height : stageSize.height}
      isLocal={stage.isCurrentUser}
      mirror={settings.mirrorVideo && cameraFacing === 'front'}
      onPress={() => setParticipantSheet(stage)}
      participant={stage}
      showName={settings.showParticipantNames}
      showNetwork={settings.networkQualityIndicator}
      spotlighted
      streamUrl={stage.isCurrentUser
        ? (stage.isSharingScreen ? localScreenStreamUrl : localStreamUrl)
        : streamByUser.get(stage.id) || ''}
      videoCall={videoCall}
      width={sharedStage ? sharedViewport.width : stageSize.width}
    />
  ) : null;

  return (
    <Modal animationType="slide" onRequestClose={onMinimize} statusBarTranslucent visible={visible}>
      <View accessibilityLabel="Group Call" style={styles.screen}>
        <View style={[styles.topBar, {paddingTop: Math.max(insets.top, 12)}]}>
          <Pressable accessibilityLabel="Minimize group call" onPress={onMinimize} style={styles.topButton}>
            <GroupCallIcon color="#152033" name="minimize" size={20} />
          </Pressable>
          <View accessibilityLabel={`${headerTitle} group call, ${formatGroupCallDuration(elapsed)}`} style={styles.heading}>
            <Text numberOfLines={1} style={styles.headingTitle}>Group Call</Text>
            <Text style={styles.headingTimer}>{formatGroupCallDuration(elapsed)}</Text>
          </View>
          <Pressable accessibilityLabel={`Participants, ${connected.length} in call`} onPress={() => setPanel('participants')} style={[styles.topButton, styles.topButtonPlain]}>
            <GroupCallIcon color="#152033" name="participants" size={20} />
          </Pressable>
        </View>

        {call.isLocked ? (
          <View accessibilityLabel="Meeting is locked" style={styles.lockedBanner}>
            <GroupCallIcon color="#8A5A00" name="lock" size={12} />
            <Text style={styles.lockedText}>Meeting locked — no one new can join</Text>
          </View>
        ) : null}

        {bannerNotice ? (
          <View accessibilityLabel={bannerNotice.text} accessibilityLiveRegion="polite" style={styles.callEventNotice}>
            <GroupCallIcon color="#5B35C9" name="participants" size={14} />
            <Text numberOfLines={2} style={styles.callEventNoticeText}>{bannerNotice.text}</Text>
          </View>
        ) : null}

        <View
          // onLayout reports the outer size; sizing tiles from it overflowed the
          // padding, so two half-width tiles never fitted on a row.
          onLayout={event => setGridArea({
            width: Math.max(0, event.nativeEvent.layout.width - GRID_PADDING_X * 2),
            height: Math.max(0, event.nativeEvent.layout.height - GRID_PADDING_TOP),
          })}
          style={styles.gridArea}>
          {loading && !tiles.length ? (
            <View style={styles.gridLoading}><ActivityIndicator accessibilityLabel="Loading the conference" color={PURPLE} /></View>
          ) : (
            stage ? (
              <View style={styles.stageLayout}>
                {sharedStage ? (
                  <View accessibilityLabel={`${stage.name} screen share details`} style={styles.screenShareInfo}>
                    {stage.profilePic ? (
                      <Image source={{uri: stage.profilePic}} style={styles.screenShareAvatar} />
                    ) : (
                      <View style={[styles.screenShareAvatar, styles.screenShareAvatarFallback]}>
                        <Text style={styles.screenShareInitials}>{initialsOf(stage.name)}</Text>
                      </View>
                    )}
                    <View style={styles.screenShareCopy}>
                      <Text numberOfLines={1} style={styles.screenShareName}>{stage.name}</Text>
                      <Text style={styles.screenShareStatus}>Sharing screen</Text>
                    </View>
                    <GroupCallIcon color={PURPLE} name="screen" size={16} />
                  </View>
                ) : null}
                {sharedStage ? <View
                  accessibilityLabel="Shared screen viewport"
                  onLayout={event => {
                    const {width, height} = event.nativeEvent.layout;
                    setSharedViewport({width: Math.max(0, width), height: Math.max(0, height)});
                  }}
                  style={styles.sharedViewport}>
                  {/* Measure the space Yoga actually leaves after banners and
                      participant chrome. Keep the video out of flex sizing so
                      its previous frame cannot expand the new viewport. */}
                  <View style={StyleSheet.absoluteFill}>
                    {stageTile}
                  </View>
                </View> : stageTile}
                {strip.length ? <ScrollView contentContainerStyle={styles.strip} horizontal showsHorizontalScrollIndicator={false} style={styles.stripViewport}>
                  {strip.map(participant => (
                    <ParticipantTile
                      cameraFacing={cameraFacing}
                      height={STRIP_HEIGHT}
                      isLocal={participant.isCurrentUser}
                      key={participant.id}
                      mirror={settings.mirrorVideo && cameraFacing === 'front'}
                      onPress={() => setParticipantSheet(participant)}
                      participant={participant}
                      showName={settings.showParticipantNames}
                      showNetwork={false}
                      spotlighted={false}
                      streamUrl={participant.isCurrentUser ? localStreamUrl : streamByUser.get(participant.id) || ''}
                      videoCall={videoCall}
                      width={Math.round(STRIP_HEIGHT * 0.78)}
                    />
                  ))}
                </ScrollView> : null}
              </View>
            ) : (
              <ScrollView contentContainerStyle={[styles.grid, floatSelf && {paddingBottom: Math.round(floatingSize.height * 0.5)}]} showsVerticalScrollIndicator={false} style={styles.gridScroll}>
                {gridTiles.map(participant => (
                  <ParticipantTile
                    cameraFacing={cameraFacing}
                    height={tileSize.height}
                    isLocal={participant.isCurrentUser}
                    key={participant.id}
                    mirror={settings.mirrorVideo && cameraFacing === 'front'}
                    onPress={() => setParticipantSheet(participant)}
                    participant={participant}
                    showName={settings.showParticipantNames}
                    showNetwork={settings.networkQualityIndicator}
                    spotlighted={spotlightId === participant.id}
                    streamUrl={participant.isCurrentUser ? localStreamUrl : streamByUser.get(participant.id) || ''}
                    videoCall={videoCall}
                    width={tileSize.width}
                  />
                ))}
                {!tiles.length ? <Text style={styles.gridEmpty}>Waiting for people to join…</Text> : null}
              </ScrollView>
            )
          )}
          {floatSelf && selfTile ? (
            <View style={styles.floatingSelf}>
              <ParticipantTile
                cameraFacing={cameraFacing}
                floating
                height={floatingSize.height}
                isLocal
                mirror={settings.mirrorVideo && cameraFacing === 'front'}
                onPress={() => setParticipantSheet(selfTile)}
                participant={selfTile}
                showName={settings.showParticipantNames}
                showNetwork={false}
                spotlighted={spotlightId === selfTile.id}
                streamUrl={localStreamUrl}
                videoCall={videoCall}
                width={floatingSize.width}
              />
            </View>
          ) : null}
          <View pointerEvents="none" style={styles.reactionLayer}>
            {reactions.map(reaction => (
              <FloatingReaction
                emoji={reaction.emoji}
                key={reaction.id}
                onDone={() => setReactions(current => current.filter(item => item.id !== reaction.id))}
              />
            ))}
          </View>
        </View>

        {videoCall && cameraOn ? (
          <Pressable accessibilityLabel="Switch camera" onPress={() => setCameraFacing(facing => (facing === 'front' ? 'back' : 'front'))} style={[styles.switchCamera, {bottom: insets.bottom + 168}]}>
            <GroupCallIcon color="#152033" name="switch" size={17} />
          </Pressable>
        ) : null}

        <Snackbar floating={false} message={notice} onHide={() => setNotice('')} />

        {isScreenSharing ? (
          <View accessibilityLabel="You are sharing your screen" style={styles.sharingBanner}>
            <GroupCallIcon color="#1E293B" name="screen" size={22} />
            <Text style={styles.sharingText}>You are sharing your screen</Text>
            <Pressable accessibilityLabel="Stop sharing your screen" onPress={() => { toggleScreenShare().catch(() => undefined); }} style={styles.sharingStop}>
              <Text style={styles.sharingStopText}>Stop sharing</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={[styles.controls, {paddingBottom: Math.max(insets.bottom, 10)}]}>
          <ControlButton label="More" name="more" onPress={() => setOverlay('more')} />
          <ControlButton
            accessibilityLabel={muted ? 'Unmute your microphone' : 'Mute your microphone'}
            active={muted}
            crossed={muted}
            label={muted ? 'Mic off' : 'Mic on'}
            name="microphone"
            onPress={() => { toggleMute().catch(() => undefined); }}
          />
          <ControlButton
            accessibilityLabel={cameraOn ? 'Turn your camera off' : 'Turn your camera on'}
            active={!cameraOn}
            crossed={!cameraOn}
            disabled={!videoCall}
            label={cameraOn ? 'Video on' : 'Video off'}
            name="camera"
            onPress={() => { toggleCamera().catch(() => undefined); }}
          />
          <ControlButton
            accessibilityLabel={speakerOn ? 'Turn the speaker off' : 'Turn the speaker on'}
            active={speakerOn}
            label="Speaker"
            name="speaker"
            onPress={toggleSpeaker}
          />
          <ControlButton danger label="End" name="end" onPress={() => setEndDialogOpen(true)} />
        </View>

        <GroupCallScreenShare step={shareStep} source={shareSource} busy={shareBusy} bottomInset={insets.bottom}
          onClose={() => {
            setShareStep('');
            if (shareBusyRef.current) { stopGroupCallScreenCapture().catch(() => undefined); }
          }}
          onSelect={source => {
            if (source === 'app' && !supportsAppScreenSharing()) {
              setNotice(appScreenSharingUnavailableMessage());
              return;
            }
            setShareSource(source);
            setShareStep('confirm');
          }}
          onStart={() => { toggleScreenShare().catch(() => undefined); }} />
        <GroupCallMoreSheet
          onDismiss={() => {
            if (shareAfterDismiss.current) { shareAfterDismiss.current = false; setShareStep('choose'); }
          }}
          bottomInset={sheetInset}
          canAddPeople={canManage}
          isScreenSharing={isScreenSharing}
          onAddPeople={() => { setOverlay(''); setPanel('add'); }}
          onAudioOutput={openAudioOutputs}
          onCallStatus={() => setOverlay('status')}
          onClose={() => setOverlay('')}
          onMicrophoneSettings={() => setOverlay('microphone')}
          onReact={react}
          onSettings={() => { setOverlay(''); setPanel('settings'); }}
          onShareScreen={() => { toggleScreenShare().catch(() => undefined); }}
          onToggleAutoReconnect={() => updateSettings('autoReconnect', !settings.autoReconnect)}
          onVideoEffects={() => setOverlay('effects')}
          audioOutputLabel={(audioRoutes.find(route => route.id === audioRouteId) || (speakerOn ? SPEAKER_ROUTE : EARPIECE_ROUTE)).label}
          settings={settings}
          visible={overlay === 'more'}
        />
        <GroupCallAudioOutputSheet
          bottomInset={sheetInset}
          onBack={() => setOverlay('more')}
          onClose={() => setOverlay('')}
          onSelect={route => { applyAudioOutput(route).catch(() => undefined); setOverlay('more'); }}
          routes={audioRoutes}
          selected={audioRouteId}
          visible={overlay === 'audio'}
        />
        <GroupCallMicrophoneSheet
          bottomInset={sheetInset}
          onBack={() => setOverlay('more')}
          onClose={() => setOverlay('')}
          onToggleEcho={() => updateSettings('echoCancellation', !settings.echoCancellation)}
          onToggleNoise={() => updateSettings('noiseSuppression', !settings.noiseSuppression)}
          settings={settings}
          visible={overlay === 'microphone'}
        />
        <GroupCallStatusSheet
          bottomInset={sheetInset}
          network={network}
          onBack={() => setOverlay('more')}
          onClose={() => setOverlay('')}
          settings={settings}
          visible={overlay === 'status'}
        />
        <GroupCallVideoEffectsSheet
          bottomInset={sheetInset}
          onBack={() => setOverlay('more')}
          onClose={() => setOverlay('')}
          onSelect={effect => updateSettings('videoEffect', effect as GroupCallVideoEffect)}
          onToggleMirror={() => updateSettings('mirrorVideo', !settings.mirrorVideo)}
          settings={settings}
          visible={overlay === 'effects'}
        />
        <GroupCallParticipantsPanel
          busyParticipantId={busyParticipantId}
          canManage={canManage}
          groupMemberCount={group?.participants.length ?? call.participants.length}
          inCall={connected}
          insets={insets}
          offCall={offCall}
          onAddPeople={() => setPanel('add')}
          onBack={() => setPanel('')}
          onInvite={participant => { invite([participant.id]).catch(() => undefined); }}
          onOpenActions={setParticipantSheet}
          onSearchChange={setParticipantSearch}
          onToggleMute={participant => { toggleParticipantMute(participant).catch(() => undefined); }}
          search={participantSearch}
          visible={panel === 'participants'}
        />
        <GroupCallAddPeoplePanel
          candidates={addCandidates}
          insets={insets}
          loading={loading}
          onAdd={() => { invite([...addSelection]).catch(() => undefined); }}
          onBack={() => setPanel('participants')}
          onSearchChange={setAddSearch}
          onToggle={userId => setAddSelection(current => {
            const next = new Set(current);
            if (next.has(userId)) { next.delete(userId); } else { next.add(userId); }
            return next;
          })}
          recentIds={recentIds}
          search={addSearch}
          selectedIds={addSelection}
          submitting={addSubmitting}
          visible={panel === 'add'}
        />
        <GroupCallSettingsPanel
          insets={insets}
          onBack={() => setPanel('')}
          onChange={updateSettings}
          onOpenPicker={setOpenPicker}
          openPicker={openPicker}
          settings={settings}
          visible={panel === 'settings'}
        />

        {/* Keep participant actions after the full-screen panels. React Native
            presents sibling Modals in render order, so placing this sheet
            earlier left it behind the Participants panel on Android. */}
        <GroupCallParticipantSheet
          bottomInset={sheetInset}
          busy={Boolean(busyParticipantId)}
          canManage={canManage}
          onClose={() => setParticipantSheet(null)}
          onMute={() => { if (participantSheet) { toggleParticipantMute(participantSheet).catch(() => undefined); } }}
          onPin={() => { if (participantSheet) { togglePin(participantSheet).catch(() => undefined); } }}
          onRemove={() => { if (participantSheet) { removeParticipant(participantSheet).catch(() => undefined); } }}
          participant={participantSheet ? findParticipant(call, participantSheet.id) || participantSheet : null}
          pinned={Boolean(participantSheet && call.pinnedId === participantSheet.id)}
          visible={Boolean(participantSheet)}
        />

        <EndCallDialog
          canEndForEveryone={canManage}
          onCancel={() => setEndDialogOpen(false)}
          onEndForEveryone={() => { endForEveryone().catch(() => undefined); }}
          onLeave={() => { leave().catch(() => undefined); }}
          visible={endDialogOpen}
        />
      </View>
    </Modal>
  );
}

const styles = createThemedStyles({
  screen: {flex: 1, backgroundColor: '#FFFFFF'},
  topBar: {minHeight: 64, paddingHorizontal: 14, paddingBottom: 8, flexDirection: 'row', alignItems: 'center'},
  topButton: {width: 42, height: 42, borderRadius: 10, backgroundColor: '#F4F5F7', alignItems: 'center', justifyContent: 'center'},
  topButtonPlain: {backgroundColor: 'transparent'},
  heading: {flex: 1, paddingHorizontal: 10, alignItems: 'center'},
  headingTitle: {color: '#111827', fontFamily: FONT_FAMILY, fontSize: 15, fontWeight: '700'},
  headingTimer: {marginTop: 3, color: '#64748B', fontFamily: FONT_FAMILY, fontSize: 11, fontVariant: ['tabular-nums']},
  lockedBanner: {marginHorizontal: 12, marginBottom: 4, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 7, backgroundColor: '#FDF4E3', flexDirection: 'row', alignItems: 'center', gap: 6},
  lockedText: {color: '#8A5A00', fontFamily: FONT_FAMILY, fontSize: 9, fontWeight: '600'},
  callEventNotice: {marginHorizontal: 12, marginBottom: 4, minHeight: 36, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 7, backgroundColor: '#F4EFFE', flexDirection: 'row', alignItems: 'center', gap: 8},
  callEventNoticeText: {flex: 1, color: '#3D267D', fontFamily: FONT_FAMILY, fontSize: 12, fontWeight: '600'},
  sharingBanner: {marginHorizontal: 12, marginBottom: 4, paddingLeft: 9, paddingRight: 4, paddingVertical: 5, borderRadius: 7, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', gap: 8},
  sharingText: {flex: 1, color: '#1E293B', fontFamily: FONT_FAMILY, fontSize: 13, fontWeight: '600'},
  sharingStop: {paddingHorizontal: 10, paddingVertical: 12, borderRadius: 9, backgroundColor: '#FFF1F2'},
  sharingStopText: {color: '#E52228', fontFamily: FONT_FAMILY, fontSize: 13, fontWeight: '700'},
  gridArea: {flex: 1, paddingHorizontal: GRID_PADDING_X, paddingTop: GRID_PADDING_TOP},
  gridScroll: {flex: 1},
  stageLayout: {flex: 1, minHeight: 0, justifyContent: 'center', gap: 6},
  sharedViewport: {flex: 1, minHeight: 0, overflow: 'hidden'},
  screenShareInfo: {height: SCREEN_SHARE_INFO_HEIGHT, paddingHorizontal: 10, borderWidth: 1, borderColor: '#ECE7FA', borderRadius: 8, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', gap: 9},
  screenShareAvatar: {width: 26, height: 26, borderRadius: 13},
  screenShareAvatarFallback: {backgroundColor: '#EEE8FD', alignItems: 'center', justifyContent: 'center'},
  screenShareInitials: {color: '#5B35C9', fontFamily: FONT_FAMILY, fontSize: 9, fontWeight: '700'},
  screenShareCopy: {flex: 1, minWidth: 0},
  screenShareName: {color: '#1E293B', fontFamily: FONT_FAMILY, fontSize: 11, fontWeight: '700'},
  screenShareStatus: {marginTop: 1, color: '#64748B', fontFamily: FONT_FAMILY, fontSize: 9},
  stripViewport: {height: STRIP_HEIGHT, flexGrow: 0},
  strip: {gap: 6, alignItems: 'center'},
  gridLoading: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  grid: {flexGrow: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignContent: 'flex-start', justifyContent: 'flex-start'},
  gridEmpty: {marginTop: 40, color: '#8792A4', fontFamily: FONT_FAMILY, fontSize: 11},
  tile: {borderRadius: 8, overflow: 'hidden', backgroundColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center'},
  // A bounded native surface plus `contain` keeps portrait and landscape
  // presentations inside the existing tile instead of cropping their edges.
  sharedContentVideo: {position: 'absolute', top: 0, right: 0, bottom: 0, left: 0},
  tileIdle: {backgroundColor: '#F7F8FA'},
  tileSpotlighted: {borderWidth: 2, borderColor: '#7C3AED'},
  tileFloating: {borderWidth: 1, borderColor: '#E9ECF2', shadowColor: '#0F172A', shadowOffset: {width: 0, height: 4}, shadowOpacity: .14, shadowRadius: 10, elevation: 8},
  tileAvatar: {alignItems: 'center', justifyContent: 'center'},
  tileInitials: {fontFamily: FONT_FAMILY, fontWeight: '600'},
  tileSharing: {position: 'absolute', left: 6, top: 6, width: 22, height: 22, borderRadius: 4, backgroundColor: 'rgba(109,40,217,.9)', alignItems: 'center', justifyContent: 'center'},
  tileMic: {position: 'absolute', right: 6, top: 6, width: 22, height: 22, borderRadius: 4, backgroundColor: 'rgba(30,41,59,.62)', alignItems: 'center', justifyContent: 'center'},
  tileFooter: {position: 'absolute', left: 6, right: 6, bottom: 6, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 4},
  tileNamePill: {maxWidth: '78%', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4, backgroundColor: 'rgba(30,41,59,.62)'},
  tileName: {color: '#FFFFFF', fontFamily: FONT_FAMILY, fontSize: 9, fontWeight: '500'},
  tileNetwork: {width: 22, height: 22, borderRadius: 4, backgroundColor: 'rgba(30,41,59,.62)', alignItems: 'center', justifyContent: 'center'},
  floatingSelf: {position: 'absolute', right: 14, bottom: 10},
  reactionLayer: {position: 'absolute', left: 0, right: 0, bottom: 20, alignItems: 'center'},
  floatingReaction: {fontSize: 40},
  switchCamera: {position: 'absolute', right: 16, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,.92)', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: {width: 0, height: 2}, shadowOpacity: .14, shadowRadius: 4, elevation: 4},
  controls: {minHeight: 104, paddingTop: 12, paddingHorizontal: 12, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between'},
  control: {flex: 1, alignItems: 'center'},
  controlButton: {width: 54, height: 54, borderWidth: 1, borderColor: '#EEF1F5', borderRadius: 12, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', shadowColor: '#0F172A', shadowOffset: {width: 0, height: 1}, shadowOpacity: .04, shadowRadius: 3, elevation: 1},
  controlButtonActive: {borderColor: '#E4DAFB', backgroundColor: '#F4EFFE'},
  controlButtonDanger: {borderColor: '#E5252A', backgroundColor: '#E5252A'},
  controlLabel: {marginTop: 6, maxWidth: '96%', color: '#64748B', fontFamily: FONT_FAMILY, fontSize: 10},
  controlLabelDanger: {color: '#64748B'},
  disabled: {opacity: .45},
  dialogBackdrop: {flex: 1, padding: 26, backgroundColor: 'rgba(15,23,42,.45)', alignItems: 'center', justifyContent: 'center'},
  dialog: {width: '100%', padding: 18, borderRadius: 14, backgroundColor: '#FFFFFF'},
  dialogTitle: {color: '#111827', fontFamily: FONT_FAMILY, fontSize: 14, fontWeight: '700'},
  dialogCopy: {marginTop: 8, color: '#64748B', fontFamily: FONT_FAMILY, fontSize: 11, lineHeight: 16},
  dialogPrimary: {height: 44, marginTop: 16, borderRadius: 9, backgroundColor: PURPLE, alignItems: 'center', justifyContent: 'center'},
  dialogPrimaryText: {color: '#FFFFFF', fontFamily: FONT_FAMILY, fontSize: 12, fontWeight: '700'},
  dialogDanger: {height: 44, marginTop: 9, borderWidth: 1, borderColor: '#F3C8CA', borderRadius: 9, alignItems: 'center', justifyContent: 'center'},
  dialogDangerText: {color: '#E9282D', fontFamily: FONT_FAMILY, fontSize: 12, fontWeight: '700'},
  dialogCancel: {height: 40, marginTop: 4, alignItems: 'center', justifyContent: 'center'},
  dialogCancelText: {color: '#64748B', fontFamily: FONT_FAMILY, fontSize: 11, fontWeight: '600'},
});
