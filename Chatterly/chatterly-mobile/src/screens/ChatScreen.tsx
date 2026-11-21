import { DirectChatMenu } from '../components/DirectChatMenu';
import { BlockConfirmation, BlockIcon } from '../components/BlockConfirmation';
import {
  changeContactBlock,
  isUserBlocked,
  refreshBlockedContacts,
  useBlockedContacts,
} from '../services/blockStore';
import { CallEndedScreen } from '../components/CallEndedScreen';
import { CallRingtone } from '../components/CallRingtone';
import { CallLogNotice } from '../components/CallLogNotice';
import {
  OneToOneCallOptionIcon,
  type OneToOneCallOptionIconName,
} from '../components/OneToOneCallOptionIcon';
import { callDuration } from '../utils/callSummary';
import * as Clipboard from 'expo-clipboard';
import * as Contacts from 'expo-contacts';
import {
  RecordingPresets,
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import * as Location from 'expo-location';
import * as Sharing from 'expo-sharing';
import { BlurView } from 'expo-blur';
import { Camera } from 'expo-camera';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import {DraggableCallPreview} from '../components/DraggableCallPreview';
import {subscribeToCallHold} from '../services/callAudio';
import {subscribeToBackgroundCallEnd} from '../services/callBackground';
import * as Haptics from 'expo-haptics';
import { useVideoPlayer, VideoView } from 'expo-video';
import NetInfo from '@react-native-community/netinfo';
import { CallVideoView } from '../components/CallVideoView';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type GestureResponderEvent,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from 'react-native-svg';
import {
  AvatarStatusBadge,
  BackIcon,
  ClockStatusIcon,
  CompactMicrophoneIcon,
  ConnectedChatIllustration,
  ConnectionStatusIcon,
  DoubleCheckIcon,
  EmojiIcon,
  LockIcon,
  PaperclipIcon,
  PauseBarsIcon,
  PhoneCallIcon,
  PinMarkerIcon,
  PlayTriangleIcon,
  RedMicrophoneIcon,
  SendIcon,
  SingleCheckIcon,
  TrashIcon,
  VideoCallIcon,
} from '../components/ChatIcons';
import { ChevronDownIcon, MoreIcon } from '../components/ContactsIcons';
import {
  createVoiceRecordingPreview,
  deleteVoiceRecordingPreview,
} from '../services/voiceRecordingPreview';
import { Snackbar } from '../components/Snackbar';
import {ProfilePictureViewer} from '../components/ProfilePictureViewer';
import { EditContactSheet } from '../components/EditContactSheet';
import { useContactDisplayName } from '../services/contactAliases';
import { getRegisteredUser } from '../services/contactsApi';
import { EmojiPicker } from '../components/EmojiPicker';
import { MediaAttachmentFlow } from '../components/MediaAttachmentFlow';
import {
  DocumentAttachmentScreen,
  isAudioUpload,
} from '../components/DocumentAttachmentScreen';
import { ChatProfileScreen } from './ChatProfileScreen';
import { GroupInfoScreen } from './GroupInfoScreen';
import { ProgressiveMediaImage } from '../components/ProgressiveMediaImage';
import { MessageActionIcon } from '../components/MessageActionIcons';
import {
  deleteChat,
  deleteMessage,
  forwardMessages,
  getCallStatus,
  getChatMessages,
  getChatProfile,
  getGroupMessages,
  getMediaDownloadUrl,
  getPinnedMessages,
  getSharedMedia,
  locationMessage,
  markChatRead,
  markChatUnread,
  pinMessage,
  sendChatFile,
  sendChatMedia,
  sendChatMessage,
  startChat,
  startCall,
  unpinMessage,
} from '../services/chatApi';
import {
  addCallParticipantOverSocket,
  setCallScreenShareOverSocket,
  cancelCallOverSocket,
  emitChatRead,
  emitMessageDeletedForEveryone,
  emitMessagePinned,
  emitMessageReaction,
  emitMessageUnpinned,
  emitTyping,
  endCallOverSocket,
  editGroupMessageOverSocket,
  forwardGroupMessageOverSocket,
  initiateCallOverSocket,
  joinCallRoom,
  sendGroupMessageOverSocket,
  sendMessageOverSocket,
  setCallMutedOverSocket,
  setCallSpeakerOverSocket,
  subscribeToCall,
  subscribeToChat,
  subscribeToConnection,
  subscribeToGroup,
  subscribeToGroupChanges,
  type CallType,
  type ConnectionState,
  type MessageReactionPayload,
  type PresenceState,
} from '../services/chatRealtime';
import {
  handleCallAudioSignal,
  setCallAudioHeld,
  setCallAudioMuted,
  setCallAudioSpeaker,
  setCallVideoEnabled,
  startCallAudio,
  startCallAudioOffer,
  subscribeToCallConnection,
  startCallScreenCapture,
  stopCallAudio,
  stopCallScreenCapture,
  subscribeToCallMedia,
  type CallMediaStreams,
} from '../services/callAudio';
import {
  applyCallAudioRoute,
  EARPIECE_ROUTE,
  listCallAudioRoutes,
  SPEAKER_ROUTE,
  type CallAudioRoute,
} from '../services/callAudioRoutes';
import { CallContactSheet } from '../components/CallContactSheet';
import {
  CALL_RINGTONE_STATE,
  outgoingRingtoneState,
} from '../services/callRingtone';
import {
  notifyGroupMessageOnce,
  notifyMessageOnce,
} from '../services/notificationApi';
import {
  clearNotificationsForChat,
  setActiveNotificationChat,
} from '../services/notificationService';
import { getSession } from '../services/sessionStore';
import {publishCallActivity, subscribeToCallActivity, type CallActivity} from '../services/callActivity';
import {CallReactionOverlay} from '../components/CallReactionOverlay';
import {CallMuteIcon} from '../components/CallMuteIcon';
import type {
  ChatMessage,
  ChatProfile,
  ConversationContact,
  ForwardDestination,
} from '../types/chat';
import {
  isRetryable,
  mergeStatus,
  normalizeStatus,
  statusLabel,
} from '../utils/messageStatus';
import { isAckTimeout } from '../utils/sendErrors';
import {
  albumGroupId,
  createAlbumToken,
  tagAlbumFileName,
} from '../utils/mediaAlbum';
import { isGifMessage, messagePreview } from '../utils/messagePreview';
import { recordChatListActivity } from '../services/chatListActivity';
import { openDownloadedDocument } from '../services/documentViewer';
import { isVideoAttachment, saveVideoToDevice } from '../services/videoDownload';
import {
  applyReadReceipt,
  applyStatus,
  forwardedMessageForActiveThread,
  markDeletedForEveryone,
  markDeletedForMe,
  reconcileStoredAndRemote,
  sortByTime,
  upsertMessage,
} from '../utils/messageThread';
import {canDeleteForEveryone, DELETE_FOR_EVERYONE_NOTICE} from '../utils/messageDeletion';
import {
  loadStoredMessages,
  removeStoredThread,
  storeMessages,
} from '../services/messageStore';
import { compressChatMedia } from '../services/mediaCompression';
import {
  downloadedFileFor,
  saveDocumentLocally,
  startAutoDownloadTracking,
  useAutoDownloadMessages,
  useMediaDownloadGate,
  type DownloadTransferState,
} from '../services/autoDownload';
import { GIF_ITEMS, type GifItem } from '../constants/gifs';
import type { AttachmentMedia, MediaTransferState } from '../types/media';
import type {IncomingMediaShare} from '../services/incomingShare';
import { ForwardMessageScreen } from './ForwardMessageScreen';
import {createVCard, vCardFileName} from '../utils/vcard';
import {LinkifiedText} from '../components/LinkifiedText';
import { ManageGroupMembersScreen } from './ManageGroupMembersScreen';
import { SharedContentScreen } from './SharedContentScreen';
import {
  clearGroupChat,
  deleteGroup,
  getGroupDetails,
  getGroupPinnedMessages,
  leaveGroup,
  pinGroupMessage,
  reportGroup,
  sendGroupFile,
  sendGroupMedia,
  sendGroupMessage,
  unpinGroupMessage,
  type GroupDetails,
} from '../services/groupApi';
import {
  getConversationMuted,
  setConversationMuted,
} from '../services/conversationPreferences';
import {
  buildDisappearingTimerEventText,
  disappearingTimerEventCopy,
  getChatDisappearingTimerClearedAt,
  setChatDisappearingTimer,
  setStoredChatDisappearingTimer,
  subscribeToDisappearingTimerCleared,
  visibleDisappearingTimerMessages,
} from '../services/disappearingMessages';
import {
  canPinGroupMessages,
  groupComposerAccess,
  groupRoleLabel,
  type SimilarGroupDraft,
} from '../utils/groupAdmin';
import { syncContacts, type SyncedContactUser } from '../services/contactsApi';
import type { DisappearingMessageDuration } from '../services/privacyApi';
import { createThemedStyles, themeInk } from '../theme/themedStyles';
import { useChatWallpaper } from '../wallpaper/ChatWallpaperProvider';
import { WallpaperBackground } from '../wallpaper/WallpaperBackground';

type Props = {
  incomingMedia?: IncomingMediaShare | null;
  onIncomingMediaHandled?: () => void;
  callRequest?: { id: string; type: CallType } | null;
  onCallRequestHandled?: () => void;
  chatId: string;
  contact: ConversationContact;
  onBack: () => void;
  onOpenConversation?: (contact: ConversationContact, chatId: string) => void;
  onCreateSimilarGroup?: (draft: SimilarGroupDraft) => void;
  onStartGroupCall?: (type: CallType) => void;
  onReportSubmitted?: (message: string) => void;
  onOutgoingCallStateChange?: (active: boolean, minimized: boolean) => void;
  minimizeCallRequest?: number;
  restoreCallRequest?: number;
};
const MEDIA_ADMINS_ONLY_NOTICE =
  'Only admins can share media and files in this group.';
const DELETE_UNDO_WINDOW_MS = 3500;
type ShareableContact = {
  id: string;
  name: string;
  phoneNumbers: string[];
  emailAddresses: string[];
};
type PendingMessageDeletion = {
  message: ChatMessage;
  scope: 'me' | 'everyone';
};
const isUnsentVoiceNote = (message: ChatMessage) =>
  message.messageType === 'audio' && Boolean(message.tempId) &&
  message.id === message.tempId && (message.status === 'failed' || message.queued);
const FONT_FAMILY = Platform.select({ android: 'sans-serif', ios: 'System' });
type GroupMenuIconName = 'add' | 'info' | 'media' | 'mute' | 'search' | 'more';

/** The design's send / record button: a purple gradient, lighter at the left. */
function ComposerButtonGradient() {
  return (
    <Svg
      pointerEvents="none"
      preserveAspectRatio="none"
      style={StyleSheet.absoluteFill}
      viewBox="0 0 50 50"
    >
      <Defs>
        <LinearGradient id="composerActionGradient" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#9A5CF7" />
          <Stop offset="1" stopColor="#7A1FE2" />
        </LinearGradient>
      </Defs>
      <Rect width={50} height={50} fill="url(#composerActionGradient)" />
    </Svg>
  );
}

function VoiceBubbleGradient() {
  return (
    <Svg pointerEvents="none" preserveAspectRatio="none" style={StyleSheet.absoluteFill} viewBox="0 0 272 68">
      <Defs>
        <LinearGradient id="voiceBubbleGradient" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#9658F6" />
          <Stop offset="1" stopColor="#8723EA" />
        </LinearGradient>
      </Defs>
      <Rect width={272} height={68} fill="url(#voiceBubbleGradient)" />
    </Svg>
  );
}

function SelectedMessageHighlight() {
  return (
    <Svg
      accessibilityLabel="Selected message highlight"
      pointerEvents="none"
      preserveAspectRatio="none"
      style={StyleSheet.absoluteFill}
      viewBox="0 0 393 108"
    >
      <Rect
        width={393}
        height={104}
        fill={themeInk('#F1EBFE')}
        fillOpacity={0.5}
      />
    </Svg>
  );
}

function UndoIcon() {
  return (
    <Svg width={35} height={13} viewBox="0 0 35 13" fill="none">
      <Path
        d="M8.834 0.000733614V6.44073C8.834 7.20607 8.67533 7.87807 8.358 8.45673C8.05 9.02607 7.60667 9.4694 7.028 9.78673C6.44933 10.1041 5.754 10.2627 4.942 10.2627C4.13933 10.2627 3.44867 10.1041 2.87 9.78673C2.29133 9.4694 1.84333 9.02607 1.526 8.45673C1.218 7.87807 1.064 7.20607 1.064 6.44073V0.000733614H2.604V6.48273C2.604 6.96807 2.69733 7.39273 2.884 7.75673C3.07067 8.1114 3.33667 8.38673 3.682 8.58273C4.02733 8.77873 4.44733 8.87673 4.942 8.87673C5.446 8.87673 5.87067 8.77873 6.216 8.58273C6.57067 8.38673 6.83667 8.1114 7.014 7.75673C7.20067 7.39273 7.294 6.96807 7.294 6.48273V0.000733614H8.834ZM12.2788 5.86673V10.0527H10.8648V2.63273H12.1808V3.86473C12.4328 3.45407 12.7594 3.12273 13.1608 2.87073C13.5714 2.61873 14.0334 2.49273 14.5468 2.49273C15.3121 2.49273 15.9234 2.73073 16.3808 3.20673C16.8474 3.68273 17.0808 4.36407 17.0808 5.25073V10.0527H15.6668V5.72673C15.6668 5.09207 15.5314 4.60207 15.2608 4.25673C14.9901 3.9114 14.5888 3.73873 14.0568 3.73873C13.7301 3.73873 13.4314 3.8274 13.1608 4.00473C12.8901 4.17273 12.6754 4.4154 12.5168 4.73273C12.3581 5.05007 12.2788 5.42807 12.2788 5.86673ZM18.4265 6.34273C18.4265 5.59607 18.5618 4.9334 18.8325 4.35473C19.1032 3.76673 19.4858 3.3094 19.9805 2.98273C20.4752 2.65607 21.0538 2.49273 21.7165 2.49273C22.2112 2.49273 22.6638 2.61873 23.0745 2.87073C23.4945 3.1134 23.8352 3.45873 24.0965 3.90673V0.000733614H25.5105V10.0527H24.1945V8.72273C23.9332 9.1894 23.5832 9.5534 23.1445 9.81473C22.7152 10.0667 22.2392 10.1927 21.7165 10.1927C21.0538 10.1927 20.4752 10.0294 19.9805 9.70273C19.4858 9.36673 19.1032 8.9094 18.8325 8.33073C18.5618 7.74273 18.4265 7.08007 18.4265 6.34273ZM19.8965 6.34273C19.8965 7.1734 20.0925 7.81273 20.4845 8.26073C20.8765 8.70873 21.3805 8.93273 21.9965 8.93273C22.4072 8.93273 22.7665 8.83007 23.0745 8.62473C23.3918 8.41007 23.6392 8.10673 23.8165 7.71473C24.0032 7.32273 24.0965 6.85607 24.0965 6.31473C24.0965 5.76407 24.0032 5.2974 23.8165 4.91473C23.6298 4.53207 23.3778 4.24273 23.0605 4.04673C22.7432 3.8414 22.3885 3.73873 21.9965 3.73873C21.3805 3.73873 20.8765 3.96273 20.4845 4.41073C20.0925 4.85873 19.8965 5.50273 19.8965 6.34273ZM30.5841 10.1927C30.0614 10.1927 29.5761 10.0994 29.1281 9.91273C28.6894 9.71673 28.3068 9.44607 27.9801 9.10073C27.6534 8.74607 27.3968 8.3354 27.2101 7.86873C27.0328 7.40207 26.9441 6.8934 26.9441 6.34273C26.9441 5.79207 27.0328 5.2834 27.2101 4.81673C27.3968 4.35007 27.6534 3.94407 27.9801 3.59873C28.3068 3.24407 28.6894 2.9734 29.1281 2.78673C29.5761 2.59073 30.0614 2.49273 30.5841 2.49273C31.1161 2.49273 31.6014 2.59073 32.0401 2.78673C32.4881 2.9734 32.8708 3.24407 33.1881 3.59873C33.5148 3.94407 33.7668 4.35007 33.9441 4.81673C34.1308 5.2834 34.2241 5.79207 34.2241 6.34273C34.2241 6.8934 34.1308 7.40207 33.9441 7.86873C33.7668 8.3354 33.5148 8.74607 33.1881 9.10073C32.8708 9.44607 32.4881 9.71673 32.0401 9.91273C31.6014 10.0994 31.1161 10.1927 30.5841 10.1927ZM30.5841 8.94673C30.9948 8.94673 31.3634 8.84407 31.6901 8.63873C32.0261 8.42407 32.2874 8.12073 32.4741 7.72873C32.6701 7.33673 32.7681 6.87473 32.7681 6.34273C32.7681 5.8014 32.6701 5.3394 32.4741 4.95673C32.2874 4.56473 32.0261 4.26607 31.6901 4.06073C31.3634 3.8554 30.9948 3.75273 30.5841 3.75273C30.1828 3.75273 29.8141 3.8554 29.4781 4.06073C29.1514 4.26607 28.8901 4.56473 28.6941 4.95673C28.5074 5.3394 28.4141 5.8014 28.4141 6.34273C28.4141 6.87473 28.5074 7.33673 28.6941 7.72873C28.8901 8.12073 29.1514 8.42407 29.4781 8.63873C29.8141 8.84407 30.1828 8.94673 30.5841 8.94673Z"
        fill={themeInk('#5121BF')}
      />
      <Path
        d="M0 11.5227H34.6861V12.2227H0V11.5227Z"
        fill={themeInk('#5121BF')}
      />
    </Svg>
  );
}

function DeletedMessageSnackbar({ onUndo }: { onUndo: () => void }) {
  return (
    <View
      accessibilityLabel="This message has been deleted. Undo"
      accessibilityLiveRegion="polite"
      style={styles.deletedSnackbar}
    >
      <View style={styles.deletedSnackbarIcon}>
        <TrashIcon color="#EF4444" />
      </View>
      <Text style={styles.deletedSnackbarText}>
        This message has been deleted.
      </Text>
      <Pressable
        accessibilityLabel="Undo delete message"
        accessibilityRole="button"
        hitSlop={8}
        onPress={onUndo}
        style={styles.deletedSnackbarUndo}
      >
        <UndoIcon />
      </Pressable>
    </View>
  );
}

function GroupMenuIcon({ name }: { name: GroupMenuIconName }) {
  const paths: Record<GroupMenuIconName, string> = {
    add: 'M22 27H28M25 24V30M12 29V27C12 25.9391 12.4214 24.9217 13.1716 24.1716C13.9217 23.4214 14.9391 23 16 23H20M14 15C14 16.0609 14.4214 17.0783 15.1716 17.8284C15.9217 18.5786 16.9391 19 18 19C19.0609 19 20.0783 18.5786 20.8284 17.8284C21.5786 17.0783 22 16.0609 22 15C22 13.9391 21.5786 12.9217 20.8284 12.1716C20.0783 11.4214 19.0609 11 18 11C16.9391 11 15.9217 11.4214 15.1716 12.1716C14.4214 12.9217 14 13.9391 14 15Z',
    info: 'M20 17H20.01M19 20H20V24H21M11 20C11 21.1819 11.2328 22.3522 11.6851 23.4442C12.1374 24.5361 12.8003 25.5282 13.636 26.364C14.4718 27.1997 15.4639 27.8626 16.5558 28.3149C17.6478 28.7672 18.8181 29 20 29C21.1819 29 22.3522 28.7672 23.4442 28.3149C24.5361 27.8626 25.5282 27.1997 26.364 26.364C27.1997 25.5282 27.8626 24.5361 28.3149 23.4442C28.7672 22.3522 29 21.1819 29 20C29 17.6131 28.0518 15.3239 26.364 13.636C24.6761 11.9482 22.3869 11 20 11C17.6131 11 15.3239 11.9482 13.636 13.636C11.9482 15.3239 11 17.6131 11 20Z',
    media:
      'M23 16H23.01M11 24L16 19C16.928 18.107 18.072 18.107 19 19L24 24M22 22L23 21C23.928 20.107 25.072 20.107 26 21L29 24M11 14C11 13.2044 11.3161 12.4413 11.8787 11.8787C12.4413 11.3161 13.2044 11 14 11H26C26.7956 11 27.5587 11.3161 28.1213 11.8787C28.6839 12.4413 29 13.2044 29 14V26C29 26.7956 28.6839 27.5587 28.1213 28.1213C27.5587 28.6839 26.7956 29 26 29H14C13.2044 29 12.4413 28.6839 11.8787 28.1213C11.3161 27.5587 11 26.7956 11 26V14Z',
    mute: 'M17.346 13.353C17.556 13.2243 17.774 13.1067 18 13C18 12.4696 18.2107 11.9609 18.5858 11.5858C18.9609 11.2107 19.4696 11 20 11C20.5304 11 21.0391 11.2107 21.4142 11.5858C21.7893 11.9609 22 12.4696 22 13C23.1484 13.543 24.1274 14.3883 24.8321 15.4453C25.5367 16.5023 25.9404 17.7311 26 19V22M25 25H12C12.5449 24.6914 13.0098 24.2592 13.3572 23.7381C13.7046 23.2171 13.9247 22.6217 14 22V19C14.0627 17.6683 14.5043 16.3822 15.273 15.293M17 25V26C17 26.7956 17.3161 27.5587 17.8787 28.1213C18.4413 28.6839 19.2044 29 20 29C20.7956 29 21.5587 28.6839 22.1213 28.1213C22.6839 27.5587 23 26.7956 23 26V25M11 11L29 29',
    search:
      'M29 29L23 23M11 18C11 18.9193 11.1811 19.8295 11.5328 20.6788C11.8846 21.5281 12.4002 22.2997 13.0503 22.9497C13.7003 23.5998 14.4719 24.1154 15.3212 24.4672C16.1705 24.8189 17.0807 25 18 25C18.9193 25 19.8295 24.8189 20.6788 24.4672C21.5281 24.1154 22.2997 23.5998 22.9497 22.9497C23.5998 22.2997 24.1154 21.5281 24.4672 20.6788C24.8189 19.8295 25 18.9193 25 18C25 17.0807 24.8189 16.1705 24.4672 15.3212C24.1154 14.4719 23.5998 13.7003 22.9497 13.0503C22.2997 12.4002 21.5281 11.8846 20.6788 11.5328C19.8295 11.1811 18.9193 11 18 11C17.0807 11 16.1705 11.1811 15.3212 11.5328C14.4719 11.8846 13.7003 12.4002 13.0503 13.0503C12.4002 13.7003 11.8846 14.4719 11.5328 15.3212C11.1811 16.1705 11 17.0807 11 18Z',
    more: 'M19 20C19 20.2652 19.1054 20.5196 19.2929 20.7071C19.4804 20.8946 19.7348 21 20 21C20.2652 21 20.5196 20.8946 20.7071 20.7071C20.8946 20.5196 21 20.2652 21 20C21 19.7348 20.8946 19.4804 20.7071 19.2929C20.5196 19.1054 20.2652 19 20 19C19.7348 19 19.4804 19.1054 19.2929 19.2929C19.1054 19.4804 19 19.7348 19 20ZM19 27C19 27.2652 19.1054 27.5196 19.2929 27.7071C19.4804 27.8946 19.7348 28 20 28C20.2652 28 20.5196 27.8946 20.7071 27.7071C20.8946 27.5196 21 27.2652 21 27C21 26.7348 20.8946 26.4804 20.7071 26.2929C20.5196 26.1054 20.2652 26 20 26C19.7348 26 19.4804 26.1054 19.2929 26.2929C19.1054 26.4804 19 26.7348 19 27ZM19 13C19 13.2652 19.1054 13.5196 19.2929 13.7071C19.4804 13.8946 19.7348 14 20 14C20.2652 14 20.5196 13.8946 20.7071 13.7071C20.8946 13.5196 21 13.2652 21 13C21 12.7348 20.8946 12.4804 20.7071 12.2929C20.5196 12.1054 20.2652 12 20 12C19.7348 12 19.4804 12.1054 19.2929 12.2929C19.1054 12.4804 19 12.7348 19 13Z',
  };
  return (
    <Svg width={40} height={40} viewBox="0 0 40 40" fill="none">
      <Path
        d={paths[name]}
        fill={name === 'more' ? themeInk('#0B1220') : 'none'}
        stroke={themeInk('#0B1220')}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

type GroupMoreIconName = 'clear' | 'report' | 'leave' | 'delete';
function GroupMoreActionIcon({ name }: { name: GroupMoreIconName }) {
  const paths: Record<GroupMoreIconName, string> = {
    clear:
      'M27.0001 28.0008H16.5001L12.2901 23.7008C12.1038 23.5134 11.9993 23.26 11.9993 22.9958C11.9993 22.7316 12.1038 22.4782 12.2901 22.2908L22.2901 12.2908C22.4774 12.1045 22.7309 12 22.9951 12C23.2592 12 23.5127 12.1045 23.7001 12.2908L28.7001 17.2908C28.8863 17.4782 28.9909 17.7316 28.9909 17.9958C28.9909 18.26 28.8863 18.5134 28.7001 18.7008L19.5001 28.0008M26.0001 21.3008L19.7001 15.0008',
    report:
      'M20 16V19M20 22V22.01M26 12C26.7956 12 27.5587 12.3161 28.1213 12.8787C28.6839 13.4413 29 14.2044 29 15V23C29 23.7956 28.6839 24.5587 28.1213 25.1213C27.5587 25.6839 26.7956 26 26 26H21L16 29V26H14C13.2044 26 12.4413 25.6839 11.8787 25.1213C11.3161 24.5587 11 23.7956 11 23V15C11 14.2044 11.3161 13.4413 11.8787 12.8787C12.4413 12.3161 13.2044 12 14 12H26Z',
    leave:
      'M22 16V14C22 13.4696 21.7893 12.9609 21.4142 12.5858C21.0391 12.2107 20.5304 12 20 12H13C12.4696 12 11.9609 12.2107 11.5858 12.5858C11.2107 12.9609 11 13.4696 11 14V26C11 26.5304 11.2107 27.0391 11.5858 27.4142C11.9609 27.7893 12.4696 28 13 28H20C20.5304 28 21.0391 27.7893 21.4142 27.4142C21.7893 27.0391 22 26.5304 22 26V24M17 20H29M26 23L29 20L26 17',
    delete:
      'M12 15H28M18 19V25M22 19V25M13 15L14 27C14 27.5304 14.2107 28.0391 14.5858 28.4142C14.9609 28.7893 15.4696 29 16 29H24C24.5304 29 25.0391 28.7893 25.4142 28.4142C25.7893 28.0391 26 27.5304 26 27L27 15M17 15V12C17 11.7348 17.1054 11.4804 17.2929 11.2929C17.4804 11.1054 17.7348 11 18 11H22C22.2652 11 22.5196 11.1054 22.7071 11.2929C22.8946 11.4804 23 11.7348 23 12V15',
  };
  const color = name === 'delete' ? '#DC2626' : '#0B1220';
  return (
    <Svg width={40} height={40} viewBox="0 0 40 40" fill="none">
      <Path
        d={paths[name]}
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
const CONNECTION_BANNER_VISIBLE_MS = 2500;
const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('') || '?';

// The client id that makes a send idempotent. The server stores it behind a
// unique index, so replaying the same tempId after a timeout resolves to the
// message that was already written instead of creating a second one.
let sendCounter = 0;
const nextTempId = () =>
  `${getSession()?.user?.id || 'local'}-${Date.now()}-${++sendCounter}`;
const formatBytes = (bytes?: number) =>
  !bytes
    ? ''
    : bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const VOICE_WAVEFORM = [
  5, 8, 12, 7, 18, 10, 22, 13, 27, 15, 31, 18, 26, 34, 20, 39, 25, 33, 18, 28,
  13, 24, 17, 30, 12, 22, 16, 27, 8, 20, 14, 24, 7, 18, 11, 21,
];
const VOICE_RECORDING_OPTIONS = {
  ...RecordingPresets.LOW_QUALITY,
  isMeteringEnabled: true,
  // ADTS AAC remains readable while the Android recorder is paused, which
  // preserves the existing preview/resume flow. audioMimeType maps this native
  // recorder output to the backend's supported audio upload MIME below.
  android: {
    ...RecordingPresets.LOW_QUALITY.android,
    extension: '.aac',
    outputFormat: 'aac_adts' as const,
    audioEncoder: 'aac' as const,
  },
  // A paused M4A has no finalized seek metadata. PCM lets us finalize a WAV
  // preview copy while leaving the original recording open for resume on iOS.
  ios: {
    ...RecordingPresets.LOW_QUALITY.ios,
    extension: '.wav',
    outputFormat: 'lpcm',
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
};
const VOICE_RECORDING_AUDIO_MODE = {
  allowsRecording: true,
  allowsBackgroundRecording: false,
  playsInSilentMode: true,
  shouldPlayInBackground: false,
  shouldRouteThroughEarpiece: false,
};
const VOICE_IDLE_AUDIO_MODE = {
  allowsRecording: false,
  allowsBackgroundRecording: false,
  playsInSilentMode: true,
  shouldPlayInBackground: false,
  shouldRouteThroughEarpiece: false,
};
const QUICK_REACTIONS = ['😟', '😎', '😍', '🧐', '😅', '🥳'];
const MORE_REACTIONS = [
  '👍',
  '❤️',
  '😂',
  '😮',
  '😢',
  '🙏',
  '👏',
  '🔥',
  '🎉',
  '💯',
  '🤔',
  '😡',
];
const formatComposerDuration = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(
    Math.floor(seconds % 60),
  ).padStart(2, '0')}`;
const formatAudioDuration = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(
    2,
    '0',
  )}`;
const playbackProgress = (
  currentTime: number,
  duration: number,
  didJustFinish = false,
) => {
  if (didJustFinish) {
    return 1;
  }
  if (
    !Number.isFinite(currentTime) ||
    !Number.isFinite(duration) ||
    duration <= 0
  ) {
    return 0;
  }
  return Math.max(0, Math.min(1, currentTime / duration));
};
const VOICE_PROGRESS_UPDATE_MS = 100;
const WAVE_KNOB_SIZE = 12;
const RECORD_WAVE_KNOB_SIZE = 13;
const progressKnobLeft = (
  progress: number,
  trackWidth: number,
  knobSize: number,
) => progress * Math.max(0, trackWidth - knobSize);
const progressFillWidth = (
  progress: number,
  trackWidth: number,
  knobSize: number,
) =>
  trackWidth > 0
    ? progressKnobLeft(progress, trackWidth, knobSize) + knobSize / 2
    : 0;
const waveformFromDuration = (seconds: number) =>
  VOICE_WAVEFORM.map((bar, index) =>
    Math.max(4, Math.min(39, bar + ((Math.floor(seconds) + index) % 5) - 2)),
  );
const audioMimeType = (uri: string) => {
  const cleanUri = uri.split('?')[0].toLowerCase();
  if (cleanUri.endsWith('.wav')) {
    return 'audio/wav';
  }
  if (
    cleanUri.endsWith('.aac') ||
    cleanUri.endsWith('.3gp') ||
    cleanUri.endsWith('.webm')
  ) {
    // The backend transcodes recorder bytes with ffmpeg, but its documented
    // allow-list omits native AAC/3GP/WebM labels. Use its accepted audio MIME
    // so native recorder output is not rejected as an unsupported file.
    return 'audio/mp4';
  }
  if (cleanUri.endsWith('.mp3')) {
    return 'audio/mpeg';
  }
  return 'audio/mp4';
};

function ChatAvatar({
  contact,
  small = false,
}: {
  contact: ConversationContact;
  small?: boolean;
}) {
  const sizeStyle = small ? styles.messageAvatar : styles.avatar;
  return contact.thumbnail ? (
    <Image source={{ uri: contact.thumbnail }} style={sizeStyle} />
  ) : (
    <View style={[styles.avatarFallback, sizeStyle]}>
      <Text style={styles.avatarInitial}>{initialsOf(contact.name)}</Text>
    </View>
  );
}

function EmptyConversation({ name }: { name: string }) {
  return (
    <View style={styles.emptyState}>
      <ConnectedChatIllustration />
      <Text
        accessibilityRole="header"
        accessibilityLabel={`You're connected with ${name}`}
        style={styles.connectedTitle}
      >
        You're connected with {name}
      </Text>
      <Text style={styles.connectedCopy}>
        Start the conversation by sending your{`\n`}first message.
      </Text>
    </View>
  );
}

function PrivacyBanner() {
  return (
    <View style={styles.privacyBanner}>
      <View style={styles.shield}>
        <Text style={styles.shieldText}>♙</Text>
      </View>
      <View style={styles.privacyCopy}>
        <Text style={styles.privacyTitle}>Your conversation is private</Text>
        <Text style={styles.privacyText}>
          Messages and calls in this chat are protected with end-to-end
          encryption. Only you and this contact can read them.{' '}
          <Text style={styles.learnMore}>Learn more</Text>
        </Text>
      </View>
    </View>
  );
}

function TimerMessageIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6 7h12M6 11h8M4 3h16v14h-8l-5 4v-4H4V3Z"
        stroke={themeInk('#344054')}
        strokeWidth={1.55}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M15.5 14.2a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2ZM15.5 16.2v2.1l1.4 1"
        stroke={themeInk('#344054')}
        strokeWidth={1.25}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function RecordingClockIcon() {
  return (
    <Svg width={15} height={15} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={8.5} stroke="#526176" strokeWidth={1.6} />
      <Path
        d="M12 7v5l3 2"
        stroke="#526176"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function DisappearingTimerNotice({
  message,
  onUpdate,
}: {
  message: ChatMessage;
  onUpdate: () => void;
}) {
  const copy = disappearingTimerEventCopy(message.disappearingTimer || 'off');
  return (
    <View accessibilityLabel={copy.title} style={styles.timerNoticeCard}>
      <View style={styles.timerNoticeHeader}>
        <View style={styles.timerNoticeIcon}>
          <TimerMessageIcon />
        </View>
        <View style={styles.timerNoticeCopy}>
          <Text style={styles.timerNoticeTitle}>{copy.title}</Text>
          <Text style={styles.timerNoticeBody}>{copy.body}</Text>
        </View>
      </View>
      <Pressable
        accessibilityLabel="Update Timer"
        accessibilityRole="button"
        onPress={onUpdate}
        style={styles.timerNoticeButton}
      >
        <Text style={styles.timerNoticeButtonText}>Update Timer</Text>
      </Pressable>
    </View>
  );
}

type OutgoingCallStatus = 'calling' | 'ringing' | 'connected' | 'reconnecting';
type ActiveCallState = {
  callId: string;
  chatId: string;
  type: CallType;
  status: OutgoingCallStatus;
  startedAt: string;
  connectedAt: string | null;
  muted: boolean;
  held: boolean;
  speaker: boolean;
  videoEnabled: boolean;
};
type CallControlIconName =
  | 'speaker'
  | 'video'
  | 'mute'
  | 'hold'
  | 'more'
  | 'end'
  | 'chat'
  | 'add'
  | 'down';

const normalizeOutgoingCallStatus = (status?: string): OutgoingCallStatus => {
  const value = String(status || '').toLowerCase();
  if (value === 'ringing') {
    return 'ringing';
  }
  if (value === 'connected') {
    return 'connected';
  }
  if (value === 'reconnecting') {
    return 'reconnecting';
  }
  return 'calling';
};

const formatCallTimer = (seconds: number) => {
  const safe = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(
    safe % 60,
  ).padStart(2, '0')}`;
};

function CallControlIcon({
  name,
  color = '#344256',
  crossed = false,
}: {
  name: CallControlIconName;
  color?: string;
  crossed?: boolean;
}) {
  if (name === 'speaker') {
    return (
      <Svg width={32} height={32} viewBox="0 0 32 32" fill="none">
        <Path
          d="M5.33333 20.0003H8L12.6667 26.0003C12.7832 26.2266 12.9769 26.4039 13.2127 26.4999C13.4484 26.5959 13.7108 26.6045 13.9523 26.524C14.1939 26.4435 14.3986 26.2792 14.5296 26.0609C14.6606 25.8426 14.7093 25.5846 14.6667 25.3336V6.66696C14.7093 6.41595 14.6606 6.15798 14.5296 5.93968C14.3986 5.72137 14.1939 5.55712 13.9523 5.47661C13.7108 5.3961 13.4484 5.40464 13.2127 5.50068C12.9769 5.59672 12.7832 5.77393 12.6667 6.00029L8 12.0003H5.33333C4.97971 12.0003 4.64057 12.1408 4.39052 12.3908C4.14048 12.6409 4 12.98 4 13.3336V18.667C4 19.0206 4.14048 19.3597 4.39052 19.6098C4.64057 19.8598 4.97971 20.0003 5.33333 20.0003Z"
          fill={color}
        />
        <Path
          d="M20 10.667C20.828 11.2879 21.5 12.0932 21.9628 13.0189C22.4257 13.9446 22.6667 14.9653 22.6667 16.0003C22.6667 17.0353 22.4257 18.056 21.9628 18.9817C21.5 19.9074 20.828 20.7126 20 21.3336M23.6 6.66696C24.992 7.79182 26.1147 9.21379 26.886 10.8287C27.6572 12.4436 28.0575 14.2106 28.0575 16.0003C28.0575 17.7899 27.6572 19.5569 26.886 21.1719C26.1147 22.7868 24.992 24.2088 23.6 25.3336M8 20.0003H5.33333C4.97971 20.0003 4.64057 19.8598 4.39052 19.6098C4.14048 19.3597 4 19.0206 4 18.667V13.3336C4 12.98 4.14048 12.6409 4.39052 12.3908C4.64057 12.1408 4.97971 12.0003 5.33333 12.0003H8L12.6667 6.00029C12.7832 5.77393 12.9769 5.59672 13.2127 5.50068C13.4484 5.40464 13.7108 5.3961 13.9523 5.47661C14.1939 5.55712 14.3986 5.72137 14.5296 5.93968C14.6606 6.15798 14.7093 6.41595 14.6667 6.66696V25.3336C14.7093 25.5846 14.6606 25.8426 14.5296 26.0609C14.3986 26.2792 14.1939 26.4435 13.9523 26.524C13.7108 26.6045 13.4484 26.5959 13.2127 26.4999C12.9769 26.4039 12.7832 26.2266 12.6667 26.0003L8 20.0003Z"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    );
  }
  if (name === 'video') {
    return (
      <Svg width={32} height={32} viewBox="0 0 32 32" fill="none">
        <Path
          d="M26.8227 10.169C26.5644 10.1391 26.303 10.1855 26.0707 10.3023L20 13.3356V18.669L26.0707 21.7023C26.2737 21.8037 26.4993 21.8517 26.726 21.8416C26.9527 21.8315 27.1731 21.7637 27.3663 21.6446C27.5595 21.5255 27.7192 21.359 27.83 21.161C27.9409 20.963 27.9994 20.7399 28 20.513V11.4916C27.9996 11.1653 27.8796 10.8504 27.6626 10.6066C27.4456 10.3629 27.1468 10.2071 26.8227 10.169Z"
          fill={color}
        />
        <Path
          d="M6.66675 6.66797C4.47341 6.66797 2.66675 8.47464 2.66675 10.668V21.3346C2.66675 23.528 4.47341 25.3346 6.66675 25.3346H17.3334C19.5267 25.3346 21.3334 23.528 21.3334 21.3346V10.668C21.3334 8.47464 19.5267 6.66797 17.3334 6.66797H6.66675Z"
          fill={color}
        />
      </Svg>
    );
  }
  if (name === 'mute') { return <CallMuteIcon muted={crossed}/>; }
  if (name === 'hold') { return <Svg width={24} height={24} viewBox="0 0 24 24" fill="none"><Path d="M8 5v14M16 5v14" stroke={color} strokeWidth={2.2} strokeLinecap="round"/></Svg>; }
  if (name === 'more') {
    return (
      <Svg width={32} height={32} viewBox="0 0 32 32" fill="none">
        <Path
          d="M14.6667 15.9987C14.6667 16.3523 14.8072 16.6915 15.0573 16.9415C15.3073 17.1916 15.6465 17.332 16.0001 17.332C16.3537 17.332 16.6928 17.1916 16.9429 16.9415C17.1929 16.6915 17.3334 16.3523 17.3334 15.9987C17.3334 15.6451 17.1929 15.3059 16.9429 15.0559C16.6928 14.8058 16.3537 14.6654 16.0001 14.6654C15.6465 14.6654 15.3073 14.8058 15.0573 15.0559C14.8072 15.3059 14.6667 15.6451 14.6667 15.9987ZM14.6667 25.332C14.6667 25.6857 14.8072 26.0248 15.0573 26.2748C15.3073 26.5249 15.6465 26.6654 16.0001 26.6654C16.3537 26.6654 16.6928 26.5249 16.9429 26.2748C17.1929 26.0248 17.3334 25.6857 17.3334 25.332C17.3334 24.9784 17.1929 24.6393 16.9429 24.3892C16.6928 24.1392 16.3537 23.9987 16.0001 23.9987C15.6465 23.9987 15.3073 24.1392 15.0573 24.3892C14.8072 24.6393 14.6667 24.9784 14.6667 25.332ZM14.6667 6.66536C14.6667 7.01899 14.8072 7.35812 15.0573 7.60817C15.3073 7.85822 15.6465 7.9987 16.0001 7.9987C16.3537 7.9987 16.6928 7.85822 16.9429 7.60817C17.1929 7.35812 17.3334 7.01899 17.3334 6.66536C17.3334 6.31174 17.1929 5.9726 16.9429 5.72256C16.6928 5.47251 16.3537 5.33203 16.0001 5.33203C15.6465 5.33203 15.3073 5.47251 15.0573 5.72256C14.8072 5.9726 14.6667 6.31174 14.6667 6.66536Z"
          fill={color}
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    );
  }
  if (name === 'end') {
    return (
      <Svg width={32} height={32} viewBox="0 0 32 32" fill="none">
        <Path
          d="M24.3394 21.3346L27.3719 18.2172C27.7741 17.8038 28 17.2431 28 16.6585C28 16.0739 27.7741 15.5132 27.3719 15.0998C20.8808 9.1907 11.1192 9.1907 4.62805 15.0998C4.22592 15.5132 4 16.0739 4 16.6585C4 17.2431 4.22592 17.8038 4.62805 18.2172L7.66057 21.3346L12.9675 18.9966L12.2094 15.8791C14.6676 15.0214 17.3324 15.0214 19.7906 15.8791L19.0325 18.9966L24.3394 21.3346Z"
          fill="white"
        />
      </Svg>
    );
  }
  if (name === 'chat') {
    return (
      <Svg width={32} height={32} viewBox="0 0 32 32" fill="none">
        <Path
          d="M24.0001 4C25.4146 4 26.7711 4.5619 27.7713 5.5621C28.7715 6.56229 29.3334 7.91885 29.3334 9.33333V20C29.3334 21.4145 28.7715 22.771 27.7713 23.7712C26.7711 24.7714 25.4146 25.3333 24.0001 25.3333H17.7014L11.3521 29.1427C11.1609 29.2574 10.9439 29.3224 10.7211 29.3316C10.4983 29.3408 10.2767 29.294 10.0767 29.1954C9.87665 29.0969 9.70453 28.9497 9.57607 28.7674C9.44762 28.5851 9.36694 28.3735 9.34141 28.152L9.33341 28V25.3333H8.00008C6.63176 25.3333 5.31578 24.8074 4.32433 23.8644C3.33289 22.9213 2.74183 21.6333 2.67341 20.2667L2.66675 20V9.33333C2.66675 7.91885 3.22865 6.56229 4.22885 5.5621C5.22904 4.5619 6.58559 4 8.00008 4H24.0001ZM18.6667 16H10.6667C10.3131 16 9.97399 16.1405 9.72394 16.3905C9.47389 16.6406 9.33341 16.9797 9.33341 17.3333C9.33341 17.687 9.47389 18.0261 9.72394 18.2761C9.97399 18.5262 10.3131 18.6667 10.6667 18.6667H18.6667C19.0204 18.6667 19.3595 18.5262 19.6096 18.2761C19.8596 18.0261 20.0001 17.687 20.0001 17.3333C20.0001 16.9797 19.8596 16.6406 19.6096 16.3905C19.3595 16.1405 19.0204 16 18.6667 16ZM21.3334 10.6667H10.6667C10.3131 10.6667 9.97399 10.8071 9.72394 11.0572C9.47389 11.3072 9.33341 11.6464 9.33341 12C9.33341 12.3536 9.47389 12.6928 9.72394 12.9428C9.97399 13.1929 10.3131 13.3333 10.6667 13.3333H21.3334C21.687 13.3333 22.0262 13.1929 22.2762 12.9428C22.5263 12.6928 22.6667 12.3536 22.6667 12C22.6667 11.6464 22.5263 11.3072 22.2762 11.0572C22.0262 10.8071 21.687 10.6667 21.3334 10.6667Z"
          fill={color}
        />
      </Svg>
    );
  }
  const paths: Record<CallControlIconName, string[]> = {
    hold: ['M8 5v14M16 5v14'],
    speaker: [
      'M6 10h3.2L14 6v12l-4.8-4H6v-4Z',
      'M17 9.2a4.2 4.2 0 0 1 0 5.6M19.5 6.8a7.6 7.6 0 0 1 0 10.4',
    ],
    video: [
      'M5 7h9.5a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z',
      'm16.5 10 4-2.2v8.4l-4-2.2',
    ],
    mute: [
      'M9 5.8a3 3 0 0 1 6 0V11a3 3 0 0 1-6 0V5.8Z',
      'M6.8 10.5a5.2 5.2 0 0 0 10.4 0M12 15.8V20M9.2 20h5.6',
    ],
    more: ['M12 7.5h.01M12 12h.01M12 16.5h.01'],
    end: [
      'M6.2 13.8c3.5-2.4 8.1-2.4 11.6 0l-1.6 2.7c-.2.4-.7.6-1.1.4l-2-.9c-.7-.3-1.5-.3-2.2 0l-2 .9c-.4.2-.9 0-1.1-.4l-1.6-2.7Z',
    ],
    chat: [
      'M5.2 6.5h13.6a2.2 2.2 0 0 1 2.2 2.2v6.2a2.2 2.2 0 0 1-2.2 2.2h-6L8 20v-2.9H5.2A2.2 2.2 0 0 1 3 14.9V8.7a2.2 2.2 0 0 1 2.2-2.2Z',
      'M7.8 10.2h8.4M7.8 13.4h5.6',
    ],
    add: [
      'M9 8.4a3.2 3.2 0 1 0 0 6.4 3.2 3.2 0 0 0 0-6.4ZM3.7 20c.6-2.6 2.4-3.9 5.3-3.9 1.1 0 2.1.2 2.9.6M17.2 9v7M13.7 12.5h7',
    ],
    down: ['m7 10 5 5 5-5'],
  };
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      {paths[name].map(path => (
        <Path
          d={path}
          key={path}
          stroke={color}
          strokeWidth={1.65}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {crossed ? (
        <Path
          d="M4.5 4.5 19.5 19.5"
          stroke={color}
          strokeWidth={1.9}
          strokeLinecap="round"
        />
      ) : null}
    </Svg>
  );
}

function MicrophonePermissionSheet({
  onAllow,
  onDismiss,
  visible,
}: {
  onAllow: () => void;
  onDismiss: () => void;
  visible: boolean;
}) {
  return (
    <Modal
      animationType="fade"
      onRequestClose={onDismiss}
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <View style={styles.callPermissionBackdrop}>
        <Pressable
          accessibilityLabel="Dismiss microphone permission"
          onPress={onDismiss}
          style={StyleSheet.absoluteFill}
        />
        <View
          accessibilityLabel="Allow Microphone Access"
          style={styles.callPermissionSheet}
        >
          <View style={styles.callSheetHandle} />
          <Pressable
            accessibilityLabel="Close microphone permission"
            onPress={onDismiss}
            style={styles.callPermissionClose}
          >
            <Text style={styles.callPermissionCloseText}>x</Text>
          </Pressable>
          <View style={styles.callPermissionIcon}>
            <CompactMicrophoneIcon active />
          </View>
          <Text style={styles.callPermissionTitle}>
            Allow Microphone Access
          </Text>
          <Text style={styles.callPermissionText}>
            Allow microphone access to make{'\n'}calls and send voice messages.
          </Text>
          <Pressable
            accessibilityLabel="Allow microphone access"
            onPress={onAllow}
            style={styles.callPermissionPrimary}
          >
            <Text style={styles.callPermissionPrimaryText}>Allow Access</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="Not now microphone access"
            onPress={onDismiss}
            style={styles.callPermissionSecondary}
          >
            <Text style={styles.callPermissionSecondaryText}>Not Now</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function CallControlButton({
  accessibilityLabel,
  active = false,
  crossed = false,
  danger = false,
  disabled = false,
  icon,
  label,
  onPress,
}: {
  accessibilityLabel?: string;
  active?: boolean;
  crossed?: boolean;
  danger?: boolean;
  disabled?: boolean;
  icon: CallControlIconName;
  label: string;
  onPress: () => void;
}) {
  const iconColor = danger
    ? '#FFFFFF'
    : disabled
    ? '#C7CED8'
    : active
    ? '#1877F2'
    : icon === 'more'
    ? '#1E293B'
    : '#334155';
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel || label}
      accessibilityState={{ disabled, selected: active }}
      disabled={disabled}
      onPress={onPress}
      style={styles.callControl}
    >
      <View
        style={[
          styles.callControlButton,
          danger && styles.callControlButtonDanger,
          active && !danger && styles.callControlButtonActive,
          disabled && styles.callControlButtonDisabled,
        ]}
      >
        <CallControlIcon color={iconColor} crossed={crossed} name={icon} />
      </View>
      <Text
        style={[
          styles.callControlLabel,
          danger && styles.callControlLabelDanger,
          disabled && styles.callControlLabelDisabled,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function OutgoingCallScreen({
  call,
  contact,
  durationSeconds,
  insets,
  localVideoUrl,
  remoteScreenLive = false,
  remoteVideoUrl,
  sharingScreen = false,
  onEnd,
  onHide,
  onMore,
  onStopSharing,
  onToggleHold,
  onToggleMute,
  onToggleSpeaker,
  onToggleVideo,
  onOpenChat,
}: {
  call: ActiveCallState;
  contact: ConversationContact;
  durationSeconds: number;
  insets: { top: number; bottom: number };
  localVideoUrl: string;
  remoteScreenLive?: boolean;
  remoteVideoUrl: string;
  sharingScreen?: boolean;
  onEnd: () => void;
  onHide: () => void;
  onMore: () => void;
  onStopSharing?: () => void;
  onToggleHold: () => void;
  onToggleMute: () => void;
  onToggleSpeaker: () => void;
  onToggleVideo: () => void;
  onOpenChat: () => void;
}) {
  const connected = call.status === 'connected';
  // In a voice call the other side's shared screen arrives on the reserved
  // video lane; it is shown in place of the avatar while it is live.
  const showRemoteScreen =
    call.type !== 'video' && remoteScreenLive && Boolean(remoteVideoUrl);
  const detail = connected
    ? formatCallTimer(durationSeconds)
    : call.status === 'ringing'
    ? 'Ringing...'
    : call.status === 'reconnecting'
    ? 'Reconnecting...'
    : 'Calling...';

  return (
    <Modal
      animationType="fade"
      onRequestClose={onHide}
      statusBarTranslucent
      visible
    >
      <View
        accessibilityLabel={`One-to-One ${
          call.type === 'video' ? 'Video' : 'Voice'
        } Call ${call.status}`}
        style={[
          styles.callScreen,
          {
            paddingTop: Math.max(insets.top, 24),
            paddingBottom: Math.max(insets.bottom, 12),
          },
        ]}
      >
        {call.type === 'video' && remoteVideoUrl ? (
          <CallVideoView
            mirror={false}
            objectFit="cover"
            streamURL={remoteVideoUrl}
            zOrder={0}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        {call.type === 'video' ? (
          <DraggableCallPreview style={styles.callLocalVideo}>{call.videoEnabled && localVideoUrl ? (
            <CallVideoView
              mirror
              objectFit="cover"
              streamURL={localVideoUrl}
              zOrder={1}
              style={StyleSheet.absoluteFill}
            />
          ) : (
            <View
              accessibilityLabel={call.videoEnabled ? 'Your video preview is starting' : 'Your camera is off'}
              style={[StyleSheet.absoluteFill, styles.callLocalVideoPlaceholder]}
            >
              <CallControlIcon color="#CBD5E1" name="video" />
              <Text style={styles.callLocalVideoPlaceholderText}>
                {call.videoEnabled ? 'Starting video' : 'Camera off'}
              </Text>
            </View>
          )}</DraggableCallPreview>
        ) : null}
        <View style={styles.callTopBar}>
          {connected ? (
            <Pressable
              accessibilityLabel="Minimize call"
              onPress={onHide}
              style={styles.callTopButton}
            >
              <CallControlIcon name="down" />
            </Pressable>
          ) : <View style={styles.callTopButton} />}
          <Pressable
            accessibilityLabel="Add Person"
            accessibilityState={{ disabled: !connected }}
            disabled={!connected}
            onPress={onMore}
            style={[
              styles.callTopButton,
              !connected && styles.callTopButtonDisabled,
            ]}
          >
            <CallControlIcon
              color={connected ? '#111827' : '#B8C0CC'}
              name="add"
            />
          </Pressable>
        </View>
        <View style={styles.callIdentity}>
          <Text style={styles.callName}>{contact.name}</Text>
          <Text style={styles.callSubtitle}>
            Outgoing {call.type === 'video' ? 'Video' : 'Audio'} Call
          </Text>
          <Text accessibilityLabel={detail} style={styles.callDetail}>
            {detail}
          </Text>
          {showRemoteScreen ? (
            <View
              accessibilityLabel={`${contact.name} is sharing their screen`}
              style={styles.callRemoteScreen}
            >
              <CallVideoView
                mirror={false}
                objectFit="contain"
                streamURL={remoteVideoUrl}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.callRemoteScreenLabel}>
                <Text numberOfLines={1} style={styles.callRemoteScreenText}>
                  {contact.name} is sharing their screen
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.callAvatarWrap}>
              {contact.thumbnail ? (
                <Image
                  source={{ uri: contact.thumbnail }}
                  style={styles.callAvatar}
                />
              ) : (
                <View style={[styles.callAvatar, styles.callAvatarFallback]}>
                  <Text style={styles.callAvatarInitial}>
                    {initialsOf(contact.name)}
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>
        {sharingScreen ? (
          <View
            accessibilityLabel="You are sharing your screen"
            style={styles.callSharingBanner}
          >
            <Text style={styles.callSharingText}>
              You are sharing your screen
            </Text>
            <Pressable
              accessibilityLabel="Stop sharing your screen"
              onPress={onStopSharing}
              style={styles.callSharingStop}
            >
              <Text style={styles.callSharingStopText}>Stop</Text>
            </Pressable>
          </View>
        ) : null}
        <View style={styles.callControlsGrid}>
          <CallControlButton
            active={call.speaker}
            icon="speaker"
            label="Speaker"
            onPress={onToggleSpeaker}
          />
          <CallControlButton
            accessibilityLabel="Video"
            active={call.videoEnabled}
            disabled={!connected}
            icon="video"
            label="Video On"
            onPress={onToggleVideo}
          />
          <CallControlButton
            accessibilityLabel={call.muted ? 'Unmute' : 'Mute'}
            active={call.muted}
            crossed={call.muted}
            icon="mute"
            label="Mute"
            onPress={onToggleMute}
          />
          <CallControlButton
            accessibilityLabel={call.held ? 'Resume call' : 'Hold call'}
            active={call.held}
            disabled={!connected}
            icon="hold"
            label={call.held ? 'Resume' : 'Hold'}
            onPress={onToggleHold}
          />
          <CallControlButton
            disabled={!connected}
            icon="more"
            label="More"
            onPress={onMore}
          />
          <CallControlButton danger icon="end" label="End" onPress={onEnd} />
          <CallControlButton icon="chat" label="Chat" onPress={onOpenChat} />
        </View>
      </View>
    </Modal>
  );
}

function CallReconnectToggle({ enabled }: { enabled: boolean }) {
  return (
    <Svg
      accessibilityLabel={`Auto Reconnect ${enabled ? 'On' : 'Off'}`}
      accessibilityRole="switch"
      width={44}
      height={24}
      viewBox="0 0 44 24"
      fill="none"
    >
      <Rect
        x={0.25}
        y={0.25}
        width={43.5}
        height={23.5}
        rx={3.75}
        fill={enabled ? themeInk('#8B5CF6') : themeInk('#E2E8F0')}
      />
      <Rect
        x={0.25}
        y={0.25}
        width={43.5}
        height={23.5}
        rx={3.75}
        stroke={enabled ? themeInk('#7C3AED') : themeInk('#CBD5E1')}
        strokeWidth={0.5}
      />
      <Rect
        x={enabled ? 22 : 2}
        y={2}
        width={20}
        height={20}
        rx={2}
        fill="white"
      />
    </Svg>
  );
}

function CallOptionsSheet({
  audioOutputLabel,
  autoReconnect,
  insets,
  onAddPeople,
  onAudioOutput,
  onCallStatus,
  onClose,
  onMicrophoneSettings,
  onShareScreen,
  onToggleAutoReconnect,
  onViewContact,
  sharingScreen,
  visible,
}: {
  audioOutputLabel: string;
  autoReconnect: boolean;
  insets: { bottom: number };
  onAddPeople: () => void;
  onAudioOutput: () => void;
  onCallStatus: () => void;
  onClose: () => void;
  onMicrophoneSettings: () => void;
  onShareScreen: () => void;
  onToggleAutoReconnect: () => void;
  onViewContact: () => void;
  sharingScreen: boolean;
  visible: boolean;
}) {
  const row = (
    icon: OneToOneCallOptionIconName,
    label: string,
    onPress: () => void,
    trailing?: React.ReactNode,
  ) => (
    <Pressable
      accessibilityLabel={label}
      key={label}
      onPress={onPress}
      style={styles.callOptionRow}
    >
      <View style={styles.callOptionRowIcon}>
        <OneToOneCallOptionIcon name={icon} />
      </View>
      <Text style={styles.callOptionRowLabel}>{label}</Text>
      {trailing}
    </Pressable>
  );

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <View style={styles.callOptionsBackdrop}>
        <Pressable
          accessibilityLabel="Close call options backdrop"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View
          accessibilityLabel="More Options"
          style={[
            styles.callOptionsSheet,
            { paddingBottom: Math.max(insets.bottom, 14) },
          ]}
        >
          <View style={styles.callOptionsHeader}>
            <Text accessibilityRole="header" style={styles.callOptionsTitle}>
              More Options
            </Text>
            <Pressable
              accessibilityLabel="Close more options"
              hitSlop={10}
              onPress={onClose}
              style={styles.callOptionsClose}
            >
              <Text style={styles.callOptionsCloseText}>×</Text>
            </Pressable>
          </View>
          <View style={styles.callQuickOptions}>
            <Pressable
              accessibilityLabel="Add People to Call"
              onPress={onAddPeople}
              style={styles.callQuickOption}
            >
              <OneToOneCallOptionIcon name="add" />
              <Text style={styles.callQuickOptionLabel}>
                Add People to Call
              </Text>
            </Pressable>
            <Pressable
              accessibilityLabel={
                sharingScreen ? 'Stop screen sharing' : 'Share Screen'
              }
              onPress={onShareScreen}
              style={styles.callQuickOption}
            >
              <OneToOneCallOptionIcon name="share" />
              <Text style={styles.callQuickOptionLabel}>
                {sharingScreen ? 'Stop Sharing' : 'Share Screen'}
              </Text>
            </Pressable>
          </View>
          <View style={styles.callOptionRows}>
            {row(
              'speaker',
              'Audio Output',
              onAudioOutput,
              <View style={styles.callOptionValue}>
                <Text numberOfLines={1} style={styles.callOptionValueText}>
                  {audioOutputLabel}
                </Text>
              </View>,
            )}
            {row('microphone', 'Microphone Settings', onMicrophoneSettings)}
            {row(
              'reconnect',
              'Auto Reconnect',
              onToggleAutoReconnect,
              <CallReconnectToggle enabled={autoReconnect} />,
            )}
            {row('contact', 'View Contact', onViewContact)}
            {row('status', 'Call Status', onCallStatus)}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function CallSubSheetHeader({
  onClose,
  title,
}: {
  onClose: () => void;
  title: string;
}) {
  return (
    <View style={styles.callSubSheetHeader}>
      <Pressable
        accessibilityLabel={`Back from ${title}`}
        hitSlop={8}
        onPress={onClose}
        style={styles.callSubSheetHeaderButton}
      >
        <Text style={styles.callSubSheetBack}>‹</Text>
      </Pressable>
      <Text accessibilityRole="header" style={styles.callSubSheetTitle}>
        {title}
      </Text>
      <Pressable
        accessibilityLabel={`Close ${title}`}
        hitSlop={8}
        onPress={onClose}
        style={styles.callSubSheetHeaderButton}
      >
        <Text style={styles.callOptionsCloseText}>×</Text>
      </Pressable>
    </View>
  );
}

function AudioDeviceIcon({
  name,
}: {
  name: 'headset' | 'bluetooth' | 'wired' | 'none';
}) {
  if (name === 'none') {
    return (
      <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
        <Path
          d="M5 10h3l4-3v10l-4-3H5v-4Zm11-2 5 8m0-8-5 8"
          stroke={themeInk('#0B1220')}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    );
  }
  if (name === 'wired') {
    return (
      <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
        <Path
          d="M4 15v-3a8 8 0 0 1 16 0v3M4 15a2 2 0 0 1 2-2h1v6H6a2 2 0 0 1-2-2v-2Zm16 0a2 2 0 0 0-2-2h-1v6h1a2 2 0 0 0 2-2v-2Z"
          stroke={themeInk('#0B1220')}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    );
  }
  if (name === 'headset') {
    return (
      <Svg width={14} height={20} viewBox="0 0 14 20" fill="none">
        <Path
          d="M5.75 1.75H7.75M6.75 14.75V14.76M0.75 2.75C0.75 2.21957 0.960714 1.71086 1.33579 1.33579C1.71086 0.960714 2.21957 0.75 2.75 0.75H10.75C11.2804 0.75 11.7891 0.960714 12.1642 1.33579C12.5393 1.71086 12.75 2.21957 12.75 2.75V16.75C12.75 17.2804 12.5393 17.7891 12.1642 18.1642C11.7891 18.5393 11.2804 18.75 10.75 18.75H2.75C2.21957 18.75 1.71086 18.5393 1.33579 18.1642C0.960714 17.7891 0.75 17.2804 0.75 16.75V2.75Z"
          stroke={themeInk('#0B1220')}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    );
  }
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Path
        d="M7 8L17 16L12 20V4L17 8L7 16"
        stroke={themeInk('#0B1220')}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function AudioProcessingIcon() {
  return (
    <Svg width={19} height={18} viewBox="0 0 19 18" fill="none">
      <Path
        d="M15.7508 16.7508H5.25079L1.04079 12.4508C0.854542 12.2634 0.75 12.01 0.75 11.7458C0.75 11.4816 0.854542 11.2282 1.04079 11.0408L11.0408 1.04079C11.2282 0.854542 11.4816 0.75 11.7458 0.75C12.01 0.75 12.2634 0.854542 12.4508 1.04079L17.4508 6.04079C17.637 6.22815 17.7416 6.48161 17.7416 6.74579C17.7416 7.00998 17.637 7.26343 17.4508 7.45079L8.25079 16.7508M14.7508 10.0508L8.45079 3.75079"
        stroke={themeInk('#0B1220')}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function AudioOutputSheet({
  insets,
  onClose,
  onSelect,
  routes,
  selected,
  visible,
}: {
  insets: { bottom: number };
  onClose: () => void;
  onSelect: (route: CallAudioRoute) => void;
  routes: CallAudioRoute[];
  selected: string;
  visible: boolean;
}) {
  // The hardware actually connected (callAudioRoutes): a Bluetooth headset is
  // listed under its own name only while it is paired and on.
  const outputs = routes.map(route => ({
    route,
    label: route.label,
    icon:
      route.kind === 'bluetooth'
        ? ('bluetooth' as const)
        : route.kind === 'earpiece'
        ? ('headset' as const)
        : route.kind === 'none'
        ? ('none' as const)
        : route.kind === 'wired'
        ? ('wired' as const)
        : ('speaker' as const),
  }));
  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <View style={styles.callOptionsBackdrop}>
        <Pressable
          accessibilityLabel="Close Audio Output backdrop"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View
          accessibilityLabel="Audio Output options"
          style={[
            styles.callAudioOutputSheet,
            { paddingBottom: Math.max(insets.bottom, 12) },
          ]}
        >
          <CallSubSheetHeader onClose={onClose} title="Audio Output" />
          {outputs.map(output => (
            <Pressable
              accessibilityLabel={`Use ${output.label}`}
              accessibilityState={{ selected: selected === output.route.id }}
              key={output.route.id}
              onPress={() => onSelect(output.route)}
              style={styles.callOutputRow}
            >
              <View style={styles.callOutputIcon}>
                {output.icon === 'speaker' ? (
                  <OneToOneCallOptionIcon name="speaker" />
                ) : (
                  <AudioDeviceIcon name={output.icon} />
                )}
              </View>
              <Text numberOfLines={1} style={styles.callOutputLabel}>
                {output.label}
              </Text>
              {selected === output.route.id ? (
                <Text
                  accessibilityLabel={`${output.label} selected`}
                  style={styles.callOutputCheck}
                >
                  ✓
                </Text>
              ) : null}
            </Pressable>
          ))}
        </View>
      </View>
    </Modal>
  );
}

function MicrophoneSettingsSheet({
  echoCancellation,
  insets,
  noiseSuppression,
  onClose,
  onToggleEchoCancellation,
  onToggleNoiseSuppression,
  visible,
}: {
  echoCancellation: boolean;
  insets: { bottom: number };
  noiseSuppression: boolean;
  onClose: () => void;
  onToggleEchoCancellation: () => void;
  onToggleNoiseSuppression: () => void;
  visible: boolean;
}) {
  const setting = (label: string, enabled: boolean, onPress: () => void) => (
    <Pressable
      accessibilityLabel={label}
      key={label}
      onPress={onPress}
      style={styles.callMicrophoneRow}
    >
      <View style={styles.callMicrophoneSettingIcon}>
        <AudioProcessingIcon />
      </View>
      <Text style={styles.callOutputLabel}>{label}</Text>
      <CallReconnectToggle enabled={enabled} />
    </Pressable>
  );
  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <View style={styles.callOptionsBackdrop}>
        <Pressable
          accessibilityLabel="Close Microphone Settings backdrop"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View
          accessibilityLabel="Microphone Settings options"
          style={[
            styles.callMicrophoneSheet,
            { paddingBottom: Math.max(insets.bottom, 12) },
          ]}
        >
          <CallSubSheetHeader onClose={onClose} title="Microphone Settings" />
          {setting(
            'Echo Cancellation',
            echoCancellation,
            onToggleEchoCancellation,
          )}
          {setting(
            'Noise Suppression',
            noiseSuppression,
            onToggleNoiseSuppression,
          )}
        </View>
      </View>
    </Modal>
  );
}

function CallStatusSheet({
  autoReconnect,
  backendStatus,
  echoCancellation,
  insets,
  loading,
  networkAvailable,
  noiseSuppression,
  onClose,
  visible,
}: {
  autoReconnect: boolean;
  backendStatus: string;
  echoCancellation: boolean;
  insets: { bottom: number };
  loading: boolean;
  networkAvailable: boolean | null;
  noiseSuppression: boolean;
  onClose: () => void;
  visible: boolean;
}) {
  const reconnecting = backendStatus.toLowerCase() === 'reconnecting';
  const rows = [
    {
      label: 'Network Status',
      value: loading
        ? 'Checking'
        : networkAvailable === false
        ? 'Offline'
        : reconnecting
        ? 'Reconnecting'
        : 'Stable',
      positive: networkAvailable !== false && !reconnecting,
    },
    {
      label: 'Audio Quality',
      value:
        networkAvailable === false
          ? 'Unavailable'
          : reconnecting
          ? 'Fair'
          : 'Excellent',
    },
    { label: 'Auto Reconnect', value: autoReconnect ? 'Enabled' : 'Disabled' },
    { label: 'Echo Cancellation', value: echoCancellation ? 'Active' : 'Off' },
    { label: 'Noise Suppression', value: noiseSuppression ? 'Active' : 'Off' },
  ];
  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <View style={styles.callOptionsBackdrop}>
        <Pressable
          accessibilityLabel="Close Call Status backdrop"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View
          accessibilityLabel="Call Status details"
          style={[
            styles.callStatusSheet,
            { paddingBottom: Math.max(insets.bottom, 12) },
          ]}
        >
          <CallSubSheetHeader onClose={onClose} title="Call Status" />
          {rows.map(row => (
            <View
              accessibilityLabel={`${row.label}: ${row.value}`}
              key={row.label}
              style={styles.callStatusRow}
            >
              <Text style={styles.callStatusLabel}>{row.label}</Text>
              <View
                style={[
                  styles.callStatusValue,
                  row.positive && styles.callStatusValuePositive,
                ]}
              >
                <Text
                  style={[
                    styles.callStatusValueText,
                    row.positive && styles.callStatusValueTextPositive,
                  ]}
                >
                  {row.value}
                </Text>
              </View>
            </View>
          ))}
          <View style={styles.callStatusHandle} />
        </View>
      </View>
    </Modal>
  );
}

type CallParticipant = {
  id: string;
  userId: string | null;
  name: string;
  phone: string;
  thumbnail?: string | null;
};
type RegisteredCallParticipant = CallParticipant & { userId: string };

function callPhoneKey(value: unknown): string {
  return String(value || '').replace(/\D/g, '');
}

function AddPeopleToCallScreen({
  call,
  contact,
  durationSeconds,
  insets,
  loading,
  onAdd,
  onBack,
  onEnd,
  onOpenParticipant,
  onSearchChange,
  onToggleMute,
  onToggleParticipant,
  onToggleSpeaker,
  participants,
  search,
  selectedIds,
  submitting,
  visible,
}: {
  call: ActiveCallState | null;
  contact: ConversationContact;
  durationSeconds: number;
  insets: { top: number; bottom: number };
  loading: boolean;
  onAdd: () => void;
  onBack: () => void;
  onEnd: () => void;
  onOpenParticipant: (participant: RegisteredCallParticipant) => void;
  onSearchChange: (value: string) => void;
  onToggleMute: () => void;
  onToggleParticipant: (userId: string) => void;
  onToggleSpeaker: () => void;
  participants: CallParticipant[];
  search: string;
  selectedIds: Set<string>;
  submitting: boolean;
  visible: boolean;
}) {
  const needle = search.trim().toLowerCase();
  const filtered = participants.filter(
    person =>
      !needle ||
      `${person.name} ${person.phone}`.toLowerCase().includes(needle),
  );
  const participantRow = (person: CallParticipant) => (
    <View key={person.id} style={styles.callPeopleRow}>
      <Pressable
        accessibilityLabel={
          person.userId
            ? `Select ${person.name}`
            : `${person.name} is not on Chatterly`
        }
        accessibilityRole="radio"
        accessibilityState={{
          checked: person.userId ? selectedIds.has(person.userId) : false,
          disabled: !person.userId,
        }}
        disabled={!person.userId}
        hitSlop={7}
        onPress={() => person.userId && onToggleParticipant(person.userId)}
        style={[
          styles.callPeopleRadio,
          person.userId &&
            selectedIds.has(person.userId) &&
            styles.callPeopleRadioSelected,
          !person.userId && styles.callPeopleRadioUnavailable,
        ]}
      >
        {person.userId && selectedIds.has(person.userId) ? (
          <View style={styles.callPeopleRadioDot} />
        ) : null}
      </Pressable>
      <Pressable
        accessibilityLabel={
          person.userId
            ? `Open ${person.name} profile`
            : person.phone
            ? `${person.name}, not on Chatterly`
            : `${person.name}, no phone number`
        }
        disabled={!person.userId}
        onPress={() => {
          if (person.userId) {
            onOpenParticipant({ ...person, userId: person.userId });
          }
        }}
        style={styles.callPeopleProfile}
      >
        {person.thumbnail ? (
          <Image
            source={{ uri: person.thumbnail }}
            style={styles.callPeopleAvatar}
          />
        ) : (
          <View
            style={[styles.callPeopleAvatar, styles.callPeopleAvatarFallback]}
          >
            <Text style={styles.callPeopleAvatarText}>
              {initialsOf(person.name)}
            </Text>
          </View>
        )}
        <View style={styles.callPeopleCopy}>
          <Text style={styles.callPeopleName}>{person.name}</Text>
          <Text numberOfLines={1} style={styles.callPeopleSubtitle}>
            {person.phone ||
              (person.userId ? 'Chatterly contact' : 'No phone number')}
            {!person.userId && person.phone ? ' · Not on Chatterly' : ''}
          </Text>
        </View>
      </Pressable>
    </View>
  );

  return (
    <Modal
      animationType="slide"
      onRequestClose={onBack}
      statusBarTranslucent
      visible={visible}
    >
      <View
        accessibilityLabel="Add People"
        style={[
          styles.callPeopleScreen,
          {
            paddingTop: Math.max(insets.top, 18),
            paddingBottom: Math.max(insets.bottom, 10),
          },
        ]}
      >
        <View style={styles.callPeopleCallBar}>
          <Pressable
            accessibilityLabel="Back to call options"
            onPress={onBack}
            style={styles.callPeopleBack}
          >
            <Text style={styles.callPeopleBackText}>‹</Text>
          </Pressable>
          <View style={styles.callPeopleCallCopy}>
            <Text numberOfLines={1} style={styles.callPeopleCallName}>
              {contact.name}
            </Text>
            <Text style={styles.callPeopleCallTimer}>
              {formatCallTimer(durationSeconds)}
            </Text>
          </View>
          <Pressable
            accessibilityLabel="Toggle speaker from add people"
            onPress={onToggleSpeaker}
            style={[
              styles.callPeopleControl,
              call?.speaker && styles.callPeopleControlActive,
            ]}
          >
            <CallControlIcon
              color={call?.speaker ? '#6F28F5' : '#344256'}
              name="speaker"
            />
          </Pressable>
          <Pressable
            accessibilityLabel="Toggle mute from add people"
            onPress={onToggleMute}
            style={[
              styles.callPeopleControl,
              call?.muted && styles.callPeopleControlActive,
            ]}
          >
            <CallControlIcon
              color={call?.muted ? '#6F28F5' : '#344256'}
              crossed={call?.muted}
              name="mute"
            />
          </Pressable>
          <Pressable
            accessibilityLabel="End call from add people"
            onPress={onEnd}
            style={styles.callPeopleEnd}
          >
            <CallControlIcon color="#FFFFFF" name="end" />
          </Pressable>
        </View>
        <Text accessibilityRole="header" style={styles.callPeopleTitle}>
          Add People
        </Text>
        <View style={styles.callPeopleSearch}>
          <Text style={styles.callPeopleSearchGlyph}>⌕</Text>
          <TextInput
            accessibilityLabel="Search call contacts"
            onChangeText={onSearchChange}
            placeholder="Search Contacts"
            placeholderTextColor="#7C8799"
            style={styles.callPeopleSearchInput}
            value={search}
          />
          <Text style={styles.callPeopleGridGlyph}>⠿</Text>
        </View>
        {loading ? (
          <ActivityIndicator
            accessibilityLabel="Loading call contacts"
            color="#8B5CF6"
            style={styles.callPeopleLoading}
          />
        ) : (
          <ScrollView
            contentContainerStyle={styles.callPeopleList}
            showsVerticalScrollIndicator={false}
          >
            {filtered.length ? (
              <>
                <Text style={styles.callPeopleSection}>Recently Contacted</Text>
                {filtered.slice(0, 3).map(participantRow)}
                <Text style={styles.callPeopleSection}>All Chats</Text>
                {filtered.map(participantRow)}
              </>
            ) : (
              <Text style={styles.callPeopleEmpty}>
                {search
                  ? 'No matching contacts found.'
                  : 'No contacts found on this device.'}
              </Text>
            )}
          </ScrollView>
        )}
        <Pressable
          accessibilityLabel="Add selected people to call"
          accessibilityState={{
            disabled: selectedIds.size === 0 || submitting,
          }}
          disabled={selectedIds.size === 0 || submitting}
          onPress={onAdd}
          style={[
            styles.callPeopleAdd,
            (selectedIds.size === 0 || submitting) &&
              styles.callPeopleAddDisabled,
          ]}
        >
          {submitting ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={styles.callPeopleAddText}>Add to Call</Text>
          )}
        </Pressable>
      </View>
    </Modal>
  );
}

function CallContactScreen({
  call,
  callContact,
  durationSeconds,
  insets,
  loading,
  media,
  onBack,
  onEnd,
  onMessage,
  onSearch,
  onToggleMute,
  onToggleSpeaker,
  profile,
  visible,
}: {
  call: ActiveCallState | null;
  callContact: ConversationContact;
  durationSeconds: number;
  insets: { top: number; bottom: number };
  loading: boolean;
  media: ChatMessage[];
  onBack: () => void;
  onEnd: () => void;
  onMessage: () => void;
  onSearch: () => void;
  onToggleMute: () => void;
  onToggleSpeaker: () => void;
  profile: ChatProfile | null;
  visible: boolean;
}) {
  const name = profile?.name || callContact.name;
  const picture = profile?.profilePic || callContact.thumbnail;
  const about =
    profile?.status &&
    !['online', 'offline', 'away'].includes(profile.status.toLowerCase())
      ? profile.status
      : 'We simply exist to eat healthy ! 🏆';
  return (
    <Modal
      animationType="slide"
      onRequestClose={onBack}
      statusBarTranslucent
      visible={visible}
    >
      <View
        accessibilityLabel={`${name} in-call profile`}
        style={[
          styles.callContactScreen,
          {
            paddingTop: Math.max(insets.top, 18),
            paddingBottom: Math.max(insets.bottom, 10),
          },
        ]}
      >
        <View style={styles.callPeopleCallBar}>
          <Pressable
            accessibilityLabel="Back to add people"
            onPress={onBack}
            style={styles.callPeopleBack}
          >
            <Text style={styles.callPeopleBackText}>‹</Text>
          </Pressable>
          <View style={styles.callPeopleCallCopy}>
            <Text numberOfLines={1} style={styles.callPeopleCallName}>
              {callContact.name}
            </Text>
            <Text style={styles.callPeopleCallTimer}>
              {formatCallTimer(durationSeconds)}
            </Text>
          </View>
          <Pressable
            accessibilityLabel="Toggle speaker from contact profile"
            onPress={onToggleSpeaker}
            style={[
              styles.callPeopleControl,
              call?.speaker && styles.callPeopleControlActive,
            ]}
          >
            <CallControlIcon
              color={call?.speaker ? '#6F28F5' : '#344256'}
              name="speaker"
            />
          </Pressable>
          <Pressable
            accessibilityLabel="Toggle mute from contact profile"
            onPress={onToggleMute}
            style={[
              styles.callPeopleControl,
              call?.muted && styles.callPeopleControlActive,
            ]}
          >
            <CallControlIcon
              color={call?.muted ? '#6F28F5' : '#344256'}
              crossed={call?.muted}
              name="mute"
            />
          </Pressable>
          <Pressable
            accessibilityLabel="End call from contact profile"
            onPress={onEnd}
            style={styles.callPeopleEnd}
          >
            <CallControlIcon color="#FFFFFF" name="end" />
          </Pressable>
        </View>
        {loading && !profile ? (
          <ActivityIndicator
            accessibilityLabel="Loading contact profile"
            color="#8B5CF6"
            style={styles.callContactLoading}
          />
        ) : (
          <ScrollView
            contentContainerStyle={styles.callContactContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.callContactAvatarWrap}>
              {picture ? (
                <Image
                  source={{ uri: picture }}
                  style={styles.callContactAvatar}
                />
              ) : (
                <View
                  style={[
                    styles.callContactAvatar,
                    styles.callPeopleAvatarFallback,
                  ]}
                >
                  <Text style={styles.callContactAvatarText}>
                    {initialsOf(name)}
                  </Text>
                </View>
              )}
              <View style={styles.callContactOnline} />
            </View>
            <Text accessibilityRole="header" style={styles.callContactName}>
              {name}
            </Text>
            <Text numberOfLines={2} style={styles.callContactAbout}>
              {about}
            </Text>
            <Text style={styles.callContactPhone}>
              {profile?.phone || 'Phone number unavailable'}
            </Text>
            <View style={styles.callContactActions}>
              <Pressable
                accessibilityLabel={`Message ${name}`}
                onPress={onMessage}
                style={styles.callContactAction}
              >
                <View style={styles.callContactActionIcon}>
                  <CallControlIcon name="chat" />
                </View>
                <Text style={styles.callContactActionLabel}>Message</Text>
              </Pressable>
              <Pressable
                accessibilityLabel={`Search ${name} chat`}
                onPress={onSearch}
                style={styles.callContactAction}
              >
                <View style={styles.callContactActionIcon}>
                  <Text style={styles.callContactSearchIcon}>⌕</Text>
                </View>
                <Text style={styles.callContactActionLabel}>Search</Text>
              </Pressable>
            </View>
            <View style={styles.callContactDivider} />
            <View style={styles.callContactMediaHeader}>
              <Text style={styles.callContactMediaTitle}>
                Media, Docs and links{' '}
                <Text style={styles.callContactMediaCount}>{media.length}</Text>
              </Text>
              <Pressable
                accessibilityLabel="View all call contact media"
                onPress={onSearch}
              >
                <Text style={styles.callContactViewAll}>View All</Text>
              </Pressable>
            </View>
            <View style={styles.callContactMediaRow}>
              {media.slice(0, 4).map(item => (
                <Pressable
                  accessibilityLabel="Open call contact media"
                  key={item.id}
                  onPress={onSearch}
                  style={styles.callContactMediaTile}
                >
                  {item.messageType === 'image' || item.thumbnailUrl ? (
                    <Image
                      source={{ uri: item.thumbnailUrl || item.mediaUrl }}
                      style={styles.callContactMediaImage}
                    />
                  ) : (
                    <View
                      style={[
                        styles.callContactMediaImage,
                        styles.callContactMediaFallback,
                      ]}
                    >
                      <Text style={styles.callContactMediaFallbackText}>
                        {item.messageType === 'video' ? '▶' : '♪'}
                      </Text>
                    </View>
                  )}
                </Pressable>
              ))}
            </View>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

function CallFailedDialog({
  name,
  onCallAgain,
  onCancel,
  visible,
}: {
  name: string;
  onCallAgain: () => void;
  onCancel: () => void;
  visible: boolean;
}) {
  return (
    <Modal
      animationType="fade"
      onRequestClose={onCancel}
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <View style={styles.callFailedBackdrop}>
        <BlurView
          intensity={Platform.OS === 'ios' ? 24 : 16}
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
          tint="light"
        />
        <View style={styles.callFailedShade} />
        <View
          accessibilityLabel="Call Failed"
          accessibilityRole="alert"
          style={styles.callFailedCard}
        >
          <View style={styles.callFailedIcon}>
            <CallControlIcon color="#EF2A2D" crossed name="end" />
          </View>
          <Text style={styles.callFailedTitle}>Call Failed</Text>
          <Text style={styles.callFailedCopy}>
            Couldn't connect your call with {name}.{`\n`}Please try again.
          </Text>
          <Pressable
            accessibilityLabel="Call Again"
            onPress={onCallAgain}
            style={styles.callFailedAction}
          >
            <Text style={styles.callFailedActionText}>Call Again</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="Cancel"
            onPress={onCancel}
            style={styles.callFailedCancel}
          >
            <Text style={styles.callFailedCancelText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function messagePinPreview(message: ChatMessage): string {
  if (message.text.trim()) {
    return message.text.trim();
  }
  if (message.locationName) {
    return message.locationName;
  }
  if (message.fileName) {
    return message.fileName;
  }
  if (message.messageType === 'image') {
    return 'Photo';
  }
  if (message.messageType === 'video') {
    return 'Video';
  }
  if (message.messageType === 'audio') {
    return 'Voice message';
  }
  if (message.messageType === 'file') {
    return 'Document';
  }
  return 'Message';
}

function pinnedAtTime(message: ChatMessage): number {
  return Date.parse(message.pinnedAt || message.createdAt || '') || 0;
}

function applyPinnedSnapshot(
  thread: ChatMessage[],
  pinned: ChatMessage[],
): ChatMessage[] {
  const pinnedById = new Map(pinned.map(message => [message.id, message]));
  let merged = thread.map(message => {
    const pin = pinnedById.get(message.id);
    return pin
      ? {
          ...message,
          isPinned: true,
          pinnedAt:
            pin.pinnedAt || message.pinnedAt || new Date().toISOString(),
        }
      : { ...message, isPinned: false, pinnedAt: null };
  });
  pinned.forEach(message => {
    if (!merged.some(item => item.id === message.id)) {
      merged.push({
        ...message,
        isPinned: true,
        pinnedAt: message.pinnedAt || new Date().toISOString(),
      });
    }
  });
  return sortByTime(merged);
}

function PinnedMessagesPanel({
  expanded,
  messages,
  onLongPress,
  onSelect,
  onToggle,
}: {
  expanded: boolean;
  messages: ChatMessage[];
  onLongPress: (message: ChatMessage) => void;
  onSelect: (message: ChatMessage) => void;
  onToggle: () => void;
}) {
  const latest = messages[0];
  if (!latest) {
    return null;
  }

  return (
    <View
      accessibilityLabel={`${messages.length} pinned ${
        messages.length === 1 ? 'message' : 'messages'
      }`}
      style={styles.pinnedPanel}
    >
      <Pressable
        accessibilityHint="Pinned until unpinned. Tap to open, long press for pinned message actions"
        accessibilityLabel={`Pinned message: ${messagePinPreview(latest)}`}
        onLongPress={() => onLongPress(latest)}
        onPress={() => onSelect(latest)}
        style={styles.pinnedTopRow}
      >
        {messages.length > 1 ? (
          // Preserve the banner alignment without a second expand control.
          <View style={styles.pinnedStackSpacer} />
        ) : null}
        <View style={styles.pinnedIconBox}>
          <PinMarkerIcon size={13} />
        </View>
        <View style={styles.pinnedMessageCopy}>
          <Text numberOfLines={1} style={styles.pinnedPreview}>
            {messagePinPreview(latest)}
          </Text>
          <Text style={styles.pinnedDuration}>Pinned until unpinned</Text>
        </View>
        {messages.length > 1 ? (
          <Pressable
            accessibilityLabel={
              expanded ? 'Collapse pinned messages' : 'Expand pinned messages'
            }
            accessibilityState={{ expanded }}
            hitSlop={8}
            onPress={onToggle}
            style={[styles.pinnedChevron, expanded && styles.pinnedChevronOpen]}
          >
            <ChevronDownIcon />
          </Pressable>
        ) : null}
      </Pressable>
      {expanded && messages.length > 1 ? (
        <View style={styles.pinnedDropdown}>
          {messages.slice(1).map(message => (
            <Pressable
              accessibilityHint="Pinned until unpinned. Tap to open, long press for pinned message actions"
              accessibilityLabel={`Pinned message: ${messagePinPreview(
                message,
              )}`}
              key={message.id}
              onLongPress={() => onLongPress(message)}
              onPress={() => onSelect(message)}
              style={styles.pinnedDropdownRow}
            >
              <View style={styles.pinnedDropdownIcon}>
                <PinMarkerIcon size={12} color="#8B5CF6" />
              </View>
              <View style={styles.pinnedMessageCopy}>
                <Text numberOfLines={1} style={styles.pinnedDropdownText}>
                  {messagePinPreview(message)}
                </Text>
                <Text style={styles.pinnedDuration}>Pinned until unpinned</Text>
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function OpenPinnedInChatIcon() {
  return (
    <Svg width={20} height={19} viewBox="0 0 20 19" fill="none">
      <Path
        d="M9.75 7.75V7.76M5.75 7.75V7.76M13.75 7.75V7.76M15.75 0.75C16.5456 0.75 17.3087 1.06607 17.8713 1.62868C18.4339 2.19129 18.75 2.95435 18.75 3.75V11.75C18.75 12.5456 18.4339 13.3087 17.8713 13.8713C17.3087 14.4339 16.5456 14.75 15.75 14.75H10.75L5.75 17.75V14.75H3.75C2.95435 14.75 2.19129 14.4339 1.62868 13.8713C1.06607 13.3087 0.75 12.5456 0.75 11.75V3.75C0.75 2.95435 1.06607 2.19129 1.62868 1.62868C2.19129 1.06607 2.95435 0.75 3.75 0.75H15.75Z"
        stroke={themeInk('#0B1220')}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function AllPinnedMessagesIcon() {
  return (
    <Svg width={12} height={19} viewBox="0 0 12 19" fill="none">
      <Path
        d="M2.75 0.75V6.75L0.75 10.75V12.75H10.75V10.75L8.75 6.75V0.75M5.75 12.75V17.75M1.75 0.75H9.75"
        stroke={themeInk('#0B1220')}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/**
 * Sprint 3 Story 2's status indicator. Each rung of the ladder gets its own
 * glyph, and the accessible label spells the state out because the difference
 * between one tick and two - and between grey and purple - is invisible to a
 * screen reader.
 */
function MessageStatusIcon({ status }: { status?: string }) {
  const state = normalizeStatus(status);
  const label = statusLabel(state);

  return (
    <View accessibilityLabel={label} style={styles.statusIcon}>
      {state === 'pending' && <ClockStatusIcon />}
      {state === 'failed' && <Text style={styles.failedMark}>!</Text>}
      {state === 'sent' && <SingleCheckIcon />}
      {state === 'delivered' && <DoubleCheckIcon />}
      {state === 'read' && <DoubleCheckIcon read />}
    </View>
  );
}

function DownloadArrowIcon({
  color = '#FFFFFF',
  size = 18,
}: {
  color?: string;
  size?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 4.5v10.5m0 0-4.25-4.25M12 15l4.25-4.25M5.5 19.5h13"
        stroke={color}
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/**
 * Where a received photo or video waits while auto-download is off for it on
 * this connection (Sprint 11 Story 5): its size and a download button, over a
 * blurred thumbnail when the message carries one. Nothing is fetched until the
 * user taps.
 */
function MediaDownloadPlaceholder({
  message,
  transfer,
  onDownload,
  onLongPress,
  style,
}: {
  message: ChatMessage;
  transfer?: DownloadTransferState;
  onDownload: () => void;
  onLongPress?: () => void;
  style: StyleProp<ViewStyle>;
}) {
  const size = formatBytes(message.mediaSize);
  const kind = message.messageType === 'video' ? 'video' : 'photo';
  const preview =
    message.thumbnailUrl && message.thumbnailUrl !== message.mediaUrl
      ? message.thumbnailUrl
      : '';
  const downloading = transfer?.phase === 'downloading';
  const failed = transfer?.phase === 'failed';
  const progressText = transfer?.progress == null ? 'Downloading' : `Downloading ${Math.round(transfer.progress * 100)}%`;
  return (
    <Pressable
      accessibilityHint={failed ? transfer.error || 'Tap to retry the download.' : `Auto-download is off for ${kind === 'video' ? 'videos' : 'photos'} on this connection`}
      accessibilityLabel={downloading ? progressText : failed ? `Retry download ${kind}` : `Download ${kind}${size ? `, ${size}` : ''}`}
      accessibilityRole="button"
      disabled={downloading}
      onLongPress={onLongPress}
      onPress={onDownload}
      style={[style, styles.mediaDownloadPlaceholder]}
    >
      {preview ? (
        <Image
          accessible={false}
          blurRadius={18}
          resizeMode="cover"
          source={{ uri: preview }}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      <View style={styles.mediaDownloadPill}>
        {downloading ? <ActivityIndicator color="#FFFFFF" size="small"/> : failed ? <Text style={styles.mediaDownloadRetry}>Retry</Text> : <DownloadArrowIcon />}
        {downloading ? <Text style={styles.mediaDownloadSize}>{progressText}</Text> : failed ? <Text numberOfLines={1} style={styles.mediaDownloadSize}>Download failed</Text> : size ? <Text style={styles.mediaDownloadSize}>{size}</Text> : null}
      </View>
    </Pressable>
  );
}

function VideoMedia({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri);
  return (
    <VideoView
      accessibilityLabel="Video preview"
      contentFit="cover"
      nativeControls
      player={player}
      pointerEvents="none"
      style={styles.mediaImage}
    />
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function LegacyAudioMedia({ message }: { message: ChatMessage }) {
  const player = useAudioPlayer(message.mediaUrl || null);
  const status = useAudioPlayerStatus(player);
  const [speed, setSpeed] = useState(1);
  const waveform = message.waveform?.length
    ? message.waveform
    : [2, 4, 3, 5, 3, 4, 2, 5, 4, 3, 5, 2, 4, 3, 5, 3, 2, 4];
  const duration = status.duration || message.audioDuration || 0;
  const progress = duration ? Math.min(1, status.currentTime / duration) : 0;
  const changeSpeed = () => {
    const next = speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1;
    player.setPlaybackRate(next);
    setSpeed(next);
  };
  const time = `${Math.floor(duration / 60)}:${String(
    Math.round(duration % 60),
  ).padStart(2, '0')}`;
  return (
    <View style={styles.audioPlayer}>
      <Pressable
        accessibilityLabel={
          status.playing ? 'Pause voice message' : 'Play voice message'
        }
        onPress={() => (status.playing ? player.pause() : player.play())}
        style={styles.audioPlayButton}
      >
        <Text style={styles.audioPlay}>{status.playing ? '❚❚' : '▶'}</Text>
      </Pressable>
      <View style={styles.waveform}>
        {waveform.map((bar, index) => (
          <View
            key={index}
            style={[
              styles.waveBar,
              index / waveform.length <= progress && styles.waveBarPlayed,
              { height: 4 + bar * 2 },
            ]}
          />
        ))}
      </View>
      <Text style={styles.audioDuration}>{time}</Text>
      <Pressable
        accessibilityLabel={`Playback speed ${speed}x`}
        onPress={changeSpeed}
        style={styles.speedButton}
      >
        <Text style={styles.speedText}>{speed}x</Text>
      </Pressable>
    </View>
  );
}

function AudioMedia({ message }: { message: ChatMessage }) {
  // A voice note that auto-download holds back is not even handed to the
  // player, which would otherwise start fetching it to read its duration.
  const gate = useMediaDownloadGate(message);
  const player = useAudioPlayer(
    gate.allowed ? gate.localUri || message.mediaUrl || null : null,
    { updateInterval: VOICE_PROGRESS_UPDATE_MS },
  );
  const status = useAudioPlayerStatus(player);
  const [speed, setSpeed] = useState(1);
  const [waveformWidth, setWaveformWidth] = useState(0);
  const [playbackCompleted, setPlaybackCompleted] = useState(false);
  const wasPlaying = useRef(false);
  const pauseRequested = useRef(false);
  const waveform = message.waveform?.length ? message.waveform : VOICE_WAVEFORM;
  const duration = status.duration || message.audioDuration || 0;
  const reachedEnd = Boolean(
    status.didJustFinish ||
      (!status.playing &&
        status.currentTime > 0 &&
        duration > 0 &&
        duration - status.currentTime <= Math.max(0.15, duration * 0.02)),
  );
  useEffect(() => {
    const finishedNaturally =
      wasPlaying.current && !status.playing && !pauseRequested.current;
    if (reachedEnd || finishedNaturally) {
      setPlaybackCompleted(true);
    } else if (status.playing) {
      setPlaybackCompleted(false);
    }
    wasPlaying.current = status.playing;
    if (!status.playing) {
      pauseRequested.current = false;
    }
  }, [reachedEnd, status.playing]);
  const progress = playbackProgress(
    status.currentTime || 0,
    duration,
    reachedEnd || playbackCompleted,
  );
  const changeSpeed = () => {
    const next = speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1;
    player.setPlaybackRate(next);
    setSpeed(next);
  };
  const time = formatAudioDuration(duration);

  return (
    <View style={[styles.audioPlayer, styles.voiceMessagePlayer, message.isOwn && styles.ownAudioPlayer]}>
      {message.isOwn && <VoiceBubbleGradient />}
      {gate.allowed ? (
        <Pressable
          accessibilityLabel={
            status.playing ? 'Pause voice message' : 'Play voice message'
          }
          onPress={async () => {
            if (status.playing) {
              pauseRequested.current = true;
              player.pause();
            } else {
              pauseRequested.current = false;
              if (playbackCompleted || progress >= 1) {
                setPlaybackCompleted(false);
                try {
                  await player.seekTo(0);
                } catch {
                  return;
                }
              }
              player.play();
            }
          }}
          style={styles.audioPlayButton}
        >
          {status.playing ? (
            <PauseBarsIcon color={message.isOwn ? '#FFFFFF' : '#111827'} />
          ) : (
            <PlayTriangleIcon color={message.isOwn ? '#FFFFFF' : '#111827'} />
          )}
        </Pressable>
      ) : (
        <Pressable
          accessibilityHint={gate.transfer?.phase === 'failed' ? gate.transfer.error : 'Auto-download is off for voice messages on this connection'}
          accessibilityLabel={gate.transfer?.phase === 'downloading' ? `Downloading voice message${gate.transfer.progress == null ? '' : ` ${Math.round(gate.transfer.progress * 100)}%`}` : gate.transfer?.phase === 'failed' ? 'Retry voice message download' : `Download voice message${formatBytes(message.mediaSize) ? `, ${formatBytes(message.mediaSize)}` : ''}`}
          accessibilityRole="button"
          disabled={gate.transfer?.phase === 'downloading'}
          onPress={gate.download}
          style={styles.audioPlayButton}
        >
          {gate.transfer?.phase === 'downloading' ? <Text style={styles.audioTransferProgress}>{gate.transfer.progress == null ? '…' : `${Math.round(gate.transfer.progress * 100)}%`}</Text> : gate.transfer?.phase === 'failed' ? <Text style={styles.audioRetry}>↻</Text> : <DownloadArrowIcon color="#111827" size={17} />}
        </Pressable>
      )}
      <View
        accessibilityLabel="Voice message waveform"
        onLayout={event =>
          setWaveformWidth(event.nativeEvent.layout.width)
        }
        style={styles.waveform}
      >
        <View style={styles.waveformBars}>
          {waveform.map((bar, index) => (
            <View
              key={index}
              style={[
                styles.waveBar,
                message.isOwn && styles.ownWaveBar,
                { height: bar },
              ]}
            />
          ))}
        </View>
        <View
          accessibilityLabel="Voice message played waveform"
          pointerEvents="none"
          style={[
            styles.waveformPlayedMask,
            {
              width: progressFillWidth(
                progress,
                waveformWidth,
                WAVE_KNOB_SIZE,
              ),
            },
          ]}
        >
          <View style={[styles.waveformBars, { width: waveformWidth }]}>
            {waveform.map((bar, index) => (
              <View
                key={index}
                style={[
                  styles.waveBar,
                  styles.waveBarPlayed,
                  message.isOwn && styles.ownWaveBarPlayed,
                  { height: bar },
                ]}
              />
            ))}
          </View>
        </View>
        <View
          accessibilityLabel={`Voice message playback ${Math.round(
            progress * 100,
          )}%`}
          accessibilityRole="progressbar"
          accessibilityValue={{
            min: 0,
            max: 100,
            now: Math.round(progress * 100),
          }}
          style={[
            styles.waveKnob,
            message.isOwn && styles.ownWaveKnob,
            {
              left: progressKnobLeft(
                progress,
                waveformWidth,
                WAVE_KNOB_SIZE,
              ),
            },
          ]}
        />
      </View>
      <Text
        style={[styles.audioDuration, message.isOwn && styles.ownAudioDuration]}
      >
        {time}
      </Text>
      <Pressable
        accessibilityLabel={`Playback speed ${speed}x`}
        onPress={changeSpeed}
        style={[styles.speedButton, message.isOwn && styles.ownSpeedButton]}
      >
        <Text style={[styles.speedText, message.isOwn && styles.ownSpeedText]}>
          {speed}x
        </Text>
      </Pressable>
    </View>
  );
}

function RecordingPreviewPlayer({
  uri,
  duration,
  waveform,
  playerRef,
  onError,
}: {
  uri: string | null;
  duration: number;
  waveform: number[];
  playerRef: React.RefObject<ReturnType<typeof useAudioPlayer> | null>;
  onError: (message: string) => void;
}) {
  const player = useAudioPlayer(uri, {
    updateInterval: VOICE_PROGRESS_UPDATE_MS,
    keepAudioSessionActive: true,
  });
  const status = useAudioPlayerStatus(player);
  const [waveformWidth, setWaveformWidth] = useState(0);
  useEffect(() => {
    playerRef.current = player;
    return () => {
      try {
        player.pause();
      } catch {
        // The audio hook may already have released its native player.
      }
      if (playerRef.current === player) playerRef.current = null;
    };
  }, [player, playerRef]);
  const progress = playbackProgress(
    status.currentTime || 0,
    duration,
    status.didJustFinish,
  );

  return (
    <View style={styles.recordPreview}>
      <Pressable
        accessibilityLabel={
          status.playing ? 'Pause recorded audio' : 'Play recorded audio'
        }
        disabled={!uri}
        onPress={async () => {
          try {
            if (status.playing) {
              player.pause();
            } else if (uri) {
              if (
                status.didJustFinish ||
                status.currentTime >= (status.duration || duration)
              ) {
                await player.seekTo(0);
              }
              player.play();
            }
          } catch {
            onError('Unable to play the recording preview. Please try again.');
          }
        }}
        style={styles.previewPlayButton}
      >
        {status.playing ? <PauseBarsIcon /> : <PlayTriangleIcon />}
      </Pressable>
      <View
        accessibilityLabel="Recording preview waveform"
        onLayout={event =>
          setWaveformWidth(event.nativeEvent.layout.width)
        }
        style={styles.recordWaveform}
      >
        {waveform.map((bar, index) => {
          const played = index < Math.ceil(progress * waveform.length);
          return (
            <View
              key={index}
              style={[
                styles.recordWaveBar,
                played && styles.recordWaveBarPlayed,
                { height: bar },
              ]}
            />
          );
        })}
        <View
          accessibilityLabel={`Recording playback ${Math.round(
            progress * 100,
          )}%`}
          accessibilityRole="progressbar"
          accessibilityValue={{
            min: 0,
            max: 100,
            now: Math.round(progress * 100),
          }}
          style={[
            styles.recordWaveKnob,
            {
              left: progressKnobLeft(
                progress,
                waveformWidth,
                RECORD_WAVE_KNOB_SIZE,
              ),
            },
          ]}
        />
      </View>
      <Text style={styles.recordPreviewDuration}>
        {formatComposerDuration(duration)}
      </Text>
      <Pressable
        accessibilityLabel="Recording playback speed 1x"
        style={styles.recordSpeedButton}
      >
        <Text style={styles.recordSpeedText}>1x</Text>
      </Pressable>
    </View>
  );
}

function DocumentMedia({
  message,
  onDownload,
}: {
  message: ChatMessage;
  onDownload: () => void;
}) {
  const gate = useMediaDownloadGate(message);
  const saving = gate.transfer?.phase === 'downloading';
  const failed = gate.transfer?.phase === 'failed';
  const saved = Boolean(gate.localUri);
  const name = message.fileName || 'document';
  return (
    <Pressable
      accessibilityHint={failed ? gate.transfer?.error : undefined}
      accessibilityLabel={saved ? `Open ${name}` : failed ? `Retry download ${name}` : saving ? `Downloading ${name}` : `Download ${name}`}
      accessibilityRole="button"
      accessibilityState={{ busy: saving, disabled: saving }}
      disabled={saving}
      onPress={() => saved || message.isOwn ? onDownload() : gate.download()}
      style={styles.documentCard}
    >
      <View style={styles.documentPreview}>
        <Text style={styles.documentGlyph}>▤</Text>
        <View style={styles.secureBadge}>
          <Text style={styles.secureText}>▣ Secure</Text>
        </View>
      </View>
      <View style={styles.documentDetails}>
        <View style={styles.documentCopy}>
          <Text numberOfLines={1} style={styles.documentName}>
            {message.fileName || 'Document'}
          </Text>
          <Text style={styles.documentType}>
            {saved && !message.isOwn ? 'Downloaded' : failed ? 'Download failed · Tap to retry' : saving ? gate.transfer?.progress == null ? 'Downloading…' : `Downloading ${Math.round(gate.transfer.progress * 100)}%` : 'Document'}
          </Text>
        </View>
        <Text style={styles.documentSize}>
          {formatBytes(message.mediaSize)}
        </Text>
        <View style={styles.documentDownload}>
          {saving ? (
            <ActivityIndicator color="#7C3AED" size="small" />
          ) : (
            <Text style={styles.documentDownloadIcon}>{saved ? '↗' : '↓'}</Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}

function LocationMedia({
  message,
  onLongPress,
}: {
  message: ChatMessage;
  onLongPress: () => void;
}) {
  const latitude = message.latitude || 0;
  const longitude = message.longitude || 0;
  const openMap = () =>
    Linking.openURL(`https://www.google.com/maps?q=${latitude},${longitude}`);
  return (
    <Pressable
      accessibilityLabel={`Open ${
        message.locationName || 'shared location'
      } in maps`}
      onLongPress={onLongPress}
      onPress={openMap}
      style={styles.locationCard}
    >
      <View style={styles.mapCanvas}>
        <View style={[styles.mapRoad, styles.mapRoadOne]} />
        <View style={[styles.mapRoad, styles.mapRoadTwo]} />
        <View style={[styles.mapRoad, styles.mapRoadThree]} />
        <View style={styles.mapWater} />
        <View style={styles.mapMarker}>
          <View style={styles.mapMarkerDot} />
        </View>
        <Text numberOfLines={1} style={styles.mapLabel}>
          {message.locationName || 'Shared location'}
        </Text>
      </View>
    </Pressable>
  );
}

function FullPreviewVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri);
  return (
    <VideoView
      accessibilityLabel="Full video preview"
      contentFit="contain"
      nativeControls
      player={player}
      style={styles.fullPreviewImage}
    />
  );
}

function groupMessagesForDisplay(messages: ChatMessage[]): ChatMessage[][] {
  return messages.reduce<ChatMessage[][]>((groups, message) => {
    const previous = groups[groups.length - 1];
    if (
      message.mediaGroupId &&
      previous?.[0]?.mediaGroupId === message.mediaGroupId
    ) {
      previous.push(message);
    } else {
      groups.push([message]);
    }
    return groups;
  }, []);
}

function messageDateKey(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return '';
  }
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function messageDateLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return '';
  }
  const today = new Date();
  if (messageDateKey(value) === messageDateKey(today.toISOString())) {
    return 'Today';
  }
  const yesterday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() - 1,
  );
  if (messageDateKey(value) === messageDateKey(yesterday.toISOString())) {
    return 'Yesterday';
  }
  return date.toLocaleDateString();
}

function replyTimestampLabel(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return '';
  return `${date.toLocaleDateString([], {month: 'short', day: 'numeric'})}, ${date.toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'})}`;
}

function lastSeenLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return 'Offline';
  }
  return `Last seen ${date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  })} at ${date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })}`;
}

const MESSAGE_REACTION_CONTROL_PREFIX = '__CHATTERLY_MESSAGE_REACTION__:';

function messageReactionControl(
  message: ChatMessage,
): MessageReactionPayload | null {
  const text = String(message.text || '').trim();
  if (!text.startsWith(MESSAGE_REACTION_CONTROL_PREFIX)) {
    return null;
  }
  try {
    return JSON.parse(
      text.slice(MESSAGE_REACTION_CONTROL_PREFIX.length),
    ) as MessageReactionPayload;
  } catch {
    return null;
  }
}

function applyMessageReactionPayload(
  messages: ChatMessage[],
  payload: MessageReactionPayload,
): ChatMessage[] {
  const payloadRecord = payload as MessageReactionPayload &
    Record<string, unknown>;
  const nested =
    payloadRecord.data && typeof payloadRecord.data === 'object'
      ? (payloadRecord.data as Record<string, unknown>)
      : {};
  const source = { ...payloadRecord, ...nested };
  const messageRef = (
    source.message && typeof source.message === 'object'
      ? source.message
      : source.targetMessage
  ) as Record<string, unknown> | undefined;
  const targets = new Set(
    [
      String(
        source.messageId ||
          source.message_id ||
          source.id ||
          source._id ||
          messageRef?.messageId ||
          messageRef?.id ||
          messageRef?._id ||
          '',
      ).trim(),
      String(
        source.clientMessageId ||
          source.client_message_id ||
          source.tempId ||
          source.localId ||
          '',
      ).trim(),
      ...(Array.isArray(source.targetMessageIds)
        ? source.targetMessageIds.map(value => String(value || '').trim())
        : []),
    ].filter(Boolean),
  );
  if (!targets.size) {
    return messages;
  }
  const reaction =
    source.reaction && typeof source.reaction === 'object'
      ? (source.reaction as Record<string, unknown>)
      : {};
  const emoji = String(
    source.emoji ||
      source.reactionEmoji ||
      source.reactionValue ||
      reaction.emoji ||
      reaction.value ||
      (typeof source.reaction === 'string' ? source.reaction : '') ||
      '',
  ).trim();
  const action = String(source.action || source.type || source.operation || '')
    .trim()
    .toLowerCase();
  const removed = Boolean(
    source.remove ||
      source.removed ||
      source.isRemoved ||
      source.deleted ||
      source.isDeleted ||
      ['remove', 'removed', 'delete', 'deleted', 'clear'].includes(action) ||
      !emoji,
  );
  return messages.map(message => {
    if (
      ![message.id, message.tempId || ''].some(id => targets.has(String(id)))
    ) {
      return message;
    }
    return { ...message, myReaction: removed ? null : emoji };
  });
}

function applyMessageReactionControls(messages: ChatMessage[]): ChatMessage[] {
  let visible: ChatMessage[] = [];
  sortByTime(messages).forEach(message => {
    const payload = messageReactionControl(message);
    if (payload) {
      visible = applyMessageReactionPayload(visible, payload);
    } else {
      visible.push(message);
    }
  });
  return visible;
}

async function sendGroupText(
  groupId: string,
  text: string,
): Promise<ChatMessage> {
  try {
    return await sendGroupMessageOverSocket({
      groupId,
      tempId: nextTempId(),
      text,
    });
  } catch (socketError) {
    // A missing ACK can mean the server stored and broadcast the message. The
    // REST route has no tempId idempotency, so do not retry that ambiguous send.
    if (isAckTimeout(socketError)) {
      throw socketError;
    }
    return sendGroupMessage(groupId, text);
  }
}

// The album card is a two-column grid of at most four tiles. It is only as tall
// as the rows it needs, and a lone last tile takes the whole row, so two or
// three photos leave no empty band between the media and the caption.
const ALBUM_WIDTH = 210;
const ALBUM_GAP = 3;
const ALBUM_TILE_HEIGHT = 93.5;
const ALBUM_TILE_WIDTH = (ALBUM_WIDTH - ALBUM_GAP) / 2;

function albumGridHeight(tileCount: number): number {
  const rows = Math.max(1, Math.ceil(tileCount / 2));
  return rows * ALBUM_TILE_HEIGHT + (rows - 1) * ALBUM_GAP;
}

function AlbumTile({
  index,
  item,
  onDownload,
  onLongPress,
  onPreview,
  onViewAll,
  total,
  wide = false,
}: {
  index: number;
  item: ChatMessage;
  onDownload: (message: ChatMessage) => void;
  onLongPress: () => void;
  onPreview: (message: ChatMessage) => void;
  onViewAll: () => void;
  total: number;
  wide?: boolean;
}) {
  const gate = useMediaDownloadGate(item);
  const localItem = gate.localUri ? {...item, mediaUrl: gate.localUri} : item;
  const showViewAll = index === 3 && total >= 4;
  const remainingCount = Math.max(0, total - index);
  const tileStyle = wide
    ? [styles.albumTile, styles.albumTileWide]
    : styles.albumTile;
  if (!gate.allowed) {
    return (
      <View style={tileStyle}>
        <MediaDownloadPlaceholder
          message={item}
          transfer={gate.transfer}
          onDownload={item.messageType === 'video' ? () => onDownload(item) : gate.download}
          onLongPress={onLongPress}
          style={styles.albumImage}
        />
        {showViewAll ? (
          <Pressable
            accessibilityLabel={`View all ${remainingCount} remaining media items`}
            accessibilityRole="button"
            onPress={onViewAll}
            style={styles.viewAllBadge}
          >
            <Text style={styles.viewAllText}>View all ({remainingCount})</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }
  return (
    <View style={tileStyle}>
      <Pressable
        accessibilityLabel={`Open media ${index + 1} of ${total}`}
        onLongPress={onLongPress}
        onPress={() => onPreview(localItem)}
        style={styles.albumTileContent}
      >
      {item.messageType === 'image' && localItem.mediaUrl ? (
        <ProgressiveMediaImage
          mediaUrl={localItem.mediaUrl}
          style={styles.albumImage}
          thumbnailUrl={item.thumbnailUrl}
        />
      ) : item.thumbnailUrl ? (
        <Image source={{ uri: item.thumbnailUrl }} style={styles.albumImage} />
      ) : (
        <View style={styles.albumVideoFallback}>
          <Text style={styles.albumVideoText}>Video</Text>
        </View>
      )}
      {item.messageType === 'video' ? (
        <View style={styles.albumPlay}>
          <Text style={styles.albumPlayText}>Play</Text>
        </View>
      ) : null}
      </Pressable>
      {showViewAll ? (
        <Pressable
          accessibilityLabel={`View all ${remainingCount} remaining media items`}
          accessibilityRole="button"
          onPress={onViewAll}
          style={styles.viewAllBadge}
        >
          <Text style={styles.viewAllText}>View all ({remainingCount})</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function AlbumMedia({
  messages,
  onDownload,
  onLongPress,
  onPreview,
  onViewAll,
}: {
  messages: ChatMessage[];
  onDownload: (message: ChatMessage) => void;
  onLongPress: () => void;
  onPreview: (message: ChatMessage) => void;
  onViewAll: () => void;
}) {
  const visible = messages.slice(0, 4);
  return (
    <View
      accessibilityLabel={`${messages.length} media items`}
      style={[styles.albumGrid, { height: albumGridHeight(visible.length) }]}
    >
      {visible.map((item, index) => (
        <AlbumTile
          index={index}
          item={item}
          onDownload={onDownload}
          key={item.id}
          onLongPress={onLongPress}
          onPreview={onPreview}
          onViewAll={onViewAll}
          total={messages.length}
          wide={index === visible.length - 1 && visible.length % 2 === 1}
        />
      ))}
    </View>
  );
}

function MessageBubble({
  message,
  mediaGroup = [message],
  contact,
  isGroup = false,
  onDownload,
  onOpenActions,
  onPreview,
  onViewAll,
  onReactionPress,
  onReplyPress,
  onRetry,
  onSwipeReply,
  replySenderName,
  replyTimestamp,
  replyMediaUrl,
  selected = false,
  selectionMode = false,
  senderRole,
  targetHighlighted = false,
}: {
  message: ChatMessage;
  mediaGroup?: ChatMessage[];
  contact: ConversationContact;
  isGroup?: boolean;
  /** The sender's current role from the group roster, when it is known. */
  senderRole?: ChatMessage['senderRole'];
  onDownload: (message: ChatMessage) => void;
  onOpenActions: () => void;
  onPreview: (message: ChatMessage) => void;
  onViewAll: (messages: ChatMessage[]) => void;
  onReactionPress?: () => void;
  onReplyPress?: () => void;
  onRetry: () => void;
  onSwipeReply?: () => void;
  replySenderName?: string;
  replyTimestamp?: string;
  replyMediaUrl?: string;
  selected?: boolean;
  selectionMode?: boolean;
  targetHighlighted?: boolean;
}) {
  const { wallpaper } = useChatWallpaper();
  // Media Auto-Download (Sprint 11 Story 5): a received photo or video only
  // loads by itself when the user's choices allow it on this connection.
  const mediaGate = useMediaDownloadGate(message);
  isGroup = isGroup || contact.kind === 'group';
  const isAlbum = mediaGroup.length > 1;
  const statusMessage = mediaGroup[mediaGroup.length - 1];
  // The attached design stamps the time as "00:55 AM", so the 12-hour clock is
  // part of the spec rather than a locale accident.
  const time = new Date(statusMessage.createdAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
  const retryable = statusMessage.isOwn && isRetryable(statusMessage.status);
  const authorContact: ConversationContact = {
    userId: message.senderId || '',
    name: message.senderName || (message.isOwn ? 'You' : 'Group member'),
    thumbnail: message.senderThumbnail,
  };
  const roleLabel = groupRoleLabel(senderRole || message.senderRole);
  const swipeOffset = useRef(new Animated.Value(0)).current;
  const swipeReply = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          Boolean(
            onSwipeReply &&
              gesture.dx > 10 &&
              Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.25,
          ),
        onPanResponderMove: (_event, gesture) =>
          swipeOffset.setValue(Math.max(0, Math.min(76, gesture.dx))),
        onPanResponderRelease: (_event, gesture) => {
          const shouldReply = gesture.dx >= 58 || gesture.vx >= 0.65;
          Animated.spring(swipeOffset, {
            toValue: 0,
            damping: 18,
            stiffness: 240,
            useNativeDriver: true,
          }).start();
          if (shouldReply) {
            Haptics.selectionAsync().catch(() => undefined);
            onSwipeReply?.();
          }
        },
        onPanResponderTerminate: () =>
          Animated.spring(swipeOffset, {
            toValue: 0,
            damping: 18,
            stiffness: 240,
            useNativeDriver: true,
          }).start(),
      }),
    [onSwipeReply, swipeOffset],
  );
  const swipeIndicatorOpacity = swipeOffset.interpolate({
    inputRange: [0, 16, 58],
    outputRange: [0, 0.35, 1],
    extrapolate: 'clamp',
  });

  if (message.deletedForMe || message.isDeleted) {
    return (
      <View
        style={[styles.messageLine, message.isOwn && styles.messageLineOwn]}
      >
        {!message.isOwn && <ChatAvatar contact={contact} small />}
        <View
          style={[styles.messageStack, message.isOwn && styles.messageStackOwn]}
        >
          <View
            accessibilityLabel="This message was deleted."
            accessibilityRole="text"
            style={[
              styles.deletedMessageNotice,
              message.isOwn && styles.ownDeletedMessageNotice,
            ]}
          >
            <View style={styles.deletedMessageIcon}>
              <TrashIcon color={message.isOwn ? '#FFFFFF' : '#EF4444'} />
            </View>
            <Text
              style={[
                styles.deletedMessageText,
                message.isOwn && styles.ownDeletedMessageText,
              ]}
            >
              This message was deleted.
            </Text>
          </View>
          <View
            accessibilityLabel={
              message.isOwn ? `${time} ${statusLabel(message.status)}` : time
            }
            style={styles.messageMeta}
          >
            <Text style={styles.messageTime}>{time}</Text>
            {message.isOwn && <MessageStatusIcon status={message.status} />}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View
      accessibilityActions={[{ name: 'activate', label: 'Reply' }]}
      accessibilityHint="Swipe right to reply"
      accessibilityLabel={`Swipe ${
        message.text || message.messageType || 'message'
      } right to reply`}
      onAccessibilityAction={event => {
        if (event.nativeEvent.actionName === 'activate') {
          onSwipeReply?.();
        }
      }}
      style={styles.swipeReplyContainer}
      {...swipeReply.panHandlers}
    >
      <Animated.View
        accessibilityLabel="Swipe to reply indicator"
        pointerEvents="none"
        style={[styles.swipeReplyIndicator, { opacity: swipeIndicatorOpacity }]}
      >
        <MessageActionIcon action="reply" />
      </Animated.View>
      <Animated.View style={{ transform: [{ translateX: swipeOffset }] }}>
        <View
          style={[
            styles.messageLine,
            message.isOwn && styles.messageLineOwn,
            selectionMode && styles.selectedMessageLine,
          ]}
        >
          {selected ? <SelectedMessageHighlight /> : null}
          {!message.isOwn && (
            <ChatAvatar contact={isGroup ? authorContact : contact} small />
          )}
          <View
            style={[
              styles.messageStack,
              message.isOwn && styles.messageStackOwn,
            ]}
          >
            {/* The design stacks our own avatar above the outgoing bubble, where an
          incoming one sits beside it. */}
            {message.isOwn && (
              <View style={styles.ownAvatar}>
                <ChatAvatar contact={isGroup ? authorContact : contact} small />
              </View>
            )}
            {isGroup ? (
              <View
                style={[
                  styles.groupSenderLine,
                  message.isOwn && styles.groupSenderLineOwn,
                ]}
              >
                <Text
                  style={[
                    styles.groupSenderName,
                    message.isOwn && styles.groupSenderNameOwn,
                  ]}
                >
                  {message.isOwn ? 'You' : message.senderName || 'Group member'}
                </Text>
                <Text style={styles.groupSenderRole}>{roleLabel}</Text>
              </View>
            ) : null}
            <Pressable
              accessibilityLabel={
                isAlbum
                  ? `Message album with ${mediaGroup.length} items`
                  : 'Message: ' +
                    (message.text || message.messageType || 'attachment')
              }
              accessibilityHint={
                retryable ? 'Tap to send this message again' : undefined
              }
              onLongPress={onOpenActions}
              onPress={
                selectionMode
                  ? onOpenActions
                  : retryable
                  ? onRetry
                  : onOpenActions
              }
              style={[
                styles.messageBubble,
                message.isOwn ? styles.ownBubble : styles.otherBubble,
                message.messageType !== 'text' && styles.mediaBubble,
                message.messageType !== 'text' &&
                  message.isOwn &&
                  styles.ownMediaBubble,
                message.isOwn && {
                  backgroundColor: wallpaper.messageColor,
                  borderColor: wallpaper.messageColor,
                },
                message.messageType === 'audio' && styles.audioMessageBubble,
                isAlbum && styles.albumBubble,
                retryable && styles.failedBubble,
                selected && styles.selectedBubble,
                targetHighlighted && styles.replyTargetHighlighted,
              ]}
            >
              {message.isForwarded && (
                <Text
                  style={[styles.forwarded, message.isOwn && styles.ownMeta]}
                >
                  ↗ Forwarded
                </Text>
              )}
              {message.replyPreview?.content ? (
                <Pressable
                  accessibilityHint="Scrolls to the original message"
                  accessibilityLabel={`Reply to ${
                    replySenderName || 'message'
                  }: ${message.replyPreview.content}${replyTimestamp ? `, ${replyTimestamp}` : ''}`}
                  onPress={onReplyPress}
                  style={[
                    styles.replyPreview,
                    !message.isOwn && styles.otherReplyPreview,
                  ]}
                >
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.replyPreviewSender,
                      !message.isOwn && styles.otherReplyPreviewSender,
                    ]}
                  >
                    {replySenderName || 'Message'}
                  </Text>
                  <View style={styles.replyPreviewBody}>
                    {message.replyPreview.messageType === 'image' &&
                    (replyMediaUrl || message.replyPreview.mediaUrl) ? (
                      <Image
                        accessibilityLabel="Replied to image"
                        source={{
                          uri: replyMediaUrl || message.replyPreview.mediaUrl,
                        }}
                        resizeMode="cover"
                        style={styles.replyPreviewImage}
                      />
                    ) : null}
                    <Text
                      numberOfLines={2}
                      style={[
                        styles.replyPreviewText,
                        !message.isOwn && styles.otherReplyPreviewText,
                      ]}
                    >
                      {replyTimestamp ? `${replyTimestamp} · ` : ''}
                      {message.replyPreview.content}
                    </Text>
                  </View>
                </Pressable>
              ) : null}
              {isAlbum ? (
                <AlbumMedia
                  messages={mediaGroup}
                  onDownload={onDownload}
                  onLongPress={onOpenActions}
                  onPreview={onPreview}
                  onViewAll={() => onViewAll(mediaGroup)}
                />
              ) : null}
              {!isAlbum &&
              message.messageType === 'image' &&
              message.mediaUrl ? (
                mediaGate.allowed ? (
                  <Pressable
                    accessibilityLabel="Open photo preview"
                    onLongPress={onOpenActions}
                    onPress={() =>
                      onPreview(
                        mediaGate.localUri
                          ? {...message, mediaUrl: mediaGate.localUri}
                          : message,
                      )
                    }
                  >
                    <ProgressiveMediaImage
                      mediaUrl={mediaGate.localUri || message.mediaUrl}
                      style={[styles.mediaImage, styles.singleMediaImage]}
                      thumbnailUrl={message.thumbnailUrl}
                    />
                  </Pressable>
                ) : (
                  <MediaDownloadPlaceholder
                    message={message}
                    transfer={mediaGate.transfer}
                    onDownload={mediaGate.download}
                    onLongPress={onOpenActions}
                    style={[styles.mediaImage, styles.singleMediaImage]}
                  />
                )
              ) : null}
              {!isAlbum &&
              message.messageType === 'video' &&
              message.mediaUrl ? (
                mediaGate.allowed ? (
                  <Pressable
                    accessibilityLabel="Open video preview"
                    onLongPress={onOpenActions}
                    onPress={() =>
                      onPreview(
                        mediaGate.localUri
                          ? {...message, mediaUrl: mediaGate.localUri}
                          : message,
                      )
                    }
                  >
                    <VideoMedia uri={mediaGate.localUri || message.mediaUrl} />
                    {message.isOwn ? (
                      // The sender already has the file, so the video offers to
                      // play, not to download, and a tap anywhere on it opens it.
                      <View
                        accessibilityLabel="Play video"
                        pointerEvents="none"
                        style={styles.singleVideoPlayLayer}
                      >
                        <View style={styles.singleVideoPlay}>
                          <PlayTriangleIcon color="#FFFFFF" />
                        </View>
                      </View>
                    ) : null}
                  </Pressable>
                ) : (
                  <MediaDownloadPlaceholder
                    message={message}
                    transfer={mediaGate.transfer}
                    onDownload={() => onDownload(message)}
                    onLongPress={onOpenActions}
                    style={styles.mediaImage}
                  />
                )
              ) : null}
              {!isAlbum && !!formatBytes(message.mediaSize) && (
                <Text
                  style={[
                    styles.mediaSize,
                    message.isOwn && styles.ownMediaMeta,
                  ]}
                >
                  {formatBytes(message.mediaSize)}
                </Text>
              )}
              {message.messageType === 'audio' && (
                <AudioMedia message={message} />
              )}
              {message.messageType === 'file' && (
                <DocumentMedia message={message} onDownload={() => onDownload(message)} />
              )}
              {message.messageType === 'location' && (
                <LocationMedia
                  message={message}
                  onLongPress={onOpenActions}
                />
              )}
              {!!message.text && (
                <LinkifiedText
                  style={[
                    styles.messageText,
                    message.isOwn && styles.ownMessageText,
                    message.messageType !== 'text' && styles.mediaCaption,
                  ]}
                  linkStyle={styles.messageLink}
                >
                  {message.text}
                </LinkifiedText>
              )}
            </Pressable>
            {message.myReaction ? (
              <Pressable
                accessibilityHint="Tap to remove your reaction"
                accessibilityLabel={`Remove ${message.myReaction} reaction`}
                disabled={!onReactionPress}
                onPress={onReactionPress}
                style={[
                  styles.reactionBadge,
                  message.isOwn && styles.reactionBadgeOwn,
                ]}
              >
                <Text style={styles.reactionBadgeText}>
                  {message.myReaction}
                </Text>
              </Pressable>
            ) : null}
            <View
              accessibilityLabel={
                statusMessage.isOwn
                  ? `${time} ${
                      statusMessage.queued
                        ? 'Queued to send when online'
                        : statusLabel(statusMessage.status)
                    }`
                  : time
              }
              style={styles.messageMeta}
            >
              <Text style={styles.messageTime}>{time}</Text>
              {statusMessage.isPinned ? (
                <View
                  accessibilityLabel="Pinned message"
                  style={styles.inlinePin}
                >
                  <PinMarkerIcon color="#6D28D9" size={14} strokeWidth={2.25} />
                </View>
              ) : null}
              {statusMessage.isOwn && (
                <MessageStatusIcon status={statusMessage.status} />
              )}
            </View>
            {message.queued && (
              <Text
                accessibilityLabel="Queued to send when online"
                style={styles.queuedHint}
              >
                Will send when online
              </Text>
            )}
            {retryable && (
              <Text
                accessibilityLabel="Message not sent, tap the bubble to retry"
                style={styles.retryHint}
              >
                Not sent · Tap to retry
              </Text>
            )}
          </View>
        </View>
      </Animated.View>
      {selectionMode ? (
        <Pressable
          accessibilityLabel={`${
            selected ? 'Deselect selected' : 'Select'
          } message: ${message.text || message.messageType || 'attachment'}`}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: selected }}
          onPress={onOpenActions}
          style={styles.selectionTapTarget}
        >
          <View
            pointerEvents="none"
            style={[
              styles.messageSelectionIndicator,
              message.isOwn
                ? styles.sentMessageSelectionIndicator
                : styles.receivedMessageSelectionIndicator,
            ]}
          >
            <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
              <Circle
                cx={12}
                cy={12}
                r={10.5}
                fill={themeInk(selected ? '#8B5CF6' : '#FFFFFF')}
                stroke={themeInk(selected ? '#8B5CF6' : '#8792A4')}
                strokeWidth={1.5}
              />
              {selected ? (
                <Path
                  d="M17.33 8.44L10 15.55L6.66 12.58"
                  stroke="white"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : null}
            </Svg>
          </View>
        </Pressable>
      ) : null}
    </View>
  );
}

function TypingIndicator({ contact }: { contact: ConversationContact }) {
  const bars = useRef([
    new Animated.Value(0.55),
    new Animated.Value(0.55),
    new Animated.Value(0.55),
  ]).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.stagger(
        140,
        bars.map(value =>
          Animated.sequence([
            Animated.timing(value, {
              toValue: 1,
              duration: 260,
              useNativeDriver: true,
            }),
            Animated.timing(value, {
              toValue: 0.55,
              duration: 260,
              useNativeDriver: true,
            }),
          ]),
        ),
      ),
    );
    pulse.start();
    return () => pulse.stop();
  }, [bars]);

  return (
    <View
      accessibilityLabel={`${contact.name} is typing`}
      style={styles.typingPill}
    >
      <ChatAvatar contact={contact} small />
      <View style={styles.typingBars}>
        {bars.map((value, index) => (
          <Animated.View
            key={index}
            style={[styles.typingBar, { transform: [{ scaleY: value }] }]}
          />
        ))}
      </View>
    </View>
  );
}

type VoiceRecordingMode = 'idle' | 'holding' | 'locked' | 'paused' | 'sending';

export function ChatScreen({
  incomingMedia,
  onIncomingMediaHandled,
  callRequest,
  onCallRequestHandled,
  chatId,
  contact: contactProp,
  onBack,
  onOpenConversation,
  onCreateSimilarGroup,
  onStartGroupCall,
  onReportSubmitted,
  onOutgoingCallStateChange,
  minimizeCallRequest,
  restoreCallRequest,
}: Props): React.JSX.Element {
  // A one-to-one contact shows under the name the user saved with Edit
  // Contact, everywhere in the conversation (header, call screens, replies).
  const displayName = useContactDisplayName(
    contactProp.kind === 'group' ? undefined : contactProp.userId,
    contactProp.name,
  );
  const contact = useMemo<ConversationContact>(
    () =>
      displayName === contactProp.name
        ? contactProp
        : { ...contactProp, name: displayName },
    [contactProp, displayName],
  );
  const { wallpaper } = useChatWallpaper();
  const insets = useSafeAreaInsets();
  const blockedContacts = useBlockedContacts();
  const contactBlocked =
    contact.kind !== 'group' &&
    blockedContacts.some(user => user.id === contact.userId);
  const [directMenuOpen, setDirectMenuOpen] = useState(false);
  const [timerRequestKey, setTimerRequestKey] = useState(0);
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [blockBusy, setBlockBusy] = useState(false);
  const blockBusyRef = useRef(false);
  const [blockError, setBlockError] = useState('');
  useEffect(() => {
    if (contact.kind === 'group') return;
    const refresh = () => {
      refreshBlockedContacts().catch(() => undefined);
    };
    refresh();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') refresh();
    });
    return () => subscription.remove();
  }, [contact.kind, contact.userId]);
  const confirmContactBlock = async () => {
    if (blockBusyRef.current) return;
    blockBusyRef.current = true;
    setBlockBusy(true);
    setBlockError('');
    try {
      await changeContactBlock(
        {
          id: contact.userId,
          name: contact.name,
          profilePic: contact.thumbnail || undefined,
        },
        !contactBlocked,
      );
      setBlockDialogOpen(false);
      setAttachmentOpen(false);
      setEmojiOpen(false);
      Keyboard.dismiss();
      setNotice(
        contactBlocked
          ? `${contact.name} has been unblocked.`
          : `${contact.name} has been blocked.`,
      );
    } catch (error) {
      setBlockError(
        error instanceof Error
          ? error.message
          : 'Unable to update this contact.',
      );
    } finally {
      blockBusyRef.current = false;
      setBlockBusy(false);
    }
  };

  const scrollRef = useRef<React.ElementRef<typeof ScrollView>>(null);
  const messageOffsets = useRef(new Map<string, number>());
  const inputRef = useRef<React.ElementRef<typeof TextInput>>(null);
  const recorder = useAudioRecorder(VOICE_RECORDING_OPTIONS);
  const recorderState = useAudioRecorderState(recorder, 250);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [timerClearState, setTimerClearState] = useState({chatId, clearedAt: 0, loaded: false});
  const timerClearedAt = timerClearState.chatId === chatId ? timerClearState.clearedAt : 0;
  useEffect(() => {
    let active = true;
    const applyClearedAt = (clearedAt: number) => {
      if (active) {
        setTimerClearState(current => ({chatId, loaded: true, clearedAt: Math.max(
          current.chatId === chatId ? current.clearedAt : 0, clearedAt,
        )}));
      }
    };
    const unsubscribe = subscribeToDisappearingTimerCleared((id, clearedAt) => {
      if (id === chatId) { applyClearedAt(clearedAt); }
    });
    getChatDisappearingTimerClearedAt(chatId).then(applyClearedAt).catch(() => applyClearedAt(0));
    return () => { active = false; unsubscribe(); };
  }, [chatId]);
  useAutoDownloadMessages(messages);
  const [draft, setDraft] = useState('');
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState('');
  // Stable, so a re-render (the call timer ticks every second) cannot restart
  // the notice's hide timer and leave it parked over the composer.
  const hideNotice = useCallback(() => setNotice(''), []);
  const [selected, setSelected] = useState<ChatMessage | null>(null);
  const [pinnedExpanded, setPinnedExpanded] = useState(false);
  const [pinnedBannerAction, setPinnedBannerAction] =
    useState<ChatMessage | null>(null);
  const [openPinnedDirectly, setOpenPinnedDirectly] = useState(false);
  const [updatingPinnedBanner, setUpdatingPinnedBanner] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState<ChatMessage | null>(
    null,
  );
  const [deleteSelectionCandidates, setDeleteSelectionCandidates] = useState<
    ChatMessage[] | null
  >(null);
  const [deletingScope, setDeletingScope] = useState<'me' | 'everyone' | null>(
    null,
  );
  const [pendingDeletion, setPendingDeletion] =
    useState<PendingMessageDeletion | null>(null);
  const pendingDeletionRef = useRef<PendingMessageDeletion | null>(null);
  const pendingDeletionTimer = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(
    new Set(),
  );
  const [selectionMode, setSelectionMode] = useState(false);
  const [forwardOpen, setForwardOpen] = useState(false);
  const [moreReactionsOpen, setMoreReactionsOpen] = useState(false);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [chosenAction, setChosenAction] = useState<'reply' | 'unread' | null>(
    null,
  );
  const [unreadBoundaryMessageId, setUnreadBoundaryMessageId] = useState<
    string | null
  >(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<
    string | null
  >(null);
  const replyActionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const replyHighlightTimer = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const actionSheetOffset = useRef(new Animated.Value(36)).current;
  const actionSheetClosing = useRef(false);
  const [previewMedia, setPreviewMedia] = useState<ChatMessage | null>(null);
  const [galleryMedia, setGalleryMedia] = useState<ChatMessage[] | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  // Where the caret is, so an emoji lands where the user is typing rather than
  // being appended to the end of whatever they had already written. The live
  // position is a ref because it changes on every keystroke; only a caret we
  // move ourselves needs to be handed back to the input as state.
  const selectionRef = useRef({ start: 0, end: 0 });
  const [forcedSelection, setForcedSelection] = useState<{
    start: number;
    end: number;
  } | null>(null);
  const [attachmentOpen, setAttachmentOpen] = useState(false);
  const [attachmentStart, setAttachmentStart] = useState<
    'tray' | 'gallery' | 'camera'
  >('tray');
  const [documentOpen, setDocumentOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [editContactOpen, setEditContactOpen] = useState(false);
  // Keep the selected contact's number while registered-user details load.
  // The profile view may omit the phone, and a lookup can fail while offline.
  const [contactPhone, setContactPhone] = useState(contact.phone || '');
  useEffect(() => {
    setContactPhone(contact.phone || '');
    if (contact.kind === 'group' || !contact.userId) {
      return;
    }
    let active = true;
    getRegisteredUser(contact.userId)
      .then(user => {
        if (active && !contact.phone && user?.phone) {
          setContactPhone(user.phone);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [contact.kind, contact.phone, contact.userId]);
  const [groupMenuOpen, setGroupMenuOpen] = useState(false);
  const [groupMoreOpen, setGroupMoreOpen] = useState(false);
  const [groupMembersOpen, setGroupMembersOpen] = useState(false);
  const [groupMediaOpen, setGroupMediaOpen] = useState(false);
  const [groupSearchOpen, setGroupSearchOpen] = useState(false);
  const [groupSearch, setGroupSearch] = useState('');
  const [groupDetails, setGroupDetails] = useState<GroupDetails | null>(null);
  const [profilePictureOpen, setProfilePictureOpen] = useState(false);
  const [contactPicture, setContactPicture] = useState(contact.thumbnail);
  const [conversationMuted, setConversationMutedState] = useState(false);
  const currentUserId = getSession()?.user?.id || '';
  const currentGroupRole = groupDetails?.participants.find(
    member => member.userId === currentUserId,
  )?.role;
  // A bubble looks its sender's role up here when it is drawn. Roles were only
  // copied onto the messages already in the thread when the roster loaded, so a
  // message sent or received afterwards - the Super Admin's own, for one - had
  // no role and showed "Member".
  const groupRoleById = useMemo(
    () =>
      new Map(
        (groupDetails?.participants || []).map(
          member => [member.userId, member.role] as const,
        ),
      ),
    [groupDetails],
  );
  const composerAccess =
    contact.kind === 'group'
      ? groupComposerAccess(groupDetails, currentUserId)
      : null;
  const groupSendNotice = composerAccess?.notice || null;
  const mediaBlocked = Boolean(composerAccess && !composerAccess.canShareMedia);
  const canDeleteGroup = currentGroupRole === 'superadmin';
  const canPinMessages =
    contact.kind !== 'group' ||
    canPinGroupMessages(currentGroupRole, groupDetails?.rolePermissions);
  const [contactPickerOpen, setContactPickerOpen] = useState(false);
  const [shareableContacts, setShareableContacts] = useState<
    ShareableContact[]
  >([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [mediaTransfer, setMediaTransfer] = useState<MediaTransferState>({
    phase: 'idle',
    progress: 0,
    current: 0,
    total: 0,
  });
  const [connection, setConnection] = useState<ConnectionState>('connecting');
  const [networkAvailable, setNetworkAvailable] = useState<boolean | null>(
    null,
  );
  const [showConnectionBanner, setShowConnectionBanner] = useState(true);
  const [presence, setPresence] = useState<PresenceState>(
    contact.status === 'online'
      ? 'online'
      : contact.status === 'away'
      ? 'away'
      : 'offline',
  );
  const [lastSeen, setLastSeen] = useState<string | null>(
    contact.lastSeen || null,
  );
  const [remoteTyping, setRemoteTyping] = useState(false);
  const [voiceMode, setVoiceMode] = useState<VoiceRecordingMode>('idle');
  const [voicePreviewUri, setVoicePreviewUri] = useState<string | null>(null);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [voiceWaveform, setVoiceWaveform] = useState<number[]>(VOICE_WAVEFORM);
  const [pendingCallType, setPendingCallType] = useState<CallType | null>(null);
  const [microphoneSheetOpen, setMicrophoneSheetOpen] = useState(false);
  const [endedCall, setEndedCall] = useState<{
    duration: number;
    type: CallType;
    status?: 'ended' | 'declined';
  } | null>(null);
  const activeCallRef = useRef<ActiveCallState | null>(null);
  const callerMediaSetupCallIdRef = useRef('');

  useEffect(() => {
    if (contact.kind === 'group' || contact.kind === 'broadcast') {
      return;
    }
    let active = true;
    getChatProfile(contact.userId)
      .then(profile => {
        if (!active) {
          return;
        }
        setPresence(
          profile.online
            ? 'online'
            : profile.status.toLowerCase() === 'away'
            ? 'away'
            : 'offline',
        );
        setLastSeen(profile.lastSeen || null);
        setContactPicture(profile.profilePic || contact.thumbnail || null);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [contact.kind, contact.userId, contact.thumbnail]);
  const endingCallRef = useRef(false);
  const handledMinimizeCallRequest = useRef(0);
  const [activeCall, setActiveCall] = useState<ActiveCallState | null>(null);
  activeCallRef.current = activeCall;
  useEffect(() => subscribeToCallHold((callId, held) => {
    setActiveCall(current => current?.callId === callId && current.held !== held ? {...current, held} : current);
  }), []);
  const previousOutgoingActivity = useRef<CallActivity | null>(null);
  useEffect(() => {
    const previous = previousOutgoingActivity.current;
    if (activeCall?.callId) {
      const status = activeCall.connectedAt ? 'answered' : 'dialed';
      const activity: CallActivity = {callId: activeCall.callId, chatId: activeCall.chatId || chatId, contactId: contact.userId, contactName: contact.name, type: activeCall.type, direction: 'outgoing', status};
      if (previous?.callId !== activity.callId || previous.status !== status) publishCallActivity(activity);
      previousOutgoingActivity.current = activity;
    } else if (!activeCall && previous) {
      publishCallActivity({...previous, status: 'ended'});
      previousOutgoingActivity.current = null;
    }
  }, [activeCall, chatId, contact.name, contact.userId]);
  const [callHidden, setCallHidden] = useState(false);
  useEffect(() => {
    if (!activeCall?.callId || activeCall?.type !== 'video') return;
    let disposed = false;
    const setAwake = (awake: boolean) => {
      const operation = awake
        ? activateKeepAwakeAsync('direct-video-call')
        : deactivateKeepAwake('direct-video-call');
      operation.then(() => {
        if (disposed && awake) deactivateKeepAwake('direct-video-call').catch(() => undefined);
      }).catch(() => undefined);
    };
    setAwake(AppState.currentState !== 'background');
    const subscription = AppState.addEventListener('change', state => setAwake(state !== 'background'));
    return () => {
      disposed = true;
      subscription.remove();
      deactivateKeepAwake('direct-video-call').catch(() => undefined);
    };
  }, [activeCall?.callId, activeCall?.type]);
  useEffect(() => {
    if (!activeCall?.callId || activeCall?.type !== 'video') return;
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') setCallHidden(true);
    });
    return () => subscription.remove();
  }, [activeCall?.callId, activeCall?.type]);
  const [callMedia, setCallMedia] = useState<CallMediaStreams>({
    localUrl: '',
    remoteUrl: '',
    remoteVideoLive: false,
    sharingScreen: false,
  });
  useEffect(() => subscribeToCallMedia(setCallMedia), []);
  useEffect(() => {
    onOutgoingCallStateChange?.(
      Boolean(activeCall),
      Boolean(activeCall && callHidden),
    );
  }, [activeCall, callHidden, onOutgoingCallStateChange]);
  useEffect(() => {
    if (
      !minimizeCallRequest ||
      minimizeCallRequest === handledMinimizeCallRequest.current ||
      !activeCall
    ) {
      return;
    }

    handledMinimizeCallRequest.current = minimizeCallRequest;
    setCallHidden(true);
  }, [activeCall, minimizeCallRequest]);
  useEffect(() => {
    if (restoreCallRequest && activeCall) {
      setCallHidden(false);
    }
  }, [activeCall, restoreCallRequest]);
  const [callMoreOpen, setCallMoreOpen] = useState(false);
  const [isCallScreenSharing, setIsCallScreenSharing] = useState(false);
  const [callFailedOpen, setCallFailedOpen] = useState(false);
  const [autoReconnect, setAutoReconnect] = useState(true);
  const [audioOutputOpen, setAudioOutputOpen] = useState(false);
  const [microphoneSettingsOpen, setMicrophoneSettingsOpen] = useState(false);
  const [callRoutes, setCallRoutes] = useState<CallAudioRoute[]>(() =>
    listCallAudioRoutes(null),
  );
  const [selectedCallRouteId, setSelectedCallRouteId] = useState(
    EARPIECE_ROUTE.id,
  );
  const [callContactSheetOpen, setCallContactSheetOpen] = useState(false);
  const [callContactSheetProfile, setCallContactSheetProfile] =
    useState<ChatProfile | null>(null);
  const [callContactSheetLoading, setCallContactSheetLoading] = useState(false);
  const [echoCancellation, setEchoCancellation] = useState(true);
  const [noiseSuppression, setNoiseSuppression] = useState(true);
  const [addPeopleOpen, setAddPeopleOpen] = useState(false);
  const [callParticipants, setCallParticipants] = useState<CallParticipant[]>(
    [],
  );
  const [callPeopleSearch, setCallPeopleSearch] = useState('');
  const [selectedCallPeople, setSelectedCallPeople] = useState<Set<string>>(
    new Set(),
  );
  const [callPeopleLoading, setCallPeopleLoading] = useState(false);
  const [addingCallPeople, setAddingCallPeople] = useState(false);
  const [callStatusOpen, setCallStatusOpen] = useState(false);
  const [callStatusLoading, setCallStatusLoading] = useState(false);
  const [backendCallStatus, setBackendCallStatus] = useState('connected');
  const [callContactOpen, setCallContactOpen] = useState(false);
  const [selectedCallContact, setSelectedCallContact] =
    useState<ConversationContact | null>(null);
  const [selectedCallProfile, setSelectedCallProfile] =
    useState<ChatProfile | null>(null);
  const [selectedCallMedia, setSelectedCallMedia] = useState<ChatMessage[]>([]);
  const [callContactLoading, setCallContactLoading] = useState(false);
  const [callDurationSeconds, setCallDurationSeconds] = useState(0);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hydrated = useRef(false);
  const lastRecordedActivity = useRef('');
  const queuedAttempts = useRef(new Set<string>());
  const voiceGesture = useRef<'record' | 'cancel' | 'lock'>('record');
  const voiceModeRef = useRef<VoiceRecordingMode>('idle');
  const voiceSessionId = useRef(0);
  const voiceCaptureOpen = useRef(false);
  const voiceCaptureActive = useRef(false);
  const voiceWaveformSamples = useRef<number[]>([]);
  const lastVoiceMeterSampleAt = useRef(0);
  const voicePressing = useRef(false);
  const voiceFinishing = useRef(false);
  const voiceStarting = useRef(false);
  const voiceTransitioning = useRef(false);
  const voiceTouch = useRef<{ id: string; x: number; y: number; timestamp?: number } | null>(null);
  const voicePreviewPlayer = useRef<ReturnType<typeof useAudioPlayer> | null>(null);

  useEffect(() => {
    return () => {
      if (voicePreviewUri) deleteVoiceRecordingPreview(voicePreviewUri);
    };
  }, [voicePreviewUri]);

  const changeVoiceMode = useCallback((mode: VoiceRecordingMode) => {
    voiceModeRef.current = mode;
    setVoiceMode(mode);
  }, []);

  const updateMessages = useCallback(
    (update: ChatMessage[] | ((current: ChatMessage[]) => ChatMessage[])) => {
      setMessages(current => {
        const next = typeof update === 'function' ? update(current) : update;
        if (hydrated.current) {
          storeMessages(chatId, next).catch(() => undefined);
          const confirmed = next
            .filter(message =>
              message.isOwn &&
              !message.queued &&
              message.status !== 'pending' &&
              message.status !== 'failed',
            )
            .sort((first, second) => Date.parse(second.createdAt) - Date.parse(first.createdAt))[0];
          const activityVersion = confirmed
            ? `${confirmed.id}:${confirmed.status || 'sent'}`
            : '';
          if (confirmed && lastRecordedActivity.current !== activityVersion) {
            lastRecordedActivity.current = activityVersion;
            recordChatListActivity({
              ownerId: String(getSession()?.user?.id || ''),
              chatId,
              contact,
              preview: messagePreview(confirmed),
              createdAt: confirmed.createdAt,
              messageId: confirmed.id,
              status: confirmed.status || 'sent',
            });
          }
        }
        return next;
      });
    },
    [chatId, contact],
  );

  useEffect(() => {
    if (contact.kind === 'group' || contact.kind === 'broadcast') return;
    let disposed = false;
    const refreshCallEntries = async () => {
      try {
        const result = await getChatMessages(chatId);
        if (disposed) return;
        // Merge only server call logs; preserve messages arriving over the socket.
        updateMessages(current => sortByTime(result.filter(message => message.messageType === 'call')
          .reduce((merged, message) => upsertMessage(merged, message), current)));
      } catch { /* The next resume or call event retries the server log. */ }
    };
    const unsubscribe = subscribeToCallActivity(activity => {
      if ((activity.chatId === chatId || activity.contactId === contact.userId) &&
          (activity.status === 'ended' || activity.status === 'missed')) refreshCallEntries();
    });
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') refreshCallEntries();
    });
    return () => { disposed = true; unsubscribe(); subscription.remove(); };
  }, [chatId, contact.kind, contact.userId, updateMessages]);

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() =>
      scrollRef.current?.scrollToEnd({ animated: true }),
    );
  }, []);

  useEffect(() => {
    const showEvent =
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent =
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSubscription = Keyboard.addListener(showEvent, () => {
      setKeyboardVisible(true);
      scrollToEnd();
    });
    const hideSubscription = Keyboard.addListener(hideEvent, () =>
      setKeyboardVisible(false),
    );
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [scrollToEnd]);

  useEffect(() => subscribeToConnection(setConnection), []);
  // Auto-download follows the saved choices and the connection type.
  useEffect(() => {
    startAutoDownloadTracking();
  }, []);

  useEffect(() => {
    if (contact.kind !== 'group') return;
    let active = true;
    Promise.all([
      getGroupDetails(contact.userId || chatId),
      getConversationMuted(chatId),
    ])
      .then(([details, muted]) => {
        if (active) {
          setGroupDetails(details);
          setConversationMutedState(muted);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [chatId, contact.kind, contact.userId]);

  useEffect(() => {
    if (contact.kind !== 'group') return;
    const groupId = contact.userId || chatId;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    // A restriction or an "only admins can send" change has to reach the
    // composer while this thread is open, not on the next visit.
    const unsubscribe = subscribeToGroupChanges(groupId, change => {
      const { userId, isMuted } = change;
      if (
        change.type === 'group_member_muted' &&
        userId &&
        isMuted !== undefined
      ) {
        setGroupDetails(current =>
          current
            ? {
                ...current,
                participants: current.participants.map(member =>
                  member.userId === userId ? { ...member, isMuted } : member,
                ),
              }
            : current,
        );
      }
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        getGroupDetails(groupId)
          .then(details => {
            if (active) setGroupDetails(details);
          })
          .catch(() => undefined);
      }, 300);
    });
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, [chatId, contact.kind, contact.userId]);

  useEffect(() => {
    if (!groupDetails) return;
    updateMessages(current =>
      current.map(message => {
        const member = groupDetails.participants.find(
          item => item.userId === message.senderId,
        );
        return member
          ? {
              ...message,
              senderName: member.name,
              senderRole: member.role,
              senderThumbnail: member.profilePic,
            }
          : message;
      }),
    );
  }, [groupDetails, updateMessages]);

  useEffect(
    () =>
      NetInfo.addEventListener(state => {
        setNetworkAvailable(
          state.isConnected !== false && state.isInternetReachable !== false,
        );
      }),
    [],
  );

  useEffect(() => {
    if (!activeCall?.callId || networkAvailable !== false) {
      return;
    }
    const showFailure = () => {
      setCallMoreOpen(false);
      setAudioOutputOpen(false);
      setMicrophoneSettingsOpen(false);
      setAddPeopleOpen(false);
      setCallStatusOpen(false);
      setCallContactOpen(false);
      setCallFailedOpen(true);
    };
    // Give an answered call time to migrate between Wi-Fi and mobile data.
    const failureTimer = activeCall.connectedAt ? setTimeout(showFailure, 15000) : null;
    if (!activeCall.connectedAt) showFailure();
    setActiveCall(current =>
      current && current.status !== 'reconnecting'
        ? { ...current, status: 'reconnecting' }
        : current,
    );
    return () => { if (failureTimer) clearTimeout(failureTimer); };
  }, [activeCall?.callId, activeCall?.connectedAt, networkAvailable]);

  useEffect(() => {
    if (!activeCall?.callId) return;
    return subscribeToCallConnection(state => {
      if (!activeCallRef.current?.connectedAt) return;
      setActiveCall(current => current ? {...current, status: state === 'connected' ? 'connected' : 'reconnecting'} : current);
      setCallFailedOpen(state === 'failed');
    });
  }, [activeCall?.callId]);

  useEffect(() => {
    setActiveNotificationChat(chatId, contact.name);
    return () => setActiveNotificationChat(null);
  }, [chatId, contact.name]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    hydrated.current = false;
    loadStoredMessages(chatId)
      .then(stored => {
        if (!active) {
          return;
        }
        hydrated.current = true;
        setMessages(sortByTime(stored));
        // The cached snapshot restores the conversation immediately. Network
        // sync continues independently and does not erase queued device work.
        return (
          contact.kind === 'group'
            ? getGroupMessages(contact.userId || chatId)
            : getChatMessages(chatId)
        ).then(async result => {
          if (!active) {
            return;
          }
          const pinned = await (contact.kind === 'group'
            ? getGroupPinnedMessages(contact.userId || chatId)
            : getPinnedMessages(chatId)
          ).catch(() => null);
          if (!active) {
            return;
          }
          updateMessages(current =>
            applyMessageReactionControls(
              reconcileStoredAndRemote(
                current,
                pinned ? applyPinnedSnapshot(result, pinned) : result,
              ),
            ),
          );
          emitChatRead(chatId);
          markChatRead(chatId)
            .then(() => clearNotificationsForChat(chatId, contact.name))
            .catch(() => undefined);
        });
      })
      .then(() => {
        if (!active) {
          return;
        }
      })
      .catch(error => {
        if (active) {
          setNotice(
            error instanceof Error ? error.message : 'Unable to load messages.',
          );
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [chatId, contact.kind, contact.name, contact.userId, updateMessages]);

  useEffect(() => {
    if (contact.kind === 'group') {
      return subscribeToGroup(contact.userId || chatId, incoming => {
        const reaction = messageReactionControl(incoming);
        updateMessages(current =>
          reaction
            ? applyMessageReactionPayload(current, reaction)
            : sortByTime(upsertMessage(current, incoming)),
        );
        scrollToEnd();
      }, (messageId, content) => {
        updateMessages(current => current.map(message =>
          message.id === messageId ? {...message, text: content} : message,
        ));
      });
    }
    return subscribeToChat(chatId, contact.userId, {
      onMessage: incoming => {
        if (!incoming.isOwn && isUserBlocked(contact.userId)) return;
        const reaction = messageReactionControl(incoming);
        updateMessages(current =>
          reaction
            ? applyMessageReactionPayload(current, reaction)
            : sortByTime(upsertMessage(current, incoming)),
        );
        if (!incoming.isOwn) {
          // A message that lands while we are looking at the thread is read the
          // moment it arrives, which is the last rung of the sender's ladder.
          emitChatRead(chatId);
          markChatRead(chatId)
            .then(() => clearNotificationsForChat(chatId, contact.name))
            .catch(() => undefined);
        }
        scrollToEnd();
      },
      onDelivered: messageId =>
        updateMessages(current => applyStatus(current, messageId, 'delivered')),
      onRead: messageIds =>
        updateMessages(current => applyReadReceipt(current, messageIds)),
      onDeleted: (messageId, scope) =>
        updateMessages(current =>
          scope === 'me'
            ? markDeletedForMe(current, messageId)
            : markDeletedForEveryone(current, messageId),
        ),
      onPinned: (messageId, pinnedAt) =>
        updateMessages(current =>
          current.some(message => message.id === messageId)
            ? current.map(message =>
                message.id === messageId
                  ? {
                      ...message,
                      isPinned: true,
                      pinnedAt: pinnedAt || new Date().toISOString(),
                    }
                  : message,
              )
            : current,
        ),
      onUnpinned: messageId =>
        updateMessages(current =>
          current.map(message =>
            message.id === messageId
              ? { ...message, isPinned: false, pinnedAt: null }
              : message,
          ),
        ),
      onReaction: payload =>
        updateMessages(current =>
          applyMessageReactionPayload(current, payload),
        ),
      onPresence: (next, seenAt) => {
        setPresence(next);
        if (seenAt !== undefined) {
          setLastSeen(seenAt || null);
        }
      },
      onTyping: setRemoteTyping,
    });
  }, [
    chatId,
    contact.kind,
    contact.name,
    contact.userId,
    scrollToEnd,
    updateMessages,
  ]);

  useEffect(() => {
    if (!selected) {
      return;
    }
    const fresh = messages.find(message => message.id === selected.id);
    if (!fresh || fresh.isDeleted || fresh.deletedForMe) {
      setSelected(null);
      return;
    }
    if (fresh !== selected) {
      setSelected(fresh);
    }
  }, [messages, selected]);

  useEffect(() => {
    if (presence !== 'away' || !lastSeen) {
      return;
    }
    const elapsed = Date.now() - Date.parse(lastSeen);
    const timer = setTimeout(
      () => setPresence('offline'),
      Math.max(0, 5 * 60 * 1000 - elapsed),
    );
    return () => clearTimeout(timer);
  }, [lastSeen, presence]);

  useEffect(
    () => () => {
      if (typingTimer.current) {
        clearTimeout(typingTimer.current);
      }
      if (replyActionTimer.current) {
        clearTimeout(replyActionTimer.current);
      }
      if (replyHighlightTimer.current) {
        clearTimeout(replyHighlightTimer.current);
      }
      emitTyping(contact.userId, false);
    },
    [contact.userId],
  );

  const scrollToOriginal = useCallback((message: ChatMessage) => {
    if (!message.replyTo) {
      return;
    }
    const offset = messageOffsets.current.get(message.replyTo);
    if (offset === undefined) {
      setNotice('The original message is not available in this chat.');
      return;
    }
    scrollRef.current?.scrollTo({
      y: Math.max(0, offset - 12),
      animated: true,
    });
    setHighlightedMessageId(message.replyTo);
    if (replyHighlightTimer.current) {
      clearTimeout(replyHighlightTimer.current);
    }
    replyHighlightTimer.current = setTimeout(
      () => setHighlightedMessageId(null),
      1400,
    );
  }, []);

  const scrollToMessage = useCallback((message: ChatMessage) => {
    const offset = messageOffsets.current.get(message.id);
    setPinnedExpanded(false);
    if (offset === undefined) {
      setNotice('This pinned message is not available in this chat.');
      return;
    }
    scrollRef.current?.scrollTo({
      y: Math.max(0, offset - 12),
      animated: true,
    });
    setHighlightedMessageId(message.id);
    if (replyHighlightTimer.current) {
      clearTimeout(replyHighlightTimer.current);
    }
    replyHighlightTimer.current = setTimeout(
      () => setHighlightedMessageId(null),
      1400,
    );
  }, []);

  const openPinnedBannerActions = useCallback((message: ChatMessage) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(
      () => undefined,
    );
    setPinnedExpanded(false);
    setPinnedBannerAction(message);
  }, []);

  const openPinnedBannerMessage = useCallback(() => {
    const message = pinnedBannerAction;
    if (!message) return;
    setPinnedBannerAction(null);
    requestAnimationFrame(() => scrollToMessage(message));
  }, [pinnedBannerAction, scrollToMessage]);

  const showAllPinnedMessages = useCallback(() => {
    setPinnedBannerAction(null);
    setOpenPinnedDirectly(true);
    setProfileOpen(true);
  }, []);

  const unpinPinnedBannerMessage = useCallback(async () => {
    const message = pinnedBannerAction;
    if (!message || updatingPinnedBanner) return;
    setUpdatingPinnedBanner(true);
    try {
      if (contact.kind === 'group')
        await unpinGroupMessage(contact.userId || chatId, message.id);
      else await unpinMessage(message.id);
      updateMessages(current =>
        current.map(item =>
          item.id === message.id
            ? { ...item, isPinned: false, pinnedAt: null }
            : item,
        ),
      );
      if (contact.kind !== 'group') emitMessageUnpinned(message.id);
      setPinnedBannerAction(null);
      setNotice('Message unpinned.');
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : 'Unable to unpin this message.',
      );
    } finally {
      setUpdatingPinnedBanner(false);
    }
  }, [
    chatId,
    contact.kind,
    contact.userId,
    pinnedBannerAction,
    updateMessages,
    updatingPinnedBanner,
  ]);

  const changeDraft = useCallback(
    (value: string) => {
      setDraft(value);
      emitTyping(contact.userId, value.trim().length > 0);
      if (typingTimer.current) {
        clearTimeout(typingTimer.current);
      }
      typingTimer.current = setTimeout(
        () => emitTyping(contact.userId, false),
        1200,
      );
    },
    [contact.userId],
  );

  /**
   * Splices one emoji into the draft at the caret and leaves the caret just
   * after it, so a run of taps builds a sequence instead of each one jumping to
   * the end of the message.
   */
  const insertEmoji = useCallback(
    (emoji: string) => {
      const start = Math.min(
        Math.max(selectionRef.current.start, 0),
        draft.length,
      );
      const end = Math.min(
        Math.max(selectionRef.current.end, start),
        draft.length,
      );
      const caret = start + emoji.length;

      setDraft(`${draft.slice(0, start)}${emoji}${draft.slice(end)}`);
      selectionRef.current = { start: caret, end: caret };
      // Selection is left uncontrolled while the user types, so the caret is
      // pushed back into the input only for this programmatic edit; the next
      // selection event from the user releases it again.
      setForcedSelection({ start: caret, end: caret });

      emitTyping(contact.userId, true);
      if (typingTimer.current) {
        clearTimeout(typingTimer.current);
      }
      typingTimer.current = setTimeout(
        () => emitTyping(contact.userId, false),
        1200,
      );
    },
    [contact.userId, draft],
  );

  const toggleEmojiPicker = useCallback(() => {
    setEmojiOpen(open => {
      const next = !open;
      // The panel takes the keyboard's place rather than stacking on top of it.
      if (next) {
        Keyboard.dismiss();
        setAttachmentOpen(false);
      }
      return next;
    });
  }, []);

  const presenceLabel = remoteTyping
    ? 'typing…'
    : presence === 'online'
    ? 'Online'
    : presence === 'away'
    ? 'Away'
    : lastSeen
    ? lastSeenLabel(lastSeen)
    : 'Offline';
  const headerStatus =
    contact.kind === 'group'
      ? `${groupDetails?.participants.length || 0} Members`
      : presenceLabel;
  const avatarStatus: PresenceState =
    contact.kind === 'group' ? 'online' : presence;
  const headerContact: ConversationContact =
    contact.kind === 'group' && groupDetails
      ? { ...contact, name: groupDetails.name, thumbnail: groupDetails.photo }
      : contact.kind === 'group' ? contact : {...contact, thumbnail: contactPicture};
  const displayedConnection: ConnectionState =
    networkAvailable === false
      ? 'offline'
      : connection === 'connected'
      ? 'connected'
      : 'connecting';
  const connectionLabel =
    displayedConnection === 'connected'
      ? 'Connected'
      : displayedConnection === 'offline'
      ? 'No internet connection'
      : 'Reconnecting';

  useEffect(() => {
    setShowConnectionBanner(true);
    const timer = setTimeout(
      () => setShowConnectionBanner(false),
      CONNECTION_BANNER_VISIBLE_MS,
    );
    return () => clearTimeout(timer);
  }, [chatId, displayedConnection]);
  const bottomInset = useMemo(
    () => Math.max(insets.bottom + 5, 11),
    [insets.bottom],
  );
  // The composer sits a fixed 8pt above whatever is under it - the keyboard or
  // the emoji panel - as in the design; otherwise it clears the home indicator.
  const composerKeyboardInset = useMemo(
    () => ({ marginBottom: emojiOpen || keyboardVisible ? 8 : bottomInset }),
    [bottomInset, emojiOpen, keyboardVisible],
  );

  const closeActiveCall = useCallback(() => {
    callerMediaSetupCallIdRef.current = '';
    setActiveCall(null);
    setCallHidden(false);
    setCallMoreOpen(false);
    setAudioOutputOpen(false);
    setMicrophoneSettingsOpen(false);
    setAddPeopleOpen(false);
    setCallStatusOpen(false);
    setCallContactOpen(false);
    setCallFailedOpen(false);
    setCallDurationSeconds(0);
    stopCallAudio().catch(() => undefined);
    setAudioModeAsync({
      allowsRecording: false,
      allowsBackgroundRecording: false,
      playsInSilentMode: true,
      shouldPlayInBackground: false,
    }).catch(() => undefined);
  }, []);

  const setupConnectedCallerMedia = useCallback(
    (callId: string, connectedAt?: string) => {
      const call = activeCallRef.current;
      if (
        !call ||
        call.callId !== callId ||
        callerMediaSetupCallIdRef.current === callId
      ) {
        return;
      }
      callerMediaSetupCallIdRef.current = callId;
      setActiveCall(current =>
        current?.callId === callId
          ? {
              ...current,
              status: 'connected',
              connectedAt:
                connectedAt || current.connectedAt || new Date().toISOString(),
            }
          : current,
      );
      // The backend relays SDP/ICE to each user's socket room. Room joining is
      // best-effort and must not block media negotiation.
      joinCallRoom(callId).catch(() => undefined);
      startCallAudio({
        callId,
        role: 'caller',
        contactName: contact.name,
        type: call.type,
        muted: call.muted,
        speaker: call.speaker,
      })
        .then(() => startCallAudioOffer(callId))
        .catch(error => {
          if (callerMediaSetupCallIdRef.current === callId) {
            callerMediaSetupCallIdRef.current = '';
          }
          setNotice(
            error instanceof Error
              ? error.message
              : 'Unable to connect call audio.',
          );
        });
    },
    [contact.name],
  );

  const showCallSummary = useCallback(
    (duration?: number, status: 'ended' | 'declined' = 'ended') => {
      const call = activeCallRef.current;
      if (!call) {
        return;
      }
      activeCallRef.current = null;
      setEndedCall({
        duration: callDuration(call.connectedAt, duration),
        type: call.type,
        status,
      });
      closeActiveCall();
    },
    [closeActiveCall],
  );

  useEffect(() => {
    if (!activeCall?.callId) {
      return;
    }
    const callId = activeCall.callId;
    let disposed = false;
    const unsubscribe = subscribeToCall(callId, {
      onStatus: payload =>
        setActiveCall(current =>
          current?.callId === activeCall.callId
            ? {
                ...current,
                status: normalizeOutgoingCallStatus(
                  payload.status || 'ringing',
                ),
              }
            : current,
        ),
      onConnected: payload => {
        setupConnectedCallerMedia(
          callId,
          payload.startedAt ? String(payload.startedAt) : undefined,
        );
      },
      onEnded: payload => {
        const endReason = String(payload.reason || payload.status || '').toLowerCase();
        const declined = ['declined', 'rejected', 'call_rejected'].includes(endReason);
        setNotice(
          declined
            ? 'Call declined.'
            : payload.duration !== undefined
            ? `Call ended (${formatCallTimer(Number(payload.duration || 0))}).`
            : 'Call ended.',
        );
        showCallSummary(payload.duration, declined ? 'declined' : 'ended');
      },
      onMissed: () => {
        setNotice('Call not answered.');
        showCallSummary(0);
      },
      onRejected: () => {
        setNotice('Call declined.');
        showCallSummary(0, 'declined');
      },
      onCancelled: () => showCallSummary(0),
      onConnectionChange: payload => {
        if (payload.type === 'disconnected') {
          setCallMoreOpen(false);
          setAudioOutputOpen(false);
          setMicrophoneSettingsOpen(false);
          setAddPeopleOpen(false);
          setCallStatusOpen(false);
          setCallContactOpen(false);
          if (!activeCallRef.current?.connectedAt) setCallFailedOpen(true);
        }
        setActiveCall(current =>
          current?.callId === activeCall.callId
            ? {
                ...current,
                status:
                  payload.type === 'reconnecting' ||
                  payload.type === 'disconnected'
                    ? 'reconnecting'
                    : 'connected',
              }
            : current,
        );
      },
      onSignal: payload => {
        handleCallAudioSignal(payload).catch(error =>
          setNotice(
            error instanceof Error
              ? error.message
              : 'Unable to connect call audio.',
          ),
        );
      },
    });
    // A quick accept can emit call_connected before this effect subscribes.
    // Reconcile via call details so the caller still starts WebRTC and offers.
    getCallStatus(callId)
      .then(status => {
        if (!disposed && status.toLowerCase() === 'connected') {
          setupConnectedCallerMedia(callId);
        }
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [
    activeCall?.callId,
    closeActiveCall,
    setupConnectedCallerMedia,
    showCallSummary,
  ]);

  useEffect(() => {
    if (activeCall?.status !== 'connected' || !activeCall.connectedAt) {
      return;
    }
    const update = () =>
      setCallDurationSeconds(
        Math.max(
          0,
          Math.floor(
            (Date.now() - Date.parse(activeCall.connectedAt || '')) / 1000,
          ),
        ),
      );
    update();
    const timer = setInterval(update, 1000);
    const appStateSubscription = AppState.addEventListener('change', state => {
      if (state === 'active') {
        update();
      }
    });
    return () => {
      clearInterval(timer);
      appStateSubscription.remove();
    };
  }, [activeCall?.connectedAt, activeCall?.status]);

  useEffect(() => {
    if (activeCall?.status !== 'connected' || !activeCall.callId) {
      return;
    }
    if (activeCall.muted) {
      setCallMutedOverSocket(activeCall.callId, true).catch(() => undefined);
    }
    if (activeCall.speaker) {
      setCallSpeakerOverSocket(activeCall.callId, true).catch(() => undefined);
    }
    // Latched controls are replayed when the call first connects; subsequent
    // changes are sent directly by their toggle handlers below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCall?.callId, activeCall?.status]);

  useEffect(() => {
    if (!activeCall) {
      setIsCallScreenSharing(false);
      // Every call starts on the earpiece; a headset picked last time is not carried over.
      setSelectedCallRouteId(EARPIECE_ROUTE.id);
    }
  }, [activeCall]);

  const toggleCallSpeaker = useCallback(() => {
    setActiveCall(current => {
      if (!current) {
        return current;
      }
      const speaker = !current.speaker;
      setSelectedCallRouteId(speaker ? SPEAKER_ROUTE.id : EARPIECE_ROUTE.id);
      setAudioModeAsync({
        allowsRecording: true,
        allowsBackgroundRecording: true,
        playsInSilentMode: true,
        shouldPlayInBackground: true,
        shouldRouteThroughEarpiece: !speaker,
      }).catch(() => undefined);
      setCallAudioSpeaker(speaker).catch(error =>
        setNotice(
          error instanceof Error
            ? error.message
            : 'Unable to update audio output.',
        ),
      );
      if (current.callId && current.status === 'connected') {
        setCallSpeakerOverSocket(current.callId, speaker).catch(error =>
          setNotice(
            error instanceof Error
              ? error.message
              : 'Unable to update speaker.',
          ),
        );
      }
      return { ...current, speaker };
    });
  }, []);

  const toggleCallMute = useCallback(() => {
    setActiveCall(current => {
      if (!current) {
        return current;
      }
      const muted = !current.muted;
      setCallAudioMuted(muted).catch(error =>
        setNotice(
          error instanceof Error
            ? error.message
            : 'Unable to update microphone.',
        ),
      );
      if (current.callId && current.status === 'connected') {
        setCallMutedOverSocket(current.callId, muted).catch(error =>
          setNotice(
            error instanceof Error ? error.message : 'Unable to update mute.',
          ),
        );
      }
      return { ...current, muted };
    });
  }, []);

  const toggleCallHold = useCallback(() => {
    setActiveCall(current => {
      if (!current || current.status !== 'connected') return current;
      const held = !current.held;
      setCallAudioHeld(held).catch(error => setNotice(error instanceof Error ? error.message : 'Unable to update hold.'));
      return {...current, held};
    });
  }, []);

  const toggleCallVideo = useCallback(() => {
    setActiveCall(current => {
      if (!current || current.status !== 'connected') {
        return current;
      }
      const videoEnabled = !current.videoEnabled;
      setCallVideoEnabled(videoEnabled);
      setNotice(videoEnabled ? 'Video enabled.' : 'Video disabled.');
      return { ...current, videoEnabled };
    });
  }, []);

  const openCallMore = useCallback(() => {
    if (activeCall?.status !== 'connected') {
      return;
    }
    setCallMoreOpen(true);
  }, [activeCall?.status]);

  const showCurrentCallStatus = useCallback(async () => {
    const callId = activeCallRef.current?.callId;
    setCallMoreOpen(false);
    setCallStatusOpen(true);
    if (!callId) {
      setBackendCallStatus(activeCallRef.current?.status || 'calling');
      return;
    }
    setCallStatusLoading(true);
    try {
      const status = await getCallStatus(callId);
      setBackendCallStatus(status);
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : 'Unable to retrieve call status.',
      );
      setBackendCallStatus(activeCallRef.current?.status || 'connected');
    } finally {
      setCallStatusLoading(false);
    }
  }, []);

  const openCallContact = useCallback(
    async (participant: RegisteredCallParticipant) => {
      const fallback: ConversationContact = {
        userId: participant.userId,
        name: participant.name,
        thumbnail: participant.thumbnail,
      };
      setSelectedCallContact(fallback);
      setSelectedCallProfile(null);
      setSelectedCallMedia([]);
      setCallContactOpen(true);
      setCallContactLoading(true);
      try {
        const [profileResult, mediaResult] = await Promise.allSettled([
          getChatProfile(participant.userId),
          getSharedMedia(participant.userId),
        ]);
        setSelectedCallProfile(
          profileResult.status === 'fulfilled'
            ? {
                ...profileResult.value,
                phone: profileResult.value.phone || participant.phone,
              }
            : {
                userId: participant.userId,
                name: participant.name,
                profilePic: participant.thumbnail,
                phone: participant.phone,
                status: 'Offline',
                online: false,
              },
        );
        setSelectedCallMedia(
          mediaResult.status === 'fulfilled' ? mediaResult.value : [],
        );
      } finally {
        setCallContactLoading(false);
      }
    },
    [],
  );

  const openAudioOutputs = useCallback(() => {
    // Read the devices each time: a headset may have been connected mid-call.
    setCallRoutes(listCallAudioRoutes(recorder));
    setCallMoreOpen(false);
    setAudioOutputOpen(true);
  }, [recorder]);

  const selectAudioOutput = useCallback(
    (route: CallAudioRoute) => {
      setSelectedCallRouteId(route.id);
      applyCallAudioRoute(route, recorder).catch(error =>
        setNotice(
          error instanceof Error
            ? error.message
            : 'Unable to update audio output.',
        ),
      );
      // "No Audio" only silences the other side; the loudspeaker state is kept.
      if (route.kind !== 'none') {
        const shouldUseSpeaker = route.kind === 'speaker';
        setActiveCall(current => {
          if (!current) {
            return current;
          }
          if (
            current.speaker !== shouldUseSpeaker &&
            current.callId &&
            current.status === 'connected'
          ) {
            setCallSpeakerOverSocket(current.callId, shouldUseSpeaker).catch(
              () => undefined,
            );
          }
          return { ...current, speaker: shouldUseSpeaker };
        });
      }
      setAudioOutputOpen(false);
      setCallMoreOpen(true);
    },
    [recorder],
  );

  // View Contact: a sheet over the call screen, with the number and status.
  const openCallContactSheet = useCallback(() => {
    setCallMoreOpen(false);
    setCallContactSheetOpen(true);
    setCallContactSheetLoading(true);
    getChatProfile(contact.userId)
      .then(setCallContactSheetProfile)
      .catch(() => setCallContactSheetProfile(null))
      .finally(() => setCallContactSheetLoading(false));
  }, [contact.userId]);

  const toggleDirectCallScreenShare = useCallback(async () => {
    setCallMoreOpen(false);
    const callId = activeCallRef.current?.callId || '';
    try {
      if (isCallScreenSharing) {
        await stopCallScreenCapture();
        setIsCallScreenSharing(false);
        if (callId) {
          setCallScreenShareOverSocket(callId, false).catch(() => undefined);
        }
        setNotice('Screen sharing stopped.');
        return;
      }
      await startCallScreenCapture(() => {
        setIsCallScreenSharing(false);
        if (callId) {
          setCallScreenShareOverSocket(callId, false).catch(() => undefined);
        }
      });
      setIsCallScreenSharing(true);
      // Tell the call room, so the other side can show who is sharing.
      if (callId) {
        setCallScreenShareOverSocket(callId, true).catch(() => undefined);
      }
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : 'Unable to start screen sharing.',
      );
    }
  }, [isCallScreenSharing]);

  const openAddPeople = useCallback(async () => {
    setCallMoreOpen(false);
    setAddPeopleOpen(true);
    setCallPeopleSearch('');
    setSelectedCallPeople(new Set());
    setCallPeopleLoading(true);
    try {
      const currentPermission = await Contacts.getPermissionsAsync();
      const permission = currentPermission.granted
        ? currentPermission
        : await Contacts.requestPermissionsAsync();
      if (!permission.granted) {
        setNotice('Contact access is required to add people to a call.');
        setAddPeopleOpen(false);
        return;
      }
      const records = (await Contacts.Contact.getAllDetails([
        Contacts.ContactField.FULL_NAME,
        Contacts.ContactField.GIVEN_NAME,
        Contacts.ContactField.FAMILY_NAME,
        Contacts.ContactField.PHONES,
      ])) as Array<{
        id?: string;
        name?: string;
        fullName?: string;
        givenName?: string;
        familyName?: string;
        phones?: Array<{ number?: string }>;
      }>;
      const phoneNumbers = Array.from(
        new Set(
          records.flatMap(
            record =>
              record.phones
                ?.map(phone => String(phone.number || '').trim())
                .filter(Boolean) || [],
          ),
        ),
      );
      let registered: SyncedContactUser[] = [];
      if (phoneNumbers.length) {
        try {
          const synced = await syncContacts(phoneNumbers);
          registered = synced.registered || [];
        } catch {
          // Still show the device address book if account lookup is unavailable.
        }
      }
      const excludedIds = new Set([currentUserId, contact.userId]);
      const registeredByPhone = new Map<string, SyncedContactUser>();
      registered.forEach((user: SyncedContactUser) => {
        const userId = String(user._id || user.id || '').trim();
        const phoneKey = callPhoneKey(user.phone || user.phoneNumber);
        if (userId && phoneKey) {
          registeredByPhone.set(phoneKey, user);
        }
      });
      const byId = new Map<string, CallParticipant>();
      const byPhone = new Map<string, CallParticipant>();
      records.forEach((record, index) => {
        const phone = String(
          record.phones?.map(value => value.number).find(Boolean) || '',
        ).trim();
        const phoneKey = callPhoneKey(phone);
        const user = phoneKey ? registeredByPhone.get(phoneKey) : undefined;
        const userId = String(user?._id || user?.id || '').trim();
        if (userId && excludedIds.has(userId)) {
          return;
        }
        const name = String(
          record.fullName ||
            record.name ||
            [record.givenName, record.familyName].filter(Boolean).join(' ') ||
            user?.name ||
            user?.fullName ||
            'Unnamed contact',
        ).trim();
        const participant: CallParticipant = {
          id: userId || `device:${record.id || phoneKey || index}`,
          userId: userId || null,
          name,
          phone: String(user?.phone || user?.phoneNumber || phone),
          thumbnail: user?.profilePic || null,
        };
        if (userId) {
          byId.set(userId, participant);
        } else if (!byPhone.has(phoneKey || participant.id)) {
          byPhone.set(phoneKey || participant.id, participant);
        }
      });
      const participants = [...byId.values(), ...byPhone.values()].sort(
        (first, second) => first.name.localeCompare(second.name),
      );
      setCallParticipants(participants);
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : 'Unable to load call contacts.',
      );
      setCallParticipants([]);
    } finally {
      setCallPeopleLoading(false);
    }
  }, [contact.userId, currentUserId]);

  const toggleCallParticipant = useCallback((userId: string) => {
    setSelectedCallPeople(current => {
      const next = new Set(current);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  }, []);

  const addSelectedPeopleToCall = useCallback(async () => {
    const callId = activeCallRef.current?.callId;
    if (!callId || selectedCallPeople.size === 0 || addingCallPeople) {
      return;
    }
    setAddingCallPeople(true);
    try {
      const acknowledgements = await Promise.all(
        Array.from(selectedCallPeople).map(userId =>
          addCallParticipantOverSocket(callId, userId),
        ),
      );
      const failed = acknowledgements.find(
        acknowledgement => !acknowledgement.success,
      );
      if (failed) {
        throw new Error(failed.message);
      }
      setAddPeopleOpen(false);
      setSelectedCallPeople(new Set());
      setNotice(
        selectedCallPeople.size === 1
          ? 'Participant invited to the call.'
          : `${selectedCallPeople.size} participants invited to the call.`,
      );
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : 'Unable to add people to the call.',
      );
    } finally {
      setAddingCallPeople(false);
    }
  }, [addingCallPeople, selectedCallPeople]);

  const endActiveCall = useCallback(async () => {
    const call = activeCall;
    if (!call || endingCallRef.current) {
      return;
    }
    endingCallRef.current = true;
    try {
      const result = call.connectedAt
        ? await endCallOverSocket(call.callId)
        : await cancelCallOverSocket(call.callId);
      if (!result.success) {
        throw new Error(result.message);
      }
      // The server event normally supplies the final duration before this ack.
      if (activeCallRef.current?.callId === call.callId) {
        showCallSummary();
      }
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : 'Unable to end call. Please try again.',
      );
    } finally {
      endingCallRef.current = false;
    }
  }, [activeCall, showCallSummary]);

  useEffect(() => {
    if (!activeCall?.callId) return;
    return subscribeToBackgroundCallEnd(activeCall.callId, () => {
      endActiveCall().catch(() => undefined);
    });
  }, [activeCall?.callId, endActiveCall]);

  const openChatDuringCall = useCallback(() => {
    setCallHidden(true);
    setNotice(
      activeCall?.status === 'connected'
        ? 'Call is running in the background.'
        : 'Call screen minimized.',
    );
  }, [activeCall?.status]);

  const append = useCallback(
    (message: ChatMessage) => {
      updateMessages(current => sortByTime(upsertMessage(current, message)));
      scrollToEnd();
    },
    [scrollToEnd, updateMessages],
  );

  const appendAndNotify = useCallback(
    (message: ChatMessage, preview: string) => {
      append(message);
      if (contact.kind === 'group') {
        notifyGroupMessageOnce(
          message.id,
          (groupDetails?.participants || []).map(member => member.userId),
          `${groupDetails?.name || contact.name}: ${preview}`,
          contact.userId || chatId,
        ).catch(() => undefined);
      } else {
        notifyMessageOnce(message.id, contact.userId, preview, chatId).catch(
          () => undefined,
        );
      }
    },
    [append, chatId, contact.kind, contact.name, contact.userId, groupDetails],
  );

  /**
   * Runs the Story 2 ladder for one message.
   *
   * The socket is tried first because it is the only path that both broadcasts
   * to the receiver live and answers with a receipt we can hang the ticks on.
   * Its ACK moves the bubble to "sent"; `message_delivered` and `messages_read`
   * arrive later and are handled by the subscription above. If the socket is
   * unreachable the REST route still persists the message, and if that fails
   * too the bubble is marked failed so the retry affordance appears.
   */
  const deliver = useCallback(
    async (tempId: string, text: string, replyTo?: string) => {
      if (contact.kind !== 'group' && isUserBlocked(contact.userId)) {
        setNotice('Unblock this contact to send messages or make calls.');
        return;
      }
      setSending(true);
      try {
        if (contact.kind === 'group') {
          const groupId = contact.userId || chatId;
          const notifyGroup = (messageId: string) =>
            notifyGroupMessageOnce(
              messageId,
              (groupDetails?.participants || []).map(member => member.userId),
              `${groupDetails?.name || contact.name}: ${text}`,
              groupId,
            ).catch(() => undefined);
          try {
            const sent = await sendGroupMessageOverSocket({
              groupId,
              tempId,
              text,
              ...(replyTo ? { replyTo } : {}),
            });
            updateMessages(current =>
              upsertMessage(current, {
                ...sent,
                tempId: sent.tempId || tempId,
                text: sent.text || text,
                isOwn: true,
                queued: false,
                status: sent.status || 'sent',
              }),
            );
            notifyGroup(String(sent.id || tempId));
            return true;
          } catch (socketError) {
            // A missing ACK can mean the server stored and broadcast the message
            // before the acknowledgement was lost. Posting it again over REST
            // would create a duplicate because that route has no tempId.
            if (isAckTimeout(socketError)) {
              updateMessages(current => applyStatus(current, tempId, 'failed'));
              setNotice(
                'That is taking longer than usual. Tap the message to try again.',
              );
              return false;
            }
            try {
              // This is the documented /group/send-message fallback. Never send
              // a group id to the one-to-one /chats/send endpoint.
              const sent = await sendGroupMessage(groupId, text, replyTo);
              updateMessages(current =>
                upsertMessage(current, {
                  ...sent,
                  tempId,
                  text,
                  isOwn: true,
                  queued: false,
                  status: sent.status || 'sent',
                }),
              );
              notifyGroup(String(sent.id || tempId));
              return true;
            } catch (restError) {
              updateMessages(current => applyStatus(current, tempId, 'failed'));
              setNotice(
                restError instanceof Error
                  ? restError.message
                  : socketError instanceof Error
                  ? socketError.message
                  : 'Unable to send the group message.',
              );
              return false;
            }
          }
        }
        const ack = await sendMessageOverSocket({
          receiverId: contact.userId,
          tempId,
          text,
          ...(replyTo ? { replyTo } : {}),
        });
        // Only the id and the status change here. Re-stamping createdAt from the
        // ACK would push the bubble to a later time than the one already on
        // screen and reshuffle the thread under the user.
        updateMessages(current =>
          current.map(message =>
            message.tempId === tempId || message.id === tempId
              ? {
                  ...message,
                  id: String(ack.messageId || message.id),
                  queued: false,
                  // A duplicate ACK means this tempId was already stored, so the
                  // server's status is the truthful one, not a fresh "sent".
                  status: mergeStatus(message.status, ack.status || 'sent'),
                }
              : message,
          ),
        );
        if (!ack.duplicate) {
          // Push delivery is a side effect of a successfully persisted message.
          // It never blocks the bubble or changes its delivery status.
          notifyMessageOnce(
            String(ack.messageId || tempId),
            contact.userId,
            text,
            chatId,
          ).catch(() => undefined);
        }
        return true;
      } catch (socketError) {
        // A silent ACK is not proof the send failed - the message may already be
        // stored. `/chats/send` cannot carry our tempId, so retrying there would
        // write a second copy. Mark it failed instead: the retry replays the same
        // tempId over the socket, which the server resolves as a duplicate.
        if (isAckTimeout(socketError)) {
          updateMessages(current => applyStatus(current, tempId, 'failed'));
          setNotice(
            'That is taking longer than usual. Tap the message to try again.',
          );
          return false;
        }
        try {
          const sent = replyTo
            ? await sendChatMessage(contact.userId, text, replyTo)
            : await sendChatMessage(contact.userId, text);
          updateMessages(current =>
            upsertMessage(current, {
              ...sent,
              tempId,
              text,
              isOwn: true,
              queued: false,
              status: sent.status || 'sent',
            }),
          );
          notifyMessageOnce(
            String(sent.id || tempId),
            contact.userId,
            text,
            chatId,
          ).catch(() => undefined);
          return true;
        } catch (restError) {
          updateMessages(current => applyStatus(current, tempId, 'failed'));
          setNotice(
            restError instanceof Error
              ? restError.message
              : socketError instanceof Error
              ? socketError.message
              : 'Unable to send the message.',
          );
          return false;
        }
      } finally {
        setSending(false);
      }
    },
    [chatId, contact.kind, contact.name, contact.userId, groupDetails, updateMessages],
  );

  const updateDisappearingTimer = useCallback(
    async (timer: DisappearingMessageDuration) => {
      if (contact.kind === 'group') {
        return;
      }
      await setChatDisappearingTimer(contact.userId, timer);
      await setStoredChatDisappearingTimer(chatId, timer);

      const tempId = nextTempId();
      const text = buildDisappearingTimerEventText(timer);
      const optimistic: ChatMessage = {
        id: tempId,
        tempId,
        text: disappearingTimerEventCopy(timer).title,
        createdAt: new Date().toISOString(),
        isOwn: true,
        messageType: 'text',
        status: 'pending',
        systemEvent: true,
        systemEventType: 'disappearing_timer',
        disappearingTimer: timer,
      };
      append(optimistic);

      try {
        const ack = await sendMessageOverSocket({
          receiverId: contact.userId,
          tempId,
          text,
        });
        updateMessages(current =>
          current.map(message =>
            message.tempId === tempId || message.id === tempId
              ? {
                  ...message,
                  id: String(ack.messageId || message.id),
                  queued: false,
                  status: mergeStatus(message.status, ack.status || 'sent'),
                }
              : message,
          ),
        );
      } catch (socketError) {
        if (isAckTimeout(socketError)) {
          updateMessages(current => applyStatus(current, tempId, 'failed'));
          setNotice(
            'Timer updated, but the chat banner is taking longer than usual.',
          );
          return;
        }
        try {
          const sent = await sendChatMessage(contact.userId, text);
          updateMessages(current =>
            upsertMessage(current, {
              ...sent,
              tempId,
              isOwn: true,
              systemEvent: true,
              systemEventType: 'disappearing_timer',
              disappearingTimer: timer,
              status: sent.status || 'sent',
            }),
          );
        } catch (restError) {
          updateMessages(current => applyStatus(current, tempId, 'failed'));
          throw restError instanceof Error
            ? restError
            : socketError instanceof Error
            ? socketError
            : new Error('Unable to update disappearing messages.');
        }
      }
    },
    [append, chatId, contact.kind, contact.userId, updateMessages],
  );

  /**
   * The GIF equivalent of `deliver`.
   *
   * A hosted GIF normally goes straight onto the message as its `mediaUrl`.
   * When the group socket cannot accept that media payload, use the documented
   * group media upload route; the direct text route cannot persist attachments.
   */
  const deliverGif = useCallback(
    async (tempId: string, gifUrl: string, label = 'GIF') => {
      if (contact.kind !== 'group' && isUserBlocked(contact.userId)) {
        setNotice('Unblock this contact to send messages or make calls.');
        return;
      }
      setSending(true);
      updateMessages(current => current.map(message =>
        message.tempId === tempId || message.id === tempId
          ? {...message, queued: false}
          : message,
      ));
      try {
        let messageId = tempId;
        let status = 'sent';
        let duplicate = false;
        if (contact.kind === 'group') {
          const groupId = contact.userId || chatId;
          try {
            const ack = await sendGroupMessageOverSocket({
              groupId,
              tempId,
              mediaUrl: gifUrl,
              mediaType: 'image',
            });
            messageId = String(ack.id || tempId);
            status = ack.status || 'sent';
          } catch (socketError) {
            // A timeout is ambiguous: the server may already have stored the GIF.
            // Avoid sending a second copy through the non-idempotent upload route.
            if (isAckTimeout(socketError)) {
              throw socketError;
            }
            const downloaded = await File.downloadFileAsync(
              gifUrl,
              new File(Paths.cache, `chatterly-${Date.now()}.gif`),
              { idempotent: true },
            );
            const sent = await sendGroupMedia(groupId, {
              uri: downloaded.uri,
              name: 'shared.gif',
              type: 'image/gif',
            });
            messageId = sent.id || tempId;
            status = sent.status || 'sent';
            updateMessages(current =>
              upsertMessage(current, {
                ...sent,
                id: messageId,
                tempId,
                isOwn: true,
                queued: false,
                status,
                messageType: 'image',
                mediaUrl: sent.mediaUrl || gifUrl,
              }),
            );
            notifyGroupMessageOnce(
              messageId,
              (groupDetails?.participants || []).map(member => member.userId),
              `${groupDetails?.name || contact.name}: Sent a ${label} GIF`,
              groupId,
            ).catch(() => undefined);
            return true;
          }
        } else {
          const ack = await sendMessageOverSocket({
            receiverId: contact.userId,
            tempId,
            mediaUrl: gifUrl,
            mediaType: 'image',
          });
          messageId = String(ack.messageId || tempId);
          status = ack.status || 'sent';
          duplicate = Boolean(ack.duplicate);
        }
        updateMessages(current =>
          current.map(message =>
            message.tempId === tempId || message.id === tempId
              ? {
                  ...message,
                  id: messageId,
                  queued: false,
                  status: mergeStatus(message.status, status),
                  mediaUrl: message.mediaUrl || gifUrl,
                }
              : message,
          ),
        );
        if (!duplicate) {
          if (contact.kind === 'group') {
            notifyGroupMessageOnce(
              messageId,
              (groupDetails?.participants || []).map(member => member.userId),
              `${groupDetails?.name || contact.name}: Sent a ${label} GIF`,
              contact.userId || chatId,
            ).catch(() => undefined);
          } else {
            notifyMessageOnce(
              messageId,
              contact.userId,
              `Sent a ${label} GIF`,
              chatId,
            ).catch(() => undefined);
          }
        }
        return true;
      } catch (error) {
        // Offline is a wait, not a failure: the outbox replays it on reconnect.
        // A rejection while the socket is up is a real refusal - a block, say -
        // so the bubble is marked failed and offers the retry instead.
        if (connection !== 'connected') {
          updateMessages(current =>
            current.map(message =>
              message.tempId === tempId || message.id === tempId
                ? { ...message, queued: true, status: 'pending' }
                : message,
            ),
          );
          setNotice('GIF queued. It will send when you are back online.');
        } else {
          updateMessages(current => applyStatus(current, tempId, 'failed'));
          setNotice(
            error instanceof Error ? error.message : 'Unable to send the GIF.',
          );
        }
        return false;
      } finally {
        setSending(false);
      }
    },
    [chatId, connection, contact.kind, contact.name, contact.userId, groupDetails, updateMessages],
  );

  const send = useCallback(async () => {
    if (contact.kind !== 'group' && isUserBlocked(contact.userId)) {
      setNotice('Unblock this contact to send messages or make calls.');
      return;
    }
    const text = draft.trim();
    if (sending) {
      return;
    }
    // Native text inputs cannot insert a clipboard bitmap as a chat
    // attachment. Read it at send time and use the existing caption upload
    // routes so the image and typed text persist as one message.
    if (text && Clipboard.hasImageAsync && Clipboard.getImageAsync) {
      try {
        if (await Clipboard.hasImageAsync()) {
          if (mediaBlocked) {
            setNotice(MEDIA_ADMINS_ONLY_NOTICE);
            return;
          }
          const clipboardImage = await Clipboard.getImageAsync({format: 'png'});
          if (!clipboardImage?.data) {
            setNotice('Unable to read the copied image. Please copy it again.');
            return;
          }
          if (contact.kind !== 'group' && connection !== 'connected') {
            setNotice('Connect to the internet to send the copied image.');
            return;
          }
          const base64 = clipboardImage.data.replace(/^data:image\/\w+;base64,/, '');
          const uri = new File(Paths.cache, `chatterly-clipboard-${Date.now()}.png`);
          uri.write(base64, {encoding: 'base64'});
          const upload = {uri: uri.uri, name: 'pasted-image.png', type: 'image/png'};
          setSending(true);
          setMediaTransfer({phase: 'uploading', progress: 0, current: 1, total: 1});
          try {
            const sent = contact.kind === 'group'
              ? await sendGroupMedia(contact.userId || chatId, upload, text, progress =>
                  setMediaTransfer({phase: 'uploading', progress, current: 1, total: 1}),
                )
              : await sendChatMedia(contact.userId, upload, {
                  caption: text,
                  onUploadProgress: progress => setMediaTransfer({phase: 'uploading', progress, current: 1, total: 1}),
                  onUploadComplete: () => setMediaTransfer({phase: 'delivering', progress: 0.99, current: 1, total: 1}),
                });
            appendAndNotify(sent, 'Sent a photo');
            setDraft('');
            setReplyingTo(null);
            setMediaTransfer({phase: 'idle', progress: 0, current: 0, total: 0});
            return;
          } finally {
            setSending(false);
          }
        }
      } catch (error) {
        setMediaTransfer({phase: 'idle', progress: 0, current: 0, total: 0});
        setNotice(error instanceof Error ? error.message : 'Unable to send the copied image.');
        return;
      }
    }
    if (!text) {
      if (replyingTo) {
        setNotice('Reply cannot be empty.');
      }
      return;
    }

    const tempId = nextTempId();
    const reply = replyingTo;
    setDraft('');
    setReplyingTo(null);
    emitTyping(contact.userId, false);
    if (connection !== 'connected') {
      append({
        id: tempId,
        tempId,
        text,
        createdAt: new Date().toISOString(),
        isOwn: true,
        queued: true,
        status: 'pending',
        messageType: 'text',
        replyTo: reply?.id,
        replyPreview: reply
          ? {
              content: reply.text || reply.messageType || 'Message',
              messageType: reply.messageType,
              createdAt: reply.createdAt,
              mediaUrl: reply.mediaUrl,
            }
          : null,
      });
      return;
    }
    append({
      id: tempId,
      tempId,
      text,
      createdAt: new Date().toISOString(),
      isOwn: true,
      status: 'pending',
      messageType: 'text',
      replyTo: reply?.id,
      replyPreview: reply
        ? {
            content: reply.text || reply.messageType || 'Message',
            messageType: reply.messageType,
            createdAt: reply.createdAt,
            mediaUrl: reply.mediaUrl,
          }
        : null,
    });
    await deliver(tempId, text, reply?.id);
  }, [append, appendAndNotify, chatId, connection, contact.kind, contact.userId, deliver, draft, mediaBlocked, replyingTo, sending]);

  /**
   * Sprint 4 Story 6's GIF tab. Picking a GIF is the send - there is no preview
   * step in the design - so the bubble appears immediately and the picker stays
   * open, matching how the emoji grid behaves.
   */
  const sendGif = useCallback(
    async (gif: GifItem) => {
      if (contact.kind !== 'group' && isUserBlocked(contact.userId)) {
        setNotice('Unblock this contact to send messages or make calls.');
        return;
      }
      const tempId = nextTempId();
      const optimistic: ChatMessage = {
        id: tempId,
        tempId,
        text: '',
        createdAt: new Date().toISOString(),
        isOwn: true,
        status: 'pending',
        messageType: 'image',
        mediaUrl: gif.url,
        queued: true,
      };

      // The outbox serializes sends. Keep every selection even while another
      // message is awaiting its ACK, instead of silently dropping the tap.
      append(optimistic);
      if (connection !== 'connected') {
        setNotice('GIF queued. It will send when you are back online.');
      }
    },
    [append, connection, contact.kind, contact.userId],
  );

  const attachDocument = useCallback(() => {
    setAttachmentOpen(false);
    setAttachmentStart('tray');
    setDocumentOpen(true);
  }, []);

  const attachContact = useCallback(async () => {
    setAttachmentOpen(false);
    setLoadingContacts(true);
    setContactPickerOpen(true);
    try {
      const current = await Contacts.getPermissionsAsync();
      const permission = current.granted
        ? current
        : await Contacts.requestPermissionsAsync();
      if (!permission.granted) {
        setContactPickerOpen(false);
        setNotice('Contact access is required to share a contact.');
        return;
      }
      const records = (await Contacts.Contact.getAllDetails([
        Contacts.ContactField.FULL_NAME,
        Contacts.ContactField.GIVEN_NAME,
        Contacts.ContactField.FAMILY_NAME,
        Contacts.ContactField.PHONES,
        Contacts.ContactField.EMAILS,
      ])) as Array<{
        id: string;
        fullName?: string;
        givenName?: string;
        familyName?: string;
        phones?: Array<{ number?: string }>;
        emails?: Array<{ address?: string }>;
      }>;
      setShareableContacts(
        records
          .map(record => ({
            id: String(record.id),
            name:
              record.fullName ||
              `${record.givenName || ''} ${record.familyName || ''}`.trim() ||
              'Unnamed contact',
            phoneNumbers: record.phones?.map(value => value.number || '').filter(Boolean) || [],
            emailAddresses: record.emails?.map(value => value.address || '').filter(Boolean) || [],
          }))
          .filter(record => record.phoneNumbers.length || record.emailAddresses.length)
          .sort((first, second) => first.name.localeCompare(second.name)),
      );
    } catch (error) {
      setContactPickerOpen(false);
      setNotice(
        error instanceof Error ? error.message : 'Unable to open contacts.',
      );
    } finally {
      setLoadingContacts(false);
    }
  }, []);

  const shareContact = useCallback(
    async (shared: ShareableContact) => {
      if (sending) return;
      setSending(true);
      try {
        const name = vCardFileName(shared.name);
        const file = new File(Paths.cache, `${Date.now()}-${name}`);
        file.write(createVCard(shared));
        const upload = {uri: file.uri, name, type: 'text/vcard'};
        const sent =
          contact.kind === 'group'
            ? await sendGroupFile(contact.userId || chatId, upload)
            : await sendChatFile(contact.userId, upload);
        appendAndNotify(sent, `Shared ${shared.name}'s contact`);
        setContactPickerOpen(false);
      } catch (error) {
        setNotice(
          error instanceof Error ? error.message : 'Unable to share contact.',
        );
      } finally {
        setSending(false);
      }
    },
    [appendAndNotify, chatId, contact.kind, contact.userId, sending],
  );

  const sendDocument = useCallback(
    async (
      file: { uri: string; name: string; type: string },
      onProgress: (progress: number) => void,
    ) => {
      if (contact.kind !== 'group' && isUserBlocked(contact.userId)) {
        setNotice('Unblock this contact to send messages or make calls.');
        throw new Error('Unblock this contact to send files.');
      }
      setSending(true);
      try {
        const sent =
          contact.kind === 'group'
            ? isAudioUpload(file)
              ? await sendGroupMedia(
                  contact.userId || chatId,
                  file,
                  undefined,
                  onProgress,
                )
              : await sendGroupFile(contact.userId || chatId, file, onProgress)
            : isAudioUpload(file)
            ? await sendChatMedia(contact.userId, file, {
                duration: 0,
                onUploadProgress: onProgress,
              })
            : await sendChatFile(contact.userId, file, {
                onUploadProgress: onProgress,
              });
        appendAndNotify(
          sent,
          isAudioUpload(file) ? 'Sent an audio file' : `Sent ${file.name}`,
        );
        return sent;
      } catch (error) {
        throw error instanceof Error
          ? error
          : new Error('Unable to send file.');
      } finally {
        setSending(false);
      }
    },
    [appendAndNotify, chatId, contact.kind, contact.userId],
  );

  const openMediaFromFiles = useCallback((screen: 'gallery' | 'camera') => {
    setDocumentOpen(false);
    setAttachmentStart(screen);
    setAttachmentOpen(true);
  }, []);

  const attachLocation = useCallback(async () => {
    setAttachmentOpen(false);
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) {
      setNotice('Location access is required to share your location.');
      return;
    }
    setSending(true);
    try {
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const { latitude, longitude } = position.coords;
      let name = 'Shared location';
      try {
        const [place] = await Location.reverseGeocodeAsync({
          latitude,
          longitude,
        });
        name =
          [place?.name, place?.district, place?.city]
            .filter(Boolean)
            .slice(0, 2)
            .join(', ') || name;
      } catch {
        /* Coordinates and maps link remain fully usable. */
      }
      const content = locationMessage(latitude, longitude, name);
      const sent =
        contact.kind === 'group'
          ? await sendGroupText(contact.userId || chatId, content)
          : await sendChatMessage(contact.userId, content);
      appendAndNotify(sent, `Shared ${name}`);
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : 'Unable to share location.',
      );
    } finally {
      setSending(false);
    }
  }, [appendAndNotify, chatId, contact.kind, contact.userId]);

  const sendAttachments = useCallback(
    async (media: AttachmentMedia[], caption: string, hdEnabled: boolean) => {
      if (contact.kind !== 'group' && isUserBlocked(contact.userId)) {
        setNotice('Unblock this contact to send messages or make calls.');
        return false;
      }
      if (!media.length || sending) return false;
      setSending(true);
      // Every file of a multi-select send carries this token in its upload name,
      // which is what lets the thread rebuild the album after a reinstall.
      const albumToken = media.length > 1 ? createAlbumToken() : '';
      const mediaGroupId = albumToken ? albumGroupId(albumToken) : null;
      try {
        for (let index = 0; index < media.length; index += 1) {
          const current = index + 1;
          setMediaTransfer({
            phase: 'compressing',
            progress: index / media.length,
            current,
            total: media.length,
          });
          const compressed = await compressChatMedia(
            media[index],
            progress => {
              setMediaTransfer({
                phase: 'compressing',
                progress: (index + progress * 0.2) / media.length,
                current,
                total: media.length,
              });
            },
            hdEnabled,
          );
          setMediaTransfer({
            phase: 'uploading',
            progress: (index + 0.2) / media.length,
            current,
            total: media.length,
          });
          const upload = {
            uri: compressed.uri,
            name: albumToken
              ? tagAlbumFileName(compressed.fileName, albumToken)
              : compressed.fileName,
            type: compressed.mimeType,
          };
          const sent =
            contact.kind === 'group'
              ? await sendGroupMedia(
                  contact.userId || chatId,
                  upload,
                  caption || undefined,
                  progress =>
                    setMediaTransfer({
                      phase: 'uploading',
                      progress: (index + 0.2 + progress * 0.8) / media.length,
                      current,
                      total: media.length,
                    }),
                )
              : await sendChatMedia(contact.userId, upload, {
                  caption: caption || undefined,
                  onUploadProgress: progress =>
                    setMediaTransfer({
                      phase: 'uploading',
                      progress: (index + 0.2 + progress * 0.8) / media.length,
                      current,
                      total: media.length,
                    }),
                  onUploadComplete: () =>
                    setMediaTransfer({
                      phase: 'delivering',
                      progress: (index + 0.99) / media.length,
                      current,
                      total: media.length,
                    }),
                });
          appendAndNotify(
            { ...sent, mediaGroupId },
            compressed.type === 'video' ? 'Sent a video' : 'Sent a photo',
          );
        }
        setMediaTransfer({ phase: 'idle', progress: 0, current: 0, total: 0 });
        return true;
      } catch (error) {
        setNotice(
          error instanceof Error ? error.message : 'Unable to send attachment.',
        );
        setMediaTransfer({ phase: 'idle', progress: 0, current: 0, total: 0 });
        return false;
      } finally {
        setSending(false);
      }
    },
    [appendAndNotify, chatId, contact.kind, contact.userId, sending],
  );

  const openedIncomingShare = useRef('');
  useEffect(() => {
    if (!incomingMedia?.media.length || openedIncomingShare.current === incomingMedia.id) { return; }
    if (contact.kind === 'group' && !groupDetails) { return; }
    if (contactBlocked || mediaBlocked || groupSendNotice) {
      setNotice(contactBlocked ? 'Unblock this contact to send messages or make calls.' : groupSendNotice || MEDIA_ADMINS_ONLY_NOTICE);
      return;
    }
    openedIncomingShare.current = incomingMedia.id;
    Keyboard.dismiss();
    setEmojiOpen(false);
    setAttachmentStart('tray');
    setAttachmentOpen(true);
  }, [contact.kind, contactBlocked, groupDetails, groupSendNotice, incomingMedia, mediaBlocked]);

  const downloadMedia = useCallback(async (message: ChatMessage) => {
    if (!message.mediaUrl && ((message.messageType !== 'file' && message.messageType !== 'video') || !message.id)) {
      return;
    }
    // A copy saved earlier (auto-download, or a previous tap) opens straight away.
    const saved = downloadedFileFor(message.id);
    if (!saved) {
      setNotice('Downloading media…');
    }
    try {
      if (isVideoAttachment(message)) {
        await saveVideoToDevice(message, () => getMediaDownloadUrl(message.id));
        setNotice(Platform.OS === 'ios' ? 'Video saved to Photos.' : 'Video saved to Gallery.');
        return;
      }
      let uri = saved;
      if (!uri) {
        uri = await saveDocumentLocally(
          message,
          getMediaDownloadUrl,
          message.messageType === 'file',
        );
      }
      if (message.messageType === 'file') {
        await openDownloadedDocument(
          uri,
          message.fileType,
          message.fileName || 'document',
        );
      } else if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {mimeType: message.fileType});
      }
      if (!saved) {
        setNotice(`Downloaded ${message.fileName || message.messageType}.`);
      }
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : 'Unable to download media.',
      );
    }
  }, []);

  const placeOutgoingCall = useCallback(
    async (type: CallType) => {
      if (contact.kind !== 'group' && isUserBlocked(contact.userId)) {
        setNotice('Unblock this contact to send messages or make calls.');
        return;
      }
      if (sending) {
        return;
      }
      // Sprint 9 Story 2: a group thread starts a conference rather than a
      // one-to-one call, which App owns so it outlives this screen.
      if (contact.kind === 'group') {
        if (onStartGroupCall) {
          onStartGroupCall(type);
        } else {
          setNotice('One-to-one calls are available from direct chats.');
        }
        return;
      }
      setEndedCall(null);
      Keyboard.dismiss();
      setEmojiOpen(false);
      setAttachmentOpen(false);
      setCallHidden(false);
      setCallFailedOpen(false);
      setCallDurationSeconds(0);
      let videoEnabled = false;
      if (type === 'video') {
        const existing = await Camera.getCameraPermissionsAsync();
        const permission = existing.granted
          ? existing
          : await Camera.requestCameraPermissionsAsync();
        if (!permission.granted) {
          setNotice('Camera access is required for a video call.');
          return;
        }
        videoEnabled = true;
      }
      setActiveCall({
        callId: '',
        chatId,
        type,
        status: 'calling',
        startedAt: new Date().toISOString(),
        connectedAt: null,
        muted: false,
        held: false,
        speaker: type === 'video',
        videoEnabled,
      });
      setSending(true);
      try {
        await setAudioModeAsync({
          allowsRecording: true,
          allowsBackgroundRecording: true,
          playsInSilentMode: true,
          shouldPlayInBackground: true,
          shouldRouteThroughEarpiece: type !== 'video',
        });
        let call = await initiateCallOverSocket(contact.userId, type);
        if (!call.success && !call.callId) {
          throw new Error(call.message || `Unable to start ${type} call.`);
        }
        if (!call.success) {
          setNotice(call.message);
          closeActiveCall();
          return;
        }
        setActiveCall(current =>
          current
            ? {
                ...current,
                callId: call.callId,
                chatId: call.chatId || chatId,
                status: normalizeOutgoingCallStatus(call.status || 'ringing'),
              }
            : current,
        );
        startCallAudio({
          callId: call.callId,
          role: 'caller',
          contactName: contact.name,
          type,
          muted: false,
          speaker: type === 'video',
        }).catch(error =>
          setNotice(
            error instanceof Error
              ? error.message
              : 'Unable to start call audio.',
          ),
        );
        setNotice(call.message);
      } catch (socketError) {
        try {
          const call = await startCall(contact.userId, type);
          if (call.status === 'missed') {
            setNotice(call.message);
            setEndedCall({ duration: 0, type });
            closeActiveCall();
            return;
          }
          setActiveCall(current =>
            current
              ? {
                  ...current,
                  callId: call.callId,
                  status: normalizeOutgoingCallStatus(
                    call.status === 'calling' ? 'ringing' : call.status,
                  ),
                }
              : current,
          );
          startCallAudio({
            callId: call.callId,
            role: 'caller',
            contactName: contact.name,
            type,
            muted: false,
            speaker: type === 'video',
          }).catch(error =>
            setNotice(
              error instanceof Error
                ? error.message
                : 'Unable to start call audio.',
            ),
          );
          setNotice(call.message);
        } catch (error) {
          closeActiveCall();
          setNotice(
            error instanceof Error
              ? error.message
              : socketError instanceof Error
              ? socketError.message
              : `Unable to start ${type} call.`,
          );
        }
      } finally {
        setSending(false);
      }
    },
    [
      chatId,
      closeActiveCall,
      contact.kind,
      contact.name,
      contact.userId,
      onStartGroupCall,
      sending,
    ],
  );

  const beginCall = useCallback(
    async (type: CallType) => {
      if (contact.kind !== 'group' && isUserBlocked(contact.userId)) {
        setNotice('Unblock this contact to send messages or make calls.');
        return;
      }
      if (sending) {
        return;
      }
      try {
        const permission = await getRecordingPermissionsAsync();
        if (!permission.granted) {
          setPendingCallType(type);
          setMicrophoneSheetOpen(true);
          return;
        }
        await placeOutgoingCall(type);
      } catch {
        setPendingCallType(type);
        setMicrophoneSheetOpen(true);
      }
    },
    [contact.kind, contact.userId, placeOutgoingCall, sending],
  );

  const handledCallRequest = useRef<string | null>(null);
  useEffect(() => {
    if (!callRequest || handledCallRequest.current === callRequest.id || sending) {
      return;
    }
    handledCallRequest.current = callRequest.id;
    onCallRequestHandled?.();
    beginCall(callRequest.type).catch(() => undefined);
  }, [callRequest, onCallRequestHandled, beginCall, sending]);

  const allowMicrophoneAndCall = useCallback(async () => {
    const type = pendingCallType || 'audio';
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      setNotice('Microphone access is required to make a call.');
      setMicrophoneSheetOpen(false);
      setPendingCallType(null);
      return;
    }
    setMicrophoneSheetOpen(false);
    setPendingCallType(null);
    await placeOutgoingCall(type);
  }, [pendingCallType, placeOutgoingCall]);

  const retryFailedCall = useCallback(async () => {
    const failedCall = activeCallRef.current;
    if (!failedCall) {
      return;
    }
    if (networkAvailable === false) {
      setNotice('No internet connection. Reconnect and try again.');
      return;
    }
    setCallFailedOpen(false);
    if (failedCall.callId) {
      try {
        if (failedCall.connectedAt) {
          await endCallOverSocket(failedCall.callId);
        } else {
          await cancelCallOverSocket(failedCall.callId);
        }
      } catch {
        /* A failed call may already have been closed by the server. */
      }
    }
    closeActiveCall();
    await placeOutgoingCall(failedCall.type);
  }, [closeActiveCall, networkAvailable, placeOutgoingCall]);

  const cancelFailedCall = useCallback(() => {
    const failedCall = activeCallRef.current;
    if (networkAvailable !== false && failedCall?.callId) {
      const close = failedCall.connectedAt
        ? endCallOverSocket
        : cancelCallOverSocket;
      close(failedCall.callId).catch(() => undefined);
    }
    closeActiveCall();
  }, [closeActiveCall, networkAvailable]);

  const hasDraft = draft.trim().length > 0;
  const recordingSeconds = Math.max(
    0,
    Math.round(recorderState.durationMillis / 1000),
  );
  useEffect(() => {
    if (
      !recorderState.isRecording ||
      typeof recorderState.metering !== 'number' ||
      !Number.isFinite(recorderState.metering)
    ) {
      return;
    }
    const now = Date.now();
    if (now - lastVoiceMeterSampleAt.current < 120) {
      return;
    }
    lastVoiceMeterSampleAt.current = now;
    // Recorder metering is reported in dBFS (normally -60 to 0). Convert it
    // into the same compact pixel heights used by the message waveform.
    const level = Math.max(0, Math.min(1, (recorderState.metering + 60) / 60));
    const bar = Math.round(5 + level * 34);
    const next = [...voiceWaveformSamples.current, bar].slice(
      -VOICE_WAVEFORM.length,
    );
    voiceWaveformSamples.current = next;
    setVoiceWaveform(next);
  }, [recorderState.isRecording, recorderState.metering]);
  const currentRecordingUri = useCallback(
    () =>
      recorder.uri ||
      (recorderState as { url?: string | null }).url ||
      null,
    [recorder, recorderState],
  );
  const prepareVoiceRecorder = useCallback(async () => {
    await setAudioModeAsync(VOICE_RECORDING_AUDIO_MODE);
    const status = recorder.getStatus?.();
    if (status?.isRecording) {
      await recorder.stop().catch(() => undefined);
    }
    if (
      status?.canRecord &&
      !(status as { mediaServicesDidReset?: boolean }).mediaServicesDidReset
    ) {
      return;
    }
    try {
      await recorder.prepareToRecordAsync(VOICE_RECORDING_OPTIONS);
    } catch {
      await recorder.stop().catch(() => undefined);
      await setAudioModeAsync(VOICE_IDLE_AUDIO_MODE).catch(() => undefined);
      await setAudioModeAsync(VOICE_RECORDING_AUDIO_MODE);
      const recoveredStatus = recorder.getStatus?.();
      if (
        recoveredStatus?.canRecord &&
        !(recoveredStatus as { mediaServicesDidReset?: boolean })
          .mediaServicesDidReset
      ) {
        return;
      }
      await recorder.prepareToRecordAsync(VOICE_RECORDING_OPTIONS);
    }
  }, [recorder]);

  const sendVoiceFromUri = useCallback(
    async (
      uri: string,
      duration: number,
      waveform: number[],
      existingTempId?: string,
    ) => {
      if (contact.kind !== 'group' && isUserBlocked(contact.userId)) {
        setNotice('Unblock this contact to send messages or make calls.');
        return;
      }
      if (sending && !existingTempId) {
        return false;
      }
      const tempId = existingTempId || nextTempId();
      const createdAt = new Date().toISOString();
      if (!existingTempId) {
        append({
          id: tempId,
          tempId,
          text: '',
          createdAt,
          isOwn: true,
          status: 'pending',
          messageType: 'audio',
          mediaUrl: uri,
          audioDuration: duration,
          waveform,
        });
      }
      setSending(true);
      changeVoiceMode('sending');
      try {
        if (contact.kind === 'group') {
          const extension = uri.split('?')[0].split('.').pop() || 'm4a';
          const sent = await sendGroupMedia(contact.userId || chatId, {
            uri,
            name: `voice-${Date.now()}.${extension}`,
            type: audioMimeType(uri),
          });
          updateMessages(current =>
            upsertMessage(current, {
              ...sent,
              tempId,
              isOwn: true,
              audioDuration: duration,
              waveform,
            }),
          );
          notifyGroupMessageOnce(
            String(sent.id || tempId),
            (groupDetails?.participants || []).map(member => member.userId),
            `${groupDetails?.name || contact.name}: Sent a voice message`,
            contact.userId || chatId,
          ).catch(() => undefined);
          return true;
        }
        const extension = uri.split('?')[0].split('.').pop() || 'm4a';
        const sent = await sendChatMedia(
          contact.userId,
          {
            uri,
            name: `voice-${Date.now()}.${extension}`,
            type: audioMimeType(uri),
          },
          {duration, waveform},
        );
        updateMessages(current =>
          upsertMessage(current, {
            ...sent,
            tempId,
            isOwn: true,
            messageType: 'audio',
            mediaUrl: sent.mediaUrl || uri,
            audioDuration: duration,
            waveform,
          }),
        );
        notifyMessageOnce(
          String(sent.id || tempId),
          contact.userId,
          'Sent a voice message',
          chatId,
        ).catch(() => undefined);
        return true;
      } catch (error) {
        if (connection !== 'connected') {
          updateMessages(current =>
            current.map(message =>
              message.tempId === tempId || message.id === tempId
                ? { ...message, queued: true, status: 'pending' }
                : message,
            ),
          );
          setNotice(
            'Voice message queued. It will send when you are back online.',
          );
        } else {
          updateMessages(current => applyStatus(current, tempId, 'failed'));
          setNotice(
            error instanceof Error
              ? error.message
              : 'Unable to send voice message.',
          );
        }
        return false;
      } finally {
        setSending(false);
        changeVoiceMode('idle');
        setVoicePreviewUri(null);
      }
    },
    [
      append,
      changeVoiceMode,
      chatId,
      connection,
      contact.kind,
      contact.name,
      contact.userId,
      groupDetails,
      sending,
      updateMessages,
    ],
  );

  const startVoiceRecording = useCallback(async (event?: GestureResponderEvent) => {
    if (
      sending ||
      hasDraft ||
      voiceStarting.current ||
      voiceModeRef.current !== 'idle'
    ) {
      return;
    }
    voiceStarting.current = true;
    setVoiceBusy(true);
    const touch = event?.nativeEvent;
    voiceTouch.current = touch
      ? { id: touch.identifier, x: touch.pageX, y: touch.pageY, timestamp: touch.timestamp }
      : null;
    Keyboard.dismiss();
    setEmojiOpen(false);
    setAttachmentOpen(false);
    const sessionId = voiceSessionId.current + 1;
    voiceSessionId.current = sessionId;
    voicePressing.current = true;
    voiceGesture.current = 'record';
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        voicePressing.current = false;
        changeVoiceMode('idle');
        setNotice('Microphone access is required to record a message.');
        return;
      }
      const gestureAfterPermission = voiceGesture.current as 'record' | 'cancel' | 'lock';
      if ((!voicePressing.current && gestureAfterPermission !== 'lock') || voiceSessionId.current !== sessionId) {
        return;
      }
      changeVoiceMode(gestureAfterPermission === 'lock' ? 'locked' : 'holding');
      voiceCaptureOpen.current = false;
      voiceCaptureActive.current = false;
      setVoicePreviewUri(null);
      voiceWaveformSamples.current = [];
      lastVoiceMeterSampleAt.current = 0;
      setVoiceWaveform([]);
      await prepareVoiceRecorder();
      voiceCaptureOpen.current = true;
      await Promise.resolve();
      const modeAfterPrepare = voiceModeRef.current as VoiceRecordingMode;
      if (
        voiceSessionId.current !== sessionId ||
        (!voicePressing.current && modeAfterPrepare === 'holding') ||
        !(['holding', 'locked'] as VoiceRecordingMode[]).includes(
          modeAfterPrepare,
        )
      ) {
        await recorder.stop().catch(() => undefined);
        voiceCaptureOpen.current = false;
        voiceCaptureActive.current = false;
        await setAudioModeAsync(VOICE_IDLE_AUDIO_MODE).catch(() => undefined);
        if (voiceSessionId.current === sessionId) changeVoiceMode('idle');
        return;
      }
      recorder.record();
      voiceCaptureActive.current = true;
    } catch {
      voiceCaptureOpen.current = false;
      voiceCaptureActive.current = false;
      await recorder.stop().catch(() => undefined);
      await setAudioModeAsync(VOICE_IDLE_AUDIO_MODE).catch(() => undefined);
      changeVoiceMode('idle');
      setNotice('Unable to start voice recording.');
    } finally {
      voiceStarting.current = false;
      setVoiceBusy(false);
    }
  }, [changeVoiceMode, hasDraft, prepareVoiceRecorder, recorder, sending]);

  const cancelVoiceRecording = useCallback(async () => {
    const activeMode = voiceModeRef.current;
    const wasActive = activeMode !== 'idle';
    voicePreviewPlayer.current?.pause();
    changeVoiceMode('idle');
    setVoicePreviewUri(null);
    voiceGesture.current = 'record';
    voiceSessionId.current += 1;
    voicePressing.current = false;
    voiceTouch.current = null;
    if (!wasActive) {
      return;
    }
    try {
      if (
        voiceCaptureOpen.current ||
        recorderState.isRecording ||
        activeMode === 'paused' ||
        activeMode === 'locked' ||
        activeMode === 'holding'
      ) {
        await recorder.stop();
      }
      voiceCaptureOpen.current = false;
      voiceCaptureActive.current = false;
      await setAudioModeAsync(VOICE_IDLE_AUDIO_MODE);
    } catch {
      // Discarding a voice draft should not trap the composer in recording UI.
    }
  }, [changeVoiceMode, recorder, recorderState.isRecording]);

  const finishVoiceRecording = useCallback(async () => {
    const activeMode = voiceModeRef.current;
    if (
      activeMode === 'idle' ||
      activeMode === 'sending' ||
      voiceFinishing.current ||
      voiceTransitioning.current ||
      (!voiceCaptureActive.current && activeMode !== 'paused')
    ) {
      return;
    }
    voiceFinishing.current = true;
    try {
      voicePreviewPlayer.current?.pause();
      changeVoiceMode('sending');
      // Native recorder state can clear during stop/session deactivation. Keep
      // this session's URI so a finalized recording still reaches the uploader.
      const recordingUri = currentRecordingUri();
      const duration = Math.max(
        1,
        Math.round(
          (recorder.getStatus().durationMillis || recordingSeconds * 1000) / 1000,
        ),
      );
      const waveform = voiceWaveformSamples.current.length
        ? [...voiceWaveformSamples.current]
        : waveformFromDuration(duration);
      voiceSessionId.current += 1;
      voicePressing.current = false;
      if (
        voiceCaptureOpen.current ||
        recorderState.isRecording ||
        activeMode === 'paused' ||
        activeMode === 'locked' ||
        activeMode === 'holding'
      ) {
        await recorder.stop();
      }
      voiceCaptureOpen.current = false;
      voiceCaptureActive.current = false;
      const uri = currentRecordingUri() || recordingUri;
      // Resetting playback routing must not discard an already saved note.
      await setAudioModeAsync(VOICE_IDLE_AUDIO_MODE).catch(() => undefined);
      if (!uri) {
        changeVoiceMode('idle');
        setNotice('The recording could not be saved.');
        return;
      }
      setVoiceWaveform(waveform);
      await sendVoiceFromUri(uri, duration, waveform);
    } catch (error) {
      changeVoiceMode('idle');
      setNotice(
        error instanceof Error
          ? error.message
          : 'Unable to send voice message.',
      );
    } finally {
      voiceFinishing.current = false;
    }
  }, [
    changeVoiceMode,
    currentRecordingUri,
    recorder,
    recorderState.isRecording,
    recordingSeconds,
    sendVoiceFromUri,
  ]);

  const pauseVoiceRecording = useCallback(async () => {
    const activeMode = voiceModeRef.current;
    if (
      (activeMode !== 'locked' && activeMode !== 'holding') ||
      voiceFinishing.current ||
      voiceTransitioning.current
    ) {
      return;
    }
    if (!voiceCaptureActive.current && !recorderState.isRecording) {
      return;
    }
    const duration = Math.max(1, recordingSeconds);
    const waveform = voiceWaveformSamples.current.length
      ? [...voiceWaveformSamples.current]
      : waveformFromDuration(duration);
    const sessionId = voiceSessionId.current;
    voiceTransitioning.current = true;
    setVoiceBusy(true);
    let paused = false;
    try {
      recorder.pause();
      paused = true;
      voiceCaptureActive.current = false;
      const uri = currentRecordingUri();
      if (!uri) throw new Error('The recording could not be saved.');
      const previewUri = await createVoiceRecordingPreview(uri);
      if (voiceSessionId.current !== sessionId) {
        deleteVoiceRecordingPreview(previewUri);
        return;
      }
      setVoicePreviewUri(previewUri);
      setVoiceWaveform(waveform);
      await setAudioModeAsync(VOICE_IDLE_AUDIO_MODE);
      if (voiceSessionId.current !== sessionId) return;
      changeVoiceMode('paused');
    } catch (error) {
      if (voiceSessionId.current !== sessionId) return;
      // Keep the draft resumable/sendable even when preview creation fails.
      if (paused) {
        await setAudioModeAsync(VOICE_IDLE_AUDIO_MODE).catch(() => undefined);
        if (voiceSessionId.current !== sessionId) return;
        changeVoiceMode('paused');
      }
      setNotice(
        error instanceof Error
          ? error.message
          : 'Unable to pause voice recording.',
      );
    } finally {
      voiceTransitioning.current = false;
      setVoiceBusy(false);
    }
  }, [
    changeVoiceMode,
    currentRecordingUri,
    recorder,
    recorderState.isRecording,
    recordingSeconds,
  ]);

  const resumeVoiceRecording = useCallback(async () => {
    if (
      voiceModeRef.current !== 'paused' ||
      voiceTransitioning.current ||
      voiceFinishing.current
    ) {
      return;
    }
    const sessionId = voiceSessionId.current;
    voiceTransitioning.current = true;
    setVoiceBusy(true);
    try {
      voicePreviewPlayer.current?.pause();
      await setAudioModeAsync(VOICE_RECORDING_AUDIO_MODE);
      if (voiceSessionId.current !== sessionId) return;
      recorder.record();
      voiceCaptureActive.current = true;
      setVoicePreviewUri(null);
      changeVoiceMode('locked');
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : 'Unable to resume voice recording.',
      );
    } finally {
      voiceTransitioning.current = false;
      setVoiceBusy(false);
    }
  }, [changeVoiceMode, recorder]);

  const lockVoiceRecording = useCallback(() => {
    if (voiceModeRef.current === 'holding') {
      voiceGesture.current = 'lock';
      changeVoiceMode('locked');
    }
  }, [changeVoiceMode]);

  const releaseVoiceRecording = useCallback(() => {
    if (!voicePressing.current) return;
    voicePressing.current = false;
    voiceTouch.current = null;
    if (voiceGesture.current === 'cancel') {
      cancelVoiceRecording().catch(() => undefined);
      return;
    }
    if (voiceGesture.current === 'lock' || voiceModeRef.current === 'locked') {
      voiceGesture.current = 'record';
      changeVoiceMode('locked');
      return;
    }
    if (voiceModeRef.current === 'holding') {
      voiceGesture.current = 'record';
      finishVoiceRecording().catch(() => undefined);
    }
  }, [cancelVoiceRecording, changeVoiceMode, finishVoiceRecording]);

  // Observe the original touch from the persistent dock. Pressable's press-out
  // also fires when it is hidden or loses its responder, before finger release.
  const moveVoiceTouch = useCallback((event: GestureResponderEvent) => {
    const origin = voiceTouch.current;
    if (!origin || !voicePressing.current || voiceModeRef.current !== 'holding') {
      return;
    }
    const touch = event.nativeEvent.touches.find(
      item => item.identifier === origin.id,
    );
    if (!touch) return;
    const dx = touch.pageX - origin.x;
    const dy = touch.pageY - origin.y;
    if (dx < -76 && Math.abs(dx) > Math.abs(dy)) {
      voiceGesture.current = 'cancel';
    } else if (dy < -44 && Math.abs(dy) > Math.abs(dx)) {
      lockVoiceRecording();
    } else {
      voiceGesture.current = 'record';
    }
  }, [lockVoiceRecording]);

  const endVoiceTouch = useCallback((event: GestureResponderEvent) => {
    const origin = voiceTouch.current;
    if (
      origin &&
      event.nativeEvent.touches.some(touch => touch.identifier === origin.id)
    ) {
      return;
    }
    // A tap opens hands-free controls; a longer hold still sends on release.
    // Keep the intent while permission/preparation is pending as well.
    const elapsed = origin?.timestamp !== undefined
      ? event.nativeEvent.timestamp - origin.timestamp
      : undefined;
    if (voicePressing.current && voiceGesture.current === 'record' &&
        elapsed !== undefined && elapsed >= 0 && elapsed < 250) {
      voiceGesture.current = 'lock';
      voicePressing.current = false;
      voiceTouch.current = null;
      changeVoiceMode('locked');
      return;
    }
    releaseVoiceRecording();
  }, [changeVoiceMode, releaseVoiceRecording]);

  const cancelVoiceTouch = useCallback(() => {
    if (!voicePressing.current) return;
    if (voiceModeRef.current === 'locked') releaseVoiceRecording();
    else cancelVoiceRecording().catch(() => undefined);
  }, [cancelVoiceRecording, releaseVoiceRecording]);

  /**
   * Sends one outbox message again under its original client id.
   *
   * Every kind of unsent message routes through here - typed text, a voice
   * note, a GIF - so that adding a new kind cannot leave it stranded in the
   * outbox with no code path able to send it. Reusing the tempId is what makes
   * this safe: if the first attempt did reach the server before the connection
   * dropped, the unique index turns this into a duplicate ACK rather than a
   * second copy of the message in the thread.
   */
  const resend = useCallback(
    (message: ChatMessage, tempId: string) => {
      if (message.messageType === 'audio' && message.mediaUrl) {
        return sendVoiceFromUri(
          message.mediaUrl,
          Math.max(1, Math.round(message.audioDuration || 1)),
          message.waveform?.length ? message.waveform : VOICE_WAVEFORM,
          tempId,
        );
      }
      if (isGifMessage(message)) {
        const gifUrl = String(message.mediaUrl);
        return deliverGif(tempId, gifUrl, GIF_ITEMS.find(gif => gif.url === gifUrl)?.label);
      }
      if (!message.text) {
        // An uploaded photo, video or file is written by its own REST endpoint
        // and never reaches the outbox, so there is nothing to replay here.
        updateMessages(current => applyStatus(current, tempId, 'failed'));
        setNotice(
          'This attachment cannot be sent again. Please attach it once more.',
        );
        return Promise.resolve(false);
      }
      return deliver(tempId, message.text, message.replyTo || undefined);
    },
    [deliver, deliverGif, sendVoiceFromUri, updateMessages],
  );

  /** The wireframe's "Message Retry" edge case, driven from the failed bubble. */
  const retry = useCallback(
    async (message: ChatMessage) => {
      const tempId = message.tempId || message.id;
      queuedAttempts.current.delete(tempId);
      updateMessages(current =>
        current.map(item =>
          item.id === message.id
            ? { ...item, queued: false, status: 'pending' }
            : item,
        ),
      );
      await resend(message, tempId);
    },
    [resend, updateMessages],
  );

  /**
   * Drains the outbox once the socket is back, one message at a time so the
   * thread is rebuilt in the order it was written. A message is attempted once
   * per reconnection; `queuedAttempts` is cleared when the link drops again.
   */
  useEffect(() => {
    if (connection !== 'connected') {
      queuedAttempts.current.clear();
      return;
    }
    if (sending) {
      return;
    }
    const queued = messages.find(message => {
      if (!message.isOwn || !message.queued) {
        return false;
      }
      if (queuedAttempts.current.has(message.tempId || message.id)) {
        return false;
      }
      return Boolean(message.text) || Boolean(message.mediaUrl);
    });
    if (!queued) {
      return;
    }
    const id = queued.tempId || queued.id;
    queuedAttempts.current.add(id);
    Promise.resolve(resend(queued, id)).catch(() => undefined);
  }, [connection, messages, resend, sending]);

  useEffect(() => {
    if (!selected) {
      actionSheetClosing.current = false;
      return;
    }
    if (actionSheetClosing.current) {
      return;
    }
    actionSheetOffset.setValue(36);
    Animated.spring(actionSheetOffset, {
      toValue: 0,
      damping: 22,
      stiffness: 240,
      mass: 0.8,
      useNativeDriver: true,
    }).start();
  }, [actionSheetOffset, selected]);

  const openMessageActions = useCallback(
    (message: ChatMessage) => {
      if (actionSheetClosing.current) {
        return;
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(
        () => undefined,
      );
      if (selectionMode) {
        if (
          selectedMessageIds.has(message.id) &&
          selectedMessageIds.size === 1
        ) {
          setSelectedMessageIds(new Set());
          setSelectionMode(false);
        } else {
          setSelectedMessageIds(current => {
            const next = new Set(current);
            if (next.has(message.id)) {
              next.delete(message.id);
            } else {
              next.add(message.id);
            }
            return next;
          });
        }
        return;
      }
      setSelected(message);
    },
    [selectedMessageIds, selectionMode],
  );

  const closeMessageActions = useCallback(() => {
    if (actionSheetClosing.current) {
      return;
    }
    actionSheetClosing.current = true;
    if (replyActionTimer.current) {
      clearTimeout(replyActionTimer.current);
      replyActionTimer.current = null;
    }
    setChosenAction(null);
    Animated.timing(actionSheetOffset, {
      toValue: 460,
      duration: 190,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) {
        actionSheetClosing.current = false;
        return;
      }
      setSelected(null);
      setMoreReactionsOpen(false);
      // Keep the dismissed sheet off-screen until the modal is hidden. Reset
      // its position only when a new message action sheet opens.
    });
  }, [actionSheetOffset]);

  const actionSheetPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          !actionSheetClosing.current && gesture.dy > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderMove: (_event, gesture) => {
          if (!actionSheetClosing.current) {
            actionSheetOffset.setValue(Math.max(0, gesture.dy));
          }
        },
        onPanResponderRelease: (_event, gesture) => {
          if (actionSheetClosing.current) { return; }
          if (gesture.dy > 70 || gesture.vy > 0.8) {
            closeMessageActions();
            return;
          }
          Animated.spring(actionSheetOffset, {
            toValue: 0,
            damping: 22,
            stiffness: 240,
            mass: 0.8,
            useNativeDriver: true,
          }).start();
        },
        onPanResponderTerminate: () => {
          if (actionSheetClosing.current) { return; }
          Animated.spring(actionSheetOffset, {
            toValue: 0,
            damping: 22,
            stiffness: 240,
            mass: 0.8,
            useNativeDriver: true,
          }).start();
        },
      }),
    [actionSheetOffset, closeMessageActions],
  );

  const publishMessageReaction = useCallback(
    async (message: ChatMessage, emoji: string, remove: boolean) => {
      const senderId = currentUserId;
      const receiverId =
        contact.kind === 'group'
          ? ''
          : message.isOwn
          ? contact.userId
          : message.senderId || contact.userId;
      const reactedAt = new Date().toISOString();
      const payload: MessageReactionPayload = {
        messageId: message.id,
        clientMessageId: message.tempId || message.id,
        targetMessageIds: [message.id, message.tempId || ''].filter(Boolean),
        chatId: contact.kind === 'group' ? contact.userId || chatId : chatId,
        ...(contact.kind === 'group'
          ? { groupId: contact.userId || chatId }
          : {}),
        senderId,
        ...(receiverId ? { receiverId } : {}),
        userId: senderId,
        emoji: remove ? '' : emoji,
        remove,
        removed: remove,
        reactedAt,
      };
      const previousReaction = message.myReaction || null;
      updateMessages(current => applyMessageReactionPayload(current, payload));
      Haptics.selectionAsync().catch(() => undefined);
      if (contact.kind !== 'group') {
        emitMessageReaction(payload).catch(() => undefined);
      }

      const controlText = `${MESSAGE_REACTION_CONTROL_PREFIX}${JSON.stringify(
        payload,
      )}`;
      try {
        if (contact.kind === 'group') {
          await sendGroupText(contact.userId || chatId, controlText);
        } else {
          try {
            await sendMessageOverSocket({
              receiverId,
              tempId: nextTempId(),
              text: controlText,
            });
          } catch (socketError) {
            if (isAckTimeout(socketError)) {
              throw socketError;
            }
            await sendChatMessage(receiverId, controlText);
          }
        }
      } catch (error) {
        if (!isAckTimeout(error)) {
          updateMessages(current =>
            current.map(item =>
              item.id === message.id
                ? { ...item, myReaction: previousReaction }
                : item,
            ),
          );
          setNotice(
            error instanceof Error ? error.message : 'Unable to send reaction.',
          );
        }
      }
    },
    [chatId, contact.kind, contact.userId, currentUserId, updateMessages],
  );

  const reactToSelected = useCallback(
    (emoji: string) => {
      if (!selected) {
        return;
      }
      publishMessageReaction(
        selected,
        emoji,
        selected.myReaction === emoji,
      ).catch(() => undefined);
      setMoreReactionsOpen(false);
      setSelected(null);
    },
    [publishMessageReaction, selected],
  );

  const removeMessageReaction = useCallback(
    (messageId: string) => {
      const message = messages.find(item => item.id === messageId);
      if (message?.myReaction) {
        publishMessageReaction(message, message.myReaction, true).catch(
          () => undefined,
        );
      }
    },
    [messages, publishMessageReaction],
  );

  const beginReply = useCallback((message: ChatMessage) => {
    setReplyingTo(message);
    setEmojiOpen(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const restoreDeletedMessage = useCallback(
    (message: ChatMessage) => {
      updateMessages(current =>
        current.map(item =>
          item.id === message.id || item.tempId === message.id ? message : item,
        ),
      );
    },
    [updateMessages],
  );

  const commitMessageDeletion = useCallback(
    async (pending: PendingMessageDeletion) => {
      // A failed/offline recording exists only on this device. Sending its
      // temporary ID to the delete API fails and would restore the recording.
      if (isUnsentVoiceNote(pending.message)) return;
      try {
        if (pending.scope === 'everyone' && !canDeleteForEveryone(pending.message)) {
          throw new Error(DELETE_FOR_EVERYONE_NOTICE);
        }
        await deleteMessage(pending.message.id, pending.scope === 'everyone');
        if (pending.scope === 'everyone') {
          emitMessageDeletedForEveryone(pending.message.id);
        }
      } catch (error) {
        restoreDeletedMessage(pending.message);
        setNotice(
          error instanceof Error
            ? error.message
            : `Unable to delete this message for ${
                pending.scope === 'everyone' ? 'everyone' : 'you'
              }.`,
        );
      }
    },
    [restoreDeletedMessage],
  );

  const scheduleMessageDeletion = useCallback(
    (message: ChatMessage, scope: PendingMessageDeletion['scope']) => {
      if (scope === 'everyone' && !canDeleteForEveryone(message)) {
        setDeletingScope(null);
        setNotice(DELETE_FOR_EVERYONE_NOTICE);
        return;
      }
      const previous = pendingDeletionRef.current;
      if (pendingDeletionTimer.current) {
        clearTimeout(pendingDeletionTimer.current);
      }
      if (previous) {
        commitMessageDeletion(previous).catch(() => undefined);
      }

      const pending = { message, scope };
      pendingDeletionRef.current = pending;
      setPendingDeletion(pending);
      setNotice('');
      updateMessages(current =>
        scope === 'everyone'
          ? markDeletedForEveryone(current, message.id)
          : markDeletedForMe(current, message.id),
      );
      setDeleteCandidate(null);
      setDeletingScope(null);

      pendingDeletionTimer.current = setTimeout(() => {
        if (pendingDeletionRef.current !== pending) {
          return;
        }
        pendingDeletionRef.current = null;
        pendingDeletionTimer.current = null;
        setPendingDeletion(null);
        commitMessageDeletion(pending).catch(() => undefined);
      }, DELETE_UNDO_WINDOW_MS);
    },
    [commitMessageDeletion, updateMessages],
  );

  const undoMessageDeletion = useCallback(() => {
    const pending = pendingDeletionRef.current;
    if (!pending) {
      return;
    }
    if (pendingDeletionTimer.current) {
      clearTimeout(pendingDeletionTimer.current);
    }
    pendingDeletionTimer.current = null;
    pendingDeletionRef.current = null;
    setPendingDeletion(null);
    restoreDeletedMessage(pending.message);
  }, [restoreDeletedMessage]);

  useEffect(
    () => () => {
      if (pendingDeletionTimer.current) {
        clearTimeout(pendingDeletionTimer.current);
      }
      const pending = pendingDeletionRef.current;
      pendingDeletionRef.current = null;
      if (pending && !isUnsentVoiceNote(pending.message)) {
        if (pending.scope === 'everyone' && !canDeleteForEveryone(pending.message)) {
          restoreDeletedMessage(pending.message);
          return;
        }
        Promise.resolve(
          deleteMessage(pending.message.id, pending.scope === 'everyone'),
        )
          .then(() => {
            if (pending.scope === 'everyone') {
              emitMessageDeletedForEveryone(pending.message.id);
            }
          })
          .catch(() => undefined);
      }
    },
    [],
  );

  const confirmDeleteForMe = useCallback(() => {
    if (!deleteCandidate || deletingScope) {
      return;
    }
    setDeletingScope('me');
    scheduleMessageDeletion(deleteCandidate, 'me');
  }, [deleteCandidate, deletingScope, scheduleMessageDeletion]);

  const confirmDeleteForEveryone = useCallback(() => {
    if (!deleteCandidate?.isOwn || deletingScope) {
      return;
    }
    setDeletingScope('everyone');
    scheduleMessageDeletion(deleteCandidate, 'everyone');
  }, [deleteCandidate, deletingScope, scheduleMessageDeletion]);

  const togglePinnedMessage = useCallback(
    async (message: ChatMessage) => {
      if (contact.kind === 'group' && !canPinMessages) {
        setNotice('You don’t have permission to pin messages in this group.');
        return;
      }
      const pinnedAt = new Date().toISOString();
      if (message.isPinned) {
        if (contact.kind === 'group')
          await unpinGroupMessage(contact.userId || chatId, message.id);
        else await unpinMessage(message.id);
        updateMessages(current =>
          current.map(item =>
            item.id === message.id
              ? { ...item, isPinned: false, pinnedAt: null }
              : item,
          ),
        );
        if (contact.kind !== 'group') emitMessageUnpinned(message.id);
        setNotice('Message unpinned.');
        return;
      }
      if (contact.kind === 'group')
        await pinGroupMessage(contact.userId || chatId, message.id);
      else await pinMessage(message.id);
      updateMessages(current =>
        current.map(item =>
          item.id === message.id ? { ...item, isPinned: true, pinnedAt } : item,
        ),
      );
      if (contact.kind !== 'group') emitMessagePinned(message.id);
      setNotice('Message pinned.');
    },
    [canPinMessages, chatId, contact.kind, contact.userId, updateMessages],
  );

  const menuAction = useCallback(
    async (
      action:
        | 'reply'
        | 'forward'
        | 'select'
        | 'copy'
        | 'pin'
        | 'unread'
        | 'delete',
    ) => {
      const message = selected;
      if (!message) {
        return;
      }
      if (action === 'unread' && message.isOwn) {
        return;
      }
      if (action === 'reply') {
        setChosenAction('reply');
        if (replyActionTimer.current) {
          clearTimeout(replyActionTimer.current);
        }
        replyActionTimer.current = setTimeout(() => {
          setSelected(null);
          setChosenAction(null);
          beginReply(message);
        }, 140);
        return;
      }
      if (action === 'unread') {
        setChosenAction('unread');
        try {
          // Keep the selected treatment visible long enough to acknowledge the
          // tap before moving to the unread boundary shown in the wireframe.
          await new Promise<void>(resolve => setTimeout(resolve, 140));
          await markChatUnread(chatId);
          setUnreadBoundaryMessageId(message.id);
          setSelected(null);
          setChosenAction(null);
          setNotice('Chat marked as unread.');
        } catch (error) {
          setChosenAction(null);
          setNotice(
            error instanceof Error
              ? error.message
              : 'Unable to mark this chat as unread.',
          );
        }
        return;
      }
      setSelected(null);
      if (action === 'delete') {
        setDeleteCandidate(message);
        return;
      }
      try {
        if (action === 'copy') {
          if (message.messageType === 'image' && message.mediaUrl) {
            const image = /^https?:\/\//i.test(message.mediaUrl)
              ? await File.downloadFileAsync(
                  message.mediaUrl,
                  new File(Paths.cache, `chatterly-copy-${Date.now()}.png`),
                )
              : new File(message.mediaUrl);
            // Copy the bitmap, not its caption or URL, so the composer can
            // upload it together with the text entered for the new message.
            await Clipboard.setImageAsync(await image.base64());
          } else {
            await Clipboard.setStringAsync(
              message.messageType === 'location'
                ? locationMessage(
                    message.latitude || 0,
                    message.longitude || 0,
                    message.locationName,
                  )
                : message.text || message.mediaUrl || '',
            );
          }
          setNotice('Message copied.');
        }
        if (action === 'select') {
          setSelectionMode(true);
          setSelectedMessageIds(new Set([message.id]));
        }
        if (action === 'forward') {
          setSelectedMessageIds(new Set([message.id]));
          setSelectionMode(true);
          setForwardOpen(true);
        }
        if (action === 'pin') await togglePinnedMessage(message);
      } catch (error) {
        setNotice(
          error instanceof Error
            ? error.message
            : 'Unable to complete that action.',
        );
      }
    },
    [beginReply, chatId, selected, togglePinnedMessage],
  );

  const finishForward = useCallback(
    async (destinations: ForwardDestination[], accompanyingMessage: string) => {
      const selectedMessages = messages.filter(message =>
        selectedMessageIds.has(message.id),
      );
      const ids = selectedMessages.map(message => message.id);
      if (!ids.length) {
        throw new Error('Select at least one message to forward.');
      }
      if (!destinations.length) {
        throw new Error('Select at least one contact or group to forward.');
      }

      const directDestinations = destinations.filter(
        destination => destination.kind === 'contact',
      );
      const groupDestinations = destinations.filter(
        destination => destination.kind === 'group',
      );
      const forwardToGroup = async (groupId: string) => {
        for (const message of selectedMessages) {
          const forwardContent = message.messageType === 'location'
            ? locationMessage(message.latitude || 0, message.longitude || 0, message.locationName)
            : message.text;
          const forwardedAt = Date.now();
          try {
            await forwardGroupMessageOverSocket({
              groupId,
              originalMessageId: message.id,
              tempId: nextTempId(),
            });
            // The group-forward socket handler copies `content`, while a
            // direct-chat text message is stored in `encryptedContent`. Find
            // that newly forwarded blank text record and fill its body through
            // the existing group edit socket event, preserving its forwarded
            // flag and original message identity.
            if (forwardContent) {
              try {
                for (let attempt = 0; attempt < 4; attempt += 1) {
                  const groupMessages = await getGroupMessages(groupId);
                  const forwarded = groupMessages
                    .filter(candidate =>
                      candidate.isForwarded &&
                      candidate.isOwn &&
                      !candidate.text &&
                      candidate.messageType === 'text' &&
                      candidate.forwardedFrom === message.senderId &&
                      Date.parse(candidate.createdAt) >= forwardedAt - 15000,
                    )
                    .sort((first, second) => Date.parse(second.createdAt) - Date.parse(first.createdAt))[0];
                  if (forwarded) {
                    await editGroupMessageOverSocket(groupId, forwarded.id, forwardContent);
                    break;
                  }
                  if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 200));
                }
              } catch {
                // The forward has already been stored. Keep it in the group
                // if this best-effort content repair cannot reach the socket.
              }
            }
            continue;
          } catch (error) {
            // A timed out ACK is ambiguous: the server may already have stored
            // and broadcast this forward. Sending the REST fallback as well
            // would create a second group message.
            if (isAckTimeout(error)) throw error;
            // The existing send fallback below preserves forwarding when the
            // group-forward socket event is unavailable.
          }
          const content =
            message.messageType === 'location'
              ? locationMessage(
                  message.latitude || 0,
                  message.longitude || 0,
                  message.locationName,
                )
              : message.text;
          try {
            await sendGroupMessageOverSocket({
              groupId,
              tempId: nextTempId(),
              ...(content ? { text: content } : {}),
              ...(message.mediaUrl ? { mediaUrl: message.mediaUrl } : {}),
              ...(message.messageType &&
              ['image', 'video', 'audio', 'file'].includes(message.messageType)
                ? {
                    mediaType: message.messageType as
                      | 'image'
                      | 'video'
                      | 'audio'
                      | 'file',
                  }
                : {}),
              ...(message.messageType !== 'text' && message.text
                ? { caption: message.text }
                : {}),
            });
            continue;
          } catch {
            // A disconnected socket falls back to the documented group REST
            // routes. Hosted media must be local for their multipart upload.
          }
          if (
            message.messageType === 'text' ||
            message.messageType === 'location' ||
            !message.messageType
          ) {
            if (content.trim()) {
              await sendGroupMessage(groupId, content);
            }
            continue;
          }
          if (!message.mediaUrl) {
            throw new Error('A selected attachment is no longer available.');
          }
          let url = message.mediaUrl;
          try {
            url = await getMediaDownloadUrl(message.id);
          } catch {
            /* Direct hosted URL remains usable. */
          }
          const fallbackExtension =
            message.messageType === 'video'
              ? 'mp4'
              : message.messageType === 'audio'
              ? 'm4a'
              : message.messageType === 'file'
              ? 'bin'
              : 'jpg';
          const name = (
            message.fileName || `forward-${message.id}.${fallbackExtension}`
          ).replace(/[^a-zA-Z0-9._-]/g, '-');
          const destination = new File(Paths.cache, `${Date.now()}-${name}`);
          const downloaded = await File.downloadFileAsync(url, destination, {
            idempotent: true,
          });
          const type =
            message.fileType ||
            (message.messageType === 'video'
              ? 'video/mp4'
              : message.messageType === 'audio'
              ? 'audio/mp4'
              : message.messageType === 'image'
              ? 'image/jpeg'
              : 'application/octet-stream');
          const upload = { uri: downloaded.uri, name, type };
          if (message.messageType === 'file') {
            await sendGroupFile(groupId, upload);
          } else {
            await sendGroupMedia(groupId, upload, message.text);
          }
        }
        if (accompanyingMessage) {
          try {
            await sendGroupMessageOverSocket({
              groupId,
              tempId: nextTempId(),
              text: accompanyingMessage,
            });
          } catch {
            await sendGroupMessage(groupId, accompanyingMessage);
          }
        }
      };

      const [directForwarded] = await Promise.all([
        directDestinations.length
          ? forwardMessages(
              ids,
              directDestinations.map(destination => destination.id),
            )
          : Promise.resolve([]),
        ...groupDestinations.map(destination => forwardToGroup(destination.id)),
      ]);
      const resolvedDirectChatIds = new Map<string, string>();
      const directMessagesByContact = new Map<string, ChatMessage[]>();
      await Promise.all(directDestinations.map(async destination => {
        const forwarded = directForwarded
          .filter(message => message.contactId === destination.id)
          .map((message, index) => forwardedMessageForActiveThread(
            selectedMessages[index] || selectedMessages[0],
            message,
            destination.id,
          ));
        directMessagesByContact.set(destination.id, forwarded);

        let destinationChatId = destination.chatId;
        if (!destinationChatId) {
          try {
            destinationChatId = (await startChat(destination.id)).chatId;
          } catch {
            // Forwarding has already succeeded. A later history load remains
            // authoritative if this best-effort navigation lookup is offline.
          }
        }
        if (!destinationChatId) return;
        resolvedDirectChatIds.set(destination.id, destinationChatId);
        if (destinationChatId !== chatId && forwarded.length) {
          const stored = await loadStoredMessages(destinationChatId);
          const merged = forwarded.reduce(
            (thread, message) => upsertMessage(thread, message),
            stored,
          );
          await storeMessages(destinationChatId, sortByTime(merged));
        }
      }));
      // The REST forward route returns the persisted message while the socket
      // may echo that same record into an already-open destination. Insert the
      // server result by its stable id; upsertMessage folds any later echo onto
      // it instead of painting a second forwarded bubble.
      if (directForwarded?.length && directDestinations.some(destination => destination.id === contact.userId)) {
        const openChatMessages = directMessagesByContact.get(contact.userId) || [];
        if (openChatMessages.length) {
          updateMessages(current =>
            sortByTime(openChatMessages.reduce(
              (thread, message) => upsertMessage(thread, message),
              current,
            )),
          );
        }
      }
      if (accompanyingMessage && directDestinations.length) {
        await Promise.all(
          directDestinations.map(destination =>
            sendChatMessage(destination.id, accompanyingMessage),
          ),
        );
      }
      setForwardOpen(false);
      setSelectionMode(false);
      setSelectedMessageIds(new Set());
      setNotice(
        `${ids.length} ${
          ids.length === 1 ? 'message' : 'messages'
        } forwarded to ${destinations.length} ${
          destinations.length === 1 ? 'chat' : 'chats'
        }.`,
      );
      if (destinations.length === 1 && onOpenConversation) {
        const destination = destinations[0];
        const destinationChatId = destination.kind === 'group'
          ? destination.chatId || destination.id
          : resolvedDirectChatIds.get(destination.id) || destination.chatId;
        if (destinationChatId) {
          requestAnimationFrame(() => onOpenConversation({
            userId: destination.id,
            name: destination.name,
            thumbnail: destination.thumbnail,
            kind: destination.kind === 'group' ? 'group' : 'contact',
          }, destinationChatId));
        }
      }
    },
    [chatId, contact.userId, messages, onOpenConversation, selectedMessageIds, updateMessages],
  );

  const confirmGroupAction = useCallback(
    (action: 'clear' | 'report' | 'leave' | 'delete') => {
      const groupId = contact.userId || chatId;
      const names = {
        clear: 'Clear Chat',
        report: 'Report Group',
        leave: 'Leave Group',
        delete: 'Delete Group',
      };
      const descriptions = {
        clear: 'Messages in this group will be cleared only for you.',
        report:
          'Chatterly will review this group. Members will not be notified.',
        leave: 'You will stop receiving messages from this group.',
        delete:
          'This group and its messages will be permanently deleted for everyone.',
      };
      Alert.alert(`${names[action]}?`, descriptions[action], [
        { text: 'Cancel', style: 'cancel' },
        {
          text: names[action],
          style:
            action === 'delete' || action === 'leave'
              ? 'destructive'
              : 'default',
          onPress: async () => {
            try {
              if (action === 'clear') {
                const result = await clearGroupChat(groupId);
                updateMessages([]);
                await removeStoredThread(chatId);
                setNotice(result);
              }
              if (action === 'report') setNotice(await reportGroup(groupId));
              if (action === 'leave') {
                await leaveGroup(groupId);
                onBack();
              }
              if (action === 'delete') {
                if (!canDeleteGroup) {
                  setNotice('Only the group owner can delete this group.');
                  return;
                }
                await deleteGroup(groupId);
                onBack();
              }
            } catch (error) {
              setNotice(
                error instanceof Error
                  ? error.message
                  : `Unable to ${names[action].toLowerCase()}.`,
              );
            }
          },
        },
      ]);
    },
    [canDeleteGroup, chatId, contact.userId, onBack, updateMessages],
  );

  const messageGroups = useMemo(
    () => groupMessagesForDisplay(visibleDisappearingTimerMessages(messages, timerClearedAt)),
    [messages, timerClearedAt],
  );
  const latestDisappearingTimerMessage = useMemo(() =>
    messages.reduce<ChatMessage | undefined>((current, message) =>
      message.systemEventType === 'disappearing_timer' &&
      (!current || Date.parse(message.createdAt) >= Date.parse(current.createdAt)) ? message : current,
    undefined), [messages]);
  const currentDisappearingTimer = latestDisappearingTimerMessage
    ? Date.parse(latestDisappearingTimerMessage.createdAt) <= timerClearedAt
      ? 'off' : latestDisappearingTimerMessage.disappearingTimer
    : timerClearedAt ? 'off' : undefined;
  useEffect(() => {
    const latest = latestDisappearingTimerMessage;
    if (timerClearState.chatId !== chatId || !timerClearState.loaded ||
      !latest?.disappearingTimer || Date.parse(latest.createdAt) <= timerClearedAt) { return; }
    // Received and restored timer changes must also update the menu's cache.
    setStoredChatDisappearingTimer(chatId, latest.disappearingTimer, Date.parse(latest.createdAt)).catch(() => undefined);
  }, [chatId, latestDisappearingTimerMessage, timerClearedAt, timerClearState.chatId, timerClearState.loaded]);
  const displayedMessageGroups = useMemo(() => {
    const needle = groupSearch.trim().toLowerCase();
    return needle
      ? messageGroups.filter(group =>
          group.some(
            message =>
              message.text.toLowerCase().includes(needle) ||
              message.senderName?.toLowerCase().includes(needle),
          ),
        )
      : messageGroups;
  }, [groupSearch, messageGroups]);
  const pinnedMessages = useMemo(
    () =>
      messages
        .filter(
          message =>
            message.isPinned && !message.isDeleted && !message.deletedForMe,
        )
        .sort((first, second) => pinnedAtTime(second) - pinnedAtTime(first)),
    [messages],
  );
  const manualUnreadCount = useMemo(() => {
    if (!unreadBoundaryMessageId) {
      return 0;
    }
    const boundary = messages.findIndex(
      message => message.id === unreadBoundaryMessageId,
    );
    if (boundary < 0) {
      return 0;
    }
    const received = messages
      .slice(boundary)
      .filter(
        message =>
          !message.isOwn && !message.isDeleted && !message.deletedForMe,
      ).length;
    return Math.max(1, received);
  }, [messages, unreadBoundaryMessageId]);
  const selectedToolbarMessage = useMemo(
    () =>
      selectedMessageIds.size === 1
        ? messages.find(message => selectedMessageIds.has(message.id))
        : undefined,
    [messages, selectedMessageIds],
  );

  const clearMessageSelection = useCallback(() => {
    setSelectedMessageIds(new Set());
    setSelectionMode(false);
  }, []);

  const openSelectedMessageOptions = useCallback(() => {
    if (!selectedToolbarMessage) {
      return;
    }
    clearMessageSelection();
    setSelected(selectedToolbarMessage);
  }, [clearMessageSelection, selectedToolbarMessage]);

  const replyToSelectedMessage = useCallback(() => {
    if (!selectedToolbarMessage) {
      return;
    }
    clearMessageSelection();
    beginReply(selectedToolbarMessage);
  }, [beginReply, clearMessageSelection, selectedToolbarMessage]);

  const pinSelectedMessage = useCallback(async () => {
    if (!selectedToolbarMessage) {
      return;
    }
    try {
      await togglePinnedMessage(selectedToolbarMessage);
      clearMessageSelection();
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : 'Unable to complete that action.',
      );
    }
  }, [clearMessageSelection, selectedToolbarMessage, togglePinnedMessage]);

  const deleteSelectedMessages = useCallback(() => {
    const targets = messages.filter(message =>
      selectedMessageIds.has(message.id),
    );
    if (targets.length) {
      setDeleteSelectionCandidates(targets);
    }
  }, [messages, selectedMessageIds]);

  const confirmDeleteSelectedMessages = useCallback(
    async (scope: 'me' | 'everyone') => {
      const targets = deleteSelectionCandidates;
      if (!targets?.length || deletingScope) {
        return;
      }
      if (scope === 'everyone' && !targets.every(message => canDeleteForEveryone(message))) {
        setNotice(DELETE_FOR_EVERYONE_NOTICE);
        return;
      }
      setDeletingScope(scope);
      const results = await Promise.allSettled(
        targets.map(message => isUnsentVoiceNote(message) ? Promise.resolve() : deleteMessage(message.id, scope === 'everyone')),
      );
      const deleted = targets.filter(
        (_message, index) => results[index].status === 'fulfilled',
      );
      const failedCount = targets.length - deleted.length;
      if (deleted.length) {
        updateMessages(current =>
          deleted.reduce(
            (thread, message) =>
              scope === 'everyone'
                ? markDeletedForEveryone(thread, message.id)
                : markDeletedForMe(thread, message.id),
            current,
          ),
        );
        if (scope === 'everyone') {
          deleted.filter(message => !isUnsentVoiceNote(message)).forEach(message => emitMessageDeletedForEveryone(message.id));
        }
      }
      setDeleteSelectionCandidates(null);
      setDeletingScope(null);
      clearMessageSelection();
      setNotice(
        failedCount
          ? `${deleted.length} of ${targets.length} messages deleted. ${failedCount} could not be deleted.`
          : `${targets.length} ${
              targets.length === 1 ? 'message' : 'messages'
            } deleted.`,
      );
    },
    [
      clearMessageSelection,
      deleteSelectionCandidates,
      deletingScope,
      updateMessages,
    ],
  );

  useEffect(() => {
    if (pinnedMessages.length <= 1) {
      setPinnedExpanded(false);
    }
  }, [pinnedMessages.length]);

  return (
    <KeyboardAvoidingView
      behavior="padding"
      enabled
      keyboardVerticalOffset={0}
      style={styles.root}
    >
      <CallRingtone
        speaker={activeCall?.speaker}
        state={
          activeCall
            ? outgoingRingtoneState(activeCall.status)
            : CALL_RINGTONE_STATE.ENDED
        }
      />
      <CallReactionOverlay callId={activeCall?.callId}/>
      {activeCall && callHidden ? (
        <View
          accessibilityLabel="Active call controls"
          style={[
            styles.activeCallBanner,
            { paddingTop: insets.top, height: insets.top + 42 },
          ]}
        >
          <Pressable
            accessibilityLabel="Return to active call"
            onPress={() => setCallHidden(false)}
            style={styles.activeCallIdentity}
          >
            <View style={styles.activeCallCopy}>
              <Text numberOfLines={1} style={styles.activeCallTitle}>
                {contact.name}
              </Text>
              <Text style={styles.activeCallMeta}>
                {activeCall.status === 'connected'
                  ? formatCallTimer(callDurationSeconds)
                  : activeCall.status === 'ringing'
                  ? 'Ringing...'
                  : activeCall.status === 'reconnecting'
                  ? 'Reconnecting...'
                  : 'Calling...'}
              </Text>
            </View>
          </Pressable>
          <Pressable
            accessibilityLabel={
              activeCall.speaker ? 'Turn speaker off' : 'Turn speaker on'
            }
            accessibilityState={{ selected: activeCall.speaker }}
            onPress={toggleCallSpeaker}
            style={[
              styles.activeCallControl,
              activeCall.speaker && styles.activeCallControlSelected,
            ]}
          >
            <CallControlIcon color="#6F28F5" name="speaker" />
          </Pressable>
          <Pressable
            accessibilityLabel={
              activeCall.muted ? 'Unmute active call' : 'Mute active call'
            }
            accessibilityState={{ selected: activeCall.muted }}
            onPress={toggleCallMute}
            style={[
              styles.activeCallControl,
              activeCall.muted && styles.activeCallControlSelected,
            ]}
          >
            <CallControlIcon
              color="#6F28F5"
              crossed={activeCall.muted}
              name="mute"
            />
          </Pressable>
          <Pressable accessibilityLabel={activeCall.held ? 'Resume active call' : 'Hold active call'} accessibilityState={{selected: activeCall.held}} onPress={toggleCallHold} style={[styles.activeCallControl, activeCall.held && styles.activeCallControlSelected]}>
            <CallControlIcon color="#6F28F5" name="hold" />
          </Pressable>
          <Pressable
            accessibilityLabel="End active call"
            onPress={endActiveCall}
            style={styles.activeCallEnd}
          >
            <CallControlIcon color="#FFFFFF" name="end" />
          </Pressable>
        </View>
      ) : null}

      {!selectionMode ? (
        <View
          style={[
            styles.header,
            {
              paddingTop: activeCall && callHidden ? 0 : insets.top,
              minHeight: activeCall && callHidden ? 52 : 76,
            },
          ]}
        >
          <Pressable
            accessibilityLabel="Back to chats"
            onPress={
              activeCall && callHidden ? () => setCallHidden(false) : onBack
            }
            style={styles.headerIcon}
          >
            <BackIcon />
          </Pressable>
          <Pressable
            accessibilityLabel={`View ${headerContact.name} profile picture`}
            accessibilityRole="button"
            disabled={!headerContact.thumbnail}
            onPress={() => setProfilePictureOpen(true)}
            style={styles.headerAvatar}
          >
            <ChatAvatar contact={headerContact} />
            <View
              accessibilityLabel={`${headerStatus} status`}
              style={styles.verifiedBadge}
            >
              <AvatarStatusBadge status={avatarStatus} />
            </View>
          </Pressable>
          <Pressable
            accessibilityLabel={`Open ${contact.name} contact`}
            onPress={() => setProfileOpen(true)}
            style={styles.contactCopy}
          >
            <Text numberOfLines={1} style={styles.contactName}>
              {headerContact.name}
            </Text>
            <Text
              style={[
                styles.online,
                contact.kind !== 'group' &&
                  presence === 'online' &&
                  styles.onlineText,
                contact.kind !== 'group' &&
                  presence === 'away' &&
                  styles.awayText,
              ]}
            >
              {headerStatus}
            </Text>
          </Pressable>
          <View style={styles.headerActions}>
            <Pressable
              accessibilityLabel={
                contact.kind === 'group'
                  ? `Start a group video call in ${contact.name}`
                  : `Video call ${contact.name}`
              }
              onPress={() => beginCall('video')}
              style={styles.headerIcon}
            >
              <VideoCallIcon />
            </Pressable>
            <Pressable
              accessibilityLabel={
                contact.kind === 'group'
                  ? `Start a group voice call in ${contact.name}`
                  : `Call ${contact.name}`
              }
              onPress={() => beginCall('audio')}
              style={styles.headerIcon}
            >
              <PhoneCallIcon />
            </Pressable>
            <Pressable
              accessibilityLabel="Conversation options"
              onPress={() =>
                contact.kind === 'group'
                  ? setGroupMenuOpen(true)
                  : setDirectMenuOpen(true)
              }
              style={styles.headerIcon}
            >
              <MoreIcon />
            </Pressable>
          </View>
        </View>
      ) : (
        <View
          accessibilityLabel={`${selectedMessageIds.size} messages selected`}
          style={[
            styles.selectionBar,
            {
              paddingTop: activeCall && callHidden ? 0 : insets.top,
              minHeight: activeCall && callHidden ? 52 : 76,
            },
          ]}
        >
          <Pressable
            accessibilityLabel="Cancel message selection"
            onPress={clearMessageSelection}
            style={styles.selectionBackButton}
          >
            <BackIcon />
          </Pressable>
          <Text style={styles.selectionCount}>
            {selectedMessageIds.size} Selected
          </Text>
          <View
            accessibilityLabel={
              selectedToolbarMessage
                ? 'Single message selection actions'
                : 'Multiple message selection actions'
            }
            style={styles.selectionActions}
          >
            {selectedToolbarMessage ? (
              <>
                <Pressable
                  accessibilityLabel="Reply to selected message"
                  onPress={replyToSelectedMessage}
                  style={styles.selectionAction}
                >
                  <MessageActionIcon action="reply" />
                </Pressable>
                <Pressable
                  accessibilityLabel={
                    selectedToolbarMessage.isPinned
                      ? 'Unpin selected message'
                      : 'Pin selected message'
                  }
                  onPress={pinSelectedMessage}
                  style={styles.selectionAction}
                >
                  <MessageActionIcon action="pin" />
                </Pressable>
                <Pressable
                  accessibilityLabel="More options for selected message"
                  onPress={openSelectedMessageOptions}
                  style={styles.selectionAction}
                >
                  <MoreIcon />
                </Pressable>
              </>
            ) : null}
            <Pressable
              accessibilityLabel="Delete selected messages"
              onPress={deleteSelectedMessages}
              style={styles.selectionAction}
            >
              <MessageActionIcon action="delete" />
            </Pressable>
            <Pressable
              accessibilityLabel="Forward selected messages"
              disabled={!selectedMessageIds.size}
              onPress={() => setForwardOpen(true)}
              style={styles.selectionAction}
            >
              <MessageActionIcon action="forward" />
            </Pressable>
          </View>
        </View>
      )}

      {showConnectionBanner ? (
        <View
          accessibilityLabel={connectionLabel}
          accessibilityLiveRegion="polite"
          style={[
            styles.connectionBanner,
            displayedConnection === 'connected'
              ? styles.connectionBannerConnected
              : displayedConnection === 'offline'
              ? styles.connectionBannerOffline
              : styles.connectionBannerReconnecting,
          ]}
        >
          <ConnectionStatusIcon status={displayedConnection} />
          <Text style={styles.connectionText}>{connectionLabel}</Text>
        </View>
      ) : null}

      {!selectionMode && pinnedMessages.length > 0 ? (
        <PinnedMessagesPanel
          expanded={pinnedExpanded}
          messages={pinnedMessages}
          onLongPress={openPinnedBannerActions}
          onSelect={scrollToMessage}
          onToggle={() => setPinnedExpanded(open => !open)}
        />
      ) : null}

      {groupSearchOpen ? (
        <View style={styles.groupSearchBar}>
          <TextInput
            autoFocus
            accessibilityLabel={
              contact.kind === 'group' ? 'Search group messages' : 'Search messages'
            }
            onChangeText={setGroupSearch}
            placeholder="Search messages"
            placeholderTextColor="#8792A4"
            style={styles.groupSearchInput}
            value={groupSearch}
          />
          <Pressable
            accessibilityLabel={
              contact.kind === 'group' ? 'Close group search' : 'Close message search'
            }
            onPress={() => {
              setGroupSearchOpen(false);
              setGroupSearch('');
            }}
          >
            <Text style={styles.groupSearchClose}>×</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.conversation}>
        <WallpaperBackground wallpaper={wallpaper} />
        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color="#7B2AE8" />
          </View>
        ) : messages.length === 0 ? (
          <EmptyConversation name={contact.name} />
        ) : (
          <ScrollView
            contentContainerStyle={styles.messages}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() =>
              scrollRef.current?.scrollToEnd({ animated: false })
            }
            ref={scrollRef}
            showsVerticalScrollIndicator={false}
          >
            <PrivacyBanner />
            {displayedMessageGroups.map((group, index) => {
              const message = group[0];
              const previousMessage =
                index > 0 ? displayedMessageGroups[index - 1][0] : null;
              const dateLabel = messageDateLabel(message.createdAt);
              const showDate = Boolean(
                dateLabel &&
                  (!previousMessage ||
                    messageDateKey(message.createdAt) !==
                      messageDateKey(previousMessage.createdAt)),
              );
              const original = message.replyTo
                ? messages.find(item => item.id === message.replyTo)
                : undefined;
              return (
                <View
                  key={message.mediaGroupId || message.tempId || message.id}
                  onLayout={event =>
                    messageOffsets.current.set(
                      message.id,
                      event.nativeEvent.layout.y,
                    )
                  }
                >
                  {showDate ? (
                    <View style={styles.datePill}>
                      <Text style={styles.dateText}>{dateLabel}</Text>
                    </View>
                  ) : null}
                  {message.id === unreadBoundaryMessageId ? (
                    <View
                      accessibilityLabel={`${manualUnreadCount} unread ${
                        manualUnreadCount === 1 ? 'message' : 'messages'
                      }`}
                      style={styles.unreadBoundary}
                    >
                      <View style={styles.unreadBoundaryLine} />
                      <Text style={styles.unreadBoundaryText}>
                        {manualUnreadCount} unread{' '}
                        {manualUnreadCount === 1 ? 'message' : 'messages'}
                      </Text>
                      <View style={styles.unreadBoundaryLine} />
                    </View>
                  ) : null}
                  {message.messageType === 'call' ? (
                    <CallLogNotice message={message} />
                  ) : message.systemEventType === 'disappearing_timer' ? (
                    <DisappearingTimerNotice
                      message={message}
                      onUpdate={() => setTimerRequestKey(key => key + 1)}
                    />
                  ) : message.systemEvent ? (
                    <View
                      accessibilityLabel={`Group update: ${message.text}`}
                      style={styles.systemMessageRow}
                    >
                      <View style={styles.systemMessageLine} />
                      <Text style={styles.systemMessageText}>
                        {message.text}
                      </Text>
                      <View style={styles.systemMessageLine} />
                    </View>
                  ) : (
                    <MessageBubble
                      contact={contact}
                      mediaGroup={group}
                      message={message}
                      senderRole={groupRoleById.get(
                        message.senderId ||
                          (message.isOwn ? currentUserId : ''),
                      )}
                      onDownload={downloadMedia}
                      onOpenActions={() => openMessageActions(message)}
                      onPreview={target =>
                        selectionMode
                          ? openMessageActions(message)
                          : setPreviewMedia(target)
                      }
                      onViewAll={items => setGalleryMedia(items)}
                      onReactionPress={() => removeMessageReaction(message.id)}
                      onReplyPress={() => scrollToOriginal(message)}
                      onRetry={() => retry(message)}
                      replyTimestamp={replyTimestampLabel(
                        original?.createdAt || message.replyPreview?.createdAt,
                      )}
                      replyMediaUrl={original?.mediaUrl}
                      onSwipeReply={
                        selectionMode ? undefined : () => beginReply(message)
                      }
                      replySenderName={
                        original
                          ? original.isOwn
                            ? 'You'
                            : contact.name
                          : undefined
                      }
                      selected={selectedMessageIds.has(message.id)}
                      selectionMode={selectionMode}
                      targetHighlighted={highlightedMessageId === message.id}
                    />
                  )}
                </View>
              );
            })}
          </ScrollView>
        )}
        {remoteTyping && <TypingIndicator contact={contact} />}
        {/* Everything pinned to the bottom of the thread lives in one dock, so a
          notice ("User is offline", "Calling…", a send error) floats just above
          whatever is on top of it - the composer, a reply preview or the emoji
          panel - rather than at a fixed offset where it covered the input. */}
        <View
          testID="chat-composer-dock"
          onTouchMove={moveVoiceTouch}
          onTouchEnd={endVoiceTouch}
          onTouchCancel={cancelVoiceTouch}
          style={styles.bottomDock}
        >
          <View pointerEvents="box-none" style={styles.dockNotices}>
            {pendingDeletion ? (
              <DeletedMessageSnackbar onUndo={undoMessageDeletion} />
            ) : null}
            <Snackbar floating={false} message={notice} onHide={hideNotice} />
          </View>
          {voiceMode === 'locked' || voiceMode === 'paused' ? (
            <View
              accessibilityLabel={
                voiceMode === 'paused'
                  ? 'Voice recording paused'
                  : 'Voice recording locked'
              }
              style={[styles.voicePanel, { marginBottom: bottomInset }]}
            >
              {voiceMode === 'paused' ? (
                <RecordingPreviewPlayer
                  duration={Math.max(1, recordingSeconds)}
                  uri={voicePreviewUri}
                  waveform={voiceWaveform}
                  playerRef={voicePreviewPlayer}
                  onError={setNotice}
                />
              ) : (
                <View style={styles.liveVoicePreview}>
                  <CompactMicrophoneIcon active />
                  <View style={styles.liveWaveform}>
                    {(
                      voiceWaveform.length ? voiceWaveform : VOICE_WAVEFORM
                    ).map((bar, index) => (
                        <View
                          key={index}
                          style={[styles.liveWaveBar, { height: bar }]}
                        />
                      ))}
                  </View>
                  <Text style={styles.liveDuration}>
                    {formatComposerDuration(recordingSeconds)}
                  </Text>
                </View>
              )}
              <View style={styles.voiceActions}>
                <Pressable
                  accessibilityLabel="Discard voice message"
                  onPress={cancelVoiceRecording}
                  style={styles.voiceDeleteButton}
                >
                  <TrashIcon />
                </Pressable>
                <Pressable
                  accessibilityLabel={
                    voiceMode === 'paused'
                      ? 'Resume voice recording'
                      : 'Pause voice recording'
                  }
                  disabled={voiceBusy || sending}
                  onPress={
                    voiceMode === 'paused'
                      ? resumeVoiceRecording
                      : pauseVoiceRecording
                  }
                  style={styles.voiceCenterButton}
                >
                  {voiceMode === 'paused' ? (
                    <>
                      <CompactMicrophoneIcon />
                      <Text style={styles.voiceCenterText}>Record</Text>
                    </>
                  ) : (
                    <>
                      <PauseBarsIcon />
                      <Text style={styles.voiceCenterText}>Pause</Text>
                    </>
                  )}
                </Pressable>
                <Pressable
                  accessibilityLabel="Send voice message"
                  accessibilityState={{
                    disabled: sending || voiceBusy,
                    busy: sending || voiceBusy,
                  }}
                  disabled={sending || voiceBusy}
                  onPress={finishVoiceRecording}
                  style={[
                    styles.voiceSendButton,
                    sending && styles.roundActionButtonDisabled,
                  ]}
                >
                  {sending ? (
                    <ActivityIndicator color="#FFF" size="small" />
                  ) : (
                    <SendIcon />
                  )}
                </Pressable>
              </View>
            </View>
          ) : voiceMode === 'holding' ? (
            <View style={[styles.voiceHoldRow, { marginBottom: bottomInset }]}>
              <View
                accessibilityLabel="Voice recording hold controls"
                style={styles.voiceHoldComposer}
              >
                <RedMicrophoneIcon />
                <RecordingClockIcon />
                <Text style={styles.voiceHoldDuration}>
                  {formatComposerDuration(recordingSeconds)}
                </Text>
                <View
                  accessibilityLabel="Voice recording waveform"
                  style={styles.voiceHoldWaveform}
                >
                  {(voiceWaveform.length
                    ? voiceWaveform.slice(-8)
                    : VOICE_WAVEFORM.slice(0, 8)
                  ).map((bar, index) => (
                    <View
                      key={index}
                      style={[
                        styles.voiceHoldWaveBar,
                        {height: Math.min(bar, 28)},
                      ]}
                    />
                  ))}
                </View>
                <Text style={styles.voiceCancelChevron}>{'<'}</Text>
                <Text style={styles.voiceCancelText}>Slide left to cancel</Text>
              </View>
              <Pressable
                accessibilityLabel="Lock or release voice recording"
                style={styles.voiceHoldButton}
              >
                <CompactMicrophoneIcon onDark />
              </Pressable>
              <Pressable
                accessibilityLabel="Lock recording"
                onPress={lockVoiceRecording}
                style={styles.voiceLockHint}
              >
                <LockIcon />
                <Text style={styles.voiceLockArrow}>^</Text>
              </Pressable>
            </View>
          ) : null}
          {false && recorderState.isRecording && (
            <View style={styles.recordingBar}>
              <View style={styles.recordDot} />
              <Text style={styles.recordingText}>
                Recording {Math.floor(recorderState.durationMillis / 1000)}s
              </Text>
            </View>
          )}

          {replyingTo ? (
            <View
              accessibilityLabel="Replying to message"
              style={styles.replyComposer}
            >
              <View style={styles.replyComposerCopy}>
                <Text style={styles.replyComposerTitle}>
                  Replying to {replyingTo.isOwn ? 'You' : contact.name}
                </Text>
                <Text numberOfLines={1} style={styles.replyComposerText}>
                  {replyTimestampLabel(replyingTo.createdAt)
                    ? `${replyTimestampLabel(replyingTo.createdAt)} · `
                    : ''}
                  {replyingTo.text || replyingTo.messageType || 'Message'}
                </Text>
              </View>
              <Pressable
                accessibilityLabel="Cancel reply"
                hitSlop={10}
                onPress={() => setReplyingTo(null)}
              >
                <Text style={styles.replyComposerClose}>×</Text>
              </Pressable>
            </View>
          ) : null}

          {contactBlocked ? (
            <View
              style={{
                padding: 24,
                paddingBottom: Math.max(insets.bottom, 20),
                backgroundColor: '#FFF',
                borderTopWidth: 1,
                borderColor: '#E1E6EF',
              }}
            >
              <View style={{ flexDirection: 'row', gap: 18 }}>
                <BlockIcon color="#EF2027" size={28} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 17, color: '#0B1220' }}>
                    This contact has been blocked.
                  </Text>
                  <Text
                    style={{
                      fontSize: 14,
                      lineHeight: 21,
                      color: '#526179',
                      marginTop: 5,
                    }}
                  >
                    You can no longer send or receive messages from this
                    contact.
                  </Text>
                </View>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Unblock contact"
                onPress={() => {
                  setBlockError('');
                  setBlockDialogOpen(true);
                }}
                style={{
                  minHeight: 49,
                  marginTop: 24,
                  borderRadius: 7,
                  backgroundColor: '#F1EBFF',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: '#6D28D9', fontSize: 16 }}>Unblock</Text>
              </Pressable>
            </View>
          ) : groupSendNotice ? (
            <View
              accessibilityLabel="Messaging restricted"
              style={[styles.composerRestricted, { marginBottom: bottomInset }]}
            >
              <Text style={styles.composerRestrictedText}>
                {groupSendNotice}
              </Text>
            </View>
          ) : (
            <View
              style={[
                styles.composerRow,
                styles.composerForeground,
                voiceMode !== 'idle' &&
                  voiceMode !== 'sending' &&
                  styles.hiddenComposer,
                composerKeyboardInset,
              ]}
            >
              <View style={styles.composer}>
                <TextInput
                  ref={inputRef}
                  accessibilityLabel="Type a message"
                  multiline
                  onChangeText={changeDraft}
                  // Tapping into the composer asks for the keyboard, which is the
                  // space the panel is occupying.
                  onFocus={() => {
                    setEmojiOpen(false);
                    scrollToEnd();
                  }}
                  // Once the user moves the caret themselves, control of it goes
                  // back to the input.
                  onSelectionChange={event => {
                    selectionRef.current = event.nativeEvent.selection;
                    setForcedSelection(null);
                  }}
                  onSubmitEditing={send}
                  placeholder="Type a message"
                  placeholderTextColor="#8792A4"
                  returnKeyType="send"
                  selection={forcedSelection ?? undefined}
                  style={styles.input}
                  value={draft}
                />
                <Pressable
                  accessibilityLabel="Add emoji"
                  accessibilityState={{ expanded: emojiOpen }}
                  hitSlop={6}
                  onPress={toggleEmojiPicker}
                  style={[
                    styles.compactComposerIcon,
                    emojiOpen && styles.composerIconActive,
                  ]}
                >
                  <EmojiIcon active={emojiOpen} />
                </Pressable>
                <Pressable
                  accessibilityLabel="Attach a file"
                  accessibilityState={{ expanded: attachmentOpen }}
                  hitSlop={6}
                  onPress={() => {
                    if (mediaBlocked) {
                      setNotice(MEDIA_ADMINS_ONLY_NOTICE);
                      return;
                    }
                    Keyboard.dismiss();
                    setEmojiOpen(false);
                    setAttachmentStart('tray');
                    setAttachmentOpen(open => !open);
                  }}
                  style={[
                    styles.compactComposerIcon,
                    attachmentOpen && styles.attachmentIconActive,
                  ]}
                >
                  <PaperclipIcon active={attachmentOpen} />
                </Pressable>
              </View>
              {hasDraft || replyingTo ? (
                <Pressable
                  accessibilityLabel="Send message"
                  accessibilityState={{ disabled: sending, busy: sending }}
                  disabled={sending}
                  onPress={send}
                  style={[
                    styles.roundActionButton,
                    sending && styles.roundActionButtonDisabled,
                  ]}
                >
                  <ComposerButtonGradient />
                  {sending ? (
                    <ActivityIndicator color="#FFF" size="small" />
                  ) : (
                    <SendIcon />
                  )}
                </Pressable>
              ) : mediaBlocked ? (
                // Voice notes upload through send-media, which the same setting blocks.
                <Pressable
                  accessibilityLabel="Record voice message"
                  onPress={() => setNotice(MEDIA_ADMINS_ONLY_NOTICE)}
                  style={[
                    styles.roundActionButton,
                    styles.roundActionButtonDisabled,
                  ]}
                >
                  <ComposerButtonGradient />
                  <CompactMicrophoneIcon onDark />
                </Pressable>
              ) : (
                <Pressable
                  accessibilityLabel="Record voice message"
                  disabled={sending}
                  onPressIn={startVoiceRecording}
                  style={[
                    styles.roundActionButton,
                    sending && styles.roundActionButtonDisabled,
                  ]}
                >
                  <ComposerButtonGradient />
                  <CompactMicrophoneIcon onDark />
                </Pressable>
              )}
            </View>
          )}
      <EmojiPicker
            bottomInset={bottomInset}
            onSelectEmoji={emoji => {
              insertEmoji(emoji);
              setEmojiOpen(false);
            }}
            onSelectGif={sendGif}
            visible={
              emojiOpen &&
              !contactBlocked &&
              voiceMode === 'idle' &&
              !groupSendNotice
            }
          />
        </View>
      </View>

      <DirectChatMenu
        visible={directMenuOpen}
        blocked={contactBlocked}
        chatId={chatId}
        userId={contact.userId}
        timerRequestKey={timerRequestKey}
        currentTimer={currentDisappearingTimer}
        onClose={() => setDirectMenuOpen(false)}
        onProfile={() => setProfileOpen(true)}
        onEditContact={() => setEditContactOpen(true)}
        onBlock={() => {
          setBlockError('');
          setBlockDialogOpen(true);
        }}
        onSelect={() => setSelectionMode(true)}
        onClear={() => {
          updateMessages(() => []);
          removeStoredThread(chatId).catch(() => undefined);
          setNotice('Chat cleared.');
        }}
        onDelete={onBack}
        onNotice={setNotice}
        onReportSubmitted={onReportSubmitted}
        onDisappearingTimerChange={updateDisappearingTimer}
      />
      {contact.kind !== 'group' ? (
        <EditContactSheet
          name={contact.name}
          onClose={() => setEditContactOpen(false)}
          onSaved={message => {
            setEditContactOpen(false);
            setNotice(message);
          }}
          phone={contactPhone}
          userId={contact.userId}
          visible={editContactOpen}
        />
      ) : null}
      <BlockConfirmation
        visible={blockDialogOpen}
        name={contact.name}
        unblock={contactBlocked}
        busy={blockBusy}
        error={blockError}
        onConfirm={confirmContactBlock}
        onCancel={() => setBlockDialogOpen(false)}
      />
      <Modal
        animationType="fade"
        onRequestClose={() => {
          setGroupMenuOpen(false);
          setGroupMoreOpen(false);
        }}
        statusBarTranslucent
        transparent
        visible={groupMenuOpen || groupMoreOpen}
      >
        {groupMenuOpen ? (
          <View style={styles.groupMenuBackdrop}>
            <Pressable
              accessibilityLabel="Close group menu"
              onPress={() => setGroupMenuOpen(false)}
              style={StyleSheet.absoluteFill}
            />
            <View
              style={[
                styles.groupMenuSheet,
                { paddingBottom: Math.max(insets.bottom + 8, 18) },
              ]}
            >
              <View style={styles.groupMenuHandle} />
              <Pressable
                accessibilityLabel="Close group menu"
                onPress={() => setGroupMenuOpen(false)}
                style={styles.groupMenuClose}
              >
                <Text style={styles.groupMenuCloseText}>×</Text>
              </Pressable>
              {[
                ['add', 'Add Members', () => setGroupMembersOpen(true)],
                ['info', 'Group Info', () => setProfileOpen(true)],
                ['media', 'Group Media', () => setGroupMediaOpen(true)],
                [
                  'mute',
                  conversationMuted
                    ? 'Unmute Notification'
                    : 'Mute Notification',
                  async () => {
                    const next = !conversationMuted;
                    await setConversationMuted(chatId, next);
                    setConversationMutedState(next);
                    setNotice(
                      next
                        ? 'Group notifications muted.'
                        : 'Group notifications unmuted.',
                    );
                  },
                ],
                ['search', 'Search', () => setGroupSearchOpen(true)],
                ['more', 'More', () => setGroupMoreOpen(true)],
              ].map(([icon, label, action]) => (
                <Pressable
                  accessibilityLabel={String(label)}
                  key={String(label)}
                  onPress={() => {
                    setGroupMenuOpen(false);
                    (action as () => void)();
                  }}
                  style={styles.groupMenuRow}
                >
                  <View style={styles.groupMenuIcon}>
                    <GroupMenuIcon name={icon as GroupMenuIconName} />
                  </View>
                  <Text style={styles.groupMenuLabel}>{String(label)}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : (
          <View style={styles.groupMenuBackdrop}>
            <View
              style={[
                styles.groupMoreSheet,
                { paddingBottom: Math.max(insets.bottom + 7, 16) },
              ]}
            >
              <View style={styles.groupMenuHandle} />
              <View style={styles.groupMoreHeader}>
                <Pressable
                  accessibilityLabel="Back to group options"
                  onPress={() => {
                    setGroupMoreOpen(false);
                    setGroupMenuOpen(true);
                  }}
                  style={styles.groupMoreHeaderButton}
                >
                  <Text style={styles.groupMoreBack}>‹</Text>
                </Pressable>
                <Pressable
                  accessibilityLabel="Close more options"
                  onPress={() => {
                    setGroupMoreOpen(false);
                    setGroupMenuOpen(false);
                  }}
                  style={styles.groupMoreHeaderButton}
                >
                  <Text style={styles.groupMenuCloseText}>×</Text>
                </Pressable>
              </View>
              {[
                ['clear', 'Clear Chat'],
                ['report', 'Report Group'],
                ['leave', 'Leave Group'],
                ...(canDeleteGroup ? [['delete', 'Delete Group']] : []),
              ].map(([action, label]) => (
                <Pressable
                  accessibilityLabel={label}
                  key={label}
                  onPress={() => {
                    setGroupMoreOpen(false);
                    confirmGroupAction(action as GroupMoreIconName);
                  }}
                  style={styles.groupMoreRow}
                >
                  <View style={styles.groupMoreIcon}>
                    <GroupMoreActionIcon name={action as GroupMoreIconName} />
                  </View>
                  <Text
                    style={[
                      styles.groupMoreLabel,
                      action === 'delete' && styles.groupMoreDanger,
                    ]}
                  >
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}
      </Modal>

      <ManageGroupMembersScreen
        groupId={contact.userId || chatId}
        initialPage="add"
        onBack={() => setGroupMembersOpen(false)}
        onNotice={setNotice}
        onOpenDirectChat={onOpenConversation}
        onTimelineMessage={message =>
          updateMessages(current => sortByTime(upsertMessage(current, message)))
        }
        visible={groupMembersOpen}
      />
      <SharedContentScreen
        chatId={chatId}
        contact={contact}
        initialTab="media"
        onBack={() => setGroupMediaOpen(false)}
        onNotice={setNotice}
        visible={groupMediaOpen}
      />

      <MediaAttachmentFlow
        initialMedia={incomingMedia?.media}
        initialScreen={attachmentStart}
        onClose={() => {
          setAttachmentOpen(false);
          setAttachmentStart('tray');
          if (incomingMedia) { onIncomingMediaHandled?.(); }
        }}
        onContact={attachContact}
        onDocument={attachDocument}
        onLocation={attachLocation}
        onNotice={setNotice}
        onSend={sendAttachments}
        recipientName={contact.name}
        requestRecentsPermissionOnOpen={false}
        transfer={mediaTransfer}
        visible={attachmentOpen}
      />

      <DocumentAttachmentScreen
        chatId={chatId}
        onBack={() => setDocumentOpen(false)}
        onChooseGallery={() => openMediaFromFiles('gallery')}
        onNotice={setNotice}
        onOpenRecent={downloadMedia}
        onScanDocument={() => openMediaFromFiles('camera')}
        onSend={sendDocument}
        visible={documentOpen}
      />

      <ProfilePictureViewer uri={headerContact.thumbnail} name={headerContact.name} visible={profilePictureOpen} onClose={() => setProfilePictureOpen(false)} />
      {contact.kind === 'group' ? (
        <GroupInfoScreen
          chatId={chatId}
          contact={headerContact}
          initialPinnedVisible={openPinnedDirectly}
          onUpdated={setGroupDetails}
          onBack={() => {
            setProfileOpen(false);
            setOpenPinnedDirectly(false);
          }}
          onClear={() => {
            updateMessages([]);
            removeStoredThread(chatId).catch(() => undefined);
          }}
          onCreateSimilarGroup={onCreateSimilarGroup}
          onExitGroup={() => {
            setProfileOpen(false);
            setOpenPinnedDirectly(false);
            onBack();
          }}
          onOpenDirectChat={onOpenConversation}
          onNotice={setNotice}
          onOpenPinnedMessage={message =>
            setTimeout(() => scrollToMessage(message), 220)
          }
          onForwardPinnedMessages={selectedMessages => {
            setSelectedMessageIds(
              new Set(selectedMessages.map(message => message.id)),
            );
            setSelectionMode(true);
            setForwardOpen(true);
          }}
          onDeletePinnedMessage={message => setDeleteCandidate(message)}
          onPinnedMessageUnpinned={messageId =>
            updateMessages(current =>
              current.map(message =>
                message.id === messageId
                  ? { ...message, isPinned: false, pinnedAt: null }
                  : message,
              ),
            )
          }
          onPinnedMessagesDeletedForMe={messageIds =>
            updateMessages(current =>
              messageIds.reduce(
                (thread, messageId) => markDeletedForMe(thread, messageId),
                current,
              ),
            )
          }
          onTimelineMessage={(message: ChatMessage) => {
            updateMessages(current =>
              sortByTime(upsertMessage(current, message)),
            );
            scrollToEnd();
          }}
          visible={profileOpen}
        />
      ) : (
        <ChatProfileScreen
          chatId={chatId}
          contact={contact}
          initialPinnedVisible={openPinnedDirectly}
          onBack={() => {
            setProfileOpen(false);
            setOpenPinnedDirectly(false);
          }}
          onSearch={() => {
            setProfileOpen(false);
            setGroupSearchOpen(true);
          }}
          onCall={type => {
            setProfileOpen(false);
            beginCall(type).catch(() => undefined);
          }}
          onClearChat={async () => {
            updateMessages([]);
            await removeStoredThread(chatId);
          }}
          onDeleteChat={async () => {
            await deleteChat(chatId);
            setProfileOpen(false);
            onBack();
          }}
          onNotice={setNotice}
          onOpenPinnedMessage={message =>
            setTimeout(() => scrollToMessage(message), 220)
          }
          onForwardPinnedMessages={selectedMessages => {
            setSelectedMessageIds(
              new Set(selectedMessages.map(message => message.id)),
            );
            setSelectionMode(true);
            setForwardOpen(true);
          }}
          onDeletePinnedMessage={message => setDeleteCandidate(message)}
          onPinnedMessageUnpinned={messageId => {
            updateMessages(current =>
              current.map(message =>
                message.id === messageId
                  ? { ...message, isPinned: false, pinnedAt: null }
                  : message,
              ),
            );
            emitMessageUnpinned(messageId);
          }}
          onPinnedMessagesDeletedForMe={messageIds =>
            updateMessages(current =>
              messageIds.reduce(
                (thread, messageId) => markDeletedForMe(thread, messageId),
                current,
              ),
            )
          }
          onTimelineMessage={(message: ChatMessage) => {
            updateMessages(current =>
              sortByTime(upsertMessage(current, message)),
            );
            scrollToEnd();
          }}
          presenceLabel={headerStatus}
          visible={profileOpen}
        />
      )}

      <Modal
        animationType={'slide'}
        onRequestClose={() => setContactPickerOpen(false)}
        statusBarTranslucent
        transparent
        visible={contactPickerOpen}
      >
        <View style={styles.contactPickerBackdrop}>
          <View
            style={[
              styles.contactPickerSheet,
              { paddingBottom: Math.max(insets.bottom, 12) },
            ]}
          >
            <View style={styles.contactPickerHeader}>
              <Text
                accessibilityRole={'header'}
                style={styles.contactPickerTitle}
              >
                Share Contact
              </Text>
              <Pressable
                accessibilityLabel={'Cancel contact sharing'}
                onPress={() => setContactPickerOpen(false)}
              >
                <Text style={styles.contactPickerCancel}>Cancel</Text>
              </Pressable>
            </View>
            {loadingContacts ? (
              <ActivityIndicator
                color={'#8B27E9'}
                style={styles.contactPickerLoading}
              />
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                {shareableContacts.map(shared => (
                  <Pressable
                    accessibilityLabel={`Share ${shared.name}`}
                    key={shared.id}
                    onPress={() => shareContact(shared)}
                    style={styles.contactPickerRow}
                  >
                    <View style={styles.contactPickerAvatar}>
                      <Text style={styles.contactPickerInitial}>
                        {initialsOf(shared.name)}
                      </Text>
                    </View>
                    <View style={styles.contactPickerCopy}>
                      <Text style={styles.contactPickerName}>
                        {shared.name}
                      </Text>
                      <Text numberOfLines={1} style={styles.contactPickerMeta}>
                        {shared.phoneNumbers[0] || shared.emailAddresses[0]}
                      </Text>
                    </View>
                    <Text style={styles.contactPickerShare}>Share</Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        onRequestClose={() => setGalleryMedia(null)}
        statusBarTranslucent
        visible={galleryMedia !== null}
      >
        <View style={styles.galleryPreview}>
          <View
            style={[
              styles.galleryHeader,
              { paddingTop: Math.max(insets.top, 8) },
            ]}
          >
            <Pressable
              accessibilityLabel="Close media gallery"
              onPress={() => setGalleryMedia(null)}
              style={styles.galleryClose}
            >
              <Text style={styles.galleryCloseText}>×</Text>
            </Pressable>
            <Text style={styles.galleryTitle}>
              Media ({galleryMedia?.length || 0})
            </Text>
            <View style={styles.galleryCloseSpacer} />
          </View>
          <ScrollView
            contentContainerStyle={styles.galleryGrid}
            showsVerticalScrollIndicator
          >
            {galleryMedia?.map((item, index) => (
              <Pressable
                accessibilityLabel={`Open media ${index + 1} of ${galleryMedia?.length || 0}`}
                key={item.id}
                onPress={() => {
                  setGalleryMedia(null);
                  const localUri = downloadedFileFor(item.id);
                  setPreviewMedia(
                    localUri ? {...item, mediaUrl: localUri} : item,
                  );
                }}
                style={styles.galleryTile}
              >
                {item.mediaUrl ? (
                  <ProgressiveMediaImage
                    mediaUrl={
                      item.messageType === 'image'
                        ? downloadedFileFor(item.id) || item.thumbnailUrl || item.mediaUrl
                        : item.thumbnailUrl || item.mediaUrl
                    }
                    style={styles.galleryImage}
                    thumbnailUrl={item.thumbnailUrl}
                  />
                ) : (
                  <View style={styles.galleryUnavailable}>
                    <Text style={styles.galleryUnavailableText}>
                      Media unavailable
                    </Text>
                  </View>
                )}
                {item.messageType === 'video' ? (
                  <View style={styles.galleryVideoBadge}>
                    <Text style={styles.galleryVideoBadgeText}>▶</Text>
                  </View>
                ) : null}
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        onRequestClose={() => setPreviewMedia(null)}
        transparent
        visible={previewMedia !== null}
      >
        <View style={styles.fullPreview}>
          <Pressable
            accessibilityLabel="Close media preview"
            onPress={() => setPreviewMedia(null)}
            style={styles.closePreview}
          >
            <Text style={styles.closePreviewText}>×</Text>
          </Pressable>
          {previewMedia?.mediaUrl ? (
            previewMedia.messageType === 'video' ? (
              <FullPreviewVideo
                uri={downloadedFileFor(previewMedia.id) || previewMedia.mediaUrl}
              />
            ) : (
              <ProgressiveMediaImage
                mediaUrl={downloadedFileFor(previewMedia.id) || previewMedia.mediaUrl}
                resizeMode="contain"
                style={styles.fullPreviewImage}
                thumbnailUrl={previewMedia.thumbnailUrl}
              />
            )
          ) : null}
        </View>
      </Modal>

      <Modal
        animationType="fade"
        onRequestClose={() => setPinnedBannerAction(null)}
        statusBarTranslucent
        transparent
        visible={pinnedBannerAction !== null}
      >
        <View style={styles.pinnedBannerBackdrop}>
          <Pressable
            accessibilityLabel="Close pinned banner actions"
            onPress={() => setPinnedBannerAction(null)}
            style={StyleSheet.absoluteFill}
          />
          <View
            accessibilityLabel="Pinned banner actions"
            style={[
              styles.pinnedBannerSheet,
              { paddingBottom: Math.max(insets.bottom, 14) },
            ]}
          >
            <View style={styles.pinnedBannerHandle} />
            <Pressable
              accessibilityLabel="Open pinned banner message in chat"
              disabled={updatingPinnedBanner}
              onPress={openPinnedBannerMessage}
              style={styles.pinnedBannerActionRow}
            >
              <View style={styles.pinnedBannerActionIcon}>
                <OpenPinnedInChatIcon />
              </View>
              <Text style={styles.pinnedBannerActionText}>Open in Chat</Text>
            </Pressable>
            <Pressable
              accessibilityLabel="Show all pinned messages"
              disabled={updatingPinnedBanner}
              onPress={showAllPinnedMessages}
              style={styles.pinnedBannerActionRow}
            >
              <View style={styles.pinnedBannerActionIcon}>
                <AllPinnedMessagesIcon />
              </View>
              <Text style={styles.pinnedBannerActionText}>
                Show all Pinned Messages
              </Text>
            </Pressable>
            <Pressable
              accessibilityLabel="Unpin banner message"
              disabled={updatingPinnedBanner}
              onPress={unpinPinnedBannerMessage}
              style={styles.pinnedBannerActionRow}
            >
              <View style={styles.pinnedBannerActionIcon}>
                <MessageActionIcon action="unpin" />
              </View>
              <Text style={styles.pinnedBannerActionText}>Unpin Message</Text>
              {updatingPinnedBanner ? (
                <ActivityIndicator color="#8B27E9" size="small" />
              ) : null}
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="none"
        onRequestClose={closeMessageActions}
        statusBarTranslucent
        transparent
        visible={selected !== null}
      >
        <View style={styles.menuBackdrop}>
          <BlurView
            intensity={Platform.OS === 'ios' ? 35 : 22}
            style={StyleSheet.absoluteFill}
            tint="dark"
          />
          <Pressable
            accessibilityLabel="Close message actions"
            onPress={closeMessageActions}
            style={StyleSheet.absoluteFill}
          />
          <Animated.View
            accessibilityHint="Swipe down to close"
            accessibilityLabel="Message actions"
            style={[
              styles.actionSheetSurface,
              { transform: [{ translateY: actionSheetOffset }] },
            ]}
            {...actionSheetPanResponder.panHandlers}
          >
            {selected ? (
              <View
                accessibilityLabel="Highlighted selected message"
                pointerEvents="none"
                style={styles.selectedMessageSpotlight}
              >
                <View
                  style={[
                    styles.messageBubble,
                    selected.isOwn ? styles.ownBubble : styles.otherBubble,
                    selected.isOwn && {
                      backgroundColor: wallpaper.messageColor,
                      borderColor: wallpaper.messageColor,
                    },
                  ]}
                >
                  <Text
                    numberOfLines={4}
                    style={[
                      styles.messageText,
                      selected.isOwn && styles.ownMessageText,
                    ]}
                  >
                    {selected.text || selected.messageType || 'Attachment'}
                  </Text>
                </View>
              </View>
            ) : null}
            <View
              style={[
                styles.menu,
                { paddingBottom: Math.max(insets.bottom, 14) },
              ]}
            >
              <View style={styles.sheetHandle} />
              <View
                accessibilityLabel="Message reactions"
                style={styles.reactionRow}
              >
                {QUICK_REACTIONS.map(emoji => (
                  <Pressable
                    accessibilityLabel={`React ${emoji}`}
                    key={emoji}
                    onPress={() => reactToSelected(emoji)}
                    style={[
                      styles.reactionChoice,
                      selected?.myReaction === emoji &&
                        styles.reactionChoiceSelected,
                    ]}
                  >
                    <Text style={styles.reactionChoiceText}>{emoji}</Text>
                  </Pressable>
                ))}
                <Pressable
                  accessibilityLabel="More reactions"
                  onPress={() => setMoreReactionsOpen(open => !open)}
                  style={styles.moreReaction}
                >
                  <Text style={styles.moreReactionText}>+</Text>
                </Pressable>
              </View>
              {moreReactionsOpen ? (
                <View
                  accessibilityLabel="More reaction choices"
                  style={styles.moreReactionGrid}
                >
                  {MORE_REACTIONS.map(emoji => (
                    <Pressable
                      accessibilityLabel={`React ${emoji}`}
                      key={emoji}
                      onPress={() => reactToSelected(emoji)}
                      style={styles.moreReactionChoice}
                    >
                      <Text style={styles.reactionChoiceText}>{emoji}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
              {(
                [
                  'reply',
                  'forward',
                  'select',
                  'copy',
                  'pin',
                  'unread',
                  'delete',
                ] as const
              )
                .filter(action => action !== 'unread' || !selected?.isOwn)
                .filter(action => action !== 'pin' || canPinMessages)
                .map(action => (
                <Pressable
                  accessibilityLabel={
                    action === 'pin' && selected?.isPinned
                      ? 'Unpin message'
                      : action === 'unread'
                      ? 'Mark as unread'
                      : `${action[0].toUpperCase()}${action.slice(1)} message`
                  }
                  accessibilityState={{ selected: chosenAction === action }}
                  key={action}
                  onPress={() => menuAction(action)}
                  style={[
                    styles.actionMenuItem,
                    chosenAction === action && styles.actionMenuItemSelected,
                    action === 'select' && styles.actionDividerTop,
                    action === 'delete' && styles.actionDividerTop,
                  ]}
                >
                  <View style={styles.actionGlyph}>
                    <MessageActionIcon
                      action={
                        action === 'pin' && selected?.isPinned
                          ? 'unpin'
                          : action
                      }
                    />
                  </View>
                  <Text
                    style={[
                      styles.menuLabel,
                      chosenAction === action && styles.actionMenuLabelSelected,
                      action === 'delete' && styles.destructiveLabel,
                    ]}
                  >
                    {action === 'pin' && selected?.isPinned
                      ? 'Unpin Message'
                      : action === 'pin'
                      ? 'Pin Message'
                      : action === 'unread'
                      ? 'Mark as Unread'
                      : action[0].toUpperCase() + action.slice(1)}
                  </Text>
                </Pressable>
              ))}
              {Platform.OS === 'ios' ? (
                <Pressable
                  accessibilityLabel="Cancel message actions"
                  onPress={closeMessageActions}
                  style={styles.cancelMenuItem}
                >
                  <Text style={styles.cancelMenuLabel}>Cancel</Text>
                </Pressable>
              ) : null}
            </View>
          </Animated.View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        onRequestClose={() => {
          if (!deletingScope) {
            setDeleteCandidate(null);
            setDeleteSelectionCandidates(null);
          }
        }}
        statusBarTranslucent
        transparent
        visible={deleteCandidate !== null || deleteSelectionCandidates !== null}
      >
        <View style={styles.deleteDialogBackdrop}>
          <BlurView
            intensity={Platform.OS === 'ios' ? 35 : 22}
            style={StyleSheet.absoluteFill}
            tint="dark"
          />
          <Pressable
            accessibilityLabel="Close delete confirmation"
            disabled={Boolean(deletingScope)}
            onPress={() => {
              setDeleteCandidate(null);
              setDeleteSelectionCandidates(null);
            }}
            style={StyleSheet.absoluteFill}
          />
          <View
            accessibilityLabel={
              deleteSelectionCandidates
                ? `Delete ${deleteSelectionCandidates.length} messages?`
                : 'Delete this Message?'
            }
            style={styles.deleteDialog}
          >
            <View style={styles.deleteDialogIcon}>
              <TrashIcon color="#EF4444" />
            </View>
            <Text style={styles.deleteDialogTitle}>
              {deleteSelectionCandidates
                ? `Delete ${deleteSelectionCandidates.length} ${
                    deleteSelectionCandidates.length === 1
                      ? 'Message'
                      : 'Messages'
                  }?`
                : 'Delete this Message?'}
            </Text>
            <Text style={styles.deleteDialogCopy}>
              This action can't be undone.{`\n`}Choose how you want to{`\n`}
              delete{' '}
              {deleteSelectionCandidates ? 'these messages' : 'this message'}.
              {`\n`}Delete for Everyone is available for 24 hours after sending.
            </Text>
            {(
              deleteSelectionCandidates
                ? deleteSelectionCandidates.every(message => canDeleteForEveryone(message))
                : deleteCandidate && canDeleteForEveryone(deleteCandidate)
            ) ? (
              <Pressable
                accessibilityLabel="Delete for everyone"
                accessibilityRole="button"
                disabled={Boolean(deletingScope)}
                onPress={() =>
                  deleteSelectionCandidates
                    ? confirmDeleteSelectedMessages('everyone')
                    : confirmDeleteForEveryone()
                }
                style={styles.deleteForEveryoneButton}
              >
                {deletingScope === 'everyone' ? (
                  <ActivityIndicator color="#EF4444" size="small" />
                ) : (
                  <Text style={styles.deleteForMeText}>
                    Delete for Everyone
                  </Text>
                )}
              </Pressable>
            ) : null}
            <Pressable
              accessibilityLabel={
                deleteSelectionCandidates
                  ? 'Delete selected messages for me'
                  : 'Delete for me'
              }
              accessibilityRole="button"
              disabled={Boolean(deletingScope)}
              onPress={() =>
                deleteSelectionCandidates
                  ? confirmDeleteSelectedMessages('me')
                  : confirmDeleteForMe()
              }
              style={[
                styles.deleteForMeButton,
                (deleteSelectionCandidates
                  ? deleteSelectionCandidates.every(message => canDeleteForEveryone(message))
                  : deleteCandidate && canDeleteForEveryone(deleteCandidate)) &&
                  styles.deleteForMeButtonAfterEveryone,
              ]}
            >
              {deletingScope === 'me' ? (
                <ActivityIndicator color="#EF4444" size="small" />
              ) : (
                <Text style={styles.deleteForMeText}>Delete for Me</Text>
              )}
            </Pressable>
            <Pressable
              accessibilityLabel="Cancel message deletion"
              accessibilityRole="button"
              disabled={Boolean(deletingScope)}
              onPress={() => {
                setDeleteCandidate(null);
                setDeleteSelectionCandidates(null);
              }}
              style={styles.deleteCancelButton}
            >
              <Text style={styles.deleteCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <Modal
        animationType="slide"
        onRequestClose={() => setForwardOpen(false)}
        visible={forwardOpen}
      >
        <ForwardMessageScreen
          messageCount={selectedMessageIds.size}
          onBack={() => setForwardOpen(false)}
          onForward={finishForward}
        />
      </Modal>

      <MicrophonePermissionSheet
        onAllow={() => {
          allowMicrophoneAndCall().catch(() => undefined);
        }}
        onDismiss={() => {
          setMicrophoneSheetOpen(false);
          setPendingCallType(null);
        }}
        visible={microphoneSheetOpen}
      />
      {endedCall ? (
        <CallEndedScreen
          name={contact.name}
          picture={contact.thumbnail}
          duration={endedCall.duration}
          status={endedCall.status}
          onClose={() => setEndedCall(null)}
          onMessage={() => {
            setEndedCall(null);
            requestAnimationFrame(() => inputRef.current?.focus());
          }}
          onAudioCallAgain={() => {
            setEndedCall(null);
            beginCall('audio').catch(() => undefined);
          }}
        />
      ) : null}
      {activeCall && !callHidden ? (
        <OutgoingCallScreen
          call={activeCall}
          contact={contact}
          durationSeconds={callDurationSeconds}
          insets={insets}
          localVideoUrl={callMedia.localUrl}
          remoteScreenLive={callMedia.remoteVideoLive}
          remoteVideoUrl={callMedia.remoteUrl}
          sharingScreen={isCallScreenSharing}
          onEnd={() => {
            endActiveCall().catch(() => undefined);
          }}
          onHide={() => setCallHidden(true)}
          onMore={openCallMore}
          onStopSharing={() => {
            toggleDirectCallScreenShare().catch(() => undefined);
          }}
          onOpenChat={openChatDuringCall}
          onToggleHold={toggleCallHold}
          onToggleMute={toggleCallMute}
          onToggleSpeaker={toggleCallSpeaker}
          onToggleVideo={toggleCallVideo}
        />
      ) : null}
      <CallOptionsSheet
        audioOutputLabel={
          (
            callRoutes.find(route => route.id === selectedCallRouteId) ||
            (activeCall?.speaker ? SPEAKER_ROUTE : EARPIECE_ROUTE)
          ).label
        }
        autoReconnect={autoReconnect}
        insets={insets}
        onAddPeople={() => {
          openAddPeople().catch(() => undefined);
        }}
        onAudioOutput={openAudioOutputs}
        onCallStatus={() => {
          showCurrentCallStatus().catch(() => undefined);
        }}
        onClose={() => setCallMoreOpen(false)}
        onMicrophoneSettings={() => {
          setCallMoreOpen(false);
          setMicrophoneSettingsOpen(true);
        }}
        onShareScreen={() => {
          toggleDirectCallScreenShare().catch(() => undefined);
        }}
        onToggleAutoReconnect={() => setAutoReconnect(enabled => !enabled)}
        onViewContact={openCallContactSheet}
        sharingScreen={isCallScreenSharing}
        visible={callMoreOpen}
      />
      <AudioOutputSheet
        insets={insets}
        onClose={() => {
          setAudioOutputOpen(false);
          setCallMoreOpen(true);
        }}
        onSelect={selectAudioOutput}
        routes={callRoutes}
        selected={selectedCallRouteId}
        visible={audioOutputOpen}
      />
      <CallContactSheet
        bottomInset={insets.bottom}
        loading={callContactSheetLoading}
        name={contact.name}
        onBack={() => {
          setCallContactSheetOpen(false);
          setCallMoreOpen(true);
        }}
        onMessage={() => {
          setCallContactSheetOpen(false);
          openChatDuringCall();
        }}
        picture={contact.thumbnail}
        profile={callContactSheetProfile}
        visible={callContactSheetOpen}
      />
      <MicrophoneSettingsSheet
        echoCancellation={echoCancellation}
        insets={insets}
        noiseSuppression={noiseSuppression}
        onClose={() => {
          setMicrophoneSettingsOpen(false);
          setCallMoreOpen(true);
        }}
        onToggleEchoCancellation={() =>
          setEchoCancellation(enabled => !enabled)
        }
        onToggleNoiseSuppression={() =>
          setNoiseSuppression(enabled => !enabled)
        }
        visible={microphoneSettingsOpen}
      />
      <CallStatusSheet
        autoReconnect={autoReconnect}
        backendStatus={backendCallStatus}
        echoCancellation={echoCancellation}
        insets={insets}
        loading={callStatusLoading}
        networkAvailable={networkAvailable}
        noiseSuppression={noiseSuppression}
        onClose={() => {
          setCallStatusOpen(false);
          setCallMoreOpen(true);
        }}
        visible={callStatusOpen}
      />
      <AddPeopleToCallScreen
        call={activeCall}
        contact={contact}
        durationSeconds={callDurationSeconds}
        insets={insets}
        loading={callPeopleLoading}
        onAdd={() => {
          addSelectedPeopleToCall().catch(() => undefined);
        }}
        onBack={() => {
          setAddPeopleOpen(false);
          setCallMoreOpen(true);
        }}
        onEnd={() => {
          setAddPeopleOpen(false);
          endActiveCall().catch(() => undefined);
        }}
        onOpenParticipant={participant => {
          openCallContact(participant).catch(() => undefined);
        }}
        onSearchChange={setCallPeopleSearch}
        onToggleMute={toggleCallMute}
        onToggleParticipant={toggleCallParticipant}
        onToggleSpeaker={toggleCallSpeaker}
        participants={callParticipants}
        search={callPeopleSearch}
        selectedIds={selectedCallPeople}
        submitting={addingCallPeople}
        visible={addPeopleOpen}
      />
      {selectedCallContact ? (
        <CallContactScreen
          call={activeCall}
          callContact={selectedCallContact}
          durationSeconds={callDurationSeconds}
          insets={insets}
          loading={callContactLoading}
          media={selectedCallMedia}
          onBack={() => setCallContactOpen(false)}
          onEnd={() => {
            setCallContactOpen(false);
            setAddPeopleOpen(false);
            endActiveCall().catch(() => undefined);
          }}
          onMessage={() => {
            setCallContactOpen(false);
            setAddPeopleOpen(false);
            setNotice(
              `Open ${selectedCallContact.name}'s chat from the chat list.`,
            );
          }}
          onSearch={() =>
            setNotice(
              `Search and shared content for ${selectedCallContact.name}.`,
            )
          }
          onToggleMute={toggleCallMute}
          onToggleSpeaker={toggleCallSpeaker}
          profile={selectedCallProfile}
          visible={callContactOpen}
        />
      ) : null}
      <CallFailedDialog
        name={contact.name}
        onCallAgain={() => {
          retryFailedCall().catch(() => undefined);
        }}
        onCancel={cancelFailedCall}
        visible={callFailedOpen}
      />
    </KeyboardAvoidingView>
  );
}

const styles = createThemedStyles({
  root: { flex: 1, backgroundColor: '#FFF' },
  header: {
    minHeight: 76,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#EBEEF3',
    backgroundColor: '#FFF',
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIcon: {
    width: 36,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: { width: 38, height: 38, borderRadius: 19 },
  headerAvatar: { position: 'relative' },
  avatarFallback: {
    borderWidth: 1,
    borderColor: '#E7ECF3',
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { color: '#8792A4', fontFamily: FONT_FAMILY, fontSize: 11 },
  contactCopy: { flex: 1, marginLeft: 9, justifyContent: 'center' },
  contactName: {
    color: '#111827',
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    fontWeight: '600',
  },
  online: {
    marginTop: 2,
    color: '#6B7280',
    fontFamily: FONT_FAMILY,
    fontSize: 10,
  },
  onlineText: { color: '#15945D' },
  awayText: { color: '#B86D1C' },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  conversation: { flex: 1, backgroundColor: '#FBFAFE' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyState: {
    flex: 1,
    paddingBottom: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectedTitle: {
    marginTop: 8,
    color: '#1B2738',
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    fontWeight: '700',
  },
  connectedCopy: {
    marginTop: 8,
    color: '#758196',
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    lineHeight: 15,
    textAlign: 'center',
  },
  messages: {
    flexGrow: 1,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 10,
    justifyContent: 'flex-end',
  },
  privacyBanner: {
    padding: 10,
    borderWidth: 1,
    borderColor: '#E5E9F0',
    borderRadius: 9,
    backgroundColor: '#FFF',
    flexDirection: 'row',
    shadowColor: '#8490A3',
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 1,
  },
  shield: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#EEF3FA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shieldText: { color: '#718096', fontSize: 12 },
  privacyCopy: { flex: 1, marginLeft: 8 },
  privacyTitle: {
    color: '#263448',
    fontFamily: FONT_FAMILY,
    fontSize: 10,
    fontWeight: '700',
  },
  privacyText: {
    marginTop: 3,
    color: '#637188',
    fontFamily: FONT_FAMILY,
    fontSize: 8,
    lineHeight: 11,
  },
  learnMore: { color: '#526176', fontWeight: '700' },
  datePill: {
    alignSelf: 'center',
    marginVertical: 18,
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 13,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#EEF0F4',
  },
  dateText: { color: '#344256', fontSize: 9 },
  pinnedPanel: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EEF0F4',
    shadowColor: '#8A96A8',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  pinnedTopRow: {
    minHeight: 44,
    paddingVertical: 6,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  pinnedStackSpacer: {
    width: 12,
    height: 26,
    marginRight: 3,
  },
  pinnedIconBox: {
    width: 19,
    height: 19,
    marginRight: 7,
    borderRadius: 5,
    backgroundColor: '#F0E7FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinnedMessageCopy: {
    flex: 1,
    minWidth: 0,
  },
  pinnedDuration: {
    marginTop: 2,
    color: '#526176',
    fontFamily: FONT_FAMILY,
    fontSize: 10,
  },
  pinnedPreview: {
    color: '#344256',
    fontFamily: FONT_FAMILY,
    fontSize: 10,
    fontWeight: '600',
  },
  pinnedChevron: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinnedChevronOpen: { transform: [{ rotate: '180deg' }] },
  pinnedDropdown: {
    paddingLeft: 31,
    paddingRight: 12,
    paddingBottom: 6,
    backgroundColor: '#FFFFFF',
  },
  pinnedDropdownRow: {
    minHeight: 42,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#F1F3F6',
  },
  pinnedDropdownIcon: { width: 18, alignItems: 'center' },
  pinnedDropdownText: {
    color: '#526176',
    fontFamily: FONT_FAMILY,
    fontSize: 10,
  },
  messageLine: {
    width: '100%',
    marginVertical: 5,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 5,
  },
  messageLineOwn: { justifyContent: 'flex-end' },
  messageAvatar: { width: 18, height: 18, borderRadius: 9 },
  messageStack: { maxWidth: '80%', alignItems: 'flex-start' },
  messageStackOwn: { alignItems: 'flex-end' },
  messageBubble: {
    maxWidth: '100%',
    minWidth: 72,
    paddingHorizontal: 11,
    paddingTop: 8,
    paddingBottom: 6,
    borderRadius: 13,
  },
  ownBubble: { backgroundColor: '#8B27E9', borderBottomRightRadius: 4 },
  otherBubble: {
    borderWidth: 1,
    borderColor: '#E3E7EE',
    backgroundColor: '#FFF',
    borderBottomLeftRadius: 4,
  },
  mediaBubble: {
    position: 'relative',
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E3E7EE',
  },
  audioMessageBubble: {
    padding: 0,
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
    borderWidth: 0,
    borderRadius: 10,
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  messageText: {
    color: '#1B2738',
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    lineHeight: 17,
  },
  messageLink: { textDecorationLine: 'underline' },
  ownMessageText: { color: '#FFF' },
  messageMeta: {
    alignSelf: 'flex-end',
    minHeight: 13,
    marginTop: 2,
    paddingHorizontal: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 3,
  },
  inlinePin: {
    width: 15,
    height: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageTime: { color: '#8792A4', fontSize: 8 },
  ownMeta: { color: '#E9D9FF' },
  forwarded: {
    marginBottom: 3,
    color: '#758196',
    fontSize: 8,
    fontStyle: 'italic',
  },
  replyPreview: {
    marginBottom: 5,
    padding: 6,
    borderLeftWidth: 2,
    borderLeftColor: '#C8A5FF',
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,.16)',
  },
  replyPreviewBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  replyPreviewImage: {
    width: 32,
    height: 32,
    borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,.12)',
  },
  replyPreviewText: { color: '#EEDFFF', fontSize: 9 },
  mediaImage: {
    width: 210,
    height: 200,
    marginBottom: 5,
    borderRadius: 8,
    backgroundColor: '#EEE',
  },
  mediaSize: {
    alignSelf: 'center',
    marginBottom: 5,
    color: '#273244',
    fontSize: 10,
  },
  audioPlayer: {
    minWidth: 210,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
  },
  audioPlayButton: {
    width: 28,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  audioPlay: { color: '#111827', fontSize: 15 },
  audioRetry: {color: '#B42318', fontSize: 19, fontWeight: '700'},
  audioTransferProgress: {color: '#111827', fontSize: 8, fontWeight: '700'},
  waveform: {
    position: 'relative',
    flex: 1,
    height: 40,
  },
  waveformBars: {
    width: '100%',
    height: '100%',
    paddingHorizontal: WAVE_KNOB_SIZE / 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  waveformPlayedMask: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  waveBar: { width: 3, borderRadius: 2, backgroundColor: '#DCE3EC' },
  waveBarPlayed: { backgroundColor: '#9B62ED' },
  audioDuration: {
    marginLeft: 6,
    color: '#273448',
    fontSize: 12,
    fontWeight: '600',
  },
  speedButton: {
    width: 52,
    height: 38,
    marginLeft: 8,
    borderRadius: 6,
    backgroundColor: '#F2ECFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  speedText: { color: '#7137DD', fontSize: 10, fontWeight: '600' },
  documentCard: {
    width: 220,
    overflow: 'hidden',
    borderRadius: 8,
    backgroundColor: '#FFF',
  },
  documentPreview: {
    height: 112,
    backgroundColor: '#ECEFF3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  documentGlyph: { color: '#9DA8B7', fontSize: 48 },
  secureBadge: {
    position: 'absolute',
    right: 7,
    top: 7,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 5,
    backgroundColor: '#FFF',
  },
  secureText: { color: '#1A684D', fontSize: 8 },
  documentDetails: {
    height: 49,
    paddingHorizontal: 7,
    flexDirection: 'row',
    alignItems: 'center',
  },
  documentCopy: { flex: 1 },
  documentName: { color: '#172033', fontSize: 10, fontWeight: '600' },
  documentType: { marginTop: 2, color: '#758196', fontSize: 8 },
  documentSize: {
    marginHorizontal: 6,
    color: '#172033',
    fontSize: 9,
    fontWeight: '700',
  },
  documentDownload: {
    width: 27,
    height: 27,
    borderRadius: 14,
    backgroundColor: '#9CA3AF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  documentDownloadIcon: { color: '#FFF', fontSize: 17 },
  typingPill: {
    width: 61,
    height: 29,
    marginLeft: 18,
    marginBottom: 6,
    paddingHorizontal: 7,
    borderWidth: 1,
    borderColor: '#DDE5EF',
    borderRadius: 8,
    backgroundColor: '#FFF',
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#8290A5',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  typingBars: {
    height: 17,
    marginLeft: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  typingBar: {
    width: 4,
    height: 16,
    borderRadius: 3,
    backgroundColor: '#52637B',
  },
  recordingBar: {
    height: 28,
    marginHorizontal: 8,
    marginBottom: 5,
    borderRadius: 5,
    backgroundColor: '#F5ECFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#E53E3E',
  },
  recordingText: { marginLeft: 6, color: '#6B21A8', fontSize: 10 },
  composerRow: {
    minHeight: 50,
    marginHorizontal: 12,
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: 'transparent',
  },
  composer: {
    flex: 1,
    minHeight: 50,
    maxHeight: 112,
    paddingLeft: 14,
    paddingRight: 6,
    borderWidth: 1,
    borderColor: '#E6EAF0',
    borderRadius: 10,
    backgroundColor: '#FFF',
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    maxHeight: 96,
    paddingTop: 12,
    paddingBottom: 12,
    color: '#152033',
    fontFamily: FONT_FAMILY,
    fontSize: 13,
  },
  previewBackdrop: {
    flex: 1,
    padding: 22,
    backgroundColor: 'rgba(15,23,42,.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewCard: {
    width: '100%',
    padding: 16,
    borderRadius: 16,
    backgroundColor: '#FFF',
  },
  previewTitle: {
    marginBottom: 12,
    color: '#152033',
    fontSize: 16,
    fontWeight: '700',
  },
  previewImage: {
    width: '100%',
    height: 300,
    borderRadius: 10,
    backgroundColor: '#EEE',
  },
  captionInput: {
    height: 46,
    marginTop: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#DDE3EB',
    borderRadius: 8,
    color: '#152033',
  },
  previewActions: {
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  cancelButton: {
    height: 40,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendMediaButton: {
    height: 40,
    paddingHorizontal: 22,
    borderRadius: 8,
    backgroundColor: '#8B27E9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendMediaText: { color: '#FFF', fontWeight: '700' },
  fullPreview: {
    flex: 1,
    backgroundColor: '#080A0F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  galleryPreview: { flex: 1, backgroundColor: '#080A0F' },
  galleryHeader: {
    minHeight: 58,
    paddingHorizontal: 14,
    paddingTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,.18)',
  },
  galleryClose: { width: 42, height: 42, alignItems: 'flex-start', justifyContent: 'center' },
  galleryCloseText: { color: '#FFF', fontSize: 30, lineHeight: 34 },
  galleryTitle: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  galleryCloseSpacer: { width: 42 },
  galleryGrid: {
    padding: 4,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    gap: 4,
  },
  galleryTile: {
    width: '31.5%',
    aspectRatio: 1,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#252A35',
  },
  galleryImage: { width: '100%', height: '100%' },
  galleryUnavailable: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  galleryUnavailableText: { color: '#D1D5DB', fontSize: 10 },
  galleryVideoBadge: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,.65)',
  },
  galleryVideoBadgeText: { color: '#FFF', fontSize: 10 },
  fullPreviewImage: { width: '100%', height: '82%' },
  closePreview: {
    position: 'absolute',
    right: 18,
    top: 48,
    width: 42,
    height: 42,
    zIndex: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closePreviewText: { color: '#FFF', fontSize: 34 },
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,.3)',
    justifyContent: 'flex-end',
  },
  attachmentMenu: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 30,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    backgroundColor: '#FFF',
  },
  attachmentChoice: {
    height: 48,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF0F4',
    flexDirection: 'row',
    alignItems: 'center',
  },
  attachmentGlyph: { width: 32, color: '#7137DD', fontSize: 20 },
  menu: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 30,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    backgroundColor: '#FFF',
  },
  menuTitle: {
    marginBottom: 7,
    color: '#152033',
    fontSize: 13,
    fontWeight: '700',
  },
  menuItem: {
    height: 43,
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#EEF0F4',
  },
  menuLabel: { color: '#263448', fontSize: 13 },
  futureLabel: { color: '#8792A4' },
  contactPickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,.4)',
    justifyContent: 'flex-end',
  },
  contactPickerSheet: {
    maxHeight: '74%',
    minHeight: 320,
    paddingHorizontal: 16,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    backgroundColor: '#FFF',
  },
  contactPickerHeader: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  contactPickerTitle: { color: '#172033', fontSize: 15, fontWeight: '700' },
  contactPickerCancel: { color: '#8B27E9', fontSize: 12, fontWeight: '600' },
  contactPickerLoading: { marginTop: 80 },
  contactPickerRow: { height: 61, flexDirection: 'row', alignItems: 'center' },
  contactPickerAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#EDE5FC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactPickerInitial: { color: '#7137DD', fontSize: 11, fontWeight: '700' },
  contactPickerCopy: { flex: 1, minWidth: 0, marginLeft: 10 },
  contactPickerName: { color: '#172033', fontSize: 12, fontWeight: '600' },
  contactPickerMeta: { marginTop: 4, color: '#758196', fontSize: 9 },
  contactPickerShare: { color: '#7137DD', fontSize: 10, fontWeight: '700' },
  verifiedBadge: { position: 'absolute', right: -2, bottom: -1 },
  // The design floats the composer on the wallpaper; a filled row drew a
  // white band across the thread behind the input box.
  composerForeground: { zIndex: 2 },
  bottomDock: { zIndex: 3 },
  dockNotices: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: '100%',
    paddingBottom: 8,
    zIndex: 20,
  },
  composerRestricted: {
    marginHorizontal: 12,
    marginTop: 6,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#F1F3F7',
  },
  composerRestrictedText: {
    color: '#4B5567',
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  singleMediaImage: { height: 255 },
  // Lies over the video itself (the 5pt gap under it is its bottom margin).
  singleVideoPlayLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  singleVideoPlay: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(15,23,42,.58)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ownMediaBubble: { backgroundColor: '#8B27E9', borderColor: '#8B27E9' },
  ownMediaMeta: { color: '#F0E4FF' },
  mediaCaption: { paddingHorizontal: 5, paddingTop: 3, paddingBottom: 3 },
  albumBubble: { padding: 3 },
  // The grid's height is set where it is drawn (see albumGridHeight), from the
  // number of rows it actually has.
  albumGrid: {
    width: ALBUM_WIDTH,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: ALBUM_GAP,
  },
  albumTile: {
    position: 'relative',
    width: ALBUM_TILE_WIDTH,
    height: ALBUM_TILE_HEIGHT,
    overflow: 'hidden',
    borderRadius: 4,
    backgroundColor: '#DCE3EB',
  },
  albumTileWide: { width: ALBUM_WIDTH },
  albumTileContent: { flex: 1 },
  albumImage: { width: '100%', height: '100%' },
  albumVideoFallback: {
    flex: 1,
    backgroundColor: '#344155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  albumVideoText: { color: '#FFF', fontSize: 10, fontWeight: '600' },
  albumPlay: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    marginLeft: -17.5,
    marginTop: -12,
    width: 35,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(15,23,42,.58)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  albumPlayText: { color: '#FFF', fontSize: 8, fontWeight: '700' },
  viewAllBadge: {
    position: 'absolute',
    right: 5,
    bottom: 5,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: '#FFF',
  },
  viewAllText: { color: '#6F28E8', fontSize: 8, fontWeight: '700' },
  ownAvatar: { marginBottom: 4, marginRight: 2 },
  statusIcon: { minWidth: 13, alignItems: 'center', justifyContent: 'center' },
  failedMark: { color: '#DC2626', fontSize: 10, fontWeight: '800' },
  failedBubble: { backgroundColor: '#B45CF0' },
  retryHint: { marginTop: 2, color: '#DC2626', fontSize: 8, fontWeight: '600' },
  queuedHint: {
    marginTop: 2,
    color: '#7C5A9C',
    fontSize: 8,
    fontWeight: '600',
  },
  connectionBanner: {
    height: 36,
    backgroundColor: '#F3F3F3',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E3E6EA',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 13,
  },
  connectionBannerConnected: { backgroundColor: '#DCFCE7' },
  connectionBannerReconnecting: { backgroundColor: '#FEF3C7' },
  connectionBannerOffline: { backgroundColor: '#FEE2E2' },
  connectionText: {
    color: '#111827',
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    fontWeight: '500',
  },
  activeCallBanner: {
    paddingHorizontal: 10,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  activeCallIdentity: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  activeCallCopy: { minWidth: 0 },
  activeCallTitle: {
    color: '#0B1220',
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: '500',
  },
  activeCallMeta: {
    marginTop: 1,
    color: '#526176',
    fontFamily: FONT_FAMILY,
    fontSize: 9,
    fontWeight: '400',
  },
  activeCallControl: {
    width: 32,
    height: 32,
    borderRadius: 5,
    backgroundColor: '#F3EEFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeCallControlSelected: { backgroundColor: '#E8F1FF', borderColor: '#1877F2', borderWidth: 1 },
  activeCallEnd: {
    width: 32,
    height: 32,
    borderRadius: 5,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  callPermissionBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(17,24,39,.38)',
    justifyContent: 'flex-end',
  },
  callPermissionSheet: {
    minHeight: 304,
    paddingHorizontal: 16,
    paddingTop: 34,
    paddingBottom: 36,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
  },
  callSheetHandle: {
    position: 'absolute',
    top: 8,
    width: 42,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#DCE3EE',
  },
  callPermissionClose: {
    position: 'absolute',
    right: 14,
    top: 16,
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  callPermissionCloseText: {
    color: '#111827',
    fontFamily: FONT_FAMILY,
    fontSize: 22,
    lineHeight: 24,
  },
  callPermissionIcon: {
    width: 50,
    height: 50,
    borderRadius: 6,
    backgroundColor: '#F0E5FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  callPermissionTitle: {
    marginTop: 22,
    color: '#111827',
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    fontWeight: '700',
  },
  callPermissionText: {
    marginTop: 10,
    color: '#66758C',
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
  callPermissionPrimary: {
    width: '100%',
    height: 41,
    marginTop: 28,
    borderRadius: 5,
    backgroundColor: '#8750F4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  callPermissionPrimaryText: {
    color: '#FFFFFF',
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: '700',
  },
  callPermissionSecondary: {
    width: '100%',
    height: 42,
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#E3E8F0',
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  callPermissionSecondaryText: {
    color: '#344256',
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: '700',
  },
  callScreen: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    justifyContent: 'space-between',
  },
  callLocalVideo: {
    position: 'absolute',
    right: 16,
    top: 76,
    width: 104,
    height: 148,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#111827',
  },
  callLocalVideoPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#253047',
  },
  callLocalVideoPlaceholderText: {
    marginTop: 4,
    color: '#E2E8F0',
    fontFamily: FONT_FAMILY,
    fontSize: 9,
    fontWeight: '600',
  },
  callTopBar: {
    height: 48,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  callTopButton: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: '#F5F6F8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  callTopButtonDisabled: { opacity: 0.55 },
  callIdentity: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 10,
  },
  callName: {
    color: '#111827',
    fontFamily: FONT_FAMILY,
    fontSize: 17,
    fontWeight: '800',
  },
  callSubtitle: {
    marginTop: 10,
    color: '#526176',
    fontFamily: FONT_FAMILY,
    fontSize: 11,
  },
  callDetail: {
    marginTop: 12,
    minHeight: 16,
    color: '#344256',
    fontFamily: FONT_FAMILY,
    fontSize: 11,
  },
  callAvatarWrap: {
    marginTop: 76,
    width: 86,
    height: 86,
    borderRadius: 15,
    overflow: 'hidden',
  },
  callAvatar: { width: '100%', height: '100%', borderRadius: 15 },
  callAvatarFallback: {
    backgroundColor: '#F0E7FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  callAvatarInitial: {
    color: '#7137DD',
    fontFamily: FONT_FAMILY,
    fontSize: 28,
    fontWeight: '800',
  },
  callControlsGrid: {
    paddingHorizontal: 28,
    paddingBottom: 20,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 14,
  },
  callControl: { width: '30%', alignItems: 'center' },
  callControlButton: {
    width: 58,
    height: 58,
    borderWidth: 1,
    borderColor: '#E8EDF5',
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  callControlButtonActive: {
    borderColor: '#1877F2',
    backgroundColor: '#E8F1FF',
  },
  callControlButtonDanger: {
    borderColor: '#EF2A2D',
    backgroundColor: '#EF2A2D',
  },
  callControlButtonDisabled: { backgroundColor: '#FEFEFF', opacity: 0.72 },
  callControlLabel: {
    marginTop: 9,
    color: '#64748B',
    fontFamily: FONT_FAMILY,
    fontSize: 10,
  },
  callControlLabelDanger: { color: '#EF2A2D' },
  callControlLabelDisabled: { color: '#BCC4D0' },
  callOptionsBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,.38)',
    justifyContent: 'flex-end',
  },
  callOptionsSheet: {
    minHeight: 475,
    paddingHorizontal: 12,
    paddingTop: 7,
    borderTopLeftRadius: 15,
    borderTopRightRadius: 15,
    backgroundColor: '#FFFFFF',
  },
  callOptionsHeader: {
    height: 39,
    alignItems: 'center',
    justifyContent: 'center',
  },
  callOptionsTitle: {
    color: '#111827',
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: '600',
  },
  callOptionsClose: {
    position: 'absolute',
    right: 0,
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  callOptionsCloseText: {
    color: '#344256',
    fontFamily: FONT_FAMILY,
    fontSize: 22,
    lineHeight: 24,
    fontWeight: '300',
  },
  callQuickOptions: { height: 88, flexDirection: 'row', gap: 8 },
  callQuickOption: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E8ECF2',
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  callQuickOptionLabel: {
    marginTop: 8,
    color: '#1F2937',
    fontFamily: FONT_FAMILY,
    fontSize: 9,
    fontWeight: '500',
  },
  callOptionRows: { marginTop: 7, overflow: 'hidden', borderRadius: 7 },
  callOptionRow: {
    height: 57,
    paddingHorizontal: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EDF0F4',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
  },
  callOptionRowIcon: {
    width: 48,
    height: 48,
    marginRight: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  callOptionRowLabel: {
    flex: 1,
    color: '#111827',
    fontFamily: FONT_FAMILY,
    fontSize: 10,
    fontWeight: '500',
  },
  callOptionValue: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: '#F4F5F7',
  },
  callOptionValueText: {
    color: '#344256',
    fontFamily: FONT_FAMILY,
    fontSize: 8,
    fontWeight: '500',
  },
  callReconnectSwitch: {
    width: 34,
    height: 19,
    padding: 2,
    borderRadius: 10,
    backgroundColor: '#E6EBF2',
    justifyContent: 'center',
  },
  callReconnectSwitchOn: { backgroundColor: '#8B5CF6' },
  callReconnectKnob: {
    width: 15,
    height: 15,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    shadowColor: '#64748B',
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  callReconnectKnobOn: { alignSelf: 'flex-end' },
  callSubSheetHeader: {
    height: 45,
    flexDirection: 'row',
    alignItems: 'center',
  },
  callSubSheetHeaderButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  callSubSheetBack: {
    color: '#344256',
    fontFamily: FONT_FAMILY,
    fontSize: 22,
    lineHeight: 24,
  },
  callSubSheetTitle: {
    flex: 1,
    color: '#111827',
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  callAudioOutputSheet: {
    minHeight: 323,
    paddingHorizontal: 8,
    borderTopLeftRadius: 15,
    borderTopRightRadius: 15,
    backgroundColor: '#FFFFFF',
  },
  callOutputRow: {
    height: 58,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
  },
  callOutputIcon: {
    width: 32,
    marginRight: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  callOutputGlyph: { color: '#111827', fontFamily: FONT_FAMILY, fontSize: 16 },
  callOutputLabel: {
    flex: 1,
    color: '#111827',
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: '500',
  },
  callOutputCheck: {
    width: 30,
    color: '#111827',
    fontFamily: FONT_FAMILY,
    fontSize: 16,
    textAlign: 'center',
  },
  callMicrophoneSheet: {
    minHeight: 196,
    paddingHorizontal: 8,
    borderTopLeftRadius: 15,
    borderTopRightRadius: 15,
    backgroundColor: '#FFFFFF',
  },
  callMicrophoneRow: {
    height: 58,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
  },
  callMicrophoneSettingIcon: {
    width: 32,
    marginRight: 6,
    alignItems: 'center',
  },
  callMicrophoneSettingGlyph: {
    color: '#111827',
    fontFamily: FONT_FAMILY,
    fontSize: 18,
  },
  callStatusSheet: {
    minHeight: 330,
    paddingHorizontal: 8,
    borderTopLeftRadius: 15,
    borderTopRightRadius: 15,
    backgroundColor: '#FFFFFF',
  },
  callStatusRow: {
    height: 56,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  callStatusLabel: {
    flex: 1,
    color: '#111827',
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: '500',
  },
  callStatusValue: {
    paddingHorizontal: 7,
    paddingVertical: 5,
    borderRadius: 3,
    backgroundColor: '#F3F4F6',
  },
  callStatusValuePositive: { backgroundColor: '#E9FBF4' },
  callStatusValueText: {
    color: '#526176',
    fontFamily: FONT_FAMILY,
    fontSize: 9,
    fontWeight: '500',
  },
  callStatusValueTextPositive: { color: '#087A52' },
  callStatusHandle: {
    width: 76,
    height: 4,
    marginTop: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
  },
  callPeopleScreen: { flex: 1, backgroundColor: '#FFFFFF' },
  callPeopleCallBar: {
    height: 59,
    paddingHorizontal: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EEF0F4',
    flexDirection: 'row',
    alignItems: 'center',
  },
  callPeopleBack: {
    width: 30,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  callPeopleBackText: {
    color: '#344256',
    fontFamily: FONT_FAMILY,
    fontSize: 23,
    lineHeight: 25,
  },
  callPeopleCallCopy: { flex: 1, minWidth: 0, paddingLeft: 2 },
  callPeopleCallName: {
    color: '#111827',
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: '600',
  },
  callPeopleCallTimer: {
    marginTop: 2,
    color: '#64748B',
    fontFamily: FONT_FAMILY,
    fontSize: 8,
  },
  callPeopleControl: {
    width: 37,
    height: 37,
    marginLeft: 6,
    borderRadius: 6,
    backgroundColor: '#F3ECFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  callPeopleControlActive: { backgroundColor: '#E9D9FF' },
  callPeopleEnd: {
    width: 37,
    height: 37,
    marginLeft: 6,
    borderRadius: 6,
    backgroundColor: '#E3292F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  callPeopleTitle: {
    height: 51,
    paddingHorizontal: 15,
    paddingTop: 18,
    color: '#111827',
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    fontWeight: '700',
  },
  callPeopleSearch: {
    height: 39,
    marginHorizontal: 15,
    marginBottom: 10,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#E6EAF0',
    borderRadius: 6,
    backgroundColor: '#FAFAFB',
    flexDirection: 'row',
    alignItems: 'center',
  },
  callPeopleSearchGlyph: { width: 24, color: '#66758C', fontSize: 17 },
  callPeopleSearchInput: {
    flex: 1,
    height: 38,
    paddingVertical: 0,
    color: '#172033',
    fontFamily: FONT_FAMILY,
    fontSize: 10,
  },
  callPeopleGridGlyph: {
    width: 22,
    color: '#111827',
    fontSize: 16,
    textAlign: 'right',
  },
  callPeopleLoading: { marginTop: 80 },
  callPeopleList: { paddingBottom: 12 },
  callPeopleSection: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 7,
    color: '#64748B',
    fontFamily: FONT_FAMILY,
    fontSize: 9,
    fontWeight: '500',
  },
  callPeopleRow: {
    height: 61,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  callPeopleRadio: {
    width: 17,
    height: 17,
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#8694A8',
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  callPeopleRadioUnavailable: {
    borderColor: '#D5DCE5',
    backgroundColor: '#F6F8FA',
  },
  callPeopleRadioSelected: { borderColor: '#8B5CF6' },
  callPeopleRadioDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#8B5CF6',
  },
  callPeopleProfile: {
    flex: 1,
    minWidth: 0,
    height: '100%',
    flexDirection: 'row',
    alignItems: 'center',
  },
  callPeopleAvatar: { width: 39, height: 39, borderRadius: 6 },
  callPeopleAvatarFallback: {
    backgroundColor: '#F0E7FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  callPeopleAvatarText: {
    color: '#7137DD',
    fontFamily: FONT_FAMILY,
    fontSize: 10,
    fontWeight: '700',
  },
  callPeopleCopy: { flex: 1, minWidth: 0, marginLeft: 10 },
  callPeopleName: {
    color: '#111827',
    fontFamily: FONT_FAMILY,
    fontSize: 10,
    fontWeight: '600',
  },
  callPeopleSubtitle: {
    marginTop: 4,
    color: '#66758C',
    fontFamily: FONT_FAMILY,
    fontSize: 8,
  },
  callPeopleEmpty: {
    marginTop: 70,
    paddingHorizontal: 30,
    color: '#758196',
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    textAlign: 'center',
  },
  callPeopleAdd: {
    height: 44,
    marginHorizontal: 15,
    borderRadius: 5,
    backgroundColor: '#8B5CF6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  callPeopleAddDisabled: { backgroundColor: '#E2E8F0' },
  callPeopleAddText: {
    color: '#FFFFFF',
    fontFamily: FONT_FAMILY,
    fontSize: 10,
    fontWeight: '600',
  },
  callContactScreen: { flex: 1, backgroundColor: '#FFFFFF' },
  callContactLoading: { marginTop: 100 },
  callContactContent: { paddingBottom: 28, alignItems: 'center' },
  callContactAvatarWrap: {
    position: 'relative',
    width: 85,
    height: 85,
    marginTop: 43,
  },
  callContactAvatar: { width: 85, height: 85, borderRadius: 13 },
  callContactAvatarText: {
    color: '#7137DD',
    fontFamily: FONT_FAMILY,
    fontSize: 24,
    fontWeight: '700',
  },
  callContactOnline: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 14,
    height: 14,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    borderRadius: 7,
    backgroundColor: '#19B875',
  },
  callContactName: {
    marginTop: 11,
    color: '#111827',
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    fontWeight: '700',
  },
  callContactAbout: {
    marginTop: 5,
    paddingHorizontal: 30,
    color: '#66758C',
    fontFamily: FONT_FAMILY,
    fontSize: 9,
    lineHeight: 13,
    textAlign: 'center',
  },
  callContactPhone: {
    marginTop: 7,
    color: '#64748B',
    fontFamily: FONT_FAMILY,
    fontSize: 10,
  },
  callContactActions: {
    width: '100%',
    marginTop: 26,
    paddingHorizontal: 62,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  callContactAction: { width: 72, alignItems: 'center' },
  callContactActionIcon: {
    width: 44,
    height: 44,
    borderRadius: 7,
    backgroundColor: '#FAFAFA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  callContactActionLabel: {
    marginTop: 8,
    color: '#111827',
    fontFamily: FONT_FAMILY,
    fontSize: 9,
    fontWeight: '600',
  },
  callContactSearchIcon: { color: '#111827', fontSize: 22 },
  callContactDivider: {
    width: '100%',
    height: StyleSheet.hairlineWidth,
    marginTop: 27,
    backgroundColor: '#E8ECF2',
  },
  callContactMediaHeader: {
    width: '100%',
    height: 61,
    paddingHorizontal: 15,
    flexDirection: 'row',
    alignItems: 'center',
  },
  callContactMediaTitle: {
    flex: 1,
    color: '#111827',
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: '600',
  },
  callContactMediaCount: { color: '#7C3AED', fontSize: 9 },
  callContactViewAll: {
    color: '#6D28D9',
    fontFamily: FONT_FAMILY,
    fontSize: 9,
    textDecorationLine: 'underline',
  },
  callContactMediaRow: {
    width: '100%',
    minHeight: 75,
    paddingHorizontal: 15,
    flexDirection: 'row',
    gap: 5,
  },
  callContactMediaTile: {
    flex: 1,
    height: 72,
    overflow: 'hidden',
    borderRadius: 5,
    backgroundColor: '#EEF1F5',
  },
  callContactMediaImage: { width: '100%', height: '100%' },
  callContactMediaFallback: {
    backgroundColor: '#344155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  callContactMediaFallbackText: { color: '#FFFFFF', fontSize: 16 },
  callFailedBackdrop: {
    flex: 1,
    paddingHorizontal: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  callFailedShade: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(17,24,39,.42)',
  },
  callFailedCard: {
    width: '100%',
    maxWidth: 330,
    minHeight: 254,
    paddingHorizontal: 25,
    paddingTop: 22,
    paddingBottom: 11,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 10,
  },
  callFailedIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFF0F1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  callFailedTitle: {
    marginTop: 15,
    color: '#172033',
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  callFailedCopy: {
    marginTop: 11,
    color: '#738096',
    fontFamily: FONT_FAMILY,
    fontSize: 9,
    lineHeight: 14,
    textAlign: 'center',
  },
  callFailedAction: {
    width: '100%',
    height: 42,
    marginTop: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  callFailedActionText: {
    color: '#EF2A2D',
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: '600',
  },
  callFailedCancel: {
    width: '100%',
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  callFailedCancelText: {
    color: '#111827',
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: '500',
  },
  attachmentIconActive: { backgroundColor: '#F1EBFE' },
  compactComposerIcon: {
    width: 36,
    height: 36,
    marginLeft: 2,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composerIconActive: { backgroundColor: '#F1EBFE' },
  roundActionButton: {
    width: 50,
    height: 50,
    marginLeft: 8,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#8B27E9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundActionButtonDisabled: { opacity: 0.62 },
  locationCard: {
    width: 220,
    height: 166,
    overflow: 'hidden',
    borderRadius: 9,
    backgroundColor: '#DFF5E8',
  },
  mapCanvas: { flex: 1, overflow: 'hidden', backgroundColor: '#DDF5E5' },
  mapWater: {
    position: 'absolute',
    left: 120,
    top: -24,
    width: 52,
    height: 220,
    borderRadius: 28,
    backgroundColor: '#B9E9F5',
    transform: [{ rotate: '17deg' }],
  },
  mapRoad: {
    position: 'absolute',
    height: 8,
    borderRadius: 5,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#B8A7DD',
  },
  mapRoadOne: {
    left: -25,
    top: 42,
    width: 275,
    transform: [{ rotate: '9deg' }],
  },
  mapRoadTwo: {
    left: 18,
    top: 104,
    width: 230,
    transform: [{ rotate: '-16deg' }],
  },
  mapRoadThree: {
    left: -30,
    top: 132,
    width: 145,
    transform: [{ rotate: '25deg' }],
  },
  mapMarker: {
    position: 'absolute',
    left: 101,
    top: 69,
    width: 23,
    height: 30,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    borderBottomLeftRadius: 14,
    backgroundColor: '#D94B3D',
    transform: [{ rotate: '45deg' }],
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapMarkerDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#8E2E27',
    transform: [{ rotate: '-45deg' }],
  },
  mapLabel: {
    position: 'absolute',
    left: 128,
    top: 76,
    maxWidth: 84,
    color: '#C9433C',
    fontSize: 9,
    fontWeight: '600',
  },
  hiddenComposer: { display: 'none' },
  callRemoteScreen: {
    alignSelf: 'stretch',
    height: 300,
    marginTop: 18,
    marginHorizontal: 4,
    overflow: 'hidden',
    borderRadius: 12,
    backgroundColor: '#0F172A',
  },
  callRemoteScreenLabel: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 10,
    alignItems: 'center',
  },
  callRemoteScreenText: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    overflow: 'hidden',
    color: '#FFFFFF',
    backgroundColor: 'rgba(15,23,42,.62)',
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: '600',
  },
  callSharingBanner: {
    marginHorizontal: 16,
    marginBottom: 12,
    minHeight: 44,
    paddingLeft: 14,
    paddingRight: 6,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 6,
  },
  callSharingText: {
    flex: 1,
    color: '#1E293B',
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: '600',
  },
  callSharingStop: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: '#FFF1F2',
  },
  callSharingStopText: {
    color: '#E52228',
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: '700',
  },
  mediaDownloadPlaceholder: {
    overflow: 'hidden',
    backgroundColor: '#CBD3DF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaDownloadPill: {
    minHeight: 38,
    paddingHorizontal: 14,
    borderRadius: 19,
    backgroundColor: 'rgba(15,23,42,.62)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  mediaDownloadSize: {
    color: '#FFFFFF',
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: '600',
  },
  mediaDownloadRetry: {
    color: '#FFFFFF',
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: '700',
  },
  voiceMessagePlayer: {
    width: 272,
    maxWidth: '100%',
    minWidth: 210,
    height: 68,
    paddingHorizontal: 12,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  ownAudioPlayer: { backgroundColor: '#8723EA' },
  ownWaveBar: { backgroundColor: 'rgba(255,255,255,.34)' },
  ownWaveBarPlayed: { backgroundColor: '#FFFFFF' },
  waveKnob: {
    position: 'absolute',
    top: '50%',
    width: WAVE_KNOB_SIZE,
    height: WAVE_KNOB_SIZE,
    marginTop: -WAVE_KNOB_SIZE / 2,
    borderRadius: 6,
    backgroundColor: '#8B5CF6',
  },
  ownWaveKnob: { backgroundColor: '#5B21B6' },
  ownAudioDuration: { color: '#FFFFFF' },
  ownSpeedButton: { backgroundColor: '#FFFFFF' },
  ownSpeedText: { color: '#6F28F5' },
  voicePanel: {
    marginHorizontal: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    shadowColor: '#8A96A8',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 2,
  },
  liveVoicePreview: { height: 68, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#F6F2FC', gap: 8, flexDirection: 'row', alignItems: 'center' },
  liveWaveform: {
    flex: 1,
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  liveWaveBar: { width: 3, borderRadius: 2, backgroundColor: '#9B62ED' },
  liveDuration: {
    width: 42,
    color: '#111827',
    textAlign: 'right',
    fontSize: 12,
    fontWeight: '700',
  },
  voiceActions: {
    height: 43,
    marginTop: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  voiceDeleteButton: {
    width: 43,
    height: 43,
    borderRadius: 7,
    backgroundColor: '#FFF1F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceCenterButton: {
    flex: 1,
    height: 43,
    borderRadius: 7,
    backgroundColor: '#F4F4F5',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  voiceCenterText: {
    color: '#111827',
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: '600',
  },
  voiceSendButton: {
    width: 43,
    height: 43,
    borderRadius: 7,
    backgroundColor: '#8B27E9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceHoldRow: {
    position: 'relative',
    zIndex: 5,
    minHeight: 56,
    marginHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  voiceHoldComposer: {
    flex: 1,
    height: 44,
    paddingLeft: 13,
    paddingRight: 8,
    borderWidth: 1,
    borderColor: '#E1E6ED',
    borderRadius: 7,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
  },
  voiceHoldDuration: {
    marginLeft: 5,
    color: '#111827',
    fontSize: 12,
    fontWeight: '700',
  },
  voiceHoldWaveform: {
    width: 54,
    height: 30,
    marginLeft: 8,
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  voiceHoldWaveBar: {
    width: 3,
    borderRadius: 2,
    backgroundColor: '#8B27E9',
  },
  voiceCancelChevron: { marginLeft: 'auto', color: '#7D8796', fontSize: 14 },
  voiceCancelText: {
    marginLeft: 8,
    color: '#526176',
    fontSize: 10,
    fontWeight: '500',
  },
  voiceHoldButton: {
    width: 54,
    height: 54,
    marginLeft: 7,
    marginRight: 2,
    borderRadius: 8,
    backgroundColor: '#8B27E9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceLockHint: {
    position: 'absolute',
    zIndex: 6,
    right: 4,
    bottom: 26,
    width: 39,
    height: 64,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EEF0F4',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#8A96A8',
    shadowOpacity: 0.13,
    shadowRadius: 7,
    elevation: 3,
  },
  voiceLockArrow: {
    marginTop: 6,
    color: '#526176',
    fontSize: 12,
    fontWeight: '700',
  },
  recordPreview: { height: 68, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center' },
  previewPlayButton: {
    width: 28,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordWaveform: {
    position: 'relative',
    flex: 1,
    height: 36,
    paddingHorizontal: RECORD_WAVE_KNOB_SIZE / 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  recordWaveBar: { width: 3, borderRadius: 2, backgroundColor: '#DFE7F1' },
  recordWaveBarPlayed: { backgroundColor: '#9B62ED' },
  recordWaveKnob: {
    position: 'absolute',
    top: '50%',
    marginTop: -RECORD_WAVE_KNOB_SIZE / 2,
    width: RECORD_WAVE_KNOB_SIZE,
    height: RECORD_WAVE_KNOB_SIZE,
    borderRadius: 7,
    backgroundColor: '#8B5CF6',
  },
  recordPreviewDuration: {
    width: 42,
    color: '#111827',
    textAlign: 'right',
    fontSize: 12,
    fontWeight: '700',
  },
  recordSpeedButton: {
    width: 52,
    height: 38,
    marginLeft: 8,
    borderRadius: 6,
    backgroundColor: '#F2ECFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordSpeedText: { color: '#7137DD', fontSize: 10, fontWeight: '600' },
  replyComposer: {
    marginHorizontal: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#8B27E9',
    borderTopLeftRadius: 7,
    borderTopRightRadius: 7,
    backgroundColor: '#F7F1FF',
    flexDirection: 'row',
    alignItems: 'center',
  },
  replyComposerCopy: { flex: 1, minWidth: 0 },
  replyComposerTitle: { color: '#7137DD', fontSize: 10, fontWeight: '700' },
  replyComposerText: { marginTop: 2, color: '#526176', fontSize: 10 },
  replyComposerClose: { paddingLeft: 12, color: '#526176', fontSize: 22 },
  unreadBoundary: {
    height: 28,
    marginVertical: 5,
    flexDirection: 'row',
    alignItems: 'center',
  },
  unreadBoundaryLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#D8DEE8',
  },
  unreadBoundaryText: {
    marginHorizontal: 10,
    color: '#526176',
    fontSize: 9,
    fontWeight: '500',
  },
  systemMessageRow: {
    minHeight: 32,
    marginVertical: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  systemMessageLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E4E7EC',
  },
  systemMessageText: {
    maxWidth: '76%',
    marginHorizontal: 10,
    color: '#42516A',
    fontFamily: FONT_FAMILY,
    fontSize: 10,
    lineHeight: 14,
    textAlign: 'center',
  },
  timerNoticeCard: {
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 7,
    paddingHorizontal: 13,
    paddingTop: 11,
    paddingBottom: 10,
    borderWidth: 1,
    borderColor: '#EAECF0',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    shadowColor: '#101828',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 5,
    elevation: 1,
  },
  timerNoticeHeader: { flexDirection: 'row', alignItems: 'flex-start' },
  timerNoticeIcon: { width: 23, paddingTop: 1, alignItems: 'flex-start' },
  timerNoticeCopy: { flex: 1, minWidth: 0 },
  timerNoticeTitle: {
    color: '#344054',
    fontFamily: FONT_FAMILY,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
  },
  timerNoticeBody: {
    marginTop: 2,
    color: '#64748B',
    fontFamily: FONT_FAMILY,
    fontSize: 9,
    lineHeight: 13,
  },
  timerNoticeButton: {
    height: 33,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#D7C5FA',
    borderRadius: 4,
    backgroundColor: '#F0E7FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerNoticeButtonText: {
    color: '#6F28F5',
    fontFamily: FONT_FAMILY,
    fontSize: 9,
    fontWeight: '700',
  },
  destructiveLabel: { color: '#DC2626' },
  cancelMenuItem: {
    height: 48,
    marginTop: 8,
    borderRadius: 11,
    backgroundColor: '#F5F5F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelMenuLabel: { color: '#7137DD', fontSize: 13, fontWeight: '700' },
  sheetHandle: {
    width: 38,
    height: 4,
    marginTop: -8,
    marginBottom: 9,
    borderRadius: 3,
    backgroundColor: '#D7DEE8',
    alignSelf: 'center',
  },
  reactionRow: {
    height: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  reactionChoice: {
    width: 35,
    height: 35,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactionChoiceSelected: { backgroundColor: '#EDE1FF' },
  reactionChoiceText: { fontSize: 23 },
  moreReaction: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F3F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreReactionText: { color: '#344256', fontSize: 23, lineHeight: 25 },
  moreReactionGrid: {
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#EEF0F4',
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  moreReactionChoice: {
    width: '16.66%',
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionMenuItem: {
    height: 51,
    paddingHorizontal: 4,
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionMenuItemSelected: { backgroundColor: '#F0E7FF' },
  actionMenuLabelSelected: { color: '#6D28D9', fontWeight: '600' },
  swipeReplyContainer: { position: 'relative', width: '100%' },
  selectionTapTarget: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 10,
  },
  swipeReplyIndicator: {
    position: 'absolute',
    left: 2,
    top: '50%',
    width: 40,
    height: 40,
    marginTop: -20,
    borderRadius: 9,
    backgroundColor: '#F0E7FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  otherReplyPreview: { backgroundColor: '#F4EDFF' },
  replyPreviewSender: {
    marginBottom: 2,
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
  },
  otherReplyPreviewSender: { color: '#7137DD' },
  otherReplyPreviewText: { color: '#526176' },
  replyTargetHighlighted: {
    borderWidth: 2,
    borderColor: '#B56CFF',
    shadowColor: '#8B27E9',
    shadowOpacity: 0.3,
    shadowRadius: 7,
    elevation: 4,
  },
  actionDividerTop: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#EEF0F4',
  },
  actionGlyph: {
    width: 44,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactionBadge: {
    marginTop: -4,
    marginLeft: 9,
    minWidth: 29,
    height: 22,
    paddingHorizontal: 6,
    borderWidth: 2,
    borderColor: '#FBFAFE',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  reactionBadgeOwn: { marginLeft: 0, marginRight: 9, alignSelf: 'flex-end' },
  reactionBadgeText: { fontSize: 13 },
  selectedBubble: {},
  selectedMessageLine: {
    position: 'relative',
    marginHorizontal: -12,
    marginVertical: -5,
    paddingLeft: 56,
    paddingRight: 12,
    paddingVertical: 10,
    overflow: 'hidden',
  },
  messageSelectionIndicator: {
    position: 'absolute',
    left: 8,
    width: 24,
    height: 24,
    zIndex: 5,
  },
  // The avatar is inset 5px from the overlay edge (10px row padding minus
  // 5px negative margin). Offset the 24px circle by 2px to center it on the
  // 18px avatar, at the top for sent messages and bottom for received ones.
  sentMessageSelectionIndicator: { top: 2 },
  receivedMessageSelectionIndicator: { bottom: 2 },
  selectionBar: {
    paddingHorizontal: 8,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E7EAF0',
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectionBackButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectionCount: {
    flex: 1,
    color: '#182033',
    fontSize: 16,
    fontWeight: '600',
  },
  selectionActions: {
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  selectionAction: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionSheetSurface: { width: '100%' },
  selectedMessageSpotlight: {
    width: '100%',
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  deleteDialogBackdrop: {
    flex: 1,
    paddingHorizontal: 28,
    backgroundColor: 'rgba(15,23,42,.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteDialog: {
    width: '100%',
    maxWidth: 330,
    paddingTop: 24,
    paddingHorizontal: 22,
    paddingBottom: 12,
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    shadowColor: '#111827',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 8,
  },
  deleteDialogIcon: {
    width: 46,
    height: 46,
    marginBottom: 14,
    borderRadius: 23,
    backgroundColor: '#FFF0F1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteDialogTitle: {
    color: '#172033',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  deleteDialogCopy: {
    marginTop: 9,
    color: '#758196',
    fontSize: 10,
    lineHeight: 15,
    textAlign: 'center',
  },
  deleteForEveryoneButton: {
    width: '100%',
    height: 43,
    marginTop: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteForMeButton: {
    width: '100%',
    height: 48,
    marginTop: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteForMeButtonAfterEveryone: { marginTop: 0 },
  deleteForMeText: { color: '#EF4444', fontSize: 12, fontWeight: '600' },
  deleteCancelButton: {
    width: '100%',
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteCancelText: { color: '#172033', fontSize: 12, fontWeight: '600' },
  deletedSnackbar: {
    marginHorizontal: 16,
    marginBottom: 6,
    minHeight: 30,
    paddingLeft: 6,
    paddingRight: 10,
    borderWidth: 1,
    borderColor: '#DDE3EB',
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 4,
  },
  deletedSnackbarIcon: {
    width: 24,
    height: 24,
    marginRight: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deletedSnackbarText: {
    flex: 1,
    color: '#344054',
    fontFamily: FONT_FAMILY,
    fontSize: 9,
  },
  deletedSnackbarUndo: {
    width: 43,
    height: 28,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  deletedMessageNotice: {
    minWidth: 170,
    minHeight: 38,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#E6EAF0',
    borderRadius: 7,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
  },
  ownDeletedMessageNotice: {
    borderColor: '#8B27E9',
    backgroundColor: '#8B27E9',
  },
  deletedMessageIcon: {
    width: 27,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  deletedMessageText: { color: '#263448', fontSize: 10, fontWeight: '600' },
  ownDeletedMessageText: { color: '#FFFFFF' },
  groupSenderLine: {
    marginBottom: 3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  groupSenderLineOwn: { alignSelf: 'flex-end' },
  groupSenderName: { color: '#4F46E5', fontSize: 9, fontWeight: '700' },
  groupSenderNameOwn: { color: '#7C3AED' },
  groupSenderRole: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 5,
    backgroundColor: '#EEE7FF',
    color: '#6D28D9',
    fontSize: 7,
    fontWeight: '700',
  },
  groupSearchBar: {
    height: 48,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E7EAF0',
    backgroundColor: '#FFF',
    flexDirection: 'row',
    alignItems: 'center',
  },
  groupSearchInput: {
    flex: 1,
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#F4F5F7',
    color: '#172033',
    fontSize: 12,
  },
  groupSearchClose: {
    width: 36,
    color: '#4B5563',
    fontSize: 24,
    textAlign: 'center',
  },
  groupMenuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,.46)',
    justifyContent: 'flex-end',
  },
  groupMenuSheet: {
    paddingTop: 26,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    backgroundColor: '#FFF',
  },
  groupMenuHandle: {
    position: 'absolute',
    top: 7,
    alignSelf: 'center',
    width: 50,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#D7DCE5',
  },
  groupMenuClose: {
    position: 'absolute',
    right: 14,
    top: 10,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupMenuCloseText: { color: '#42516A', fontSize: 22 },
  groupMenuRow: {
    height: 57,
    paddingHorizontal: 24,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EEF0F4',
    flexDirection: 'row',
    alignItems: 'center',
  },
  groupMenuIcon: {
    width: 40,
    height: 40,
    marginRight: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupMenuLabel: {
    color: '#172033',
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: '500',
  },
  groupMoreSheet: {
    paddingTop: 8,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    backgroundColor: '#FFF',
  },
  groupMoreHeader: {
    height: 44,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  groupMoreHeaderButton: {
    width: 38,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupMoreBack: { color: '#172033', fontSize: 25, lineHeight: 28 },
  groupMoreRow: {
    height: 61,
    paddingHorizontal: 24,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EEF0F4',
    flexDirection: 'row',
    alignItems: 'center',
  },
  groupMoreIcon: {
    width: 40,
    height: 40,
    marginRight: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupMoreLabel: {
    color: '#111827',
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: '500',
  },
  groupMoreDanger: { color: '#EF2929' },
  pinnedBannerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,.48)',
    justifyContent: 'flex-end',
  },
  pinnedBannerSheet: {
    paddingTop: 9,
    borderTopLeftRadius: 13,
    borderTopRightRadius: 13,
    backgroundColor: '#FFF',
  },
  pinnedBannerHandle: {
    width: 41,
    height: 4,
    marginBottom: 7,
    borderRadius: 2,
    backgroundColor: '#D5DAE2',
    alignSelf: 'center',
  },
  pinnedBannerActionRow: {
    height: 58,
    paddingHorizontal: 17,
    flexDirection: 'row',
    alignItems: 'center',
  },
  pinnedBannerActionIcon: {
    width: 42,
    marginRight: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinnedBannerActionText: {
    flex: 1,
    color: '#111827',
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    fontWeight: '500',
  },
});
