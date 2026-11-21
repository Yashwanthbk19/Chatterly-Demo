import AsyncStorage from '@react-native-async-storage/async-storage';
import type {CallHistoryItem} from '../src/services/callHistoryApi';
import {
  countUnseenMissedCalls,
  getMissedCallCount,
  isMissedIncomingCall,
  markCallsSeen,
  refreshMissedCallBadge,
  resetMissedCallBadge,
  subscribeToMissedCallCount,
} from '../src/services/missedCallBadge';

jest.mock('../src/services/callHistoryApi', () => ({getCallHistory: jest.fn()}));
jest.mock('../src/services/sessionStore', () => ({getSession: () => ({token: 'jwt', user: {id: 'me'}})}));

const call = (overrides: Partial<CallHistoryItem>): CallHistoryItem => ({
  id: Math.random().toString(36).slice(2),
  contactId: 'peer',
  contactName: 'Peer',
  type: 'audio',
  direction: 'incoming',
  status: 'missed',
  duration: 0,
  occurredAt: new Date().toISOString(),
  isGroup: false,
  ...overrides,
});

beforeEach(async () => {
  await AsyncStorage.clear();
  resetMissedCallBadge();
});

test('only an incoming one-to-one call nobody answered counts as missed', () => {
  expect(isMissedIncomingCall(call({}))).toBe(true);
  expect(isMissedIncomingCall(call({status: 'not_answered'}))).toBe(true);
  // Declining is a choice, and an outgoing call was never ours to miss.
  expect(isMissedIncomingCall(call({status: 'rejected'}))).toBe(false);
  expect(isMissedIncomingCall(call({direction: 'outgoing'}))).toBe(false);
  expect(isMissedIncomingCall(call({status: 'completed'}))).toBe(false);
  expect(isMissedIncomingCall(call({isGroup: true}))).toBe(false);
});

test('counts only what happened after the Calls tab was last looked at', () => {
  const seenAt = Date.parse('2026-10-12T10:00:00Z');
  const history = [
    call({occurredAt: '2026-10-12T10:05:00Z'}),
    call({occurredAt: '2026-10-12T09:55:00Z'}),
    call({occurredAt: '2026-10-12T10:06:00Z', status: 'completed'}),
  ];
  expect(countUnseenMissedCalls(history, seenAt)).toBe(1);
});

test('a refresh publishes the count, and opening the Calls tab clears it', async () => {
  const counts: number[] = [];
  const unsubscribe = subscribeToMissedCallCount(count => counts.push(count));
  const now = Date.now();
  await refreshMissedCallBadge([call({occurredAt: new Date(now - 60_000).toISOString()}), call({occurredAt: new Date(now - 120_000).toISOString()})]);
  expect(getMissedCallCount()).toBe(2);

  await markCallsSeen();
  expect(getMissedCallCount()).toBe(0);
  // The marker is remembered, so the same history no longer counts.
  await refreshMissedCallBadge([call({occurredAt: new Date(now - 60_000).toISOString()})]);
  expect(getMissedCallCount()).toBe(0);
  expect(counts).toEqual([2, 0]);
  unsubscribe();
});

test('a first run only reaches back one day', async () => {
  await refreshMissedCallBadge([
    call({occurredAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()}),
    call({occurredAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()}),
  ]);
  expect(getMissedCallCount()).toBe(1);
});
