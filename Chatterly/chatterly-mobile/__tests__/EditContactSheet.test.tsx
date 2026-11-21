import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {EditContactSheet} from '../src/components/EditContactSheet';
import {getContactAlias} from '../src/services/contactAliases';

jest.mock('../src/services/sessionStore', () => ({getSession: () => ({token: 'jwt', user: {id: 'me'}})}));

jest.mock('expo-contacts', () => {
  const patch = jest.fn(async () => undefined);
  const addEmail = jest.fn(async () => 'email-1');
  class Contact {
    id: string;
    constructor(id: string) { this.id = id; }
    patch = patch;
    addEmail = addEmail;
    static getAllDetails = jest.fn(async () => []);
    static create = jest.fn(async () => ({id: 'created-contact'}));
  }
  return {
    Contact,
    ContactField: {GIVEN_NAME: 'givenName', FAMILY_NAME: 'familyName', PHONES: 'phones', EMAILS: 'emails'},
    getPermissionsAsync: jest.fn(async () => ({granted: true})),
    requestPermissionsAsync: jest.fn(async () => ({granted: true})),
    __patch: patch,
    __addEmail: addEmail,
  };
});

const Contacts = require('expo-contacts');
const metrics = {frame: {x: 0, y: 0, width: 393, height: 852}, insets: {top: 24, right: 0, bottom: 24, left: 0}};

async function renderSheet(onSaved = jest.fn()) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<SafeAreaProvider initialMetrics={metrics}>
      <EditContactSheet name="Rahul Verma" onClose={jest.fn()} onSaved={onSaved} phone="+919876543210" userId="user-rahul" visible />
    </SafeAreaProvider>);
    await Promise.resolve();
  });
  return renderer;
}

const press = async (renderer: ReactTestRenderer.ReactTestRenderer, label: string) => {
  await ReactTestRenderer.act(async () => { await renderer.root.findByProps({accessibilityLabel: label}).props.onPress(); });
};

beforeEach(() => {
  jest.clearAllMocks();
  Contacts.Contact.getAllDetails.mockResolvedValue([]);
});

test('shows the Chatterly number read-only and requires a first name', async () => {
  const renderer = await renderSheet();
  expect(renderer.root.findByProps({accessibilityLabel: 'Phone number +91 98765 43210'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'First Name'}).props.value).toBe('Rahul');
  expect(renderer.root.findByProps({accessibilityLabel: 'Last Name'}).props.value).toBe('Verma');

  await ReactTestRenderer.act(async () => { renderer.root.findByProps({accessibilityLabel: 'First Name'}).props.onChangeText(''); });
  expect(renderer.root.findByProps({accessibilityLabel: 'Save contact'}).props.accessibilityState.disabled).toBe(true);
  ReactTestRenderer.act(() => renderer.unmount());
});

test('updates the address-book entry that already has this number', async () => {
  Contacts.Contact.getAllDetails.mockResolvedValue([
    {id: 'other', givenName: 'Someone', phones: [{number: '+91 90000 00000'}]},
    {id: 'device-7', givenName: 'Rahul', familyName: 'V', phones: [{number: '098765 43210'}], emails: []},
  ]);
  const onSaved = jest.fn();
  const renderer = await renderSheet(onSaved);
  expect(renderer.root.findByProps({accessibilityLabel: 'Last Name'}).props.value).toBe('V');

  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Last Name'}).props.onChangeText('Verma');
    renderer.root.findByProps({accessibilityLabel: 'Email ID'}).props.onChangeText('rahul@example.com');
  });
  await press(renderer, 'Save contact');

  expect(Contacts.__patch).toHaveBeenCalledWith({givenName: 'Rahul', familyName: 'Verma'});
  expect(Contacts.__addEmail).toHaveBeenCalledWith({label: 'other', address: 'rahul@example.com'});
  expect(Contacts.Contact.create).not.toHaveBeenCalled();
  expect(getContactAlias('user-rahul')).toBe('Rahul Verma');
  expect(onSaved).toHaveBeenCalledWith('Contact saved and in your phone contacts.');
  ReactTestRenderer.act(() => renderer.unmount());
});

test('adds the contact to the phone when no entry has this number', async () => {
  const onSaved = jest.fn();
  const renderer = await renderSheet(onSaved);
  await ReactTestRenderer.act(async () => { renderer.root.findByProps({accessibilityLabel: 'First Name'}).props.onChangeText('Rahul (Work)'); });
  await press(renderer, 'Save contact');

  expect(Contacts.Contact.create).toHaveBeenCalledWith(expect.objectContaining({
    givenName: 'Rahul (Work)',
    phones: [{label: 'mobile', number: '+919876543210'}],
  }));
  expect(getContactAlias('user-rahul')).toBe('Rahul (Work) Verma');
  expect(onSaved).toHaveBeenCalledWith('Contact saved and added to your phone contacts.');
  ReactTestRenderer.act(() => renderer.unmount());
});

test('with phone sync off only the name in Chatterly changes', async () => {
  const onSaved = jest.fn();
  const renderer = await renderSheet(onSaved);
  await press(renderer, "Sync contact to your phone's contact");
  await ReactTestRenderer.act(async () => { renderer.root.findByProps({accessibilityLabel: 'First Name'}).props.onChangeText('Ravi'); });
  await press(renderer, 'Save contact');

  expect(Contacts.Contact.create).not.toHaveBeenCalled();
  expect(Contacts.__patch).not.toHaveBeenCalled();
  expect(getContactAlias('user-rahul')).toBe('Ravi Verma');
  expect(onSaved).toHaveBeenCalledWith('Contact saved.');
  ReactTestRenderer.act(() => renderer.unmount());
});
