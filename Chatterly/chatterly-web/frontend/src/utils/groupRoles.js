export const GROUP_ROLE_LABELS = Object.freeze({
  superadmin: 'Super Admin', admin: 'Admin', moderator: 'Moderator', member: 'Member',
});

const userId = (value) => String(value && typeof value === 'object'
  ? value.memberId || value.userId || value.user?._id || value.user?.id || value.user || value._id || value.id || ''
  : value || '').trim();

export const getGroupMemberRole = (group = {}, memberId = '') => {
  group = group || {};
  const id = userId(memberId);
  if (!id) return '';
  const member = [...(group.members || []), ...(group.participants || [])].find((entry) => userId(entry) === id);
  const role = String(member?.role || member?.memberRole || '').trim().toLowerCase();
  if (userId(group.createdBy || group.creatorId || group.ownerId) === id || role === 'superadmin') return 'superadmin';
  if ((group.admins || []).some((entry) => userId(entry) === id) || role === 'admin') return 'admin';
  if ((group.moderators || []).some((entry) => userId(entry) === id) || role === 'moderator') return 'moderator';
  return member ? 'member' : '';
};

export const isGroupAdminRole = (role) => role === 'superadmin' || role === 'admin';

// Mirror the existing role endpoints: only the Super Admin assigns/removes
// admins, admins manage moderators, and delegated moderators can promote members.
export const canChangeGroupMemberRole = (actorRole, targetRole, nextRole, settings = {}) => {
  if (targetRole === 'superadmin' || !['admin', 'moderator', 'member'].includes(nextRole)) return false;
  if (actorRole === 'superadmin') return true;
  if (actorRole === 'admin') return targetRole !== 'admin' && nextRole !== 'admin';
  return actorRole === 'moderator' && settings.moderatorAssignRoles === true && targetRole === 'member' && nextRole === 'moderator';
};

export const groupPermissionSettingsFromApi = (settings = {}) => {
  const permissions = settings.rolePermissions || {};
  const result = {};
  if (typeof settings.onlyAdminsCanMessage === 'boolean') result.sendMessages = settings.onlyAdminsCanMessage ? 'admins' : 'everyone';
  if (typeof permissions.member?.addMembers === 'boolean') result.addMembers = permissions.member.addMembers ? 'everyone' : 'admins';
  const fields = [
    ['moderator', 'addMembers', 'moderatorAddMembers'],
    ['moderator', 'assignRoles', 'moderatorAssignRoles'],
    ['moderator', 'pinMessages', 'pinMessages'],
    ['moderator', 'editGroupInfo', 'editGroupInfo'],
    ['admin', 'approveJoinRequests', 'approveNewMembers'],
  ];
  fields.forEach(([role, permission, field]) => {
    if (typeof permissions[role]?.[permission] === 'boolean') result[field] = permissions[role][permission];
  });
  return result;
};

// Send partial updates so changing one switch cannot overwrite another role's
// permissions. These are the fields accepted by PUT /group/permissions/:id.
export const groupPermissionPatchForSetting = (key, value) => {
  const fields = {
    addMembers: ['member', 'addMembers', value === 'everyone'],
    moderatorAddMembers: ['moderator', 'addMembers', Boolean(value)],
    moderatorAssignRoles: ['moderator', 'assignRoles', Boolean(value)],
    pinMessages: ['moderator', 'pinMessages', Boolean(value)],
    editGroupInfo: ['moderator', 'editGroupInfo', Boolean(value)],
    approveNewMembers: ['admin', 'approveJoinRequests', Boolean(value)],
  };
  const field = fields[key];
  return field ? { [field[0]]: { [field[1]]: field[2] } } : null;
};

export const groupPermissionSettingsFromDraft = (draft = {}) => ({
  ...(typeof draft.memberSendMessages === 'boolean' ? { sendMessages: draft.memberSendMessages ? 'everyone' : 'admins' } : {}),
  ...(typeof draft.memberShareMedia === 'boolean' ? { mediaSharing: draft.memberShareMedia ? 'enabled' : 'disabled' } : {}),
  ...(typeof draft.memberInviteViaLink === 'boolean' ? { inviteViaLink: draft.memberInviteViaLink } : {}),
  ...(typeof draft.memberAddMembers === 'boolean' ? { addMembers: draft.memberAddMembers ? 'everyone' : 'admins' } : {}),
  ...Object.fromEntries([
    ['moderatorAddMembers', 'moderatorAddMembers'], ['moderatorAssignRoles', 'moderatorAssignRoles'],
    ['moderatorPinMessages', 'pinMessages'], ['moderatorEditGroupInfo', 'editGroupInfo'],
    ['moderatorManageReports', 'manageReports'], ['adminApproveJoinRequests', 'approveNewMembers'],
  ].filter(([key]) => typeof draft[key] === 'boolean').map(([key, field]) => [field, draft[key]])),
});
