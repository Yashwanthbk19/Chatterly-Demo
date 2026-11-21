import { normalizeGroupRuleList } from './groupRules';
import {
  createPermissionsModel,
  restrictMemberPermissions,
  setMuted,
} from './permissions';

export const GROUP_FIELDS = Object.freeze([
  'groupId',
  'groupName',
  'groupPhoto',
  'description',
  'rules',
  'allowNewMembersToViewPreviousMessages',
  'createdBy',
  'members',
  'admins',
  'moderators',
  'createdAt',
]);
export const GROUP_PARTICIPANT_FIELDS = Object.freeze(['memberId', 'role', 'permissions', 'joinedAt']);
export const GROUP_PARTICIPANT_ROLES = Object.freeze(['member', 'moderator', 'admin', 'superadmin']);
export const GROUP_PARTICIPANT_PERMISSIONS = Object.freeze({
  superadmin: Object.freeze(['add_participants', 'remove_participants', 'manage_roles', 'update_group', 'manage_permissions']),
  member: Object.freeze([]),
  moderator: Object.freeze(['add_participants', 'remove_participants']),
  admin: Object.freeze([
    'add_participants',
    'remove_participants',
    'manage_roles',
    'update_group',
  ]),
});

export const GROUP_SCHEMA = Object.freeze({
  fields: GROUP_FIELDS,
  required: Object.freeze(['groupId', 'groupName', 'createdBy', 'members', 'admins', 'createdAt']),
  roleFields: Object.freeze(['members', 'admins', 'moderators']),
  participantFields: GROUP_PARTICIPANT_FIELDS,
  participantRoles: GROUP_PARTICIPANT_ROLES,
  participantPermissions: GROUP_PARTICIPANT_PERMISSIONS,
});

const isObjectRecord = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const normalizeOptionalText = (value) => String(value || '').trim();

// Participant records can come from populated API users. Keep only primitive
// display values when carrying them into the shared group model so member lists
// retain real contact information instead of falling back to their database IDs.
const normalizeParticipantDisplayText = (value) =>
  typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';

export const normalizeGroupHistoryVisibilitySetting = (value, fallbackValue = true) => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  const normalizedValue = String(value ?? '').trim().toLowerCase();
  if (!normalizedValue) {
    return Boolean(fallbackValue);
  }

  if (['true', '1', 'yes', 'enabled', 'enable', 'on', 'allow', 'allowed'].includes(normalizedValue)) {
    return true;
  }

  if (['false', '0', 'no', 'disabled', 'disable', 'off', 'deny', 'denied'].includes(normalizedValue)) {
    return false;
  }

  return Boolean(fallbackValue);
};

const normalizeGroupTimestamp = (value, fallbackValue = Date.now()) => {
  const parsedTimestamp = new Date(value || fallbackValue);
  const parsedFallbackTimestamp = new Date(fallbackValue || Date.now());
  const safeFallbackTimestamp = Number.isNaN(parsedFallbackTimestamp.getTime())
    ? new Date()
    : parsedFallbackTimestamp;

  return Number.isNaN(parsedTimestamp.getTime())
    ? safeFallbackTimestamp.toISOString()
    : parsedTimestamp.toISOString();
};

const normalizeGroupCreatedAt = (group = {}) => {
  const createdAt = group?.createdAt || group?.created_at || group?.timestamp || group?.updatedAt;

  return normalizeGroupTimestamp(createdAt);
};

const normalizeAllowNewMembersToViewPreviousMessages = (group = {}) =>
  normalizeGroupHistoryVisibilitySetting(
    group?.allowNewMembersToViewPreviousMessages ??
      group?.allow_new_members_to_view_previous_messages ??
      group?.newMembersCanViewPreviousMessages ??
      group?.viewPreviousMessagesForNewMembers,
    true
  );

const getGroupMemberKey = (member) => {
  if (member === undefined || member === null) return '';
  if (typeof member === 'string' || typeof member === 'number') return String(member).trim();
  if (!isObjectRecord(member)) return '';

  return String(
    member?.memberId ||
      member?.member_id ||
      member?.userId ||
      member?.id ||
      member?._id ||
      member?.participantId ||
      member?.phone ||
      member?.email ||
      member?.name ||
      ''
  ).trim();
};

