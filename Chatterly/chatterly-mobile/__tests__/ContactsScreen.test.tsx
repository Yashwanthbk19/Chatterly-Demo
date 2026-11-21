import * as Contacts from 'expo-contacts';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {Alert, FlatList, Image, Linking, Platform, Share, StyleSheet, Text, View} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {ContactsScreen} from '../src/screens/ContactsScreen';
import {getChatList, getForwardDestinations, searchChatContacts, startChat} from '../src/services/chatApi';
import {syncContacts} from '../src/services/contactsApi';
import {assignGroupModerator, createGroup, enableGroupInviteLink, searchGroups, updateGroupMessagePermissions, updateGroupPermissions} from '../src/services/groupApi';
import {setGroupManageReportsPermission} from '../src/services/groupPermissionStore';
import type {ConversationContact} from '../src/types/chat';
import {createBroadcast, saveBroadcastImage} from '../src/services/broadcastApi';
import * as sessionStore from '../src/services/sessionStore';
import {QrIcon} from '../src/components/ContactsIcons';
import {APP_INVITE_LINK} from '../src/utils/appInvite';
import {INVITATION_MESSAGE_DESIGN_TEXT} from '../src/components/InviteSectionSvgs';

jest.setTimeout(15000);

jest.mock('expo-modules-core', () => ({requireOptionalNativeModule: jest.fn(() => null)}));

jest.mock('../src/services/contactsApi', () => ({
  syncContacts: jest.fn().mockResolvedValue({registered: [], unRegistered: []}),
}));

jest.mock('../src/services/chatApi', () => ({
  chatIdOf: (chat: {_id?: string} | null) => chat?._id || '',
  findDirectChatForUser: (chats: Array<{participants?: Array<{user?: string}>}>, userId: string) => (
    chats.find(chat => chat.participants?.some(participant => participant.user === userId)) || null
  ),
  getChatList: jest.fn().mockResolvedValue([]),
  getForwardDestinations: jest.fn().mockResolvedValue([]),
  startChat: jest.fn(),
  searchChatContacts: jest.fn().mockResolvedValue([]),
}));

jest.mock('../src/services/broadcastApi', () => ({
  createBroadcast: jest.fn(),
  saveBroadcastImage: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/services/groupApi', () => ({
  searchGroups: jest.fn().mockResolvedValue([]),
  createGroup: jest.fn().mockResolvedValue({_id: 'group-1', groupName: 'Project Team'}),
  assignGroupModerator: jest.fn().mockResolvedValue(undefined),
  assignGroupAdmin: jest.fn().mockResolvedValue(undefined),
  updateGroupMessagePermissions: jest.fn().mockResolvedValue(undefined),
  updateGroupPermissions: jest.fn().mockResolvedValue(undefined),
  enableGroupInviteLink: jest.fn().mockResolvedValue('https://example.com/invite'),
}));
jest.mock('../src/services/groupPermissionStore', () => ({
  setGroupManageReportsPermission: jest.fn().mockResolvedValue(undefined),
}));

const grantedPermission = {
  status: Contacts.PermissionStatus.GRANTED,
  granted: true,
  canAskAgain: true,
  expires: 'never' as const,
};

async function renderScreen(onOpenConversation?: (contact: ConversationContact, chatId: string) => void, bottom = 18) {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider initialMetrics={{
        frame: {x: 0, y: 0, width: 307, height: 641},
        insets: {top: 24, right: 0, bottom, left: 0},
      }}>
        <ContactsScreen onOpenConversation={onOpenConversation} />
      </SafeAreaProvider>,
    );
    await Promise.resolve();
  });
  return renderer!;
}

async function finishRefresh() {
  await ReactTestRenderer.act(async () => {
    await jest.advanceTimersByTimeAsync(800);
  });
}

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.useFakeTimers();
  jest.clearAllMocks();
  jest.mocked(Contacts.getPermissionsAsync).mockResolvedValue(grantedPermission);
  jest.mocked(Contacts.requestPermissionsAsync).mockResolvedValue(grantedPermission);
  jest.mocked(Contacts.Contact.getAllDetails).mockResolvedValue([]);
  jest.mocked(Contacts.Contact.create).mockResolvedValue({id: 'created-contact'} as never);
  jest.mocked(syncContacts).mockResolvedValue({registered: [], unRegistered: []});
  jest.mocked(getChatList).mockResolvedValue([]);
  jest.mocked(getForwardDestinations).mockResolvedValue([]);
  jest.mocked(startChat).mockResolvedValue({chatId: 'new-chat', chat: {_id: 'new-chat'}});
  jest.mocked(createBroadcast).mockResolvedValue({_id: 'broadcast-1', name: 'Team Updates', participants: []});
  jest.mocked(searchGroups).mockResolvedValue([]);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test.each(['android', 'ios'] as const)('opens the profile QR from Contacts without an overflow menu and returns on %s', async platform => {
  jest.replaceProperty(Platform, 'OS', platform);
  jest.spyOn(sessionStore, 'getSession').mockReturnValue({
    token: 'test-token', user: {id: 'qr-user', name: 'QR User'}, isProfileComplete: true,
  });
  const renderer = await renderScreen();
  await finishRefresh();
  try {
    expect(renderer.root.findAllByProps({accessibilityLabel: 'Contact options'})).toHaveLength(0);
    const qrButton = renderer.root.findByProps({accessibilityLabel: 'Scan QR'});
    expect(qrButton.findByType(QrIcon)).toBeDefined();
    await ReactTestRenderer.act(async () => qrButton.props.onPress());
    expect(renderer.root.findByProps({accessibilityLabel: 'My profile QR code'})).toBeDefined();
    expect(renderer.root.findAllByProps({value: 'https://chatterly.stacklycloud.com/profile/qr-user'}).length).toBeGreaterThan(0);
    await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Back to contacts'}).props.onPress());
    expect(renderer.root.findByProps({accessibilityLabel: 'Scan QR'})).toBeDefined();
    expect(renderer.root.findAllByProps({accessibilityLabel: 'My profile QR code'})).toHaveLength(0);
  } finally {
    ReactTestRenderer.act(() => renderer.unmount());
  }
});

test('refreshes automatically and shows the no contacts empty state', async () => {
  const renderer = await renderScreen();

  expect(renderer.root.findAllByProps({children: 'Refreshing contact list'}).length).toBeGreaterThan(0);
  expect(Contacts.Contact.getAllDetails).toHaveBeenCalledTimes(1);

  await finishRefresh();

  expect(renderer.root.findAllByProps({children: 'No contacts found'}).length).toBeGreaterThan(0);
  expect(renderer.root.findByProps({accessibilityLabel: 'Add Contact'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'Invite Friends'})).toBeDefined();
});

