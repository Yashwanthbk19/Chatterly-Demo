const subscription = () => ({remove: jest.fn()});

module.exports = {
  AndroidNotificationPriority: {HIGH: 'high'},
  AndroidImportance: {HIGH: 6},
  AndroidNotificationVisibility: {PRIVATE: 2, PUBLIC: 1},
  setNotificationHandler: jest.fn(),
  scheduleNotificationAsync: jest.fn(async () => 'call-notification'),
  setNotificationChannelAsync: jest.fn(async () => null),
  setNotificationCategoryAsync: jest.fn(async () => null),
  getPermissionsAsync: jest.fn(async () => ({granted: false})),
  requestPermissionsAsync: jest.fn(async () => ({granted: false})),
  getDevicePushTokenAsync: jest.fn(async () => ({type: 'android', data: 'device-token'})),
  addNotificationResponseReceivedListener: jest.fn(subscription),
  addNotificationReceivedListener: jest.fn(subscription),
  addPushTokenListener: jest.fn(subscription),
  getLastNotificationResponseAsync: jest.fn(async () => null),
  clearLastNotificationResponseAsync: jest.fn(async () => undefined),
  setBadgeCountAsync: jest.fn(async () => true),
  getBadgeCountAsync: jest.fn(async () => 0),
  getPresentedNotificationsAsync: jest.fn(async () => []),
  dismissNotificationAsync: jest.fn(async () => undefined),
};
