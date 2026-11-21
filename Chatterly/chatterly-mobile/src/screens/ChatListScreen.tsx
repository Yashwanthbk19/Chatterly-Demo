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
  Image,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, {Circle, Defs, LinearGradient, Path, Rect, Stop} from 'react-native-svg';
import {
  CallsTabIcon,
  ChatTabIcon,
  ContactTabIcon,
  MoreIcon,
  SearchIcon,
  SettingsTabIcon,
} from '../components/ContactsIcons';
import { ChatLogo } from '../components/ChatLogo';
import { Snackbar } from '../components/Snackbar';
import {useContactAliases} from '../services/contactAliases';
import {
  ClockStatusIcon,
  DoubleCheckIcon,
  SingleCheckIcon,
} from '../components/ChatIcons';
import {
  archiveChat,
  deleteChat,
  enrichChatList,
  getChatList,
  markChatUnread,
  normalizeChatList,
  pinChatThread,
  searchChatContacts,
  unpinChatThread,
} from '../services/chatApi';
import { subscribeToInbox, subscribeToOnlineUsers } from '../services/chatRealtime';
import {pinGroupThread, searchGroups, unpinGroupThread} from '../services/groupApi';
import {getConversationMuted, setConversationMuted} from '../services/conversationPreferences';
import {setApplicationBadge} from '../services/notificationService';
import {publishUnreadChatCount, unreadMessageCount} from '../services/unreadBadge';
import {getBroadcastLists, type BroadcastList} from '../services/broadcastApi';
import type { ChatListItem, ChatMessage, ConversationContact } from '../types/chat';
import { mergeStatus, normalizeStatus, statusLabel } from '../utils/messageStatus';
import { messagePreview } from '../utils/messagePreview';
import {createThemedStyles, themeInk} from '../theme/themedStyles';
import {getSession} from '../services/sessionStore';
import {clearChatListActivity, getChatListActivities, mergeChatListActivities, subscribeToChatListActivity} from '../services/chatListActivity';
import {cacheNotificationAvatars} from '../services/notificationAvatarCache';

type Props = {
  onCreateContact?: () => void;
  onCreateGroup?: () => void;
  onCreateBroadcast?: () => void;
  onOpenContacts: () => void;
  onOpenConversation: (contact: ConversationContact, chatId: string) => void;
  onOpenBroadcast?: (broadcast: BroadcastList) => void;
  onOpenCalls?: () => void;
  onOpenSettings?: (initialScreen?: 'settings' | 'edit') => void;
  noticeMessage?: string;
  onNoticeConsumed?: () => void;
};
type Filter = 'All' | 'Unread' | 'Groups' | 'Pinned';
type SearchFilter = 'Unread' | 'Groups' | 'Photos' | 'Videos' | 'Files';
type Action = 'delete' | 'mute' | 'pin' | 'archive' | 'unread';
const PURPLE = '#6F28F5';
const FONT = Platform.select({ android: 'sans-serif', ios: 'System' });