const normalizeGroupMemberRole = (role, fallbackRole = 'member') => {
  const normalizedRole = String(role || fallbackRole || 'member').trim().toLowerCase();

  return GROUP_PARTICIPANT_ROLES.includes(normalizedRole) ? normalizedRole : 'member';
};

const normalizeGroupMemberPermissions = (role) => {
  const normalizedRole = normalizeGroupMemberRole(role);
  return [...(GROUP_PARTICIPANT_PERMISSIONS[normalizedRole] || GROUP_PARTICIPANT_PERMISSIONS.member)];
};

const getGroupMemberAdminPermissionDraft = (member) => {
  if (!isObjectRecord(member)) {
    return {};
  }

  if (isObjectRecord(member?.adminPermissions)) {
    return member.adminPermissions;
  }

  if (isObjectRecord(member?.permissions)) {
    return member.permissions;
  }

  return {};
};

const resolveGroupMemberAdminPermissions = (member, role) => {
  const normalizedRole = normalizeGroupMemberRole(role);
  const isMuted = Boolean(member?.isMuted ?? member?.muted);
  const isRestricted = Boolean(member?.isRestricted ?? member?.restricted);
  let permissions = createPermissionsModel(
    getGroupMemberAdminPermissionDraft(member),
    { role: normalizedRole }
  );

  permissions = setMuted(permissions, isMuted);

  if (isRestricted) {
    permissions = restrictMemberPermissions(permissions);
  }

  return permissions;
};

const resolveGroupMemberJoinedAt = (member, fallbackJoinedAt) => {
  const joinedAt = isObjectRecord(member)
    ? member?.joinedAt || member?.joined_at || member?.createdAt || member?.created_at
    : '';

  return normalizeGroupTimestamp(joinedAt, fallbackJoinedAt || Date.now());
};

export const createGroupParticipantModel = (member, options = {}) => {
  const memberId = getGroupMemberKey(member);

  if (!memberId) {
    return null;
  }
  const role = normalizeGroupMemberRole(
    isObjectRecord(member) ? member?.role || member?.memberRole : '',
    options?.role
  );
  const memberUser = isObjectRecord(member?.user) ? member.user : {};
  const displaySource = isObjectRecord(member) ? member : {};

  return {
    memberId,
    role,
    permissions: normalizeGroupMemberPermissions(role),
    adminPermissions: resolveGroupMemberAdminPermissions(member, role),
    isMuted: Boolean(member?.isMuted ?? member?.muted),
    isRestricted: Boolean(member?.isRestricted ?? member?.restricted),
    joinedAt: resolveGroupMemberJoinedAt(member, options?.joinedAt),
    name: normalizeParticipantDisplayText(displaySource.name || memberUser.name),
    fullName: normalizeParticipantDisplayText(displaySource.fullName || memberUser.fullName),
    phone: normalizeParticipantDisplayText(displaySource.phone || memberUser.phone),
    email: normalizeParticipantDisplayText(displaySource.email || memberUser.email),
    profilePic: normalizeParticipantDisplayText(displaySource.profilePic || memberUser.profilePic),
    description: normalizeParticipantDisplayText(displaySource.description || memberUser.description),
    bio: normalizeParticipantDisplayText(displaySource.bio || memberUser.bio),
    about: normalizeParticipantDisplayText(displaySource.about || memberUser.about),
    status: normalizeParticipantDisplayText(displaySource.status || memberUser.status),
  };
};

const normalizeGroupRoleIdList = (members = []) => {
  if (!Array.isArray(members)) {
    return [];
  }

  const seenMemberKeys = new Set();

  return members.reduce((normalizedMembers, member) => {
    const memberKey = getGroupMemberKey(member);

    if (!memberKey || seenMemberKeys.has(memberKey)) {
      return normalizedMembers;
    }

    seenMemberKeys.add(memberKey);
    normalizedMembers.push(memberKey);

    return normalizedMembers;
  }, []);
};