test('virtualizes a large address book instead of mounting every contact row', async () => {
  jest.mocked(Contacts.Contact.getAllDetails).mockResolvedValue(Array.from({length: 120}, (_, index) => ({
    id: `contact-${index}`,
    fullName: `Person ${String(index).padStart(3, '0')}`,
    phones: [{number: `+91 90000 ${String(index).padStart(5, '0')}`}],
  })));

  const renderer = await renderScreen();
  await finishRefresh();

  const list = renderer.root.findByType(FlatList);
  expect(list.props.data.length).toBeGreaterThan(120);
  expect(list.props.initialNumToRender).toBe(18);
  expect(list.props.windowSize).toBe(7);
  expect(list.props.showsVerticalScrollIndicator).toBe(true);
  expect(list.props.persistentScrollbar).toBe(true);
  expect(renderer.root.findByProps({accessibilityLabel: 'Contact alphabetical index'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'Jump to contacts starting with P'}).props.accessibilityState.disabled).toBe(false);
});

async function renderIndexedContacts() {
  jest.mocked(Contacts.Contact.getAllDetails).mockResolvedValue(
    ['Zulu', 'bob', 'Asha', 'Álvaro', 'Éva', '123 Support', '中文'].map((fullName, index) => ({
      id: `indexed-${index}`, fullName, phones: [{number: `+91900000000${index}`}],
    })),
  );
  const renderer = await renderScreen();
  await finishRefresh();
  return renderer;
}

test('sorts contacts into matching A–Z sections and provides # navigation for other names', async () => {
  const renderer = await renderIndexedContacts();
  const rows = renderer.root.findByType(FlatList).props.data;
  expect(rows.filter((row: {kind: string}) => row.kind === 'header').map((row: {label: string}) => row.label))
    .toEqual(['A', 'B', 'E', 'Z', '#']);
  expect(rows.filter((row: {kind: string}) => row.kind === 'contact').map((row: {contact: {name: string}}) => row.contact.name))
    .toEqual(['Álvaro', 'Asha', 'bob', 'Éva', 'Zulu', '123 Support', '中文']);
  for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#') {
    const button = renderer.root.findByProps({accessibilityLabel: `Jump to contacts starting with ${letter}`});
    expect(button.props.disabled).toBe(!['A', 'B', 'E', 'Z', '#'].includes(letter));
  }
  await ReactTestRenderer.act(() => renderer.unmount());
});

test.each(['android', 'ios'] as const)('keeps a visible scroll thumb synchronized with the contact list on %s', async platform => {
  jest.replaceProperty(Platform, 'OS', platform);
  const renderer = await renderIndexedContacts();
  const list = () => renderer.root.findByType(FlatList);
  await ReactTestRenderer.act(() => {
    list().props.onLayout({nativeEvent: {layout: {height: 300}}});
    list().props.onContentSizeChange(307, 900);
  });
  const track = renderer.root.findByProps({testID: 'contact-list-scrollbar'});
  expect(track.props.pointerEvents).toBe('none');
  const trackStyle = StyleSheet.flatten(track.props.style);
  const contentStyle = StyleSheet.flatten(list().props.contentContainerStyle);
  expect(trackStyle.right + trackStyle.width).toBeLessThanOrEqual(contentStyle.paddingRight);
  const thumb = () => StyleSheet.flatten(renderer.root.findByProps({testID: 'contact-list-scroll-thumb'}).props.style);
  expect(thumb().height).toBe(100);
  for (const [offset, expectedPosition] of [[-20, 0], [300, 100], [600, 200], [900, 200]]) {
    await ReactTestRenderer.act(() => list().props.onScroll({nativeEvent: {contentOffset: {y: offset}}}));
    const translation = thumb().transform[0].translateY;
    expect(typeof translation === 'number' ? translation : translation.__getValue()).toBe(expectedPosition);
  }
  await ReactTestRenderer.act(() => list().props.onContentSizeChange(307, 200));
  expect(renderer.root.findAllByProps({testID: 'contact-list-scrollbar'})).toHaveLength(0);
  await ReactTestRenderer.act(() => renderer.unmount());
});

test('fits every index entry inside the existing rail on a short screen', async () => {
  const renderer = await renderIndexedContacts();
  await ReactTestRenderer.act(() => {
    renderer.root.findByProps({accessibilityLabel: 'Contact alphabetical index'}).props.onLayout({nativeEvent: {layout: {height: 216}}});
  });
  const letters = renderer.root.findByProps({accessibilityLabel: 'Contact alphabetical index'}).findAllByType(Text);
  expect(letters).toHaveLength(27);
  expect(letters.reduce((height, letter) => height + StyleSheet.flatten(letter.props.style).lineHeight, 0)).toBeLessThanOrEqual(216);
  expect(letters.every(letter => letter.props.allowFontScaling === false)).toBe(true);
  expect(letters.every(letter => StyleSheet.flatten(letter.props.style).includeFontPadding === false)).toBe(true);
  await ReactTestRenderer.act(() => renderer.unmount());
});

test('jumps to the selected section and retries an unmeasured target using measured row sizes', async () => {
  const scrollToIndex = jest.spyOn(FlatList.prototype, 'scrollToIndex').mockImplementation(() => undefined);
  const scrollToOffset = jest.spyOn(FlatList.prototype, 'scrollToOffset').mockImplementation(() => undefined);
  const renderer = await renderIndexedContacts();
  const list = renderer.root.findByType(FlatList);
  const index = list.props.data.findIndex((row: {kind: string; label: string}) => row.kind === 'header' && row.label === 'Z');
  await ReactTestRenderer.act(() => renderer.root.findByProps({accessibilityLabel: 'Jump to contacts starting with Z'}).props.onPress());
  expect(scrollToIndex).toHaveBeenLastCalledWith({animated: false, index, viewPosition: 0});
  await ReactTestRenderer.act(() => list.props.onScrollToIndexFailed({index, averageItemLength: 52, highestMeasuredFrameIndex: 2}));
  expect(scrollToOffset).toHaveBeenLastCalledWith({animated: false, offset: index * 52});
  await ReactTestRenderer.act(async () => { await jest.advanceTimersByTimeAsync(100); });
  expect(scrollToIndex).toHaveBeenCalledTimes(2);
  expect(scrollToIndex).toHaveBeenLastCalledWith({animated: false, index, viewPosition: 0});
  await ReactTestRenderer.act(() => renderer.root.findByProps({accessibilityLabel: 'Jump to contacts starting with Q'}).props.onPress());
  expect(scrollToIndex).toHaveBeenCalledTimes(2);
  await ReactTestRenderer.act(() => renderer.unmount());
});

