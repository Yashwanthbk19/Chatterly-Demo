import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';
import * as roles from '../src/utils/groupRoles.js';
import * as permissions from '../src/utils/permissions.js';
import { normalizeGroupRuleList } from '../src/utils/groupRules.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const source = read('../src/pages/ChatListPage.jsx');
const section = (start, end, text = source) => {
  const first = text.indexOf(start);
  const last = text.indexOf(end, first);
  assert.ok(first >= 0 && last > first, `Missing production section: ${start}`);
  return text.slice(first, last);
};
const plain = (value) => JSON.parse(JSON.stringify(value));
const deferred = () => {
  let resolve;
  const promise = new Promise((yes) => { resolve = yes; });
  return { promise, resolve };
};
const modelSource = read('../src/utils/mockGroups.js').replace(/^import[\s\S]*?from ['"][^'"]+['"];\n/gm, '').replaceAll('export ', '');
const models = runInNewContext(`${modelSource}\n({ normalizeGroupData, createGroupParticipantModel });`, { ...permissions, normalizeGroupRuleList });
const groupId = '111111111111111111111111';
const creator = '222222222222222222222222';
const member = '333333333333333333333333';
const group = (targetRole = 'member') => models.normalizeGroupData({
  groupId, createdBy: creator, groupName: 'Teams',
  members: [{ memberId: creator, role: 'superadmin' }, { memberId: member, role: targetRole }],
  admins: [creator, ...(targetRole === 'admin' ? [member] : [])],
  moderators: targetRole === 'moderator' ? [member] : [],
});

test('the creator remains Super Admin through creation, normalization and persisted reloads', () => {
  for (const createdBy of [creator, { _id: creator, name: 'Creator' }]) {
    const normalized = models.normalizeGroupData({ ...group(), createdBy });
    const restored = models.normalizeGroupData(plain(normalized));
    assert.equal(restored.members.find((entry) => entry.memberId === creator).role, 'superadmin');
    assert.equal(roles.getGroupMemberRole(restored, creator), 'superadmin');
    assert.equal(permissions.getDefaultPermissionsForRole('superadmin').canAddMembers, true);
    assert.equal(roles.getGroupMemberRole(restored, member), 'member');
  }
});

test('a populated backend participant and creator resolve to the correct hierarchy', () => {
  assert.equal(roles.getGroupMemberRole({ createdBy: { _id: creator }, participants: [{ user: { _id: creator }, role: 'superadmin' }] }, creator), 'superadmin');
  for (const role of ['admin', 'moderator', 'member']) assert.equal(roles.getGroupMemberRole(group(role), member), role);
});

test('backend group hydration preserves Super Admin and clears stale role lists after demotion', () => {
  const normalize = runInNewContext(
    section('const normalizeApiGroupThreadContact =', 'const normalizeBroadcastThreadContact =') + '\nnormalizeApiGroupThreadContact;',
    { ...roles, normalizeGroupThreadContact: models.normalizeGroupData, resolveGroupPinnedState: () => false }
  );
  const hydrated = normalize({
    _id: groupId, createdBy: { _id: creator },
    participants: [{ user: { _id: creator }, role: 'superadmin' }, { user: { _id: member }, role: 'member' }],
    settings: { rolePermissions: { moderator: { assignRoles: false, addMembers: false } } },
  }, group('moderator'));
  assert.equal(hydrated.members.find((entry) => entry.memberId === creator).role, 'superadmin');
  assert.deepEqual(Array.from(hydrated.moderators), []);
  assert.equal(hydrated.adminPermissionSettings.moderatorAssignRoles, false);
  const getCurrentRole = runInNewContext(
    section('const getCurrentUserGroupRole =', 'const canNewGroupMembersViewPreviousMessages =') + '\ngetCurrentUserGroupRole;',
    {
      ...roles,
      resolveCurrentUserGroupMemberId: (value, profile) => value.members.find((entry) => entry.memberId === profile.id)?.memberId || '',
      getNormalizedGroupRoleMemberIds: (value, field) => value[field] || [],
      doGroupMemberIdsMatch: (a, b) => a === b,
    }
  );
  assert.equal(getCurrentRole(hydrated, { id: creator }), 'superadmin');
  assert.equal(getCurrentRole(hydrated, { id: member }), 'member');
});

