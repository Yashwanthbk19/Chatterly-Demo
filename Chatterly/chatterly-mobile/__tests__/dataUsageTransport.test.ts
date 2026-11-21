import {File, Paths} from 'expo-file-system';
import {apiRequest} from '../src/api/client';
import {API_BASE_URL} from '../src/config/api';
import {createUsageTransfer, flushDataUsage, getDataUsage, payloadBytes, resetDataUsage} from '../src/services/dataUsage';
import {downloadMediaFile} from '../src/services/mediaDownload';
import {sendChatMedia} from '../src/services/chatApi';
import {sendGroupMedia} from '../src/services/groupApi';

jest.mock('../src/services/sessionStore', () => ({getSession: () => ({user: {id: 'transport-user'}}), getToken: () => 'jwt', clearSession: jest.fn()}));
beforeEach(async () => { jest.clearAllMocks(); await resetDataUsage(); });
afterEach(async () => { await flushDataUsage(); jest.restoreAllMocks(); });

test('successful chat API traffic updates byte totals without consuming the caller response', async () => {
  const body = JSON.stringify({text: 'Hello 🐱'});
  const received = JSON.stringify({success: true});
  const response = {ok: true, status: 200, clone: () => ({text: async () => received}), json: async () => JSON.parse(received)} as Response;
  jest.spyOn(globalThis, 'fetch').mockResolvedValue(response);
  const result = await apiRequest(`${API_BASE_URL}/chats/send-message`, {method: 'POST', body});
  await flushDataUsage();
  expect(getDataUsage().messages).toEqual({sent: payloadBytes(body), received: payloadBytes(received)});
  await expect(result.json()).resolves.toEqual({success: true});
  await apiRequest(`${API_BASE_URL}/preferences/data-usage`);
  await flushDataUsage();
  expect(getDataUsage().messages.received).toBe(payloadBytes(received));
});

test('native file progress and the completed file count once in received media', async () => {
  jest.mocked(File.downloadFileAsync).mockImplementationOnce(async (_url, destination, options) => {
    options!.onProgress!({bytesWritten: 1024, totalBytes: 3072});
    options!.onProgress!({bytesWritten: 3072, totalBytes: 3072});
    return {uri: (destination as File).uri, size: 3072} as File;
  });
  await downloadMediaFile('https://cdn.example/video.mp4', new File(Paths.document, 'video.mp4'));
  expect(getDataUsage().media.received).toBe(3072);
});

test.each(['direct', 'group'] as const)('%s attachment upload progress updates sent media without changing progress callbacks', async kind => {
  const original = globalThis.XMLHttpRequest;
  class Upload {
    upload: {onprogress?: (event: any) => void; onload?: () => void} = {};
    status = 200;
    responseText = JSON.stringify({data: {_id: 'uploaded', sender: 'transport-user', messageType: 'image', mediaUrl: 'https://cdn.example/image.jpg', mediaSize: 4096}});
    onload?: () => void;
    open = jest.fn();
    setRequestHeader = jest.fn();
    send() {
      this.upload.onprogress?.({loaded: 1024, total: 4096, lengthComputable: true});
      this.upload.onprogress?.({loaded: 4096, total: 4096, lengthComputable: true});
      this.upload.onload?.();
      this.onload?.();
    }
  }
  globalThis.XMLHttpRequest = Upload as unknown as typeof XMLHttpRequest;
  const progress = jest.fn();
  try {
    const file = {uri: 'file:///image.jpg', name: 'image.jpg', type: 'image/jpeg'};
    if (kind === 'direct') await sendChatMedia('receiver', file, {onUploadProgress: progress});
    else await sendGroupMedia('group', file, undefined, progress);
    expect(progress).toHaveBeenCalledWith(0.25);
    expect(progress).toHaveBeenCalledWith(1);
    expect(getDataUsage().media.sent).toBe(4096);
  } finally { globalThis.XMLHttpRequest = original; }
});

test('statistics reset during an ongoing transfer counts only subsequent bytes', async () => {
  const progress = createUsageTransfer('received');
  progress(1024);
  await resetDataUsage();
  progress(1536);
  expect(getDataUsage().media.received).toBe(512);
});
