import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { ManageGroupMembersScreen } from '../src/screens/ManageGroupMembersScreen';
import { subscribeToOnlineUsers } from '../src/services/chatRealtime';
import {
  getGroupDetails,
  removeGroupAdmin,
  restrictGroupMembers,
  unrestrictGroupMember,
  updateGroupMessagePermissions,
  updateGroupPermissions,
  type GroupMember,
  type GroupMemberRole,
} from '../src/services/groupApi';
import {setGroupManageReportsPermission} from '../src/services/groupPermissionStore';

jest.setTimeout(15000);
jest.mock('react-native-safe-area-context', () => ({...jest.requireActual('react-native-safe-area-context'),
  SafeAreaProvider: ({children}: {children: React.ReactNode}) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0 }),
}));
jest.mock('../src/services/sessionStore', () => ({
  getSession: () => ({ user: { id: 'me' } }),
}));
jest.mock('../src/services/chatRealtime', () => ({
  subscribeToGroupChanges: jest.fn(() => jest.fn()),
  subscribeToOnlineUsers: jest.fn(),
}));
jest.mock('../src/services/groupPermissionStore', () => ({
  getGroupManageReportsPermission: jest.fn(async () => false),
  setGroupManageReportsPermission: jest.fn(async () => undefined),
}));
jest.mock('../src/services/chatApi', () => ({
  searchChatContacts: jest.fn(async () => []),
  getChatProfile: jest.fn(async () => ({ online: true })),
  getChatList: jest.fn(async () => []),
  findDirectChatForUser: jest.fn(() => null),
  chatIdOf: jest.fn(() => ''),
  startChat: jest.fn(async () => ({ chatId: 'direct-1' })),
}));
jest.mock('../src/services/groupApi', () => ({
  getGroupDetails: jest.fn(),
  getGroupPermissions: jest.fn(async () => ({
    member: {addMembers: false},
    moderator: {addMembers: false, assignRoles: false, pinMessages: true, editGroupInfo: false},
    admin: {approveJoinRequests: false},
  })),
  addGroupParticipants: jest.fn(),
  removeGroupParticipant: jest.fn(),
  sendGroupTimelineNotice: jest.fn(),
  assignGroupAdmin: jest.fn(async () => undefined),
  removeGroupAdmin: jest.fn(async () => undefined),
  assignGroupModerator: jest.fn(async () => undefined),
  removeGroupModerator: jest.fn(async () => undefined),
  restrictGroupMembers: jest.fn(),
  unrestrictGroupMember: jest.fn(async () => undefined),
  updateGroupMessagePermissions: jest.fn(async () => undefined),
  updateGroupPermissions: jest.fn(async () => ({
    member: {addMembers: true},
    moderator: {addMembers: false, assignRoles: false, pinMessages: true, editGroupInfo: false},
    admin: {approveJoinRequests: false},
  })),
  enableGroupInviteLink: jest.fn(),
  disableGroupInviteLink: jest.fn(),
}));

const people = (myRole: GroupMemberRole): GroupMember[] => [
  { userId: 'me', name: 'Me', role: myRole },
  {
    userId: 'aarav',
    name: 'Aarav Sharma',
    role: 'admin',
    phone: '+91 8646 213 230',
  },
  { userId: 'bishod', name: 'Bishod Thomas', role: 'moderator' },
  { userId: 'chivan', name: 'Chivan Mathew', role: 'member' },
];

type ScreenProps = React.ComponentProps<typeof ManageGroupMembersScreen>;
const settle = () => new Promise<void>(resolve => setTimeout(resolve, 0));

async function render(
  myRole: GroupMemberRole,
  props: Partial<ScreenProps> = {},
) {
  jest.mocked(getGroupDetails).mockResolvedValue({
    id: 'g1',
    name: 'Team',
    rules: [],
    settings: { onlyAdminsCanMessage: false, onlyAdminsCanShareMedia: false },
    participants: people(myRole),
  });
  let tree: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <ManageGroupMembersScreen
        groupId="g1"
        onBack={jest.fn()}
        onNotice={jest.fn()}
        visible
        {...props}
      />,
    );
    await settle();
  });
  return tree!;
}

