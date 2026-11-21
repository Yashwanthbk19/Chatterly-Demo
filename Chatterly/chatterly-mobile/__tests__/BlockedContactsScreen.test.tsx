import React from 'react';
import { Text } from 'react-native';
import Renderer, { act } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BlockedContactsScreen, uniqueContacts } from '../src/screens/BlockedContactsScreen';
import { BlockConfirmation } from '../src/components/BlockConfirmation';
import {
  blockChatUser,
  getChatList,
  getChatProfile,
  normalizeChatList,
} from '../src/services/chatApi';
import { getBlockedUsers, unblockUser } from '../src/services/privacyApi';
import { getToken } from '../src/services/sessionStore';
jest.mock('../src/services/chatApi', () => ({
  getChatList: jest.fn(),
  getChatProfile: jest.fn(),
  normalizeChatList: jest.fn(),
  blockChatUser: jest.fn(),
}));
jest.mock('../src/services/privacyApi', () => ({
  getBlockedUsers: jest.fn(),
  unblockUser: jest.fn(),
}));
jest.mock('../src/services/sessionStore', () => ({
  getToken: jest.fn(),
  getSession: () => ({ user: { id: 'me' } }),
}));
jest.mock('../src/services/contactsApi', () => ({
  syncContacts: jest.fn().mockResolvedValue({ registered: [] }),
}));
let instance: Renderer.ReactTestRenderer;
let token = 0;
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getToken).mockReturnValue(`ui-${++token}`);
  jest.mocked(getBlockedUsers).mockResolvedValue([]);
  jest.mocked(getChatList).mockResolvedValue([]);
  jest.mocked(getChatProfile).mockRejectedValue(new Error('Profile unavailable'));
  jest
    .mocked(normalizeChatList)
    .mockReturnValue(
      ['John', 'Jane'].map(name => ({
        id: name,
        contact: { userId: name, name },
        lastMessage: '',
        lastMessageAt: '',
        unreadCount: 0,
        markedUnread: false,
        archived: false,
        lastMessageIsOwn: false,
        lastMessageStatus: '',
        lastMessageId: '',
      })),
    );
});
afterEach(async () => {
  await act(async () => instance?.unmount());
});
async function mount(onBack: () => void = jest.fn()) {
  await act(async () => {
    instance = Renderer.create(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 393, height: 852 },
          insets: { top: 24, left: 0, right: 0, bottom: 20 },
        }}
      >
        <BlockedContactsScreen onBack={onBack} onCountChange={jest.fn()} />
      </SafeAreaProvider>,
    );
  });
}
async function press(label: string) {
  await act(async () => {
    instance.root
      .findAll(
        node =>
          node.props.accessibilityLabel === label &&
          typeof node.props.onPress === 'function',
      )[0]
      .props.onPress();
  });
}
async function add() {
  await act(async () => {
    instance.root
      .findAll(
        node =>
          typeof node.props.onPress === 'function' &&
          node.props.accessibilityRole === 'button',
      )
      .find(
        node =>
          node.findAll(child => child.props.children === 'Add Blocked Contact')
            .length,
      )
      ?.props.onPress();
  });
}

it('collapses repeated contact identities before showing Add Blocked Contacts', () => {
  const contacts = uniqueContacts([
    {id: ' User-1 ', name: 'Chatterly user'},
    {id: 'user-1', name: 'Jane', phone: '+91 98765 43210'},
    {id: 'another-record', name: 'Jane', phone: '+91-98765-43210'},
    {id: {_id: 'USER-1'} as never, name: 'Jane duplicate'},
  ]);

  expect(contacts).toHaveLength(1);
  expect(contacts[0]).toMatchObject({id: 'User-1', name: 'Jane', phone: '+91 98765 43210'});
});

it('resolves real registered names and shows each chat contact once', async () => {
  jest.mocked(normalizeChatList).mockReturnValue(
    ['user-1', 'user-1', 'user-2'].map((userId, index) => ({
      id: `chat-${index}`,
      contact: {userId, name: 'Chatterly user'},
      lastMessage: '',
      lastMessageAt: '',
      unreadCount: 0,
      markedUnread: false,
      archived: false,
      lastMessageIsOwn: false,
      lastMessageStatus: '',
      lastMessageId: '',
    })),
  );
  jest.mocked(getChatProfile).mockImplementation(async userId => ({
    userId,
    name: userId === 'user-1' ? 'Asha Rao' : 'Vikram Shah',
    profilePic: null,
    status: 'Offline',
    lastSeen: null,
    online: false,
  }));

  await mount();
  await add();

  expect(labelled('Select Asha Rao').filter(node => typeof node.type === 'string')).toHaveLength(1);
  expect(labelled('Select Vikram Shah').filter(node => typeof node.type === 'string')).toHaveLength(1);
  expect(words()).not.toContain('Chatterly user');
  expect(getChatProfile).toHaveBeenCalledTimes(2);
});

