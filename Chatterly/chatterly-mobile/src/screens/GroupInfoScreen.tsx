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
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getGroupMessages } from '../services/chatApi';
import { subscribeToOnlineUsers } from '../services/chatRealtime';
import {
  clearGroupChat,
  deleteGroup,
  getGroupDetails,
  leaveGroup,
  reportGroup,
  type GroupDetails,
  type GroupMember,
} from '../services/groupApi';
import {
  getConversationMuted,
  setConversationMuted,
} from '../services/conversationPreferences';
import { getSession } from '../services/sessionStore';
import {ProfilePictureViewer} from '../components/ProfilePictureViewer';
import type { ChatMessage, ConversationContact } from '../types/chat';
import {
  ManageGroupMembersScreen,
  type ManageMembersPage,
} from './ManageGroupMembersScreen';
import { AdminIcon } from '../components/GroupAdminIcons';
import { GroupActionsSheet } from '../components/GroupAdminSheets';
import {canAddGroupMembers, canAssignGroupRoles, canEditGroupInfo, isGroupAdmin, similarGroupDraft, type SimilarGroupDraft} from '../utils/groupAdmin';
import {
  GroupProfileIcon,
  GroupRulesEditIcon,
} from '../components/GroupProfileIcon';
import { GroupProfileScreen } from './GroupProfileScreen';
import { GroupRulesScreen } from './GroupRulesScreen';
import { SharedContentScreen } from './SharedContentScreen';
import {
  GroupInfoIcon,
  type GroupInfoIconName,
} from '../components/GroupInfoIcons';
import { PinnedMessagesScreen } from './PinnedMessagesScreen';
import { createThemedStyles, themeInk } from '../theme/themedStyles';

type Props = {
  visible: boolean;
  initialPinnedVisible?: boolean;
  chatId: string;
  contact: ConversationContact;
  onBack: () => void;
  onExitGroup: () => void;
  onClear: () => void;
  onNotice: (message: string) => void;
  onTimelineMessage?: (message: ChatMessage) => void;
  onUpdated?: (details: GroupDetails) => void;
  onOpenPinnedMessage?: (message: ChatMessage) => void;
  onForwardPinnedMessages?: (messages: ChatMessage[]) => void;
  onDeletePinnedMessage?: (message: ChatMessage) => void;
  onPinnedMessageUnpinned?: (messageId: string) => void;
  onPinnedMessagesDeletedForMe?: (messageIds: string[]) => void;
  onOpenDirectChat?: (contact: ConversationContact, chatId: string) => void;
  onCreateSimilarGroup?: (draft: SimilarGroupDraft) => void;
};
const PURPLE = '#6F28F5';
const RED = '#EC3F45';
const FONT = Platform.select({ android: 'sans-serif', ios: 'System' });

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('') || '?';
function BackIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path
        d="m15 18-6-6 6-6"
        stroke={themeInk('#1E293B')}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
