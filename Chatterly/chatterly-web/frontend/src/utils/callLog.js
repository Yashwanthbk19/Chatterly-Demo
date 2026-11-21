// Call-log model and local persistence.
//
// When a call leaves its active lifecycle it is distilled into a structured call
// record of the shape:
//   { callId, contactId, contactName, callType, isGroup, avatar, duration, status, startedAt, endedAt }
// where `duration` is the whole seconds the call was connected, `status` is one
// of the resolved CALL_LOG_STATUS values (Completed / Missed / Rejected) and
// `startedAt`/`endedAt` are ISO timestamps. Records are persisted in localStorage
// for now (no backend yet) so the UI can render a call history.
//
// The model helpers here are side-effect free so they can be unit tested and
// reused anywhere; only the store functions touch localStorage, and they are
// guarded for non-browser environments to mirror utils/profile.js.

import { CALL_STATUS, CALL_TYPE, formatCallDuration, generateCallId, normalizeCallStatus } from './callState';

// The three states a finished call is recorded as. `Completed` is a call that
// connected and was hung up; `Missed` rang past the timeout unanswered;
// `Rejected` was declined by the receiver.
export const CALL_LOG_STATUS = Object.freeze({
  COMPLETED: 'Completed',
  MISSED: 'Missed',
  REJECTED: 'Rejected',
});

export const CALL_LOG_DIRECTION = Object.freeze({
  INCOMING: 'incoming',
  OUTGOING: 'outgoing',
});

export const CALL_LOG_STATUSES = Object.freeze(Object.values(CALL_LOG_STATUS));
export const CALL_LOG_DIRECTIONS = Object.freeze(Object.values(CALL_LOG_DIRECTION));
export const CALL_LOG_FIELDS = Object.freeze([
  'callId',
  'contactId',
  'contactName',
  'callType',
  'isGroup',
  'avatar',
  'duration',
  'status',
  'direction',
  'startedAt',
  'endedAt',
]);

// Where the call history lives in localStorage, and how many records are kept.
export const CALL_LOG_STORAGE_KEY = 'chatterly.callLogs';
export const DELETED_CALL_LOG_STORAGE_KEY = 'chatterly.deletedCallLogs';
const MAX_CALL_LOG_HISTORY = 50;

// How a lifecycle CALL_STATUS a call resolves into maps onto the compact
// call-log status. A connected/hung-up call (`Connected`/`Ended`) becomes
// `Completed`; declined and unanswered calls keep their `Rejected`/`Missed`
// meaning. A call still recorded as `Calling`/`Ringing` (the backend never
// heard it resolve) was never answered, so it is `Missed` rather than falling
// through to `Completed`.
const CALL_LOG_STATUS_BY_LIFECYCLE = Object.freeze({
  [CALL_STATUS.CALLING]: CALL_LOG_STATUS.MISSED,
  [CALL_STATUS.RINGING]: CALL_LOG_STATUS.MISSED,
  [CALL_STATUS.CONNECTED]: CALL_LOG_STATUS.COMPLETED,
  [CALL_STATUS.ENDED]: CALL_LOG_STATUS.COMPLETED,
  [CALL_STATUS.REJECTED]: CALL_LOG_STATUS.REJECTED,
  [CALL_STATUS.MISSED]: CALL_LOG_STATUS.MISSED,
  cancelled: CALL_LOG_STATUS.MISSED,
  canceled: CALL_LOG_STATUS.MISSED,
  not_answered: CALL_LOG_STATUS.MISSED,
});

// Case-insensitive lookup so an already-final status ('completed', 'MISSED')
// resolves back to its canonical form.
const CANONICAL_LOG_STATUS_BY_KEY = CALL_LOG_STATUSES.reduce((accumulator, status) => {
  accumulator[status.toLowerCase()] = status;
  return accumulator;
}, {});

export const isCallLogStatus = (value) =>
  typeof value === 'string' && CALL_LOG_STATUSES.includes(value);