test.each(['search', 'unmount'])('cancels a pending alphabetical jump on %s', async action => {
  const scrollToIndex = jest.spyOn(FlatList.prototype, 'scrollToIndex').mockImplementation(() => undefined);
  jest.spyOn(FlatList.prototype, 'scrollToOffset').mockImplementation(() => undefined);
  const renderer = await renderIndexedContacts();
  const list = renderer.root.findByType(FlatList);
  const index = list.props.data.findIndex((row: {label: string}) => row.label === 'Z');
  await ReactTestRenderer.act(() => renderer.root.findByProps({accessibilityLabel: 'Jump to contacts starting with Z'}).props.onPress());
  await ReactTestRenderer.act(() => list.props.onScrollToIndexFailed({index, averageItemLength: 52, highestMeasuredFrameIndex: 2}));
  await ReactTestRenderer.act(() => {
    if (action === 'search') {
      renderer.root.findByProps({accessibilityLabel: 'Search contacts'}).props.onChangeText('Asha');
    } else {
      renderer.unmount();
    }
  });
  await ReactTestRenderer.act(async () => { await jest.advanceTimersByTimeAsync(200); });
  expect(scrollToIndex).toHaveBeenCalledTimes(1);
  if (action === 'search') {
    expect(renderer.root.findByProps({accessibilityLabel: 'Jump to contacts starting with Z'}).props.disabled).toBe(true);
    await ReactTestRenderer.act(() => renderer.unmount());
  }
});

test('shows search feedback for an unmatched name and restores contacts when cleared', async () => {
  jest.mocked(Contacts.Contact.getAllDetails).mockResolvedValue([
    {id: 'contact-1', fullName: 'Asha Rao', phones: [{number: '+91 98765 43210'}]},
  ]);
  const renderer = await renderScreen();
  await finishRefresh();

  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Search contacts'}).props.onChangeText('Yug7uhuh');
  });
  expect(renderer.root.findAllByProps({children: 'No contacts found'}).length).toBeGreaterThan(0);
  expect(renderer.root.findAllByProps({children: 'Try a different name, phone number, or email.'}).length).toBeGreaterThan(0);
  expect(renderer.root.findAllByType(FlatList)).toHaveLength(0);

  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Search contacts'}).props.onChangeText(' asha ');
  });
  expect(renderer.root.findAllByProps({children: 'No contacts found'})).toHaveLength(0);
  expect(renderer.root.findByType(FlatList).props.data).toEqual(expect.arrayContaining([
    expect.objectContaining({contact: expect.objectContaining({name: 'Asha Rao'})}),
  ]));

  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Search contacts'}).props.onChangeText('');
  });
  expect(renderer.root.findAllByProps({children: 'Try a different name, phone number, or email.'})).toHaveLength(0);
  expect(renderer.root.findByType(FlatList).props.data.length).toBeGreaterThan(0);
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('shows refreshed contacts from the device list', async () => {
  jest.mocked(Contacts.Contact.getAllDetails).mockResolvedValue([
    {
      id: 'contact-1',
      fullName: 'Asha Rao',
      givenName: 'Asha',
      familyName: 'Rao',
      phones: [{number: '+91 98765 43210'}],
      emails: [{address: 'asha@example.com'}],
      thumbnail: null,
    },
  ]);

  const renderer = await renderScreen();
  await finishRefresh();

  expect(renderer.root.findAllByProps({children: 'Asha Rao'}).length).toBeGreaterThan(0);
  expect(syncContacts).toHaveBeenCalledWith(['+91 98765 43210']);
});

test.each(['android', 'ios'] as const)('finds a contact by a formatted or national phone number on %s', async platform => {
  const originalPlatform = Platform.OS;
  Object.defineProperty(Platform, 'OS', {configurable: true, value: platform});
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  try {
    jest.mocked(Contacts.Contact.getAllDetails).mockResolvedValue([
      {id: 'mobile-contact', fullName: 'Maya Rao', phones: [{number: '+91 (99769) 78393'}]},
      {id: 'local-contact', fullName: 'Asha Rao', phones: [{number: '98765-43210'}]},
    ]);
    renderer = await renderScreen();
    await finishRefresh();

    for (const [query, name] of [
      ['9976978393', 'Maya Rao'],
      ['+91 99769 78393', 'Maya Rao'],
      ['78393', 'Maya Rao'],
      ['+91 98765 43210', 'Asha Rao'],
    ]) {
      await ReactTestRenderer.act(async () => {
        renderer!.root.findByProps({accessibilityLabel: 'Search contacts'}).props.onChangeText(query);
      });
      const rows = renderer.root.findByType(FlatList).props.data.filter((row: {kind: string}) => row.kind === 'contact');
      expect(rows).toEqual([expect.objectContaining({contact: expect.objectContaining({name})})]);
      expect(renderer.root.findAllByProps({children: 'No contacts found'})).toHaveLength(0);
    }
    await ReactTestRenderer.act(async () => {
      renderer!.root.findByProps({accessibilityLabel: 'Search contacts'}).props.onChangeText('Unknown9976978393');
    });
    expect(renderer.root.findAllByProps({children: 'No contacts found'}).length).toBeGreaterThan(0);
  } finally {
    if (renderer) { await ReactTestRenderer.act(async () => renderer!.unmount()); }
    Object.defineProperty(Platform, 'OS', {configurable: true, value: originalPlatform});
  }
});

test('opens contact creation from empty state and saves back to the contacts list', async () => {
  const renderer = await renderScreen();
  await finishRefresh();

  const addContact = renderer.root.findByProps({accessibilityLabel: 'Add Contact'});
  await ReactTestRenderer.act(async () => addContact.props.onPress());

  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'First Name'}).props.onChangeText('Dheeraj');
    renderer.root.findByProps({accessibilityLabel: 'Last Name'}).props.onChangeText('S');
    renderer.root.findByProps({accessibilityLabel: 'Phone Number'}).props.onChangeText('8975642130');
    renderer.root.findByProps({accessibilityLabel: 'Email ID'}).props.onChangeText('dheeraj@gmail.com');
  });

  const save = renderer.root.findByProps({accessibilityLabel: 'Save'});
  expect(save.props.accessibilityState.disabled).toBe(false);

  await ReactTestRenderer.act(async () => {
    const pendingSave = save.props.onPress();
    await jest.advanceTimersByTimeAsync(800);
    await pendingSave;
  });

  expect(renderer.root.findAllByProps({children: 'Dheeraj S'}).length).toBeGreaterThan(0);
  expect(Contacts.Contact.create).not.toHaveBeenCalled();
  expect(syncContacts).toHaveBeenLastCalledWith(['+918975642130']);
});

