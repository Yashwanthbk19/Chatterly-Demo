import {File} from 'expo-file-system';
import {createUsageTransfer} from './dataUsage';

const DOWNLOAD_IDLE_TIMEOUT_MS = 15000;

async function transfer(
  url: string,
  destination: File,
  onProgress?: (bytesWritten: number, totalBytes: number) => void,
): Promise<File> {
  const controller = new AbortController();
  let bytesWritten = 0;
  const recordReceived = createUsageTransfer('received');
  let timedOut = false;
  const abort = () => { timedOut = true; controller.abort(); };
  let timer = setTimeout(abort, DOWNLOAD_IDLE_TIMEOUT_MS);
  try {
    const downloaded = await File.downloadFileAsync(url, destination, {
      idempotent: true,
      signal: controller.signal,
      onProgress: progress => {
        recordReceived(progress.bytesWritten);
        onProgress?.(progress.bytesWritten, progress.totalBytes);
        // Bound stalled connections, not the total duration of a large file.
        if (progress.bytesWritten <= bytesWritten) { return; }
        bytesWritten = progress.bytesWritten;
        clearTimeout(timer);
        timer = setTimeout(abort, DOWNLOAD_IDLE_TIMEOUT_MS);
      },
    });
    recordReceived(downloaded.size || bytesWritten);
    return downloaded;
  } catch (error) {
    if (timedOut) { throw new Error('The download stalled. Check your connection and try again.'); }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/** Start the native transfer immediately; refresh private/expired links only on failure. */
export async function downloadMediaFile(
  source: string | undefined,
  destination: File,
  resolveUrl?: () => Promise<string>,
  onProgress?: (bytesWritten: number, totalBytes: number) => void,
): Promise<File> {
  const url = String(source || '').trim();
  if (url) {
    try {
      return await transfer(url, destination, onProgress);
    } catch (error) {
      if (!resolveUrl) { throw error; }
    }
  }

  const refreshedUrl = await resolveUrl?.();
  if (!refreshedUrl) { throw new Error('This media has no download address.'); }
  return transfer(refreshedUrl, destination, onProgress);
}
