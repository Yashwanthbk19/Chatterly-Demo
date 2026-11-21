import {availableRoleChanges, canAddGroupMembers, canAssignGroupRoles, canEditGroupInfo, canPinGroupMessages, canRemoveMember, canRestrictMember, groupComposerAccess, groupPermissionSections, groupRoleLabel, isAdminDemotion, isInviteLinkActive, memberActions, restrictableMembers, roleChangeSteps, similarGroupDraft} from '../src/utils/groupAdmin';
import type {GroupDetails, GroupMember} from '../src/services/groupApi';

const member = (role: GroupMember['role'], userId: string = role, extra: Partial<GroupMember> = {}): GroupMember => ({userId, name: userId, role, ...extra});
const group = (participants: GroupMember[], extra: Partial<GroupDetails> = {}): GroupDetails => ({
  id: 'g1', name: 'Team', rules: [], settings: {onlyAdminsCanMessage: false, onlyAdminsCanShareMedia: false}, participants, ...extra,
});

test('the owner is labelled Super Admin beside their messages, not just Admin', () => {
  expect(groupRoleLabel('superadmin')).toBe('Super Admin');
  expect(groupRoleLabel('admin')).toBe('Admin');
  expect(groupRoleLabel('moderator')).toBe('Moderator');
  expect(groupRoleLabel('member')).toBe('Member');
  expect(groupRoleLabel(undefined)).toBe('Member');
});

describe('role assignment follows the role endpoints', () => {
  test('only the owner grants or removes admin; admins manage moderators', () => {
    expect(availableRoleChanges('superadmin', member('member'), 'owner')).toEqual(['admin', 'moderator', 'member']);
    expect(availableRoleChanges('superadmin', member('admin'), 'owner')).toEqual(['admin', 'moderator', 'member']);
    expect(availableRoleChanges('admin', member('member'), 'me')).toEqual(['moderator', 'member']);
    expect(availableRoleChanges('admin', member('moderator'), 'me')).toEqual(['moderator', 'member']);
    expect(availableRoleChanges('admin', member('admin', 'other-admin'), 'me')).toEqual([]);
  });

  test('nobody changes the owner or their own role, and moderators and members change nothing', () => {
    expect(availableRoleChanges('admin', member('superadmin'), 'me')).toEqual([]);
    expect(availableRoleChanges('superadmin', member('superadmin', 'owner'), 'owner')).toEqual([]);
    expect(availableRoleChanges('admin', member('admin', 'me'), 'me')).toEqual([]);
    expect(availableRoleChanges('moderator', member('member'), 'me')).toEqual([]);
    expect(availableRoleChanges('member', member('member'), 'me')).toEqual([]);
    expect(availableRoleChanges(undefined, member('member'))).toEqual([]);
  });

  test('calls the role endpoints in an order the server accepts', () => {
    expect(roleChangeSteps('member', 'admin')).toEqual(['assign-admin']);
    expect(roleChangeSteps('moderator', 'admin')).toEqual(['assign-admin']);
    expect(roleChangeSteps('admin', 'moderator')).toEqual(['remove-admin', 'assign-moderator']);
    expect(roleChangeSteps('admin', 'member')).toEqual(['remove-admin']);
    expect(roleChangeSteps('moderator', 'member')).toEqual(['remove-moderator']);
    expect(roleChangeSteps('member', 'moderator')).toEqual(['assign-moderator']);
    expect(roleChangeSteps('member', 'member')).toEqual([]);
  });

  test('only taking away an admin role needs confirmation', () => {
    expect(isAdminDemotion('admin', 'member')).toBe(true);
    expect(isAdminDemotion('admin', 'moderator')).toBe(true);
    expect(isAdminDemotion('moderator', 'member')).toBe(false);
    expect(isAdminDemotion('member', 'admin')).toBe(false);
  });
});

