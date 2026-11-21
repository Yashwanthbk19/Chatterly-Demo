import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getChatDisappearingTimerClearedAt,
  getStoredChatDisappearingTimer,
  setStoredChatDisappearingTimer,
  subscribeToDisappearingTimerCleared,
  visibleDisappearingTimerMessages,
} from '../src/services/disappearingMessages';
import type {ChatMessage} from '../src/types/chat';

const timerMessage = (id: string, timer: ChatMessage['disappearingTimer'], createdAt: string): ChatMessage => ({
  id, text: 'Timer updated', createdAt, isOwn: true,
  systemEventType: 'disappearing_timer', disappearingTimer: timer,
});
const enabled = timerMessage('on-1', '24h', '2026-10-22T10:00:00.000Z');
const changed = timerMessage('on-2', '7d', '2026-10-22T10:01:00.000Z');
const disabled = timerMessage('off-1', 'off', '2026-10-22T10:02:00.000Z');
const ordinary: ChatMessage = {id: 'text-1', text: 'Keep this message', isOwn: false, createdAt: enabled.createdAt};

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
});

test('off removes all previous timer cards while preserving conversation messages', () => {
  expect(visibleDisappearingTimerMessages([enabled, ordinary, changed, disabled])).toEqual([ordinary]);
});

test('an off event from the other participant clears timers even if events arrive out of order', () => {
  expect(visibleDisappearingTimerMessages([{...disabled, isOwn: false}, changed, ordinary, enabled])).toEqual([ordinary]);
});

test('cleared timers remain hidden after history reload and only newly enabled timers appear', () => {
  const clearedAt = Date.parse(disabled.createdAt);
  const reenabled = timerMessage('on-3', '30d', '2026-10-22T10:03:00.000Z');
  expect(visibleDisappearingTimerMessages([enabled, ordinary, changed], clearedAt)).toEqual([ordinary]);
  expect(visibleDisappearingTimerMessages([enabled, ordinary, changed, disabled, reenabled], clearedAt)).toEqual([ordinary, reenabled]);
});

test('persists timer clearing and notifies open chats only after storage succeeds', async () => {
  const listener = jest.fn();
  const unsubscribe = subscribeToDisappearingTimerCleared(listener);
  try {
    await setStoredChatDisappearingTimer('chat-1', '7d');
    expect(listener).not.toHaveBeenCalled();
    await setStoredChatDisappearingTimer('chat-1', 'off');
    const clearedAt = await getChatDisappearingTimerClearedAt('chat-1');
    expect(await getStoredChatDisappearingTimer('chat-1')).toBe('off');
    expect(clearedAt).toBeGreaterThan(0);
    expect(listener).toHaveBeenCalledWith('chat-1', clearedAt);
    await setStoredChatDisappearingTimer('chat-1', '24h');
    expect(await getChatDisappearingTimerClearedAt('chat-1')).toBe(clearedAt);
    unsubscribe();
    await setStoredChatDisappearingTimer('chat-1', 'off');
    expect(listener).toHaveBeenCalledTimes(1);
  } finally {
    unsubscribe();
  }
});
