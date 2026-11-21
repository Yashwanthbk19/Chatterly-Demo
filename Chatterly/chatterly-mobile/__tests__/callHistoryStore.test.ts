import AsyncStorage from '@react-native-async-storage/async-storage';
import {hideCallIds, loadHiddenCallIds} from '../src/services/callHistoryStore';

jest.mock('../src/services/sessionStore', () => ({getSession: () => ({user: {id: 'me'}})}));

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
});

test('persists deleted call ids without losing earlier deletions', async () => {
  await hideCallIds(['call-1', 'call-2']);
  await hideCallIds(['call-3', 'call-1']);

  expect(await loadHiddenCallIds()).toEqual(new Set(['call-1', 'call-2', 'call-3']));
  expect(AsyncStorage.setItem).toHaveBeenLastCalledWith(
    'chatterly.hidden-call-history.v1:me',
    JSON.stringify(['call-1', 'call-2', 'call-3']),
  );
});
