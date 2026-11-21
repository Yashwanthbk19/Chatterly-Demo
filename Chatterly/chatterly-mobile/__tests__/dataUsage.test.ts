import AsyncStorage from '@react-native-async-storage/async-storage';
import {createUsageTransfer, flushDataUsage, getDataUsage, payloadBytes, recordDataUsage, recordMessageData, resetDataUsage, trackCallDataUsage} from '../src/services/dataUsage';

let mockOwner = '', sequence = 0;
jest.mock('../src/services/sessionStore', () => ({getSession: () => ({user: {id: mockOwner}})}));
const tick = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
beforeEach(async () => { mockOwner = `usage-${++sequence}`; await AsyncStorage.clear(); });
afterEach(async () => { await flushDataUsage(); jest.restoreAllMocks(); jest.useRealTimers(); });

test('records independent sent and received counters and persists exact bytes per account', async () => {
  recordDataUsage('media', {sent: 1024, received: 2048});
  recordDataUsage('messages', {sent: 32, received: 64});
  recordDataUsage('calls', {sent: 5000, received: 8000});
  await flushDataUsage();
  const saved = JSON.parse((await AsyncStorage.getItem(`chatterly.data-usage.v1:${mockOwner}`))!);
  expect(saved).toEqual(expect.objectContaining({media: {sent: 1024, received: 2048}, messages: {sent: 32, received: 64}, calls: {sent: 5000, received: 8000}}));
  expect(getDataUsage()).toEqual(saved);
});

test('loading previous totals preserves transfers recorded during the storage read', async () => {
  let resolveRead!: (value: string) => void;
  jest.spyOn(AsyncStorage, 'getItem').mockImplementationOnce(() => new Promise(resolve => { resolveRead = resolve; }));
  recordDataUsage('media', {received: 100});
  resolveRead(JSON.stringify({since: '2026-11-01T00:00:00Z', media: {sent: 20, received: 200}}));
  await flushDataUsage();
  expect(getDataUsage().media).toEqual({sent: 20, received: 300});
});

test('reset clears persisted counters and a delayed read cannot restore the old values', async () => {
  let resolveRead!: (value: string) => void;
  jest.spyOn(AsyncStorage, 'getItem').mockImplementationOnce(() => new Promise(resolve => { resolveRead = resolve; }));
  recordDataUsage('messages', {sent: 100});
  const resetting = resetDataUsage();
  resolveRead(JSON.stringify({media: {received: 999}, messages: {sent: 999}}));
  await resetting;
  expect(getDataUsage().messages).toEqual({sent: 0, received: 0});
  expect(getDataUsage().media).toEqual({sent: 0, received: 0});
  recordDataUsage('messages', {sent: 10});
  expect(getDataUsage().messages.sent).toBe(10);
});

test('progress counts only new bytes, while retries count their own transferred bytes', () => {
  const transfer = createUsageTransfer('received');
  [100, 100, 90, 200].forEach(transfer);
  createUsageTransfer('received')(50);
  expect(getDataUsage().media.received).toBe(250);
});

test('an in-flight transfer stays with its original account after switching accounts', async () => {
  const first = mockOwner;
  const transfer = createUsageTransfer('sent');
  mockOwner = 'second-user';
  transfer(500);
  expect(getDataUsage().media.sent).toBe(0);
  await flushDataUsage();
  expect(JSON.parse((await AsyncStorage.getItem(`chatterly.data-usage.v1:${first}`))!).media.sent).toBe(500);
});

test('message payloads count UTF-8 bytes rather than characters', () => {
  const text = 'Aé中🐱';
  expect(payloadBytes(text)).toBe(10);
  recordMessageData('received', {text});
  expect(getDataUsage().messages.received).toBe(21);
});

test('ignores invalid and negative measurements', () => {
  recordDataUsage('calls', {sent: -10, received: NaN});
  recordDataUsage('media', {sent: Infinity});
  expect(getDataUsage().calls).toEqual({sent: 0, received: 0});
  expect(getDataUsage().media.sent).toBe(0);
});

test('call statistics count RTP deltas once and reset does not re-add the old call total', async () => {
  jest.useFakeTimers();
  const stats = (sent: number, received: number) => new Map<string, Record<string, unknown>>([
    ['out', {id: 'out', type: 'outbound-rtp', bytesSent: sent}],
    ['in', {id: 'in', type: 'inbound-rtp', bytesReceived: received}],
    ['transport', {id: 'transport', type: 'transport', bytesSent: sent, bytesReceived: received}],
  ]);
  const getStats = jest.fn(async () => stats(100, 200));
  const stop = trackCallDataUsage({getStats});
  try {
    await tick();
    expect(getDataUsage().calls).toEqual({sent: 100, received: 200});
    getStats.mockResolvedValue(stats(150, 280));
    jest.advanceTimersByTime(5000); await tick();
    expect(getDataUsage().calls).toEqual({sent: 150, received: 280});
    await resetDataUsage();
    jest.advanceTimersByTime(5000); await tick();
    expect(getDataUsage().calls).toEqual({sent: 0, received: 0});
    getStats.mockResolvedValue(stats(170, 300));
    jest.advanceTimersByTime(5000); await tick();
    expect(getDataUsage().calls).toEqual({sent: 20, received: 20});
  } finally { stop(); await tick(); }
});
