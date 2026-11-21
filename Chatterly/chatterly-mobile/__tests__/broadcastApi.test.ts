import AsyncStorage from '@react-native-async-storage/async-storage';
import {apiRequest} from '../src/api/client';
import {API_BASE_URL} from '../src/config/api';
import {
  addBroadcastMember,
  createBroadcast,
  deleteBroadcast,
  getBroadcastDetails,
  getBroadcastLists,
  getBroadcastMessages,
  removeBroadcastMember,
  saveBroadcastImage,
  saveBroadcastMessage,
  sendBroadcastMessage,
} from '../src/services/broadcastApi';

jest.mock('../src/api/client', () => ({apiRequest: jest.fn()}));
jest.mock('../src/services/sessionStore', () => ({getToken: () => 'jwt-token', getSession: () => ({user: {id: 'current-user'}})}));

const apiResponse = (payload: unknown) => ({json: jest.fn().mockResolvedValue(payload)} as unknown as Response);

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

test('creates, lists, opens and sends a one-way broadcast through documented endpoints', async () => {
  const record = {_id: 'broadcast-1', name: 'Team Updates', participants: [{_id: 'user-1', name: 'Rahul'}, {_id: 'user-2', name: 'Priya'}]};
  jest.mocked(apiRequest)
    .mockResolvedValueOnce(apiResponse({data: record}))
    .mockResolvedValueOnce(apiResponse({data: [record]}))
    .mockResolvedValueOnce(apiResponse({data: record}))
    .mockResolvedValueOnce(apiResponse({totalRecipients: 1, messagesCreated: 1}));

  await expect(createBroadcast(' Team Updates ', ['user-1', 'user-2'])).resolves.toEqual(expect.objectContaining({_id: 'broadcast-1'}));
  await saveBroadcastImage('broadcast-1', 'file:///broadcast.png');
  await expect(getBroadcastLists()).resolves.toEqual([expect.objectContaining({imageUri: 'file:///broadcast.png'})]);
  await expect(getBroadcastDetails('broadcast-1')).resolves.toEqual(expect.objectContaining({name: 'Team Updates', imageUri: 'file:///broadcast.png'}));
  await expect(sendBroadcastMessage('broadcast-1', ' Hello team ')).resolves.toEqual({totalRecipients: 1, messagesCreated: 1});

  expect(apiRequest).toHaveBeenNthCalledWith(1, `${API_BASE_URL}/broadcast/create`, expect.objectContaining({method: 'POST', body: JSON.stringify({name: 'Team Updates', participants: ['user-1', 'user-2']})}));
  expect(apiRequest).toHaveBeenNthCalledWith(2, `${API_BASE_URL}/broadcast/my-lists`, expect.objectContaining({method: 'GET'}));
  expect(apiRequest).toHaveBeenNthCalledWith(3, `${API_BASE_URL}/broadcast/broadcast-1`, expect.objectContaining({method: 'GET'}));
  expect(apiRequest).toHaveBeenNthCalledWith(4, `${API_BASE_URL}/broadcast/send`, expect.objectContaining({method: 'POST', body: JSON.stringify({broadcastId: 'broadcast-1', content: 'Hello team'})}));
});

test('requires at least two unique participants before calling the create endpoint', async () => {
  await expect(createBroadcast('Team Updates', ['user-1', 'user-1'])).rejects.toThrow('Minimum 2 participants required.');
  expect(apiRequest).not.toHaveBeenCalled();
});

test('deletes a broadcast through the documented endpoint and clears its local data', async () => {
  const record = {_id: 'broadcast-1', name: 'Team Updates', participants: [{_id: 'user-1', name: 'Rahul'}, {_id: 'user-2', name: 'Priya'}]};
  const message = {
    id: 'message-1',
    text: 'Sent quarterly-report.pdf',
    createdAt: '2026-09-24T06:30:00.000Z',
    recipients: 2,
    fileName: 'quarterly-report.pdf',
    fileType: 'application/pdf',
    fileSize: 2400000,
    fileUri: 'file:///documents/quarterly-report.pdf',
  };
  await saveBroadcastImage('broadcast-1', 'file:///broadcast.png');
  await saveBroadcastMessage('broadcast-1', message);
  await expect(getBroadcastMessages('broadcast-1')).resolves.toEqual([message]);

  jest.mocked(apiRequest).mockResolvedValueOnce(apiResponse({success: true, message: 'Broadcast deleted successfully'}));
  await deleteBroadcast('broadcast-1');
  jest.mocked(apiRequest).mockResolvedValueOnce(apiResponse({data: [record]}));

  expect(apiRequest).toHaveBeenNthCalledWith(1, `${API_BASE_URL}/broadcast/delete-broadcast`, expect.objectContaining({
    method: 'DELETE',
    body: JSON.stringify({broadcastId: 'broadcast-1'}),
  }));
  await expect(getBroadcastLists()).resolves.toEqual([]);
  await expect(getBroadcastMessages('broadcast-1')).resolves.toEqual([]);
});

test('adds and removes broadcast members through documented endpoints', async () => {
  jest.mocked(apiRequest).mockResolvedValue(apiResponse({success: true}));
  await addBroadcastMember('broadcast-1', 'user-2');
  await removeBroadcastMember('broadcast-1', 'user-3');
  expect(apiRequest).toHaveBeenNthCalledWith(1, `${API_BASE_URL}/broadcast/add-member`, expect.objectContaining({body: JSON.stringify({broadcastId: 'broadcast-1', userId: 'user-2'})}));
  expect(apiRequest).toHaveBeenNthCalledWith(2, `${API_BASE_URL}/broadcast/remove-member`, expect.objectContaining({body: JSON.stringify({broadcastId: 'broadcast-1', userId: 'user-3'})}));
});