function messageTime(value: string | undefined): number {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Direct-chat unread totals from /chats/list are provisional until the message
 * detail pass can remove the receiver-facing missed-call copy that the call
 * service also exposes to the caller. Keep a previously verified count during
 * refreshes; on a fresh mount, do not briefly render an unverified number.
 */
export function provisionalChatListRows(
  rows: ChatListItem[],
  current: ChatListItem[],
): ChatListItem[] {
  const currentById = new Map(current.map(chat => [chat.id, chat]));
  return rows.map(chat => {
    if (chat.contact.kind === 'group' || chat.unreadCount <= 0) { return chat; }
    const previous = currentById.get(chat.id);
    return {
      ...chat,
      unreadCount: previous
        ? Math.min(chat.unreadCount, Math.max(0, previous.unreadCount))
        : 0,
    };
  });
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map(value => value[0])
    .join('')
    .toUpperCase();
}
function SearchIllustration() {
  return <Svg width={88} height={88} viewBox="0 0 88 88" fill="none"><Defs><LinearGradient id="searchLens" x1="19" y1="15" x2="69" y2="72"><Stop stopColor="#EEF9FF"/><Stop offset={1} stopColor="#B8DDF1"/></LinearGradient></Defs><Circle cx={37} cy={35} r={22} fill="url(#searchLens)"/><Circle cx={37} cy={35} r={15} fill={themeInk('#FFFFFF')}/><Path d="m52 51 19 19" stroke={themeInk('#C6E5F5')} strokeWidth={10} strokeLinecap="round"/><Path d="m52 51 19 19" stroke={themeInk('#D8EDF8')} strokeWidth={6} strokeLinecap="round"/></Svg>;
}
function SelectionIcon({type}: {type: 'pin' | 'mute' | 'archive' | 'delete'}) {
  if (type === 'pin') { return <Svg width={24} height={24} viewBox="0 0 24 24" fill="none"><Path d="M9 4V10L7 14V16H17V14L15 10V4M12 16V21M8 4H16" stroke={themeInk('#0B1220')} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/></Svg>; }
  if (type === 'mute') { return <Svg width={24} height={24} viewBox="0 0 24 24" fill="none"><Path d="M9.346 5.353C9.556 5.22433 9.774 5.10667 10 5C10 4.46957 10.2107 3.96086 10.5858 3.58579C10.9609 3.21071 11.4696 3 12 3C12.5304 3 13.0391 3.21071 13.4142 3.58579C13.7893 3.96086 14 4.46957 14 5C15.1484 5.54303 16.1274 6.38833 16.8321 7.4453C17.5367 8.50227 17.9404 9.73107 18 11V14M17 17H4C4.54494 16.6914 5.00981 16.2592 5.35719 15.7381C5.70457 15.2171 5.92474 14.6217 6 14V11C6.06268 9.66832 6.50432 8.38223 7.273 7.293M9 17V18C9 18.7956 9.31607 19.5587 9.87868 20.1213C10.4413 20.6839 11.2044 21 12 21C12.7956 21 13.5587 20.6839 14.1213 20.1213C14.6839 19.5587 15 18.7956 15 18V17M3 3L21 21" stroke={themeInk('#0B1220')} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/></Svg>; }
  if (type === 'archive') { return <Svg width={24} height={24} viewBox="0 0 24 24" fill="none"><Path d="M19 8C19.5304 8 20.0391 7.78929 20.4142 7.41421C20.7893 7.03914 21 6.53043 21 6C21 5.46957 20.7893 4.96086 20.4142 4.58579C20.0391 4.21071 19.5304 4 19 4H5C4.46957 4 3.96086 4.21071 3.58579 4.58579C3.21071 4.96086 3 5.46957 3 6C3 6.53043 3.21071 7.03914 3.58579 7.41421C3.96086 7.78929 4.46957 8 5 8M19 8H5M19 8V18C19 18.5304 18.7893 19.0391 18.4142 19.4142C18.0391 19.7893 17.5304 20 17 20H7C6.46957 20 5.96086 19.7893 5.58579 19.4142C5.21071 19.0391 5 18.5304 5 18V8M10 12H14" stroke={themeInk('#0B1220')} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/></Svg>; }
  return <Svg width={24} height={24} viewBox="0 0 24 24" fill="none"><Path d="M4 7H20M10 11V17M14 11V17M5 7L6 19C6 19.5304 6.21071 20.0391 6.58579 20.4142C6.96086 20.7893 7.46957 21 8 21H16C16.5304 21 17.0391 20.7893 17.4142 20.4142C17.7893 20.0391 18 19.5304 18 19L19 7M9 7V4C9 3.73478 9.10536 3.48043 9.29289 3.29289C9.48043 3.10536 9.73478 3 10 3H14C14.2652 3 14.5196 3.10536 14.7071 3.29289C14.8946 3.48043 15 3.73478 15 4V7" stroke={themeInk('#DC2626')} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/></Svg>;
}
function ChatStateIcon({type}: {type: 'pin' | 'mute'}) {
  return <View accessibilityLabel={type === 'pin' ? 'Pinned chat' : 'Muted chat'} style={styles.chatStateIcon}>
    <Svg width={12} height={12} viewBox="0 0 16 16" fill="none">
      {type === 'pin'
        ? <Path d="M5.5 2.5h5L9.7 6l1.8 2v.8H4.5V8l1.8-2-0.8-3.5ZM8 8.8v5" stroke={themeInk('#647086')} strokeWidth={1.35} strokeLinecap="round" strokeLinejoin="round"/>
        : <Path d="M6 11.2H3.2l1.1-1.3V7a3.7 3.7 0 0 1 6.2-2.7M11.7 7v2.9l1.1 1.3H8.3M6.5 13h3M2 2l12 12" stroke={themeInk('#647086')} strokeWidth={1.35} strokeLinecap="round" strokeLinejoin="round"/>}
    </Svg>
  </View>;
}
function PinToastIcon() {
  return <Svg width={20} height={20} viewBox="0 0 24 24" fill="none"><Path d="M5 5.5h14a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3h-7l-5.5 3v-3H5a3 3 0 0 1-3-3v-6a3 3 0 0 1 3-3Z" stroke={themeInk('#263238')} strokeWidth={1.7} strokeLinejoin="round"/><Circle cx={8} cy={11.5} r={1} fill={themeInk('#263238')}/><Circle cx={12} cy={11.5} r={1} fill={themeInk('#263238')}/><Circle cx={16} cy={11.5} r={1} fill={themeInk('#263238')}/></Svg>;
}
function PinToast({message, bottom}: {message: string; bottom: number}) {
  if (!message) return null;
  return <View accessibilityLabel={message} accessibilityLiveRegion="polite" style={[styles.pinToast, {bottom}]}><PinToastIcon/><Text style={styles.pinToastText}>{message}</Text></View>;
}
function UnreadDot() { return <View accessibilityLabel="Marked unread" style={styles.unreadDot}><Svg width={8} height={20} viewBox="0 0 8 20" fill="none"><Rect y={6} width={8} height={8} rx={4} fill={themeInk('#8B5CF6')} /></Svg></View>; }
function PlusIcon() { return <Svg width={22} height={22} viewBox="0 0 24 24" fill="none"><Path d="M12 5v14M5 12h14" stroke={themeInk('#111827')} strokeWidth={1.5} strokeLinecap="round"/></Svg>; }
function CloseIcon() { return <Svg width={20} height={20} viewBox="0 0 24 24" fill="none"><Path d="m6 6 12 12M18 6 6 18" stroke={themeInk('#111827')} strokeWidth={1.35} strokeLinecap="round"/></Svg>; }
function CreateActionIcon({kind}: {kind: 'contact' | 'group' | 'broadcast'}) {
  if (kind === 'contact') return <Svg width={22} height={22} viewBox="0 0 24 24" fill="none"><Circle cx={9} cy={8} r={3} stroke={themeInk('#111827')} strokeWidth={1.35}/><Path d="M3.5 19c.4-3.7 2.2-5.5 5.5-5.5 2.2 0 3.8.8 4.7 2.4M18 12.5v7M14.5 16h7" stroke={themeInk('#111827')} strokeWidth={1.35} strokeLinecap="round"/></Svg>;
  if (kind === 'group') return <Svg width={22} height={22} viewBox="0 0 24 24" fill="none"><Circle cx={8} cy={8} r={2.6} stroke={themeInk('#111827')} strokeWidth={1.35}/><Circle cx={16} cy={8} r={2.6} stroke={themeInk('#111827')} strokeWidth={1.35}/><Path d="M3.5 18c.4-3 1.9-4.5 4.5-4.5s4.1 1.5 4.5 4.5M12.5 14.1c.8-.4 1.8-.6 3-.6 2.6 0 4.1 1.5 4.5 4.5" stroke={themeInk('#111827')} strokeWidth={1.35} strokeLinecap="round"/></Svg>;
  return <Svg width={44} height={44} viewBox="0 0 48 48" fill="none"><Path d="M0 8C0 3.58172 3.58172 0 8 0H40C44.4183 0 48 3.58172 48 8V40C48 44.4183 44.4183 48 40 48H8C3.58172 48 0 44.4183 0 40V8Z" fill={themeInk('#FAFAFA')}/><Path d="M20 33V32C20 31.4696 20.2107 30.9609 20.5858 30.5858C20.9609 30.2107 21.4696 30 22 30H26C26.5304 30 27.0391 30.2107 27.4142 30.5858C27.7893 30.9609 28 31.4696 28 32V33M29 22H31C31.5304 22 32.0391 22.2107 32.4142 22.5858C32.7893 22.9609 33 23.4696 33 24V25M15 25V24C15 23.4696 15.2107 22.9609 15.5858 22.5858C15.9609 22.2107 16.4696 22 17 22H19M22 25C22 25.5304 22.2107 26.0391 22.5858 26.4142C22.9609 26.7893 23.4696 27 24 27C24.5304 27 25.0391 26.7893 25.4142 26.4142C25.7893 26.0391 26 25.5304 26 25C26 24.4696 25.7893 23.9609 25.4142 23.5858C25.0391 23.2107 24.5304 23 24 23C23.4696 23 22.9609 23.2107 22.5858 23.5858C22.2107 23.9609 22 24.4696 22 25ZM27 17C27 17.5304 27.2107 18.0391 27.5858 18.4142C27.9609 18.7893 28.4696 19 29 19C29.5304 19 30.0391 18.7893 30.4142 18.4142C30.7893 18.0391 31 17.5304 31 17C31 16.4696 30.7893 15.9609 30.4142 15.5858C30.0391 15.2107 29.5304 15 29 15C28.4696 15 27.9609 15.2107 27.5858 15.5858C27.2107 15.9609 27 16.4696 27 17ZM17 17C17 17.5304 17.2107 18.0391 17.5858 18.4142C17.9609 18.7893 18.4696 19 19 19C19.5304 19 20.0391 18.7893 20.4142 18.4142C20.7893 18.0391 21 17.5304 21 17C21 16.4696 20.7893 15.9609 20.4142 15.5858C20.0391 15.2107 19.5304 15 19 15C18.4696 15 17.9609 15.2107 17.5858 15.5858C17.2107 15.9609 17 16.4696 17 17Z" stroke={themeInk('#0B1220')} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/></Svg>;
}
const hasUnread = (chat: ChatListItem) => chat.unreadCount > 0 || chat.markedUnread;
function timeLabel(value: string) {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return '';
  }
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  return date.toDateString() === yesterday.toDateString()
    ? 'Yesterday'
    : date.toLocaleDateString();
}

/**
 * The Story 2 ticks, shown on a list row. Only our own outgoing preview gets
 * one - a row whose last message came from the other person has no status of
 * ours to report, which is why the previous fixed double tick was misleading.
 */
function PreviewTicks({ chat }: { chat: ChatListItem }) {
  if (!chat.lastMessageIsOwn || !chat.lastMessage) {
    return null;
  }
  const state = normalizeStatus(chat.lastMessageStatus);
  return (
    <View accessibilityLabel={statusLabel(state)} style={styles.previewTicks}>
      {state === 'pending' || state === 'failed' ? (
        <ClockStatusIcon />
      ) : state === 'sent' ? (
        <SingleCheckIcon />
      ) : (
        <DoubleCheckIcon read={state === 'read'} />
      )}
    </View>
  );
}

