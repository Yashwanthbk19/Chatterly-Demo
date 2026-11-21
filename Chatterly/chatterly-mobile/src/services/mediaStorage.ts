import * as FileSystem from 'expo-file-system/legacy';

export type DeviceStorageStatistics = {
  capacity: number;
  free: number;
  used: number;
  cache: number;
  /** App documents plus temporary cache, measured on this device. */
  app?: number;
};

async function directorySize(uri: string): Promise<number> {
  try {
    const children = await FileSystem.readDirectoryAsync(uri);
    const sizes = await Promise.all(children.map(async child => {
      const childUri = `${uri.replace(/\/$/, '')}/${child}`;
      const info = await FileSystem.getInfoAsync(childUri);
      if (!info.exists) { return 0; }
      if (info.isDirectory) { return directorySize(childUri); }
      return typeof info.size === 'number' ? info.size : 0;
    }));
    return sizes.reduce((sum, size) => sum + size, 0);
  } catch {
    return 0;
  }
}

export async function getDeviceStorageStatistics(): Promise<DeviceStorageStatistics> {
  const cacheDirectory = FileSystem.cacheDirectory || '';
  const [capacity, free, cache, documents] = await Promise.all([
    FileSystem.getTotalDiskCapacityAsync?.().catch(() => 0) ?? Promise.resolve(0),
    FileSystem.getFreeDiskStorageAsync?.().catch(() => 0) ?? Promise.resolve(0),
    cacheDirectory ? directorySize(cacheDirectory) : Promise.resolve(0),
    FileSystem.documentDirectory ? directorySize(FileSystem.documentDirectory) : Promise.resolve(0),
  ]);
  const safeCapacity = Number.isFinite(capacity) ? Math.max(0, capacity) : 0;
  const safeFree = Number.isFinite(free) ? Math.max(0, free) : 0;
  return {capacity: safeCapacity, free: safeFree, used: Math.max(0, safeCapacity - safeFree), cache, app: cache + documents};
}

/** Removes temporary files only; documents, sessions and conversations remain intact. */
export async function clearTemporaryMediaCache(): Promise<void> {
  const cacheDirectory = FileSystem.cacheDirectory;
  if (!cacheDirectory) { return; }
  const children = await FileSystem.readDirectoryAsync(cacheDirectory);
  await Promise.all(children.map(child => FileSystem.deleteAsync(
    `${cacheDirectory.replace(/\/$/, '')}/${child}`,
    {idempotent: true},
  )));
}

export function formatStorage(bytes: number, fractionDigits = 1): string {
  const value = Number.isFinite(bytes) ? Math.max(0, bytes) : 0;
  if (value >= 1024 ** 4) { return `${(value / 1024 ** 4).toFixed(fractionDigits)} TB`; }
  if (value >= 1024 ** 3) { return `${(value / 1024 ** 3).toFixed(fractionDigits)} GB`; }
  if (value >= 1024 ** 2) { return `${(value / 1024 ** 2).toFixed(fractionDigits)} MB`; }
  if (value >= 1024) { return `${(value / 1024).toFixed(fractionDigits)} KB`; }
  return `${Math.round(value)} B`;
}
