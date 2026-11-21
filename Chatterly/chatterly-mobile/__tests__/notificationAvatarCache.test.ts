import AsyncStorage from '@react-native-async-storage/async-storage';
import {cacheNotificationAvatars, NOTIFICATION_AVATAR_CACHE_KEY} from '../src/services/notificationAvatarCache';

beforeEach(async () => {
  await AsyncStorage.clear();
});

test('persists notification avatars by user id and normalized display name', async () => {
  await cacheNotificationAvatars([{
    userId: 'rahul-1', name: 'Rahul Kumar', thumbnail: 'https://cdn.example/rahul.jpg',
  }]);
  expect(JSON.parse(await AsyncStorage.getItem(NOTIFICATION_AVATAR_CACHE_KEY) || '{}')).toEqual({
    'id:rahul-1': 'https://cdn.example/rahul.jpg',
    'name:rahul kumar': 'https://cdn.example/rahul.jpg',
  });
});

test('merges newly loaded contacts without discarding previous avatars', async () => {
  await cacheNotificationAvatars([{userId: 'one', name: 'One', thumbnail: 'https://cdn.example/one.jpg'}]);
  await cacheNotificationAvatars([{userId: 'two', name: 'Two', thumbnail: 'https://cdn.example/two.jpg'}]);
  const cache = JSON.parse(await AsyncStorage.getItem(NOTIFICATION_AVATAR_CACHE_KEY) || '{}');
  expect(cache['id:one']).toBe('https://cdn.example/one.jpg');
  expect(cache['id:two']).toBe('https://cdn.example/two.jpg');
});