function AddMembersIcon() {
  return (
    <Svg width={25} height={24} viewBox="0 0 25 24" fill="none">
      <Path
        d="M12.5 5V19M5.20831 12H19.7916"
        stroke={themeInk('#5121BF')}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
function GroupSettingsIcon() {
  return (
    <Svg width={25} height={24} viewBox="0 0 25 24" fill="none">
      <Path
        d="M10.7552 4.317C11.199 2.561 13.801 2.561 14.2448 4.317C14.3114 4.5808 14.4419 4.82578 14.6257 5.032C14.8096 5.23822 15.0416 5.39985 15.3028 5.50375C15.564 5.60764 15.847 5.65085 16.1289 5.62987C16.4108 5.60889 16.6836 5.5243 16.925 5.383C18.5323 4.443 20.3729 6.209 19.3937 7.753C19.2468 7.98466 19.1588 8.24634 19.137 8.51677C19.1152 8.78721 19.1602 9.05877 19.2683 9.30938C19.3764 9.55999 19.5445 9.78258 19.7591 9.95905C19.9737 10.1355 20.2286 10.2609 20.5031 10.325C22.3323 10.751 22.3323 13.249 20.5031 13.675C20.2283 13.7389 19.9731 13.8642 19.7583 14.0407C19.5435 14.2172 19.3752 14.4399 19.2669 14.6907C19.1587 14.9414 19.1137 15.2132 19.1356 15.4838C19.1574 15.7544 19.2455 16.0162 19.3927 16.248C20.3719 17.791 18.5323 19.558 16.924 18.618C16.6826 18.4769 16.4101 18.3924 16.1284 18.3715C15.8467 18.3506 15.5638 18.3938 15.3027 18.4975C15.0417 18.6013 14.8098 18.7627 14.626 18.9687C14.4422 19.1747 14.3116 19.4194 14.2448 19.683C13.801 21.439 11.199 21.439 10.7552 19.683C10.6886 19.4192 10.5581 19.1742 10.3743 18.968C10.1904 18.7618 9.95845 18.6001 9.69724 18.4963C9.43603 18.3924 9.15295 18.3491 8.87106 18.3701C8.58916 18.3911 8.31641 18.4757 8.075 18.617C6.46771 19.557 4.62708 17.791 5.60625 16.247C5.75323 16.0153 5.8412 15.7537 5.863 15.4832C5.88481 15.2128 5.83984 14.9412 5.73174 14.6906C5.62365 14.44 5.45548 14.2174 5.24091 14.0409C5.02634 13.8645 4.77142 13.7391 4.49687 13.675C2.66771 13.249 2.66771 10.751 4.49687 10.325C4.77167 10.2611 5.02685 10.1358 5.24167 9.95929C5.45648 9.7828 5.62485 9.56011 5.73307 9.30935C5.84129 9.05859 5.8863 8.78683 5.86445 8.51621C5.84259 8.24559 5.75448 7.98375 5.60729 7.752C4.62812 6.209 6.46771 4.442 8.07604 5.382C9.11771 5.99 10.4677 5.452 10.7552 4.317Z"
        stroke={themeInk('#0B1220')}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M9.375 12C9.375 12.7956 9.70424 13.5587 10.2903 14.1213C10.8763 14.6839 11.6712 15 12.5 15C13.3288 15 14.1237 14.6839 14.7097 14.1213C15.2958 13.5587 15.625 12.7956 15.625 12C15.625 11.2044 15.2958 10.4413 14.7097 9.87868C14.1237 9.31607 13.3288 9 12.5 9C11.6712 9 10.8763 9.31607 10.2903 9.87868C9.70424 10.4413 9.375 11.2044 9.375 12Z"
        stroke={themeInk('#0B1220')}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
function MemberAddIcon() {
  return (
    <Svg width={48} height={48} viewBox="0 0 48 48" fill="none">
      <Rect width={48} height={48} rx={8} fill={themeInk('#F1EBFE')} />
      <Path
        d="M24 18V23.75M24 23.75V29.5M24 23.75H17.9998M24 23.75H30"
        stroke={themeInk('#5121BF')}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
    </Svg>
  );
}
function Avatar({ member }: { member: GroupMember }) {
  return member.profilePic ? (
    <Image source={{ uri: member.profilePic }} style={styles.memberAvatar} />
  ) : (
    <View style={[styles.memberAvatar, styles.avatarFallback]}>
      <Text style={styles.avatarText}>{initials(member.name)}</Text>
    </View>
  );
}
const memberPresenceLabel = (
  member: GroupMember,
  onlineIds: ReadonlySet<string>,
) => (onlineIds.has(String(member.userId)) ? 'Online' : 'Offline');
function RoleBadge({ role }: { role: GroupMember['role'] }) {
  if (role === 'member') return null;
  const admin = role === 'admin' || role === 'superadmin';
  return (
    <View style={[styles.badge, !admin && styles.modBadge]}>
      <Text style={[styles.badgeText, !admin && styles.modBadgeText]}>
        {role === 'superadmin'
          ? '♛ Super Admin'
          : admin
          ? '♛ Admin'
          : '🛡 Moderator'}
      </Text>
    </View>
  );
}
function formatCreated(details: GroupDetails) {
  const date = details.createdAt ? new Date(details.createdAt) : null;
  const formatted =
    date && !Number.isNaN(date.getTime())
      ? date.toLocaleDateString([], {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        })
      : 'an earlier date';
  return `Created by ${
    details.createdBy?.name || 'a group admin'
  } on ${formatted}`;
}

function MuteToggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <Pressable
      accessibilityLabel={
        value ? 'Unmute group notifications' : 'Mute group notifications'
      }
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      hitSlop={8}
      onPress={() => onChange(!value)}
    >
      <Svg width={44} height={24} viewBox="0 0 44 24" fill="none">
        <Rect
          x={0.25}
          y={0.25}
          width={43.5}
          height={23.5}
          rx={3.75}
          fill={value ? themeInk('#8B5CF6') : themeInk('#E2E8F0')}
          stroke={themeInk('#E2E8F0')}
          strokeWidth={0.5}
        />
        <Rect
          x={value ? 22 : 2}
          y={2}
          width={20}
          height={20}
          rx={2}
          fill="white"
        />
      </Svg>
    </Pressable>
  );
}

function Row({
  icon,
  title,
  subtitle,
  danger,
  trailing,
  onPress,
}: {
  icon: GroupInfoIconName;
  title: string;
  subtitle?: string;
  danger?: boolean;
  trailing?: React.ReactNode;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={title}
      disabled={!onPress}
      onPress={onPress}
      style={styles.row}
    >
      <View style={styles.rowIcon}>
        <GroupInfoIcon name={icon} />
      </View>
      <View style={styles.rowCopy}>
        <Text style={[styles.rowTitle, danger && styles.danger]}>{title}</Text>
        {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
      </View>
      {trailing ??
        (onPress && !danger ? <Text style={styles.chevron}>›</Text> : null)}
    </Pressable>
  );
}

export function GroupInfoScreen({
  visible,
  initialPinnedVisible = false,
  chatId,
  contact,
  onBack,
  onExitGroup,
  onClear,
  onNotice,
  onTimelineMessage,
  onUpdated,
  onOpenPinnedMessage,
  onForwardPinnedMessages,
  onDeletePinnedMessage,
  onPinnedMessageUnpinned,
  onPinnedMessagesDeletedForMe,
  onOpenDirectChat,
  onCreateSimilarGroup,
}: Props) {
  const insets = useSafeAreaInsets();
  const groupId = contact.userId || chatId;
  const [details, setDetails] = useState<GroupDetails | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [muted, setMuted] = useState(false);
  const [membersPage, setMembersPage] = useState<ManageMembersPage | null>(
    null,
  );
  const [shared, setShared] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [rulesEditor, setRulesEditor] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [photoEditorOpen, setPhotoEditorOpen] = useState(false);
  const [pictureOpen, setPictureOpen] = useState(false);
  const [rulesExpanded, setRulesExpanded] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [onlineIds, setOnlineIds] = useState<ReadonlySet<string>>(new Set());

  const loadVersion = useRef(0);
  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    setLoading(true);
    try {
      const next = await getGroupDetails(groupId);
      if (version !== loadVersion.current) return;
      setDetails(next);
      const member = next.participants.some(
        item => item.userId === String(getSession()?.user?.id || ''),
      );
      if (member) {
        const results = await Promise.allSettled([
          getGroupMessages(groupId),
          getConversationMuted(chatId),
        ]);
        if (version !== loadVersion.current) return;
        setMessages(results[0].status === 'fulfilled' ? results[0].value : []);
        setMuted(results[1].status === 'fulfilled' ? results[1].value : false);
      } else {
        setMessages([]);
        setMuted(false);
      }
    } catch {
      if (version === loadVersion.current) {
        setDetails(null);
        setMessages([]);
        onNotice('Unable to load group information.');
      }
    } finally {
      if (version === loadVersion.current) setLoading(false);
    }
  }, [chatId, groupId, onNotice]);
  useEffect(() => {
    setDetails(null);
    setMessages([]);
    setSettingsOpen(false);
    setPhotoEditorOpen(false);
    setPictureOpen(false);
    setRulesEditor(false);
    setRulesExpanded(false);
    setMembersPage(null);
    setActionsOpen(false);
    setShared(false);
    setPinned(visible && initialPinnedVisible);
    if (visible) load();
    return () => {
      loadVersion.current += 1;
    };
  }, [initialPinnedVisible, load, visible]);

  useEffect(() => {
    if (details) onUpdated?.(details);
  }, [details, onUpdated]);
  useEffect(
    () => (visible ? subscribeToOnlineUsers(setOnlineIds) : undefined),
    [visible],
  );

  const currentUserId = String(getSession()?.user?.id || '');
  const role = details?.participants.find(
    member => member.userId === currentUserId,
  )?.role;
  const isAdmin =
    role === 'superadmin' || role === 'admin' || role === 'moderator';
  const isOwner = role === 'superadmin';
  const isMember = Boolean(
    details?.participants.some(member => member.userId === currentUserId),
  );
  const canEditProfile = canEditGroupInfo(role, details?.rolePermissions);
  const canAddMembers = canAddGroupMembers(role, details?.rolePermissions);
  const canAssignRoles = canAssignGroupRoles(role, details?.rolePermissions);
  const canManagePermissions = isGroupAdmin(role);
  const media = useMemo(
    () =>
      messages.filter(
        message =>
          ['image', 'video'].includes(message.messageType || '') &&
          message.mediaUrl,
      ),
    [messages],
  );
  const pinnedCount = useMemo(
    () =>
      messages.filter(
        message =>
          message.isPinned && !message.isDeleted && !message.deletedForMe,
      ).length,
    [messages],
  );
  const memberPreview = useMemo(
    () =>
      [...(details?.participants || [])]
        .sort(
          (a, b) =>
            ({ superadmin: 0, admin: 1, moderator: 2, member: 3 }[a.role] -
            { superadmin: 0, admin: 1, moderator: 2, member: 3 }[b.role]),
        )
        .slice(0, 3),
    [details],
  );

  const toggleMute = async (next: boolean) => {
    setMuted(next);
    try {
      await setConversationMuted(chatId, next);
      onNotice(
        next ? 'Group notifications muted.' : 'Group notifications unmuted.',
      );
    } catch {
      setMuted(!next);
      onNotice('Unable to update notification preference.');
    }
  };
  const confirm = (kind: 'clear' | 'report' | 'leave' | 'delete') => {
    const labels = {
      clear: 'Clear Chat',
      report: 'Report Group',
      leave: 'Leave Group',
      delete: 'Delete Group',
    };
    Alert.alert(
      `${labels[kind]}?`,
      kind === 'delete'
        ? 'This group will be permanently deleted for everyone.'
        : kind === 'leave'
        ? 'You will stop receiving messages from this group.'
        : kind === 'clear'
        ? 'Messages will be cleared only for you.'
        : 'Chatterly will review this group.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: labels[kind],
          style:
            kind === 'leave' || kind === 'delete' ? 'destructive' : 'default',
          onPress: async () => {
            try {
              if (kind === 'clear') {
                onNotice(await clearGroupChat(groupId));
                onClear();
                setMessages([]);
              }
              if (kind === 'report') onNotice(await reportGroup(groupId));
              if (kind === 'leave') {
                await leaveGroup(groupId);
                onExitGroup();
              }
              if (kind === 'delete') {
                await deleteGroup(groupId);
                onExitGroup();
              }
            } catch (error) {
              onNotice(
                error instanceof Error
                  ? error.message
                  : `Unable to ${labels[kind].toLowerCase()}.`,
              );
            }
          },
        },
      ],
    );
  };
  // The members screen is its own Modal; iOS cannot present Group Settings
  // until that one has finished dismissing.
  const openSettingsFromMembers = () => {
    if (!isMember) return;
    setMembersPage(null);
    setTimeout(() => setSettingsOpen(true), Platform.OS === 'ios' ? 450 : 0);
  };

  return (
    <Modal
      animationType="slide"
      onRequestClose={onBack}
      statusBarTranslucent
      visible={visible}
    >
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable
            accessibilityLabel="Back to group"
            onPress={onBack}
            style={styles.back}
          >
            <BackIcon />
          </Pressable>
          <View style={styles.headerSpacer} />
          {isMember ? (
            <Pressable
              accessibilityLabel="More group actions"
              hitSlop={8}
              onPress={() => setActionsOpen(true)}
              style={styles.headerAction}
            >
              <AdminIcon color="#1E293B" name="more" size={20} />
            </Pressable>
          ) : null}
        </View>
        {loading && !details ? (
          <View style={styles.center}>
            <ActivityIndicator color={PURPLE} />
          </View>
        ) : details ? (
          <ScrollView
            contentContainerStyle={{
              paddingBottom: Math.max(insets.bottom + 18, 28),
            }}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.card}>
              <View style={styles.hero}>
                <View>
                  <Pressable accessibilityLabel="View group profile picture" accessibilityRole="button" disabled={!details.photo} onPress={() => setPictureOpen(true)}>
                  {details.photo ? (
                    <Image
                      source={{ uri: details.photo }}
                      style={styles.groupAvatar}
                    />
                  ) : (
                    <View style={[styles.groupAvatar, styles.avatarFallback]}>
                      <Text style={styles.groupInitials}>
                        {initials(details.name)}
                      </Text>
                    </View>
                  )}
                  </Pressable>
                  {isMember && (
                    <Pressable accessibilityLabel="Change group picture" accessibilityRole="button" hitSlop={8} onPress={() => setPhotoEditorOpen(true)} style={styles.cameraBadge}>
                      <GroupProfileIcon name="camera" size={20} />
                    </Pressable>
                  )}
                </View>
                <Text style={styles.groupName}>{details.name}</Text>
                <Text style={styles.description}>
                  {details.description || 'Group conversation'}
                </Text>
                <Text style={styles.created}>{formatCreated(details)}</Text>
              </View>
              {isMember && (
                <View style={styles.topActions}>
                  {canAddMembers ? <Pressable
                    accessibilityLabel="Add Members"
                    onPress={() => setMembersPage('add')}
                    style={[styles.topAction, styles.addMembersAction]}
                  >
                    <AddMembersIcon />
                    <Text style={[styles.topActionText, styles.addMembersText]}>
                      Add Members
                    </Text>
                  </Pressable> : null}
                  {isMember ? (
                    <Pressable
                      accessibilityLabel="Group Settings"
                      onPress={() => setSettingsOpen(true)}
                      style={[styles.topAction, styles.settingsAction]}
                    >
                      <GroupSettingsIcon />
                      <Text style={styles.topActionText}>Group Settings</Text>
                    </Pressable>
                  ) : null}
                </View>
              )}
            </View>
            <View style={styles.card}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Group Rules</Text>
                {isAdmin ? (
                  <Pressable
                    accessibilityLabel="Edit Group Rules"
                    onPress={() => setRulesEditor(true)}
                  >
                    <View style={styles.editAction}>
                      <GroupRulesEditIcon />
                      <Text style={styles.edit}>Edit</Text>
                    </View>
                  </Pressable>
                ) : null}
              </View>
              {details.rules.length ? (
                (rulesExpanded ? details.rules : details.rules.slice(0, 3)).map(
                  (rule, index) => (
                    <View key={`${index}-${rule}`} style={styles.ruleRow}>
                      <View style={styles.ruleNumber}>
                        <Text style={styles.ruleNumberText}>{index + 1}</Text>
                      </View>
                      <Text style={styles.rule}>{rule}</Text>
                    </View>
                  ),
                )
              ) : (
                <Text style={styles.empty}>
                  No group rules have been added.
                </Text>
              )}
              {details.rules.length > 3 && (
                <Pressable
                  accessibilityLabel={
                    rulesExpanded ? 'Collapse rules' : 'Expand rules'
                  }
                  accessibilityState={{ expanded: rulesExpanded }}
                  onPress={() => setRulesExpanded(value => !value)}
                  style={styles.expandButton}
                >
                  <Text style={styles.expandText}>
                    {rulesExpanded ? 'Collapse' : 'Expand'}
                  </Text>
                  <GroupProfileIcon
                    name={rulesExpanded ? 'up' : 'down'}
                    size={22}
                  />
                </Pressable>
              )}
            </View>
            {isMember && (
              <>
                <View style={styles.card}>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>
                      Media, Docs and Links{' '}
                      <Text style={styles.count}>{media.length}</Text>
                    </Text>
                    <Pressable
                      accessibilityLabel="View All Media, Docs and Links"
                      onPress={() => setShared(true)}
                    >
                      <Text style={styles.edit}>View All</Text>
                    </Pressable>
                  </View>
                  <View style={styles.mediaRow}>
                    {media.slice(0, 4).map(item => (
                      <Pressable
                        accessibilityLabel="Open shared media"
                        key={item.id}
                        onPress={() => setShared(true)}
                        style={styles.mediaTile}
                      >
                        <Image
                          source={{ uri: item.thumbnailUrl || item.mediaUrl }}
                          style={styles.mediaImage}
                        />
                        {item.messageType === 'video' ? (
                          <View style={styles.play}>
                            <Text style={styles.playText}>▶</Text>
                          </View>
                        ) : null}
                      </Pressable>
                    ))}
                    {!media.length ? (
                      <Text style={styles.empty}>No shared media yet.</Text>
                    ) : null}
                  </View>
                </View>
                <View style={styles.card}>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>
                      Members{' '}
                      <Text style={styles.count}>
                        {details.memberCount ?? details.participants.length}
                      </Text>
                    </Text>
                  </View>
                  <Pressable
                    accessibilityLabel="Add Members from member list"
                    onPress={() => setMembersPage('add')}
                    style={styles.addRow}
                  >
                    <View style={styles.addBox}>
                      <MemberAddIcon />
                    </View>
                    <Text style={styles.rowTitle}>Add Members</Text>
                  </Pressable>
                  {memberPreview.map(member => (
                    <View key={member.userId} style={styles.memberRow}>
                      <Avatar member={member} />
                      <View style={styles.memberCopy}>
                        <Text numberOfLines={1} style={styles.memberName}>
                          {member.name}
                        </Text>
                        <Text
                          accessibilityLabel={`Presence for ${member.userId}`}
                          numberOfLines={1}
                          style={styles.memberStatus}
                        >
                          {memberPresenceLabel(member, onlineIds)}
                        </Text>
                      </View>
                      <RoleBadge role={member.role} />
                    </View>
                  ))}
                  <Row
                    icon="view"
                    title="View All Members"
                    trailing={
                      <View style={styles.allTrailing}>
                        <Text style={styles.moreCount}>
                          {Math.max(0, (details.memberCount ?? details.participants.length) - memberPreview.length)} More
                        </Text>
                        <Text style={styles.chevron}>›</Text>
                      </View>
                    }
                    onPress={() => setMembersPage('manage')}
                  />
                  {canAssignRoles ? (
                    <Row
                      icon="roles"
                      title="Manage Roles"
                      subtitle="Manage member roles"
                      onPress={() => setMembersPage('roles')}
                    />
                  ) : null}
                </View>
                <View style={styles.card}>
                  <Row
                    icon="mute"
                    title="Mute Notification"
                    subtitle={
                      muted
                        ? 'Notifications muted for this chat.'
                        : 'Notifications turned on for this chat.'
                    }
                    trailing={
                      <MuteToggle onChange={toggleMute} value={muted} />
                    }
                  />
                  {canManagePermissions ? (
                    <Row
                      icon="permissions"
                      title="Permissions"
                      subtitle="Control what members can do"
                      onPress={() => setMembersPage('permissions')}
                    />
                  ) : null}
                  <Row
                    icon="pinned"
                    title="Pinned Messages"
                    trailing={
                      <View style={styles.allTrailing}>
                        {pinnedCount > 0 ? (
                          <View
                            accessibilityLabel={`${pinnedCount} pinned message notification${
                              pinnedCount === 1 ? '' : 's'
                            }`}
                            style={styles.pinBadge}
                          >
                            <Text style={styles.pinBadgeText}>
                              {pinnedCount}
                            </Text>
                          </View>
                        ) : null}
                        <Text style={styles.chevron}>›</Text>
                      </View>
                    }
                    onPress={() => setPinned(true)}
                  />
                  <Row
                    icon="encryption"
                    title="End-to-End Encryption"
                    subtitle="Turned on, Chat is encrypted."
                    onPress={() =>
                      onNotice(
                        'Your group messages, calls, media and files are protected with end-to-end encryption.',
                      )
                    }
                  />
                </View>
                <View style={styles.card}>
                  <Row
                    danger
                    icon="clear"
                    title="Clear Chat"
                    onPress={() => confirm('clear')}
                  />
                  <Row
                    danger
                    icon="report"
                    title="Report Group"
                    onPress={() => confirm('report')}
                  />
                  <Row
                    danger
                    icon="leave"
                    title="Leave Group"
                    onPress={() => confirm('leave')}
                  />
                  {isOwner ? (
                    <Row
                      danger
                      icon="delete"
                      title="Delete Group"
                      onPress={() => confirm('delete')}
                    />
                  ) : null}
                </View>
              </>
            )}
          </ScrollView>
        ) : (
          <View style={styles.center}>
            <Text>Group information is unavailable.</Text>
          </View>
        )}
        <GroupActionsSheet
          bottomInset={insets.bottom}
          onAddMembers={
            canAddMembers ? () => setMembersPage('add') : undefined
          }
          onClose={() => setActionsOpen(false)}
          onCreateSimilarGroup={
            onCreateSimilarGroup && details
              ? () =>
                  onCreateSimilarGroup(
                    similarGroupDraft(details, currentUserId),
                  )
              : undefined
          }
          onGroupPermissions={
            canManagePermissions ? () => setMembersPage('permissions') : undefined
          }
          onGroupSettings={isMember ? () => setSettingsOpen(true) : undefined}
          visible={actionsOpen && isMember}
        />
      </View>
      <SharedContentScreen
        chatId={chatId}
        contact={contact}
        initialTab="media"
        onBack={() => setShared(false)}
        onNotice={onNotice}
        visible={shared && isMember}
      />
      <ManageGroupMembersScreen
        groupId={groupId}
        initialPage={membersPage || 'manage'}
        onBack={() => {
          setMembersPage(null);
          load();
        }}
        onCreateSimilarGroup={onCreateSimilarGroup}
        onNotice={onNotice}
        onOpenDirectChat={onOpenDirectChat}
        onOpenGroupSettings={isMember ? openSettingsFromMembers : undefined}
        onTimelineMessage={onTimelineMessage}
        visible={membersPage !== null && isMember}
      />
      <PinnedMessagesScreen
        groupId={groupId}
        initialMessages={messages}
        members={details?.participants || []}
        onBack={() => setPinned(false)}
        onDelete={message => {
          onBack();
          onDeletePinnedMessage?.(message);
        }}
        onDeletedForMe={messageIds => {
          setMessages(current =>
            current.map(message =>
              messageIds.includes(message.id)
                ? { ...message, deletedForMe: true }
                : message,
            ),
          );
          onPinnedMessagesDeletedForMe?.(messageIds);
        }}
        onForward={selectedMessages => {
          onBack();
          onForwardPinnedMessages?.(selectedMessages);
        }}
        onNotice={onNotice}
        onOpenInChat={message => {
          onBack();
          onOpenPinnedMessage?.(message);
        }}
        onUnpinned={messageId => {
          setMessages(current =>
            current.map(message =>
              message.id === messageId
                ? { ...message, isPinned: false, pinnedAt: null }
                : message,
            ),
          );
          onPinnedMessageUnpinned?.(messageId);
        }}
        visible={pinned && isMember}
      />
      {visible && rulesEditor && isAdmin && details && (
        <GroupRulesScreen
          groupId={groupId}
          rules={details.rules}
          onTimelineMessage={onTimelineMessage}
          onBack={() => setRulesEditor(false)}
          onSaved={rules =>
            setDetails(current => (current ? { ...current, rules } : current))
          }
        />
      )}
      <ProfilePictureViewer uri={details?.photo} name={details?.name || contact.name} visible={visible && pictureOpen} onClose={() => setPictureOpen(false)} />
      {visible && (settingsOpen || photoEditorOpen) && isMember && details && (
        <GroupProfileScreen
          details={details}
          canEdit={isMember}
          canEditDescription={canEditProfile}
          canRemovePhoto={canEditProfile}
          photoOnly={photoEditorOpen}
          onBack={() => { setSettingsOpen(false); setPhotoEditorOpen(false); }}
          onTimelineMessage={onTimelineMessage}
          onUpdated={setDetails}
        />
      )}
    </Modal>
  );
}

