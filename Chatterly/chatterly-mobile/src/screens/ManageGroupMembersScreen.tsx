import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import * as Contacts from 'expo-contacts';
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  chatIdOf,
  findDirectChatForUser,
  getChatList,
  searchChatContacts,
  startChat,
  type SearchContact,
} from '../services/chatApi';
import {
  subscribeToGroupChanges,
  subscribeToOnlineUsers,
} from '../services/chatRealtime';
import {
  addGroupParticipants,
  assignGroupAdmin,
  assignGroupModerator,
  disableGroupInviteLink,
  enableGroupInviteLink,
  defaultGroupRolePermissions,
  getGroupDetails,
  getGroupPermissions,
  removeGroupAdmin,
  removeGroupModerator,
  removeGroupParticipant,
  restrictGroupMembers,
  sendGroupTimelineNotice,
  unrestrictGroupMember,
  updateGroupPermissions,
  updateGroupMessagePermissions,
  type GroupDetails,
  type GroupMember,
  type GroupRolePermissionsPatch,
} from '../services/groupApi';
import {
  getGroupManageReportsPermission,
  setGroupManageReportsPermission,
} from '../services/groupPermissionStore';
import type { ChatMessage, ConversationContact } from '../types/chat';
import { getSession } from '../services/sessionStore';
import { syncContacts } from '../services/contactsApi';
import { Snackbar } from '../components/Snackbar';
import {
  AdminIcon,
  AdminToggle,
  type AdminIconName,
} from '../components/GroupAdminIcons';
import { GroupPermissionIcon } from '../components/GroupPermissionIcon';
import {
  AdminConfirmDialog,
  GroupActionsSheet,
  MemberActionsSheet,
  MemberProfileSheet,
  RestrictedBadge,
  RoleBadge,
} from '../components/GroupAdminSheets';
import {
  availableRoleChanges,
  canAddGroupMembers,
  canAssignGroupRoles,
  canRemoveMember,
  canRestrictMember,
  groupPermissionSections,
  isAdminDemotion,
  isGroupAdmin,
  memberActions,
  restrictableMembers,
  roleChangeSteps,
  similarGroupDraft,
  type EditableRole,
  type GroupPermissionKey,
  type MemberAction,
  type RoleChangeStep,
  type SimilarGroupDraft,
} from '../utils/groupAdmin';
import { createThemedStyles, themeInk } from '../theme/themedStyles';

export type ManageMembersPage =
  | 'manage'
  | 'add'
  | 'roles'
  | 'restricted'
  | 'restrict'
  | 'permissions';

type Props = {
  visible: boolean;
  groupId: string;
  onBack: () => void;
  onNotice: (message: string) => void;
  onTimelineMessage?: (message: ChatMessage) => void;
  initialPage?: ManageMembersPage;
  onOpenGroupSettings?: () => void;
  onOpenDirectChat?: (contact: ConversationContact, chatId: string) => void;
  onCreateSimilarGroup?: (draft: SimilarGroupDraft) => void;
};
type Confirmation =
  | { kind: 'restrict'; members: GroupMember[] }
  | { kind: 'unrestrict'; member: GroupMember }
  | { kind: 'demote'; member: GroupMember; role: EditableRole };
type DialogCopy = {
  icon: AdminIconName;
  title: string;
  body: string;
  confirmLabel: string;
  badge?: string;
};

const PURPLE = '#7442E8';
const RED = '#E53935';
const AMBER = '#E8890C';
const FONT = Platform.select({ android: 'sans-serif', ios: 'System' });
const PARENT_PAGE: Record<ManageMembersPage, ManageMembersPage | null> = {
  manage: null,
  add: 'manage',
  roles: 'manage',
  restricted: 'manage',
  restrict: 'restricted',
  permissions: 'manage',
};
const PAGE_TITLES: Record<Exclude<ManageMembersPage, 'manage'>, string> = {
  add: 'Add Members',
  roles: 'Manage Member Role',
  restricted: 'Restricted Members',
  restrict: 'Restrict Members',
  permissions: 'Manage Permissions',
};
const ROLE_STEPS: Record<
  RoleChangeStep,
  (groupId: string, userId: string) => Promise<void>
> = {
  'assign-admin': assignGroupAdmin,
  'remove-admin': removeGroupAdmin,
  'assign-moderator': assignGroupModerator,
  'remove-moderator': removeGroupModerator,
};

const errorText = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;
const toggleId = (current: Set<string>, id: string) => {
  const next = new Set(current);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
};

function BackIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path
        d="m15 18-6-6 6-6"
        stroke={themeInk('#111827')}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
function SearchIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Circle
        cx={10.5}
        cy={10.5}
        r={6.5}
        stroke={themeInk('#42516A')}
        strokeWidth={1.4}
      />
      <Path
        d="m15.5 15.5 4 4"
        stroke={themeInk('#42516A')}
        strokeWidth={1.4}
        strokeLinecap="round"
      />
    </Svg>
  );
}
function DownIcon({ color = '#111827' }: { color?: string }) {
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
      <Path
        d="m6 9 6 6 6-6"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
function MinusIcon({ large = false }: { large?: boolean }) {
  return (
    <View style={[styles.minusCircle, large && styles.minusCircleLarge]}>
      <Text style={[styles.minusText, large && styles.minusTextLarge]}>−</Text>
    </View>
  );
}
// Drawn rather than typed: the braille glyph this replaced picks up a different
// shape on every font and cannot be sized or coloured reliably.
function GridIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"
        fill={themeInk('#111827')}
      />
    </Svg>
  );
}
function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part[0]?.toUpperCase())
      .join('') || '?'
  );
}

function Avatar({
  member,
}: {
  member: Pick<GroupMember, 'name' | 'profilePic'>;
}) {
  return member.profilePic ? (
    <Image source={{ uri: member.profilePic }} style={styles.avatar} />
  ) : (
    <View style={[styles.avatar, styles.avatarFallback]}>
      <Text style={styles.avatarText}>{initials(member.name)}</Text>
    </View>
  );
}

function SelectedAvatar({
  member,
}: {
  member: Pick<GroupMember, 'name' | 'profilePic'>;
}) {
  return (
    <View style={styles.selectedAvatar}>
      <Avatar member={member} />
      <View style={styles.selectedBadge}>
        <Text style={styles.selectedCheck}>✓</Text>
      </View>
    </View>
  );
}