const includeGroupRoleMemberId = (members = [], member) => {
  const memberKey = getGroupMemberKey(member);
  const normalizedMembers = normalizeGroupRoleIdList(members);

  if (!memberKey || normalizedMembers.includes(memberKey)) {
    return normalizedMembers;
  }

  return [memberKey, ...normalizedMembers];
};

const normalizeGroupParticipantList = (members = [], options = {}) => {
  if (!Array.isArray(members)) {
    return [];
  }

  const seenMemberKeys = new Set();
  const roleByMemberId = options?.roleByMemberId instanceof Map ? options.roleByMemberId : new Map();

  return members.reduce((normalizedMembers, member) => {
    const memberKey = getGroupMemberKey(member);

    if (!memberKey || seenMemberKeys.has(memberKey)) {
      return normalizedMembers;
    }

    const roleFromRoleList = roleByMemberId.get(memberKey);
    const participantSource =
      roleFromRoleList && isObjectRecord(member) ? { ...member, role: roleFromRoleList } : member;
    const participant = createGroupParticipantModel(participantSource, {
      role: roleFromRoleList || options?.defaultRole || 'member',
      joinedAt: options?.joinedAt,
    });

    if (!participant) {
      return normalizedMembers;
    }

    seenMemberKeys.add(memberKey);
    normalizedMembers.push(participant);

    return normalizedMembers;
  }, []);
};

const includeGroupParticipant = (members = [], member, options = {}) => {
  const memberKey = getGroupMemberKey(member);
  const normalizedMembers = normalizeGroupParticipantList(members, options);

  if (!memberKey || normalizedMembers.some((groupMember) => groupMember.memberId === memberKey)) {
    return normalizedMembers;
  }

  const participant = createGroupParticipantModel(member, options);

  return participant ? [participant, ...normalizedMembers] : normalizedMembers;
};

export const createGroupModel = (group = {}) => {
  const createdBy =
    getGroupMemberKey(group?.createdBy) ||
    getGroupMemberKey(group?.creatorId) ||
    getGroupMemberKey(group?.ownerId) ||
    getGroupMemberKey(group?.adminId) ||
    getGroupMemberKey(Array.isArray(group?.admins) ? group.admins[0] : '');
  const createdAt = normalizeGroupCreatedAt(group);
  const admins = includeGroupRoleMemberId(group?.admins, createdBy);
  const moderators = normalizeGroupRoleIdList(group?.moderators);
  const roleByMemberId = new Map([
    ...moderators.map((memberId) => [memberId, 'moderator']),
    ...admins.map((memberId) => [memberId, 'admin']),
    ...(Array.isArray(group.members) ? group.members : [])
      .filter((member) => member?.role === 'superadmin')
      .map((member) => [getGroupMemberKey(member), 'superadmin']),
    ...(createdBy ? [[createdBy, 'superadmin']] : []),
  ]);

  return {
    groupId: normalizeOptionalText(group?.groupId || group?.id || group?._id),
    groupName: normalizeOptionalText(group?.groupName || group?.name),
    groupPhoto: normalizeOptionalText(group?.groupPhoto || group?.photo || group?.avatar),
    description: normalizeOptionalText(group?.description),
    rules: normalizeGroupRuleList(group?.groupRules ?? group?.rules, {
      createdBy,
      updatedAt: group?.updatedAt || createdAt,
    }),
    allowNewMembersToViewPreviousMessages:
      normalizeAllowNewMembersToViewPreviousMessages(group),
    createdBy,
    members: includeGroupParticipant(group?.members, createdBy, {
      role: 'superadmin',
      defaultRole: 'member',
      joinedAt: createdAt,
      roleByMemberId,
    }),
    admins,
    moderators,
    createdAt,
  };
};

export const normalizeGroupData = (group = {}) => {
  const groupModel = createGroupModel(group);

  return {
    ...group,
    ...groupModel,
    id: groupModel.groupId,
    memberCount: groupModel.members.length,
    isGroup: true,
    type: 'group',
    chatType: 'group',
  };
};