it('supports multi-select, cancellation, blocking, and unblocking from the list', async () => {
  await mount();
  await add();
  await press('Select John');
  await press('Select Jane');
  await act(async () => {
    instance.root
      .findAll(
        node =>
          node.props.accessibilityRole === 'button' &&
          typeof node.props.onPress === 'function',
      )
      .find(
        node =>
          node.findAll(
            child => child.props.children === 'Block Selected Contact',
          ).length,
      )
      ?.props.onPress();
  });
  await act(async () =>
    instance.root.findByType(BlockConfirmation).props.onCancel(),
  );
  expect(blockChatUser).not.toHaveBeenCalled();
  await act(async () => {
    instance.root
      .findAll(
        node =>
          node.props.accessibilityRole === 'button' &&
          typeof node.props.onPress === 'function',
      )
      .find(
        node =>
          node.findAll(
            child => child.props.children === 'Block Selected Contact',
          ).length,
      )
      ?.props.onPress();
  });
  await act(async () =>
    instance.root.findByType(BlockConfirmation).props.onConfirm(),
  );
  expect(blockChatUser).toHaveBeenCalledTimes(2);
  await press('Unblock John');
  await act(async () =>
    instance.root.findByType(BlockConfirmation).props.onConfirm(),
  );
  expect(unblockUser).toHaveBeenCalledWith('John');
  expect(
    instance.root.findAll(
      node => node.props.accessibilityLabel === 'Unblock Jane',
    ).length,
  ).toBeGreaterThan(0);
  expect(
    instance.root.findAll(
      node => node.props.accessibilityLabel === 'Unblock John',
    ).length,
  ).toBe(0);
});

// Unblocking was one contact at a time: tap, confirm, repeat.
const blockedThree = [
  { id: 'John', name: 'John' },
  { id: 'Jane', name: 'Jane' },
  { id: 'Jim', name: 'Jim' },
];
const labelled = (label: string) =>
  instance.root.findAll(node => node.props.accessibilityLabel === label);
const words = () =>
  instance.root
    .findAllByType(Text)
    .map(node =>
      [node.props.children]
        .flat(Infinity)
        .filter(part => typeof part === 'string' || typeof part === 'number')
        .join(''),
    )
    .join(' | ');
const footerButton = (text: string) =>
  instance.root
    .findAll(
      node =>
        node.props.accessibilityRole === 'button' &&
        typeof node.props.onPress === 'function',
    )
    .find(node => node.findAll(child => child.props.children === text).length);
const confirmDialog = () =>
  act(async () => instance.root.findByType(BlockConfirmation).props.onConfirm());

it('picks several blocked contacts and unblocks them together', async () => {
  jest.mocked(getBlockedUsers).mockResolvedValue(blockedThree);
  await mount();
  expect(labelled('Select John')).toHaveLength(0);

  await press('Select blocked contacts');
  expect(footerButton('Unblock Selected Contacts')?.props.disabled).toBe(true);
  await press('Select John');
  await press('Select Jane');
  expect(words()).toContain('2 Selected');
  expect(footerButton('Unblock Selected Contacts')?.props.disabled).toBe(false);
  await act(async () => footerButton('Unblock Selected Contacts')?.props.onPress());
  expect(instance.root.findByType(BlockConfirmation).props.visible).toBe(true);
  expect(instance.root.findByType(BlockConfirmation).props.name).toBeUndefined();
  await confirmDialog();

  expect(unblockUser).toHaveBeenCalledTimes(2);
  expect(unblockUser).toHaveBeenCalledWith('John');
  expect(unblockUser).toHaveBeenCalledWith('Jane');
  expect(words()).toContain('2 contacts unblocked successfully.');
  // Back to the plain list, with the one nobody picked still blocked.
  expect(labelled('Select Jim')).toHaveLength(0);
  expect(labelled('Unblock Jim').length).toBeGreaterThan(0);
});

it('a long press starts the selection with that contact already picked', async () => {
  jest.mocked(getBlockedUsers).mockResolvedValue(blockedThree);
  await mount();

  await act(async () => {
    labelled('Unblock Jane').find(node => typeof node.props.onLongPress === 'function')?.props.onLongPress();
  });

  expect(words()).toContain('1 Selected');
  expect(labelled('Select Jane')[0].props.accessibilityState).toEqual({ checked: true });
  expect(labelled('Select John')[0].props.accessibilityState).toEqual({ checked: false });
  expect(instance.root.findByType(BlockConfirmation).props.visible).toBe(false);
});

it('says which contacts could not be unblocked and keeps them picked for a retry', async () => {
  jest.mocked(getBlockedUsers).mockResolvedValue(blockedThree);
  jest.mocked(unblockUser).mockImplementation(async id => {
    if (id === 'Jane') throw new Error('Server error');
    return 'User unblocked successfully.';
  });
  await mount();
  await press('Select blocked contacts');
  await press('Select John');
  await press('Select Jane');
  await act(async () => footerButton('Unblock Selected Contacts')?.props.onPress());
  await confirmDialog();

  const dialog = instance.root.findByType(BlockConfirmation);
  expect(dialog.props.visible).toBe(true);
  expect(dialog.props.error).toBe('1 unblocked successfully. Unable to unblock 1 contact. Please try again.');
  expect(dialog.props.name).toBe('Jane');
  expect(labelled('Select John')).toHaveLength(0);
  expect(labelled('Select Jane')[0].props.accessibilityState).toEqual({ checked: true });
});

it('Back leaves the selection first and only then the screen', async () => {
  jest.mocked(getBlockedUsers).mockResolvedValue(blockedThree);
  const onBack = jest.fn();
  await mount(onBack);
  await press('Select blocked contacts');

  await press('Back');
  expect(onBack).not.toHaveBeenCalled();
  expect(labelled('Unblock John').length).toBeGreaterThan(0);

  await press('Back');
  expect(onBack).toHaveBeenCalledTimes(1);
});

it('offers no selection when nobody is blocked', async () => {
  await mount();

  expect(labelled('Select blocked contacts')).toHaveLength(0);
  expect(words()).toContain('No blocked contacts yet');
});
