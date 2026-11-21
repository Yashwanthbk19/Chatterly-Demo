import {apiRequest} from '../src/api/client';
import {API_BASE_URL} from '../src/config/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {getStoredChatDisappearingTimer, getChatDisappearingTimerClearedAt} from '../src/services/disappearingMessages';
import {
  disableTwoFactor,
  enableTwoFactor,
  getBlockedUsers,
  getPrivacySettings,
  getTrustedDevices,
  registerTrustedDevice,
  removeTrustedDevice,
  reportUser,
  setTwoFactorEnabled,
  setupAuthenticator,
  unblockUser,
  updateDisappearingMessages,
  verifyAuthenticator,
} from '../src/services/privacyApi';

jest.mock('../src/api/client', () => ({apiRequest: jest.fn()}));
jest.mock('../src/services/sessionStore', () => ({
  getToken: () => 'jwt-token',
  getSession: () => ({token: 'jwt-token', user: {id: 'reporter-1'}}),
}));

function respond(payload: unknown): Response {
  return {json: jest.fn().mockResolvedValue(payload)} as unknown as Response;
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
});

test('loads and normalizes privacy settings from the documented endpoint', async () => {
  jest.mocked(apiRequest).mockResolvedValue(respond({data: {encryptionEnabled: true, twoFactorEnabled: true, blockedUsersCount: 2, disappearingMessages: '7d'}}));
  await expect(getPrivacySettings()).resolves.toEqual({encryptionEnabled: true, twoFactorEnabled: true, blockedUsersCount: 2, disappearingMessages: '7d'});
  expect(apiRequest).toHaveBeenCalledWith(`${API_BASE_URL}/privacy/settings`, expect.objectContaining({method: 'GET'}));
});

test('updates disappearing messages and toggles two-factor authentication', async () => {
  jest.mocked(apiRequest).mockResolvedValue(respond({success: true, message: 'Updated'}));
  await updateDisappearingMessages('24h');
  expect(apiRequest).toHaveBeenLastCalledWith(`${API_BASE_URL}/privacy/settings`, expect.objectContaining({method: 'PUT', body: JSON.stringify({disappearingMessages: '24h'})}));

  await setTwoFactorEnabled(true);
  expect(apiRequest).toHaveBeenLastCalledWith(`${API_BASE_URL}/2fa/enable`, expect.objectContaining({method: 'POST', body: JSON.stringify({method: 'sms'})}));

  await setTwoFactorEnabled(false);
  expect(apiRequest).toHaveBeenLastCalledWith(`${API_BASE_URL}/2fa/disable`, expect.objectContaining({method: 'POST'}));
});

test('turning off disappearing messages clears every direct chat timer before saving the default', async () => {
  const chats = [
    {_id: 'chat-1', participants: [{user: 'reporter-1'}, {user: 'friend-1'}]},
    {_id: 'chat-2', participants: [{user: 'reporter-1', archived: true}, {user: {_id: 'friend-2'}}]},
    {_id: 'group-1', type: 'group', participants: [{user: 'reporter-1'}]},
  ];
  await AsyncStorage.multiSet([['chat.disappearingTimer.chat-1', '24h'], ['chat.disappearingTimer.chat-2', '7d']]);
  jest.mocked(apiRequest).mockImplementation(async url => respond(
    url === `${API_BASE_URL}/chats/list` ? {data: chats} : {success: true},
  ));

  await updateDisappearingMessages('off');

  for (const receiver of ['friend-1', 'friend-2']) {
    expect(apiRequest).toHaveBeenCalledWith(`${API_BASE_URL}/chats/set-disappearing-timer`, expect.objectContaining({
      method: 'POST', body: JSON.stringify({sender: 'reporter-1', receiver, timer: 'off'}),
    }));
  }
  expect(apiRequest).toHaveBeenCalledTimes(4);
  expect(apiRequest).toHaveBeenLastCalledWith(`${API_BASE_URL}/privacy/settings`, expect.objectContaining({
    method: 'PUT', body: JSON.stringify({disappearingMessages: 'off'}),
  }));
  expect(await getStoredChatDisappearingTimer('chat-1')).toBe('off');
  expect(await getStoredChatDisappearingTimer('chat-2')).toBe('off');
  expect(await getChatDisappearingTimerClearedAt('chat-1')).toBeGreaterThan(0);
});

test('does not report disabling succeeded when an existing chat timer cannot be cleared', async () => {
  await AsyncStorage.setItem('chat.disappearingTimer.chat-1', '7d');
  jest.mocked(apiRequest).mockResolvedValueOnce(respond({data: [
    {_id: 'chat-1', participants: [{user: 'reporter-1'}, {user: 'friend-1'}]},
  ]})).mockRejectedValueOnce(new Error('Network unavailable'));

  await expect(updateDisappearingMessages('off')).rejects.toThrow('Unable to clear all');
  expect(await getStoredChatDisappearingTimer('chat-1')).toBe('7d');
  expect(apiRequest).not.toHaveBeenCalledWith(`${API_BASE_URL}/privacy/settings`, expect.anything());
});

