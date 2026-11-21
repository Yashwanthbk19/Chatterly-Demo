import AsyncStorage from '@react-native-async-storage/async-storage';
import {getSession} from './sessionStore';

const PREFIX = 'chatterly.conversation-preferences.v1';

function keyFor(chatId: string) {
  return `${PREFIX}.${encodeURIComponent(String(getSession()?.user?.id || 'anonymous'))}.${encodeURIComponent(chatId)}`;
}

export async function getConversationMuted(chatId: string): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(keyFor(chatId));
    return value === 'muted';
  } catch { return false; }
}

export async function setConversationMuted(chatId: string, muted: boolean): Promise<void> {
  if (muted) await AsyncStorage.setItem(keyFor(chatId), 'muted');
  else await AsyncStorage.removeItem(keyFor(chatId));
}
