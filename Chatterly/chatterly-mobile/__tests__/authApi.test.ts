import {apiRequest} from '../src/api/client';
import {API_BASE_URL} from '../src/config/api';
import {googleLogin, logoutSession, verifyEmailOtp} from '../src/services/authApi';
import {getDeviceId, getDeviceIdentity} from '../src/utils/deviceIdentity';

jest.mock('../src/api/client', () => ({apiRequest: jest.fn()}));
jest.mock('../src/utils/deviceIdentity', () => ({
  getDeviceId: jest.fn(() => 'mobile-device-id'),
  getDeviceIdentity: jest.fn(),
}));

test('exchanges the Firebase Google token using the live backend contract', async () => {
  jest.mocked(apiRequest).mockResolvedValue({
    json: jest.fn().mockResolvedValue({
      token: 'chatterly-session',
      user: {_id: 'user-1', email: 'person@example.com'},
      isProfileComplete: true,
    }),
  } as never);

  const outcome = await googleLogin('firebase-google-token');

  expect(apiRequest).toHaveBeenCalledWith(`${API_BASE_URL}/auth/google-login`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json', Accept: 'application/json'},
    body: JSON.stringify({idToken: 'firebase-google-token', deviceId: 'mobile-device-id'}),
  });
  expect(getDeviceId).toHaveBeenCalled();
  expect(outcome.token).toBe('chatterly-session');
  expect(outcome.user?.id).toBe('user-1');
});

test('logs out the current backend device session with its bearer token', async () => {
  jest.mocked(apiRequest).mockResolvedValue({json: jest.fn()} as never);

  await logoutSession('chatterly-session');

  expect(apiRequest).toHaveBeenCalledWith(`${API_BASE_URL}/auth/logout`, {
    method: 'POST',
    headers: {Accept: 'application/json', Authorization: 'Bearer chatterly-session'},
  });
});

test('normalizes a newly verified email account for authenticated profile creation', async () => {
  jest.mocked(getDeviceIdentity).mockResolvedValue({
    deviceId: 'email-device', deviceName: 'Android phone', platform: 'android', browser: 'React Native',
  });
  jest.mocked(apiRequest).mockResolvedValue({json: async () => ({
    success: true, token: 'email-session', isProfileComplete: false,
    user: {_id: 'email-user', email: 'maya@example.com', authProvider: 'email', isProfileComplete: false},
  })} as never);
  const outcome = await verifyEmailOtp('maya@example.com', '482913');
  expect(apiRequest).toHaveBeenCalledWith(`${API_BASE_URL}/auth/verify-email-otp`, expect.objectContaining({
    method: 'POST',
    body: JSON.stringify({
      email: 'maya@example.com', otp: '482913', deviceId: 'email-device', deviceName: 'Android phone', platform: 'android',
    }),
  }));
  expect(outcome).toEqual(expect.objectContaining({
    token: 'email-session', isProfileComplete: false, requires2FA: false,
    user: expect.objectContaining({id: 'email-user', email: 'maya@example.com'}),
  }));
});
