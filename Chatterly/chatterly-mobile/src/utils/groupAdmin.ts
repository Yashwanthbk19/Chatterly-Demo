import {defaultGroupRolePermissions, type GroupDetails, type GroupMember, type GroupMemberRole, type GroupRolePermissions} from '../services/groupApi';

export type EditableRole = 'admin' | 'moderator' | 'member';
export type RoleChangeStep = 'assign-admin' | 'remove-admin' | 'assign-moderator' | 'remove-moderator';
export type MemberAction = 'view-profile' | 'send-message' | 'make-admin' | 'remove-admin' | 'make-moderator' | 'remove-moderator' | 'restrict' | 'unrestrict' | 'remove';
export type GroupPermissionKey = 'memberSend' | 'memberMedia' | 'memberInvite' | 'memberAdd' | 'moderatorAdd' | 'moderatorRoles' | 'moderatorPin' | 'moderatorEdit' | 'moderatorReports' | 'adminApprovals';
export type GroupPermissionRow = {key: GroupPermissionKey; title: string; subtitle: string; value: boolean; editable: boolean; lockedReason?: string};
export type GroupPermissionSection = {title: string; tone: 'member' | 'moderator' | 'admin'; rows: GroupPermissionRow[]};
export type SimilarGroupDraft = {description: string; members: Array<Pick<GroupMember, 'userId' | 'name' | 'phone' | 'profilePic'>>};
export type GroupComposerAccess = {canSendMessages: boolean; canShareMedia: boolean; notice: string | null};

// Every rule in this file mirrors a check in the backend groupController. An
// action the server would reject is hidden instead of being offered and then
// surfacing as a 403.

export const isGroupAdmin = (role?: GroupMemberRole | null): boolean => role === 'superadmin' || role === 'admin';

/**
 * The role shown beside a sender in a group chat. The owner is a Super Admin, as
 * Group Info and the admin sheets already call them, not just an Admin.
 */
export const groupRoleLabel = (role?: GroupMemberRole | null): string =>
  role === 'superadmin' ? 'Super Admin'
    : role === 'admin' ? 'Admin'
      : role === 'moderator' ? 'Moderator'
        : 'Member';

const isSelf = (member: GroupMember, actorId: string) => Boolean(actorId) && member.userId === actorId;

/** assign-admin and remove-admin are superadmin-only; the moderator endpoints also accept admins. */
export function canAddGroupMembers(actorRole: GroupMemberRole | undefined, permissions?: GroupRolePermissions): boolean {
  if (isGroupAdmin(actorRole)) return true;
  if (actorRole === 'moderator') return permissions?.moderator.addMembers === true;
  return actorRole === 'member' && permissions?.member.addMembers === true;
}

export function canAssignGroupRoles(actorRole: GroupMemberRole | undefined, permissions?: GroupRolePermissions): boolean {
  return isGroupAdmin(actorRole) || (actorRole === 'moderator' && permissions?.moderator.assignRoles === true);
}

export function canEditGroupInfo(actorRole: GroupMemberRole | undefined, permissions?: GroupRolePermissions): boolean {
  return isGroupAdmin(actorRole) || (actorRole === 'moderator' && permissions?.moderator.editGroupInfo === true);
}

export function canPinGroupMessages(actorRole: GroupMemberRole | undefined, permissions?: GroupRolePermissions): boolean {
  return isGroupAdmin(actorRole) || (actorRole === 'moderator' && permissions?.moderator.pinMessages === true);
}

export function availableRoleChanges(actorRole: GroupMemberRole | undefined, member: GroupMember, actorId = '', permissions?: GroupRolePermissions): EditableRole[] {
  if (!canAssignGroupRoles(actorRole, permissions) || member.role === 'superadmin' || isSelf(member, actorId)) return [];
  if (actorRole === 'superadmin') return ['admin', 'moderator', 'member'];
  if (actorRole === 'moderator') return member.role === 'member' ? ['moderator', 'member'] : [];
  return member.role === 'admin' ? [] : ['moderator', 'member'];
}

/** The role endpoints to call, in order, to move a member from one role to another. */
export function roleChangeSteps(from: GroupMemberRole, to: EditableRole): RoleChangeStep[] {
  if (from === to || from === 'superadmin') return [];
  if (to === 'admin') return ['assign-admin'];
  // assign-moderator rejects admins, so an admin has to be demoted first.
  if (to === 'moderator') return from === 'admin' ? ['remove-admin', 'assign-moderator'] : ['assign-moderator'];
  return from === 'admin' ? ['remove-admin'] : ['remove-moderator'];
}

/** Sprint 7 validation: taking away an admin role needs a confirmation. */
export const isAdminDemotion = (from: GroupMemberRole, to: EditableRole): boolean => from === 'admin' && to !== 'admin';

/** remove-participant is admin-only and refuses admins and the owner. */
export function canRemoveMember(actorRole: GroupMemberRole | undefined, member: GroupMember, actorId = ''): boolean {
  return isGroupAdmin(actorRole) && !isSelf(member, actorId) && (member.role === 'member' || member.role === 'moderator');
}

/**
 * mute-member is admin-only but accepts any participant. The client keeps the
 * hierarchy the other endpoints enforce: nobody restricts the owner or
 * themselves, and an admin cannot silence another admin.
 */
export function canRestrictMember(actorRole: GroupMemberRole | undefined, member: GroupMember, actorId = ''): boolean {
  if (!isGroupAdmin(actorRole) || isSelf(member, actorId) || member.role === 'superadmin') return false;
  return actorRole === 'superadmin' || member.role !== 'admin';
}