// Resolve any call status — a lifecycle CALL_STATUS ('Connected', 'Ended',
// 'Rejected', 'Missed') or an already-final log status ('Completed') — to the
// canonical call-log status, defaulting to `Completed`.
export const toCallLogStatus = (status, fallback = CALL_LOG_STATUS.COMPLETED) => {
  const directKey = String(status ?? '').trim().toLowerCase();
  if (CANONICAL_LOG_STATUS_BY_KEY[directKey]) {
    return CANONICAL_LOG_STATUS_BY_KEY[directKey];
  }
  if (CALL_LOG_STATUS_BY_LIFECYCLE[directKey]) {
    return CALL_LOG_STATUS_BY_LIFECYCLE[directKey];
  }
  return CALL_LOG_STATUS_BY_LIFECYCLE[normalizeCallStatus(status)] || fallback;
};

export const normalizeCallLogDirection = (value, fallback = '') => {
  const normalizedValue = String(value ?? '').trim().toLowerCase();
  if (CALL_LOG_DIRECTIONS.includes(normalizedValue)) {
    return normalizedValue;
  }

  if (['caller', 'outbound', 'sent', 'made', 'placed'].includes(normalizedValue)) {
    return CALL_LOG_DIRECTION.OUTGOING;
  }

  if (['receiver', 'recipient', 'inbound', 'received'].includes(normalizedValue)) {
    return CALL_LOG_DIRECTION.INCOMING;
  }

  return fallback;
};

const normalizeDurationSeconds = (value) => {
  const seconds = Math.floor(Number(value));
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
};

// The backend writes a finished call's length into its chat log as raw
// seconds — "audio call completed (125s)". These helpers let every surface show
// it as minutes and seconds instead, and read it back for the call card.
const RAW_SECONDS_DURATION_PATTERN = /\(\s*(\d+)\s*s\s*\)/i;
const CLOCK_DURATION_PATTERN = /\(\s*(?:(\d+):)?(\d{1,2}):(\d{2})\s*\)/;

// "(125s)" -> "(02:05)"; text without a raw-seconds duration is returned as is.
export const formatCallLogDurationText = (text = '') =>
  String(text ?? '').replace(
    RAW_SECONDS_DURATION_PATTERN,
    (_match, seconds) => `(${formatCallDuration(seconds)})`
  );

// Whole seconds from a call-log text's "(125s)" or "(02:05)" / "(1:02:05)"
// suffix, or null when the text carries no duration.
export const parseCallLogDurationSeconds = (text = '') => {
  const value = String(text ?? '');
  const rawSeconds = value.match(RAW_SECONDS_DURATION_PATTERN);
  if (rawSeconds) {
    return normalizeDurationSeconds(rawSeconds[1]);
  }

  const clock = value.match(CLOCK_DURATION_PATTERN);
  if (!clock) {
    return null;
  }

  const [, hours = '0', minutes, seconds] = clock;
  return normalizeDurationSeconds(Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds));
};

// The duration represents connected-call time. Use it as the source of truth
// for the displayed end time so unanswered ringing time is not presented as
// call duration in history details or exports.
export const resolveCallLogEndedAt = ({ startedAt, endedAt, duration } = {}) => {
  const startedAtMs = new Date(startedAt || '').getTime();
  if (!Number.isFinite(startedAtMs)) {
    return endedAt || startedAt || '';
  }

  return new Date(startedAtMs + (normalizeDurationSeconds(duration) * 1000)).toISOString();
};

const normalizeTimestamp = (value, fallbackValue) => {
  const date = value ? new Date(value) : fallbackValue ? new Date(fallbackValue) : new Date();
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
};

const normalizeId = (value) => String(value ?? '').trim();
const normalizeText = (value) => String(value ?? '').trim();
const normalizeCallType = (value) =>
  String(value || '').trim().toLowerCase() === CALL_TYPE.VIDEO ? CALL_TYPE.VIDEO : CALL_TYPE.AUDIO;

// Build a normalized, frozen call record from a finished call. A missing
// `callId` is generated, an unknown `status` falls back to `Completed`,
// `duration` is clamped to whole non-negative seconds and timestamps default to
// now, so every record has the full CALL_LOG_FIELDS shape.
export const createCallLog = ({
  callId,
  contactId,
  contactName,
  callType,
  isGroup,
  avatar,
  duration,
  status,
  direction,
  startedAt,
  endedAt,
} = {}) => {
  const normalizedEndedAt = normalizeTimestamp(endedAt);

  return Object.freeze({
    callId: String(callId ?? '').trim() || generateCallId(),
    contactId: normalizeId(contactId),
    contactName: normalizeText(contactName),
    callType: normalizeCallType(callType),
    isGroup: Boolean(isGroup),
    avatar: normalizeText(avatar),
    duration: normalizeDurationSeconds(duration),
    status: toCallLogStatus(status),
    direction: normalizeCallLogDirection(direction),
    startedAt: normalizeTimestamp(startedAt, normalizedEndedAt),
    endedAt: normalizedEndedAt,
  });
};