test('loads blocked users, unblocks a user, and submits reports', async () => {
  jest.mocked(apiRequest).mockResolvedValueOnce(respond({blockedUsers: [{_id: 'user-2', name: 'Alex', phone: '+100000000'}]}));
  await expect(getBlockedUsers()).resolves.toEqual([{id: 'user-2', name: 'Alex', phone: '+100000000'}]);

  jest.mocked(apiRequest).mockResolvedValueOnce(respond({message: 'User unblocked successfully'}));
  await unblockUser('user-2');
  expect(apiRequest).toHaveBeenLastCalledWith(`${API_BASE_URL}/block/unblock`, expect.objectContaining({body: JSON.stringify({blockedUserId: 'user-2'})}));

  jest.mocked(apiRequest).mockResolvedValueOnce(respond({message: 'Report submitted successfully'}));
  await reportUser('user-3', 'Spam', 'Unwanted messages');
  expect(apiRequest).toHaveBeenLastCalledWith(`${API_BASE_URL}/report/report-user`, expect.objectContaining({body: JSON.stringify({reporterId: 'reporter-1', reportedUserId: 'user-3', reason: 'Spam', description: 'Unwanted messages'})}));
});

test('uses the documented authenticator setup, verification, enable and disable endpoints', async () => {
  jest.mocked(apiRequest).mockResolvedValueOnce(respond({qrCode: 'data:image/png;base64,abc', manualKey: 'SERVER-KEY'}));
  await expect(setupAuthenticator()).resolves.toEqual({qrCode: 'data:image/png;base64,abc', manualKey: 'SERVER-KEY'});
  expect(apiRequest).toHaveBeenLastCalledWith(`${API_BASE_URL}/2fa/authenticator/setup`, expect.objectContaining({method: 'POST'}));

  jest.mocked(apiRequest).mockResolvedValueOnce(respond({backupCodes: ['A1', 'B2']}));
  await expect(verifyAuthenticator('123456')).resolves.toEqual(['A1', 'B2']);
  expect(apiRequest).toHaveBeenLastCalledWith(`${API_BASE_URL}/2fa/authenticator/verify`, expect.objectContaining({method: 'POST', body: JSON.stringify({token: '123456'})}));

  jest.mocked(apiRequest).mockResolvedValueOnce(respond({message: '2FA enabled successfully'}));
  await enableTwoFactor('authenticator');
  expect(apiRequest).toHaveBeenLastCalledWith(`${API_BASE_URL}/2fa/enable`, expect.objectContaining({method: 'POST', body: JSON.stringify({method: 'authenticator'})}));

  jest.mocked(apiRequest).mockResolvedValueOnce(respond({message: '2FA disabled successfully'}));
  await disableTwoFactor();
  expect(apiRequest).toHaveBeenLastCalledWith(`${API_BASE_URL}/2fa/disable`, expect.objectContaining({method: 'POST'}));
});

test('lists, registers and removes trusted devices using Sprint 10 Story 4 endpoints', async () => {
  const backendDevice = {_id: 'record-1', deviceId: 'device-001', deviceName: 'Samsung S24', platform: 'android', browser: 'Chatterly Mobile', ipAddress: '127.0.0.1', trusted: true, lastLoginAt: '2026-07-20T04:08:12.670Z', createdAt: '2026-07-20T03:34:55.705Z'};
  jest.mocked(apiRequest).mockResolvedValueOnce(respond({data: [backendDevice]}));
  await expect(getTrustedDevices()).resolves.toEqual([expect.objectContaining({id: 'record-1', deviceId: 'device-001', deviceName: 'Samsung S24', trusted: true})]);
  expect(apiRequest).toHaveBeenLastCalledWith(`${API_BASE_URL}/trusted-devices/list`, expect.objectContaining({method: 'GET'}));

  const input = {deviceId: 'device-001', deviceName: 'Samsung S24', platform: 'android' as const, browser: 'Chatterly Mobile'};
  jest.mocked(apiRequest).mockResolvedValueOnce(respond({data: backendDevice}));
  await registerTrustedDevice(input);
  expect(apiRequest).toHaveBeenLastCalledWith(`${API_BASE_URL}/trusted-devices/register`, expect.objectContaining({method: 'POST', body: JSON.stringify(input)}));

  jest.mocked(apiRequest).mockResolvedValueOnce(respond({message: 'Trusted device removed successfully'}));
  await removeTrustedDevice('device-001');
  expect(apiRequest).toHaveBeenLastCalledWith(`${API_BASE_URL}/trusted-devices/device-001`, expect.objectContaining({method: 'DELETE'}));
});
