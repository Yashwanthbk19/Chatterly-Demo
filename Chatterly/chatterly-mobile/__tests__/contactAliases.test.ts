import AsyncStorage from '@react-native-async-storage/async-storage';
import {getContactAlias, loadContactAliases, setContactAlias} from '../src/services/contactAliases';

jest.mock('../src/services/sessionStore', () => ({getSession: () => ({token: 'jwt', user: {id: 'me'}})}));

test('a name saved with Edit Contact is kept per account and survives a reload', async () => {
  await loadContactAliases();
  await setContactAlias('user-42', '  Mom  ');
  expect(getContactAlias('user-42')).toBe('Mom');
  expect(JSON.parse(String(await AsyncStorage.getItem('chatterly.contact-names.v1:me')))).toEqual({'user-42': 'Mom'});

  // Clearing the name forgets it, so the account's own name shows again.
  await setContactAlias('user-42', '');
  expect(getContactAlias('user-42')).toBe('');
});
