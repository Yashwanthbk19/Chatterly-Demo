import AsyncStorage from '@react-native-async-storage/async-storage';
import {useEffect, useState} from 'react';
import {getCallHistory, type CallHistoryItem} from './callHistoryApi';
import {getSession} from './sessionStore';
import {isMissedCallStatus} from '../utils/callStatus';

// Sprint 9 Story 4's "Missed Call Badge": the Calls tab counts the missed calls
// the user has not looked at yet. The backend has no "seen" flag for a call, so
// "seen" is a per-account marker on this device: opening the Calls tab moves it
// to now, and the badge counts missed incoming calls that happened after it.

const STORAGE_PREFIX = 'chatterly.calls-seen-at.v1';
/**
 * With no marker yet - a fresh install, or the first sign-in on this device -
 * the badge reaches back one day, so a call missed shortly before signing in
 * still shows without the whole history lighting up the tab.
 */
const FIRST_RUN_LOOKBACK_MS = 24 * 60 * 60 * 1000;

type Listener = (count: number) => void;

let count = 0;
const listeners = new Set<Listener>();

const storageKey = () => `${STORAGE_PREFIX}:${getSession()?.user?.id || 'anonymous'}`;

function publish(next: number): void {
  const value = Math.max(0, Math.floor(next));
  if (value === count) { return; }
  count = value;
  listeners.forEach(listener => listener(count));
}

/**
 * A call that rang on this account and was never picked up. Declining is a
 * choice the user made on purpose, so a rejected call is not "missed" here
 * even though the history paints it red.
 */
export function isMissedIncomingCall(call: Pick<CallHistoryItem, 'direction' | 'status' | 'isGroup'>): boolean {
  return !call.isGroup && call.direction === 'incoming' && isMissedCallStatus(call.status);
}

export function countUnseenMissedCalls(history: CallHistoryItem[], seenAt: number): number {
  return history.filter(call => {
    if (!isMissedIncomingCall(call)) { return false; }
    const at = Date.parse(call.occurredAt);
    return Number.isFinite(at) && at > seenAt;
  }).length;
}

async function readSeenAt(): Promise<number> {
  try {
    const stored = Number(await AsyncStorage.getItem(storageKey()));
    if (Number.isFinite(stored) && stored > 0) { return stored; }
  } catch {
    // An unreadable marker behaves like a first run.
  }
  return Date.now() - FIRST_RUN_LOOKBACK_MS;
}

/** The badge as last computed; 0 until the first refresh. */
export function getMissedCallCount(): number {
  return count;
}

/**
 * Recounts from the call history. Pass a history that was just fetched to avoid
 * a second request; otherwise this reads `GET /api/call/history`.
 */
export async function refreshMissedCallBadge(history?: CallHistoryItem[]): Promise<number> {
  if (!getSession()?.token) {
    publish(0);
    return 0;
  }
  try {
    const [calls, seenAt] = await Promise.all([history ? Promise.resolve(history) : getCallHistory(), readSeenAt()]);
    const unseen = countUnseenMissedCalls(calls, seenAt);
    publish(unseen);
    return unseen;
  } catch {
    // Offline or signed out: keep whatever the tab already shows.
    return count;
  }
}

/** The user is looking at the Calls tab: everything up to now has been seen. */
export async function markCallsSeen(): Promise<void> {
  publish(0);
  try {
    await AsyncStorage.setItem(storageKey(), String(Date.now()));
  } catch {
    // The badge clears for this session even if the marker cannot be stored.
  }
}

/** A call just went unanswered on this device; reflect it before the next refresh. */
export function noteMissedCall(): void {
  publish(count + 1);
}

/** Signing out must not carry one account's badge onto the next. */
export function resetMissedCallBadge(): void {
  publish(0);
}

export function subscribeToMissedCallCount(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useMissedCallCount(): number {
  const [value, setValue] = useState(count);
  useEffect(() => {
    setValue(count);
    return subscribeToMissedCallCount(setValue);
  }, []);
  return value;
}
