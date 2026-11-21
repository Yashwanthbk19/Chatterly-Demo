import {changeContactBlock} from '../services/blockStore';
import * as Clipboard from 'expo-clipboard';
import {EditContactSheet} from '../components/EditContactSheet';
import {useContactDisplayName} from '../services/contactAliases';
import {formatPhoneNumber} from '../utils/phoneNumber';
import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {ActivityIndicator, Alert, Image, Modal, Platform, Pressable, ScrollView, Text, View} from 'react-native';
import Svg, {Circle, Path, Rect} from 'react-native-svg';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {AvatarStatusBadge, ChatSearchIcon, PhoneCallIcon, VideoCallIcon} from '../components/ChatIcons';
import {AdminToggle} from '../components/GroupAdminIcons';
import {Snackbar} from '../components/Snackbar';
import {ProfilePictureViewer} from '../components/ProfilePictureViewer';
import { getChatFiles, getChatMessages, getChatProfile, getPinnedMessages, getSharedLinks, getSharedMedia, reportChatUser} from '../services/chatApi';
import {getConversationMuted, setConversationMuted} from '../services/conversationPreferences';
import type {ChatMessage, ChatProfile, ConversationContact, SharedLink} from '../types/chat';
import {SharedContentScreen, type SharedContentTab} from './SharedContentScreen';
import {ManageGroupMembersScreen} from './ManageGroupMembersScreen';
import {PinnedMessagesScreen} from './PinnedMessagesScreen';
import {createThemedStyles} from '../theme/themedStyles';
import {themeInk} from '../theme/themedStyles';

type Props = {
  visible: boolean;
  initialPinnedVisible?: boolean;
  chatId: string;
  contact: ConversationContact;
  presenceLabel: string;
  onBack: () => void;
  onSearch: () => void;
  onCall: (type: 'audio' | 'video') => void;
  onClearChat: () => Promise<void> | void;
  onDeleteChat: () => Promise<void> | void;
  onNotice: (message: string) => void;
  onTimelineMessage?: (message: ChatMessage) => void;
  onOpenPinnedMessage?: (message: ChatMessage) => void;
  onForwardPinnedMessages?: (messages: ChatMessage[]) => void;
  onDeletePinnedMessage?: (message: ChatMessage) => void;
  onPinnedMessageUnpinned?: (messageId: string) => void;
  onPinnedMessagesDeletedForMe?: (messageIds: string[]) => void;
};

const PURPLE = '#6F28F5';
const RED = '#F13D43';
const FONT = Platform.select({android: 'sans-serif', ios: 'System'});
const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || '?';

function BackArrow() {
  return <Svg width={18} height={18} viewBox={'0 0 24 24'} fill={'none'}><Path d={'m15 18-6-6 6-6'} stroke={themeInk('#223047')} strokeWidth={1.5} strokeLinecap={'round'} strokeLinejoin={'round'} /></Svg>;
}

function EditIcon() {
  return <Svg width={18} height={18} viewBox={'0 0 24 24'} fill={'none'}><Path d={'M4 20h4L18.5 9.5a2.83 2.83 0 0 0-4-4L4 16v4M13.5 6.5l4 4'} stroke={themeInk('#223047')} strokeWidth={1.5} strokeLinecap={'round'} strokeLinejoin={'round'} /></Svg>;
}

function MessageIcon() {
  return <Svg width={19} height={19} viewBox={'0 0 24 24'} fill={'none'}><Path d={'M4 5.5h16v11H9l-5 3v-14Z'} stroke={themeInk('#172033')} strokeWidth={1.35} strokeLinejoin={'round'} /><Path d={'M8 9.5h8M8 12.5h5'} stroke={themeInk('#172033')} strokeWidth={1.2} strokeLinecap={'round'} /></Svg>;
}