describe('restriction and removal', () => {
  test('admins restrict members and moderators, never the owner, themselves or other admins', () => {
    expect(canRestrictMember('admin', member('member'), 'me')).toBe(true);
    expect(canRestrictMember('admin', member('moderator'), 'me')).toBe(true);
    expect(canRestrictMember('admin', member('admin', 'other-admin'), 'me')).toBe(false);
    expect(canRestrictMember('admin', member('superadmin'), 'me')).toBe(false);
    expect(canRestrictMember('admin', member('admin', 'me'), 'me')).toBe(false);
    expect(canRestrictMember('moderator', member('member'), 'me')).toBe(false);
    expect(canRestrictMember('superadmin', member('admin'), 'owner')).toBe(true);
  });

  test('removal is admin-only and never targets an admin', () => {
    expect(canRemoveMember('admin', member('moderator'), 'me')).toBe(true);
    expect(canRemoveMember('superadmin', member('admin'), 'owner')).toBe(false);
    expect(canRemoveMember('moderator', member('member'), 'me')).toBe(false);
  });

  test('members who are already restricted are not offered again', () => {
    const people = [member('superadmin', 'owner'), member('member', 'a', {isMuted: true}), member('member', 'b')];
    expect(restrictableMembers(people, 'superadmin', 'owner').map(item => item.userId)).toEqual(['b']);
  });
});

describe('member sheet', () => {
  test('the owner sees every action for a member, in design order', () => {
    expect(memberActions('superadmin', member('member', 'm'), 'owner', {canMessage: true}))
      .toEqual(['view-profile', 'send-message', 'make-admin', 'make-moderator', 'restrict', 'remove']);
  });

  test('a restricted moderator offers removing the role and the restriction', () => {
    expect(memberActions('admin', member('moderator', 'mod', {isMuted: true}), 'me', {canMessage: true}))
      .toEqual(['view-profile', 'send-message', 'remove-moderator', 'unrestrict', 'remove']);
  });

  test('the owner acting on an admin', () => {
    expect(memberActions('superadmin', member('admin', 'a'), 'owner', {canMessage: false}))
      .toEqual(['view-profile', 'remove-admin', 'make-moderator', 'restrict']);
  });

  test('members can only view and message; your own row only views', () => {
    expect(memberActions('member', member('admin', 'a'), 'me', {canMessage: true})).toEqual(['view-profile', 'send-message']);
    expect(memberActions('superadmin', member('superadmin', 'me'), 'me', {canMessage: true})).toEqual(['view-profile']);
  });
});