test('only Super Admin can assign/remove admins, and no role can demote a Super Admin', () => {
  for (const next of ['admin', 'moderator', 'member']) {
    assert.equal(roles.canChangeGroupMemberRole('superadmin', 'member', next), true);
    for (const actor of ['superadmin', 'admin', 'moderator', 'member']) {
      assert.equal(roles.canChangeGroupMemberRole(actor, 'superadmin', next), false);
    }
  }
  assert.equal(roles.canChangeGroupMemberRole('admin', 'member', 'admin'), false);
  assert.equal(roles.canChangeGroupMemberRole('admin', 'admin', 'member'), false);
  assert.equal(roles.canChangeGroupMemberRole('admin', 'member', 'moderator'), true);
  assert.equal(roles.canChangeGroupMemberRole('moderator', 'member', 'moderator'), false);
  assert.equal(roles.canChangeGroupMemberRole('moderator', 'member', 'moderator', { moderatorAssignRoles: true }), true);
  assert.equal(roles.canChangeGroupMemberRole('moderator', 'moderator', 'member', { moderatorAssignRoles: true }), false);
});

test('permission controls map to the documented nested rolePermissions without losing false values', () => {
  const settings = roles.groupPermissionSettingsFromApi({ rolePermissions: {
    member: { addMembers: true }, moderator: { addMembers: false, assignRoles: false, pinMessages: true, editGroupInfo: false },
    admin: { approveJoinRequests: false },
  } });
  assert.deepEqual(settings, { addMembers: 'everyone', moderatorAddMembers: false, moderatorAssignRoles: false, pinMessages: true, editGroupInfo: false, approveNewMembers: false });
  assert.deepEqual(roles.groupPermissionPatchForSetting('moderatorAssignRoles', false), { moderator: { assignRoles: false } });
  assert.deepEqual(roles.groupPermissionPatchForSetting('approveNewMembers', true), { admin: { approveJoinRequests: true } });
  assert.deepEqual(roles.groupPermissionPatchForSetting('addMembers', 'everyone'), { member: { addMembers: true } });
  assert.equal(roles.groupPermissionPatchForSetting('manageReports', true), null);
});

test('permission API clients use the available authenticated GET/PUT endpoints and exact body', async () => {
  const requests = [];
  const api = runInNewContext(read('../src/api/group.js').replace(/^import[^\n]+\n/gm, '').replaceAll('export ', '') + '\n({ getGroupPermissions, updateGroupPermissions });', {
    requestEntity: async (config) => { requests.push(config); return {}; },
  });
  await api.getGroupPermissions(groupId);
  await api.updateGroupPermissions({ groupId, rolePermissions: { moderator: { editGroupInfo: true } } });
  assert.equal(requests[0].method, 'get');
  assert.equal(requests[0].url, `/api/group/permissions/${groupId}`);
  assert.equal(requests[1].method, 'put');
  assert.equal(requests[1].url, requests[0].url);
  assert.deepEqual(plain(requests[1].data), { rolePermissions: { moderator: { editGroupInfo: true } } });
});

const harness = ({ actor = creator, targetRole = 'member', reject = '', response, pending } = {}) => {
  let selected = group(targetRole);
  let groups = [selected];
  let actorRole = actor === creator ? 'superadmin' : actor;
  const calls = [];
  const toasts = [];
  const context = {
    ...roles, ...permissions, ...models,
    useCallback: (callback) => callback,
    currentUserProfile: { id: actor }, storedUser: {}, selectedContact: selected,
    getCurrentUserGroupRole: () => actorRole,
    getGroupThreadChatId: (value) => value?.groupId || value?.chatId || '',
    getGroupMemberId: (value) => typeof value === 'string' ? value : value?.memberId || value?.id || value?.userId || '',
    getUniqueGroupMemberIds: (value) => value.members.map((entry) => entry.memberId),
    getNormalizedGroupRoleMemberIds: (value, field) => value[field] || [],
    isGroupThreadContact: () => true, isBroadcastThreadContact: () => false,
    normalizeGroupThreadContact: models.normalizeGroupData,
    normalizeBroadcastThreadContact: (value) => value,
    sortGroupsByRecent: (value) => value,
    doGroupMemberIdsMatch: (a, b) => a === b,
    isBackendObjectId: (value) => /^[a-f\d]{24}$/i.test(value),
    showChatActionToast: (message) => toasts.push(message),
    refreshGroupsFromBackend: async () => calls.push({ event: 'refresh' }),
    groupPermissionsSavingRef: { current: false }, groupPermissionRevisionsRef: { current: new Map() },
    setGroupPermissionsSavingId() {},
    setGroups: (update) => { groups = update(groups); }, setBroadcasts() {},
    setSelectedContact: (update) => { selected = update(selected); },
  };
  for (const event of ['assignAdmin', 'removeAdmin', 'assignModerator', 'removeModerator', 'updateGroupPermissions', 'updateGroupSettings']) {
    context[event] = async (payload) => {
      calls.push({ event, payload });
      if (event === reject) throw new Error('Server rejected this change');
      if (pending) await pending;
      return response || {};
    };
  }
  const declarations = [
    section('const DEFAULT_GROUP_ADMIN_PERMISSION_SETTINGS =', 'const buildChatThreadRoute ='),
    section('  const updateCurrentGroupMembership =', '  const updateCurrentGroupParticipants ='),
    section('  const applyGroupPermissionSettings =', '  const canCurrentUserModerateParticipant ='),
    section('  const handleChangeGroupParticipantRole =', '  const handleRequestAssignGroupModerator ='),
  ].join('\n');
  const actions = runInNewContext(declarations + '\n({ role: handleChangeGroupParticipantRole, permission: handleUpdateGroupAdminPermissionSetting });', context);
  return { ...actions, calls, toasts, context, selected: () => selected, groups: () => groups,
    select: (value) => { selected = value; }, setActor: (role) => { actorRole = role; } };
};
const participant = (role = 'member', id = member) => ({ id, name: 'Casey', role, isGroupAdmin: roles.isGroupAdminRole(role), isGroupModerator: role === 'moderator' });

