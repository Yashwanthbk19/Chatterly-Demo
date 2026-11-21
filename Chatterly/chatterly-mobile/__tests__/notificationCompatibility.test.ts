test('authentication remains usable when the native notification runtime is unavailable', async () => {
  jest.resetModules();
  jest.doMock('expo-notifications', () => ({}));

  const service = require('../src/services/notificationService') as typeof import('../src/services/notificationService');
  const cleanup = service.startNotificationLifecycle(jest.fn());

  expect(typeof cleanup).toBe('function');
  expect(() => cleanup()).not.toThrow();
  expect(() => service.setApplicationBadge(3)).not.toThrow();
  await expect(service.syncApplicationBadge()).resolves.toBe(0);
});

test('Expo Go never imports the unsupported Android push module', () => {
  jest.resetModules();
  const unsupportedModule = jest.fn(() => {
    throw new Error('Android Push notifications functionality provided by expo-notifications was removed from Expo Go');
  });
  jest.doMock('expo-constants', () => ({
    __esModule: true,
    default: {appOwnership: 'expo'},
  }));
  jest.doMock('expo-notifications', unsupportedModule);

  let service: typeof import('../src/services/notificationService') | undefined;
  expect(() => {
    service = require('../src/services/notificationService');
  }).not.toThrow();
  expect(unsupportedModule).not.toHaveBeenCalled();
  expect(typeof service?.startNotificationLifecycle).toBe('function');
});
