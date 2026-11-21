/**
 * Presentation for the call lines the backend writes into a thread.
 *
 * Both call services store a plain sentence in `encryptedContent` - the
 * one-to-one one writes "audio call completed (65s)" and the group one
 * "video group call ended (125s)" - so the raw text reads like a log entry
 * rather than a message. These helpers turn it into the line the design shows
 * without inventing any state the server did not report.
 */

import {normalizeCallStatus} from './callStatus';

const DURATION_PATTERN = /\((\d+)\s*s\)/i;

/** `125` -> `02:05`, matching the in-call timer. */
export function formatCallLogDuration(totalSeconds: number): string {
  const total = Number.isFinite(totalSeconds) ? Math.max(0, Math.floor(totalSeconds)) : 0;
  const parts = [Math.floor(total / 3600), Math.floor(total / 60) % 60, total % 60];
  const trimmed = parts[0] > 0 ? parts : parts.slice(1);
  return trimmed.map(value => String(value).padStart(2, '0')).join(':');
}

export function formatCallLogText(raw: string): string {
  const text = String(raw || '').trim();
  if (!text) { return 'Call'; }

  const withDuration = text.replace(DURATION_PATTERN, (_match, seconds: string) =>
    `· ${formatCallLogDuration(Number(seconds))}`);

  // The server joins its "Not Answered" variants with a hyphen; an en dash
  // reads as a sentence rather than as a code fragment.
  const spaced = withDuration.replace(/\s-\s/g, ' — ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export const isCallLogMessage = (messageType?: string | null): boolean =>
  String(messageType || '') === 'call';

export type CallLogDisplayKind = 'missed' | 'incoming' | 'outgoing' | 'declined';

/**
 * The message endpoints expose the authoritative call status but older call
 * log rows only contain the human-readable sentence. Prefer the backend field
 * and retain the sentence as a compatibility fallback instead of fetching one
 * call-details record for every row in a conversation.
 */
export function callLogDisplayKind({
  callStatus,
  isOwn,
  text,
}: {
  callStatus?: string | null;
  isOwn: boolean;
  text?: string | null;
}): CallLogDisplayKind {
  const status = normalizeCallStatus(callStatus);
  if (status === 'missed') return 'missed';
  const copy = String(text || '').trim().toLowerCase();
  const value = `${status} ${copy}`;

  if (/\b(rejected|declined)\b/.test(value)) return 'declined';
  if (/\b(missed|timeout|timed_out)\b|not[ _-]?answered|no answer/.test(value)) return 'missed';
  if (/\bincoming\b/.test(value)) return 'incoming';
  if (/\boutgoing\b/.test(value)) return 'outgoing';
  return isOwn ? 'outgoing' : 'incoming';
}

/**
 * WhatsApp-style display copy for a call row. The backend sentence is useful
 * for compatibility, but it must not be rendered verbatim as a system text
 * message after the call finishes.
 */
export function callLogDisplayLabel(message: {
  callStatus?: string | null;
  isOwn: boolean;
  text?: string | null;
}): {title: string; detail: string} {
  const text = String(message.text || '');
  const status = normalizeCallStatus(message.callStatus);
  const kind = callLogDisplayKind(message);
  const callType = /\bvideo\b/i.test(text) ? 'Video' : 'Audio';
  const duration = text.match(/(?:·|\()\s*(\d{2}:\d{2}(?::\d{2})?)/)?.[1] || '';
  const value = `${status} ${text}`.toLowerCase();

  if (status === 'missed') return {title: `Missed ${callType.toLowerCase()} call`, detail: ''};

  if (/\b(rejected|declined)\b/.test(value)) return {title: `${callType} call rejected`, detail: ''};
  if (/\b(cancelled|canceled)\b/.test(value)) return {title: `${callType} call canceled`, detail: ''};
  if (/\b(missed|timeout|timed_out)\b|not[ _-]?answered|no answer/.test(value)) {
    return {title: `Missed ${callType.toLowerCase()} call`, detail: ''};
  }

  const direction = kind === 'incoming' ? 'Incoming' : 'Outgoing';
  return {title: `${direction} ${callType.toLowerCase()} call`, detail: duration};
}
