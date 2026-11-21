import {TurboModuleRegistry} from 'react-native';
import {Video} from 'react-native-compressor';
import {ImageManipulator} from 'expo-image-manipulator';
import * as ImageManipulatorModule from 'expo-image-manipulator';
import {compressChatMedia} from '../src/services/mediaCompression';

beforeEach(() => jest.clearAllMocks());

test.each([
  ['image/gif', 'reaction', 'content://media/42'],
  ['image/jpeg', 'reaction.GIF', 'content://media/42'],
  ['application/octet-stream', 'reaction', 'file:///reaction.gif'],
])('preserves GIF animation before upload (%s, %s)', async (mimeType, fileName, uri) => {
  const progress = jest.fn();
  const result = await compressChatMedia({
    id: 'gif-1', uri, fileName, mimeType, type: 'image', width: 2400, height: 1800,
  }, progress, true);

  expect(result.uri).toBe(uri);
  expect(result.mimeType).toBe('image/gif');
  expect(result.fileName).toMatch(/\.gif$/i);
  expect(ImageManipulator.manipulate).not.toHaveBeenCalled();
  expect(progress).toHaveBeenLastCalledWith(1);
});

test('compresses a photo with the Expo-compatible image manipulator', async () => {
  const progress = jest.fn();
  const result = await compressChatMedia({
    id: 'photo-1', uri: 'file:///photo.png', fileName: 'photo.png',
    mimeType: 'image/png', type: 'image', width: 2400, height: 1800,
  }, progress);

  expect(result).toEqual(expect.objectContaining({
    uri: 'file:///cache/profile-normalized.jpg', fileName: 'photo.jpg',
    mimeType: 'image/jpeg', width: 1200, height: 800,
  }));
  expect(progress).toHaveBeenLastCalledWith(1);
});

test('compresses a video with the native Android and iOS encoder', async () => {
  const nativeModule = jest.spyOn(TurboModuleRegistry, 'get').mockReturnValue({} as never);
  const progress = jest.fn();
  const video = {
    id: 'video-1', uri: 'file:///video.mp4', fileName: 'video.mp4',
    mimeType: 'video/mp4', type: 'video' as const, width: 1280, height: 720,
  };

  await expect(compressChatMedia(video, progress, false)).resolves.toEqual(expect.objectContaining({
    uri: 'file:///cache/compressed-video.mp4', fileName: 'video.mp4', mimeType: 'video/mp4',
  }));
  expect(progress).toHaveBeenCalledWith(0.5);
  expect(progress).toHaveBeenLastCalledWith(1);
  nativeModule.mockRestore();
});

test('sends the original video when Expo Go has no native compressor', async () => {
  const nativeModule = jest.spyOn(TurboModuleRegistry, 'get').mockReturnValue(null);
  const progress = jest.fn();
  const video = {
    id: 'downloaded-video', uri: 'content://media/video/42', fileName: 'downloaded.mp4',
    mimeType: 'video/mp4', type: 'video' as const,
  };

  await expect(compressChatMedia(video, progress)).resolves.toEqual(video);
  expect(Video.compress).not.toHaveBeenCalled();
  expect(progress).toHaveBeenLastCalledWith(1);
  nativeModule.mockRestore();
});

test('standard and HD photos land either side of the 1280px the server re-encodes to', async () => {
  const {__mock} = ImageManipulatorModule as unknown as {__mock: Record<string, jest.Mock>};
  const photo = {
    id: 'photo-2', uri: 'file:///photo.jpg', fileName: 'photo.jpg',
    mimeType: 'image/jpeg', type: 'image' as const, width: 4000, height: 3000,
  };

  await compressChatMedia(photo, undefined, false);
  expect(__mock.resize).toHaveBeenLastCalledWith({width: 960});
  expect(__mock.saveAsync).toHaveBeenLastCalledWith({compress: 0.68, format: 'jpeg'});

  await compressChatMedia(photo, undefined, true);
  expect(__mock.resize.mock.calls.at(-1)[0].width).toBeGreaterThanOrEqual(1920);
  expect(__mock.saveAsync.mock.calls.at(-1)[0].compress).toBeGreaterThanOrEqual(0.84);
});
