import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { createMessageId, hasMessageContent, normalizeMessageData } from '../src/utils/message.js';

const source = readFileSync(new URL('../src/pages/ChatListPage.jsx', import.meta.url), 'utf8');
const section = (startMarker, endMarker) => {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `Missing production section: ${startMarker}`);
  return source.slice(start, end);
};
const GROUP = '111111111111111111111111';
const ME = '222222222222222222222222';
const ADMIN = '333333333333333333333333';
const NOTICE = "You are not in this group anymore, so you can't message here.";
const REMOVED_AT = '2026-11-13T08:00:00.000Z';
const JOINED_AT = '2026-11-13T08:01:00.000Z';
const memberId = (member) => typeof member === 'string'
  ? member : member?.memberId || member?._id || member?.id || member?.userId || '';
const groupId = (group) => group?.chatId || group?.groupId || '';
const group = { chatId: GROUP, members: [ADMIN, ME], createdBy: ADMIN };
const draft = { id: 'message', chatId: GROUP, content: 'Hello', senderId: ME, timestamp: REMOVED_AT };
const rejectionSource = section('const isGroupMembershipRejectionError =', '// Outlasts an unpin request');
const removalSource = section('const isCurrentUserRemovedFromGroup =', 'const getCurrentUserGroupRole =');
const markSource = section('  const markCurrentUserRemovedFromGroup =', '  // Read through a ref by the message loaders');
const assertSource = section('  const assertCurrentUserCanMessageGroup =', '  const handleToggleGlobalNotifications =');
const deliverSource = section('  const deliverGroupMessageRecord =', '  const createMediaUploadMessageRecord =');

const harness = (overrides = {}) => {
  const sends = [];
  const requests = [];
  const toasts = [];
  const replacements = [];
  let queue = [];
  const context = {
    useCallback: (callback) => callback,
    currentUserId: ME,
    currentUserProfile: { id: ME },
    storedUser: { id: ME },
    chatId: GROUP,
    selectedContact: group,
    stateRef: { current: { groups: [{ ...group }], selectedContact: { ...group } } },
    navigator: { onLine: true },
    REMOVED_FROM_GROUP_NOTICE: NOTICE,
    console: { error() {} },
    createMessageId,
    hasMessageContent,
    normalizeMessageData,
    normalizeGroupThreadContact: (value) => value,
    getGroupThreadChatId: groupId,
    getGroupMemberId: memberId,
    getUniqueGroupMemberIds: (value) => (value?.members || []).map(memberId),
    canResolveCurrentUserGroupIdentity: () => true,
    isCurrentUserGroupMemberId: (value) => memberId(value) === ME,
    isBackendObjectId: (value) => /^[a-f\d]{24}$/i.test(value),
    // Deliberately defer React state updates. The immediate ref must protect an
    // in-flight send even before the next render commits those updates.
    setGroups() {},
    setSelectedContact() {},
    getGroupDetails: async (id, options) => {
      requests.push({ id, options });
      return { participants: [{ user: ADMIN }, { user: { _id: ME } }] };
    },
    socketService: { sendGroupMessage: async (payload) => { sends.push(payload); return { messageId: 'saved' }; } },
    replaceChatMessageRecord: (...args) => replacements.push(args),
    showChatActionToast: (text) => toasts.push(text),
    buildGroupSocketMetadata: () => ({ chatType: 'group', groupId: GROUP }),
    registerGroupMessageIdentityAlias() {},
    shouldQueueMessageAsPending: (error) => /network|offline/i.test(error?.message || ''),
    clampUploadProgressPercent: (value, fallback) => value || fallback,
    readStoredOfflineQueue: () => queue,
    persistStoredOfflineQueue: (value) => { queue = value; },
    ...overrides,
  };
  Object.assign(context, runInNewContext(
    `${rejectionSource}\n${removalSource}\n${markSource}\n${assertSource}\n${deliverSource}\n` +
      '({ isCurrentUserRemovedFromGroup, markCurrentUserRemovedFromGroup, assertCurrentUserCanMessageGroup, deliverGroupMessageRecord })',
    context
  ));
  return { context, sends, requests, toasts, replacements, queue: () => queue };
};

