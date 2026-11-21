import * as SecureStore from 'expo-secure-store';
import {clearSession, getSession, markSessionProfileComplete, restoreSession, saveSession} from '../src/services/sessionStore';

const outcome = {
  token: 'previous-token',
  user: {id: 'user-1', name: 'Person'},
  isProfileComplete: true,
  message: '',
  requires2FA: false,
  twoFactorUserId: '',
  twoFactorMethod: '',
};

beforeEach(async () => {
  await clearSession();
  jest.clearAllMocks();
});

test('restores persisted authentication after an app process restart', async () => {
  jest.mocked(SecureStore.getItemAsync).mockResolvedValueOnce(JSON.stringify({
    token: 'previous-token',
    user: {id: 'user-1', name: 'Person'},
    isProfileComplete: true,
  }));

  await expect(restoreSession()).resolves.toEqual(expect.objectContaining({token: 'previous-token'}));
  expect(getSession()?.user?.id).toBe('user-1');
  expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
});

test('explicit logout removes both memory and persisted authentication', async () => {
  await saveSession(outcome);
  expect(getSession()?.token).toBe('previous-token');

  await clearSession();

  expect(getSession()).toBeNull();
  await expect(restoreSession()).resolves.toBeNull();
  expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('chatterly.auth-session.v1');
});

test('a new login saved after logout wins the secure-storage race', async () => {
  await saveSession(outcome);
  const logout = clearSession();
  const loginAgain = saveSession({...outcome, token: 'new-token'});
  await Promise.all([logout, loginAgain]);

  expect(getSession()?.token).toBe('new-token');
  await expect(SecureStore.getItemAsync('chatterly.auth-session.v1')).resolves.toContain('new-token');
});

test('persists profile completion for the next cold start', async () => {
  await saveSession({...outcome, isProfileComplete: false});
  await markSessionProfileComplete();

  expect(getSession()?.isProfileComplete).toBe(true);
  expect(SecureStore.setItemAsync).toHaveBeenLastCalledWith(
    'chatterly.auth-session.v1',
    expect.stringContaining('"isProfileComplete":true'),
  );
});

test('persists the created email profile and completion flag together while retaining login details', async () => {
  await saveSession({
    ...outcome,
    user: {id: 'email-user', email: 'maya@example.com', isProfileComplete: false},
    isProfileComplete: false,
  });
  jest.mocked(SecureStore.setItemAsync).mockClear();
  await markSessionProfileComplete({
    id: 'email-user', name: 'Maya Rao', dateOfBirth: '1990-05-12', status: 'Available',
  });
  const completed = {
    token: 'previous-token',
    user: {
      id: 'email-user', email: 'maya@example.com', name: 'Maya Rao', dateOfBirth: '1990-05-12',
      status: 'Available', isProfileComplete: true,
    },
    isProfileComplete: true,
  };
  expect(getSession()).toEqual(completed);
  expect(SecureStore.setItemAsync).toHaveBeenCalledTimes(1);
  const [storageKey, storedProfile] = jest.mocked(SecureStore.setItemAsync).mock.calls[0];
  expect(storageKey).toBe('chatterly.auth-session.v1');
  expect(JSON.parse(storedProfile)).toEqual(completed);

  await clearSession();
  jest.mocked(SecureStore.getItemAsync).mockResolvedValueOnce(storedProfile);
  await expect(restoreSession()).resolves.toEqual(completed);
});