test.each(['android', 'ios'] as const)('keeps an app-only contact and its number after opening a chat and returning on %s', async platform => {
  const originalPlatform = Platform.OS;
  Object.defineProperty(Platform, 'OS', {configurable: true, value: platform});
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  try {
    const onOpen = jest.fn();
    jest.mocked(syncContacts).mockResolvedValue({registered: [
      {_id: 'saved-user', name: 'Dheeraj S', phone: '+918975642130'},
    ]});
    jest.mocked(getChatList).mockResolvedValue([{
      _id: 'saved-chat', participants: [{user: 'saved-user'}],
    }]);
    renderer = await renderScreen(onOpen);
    await finishRefresh();
    await ReactTestRenderer.act(async () => renderer!.root.findByProps({accessibilityLabel: 'Add Contact'}).props.onPress());
    await ReactTestRenderer.act(async () => {
      renderer!.root.findByProps({accessibilityLabel: 'First Name'}).props.onChangeText('Dheeraj');
      renderer!.root.findByProps({accessibilityLabel: 'Last Name'}).props.onChangeText('S');
      renderer!.root.findByProps({accessibilityLabel: 'Phone Number'}).props.onChangeText('8975642130');
    });
    await ReactTestRenderer.act(async () => {
      const saving = renderer!.root.findByProps({accessibilityLabel: 'Save'}).props.onPress();
      await jest.advanceTimersByTimeAsync(800);
      await saving;
    });
    await ReactTestRenderer.act(async () => {
      renderer!.root.findAllByProps({accessibilityLabel: 'Chat with Dheeraj S'})[0].props.onPress();
    });
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({userId: 'saved-user', phone: '+918975642130'}), 'saved-chat');
    expect(Contacts.Contact.create).not.toHaveBeenCalled();
    await ReactTestRenderer.act(async () => renderer!.unmount());

    // App navigation unmounts Contacts. With phone sync off, the device book remains empty.
    jest.mocked(Contacts.getPermissionsAsync).mockResolvedValue({...grantedPermission, granted: false, canAskAgain: false});
    renderer = await renderScreen(onOpen);
    await finishRefresh();
    expect(renderer.root.findByType(FlatList).props.data).toEqual(expect.arrayContaining([
      expect.objectContaining({contact: expect.objectContaining({phone: '+918975642130', name: 'Dheeraj S'})}),
    ]));
    expect(renderer.root.findAllByProps({accessibilityLabel: 'Chat with Dheeraj S'}).length).toBeGreaterThan(0);
    await ReactTestRenderer.act(async () => renderer!.root.findByProps({accessibilityLabel: 'Search contacts'}).props.onChangeText('8975642130'));
    expect(renderer.root.findAllByProps({children: 'No contacts found'})).toHaveLength(0);
  } finally {
    if (renderer) { await ReactTestRenderer.act(async () => renderer!.unmount()); }
    Object.defineProperty(Platform, 'OS', {configurable: true, value: originalPlatform});
  }
});

test('shows contact actions and keeps Add Members disabled until a group name is entered', async () => {
  const renderer = await renderScreen();
  await finishRefresh();

  expect(renderer.root.findByProps({accessibilityLabel: 'New Contact'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'New Group'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'New Broadcast'})).toBeDefined();
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'New Group'}).props.onPress());

  const addMembers = renderer.root.findByProps({accessibilityLabel: 'Add Members'});
  expect(addMembers.props.accessibilityState.disabled).toBe(true);
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Group Name'}).props.onChangeText('Project Team'));
  expect(renderer.root.findByProps({accessibilityLabel: 'Add Members'}).props.accessibilityState.disabled).toBe(false);
  const description = renderer.root.findByProps({accessibilityLabel: 'Group Description'});
  expect(description.props.maxLength).toBe(256);
});

test('can open directly on the existing create-group flow from the inbox shortcut', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider initialMetrics={{frame: {x: 0, y: 0, width: 307, height: 641}, insets: {top: 24, right: 0, bottom: 18, left: 0}}}>
        <ContactsScreen initialMode="createGroup"/>
      </SafeAreaProvider>,
    );
    await Promise.resolve();
  });

  expect(renderer!.root.findByProps({accessibilityLabel: 'Group Name'})).toBeDefined();
  expect(renderer!.root.findByProps({accessibilityLabel: 'Add Members'})).toBeDefined();
});

test('creates a broadcast with contact search and multi-select from the wireframe flow', async () => {
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({canceled: false, assets: [{uri: 'file:///library/team-updates.png', fileName: 'team-updates.png', mimeType: 'image/png', width: 500, height: 500}]} as never);
  jest.mocked(Contacts.Contact.getAllDetails).mockResolvedValue([
    {id: 'rahul', fullName: 'Rahul', phones: [{number: '+91 90000 00001'}]},
  ]);
  jest.mocked(syncContacts).mockResolvedValue({registered: [
    {_id: 'user-rahul', name: 'Rahul', phone: '+919000000001'},
  ], unRegistered: []});
  jest.mocked(searchChatContacts).mockResolvedValue([
    {userId: 'user-priya', name: 'Priya', thumbnail: null},
  ]);
  jest.mocked(createBroadcast).mockResolvedValue({_id: 'broadcast-1', name: 'Team Updates', participants: []});
  const onCreated = jest.fn();
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider initialMetrics={{frame: {x: 0, y: 0, width: 307, height: 641}, insets: {top: 24, right: 0, bottom: 18, left: 0}}}>
        <ContactsScreen initialMode="createBroadcast" onBroadcastCreated={onCreated}/>
      </SafeAreaProvider>,
    );
    await Promise.resolve();
  });
  await finishRefresh();

  expect(renderer!.root.findAllByProps({children: 'Create Broadcast'}).length).toBeGreaterThan(0);
  await ReactTestRenderer.act(async () => renderer!.root.findByProps({accessibilityLabel: 'Add broadcast picture'}).props.onPress());
  await ReactTestRenderer.act(async () => renderer!.root.findByProps({accessibilityLabel: 'Gallery'}).props.onPress());
  await ReactTestRenderer.act(async () => renderer!.root.findByProps({accessibilityLabel: 'Use cropped broadcast picture'}).props.onPress());
  expect(renderer!.root.findByProps({accessibilityLabel: 'Add Broadcast Members'}).props.accessibilityState.disabled).toBe(true);
  await ReactTestRenderer.act(async () => renderer!.root.findByProps({accessibilityLabel: 'Broadcast Name'}).props.onChangeText('Team Updates'));
  await ReactTestRenderer.act(async () => renderer!.root.findByProps({accessibilityLabel: 'Add Broadcast Members'}).props.onPress());
  await ReactTestRenderer.act(async () => renderer!.root.findByProps({accessibilityLabel: 'Select Rahul'}).props.onPress());
  expect(renderer!.root.findByProps({accessibilityLabel: 'Create Broadcast'}).props.accessibilityState.disabled).toBe(true);
  await ReactTestRenderer.act(async () => renderer!.root.findByProps({accessibilityLabel: 'Search broadcast contacts'}).props.onChangeText('Priya'));
  await ReactTestRenderer.act(async () => { await jest.advanceTimersByTimeAsync(251); });
  await ReactTestRenderer.act(async () => renderer!.root.findByProps({accessibilityLabel: 'Select Priya'}).props.onPress());
  await ReactTestRenderer.act(async () => renderer!.root.findByProps({accessibilityLabel: 'Search broadcast contacts'}).props.onChangeText(''));
  expect(renderer!.root.findByProps({accessibilityLabel: 'Remove Priya'})).toBeDefined();
  expect(renderer!.root.findByProps({accessibilityLabel: 'Create Broadcast'}).props.accessibilityState.disabled).toBe(false);
  await ReactTestRenderer.act(async () => renderer!.root.findByProps({accessibilityLabel: 'Create Broadcast'}).props.onPress());

  expect(createBroadcast).toHaveBeenCalledWith('Team Updates', expect.arrayContaining(['user-rahul', 'user-priya']));
  expect(saveBroadcastImage).toHaveBeenCalledWith('broadcast-1', 'file:///library/team-updates.png');
  expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({_id: 'broadcast-1', imageUri: 'file:///library/team-updates.png', participants: expect.arrayContaining([expect.objectContaining({_id: 'user-rahul'}), expect.objectContaining({_id: 'user-priya'})])}));
});

