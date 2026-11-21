import {apiRequest} from '../api/client';
import {API_BASE_URL} from '../config/api';
import {getToken} from './sessionStore';
import {getGroupMessages} from './chatApi';
import type {CallType} from './chatRealtime';

// REST half of Sprint 9 Story 2. The socket contract drives the live call, but
// two things can only come from the server's own record:
//
//  * who is already on the call when this device joins (the socket only
//    announces *changes*, so a joiner would otherwise see an empty grid), and
//  * whether a call is still running, which is how an invitation that was
//    missed while backgrounded resolves instead of ringing forever.
//
// Both read `GET /api/call/details/:id?type=group`, which the backend guards
// with "Unauthorized" unless the caller is already a participant - true for a
// mid-call invitee, because addParticipantToCall stores them before the
// invitation is emitted.

export type GroupCallStatus = 'active' | 'locked' | 'ended';

export type GroupCallParticipantRecord = {
  userId: string;
  name: string;
  profilePic: string | null;
  joinedAt?: string;
  /** Set once they leave; a participant with a `leftAt` holds no tile. */
  leftAt?: string | null;
  isMuted: boolean;
  videoEnabled: boolean;
  isOnHold: boolean;
};

export type GroupCallDetails = {
  groupCallId: string;
  groupId: string;
  groupName: string;
  groupPhoto: string | null;
  startedBy: string;
  startedByName: string;
  type: CallType;
  status: GroupCallStatus;
  isScreenSharing: boolean;
  screenSharingUserId: string;
  startedAt: string;
  duration: number;
  participants: GroupCallParticipantRecord[];
};

function authenticatedHeaders(): Record<string, string> {
  const token = getToken();
  return {Accept: 'application/json', 'Content-Type': 'application/json', ...(token ? {Authorization: `Bearer ${token}`} : {})};
}

const entityId = (value: unknown): string => {
  if (!value) { return ''; }
  if (typeof value === 'string') { return value; }
  const record = value as {_id?: unknown; id?: unknown};
  return String(record._id || record.id || '');
};

function participantRecord(entry: any): GroupCallParticipantRecord | null {
  const user = entry?.user;
  const userId = entityId(user);
  if (!userId) { return null; }
  return {
    userId,
    name: String(user?.name || 'Chatterly member'),
    profilePic: user?.profilePic || null,
    joinedAt: entry?.joinedAt ? String(entry.joinedAt) : undefined,
    leftAt: entry?.leftAt ? String(entry.leftAt) : null,
    isMuted: Boolean(entry?.isMuted),
    videoEnabled: entry?.videoEnabled !== false,
    isOnHold: Boolean(entry?.isOnHold),
  };
}

export async function getGroupCallDetails(groupCallId: string): Promise<GroupCallDetails> {
  const response = await apiRequest(`${API_BASE_URL}/call/details/${encodeURIComponent(groupCallId)}?type=group`, {
    method: 'GET',
    headers: authenticatedHeaders(),
  });
  const payload = await response.json();
  const call = payload?.data;
  if (payload?.success === false || !call) {
    throw new Error(payload?.message || 'Unable to retrieve this group call.');
  }

  const group = call.groupId && typeof call.groupId === 'object' ? call.groupId : null;
  return {
    groupCallId: entityId(call) || String(groupCallId),
    groupId: entityId(call.groupId),
    groupName: String(group?.groupName || 'Group Call'),
    groupPhoto: group?.groupProfilePic || null,
    startedBy: entityId(call.startedBy),
    startedByName: String(call.startedBy?.name || 'A group member'),
    type: String(call.type || '').toLowerCase() === 'audio' ? 'audio' : 'video',
    status: ['active', 'locked', 'ended'].includes(String(call.status)) ? (call.status as GroupCallStatus) : 'active',
    isScreenSharing: Boolean(call.isScreenSharing),
    screenSharingUserId: entityId(call.screenSharingUser),
    startedAt: String(call.startedAt || new Date().toISOString()),
    duration: Number(call.duration) || 0,
    participants: (Array.isArray(call.participants) ? call.participants : [])
      .map(participantRecord)
      .filter(Boolean) as GroupCallParticipantRecord[],
  };
}

/** Participants currently holding a tile - everyone who joined and has not left. */
export const activeGroupCallParticipants = (details: GroupCallDetails | null): GroupCallParticipantRecord[] =>
  (details?.participants || []).filter(participant => !participant.leftAt);

export type ActiveGroupCallSummary = {
  groupCallId: string;
  groupId: string;
  groupName: string;
  groupPhoto: string | null;
  type: CallType;
  status: GroupCallStatus;
  startedBy: string;
  startedByName: string;
  startedAt: string;
};

/**
 * The conference already running in a group, if any.
 *
 * `group_call_start` refuses a second call with "Group call already active",
 * and the socket contract has no "what is running in this group" query - so
 * tapping call while a conference is live resolves it from the user's own call
 * history (`GET /api/call/history`) and joins that instead of failing.
 */
export async function findActiveGroupCall(groupId: string): Promise<ActiveGroupCallSummary | null> {
  const normalizedGroupId = String(groupId || '').trim();
  if (!normalizedGroupId) { return null; }

  const response = await apiRequest(`${API_BASE_URL}/call/history`, {method: 'GET', headers: authenticatedHeaders()});
  const payload = await response.json();
  const calls: any[] = Array.isArray(payload?.data?.groupCalls) ? payload.data.groupCalls : [];

  const match = calls.find(call =>
    entityId(call?.groupId) === normalizedGroupId && ['active', 'locked'].includes(String(call?.status)));
  if (!match) { return null; }

  const group = match.groupId && typeof match.groupId === 'object' ? match.groupId : null;
  return {
    groupCallId: entityId(match),
    groupId: normalizedGroupId,
    groupName: String(group?.groupName || 'Group Call'),
    groupPhoto: group?.groupProfilePic || null,
    type: String(match.type || '').toLowerCase() === 'audio' ? 'audio' : 'video',
    status: match.status === 'locked' ? 'locked' : 'active',
    startedBy: entityId(match.startedBy),
    startedByName: String(match.startedBy?.name || 'A group member'),
    startedAt: String(match.startedAt || new Date().toISOString()),
  };
}

/**
 * The id of the conference a group's thread most recently announced.
 *
 * `findActiveGroupCall` only sees calls this user is already a participant of,
 * because that is all `GET /api/call/history` returns. A member who dismissed
 * the invitation was never added, so their only remaining handle on the live
 * call is the "call started" line the server wrote into the group thread -
 * `group_call_join` accepts it and the server decides whether the call is still
 * joinable.
 */
export async function findAnnouncedGroupCallId(groupId: string): Promise<string> {
  const normalizedGroupId = String(groupId || '').trim();
  if (!normalizedGroupId) { return ''; }

  const messages = await getGroupMessages(normalizedGroupId);
  const started = messages
    .filter(message => message.messageType === 'call' && message.callId && message.callStatus === 'started')
    .sort((first, second) => Date.parse(second.createdAt) - Date.parse(first.createdAt))[0];

  if (!started?.callId) { return ''; }
  // A later line for the same call means it is over.
  const finished = messages.some(message =>
    message.callId === started.callId && message.callStatus && message.callStatus !== 'started');
  return finished ? '' : String(started.callId);
}
