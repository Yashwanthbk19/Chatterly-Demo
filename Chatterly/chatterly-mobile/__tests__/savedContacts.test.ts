import AsyncStorage from '@react-native-async-storage/async-storage';
import {getSession} from '../src/services/sessionStore';
import {loadSavedContacts, saveLocalContact} from '../src/services/savedContacts';

jest.mock('../src/services/sessionStore', () => ({getSession: jest.fn()}));

const contact = {id: 'local-1', fullName: 'Nina Rao', phones: [{number: '+919876543210'}]};

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.mocked(getSession).mockReturnValue({user: {id: 'account-1'}} as ReturnType<typeof getSession>);
});

test('persists app-only contacts and updates a record without duplicating it', async () => {
  await saveLocalContact(contact);
  await saveLocalContact({...contact, fullName: 'Nina R'});
  expect(await loadSavedContacts()).toEqual([{...contact, fullName: 'Nina R'}]);
});

test('keeps saved contacts separate for each signed-in account', async () => {
  await saveLocalContact(contact);
  jest.mocked(getSession).mockReturnValue({user: {id: 'account-2'}} as ReturnType<typeof getSession>);
  expect(await loadSavedContacts()).toEqual([]);
  await saveLocalContact({...contact, id: 'other-contact'});
  jest.mocked(getSession).mockReturnValue({user: {id: 'account-1'}} as ReturnType<typeof getSession>);
  expect(await loadSavedContacts()).toEqual([contact]);
});

test('ignores malformed persisted entries', async () => {
  await AsyncStorage.setItem('chatterly.saved-contacts.v1:account-1', JSON.stringify([null, {id: 'broken'}, contact]));
  expect(await loadSavedContacts()).toEqual([contact]);
});

test('reports a failed storage write instead of treating the contact as saved', async () => {
  jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error('Storage full'));
  await expect(saveLocalContact(contact)).rejects.toThrow('Storage full');
});