function Avatar({ chat }: { chat: ChatListItem }) {
  const online = chat.contact.status === 'online';
  return (
    <View>
      {chat.contact.thumbnail ? (
        <Image source={{ uri: chat.contact.thumbnail }} style={styles.avatar} />
      ) : (
        <View style={styles.avatarFallback}>
          <Text style={styles.initials}>{initials(chat.contact.name)}</Text>
        </View>
      )}
      {chat.contact.kind !== 'group' && <View accessibilityLabel={`${chat.contact.name}: ${online ? 'Online' : 'Offline'}`} style={[styles.onlineBadge, !online && styles.offlineBadge]}>
        <Text style={styles.onlineTick}>{online ? '✓' : '×'}</Text>
      </View>}
    </View>
  );
}

function BroadcastRow({broadcast, onOpen}: {broadcast: BroadcastList; onOpen: () => void}) {
  return <Pressable accessibilityLabel={`Open broadcast ${broadcast.name}`} accessibilityRole="button" onPress={onOpen} style={styles.broadcastRow}>
    <View style={styles.broadcastAvatar}>{broadcast.imageUri ? <Image accessibilityLabel={`${broadcast.name} broadcast picture`} source={{uri: broadcast.imageUri}} style={styles.broadcastAvatarImage}/> : <CreateActionIcon kind="broadcast"/>}</View>
    <View style={styles.rowCopy}>
      <View style={styles.rowTop}><Text numberOfLines={1} style={styles.name}>{broadcast.name}</Text><Text style={styles.broadcastTag}>Broadcast</Text></View>
      <Text numberOfLines={1} style={styles.message}>{broadcast.participants.length} {broadcast.participants.length === 1 ? 'recipient' : 'recipients'} · One-way messaging</Text>
    </View>
  </Pressable>;
}

function SwipeRow({
  chat,
  typing,
  pinned,
  muted,
  selected,
  onOpen,
  onSelect,
  onAction,
}: {
  chat: ChatListItem;
  typing: boolean;
  pinned: boolean;
  muted: boolean;
  selected: boolean;
  onOpen: () => void;
  onSelect: () => void;
  onAction: (action: Action) => void;
}) {
  const x = useRef(new Animated.Value(0)).current;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        !selectedRef.current && Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderMove: (_, g) =>
        x.setValue(Math.max(-272, Math.min(0, g.dx))),
      onPanResponderRelease: (_, g) =>
        Animated.spring(x, {
          toValue: g.dx < -55 ? -272 : 0,
          useNativeDriver: true,
        }).start(),
      onPanResponderTerminate: () =>
        Animated.spring(x, {toValue: 0, useNativeDriver: true}).start(),
    }),
  ).current;
  useEffect(() => {
    if (selected) {
      x.stopAnimation();
      x.setValue(0);
    }
  }, [selected, x]);
  const act = (action: Action) => {
    Animated.spring(x, { toValue: 0, useNativeDriver: true }).start();
    onAction(action);
  };
  const select = () => {
    x.stopAnimation();
    x.setValue(0);
    onSelect();
  };
  return (
    <View style={[styles.swipeShell, selected && styles.swipeShellSelected]}>
      {!selected && <View style={styles.actions}>
        {(
          [
            ['delete', 'Delete', '#EF4444'],
            ['mute', muted ? 'Unmute' : 'Mute', '#64748B'],
            ['pin', pinned ? 'Unpin' : 'Pin', '#8B5CF6'],
            ['archive', 'Archive', '#334155'],
          ] as const
        ).map(([action, label, color]) => (
          <Pressable
            accessibilityLabel={`${label} ${chat.contact.name}`}
            key={action}
            onPress={() => act(action)}
            style={[styles.action, { backgroundColor: color }]}
          >
            <Text style={styles.actionIcon}>
              {action === 'delete' ? '×' : action === 'pin' ? '⌖' : '□'}
            </Text>
            <Text style={styles.actionText}>{label}</Text>
          </Pressable>
        ))}
      </View>}
      <Animated.View
        {...pan.panHandlers}
        style={{ transform: [{ translateX: x }] }}
      >
        <Pressable
          accessibilityLabel={`Open chat with ${chat.contact.name}`}
          onLongPress={select}
          onPress={onOpen}
          style={[styles.row, selected && styles.rowSelected]}
        >
          <Avatar chat={chat} />
          <View style={styles.rowCopy}>
            <View style={styles.rowTop}>
              <Text numberOfLines={1} style={styles.name}>
                {chat.contact.name}
              </Text>
              <View style={styles.rowMeta}>
                {muted && <ChatStateIcon type="mute"/>}
                {pinned && <ChatStateIcon type="pin"/>}
                <Text style={[styles.time, hasUnread(chat) && styles.timeUnread]}>
                  {timeLabel(chat.lastMessageAt)}
                </Text>
              </View>
            </View>
            <View style={styles.rowBottom}>
              <View style={styles.preview}>
                {!typing && <PreviewTicks chat={chat} />}
                {typing ? <Text
                  accessibilityLabel={`${chat.contact.name} is typing`}
                  accessibilityLiveRegion="polite"
                  numberOfLines={1}
                  style={[styles.message, styles.typingMessage]}
                >Typing…</Text> :
                <Text numberOfLines={1} style={styles.message}>
                  {muted ? 'Muted · ' : ''}
                  {chat.contact.kind === 'group' && chat.contact.status ? `${chat.contact.status} · ` : ''}
                  {chat.lastMessage ||
                    (chat.contact.kind === 'group' ? 'No messages yet' : chat.contact.status) ||
                    'Start a conversation'}
                </Text>}
              </View>
              {chat.unreadCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
                  </Text>
                </View>
              )}
              {chat.unreadCount === 0 && chat.markedUnread && <UnreadDot />}
            </View>
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

