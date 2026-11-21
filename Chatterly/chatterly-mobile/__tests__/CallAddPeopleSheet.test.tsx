import * as Contacts from 'expo-contacts';
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {Text} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {CallAddPeopleSheet} from '../src/components/CallAddPeopleSheet';
import {addCallParticipantOverSocket} from '../src/services/chatRealtime';
import {syncContacts} from '../src/services/contactsApi';

jest.mock('../src/services/contactsApi', () => ({
  syncContacts: jest.fn(),
}));

jest.mock('../src/services/chatRealtime', () => ({
  addCallParticipantOverSocket: jest.fn(),
}));

const metrics = {frame: {x: 0, y: 0, width: 393, height: 852}, insets: {top: 24, right: 0, bottom: 20, left: 0}};

const grantedPermission = {
  status: Contacts.PermissionStatus.GRANTED,
  granted: true,
  canAskAgain: true,
  expires: 'never' as const,
};

const deniedPermission = {...grantedPermission, status: Contacts.PermissionStatus.DENIED, granted: false};

const addressBook = [
  {id: 'c1', fullName: 'Anna Raj', phones: [{number: '+91 98765 43210'}]},
  {id: 'c2', fullName: 'Bala Kumar', phones: [{number: '98765-43211'}]},
  {id: 'c3', fullName: 'Chitra Nair', phones: [{number: '98765 43212'}]},
  {id: 'c4', fullName: 'Dev Caller', phones: [{number: '+91 98765 43213'}]},
];

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(Contacts.getPermissionsAsync).mockResolvedValue(grantedPermission);
  jest.mocked(Contacts.requestPermissionsAsync).mockResolvedValue(grantedPermission);
  jest.mocked(Contacts.Contact.getAllDetails).mockResolvedValue(addressBook as never);
  // Chitra is in the address book but has no Chatterly account.
  jest.mocked(syncContacts).mockResolvedValue({
    registered: [
      {_id: 'user-anna', name: 'Anna', phone: '9876543210'},
      {_id: 'user-bala', name: 'Bala', phone: '9876543211'},
      {_id: 'user-dev', name: 'Dev', phone: '9876543213'},
    ],
    unRegistered: ['9876543212'],
  });
  jest.mocked(addCallParticipantOverSocket).mockResolvedValue({success: true, message: 'Conference invitation sent', callId: 'call-1', chatId: 'chat-1'});
});

async function settle() {
  await ReactTestRenderer.act(async () => {
    for (let tick = 0; tick < 25; tick += 1) { await Promise.resolve(); }
  });
}

async function renderSheet() {
  const onClose = jest.fn();
  const onAdded = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<SafeAreaProvider initialMetrics={metrics}>
      <CallAddPeopleSheet callId="call-1" excludeUserIds={['user-me', 'user-dev']} onAdded={onAdded} onClose={onClose} visible/>
    </SafeAreaProvider>);
  });
  await settle();
  return {renderer, onAdded, onClose};
}

const find = (renderer: ReactTestRenderer.ReactTestRenderer, label: string) =>
  renderer.root.findAllByProps({accessibilityLabel: label}).filter(node => typeof node.props.onPress === 'function' || typeof node.props.onChangeText === 'function');
const shows = (renderer: ReactTestRenderer.ReactTestRenderer, label: string) =>
  renderer.root.findAllByProps({accessibilityLabel: label}).length > 0;
// An open Modal's tree is circular, so it cannot go through JSON.stringify.
const words = (renderer: ReactTestRenderer.ReactTestRenderer) =>
  renderer.root.findAllByType(Text).map(node => [node.props.children].flat(Infinity).filter(part => typeof part === 'string').join('')).join(' | ');

async function press(renderer: ReactTestRenderer.ReactTestRenderer, label: string) {
  const target = find(renderer, label)[0];
  expect(target).toBeDefined();
  await ReactTestRenderer.act(async () => { target.props.onPress(); });
  await settle();
}