describe('permissions', () => {
  const now = Date.parse('2026-09-15T00:00:00.000Z');
  const rowsOf = (details: GroupDetails, role: GroupMember['role']) => Object.fromEntries(groupPermissionSections(details, role, now).flatMap(section => section.rows).map(row => [row.key, row]));

  test('admins edit message settings while Super-Admin role permissions stay locked', () => {
    const details = group([], {settings: {onlyAdminsCanMessage: true, onlyAdminsCanShareMedia: false}, inviteLinkEnabled: true, inviteExpiresAt: '2026-09-20T00:00:00.000Z'});
    const rows = rowsOf(details, 'admin');
    expect(rows.memberSend).toMatchObject({value: false, editable: true});
    expect(rows.memberMedia).toMatchObject({value: true, editable: true});
    expect(rows.memberInvite).toMatchObject({value: true, editable: true});
    expect(rows.moderatorPin).toMatchObject({value: false, editable: false});
    expect(rows.memberAdd).toMatchObject({value: false, editable: false, lockedReason: 'Only the Super Admin can change this permission.'});
    expect(Object.values(rows).filter(row => row.editable).map(row => row.key)).toEqual(['memberSend', 'memberMedia', 'memberInvite']);
  });

  test('the Super Admin edits all backend-supported role permissions', () => {
    const details = group([], {rolePermissions: {
      member: {addMembers: true},
      moderator: {addMembers: true, assignRoles: false, pinMessages: true, editGroupInfo: false},
      admin: {approveJoinRequests: true},
    }});
    const rows = rowsOf(details, 'superadmin');
    expect(rows.memberAdd).toMatchObject({value: true, editable: true});
    expect(rows.moderatorAdd).toMatchObject({value: true, editable: true});
    expect(rows.moderatorRoles).toMatchObject({value: false, editable: true});
    expect(rows.moderatorPin).toMatchObject({value: true, editable: true});
    expect(rows.moderatorEdit).toMatchObject({value: false, editable: true});
    expect(rows.adminApprovals).toMatchObject({value: true, editable: true});
    expect(rows.moderatorReports).toMatchObject({value: false, editable: true});
  });

  test('moderators see the same values without being able to edit them', () => {
    const rows = rowsOf(group([]), 'moderator');
    expect(Object.values(rows).some(row => row.editable)).toBe(false);
    expect(rows.memberSend.value).toBe(true);
  });

  test('stored permissions unlock only the matching member and moderator actions', () => {
    const permissions = {
      member: {addMembers: true},
      moderator: {addMembers: true, assignRoles: true, pinMessages: true, editGroupInfo: true},
      admin: {approveJoinRequests: false},
    };
    expect(canAddGroupMembers('member', permissions)).toBe(true);
    expect(canAddGroupMembers('moderator', permissions)).toBe(true);
    expect(canAssignGroupRoles('moderator', permissions)).toBe(true);
    expect(canEditGroupInfo('moderator', permissions)).toBe(true);
    expect(canPinGroupMessages('moderator', permissions)).toBe(true);
    expect(availableRoleChanges('moderator', member('member', 'target'), 'me', permissions)).toEqual(['moderator', 'member']);
    expect(availableRoleChanges('moderator', member('admin', 'target'), 'me', permissions)).toEqual([]);
  });

  test('an expired invite link counts as off', () => {
    expect(isInviteLinkActive({inviteLinkEnabled: true, inviteExpiresAt: '2026-09-01T00:00:00.000Z'}, now)).toBe(false);
    expect(isInviteLinkActive({inviteLinkEnabled: true, inviteExpiresAt: null}, now)).toBe(true);
    expect(isInviteLinkActive({inviteLinkEnabled: false}, now)).toBe(false);
  });
});

describe('composer access', () => {
  test('a restricted member cannot send anything', () => {
    const access = groupComposerAccess(group([member('member', 'me', {isMuted: true})]), 'me');
    expect(access).toMatchObject({canSendMessages: false, canShareMedia: false});
    expect(access.notice).toContain('restricted');
  });

  test('admins-only messaging blocks moderators but not admins', () => {
    const settings = {onlyAdminsCanMessage: true, onlyAdminsCanShareMedia: false};
    expect(groupComposerAccess(group([member('moderator', 'me')], {settings}), 'me').canSendMessages).toBe(false);
    expect(groupComposerAccess(group([member('admin', 'me')], {settings}), 'me')).toEqual({canSendMessages: true, canShareMedia: true, notice: null});
  });

  test('admins-only media blocks only a member’s attachments', () => {
    const settings = {onlyAdminsCanMessage: false, onlyAdminsCanShareMedia: true};
    expect(groupComposerAccess(group([member('member', 'me')], {settings}), 'me')).toEqual({canSendMessages: true, canShareMedia: false, notice: null});
  });

  test('an unloaded group does not block the composer', () => {
    expect(groupComposerAccess(null, 'me')).toEqual({canSendMessages: true, canShareMedia: true, notice: null});
  });
});

test('a similar group copies the description and everyone except the creator', () => {
  const draft = similarGroupDraft(group([member('superadmin', 'me'), member('member', 'a', {phone: '+91 1', profilePic: 'pic', isMuted: true})], {description: 'Sprint'}), 'me');
  expect(draft).toEqual({description: 'Sprint', members: [{userId: 'a', name: 'a', phone: '+91 1', profilePic: 'pic'}]});
});