type RowKind = 'group' | 'bell' | 'pin' | 'shield' | 'report' | 'block' | 'clear' | 'delete';
function RowIcon({kind, danger}: {kind: RowKind; danger?: boolean}) {
  const color = danger ? RED : '#273448';
  if (kind === 'group') return <Svg width={18} height={18} viewBox={'0 0 24 24'} fill={'none'}><Circle cx={9} cy={8} r={3} stroke={color} strokeWidth={1.35}/><Circle cx={17} cy={9} r={2} stroke={color} strokeWidth={1.35}/><Path d={'M3.5 19c.4-3.5 2.2-5.5 5.5-5.5s5.1 2 5.5 5.5M14 14c3.5-.7 5.8 1 6.5 4'} stroke={color} strokeWidth={1.35} strokeLinecap={'round'}/></Svg>;
  if (kind === 'bell') return <Svg width={48} height={48} viewBox={'0 0 48 48'} fill={'none'}><Rect width={48} height={48} rx={8} fill={themeInk('#FAFAFA')} /><Path d={'M21 29V30C21 30.7956 21.3161 31.5587 21.8787 32.1213C22.4413 32.6839 23.2044 33 24 33C24.7956 33 25.5587 32.6839 26.1213 32.1213C26.6839 31.5587 27 30.7956 27 30V29M22 17C22 16.4696 22.2107 15.9609 22.5858 15.5858C22.9609 15.2107 23.4696 15 24 15C24.5304 15 25.0391 15.2107 25.4142 15.5858C25.7893 15.9609 26 16.4696 26 17C27.1484 17.543 28.1274 18.3883 28.8321 19.4453C29.5367 20.5023 29.9404 21.7311 30 23V26C30.0753 26.6217 30.2954 27.2171 30.6428 27.7381C30.9902 28.2592 31.4551 28.6914 32 29H16C16.5449 28.6914 17.0098 28.2592 17.3572 27.7381C17.7046 27.2171 17.9247 26.6217 18 26V23C18.0596 21.7311 18.4633 20.5023 19.1679 19.4453C19.8726 18.3883 20.8516 17.543 22 17Z'} stroke={themeInk('#0B1220')} strokeWidth={1.5} strokeLinecap={'round'} strokeLinejoin={'round'} /></Svg>;
  if (kind === 'pin') return <Svg width={48} height={48} viewBox={'0 0 48 48'} fill={'none'}><Rect width={48} height={48} rx={8} fill={themeInk('#FAFAFA')} /><Path d={'M21 16V22L19 26V28H29V26L27 22V16M24 28V33M20 16H28'} stroke={themeInk('#0B1220')} strokeWidth={1.5} strokeLinecap={'round'} strokeLinejoin={'round'} /></Svg>;
  if (kind === 'shield') return <Svg width={48} height={48} viewBox={'0 0 48 48'} fill={'none'}><Rect width={48} height={48} rx={8} fill={themeInk('#FAFAFA')} /><Path d={'M32.5 18C29.3844 18.1426 26.3358 17.0666 24 15C21.6641 17.0666 18.6155 18.1426 15.5 18C15.0464 19.543 14.9076 21.1615 15.0918 22.7592C15.2761 24.3569 15.7796 25.9013 16.5726 27.3005C17.3655 28.6998 18.4316 29.9254 19.7075 30.9045C20.9834 31.8836 22.4432 32.5962 24 33C25.5567 32.5962 27.0165 31.8836 28.2924 30.9045C29.5683 29.9254 30.6344 28.6998 31.4274 27.3005C32.2203 25.9013 32.7238 24.3569 32.9081 22.7592C33.0923 21.1615 32.9535 19.543 32.5 18Z'} stroke={themeInk('#0B1220')} strokeWidth={1.5} strokeLinecap={'round'} strokeLinejoin={'round'} /></Svg>;
  if (kind === 'report') return <Svg width={48} height={48} viewBox={'0 0 48 48'} fill={'none'}><Rect width={48} height={48} rx={8} fill={themeInk('#FEF2F2')} /><Path d={'M24 20V23M24 26V26.01M30 16C30.7956 16 31.5587 16.3161 32.1213 16.8787C32.6839 17.4413 33 18.2044 33 19V27C33 27.7956 32.6839 28.5587 32.1213 29.1213C31.5587 29.6839 30.7956 30 30 30H25L20 33V30H18C17.2044 30 16.4413 29.6839 15.8787 29.1213C15.3161 28.5587 15 27.7956 15 27V19C15 18.2044 15.3161 17.4413 15.8787 16.8787C16.4413 16.3161 17.2044 16 18 16H30Z'} stroke={themeInk('#DC2626')} strokeWidth={1.5} strokeLinecap={'round'} strokeLinejoin={'round'} /></Svg>;
  if (kind === 'block') return <Svg width={48} height={48} viewBox={'0 0 48 48'} fill={'none'}><Rect width={48} height={48} rx={8} fill={themeInk('#FEF2F2')} /><Path d={'M17.636 30.364C16.8003 29.5282 16.1374 28.5361 15.6851 27.4442C15.2328 26.3522 15 25.1819 15 24C15 22.8181 15.2328 21.6478 15.6851 20.5558C16.1374 19.4639 16.8003 18.4718 17.636 17.636C18.4718 16.8003 19.4639 16.1374 20.5558 15.6851C21.6478 15.2328 22.8181 15 24 15C25.1819 15 26.3522 15.2328 27.4442 15.6851C28.5361 16.1374 29.5282 16.8003 30.364 17.636M17.636 30.364C18.4718 31.1997 19.4639 31.8626 20.5558 32.3149C21.6478 32.7672 22.8181 33 24 33C25.1819 33 26.3522 32.7672 27.4442 32.3149C28.5361 31.8626 29.5282 31.1997 30.364 30.364C31.1997 29.5282 31.8626 28.5361 32.3149 27.4442C32.7672 26.3522 33 25.1819 33 24C33 22.8181 32.7672 21.6478 32.3149 20.5558C31.8626 19.4639 31.1997 18.4718 30.364 17.636M17.636 30.364L30.364 17.636'} stroke={themeInk('#DC2626')} strokeWidth={1.5} strokeLinecap={'round'} strokeLinejoin={'round'} /></Svg>;
  if (kind === 'clear') return <Svg width={48} height={48} viewBox={'0 0 48 48'} fill={'none'}><Rect width={48} height={48} rx={8} fill={themeInk('#FEF2F2')} /><Path d={'M31.0001 32.0008H20.5001L16.2901 27.7008C16.1038 27.5134 15.9993 27.26 15.9993 26.9958C15.9993 26.7316 16.1038 26.4782 16.2901 26.2908L26.2901 16.2908C26.4774 16.1045 26.7309 16 26.9951 16C27.2592 16 27.5127 16.1045 27.7001 16.2908L32.7001 21.2908C32.8863 21.4782 32.9909 21.7316 32.9909 21.9958C32.9909 22.26 32.8863 22.5134 32.7001 22.7008L23.5001 32.0008M30.0001 25.3008L23.7001 19.0008'} stroke={themeInk('#DC2626')} strokeWidth={1.5} strokeLinecap={'round'} strokeLinejoin={'round'} /></Svg>;
  return <Svg width={48} height={48} viewBox={'0 0 48 48'} fill={'none'}><Rect width={48} height={48} rx={8} fill={themeInk('#FEF2F2')} /><Path d={'M16 19H32M22 23V29M26 23V29M17 19L18 31C18 31.5304 18.2107 32.0391 18.5858 32.4142C18.9609 32.7893 19.4696 33 20 33H28C28.5304 33 29.0391 32.7893 29.4142 32.4142C29.7893 32.0391 30 31.5304 30 31L31 19M21 19V16C21 15.7348 21.1054 15.4804 21.2929 15.2929C21.4804 15.1054 21.7348 15 22 15H26C26.2652 15 26.5196 15.1054 26.7071 15.2929C26.8946 15.4804 27 15.7348 27 16V19'} stroke={themeInk('#DC2626')} strokeWidth={1.5} strokeLinecap={'round'} strokeLinejoin={'round'} /></Svg>;
}