type Node = renderer.ReactTestInstance | renderer.ReactTestRenderer['root'];
const byLabel = (node: Node, label: string) =>
  node.findAllByProps({ accessibilityLabel: label });
const hasText = (tree: renderer.ReactTestRenderer, text: string) =>
  tree.root.findAll(node => node.props.children === text).length > 0;
const presenceText = (tree: renderer.ReactTestRenderer, userId: string) => {
  const find = (node: any): string | undefined => {
    if (Array.isArray(node))
      return node.reduce<string | undefined>(
        (result, item) => result || find(item),
        undefined,
      );
    if (!node || typeof node !== 'object') return undefined;
    if (node.props?.accessibilityLabel === `Presence for ${userId}`)
      return node.children?.join('');
    return find(node.children);
  };
  return find(tree.toJSON());
};
async function press(tree: renderer.ReactTestRenderer, label: string) {
  await act(async () => {
    byLabel(tree.root, label)[0].props.onPress();
    await settle();
  });
}

beforeEach(() => jest.clearAllMocks());

test('maps realtime presence to the matching member and clears stale online status', async () => {
  let presenceListener: (ids: ReadonlySet<string>) => void = () => undefined;
  jest.mocked(subscribeToOnlineUsers).mockImplementation(listener => {
    presenceListener = listener;
    listener(new Set(['aarav']));
    return jest.fn();
  });
  const tree = await render('member');
  expect(presenceText(tree, 'aarav')).toBe('Online');
  expect(presenceText(tree, 'bishod')).toBe('Offline');
  await act(async () => presenceListener(new Set(['bishod'])));
  expect(presenceText(tree, 'aarav')).toBe('Offline');
  expect(presenceText(tree, 'bishod')).toBe('Online');
  await act(async () => presenceListener(new Set()));
  expect(presenceText(tree, 'bishod')).toBe('Offline');
  await act(async () => tree.unmount());
});

test('admins restrict selected members after confirming and can lift a restriction', async () => {
  jest
    .mocked(restrictGroupMembers)
    .mockResolvedValue({ restrictedIds: ['bishod', 'chivan'], failures: [] });
  const tree = await render('superadmin');

  await press(tree, 'Restrict Members');
  expect(hasText(tree, 'Restricted Members')).toBe(true);
  await press(tree, 'Restrict more members');
  expect(byLabel(tree.root, 'Select Me')).toHaveLength(0);
  await press(tree, 'Select Bishod Thomas');
  await press(tree, 'Select Chivan Mathew');
  await press(tree, 'Restrict selected members');

  expect(restrictGroupMembers).not.toHaveBeenCalled();
  expect(hasText(tree, 'Restrict Selected Members?')).toBe(true);
  expect(hasText(tree, '2 Members Selected')).toBe(true);
  await press(tree, 'Restrict Members (2)');
  expect(restrictGroupMembers).toHaveBeenCalledWith('g1', ['bishod', 'chivan']);
  expect(hasText(tree, 'Restricted Members')).toBe(true);

  await press(tree, 'Remove restriction for Chivan Mathew');
  expect(hasText(tree, 'Remove Restriction?')).toBe(true);
  await press(tree, 'Remove Restriction');
  expect(unrestrictGroupMember).toHaveBeenCalledWith('g1', 'chivan');
  expect(
    byLabel(tree.root, 'Remove restriction for Chivan Mathew'),
  ).toHaveLength(0);
  expect(
    byLabel(tree.root, 'Remove restriction for Bishod Thomas').length,
  ).toBeGreaterThan(0);
  await act(async () => tree.unmount());
});

