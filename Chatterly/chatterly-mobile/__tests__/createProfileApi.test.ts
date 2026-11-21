import {handleApiResponseStatus} from '../src/api/client';
import {API_BASE_URL} from '../src/config/api';
import {createProfile} from '../src/services/profileApi';

jest.mock('../src/api/client', () => ({
  apiRequest: jest.fn(),
  handleApiResponseStatus: jest.fn(),
}));

class MockXMLHttpRequest {
  static latest: MockXMLHttpRequest;
  method = '';
  url = '';
  timeout = 0;
  status = 200;
  responseText = JSON.stringify({message: 'Profile created successfully', user: {isProfileComplete: true}});
  headers: Record<string, string> = {};
  body?: FormData;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  onload: (() => void) | null = null;
  constructor() { MockXMLHttpRequest.latest = this; }
  open(method: string, url: string) { this.method = method; this.url = url; }
  setRequestHeader(name: string, value: string) { this.headers[name] = value; }
  send(body: FormData) { this.body = body; this.onload?.(); }
}

beforeEach(() => {
  jest.clearAllMocks();
  globalThis.XMLHttpRequest = MockXMLHttpRequest as unknown as typeof XMLHttpRequest;
});

test('creates a profile using native multipart with bearer auth and the backend fields', async () => {

  const response = await createProfile('jwt-token', {
    name: ' Maya Rao ',
    dateOfBirth: '12/05/1990',
    bio: ' Available ',
    image: {uri: 'file:///profile.jpg', fileName: 'profile.jpg', mimeType: 'image/jpeg'},
  }, 'user-1');

  const request = MockXMLHttpRequest.latest;
  expect(request.method).toBe('POST');
  expect(request.url).toBe(`${API_BASE_URL}/auth/create-profile`);
  expect(request.headers).toEqual({Accept: 'application/json', Authorization: 'Bearer jwt-token'});
  expect(request.timeout).toBe(120000);
  expect(response.user?.isProfileComplete).toBe(true);
  const parts = Array.from((request.body as unknown as {
    entries: () => IterableIterator<[string, unknown]>;
  }).entries());
  expect(parts).toEqual(expect.arrayContaining([
    ['name', 'Maya Rao'],
    ['dateOfBirth', '12/05/1990'],
    ['status', 'Available'],
    ['userId', 'user-1'],
    ['profilePic', expect.anything()],
  ]));
});

test('surfaces backend errors and handles an expired session', async () => {
  class RejectedRequest extends MockXMLHttpRequest {
    status = 401;
    responseText = JSON.stringify({message: 'Session expired'});
  }
  globalThis.XMLHttpRequest = RejectedRequest as unknown as typeof XMLHttpRequest;
  await expect(createProfile('jwt-token', {name: 'Maya Rao', dateOfBirth: '12/05/1990', bio: ''}))
    .rejects.toThrow('Session expired');
  expect(handleApiResponseStatus).toHaveBeenCalledWith(401);
});

test.each(['timeout', 'network'] as const)('rejects a %s failure so the screen can allow retry', async failure => {
  class FailedRequest extends MockXMLHttpRequest {
    send(body: FormData) {
      this.body = body;
      if (failure === 'timeout') { this.ontimeout?.(); }
      else { this.onerror?.(); }
    }
  }
  globalThis.XMLHttpRequest = FailedRequest as unknown as typeof XMLHttpRequest;
  await expect(createProfile('jwt-token', {name: 'Maya Rao', dateOfBirth: '12/05/1990', bio: ''}))
    .rejects.toThrow(failure === 'timeout' ? 'took too long' : 'could not reach Chatterly');
});
