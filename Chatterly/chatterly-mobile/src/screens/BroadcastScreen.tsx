import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Svg, {Circle, Path, Rect} from 'react-native-svg';
import {BlurView} from 'expo-blur';
import * as Contacts from 'expo-contacts';
import * as DocumentPicker from 'expo-document-picker';
import * as Location from 'expo-location';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import {File, Paths} from 'expo-file-system';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {SearchIcon} from '../components/ContactsIcons';
import {CompactMicrophoneIcon, EmojiIcon, PaperclipIcon, SendIcon, SingleCheckIcon} from '../components/ChatIcons';
import {BroadcastMenuRowSvg} from '../components/BroadcastMenuRowSvgs';
import {PatternBackground} from '../components/PatternBackground';
import {Snackbar} from '../components/Snackbar';
import {EmojiPicker} from '../components/EmojiPicker';
import {MediaAttachmentFlow} from '../components/MediaAttachmentFlow';
import {isAudioUpload, normalizePickedDocument, SUPPORTED_PICKER_MIME_TYPES} from '../components/DocumentAttachmentScreen';
import {
  addBroadcastMember,
  deleteBroadcast,
  getBroadcastDetails,
  getBroadcastMessages,
  removeBroadcastMember,
  saveBroadcastMessage,
  sendBroadcastMessage,
  type BroadcastList,
  type BroadcastParticipant,
  type StoredBroadcastMessage,
} from '../services/broadcastApi';
import {locationMessage, searchChatContacts, sendChatFile, sendChatMedia, type SearchContact} from '../services/chatApi';
import {openDownloadedDocument} from '../services/documentViewer';
import {compressChatMedia} from '../services/mediaCompression';
import {createThemedStyles, themeInk} from '../theme/themedStyles';
import type {AttachmentMedia, MediaTransferState} from '../types/media';
import {createVCard, vCardFileName} from '../utils/vcard';

type Props = {
  broadcast: BroadcastList;
  onBack: () => void;
  onUpdated?: (broadcast: BroadcastList) => void;
};

type SentBroadcast = Omit<StoredBroadcastMessage, 'createdAt'> & {createdAt: Date};
type ShareableContact = {id: string; name: string; phoneNumbers: string[]; emailAddresses: string[]};
type DetailPage = 'info' | 'media' | 'search' | null;
type MenuAction = 'members' | 'info' | 'media' | 'search' | 'delete';

const FONT = Platform.select({android: 'sans-serif', ios: 'System'});
const PURPLE = '#8750F4';
const BROADCAST_VOICE_OPTIONS = {
  ...RecordingPresets.LOW_QUALITY,
  isMeteringEnabled: true,
  android: {
    ...RecordingPresets.LOW_QUALITY.android,
    extension: '.aac',
    outputFormat: 'aac_adts' as const,
    audioEncoder: 'aac' as const,
  },
  ios: {
    ...RecordingPresets.LOW_QUALITY.ios,
    extension: '.wav',
    outputFormat: 'lpcm',
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
};
const BROADCAST_VOICE_AUDIO_MODE = {
  allowsRecording: true,
  allowsBackgroundRecording: false,
  playsInSilentMode: true,
  shouldPlayInBackground: false,
  shouldRouteThroughEarpiece: false,
};
const BROADCAST_IDLE_AUDIO_MODE = {...BROADCAST_VOICE_AUDIO_MODE, allowsRecording: false};
const BROADCAST_VOICE_WAVEFORM = [6, 12, 8, 19, 11, 24, 15, 29, 18, 23, 12, 26, 16, 21, 9, 17];

const formatRecordingTime = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

function BackIcon() {
  return <Svg width={18} height={18} viewBox="0 0 24 24" fill="none"><Path d="m15 5-7 7 7 7" stroke={themeInk('#0D1422')} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" /></Svg>;
}

function MoreIcon() {
  return <Svg width={20} height={22} viewBox="0 0 20 24"><Circle cx={10} cy={5} r={1.25} fill={themeInk('#152033')}/><Circle cx={10} cy={12} r={1.25} fill={themeInk('#152033')}/><Circle cx={10} cy={19} r={1.25} fill={themeInk('#152033')}/></Svg>;
}

function CloseIcon() {
  return <Svg width={18} height={18} viewBox="0 0 24 24" fill="none"><Path d="m6 6 12 12M18 6 6 18" stroke={themeInk('#111827')} strokeWidth={1.5} strokeLinecap="round"/></Svg>;
}

function PrivacyIcon() {
  return <View style={styles.privacyIcon}><Svg width={16} height={16} viewBox="0 0 24 24" fill="none"><Rect x={7} y={10} width={10} height={9} rx={2} stroke={themeInk('#61708A')} strokeWidth={1.4}/><Path d="M9 10V8a3 3 0 0 1 6 0v2M12 14v2" stroke={themeInk('#61708A')} strokeWidth={1.4} strokeLinecap="round"/></Svg></View>;
}

function DeleteBroadcastIcon() {
  return <Svg width={40} height={40} viewBox="0 0 40 40" fill="none">
    <Path d="M12 15H28M18 19V25M22 19V25M13 15L14 27C14 27.5304 14.2107 28.0391 14.5858 28.4142C14.9609 28.7893 15.4696 29 16 29H24C24.5304 29 25.0391 28.7893 25.4142 28.4142C25.7893 28.0391 26 27.5304 26 27L27 15M17 15V12C17 11.7348 17.1054 11.4804 17.2929 11.2929C17.4804 11.1054 17.7348 11 18 11H22C22.2652 11 22.5196 11.1054 22.7071 11.2929C22.8946 11.4804 23 11.7348 23 12V15" stroke={themeInk('#DC2626')} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/>
  </Svg>;
}

function MenuIcon({action}: {action: MenuAction}) {
  const color = action === 'delete' ? '#EF3333' : '#152033';
  if (action === 'members') return <Svg width={20} height={20} viewBox="0 0 24 24" fill="none"><Circle cx={9} cy={8} r={2.6} stroke={color} strokeWidth={1.35}/><Path d="M4 19c.4-3.5 2-5.2 5-5.2 1.5 0 2.7.43 3.55 1.3M18 12v7M14.5 15.5h7" stroke={color} strokeWidth={1.35} strokeLinecap="round"/></Svg>;
  if (action === 'info') return <Svg width={20} height={20} viewBox="0 0 24 24" fill="none"><Circle cx={12} cy={12} r={7} stroke={color} strokeWidth={1.4}/><Path d="M12 10.5v5M12 7.7v.1" stroke={color} strokeWidth={1.6} strokeLinecap="round"/></Svg>;
  if (action === 'media') return <Svg width={20} height={20} viewBox="0 0 24 24" fill="none"><Rect x={4.5} y={5} width={15} height={14} rx={2} stroke={color} strokeWidth={1.4}/><Circle cx={9} cy={9.5} r={1.4} stroke={color} strokeWidth={1.3}/><Path d="m6 17 4-4 2.8 2.8 2-2 3.2 3.2" stroke={color} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round"/></Svg>;
  if (action === 'search') return <Svg width={20} height={20} viewBox="0 0 24 24" fill="none"><Circle cx={10.5} cy={10.5} r={5.7} stroke={color} strokeWidth={1.5}/><Path d="m15 15 4.2 4.2" stroke={color} strokeWidth={1.5} strokeLinecap="round"/></Svg>;
  return <DeleteBroadcastIcon/>;
}

function BroadcastAvatar({member, size = 38, square = false}: {member: BroadcastParticipant; size?: number; square?: boolean}) {
  const initials = member.name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || '?';
  const radius = square ? 6 : size / 2;
  return member.profilePic
    ? <Image source={{uri: member.profilePic}} style={{width: size, height: size, borderRadius: radius}}/>
    : <View style={[styles.avatarFallback, {width: size, height: size, borderRadius: radius}]}><Text style={styles.avatarInitial}>{initials}</Text></View>;
}

function HeaderAvatar({broadcast}: {broadcast: BroadcastList}) {
  if (broadcast.imageUri) return <View style={styles.headerAvatar}><Image accessibilityLabel={`${broadcast.name} broadcast picture`} source={{uri: broadcast.imageUri}} style={styles.broadcastHeaderImage}/><View style={styles.onlineBadge}><Text style={styles.onlineCheck}>✓</Text></View></View>;
  return <View style={styles.headerAvatar}><Svg accessibilityLabel="Default broadcast icon" accessibilityRole="image" width={38} height={38} viewBox="0 0 40 40" fill="none">
    <Rect width={40} height={40} rx={6} fill={themeInk('#FAFAFA')}/>
    <Path d="M26.5 15.998C27.3288 15.998 28.1237 16.3141 28.7097 16.8767C29.2958 17.4393 29.625 18.2023 29.625 18.998C29.625 19.7936 29.2958 20.5567 28.7097 21.1193C28.1237 21.6819 27.3288 21.998 26.5 21.998M18.1667 15.998V26.998C18.1667 27.2632 18.0569 27.5176 17.8616 27.7051C17.6662 27.8926 17.4013 27.998 17.125 27.998H16.0833C15.8071 27.998 15.5421 27.8926 15.3468 27.7051C15.1514 27.5176 15.0417 27.2632 15.0417 26.998V21.998M20.25 15.998L24.9625 12.228C25.0994 12.1185 25.266 12.0487 25.4428 12.0269C25.6195 12.0051 25.7991 12.032 25.9605 12.1046C26.1218 12.1773 26.2583 12.2925 26.3538 12.4369C26.4494 12.5814 26.5001 12.7489 26.5 12.92V25.076C26.5001 25.2471 26.4494 25.4146 26.3538 25.559C26.2583 25.7035 26.1218 25.8187 25.9605 25.8913C25.7991 25.964 25.6195 25.9909 25.4428 25.9691C25.266 25.9472 25.0994 25.8775 24.9625 25.768L20.25 21.998H11.9167C11.6404 21.998 11.3754 21.8926 11.1801 21.7051C10.9847 21.5176 10.875 21.2632 10.875 20.998V16.998C10.875 16.7328 10.9847 16.4784 11.1801 16.2909C11.3754 16.1034 11.6404 15.998 11.9167 15.998H20.25Z" stroke={themeInk('#0B1220')} strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round"/>
  </Svg><View style={styles.onlineBadge}><Text style={styles.onlineCheck}>✓</Text></View></View>;
}

function BroadcastFilePreview({message, onOpen}: {message: SentBroadcast; onOpen: () => void}) {
  const name = message.fileName || 'Document';
  const extension = name.split('.').pop()?.toUpperCase() || 'FILE';
  const isVCard = extension === 'VCF' || /^(?:text\/vcard|text\/x-vcard)$/i.test(message.fileType || '');
  return <Pressable accessibilityHint={`Opens ${name}`} accessibilityLabel={`${isVCard ? 'VCF contact' : 'Broadcast document'} ${name}`} accessibilityRole="button" onPress={onOpen} style={styles.fileCard}>
    <View style={styles.fileIcon}><Text numberOfLines={1} style={styles.fileIconText}>{isVCard ? 'VCF' : extension.slice(0, 4)}</Text></View>
    <View style={styles.fileCopy}>
      <Text numberOfLines={1} style={styles.fileName}>{name}</Text>
      <Text style={styles.fileType}>{isVCard ? 'VCF contact' : `${extension} document`}</Text>
    </View>
  </Pressable>;
}

async function retainBroadcastFile(uri: string, fileName: string): Promise<string> {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-100) || 'attachment';
  const retained = new File(Paths.document, `broadcast-${Date.now()}-${safeName}`);
  try {
    await new File(uri).copy(retained, {overwrite: true});
    return retained.uri;
  } catch {
    // The picker already copied this into app storage. Keep that usable URI if
    // a device cannot make the longer-lived document-directory copy.
    return uri;
  }
}

