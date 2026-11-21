// Call stability model and diagnostics helpers.
//
// A stability snapshot is a plain object of the shape:
//   { callId, connectionState, reconnectCount, networkQuality, disconnectReason }
//
// `connectionState` follows the canonical call connection phases from
// utils/connectionState.js, `reconnectCount` is the number of reconnect attempts
// seen for the call, `networkQuality` is a normalized quality bucket for future
// analytics, and `disconnectReason` records why the call dropped or ended for
// diagnostics.

import { generateCallId } from './callState';
import { CONNECTION_STATE, normalizeConnectionState } from './connectionState';

export const NETWORK_QUALITY = Object.freeze({
  UNKNOWN: 'Unknown',
  EXCELLENT: 'Excellent',
  GOOD: 'Good',
  FAIR: 'Fair',
  POOR: 'Poor',
});

export const DISCONNECT_REASON = Object.freeze({
  NONE: '',
  LOCAL_HANGUP: 'Local Hangup',
  REMOTE_HANGUP: 'Remote Hangup',
  NETWORK_LOST: 'Network Lost',
  RECONNECT_TIMEOUT: 'Reconnect Timeout',
  RECONNECT_FAILED: 'Reconnect Failed',
  PERMISSION_DENIED: 'Permission Denied',
  MEDIA_ERROR: 'Media Error',
  SOCKET_ERROR: 'Socket Error',
  UNKNOWN: 'Unknown',
});

export const NETWORK_QUALITIES = Object.freeze(Object.values(NETWORK_QUALITY));
export const DISCONNECT_REASONS = Object.freeze(Object.values(DISCONNECT_REASON));
export const CALL_STABILITY_FIELDS = Object.freeze([
  'callId',
  'connectionState',
  'reconnectCount',
  'networkQuality',
  'disconnectReason',
]);
export const CALL_STABILITY_SCHEMA = Object.freeze({
  fields: CALL_STABILITY_FIELDS,
  connectionStates: Object.freeze(Object.values(CONNECTION_STATE)),
  networkQualities: NETWORK_QUALITIES,
  disconnectReasons: DISCONNECT_REASONS,
});

const buildCanonicalLookup = (values) =>
  values.reduce((accumulator, value) => {
    accumulator[String(value).toLowerCase()] = value;
    return accumulator;
  }, {});

const CANONICAL_NETWORK_QUALITY_BY_KEY = buildCanonicalLookup(NETWORK_QUALITIES);
const CANONICAL_DISCONNECT_REASON_BY_KEY = buildCanonicalLookup(DISCONNECT_REASONS);

const normalizeId = (value) => String(value ?? '').trim();

const normalizeReconnectCount = (value) => {
  const count = Math.floor(Number(value));
  return Number.isFinite(count) && count > 0 ? count : 0;
};

export const normalizeNetworkQuality = (value, fallback = NETWORK_QUALITY.UNKNOWN) => {
  const key = String(value ?? '').trim().toLowerCase();
  return CANONICAL_NETWORK_QUALITY_BY_KEY[key] || fallback;
};

export const normalizeDisconnectReason = (value, fallback = DISCONNECT_REASON.NONE) => {
  const key = String(value ?? '').trim().toLowerCase();
  return CANONICAL_DISCONNECT_REASON_BY_KEY[key] || fallback;
};

// Build a normalized, frozen stability snapshot with the exact
// CALL_STABILITY_FIELDS shape. `reconnectAttempts` is accepted as an alias so it
// can be projected from the existing connection-state model without reshaping
// callers first.
export const createCallStability = ({
  callId,
  connectionState,
  reconnectCount,
  reconnectAttempts,
  networkQuality,
  disconnectReason,
} = {}) =>
  Object.freeze({
    callId: normalizeId(callId) || generateCallId(),
    connectionState: normalizeConnectionState(connectionState, CONNECTION_STATE.CONNECTING),
    reconnectCount: normalizeReconnectCount(reconnectCount ?? reconnectAttempts),
    networkQuality: normalizeNetworkQuality(networkQuality),
    disconnectReason: normalizeDisconnectReason(disconnectReason),
  });

export const createInitialCallStability = ({ callId, connectionState, networkQuality } = {}) =>
  createCallStability({
    callId,
    connectionState,
    reconnectCount: 0,
    networkQuality,
    disconnectReason: DISCONNECT_REASON.NONE,
  });

export const updateCallStabilityConnection = (stability, connectionState) =>
  createCallStability({
    ...stability,
    connectionState,
  });

export const recordCallReconnect = (stability, { networkQuality } = {}) => {
  const current = createCallStability(stability);
  return createCallStability({
    ...current,
    connectionState: CONNECTION_STATE.RECONNECTING,
    reconnectCount: current.reconnectCount + 1,
    networkQuality: networkQuality ?? current.networkQuality,
    disconnectReason: DISCONNECT_REASON.NONE,
  });
};

export const recordCallDisconnect = (
  stability,
  { disconnectReason = DISCONNECT_REASON.UNKNOWN, networkQuality } = {}
) =>
  createCallStability({
    ...stability,
    connectionState: CONNECTION_STATE.DISCONNECTED,
    networkQuality: networkQuality ?? stability?.networkQuality,
    disconnectReason,
  });

// Project a snapshot down to the plain stability tracking data object for
// analytics queues, call diagnostics, or local logs.
export const toCallStabilityData = (stability = {}) => {
  const model = createCallStability(stability);
  return CALL_STABILITY_FIELDS.reduce((data, field) => {
    data[field] = model[field];
    return data;
  }, {});
};
