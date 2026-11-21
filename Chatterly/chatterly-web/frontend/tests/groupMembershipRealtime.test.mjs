import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../src/pages/ChatListPage.jsx', import.meta.url), 'utf8')
  .replaceAll('\r\n', '\n');
const section = (startMarker, endMarker) => {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `Missing section: ${startMarker}`);
  return source.slice(start, end);
};
const GROUP_ID = '111111111111111111111111';
const MEMBER_ID = '222222222222222222222222';
const group = { chatId: GROUP_ID, name: 'Project', members: [] };
const participant = { id: MEMBER_ID, name: 'Casey' };
const memberId = (value) => typeof value === 'string' ? value : value?.id || value?.userId || '';
const noticeSource = section('  const showGroupMembershipNotice =', '  const persistGroupMembershipNotice =');
const membershipSource = section('const buildGroupMembershipNotificationContent =', 'const getGroupRoleChangeNotificationEventForMessage =');
const groupEffectSource = section(
  '  // Instant cross-account group sync:',
  '  useEffect(() => {\n    if (!chatId) { setSelectedContact(null); return; }',
);

const harness = (overrides = {}) => {
  let notices = [];
  let listener;
  let cleanup;
  let refreshes = 0;
  let removed = '';
  let serial = 0;
  let persistenceCalls = 0;
  const scheduled = [];
  const context = {
    useCallback: (callback) => callback,
    useEffect: (effect) => { cleanup = effect(); },
    chatId: GROUP_ID,
    currentUserId: 'me',
    currentUserProfile: {},
    storedUser: {},
    groups: [group],
    selectedContact: group,
    contacts: [],
    normalizeGroupThreadContact: (value) => value,
    getGroupThreadChatId: (value) => value?.chatId || '',
    getGroupThreadName: (value) => value?.name || '',
    getContactUserId: memberId,
    getGroupMemberId: memberId,
    doGroupMemberIdsMatch: (left, right) => left === right,
    doesContactMatchGroupMemberId: (contact, id) => memberId(contact) === id,
    isCurrentUserGroupMemberId: (id) => id === 'me',
    resolveCurrentUserDisplayName: () => 'Morgan',
    resolveGroupMemberDisplayName: (id, participants) => participants.find((item) => memberId(item) === id)?.name || 'A participant',
    createMessageId: (prefix) => `${prefix}-${++serial}`,
    setChatPinNotices: (update) => { notices = update(notices); },
    socketService: { onGroupChange: (callback) => { listener = callback; return () => { listener = null; }; } },
    setGroups() {},
    markCurrentUserRemovedFromGroup: (id) => { removed = id; },
    refreshGroupsFromBackend: () => { refreshes += 1; },
    showGroupNameChangeNotice() {},
    triggerLocalChatNotification() {},
    buildChatThreadRoute: (id) => `/groups/chat/${id}`,
    getChatModuleRootRoute: () => '/groups',
    CHAT_MODULES: { groups: 'groups' },
    setTimeout: (callback) => { scheduled.push(callback); return scheduled.length; },
    clearTimeout() {},
    isGroupThreadContact: () => true,
    isBroadcastThreadContact: () => false,
    getCurrentUserSelectedGroupAdminState: () => ({ canAddParticipants: true }),
    getUniqueGroupMemberIds: () => [],
    arePhoneNumbersEquivalent: (left, right) => left === right,
    handleCloseAddParticipantsPicker() {},
    updateCurrentGroupParticipants() {},
    showChatActionToast() {},
    isBackendObjectId: (id) => /^[a-f\d]{24}$/i.test(id),
    addParticipants: async () => ({}),
    removeParticipant: async () => ({}),
    notifyUser: async () => ({}),
    // Deliberately never acknowledge the persisted notice: rendering must not wait for it.
    persistGroupMembershipNotice: () => { persistenceCalls += 1; return new Promise(() => {}); },
    refreshBroadcastsFromBackend() {},
    groupParticipantActionTarget: participant,
    setChatActionModal() {},
    setGroupParticipantActionTarget() {},
    ...overrides,
  };
  const show = runInNewContext(noticeSource + '\nshowGroupMembershipNotice;', context);
  context.showGroupMembershipNotice = show;
  return {
    context, show,
    notices: () => notices,
    refreshes: () => refreshes,
    removed: () => removed,
    persistenceCalls: () => persistenceCalls,
    subscribe: () => runInNewContext(groupEffectSource, context),
    receive: (type, payload) => listener({ type, payload }),
    cleanup: () => cleanup(),
    flushRefresh: () => scheduled.at(-1)?.(),
  };
};