const styles = createThemedStyles({
  editAction: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  cameraBadge: {
    position: 'absolute',
    right: -6,
    bottom: -4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFF',
  },
  cameraText: { fontSize: 20, color: '#172033' },
  memberCount: { fontSize: 12, color: '#64748B', marginTop: 6 },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 42,
  },
  ruleNumber: {
    width: 24,
    height: 24,
    backgroundColor: '#F5F5F5',
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ruleNumberText: { color: '#64748B', fontSize: 13 },
  expandButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    minHeight: 44,
    marginVertical: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    backgroundColor: '#FAFAFA',
    alignItems: 'center',
  },
  expandText: { fontSize: 14, color: '#0B1220' },

  screen: { flex: 1, backgroundColor: '#FFF' },
  header: {
    height: 48,
    paddingHorizontal: 9,
    backgroundColor: '#FFF',
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerSpacer: { flex: 1 },
  headerAction: {
    width: 38,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  back: {
    width: 38,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: {
    marginHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EDF0F4',
    backgroundColor: '#FFF',
  },
  hero: { alignItems: 'center', paddingTop: 2, paddingBottom: 12 },
  groupAvatar: { width: 84, height: 84, borderRadius: 14 },
  avatarFallback: {
    backgroundColor: '#EDE7FB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupInitials: { color: PURPLE, fontSize: 22, fontWeight: '700' },
  groupName: {
    marginTop: 9,
    color: '#151D2A',
    fontFamily: FONT,
    fontSize: 18,
    fontWeight: '600',
  },
  description: {
    marginTop: 7,
    color: '#758196',
    fontSize: 14,
    textAlign: 'center',
  },
  created: {
    marginTop: 8,
    color: '#758196',
    fontSize: 13,
    textAlign: 'center',
  },
  topActions: {
    minHeight: 56,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#EDF0F4',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  topAction: {
    height: 44,
    flex: 1,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  addMembersAction: { backgroundColor: '#F1EBFE' },
  settingsAction: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFF',
  },
  topActionText: { color: '#0B1220', fontSize: 14, fontWeight: '500' },
  addMembersText: { color: '#5121BF' },
  sectionHeader: {
    height: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: { color: '#111827', fontSize: 14, fontWeight: '600' },
  count: { color: PURPLE, fontSize: 12 },
  edit: {
    color: PURPLE,
    fontSize: 14,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  rule: { flex: 1, paddingVertical: 8, color: '#475569', fontSize: 14 },
  empty: { paddingVertical: 14, color: '#8792A4', fontSize: 14 },
  mediaRow: { minHeight: 72, paddingBottom: 10, flexDirection: 'row', gap: 5 },
  mediaTile: {
    position: 'relative',
    width: '24%',
    height: 65,
    overflow: 'hidden',
    borderRadius: 5,
    backgroundColor: '#D9DDE4',
  },
  mediaImage: { width: '100%', height: '100%' },
  play: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 27,
    height: 27,
    marginLeft: -13.5,
    marginTop: -13.5,
    borderRadius: 14,
    backgroundColor: 'rgba(20,20,30,.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playText: { color: '#FFF', fontSize: 10 },
  addRow: { height: 64, flexDirection: 'row', alignItems: 'center' },
  addBox: {
    width: 48,
    height: 48,
    marginRight: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberRow: { height: 58, flexDirection: 'row', alignItems: 'center' },
  memberAvatar: { width: 40, height: 40, borderRadius: 6 },
  avatarText: { color: PURPLE, fontSize: 11, fontWeight: '700' },
  memberCopy: { flex: 1, minWidth: 0, marginLeft: 11 },
  memberName: { color: '#172033', fontSize: 14, fontWeight: '600' },
  memberStatus: { marginTop: 4, color: '#8792A4', fontSize: 12 },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: '#EEF1FF',
  },
  badgeText: { color: '#334BC1', fontSize: 12, fontWeight: '600' },
  modBadge: { backgroundColor: '#E8F7F0' },
  modBadgeText: { color: '#16815F' },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center' },
  rowIcon: {
    width: 28,
    height: 28,
    borderRadius: 5,
    backgroundColor: '#F7F8FA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerIcon: { backgroundColor: '#FFF3F3' },
  rowIconText: { color: '#263448', fontSize: 13 },
  rowCopy: { flex: 1, minWidth: 0, marginLeft: 11 },
  rowTitle: {
    color: '#172033',
    fontFamily: FONT,
    fontSize: 14,
    fontWeight: '500',
  },
  rowSubtitle: { marginTop: 4, color: '#8792A4', fontSize: 12 },
  chevron: { color: '#8792A4', fontSize: 18 },
  allTrailing: { flexDirection: 'row', alignItems: 'center' },
  moreCount: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 3,
    backgroundColor: '#F1F2F5',
    color: '#64748B',
    fontSize: 12,
  },
  pinBadge: {
    minWidth: 20,
    height: 20,
    marginRight: 4,
    paddingHorizontal: 5,
    borderRadius: 10,
    backgroundColor: '#F0E7FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinBadgeText: { color: PURPLE, fontSize: 10, fontWeight: '700' },
  danger: { color: RED },
  subScreen: { flex: 1, backgroundColor: '#FFF' },
  subHeader: {
    height: 55,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF0F4',
    flexDirection: 'row',
    alignItems: 'center',
  },
  subTitle: { fontSize: 15, fontWeight: '600' },
  subContent: { padding: 16 },
  pinnedRow: {
    marginBottom: 12,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#F7F4FF',
  },
  pinnedSender: { color: PURPLE, fontSize: 14, fontWeight: '600' },
  pinnedText: { marginTop: 5, color: '#263448', fontSize: 11 },
  emptyCentered: { marginTop: 40, color: '#8792A4', textAlign: 'center' },
  rulesInput: {
    height: 160,
    padding: 12,
    borderWidth: 1,
    borderColor: '#DDE2E9',
    borderRadius: 8,
    color: '#172033',
    fontSize: 12,
    textAlignVertical: 'top',
  },
});
