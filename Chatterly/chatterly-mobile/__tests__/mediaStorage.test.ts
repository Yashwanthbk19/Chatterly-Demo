import * as FileSystem from 'expo-file-system/legacy';
import {getDeviceStorageStatistics} from '../src/services/mediaStorage';

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/', documentDirectory: 'file:///documents/',
  getTotalDiskCapacityAsync: jest.fn(async () => 100000),
  getFreeDiskStorageAsync: jest.fn(async () => 40000),
  readDirectoryAsync: jest.fn(async uri => uri.includes('documents') ? ['received.mp4'] : ['thumbnail.jpg']),
  getInfoAsync: jest.fn(async uri => ({exists: true, isDirectory: false, size: uri.endsWith('.mp4') ? 4096 : 1024})),
}));

test('device usage includes saved documents as well as the temporary media cache', async () => {
  await expect(getDeviceStorageStatistics()).resolves.toEqual({capacity: 100000, free: 40000, used: 60000, cache: 1024, app: 5120});
  expect(FileSystem.readDirectoryAsync).toHaveBeenCalledWith('file:///documents/');
});