test('the member sheet only offers what an admin is allowed to do', async () => {
  const tree = await render('admin', { onOpenDirectChat: jest.fn() });

  await press(tree, 'Options for Aarav Sharma');
  const adminSheet = byLabel(tree.root, 'Member options')[0];
  expect(byLabel(adminSheet, 'View Profile').length).toBeGreaterThan(0);
  expect(byLabel(adminSheet, 'Send Message').length).toBeGreaterThan(0);
  [
    'Remove Admin',
    'Make Moderator',
    'Restrict Aarav Sharma',
    'Remove Aarav Sharma',
  ].forEach(label => expect(byLabel(adminSheet, label)).toHaveLength(0));
  await press(tree, 'Close member options');

  await press(tree, 'Options for Bishod Thomas');
  const moderatorSheet = byLabel(tree.root, 'Member options')[0];
  [
    'Remove Moderator',
    'Restrict Bishod Thomas',
    'Remove Bishod Thomas',
  ].forEach(label =>
    expect(byLabel(moderatorSheet, label).length).toBeGreaterThan(0),
  );
  expect(byLabel(moderatorSheet, 'Make Admin')).toHaveLength(0);
  await act(async () => tree.unmount());
});

test('members get a read-only Group Members list', async () => {
  const tree = await render('member');
  expect(hasText(tree, 'Group Members')).toBe(true);
  [
    'Add Members',
    'Manage Roles',
    'Restrict Members',
    'More group actions',
    'Remove Chivan Mathew',
  ].forEach(label => expect(byLabel(tree.root, label)).toHaveLength(0));
  await act(async () => tree.unmount());
});

test('admins change stored message permissions while fixed server rules stay locked', async () => {
  const tree = await render('admin', { initialPage: 'permissions' });
  await press(tree, 'Members can Send Messages');
  expect(updateGroupMessagePermissions).toHaveBeenCalledWith('g1', {
    membersCanSendMessages: false,
    membersCanShareMedia: true,
  });
  expect(
    byLabel(tree.root, 'Members can Send Messages')[0].props.accessibilityState
      .checked,
  ).toBe(false);
  expect(
    byLabel(tree.root, 'Moderators can Add Members')[0].props.disabled,
  ).toBe(true);
  expect(
    byLabel(tree.root, 'Admin can Approve Join Requests')[0].props.disabled,
  ).toBe(true);
  await act(async () => tree.unmount());
});

test('only the Super Admin changes role permissions through the permissions API', async () => {
  const tree = await render('superadmin', { initialPage: 'permissions' });
  await press(tree, 'Members can Add Members');
  expect(updateGroupPermissions).toHaveBeenCalledWith('g1', {
    member: {addMembers: true},
  });
  expect(byLabel(tree.root, 'Members can Add Members')[0].props.accessibilityState.checked).toBe(true);
  await act(async () => tree.unmount());
});

test('the Super Admin can toggle Manage Reports without sending an unsupported API field', async () => {
  const tree = await render('superadmin', { initialPage: 'permissions' });
  await press(tree, 'Moderators can Manage Reports');
  expect(setGroupManageReportsPermission).toHaveBeenCalledWith('g1', true);
  expect(updateGroupPermissions).not.toHaveBeenCalled();
  expect(byLabel(tree.root, 'Moderators can Manage Reports')[0].props.accessibilityState.checked).toBe(true);
  await act(async () => tree.unmount());
});

test('removing an admin role waits for confirmation', async () => {
  const tree = await render('superadmin', { initialPage: 'roles' });
  await press(tree, 'Role for Aarav Sharma');
  await press(tree, 'Set Aarav Sharma as member');
  expect(removeGroupAdmin).not.toHaveBeenCalled();
  expect(hasText(tree, 'Remove Aarav Sharma as admin?')).toBe(true);
  await press(tree, 'Remove Admin');
  expect(removeGroupAdmin).toHaveBeenCalledWith('g1', 'aarav');
  await act(async () => tree.unmount());
});
