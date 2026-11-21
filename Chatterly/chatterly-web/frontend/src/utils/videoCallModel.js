import { CALL_STATUS, CALL_TYPE, generateCallId, normalizeCallStatus } from './callState';
import { NETWORK_STATUS, normalizeNetworkStatus } from './connectionState';

export const VIDEO_CALL_FIELDS = Object.freeze([
  'callId',
  'callerId',
  'receiverId',
  'callType',
  'status',
  'startedAt',
]);

export const VIDEO_CALL_HISTORY_FIELDS = Object.freeze([
  ...VIDEO_CALL_FIELDS,
  'endedAt',
  'duration',
]);

export const VIDEO_CALL_SCHEMA = Object.freeze({
  fields: VIDEO_CALL_FIELDS,
  historyFields: VIDEO_CALL_HISTORY_FIELDS,
  networkStatuses: Object.freeze(Object.values(NETWORK_STATUS)),
});

const normalizeId = (value) => String(value ?? '').trim();

const normalizeTimestamp = (value) => {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
};

const normalizeDuration = (value) => {
  const seconds = Math.floor(Number(value));
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
};

export const createVideoCallModel = ({
  callId,
  callerId,
  receiverId,
  status = CALL_STATUS.CALLING,
  startedAt,
} = {}) => {
  const normalizedStatus = normalizeCallStatus(status);
  const normalizedCallerId = normalizeId(callerId);
  const normalizedReceiverId = normalizeId(receiverId);

  if (!normalizedStatus) {
    throw new Error(`Invalid video call status: ${String(status)}`);
  }
  if (!normalizedCallerId || !normalizedReceiverId) {
    throw new Error('callerId and receiverId are required to create a video call model.');
  }

  return Object.freeze({
    callId: normalizeId(callId) || generateCallId(),
    callerId: normalizedCallerId,
    receiverId: normalizedReceiverId,
    callType: CALL_TYPE.VIDEO,
    status: normalizedStatus,
    startedAt: normalizeTimestamp(startedAt),
  });
};

export const withVideoCallNetworkStatus = (videoCall, networkStatus) =>
  Object.freeze({
    ...createVideoCallModel(videoCall),
    networkStatus: normalizeNetworkStatus(networkStatus),
  });

export const toVideoCallHistoryData = ({
  endedAt,
  duration,
  ...videoCall
} = {}) =>
  Object.freeze({
    ...createVideoCallModel(videoCall),
    endedAt: endedAt ? normalizeTimestamp(endedAt) : null,
    duration: normalizeDuration(duration),
  });

export const toVideoCallData = (videoCall = {}) => {
  const model = createVideoCallModel(videoCall);
  return VIDEO_CALL_FIELDS.reduce((data, field) => {
    data[field] = model[field];
    return data;
  }, {});
};
