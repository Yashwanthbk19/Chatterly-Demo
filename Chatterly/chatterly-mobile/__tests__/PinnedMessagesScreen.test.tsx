import * as Clipboard from 'expo-clipboard';
import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {getGroupPinnedMessages, unpinGroupMessage} from '../src/services/groupApi';
import {deleteMessage, getPinnedMessages, unpinMessage} from '../src/services/chatApi';
import {PinnedMessagesScreen} from '../src/screens/PinnedMessagesScreen';

jest.mock('../src/services/groupApi', () => ({
  getGroupPinnedMessages: jest.fn(),
  unpinGroupMessage: jest.fn(),
}));
jest.mock('../src/services/chatApi', () => ({
  deleteMessage: jest.fn(),
  getPinnedMessages: jest.fn(),
  unpinMessage: jest.fn(),
}));

const messages = [
  {id:'pin-2',text:'A very long moderator announcement that must be truncated in the compact list instead of changing the row alignment.',createdAt:'2026-05-20T15:24:00.000Z',pinnedAt:'2026-05-20T15:30:00.000Z',isOwn:false,isPinned:true,senderId:'moderator-1',senderName:'Moderator'},
  {id:'pin-1',text:'This is the admin message',createdAt:'2026-05-20T15:20:00.000Z',pinnedAt:'2026-05-20T15:21:00.000Z',isOwn:false,isPinned:true,senderId:'admin-1',senderName:'Ananya'},
];
const members = [
  {userId:'moderator-1',name:'Moderator',role:'moderator' as const},
  {userId:'admin-1',name:'Ananya',role:'admin' as const},
];

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getGroupPinnedMessages).mockResolvedValue(messages);
  jest.mocked(unpinGroupMessage).mockResolvedValue(undefined);
  jest.mocked(deleteMessage).mockResolvedValue(undefined);
  jest.mocked(getPinnedMessages).mockResolvedValue(messages);
  jest.mocked(unpinMessage).mockResolvedValue(undefined);
});

async function renderScreen(overrides: Partial<React.ComponentProps<typeof PinnedMessagesScreen>> = {}) {
  const props: React.ComponentProps<typeof PinnedMessagesScreen> = {
    visible:true, groupId:'group-1', initialMessages:[], members,
    onBack:jest.fn(), onOpenInChat:jest.fn(), onForward:jest.fn(), onDelete:jest.fn(), onDeletedForMe:jest.fn(), onUnpinned:jest.fn(), onNotice:jest.fn(),
    ...overrides,
  };
  let tree: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<SafeAreaProvider initialMetrics={{frame:{x:0,y:0,width:393,height:852},insets:{top:24,right:0,bottom:24,left:0}}}><PinnedMessagesScreen {...props}/></SafeAreaProvider>);
    await Promise.resolve();
  });
  return {tree:tree!, props};
}

const findPinnedRow = (tree: renderer.ReactTestRenderer, preview: string) => tree.root.find(node => typeof node.props.accessibilityLabel === 'string' && node.props.accessibilityLabel.startsWith('Pinned message from ') && node.props.accessibilityLabel.includes(preview));
const findPinnedRows = (tree: renderer.ReactTestRenderer, preview: string) => tree.root.findAll(node => typeof node.props.accessibilityLabel === 'string' && node.props.accessibilityLabel.startsWith('Pinned message from ') && node.props.accessibilityLabel.includes(preview));

test('loads searchable pinned rows with sender metadata and truncated previews', async () => {
  const {tree} = await renderScreen();
  expect(getGroupPinnedMessages).toHaveBeenCalledWith('group-1');
  expect(tree.root.findByProps({accessibilityRole:'header'}).props.children).toBe('Pinned');
  expect(tree.root.findByProps({accessibilityLabel:'Search Messages'})).toBeDefined();
  expect(tree.root.findAll(node => node.props.children === 'Admin').length).toBeGreaterThan(0);
  expect(tree.root.findAll(node => node.props.children === 'Moderator').length).toBeGreaterThan(0);
  expect(tree.root.findAll(node => node.children.join('').startsWith('Pinned ') && node.children.join('').endsWith('Until unpinned')).length).toBe(2);
  expect(findPinnedRow(tree, 'A very long moderator announcement').props.accessibilityHint).toBe('Shows message actions');
  expect(tree.root.findAll(node => node.props.ellipsizeMode === 'tail' && node.props.numberOfLines === 2).length).toBeGreaterThanOrEqual(2);

  await act(async () => tree.root.findByProps({accessibilityLabel:'Search Messages'}).props.onChangeText('admin message'));
  expect(findPinnedRows(tree, 'This is the admin message').length).toBeGreaterThan(0);
  expect(findPinnedRows(tree, 'A very long moderator announcement')).toHaveLength(0);
  act(() => tree.unmount());
});