function ProfileAvatar({profile, contact, presence}: {profile: ChatProfile | null; contact: ConversationContact; presence: 'online' | 'away' | 'offline'}) {
  const uri = profile?.profilePic || contact.thumbnail;
  return <View style={styles.avatarShell}>{uri ? <Image source={{uri}} style={styles.avatar} /> : <View style={[styles.avatar, styles.avatarFallback]}><Text style={styles.avatarInitials}>{initialsOf(profile?.name || contact.name)}</Text></View>}<View style={styles.profileStatusBadge}><AvatarStatusBadge status={presence}/></View></View>;
}

function ActionButton({label, icon, onPress}: {label: string; icon: React.ReactNode; onPress: () => void}) {
  return <Pressable accessibilityLabel={label} onPress={onPress} style={styles.actionButton}><View style={styles.actionIcon}>{icon}</View><Text style={styles.actionLabel}>{label}</Text></Pressable>;
}

function InfoRow({kind, title, subtitle, danger, trailing, onPress}: {kind: RowKind; title: string; subtitle?: string; danger?: boolean; trailing?: React.ReactNode; onPress?: () => void}) {
  return <Pressable accessibilityLabel={title} disabled={!onPress} onPress={onPress} style={styles.infoRow}><View style={[styles.infoIcon, kind !== 'group' && styles.infoTileIcon]}><RowIcon danger={danger} kind={kind} /></View><View style={styles.infoCopy}><Text style={[styles.infoTitle, danger && styles.dangerText]}>{title}</Text>{subtitle ? <Text numberOfLines={2} style={styles.infoSubtitle}>{subtitle}</Text> : null}</View>{trailing || (onPress && !danger ? <Text style={styles.chevron}>›</Text> : null)}</Pressable>;
}

