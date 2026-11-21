// Sprint 3's push notification flow: when notifications arrive (or the app is
// opened from one) the unread count must show up as a badge. The app-icon badge
// depends on the phone's launcher, so the Chats tab shows the same count too.

type Service = typeof import('../src/services/notificationService');
type Badge = typeof import('../src/services/unreadBadge');

function loadService(options: {setBadgeCountAsync: jest.Mock; unreadCounts: number[]; correctedUnreadCounts?: number[]}) {
  jest.resetModules();
  jest.doMock('expo-notifications', () => ({
    setNotificationHandler: jest.fn(),
    setBadgeCountAsync: options.setBadgeCountAsync,
    getBadgeCountAsync: jest.fn().mockResolvedValue(0),
  }));
  jest.doMock('../src/services/chatApi', () => ({
    getChatList: jest.fn().mockResolvedValue([]),
    enrichChatList: jest.fn(async rows => rows.map((row: {unreadCount: number}, index: number) => ({
      ...row,
      unreadCount: options.correctedUnreadCounts?.[index] ?? row.unreadCount,
    }))),
    // One row per count, so the sum is what the server says is unread.
    normalizeChatList: jest.fn(() => options.unreadCounts.map((unreadCount, index) => ({
      id: `chat-${index}`, unreadCount, markedUnread: false, contact: {userId: `user-${index}`, name: 'User'},
    }))),
  }));
  return {
    service: require('../src/services/notificationService') as Service,
    badge: require('../src/services/unreadBadge') as Badge,
  };
}

test('a received notification puts the server unread total on the Chats tab and the app icon', async () => {
  const setBadgeCountAsync = jest.fn().mockResolvedValue(true);
  const {service, badge} = loadService({setBadgeCountAsync, unreadCounts: [2, 0, 3]});
  expect(badge.getUnreadChatCount()).toBe(0);

  await expect(service.syncApplicationBadge()).resolves.toBe(5);

  expect(badge.getUnreadChatCount()).toBe(5);
  expect(setBadgeCountAsync).toHaveBeenCalledWith(5);
});

test('the Chats tab still shows the count when the launcher cannot draw an icon badge', async () => {
  // expo-notifications reports an unsupported launcher by failing the call.
  const setBadgeCountAsync = jest.fn().mockRejectedValue(new Error('Could not set badge count'));
  const {service, badge} = loadService({setBadgeCountAsync, unreadCounts: [4]});

  await service.syncApplicationBadge();

  expect(badge.getUnreadChatCount()).toBe(4);
});

test('reading everything clears the Chats tab badge', async () => {
  const options = {setBadgeCountAsync: jest.fn().mockResolvedValue(true), unreadCounts: [1]};
  const {service, badge} = loadService(options);
  await service.syncApplicationBadge();
  expect(badge.getUnreadChatCount()).toBe(1);

  // The same app session: the server now reports nothing unread.
  options.unreadCounts = [0, 0];
  await service.syncApplicationBadge();

  expect(badge.getUnreadChatCount()).toBe(0);
});

test('an outgoing offline-call copy is not republished as an unread app badge', async () => {
  const setBadgeCountAsync = jest.fn().mockResolvedValue(true);
  const {service, badge} = loadService({
    setBadgeCountAsync,
    unreadCounts: [1],
    correctedUnreadCounts: [0],
  });

  await expect(service.syncApplicationBadge()).resolves.toBe(0);

  expect(badge.getUnreadChatCount()).toBe(0);
  expect(setBadgeCountAsync).toHaveBeenCalledWith(0);
});