function confirmationCopy(
  confirmation: Confirmation | null,
): DialogCopy | null {
  if (!confirmation) return null;
  if (confirmation.kind === 'unrestrict')
    return {
      icon: 'restrict',
      title: 'Remove Restriction?',
      body: `${confirmation.member.name} will be able to send messages in this group again.`,
      confirmLabel: 'Remove Restriction',
    };
  if (confirmation.kind === 'demote')
    return {
      icon: 'crown',
      title: `Remove ${confirmation.member.name} as admin?`,
      body: `They will lose admin controls and stay in the group as ${
        confirmation.role === 'moderator' ? 'a moderator' : 'a member'
      }.`,
      confirmLabel: 'Remove Admin',
    };
  const count = confirmation.members.length;
  return count === 1
    ? {
        icon: 'restrict',
        title: `Restrict ${confirmation.members[0].name}?`,
        body: 'They won’t be able to send messages in this group while restricted. You can remove the restriction anytime.',
        confirmLabel: 'Restrict Member',
      }
    : {
        icon: 'restrict',
        title: 'Restrict Selected Members?',
        body: 'The selected members won’t be able to send messages in this group while restricted. You can remove the restriction anytime.',
        badge: `${count} Members Selected`,
        confirmLabel: `Restrict Members (${count})`,
      };
}

const memberPresenceLabel = (
  member: GroupMember,
  onlineIds: ReadonlySet<string>,
) => (onlineIds.has(String(member.userId)) ? 'Online' : 'Offline');