test('selects and previews a broadcast picture from the photo library', async () => {
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({canceled: false, assets: [{uri: 'file:///library/broadcast.png', fileName: 'broadcast.png', mimeType: 'image/png', width: 500, height: 500}]} as never);
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider initialMetrics={{frame: {x: 0, y: 0, width: 307, height: 641}, insets: {top: 24, right: 0, bottom: 18, left: 0}}}>
        <ContactsScreen initialMode="createBroadcast"/>
      </SafeAreaProvider>,
    );
    await Promise.resolve();
  });
  expect(JSON.stringify(renderer!.toJSON())).toContain('M4 8h3l1.5-2h7L17 8h3v11H4V8Z');
  await ReactTestRenderer.act(async () => renderer!.root.findByProps({accessibilityLabel: 'Add broadcast picture'}).props.onPress());
  expect(renderer!.root.findByProps({accessibilityLabel: 'Broadcast Picture options'})).toBeDefined();
  await ReactTestRenderer.act(async () => renderer!.root.findByProps({accessibilityLabel: 'Gallery'}).props.onPress());

  expect(ImagePicker.requestMediaLibraryPermissionsAsync).toHaveBeenCalled();
  expect(renderer!.root.findByProps({accessibilityLabel: 'Crop broadcast picture'})).toBeDefined();
  expect(renderer!.root.findByProps({accessibilityLabel: 'Broadcast picture crop area'})).toBeDefined();
  const alert = jest.spyOn(Alert, 'alert');
  await ReactTestRenderer.act(async () => renderer!.root.findByProps({accessibilityLabel: 'Apply broadcast picture crop'}).props.onPress());
  expect(alert).toHaveBeenCalledWith('Crop complete', expect.stringContaining('cropped successfully'), [{text: 'OK'}]);
  await ReactTestRenderer.act(async () => renderer!.root.findByProps({accessibilityLabel: 'Use cropped broadcast picture'}).props.onPress());
  expect(renderer!.root.findByProps({accessibilityLabel: 'Add broadcast picture'}).findByType(Image).props.source).toEqual({uri: 'file:///cache/profile-normalized.jpg'});
  alert.mockRestore();
});

test('opens group picture options and accepts a picture from the camera', async () => {
  jest.mocked(ImagePicker.launchCameraAsync).mockResolvedValue({canceled: false, assets: [{uri: 'file:///group.jpg', width: 500, height: 500}]} as never);
  const renderer = await renderScreen();
  await finishRefresh();
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'New Group'}).props.onPress());
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Add group picture'}).props.onPress());
  expect(renderer.root.findByProps({accessibilityLabel: 'Group Picture options'})).toBeDefined();
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Camera'}).props.onPress());
  expect(ImagePicker.requestCameraPermissionsAsync).toHaveBeenCalled();
  expect(ImagePicker.launchCameraAsync).toHaveBeenCalled();
  expect(renderer.root.findByProps({accessibilityLabel: 'Add group picture'}).findByType(Image).props.source).toEqual({uri: 'file:///group.jpg'});
});

test('accepts a group picture from the photo library', async () => {
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({canceled: false, assets: [{uri: 'file:///library/group.png', fileName: 'group.png', mimeType: 'image/png', width: 500, height: 500}]} as never);
  const renderer = await renderScreen();
  await finishRefresh();
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'New Group'}).props.onPress());
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Add group picture'}).props.onPress());
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Gallery'}).props.onPress());

  expect(ImagePicker.requestMediaLibraryPermissionsAsync).toHaveBeenCalled();
  expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledWith(expect.objectContaining({allowsEditing: true, aspect: [1, 1]}));
  expect(renderer.root.findByProps({accessibilityLabel: 'Add group picture'}).findByType(Image).props.source).toEqual({uri: 'file:///library/group.png'});
});

test('selects multiple registered contacts and creates a group through the API', async () => {
  jest.mocked(Contacts.Contact.getAllDetails).mockResolvedValue([
    {id: 'rahul', fullName: 'Rahul', phones: [{number: '+91 90000 00001'}]},
    {id: 'priya', fullName: 'Priya', phones: [{number: '+91 90000 00002'}]},
  ]);
  jest.mocked(syncContacts).mockResolvedValue({registered: [
    {_id: 'user-rahul', name: 'Rahul', phone: '+919000000001'},
    {_id: 'user-priya', name: 'Priya', phone: '+919000000002'},
  ], unRegistered: []});
  const renderer = await renderScreen();
  await finishRefresh();
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'New Group'}).props.onPress());
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Group Name'}).props.onChangeText('Project Team'));
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Add Members'}).props.onPress());
  expect(renderer.root.findByProps({accessibilityLabel: 'Create Group'}).props.accessibilityState.disabled).toBe(true);
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Select Rahul'}).props.onPress());
  expect(renderer.root.findByProps({accessibilityLabel: 'Create Group'}).props.accessibilityState.disabled).toBe(true);
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Select Priya'}).props.onPress();
  });
  expect(renderer.root.findByProps({accessibilityLabel: 'Create Group'}).props.accessibilityState.disabled).toBe(false);
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Manage Roles'}).props.onPress());
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Role for Rahul'}).props.onPress());
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Set Rahul as Moderator'}).props.onPress());
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Manage Permissions'}).props.onPress());
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Send Messages permission'}).props.onPress());
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Assign Roles permission'}).props.onPress());
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Manage Reports permission'}).props.onPress());
  expect(renderer.root.findByProps({accessibilityLabel: 'Send Messages permission'}).props.accessibilityState.checked).toBe(false);
  expect(renderer.root.findByProps({accessibilityLabel: 'Manage Reports permission'}).props.accessibilityState.checked).toBe(true);
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Save Permissions'}).props.onPress());
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Save Changes'}).props.onPress());
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Create Group'}).props.onPress());

  expect(createGroup).toHaveBeenCalledWith(expect.objectContaining({groupName: 'Project Team', participantIds: expect.arrayContaining(['user-rahul', 'user-priya'])}));
  expect(searchGroups).toHaveBeenCalledWith('Project Team');
  expect(assignGroupModerator).toHaveBeenCalledWith('group-1', 'user-rahul');
  expect(updateGroupMessagePermissions).toHaveBeenCalledWith('group-1', {membersCanSendMessages: false, membersCanShareMedia: true});
  expect(updateGroupPermissions).toHaveBeenCalledWith('group-1', {
    member: {addMembers: false},
    moderator: {addMembers: false, assignRoles: true, pinMessages: true, editGroupInfo: false},
    admin: {approveJoinRequests: false},
  });
  expect(setGroupManageReportsPermission).toHaveBeenCalledWith('group-1', true);
  expect(enableGroupInviteLink).toHaveBeenCalledWith('group-1');
  expect(renderer.root.findAllByProps({children: 'Group created successfully.'}).length).toBeGreaterThan(0);
});

