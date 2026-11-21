import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { GroupInfoScreen } from '../src/screens/GroupInfoScreen';
import { ManageGroupMembersScreen } from '../src/screens/ManageGroupMembersScreen';
import { GroupProfileScreen } from '../src/screens/GroupProfileScreen';
import {
  getGroupDetails,
  type GroupMemberRole,
} from '../src/services/groupApi';
import { getGroupMessages } from '../src/services/chatApi';
import { subscribeToOnlineUsers } from '../src/services/chatRealtime';
// A cold transform of the screen tree can exceed Jest's 5s default when the
// suite runs alongside the other native screen tests.
jest.setTimeout(15000);
jest.mock('react-native-safe-area-context', () => ({...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0 }),
}));
jest.mock('../src/services/groupApi', () => ({ getGroupDetails: jest.fn() }));
jest.mock('../src/services/chatApi', () => ({
  getGroupMessages: jest.fn(async () => []),
}));
jest.mock('../src/services/sessionStore', () => ({
  getSession: () => ({ user: { id: 'me' } }),
}));
jest.mock('../src/services/conversationPreferences', () => ({
  getConversationMuted: jest.fn(async () => false),
}));
jest.mock('../src/services/chatRealtime', () => ({
  subscribeToOnlineUsers: jest.fn(),
}));
jest.mock('../src/screens/ManageGroupMembersScreen', () => ({
  ManageGroupMembersScreen: jest.fn(() => null),
}));
jest.mock('../src/screens/GroupProfileScreen', () => ({
  GroupProfileScreen: jest.fn(() => null),
}));
jest.mock('../src/screens/SharedContentScreen', () => ({
  SharedContentScreen: () => null,
}));
beforeEach(() => jest.clearAllMocks());
const notice = jest.fn();
const back = jest.fn();
async function render(role?: GroupMemberRole) {
  jest.mocked(getGroupDetails).mockResolvedValue({
    id: 'g1',
    name: 'Team',
    rules: ['First', 'Second', 'Third', 'Fourth'],
    settings: { onlyAdminsCanMessage: false, onlyAdminsCanShareMedia: false },
    participants: role
      ? [
          { userId: 'me', name: 'Me', role },
          { userId: 'aarav', name: 'Aarav', role: 'member' },
        ]
      : [],
  });
  let tree: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <GroupInfoScreen
        visible
        chatId="g1"
        contact={{ userId: 'g1', name: 'Team', kind: 'group' }}
        onBack={back}
        onExitGroup={back}
        onClear={back}
        onNotice={notice}
        onCreateSimilarGroup={jest.fn()}
      />,
    );
  });
  return tree!;
}
const labelled = (node: renderer.ReactTestInstance, label: string) =>
  node.findAllByProps({ accessibilityLabel: label });
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
test('non-members cannot fetch member messages or open management controls', async () => {
  const tree = await render();
  expect(getGroupMessages).not.toHaveBeenCalled();
  expect(
    tree.root.findAllByProps({ accessibilityLabel: 'Edit Group Rules' }),
  ).toHaveLength(0);
  expect(
    tree.root.findAllByProps({ accessibilityLabel: 'Group Settings' }),
  ).toHaveLength(0);
  expect(
    tree.root.findAllByProps({ accessibilityLabel: 'Add Members' }),
  ).toHaveLength(0);
  expect(
    tree.root.findAllByProps({ accessibilityLabel: 'More group actions' }),
  ).toHaveLength(0);
  expect(
    tree.root.findAllByProps({ accessibilityLabel: 'Open group profile' }),
  ).toHaveLength(0);
  await act(async () => tree.unmount());
});
test('members can expand and collapse rules but cannot edit them', async () => {
  const tree = await render('member');
  expect(getGroupMessages).toHaveBeenCalledWith('g1');
  expect(
    tree.root.findAllByProps({ accessibilityLabel: 'Edit Group Rules' }),
  ).toHaveLength(0);
  expect(
    tree.root.findAll(node => node.props.children === 'Fourth'),
  ).toHaveLength(0);
  await act(async () =>
    tree.root
      .findAllByProps({ accessibilityLabel: 'Expand rules' })[0]
      .props.onPress(),
  );
  expect(
    tree.root.findAll(node => node.props.children === 'Fourth').length,
  ).toBeGreaterThan(0);
  await act(async () =>
    tree.root
      .findAllByProps({ accessibilityLabel: 'Collapse rules' })[0]
      .props.onPress(),
  );
  expect(
    tree.root.findAll(node => node.props.children === 'Fourth'),
  ).toHaveLength(0);
  await act(async () => tree.unmount());
});
test('updates preview member presence from the shared realtime snapshot', async () => {
  let presenceListener: (ids: ReadonlySet<string>) => void = () => undefined;
  jest.mocked(subscribeToOnlineUsers).mockImplementation(listener => {
    presenceListener = listener;
    listener(new Set(['aarav']));
    return jest.fn();
  });
  const tree = await render('member');
  expect(presenceText(tree, 'aarav')).toBe('Online');
  await act(async () => presenceListener(new Set()));
  expect(presenceText(tree, 'aarav')).toBe('Offline');
  await act(async () => tree.unmount());
});
test('moderators can edit rules but not message permissions or roles', async () => {
  const tree = await render('moderator');
  expect(
    tree.root.findAllByProps({ accessibilityLabel: 'Edit Group Rules' }).length,
  ).toBeGreaterThan(0);
  expect(
    tree.root.findAllByProps({ accessibilityLabel: 'Permissions' }),
  ).toHaveLength(0);
  expect(
    tree.root.findAllByProps({ accessibilityLabel: 'Manage Roles' }),
  ).toHaveLength(0);
  await act(async () => tree.unmount());
});
test('admins open Manage Permissions from the Permissions row', async () => {
  const tree = await render('admin');
  await act(async () =>
    tree.root
      .findAllByProps({ accessibilityLabel: 'Permissions' })[0]
      .props.onPress(),
  );
  expect(jest.mocked(ManageGroupMembersScreen).mock.lastCall?.[0]).toEqual(
    expect.objectContaining({ visible: true, initialPage: 'permissions' }),
  );
  await act(async () => tree.unmount());
});
test('lets members edit the group identity without granting management permissions', async () => {
  const tree = await render('member');
  expect(jest.mocked(GroupProfileScreen)).not.toHaveBeenCalled();
  await act(async () =>
    tree.root
      .findAllByProps({ accessibilityLabel: 'Group Settings' })[0]
      .props.onPress(),
  );
  expect(jest.mocked(GroupProfileScreen).mock.lastCall?.[0]).toEqual(
    expect.objectContaining({ canEdit: true, canEditDescription: false, canRemovePhoto: false, photoOnly: false }),
  );
  await act(async () => tree.unmount());
});

