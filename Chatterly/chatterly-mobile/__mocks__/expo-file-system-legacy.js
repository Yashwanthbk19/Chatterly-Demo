module.exports = {
  cacheDirectory: 'file:///cache/',
  copyAsync: jest.fn(async () => undefined),
  getContentUriAsync: jest.fn(async uri => `content://chatterly/${encodeURIComponent(uri)}`),
  FileSystemUploadType: {BINARY_CONTENT: 0, MULTIPART: 1},
  FileSystemSessionType: {FOREGROUND: 0, BACKGROUND: 1},
  getInfoAsync: jest.fn(async uri => ({exists: true, isDirectory: false, uri, size: 1024})),
  createUploadTask: jest.fn(() => ({
    uploadAsync: jest.fn(async () => ({status: 200, body: '{}', headers: {}})),
    cancelAsync: jest.fn(async () => {}),
  })),
};