test('lists old direct chats and backend search results when adding group members', async () => {
  jest.mocked(getForwardDestinations).mockResolvedValue([
    {id: 'old-user', name: 'Old Chat User', kind: 'contact', subtitle: 'Older conversation'},
    {id: 'old-group', name: 'Old Group', kind: 'group'},
  ]);
  jest.mocked(searchChatContacts).mockResolvedValue([
    {userId: 'remote-user', name: 'Remote Search User', phone: '+919999999999'},
  ]);
  const renderer = await renderScreen();
  await finishRefresh();
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'New Group'}).props.onPress());
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Group Name'}).props.onChangeText('Project Team'));
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Add Members'}).props.onPress();
    await Promise.resolve();
  });
  expect(renderer.root.findByProps({accessibilityLabel: 'Select Old Chat User'})).toBeDefined();
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Select Old Group'})).toHaveLength(0);

  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Search group contacts'}).props.onChangeText('Remote'));
  await ReactTestRenderer.act(async () => jest.advanceTimersByTimeAsync(300));
  expect(searchChatContacts).toHaveBeenCalledWith('Remote');
  expect(renderer.root.findByProps({accessibilityLabel: 'Select Remote Search User'})).toBeDefined();
});

test('marks only validated contact fields as required', async () => {
  const renderer = await renderScreen();
  await finishRefresh();
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Add Contact'}).props.onPress());
  const labels = renderer.root.findAllByType(Text).filter(node => Array.isArray(node.props.children));
  for (const label of ['First Name ', 'Last Name ', 'Phone Number ']) {
    expect(labels.some(node => node.props.children[0] === label && node.props.children[1]?.props.children === '*')).toBe(true);
  }
  expect(labels.some(node => node.props.children[0] === 'Email ID ' && node.props.children[1]?.props.children === '*')).toBe(false);
});

test('sync toggle saves the contact to the phone contacts API before listing it', async () => {
  const renderer = await renderScreen();
  await finishRefresh();

  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Add Contact'}).props.onPress());
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'First Name'}).props.onChangeText('Nina');
    renderer.root.findByProps({accessibilityLabel: 'Last Name'}).props.onChangeText('Patel');
    renderer.root.findByProps({accessibilityLabel: 'Phone Number'}).props.onChangeText('9876500000');
    renderer.root.findByProps({accessibilityLabel: 'Email ID'}).props.onChangeText('nina@example.com');
    renderer.root.findByProps({accessibilityLabel: "Sync contact to your phone's contact"}).props.onPress();
  });

  await ReactTestRenderer.act(async () => {
    const pendingSave = renderer.root.findByProps({accessibilityLabel: 'Save'}).props.onPress();
    await jest.advanceTimersByTimeAsync(800);
    await pendingSave;
  });

  expect(Contacts.Contact.create).toHaveBeenCalledWith({
    givenName: 'Nina',
    familyName: 'Patel',
    phones: [{label: 'mobile', number: '+919876500000'}],
    emails: [{label: 'home', address: 'nina@example.com'}],
  });
  expect(renderer.root.findAllByProps({children: 'Nina Patel'}).length).toBeGreaterThan(0);
});

const DUPLICATE_NOTICE = 'This phone number is already in your contacts.';

async function openNewContact(renderer: ReactTestRenderer.ReactTestRenderer) {
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'New Contact'}).props.onPress());
}

async function fillNewContact(renderer: ReactTestRenderer.ReactTestRenderer, phone: string, name = 'Asha') {
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'First Name'}).props.onChangeText(name);
    renderer.root.findByProps({accessibilityLabel: 'Last Name'}).props.onChangeText('Again');
    renderer.root.findByProps({accessibilityLabel: 'Phone Number'}).props.onChangeText(phone);
  });
}

const saveButton = (renderer: ReactTestRenderer.ReactTestRenderer) => renderer.root.findByProps({accessibilityLabel: 'Save'});

test('refuses a number that is already in the address book, however it is typed', async () => {
  jest.mocked(Contacts.Contact.getAllDetails).mockResolvedValue([
    {id: 'contact-1', fullName: 'Asha Rao', phones: [{number: '+91 98765 43210'}, {number: '080 2345 6789'}]},
  ]);
  const renderer = await renderScreen();
  await finishRefresh();
  await openNewContact(renderer);

  // The country code and spacing differ from how the contact is stored.
  await fillNewContact(renderer, '98765 43210');
  expect(renderer.root.findAllByProps({children: DUPLICATE_NOTICE}).length).toBeGreaterThan(0);
  expect(saveButton(renderer).props.accessibilityState.disabled).toBe(true);

  // A contact's second number counts as well.
  await fillNewContact(renderer, '0802345 6789');
  expect(renderer.root.findAllByProps({children: DUPLICATE_NOTICE}).length).toBeGreaterThan(0);

  // Even a forced press saves nothing and writes nothing to the phone.
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: "Sync contact to your phone's contact"}).props.onPress();
  });
  await ReactTestRenderer.act(async () => {
    await saveButton(renderer).props.onPress();
  });
  expect(Contacts.Contact.create).not.toHaveBeenCalled();
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Phone Number'}).length).toBeGreaterThan(0);

  // A different number is fine again.
  await fillNewContact(renderer, '9000000001');
  expect(renderer.root.findAllByProps({children: DUPLICATE_NOTICE})).toHaveLength(0);
  expect(saveButton(renderer).props.accessibilityState.disabled).toBe(false);
});

test('a contact that was just added cannot be added a second time', async () => {
  const renderer = await renderScreen();
  await finishRefresh();
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Add Contact'}).props.onPress());
  await fillNewContact(renderer, '8975642130', 'Dheeraj');
  await ReactTestRenderer.act(async () => {
    const pendingSave = saveButton(renderer).props.onPress();
    await jest.advanceTimersByTimeAsync(800);
    await pendingSave;
  });
  expect(renderer.root.findAllByProps({children: 'Dheeraj Again'}).length).toBeGreaterThan(0);

  await openNewContact(renderer);
  await fillNewContact(renderer, '+91 89756 42130', 'Dheeraj');

  expect(renderer.root.findAllByProps({children: DUPLICATE_NOTICE}).length).toBeGreaterThan(0);
  expect(saveButton(renderer).props.accessibilityState.disabled).toBe(true);
  // Still on the form: nothing was saved.
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Phone Number'}).length).toBeGreaterThan(0);
});