export function ChatProfileScreen({visible, initialPinnedVisible = false, chatId, contact, presenceLabel, onBack, onSearch, onCall, onClearChat, onDeleteChat, onNotice, onTimelineMessage, onOpenPinnedMessage, onForwardPinnedMessages, onDeletePinnedMessage, onPinnedMessageUnpinned, onPinnedMessagesDeletedForMe}: Props) {
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<ChatProfile | null>(null);
  const [pictureOpen, setPictureOpen] = useState(false);
  const [media, setMedia] = useState<ChatMessage[]>([]);
  const [files, setFiles] = useState<ChatMessage[]>([]);
  const [links, setLinks] = useState<SharedLink[]>([]);
  const [pinned, setPinned] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [muted, setMuted] = useState(false);
  const [sharedVisible, setSharedVisible] = useState(false);
  const [sharedTab, setSharedTab] = useState<SharedContentTab>('media');
  const [pinnedVisible, setPinnedVisible] = useState(false);
  const [manageMembersVisible, setManageMembersVisible] = useState(false);
  const [localNotice, setLocalNotice] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const showNotice = useCallback((message: string) => { setLocalNotice(message); onNotice(message); }, [onNotice]);
  const isGroup = contact.kind === 'group';
  // The name saved with Edit Contact wins over the account's own name.
  const shownName = useContactDisplayName(isGroup ? undefined : contact.userId, profile?.name || contact.name);
  const phone = isGroup ? '' : String(contact.phone || profile?.phone || '').trim();
  const copyPhone = useCallback(() => {
    if (!phone) { return; }
    Clipboard.setStringAsync(phone).then(() => showNotice('Phone number copied.')).catch(() => undefined);
  }, [phone, showNotice]);

  useEffect(() => {
    if (!visible) { setPinnedVisible(false); setPictureOpen(false); return; }
    let active = true;
    setPinnedVisible(initialPinnedVisible);
    setLoading(true);
    Promise.allSettled([getChatProfile(contact.userId), getSharedMedia(contact.userId), getChatFiles(chatId), getSharedLinks(contact.userId), getPinnedMessages(chatId), getConversationMuted(chatId), getChatMessages(chatId)]).then(results => {
      if (!active) return;
      if (results[0].status === 'fulfilled') setProfile(results[0].value);
      else setProfile({userId: contact.userId, name: contact.name, profilePic: contact.thumbnail, status: contact.status || presenceLabel, lastSeen: contact.lastSeen, online: presenceLabel === 'Online'});
      setMedia(results[1].status === 'fulfilled' ? results[1].value : []);
      setFiles(results[2].status === 'fulfilled' ? results[2].value : []);
      const remoteLinks = results[3].status === 'fulfilled' ? results[3].value : [];
      const history = results[6].status === 'fulfilled' ? results[6].value : [];
      const fallbackLinks = history.flatMap(message => (message.text.match(/https?:\/\/[^\s]+/gi) || []).map((url, index) => ({id: `${message.id}-link-${index}`, url, createdAt: message.createdAt})));
      setLinks(remoteLinks.length ? remoteLinks : fallbackLinks);
      setPinned(results[4].status === 'fulfilled' ? results[4].value : []);
      setMuted(results[5].status === 'fulfilled' ? results[5].value : false);
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [chatId, contact, initialPinnedVisible, presenceLabel, visible]);

  const openShared = useCallback((tab: SharedContentTab) => { setSharedTab(tab); setSharedVisible(true); }, []);
  const totalShared = media.length + files.length + links.length;
  const mediaPreview = useMemo(() => media.slice(0, 4), [media]);
  const normalizedPresence = presenceLabel.toLowerCase();
  const profilePresence = contact.kind === 'group' || normalizedPresence.startsWith('online') || normalizedPresence.startsWith('typing') ? 'online' : normalizedPresence.startsWith('away') ? 'away' : 'offline';

  const toggleMuted = useCallback(async (next: boolean) => {
    setMuted(next);
    try { await setConversationMuted(chatId, next); showNotice(next ? 'Notifications muted for this conversation.' : 'Notifications unmuted.'); }
    catch { setMuted(!next); showNotice('Unable to update notification preference.'); }
  }, [chatId, showNotice]);

  const confirmReport = useCallback(() => Alert.alert(`Report ${shownName}?`, 'Chatterly will review this report.', [{text: 'Cancel', style: 'cancel'}, {text: 'Report', style: 'destructive', onPress: () => reportChatUser(contact.userId).then(showNotice).catch(error => showNotice(error instanceof Error ? error.message : 'Unable to report user.'))}]), [contact.userId, shownName, showNotice]);
  const confirmBlock = useCallback(() => Alert.alert(`Block ${shownName}?`, 'They will no longer be able to message or call you.', [{text: 'Cancel', style: 'cancel'}, {text: 'Block', style: 'destructive', onPress: () => changeContactBlock({id:contact.userId,name:contact.name,profilePic:contact.thumbnail || undefined}, true).then(() => showNotice('User blocked successfully.')).catch(error => showNotice(error instanceof Error ? error.message : 'Unable to block user.'))}]), [contact.name, contact.thumbnail, contact.userId, shownName, showNotice]);
  const confirmClear = useCallback(() => Alert.alert('Clear chat?', 'Messages cached on this device will be removed. Shared cloud content is not deleted.', [{text: 'Cancel', style: 'cancel'}, {text: 'Clear', style: 'destructive', onPress: () => Promise.resolve(onClearChat()).then(() => showNotice('Chat cleared on this device.')).catch(error => showNotice(error instanceof Error ? error.message : 'Unable to clear chat.'))}]), [onClearChat, showNotice]);
  const confirmDelete = useCallback(() => Alert.alert('Delete chat?', 'This conversation will be removed from your chat list.', [{text: 'Cancel', style: 'cancel'}, {text: 'Delete', style: 'destructive', onPress: () => Promise.resolve(onDeleteChat()).catch(error => showNotice(error instanceof Error ? error.message : 'Unable to delete chat.'))}]), [onDeleteChat, showNotice]);

  return <Modal animationType={'slide'} onRequestClose={onBack} statusBarTranslucent visible={visible}>
    <View accessibilityLabel={`${contact.name} profile`} style={[styles.screen, {paddingTop: insets.top}]}>
      <View style={styles.profileHeader}><Pressable accessibilityLabel={'Back to chat'} onPress={onBack} style={styles.headerButton}><BackArrow /></Pressable>{!isGroup ? <Pressable accessibilityLabel={'Edit Contact'} accessibilityRole={'button'} onPress={() => setEditOpen(true)} style={styles.headerButton}><EditIcon /></Pressable> : null}</View>
      {loading && !profile ? <View style={styles.loading}><ActivityIndicator color={PURPLE} /></View> : <ScrollView contentContainerStyle={[styles.content, {paddingBottom: Math.max(insets.bottom + 22, 30)}]} showsVerticalScrollIndicator={false}>
        <Pressable accessibilityLabel="View contact profile picture" accessibilityRole="button" disabled={!(profile?.profilePic || contact.thumbnail)} onPress={() => setPictureOpen(true)}>
          <ProfileAvatar contact={contact} presence={profilePresence} profile={profile} />
        </Pressable>
        <View style={styles.nameLine}><Text accessibilityRole={'header'} style={styles.name}>{shownName}</Text><View style={styles.verified}><Text style={styles.verifiedText}>✓</Text></View></View>
        {phone ? <Pressable accessibilityHint={'Copies the number'} accessibilityLabel={`Mobile number ${formatPhoneNumber(phone)}`} accessibilityRole={'button'} onLongPress={copyPhone} onPress={copyPhone} style={styles.phoneLine}><Text selectable style={styles.phone}>{formatPhoneNumber(phone)}</Text></Pressable> : null}
        <Text numberOfLines={2} style={styles.about}>{profile?.status && !['online', 'offline', 'away', 'unavailable'].includes(profile.status.toLowerCase()) ? profile.status : 'Hey there! I am using Chatterly'}</Text>

        <View style={styles.actions}>
          <ActionButton icon={<PhoneCallIcon />} label={'Audio'} onPress={() => onCall('audio')} />
          <ActionButton icon={<VideoCallIcon />} label={'Video'} onPress={() => onCall('video')} />
          <ActionButton icon={<MessageIcon />} label={'Message'} onPress={onBack} />
          <ActionButton icon={<ChatSearchIcon />} label={'Search'} onPress={onSearch} />
        </View>

        <View style={styles.sharedHeader}><View><Text style={styles.sharedTitle}>Media, Docs and Links <Text style={styles.sharedCount}>{totalShared}</Text></Text></View><Pressable accessibilityLabel={'View all shared content'} onPress={() => openShared('media')}><Text style={styles.viewAll}>View All</Text></Pressable></View>
        <View style={styles.previewRow}>{mediaPreview.length ? mediaPreview.map(item => <Pressable accessibilityLabel={'Open shared media'} key={item.id} onPress={() => openShared('media')} style={styles.previewTile}>{item.messageType === 'image' || item.thumbnailUrl ? <Image source={{uri: item.thumbnailUrl || item.mediaUrl}} style={styles.previewImage} /> : <View style={[styles.previewImage, styles.previewFallback]}><Text style={styles.previewFallbackText}>{item.messageType === 'video' ? '▶' : '♪'}</Text></View>}</Pressable>) : <Pressable onPress={() => openShared('media')} style={styles.emptyPreview}><Text style={styles.emptyPreviewText}>No shared media yet</Text></Pressable>}</View>

        <View style={styles.divider} />
        {contact.kind === 'group' ? <>
          <InfoRow kind={'group'} onPress={() => setManageMembersVisible(true)} subtitle={'Add, remove and manage member roles.'} title={'Manage Members'} />
          <View style={styles.divider} />
        </> : null}
        <InfoRow kind={'bell'} title={'Mute Notification'} subtitle={'Notification turned on for this chat.'} trailing={<AdminToggle label={'Mute notifications'} onChange={toggleMuted} value={muted} />} />
        <InfoRow kind={'pin'} onPress={() => setPinnedVisible(true)} title={'Pinned Messages'} trailing={<View style={styles.trailing}><Text style={styles.pinCount}>{pinned.length || ''}</Text><Text style={styles.chevron}>›</Text></View>} />
        <InfoRow kind={'shield'} onPress={() => showNotice('Your messages, calls, media and files are protected with end-to-end encryption.')} subtitle={'Turned on, Chat is encrypted.'} title={'End-to-End Encryption'} />
        <View style={styles.divider} />
        <InfoRow danger kind={'report'} onPress={confirmReport} title={`Report ${shownName}`} />
        <InfoRow danger kind={'block'} onPress={confirmBlock} title={`Block ${shownName}`} />
        <InfoRow danger kind={'clear'} onPress={confirmClear} title={'Clear Chat'} />
        <InfoRow danger kind={'delete'} onPress={confirmDelete} title={'Delete Chat'} />
      </ScrollView>}
    </View>
    <SharedContentScreen chatId={chatId} contact={contact} initialTab={sharedTab} onBack={() => setSharedVisible(false)} onNotice={showNotice} visible={sharedVisible} />
    <PinnedMessagesScreen
      chatId={chatId}
      contactName={contact.name}
      initialMessages={pinned}
      onBack={() => setPinnedVisible(false)}
      onDelete={message => { onBack(); onDeletePinnedMessage?.(message); }}
      onDeletedForMe={messageIds => {
        setPinned(current => current.filter(message => !messageIds.includes(message.id)));
        onPinnedMessagesDeletedForMe?.(messageIds);
      }}
      onForward={selectedMessages => { onBack(); onForwardPinnedMessages?.(selectedMessages); }}
      onNotice={showNotice}
      onOpenInChat={message => { onBack(); onOpenPinnedMessage?.(message); }}
      onUnpinned={messageId => {
        setPinned(current => current.filter(message => message.id !== messageId));
        onPinnedMessageUnpinned?.(messageId);
      }}
      visible={pinnedVisible}
    />
    <ManageGroupMembersScreen groupId={contact.userId || chatId} onBack={() => setManageMembersVisible(false)} onNotice={showNotice} onTimelineMessage={onTimelineMessage} visible={manageMembersVisible} />
    {!isGroup ? <EditContactSheet name={shownName} onClose={() => setEditOpen(false)} onSaved={message => { setEditOpen(false); showNotice(message); }} phone={phone} userId={contact.userId} visible={editOpen} /> : null}
    <ProfilePictureViewer uri={profile?.profilePic || contact.thumbnail} name={shownName} visible={visible && pictureOpen} onClose={() => setPictureOpen(false)} />
    <Snackbar message={localNotice} onHide={() => setLocalNotice('')} />
  </Modal>;
}

const styles = createThemedStyles({
  screen:{flex:1,backgroundColor:'#F6F6F7'},profileHeader:{height:43,paddingHorizontal:8,backgroundColor:'#FFF',flexDirection:'row',alignItems:'center',justifyContent:'space-between'},phoneLine:{marginTop:5,alignSelf:'center',paddingHorizontal:6,paddingVertical:2},phone:{color:'#344256',fontFamily:FONT,fontSize:11,fontWeight:'500',textAlign:'center'},headerButton:{width:38,height:42,alignItems:'center',justifyContent:'center'},loading:{flex:1,alignItems:'center',justifyContent:'center'},content:{marginHorizontal:10,paddingHorizontal:15,paddingTop:9,backgroundColor:'#FFF'},
  avatarShell:{position:'relative',alignSelf:'center'},avatar:{width:72,height:72,borderRadius:12},avatarFallback:{backgroundColor:'#EEE8FA',alignItems:'center',justifyContent:'center'},avatarInitials:{color:PURPLE,fontSize:20,fontWeight:'700'},profileStatusBadge:{position:'absolute',right:-3,bottom:-3},
  nameLine:{marginTop:10,flexDirection:'row',alignItems:'center',justifyContent:'center'},name:{color:'#141B28',fontFamily:FONT,fontSize:15,fontWeight:'600'},verified:{width:13,height:13,marginLeft:4,borderRadius:7,backgroundColor:'#22B573',alignItems:'center',justifyContent:'center'},verifiedText:{color:'#FFF',fontSize:8,fontWeight:'800'},about:{marginTop:7,color:'#758196',fontFamily:FONT,fontSize:9,lineHeight:13,textAlign:'center'},
  actions:{marginTop:19,flexDirection:'row',justifyContent:'space-between'},actionButton:{width:'23%',alignItems:'center'},actionIcon:{width:51,height:39,borderWidth:1,borderColor:'#E7EAF0',borderRadius:8,alignItems:'center',justifyContent:'center'},actionLabel:{marginTop:6,color:'#263448',fontFamily:FONT,fontSize:8.5},
  sharedHeader:{marginTop:22,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},sharedTitle:{color:'#172033',fontFamily:FONT,fontSize:10,fontWeight:'600'},sharedCount:{color:PURPLE},viewAll:{color:PURPLE,fontFamily:FONT,fontSize:9,fontWeight:'600'},previewRow:{height:76,marginTop:10,flexDirection:'row',gap:5},previewTile:{flex:1,overflow:'hidden',borderRadius:6,backgroundColor:'#E1E4E9'},previewImage:{width:'100%',height:'100%'},previewFallback:{alignItems:'center',justifyContent:'center',backgroundColor:'#30394A'},previewFallbackText:{color:'#FFF',fontSize:18},emptyPreview:{flex:1,borderWidth:1,borderColor:'#ECEEF2',borderRadius:6,alignItems:'center',justifyContent:'center'},emptyPreviewText:{color:'#8792A4',fontSize:9},
  divider:{height:8,marginHorizontal:-15,marginTop:15,backgroundColor:'#F6F6F7'},infoRow:{minHeight:57,flexDirection:'row',alignItems:'center'},infoIcon:{width:29,alignItems:'flex-start'},infoTileIcon:{width:60},infoCopy:{flex:1,minWidth:0},infoTitle:{color:'#172033',fontFamily:FONT,fontSize:10.5,fontWeight:'500'},infoSubtitle:{marginTop:4,color:'#8792A4',fontFamily:FONT,fontSize:7.5,lineHeight:11},dangerText:{color:RED},chevron:{marginLeft:8,color:'#8792A4',fontSize:17},trailing:{flexDirection:'row',alignItems:'center'},pinCount:{color:PURPLE,fontSize:9},
});
