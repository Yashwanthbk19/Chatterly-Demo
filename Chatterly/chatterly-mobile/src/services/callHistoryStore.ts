import AsyncStorage from '@react-native-async-storage/async-storage';
import {getSession} from './sessionStore';

const key = () => `chatterly.hidden-call-history.v1:${getSession()?.user?.id || 'anonymous'}`;

export async function loadHiddenCallIds(): Promise<Set<string>> {
  try {
    const stored = await AsyncStorage.getItem(key());
    const parsed = stored ? JSON.parse(stored) : [];
    return new Set(Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : []);
  } catch {
    return new Set();
  }
}

export async function hideCallIds(callIds: Iterable<string>): Promise<Set<string>> {
  const hidden = await loadHiddenCallIds();
  Array.from(callIds).map(String).filter(Boolean).forEach(callId => hidden.add(callId));
  await AsyncStorage.setItem(key(), JSON.stringify(Array.from(hidden)));
  return hidden;
}