export function ManageGroupMembersScreen({
  visible,
  groupId,
  onBack,
  onNotice,
  onTimelineMessage,
  initialPage = 'manage',
  onOpenGroupSettings,
  onOpenDirectChat,
  onCreateSimilarGroup,
}: Props) {
  const insets = useSafeAreaInsets();
  const [page, setPage] = useState<ManageMembersPage>(initialPage);
  const [details, setDetails] = useState<GroupDetails | null>(null);
  const [query, setQuery] = useState('');
  const [candidates, setCandidates] = useState<SearchContact[]>([]);
  const [registeredContacts, setRegisteredContacts] = useState<SearchContact[]>(
    [],
  );
  const [contactsLoading, setContactsLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [restrictSelection, setRestrictSelection] = useState<Set<string>>(
    new Set(),
  );
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [roleMenuUserId, setRoleMenuUserId] = useState('');
  const [removeTarget, setRemoveTarget] = useState<GroupMember | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [memberSheet, setMemberSheet] = useState<GroupMember | null>(null);
  const [profileMember, setProfileMember] = useState<GroupMember | null>(null);
  const [profilePresence, setProfilePresence] = useState('');
  const [openingChat, setOpeningChat] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [busyPermission, setBusyPermission] = useState<GroupPermissionKey | ''>(
    '',
  );
  const [notice, setNotice] = useState('');
  const [onlineIds, setOnlineIds] = useState<ReadonlySet<string>>(new Set());
  const loadVersion = useRef(0);
  const currentUserId = String(getSession()?.user?.id || '');
  const clearNotice = useCallback(() => setNotice(''), []);

  const load = useCallback(
    async (silent = false) => {
      const version = ++loadVersion.current;
      if (!silent) setLoading(true);
      try {
        const [next, rolePermissions, moderatorManageReports] = await Promise.all([
          getGroupDetails(groupId),
          getGroupPermissions(groupId),
          getGroupManageReportsPermission(groupId),
        ]);
        next.rolePermissions = rolePermissions;
        next.localPermissions = {moderatorManageReports};
        if (version === loadVersion.current) setDetails(next);
      } catch (error) {
        if (!silent)
          onNotice(errorText(error, 'Unable to load group members.'));
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [groupId, onNotice],
  );

  const resetTransient = useCallback(() => {
    setQuery('');
    setSelected(new Set());
    setRestrictSelection(new Set());
    setRoleMenuUserId('');
  }, []);

  useEffect(() => {
    if (!visible) return;
    setPage(initialPage);
    resetTransient();
    setActionsOpen(false);
    setMemberSheet(null);
    setProfileMember(null);
    setConfirmation(null);
    setRemoveTarget(null);
    load();
  }, [initialPage, load, resetTransient, visible]);

  useEffect(() => {
    if (!visible) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    // Another admin restricting, promoting or changing settings lands here.
    // A burst (a bulk restriction) collapses into one refetch.
    const unsubscribe = subscribeToGroupChanges(groupId, () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        load(true);
      }, 300);
    });
    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, [groupId, load, visible]);

  useEffect(
    () => (visible ? subscribeToOnlineUsers(setOnlineIds) : undefined),
    [visible],
  );
  useEffect(() => {
    if (profileMember)
      setProfilePresence(memberPresenceLabel(profileMember, onlineIds));
  }, [onlineIds, profileMember]);

  useEffect(() => {
    if (!visible || page !== 'add') {
      setRegisteredContacts([]);
      setContactsLoading(false);
      return;
    }
    let active = true;
    setContactsLoading(true);
    const loadRegisteredContacts = async () => {
      try {
        let permission = await Contacts.getPermissionsAsync();
        if (!permission.granted && permission.canAskAgain !== false) {
          permission = await Contacts.requestPermissionsAsync();
        }
        if (!permission.granted) {
          if (active) setRegisteredContacts([]);
          return;
        }
        const deviceContacts = await Contacts.Contact.getAllDetails(
          [
            Contacts.ContactField.FULL_NAME,
            Contacts.ContactField.GIVEN_NAME,
            Contacts.ContactField.FAMILY_NAME,
            Contacts.ContactField.PHONES,
            Contacts.ContactField.THUMBNAIL,
          ],
          { sortOrder: Contacts.ContactsSortOrder?.GivenName },
        );
        const phoneNumbers = [
          ...new Set(
            deviceContacts.flatMap(contact =>
              (contact.phones || [])
                .map(phone => phone.number?.trim() || '')
                .filter(Boolean),
            ),
          ),
        ];
        if (!phoneNumbers.length) {
          if (active) setRegisteredContacts([]);
          return;
        }
        const synced = await syncContacts(phoneNumbers);
        const byPhone = new Map(
          phoneNumbers.map(phone => [
            phone.replace(/\D/g, '').slice(-10),
            phone,
          ]),
        );
        const loaded = (synced.registered || [])
          .map(contact => {
            const phone = contact.phone || contact.phoneNumber || '';
            const normalizedPhone = phone.replace(/\D/g, '').slice(-10);
            return {
              userId: String(contact._id || contact.id || ''),
              name: String(
                contact.name || contact.fullName || 'Chatterly contact',
              ),
              phone: phone || byPhone.get(normalizedPhone) || '',
              thumbnail: contact.profilePic || null,
            };
          })
          .filter(contact => contact.userId);
        if (active) setRegisteredContacts(loaded);
      } catch {
        if (active) setRegisteredContacts([]);
      } finally {
        if (active) setContactsLoading(false);
      }
    };
    loadRegisteredContacts();
    return () => {
      active = false;
    };
  }, [page, visible]);

  useEffect(() => {
    if (page !== 'add' || !query.trim()) {
      setCandidates([]);
      return;
    }
    let active = true;
    const timer = setTimeout(
      () =>
        searchChatContacts(query)
          .then(items => {
            if (active) setCandidates(items);
          })
          .catch(() => {
            if (active) setCandidates([]);
          }),
      250,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [page, query]);

  const participants = useMemo(() => details?.participants || [], [details]);
  const actorRole = participants.find(
    member => member.userId === currentUserId,
  )?.role;
  const canManage = isGroupAdmin(actorRole);
  const rolePermissions = details?.rolePermissions;
  const canAddMembers = canAddGroupMembers(actorRole, rolePermissions);
  const canAssignRoles = canAssignGroupRoles(actorRole, rolePermissions);
  const needle = query.trim().toLowerCase();
  const filteredMembers = useMemo(
    () =>
      participants.filter(
        member =>
          !needle ||
          member.name.toLowerCase().includes(needle) ||
          Boolean(member.phone?.includes(needle)),
      ),
    [needle, participants],
  );
  const restrictedMembers = filteredMembers.filter(member => member.isMuted);
  const restrictCandidates = restrictableMembers(
    filteredMembers,
    actorRole,
    currentUserId,
  );
  const restrictedCount = participants.filter(member => member.isMuted).length;
  const existingIds = useMemo(
    () => new Set(participants.map(member => member.userId)),
    [participants],
  );
  const allCandidates = useMemo(() => {
    const addNeedle = query.trim().toLocaleLowerCase();
    const byId = new Map(
      registeredContacts
        .filter(
          candidate =>
            !addNeedle ||
            candidate.name.toLocaleLowerCase().includes(addNeedle) ||
            candidate.phone?.toLocaleLowerCase().includes(addNeedle),
        )
        .map(candidate => [candidate.userId, candidate]),
    );
    candidates.forEach(candidate => byId.set(candidate.userId, candidate));
    return [...byId.values()];
  }, [candidates, query, registeredContacts]);
  const addCandidates = allCandidates.filter(
    candidate => !existingIds.has(candidate.userId),
  );
  const sheetActions = memberSheet
    ? memberActions(actorRole, memberSheet, currentUserId, {
        canMessage: Boolean(onOpenDirectChat),
          permissions: rolePermissions,
      })
    : [];
  const dialog = confirmationCopy(confirmation);

  const openPage = (next: ManageMembersPage) => {
    setPage(next);
    resetTransient();
  };
  const goBack = () => {
    const parent = PARENT_PAGE[page];
    // A page opened directly (Group Info's Permissions row) returns to its caller.
    if (page === initialPage || !parent) {
      onBack();
      return;
    }
    openPage(parent);
  };
  const handleRequestClose = () => {
    if (confirmation) {
      if (!saving) setConfirmation(null);
      return;
    }
    if (removeTarget) {
      if (!saving) setRemoveTarget(null);
      return;
    }
    if (profileMember) {
      setProfileMember(null);
      return;
    }
    if (memberSheet) {
      setMemberSheet(null);
      return;
    }
    if (actionsOpen) {
      setActionsOpen(false);
      return;
    }
    goBack();
  };
  const patchMembers = (userIds: Set<string>, patch: Partial<GroupMember>) =>
    setDetails(current =>
      current
        ? {
            ...current,
            participants: current.participants.map(member =>
              userIds.has(member.userId) ? { ...member, ...patch } : member,
            ),
          }
        : current,
    );

  const publishTimelineNotice = async (text: string) => {
    const tempId = `membership-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const optimistic: ChatMessage = {
      id: tempId,
      tempId,
      text,
      createdAt: new Date().toISOString(),
      isOwn: true,
      messageType: 'text',
      status: 'pending',
      systemEvent: true,
    };
    // Render first. A timeline persistence failure must not hide a membership
    // change that the group endpoint has already committed successfully.
    onTimelineMessage?.(optimistic);
    try {
      const saved = await sendGroupTimelineNotice(groupId, text);
      onTimelineMessage?.({ ...saved, tempId, systemEvent: true });
    } catch {
      onTimelineMessage?.({ ...optimistic, status: 'failed' });
    }
  };

  const addSelected = async () => {
    if (!selected.size || saving) return;
    setSaving(true);
    const ids = [...selected];
    try {
      await addGroupParticipants(groupId, ids);
      // The participant endpoint creates the push/in-app notification server-side.
      const selectedContacts = allCandidates.filter(candidate =>
        selected.has(candidate.userId),
      );
      for (const contact of selectedContacts) {
        await publishTimelineNotice(
          `${contact.name || contact.phone || 'A member'} added to the group.`,
        );
      }
      setNotice(
        `${ids.length} ${
          ids.length === 1 ? 'member' : 'members'
        } added and notified.`,
      );
      openPage('manage');
      await load();
    } catch (error) {
      setNotice(errorText(error, 'Unable to add members.'));
    } finally {
      setSaving(false);
    }
  };

  const removeMember = async () => {
    if (!removeTarget || saving) return;
    const member = removeTarget;
    setSaving(true);
    try {
      await removeGroupParticipant(groupId, member.userId);
      // The removal endpoint creates the recipient notification server-side.
      await publishTimelineNotice(`${member.name} removed from the group.`);
      setRemoveTarget(null);
      setDetails(current =>
        current
          ? {
              ...current,
              participants: current.participants.filter(
                item => item.userId !== member.userId,
              ),
            }
          : current,
      );
      setNotice(`${member.name} removed and notified.`);
    } catch (error) {
      setNotice(errorText(error, 'Unable to remove this member.'));
    } finally {
      setSaving(false);
    }
  };

  const applyRoleChange = async (member: GroupMember, role: EditableRole) => {
    setSaving(true);
    try {
      for (const step of roleChangeSteps(member.role, role))
        await ROLE_STEPS[step](groupId, member.userId);
      patchMembers(new Set([member.userId]), { role });
      setNotice(
        `${member.name} is now ${
          role === 'admin'
            ? 'an admin'
            : role === 'moderator'
            ? 'a moderator'
            : 'a member'
        }.`,
      );
    } catch (error) {
      await load(true);
      setNotice(errorText(error, 'Unable to update member role.'));
    } finally {
      setSaving(false);
      setConfirmation(null);
    }
  };

  const requestRoleChange = (member: GroupMember, role: EditableRole) => {
    setRoleMenuUserId('');
    if (
      saving ||
      member.role === role ||
      !availableRoleChanges(actorRole, member, currentUserId, rolePermissions).includes(role)
    )
      return;
    if (isAdminDemotion(member.role, role)) {
      setConfirmation({ kind: 'demote', member, role });
      return;
    }
    applyRoleChange(member, role);
  };

  const restrictMembers = async (members: GroupMember[]) => {
    if (saving || !members.length) return;
    setSaving(true);
    try {
      const { restrictedIds, failures } = await restrictGroupMembers(
        groupId,
        members.map(member => member.userId),
      );
      patchMembers(new Set(restrictedIds), { isMuted: true });
      setRestrictSelection(
        current =>
          new Set([...current].filter(id => !restrictedIds.includes(id))),
      );
      if (failures.length)
        setNotice(
          restrictedIds.length
            ? `${restrictedIds.length} of ${members.length} members restricted. ${failures[0].message}`
            : failures[0].message,
        );
      else
        setNotice(
          members.length === 1
            ? `${members[0].name} can no longer send messages.`
            : `${members.length} members restricted.`,
        );
      if (restrictedIds.length && page === 'restrict') openPage('restricted');
    } finally {
      setSaving(false);
      setConfirmation(null);
    }
  };

  const unrestrictMember = async (member: GroupMember) => {
    if (saving) return;
    setSaving(true);
    try {
      await unrestrictGroupMember(groupId, member.userId);
      patchMembers(new Set([member.userId]), { isMuted: false });
      setNotice(`${member.name} can send messages again.`);
    } catch (error) {
      setNotice(errorText(error, 'Unable to remove the restriction.'));
    } finally {
      setSaving(false);
      setConfirmation(null);
    }
  };

  const confirm = () => {
    if (!confirmation) return;
    if (confirmation.kind === 'restrict') restrictMembers(confirmation.members);
    else if (confirmation.kind === 'unrestrict')
      unrestrictMember(confirmation.member);
    else applyRoleChange(confirmation.member, confirmation.role);
  };

  const togglePermission = async (key: GroupPermissionKey, next: boolean) => {
    if (!details || !canManage || busyPermission) return;
    const previous = details;
    setBusyPermission(key);
    try {
      if (key === 'memberSend' || key === 'memberMedia') {
        const settings =
          key === 'memberSend'
            ? { ...details.settings, onlyAdminsCanMessage: !next }
            : { ...details.settings, onlyAdminsCanShareMedia: !next };
        setDetails({ ...details, settings });
        await updateGroupMessagePermissions(groupId, {
          membersCanSendMessages: !settings.onlyAdminsCanMessage,
          membersCanShareMedia: !settings.onlyAdminsCanShareMedia,
        });
        setNotice(
          key === 'memberSend'
            ? next
              ? 'Members can send messages.'
              : 'Only admins can send messages now.'
            : next
            ? 'Members can share media and files.'
            : 'Only admins can share media and files now.',
        );
      } else if (key === 'memberInvite') {
        if (next) await enableGroupInviteLink(groupId);
        else await disableGroupInviteLink(groupId);
        setDetails(current =>
          current
            ? { ...current, inviteLinkEnabled: next, inviteExpiresAt: null }
            : current,
        );
        setNotice(
          next
            ? 'Invite link turned on. Tap Share invite link to send it.'
            : 'Invite link turned off. The previous link no longer works.',
        );
        load(true);
      } else if (key === 'moderatorReports' && actorRole === 'superadmin') {
        setDetails({
          ...details,
          localPermissions: {moderatorManageReports: next},
        });
        await setGroupManageReportsPermission(groupId, next);
        setNotice('Moderator permission updated.');
      } else if (actorRole === 'superadmin') {
        const current = details.rolePermissions || defaultGroupRolePermissions();
        const updated = {
          member: { ...current.member },
          moderator: { ...current.moderator },
          admin: { ...current.admin },
        };
        let patch: GroupRolePermissionsPatch | null = null;
        if (key === 'memberAdd') {
          updated.member.addMembers = next;
          patch = { member: { addMembers: next } };
        } else if (key === 'moderatorAdd') {
          updated.moderator.addMembers = next;
          patch = { moderator: { addMembers: next } };
        } else if (key === 'moderatorRoles') {
          updated.moderator.assignRoles = next;
          patch = { moderator: { assignRoles: next } };
        } else if (key === 'moderatorPin') {
          updated.moderator.pinMessages = next;
          patch = { moderator: { pinMessages: next } };
        } else if (key === 'moderatorEdit') {
          updated.moderator.editGroupInfo = next;
          patch = { moderator: { editGroupInfo: next } };
        } else if (key === 'adminApprovals') {
          updated.admin.approveJoinRequests = next;
          patch = { admin: { approveJoinRequests: next } };
        }
        if (!patch) return;
        setDetails({ ...details, rolePermissions: updated });
        const saved = await updateGroupPermissions(groupId, patch);
        setDetails(currentDetails =>
          currentDetails ? { ...currentDetails, rolePermissions: saved } : currentDetails,
        );
        setNotice(
          `${key === 'adminApprovals' ? 'Admin' : key.startsWith('moderator') ? 'Moderator' : 'Member'} permission updated.`,
        );
      }
    } catch (error) {
      setDetails(previous);
      setNotice(errorText(error, 'Unable to update this permission.'));
    } finally {
      setBusyPermission('');
    }
  };

  const shareInviteLink = async () => {
    if (!details || busyPermission) return;
    setBusyPermission('memberInvite');
    try {
      const link = await enableGroupInviteLink(groupId);
      await Share.share({
        message: `Join “${details.name}” on Chatterly: ${link}`,
      });
    } catch (error) {
      setNotice(errorText(error, 'Unable to share the invite link.'));
    } finally {
      setBusyPermission('');
    }
  };

  const openProfile = (member: GroupMember) => {
    setProfileMember(member);
    setProfilePresence(memberPresenceLabel(member, onlineIds));
  };

  const openDirectChat = async (member: GroupMember) => {
    if (!onOpenDirectChat || openingChat) return;
    setOpeningChat(true);
    try {
      const existing = findDirectChatForUser(
        await getChatList().catch(() => []),
        member.userId,
      );
      const chatId =
        chatIdOf(existing) || (await startChat(member.userId)).chatId;
      onOpenDirectChat(
        {
          userId: member.userId,
          name: member.name,
          thumbnail: member.profilePic || null,
          kind: 'contact',
        },
        chatId,
      );
    } catch (error) {
      setProfileMember(null);
      setNotice(errorText(error, 'Unable to open this conversation.'));
    } finally {
      setOpeningChat(false);
    }
  };

  const runMemberAction = (member: GroupMember, action: MemberAction) => {
    setMemberSheet(null);
    if (action === 'view-profile') openProfile(member);
    else if (action === 'send-message') openDirectChat(member);
    else if (action === 'make-admin') requestRoleChange(member, 'admin');
    else if (action === 'make-moderator')
      requestRoleChange(member, 'moderator');
    else if (action === 'remove-admin' || action === 'remove-moderator')
      requestRoleChange(member, 'member');
    else if (action === 'restrict')
      setConfirmation({ kind: 'restrict', members: [member] });
    else if (action === 'unrestrict')
      setConfirmation({ kind: 'unrestrict', member });
    else setRemoveTarget(member);
  };

  const hasMemberManagement = canManage || canAddMembers || canAssignRoles;
  const title =
    page === 'manage'
      ? details && !hasMemberManagement
        ? 'Group Members'
        : 'Manage Members'
      : PAGE_TITLES[page];
  const bottomPadding = Math.max(insets.bottom, 14);

  const manageBody = (
    <ScrollView
      contentContainerStyle={styles.list}
      keyboardShouldPersistTaps="handled"
    >
      {hasMemberManagement ? (
        <>
          {canAddMembers ? (
          <Pressable
            accessibilityLabel="Add Members"
            onPress={() => openPage('add')}
            style={styles.actionRow}
          >
            <View style={styles.addIcon}>
              <Text style={styles.plus}>＋</Text>
            </View>
            <Text style={styles.actionText}>Add Members</Text>
          </Pressable>
          ) : null}
          {canAssignRoles ? (
          <Pressable
            accessibilityLabel="Manage Roles"
            onPress={() => openPage('roles')}
            style={styles.actionRow}
          >
            <View style={styles.roleIcon}>
              <AdminIcon name="settings" size={20} />
            </View>
            <View style={styles.actionCopy}>
              <Text style={styles.actionCopyTitle}>Manage Roles</Text>
              <Text style={styles.actionSubtitle}>Manage member roles</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
          ) : null}
          {canManage ? (
          <Pressable
            accessibilityLabel="Restrict Members"
            onPress={() => openPage('restricted')}
            style={styles.actionRow}
          >
            <View style={styles.restrictIcon}>
              <AdminIcon color={AMBER} name="restrict" size={20} />
            </View>
            <View style={styles.actionCopy}>
              <Text style={styles.actionCopyTitle}>Restrict Members</Text>
              <Text style={styles.actionSubtitle}>
                Restricted member cannot send messages
              </Text>
            </View>
            {restrictedCount ? (
              <View
                accessibilityLabel={`${restrictedCount} restricted`}
                style={styles.restrictCount}
              >
                <Text style={styles.restrictCountText}>{restrictedCount}</Text>
              </View>
            ) : null}
            <Text style={styles.chevron}>›</Text>
          </Pressable>
          ) : null}
        </>
      ) : null}
      {filteredMembers.map(member => (
        <Pressable
          accessibilityLabel={`Options for ${member.name}`}
          key={member.userId}
          onPress={() => setMemberSheet(member)}
          style={styles.memberRow}
        >
          <Avatar member={member} />
          <View style={styles.memberCopy}>
            <View style={styles.nameLine}>
              <Text numberOfLines={1} style={styles.name}>
                {member.name}
                {member.userId === currentUserId ? ' (You)' : ''}
              </Text>
              <RoleBadge role={member.role} />
            </View>
            <View style={styles.subLine}>
              <Text
                accessibilityLabel={`Presence for ${member.userId}`}
                numberOfLines={1}
                style={styles.phoneInline}
              >
                {memberPresenceLabel(member, onlineIds)}
              </Text>
              {member.isMuted ? <RestrictedBadge /> : null}
            </View>
          </View>
          {canRemoveMember(actorRole, member, currentUserId) ? (
            <Pressable
              accessibilityLabel={`Remove ${member.name}`}
              hitSlop={10}
              onPress={() => setRemoveTarget(member)}
            >
              <MinusIcon />
            </Pressable>
          ) : null}
        </Pressable>
      ))}
      {!filteredMembers.length ? (
        <Text style={styles.empty}>No members found.</Text>
      ) : null}
    </ScrollView>
  );

  const addBody = (
    <ScrollView
      contentContainerStyle={[styles.list, styles.addList]}
      keyboardShouldPersistTaps="handled"
    >
      {details && !canAddMembers ? (
        <Text style={styles.empty}>You don’t have permission to add members.</Text>
      ) : contactsLoading && !query.trim() ? (
        <ActivityIndicator color={PURPLE} style={styles.loading} />
      ) : !addCandidates.length ? (
        <Text style={styles.empty}>
          {query.trim() ? 'No contacts found.' : 'No contacts available.'}
        </Text>
      ) : (
        addCandidates.map(candidate => {
          const checked = selected.has(candidate.userId);
          return (
            <Pressable
              accessibilityLabel={`${checked ? 'Deselect' : 'Select'} ${
                candidate.name
              }`}
              accessibilityRole="checkbox"
              accessibilityState={{ checked }}
              key={candidate.userId}
              onPress={() =>
                setSelected(current => toggleId(current, candidate.userId))
              }
              style={styles.memberRow}
            >
              <View style={[styles.checkbox, checked && styles.checkboxOn]}>
                {checked ? <Text style={styles.check}>✓</Text> : null}
              </View>
              <Avatar
                member={{
                  name: candidate.name,
                  profilePic: candidate.thumbnail,
                }}
              />
              <View style={styles.memberCopy}>
                <Text style={styles.name}>{candidate.name}</Text>
                <Text style={styles.phone}>
                  {candidate.phone || 'Chatterly contact'}
                </Text>
              </View>
            </Pressable>
          );
        })
      )}
    </ScrollView>
  );

  const rolesBody = (
    <ScrollView
      contentContainerStyle={styles.rolesList}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.selectedHeading}>
        <Text style={styles.selectedHeadingText}>Selected Participants</Text>
        <View style={styles.selectedCount}>
          <Text style={styles.selectedCountText}>{participants.length}</Text>
        </View>
      </View>
      {filteredMembers.map(member => {
        const choices = availableRoleChanges(actorRole, member, currentUserId, rolePermissions);
        const isOpen = roleMenuUserId === member.userId;
        const displayRole =
          member.role === 'superadmin'
            ? 'Super Admin'
            : member.role === 'admin'
            ? 'Admin'
            : member.role === 'moderator'
            ? 'Moderator'
            : 'Member';
        const roleColor =
          member.role === 'moderator'
            ? '#08745B'
            : member.role === 'admin' || member.role === 'superadmin'
            ? '#244BC1'
            : '#111827';
        return (
          <View
            key={member.userId}
            style={[styles.roleRowWrap, isOpen && styles.roleRowWrapOpen]}
          >
            <View style={styles.roleRow}>
              <SelectedAvatar member={member} />
              <View style={styles.roleMemberCopy}>
                <Text numberOfLines={1} style={styles.roleName}>
                  {member.name}
                </Text>
                <Text numberOfLines={1} style={styles.roleStatus}>
                  {memberPresenceLabel(member, onlineIds)}
                </Text>
              </View>
              <Pressable
                accessibilityLabel={`Role for ${member.name}`}
                accessibilityState={{
                  disabled: choices.length === 0,
                  expanded: isOpen,
                }}
                disabled={!choices.length || saving}
                onPress={() => setRoleMenuUserId(isOpen ? '' : member.userId)}
                style={styles.roleSelector}
              >
                <Text style={[styles.roleSelectorText, { color: roleColor }]}>
                  {displayRole}
                </Text>
                {choices.length ? <DownIcon color={roleColor} /> : null}
              </Pressable>
            </View>
            {isOpen ? (
              <View
                accessibilityLabel={`Role options for ${member.name}`}
                style={styles.roleMenu}
              >
                {choices.map(role => {
                  const label =
                    role === 'admin'
                      ? 'Admin'
                      : role === 'moderator'
                      ? 'Moderator'
                      : 'Member';
                  const selectedRole = member.role === role;
                  return (
                    <Pressable
                      accessibilityLabel={`Set ${member.name} as ${role}`}
                      key={role}
                      onPress={() => requestRoleChange(member, role)}
                      style={styles.roleOption}
                    >
                      <Text
                        style={[
                          styles.roleOptionText,
                          selectedRole && styles.roleOptionTextSelected,
                        ]}
                      >
                        {label}
                      </Text>
                      {selectedRole ? (
                        <Text style={styles.roleOptionCheck}>✓</Text>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </View>
        );
      })}
      {!filteredMembers.length ? (
        <Text style={styles.empty}>No participants found.</Text>
      ) : null}
    </ScrollView>
  );

  const restrictedBody = (
    <ScrollView
      contentContainerStyle={styles.list}
      keyboardShouldPersistTaps="handled"
    >
      {canManage ? (
        <Pressable
          accessibilityLabel="Restrict more members"
          onPress={() => openPage('restrict')}
          style={styles.actionRow}
        >
          <View style={styles.addIcon}>
            <Text style={styles.plus}>＋</Text>
          </View>
          <Text style={styles.actionText}>Add Members</Text>
        </Pressable>
      ) : null}
      {restrictedMembers.map(member => (
        <View key={member.userId} style={styles.memberRow}>
          <Avatar member={member} />
          <View style={styles.memberCopy}>
            <Text numberOfLines={1} style={styles.name}>
              {member.name}
            </Text>
            <Text numberOfLines={1} style={styles.phone}>
              {memberPresenceLabel(member, onlineIds)}
            </Text>
          </View>
          {canRestrictMember(actorRole, member, currentUserId) ? (
            <Pressable
              accessibilityLabel={`Remove restriction for ${member.name}`}
              hitSlop={10}
              onPress={() => setConfirmation({ kind: 'unrestrict', member })}
              style={styles.clearButton}
            >
              <AdminIcon color="#42516A" name="close" size={18} />
            </Pressable>
          ) : null}
        </View>
      ))}
      {!restrictedMembers.length ? (
        <Text style={styles.empty}>
          {needle
            ? 'No restricted members match your search.'
            : 'No one is restricted. Restricted members can still read the group but cannot send messages.'}
        </Text>
      ) : null}
    </ScrollView>
  );

  const restrictBody = (
    <ScrollView
      contentContainerStyle={styles.rolesList}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.sectionLabel}>All Members</Text>
      {restrictCandidates.map(member => {
        const checked = restrictSelection.has(member.userId);
        return (
          <Pressable
            accessibilityLabel={`${checked ? 'Deselect' : 'Select'} ${
              member.name
            }`}
            accessibilityRole="checkbox"
            accessibilityState={{ checked }}
            key={member.userId}
            onPress={() =>
              setRestrictSelection(current => toggleId(current, member.userId))
            }
            style={styles.restrictRow}
          >
            <View style={[styles.radio, checked && styles.radioOn]}>
              {checked ? <Text style={styles.check}>✓</Text> : null}
            </View>
            <SelectedAvatar member={member} />
            <View style={styles.roleMemberCopy}>
              <Text numberOfLines={1} style={styles.roleName}>
                {member.name}
              </Text>
              <Text numberOfLines={1} style={styles.roleStatus}>
                {memberPresenceLabel(member, onlineIds)}
              </Text>
            </View>
          </Pressable>
        );
      })}
      {!restrictCandidates.length ? (
        <Text style={styles.empty}>
          {canManage
            ? 'Everyone you can restrict is already restricted.'
            : 'Only group admins can restrict members.'}
        </Text>
      ) : null}
    </ScrollView>
  );

  const permissionsBody = (
    <ScrollView
      contentContainerStyle={{ paddingBottom: bottomPadding + 12 }}
      showsVerticalScrollIndicator={false}
    >
      {details
        ? groupPermissionSections(details, actorRole).map((section, index) => (
            <View
              key={section.title}
              style={[
                styles.permissionSection,
                index > 0 && styles.permissionSectionDivider,
              ]}
            >
              <Text style={styles.permissionSectionTitle}>{section.title}</Text>
              {section.rows.map(row => (
                <View key={row.key} style={styles.permissionRow}>
                  <View
                    style={[
                      styles.permissionIcon,
                      section.tone === 'moderator' &&
                        styles.permissionIconModerator,
                      section.tone === 'admin' && styles.permissionIconAdmin,
                    ]}
                  >
                    <GroupPermissionIcon permission={row.key} size={40} />
                  </View>
                  <View style={styles.permissionCopy}>
                    <Text style={styles.permissionTitle}>{row.title}</Text>
                    <Text style={styles.permissionSubtitle}>
                      {row.subtitle}
                    </Text>
                    {row.lockedReason ? (
                      <View style={styles.lockedLine}>
                        <AdminIcon color="#8792A4" name="lock" size={11} />
                        <Text style={styles.permissionLocked}>
                          {row.lockedReason}
                        </Text>
                      </View>
                    ) : null}
                    {row.key === 'memberInvite' && row.value && canManage ? (
                      <Pressable
                        accessibilityLabel="Share invite link"
                        disabled={Boolean(busyPermission)}
                        hitSlop={6}
                        onPress={shareInviteLink}
                      >
                        <Text style={styles.permissionLink}>
                          Share invite link
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                  <AdminToggle
                    busy={busyPermission === row.key}
                    disabled={!row.editable || Boolean(busyPermission)}
                    label={`${section.title} ${row.title}`}
                    onChange={next => togglePermission(row.key, next)}
                    value={row.value}
                  />
                </View>
              ))}
            </View>
          ))
        : null}
      <Text style={styles.permissionFootnote}>
        {canManage
          ? 'Locked settings follow Chatterly’s group rules and apply to every group.'
          : 'Only group admins can change these permissions.'}
      </Text>
    </ScrollView>
  );

  const body =
    page === 'manage'
      ? manageBody
      : page === 'add'
      ? addBody
      : page === 'roles'
      ? rolesBody
      : page === 'restricted'
      ? restrictedBody
      : page === 'restrict'
      ? restrictBody
      : permissionsBody;

  return (
    <Modal
      animationType="slide"
      onRequestClose={handleRequestClose}
      statusBarTranslucent
      visible={visible}
    >
      <SafeAreaProvider>
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={[styles.header, page === 'roles' && styles.rolesHeader]}>
          <Pressable
            accessibilityLabel="Back"
            hitSlop={12}
            onPress={goBack}
            style={styles.back}
          >
            <BackIcon />
          </Pressable>
          <Text
            numberOfLines={1}
            style={[styles.title, page === 'roles' && styles.rolesTitle]}
          >
            {title}
          </Text>
          {page === 'manage' && canManage ? (
            <Pressable
              accessibilityLabel="More group actions"
              hitSlop={10}
              onPress={() => setActionsOpen(true)}
              style={styles.headerAction}
            >
              <AdminIcon color="#111827" name="more" size={20} />
            </Pressable>
          ) : null}
        </View>
        {page !== 'permissions' ? (
          <View style={[styles.search, page === 'roles' && styles.rolesSearch]}>
            <SearchIcon />
            <TextInput
              accessibilityLabel={
                page === 'add'
                  ? 'Search contacts to add'
                  : page === 'roles'
                  ? 'Search contacts and chats'
                  : 'Search group members'
              }
              onChangeText={setQuery}
              placeholder={
                page === 'add'
                  ? 'Search Contacts'
                  : page === 'roles'
                  ? 'Search Contacts and Chats'
                  : 'Search Members'
              }
              placeholderTextColor="#42516A"
              style={styles.searchInput}
              value={query}
            />
            {page !== 'roles' ? (
              <View
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                <GridIcon />
              </View>
            ) : null}
          </View>
        ) : null}

        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={PURPLE} />
          </View>
        ) : (
          body
        )}

        {page === 'add' && canAddMembers ? (
          <View style={[styles.footer, { paddingBottom: bottomPadding }]}>
            <Pressable
              accessibilityLabel="Add selected members"
              accessibilityState={{ disabled: !selected.size, busy: saving }}
              disabled={!selected.size || saving}
              onPress={addSelected}
              style={[
                styles.addButton,
                !selected.size && styles.addButtonDisabled,
              ]}
            >
              {saving ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.addButtonText}>
                  Add Selected ({selected.size})
                </Text>
              )}
            </Pressable>
          </View>
        ) : null}
        {page === 'restrict' && canManage ? (
          <View style={[styles.footer, { paddingBottom: bottomPadding }]}>
            <View style={styles.footerHint}>
              <AdminIcon color="#42516A" name="info" size={16} />
              <Text style={styles.footerHintText}>
                Restricted members cannot send any messages
              </Text>
            </View>
            <Pressable
              accessibilityLabel="Restrict selected members"
              accessibilityState={{
                disabled: !restrictSelection.size,
                busy: saving,
              }}
              disabled={!restrictSelection.size || saving}
              onPress={() =>
                setConfirmation({
                  kind: 'restrict',
                  members: participants.filter(member =>
                    restrictSelection.has(member.userId),
                  ),
                })
              }
              style={[
                styles.addButton,
                !restrictSelection.size && styles.addButtonDisabled,
              ]}
            >
              <Text style={styles.addButtonText}>Restrict Members</Text>
            </Pressable>
          </View>
        ) : null}

        <GroupActionsSheet
          bottomInset={insets.bottom}
          onAddMembers={canManage ? () => openPage('add') : undefined}
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
            canManage ? () => openPage('permissions') : undefined
          }
          onGroupSettings={onOpenGroupSettings}
          visible={actionsOpen}
        />
        <MemberActionsSheet
          actions={sheetActions}
          bottomInset={insets.bottom}
          member={memberSheet}
          onAction={runMemberAction}
          onClose={() => setMemberSheet(null)}
        />
        <MemberProfileSheet
          bottomInset={insets.bottom}
          busy={openingChat}
          member={profileMember}
          onClose={() => setProfileMember(null)}
          onSendMessage={
            profileMember &&
            onOpenDirectChat &&
            profileMember.userId !== currentUserId
              ? () => openDirectChat(profileMember)
              : undefined
          }
          presence={profilePresence}
        />
        {dialog ? (
          <AdminConfirmDialog
            {...dialog}
            busy={saving}
            onCancel={() => setConfirmation(null)}
            onConfirm={confirm}
            visible
          />
        ) : null}

        {/* An overlay inside this screen rather than a nested Modal: iOS will not
          present one modal while another is dismissing, which is exactly what a
          member sheet handing off to this confirmation does. */}
        {removeTarget ? (
          <View style={styles.overlay}>
            <Pressable
              accessibilityLabel="Cancel removal"
              disabled={saving}
              onPress={() => setRemoveTarget(null)}
              style={[StyleSheet.absoluteFill, styles.overlayBackdrop]}
            />
            <View
              accessibilityLabel="Remove member confirmation"
              style={styles.dialog}
            >
              <MinusIcon large />
              <Text style={styles.dialogTitle}>
                Remove {removeTarget.name} from{`\n`}group?
              </Text>
              <Text style={styles.dialogBody}>
                {removeTarget.name} will be removed from this group and will no
                longer be able to send or receive new messages. They may still
                be able to view previous messages, depending on the group’s
                history settings.
              </Text>
              <Pressable
                accessibilityLabel={`Confirm remove ${removeTarget.name}`}
                disabled={saving}
                onPress={removeMember}
                style={styles.removeButton}
              >
                {saving ? (
                  <ActivityIndicator color={RED} />
                ) : (
                  <Text style={styles.removeButtonText}>
                    Remove {removeTarget.name}
                  </Text>
                )}
              </Pressable>
              <Pressable
                accessibilityLabel="Cancel"
                disabled={saving}
                onPress={() => setRemoveTarget(null)}
                style={styles.cancelButton}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        <Snackbar bottomInset={insets.bottom} message={notice} onHide={clearNotice} />
      </View>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = createThemedStyles({
  screen: { flex: 1, backgroundColor: '#FFF' },
  header: {
    height: 58,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
  },
  rolesHeader: { height: 68, paddingHorizontal: 22 },
  back: { width: 30, height: 40, justifyContent: 'center' },
  title: {
    flex: 1,
    color: '#111827',
    fontFamily: FONT,
    fontSize: 17,
    fontWeight: '700',
  },
  rolesTitle: { color: '#0D1424', fontSize: 20 },
  headerAction: {
    width: 36,
    height: 40,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  search: {
    height: 48,
    marginHorizontal: 20,
    marginBottom: 11,
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: '#E1E5EB',
    borderRadius: 8,
    backgroundColor: '#FAFAFB',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rolesSearch: { height: 48, marginTop: 14, marginBottom: 20, borderRadius: 9 },
  searchInput: { flex: 1, color: '#111827', fontFamily: FONT, fontSize: 12 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: 20, paddingBottom: 30 },
  addList: { paddingTop: 5 },
  actionRow: { minHeight: 67, flexDirection: 'row', alignItems: 'center' },
  addIcon: {
    width: 43,
    height: 43,
    borderRadius: 8,
    backgroundColor: '#F1EAFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  plus: { color: PURPLE, fontSize: 24, fontWeight: '300' },
  roleIcon: {
    width: 43,
    height: 43,
    borderWidth: 1,
    borderColor: '#E6E9EE',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  restrictIcon: {
    width: 43,
    height: 43,
    borderRadius: 8,
    backgroundColor: '#FFF5E8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  restrictCount: {
    minWidth: 22,
    height: 20,
    marginRight: 8,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  restrictCountText: { color: '#DC2626', fontSize: 11, fontWeight: '700' },
  actionCopy: { flex: 1, marginLeft: 14 },
  actionText: {
    marginLeft: 14,
    color: '#111827',
    fontFamily: FONT,
    fontSize: 14,
    fontWeight: '500',
  },
  actionCopyTitle: {
    color: '#111827',
    fontFamily: FONT,
    fontSize: 14,
    fontWeight: '500',
  },
  actionSubtitle: { marginTop: 4, color: '#7B8799', fontSize: 10 },
  chevron: { color: '#42516A', fontSize: 25 },
  memberRow: { minHeight: 69, flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 43, height: 43, borderRadius: 8 },
  avatarFallback: {
    backgroundColor: '#EEE8FA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: PURPLE, fontSize: 12, fontWeight: '700' },
  memberCopy: { flex: 1, minWidth: 0, marginLeft: 14 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { maxWidth: '64%', color: '#111827', fontSize: 13, fontWeight: '500' },
  phone: { marginTop: 4, color: '#667387', fontSize: 10 },
  subLine: { marginTop: 4, flexDirection: 'row', alignItems: 'center', gap: 6 },
  phoneInline: { flexShrink: 1, color: '#667387', fontSize: 10 },
  clearButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  minusCircle: {
    width: 22,
    height: 22,
    borderWidth: 1.3,
    borderColor: '#42516A',
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  minusText: { marginTop: -2, color: '#42516A', fontSize: 16, lineHeight: 18 },
  minusCircleLarge: {
    width: 52,
    height: 52,
    borderWidth: 0,
    backgroundColor: '#FFF0F0',
    borderRadius: 26,
  },
  minusTextLarge: { color: RED, fontSize: 29, lineHeight: 35 },
  checkbox: {
    width: 22,
    height: 22,
    marginRight: 12,
    borderWidth: 1.5,
    borderColor: '#778398',
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { borderColor: PURPLE, backgroundColor: PURPLE },
  check: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  empty: {
    paddingTop: 45,
    paddingHorizontal: 12,
    color: '#7B8799',
    fontSize: 13,
    textAlign: 'center',
  },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: '#EDF0F4' },
  footerHint: {
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  footerHintText: { color: '#42516A', fontFamily: FONT, fontSize: 12 },
  addButton: {
    height: 48,
    borderRadius: 8,
    backgroundColor: PURPLE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonDisabled: { backgroundColor: '#D8DDE7' },
  addButtonText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  rolesList: { paddingHorizontal: 20, paddingBottom: 40 },
  selectedHeading: {
    height: 36,
    marginBottom: 4,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  selectedHeadingText: {
    color: '#0D1424',
    fontFamily: FONT,
    fontSize: 16,
    fontWeight: '500',
  },
  selectedCount: {
    minWidth: 32,
    height: 22,
    paddingHorizontal: 10,
    borderRadius: 11,
    backgroundColor: '#F2EBFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedCountText: { color: '#6C36DE', fontSize: 12, fontWeight: '600' },
  sectionLabel: {
    marginBottom: 4,
    color: '#0D1424',
    fontFamily: FONT,
    fontSize: 14,
    fontWeight: '500',
  },
  roleRowWrap: { position: 'relative', zIndex: 1 },
  roleRowWrapOpen: { zIndex: 10 },
  roleRow: { height: 80, flexDirection: 'row', alignItems: 'center' },
  restrictRow: { height: 76, flexDirection: 'row', alignItems: 'center' },
  radio: {
    width: 22,
    height: 22,
    marginRight: 12,
    borderWidth: 1.5,
    borderColor: '#9AA4B2',
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { borderColor: PURPLE, backgroundColor: PURPLE },
  selectedAvatar: { width: 48, height: 48 },
  selectedBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 20,
    height: 15,
    borderTopLeftRadius: 9,
    borderBottomRightRadius: 9,
    backgroundColor: '#0BBB84',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedCheck: { color: '#FFF', fontSize: 10, fontWeight: '800' },
  roleMemberCopy: { flex: 1, minWidth: 0, marginLeft: 13, paddingRight: 8 },
  roleName: {
    color: '#0D1424',
    fontFamily: FONT,
    fontSize: 17,
    fontWeight: '500',
  },
  roleStatus: {
    marginTop: 4,
    color: '#42516A',
    fontFamily: FONT,
    fontSize: 14,
  },
  roleSelector: {
    minWidth: 92,
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 9,
  },
  roleSelectorText: { fontFamily: FONT, fontSize: 15, fontWeight: '500' },
  roleMenu: {
    position: 'absolute',
    right: 0,
    top: 64,
    width: 138,
    borderWidth: 1,
    borderColor: '#E2E6ED',
    borderRadius: 9,
    backgroundColor: '#FFF',
    shadowColor: '#111827',
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 7,
  },
  roleOption: {
    height: 42,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  roleOptionText: { color: '#273449', fontFamily: FONT, fontSize: 13 },
  roleOptionTextSelected: { color: PURPLE, fontWeight: '600' },
  roleOptionCheck: { color: PURPLE, fontSize: 13, fontWeight: '700' },
  permissionSection: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  permissionSectionDivider: { borderTopWidth: 1, borderTopColor: '#E6EAF0' },
  permissionSectionTitle: {
    marginBottom: 4,
    color: '#111827',
    fontFamily: FONT,
    fontSize: 13,
    fontWeight: '600',
  },
  permissionRow: {
    minHeight: 72,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  permissionIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#F4F5F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionIconModerator: { backgroundColor: '#E9F7F1' },
  permissionIconAdmin: { backgroundColor: '#EDF4FF' },
  permissionCopy: { flex: 1, minWidth: 0 },
  permissionTitle: {
    color: '#111827',
    fontFamily: FONT,
    fontSize: 14,
    fontWeight: '600',
  },
  permissionSubtitle: {
    marginTop: 3,
    color: '#66758C',
    fontFamily: FONT,
    fontSize: 11,
    lineHeight: 15,
  },
  lockedLine: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  permissionLocked: {
    flexShrink: 1,
    color: '#8792A4',
    fontFamily: FONT,
    fontSize: 10,
  },
  permissionLink: {
    marginTop: 6,
    color: PURPLE,
    fontFamily: FONT,
    fontSize: 12,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  permissionFootnote: {
    paddingHorizontal: 20,
    paddingTop: 8,
    color: '#8792A4',
    fontFamily: FONT,
    fontSize: 11,
    lineHeight: 16,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 40,
    paddingHorizontal: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayBackdrop: { backgroundColor: 'rgba(20,24,31,0.42)' },
  dialog: {
    width: '100%',
    maxWidth: 360,
    paddingHorizontal: 27,
    paddingTop: 22,
    paddingBottom: 10,
    borderRadius: 14,
    backgroundColor: '#FFF',
    alignItems: 'center',
  },
  dialogTitle: {
    marginTop: 13,
    color: '#111827',
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '700',
    textAlign: 'center',
  },
  dialogBody: {
    marginTop: 12,
    color: '#737E90',
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
  },
  removeButton: {
    width: '100%',
    height: 48,
    marginTop: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeButtonText: { color: RED, fontSize: 13, fontWeight: '500' },
  cancelButton: {
    width: '100%',
    height: 45,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: { color: '#111827', fontSize: 13, fontWeight: '500' },
});