function HeaderProfileImage({uri}: {uri?: string | null}) {
  const [failedUri, setFailedUri] = useState('');
  const photo = (uri || '').trim();
  const comparable = photo.split(/[?#]/, 1)[0].toLowerCase();
  const isDefault = !comparable || ['null', 'undefined'].includes(comparable)
    || comparable.includes('ui-avatars.com') || comparable.endsWith('/assets/image.png');
  const showPhoto = !isDefault && photo !== failedUri;
  return <Image accessibilityLabel="Your profile picture"
    source={showPhoto ? {uri: photo} : require('../assets/default-profile.png')}
    resizeMode={showPhoto ? 'cover' : 'contain'} style={styles.profile}
    onError={showPhoto ? () => setFailedUri(photo) : undefined} />;
}

export function ChatListScreen({
  onCreateContact,
  onCreateGroup,
  onCreateBroadcast,
  onOpenContacts,
  onOpenConversation,
  onOpenBroadcast,
  onOpenCalls,
  onOpenSettings,
  noticeMessage,
  onNoticeConsumed,
}: Props): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const [storedChats, setChats] = useState<ChatListItem[]>([]);
  const [typingIds, setTypingIds] = useState<ReadonlySet<string>>(new Set());
  const ownerId = String(getSession()?.user?.id || '');
  const [onlineIds, setOnlineIds] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => subscribeToOnlineUsers(setOnlineIds), []);
  // A name saved with Edit Contact replaces the account's name on its row.
  const contactNames = useContactAliases();
  const chats = useMemo(() => storedChats.map(chat => chat.contact.kind === 'group' ? chat : {
    ...chat, contact: {...chat.contact, name: contactNames[chat.contact.userId] || chat.contact.name, status: onlineIds.has(chat.contact.userId) ? 'online' : 'offline'},
  }), [storedChats, onlineIds, contactNames]);
  const [broadcasts, setBroadcasts] = useState<BroadcastList[]>([]);
  // Socket handlers need to know whether a row already exists *before* they
  // dispatch, and a state updater runs too late to answer that.
  const chatsRef = useRef<ChatListItem[]>([]);
  chatsRef.current = chats;
  useEffect(() => {
    setApplicationBadge(chats.reduce((sum, chat) => sum + (chat.unreadCount > 0 ? chat.unreadCount : chat.markedUnread ? 1 : 0), 0));
  }, [chats]);
  const [loading, setLoading] = useState(true);
  // The Chats tab shows the unread messages on every tab bar. It waits for the
  // rows to arrive, so reopening this screen neither flashes the badge off while
  // they load nor zeroes it when they cannot be loaded at all.
  const [rowsLoaded, setRowsLoaded] = useState(false);
  useEffect(() => {
    if (rowsLoaded) { publishUnreadChatCount(unreadMessageCount(chats)); }
  }, [chats, rowsLoaded]);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState('');
  const [pinToast, setPinToast] = useState('');
  useEffect(() => {
    if (!pinToast) return;
    const timer = setTimeout(() => setPinToast(''), 2500);
    return () => clearTimeout(timer);
  }, [pinToast]);
  useEffect(() => {
    if (!noticeMessage) return;
    setNotice(noticeMessage);
    onNoticeConsumed?.();
  }, [noticeMessage, onNoticeConsumed]);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [matchedUserIds, setMatchedUserIds] = useState<Set<string>>(new Set());
  const [searchFilter, setSearchFilter] = useState<SearchFilter | null>(null);
  const [filter, setFilter] = useState<Filter>('All');
  const [pinned, setPinned] = useState<Set<string>>(new Set());
  const [muted, setMuted] = useState<Set<string>>(new Set());
  const [selectedChatId, setSelectedChatId] = useState('');
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [chatOptionsOpen, setChatOptionsOpen] = useState(false);
  const [groupSearchRows, setGroupSearchRows] = useState<ChatListItem[] | null>(null);
  const load = useCallback(async (refresh = false) => {
    if (!refresh) setLoading(true);
    try {
      const [chatRecords, broadcastRows] = await Promise.all([
        getChatList(),
        getBroadcastLists().catch(error => {
          setNotice(error instanceof Error ? error.message : 'Unable to load broadcasts.');
          return [];
        }),
      ]);
      setBroadcasts(broadcastRows);
      const backendRows = normalizeChatList(chatRecords);
      // The list endpoint can expose a newly-created conversation before its
      // last-message aggregation catches up. Keep the confirmed local handoff
      // until the backend row contains that message (or a newer one), otherwise
      // the person can disappear from Recents immediately after sending.
      const recentActivity = new Map(
        getChatListActivities(ownerId).map(activity => [activity.chatId, activity]),
      );
      backendRows.forEach(chat => {
        const activity = recentActivity.get(chat.id);
        if (activity && messageTime(chat.lastMessageAt) >= messageTime(activity.createdAt)) {
          clearChatListActivity(ownerId, chat.id);
        }
      });
      const rows = mergeChatListActivities(backendRows, ownerId);
      // Show the rows as soon as they arrive, then fill in the names, previews
      // and ticks the list endpoint leaves unpopulated. Rendering in two passes
      // keeps the list from waiting on one lookup per conversation.
      // /chats/list can count the mirrored receiver copy of our own unanswered
      // call. The message-detail pass below identifies that copy. Rendering the
      // raw count first caused a visible "1" every time Chats remounted, then
      // removed it a moment later. Rows still render immediately, but direct
      // unread totals remain at their last verified value until enrichment.
      setChats(current => provisionalChatListRows(rows, current));
      setRowsLoaded(true);
      setPinned(new Set(rows.filter(chat => chat.pinned).map(chat => chat.id)));
      const mutedIds = await Promise.all(rows.map(async chat => ({id: chat.id, muted: await getConversationMuted(chat.id)})));
      setMuted(new Set(mutedIds.filter(chat => chat.muted).map(chat => chat.id)));
      if (!refresh) setLoading(false);

      // Enrich the raw backend rows before folding in local outgoing-message
      // activity. This lets the actual latest message (including an incoming
      // one) win if it arrived after the last locally cached send.
      const enrichedRows = await enrichChatList(backendRows);
      cacheNotificationAvatars(enrichedRows.map(chat => chat.contact)).catch(() => undefined);
      const enriched = new Map(enrichedRows.map(chat => [chat.id, chat]));
      // Merged rather than assigned: a message can arrive over the socket while
      // those lookups are in flight, and replacing the state outright would
      // throw that newer preview away.
      setChats(current => mergeChatListActivities(current.map(chat => {
        const detail = enriched.get(chat.id);
        if (!detail) { return chat; }
        const detailIsNewest = messageTime(detail.lastMessageAt) >= messageTime(chat.lastMessageAt);
        return {
          ...chat,
          contact: detail.contact,
          lastMessage: detailIsNewest ? detail.lastMessage || chat.lastMessage : chat.lastMessage || detail.lastMessage,
          lastMessageAt: detailIsNewest ? detail.lastMessageAt || chat.lastMessageAt : chat.lastMessageAt || detail.lastMessageAt,
          lastMessageId: detailIsNewest ? detail.lastMessageId || chat.lastMessageId : chat.lastMessageId || detail.lastMessageId,
          lastMessageIsOwn: detailIsNewest ? detail.lastMessageIsOwn : chat.lastMessage ? chat.lastMessageIsOwn : detail.lastMessageIsOwn,
          lastMessageStatus: detailIsNewest ? detail.lastMessageStatus || chat.lastMessageStatus : chat.lastMessageStatus || detail.lastMessageStatus,
          // The enrichment pass removes the receiver-specific mirrored missed
          // copy created for an outgoing offline call. Apply that corrected
          // count only while this backend detail is still the newest row, so a
          // genuinely newer socket message cannot lose its unread badge.
          unreadCount: detailIsNewest ? detail.unreadCount : chat.unreadCount,
        };
      }), ownerId));
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : 'Unable to load chats.',
      );
    } finally {
      if (!refresh) setLoading(false);
    }
  }, [ownerId]);
  const refreshChats = useCallback(async () => {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  }, [load]);
  useEffect(() => {
    load();
  }, [load]);

  useEffect(
    () => subscribeToChatListActivity(activity => {
      if (activity.ownerId === ownerId) {
        setChats(current => mergeChatListActivities(current, ownerId));
      }
    }),
    [ownerId],
  );

  // Sprint 3 Story 1 asks for real-time delivery, which has to reach the list
  // and not just an open conversation. The server auto-joins every one-to-one
  // room when this device registers, so a message in any chat lands here: the
  // matching row moves its preview, timestamp, unread badge and ticks without
  // a refetch, and a message from someone with no row yet triggers one reload
  // so the new conversation appears.
  useEffect(
    () =>
      subscribeToInbox({
        onTyping: (userId, typing) => setTypingIds(current => {
          const next = new Set(current);
          if (typing) { next.add(userId); } else { next.delete(userId); }
          return next;
        }),
        onMessage: (message: ChatMessage) => {
          // Call logs can contain paired audience-specific records. Reconcile
          // their unread count through the API instead of treating each as a new chat message.
          if (message.messageType === 'call') {
            load();
            return;
          }
          const belongsToChat = (chat: ChatListItem) =>
            message.chatId ? chat.id === message.chatId : chat.contact.userId === message.contactId;

          // A message from someone with no row yet means a conversation the
          // list has never seen, so the only way to render it is a refetch.
          if (!chatsRef.current.some(belongsToChat)) {
            load();
            return;
          }

          setChats(current =>
            current
              .map(chat =>
                belongsToChat(chat)
                  ? {
                      ...chat,
                      lastMessage: messagePreview(message) || chat.lastMessage,
                      lastMessageAt: message.createdAt,
                      lastMessageId: message.id,
                      lastMessageIsOwn: message.isOwn,
                      // A new message starts its own ladder; an echo of the one
                      // already on the row must never pull its ticks back down
                      // below a receipt that has already landed.
                      lastMessageStatus: chat.lastMessageId === message.id
                        ? mergeStatus(chat.lastMessageStatus, message.status)
                        : message.status || 'sent',
                      // Our own echo is not unread.
                      unreadCount: message.isOwn ? chat.unreadCount : chat.unreadCount + 1,
                      markedUnread: message.isOwn ? chat.markedUnread : false,
                    }
                  : chat,
              )
              .sort((a, b) => Date.parse(b.lastMessageAt || '') - Date.parse(a.lastMessageAt || '')),
          );
        },
        onDelivered: messageId =>
          setChats(current =>
            current.map(chat =>
              chat.lastMessageId === messageId
                ? { ...chat, lastMessageStatus: mergeStatus(chat.lastMessageStatus, 'delivered') }
                : chat,
            ),
          ),
        onRead: (readChatId, messageIds) =>
          setChats(current =>
            current.map(chat => {
              const isTarget = readChatId
                ? chat.id === readChatId
                : messageIds.includes(chat.lastMessageId);
              if (!isTarget) { return chat; }
              return {
                ...chat,
                unreadCount: 0,
                markedUnread: false,
                lastMessageStatus: chat.lastMessageIsOwn
                  ? mergeStatus(chat.lastMessageStatus, 'read')
                  : chat.lastMessageStatus,
              };
            }),
          ),
      }),
    [load],
  );

  useEffect(() => {
    if (!searching || !query.trim()) {
      setMatchedUserIds(new Set());
      setSearchLoading(false);
      return;
    }
    let active = true;
    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const contacts = await searchChatContacts(query);
        if (active) { setMatchedUserIds(new Set(contacts.map(contact => contact.userId))); }
      } catch (error) {
        if (active) { setNotice(error instanceof Error ? error.message : 'Unable to search contacts.'); }
      } finally {
        if (active) { setSearchLoading(false); }
      }
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [query, searching]);
  useEffect(() => {
    if (filter !== 'Groups' || !query.trim()) {
      setGroupSearchRows(null);
      return;
    }
    let active = true;
    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const rows = await enrichChatList(normalizeChatList(await searchGroups(query)));
        if (active) setGroupSearchRows(rows);
      } catch (error) {
        if (active) setNotice(error instanceof Error ? error.message : 'Unable to search groups.');
      } finally {
        if (active) setSearchLoading(false);
      }
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [filter, query]);
  const sourceChats = filter === 'Groups' && groupSearchRows !== null ? groupSearchRows : chats;
  const visible = useMemo(
    () =>
      sourceChats
        .filter(chat => {
          const q = query.trim().toLowerCase();
          if (
            q &&
            !chat.contact.name.toLowerCase().includes(q) &&
            !chat.lastMessage.toLowerCase().includes(q)
          ) {
            return false;
          }
          if (filter === 'Unread') {
            return hasUnread(chat);
          }
          if (filter === 'Pinned') {
            return pinned.has(chat.id);
          }
          if (filter === 'Groups') {
            return chat.contact.kind === 'group' && !chat.archived;
          }
          return !chat.archived;
        })
        .sort((a, b) => {
          const pinOrder = Number(pinned.has(b.id)) - Number(pinned.has(a.id));
          return pinOrder || messageTime(b.lastMessageAt) - messageTime(a.lastMessageAt);
        }),
    [filter, pinned, query, sourceChats],
  );
  const visibleBroadcasts = useMemo(() => {
    if (filter !== 'All') return [];
    const normalized = query.trim().toLowerCase();
    return broadcasts.filter(item => !normalized || item.name.toLowerCase().includes(normalized));
  }, [broadcasts, filter, query]);
  const action = useCallback(async (chat: ChatListItem, type: Action) => {
    if (type === 'mute' || type === 'pin') {
      const currentlyEnabled = type === 'pin' ? pinned.has(chat.id) : muted.has(chat.id);
      try {
        if (type === 'mute') {
          await setConversationMuted(chat.id, !currentlyEnabled);
        } else if (chat.contact.kind === 'group') {
          await (currentlyEnabled ? unpinGroupThread(chat.id) : pinGroupThread(chat.id));
        } else {
          await (currentlyEnabled ? unpinChatThread(chat.id) : pinChatThread(chat.id));
        }
        const setter = type === 'mute' ? setMuted : setPinned;
        setter(current => {
          const next = new Set(current);
          currentlyEnabled ? next.delete(chat.id) : next.add(chat.id);
          return next;
        });
        if (type === 'pin') {
          setNotice('');
          setPinToast(currentlyEnabled ? 'Chat Unpinned' : 'Chat Pinned');
        } else {
          setNotice(currentlyEnabled ? 'Chat Unmuted' : 'Chat Muted');
        }
      } catch (error) {
        setNotice(error instanceof Error ? error.message : 'Unable to update chat.');
      }
      return;
    }
    const perform = async () => {
      try {
        if (type === 'delete') {
          await deleteChat(chat.id);
        } else if (type === 'archive') {
          await archiveChat(chat.id);
        } else {
          await markChatUnread(chat.id);
        }
        if (type === 'delete' || type === 'archive') {
          clearChatListActivity(ownerId, chat.id);
        }
        setChats(current =>
          type === 'unread'
            ? current.map(item =>
                item.id === chat.id
                  ? { ...item, markedUnread: true }
                  : item,
              )
            : current.filter(item => item.id !== chat.id),
        );
        setNotice(
          type === 'unread'
            ? 'Chat marked unread.'
            : type === 'archive'
            ? 'Chat archived.'
            : 'Chat deleted.',
        );
      } catch (error) {
        setNotice(
          error instanceof Error ? error.message : 'Unable to update chat.',
        );
      }
    };
    if (type === 'delete') {
      Alert.alert(
        'Delete chat?',
        `Delete your chat with ${chat.contact.name}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: perform },
        ],
      );
    } else {
      await perform();
    }
  }, [muted, ownerId, pinned]);
  const tabs = [
    { key: 'chats', label: 'Chats', Icon: ChatTabIcon },
    { key: 'contacts', label: 'Contacts', Icon: ContactTabIcon },
    { key: 'calls', label: 'Calls', Icon: CallsTabIcon },
    { key: 'settings', label: 'Settings', Icon: SettingsTabIcon },
  ];
  const searchResults = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized && !searchFilter) { return []; }
    return chats.filter(chat => {
      const matchesQuery = !normalized || matchedUserIds.has(chat.contact.userId) || chat.contact.name.toLowerCase().includes(normalized) || chat.lastMessage.toLowerCase().includes(normalized);
      if (!matchesQuery) { return false; }
      if (searchFilter === 'Unread') { return hasUnread(chat); }
      if (searchFilter === 'Groups') { return chat.contact.kind === 'group'; }
      if (searchFilter) {
        const preview = chat.lastMessage.toLowerCase();
        const terms: Record<'Photos' | 'Videos' | 'Files', RegExp> = {
          Photos: /photo|image|picture|sent an image|sent a photo/,
          Videos: /video|clip|sent a video/,
          Files: /file|document|pdf|sent a .* file/,
        };
        return terms[searchFilter].test(preview);
      }
      return true;
    });
  }, [chats, matchedUserIds, query, searchFilter]);
  const closeSearch = () => { setSearching(false); setQuery(''); setMatchedUserIds(new Set()); setSearchFilter(null); };
  const selectedChat = chats.find(chat => chat.id === selectedChatId);
  const runSelectedAction = async (type: Extract<Action, 'pin' | 'mute' | 'archive' | 'delete'>) => {
    if (!selectedChat) { return; }
    await action(selectedChat, type);
    setSelectedChatId('');
  };
  if (searching) {
    return <View style={[styles.root, {paddingTop: insets.top}]}>
      <View style={styles.searchPageBar}>
        <Pressable accessibilityLabel="Close search" hitSlop={10} onPress={closeSearch}><Text style={styles.searchBack}>←</Text></Pressable>
        <TextInput accessibilityLabel="Search contacts" autoFocus onChangeText={setQuery} placeholder="" style={styles.searchPageInput} value={query} />
        {query.length > 0 && <Pressable accessibilityLabel="Clear search" hitSlop={10} onPress={() => setQuery('')}><Text style={styles.searchClose}>×</Text></Pressable>}
      </View>
      <ScrollView contentContainerStyle={styles.searchFilterRow} horizontal showsHorizontalScrollIndicator={false}>
        {(['Unread','Groups','Photos','Videos','Files'] as SearchFilter[]).map(item => <Pressable accessibilityLabel={`Search ${item}`} accessibilityState={{selected: searchFilter === item}} onPress={() => setSearchFilter(current => current === item ? null : item)} key={item} style={[styles.searchFilter, searchFilter === item && styles.searchFilterSelected]}><Text style={[styles.searchFilterText, searchFilter === item && styles.searchFilterTextSelected]}>{item}</Text></Pressable>)}
      </ScrollView>
      {!query.trim() && !searchFilter ? <View style={styles.searchEmpty}>
        <SearchIllustration />
        <Text style={styles.searchEmptyTitle}>Search your messages</Text>
        <Text style={styles.searchEmptyCopy}>Find messages, photos,{`\n`}videos, and files.</Text>
      </View> : searchLoading ? <View style={styles.searchResultsLoading}><ActivityIndicator color={PURPLE}/></View> : <ScrollView contentContainerStyle={styles.searchResults} showsVerticalScrollIndicator={false}>
        <Text style={styles.searchSection}>Chats</Text>
        {searchResults.map(chat => <Pressable accessibilityLabel={`Open search result ${chat.contact.name}`} key={`chat-${chat.id}`} onPress={() => onOpenConversation(chat.contact, chat.id)} style={styles.searchChatRow}><Avatar chat={chat}/><View style={styles.searchResultCopy}><View style={styles.rowTop}><Text style={styles.searchResultName}>{chat.contact.name}</Text><Text style={styles.searchResultTime}>{timeLabel(chat.lastMessageAt)}</Text></View><View style={styles.rowBottom}><View style={styles.preview}><PreviewTicks chat={chat}/><Text numberOfLines={1} style={styles.searchResultMessage}>{chat.lastMessage || 'Start a conversation'}</Text></View>{chat.unreadCount > 0 ? <View style={styles.badge}><Text style={styles.badgeText}>{chat.unreadCount}</Text></View> : chat.markedUnread ? <UnreadDot /> : null}</View></View></Pressable>)}
        <Text style={styles.searchSection}>Starred Messages</Text>
        {searchResults.slice(0,1).map(chat => <Pressable key={`star-${chat.id}`} onPress={() => onOpenConversation(chat.contact,chat.id)} style={styles.simpleResult}><View style={styles.rowTop}><Text style={styles.searchResultName}>{chat.contact.name}</Text><Text style={styles.searchResultTime}>{timeLabel(chat.lastMessageAt)}</Text></View><Text numberOfLines={1} style={styles.searchResultMessage}>{chat.lastMessage || 'Start a conversation'}</Text></Pressable>)}
        <Text style={styles.searchSection}>Messages</Text>
        {searchResults.map(chat => <Pressable key={`message-${chat.id}`} onPress={() => onOpenConversation(chat.contact,chat.id)} style={styles.simpleResult}><View style={styles.rowTop}><Text style={styles.searchResultName}>{chat.contact.name}</Text><Text style={styles.searchResultTime}>{timeLabel(chat.lastMessageAt)}</Text></View><Text numberOfLines={1} style={styles.searchResultMessage}>{chat.lastMessage || 'Start a conversation'}</Text></Pressable>)}
        {searchResults.length === 0 && <Text style={styles.noSearchResults}>No matching contacts or messages</Text>}
      </ScrollView>}
      <Snackbar message={notice} onHide={() => setNotice('')} />
    </View>;
  }
  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {selectedChatId ? <View style={styles.selectionHeader}>
        <View style={styles.selectionStart}><Pressable accessibilityLabel="Close chat selection" hitSlop={10} onPress={() => setSelectedChatId('')}><Text style={styles.selectionBack}>‹</Text></Pressable><Text style={styles.selectionCount}>1</Text></View>
        <View style={styles.selectionActions}>
          <Pressable accessibilityLabel={pinned.has(selectedChatId) ? 'Unpin selected chat' : 'Pin selected chat'} hitSlop={9} onPress={() => runSelectedAction('pin')}><SelectionIcon type="pin"/></Pressable>
          <Pressable accessibilityLabel={muted.has(selectedChatId) ? 'Unmute selected chat' : 'Mute selected chat'} hitSlop={9} onPress={() => runSelectedAction('mute')}><SelectionIcon type="mute"/></Pressable>
          <Pressable accessibilityLabel="Archive selected chat" hitSlop={9} onPress={() => runSelectedAction('archive')}><SelectionIcon type="archive"/></Pressable>
          <Pressable accessibilityLabel="Delete selected chat" hitSlop={9} onPress={() => runSelectedAction('delete')}><SelectionIcon type="delete"/></Pressable>
        </View>
      </View> : <View style={styles.header}><View style={styles.brand}><ChatLogo compact /></View><View style={styles.headerRight}><Pressable accessibilityLabel="Create new" hitSlop={10} onPress={() => setCreateMenuOpen(true)} style={styles.headerIconButton}><PlusIcon /></Pressable><HeaderProfileImage uri={getSession()?.user?.profilePic}/><Pressable accessibilityLabel="Chat options" accessibilityState={{expanded: chatOptionsOpen}} hitSlop={10} onPress={() => setChatOptionsOpen(true)} style={styles.headerIconButton}><MoreIcon /></Pressable></View></View>}
      <View style={styles.search}>
        <SearchIcon />
        <TextInput
          accessibilityLabel={filter === 'Groups' ? 'Search groups' : 'Search chats'}
          onFocus={() => { if (filter !== 'Groups') setSearching(true); }}
          onChangeText={setQuery}
          placeholder={filter === 'Groups' ? 'Search groups' : 'Search chats'}
          placeholderTextColor="#536178"
          style={styles.searchInput}
          value={query}
        />
      </View>
      <View style={styles.filters}>
        {(['All', 'Unread', 'Groups', 'Pinned'] as Filter[]).map(item => (
          <Pressable
            accessibilityLabel={`${item} chats`}
            key={item}
            onPress={() => { setFilter(item); setQuery(''); setGroupSearchRows(null); }}
            style={[styles.filter, filter === item && styles.filterActive]}
          >
            <Text
              style={[
                styles.filterText,
                filter === item && styles.filterTextActive,
              ]}
            >
              {item}
            </Text>
          </Pressable>
        ))}
      </View>
      {loading || (filter === 'Groups' && searchLoading) ? (
        <View style={styles.center}>
          <ActivityIndicator color={PURPLE} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={visible.length || visibleBroadcasts.length ? styles.list : styles.emptyList}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshChats} tintColor={PURPLE} colors={[PURPLE]} />}
          showsVerticalScrollIndicator={false}
          style={styles.listViewport}
        >
          {visibleBroadcasts.map(broadcast => <BroadcastRow broadcast={broadcast} key={`broadcast-${broadcast._id}`} onOpen={() => onOpenBroadcast?.(broadcast)}/>)}
          {visible.map(chat => (
            <SwipeRow
              chat={chat}
              typing={chat.contact.kind !== 'group' && typingIds.has(chat.contact.userId)}
              key={chat.id}
              muted={muted.has(chat.id)}
              onAction={type => action(chat, type)}
              onOpen={() => selectedChatId ? setSelectedChatId(chat.id) : onOpenConversation(chat.contact, chat.id)}
              onSelect={() => setSelectedChatId(chat.id)}
              pinned={pinned.has(chat.id)}
              selected={selectedChatId === chat.id}
            />
          ))}
          {!visible.length && !visibleBroadcasts.length ? <View style={styles.center}><Text style={styles.emptyTitle}>{filter === 'Groups' ? 'No groups found' : 'No chats found'}</Text><Text style={styles.emptyCopy}>{filter === 'Groups' ? 'Create a group from the + button.' : 'Start a conversation from Contacts.'}</Text></View> : null}
        </ScrollView>
      )}
      <View
        style={[
          styles.bottomNav,
          { paddingBottom: Math.max(insets.bottom, 8) },
        ]}
      >
        {tabs.map(tab => {
          const active = tab.key === 'chats';
          return (
            <Pressable
              accessibilityLabel={tab.label}
              key={tab.key}
              onPress={tab.key === 'contacts' ? onOpenContacts : tab.key === 'calls' ? onOpenCalls : tab.key === 'settings' ? () => onOpenSettings?.() : undefined}
              style={styles.tab}
            >
              <View style={[styles.tabIcon, active && styles.tabIconActive]}>
                <tab.Icon active={active} />
              </View>
              <Text style={[styles.tabText, active && styles.tabTextActive]}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Snackbar message={notice} onHide={() => setNotice('')} />
      <PinToast bottom={92} message={pinToast}/>
      <Modal animationType="fade" onRequestClose={() => setCreateMenuOpen(false)} statusBarTranslucent transparent visible={createMenuOpen}>
        <View accessibilityLabel="Create menu" style={styles.createOverlay}>
          <Pressable accessibilityLabel="Close create menu backdrop" onPress={() => setCreateMenuOpen(false)} style={StyleSheet.absoluteFill}/>
          <View style={[styles.createSheet, {paddingBottom: Math.max(insets.bottom + 12, 28)}]}>
            <View style={styles.createHandle}/>
            <Pressable accessibilityLabel="Close create menu" hitSlop={10} onPress={() => setCreateMenuOpen(false)} style={styles.createClose}><CloseIcon/></Pressable>
            <Pressable accessibilityLabel="New Contact" onPress={() => { setCreateMenuOpen(false); onCreateContact?.(); }} style={styles.createAction}><View style={styles.createActionIcon}><CreateActionIcon kind="contact"/></View><Text style={styles.createActionText}>New Contact</Text></Pressable>
            <Pressable accessibilityLabel="New Group" onPress={() => { setCreateMenuOpen(false); onCreateGroup?.(); }} style={styles.createAction}><View style={styles.createActionIcon}><CreateActionIcon kind="group"/></View><Text style={styles.createActionText}>New Group</Text></Pressable>
            <Pressable accessibilityLabel="New Broadcast" onPress={() => { setCreateMenuOpen(false); onCreateBroadcast?.(); }} style={styles.createAction}><View style={styles.createActionIcon}><CreateActionIcon kind="broadcast"/></View><Text style={styles.createActionText}>New Broadcast</Text></Pressable>
          </View>
        </View>
      </Modal>
      <Modal animationType="fade" onRequestClose={() => setChatOptionsOpen(false)} statusBarTranslucent transparent visible={chatOptionsOpen}>
        <View accessibilityLabel="Chat options menu" style={styles.createOverlay}>
          <Pressable accessibilityLabel="Close chat options backdrop" onPress={() => setChatOptionsOpen(false)} style={StyleSheet.absoluteFill}/>
          <View style={[styles.chatOptionsSheet, {paddingBottom: Math.max(insets.bottom + 12, 28)}]}>
            <View style={styles.createHandle}/>
            <Pressable accessibilityLabel="Edit profile" onPress={() => { setChatOptionsOpen(false); onOpenSettings?.('edit'); }} style={styles.chatOptionAction}><Text style={styles.chatOptionText}>Edit Profile</Text></Pressable>
            <Pressable accessibilityLabel="Refresh latest chats" disabled={refreshing} onPress={() => { setChatOptionsOpen(false); refreshChats(); }} style={styles.chatOptionAction}>{refreshing ? <ActivityIndicator color={PURPLE} size="small"/> : <Text style={styles.chatOptionText}>Refresh Chats</Text>}</Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}
const styles = createThemedStyles({
  root: { flex: 1, backgroundColor: '#FFF' },
  header: {
    height: 72,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectionHeader: {height: 72, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  selectionStart: {flexDirection: 'row', alignItems: 'center', gap: 13},
  selectionBack: {width: 17, color: '#162033', fontSize: 28, lineHeight: 30},
  selectionCount: {fontFamily: FONT, fontSize: 14, color: '#162033'},
  selectionActions: {flexDirection: 'row', alignItems: 'center', gap: 24},
  brand: { alignItems: 'center', justifyContent: 'center' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 22 },
  headerIconButton: {width: 24, height: 32, alignItems: 'center', justifyContent: 'center'},
  chatOptionsSheet: {paddingTop: 12, borderTopLeftRadius: 16, borderTopRightRadius: 16, backgroundColor: '#FFF'},
  chatOptionAction: {height: 52, paddingHorizontal: 24, justifyContent: 'center'},
  chatOptionText: {fontFamily: FONT, fontSize: 14, color: '#172033'},
  profile: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#EEE5DC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  search: {
    height: 46,
    marginHorizontal: 24,
    marginTop: 7,
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: '#E6E9EF',
    borderRadius: 9,
    backgroundColor: '#FAFAFB',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchInput: { flex: 1, fontFamily: FONT, fontSize: 13, color: '#152033' },
  searchPageBar: {height: 46, marginHorizontal: 16, marginTop: 14, paddingHorizontal: 12, borderWidth: 1, borderColor: '#E7EAF0', borderRadius: 9, backgroundColor: '#FAFAFB', flexDirection: 'row', alignItems: 'center'},
  searchBack: {width: 22, color: '#526176', fontSize: 18, lineHeight: 22},
  searchPageInput: {flex: 1, height: 44, paddingHorizontal: 3, paddingVertical: 0, fontFamily: FONT, fontSize: 13, color: '#344256'},
  searchClose: {width: 22, color: '#526176', fontSize: 22, lineHeight: 24, textAlign: 'center'},
  searchFilterRow: {height: 52, paddingHorizontal: 16, paddingTop: 17, gap: 10},
  searchFilter: {height: 28, minWidth: 61, paddingHorizontal: 13, borderWidth: 1, borderColor: '#DCE2EC', borderRadius: 5, alignItems: 'center', justifyContent: 'center'},
  searchFilterText: {fontFamily: FONT, fontSize: 11, color: '#182134'},
  searchFilterSelected: {borderColor: '#F0E8FF', backgroundColor: '#F0E8FF'},
  searchFilterTextSelected: {color: PURPLE},
  searchEmpty: {position: 'absolute', top: '47%', right: 0, left: 0, alignItems: 'center'},
  searchEmptyTitle: {marginTop: 30, fontFamily: FONT, fontSize: 13, color: '#4D6382'},
  searchEmptyCopy: {marginTop: 7, fontFamily: FONT, fontSize: 10, lineHeight: 15, color: '#75849A', textAlign: 'center'},
  searchResultsLoading: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  searchResults: {paddingHorizontal: 16, paddingTop: 4, paddingBottom: 30},
  searchSection: {marginTop: 10, marginBottom: 8, fontFamily: FONT, fontSize: 11, color: '#60718B'},
  searchChatRow: {height: 58, flexDirection: 'row', alignItems: 'center'},
  searchResultCopy: {flex: 1, marginLeft: 10},
  searchResultName: {maxWidth: '75%', fontFamily: FONT, fontSize: 13, fontWeight: '500', color: '#141B28'},
  searchResultTime: {fontFamily: FONT, fontSize: 9, color: '#43516A'},
  searchResultMessage: {flex: 1, marginTop: 4, fontFamily: FONT, fontSize: 10, color: '#69768A'},
  simpleResult: {minHeight: 54, paddingVertical: 7},
  noSearchResults: {marginTop: 26, fontFamily: FONT, fontSize: 12, color: '#75849A', textAlign: 'center'},
  filters: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 24,
    marginTop: 25,
    marginBottom: 13,
  },
  filter: {
    minWidth: 45,
    height: 30,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#DCE2EC',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterActive: { borderColor: '#F0E8FF', backgroundColor: '#F0E8FF' },
  filterText: { fontFamily: FONT, fontSize: 13, color: '#182134' },
  filterTextActive: { color: PURPLE },
  listViewport: {flex: 1},
  list: { paddingHorizontal: 24, paddingBottom: 115 },
  emptyList: {flexGrow: 1, paddingHorizontal: 24, paddingBottom: 115},
  swipeShell: { height: 73, overflow: 'hidden' },
  actions: {
    position: 'absolute',
    right: 0,
    height: 64,
    width: 272,
    flexDirection: 'row',
  },
  action: { width: 68, alignItems: 'center', justifyContent: 'center' },
  actionIcon: { color: '#FFF', fontSize: 18 },
  actionText: { color: '#FFF', fontSize: 10, marginTop: 2 },
  row: {
    height: 64,
    backgroundColor: '#FFF',
    flexDirection: 'row',
    alignItems: 'center',
  },
  broadcastRow: {height: 73, backgroundColor: '#FFF', flexDirection: 'row', alignItems: 'center'},
  broadcastAvatar: {width: 44, height: 44, overflow: 'hidden', borderRadius: 7, backgroundColor: '#F0E7FF', alignItems: 'center', justifyContent: 'center'},
  broadcastAvatarImage: {width: '100%', height: '100%'},
  broadcastTag: {paddingHorizontal: 7, paddingVertical: 3, borderRadius: 9, overflow: 'hidden', backgroundColor: '#F0E7FF', color: '#7137DD', fontFamily: FONT, fontSize: 8, fontWeight: '600'},
  avatar: { width: 44, height: 44, borderRadius: 7 },
  avatarFallback: {
    width: 44,
    height: 44,
    borderRadius: 7,
    backgroundColor: '#E8DDFB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: { fontWeight: '700', color: PURPLE },
  onlineBadge: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    width: 14,
    height: 14,
    borderRadius: 4,
    backgroundColor: '#18C77A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  offlineBadge: {backgroundColor: '#94A3B8'},
  onlineTick: { fontSize: 9, color: '#FFF', fontWeight: '700' },
  chatStateIcon: {width: 14, height: 14, alignItems: 'center', justifyContent: 'center'},
  rowSelected: {backgroundColor: '#F0E7FF'},
  swipeShellSelected: {marginHorizontal: -24, paddingHorizontal: 24, backgroundColor: '#F0E7FF'},
  rowCopy: { flex: 1, marginLeft: 12 },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowMeta: {flexDirection: 'row', alignItems: 'center', gap: 4},
  pinToast: {position: 'absolute', alignSelf: 'center', minHeight: 52, paddingHorizontal: 18, borderRadius: 28, backgroundColor: '#F8F9FC', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, shadowColor: '#101828', shadowOffset: {width: 0, height: 2}, shadowOpacity: 0.08, shadowRadius: 8, elevation: 4},
  pinToastText: {fontFamily: FONT, fontSize: 13, fontWeight: '500', color: '#101828'},
  name: {
    maxWidth: '72%',
    fontFamily: FONT,
    fontSize: 15,
    fontWeight: '500',
    color: '#121827',
  },
  time: { fontFamily: FONT, fontSize: 10, color: '#43516A' },
  timeUnread: { color: PURPLE },
  rowBottom: {
    marginTop: 5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  preview: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  previewTicks: { marginRight: 5, justifyContent: 'center' },
  message: { flex: 1, fontFamily: FONT, fontSize: 12, color: '#647086' },
  typingMessage: {color: PURPLE, fontStyle: 'italic'},
  badge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    backgroundColor: '#8B4CF6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 10, fontWeight: '700', color: '#FFF' },
  unreadDot: {width: 8, height: 20, alignItems: 'center', justifyContent: 'center'},
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 90,
  },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: '#172033' },
  emptyCopy: { fontSize: 13, color: '#647086', marginTop: 7 },
  bottomNav: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    minHeight: 91,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E9ECF1',
    backgroundColor: '#FFF',
    flexDirection: 'row',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.04,
    shadowRadius: 7,
    elevation: 5,
  },
  tab: { flex: 1, alignItems: 'center' },
  tabIcon: {
    width: 66,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIconActive: { backgroundColor: '#F0E7FF' },
  tabText: { fontFamily: FONT, fontSize: 12, color: '#59667A', marginTop: 2 },
  tabTextActive: { color: '#5412E8' },
  createOverlay: {flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15, 23, 42, 0.42)'},
  createSheet: {minHeight: 292, paddingHorizontal: 17, paddingTop: 7, borderTopLeftRadius: 16, borderTopRightRadius: 16, backgroundColor: '#FFFFFF'},
  createHandle: {width: 44, height: 4, alignSelf: 'center', borderRadius: 2, backgroundColor: '#E1E6EE'},
  createClose: {position: 'absolute', top: 22, right: 17, width: 30, height: 30, alignItems: 'center', justifyContent: 'center'},
  createAction: {height: 70, flexDirection: 'row', alignItems: 'center'},
  createActionIcon: {width: 44, height: 44, borderRadius: 7, backgroundColor: '#FAFAFB', alignItems: 'center', justifyContent: 'center'},
  createActionText: {marginLeft: 13, fontFamily: FONT, fontSize: 12, fontWeight: '500', color: '#111827'},
});