test('explicit removal takes priority over all locally created group flags', () => {
  const { context } = harness();
  for (const flag of ['isLocalDraft', 'isLocallyCreated', 'createdLocally']) {
    assert.equal(context.isCurrentUserRemovedFromGroup({ ...group, [flag]: true, removedFromGroup: true }), true);
    assert.equal(context.isCurrentUserRemovedFromGroup({ ...group, [flag]: true }), false);
  }
});

test('removed users cannot send using a stale group captured by the composer or retry handler', async () => {
  const { context, sends, toasts, requests } = harness();
  context.markCurrentUserRemovedFromGroup(GROUP);
  const result = await context.deliverGroupMessageRecord(draft, group);
  assert.equal(result.status, 'failed');
  assert.equal(result.pendingReason, 'group-membership-removed');
  assert.equal(sends.length, 0);
  assert.equal(requests.length, 0);
  assert.deepEqual(toasts, [NOTICE]);
});

test('a missed removal event is detected from the server roster before dispatch', async () => {
  const { context, sends, toasts } = harness({ getGroupDetails: async () => ({ participants: [{ user: ADMIN }] }) });
  const result = await context.deliverGroupMessageRecord(draft, group);
  assert.equal(result.status, 'failed');
  assert.equal(sends.length, 0);
  assert.equal(context.stateRef.current.selectedContact.removedFromGroup, true);
  assert.deepEqual(toasts, [NOTICE]);
});

test('removal arriving while membership verification is pending wins over its stale response', async () => {
  let resolveRoster;
  const { context, sends } = harness({ getGroupDetails: () => new Promise((resolve) => { resolveRoster = resolve; }) });
  const sending = context.deliverGroupMessageRecord(draft, group);
  context.markCurrentUserRemovedFromGroup(GROUP);
  resolveRoster({ participants: [{ user: ME }, { user: ADMIN }] });
  const result = await sending;
  assert.equal(result.status, 'failed');
  assert.equal(sends.length, 0);
});

test('verified current members keep the existing group-send payload and successful status', async () => {
  const { context, sends, requests } = harness();
  const result = await context.deliverGroupMessageRecord(draft, group);
  assert.equal(result.status, 'sent');
  assert.equal(sends.length, 1);
  assert.equal(sends[0].groupId, GROUP);
  assert.equal(sends[0].content, 'Hello');
  assert.equal(requests[0].options.skipGlobalLoading, true);
});

test('offline sends stay in the local queue and recheck membership before retrying', async () => {
  const { context, sends, queue } = harness({ navigator: { onLine: false } });
  assert.equal((await context.deliverGroupMessageRecord(draft, group)).status, 'pending');
  assert.equal(sends.length, 0);
  assert.equal(queue().length, 1);
  context.navigator.onLine = true;
  context.getGroupDetails = async () => ({ participants: [{ user: ADMIN }] });
  assert.equal((await context.deliverGroupMessageRecord(queue()[0], group)).status, 'failed');
  assert.equal(sends.length, 0);
});

test('a missing roster cannot authorize a send or falsely mark a member as removed', async () => {
  const { context, sends } = harness({ getGroupDetails: async () => ({}) });
  assert.equal((await context.deliverGroupMessageRecord(draft, group)).status, 'failed');
  assert.equal(sends.length, 0);
  assert.equal(context.stateRef.current.selectedContact.removedFromGroup, undefined);
});

test('membership rejection codes show the required notice and never queue an unauthorized send', async () => {
  const { context, sends, toasts, queue } = harness({
    getGroupDetails: async () => { throw Object.assign(new Error('Access denied'), { code: 'NOT_GROUP_MEMBER' }); },
  });
  assert.equal((await context.deliverGroupMessageRecord(draft, group)).status, 'failed');
  assert.equal(sends.length, 0);
  assert.deepEqual(toasts, [NOTICE]);
  assert.equal(queue().length, 0);
});