test('Super Admin assigns Admin using the backend and keeps their own immutable role', async () => {
  const h = harness();
  await h.role(participant(), 'admin');
  assert.equal(h.calls[0].event, 'assignAdmin');
  assert.deepEqual(plain(h.calls[0].payload), { groupId, userId: member });
  assert.equal(roles.getGroupMemberRole(h.selected(), creator), 'superadmin');
  assert.equal(roles.getGroupMemberRole(h.selected(), member), 'admin');
  assert.equal(h.calls.at(-1).event, 'refresh');
});

test('Super Admin demotes Admin to Moderator using the remove and assign endpoints in order', async () => {
  const h = harness({ targetRole: 'admin' });
  await h.role(participant('admin'), 'moderator');
  assert.deepEqual(h.calls.map((entry) => entry.event), ['removeAdmin', 'assignModerator', 'refresh']);
  assert.equal(roles.getGroupMemberRole(h.selected(), creator), 'superadmin');
  assert.equal(roles.getGroupMemberRole(h.selected(), member), 'moderator');
});

test('ordinary admins cannot promote admins, change the creator or change permissions', async () => {
  const h = harness({ actor: 'admin' });
  await h.role(participant(), 'admin');
  await h.role(participant('superadmin', creator), 'member');
  await h.permission('moderatorAssignRoles', true);
  assert.deepEqual(h.calls, []);
  assert.equal(h.toasts.length, 3);
  assert.equal(roles.getGroupMemberRole(h.selected(), creator), 'superadmin');
});

test('a failed role request leaves the displayed role intact and does not announce success', async () => {
  const h = harness({ reject: 'assignAdmin' });
  await h.role(participant(), 'admin');
  assert.equal(roles.getGroupMemberRole(h.selected(), member), 'member');
  assert.deepEqual(h.toasts, ['Server rejected this change']);
});

test('a partially failed Admin-to-Moderator transition refreshes the authoritative roster', async () => {
  const h = harness({ targetRole: 'admin', reject: 'assignModerator' });
  await h.role(participant('admin'), 'moderator');
  assert.deepEqual(h.calls.map((entry) => entry.event), ['removeAdmin', 'assignModerator', 'refresh']);
  assert.deepEqual(h.toasts, ['Server rejected this change']);
});

test('successful permission writes apply server settings to the matching group', async () => {
  const h = harness({ response: { rolePermissions: { moderator: { editGroupInfo: false }, member: { addMembers: true } } } });
  await h.permission('editGroupInfo', false);
  assert.deepEqual(plain(h.calls[0]), { event: 'updateGroupPermissions', payload: { groupId, rolePermissions: { moderator: { editGroupInfo: false } } } });
  assert.equal(h.selected().adminPermissionSettings.editGroupInfo, false);
  assert.equal(h.selected().adminPermissionSettings.addMembers, 'everyone');
  assert.equal(h.groups()[0].adminPermissionSettings.editGroupInfo, false);
});

test('a rejected permission write keeps the previous settings and releases the save lock', async () => {
  const h = harness({ reject: 'updateGroupPermissions' });
  await h.permission('moderatorAddMembers', false);
  assert.equal(h.selected().adminPermissionSettings, undefined);
  assert.equal(h.context.groupPermissionsSavingRef.current, false);
  assert.deepEqual(h.toasts, ['Server rejected this change']);
});