/** The member bottom sheet, in the order the design lists it. */
export function memberActions(actorRole: GroupMemberRole | undefined, member: GroupMember, actorId: string, options: {canMessage: boolean; permissions?: GroupRolePermissions}): MemberAction[] {
  const actions: MemberAction[] = ['view-profile'];
  if (isSelf(member, actorId)) return actions;
  if (options.canMessage) actions.push('send-message');
  const roles = availableRoleChanges(actorRole, member, actorId, options.permissions);
  if (member.role === 'admin' && roles.includes('member')) actions.push('remove-admin');
  else if (member.role !== 'admin' && roles.includes('admin')) actions.push('make-admin');
  if (member.role === 'moderator' && roles.includes('member')) actions.push('remove-moderator');
  else if (member.role !== 'moderator' && roles.includes('moderator')) actions.push('make-moderator');
  if (canRestrictMember(actorRole, member, actorId)) actions.push(member.isMuted ? 'unrestrict' : 'restrict');
  if (canRemoveMember(actorRole, member, actorId)) actions.push('remove');
  return actions;
}

export function restrictableMembers(participants: GroupMember[], actorRole: GroupMemberRole | undefined, actorId: string): GroupMember[] {
  return participants.filter(member => !member.isMuted && canRestrictMember(actorRole, member, actorId));
}

/** generate-invite-link sets a 7 day expiry without clearing inviteLinkEnabled when it lapses. */
export function isInviteLinkActive(details: Pick<GroupDetails, 'inviteLinkEnabled' | 'inviteExpiresAt'>, now = Date.now()): boolean {
  if (!details.inviteLinkEnabled) return false;
  const expiresAt = details.inviteExpiresAt ? Date.parse(details.inviteExpiresAt) : Number.NaN;
  return Number.isNaN(expiresAt) || expiresAt > now;
}

/** Message/invite settings are admin-managed. Role permissions come from the
 * dedicated permissions endpoint and are editable only by the Super Admin. */
export function groupPermissionSections(details: GroupDetails, actorRole: GroupMemberRole | undefined, now = Date.now()): GroupPermissionSection[] {
  const adminEditable = isGroupAdmin(actorRole);
  const roleEditable = actorRole === 'superadmin';
  const permissions = details.rolePermissions || defaultGroupRolePermissions();
  const rolePermission = (key: GroupPermissionKey, title: string, subtitle: string, value: boolean): GroupPermissionRow => ({
    key, title, subtitle, value, editable: roleEditable,
    ...(roleEditable ? {} : {lockedReason: 'Only the Super Admin can change this permission.'}),
  });
  return [
    {title: 'Members can', tone: 'member', rows: [
      {key: 'memberSend', title: 'Send Messages', subtitle: 'Participate in group conversations.', value: !details.settings.onlyAdminsCanMessage, editable: adminEditable},
      {key: 'memberMedia', title: 'Share Media & Files', subtitle: 'Send photos, videos, and documents.', value: !details.settings.onlyAdminsCanShareMedia, editable: adminEditable},
      {key: 'memberInvite', title: 'Invite via Link', subtitle: 'Invite new people using the group’s invite link.', value: isInviteLinkActive(details, now), editable: adminEditable},
      rolePermission('memberAdd', 'Add Members', 'Add contacts directly to the group.', permissions.member.addMembers),
    ]},
    {title: 'Moderators can', tone: 'moderator', rows: [
      rolePermission('moderatorAdd', 'Add Members', 'Add new people directly to the group.', permissions.moderator.addMembers),
      rolePermission('moderatorRoles', 'Assign Roles', 'Manage moderator access and responsibilities.', permissions.moderator.assignRoles),
      rolePermission('moderatorPin', 'Pin Messages', 'Highlight important messages so everyone can find them easily.', permissions.moderator.pinMessages),
      rolePermission('moderatorEdit', 'Edit Group Info', 'Update the group name, photo, description, and other basic details.', permissions.moderator.editGroupInfo),
      rolePermission('moderatorReports', 'Manage Reports', 'Review and take action on reported messages or members.', details.localPermissions?.moderatorManageReports === true),
    ]},
    {title: 'Admin can', tone: 'admin', rows: [
      rolePermission('adminApprovals', 'Approve Join Requests', 'Review and approve requests from people who want to join the group.', permissions.admin.approveJoinRequests),
    ]},
  ];
}

export function similarGroupDraft(details: GroupDetails, actorId: string): SimilarGroupDraft {
  return {
    description: details.description || '',
    members: details.participants.filter(member => member.userId !== actorId).map(({userId, name, phone, profilePic}) => ({userId, name, phone, profilePic})),
  };
}

/** What the group send routes will accept from this user, so the composer can say why before a send fails. */
export function groupComposerAccess(details: GroupDetails | null, userId: string): GroupComposerAccess {
  const member = details?.participants.find(item => item.userId === userId);
  if (!details || !member) return {canSendMessages: true, canShareMedia: true, notice: null};
  if (member.isMuted) return {canSendMessages: false, canShareMedia: false, notice: 'A group admin restricted you. You can’t send messages in this group.'};
  const admin = isGroupAdmin(member.role);
  if (details.settings.onlyAdminsCanMessage && !admin) return {canSendMessages: false, canShareMedia: false, notice: 'Only admins can send messages in this group.'};
  return {canSendMessages: true, canShareMedia: admin || !details.settings.onlyAdminsCanShareMedia, notice: null};
}