export const filterCallLogsByStatus = (logs = [], status = '') => {
  const normalizedLogs = Array.isArray(logs) ? logs : [];
  const statusFilter = String(status || '').trim();
  if (!statusFilter || statusFilter.toLowerCase() === 'all') {
    return normalizedLogs;
  }

  const normalizedStatus = toCallLogStatus(statusFilter, '');
  return normalizedStatus
    ? normalizedLogs.filter((entry) => toCallLogStatus(entry?.status, '') === normalizedStatus)
    : [];
};

const hasLocalStorage = () => typeof localStorage !== 'undefined';

// Read the persisted call records, most-recent-first. Returns [] when storage is
// unavailable or the stored value is missing/corrupt, and normalizes every entry
// through createCallLog so callers always get well-formed records.
export const loadCallLogs = (status = '') => {
  if (!hasLocalStorage()) {
    return [];
  }

  try {
    const parsed = JSON.parse(localStorage.getItem(CALL_LOG_STORAGE_KEY) || '[]');
    const deletedCallIds = new Set(loadDeletedCallLogIds());
    const logs = Array.isArray(parsed)
      ? parsed.map((entry) => createCallLog(entry)).filter((entry) => !deletedCallIds.has(entry.callId))
      : [];
    return filterCallLogsByStatus(logs, status);
  } catch (error) {
    console.error('Unable to parse stored call logs:', error);
    return [];
  }
};

const writeCallLogs = (logs) => {
  if (!hasLocalStorage()) {
    return;
  }
  localStorage.setItem(CALL_LOG_STORAGE_KEY, JSON.stringify(logs));
};

const normalizeDeletedCallLogIds = (value) => (
  Array.isArray(value)
    ? value.map((callId) => String(callId || '').trim()).filter(Boolean)
    : []
);

export const loadDeletedCallLogIds = () => {
  if (!hasLocalStorage()) {
    return [];
  }

  try {
    return normalizeDeletedCallLogIds(JSON.parse(localStorage.getItem(DELETED_CALL_LOG_STORAGE_KEY) || '[]'));
  } catch (error) {
    console.error('Unable to parse deleted call logs:', error);
    return [];
  }
};

const writeDeletedCallLogIds = (callIds) => {
  if (!hasLocalStorage()) {
    return;
  }
  localStorage.setItem(DELETED_CALL_LOG_STORAGE_KEY, JSON.stringify(normalizeDeletedCallLogIds(callIds)));
};

export const isCallLogDeleted = (callId) => {
  const normalizedCallId = String(callId || '').trim();
  return Boolean(normalizedCallId && loadDeletedCallLogIds().includes(normalizedCallId));
};

// Persist a finished call, returning the full most-recent-first log. The new
// record is normalized, de-duplicated by callId (so re-logging the same call
// replaces the earlier entry) and the history is capped.
export const appendCallLog = (record) => {
  const callLog = createCallLog(record);
  const withoutDuplicate = loadCallLogs().filter((entry) => entry.callId !== callLog.callId);
  const nextLogs = [callLog, ...withoutDuplicate].slice(0, MAX_CALL_LOG_HISTORY);
  writeCallLogs(nextLogs);
  return nextLogs;
};

export const deleteCallLog = (callId) => {
  const normalizedCallId = String(callId || '').trim();
  if (!normalizedCallId) {
    return loadCallLogs();
  }

  const nextDeletedIds = Array.from(new Set([...loadDeletedCallLogIds(), normalizedCallId]));
  writeDeletedCallLogIds(nextDeletedIds);
  const nextLogs = loadCallLogs().filter((entry) => entry.callId !== normalizedCallId);
  writeCallLogs(nextLogs);
  return nextLogs;
};

export const clearCallLogs = () => {
  if (!hasLocalStorage()) {
    return;
  }
  localStorage.removeItem(CALL_LOG_STORAGE_KEY);
};
