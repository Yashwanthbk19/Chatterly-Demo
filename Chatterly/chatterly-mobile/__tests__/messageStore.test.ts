import AsyncStorage from '@react-native-async-storage/async-storage';
import {loadStoredMessages, storeMessages} from '../src/services/messageStore';

jest.mock('../src/services/sessionStore', () => ({getSession: () => ({user: {id: 'user-1'}})}));

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
});

test('persists and restores the complete offline queue record', async () => {
  const queued = [{id: 'temp-1', tempId: 'temp-1', text: 'Send after restart', createdAt: '2026-08-25T10:00:00.000Z', isOwn: true, status: 'pending', queued: true, messageType: 'text' as const}];
  await storeMessages('chat-1', queued);
  await expect(loadStoredMessages('chat-1')).resolves.toEqual(queued);
});

test('isolates conversations by chat id', async () => {
  await storeMessages('chat-1', [{id: 'one', text: 'Only here', createdAt: '2026-08-25T10:00:00.000Z', isOwn: false}]);
  await expect(loadStoredMessages('chat-2')).resolves.toEqual([]);
});