function asParticipant(contact: SearchContact): BroadcastParticipant {
  return {_id: contact.userId, name: contact.name, profilePic: contact.thumbnail};
}

export function BroadcastScreen({broadcast: initialBroadcast, onBack, onUpdated}: Props): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<React.ElementRef<typeof ScrollView>>(null);
  const inputRef = useRef<React.ElementRef<typeof TextInput>>(null);
  const recorder = useAudioRecorder(BROADCAST_VOICE_OPTIONS);
  const recorderState = useAudioRecorderState(recorder, 250);
  const recordingActive = useRef(false);
  const recordingStartedAt = useRef(0);
  const [broadcast, setBroadcast] = useState(initialBroadcast);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [recordingVoice, setRecordingVoice] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [draft, setDraft] = useState('');
  const selectionRef = useRef({start: 0, end: 0});
  const [forcedSelection, setForcedSelection] = useState<{start: number; end: number} | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [attachmentOpen, setAttachmentOpen] = useState(false);
  const [contactPickerOpen, setContactPickerOpen] = useState(false);
  const [shareableContacts, setShareableContacts] = useState<ShareableContact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [mediaTransfer, setMediaTransfer] = useState<MediaTransferState>({phase: 'idle', progress: 0, current: 0, total: 0});
  const [sent, setSent] = useState<SentBroadcast[]>([]);
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<BroadcastParticipant[]>([]);
  const [selected, setSelected] = useState<Map<string, BroadcastParticipant>>(new Map());
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [detailPage, setDetailPage] = useState<DetailPage>(null);

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({animated: true}));
  }, []);

  useEffect(() => {
    const event = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const subscription = Keyboard.addListener(event, scrollToEnd);
    return () => subscription.remove();
  }, [scrollToEnd]);

  useEffect(() => {
    if (!recordingVoice) return undefined;
    const update = () => setRecordingSeconds(Math.max(0, Math.floor((Date.now() - recordingStartedAt.current) / 1000)));
    update();
    const timer = setInterval(update, 500);
    return () => clearInterval(timer);
  }, [recordingVoice]);

  useEffect(() => () => {
    if (recordingActive.current) recorder.stop().catch(() => undefined);
    recordingActive.current = false;
    setAudioModeAsync(BROADCAST_IDLE_AUDIO_MODE).catch(() => undefined);
  }, [recorder]);

  useEffect(() => {
    let active = true;
    getBroadcastMessages(initialBroadcast._id).then(messages => {
      if (!active) return;
      const restored = messages.map(message => ({...message, createdAt: new Date(message.createdAt)}));
      setSent(current => {
        const byId = new Map(restored.map(message => [message.id, message]));
        current.forEach(message => byId.set(message.id, message));
        return [...byId.values()].sort((first, second) => first.createdAt.getTime() - second.createdAt.getTime());
      });
    }).catch(() => undefined);
    return () => { active = false; };
  }, [initialBroadcast._id]);

  const refreshDetails = useCallback(async () => {
    setLoading(true);
    try {
      const details = await getBroadcastDetails(broadcast._id);
      setBroadcast(details);
      onUpdated?.(details);
      return details;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to refresh the broadcast.');
      return broadcast;
    } finally {
      setLoading(false);
    }
  }, [broadcast, onUpdated]);

  const openMembers = useCallback(async () => {
    setEditing(true);
    setQuery('');
    setResults([]);
    const details = await refreshDetails();
    setSelected(new Map(details.participants.map(member => [member._id, member])));
  }, [refreshDetails]);

  useEffect(() => {
    if (!editing) {
      setResults([]);
      return;
    }
    if (!query.trim()) return;
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const contacts = await searchChatContacts(query);
        if (active) setResults(current => {
          const byId = new Map(current.map(member => [member._id, member]));
          contacts.map(asParticipant).forEach(member => byId.set(member._id, member));
          return [...byId.values()];
        });
      } catch (error) {
        if (active) setNotice(error instanceof Error ? error.message : 'Unable to search contacts.');
      }
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [editing, query]);

  const memberPool = useMemo(() => {
    const byId = new Map<string, BroadcastParticipant>();
    broadcast.participants.forEach(member => byId.set(member._id, member));
    results.forEach(member => byId.set(member._id, member));
    return [...byId.values()];
  }, [broadcast.participants, results]);
  const candidates = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return memberPool.filter(member => !normalized || member.name.toLowerCase().includes(normalized));
  }, [memberPool, query]);
  const selectedMembers = useMemo(() => memberPool.filter(member => selected.has(member._id)), [memberPool, selected]);
  const memberCount = useMemo(() => new Set(broadcast.participants.map(member => member._id).filter(Boolean)).size, [broadcast.participants]);
  const composerInset = useMemo(() => ({paddingBottom: emojiOpen || attachmentOpen ? 8 : Math.max(insets.bottom, 8)}), [attachmentOpen, emojiOpen, insets.bottom]);

  const storeSentItem = useCallback(async (text: string, recipients: number, file?: Pick<StoredBroadcastMessage, 'fileName' | 'fileType' | 'fileSize' | 'fileUri'>) => {
    const message = {id: `${broadcast._id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, text, createdAt: new Date(), recipients, ...(file || {})};
    setSent(current => [...current, message]);
    await saveBroadcastMessage(broadcast._id, {...message, createdAt: message.createdAt.toISOString()});
    return message;
  }, [broadcast._id]);

  const openSentFile = useCallback(async (message: SentBroadcast) => {
    if (!message.fileUri) {
      setNotice('This attachment was sent before local opening was available. Send it again to open it here.');
      return;
    }
    try {
      await openDownloadedDocument(message.fileUri, message.fileType, message.fileName || 'document');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to open this attachment.');
    }
  }, []);

  const insertEmoji = useCallback((emoji: string) => {
    const start = Math.min(Math.max(selectionRef.current.start, 0), draft.length);
    const end = Math.min(Math.max(selectionRef.current.end, start), draft.length);
    const caret = start + emoji.length;
    setDraft(`${draft.slice(0, start)}${emoji}${draft.slice(end)}`);
    selectionRef.current = {start: caret, end: caret};
    setForcedSelection({start: caret, end: caret});
  }, [draft]);

  const toggleEmojiPicker = useCallback(() => {
    if (emojiOpen) {
      setEmojiOpen(false);
      inputRef.current?.focus();
      return;
    }
    // Release native input focus before replacing the keyboard with the picker.
    // Keep native actions outside state updaters, which React can replay.
    inputRef.current?.blur();
    Keyboard.dismiss();
    setAttachmentOpen(false);
    setEmojiOpen(true);
  }, [emojiOpen]);

  const toggle = useCallback((member: BroadcastParticipant) => {
    setSelected(current => {
      const next = new Map(current);
      next.has(member._id) ? next.delete(member._id) : next.set(member._id, member);
      return next;
    });
  }, []);

  const saveMembers = useCallback(async () => {
    if (saving || selected.size < 2) return;
    setSaving(true);
    const originalIds = new Set(broadcast.participants.map(member => member._id));
    const selectedIds = new Set(selected.keys());
    try {
      for (const userId of selectedIds) if (!originalIds.has(userId)) await addBroadcastMember(broadcast._id, userId);
      for (const userId of originalIds) if (!selectedIds.has(userId)) await removeBroadcastMember(broadcast._id, userId);
      const updated = await getBroadcastDetails(broadcast._id).catch(() => ({...broadcast, participants: [...selected.values()]}));
      setBroadcast(updated);
      onUpdated?.(updated);
      setEditing(false);
      setQuery('');
      setNotice('Broadcast members updated.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to update the broadcast list.');
    } finally {
      setSaving(false);
    }
  }, [broadcast, onUpdated, saving, selected]);

  const removeMember = useCallback(async (member: BroadcastParticipant) => {
    if (removingMemberId) return;
    setRemovingMemberId(member._id);
    try {
      await removeBroadcastMember(broadcast._id, member._id);
      const localUpdate = {
        ...broadcast,
        participants: broadcast.participants.filter(item => item._id !== member._id),
      };
      const updated = await getBroadcastDetails(broadcast._id).catch(() => localUpdate);
      setBroadcast(updated);
      onUpdated?.(updated);
      setNotice(`${member.name} removed from the broadcast.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to remove this member.');
    } finally {
      setRemovingMemberId(null);
    }
  }, [broadcast, onUpdated, removingMemberId]);

  const send = useCallback(async () => {
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    try {
      const result = await sendBroadcastMessage(broadcast._id, content);
      const recipients = result.totalRecipients || memberCount;
      setDraft('');
      selectionRef.current = {start: 0, end: 0};
      await storeSentItem(content, recipients);
      setNotice(`Sent privately to ${recipients} ${recipients === 1 ? 'contact' : 'contacts'}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to send the broadcast.');
    } finally {
      setSending(false);
    }
  }, [broadcast._id, draft, memberCount, sending, storeSentItem]);

  const startVoiceRecording = useCallback(async () => {
    if (sending || recordingActive.current) return;
    Keyboard.dismiss();
    setEmojiOpen(false);
    setAttachmentOpen(false);
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setNotice('Microphone access is required to record a broadcast voice message.');
        return;
      }
      await setAudioModeAsync(BROADCAST_VOICE_AUDIO_MODE);
      const status = recorder.getStatus?.();
      if (!status?.canRecord || (status as {mediaServicesDidReset?: boolean})?.mediaServicesDidReset) {
        await recorder.prepareToRecordAsync(BROADCAST_VOICE_OPTIONS);
      }
      recorder.record();
      recordingActive.current = true;
      recordingStartedAt.current = Date.now();
      setRecordingSeconds(0);
      setRecordingVoice(true);
    } catch (error) {
      recordingActive.current = false;
      await recorder.stop().catch(() => undefined);
      await setAudioModeAsync(BROADCAST_IDLE_AUDIO_MODE).catch(() => undefined);
      setNotice(error instanceof Error ? error.message : 'Unable to start voice recording.');
    }
  }, [recorder, sending]);

  const finishVoiceRecording = useCallback(async () => {
    if (!recordingActive.current || sending) return;
    recordingActive.current = false;
    setRecordingVoice(false);
    setSending(true);
    try {
      const duration = Math.max(1, Math.round((recorder.getStatus?.().durationMillis || recorderState.durationMillis || recordingSeconds * 1000) / 1000));
      await recorder.stop();
      await setAudioModeAsync(BROADCAST_IDLE_AUDIO_MODE);
      const uri = recorder.uri || (recorderState as {url?: string | null}).url;
      if (!uri) throw new Error('The recording could not be saved.');
      const recipients = broadcast.participants.filter(member => member._id);
      if (!recipients.length) throw new Error('This broadcast has no recipients.');
      const extension = Platform.OS === 'ios' ? 'wav' : 'aac';
      const media = {uri, name: `broadcast-voice-${Date.now()}.${extension}`, type: Platform.OS === 'ios' ? 'audio/wav' : 'audio/aac'};
      for (let index = 0; index < recipients.length; index += 1) {
        await sendChatMedia(recipients[index]._id, media, {
          duration,
          waveform: BROADCAST_VOICE_WAVEFORM,
          onUploadProgress: progress => setMediaTransfer({phase: 'uploading', progress: (index + progress) / recipients.length, current: 1, total: 1}),
        });
      }
      await storeSentItem(`Voice message · ${formatRecordingTime(duration)}`, recipients.length);
      setNotice(`Voice message sent privately to ${recipients.length} ${recipients.length === 1 ? 'contact' : 'contacts'}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to send the voice message.');
    } finally {
      setRecordingSeconds(0);
      setMediaTransfer({phase: 'idle', progress: 0, current: 0, total: 0});
      setSending(false);
      await setAudioModeAsync(BROADCAST_IDLE_AUDIO_MODE).catch(() => undefined);
    }
  }, [broadcast.participants, recorder, recorderState, recordingSeconds, sending, storeSentItem]);

  const sendAttachments = useCallback(async (media: AttachmentMedia[], caption: string, hdEnabled: boolean) => {
    if (!media.length || sending) return false;
    const recipients = broadcast.participants.filter(member => member._id);
    if (!recipients.length) {
      setNotice('This broadcast has no recipients.');
      return false;
    }
    setSending(true);
    try {
      for (let mediaIndex = 0; mediaIndex < media.length; mediaIndex += 1) {
        const current = mediaIndex + 1;
        setMediaTransfer({phase: 'compressing', progress: mediaIndex / media.length, current, total: media.length});
        const compressed = await compressChatMedia(media[mediaIndex], progress => {
          setMediaTransfer({phase: 'compressing', progress: (mediaIndex + progress * 0.2) / media.length, current, total: media.length});
        }, hdEnabled);
        const upload = {uri: compressed.uri, name: compressed.fileName, type: compressed.mimeType};
        for (let recipientIndex = 0; recipientIndex < recipients.length; recipientIndex += 1) {
          await sendChatMedia(recipients[recipientIndex]._id, upload, {
            caption: caption || undefined,
            onUploadProgress: progress => {
              const recipientProgress = (recipientIndex + progress) / recipients.length;
              setMediaTransfer({phase: 'uploading', progress: (mediaIndex + 0.2 + recipientProgress * 0.8) / media.length, current, total: media.length});
            },
            onUploadComplete: () => setMediaTransfer({phase: 'delivering', progress: (mediaIndex + 0.99) / media.length, current, total: media.length}),
          });
        }
      }
      const label = caption.trim() || (media.length === 1 ? (media[0].type === 'video' ? 'Sent a video' : 'Sent a photo') : `Sent ${media.length} attachments`);
      await storeSentItem(label, recipients.length);
      setNotice(`Sent privately to ${recipients.length} ${recipients.length === 1 ? 'contact' : 'contacts'}.`);
      setMediaTransfer({phase: 'idle', progress: 0, current: 0, total: 0});
      return true;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to send attachment.');
      setMediaTransfer({phase: 'idle', progress: 0, current: 0, total: 0});
      return false;
    } finally {
      setSending(false);
    }
  }, [broadcast.participants, sending, storeSentItem]);

  const attachDocument = useCallback(async () => {
    setAttachmentOpen(false);
    try {
      const result = await DocumentPicker.getDocumentAsync({copyToCacheDirectory: true, multiple: false, type: [...SUPPORTED_PICKER_MIME_TYPES]});
      if (result.canceled || !result.assets?.[0]) return;
      const file = normalizePickedDocument(result.assets[0]);
      if (!file) {
        setNotice('Choose a supported document or audio file.');
        return;
      }
      const retainedUri = await retainBroadcastFile(file.uri, file.name);
      const recipients = broadcast.participants.filter(member => member._id);
      setSending(true);
      for (let index = 0; index < recipients.length; index += 1) {
        const onProgress = (progress: number) => setMediaTransfer({phase: 'uploading', progress: (index + progress) / recipients.length, current: 1, total: 1});
        if (isAudioUpload(file)) await sendChatMedia(recipients[index]._id, file, {duration: 0, onUploadProgress: onProgress});
        else await sendChatFile(recipients[index]._id, file, {onUploadProgress: onProgress});
      }
      await storeSentItem(`Sent ${file.name}`, recipients.length, {
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        fileUri: retainedUri,
      });
      setNotice(`Sent privately to ${recipients.length} ${recipients.length === 1 ? 'contact' : 'contacts'}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to send file.');
    } finally {
      setMediaTransfer({phase: 'idle', progress: 0, current: 0, total: 0});
      setSending(false);
    }
  }, [broadcast.participants, storeSentItem]);

  const attachLocation = useCallback(async () => {
    setAttachmentOpen(false);
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) {
      setNotice('Location access is required to share your location.');
      return;
    }
    setSending(true);
    try {
      const position = await Location.getCurrentPositionAsync({accuracy: Location.Accuracy.Balanced});
      const {latitude, longitude} = position.coords;
      let name = 'Shared location';
      try {
        const [place] = await Location.reverseGeocodeAsync({latitude, longitude});
        name = [place?.name, place?.district, place?.city].filter(Boolean).slice(0, 2).join(', ') || name;
      } catch { /* Coordinates remain usable without a reverse-geocode result. */ }
      const content = locationMessage(latitude, longitude, name);
      const result = await sendBroadcastMessage(broadcast._id, content);
      const recipients = result.totalRecipients || memberCount;
      await storeSentItem(`Shared ${name}`, recipients);
      setNotice(`Sent privately to ${recipients} ${recipients === 1 ? 'contact' : 'contacts'}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to share location.');
    } finally {
      setSending(false);
    }
  }, [broadcast._id, memberCount, storeSentItem]);

  const attachContact = useCallback(async () => {
    setAttachmentOpen(false);
    setLoadingContacts(true);
    setContactPickerOpen(true);
    try {
      const current = await Contacts.getPermissionsAsync();
      const permission = current.granted ? current : await Contacts.requestPermissionsAsync();
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
      ])) as Array<{id: string; fullName?: string; givenName?: string; familyName?: string; phones?: Array<{number?: string}>; emails?: Array<{address?: string}>}>;
      setShareableContacts(records.map(record => ({
        id: String(record.id),
        name: record.fullName || `${record.givenName || ''} ${record.familyName || ''}`.trim() || 'Unnamed contact',
        phoneNumbers: record.phones?.map(value => value.number || '').filter(Boolean) || [],
        emailAddresses: record.emails?.map(value => value.address || '').filter(Boolean) || [],
      })).filter(record => record.phoneNumbers.length || record.emailAddresses.length).sort((first, second) => first.name.localeCompare(second.name)));
    } catch (error) {
      setContactPickerOpen(false);
      setNotice(error instanceof Error ? error.message : 'Unable to open contacts.');
    } finally {
      setLoadingContacts(false);
    }
  }, []);

  const shareContact = useCallback(async (shared: ShareableContact) => {
    if (sending) return;
    setSending(true);
    try {
      const recipients = broadcast.participants.filter(member => member._id);
      if (!recipients.length) throw new Error('This broadcast has no recipients.');
      const name = vCardFileName(shared.name);
      const file = new File(Paths.document, `broadcast-${Date.now()}-${name}`);
      const vCard = createVCard(shared);
      file.write(vCard);
      const upload = {uri: file.uri, name, type: 'text/vcard'};
      for (const recipient of recipients) await sendChatFile(recipient._id, upload);
      await storeSentItem(`Shared ${shared.name}'s contact`, recipients.length, {
        fileName: name,
        fileType: upload.type,
        fileSize: vCard.length,
        fileUri: file.uri,
      });
      setContactPickerOpen(false);
      setNotice(`Sent privately to ${recipients.length} ${recipients.length === 1 ? 'contact' : 'contacts'}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to share contact.');
    } finally {
      setSending(false);
    }
  }, [broadcast.participants, sending, storeSentItem]);

  const chooseMenuAction = useCallback((action: MenuAction) => {
    if (action === 'delete') { setDeleteConfirmOpen(true); return; }
    setMenuOpen(false);
    if (action === 'members') { openMembers(); return; }
    if (action === 'info') { setDetailPage('info'); refreshDetails(); return; }
    if (action === 'media') { setDetailPage('media'); return; }
    if (action === 'search') { setQuery(''); setDetailPage('search'); return; }
  }, [openMembers, refreshDetails]);

  const confirmDelete = useCallback(async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      await deleteBroadcast(broadcast._id);
      setDeleteConfirmOpen(false);
      setMenuOpen(false);
      onBack();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to delete the broadcast.');
    } finally {
      setDeleting(false);
    }
  }, [broadcast._id, deleting, onBack]);

  if (editing) {
    return <View style={[styles.root, {paddingTop: Math.max(insets.top + 10, 30), paddingBottom: Math.max(insets.bottom + 10, 22)}]}>
      <View style={styles.memberHeader}><Pressable accessibilityLabel="Back" hitSlop={12} onPress={() => setEditing(false)} style={styles.smallHeaderButton}><BackIcon/></Pressable><Text style={styles.memberHeaderTitle}>Add members</Text></View>
      <View style={styles.searchBox}><SearchIcon/><TextInput accessibilityLabel="Search broadcast contacts" autoCapitalize="none" onChangeText={setQuery} placeholder="Search Contacts" placeholderTextColor="#526176" style={styles.searchInput} value={query}/></View>
      <View style={styles.selectedHeading}><Text style={styles.selectedTitle}>Selected Participants</Text><View style={styles.countPill}><Text style={styles.countText}>{selected.size}</Text></View></View>
      <ScrollView contentContainerStyle={styles.selectedChips} horizontal showsHorizontalScrollIndicator={false}>
        {selectedMembers.map(member => <Pressable accessibilityLabel={`Remove ${member.name}`} key={member._id} onPress={() => toggle(member)} style={styles.chip}><BroadcastAvatar member={member} size={27}/><Text numberOfLines={1} style={styles.chipText}>{member.name}</Text><View style={styles.chipRemove}><Text style={styles.chipClose}>×</Text></View></Pressable>)}
      </ScrollView>
      {loading ? <View style={styles.loading}><ActivityIndicator color={PURPLE}/></View> : <ScrollView contentContainerStyle={styles.memberList} keyboardShouldPersistTaps="handled">
        <Text style={styles.sectionLabel}>Recently Contacted</Text>
        {candidates.slice(0, 3).map(member => {const checked = selected.has(member._id); return <Pressable accessibilityLabel={`Select recent ${member.name}`} accessibilityRole="checkbox" accessibilityState={{checked}} key={`recent-${member._id}`} onPress={() => toggle(member)} style={styles.memberRow}><View style={[styles.checkbox, checked && styles.checkboxChecked]}>{checked && <Text style={styles.check}>✓</Text>}</View><BroadcastAvatar member={member}/><View style={styles.memberCopy}><Text style={styles.memberName}>{member.name}</Text><Text style={styles.memberStatus}>Exploring the world one step at a time 🌍</Text></View></Pressable>;})}
        <Text style={[styles.sectionLabel, styles.allChatsLabel]}>All Chats</Text>
        {candidates.map(member => {const checked = selected.has(member._id); return <Pressable accessibilityLabel={`Select ${member.name}`} accessibilityRole="checkbox" accessibilityState={{checked}} key={`all-${member._id}`} onPress={() => toggle(member)} style={styles.memberRow}><View style={[styles.checkbox, checked && styles.checkboxChecked]}>{checked && <Text style={styles.check}>✓</Text>}</View><BroadcastAvatar member={member}/><View style={styles.memberCopy}><Text style={styles.memberName}>{member.name}</Text><Text style={styles.memberStatus}>Chatterly contact</Text></View></Pressable>;})}
        {!candidates.length && <Text style={styles.noResults}>{query.trim() ? 'No matching contacts' : 'No contacts available'}</Text>}
      </ScrollView>}
      <View style={[styles.memberFooter, {paddingBottom: Math.max(insets.bottom, 10)}]}><Text style={styles.minimumHint}>ⓘ  Minimum 2 participants required.</Text><Pressable accessibilityLabel="Save Broadcast Members" accessibilityState={{disabled: selected.size < 2, busy: saving}} disabled={selected.size < 2 || saving} onPress={saveMembers} style={[styles.createButton, selected.size < 2 && styles.createButtonDisabled]}>{saving ? <ActivityIndicator color="#FFFFFF"/> : <Text style={styles.createButtonText}>Update Broadcast</Text>}</Pressable></View>
      <Snackbar message={notice} onHide={() => setNotice('')}/>
    </View>;
  }

  if (detailPage) {
    const filteredSent = sent.filter(message => !query.trim() || message.text.toLowerCase().includes(query.trim().toLowerCase()));
    return <View style={[styles.root, {paddingTop: Math.max(insets.top + 10, 30)}]}>
      <View style={styles.memberHeader}><Pressable accessibilityLabel="Back" hitSlop={12} onPress={() => {setDetailPage(null); setQuery('');}} style={styles.smallHeaderButton}><BackIcon/></Pressable><Text style={styles.memberHeaderTitle}>{detailPage === 'info' ? 'Broadcast Info' : detailPage === 'media' ? 'Broadcast Media' : 'Search'}</Text></View>
      {detailPage === 'search' && <View style={styles.searchBox}><SearchIcon/><TextInput accessibilityLabel="Search broadcast messages" autoFocus onChangeText={setQuery} placeholder="Search" placeholderTextColor="#526176" style={styles.searchInput} value={query}/></View>}
      {loading ? <View style={styles.loading}><ActivityIndicator color={PURPLE}/></View> : detailPage === 'info' ? <ScrollView contentContainerStyle={styles.infoPage}><View style={styles.infoAvatar}><HeaderAvatar broadcast={broadcast}/></View><Text style={styles.infoName}>{broadcast.name}</Text><Text style={styles.infoMembers}>{`${memberCount} Members`}</Text><Text style={styles.infoSection}>Participants</Text>{broadcast.participants.map(member => {const removing = removingMemberId === member._id; return <View key={member._id} style={styles.infoMemberRow}><BroadcastAvatar member={member}/><Text numberOfLines={1} style={styles.infoMemberName}>{member.name}</Text><Pressable accessibilityLabel={`Remove ${member.name} from broadcast`} accessibilityRole="button" accessibilityState={{busy: removing, disabled: Boolean(removingMemberId)}} disabled={Boolean(removingMemberId)} hitSlop={8} onPress={() => removeMember(member)} style={styles.infoRemoveButton}>{removing ? <ActivityIndicator color="#DC2626" size="small"/> : <Text style={styles.infoRemoveText}>Remove</Text>}</Pressable></View>;})}</ScrollView> : detailPage === 'media' ? <View style={styles.detailEmpty}><MenuIcon action="media"/><Text style={styles.detailEmptyTitle}>No broadcast media</Text><Text style={styles.detailEmptyText}>The current broadcast API supports text messages only.</Text></View> : <ScrollView contentContainerStyle={styles.searchResults}>{filteredSent.map(message => <View key={message.id} style={styles.searchResult}><Text style={styles.searchResultText}>{message.text}</Text><Text style={styles.searchResultTime}>{message.createdAt.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}</Text></View>)}{!filteredSent.length && <Text style={styles.noResults}>No matching broadcast messages</Text>}</ScrollView>}
      <Snackbar message={notice} onHide={() => setNotice('')}/>
    </View>;
  }

  return <KeyboardAvoidingView behavior="padding" enabled keyboardVerticalOffset={0} style={[styles.root, {paddingTop: insets.top}]}>
    <View style={styles.header}><Pressable accessibilityLabel="Back" hitSlop={12} onPress={onBack} style={styles.headerButton}><BackIcon/></Pressable><HeaderAvatar broadcast={broadcast}/><View style={styles.headerCopy}><Text numberOfLines={1} style={styles.name}>{broadcast.name}</Text><Text style={styles.subtitle}>{`${memberCount} Members`}</Text></View><Pressable accessibilityLabel="Broadcast options" hitSlop={10} onPress={() => setMenuOpen(true)} style={styles.headerButton}><MoreIcon/></Pressable></View>
    <View style={styles.conversation}><PatternBackground/><ScrollView contentContainerStyle={styles.messages} keyboardShouldPersistTaps="handled" onContentSizeChange={() => scrollRef.current?.scrollToEnd({animated: false})} ref={scrollRef} showsVerticalScrollIndicator={false}>
      <View style={styles.privacyBanner}><PrivacyIcon/><View style={styles.privacyCopy}><Text style={styles.privacyTitle}>Your conversation is private</Text><Text style={styles.privacyText}>Messages and calls in this chat are protected with end-to-end encryption. Only you and the recipients can read them. <Text style={styles.learnMore}>Learn more</Text></Text></View></View>
      {sent.map(message => <View accessibilityLabel={`Broadcast sent to ${message.recipients} contacts`} key={message.id} style={styles.messageBubble}>{message.fileName ? <BroadcastFilePreview message={message} onOpen={() => {openSentFile(message).catch(() => undefined);}}/> : <Text style={styles.messageText}>{message.text}</Text>}<View style={styles.messageMeta}><Text style={styles.messageTime}>{message.createdAt.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}</Text><SingleCheckIcon color="#E9D9FF"/></View></View>)}
    </ScrollView></View>
    <View style={[styles.composerRow, composerInset]}><View style={styles.composer}><TextInput ref={inputRef} accessibilityLabel="Broadcast message" editable={!recordingVoice} multiline onChangeText={setDraft} onFocus={() => {setEmojiOpen(false); setAttachmentOpen(false); scrollToEnd();}} onSelectionChange={({nativeEvent: {selection}}) => {selectionRef.current = selection; setForcedSelection(null);}} placeholder={recordingVoice ? `Recording ${formatRecordingTime(recordingSeconds)} · tap microphone to send` : 'Type a message'} placeholderTextColor={recordingVoice ? '#E5484D' : '#8792A4'} selection={forcedSelection ?? undefined} style={styles.messageInput} value={draft}/><Pressable accessibilityLabel="Add emoji" accessibilityState={{expanded: emojiOpen}} disabled={recordingVoice} hitSlop={8} onPress={toggleEmojiPicker} style={styles.composerIcon}><EmojiIcon active={emojiOpen}/></Pressable><Pressable accessibilityLabel="Attach broadcast media" accessibilityState={{expanded: attachmentOpen}} disabled={recordingVoice} hitSlop={8} onPress={() => {Keyboard.dismiss(); setEmojiOpen(false); setAttachmentOpen(open => !open);}} style={styles.composerIcon}><PaperclipIcon active={attachmentOpen}/></Pressable></View><Pressable accessibilityLabel={draft.trim() ? 'Send Broadcast' : recordingVoice ? 'Stop and send broadcast voice message' : 'Record broadcast voice message'} accessibilityState={{disabled: sending, busy: sending, selected: recordingVoice}} disabled={sending} onPress={draft.trim() ? send : recordingVoice ? finishVoiceRecording : startVoiceRecording} style={styles.sendButton}>{sending ? <ActivityIndicator color="#FFFFFF" size="small"/> : draft.trim() ? <SendIcon/> : <CompactMicrophoneIcon active={recordingVoice} onDark/>}</Pressable></View>
    <EmojiPicker bottomInset={Math.max(insets.bottom, 8)} onSelectEmoji={insertEmoji} showGifTab={false} visible={emojiOpen}/>
    <Snackbar message={notice} onHide={() => setNotice('')}/>
    <MediaAttachmentFlow onClose={() => setAttachmentOpen(false)} onContact={attachContact} onDocument={attachDocument} onLocation={attachLocation} onNotice={setNotice} onSend={sendAttachments} recipientName={broadcast.name} requestRecentsPermissionOnOpen={false} transfer={mediaTransfer} visible={attachmentOpen}/>
    <Modal animationType="slide" onRequestClose={() => setContactPickerOpen(false)} statusBarTranslucent transparent visible={contactPickerOpen}>
      <View style={styles.contactPickerBackdrop}>
        <View style={[styles.contactPickerSheet, {paddingBottom: Math.max(insets.bottom, 12)}]}>
          <View style={styles.contactPickerHeader}><Text accessibilityRole="header" style={styles.contactPickerTitle}>Share Contact</Text><Pressable accessibilityLabel="Cancel contact sharing" onPress={() => setContactPickerOpen(false)}><Text style={styles.contactPickerCancel}>Cancel</Text></Pressable></View>
          {loadingContacts ? <ActivityIndicator color={PURPLE} style={styles.contactPickerLoading}/> : <ScrollView showsVerticalScrollIndicator={false}>
            {shareableContacts.map(shared => <Pressable accessibilityLabel={`Share ${shared.name}`} key={shared.id} onPress={() => shareContact(shared)} style={styles.contactPickerRow}><View style={styles.contactPickerAvatar}><Text style={styles.contactPickerInitial}>{shared.name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || '?'}</Text></View><View style={styles.contactPickerCopy}><Text style={styles.contactPickerName}>{shared.name}</Text><Text numberOfLines={1} style={styles.contactPickerMeta}>{shared.phoneNumbers[0] || shared.emailAddresses[0]}</Text></View><Text style={styles.contactPickerShare}>Share</Text></Pressable>)}
          </ScrollView>}
        </View>
      </View>
    </Modal>
    <Modal animationType="fade" onRequestClose={() => deleteConfirmOpen ? setDeleteConfirmOpen(false) : setMenuOpen(false)} statusBarTranslucent transparent visible={menuOpen}>
      <View style={styles.menuOverlay}>
      <View accessibilityLabel="Broadcast options menu" accessibilityElementsHidden={deleteConfirmOpen} importantForAccessibility={deleteConfirmOpen ? 'no-hide-descendants' : 'auto'} pointerEvents={deleteConfirmOpen ? 'none' : 'auto'} style={StyleSheet.absoluteFill}><Pressable accessibilityLabel="Close broadcast options backdrop" onPress={() => setMenuOpen(false)} style={StyleSheet.absoluteFill}/><View style={[styles.menuSheet, {paddingBottom: Math.max(insets.bottom + 8, 20)}]}><View style={styles.menuHandle}/><Pressable accessibilityLabel="Close broadcast options" hitSlop={10} onPress={() => setMenuOpen(false)} style={styles.menuClose}><CloseIcon/></Pressable>
        {([{key: 'members', label: 'Add Members'}, {key: 'info', label: 'Broadcast Info'}, {key: 'media', label: 'Broadcast Media'}, {key: 'search', label: 'Search'}, {key: 'delete', label: 'Delete Broadcast'}] as Array<{key: MenuAction; label: string}>).map(item => <Pressable accessibilityLabel={item.label} key={item.key} onPress={() => chooseMenuAction(item.key)} style={[styles.menuRow, item.key === 'delete' && styles.deleteRow]}><BroadcastMenuRowSvg action={item.key}/></Pressable>)}
      </View></View>
      {/* Keep the confirmation in the options modal so iOS needs only one native presentation. */}
      {deleteConfirmOpen && <View accessibilityLabel="Delete Broadcast confirmation" accessibilityViewIsModal style={styles.deleteOverlay}>
        <BlurView intensity={24} tint="dark" style={StyleSheet.absoluteFill}/>
        <View style={styles.deleteDim}/>
        <View style={styles.deleteDialog}>
          <View style={styles.deleteDialogIcon}><DeleteBroadcastIcon/></View>
          <Text style={styles.deleteDialogTitle}>Delete this Broadcast?</Text>
          <Text style={styles.deleteDialogCopy}>This action can't be undone.{`\n`}Deleting the broadcast won't delete the sent{`\n`}message.</Text>
          <Pressable accessibilityLabel="Confirm Delete Broadcast" accessibilityRole="button" accessibilityState={{busy: deleting, disabled: deleting}} disabled={deleting} onPress={confirmDelete} style={styles.deleteDialogAction}>{deleting ? <ActivityIndicator color="#DC2626" size="small"/> : <Text style={styles.deleteDialogActionText}>Delete Broadcast</Text>}</Pressable>
          <Pressable accessibilityLabel="Cancel Delete Broadcast" accessibilityRole="button" onPress={() => setDeleteConfirmOpen(false)} style={styles.deleteDialogCancel}><Text style={styles.deleteDialogCancelText}>Cancel</Text></Pressable>
        </View>
      </View>}
      </View>
    </Modal>
  </KeyboardAvoidingView>;
}

const styles = createThemedStyles({
  root: {flex: 1, backgroundColor: '#FFFFFF'},
  header: {height: 70, paddingHorizontal: 7, borderBottomWidth: 1, borderBottomColor: '#EBEEF3', backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center'},
  headerButton: {width: 36, height: 44, alignItems: 'center', justifyContent: 'center'},
  headerAvatar: {position: 'relative'},
  broadcastHeaderImage: {width: 38, height: 38, borderRadius: 6},
  onlineBadge: {position: 'absolute', right: -2, bottom: -2, width: 13, height: 13, borderRadius: 4, backgroundColor: '#18C77A', alignItems: 'center', justifyContent: 'center'},
  onlineCheck: {color: '#FFFFFF', fontSize: 8, fontWeight: '700'},
  headerCopy: {flex: 1, minWidth: 0, marginLeft: 9},
  name: {color: '#111827', fontFamily: FONT, fontSize: 13, fontWeight: '600'},
  subtitle: {marginTop: 2, color: '#526176', fontFamily: FONT, fontSize: 9},
  conversation: {flex: 1, position: 'relative', backgroundColor: '#FCFBFE'},
  messages: {flexGrow: 1, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 16, justifyContent: 'flex-end'},
  privacyBanner: {marginTop: 16, padding: 10, borderWidth: 1, borderColor: '#E5E9F0', borderRadius: 9, backgroundColor: '#FFFFFF', flexDirection: 'row', shadowColor: '#8490A3', shadowOpacity: 0.08, shadowRadius: 5, elevation: 1},
  privacyIcon: {width: 22, height: 22, borderRadius: 11, backgroundColor: '#EEF3FA', alignItems: 'center', justifyContent: 'center'},
  privacyCopy: {flex: 1, marginLeft: 8},
  privacyTitle: {color: '#263448', fontFamily: FONT, fontSize: 10, fontWeight: '700'},
  privacyText: {marginTop: 3, color: '#637188', fontFamily: FONT, fontSize: 8, lineHeight: 11},
  learnMore: {color: '#526176', fontWeight: '700', textDecorationLine: 'underline'},
  messageBubble: {maxWidth: '82%', marginTop: 8, paddingHorizontal: 11, paddingTop: 9, paddingBottom: 7, alignSelf: 'flex-end', borderRadius: 13, borderBottomRightRadius: 4, backgroundColor: '#8B27E9'},
  messageText: {color: '#FFFFFF', fontFamily: FONT, fontSize: 12, lineHeight: 17},
  fileCard: {width: 220, maxWidth: '100%', minHeight: 54, padding: 8, borderRadius: 8, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center'},
  fileIcon: {width: 38, height: 42, borderRadius: 5, backgroundColor: '#EEF3FA', alignItems: 'center', justifyContent: 'center'},
  fileIconText: {maxWidth: 34, color: '#7137DD', fontFamily: FONT, fontSize: 9, fontWeight: '800'},
  fileCopy: {flex: 1, minWidth: 0, marginLeft: 9},
  fileName: {color: '#172033', fontFamily: FONT, fontSize: 10, fontWeight: '600'},
  fileType: {marginTop: 4, color: '#758196', fontFamily: FONT, fontSize: 8},
  messageMeta: {marginTop: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8},
  messageTime: {color: '#E9D9FF', fontSize: 8},
  composerRow: {minHeight: 58, paddingHorizontal: 8, paddingTop: 6, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'flex-start', gap: 7},
  composer: {flex: 1, minHeight: 44, maxHeight: 90, paddingLeft: 10, paddingRight: 3, borderWidth: 1, borderColor: '#E1E6ED', borderRadius: 7, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center'},
  messageInput: {flex: 1, maxHeight: 80, paddingVertical: 8, color: '#152033', fontFamily: FONT, fontSize: 11},
  composerIcon: {width: 31, height: 40, alignItems: 'center', justifyContent: 'center'},
  sendButton: {width: 44, height: 44, borderRadius: 7, backgroundColor: PURPLE, alignItems: 'center', justifyContent: 'center'},
  contactPickerBackdrop: {flex: 1, backgroundColor: 'rgba(15,23,42,.4)', justifyContent: 'flex-end'},
  contactPickerSheet: {maxHeight: '74%', minHeight: 320, paddingHorizontal: 16, borderTopLeftRadius: 18, borderTopRightRadius: 18, backgroundColor: '#FFF'},
  contactPickerHeader: {height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  contactPickerTitle: {color: '#172033', fontFamily: FONT, fontSize: 15, fontWeight: '700'},
  contactPickerCancel: {color: PURPLE, fontFamily: FONT, fontSize: 12, fontWeight: '600'},
  contactPickerLoading: {marginTop: 80},
  contactPickerRow: {height: 61, flexDirection: 'row', alignItems: 'center'},
  contactPickerAvatar: {width: 38, height: 38, borderRadius: 19, backgroundColor: '#EDE5FC', alignItems: 'center', justifyContent: 'center'},
  contactPickerInitial: {color: '#7137DD', fontFamily: FONT, fontSize: 11, fontWeight: '700'},
  contactPickerCopy: {flex: 1, minWidth: 0, marginLeft: 10},
  contactPickerName: {color: '#172033', fontFamily: FONT, fontSize: 12, fontWeight: '600'},
  contactPickerMeta: {marginTop: 4, color: '#758196', fontFamily: FONT, fontSize: 9},
  contactPickerShare: {color: '#7137DD', fontFamily: FONT, fontSize: 10, fontWeight: '700'},
  menuOverlay: {flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.42)'},
  menuSheet: {position: 'absolute', bottom: 0, left: 0, right: 0, minHeight: 288, paddingTop: 7, borderTopLeftRadius: 16, borderTopRightRadius: 16, backgroundColor: '#FFFFFF'},
  menuHandle: {width: 44, height: 4, alignSelf: 'center', borderRadius: 2, backgroundColor: '#E1E6EE'},
  menuClose: {position: 'absolute', top: 19, right: 16, width: 32, height: 32, zIndex: 2, alignItems: 'center', justifyContent: 'center'},
  menuRow: {height: 54, overflow: 'hidden', flexDirection: 'row', alignItems: 'center'},
  deleteRow: {borderTopWidth: 1, borderTopColor: '#EEF0F4'},
  deleteOverlay: {position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, paddingHorizontal: 28, alignItems: 'center', justifyContent: 'center'},
  deleteDim: {position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(15,23,42,0.36)'},
  deleteDialog: {width: '100%', maxWidth: 330, paddingTop: 17, paddingHorizontal: 22, paddingBottom: 10, borderRadius: 11, backgroundColor: '#FFFFFF', alignItems: 'center', shadowColor: '#111827', shadowOffset: {width: 0, height: 8}, shadowOpacity: 0.22, shadowRadius: 18, elevation: 9},
  deleteDialogIcon: {width: 46, height: 46, marginBottom: 12, borderRadius: 23, backgroundColor: '#FFF0F1', alignItems: 'center', justifyContent: 'center'},
  deleteDialogTitle: {color: '#172033', fontFamily: FONT, fontSize: 14, fontWeight: '700', textAlign: 'center'},
  deleteDialogCopy: {marginTop: 9, color: '#758196', fontFamily: FONT, fontSize: 10, lineHeight: 15, textAlign: 'center'},
  deleteDialogAction: {width: '100%', height: 46, marginTop: 11, alignItems: 'center', justifyContent: 'center'},
  deleteDialogActionText: {color: '#DC2626', fontFamily: FONT, fontSize: 11, fontWeight: '600'},
  deleteDialogCancel: {width: '100%', height: 40, alignItems: 'center', justifyContent: 'center'},
  deleteDialogCancelText: {color: '#172033', fontFamily: FONT, fontSize: 11, fontWeight: '600'},
  memberHeader: {height: 44, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center'},
  smallHeaderButton: {width: 28, height: 40, marginLeft: -8, alignItems: 'center', justifyContent: 'center'},
  memberHeaderTitle: {marginLeft: 2, color: '#0D1422', fontFamily: FONT, fontSize: 14, fontWeight: '700'},
  searchBox: {height: 38, marginHorizontal: 12, marginTop: 14, paddingHorizontal: 11, borderWidth: 1, borderColor: '#E4E9F0', borderRadius: 6, flexDirection: 'row', alignItems: 'center'},
  searchInput: {flex: 1, height: '100%', paddingHorizontal: 9, paddingVertical: 0, color: '#152033', fontFamily: FONT, fontSize: 11},
  selectedHeading: {height: 34, marginHorizontal: 12, marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 8},
  selectedTitle: {color: '#111827', fontFamily: FONT, fontSize: 10, fontWeight: '600'},
  countPill: {minWidth: 23, height: 17, paddingHorizontal: 7, borderRadius: 9, backgroundColor: '#F0E6FF', alignItems: 'center', justifyContent: 'center'},
  countText: {color: '#7B2AE8', fontFamily: FONT, fontSize: 10, fontWeight: '600'},
  selectedChips: {height: 42, paddingHorizontal: 12, alignItems: 'center'},
  chip: {height: 32, marginRight: 8, paddingRight: 6, borderWidth: 1, borderColor: '#DCEAF4', borderRadius: 17, backgroundColor: '#F4F9FF', flexDirection: 'row', alignItems: 'center'},
  chipText: {maxWidth: 80, marginHorizontal: 5, color: '#2454A6', fontFamily: FONT, fontSize: 9},
  chipRemove: {width: 16, height: 16, borderRadius: 8, backgroundColor: '#5BD5B0', alignItems: 'center', justifyContent: 'center'},
  chipClose: {marginTop: -1, color: '#FFFFFF', fontSize: 13, lineHeight: 15},
  loading: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  memberList: {paddingHorizontal: 12, paddingTop: 10, paddingBottom: 105},
  sectionLabel: {marginBottom: 8, color: '#61708A', fontFamily: FONT, fontSize: 10},
  allChatsLabel: {marginTop: 16},
  memberRow: {height: 57, flexDirection: 'row', alignItems: 'center'},
  checkbox: {width: 18, height: 18, marginRight: 10, borderWidth: 1.2, borderColor: '#6E86A8', borderRadius: 9, alignItems: 'center', justifyContent: 'center'},
  checkboxChecked: {borderColor: PURPLE, backgroundColor: PURPLE},
  check: {color: '#FFFFFF', fontSize: 11, fontWeight: '700'},
  avatarFallback: {borderWidth: 1, borderColor: '#E7ECF3', backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center'},
  avatarInitial: {color: '#7137DD', fontFamily: FONT, fontSize: 11, fontWeight: '700'},
  memberCopy: {flex: 1, marginLeft: 10},
  memberName: {color: '#111827', fontFamily: FONT, fontSize: 12, fontWeight: '600'},
  memberStatus: {marginTop: 4, color: '#526176', fontFamily: FONT, fontSize: 9},
  noResults: {marginTop: 50, color: '#718096', fontFamily: FONT, fontSize: 12, textAlign: 'center'},
  memberFooter: {position: 'absolute', right: 0, bottom: 0, left: 0, paddingHorizontal: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#EDF0F4', backgroundColor: '#FFFFFF'},
  minimumHint: {marginBottom: 10, color: '#111827', fontFamily: FONT, fontSize: 9, textAlign: 'center'},
  createButton: {height: 38, borderRadius: 4, backgroundColor: PURPLE, alignItems: 'center', justifyContent: 'center', shadowColor: '#6C2EEB', shadowOffset: {width: 0, height: 3}, shadowOpacity: 0.2, shadowRadius: 4, elevation: 3},
  createButtonDisabled: {backgroundColor: '#E1E7F0', shadowOpacity: 0, elevation: 0},
  createButtonText: {color: '#FFFFFF', fontFamily: FONT, fontSize: 10, fontWeight: '500'},
  infoPage: {paddingHorizontal: 20, paddingBottom: 30, alignItems: 'center'},
  infoAvatar: {marginTop: 26},
  infoName: {marginTop: 12, color: '#111827', fontFamily: FONT, fontSize: 17, fontWeight: '700'},
  infoMembers: {marginTop: 4, color: '#61708A', fontFamily: FONT, fontSize: 11},
  infoSection: {width: '100%', marginTop: 28, marginBottom: 8, color: '#61708A', fontFamily: FONT, fontSize: 10},
  infoMemberRow: {width: '100%', height: 55, flexDirection: 'row', alignItems: 'center'},
  infoMemberName: {flex: 1, minWidth: 0, marginLeft: 10, color: '#111827', fontFamily: FONT, fontSize: 12, fontWeight: '600'},
  infoRemoveButton: {minWidth: 58, height: 36, marginLeft: 10, alignItems: 'center', justifyContent: 'center'},
  infoRemoveText: {color: '#DC2626', fontFamily: FONT, fontSize: 10, fontWeight: '600'},
  detailEmpty: {flex: 1, paddingBottom: 70, alignItems: 'center', justifyContent: 'center'},
  detailEmptyTitle: {marginTop: 14, color: '#263448', fontFamily: FONT, fontSize: 14, fontWeight: '700'},
  detailEmptyText: {marginTop: 7, color: '#718096', fontFamily: FONT, fontSize: 10},
  searchResults: {paddingHorizontal: 12, paddingTop: 12, paddingBottom: 30},
  searchResult: {minHeight: 58, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: '#E5E9F0', borderRadius: 7},
  searchResultText: {color: '#111827', fontFamily: FONT, fontSize: 11},
  searchResultTime: {marginTop: 6, color: '#718096', fontFamily: FONT, fontSize: 8},
});
