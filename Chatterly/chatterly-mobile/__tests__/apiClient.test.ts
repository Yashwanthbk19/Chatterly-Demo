import {apiRequest, ApiError, subscribeToSessionExpiration} from '../src/api/client';
import {API_BASE_URL} from '../src/config/api';
import {clearSession, getToken} from '../src/services/sessionStore';

jest.mock('../src/services/sessionStore', () => ({
  clearSession: jest.fn().mockResolvedValue(undefined),
  getToken: jest.fn(() => ''),
}));

type MockResponse = {
  ok: boolean;
  status: number;
  json: jest.Mock<Promise<Record<string, string>>, []>;
};

function response(ok = true, payload: Record<string, string> = {}, status = 200): MockResponse {
  return {
    ok,
    status,
    json: jest.fn().mockResolvedValue(payload),
  };
}

beforeEach(() => {
  globalThis.fetch = jest.fn() as never;
  jest.mocked(getToken).mockReturnValue('');
  jest.mocked(clearSession).mockResolvedValue(undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('returns the primary API response when the live backend is reachable', async () => {
  const okResponse = response(true, {message: 'OTP sent to email'});
  jest.mocked(fetch).mockResolvedValue(okResponse as never);

  const result = await apiRequest(`${API_BASE_URL}/auth/send-email-otp`, {
    method: 'POST',
    body: JSON.stringify({email: 'person@example.com'}),
  });

  expect(result).toBe(okResponse);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledWith(`${API_BASE_URL}/auth/send-email-otp`, expect.any(Object));
});

test('retries the Android emulator local backend when the live request fails in development', async () => {
  const okResponse = response(true, {message: 'OTP sent to email'});
  jest.mocked(fetch)
    .mockRejectedValueOnce(new TypeError('Network request failed'))
    .mockResolvedValueOnce(okResponse as never);

  const result = await apiRequest(`${API_BASE_URL}/auth/send-email-otp`, {
    method: 'POST',
    body: JSON.stringify({email: 'person@example.com'}),
  });

  expect(result).toBe(okResponse);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch).toHaveBeenNthCalledWith(
    2,
    'http://10.0.2.2:5000/api/auth/send-email-otp',
    expect.any(Object),
  );
});

test('uses the backend message from a fallback API error', async () => {
  jest.mocked(fetch)
    .mockRejectedValueOnce(new TypeError('Network request failed'))
    .mockResolvedValueOnce(response(false, {message: 'Please wait before requesting another OTP'}, 400) as never);

  await expect(apiRequest(`${API_BASE_URL}/auth/send-email-otp`, {method: 'POST'}))
    .rejects.toEqual(new ApiError('Please wait before requesting another OTP', 400));
});

test('clears and reports an expired authenticated session on 401', async () => {
  jest.mocked(getToken).mockReturnValue('expired-token');
  jest.mocked(fetch).mockResolvedValue(response(false, {message: 'Invalid token'}, 401) as never);
  const expired = jest.fn();
  const unsubscribe = subscribeToSessionExpiration(expired);

  await expect(apiRequest(`${API_BASE_URL}/chats/list`)).rejects.toEqual(new ApiError('Invalid token', 401));
  await Promise.resolve();
  await Promise.resolve();

  expect(clearSession).toHaveBeenCalledTimes(1);
  expect(expired).toHaveBeenCalledWith('Invalid token');
  unsubscribe();
});

test('reports expiration without waiting for encrypted session deletion', async () => {
  jest.mocked(getToken).mockReturnValue('expired-token');
  jest.mocked(fetch).mockResolvedValue(response(false, {
    message: 'Session expired due to inactivity. Please login again.',
  }, 401) as never);
  let finishClearing: (() => void) | undefined;
  jest.mocked(clearSession).mockImplementation(() => new Promise<void>(resolve => {
    finishClearing = resolve;
  }));
  const expired = jest.fn();
  const unsubscribe = subscribeToSessionExpiration(expired);

  await expect(apiRequest(`${API_BASE_URL}/chats/list`)).rejects.toEqual(
    new ApiError('Session expired due to inactivity. Please login again.', 401),
  );

  // Navigation is notified even while device storage is still busy.
  expect(finishClearing).toBeDefined();
  expect(expired).toHaveBeenCalledWith(
    'Session expired due to inactivity. Please login again.',
  );

  finishClearing?.();
  await Promise.resolve();
  await Promise.resolve();
  unsubscribe();
});

test('does not replay group photo mutations against a development fallback', async () => {
  jest.mocked(fetch).mockRejectedValue(new TypeError('Network request failed'));
  await expect(apiRequest(`${API_BASE_URL}/group/change-photo`, {method:'PUT'}, {timeoutMs:120000, allowDevelopmentFallback:false})).rejects.toBeInstanceOf(ApiError);
  expect(fetch).toHaveBeenCalledTimes(1);
});

test('does not replay group creation when the response connection is lost', async () => {
  jest.mocked(fetch).mockRejectedValue(new TypeError('Network request failed'));
  await expect(apiRequest(`${API_BASE_URL}/group/create`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({groupName: 'Team', participants: ['a', 'b']}),
  }, {allowDevelopmentFallback: false})).rejects.toBeInstanceOf(ApiError);
  expect(fetch).toHaveBeenCalledTimes(1);
});

test('allows an upload timeout without changing the default request timeout', async () => {
  const timer = jest.spyOn(globalThis, 'setTimeout');
  jest.mocked(fetch).mockResolvedValue(response() as never);
  await apiRequest(`${API_BASE_URL}/group/change-photo`, {method:'PUT'}, {timeoutMs:120000});
  expect(timer).toHaveBeenLastCalledWith(expect.any(Function),120000);
  await apiRequest(`${API_BASE_URL}/group/g1`);
  expect(timer).toHaveBeenLastCalledWith(expect.any(Function),15000);
});