test('a double tap on Save writes the contact to the phone only once', async () => {
  const renderer = await renderScreen();
  await finishRefresh();
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Add Contact'}).props.onPress());
  await fillNewContact(renderer, '9876500000', 'Nina');
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: "Sync contact to your phone's contact"}).props.onPress();
  });

  await ReactTestRenderer.act(async () => {
    const press = saveButton(renderer).props.onPress;
    const taps = [press(), press()];
    await jest.advanceTimersByTimeAsync(800);
    await Promise.all(taps);
  });

  expect(Contacts.Contact.create).toHaveBeenCalledTimes(1);
});

test('pressing the Contacts bottom nav refreshes the contacts page', async () => {
  const renderer = await renderScreen();
  await finishRefresh();

  const contactsTab = renderer.root.findByProps({accessibilityLabel: 'Contacts'});
  await ReactTestRenderer.act(async () => {
    contactsTab.props.onPress();
    await Promise.resolve();
  });
  await finishRefresh();

  expect(Contacts.Contact.getAllDetails).toHaveBeenCalledTimes(2);
});

test('opens an existing thread immediately when a registered contact is pressed', async () => {
  jest.mocked(Contacts.Contact.getAllDetails).mockResolvedValue([{
    id: 'contact-registered',
    fullName: 'Ananya',
    phones: [{number: '+91 98765 43210'}],
  }]);
  jest.mocked(syncContacts).mockResolvedValue({
    registered: [{_id: 'user-ananya', name: 'Ananya', phone: '+919876543210'}],
    unRegistered: [],
  });
  jest.mocked(getChatList).mockResolvedValue([{
    _id: 'chat-existing',
    type: 'chat',
    participants: [{user: 'current-user'}, {user: 'user-ananya'}],
  }]);
  const onOpen = jest.fn();
  const alert = jest.spyOn(Alert, 'alert');
  const renderer = await renderScreen(onOpen);
  await finishRefresh();

  await ReactTestRenderer.act(async () => {
    renderer.root.findAllByProps({accessibilityLabel: 'Chat with Ananya'})[0].props.onPress();
    await Promise.resolve();
  });

  expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({userId: 'user-ananya', name: 'Ananya'}), 'chat-existing');
  expect(startChat).not.toHaveBeenCalled();
  expect(alert).not.toHaveBeenCalled();
});

test('confirms, creates, and opens a new thread for a registered contact', async () => {
  jest.mocked(Contacts.Contact.getAllDetails).mockResolvedValue([{
    id: 'contact-new',
    fullName: 'Rahul Verma',
    phones: [{number: '+91 90000 00000'}],
  }]);
  jest.mocked(syncContacts).mockResolvedValue({
    registered: [{_id: 'user-rahul', name: 'Rahul Verma', phone: '+919000000000'}],
    unRegistered: [],
  });
  const onOpen = jest.fn();
  const alert = jest.spyOn(Alert, 'alert');
  const renderer = await renderScreen(onOpen);
  await finishRefresh();

  await ReactTestRenderer.act(async () => {
    renderer.root.findAllByProps({accessibilityLabel: 'Chat with Rahul Verma'})[0].props.onPress();
    await Promise.resolve();
  });

  expect(alert).toHaveBeenCalledWith(
    expect.stringMatching(/Start New Chat|Create Conversation\?/),
    expect.stringContaining('Rahul Verma?'),
    expect.any(Array),
    {cancelable: true},
  );
  const buttons = alert.mock.calls[0][2] || [];
  await ReactTestRenderer.act(async () => {
    buttons[1]?.onPress?.();
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(startChat).toHaveBeenCalledWith('user-rahul');
  expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({userId: 'user-rahul'}), 'new-chat');
});

test('opens the designed invite sheet for an unregistered contact and dismisses with Not Now', async () => {
  jest.mocked(Contacts.Contact.getAllDetails).mockResolvedValue([{
    id: 'contact-balashri',
    fullName: 'Balashri',
    phones: [{number: '+91 90000 11111'}],
  }]);
  const renderer = await renderScreen();
  await finishRefresh();

  await ReactTestRenderer.act(async () => {
    renderer.root.findAllByProps({accessibilityLabel: 'Invite Balashri'})[0].props.onPress();
  });

  expect(renderer.root.findByProps({accessibilityLabel: 'Invite to Chatterly'})).toBeDefined();
  expect(renderer.root.findAllByProps({children: 'Balashri'}).length).toBeGreaterThan(0);
  const usernameGraphic = renderer.root.findByProps({accessibilityLabel: 'Balashri username graphic'});
  expect(usernameGraphic.props).toEqual(expect.objectContaining({width: 59, height: 44, viewBox: '0 0 59 44'}));
  expect(usernameGraphic.findAll(node => typeof node.props.d === 'string' && node.props.d.startsWith('M9.376 24.704')).length).toBeGreaterThan(0);
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Invitation message design graphic'})).toHaveLength(0);
  const messageGraphic = renderer.root.findByProps({accessibilityLabel: 'Editable invitation message design graphic'});
  expect(messageGraphic.props).toEqual(expect.objectContaining({height: 100, width: '100%'}));
  expect(messageGraphic.props.xml).toContain('<svg width="361" height="100" viewBox="0 0 361 100"');
  expect(messageGraphic.props.xml).not.toContain('<path d="M14.184');
  const actionsGraphic = renderer.root.findByProps({accessibilityLabel: 'Invite actions design graphic'});
  expect(actionsGraphic.props).toEqual(expect.objectContaining({height: 128, width: '100%'}));
  expect(actionsGraphic.props.xml).toContain('<svg width="361" height="128" viewBox="0 0 361 128"');
  expect(renderer.root.findByProps({accessibilityLabel: 'Invitation message'}).props.value)
    .toBe(`${INVITATION_MESSAGE_DESIGN_TEXT}\n${APP_INVITE_LINK}`);

  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Not Now'}).props.onPress();
  });
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Invite to Chatterly'})).toHaveLength(0);
});

test.each(['android', 'ios'] as const)('opens the native %s SMS composer with the edited invitation message', async platform => {
  jest.replaceProperty(Platform, 'OS', platform);
  jest.mocked(Contacts.Contact.getAllDetails).mockResolvedValue([{
    id: 'contact-balashri',
    fullName: 'Balashri',
    phones: [{number: '+91 90000 11111'}],
  }]);
  const openUrl = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  const renderer = await renderScreen();
  await finishRefresh();

  await ReactTestRenderer.act(async () => {
    renderer.root.findAllByProps({accessibilityLabel: 'Invite Balashri'})[0].props.onPress();
  });
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Invitation message'}).props.onChangeText('Join me on Chatterly!');
  });
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Invitation message design graphic'})).toHaveLength(0);
  const editableMessageGraphic = renderer.root.findByProps({accessibilityLabel: 'Editable invitation message design graphic'});
  expect(editableMessageGraphic.props.xml).not.toContain('<path d="M14.184');
  expect(editableMessageGraphic.props.xml).toContain('<path d="M2.632');
  await ReactTestRenderer.act(async () => {
    await renderer.root.findByProps({accessibilityLabel: 'Send Invite via SMS'}).props.onPress();
  });

  const separator = Platform.OS === 'ios' ? '&' : '?';
  expect(openUrl).toHaveBeenCalledWith(`sms:+919000011111${separator}body=${encodeURIComponent('Join me on Chatterly!\nhttps://chatterly.app/download')}`);
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Invite to Chatterly'})).toHaveLength(0);
  expect(renderer.root.findAllByProps({children: 'SMS invite opened for Balashri.'}).length).toBeGreaterThan(0);
});

