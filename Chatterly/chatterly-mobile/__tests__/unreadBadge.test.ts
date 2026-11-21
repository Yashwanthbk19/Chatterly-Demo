import {
  getUnreadChatCount,
  publishUnreadChatCount,
  resetUnreadChatCount,
  subscribeToUnreadChatCount,
  unreadMessageCount,
} from '../src/services/unreadBadge';

afterEach(() => {
  resetUnreadChatCount();
});

test('counts the unread messages across the inbox', () => {
  expect(unreadMessageCount([])).toBe(0);
  expect(unreadMessageCount([{unreadCount: 3}, {unreadCount: 0}, {unreadCount: 2}])).toBe(5);
  expect(unreadMessageCount([{unreadCount: -4}, {unreadCount: 1}])).toBe(1);
});

test('publishes the count to subscribers once per change', () => {
  const listener = jest.fn();
  const unsubscribe = subscribeToUnreadChatCount(listener);

  publishUnreadChatCount(4);
  publishUnreadChatCount(4);
  publishUnreadChatCount(7);

  expect(getUnreadChatCount()).toBe(7);
  expect(listener.mock.calls).toEqual([[4], [7]]);

  unsubscribe();
  publishUnreadChatCount(1);
  expect(listener).toHaveBeenCalledTimes(2);
});

test('never shows a negative or fractional count, and clears when signing out', () => {
  publishUnreadChatCount(-5);
  expect(getUnreadChatCount()).toBe(0);
  publishUnreadChatCount(2.9);
  expect(getUnreadChatCount()).toBe(2);
  publishUnreadChatCount(Number.NaN);
  expect(getUnreadChatCount()).toBe(0);

  publishUnreadChatCount(9);
  resetUnreadChatCount();
  expect(getUnreadChatCount()).toBe(0);
});