export const toGroupModelData = (group = {}) => {
  const groupModel = createGroupModel(group);

  return GROUP_SCHEMA.fields.reduce((modelData, fieldName) => {
    modelData[fieldName] = groupModel[fieldName];
    return modelData;
  }, {});
};

// Mock groups data with the scalable group model shape.
export const MOCK_GROUPS = [
  {
    groupId: 'group-1',
    groupName: 'Weekend Crew',
    groupPhoto: '',
    description: 'Friends planning weekend activities and quick catchups.',
    members: ['sample-user-me', 'sample-user-ava', 'sample-user-ben', 'sample-user-dia', 'sample-user-eli'],
    admins: ['sample-user-me'],
    moderators: [],
    lastMessage: 'Hey everyone, who is up for hiking on Saturday?',
    timestamp: Date.now() - 3600000, // 1 hour ago
  },
  {
    groupId: 'group-2',
    groupName: 'Dev Team',
    groupPhoto: '',
    description: 'Engineering updates, reviews, and release planning.',
    members: [
      'sample-user-me',
      'sample-user-ava',
      'sample-user-ben',
      'sample-user-dia',
      'sample-user-eli',
      'sample-user-ian',
      'sample-user-mia',
      'sample-user-noah',
    ],
    admins: ['sample-user-me'],
    moderators: ['sample-user-ava'],
    lastMessage: 'PR review completed for the new feature',
    timestamp: Date.now() - 7200000, // 2 hours ago
  },
  {
    groupId: 'group-3',
    groupName: 'Travel Plans 2024',
    groupPhoto: '',
    description: 'Trip ideas, bookings, and itinerary decisions.',
    members: [
      'sample-user-me',
      'sample-user-ava',
      'sample-user-ben',
      'sample-user-dia',
      'sample-user-eli',
      'sample-user-ian',
      'sample-user-mia',
      'sample-user-noah',
      'sample-user-ria',
      'sample-user-sam',
      'sample-user-tia',
      'sample-user-zed',
    ],
    admins: ['sample-user-me', 'sample-user-ria'],
    moderators: ['sample-user-sam'],
    lastMessage: 'Should we book the resort now?',
    timestamp: Date.now() - 10800000, // 3 hours ago
  },
  {
    groupId: 'group-4',
    groupName: 'Book Club',
    groupPhoto: '',
    description: 'Monthly reads, notes, and discussion schedules.',
    members: [
      'sample-user-me',
      'sample-user-ava',
      'sample-user-ben',
      'sample-user-dia',
      'sample-user-eli',
      'sample-user-ian',
      'sample-user-mia',
    ],
    admins: ['sample-user-me'],
    moderators: [],
    lastMessage: 'Next month we are reading "Atomic Habits"',
    timestamp: Date.now() - 86400000, // 1 day ago
  },
  {
    groupId: 'group-5',
    groupName: 'Project Alpha',
    groupPhoto: '',
    description: 'Project coordination and delivery updates.',
    members: [
      'sample-user-me',
      'sample-user-ava',
      'sample-user-ben',
      'sample-user-dia',
      'sample-user-eli',
      'sample-user-ian',
    ],
    admins: ['sample-user-me'],
    moderators: ['sample-user-ben'],
    lastMessage: 'Meeting postponed to Friday at 3 PM',
    timestamp: Date.now() - 172800000, // 2 days ago
  },
  {
    groupId: 'group-6',
    groupName: 'Fitness Buddies',
    groupPhoto: '',
    description: 'Workout plans, progress checks, and motivation.',
    members: ['sample-user-me', 'sample-user-ava', 'sample-user-ben', 'sample-user-dia'],
    admins: ['sample-user-me'],
    moderators: [],
    lastMessage: 'Great workout session today!',
    timestamp: Date.now() - 259200000, // 3 days ago
  },
].map((group) => normalizeGroupData(group));

// Helper function to format timestamp
export const formatGroupTimestamp = (timestamp) => {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;

  const date = new Date(timestamp);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

// Helper function to get group initials for avatar
export const getGroupInitials = (groupName) => {
  return groupName
    .split(' ')
    .map((word) => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
};
