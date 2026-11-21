import {apiRequest} from '../api/client';
import {API_BASE_URL} from '../config/api';
import {getSession, getToken} from './sessionStore';
import {normalizeCallStatus} from '../utils/callStatus';

export type CallHistoryDirection = 'incoming' | 'outgoing';
export type CallHistoryType = 'audio' | 'video';

export type CallHistoryItem = {
  id: string;
  chatId?: string | null;
  contactId: string;
  contactName: string;
  avatar?: string | null;
  type: CallHistoryType;
  direction: CallHistoryDirection;
  status: string;
  duration: number;
  occurredAt: string;
  isGroup: boolean;
};

type Entity = string | {_id?: string; id?: string; name?: string; fullName?: string; profilePic?: string; groupName?: string; groupProfilePic?: string; groupPhoto?: string};

const entityId = (value?: Entity | null): string => typeof value === 'string' ? value : String(value?._id || value?.id || '');
const entityName = (value?: Entity | null): string => typeof value === 'object' && value ? String(value.name || value.fullName || '') : '';
const entityAvatar = (value?: Entity | null): string | null => typeof value === 'object' && value ? String(value.profilePic || '') || null : null;

function normalizeType(value: unknown): CallHistoryType {
  return String(value || '').toLowerCase() === 'video' ? 'video' : 'audio';
}

/** Prefer the exact elapsed seconds represented by the backend timestamps. */
export function normalizeCallDuration(call: any): number {
  const startedAt = Date.parse(String(call?.startedAt || ''));
  const endedAt = Date.parse(String(call?.endedAt || ''));
  if (Number.isFinite(startedAt) && Number.isFinite(endedAt) && endedAt >= startedAt) {
    return Math.max(0, Math.floor((endedAt - startedAt) / 1000));
  }
  return Math.max(0, Number(call?.duration || 0));
}

export function normalizeCallHistory(payload: any, currentUserId = getSession()?.user?.id || ''): CallHistoryItem[] {
  const personalCalls = Array.isArray(payload?.personalCalls) ? payload.personalCalls : [];
  const groupCalls = Array.isArray(payload?.groupCalls) ? payload.groupCalls : [];

  const personal = personalCalls.map((call: any): CallHistoryItem => {
    const callerId = entityId(call?.caller);
    const receiverId = entityId(call?.receiver);
    const outgoing = Boolean(currentUserId && callerId === currentUserId);
    const peer = outgoing ? call?.receiver : call?.caller;
    return {
      id: String(call?._id || call?.id || ''),
      chatId: entityId(call?.chat) || null,
      contactId: entityId(peer) || (outgoing ? receiverId : callerId),
      contactName: entityName(peer) || 'Unknown',
      avatar: entityAvatar(peer),
      type: normalizeType(call?.type),
      direction: outgoing ? 'outgoing' : 'incoming',
      status: normalizeCallStatus(call?.status),
      duration: normalizeCallDuration(call),
      occurredAt: String(call?.startedAt || call?.createdAt || call?.endedAt || ''),
      isGroup: false,
    };
  });

  const groups = groupCalls.map((call: any): CallHistoryItem => {
    const group = call?.groupId;
    const startedById = entityId(call?.startedBy);
    const groupRecord = typeof group === 'object' && group ? group : {};
    return {
      id: String(call?._id || call?.id || ''),
      chatId: null,
      contactId: entityId(group),
      contactName: String(groupRecord.groupName || groupRecord.name || call?.groupName || 'Group call'),
      avatar: String(groupRecord.groupProfilePic || groupRecord.groupPhoto || groupRecord.profilePic || '') || null,
      type: normalizeType(call?.type),
      direction: currentUserId && startedById === currentUserId ? 'outgoing' : 'incoming',
      status: normalizeCallStatus(call?.status) === 'ended' ? 'completed' : normalizeCallStatus(call?.status),
      duration: normalizeCallDuration(call),
      occurredAt: String(call?.startedAt || call?.createdAt || call?.endedAt || ''),
      isGroup: true,
    };
  });

  return [...personal, ...groups]
    .filter(call => Boolean(call.id))
    .sort((first, second) => Date.parse(second.occurredAt || '0') - Date.parse(first.occurredAt || '0'));
}

export async function getCallHistory(): Promise<CallHistoryItem[]> {
  const token = getToken();
  const response = await apiRequest(`${API_BASE_URL}/call/history`, {
    method: 'GET',
    headers: {Accept: 'application/json', ...(token ? {Authorization: `Bearer ${token}`} : {})},
  });
  const payload = await response.json();
  return normalizeCallHistory(payload?.data || payload);
}

export async function getCallDetails(callId: string, isGroup = false): Promise<CallHistoryItem> {
  const token = getToken();
  const response = await apiRequest(`${API_BASE_URL}/call/details/${encodeURIComponent(callId)}?type=${isGroup ? 'group' : 'personal'}`, {
    method: 'GET',
    headers: {Accept: 'application/json', ...(token ? {Authorization: `Bearer ${token}`} : {})},
  });
  const payload = await response.json();
  const normalized = normalizeCallHistory(isGroup
    ? {groupCalls: [payload?.data || payload]}
    : {personalCalls: [payload?.data || payload]});
  if (!normalized[0]) throw new Error('The call details are unavailable.');
  return normalized[0];
}