test.each(['member', 'moderator', 'admin', 'superadmin'] as const)('opens photo controls directly from the group camera for %s', async role => {
  const tree = await render(role);
  await act(async () => tree.root.findAllByProps({accessibilityLabel: 'Change group picture'})[0].props.onPress());
  expect(jest.mocked(GroupProfileScreen).mock.lastCall?.[0]).toEqual(expect.objectContaining({canEdit: true, photoOnly: true}));
  await act(async () => jest.mocked(GroupProfileScreen).mock.lastCall?.[0].onBack());
  expect(tree.root.findAllByType(GroupProfileScreen)).toHaveLength(0);
  await act(async () => tree.unmount());
});
test('the group actions sheet hides admin-only entries from members', async () => {
  const memberTree = await render('member');
  await act(async () =>
    memberTree.root
      .findAllByProps({ accessibilityLabel: 'More group actions' })[0]
      .props.onPress(),
  );
  const memberSheet = labelled(memberTree.root, 'Group actions')[0];
  expect(labelled(memberSheet, 'Group Settings').length).toBeGreaterThan(0);
  expect(
    labelled(memberSheet, 'Create a Similar Group').length,
  ).toBeGreaterThan(0);
  expect(labelled(memberSheet, 'Group Permissions')).toHaveLength(0);
  expect(labelled(memberSheet, 'Add Members')).toHaveLength(0);
  await act(async () => memberTree.unmount());

  const adminTree = await render('admin');
  await act(async () =>
    adminTree.root
      .findAllByProps({ accessibilityLabel: 'More group actions' })[0]
      .props.onPress(),
  );
  const adminSheet = labelled(adminTree.root, 'Group actions')[0];
  expect(labelled(adminSheet, 'Group Permissions').length).toBeGreaterThan(0);
  await act(async () =>
    labelled(adminSheet, 'Group Permissions')[0].props.onPress(),
  );
  expect(jest.mocked(ManageGroupMembersScreen).mock.lastCall?.[0]).toEqual(
    expect.objectContaining({ visible: true, initialPage: 'permissions' }),
  );
  await act(async () => adminTree.unmount());
});