test('add/remove socket events immediately render notices using server names before roster refresh', () => {
  const chat = harness();
  chat.subscribe();
  for (const action of ['added', 'removed']) {
    chat.receive(`participant_${action}`, {
      groupId: GROUP_ID,
      participantIds: [MEMBER_ID],
      participants: ['Casey'],
      actorName: 'Morgan',
      createdAt: '2026-10-26T10:00:00Z',
    });
  }
  assert.deepEqual(Array.from(chat.notices(), (notice) => notice.text), [
    'Morgan added Casey.', 'Morgan removed Casey.',
  ]);
  assert.equal(chat.refreshes(), 0);
  chat.flushRefresh();
  assert.equal(chat.refreshes(), 1, 'Roster refresh must keep working');
  chat.cleanup();
});

test('membership events are routed to their own group and retain removal restrictions', () => {
  const chat = harness();
  chat.subscribe();
  chat.receive('participant_added', { groupId: 'another-group', participantIds: [MEMBER_ID], participants: ['Casey'] });
  assert.equal(chat.notices()[0].chatId, 'another-group');
  chat.receive('participant_removed', { groupId: GROUP_ID, participantIds: ['me'], participants: ['Morgan'] });
  assert.equal(chat.removed(), GROUP_ID);
  assert.match(chat.notices()[1].text, /removed Morgan/);
});

test('readable incoming membership messages with names and no IDs appear immediately', () => {
  for (const action of ['added', 'removed']) {
    const chat = harness();
    const receive = runInNewContext(membershipSource + `
      (incomingMessage) => {
        ${section('      const groupMembershipEvent = isGroupIncomingMessage', '      if (isGroupIncomingMessage && !explicitGroup)')}
      };
    `, {
      ...chat.context,
      GROUP_MEMBERSHIP_NOTIFICATION_MARKER: '__GROUP_MEMBERSHIP__:',
      isGroupIncomingMessage: true,
      targetChatId: GROUP_ID,
      fallbackGroup: group,
    });
    receive({ id: 'server-message', tempId: `group-membership-${action}-123`, groupId: GROUP_ID, content: `Morgan ${action} Casey.` });
    assert.equal(chat.notices().length, 1);
    assert.equal(chat.notices()[0].text, `Morgan ${action} Casey.`);
  }
});

test('socket duplicates and persisted message echoes produce one in-chat notice', () => {
  const chat = harness();
  chat.subscribe();
  const payload = { groupId: GROUP_ID, participantIds: [MEMBER_ID], participants: ['Casey'], actorName: 'Morgan' };
  chat.receive('participant_added', payload);
  chat.receive('participant_added', payload);
  chat.show({ chatId: GROUP_ID, action: 'added', participantNames: ['Casey'], actorName: 'Morgan' });
  assert.equal(chat.notices().length, 1);
});

test('multiple participants, legacy ID-only events, and empty events keep valid notice behavior', () => {
  const chat = harness();
  chat.show({ participantIds: ['one', 'two'], participantNames: ['Casey', 'Riley'], actorName: 'Morgan' });
  assert.equal(chat.notices()[0].text, 'Morgan added Casey and Riley.');
  chat.subscribe();
  chat.receive('participant_removed', { groupId: GROUP_ID, participants: [MEMBER_ID] });
  assert.equal(chat.notices()[1].text, 'A group admin removed A participant.');
  chat.receive('participant_added', { groupId: GROUP_ID });
  assert.equal(chat.notices().length, 2);
});

const runLocalAction = (chat, action) => {
  const [start, end, name] = action === 'added'
    ? ['  const handleAddParticipantsToCurrentGroup =', '  const handleRequestRemoveGroupParticipant =', 'handleAddParticipantsToCurrentGroup']
    : ['  const handleConfirmRemoveGroupParticipant =', '  const handleContactClick =', 'handleConfirmRemoveGroupParticipant'];
  const callback = runInNewContext(section(start, end) + `\n${name};`, chat.context);
  callback([participant]);
};
// Drain the request's success/failure callbacks without waiting for the pending socket acknowledgment.
const settleRequest = () => new Promise((resolve) => setImmediate(resolve));

test('successful local add/remove actions display notices without waiting for socket echoes', async () => {
  for (const action of ['added', 'removed']) {
    const chat = harness();
    runLocalAction(chat, action);
    assert.equal(chat.notices().length, 0, 'Do not announce before the server confirms success');
    await settleRequest();
    assert.equal(chat.notices().length, 1);
    assert.equal(chat.notices()[0].text, `Morgan ${action} Casey.`);
    assert.equal(chat.persistenceCalls(), 1, 'Notice persistence must keep working');
  }
});

test('failed add/remove requests never announce a successful membership change', async () => {
  for (const action of ['added', 'removed']) {
    const fail = async () => { throw new Error('No permission'); };
    const chat = harness({ addParticipants: fail, removeParticipant: fail });
    runLocalAction(chat, action);
    await settleRequest();
    assert.equal(chat.notices().length, 0);
    assert.equal(chat.persistenceCalls(), 0);
  }
});