test.each(['android', 'ios'] as const)('includes the download link in the default %s SMS invitation', async platform => {
  jest.replaceProperty(Platform, 'OS', platform);
  jest.mocked(Contacts.Contact.getAllDetails).mockResolvedValue([{
    id: 'contact-balashri', fullName: 'Balashri', phones: [{number: '+91 90000 11111'}],
  }]);
  const openUrl = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  const renderer = await renderScreen();
  await finishRefresh();
  await ReactTestRenderer.act(async () => {
    renderer.root.findAllByProps({accessibilityLabel: 'Invite Balashri'})[0].props.onPress();
  });
  const originalText = renderer.root.findByProps({accessibilityLabel: 'Invitation message'}).props.value;
  expect(originalText).toContain(APP_INVITE_LINK);
  await ReactTestRenderer.act(async () => {
    await renderer.root.findByProps({accessibilityLabel: 'Send Invite via SMS'}).props.onPress();
  });
  expect(openUrl).toHaveBeenCalledWith(`sms:+919000011111${platform === 'ios' ? '&' : '?'}body=${encodeURIComponent(originalText)}`);
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('keeps an existing download link once in a customized invitation', async () => {
  jest.mocked(Contacts.Contact.getAllDetails).mockResolvedValue([{
    id: 'contact-balashri', fullName: 'Balashri', phones: [{number: '+91 90000 11111'}],
  }]);
  const openUrl = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  const renderer = await renderScreen();
  await finishRefresh();
  await ReactTestRenderer.act(async () => {
    renderer.root.findAllByProps({accessibilityLabel: 'Invite Balashri'})[0].props.onPress();
  });
  const message = 'Join me! https://chatterly.app/download';
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Invitation message'}).props.onChangeText(message);
  });
  await ReactTestRenderer.act(async () => {
    await renderer.root.findByProps({accessibilityLabel: 'Send Invite via SMS'}).props.onPress();
  });
  const separator = Platform.OS === 'ios' ? '&' : '?';
  expect(openUrl).toHaveBeenCalledWith(`sms:+919000011111${separator}body=${encodeURIComponent(message)}`);
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('includes the app download link when sharing Invite Friends', async () => {
  const share = jest.spyOn(Share, 'share').mockResolvedValue({action: Share.sharedAction});
  const renderer = await renderScreen();
  await finishRefresh();
  await ReactTestRenderer.act(async () => {
    await renderer.root.findByProps({accessibilityLabel: 'Invite Friends'}).props.onPress();
  });
  expect(share).toHaveBeenCalledWith({message: 'Join me on Chatterly so we can chat and call easily.\nhttps://chatterly.app/download'});
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test.each(['android', 'ios'] as const)('preserves Unicode and reserved characters together with the app link in %s SMS', async platform => {
  jest.replaceProperty(Platform, 'OS', platform);
  jest.mocked(Contacts.Contact.getAllDetails).mockResolvedValue([{
    id: 'contact-balashri', fullName: 'Balashri', phones: [{number: '+91 90000 11111'}],
  }]);
  const openUrl = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  const renderer = await renderScreen();
  await finishRefresh();
  await ReactTestRenderer.act(() => renderer.root.findAllByProps({accessibilityLabel: 'Invite Balashri'})[0].props.onPress());
  const message = 'Hi 👋!\nLet’s chat & call? #friends + family';
  await ReactTestRenderer.act(() => renderer.root.findByProps({accessibilityLabel: 'Invitation message'}).props.onChangeText(message));
  await ReactTestRenderer.act(async () => {
    await renderer.root.findByProps({accessibilityLabel: 'Send Invite via SMS'}).props.onPress();
  });
  const url = openUrl.mock.calls[0][0];
  expect(url.startsWith(`sms:+919000011111${platform === 'ios' ? '&' : '?'}body=`)).toBe(true);
  expect(decodeURIComponent(url.split('body=')[1])).toBe(`${message}\n${APP_INVITE_LINK}`);
  await ReactTestRenderer.act(() => renderer.unmount());
});

test('disables empty invitations and restores the complete default message when reopened', async () => {
  jest.mocked(Contacts.Contact.getAllDetails).mockResolvedValue([{
    id: 'contact-balashri', fullName: 'Balashri', phones: [{number: '+91 90000 11111'}],
  }]);
  const openUrl = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  const renderer = await renderScreen();
  await finishRefresh();
  await ReactTestRenderer.act(() => renderer.root.findAllByProps({accessibilityLabel: 'Invite Balashri'})[0].props.onPress());
  await ReactTestRenderer.act(() => renderer.root.findByProps({accessibilityLabel: 'Invitation message'}).props.onChangeText('   '));
  expect(renderer.root.findByProps({accessibilityLabel: 'Send Invite via SMS'}).props.disabled).toBe(true);
  await ReactTestRenderer.act(() => renderer.root.findByProps({accessibilityLabel: 'Not Now'}).props.onPress());
  expect(openUrl).not.toHaveBeenCalled();
  await ReactTestRenderer.act(() => renderer.root.findAllByProps({accessibilityLabel: 'Invite Balashri'})[0].props.onPress());
  expect(renderer.root.findByProps({accessibilityLabel: 'Invitation message'}).props.value)
    .toBe(`${INVITATION_MESSAGE_DESIGN_TEXT}\n${APP_INVITE_LINK}`);
  expect(renderer.root.findByProps({accessibilityLabel: 'Send Invite via SMS'}).props.disabled).toBe(false);
  await ReactTestRenderer.act(() => renderer.unmount());
});

test.each([0, 24, 48, 96])('keeps Contacts tabs and content above a %s-point system navigation area', async bottom => {
  const renderer = await renderScreen(undefined, bottom);
  await finishRefresh();
  const viewStyles = renderer.root.findAllByType(View).map(node => StyleSheet.flatten(node.props.style));
  const nav = viewStyles.find(style => style?.position === 'absolute' && style?.height === 91 + bottom);
  expect(nav).toMatchObject({bottom: 0, paddingBottom: bottom, paddingTop: 8});
  expect(nav!.height - nav!.paddingBottom).toBe(91);
  expect(viewStyles.some(style => style?.paddingTop === 42 && style?.paddingBottom === 90 + bottom)).toBe(true);
  await ReactTestRenderer.act(async () => renderer.unmount());
});