test('offers the contacts who can be rung: registered, and not already on the call', async () => {
  const {renderer} = await renderSheet();

  expect(shows(renderer, 'Select Anna Raj')).toBe(true);
  expect(shows(renderer, 'Select Bala Kumar')).toBe(true);
  // No Chatterly account, so there is nobody to invite.
  expect(shows(renderer, 'Select Chitra Nair')).toBe(false);
  // Already in the call (the person who rang).
  expect(shows(renderer, 'Select Dev Caller')).toBe(false);
});

test('invites everyone picked into the call, then reports it and closes', async () => {
  const {renderer, onAdded, onClose} = await renderSheet();

  await press(renderer, 'Select Anna Raj');
  await press(renderer, 'Select Bala Kumar');
  expect(shows(renderer, 'Deselect Anna Raj')).toBe(true);
  await press(renderer, 'Add to Call');

  expect(addCallParticipantOverSocket).toHaveBeenCalledTimes(2);
  expect(addCallParticipantOverSocket).toHaveBeenCalledWith('call-1', 'user-anna');
  expect(addCallParticipantOverSocket).toHaveBeenCalledWith('call-1', 'user-bala');
  expect(onAdded).toHaveBeenCalledWith(2);
  expect(onClose).toHaveBeenCalledTimes(1);
});

test('a person can be un-picked before inviting', async () => {
  const {renderer, onAdded} = await renderSheet();

  await press(renderer, 'Select Anna Raj');
  await press(renderer, 'Select Bala Kumar');
  await press(renderer, 'Deselect Anna Raj');
  await press(renderer, 'Add to Call');

  expect(addCallParticipantOverSocket).toHaveBeenCalledTimes(1);
  expect(addCallParticipantOverSocket).toHaveBeenCalledWith('call-1', 'user-bala');
  expect(onAdded).toHaveBeenCalledWith(1);
});

test('does nothing until someone is picked', async () => {
  const {renderer, onAdded, onClose} = await renderSheet();

  expect(find(renderer, 'Add to Call')[0].props.disabled).toBe(true);
  await press(renderer, 'Add to Call');

  expect(addCallParticipantOverSocket).not.toHaveBeenCalled();
  expect(onAdded).not.toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();
});

test('stays open and says why when the server refuses the invitation', async () => {
  jest.mocked(addCallParticipantOverSocket).mockResolvedValue({success: false, message: 'The call has already ended.', callId: 'call-1', chatId: 'chat-1'});
  const {renderer, onAdded, onClose} = await renderSheet();

  await press(renderer, 'Select Anna Raj');
  await press(renderer, 'Add to Call');

  expect(words(renderer)).toContain('The call has already ended.');
  expect(onAdded).not.toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();
});

test('the search box narrows the list by name', async () => {
  const {renderer} = await renderSheet();

  await ReactTestRenderer.act(async () => { find(renderer, 'Search people')[0].props.onChangeText('bal'); });

  expect(shows(renderer, 'Select Bala Kumar')).toBe(true);
  expect(shows(renderer, 'Select Anna Raj')).toBe(false);
});

test('says so, and reads nothing, when contact access is refused', async () => {
  jest.mocked(Contacts.getPermissionsAsync).mockResolvedValue(deniedPermission);
  jest.mocked(Contacts.requestPermissionsAsync).mockResolvedValue(deniedPermission);
  const {renderer} = await renderSheet();

  expect(words(renderer)).toContain('Contact access is required to add people to a call.');
  expect(syncContacts).not.toHaveBeenCalled();
});

test('does not read the address book while it is closed', async () => {
  await ReactTestRenderer.act(async () => {
    ReactTestRenderer.create(<SafeAreaProvider initialMetrics={metrics}>
      <CallAddPeopleSheet callId="call-1" excludeUserIds={[]} onAdded={jest.fn()} onClose={jest.fn()} visible={false}/>
    </SafeAreaProvider>);
  });
  await settle();

  expect(Contacts.getPermissionsAsync).not.toHaveBeenCalled();
  expect(Contacts.Contact.getAllDetails).not.toHaveBeenCalled();
});
