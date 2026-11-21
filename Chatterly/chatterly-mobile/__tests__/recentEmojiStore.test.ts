import AsyncStorage from '@react-native-async-storage/async-storage';
import {loadRecentEmojis, MAX_RECENT_EMOJIS, recordRecentEmoji} from '../src/services/recentEmojiStore';
import {clearSession, saveSession} from '../src/services/sessionStore';

const signIn = (userId: string) => saveSession({
  token: `token-${userId}`,
  user: {id: userId, name: 'Ananya'},
  isProfileComplete: true,
} as Parameters<typeof saveSession>[0]);

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
  signIn('user-1');
});

afterEach(() => {
  clearSession();
});

test('starts empty and remembers what was picked', async () => {
  expect(await loadRecentEmojis()).toEqual([]);

  await recordRecentEmoji('🎉');

  expect(await loadRecentEmojis()).toEqual(['🎉']);
});

test('the newest pick leads and is never listed twice', async () => {
  await recordRecentEmoji('🎉');
  await recordRecentEmoji('👍');
  const list = await recordRecentEmoji('🎉');

  expect(list).toEqual(['🎉', '👍']);
  expect(await loadRecentEmojis()).toEqual(['🎉', '👍']);
});

test('the history stops growing at the size the grid can show', async () => {
  const catalogue = ['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇'];
  for (let index = 0; index < MAX_RECENT_EMOJIS + 6; index += 1) {
    await recordRecentEmoji(`${catalogue[index % catalogue.length]}${index}`);
  }

  expect(await loadRecentEmojis()).toHaveLength(MAX_RECENT_EMOJIS);
});

// Two people sharing a phone should not see each other's picks.
test('history is kept per signed-in user', async () => {
  await recordRecentEmoji('🎉');
  signIn('user-2');

  expect(await loadRecentEmojis()).toEqual([]);

  await recordRecentEmoji('🔥');
  signIn('user-1');

  expect(await loadRecentEmojis()).toEqual(['🎉']);
});

test('a signed-out picker still works, it just cannot persist', async () => {
  clearSession();

  expect(await loadRecentEmojis()).toEqual([]);
  expect(await recordRecentEmoji('🎉')).toEqual(['🎉']);
  expect(AsyncStorage.setItem).not.toHaveBeenCalled();
});

test('unreadable history never keeps the picker from opening', async () => {
  jest.mocked(AsyncStorage.getItem).mockResolvedValueOnce('not json');
  expect(await loadRecentEmojis()).toEqual([]);

  jest.mocked(AsyncStorage.getItem).mockResolvedValueOnce(JSON.stringify({not: 'an array'}));
  expect(await loadRecentEmojis()).toEqual([]);

  jest.mocked(AsyncStorage.getItem).mockRejectedValueOnce(new Error('storage unavailable'));
  expect(await loadRecentEmojis()).toEqual([]);
});
