import AsyncStorage from '@react-native-async-storage/async-storage';
import type {ChatMessage} from '../types/chat';
import {getSession} from './sessionStore';

const STORE_VERSION = 1;
const KEY_PREFIX = `chatterly.messages.v${STORE_VERSION}`;

type StoredThread = {
  version: number;
  chatId: string;
  updatedAt: string;
  messages: ChatMessage[];
};

function currentUserId(): string {
  return String(getSession()?.user?.id || '');
}

function keyFor(chatId: string): string | null {
  const userId = currentUserId();
  if (!userId || !chatId) { return null; }
  return `${KEY_PREFIX}.${encodeURIComponent(userId)}.${encodeURIComponent(chatId)}`;
}

function isMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== 'object') { return false; }
  const candidate = value as Partial<ChatMessage>;
  return typeof candidate.id === 'string' &&
    typeof candidate.text === 'string' &&
    typeof candidate.createdAt === 'string' &&
    typeof candidate.isOwn === 'boolean';
}

/** Loads the last usable thread snapshot, including unsent queue entries. */
export async function loadStoredMessages(chatId: string): Promise<ChatMessage[]> {
  const key = keyFor(chatId);
  if (!key) { return []; }
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) { return []; }
    const stored = JSON.parse(raw) as Partial<StoredThread>;
    if (stored.version !== STORE_VERSION || stored.chatId !== chatId || !Array.isArray(stored.messages)) {
      await AsyncStorage.removeItem(key);
      return [];
    }
    return stored.messages.filter(isMessage);
  } catch {
    // A corrupt/inaccessible cache must never prevent the cloud thread loading.
    return [];
  }
}

/** Atomically replaces this user's device snapshot for one conversation. */
export async function storeMessages(chatId: string, messages: ChatMessage[]): Promise<void> {
  const key = keyFor(chatId);
  if (!key) { return; }
  const snapshot: StoredThread = {
    version: STORE_VERSION,
    chatId,
    updatedAt: new Date().toISOString(),
    messages,
  };
  await AsyncStorage.setItem(key, JSON.stringify(snapshot));
}

export async function removeStoredThread(chatId: string): Promise<void> {
  const key = keyFor(chatId);
  if (key) { await AsyncStorage.removeItem(key); }
}
