import {updateProfile} from '../src/services/profileApi';

type RequestHandler = (() => void) | null;

class MockXMLHttpRequest {
  static latest: MockXMLHttpRequest;
  method = '';
  url = '';
  timeout = 0;
  status = 200;
  responseText = JSON.stringify({
    message: 'Profile updated successfully',
    user: {name: 'Updated User', profilePic: 'https://media.example.com/profiles/updated.jpg'},
  });
  headers: Record<string, string> = {};
  body?: FormData;
  onerror: RequestHandler = null;
  ontimeout: RequestHandler = null;
  onload: RequestHandler = null;

  constructor() { MockXMLHttpRequest.latest = this; }
  open(method: string, url: string) { this.method = method; this.url = url; }
  setRequestHeader(name: string, value: string) { this.headers[name] = value; }
  send(body: FormData) { this.body = body; this.onload?.(); }
}

beforeEach(() => {
  globalThis.XMLHttpRequest = MockXMLHttpRequest as unknown as typeof XMLHttpRequest;
});

test('updates profile fields and picture through one native multipart PATCH', async () => {
  const response = await updateProfile('jwt-token', {
    name: ' Updated User ',
    status: ' New bio ',
    image: {uri: 'file:///cache/profile-normalized.jpg', fileName: 'profile.jpg', mimeType: 'image/jpeg'},
  });

  const request = MockXMLHttpRequest.latest;
  expect(request.method).toBe('PATCH');
  expect(request.url).toBe('https://chatterly.stacklycloud.com/api/auth/update-profile');
  expect(request.timeout).toBe(120000);
  expect(request.headers).toEqual({Accept: 'application/json', Authorization: 'Bearer jwt-token'});
  expect(request.headers['Content-Type']).toBeUndefined();
  expect(request.body).toBeInstanceOf(FormData);
  expect(response.user?.profilePic).toBe('https://media.example.com/profiles/updated.jpg');
});

test('returns the backend validation message for a rejected update', async () => {
  class RejectedXMLHttpRequest extends MockXMLHttpRequest {
    status = 400;
    responseText = JSON.stringify({message: 'Only JPG, JPEG, and PNG images are allowed'});
  }
  globalThis.XMLHttpRequest = RejectedXMLHttpRequest as unknown as typeof XMLHttpRequest;

  await expect(updateProfile('jwt-token', {name: 'Updated User'}))
    .rejects.toThrow('Only JPG, JPEG, and PNG images are allowed');
});
