import {File, Paths, type DownloadOptions} from 'expo-file-system';
import {downloadMediaFile} from '../src/services/mediaDownload';

const destination = new File(Paths.document, 'report.pdf');
const download = jest.mocked(File.downloadFileAsync);

beforeEach(() => {
  jest.useFakeTimers();
  download.mockReset().mockResolvedValue(destination);
});

afterEach(() => { jest.useRealTimers(); });

test('starts from the existing URL without waiting for the signed-link API', async () => {
  const resolve = jest.fn(() => new Promise<string>(() => {}));
  await expect(downloadMediaFile('https://cdn.example/report.pdf', destination, resolve)).resolves.toBe(destination);
  expect(download.mock.calls[0][0]).toBe('https://cdn.example/report.pdf');
  expect(resolve).not.toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
});

test('refreshes an expired/private URL and retries the native transfer once', async () => {
  download.mockRejectedValueOnce(new Error('403'));
  const resolve = jest.fn(async () => 'https://signed.example/report.pdf');
  await expect(downloadMediaFile('https://old.example/report.pdf', destination, resolve)).resolves.toBe(destination);
  expect(resolve).toHaveBeenCalledTimes(1);
  expect(download.mock.calls.map(call => call[0])).toEqual([
    'https://old.example/report.pdf', 'https://signed.example/report.pdf',
  ]);
});

test('a document without a URL obtains a signed link before downloading', async () => {
  const resolve = jest.fn(async () => 'https://signed.example/report.pdf');
  await downloadMediaFile(undefined, destination, resolve);
  expect(download).toHaveBeenCalledTimes(1);
  expect(download.mock.calls[0][0]).toBe('https://signed.example/report.pdf');
});

function stalledDownload(_url: string, _destination: unknown, options?: DownloadOptions): Promise<File> {
  return new Promise((_resolve, reject) => {
    options?.signal?.addEventListener('abort', () => reject(new Error('AbortError')));
  });
}

test('cancels a stalled connection after 15 seconds and retries with a refreshed link', async () => {
  download.mockImplementationOnce(stalledDownload);
  const resolve = jest.fn(async () => 'https://signed.example/report.pdf');
  const result = downloadMediaFile('https://stalled.example/report.pdf', destination, resolve);
  await jest.advanceTimersByTimeAsync(14999);
  expect(resolve).not.toHaveBeenCalled();
  await jest.advanceTimersByTimeAsync(1);
  await expect(result).resolves.toBe(destination);
  expect(download.mock.calls[0][2]?.signal?.aborted).toBe(true);
  expect(resolve).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});

test('keeps large downloads running while bytes arrive, then fails a stalled final attempt without looping', async () => {
  download.mockImplementationOnce(stalledDownload);
  const result = downloadMediaFile(undefined, destination, async () => 'https://signed.example/report.pdf');
  // Attach the rejection handler before advancing timers.
  const checked = expect(result).rejects.toThrow('download stalled');
  await jest.advanceTimersByTimeAsync(10000);
  const options = download.mock.calls[0][2];
  options?.onProgress?.({bytesWritten: 1024, totalBytes: 100000});
  await jest.advanceTimersByTimeAsync(10000);
  options?.onProgress?.({bytesWritten: 2048, totalBytes: 100000});
  expect(options?.signal?.aborted).toBe(false);
  await jest.advanceTimersByTimeAsync(15000);
  await checked;
  expect(download).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});

test('propagates a failed retry and clears its timer', async () => {
  download.mockRejectedValue(new Error('Unavailable'));
  await expect(downloadMediaFile('https://cdn.example/report.pdf', destination,
    async () => 'https://signed.example/report.pdf')).rejects.toThrow('Unavailable');
  expect(download).toHaveBeenCalledTimes(2);
  expect(jest.getTimerCount()).toBe(0);
});
