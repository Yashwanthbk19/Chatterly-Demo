import {File} from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library/legacy';
import {downloadedFileFor, markMediaDownloaded} from '../src/services/autoDownload';
import {isVideoAttachment, saveVideoToDevice} from '../src/services/videoDownload';

jest.mock('../src/services/autoDownload', () => ({downloadedFileFor: jest.fn(), markMediaDownloaded: jest.fn()}));

const message = {id: 'video-1', mediaUrl: 'https://cdn.example/clip.mp4', fileName: 'clip.mp4'};
const resolveUrl = jest.fn(async () => 'https://signed.example/clip.mp4');

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(downloadedFileFor).mockReturnValue('');
  jest.mocked(File.downloadFileAsync).mockReset().mockImplementation(async (_url, destination) => destination as File);
  jest.mocked(MediaLibrary.requestPermissionsAsync).mockResolvedValue({granted: true} as never);
  jest.mocked(MediaLibrary.saveToLibraryAsync).mockReset().mockResolvedValue(undefined);
});

test('downloads the video and writes it to the public library with add-only access', async () => {
  await saveVideoToDevice(message, resolveUrl);
  expect(MediaLibrary.requestPermissionsAsync).toHaveBeenCalledWith(true, []);
  expect(File.downloadFileAsync).toHaveBeenCalledWith(message.mediaUrl, expect.anything(), expect.objectContaining({idempotent: true}));
  expect(MediaLibrary.saveToLibraryAsync).toHaveBeenCalledWith('file:///documents/chatterly-video-1-clip.mp4');
  expect(markMediaDownloaded).toHaveBeenCalledWith(message.id, 'file:///documents/chatterly-video-1-clip.mp4');
});

test('saves an app-cached video to Gallery/Photos without downloading again', async () => {
  jest.mocked(downloadedFileFor).mockReturnValue('file:///documents/cached.mp4');
  await saveVideoToDevice(message, resolveUrl);
  expect(File.downloadFileAsync).not.toHaveBeenCalled();
  expect(MediaLibrary.saveToLibraryAsync).toHaveBeenCalledWith('file:///documents/cached.mp4');
});

test('permission denial reports an error without fetching or saving', async () => {
  jest.mocked(MediaLibrary.requestPermissionsAsync).mockResolvedValueOnce({granted: false} as never);
  await expect(saveVideoToDevice(message, resolveUrl)).rejects.toThrow('Allow photo and video saving');
  expect(File.downloadFileAsync).not.toHaveBeenCalled();
  expect(MediaLibrary.saveToLibraryAsync).not.toHaveBeenCalled();
});

test('simultaneous taps create a single download and library entry', async () => {
  const first = saveVideoToDevice(message, resolveUrl);
  const second = saveVideoToDevice(message, resolveUrl);
  expect(second).toBe(first);
  await Promise.all([first, second]);
  expect(File.downloadFileAsync).toHaveBeenCalledTimes(1);
  expect(MediaLibrary.saveToLibraryAsync).toHaveBeenCalledTimes(1);
});

test('a failed library write can be retried from the cached app copy', async () => {
  jest.mocked(markMediaDownloaded).mockImplementation((_id, uri) => jest.mocked(downloadedFileFor).mockReturnValue(uri || ''));
  jest.mocked(MediaLibrary.saveToLibraryAsync).mockRejectedValueOnce(new Error('Library full'));
  await expect(saveVideoToDevice(message, resolveUrl)).rejects.toThrow('Library full');
  await saveVideoToDevice(message, resolveUrl);
  expect(File.downloadFileAsync).toHaveBeenCalledTimes(1);
  expect(MediaLibrary.saveToLibraryAsync).toHaveBeenCalledTimes(2);
});

test('uses a unique destination and a video extension when the shared name lacks one', async () => {
  await saveVideoToDevice({...message, id: 'other-video', fileName: 'clip', fileType: 'video/quicktime'}, resolveUrl);
  expect(MediaLibrary.saveToLibraryAsync).toHaveBeenCalledWith('file:///documents/chatterly-other-video-clip.mov');
});

test('recognizes videos returned by the backend as generic files', () => {
  expect(isVideoAttachment({messageType: 'file', fileType: 'video/mp4'})).toBe(true);
  expect(isVideoAttachment({messageType: 'file', fileName: 'received.MP4'})).toBe(true);
  expect(isVideoAttachment({messageType: 'file', fileType: 'application/pdf', fileName: 'report.pdf'})).toBe(false);
});