test('the existing send-message audience control keeps its existing backend endpoint', async () => {
  const h = harness();
  await h.permission('sendMessages', 'admins');
  assert.deepEqual(plain(h.calls[0]), { event: 'updateGroupSettings', payload: { groupId, onlyAdminsCanMessage: true } });
});

test('pending permission writes cannot overlap or change a newly selected group', async () => {
  const pending = deferred();
  const h = harness({ pending: pending.promise });
  const saving = h.permission('moderatorAddMembers', false);
  await h.permission('moderatorAssignRoles', false);
  assert.equal(h.calls.length, 1);
  h.select({ ...group(), groupId: 'another-group' });
  pending.resolve();
  await saving;
  assert.equal(h.selected().groupId, 'another-group');
  assert.equal(h.selected().adminPermissionSettings, undefined);
  assert.equal(h.groups()[0].adminPermissionSettings.moderatorAddMembers, false);
});

test('an older permission GET cannot overwrite a newer permission edit', async () => {
  const pending = deferred();
  const applied = [];
  const revisions = new Map();
  runInNewContext(section('  const selectedGroupPermissionsId =', '  const canCurrentUserManageSelectedGroupRoles ='), {
    selectedContact: group(), currentUserSelectedGroupRole: 'superadmin',
    isGroupThreadContact: () => true, isBroadcastThreadContact: () => false,
    getGroupThreadChatId: () => groupId, isBackendObjectId: () => true,
    groupPermissionRevisionsRef: { current: revisions },
    useEffect: (callback) => callback(), setGroupPermissionsLoadingId() {}, showChatActionToast() {},
    getGroupPermissions: () => pending.promise,
    applyGroupPermissionSettings: (...args) => applied.push(args), ...roles,
  });
  revisions.set(groupId, 1);
  pending.resolve({ rolePermissions: { moderator: { addMembers: true } } });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(applied, []);
});

test('the production permission panel enables switches only for Super Admin', async () => {
  const panelSource = section('const GroupAdminSidePanel =', 'const GroupRulesSidePanel =');
  const compiled = await transformWithOxc(panelSource, 'group-permissions.jsx', { jsx: { runtime: 'classic' } });
  const Panel = runInNewContext(compiled.code + '\nGroupAdminSidePanel;', {
    React, useState: React.useState, ...roles,
    DEFAULT_GROUP_ADMIN_PERMISSION_SETTINGS: {},
    isGroupThreadContact: () => true, canNewGroupMembersViewPreviousMessages: () => true,
    BackIcon: () => null, CloseIcon: () => null,
  });
  for (const role of ['superadmin', 'admin', 'moderator']) {
    const markup = renderToStaticMarkup(React.createElement(Panel, { isOpen: true, contact: group(), accessRole: role, canManagePermissions: true }));
    const switches = [...markup.matchAll(/<button[^>]*role="switch"[^>]*>/g)].map(([tag]) => tag);
    assert.equal(switches.length, 10);
    assert.equal(switches.every((tag) => tag.includes('disabled=""')), role !== 'superadmin');
  }
  const busy = renderToStaticMarkup(React.createElement(Panel, { isOpen: true, contact: group(), accessRole: 'superadmin', canManagePermissions: true, isPermissionsBusy: true }));
  assert.ok([...busy.matchAll(/<button[^>]*role="switch"[^>]*>/g)].every(([tag]) => tag.includes('disabled=""')));
});

test('the production Manage Roles row shows Super Admin in the existing fixed-width control', async () => {
  const body = section('                const roleValue = getParticipantRoleKey(participant);', '              }) : (');
  const compiled = await transformWithOxc(`const Row = (participant) => { ${body} };`, 'group-role-row.jsx', { jsx: { runtime: 'classic' } });
  const Row = runInNewContext(compiled.code + '\nRow;', {
    React, ...roles, getParticipantRoleKey: (entry) => entry.role,
    adminPanelAccessLevel: 'superadmin', canShowRoleManagementActions: true, canShowRegularMemberRemovalAction: true,
    getGroupAdminPermissionSettings: () => ({}), contact: group(), handleGroupInfoRoleChange() {},
    onRemoveParticipant() {}, ContactAvatar: () => null, ChevronDownIcon: () => null,
  });
  const markup = renderToStaticMarkup(React.createElement(Row, { ...participant('superadmin', creator), isGroupSuperAdmin: true }));
  assert.match(markup, /Super Admin/);
  assert.match(markup, /w-\[96px\]/);
  assert.match(markup, /<select[^>]*disabled=""/);
  assert.equal([...markup.matchAll(/<option /g)].length, 1);
});