test('a normal permission failure does not invent a removal', async () => {
  const { context, sends } = harness({
    getGroupDetails: async () => { throw Object.assign(new Error('Only admins can send messages'), { status: 403 }); },
  });
  assert.equal((await context.deliverGroupMessageRecord(draft, group)).status, 'failed');
  assert.equal(sends.length, 0);
  assert.equal(context.stateRef.current.selectedContact.removedFromGroup, undefined);
});

const refreshMembershipSource = section(
  '            const membershipEndedAtTimestamp =',
  '            // The backend is authoritative for membership'
);
const preservesRemoval = (existingGroup, rejoinedAt = REMOVED_AT, refreshStartedAt = Date.parse(JOINED_AT)) =>
  runInNewContext(`${refreshMembershipSource}\npreserveRemovedState`, {
    existingGroup,
    apiGroup: { members: [{ memberId: ME, joinedAt: rejoinedAt }] },
    currentUserProfile: { id: ME }, storedUser: { id: ME }, refreshStartedAt,
    getGroupMemberId: memberId,
    isCurrentUserGroupMemberId: (value) => value === ME,
  });

test('stale roster refreshes do not undo removal, including a request started before removal', () => {
  const removed = { ...group, removedFromGroup: true, removedAt: REMOVED_AT };
  assert.equal(preservesRemoval(removed), true);
  assert.equal(preservesRemoval({ ...removed, rejoinPending: true }, JOINED_AT, Date.parse(REMOVED_AT) - 1), true);
});

test('an explicit re-add or a later join timestamp restores legitimate membership', () => {
  const removed = { ...group, removedFromGroup: true, removedAt: REMOVED_AT };
  assert.equal(preservesRemoval({ ...removed, rejoinPending: true }), false);
  assert.equal(preservesRemoval(removed, JOINED_AT), false);
});

test('roster refresh keeps a removed user out of the member list until a confirmed re-add', async () => {
  const { context } = harness();
  let groups = [{ ...group, members: [ADMIN], removedFromGroup: true, removedAt: REMOVED_AT }];
  Object.assign(context, {
    AbortController,
    pendingGroupRefreshRef: { current: null },
    groupRefreshSequenceRef: { current: 0 },
    groupRefreshAbortRef: { current: null },
    deletedGroupIdsRef: { current: new Set() },
    getMyGroups: async () => [{ ...group, members: [{ memberId: ADMIN }, { memberId: ME, joinedAt: REMOVED_AT }] }],
    dedupeGroupThreads: (values) => values,
    normalizeApiGroupThreadContact: (value) => value,
    isBroadcastThreadContact: () => false,
    setGroups: (update) => { groups = update(groups); },
  });
  const refresh = runInNewContext(section('  const refreshGroupsFromBackend =', '  const handleRefreshChats =') + '\nrefreshGroupsFromBackend', context);
  await refresh();
  assert.equal(groups[0].removedFromGroup, true);
  assert.deepEqual(Array.from(groups[0].members), [ADMIN]);

  groups[0] = { ...groups[0], rejoinPending: true };
  await refresh();
  assert.equal(groups[0].removedFromGroup, false);
  assert.deepEqual(Array.from(groups[0].members, memberId), [ADMIN, ME]);
  assert.equal(groups[0].rejoinPending, false);
});

test('a removal delivered as a timeline message immediately closes the send path', () => {
  const { context } = harness();
  runInNewContext(`(() => {${section('      const groupMembershipEvent = isGroupIncomingMessage', '      if (isGroupIncomingMessage && !explicitGroup)')} })()`, {
    ...context,
    incomingMessage: {}, isGroupIncomingMessage: true, targetChatId: GROUP, fallbackGroup: group,
    getGroupMembershipNotificationEventForMessage: () => ({ action: 'removed', participantIds: [ME], participantNames: ['Me'], createdAt: REMOVED_AT }),
    showGroupMembershipNotice() {},
  });
  assert.equal(context.stateRef.current.selectedContact.removedFromGroup, true);
});
