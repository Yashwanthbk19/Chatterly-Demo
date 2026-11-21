import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import '../src/services/notificationService';

jest.mock('../src/services/chatApi', () => ({}));
jest.mock('../src/services/notificationApi', () => ({}));
jest.mock('../src/services/callRingtone', () => ({playNotificationTone: jest.fn()}));
jest.mock('../src/services/notificationVibration', () => ({vibrateNotification: jest.fn()}));
jest.mock('../src/services/conversationPreferences', () => ({getConversationMuted: async () => false}));

test.each([true, false])('message banners follow popupPreview=%s while list alerts remain enabled', async popupPreview => {
  await AsyncStorage.setItem('chatterly.notification-preferences.v1', JSON.stringify({popupPreview}));
  const handler = jest.mocked(Notifications.setNotificationHandler).mock.calls[0][0]!;
  const result = await handler.handleNotification({request: {content: {title: 'Sender', body: 'Private text', data: {chatId: 'chat'}}}} as never);
  expect(result.shouldShowBanner).toBe(popupPreview);
  expect(result.shouldShowList).toBe(true);
  expect(result.priority).toBe(popupPreview
    ? Notifications.AndroidNotificationPriority.HIGH
    : Notifications.AndroidNotificationPriority.LOW);
});
