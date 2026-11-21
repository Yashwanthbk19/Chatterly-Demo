import {
  GROUP_CALL_PARTICIPANT_STATUS,
  addGroupCallParticipants,
  canManageGroupCall,
  connectedParticipants,
  createGroupCallParticipant,
  createGroupCallState,
  formatGroupCallDuration,
  groupCallElapsedSeconds,
  groupCallGridColumns,
  offCallParticipants,
  participantFromGroupMember,
  participantStatusLabel,
  pinParticipant,
  removeGroupCallParticipant,
  setActiveSpeaker,
  setMeetingLocked,
  setParticipantCameraOn,
  setParticipantMuted,
  setParticipantSharingScreen,
  setParticipantStatus,
  spotlightParticipantId,
  toggleParticipantMuted,
} from '../src/utils/groupCallModel';
import type {GroupMember} from '../src/services/groupApi';

const member = (overrides: Partial<GroupMember> & {userId: string}): GroupMember => ({
  name: 'Member',
  role: 'member',
  ...overrides,
});

const stateOf = (...ids: string[]) =>
  createGroupCallState({
    callId: 'call-1',
    groupId: 'group-1',
    groupName: 'Project Team Alpha',
    hostId: ids[0],
    participants: ids.map((id, index) => ({
      id,
      name: `Person ${index + 1}`,
      isOrganizer: index === 0,
      isCurrentUser: id === 'me',
      status: GROUP_CALL_PARTICIPANT_STATUS.CONNECTED,
    })),
  });

test('a participant needs an id and defaults to a connected, unmuted member', () => {
  expect(() => createGroupCallParticipant({id: '  '})).toThrow(/id is required/i);

  const participant = createGroupCallParticipant({id: ' u1 ', name: '  Aarav Sharma '});
  expect(participant).toMatchObject({
    id: 'u1',
    name: 'Aarav Sharma',
    role: 'member',
    isOrganizer: false,
    status: GROUP_CALL_PARTICIPANT_STATUS.CONNECTED,
    isMuted: false,
    connection: 'Good',
  });
});

test('the organizer flag wins over whatever role was passed', () => {
  const participant = createGroupCallParticipant({id: 'u1', role: 'member', isOrganizer: true});
  expect(participant.role).toBe('organizer');
  expect(participant.isOrganizer).toBe(true);
});

test('a group member becomes a call participant with the matching conference role', () => {
  const admin = participantFromGroupMember(member({userId: 'u1', name: 'Nirmal', role: 'superadmin'}), {
    currentUserId: 'me',
    hostId: 'u1',
  });
  expect(admin).toMatchObject({role: 'organizer', isOrganizer: true, isCurrentUser: false});

  const moderator = participantFromGroupMember(member({userId: 'u2', role: 'moderator'}), {currentUserId: 'u2'});
  expect(moderator).toMatchObject({role: 'moderator', isCurrentUser: true});

  // Somebody who has not answered yet is invited, not connected.
  expect(moderator.status).toBe(GROUP_CALL_PARTICIPANT_STATUS.CALLING);
});

test('duplicate participants are dropped and the first non-self connected peer is spotlighted', () => {
  const call = createGroupCallState({
    participants: [
      {id: 'me', name: 'Me', isCurrentUser: true, status: GROUP_CALL_PARTICIPANT_STATUS.CONNECTED},
      {id: 'u2', name: 'Bishod', status: GROUP_CALL_PARTICIPANT_STATUS.CONNECTED},
      {id: 'u2', name: 'Duplicate', status: GROUP_CALL_PARTICIPANT_STATUS.CONNECTED},
    ],
  });
  expect(call.participants).toHaveLength(2);
  expect(call.activeSpeakerId).toBe('u2');
  expect(call.groupName).toBe('Group Call');
});

test('a no-op transition returns the same reference so the screen can skip a render', () => {
  const call = stateOf('me', 'u2');
  expect(setParticipantMuted(call, 'u2', false)).toBe(call);
  expect(setParticipantStatus(call, 'u2', GROUP_CALL_PARTICIPANT_STATUS.CONNECTED)).toBe(call);
  expect(setParticipantCameraOn(call, 'u2', false)).toBe(call);
  expect(setMeetingLocked(call, false)).toBe(call);
  expect(setActiveSpeaker(call, call.activeSpeakerId)).toBe(call);
  // An unknown participant cannot be changed either.
  expect(toggleParticipantMuted(call, 'nobody')).toBe(call);
});

test('leaving the call gives up the spotlight', () => {
  const call = pinParticipant(stateOf('me', 'u2', 'u3'), 'u2');
  expect(call.pinnedId).toBe('u2');

  const afterLeave = setParticipantStatus(call, 'u2', GROUP_CALL_PARTICIPANT_STATUS.LEFT);
  expect(afterLeave.pinnedId).toBe('');
  expect(afterLeave.activeSpeakerId).toBe('u3');
  expect(connectedParticipants(afterLeave).map(participant => participant.id)).toEqual(['me', 'u3']);
  expect(offCallParticipants(afterLeave).map(participant => participant.id)).toEqual(['u2']);
});

