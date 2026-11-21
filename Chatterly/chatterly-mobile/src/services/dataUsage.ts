import AsyncStorage from '@react-native-async-storage/async-storage';
import {getSession} from './sessionStore';

export type UsageCategory = 'calls' | 'media' | 'messages';
export type UsageBytes = {sent: number; received: number};
export type DataUsage = {since: string; calls: UsageBytes; media: UsageBytes; messages: UsageBytes};
type Entry = {value: DataUsage; generation: number; ready: Promise<void>; writing: Promise<void>; timer?: ReturnType<typeof setTimeout>};
const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();
const categories: UsageCategory[] = ['calls', 'media', 'messages'];
const ownerId = () => String(getSession?.()?.user?.id || '');
const keyFor = (owner: string) => `chatterly.data-usage.v1:${owner || 'anonymous'}`;
const bytes = (value: unknown) => Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0;
const empty = (): DataUsage => ({since: new Date().toISOString(), calls: {sent: 0, received: 0}, media: {sent: 0, received: 0}, messages: {sent: 0, received: 0}});
const notify = () => listeners.forEach(listener => listener());

function entryFor(owner: string): Entry {
  const existing = entries.get(owner);
  if (existing) { return existing; }
  const entry: Entry = {value: empty(), generation: 0, ready: Promise.resolve(), writing: Promise.resolve()};
  entries.set(owner, entry);
  entry.ready = (async () => {
    try {
      const stored = JSON.parse((await AsyncStorage.getItem(keyFor(owner))) || 'null');
      if (!stored || entry.generation !== 0) { return; }
      const next = {...entry.value, since: Number.isFinite(Date.parse(stored.since)) ? stored.since : entry.value.since};
      // Transfers can arrive while storage loads. Add those new bytes rather
      // than replacing them with the previous session's totals.
      categories.forEach(category => {
        next[category] = {
          sent: bytes(stored[category]?.sent) + entry.value[category].sent,
          received: bytes(stored[category]?.received) + entry.value[category].received,
        };
      });
      entry.value = next;
      notify();
    } catch { /* Current-session counters remain available offline. */ }
  })();
  return entry;
}

async function persist(owner: string, entry: Entry): Promise<void> {
  await entry.ready;
  const value = JSON.stringify(entry.value);
  entry.writing = entry.writing.then(() => AsyncStorage.setItem(keyFor(owner), value)).catch(() => undefined);
  await entry.writing;
}

export function getDataUsage(): DataUsage { return entryFor(ownerId()).value; }
export function subscribeToDataUsage(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export async function flushDataUsage(): Promise<void> {
  await Promise.all([...entries].map(async ([owner, entry]) => {
    if (entry.timer) { clearTimeout(entry.timer); entry.timer = undefined; }
    await persist(owner, entry);
  }));
}

export function recordDataUsage(category: UsageCategory, usage: Partial<UsageBytes>, owner = ownerId()): void {
  if (!owner) { return; }
  const sent = bytes(usage.sent), received = bytes(usage.received);
  if (!sent && !received) { return; }
  const entry = entryFor(owner);
  entry.value = {...entry.value, [category]: {sent: entry.value[category].sent + sent, received: entry.value[category].received + received}};
  notify();
  if (!entry.timer) {
    entry.timer = setTimeout(() => { entry.timer = undefined; persist(owner, entry).catch(() => undefined); }, 300);
  }
}

export async function resetDataUsage(): Promise<void> {
  const owner = ownerId(), entry = entryFor(owner);
  entry.generation += 1;
  entry.value = empty();
  notify();
  if (entry.timer) { clearTimeout(entry.timer); entry.timer = undefined; }
  await persist(owner, entry);
}

/** Counts cumulative native progress once, including bytes from failed attempts. */
export function createUsageTransfer(direction: keyof UsageBytes): (total: number) => void {
  const owner = ownerId();
  let previous = 0;
  return total => {
    const current = bytes(total);
    if (current <= previous) { return; }
    recordDataUsage('media', {[direction]: current - previous}, owner);
    previous = current;
  };
}

export function payloadBytes(payload: unknown): number {
  try {
    const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
    if (!text) { return 0; }
    let length = 0;
    for (const char of text) {
      const point = char.codePointAt(0)!;
      length += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
    }
    return length;
  } catch { return 0; }
}

export function recordMessageData(direction: keyof UsageBytes, payload: unknown): void {
  recordDataUsage('messages', {[direction]: payloadBytes(payload)});
}

/** Sample actual RTP counters; do not estimate call data from call duration. */
export function trackCallDataUsage(connection: {getStats?: () => Promise<unknown>}): () => void {
  if (!connection.getStats) { return () => undefined; }
  const owner = ownerId(), entry = entryFor(owner);
  const previous = new Map<string, number>();
  let generation = entry.generation, sampling = false, stopped = false;
  const sample = async () => {
    if (sampling) { return; }
    sampling = true;
    try {
      const report = await connection.getStats!();
      const changed = generation !== entry.generation;
      generation = entry.generation;
      if (changed) { previous.clear(); }
      const rows = report as {forEach?: (visit: (row: any) => void) => void};
      const usage = {sent: 0, received: 0};
      rows?.forEach?.(row => {
        const direction = row.type === 'outbound-rtp' ? 'sent' : row.type === 'inbound-rtp' ? 'received' : null;
        if (!direction || row.isRemote) { return; }
        const current = bytes(direction === 'sent' ? row.bytesSent : row.bytesReceived);
        const id = `${row.type}:${row.id ?? row.ssrc ?? row.kind}`;
        const last = previous.get(id) || 0;
        if (!changed) { usage[direction] += current >= last ? current - last : current; }
        previous.set(id, current);
      });
      recordDataUsage('calls', usage, owner);
    } catch { /* Stats support must never affect an active call. */ }
    finally { sampling = false; }
  };
  const timer = setInterval(() => { if (!stopped) { sample().catch(() => undefined); } }, 5000);
  sample().catch(() => undefined);
  return () => {
    stopped = true;
    clearInterval(timer);
    sample().finally(() => flushDataUsage()).catch(() => undefined);
  };
}
