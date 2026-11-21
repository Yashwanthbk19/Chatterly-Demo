import AsyncStorage from '@react-native-async-storage/async-storage';
import {apiRequest} from '../api/client';
import {API_BASE_URL} from '../config/api';
import {getSession, getToken} from './sessionStore';
import type {DisappearingMessageDuration} from './privacyApi';
import type {ChatMessage} from '../types/chat';

export const DISAPPEARING_TIMER_EVENT_PREFIX = '[chatterly:disappearing-message-timer]';

export const DISAPPEARING_TIMER_OPTIONS: DisappearingMessageDuration[] = ['off', '24h', '7d', '30d'];

function authenticatedHeaders(): Record<string, string> {
  const token = getToken();
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...(token ? {Authorization: `Bearer ${token}`} : {}),
  };
}

export function normalizeDisappearingTimer(value: unknown): DisappearingMessageDuration {
  return value === '24h' || value === '7d' || value === '30d' ? value : 'off';
}

export function timerLabel(timer: DisappearingMessageDuration): string {
  if (timer === '24h') { return '24 Hours'; }
  if (timer === '7d') { return '7 Days'; }
  if (timer === '30d') { return '30 Days'; }
  return 'Off';
}

export function timerSentence(timer: DisappearingMessageDuration): string {
  if (timer === '24h') { return '24 hours'; }
  if (timer === '7d') { return '7 days'; }
  if (timer === '30d') { return '30 days'; }
  return 'off';
}

export function buildDisappearingTimerEventText(timer: DisappearingMessageDuration): string {
  return `${DISAPPEARING_TIMER_EVENT_PREFIX}:${timer}`;
}

export function parseDisappearingTimerEventText(text: string): DisappearingMessageDuration | null {
  if (!text.startsWith(`${DISAPPEARING_TIMER_EVENT_PREFIX}:`)) { return null; }
  return normalizeDisappearingTimer(text.slice(DISAPPEARING_TIMER_EVENT_PREFIX.length + 1));
}

export function disappearingTimerEventCopy(timer: DisappearingMessageDuration): {title: string; body: string} {
  if (timer === 'off') {
    return {
      title: 'Disappearing messages were turned off.',
      body: 'New messages in this chat will no longer be deleted automatically.',
    };
  }
  return {
    title: 'Disappearing message timer updated.',
    body: `New messages will now be deleted after ${timerSentence(timer)}.`,
  };
}

const chatTimerKey = (chatId: string) => `chat.disappearingTimer.${chatId}`;
const clearedAtKey = (chatId: string) => `chat.disappearingTimer.clearedAt.${chatId}`;
const clearListeners = new Set<(chatId: string, clearedAt: number) => void>();

export async function getChatDisappearingTimerClearedAt(chatId: string): Promise<number> {
  return Number(await AsyncStorage.getItem(clearedAtKey(chatId))) || 0;
}

export function subscribeToDisappearingTimerCleared(listener: (chatId: string, clearedAt: number) => void): () => void {
  clearListeners.add(listener);
  return () => { clearListeners.delete(listener); };
}

/** Keep message history, but stop presenting superseded timers as active. */
export function visibleDisappearingTimerMessages(messages: ChatMessage[], clearedAt = 0): ChatMessage[] {
  const cutoff = messages.reduce((latest, message) =>
    message.systemEventType === 'disappearing_timer' && message.disappearingTimer === 'off'
      ? Math.max(latest, Date.parse(message.createdAt) || 0)
      : latest, clearedAt);
  return messages.filter(message => message.systemEventType !== 'disappearing_timer' ||
    (message.disappearingTimer !== 'off' && Date.parse(message.createdAt) > cutoff));
}

export async function getStoredChatDisappearingTimer(chatId: string): Promise<DisappearingMessageDuration> {
  const value = await AsyncStorage.getItem(chatTimerKey(chatId));
  return normalizeDisappearingTimer(value);
}

export async function setStoredChatDisappearingTimer(chatId: string, timer: DisappearingMessageDuration, clearedAt = Date.now()): Promise<void> {
  if (timer === 'off') {
    await AsyncStorage.multiSet([[chatTimerKey(chatId), timer], [clearedAtKey(chatId), String(clearedAt)]]);
    clearListeners.forEach(listener => listener(chatId, clearedAt));
  } else {
    await AsyncStorage.setItem(chatTimerKey(chatId), timer);
  }
}

export async function setChatDisappearingTimer(receiver: string, timer: DisappearingMessageDuration): Promise<void> {
  const sender = String(getSession()?.user?.id || '').trim();
  const normalizedReceiver = String(receiver || '').trim();
  if (!sender) { throw new Error('Your session has expired. Please sign in again.'); }
  if (!normalizedReceiver) { throw new Error('A chat participant is required.'); }
  await apiRequest(`${API_BASE_URL}/chats/set-disappearing-timer`, {
    method: 'POST',
    headers: authenticatedHeaders(),
    body: JSON.stringify({sender, receiver: normalizedReceiver, timer}),
  });
}