test('removing a participant clears the pin and moves the active speaker on', () => {
  const call = setActiveSpeaker(pinParticipant(stateOf('me', 'u2', 'u3'), 'u2'), 'u2');
  const removed = removeGroupCallParticipant(call, 'u2');
  expect(removed.participants.map(participant => participant.id)).toEqual(['me', 'u3']);
  expect(removed.pinnedId).toBe('');
  expect(removed.activeSpeakerId).toBe('u3');
  // Removing someone who is not there changes nothing.
  expect(removeGroupCallParticipant(removed, 'u2')).toBe(removed);
});

test('pinning toggles, ignores unknown ids, and outranks the active speaker', () => {
  const call = setActiveSpeaker(stateOf('me', 'u2', 'u3'), 'u3');
  expect(spotlightParticipantId(call)).toBe('u3');

  const pinned = pinParticipant(call, 'u2');
  expect(spotlightParticipantId(pinned)).toBe('u2');
  // The pinned tile leads the grid; the rest keep their order.
  expect(connectedParticipants(pinned).map(participant => participant.id)).toEqual(['u2', 'me', 'u3']);

  expect(pinParticipant(pinned, 'u2').pinnedId).toBe('');
  expect(pinParticipant(call, 'ghost')).toBe(call);
});

test('only a connected participant can become the active speaker', () => {
  const call = setParticipantStatus(stateOf('me', 'u2'), 'u2', GROUP_CALL_PARTICIPANT_STATUS.LEFT);
  expect(setActiveSpeaker(call, 'u2')).toBe(call);
});

test('mid-call invitations ring instead of appearing on a tile, and never duplicate', () => {
  const call = stateOf('me', 'u2');
  const invited = addGroupCallParticipants(call, [{id: 'u3', name: 'Saranya'}, {id: 'u2', name: 'Already here'}]);

  expect(invited.participants).toHaveLength(3);
  expect(invited.participants[2]).toMatchObject({id: 'u3', status: GROUP_CALL_PARTICIPANT_STATUS.CALLING});
  expect(connectedParticipants(invited)).toHaveLength(2);
  expect(addGroupCallParticipants(invited, [{id: 'u2'}])).toBe(invited);
});

test('only one participant shares their screen at a time', () => {
  const sharing = setParticipantSharingScreen(stateOf('me', 'u2', 'u3'), 'u2', true);
  expect(sharing.participants.filter(participant => participant.isSharingScreen).map(p => p.id)).toEqual(['u2']);

  const switched = setParticipantSharingScreen(sharing, 'u3', true);
  expect(switched.participants.filter(participant => participant.isSharingScreen).map(p => p.id)).toEqual(['u3']);

  const stopped = setParticipantSharingScreen(switched, 'u3', false);
  expect(stopped.participants.some(participant => participant.isSharingScreen)).toBe(false);
});

test('the grid widens with the call and respects the Grid Size cap', () => {
  expect(groupCallGridColumns(1)).toBe(1);
  expect(groupCallGridColumns(2)).toBe(2);
  expect(groupCallGridColumns(6)).toBe(2);
  expect(groupCallGridColumns(7)).toBe(3);
  expect(groupCallGridColumns(13)).toBe(4);
  expect(groupCallGridColumns(40)).toBe(4);
  // A capped page never lays out more columns than it shows tiles.
  expect(groupCallGridColumns(40, 4)).toBe(2);
  expect(groupCallGridColumns(0)).toBe(1);
});

test('status labels only speak up for people who are not on a tile', () => {
  expect(participantStatusLabel(GROUP_CALL_PARTICIPANT_STATUS.CONNECTED)).toBe('');
  expect(participantStatusLabel(GROUP_CALL_PARTICIPANT_STATUS.CALLING)).toBe('Calling…');
  expect(participantStatusLabel(GROUP_CALL_PARTICIPANT_STATUS.NO_RESPONSE)).toBe('No Response');
  expect(participantStatusLabel(GROUP_CALL_PARTICIPANT_STATUS.REMOVED)).toBe('Removed');
});

test('the timer counts from the call start and formats as hh:mm:ss', () => {
  const startedAt = new Date('2026-09-21T10:00:00.000Z').toISOString();
  const call = createGroupCallState({startedAt});
  expect(groupCallElapsedSeconds(call, Date.parse(startedAt) + 125_000)).toBe(125);
  // A clock that jumped backwards must not produce a negative timer.
  expect(groupCallElapsedSeconds(call, Date.parse(startedAt) - 5_000)).toBe(0);

  expect(formatGroupCallDuration(1)).toBe('00:00:01');
  expect(formatGroupCallDuration(125)).toBe('00:02:05');
  expect(formatGroupCallDuration(3725)).toBe('01:02:05');
  expect(formatGroupCallDuration(-4)).toBe('00:00:00');
});

test('an invalid start time falls back to a live timestamp rather than NaN', () => {
  const call = createGroupCallState({startedAt: 'not-a-date'});
  expect(Number.isNaN(Date.parse(call.startedAt))).toBe(false);
});

test('host controls follow the roles validateGroupCallAdmin accepts', () => {
  expect(canManageGroupCall('superadmin')).toBe(true);
  expect(canManageGroupCall('admin')).toBe(true);
  expect(canManageGroupCall('moderator')).toBe(false);
  expect(canManageGroupCall('member')).toBe(false);
  expect(canManageGroupCall(undefined)).toBe(false);
});