test('shows all pinned actions and wires copy and unpin', async () => {
  const onUnpinned = jest.fn();
  const onNotice = jest.fn();
  const {tree} = await renderScreen({onUnpinned,onNotice});
  const row = findPinnedRow(tree, 'This is the admin message');

  await act(async () => row.props.onLongPress());
  for (const label of ['Open in Chat','Select','Forward','Copy','Unpin Message','Delete']) expect(tree.root.findByProps({accessibilityLabel:label})).toBeDefined();
  expect(tree.root.findByProps({d:'M11 11L29 29M23 12.5L19.751 15.749M17.181 17.182L15 18L13.5 19.5L20.5 26.5L22 25L22.82 22.814M24.25 20.251L27.5 17M17 23L12.5 27.5M22.5 12L28 17.5'})).toBeDefined();
  await act(async () => {tree.root.findByProps({accessibilityLabel:'Copy'}).props.onPress(); await Promise.resolve();});
  expect(Clipboard.setStringAsync).toHaveBeenCalledWith('This is the admin message');

  await act(async () => row.props.onPress());
  await act(async () => {tree.root.findByProps({accessibilityLabel:'Unpin Message'}).props.onPress(); await Promise.resolve();});
  expect(unpinGroupMessage).toHaveBeenCalledWith('group-1','pin-1');
  expect(onUnpinned).toHaveBeenCalledWith('pin-1');
  expect(onNotice).toHaveBeenCalledWith('Message unpinned.');
  expect(findPinnedRows(tree, 'This is the admin message')).toHaveLength(0);
  act(() => tree.unmount());
});

test('opens the original in chat and keeps Select mode on the pinned screen', async () => {
  const onBack = jest.fn();
  const onOpenInChat = jest.fn();
  const {tree} = await renderScreen({onBack,onOpenInChat});
  const adminRow = findPinnedRow(tree, 'This is the admin message');

  await act(async () => adminRow.props.onLongPress());
  await act(async () => tree.root.findByProps({accessibilityLabel:'Open in Chat'}).props.onPress());
  expect(onBack).toHaveBeenCalledTimes(1);
  expect(onOpenInChat).toHaveBeenCalledWith(expect.objectContaining({id:'pin-1'}));
  act(() => tree.unmount());

  const selection = await renderScreen();
  await act(async () => findPinnedRow(selection.tree, 'This is the admin message').props.onLongPress());
  await act(async () => selection.tree.root.findByProps({accessibilityLabel:'Select'}).props.onPress());
  expect(selection.tree.root.findByProps({accessibilityLabel:'1 selected'})).toBeDefined();
  expect(findPinnedRow(selection.tree, 'This is the admin message').props.accessibilityState).toEqual({selected:true});
  for (const label of ['Copy selected pinned messages','Unpin selected messages','Delete selected pinned messages','Forward selected pinned messages']) expect(selection.tree.root.findByProps({accessibilityLabel:label})).toBeDefined();

  await act(async () => findPinnedRow(selection.tree, 'A very long moderator announcement').props.onPress());
  expect(selection.tree.root.findByProps({accessibilityLabel:'2 selected'})).toBeDefined();
  act(() => selection.tree.unmount());
});

test('selects multiple pinned messages in a direct chat and bulk unpins them through the documented API', async () => {
  const onUnpinned = jest.fn();
  const {tree} = await renderScreen({
    groupId: undefined,
    chatId: 'chat-1',
    contactName: 'Ananya',
    members: [],
    onUnpinned,
  });

  expect(getPinnedMessages).toHaveBeenCalledWith('chat-1');
  expect(getGroupPinnedMessages).not.toHaveBeenCalled();
  await act(async () => findPinnedRow(tree, 'This is the admin message').props.onLongPress());
  await act(async () => tree.root.findByProps({accessibilityLabel:'Select'}).props.onPress());
  await act(async () => findPinnedRow(tree, 'A very long moderator announcement').props.onPress());
  expect(tree.root.findByProps({accessibilityLabel:'2 selected'})).toBeDefined();

  await act(async () => {
    tree.root.findByProps({accessibilityLabel:'Unpin selected messages'}).props.onPress();
    await Promise.resolve();
  });
  expect(unpinMessage).toHaveBeenCalledTimes(2);
  expect(unpinMessage).toHaveBeenCalledWith('pin-1');
  expect(unpinMessage).toHaveBeenCalledWith('pin-2');
  expect(onUnpinned).toHaveBeenCalledTimes(2);
  expect(findPinnedRows(tree, 'This is the admin message')).toHaveLength(0);
  act(() => tree.unmount());
});
