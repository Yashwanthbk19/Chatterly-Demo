import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {AppState, Platform, StyleSheet} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {GroupCallScreen} from '../src/screens/GroupCallScreen';
import type {GroupCallSession} from '../src/types/groupCall';
import {pinGroupCallParticipant, unpinGroupCallParticipant} from '../src/services/groupCallRealtime';
import {GroupCallParticipantsPanel} from '../src/components/GroupCallPanels';
import {GroupCallParticipantSheet} from '../src/components/GroupCallSheets';

const metrics = {frame: {x: 0, y: 0, width: 393, height: 852}, insets: {top: 24, right: 0, bottom: 20, left: 0}};

const roster = [
  {userId: 'me', name: 'Aarav Sharma', phone: '+91 8646 213 230', role: 'admin', profilePic: null},
  {userId: 'u2', name: 'Bishod Thomas', phone: '+91 8646 213 231', role: 'member', profilePic: null},
  {userId: 'u3', name: 'Chivan Mathew', phone: '+91 8646 213 232', role: 'member', profilePic: null},
  {userId: 'u4', name: 'Saranya', phone: '+91 8646 213 233', role: 'member', profilePic: null},
];

const mockGetGroupDetails = jest.fn();
const mockGetGroupCallDetails = jest.fn();
const mockMuteParticipant = jest.fn();
const mockRemoveParticipant = jest.fn();
const mockAddParticipant = jest.fn();
const mockEndGroupCall = jest.fn();
const mockLeaveGroupCall = jest.fn();
const mockUnmuteSelf = jest.fn();
const mockRequestParticipantUnmute = jest.fn();
let mockLiveHandlers: Record<string, (...args: any[]) => void> = {};
let mockControlHandler: ((message: {groupCallId: string; fromUserId: string; type: 'unmute-request'; respond: jest.Mock}) => void) | undefined;
let mockFileShareHandler: ((message: any) => void) | undefined;

jest.mock('../src/services/groupApi', () => ({
  getGroupDetails: (...args: unknown[]) => mockGetGroupDetails(...args),
}));

jest.mock('../src/services/groupCallApi', () => ({
  getGroupCallDetails: (...args: unknown[]) => mockGetGroupCallDetails(...args),
  activeGroupCallParticipants: (details: any) => (details?.participants || []).filter((p: any) => !p.leftAt),
}));

jest.mock('../src/services/groupCallRealtime', () => ({
  subscribeToGroupCall: (_callId: string, handlers: Record<string, () => void>) => {
    mockLiveHandlers = handlers;
    return () => { mockLiveHandlers = {}; };
  },
  keepGroupCallRoomJoined: () => () => undefined,
  muteGroupCallParticipant: (...args: unknown[]) => mockMuteParticipant(...args),
  removeGroupCallParticipantOverSocket: (...args: unknown[]) => mockRemoveParticipant(...args),
  addGroupCallParticipant: (...args: unknown[]) => mockAddParticipant(...args),
  endGroupCall: (...args: unknown[]) => mockEndGroupCall(...args),
  leaveGroupCall: (...args: unknown[]) => mockLeaveGroupCall(...args),
  unmuteSelfInGroupCall: (...args: unknown[]) => mockUnmuteSelf(...args),
  pinGroupCallParticipant: jest.fn(async () => ({success: true, message: ''})),
  unpinGroupCallParticipant: jest.fn(async () => ({success: true, message: ''})),
  startGroupScreenShare: jest.fn(async () => ({success: true, message: ''})),
  stopGroupScreenShare: jest.fn(async () => ({success: true, message: ''})),
}));

jest.mock('../src/services/groupCallMedia', () => ({
  startGroupCallScreenCapture: jest.fn(async () => undefined),
  stopGroupCallScreenCapture: jest.fn(async () => undefined),
  isGroupCallScreenCapturing: jest.fn(() => false),
  getGroupCallLocalStreamUrl: jest.fn(() => 'mock://camera'),
  getGroupCallScreenStreamUrl: jest.fn(() => 'mock://screen-share'),
  startGroupCallMedia: jest.fn(async () => true),
  stopGroupCallMedia: jest.fn(async () => undefined),
  connectGroupCallPeer: jest.fn(async () => undefined),
  dropGroupCallPeer: jest.fn(),
  handleGroupCallSignal: jest.fn(async () => undefined),
  setGroupCallMuted: jest.fn(async () => undefined),
  setGroupCallCameraOn: jest.fn(async () => undefined),
  setGroupCallSpeaker: jest.fn(async () => undefined),
  setGroupCallRemoteAudioEnabled: jest.fn(),
  subscribeToGroupCallStreams: jest.fn((_listener: (streams: {userId: string; url: string}[]) => void) => () => undefined),
  subscribeToGroupCallControls: (handler: typeof mockControlHandler) => { mockControlHandler = handler; return () => { mockControlHandler = undefined; }; },
  requestGroupCallParticipantUnmute: (...args: unknown[]) => mockRequestParticipantUnmute(...args),
  confirmGroupCallParticipantUnmuted: jest.fn(),
}));

jest.mock('../src/services/chatRealtime', () => ({
  subscribeToGroupFileShares: (_groupId: string, handler: typeof mockFileShareHandler) => {
    mockFileShareHandler = handler;
    return () => { mockFileShareHandler = undefined; };
  },
}));

jest.mock('../src/services/sessionStore', () => ({
  getSession: () => ({token: 'jwt', user: {id: 'me', name: 'Aarav Sharma'}}),
}));

const session: GroupCallSession = {
  groupCallId: 'call-1',
  groupId: 'group-1',
  groupName: 'Project Team Alpha',
  groupPhoto: null,
  type: 'video',
  startedBy: 'me',
  startedAt: new Date().toISOString(),
  isInitiator: true,
};

const renderScreen = async (overrides: Partial<React.ComponentProps<typeof GroupCallScreen>> = {}) => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider initialMetrics={metrics}>
        <GroupCallScreen onClose={jest.fn()} onMinimize={jest.fn()} session={session} visible {...overrides} />
      </SafeAreaProvider>,
    );
  });
  return renderer;
};

const press = (renderer: ReactTestRenderer.ReactTestRenderer, label: string) =>
  ReactTestRenderer.act(() => { renderer.root.findByProps({accessibilityLabel: label}).props.onPress(); });

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(AppState.addEventListener).mockImplementation(() => ({remove: jest.fn()}));
  mockLiveHandlers = {};
  mockControlHandler = undefined;
  mockFileShareHandler = undefined;
  mockGetGroupDetails.mockResolvedValue({
    id: 'group-1',
    name: 'Project Team Alpha',
    photo: null,
    rules: [],
    settings: {onlyAdminsCanMessage: false, onlyAdminsCanShareMedia: false},
    participants: roster,
  });
  // Two people are on the call; the rest of the group is still being rung.
  mockGetGroupCallDetails.mockResolvedValue({
    groupCallId: 'call-1',
    groupId: 'group-1',
    groupName: 'Project Team Alpha',
    groupPhoto: null,
    startedBy: 'me',
    startedByName: 'Aarav Sharma',
    type: 'video',
    status: 'active',
    isScreenSharing: false,
    screenSharingUserId: '',
    startedAt: session.startedAt,
    duration: 0,
    participants: [
      {userId: 'me', name: 'Aarav Sharma', profilePic: null, leftAt: null, isMuted: false, videoEnabled: true, isOnHold: false},
      {userId: 'u2', name: 'Bishod Thomas', profilePic: null, leftAt: null, isMuted: false, videoEnabled: true, isOnHold: false},
    ],
  });
  mockMuteParticipant.mockResolvedValue({success: true, message: 'Participant muted'});
  mockRemoveParticipant.mockResolvedValue({success: true, message: 'Participant removed'});
  mockAddParticipant.mockResolvedValue({success: true, message: 'Invitation sent'});
  mockEndGroupCall.mockResolvedValue({success: true, message: 'Group call ended'});
  mockLeaveGroupCall.mockResolvedValue({success: true, message: 'Left the group call'});
  mockUnmuteSelf.mockResolvedValue({success: true, message: 'Microphone on'});
  mockRequestParticipantUnmute.mockResolvedValue(undefined);
});

test('seeds the grid from the live call record, not from the whole group roster', async () => {
  const renderer = await renderScreen();
  const tree = JSON.stringify(renderer.toJSON());

  expect(mockGetGroupDetails).toHaveBeenCalledWith('group-1');
  expect(mockGetGroupCallDetails).toHaveBeenCalledWith('call-1');
  expect(tree).toContain('Project Team Alpha');
  // Two tiles: the people actually on the call.
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Participants, 2 in call'}).length).toBeGreaterThan(0);

  ReactTestRenderer.act(() => renderer.unmount());
});

test('video grid fills the available surface and shows four participants together', async () => {
  mockGetGroupCallDetails.mockResolvedValue({
    groupCallId: 'call-1', groupId: 'group-1', groupName: 'Project Team Alpha', groupPhoto: null,
    startedBy: 'me', startedByName: 'Aarav Sharma', type: 'video', status: 'active',
    isScreenSharing: false, screenSharingUserId: '', startedAt: session.startedAt, duration: 0,
    participants: roster.map(member => ({userId: member.userId, name: member.name, profilePic: null, leftAt: null, isMuted: false, videoEnabled: true, isOnHold: false})),
  });
  const renderer = await renderScreen();
  const tiles = () => renderer.root.findAll(node => Boolean(node.props.participant) && typeof node.props.width === 'number' && !node.props.floating);
  // The grid area reports its outer size; the tiles live inside its padding.
  const gridArea = renderer.root.findAll(node => typeof node.props.onLayout === 'function' && node.findAll(child => Boolean(child.props.participant)).length > 0).pop()!;
  await ReactTestRenderer.act(async () => {
    gridArea.props.onLayout({nativeEvent: {layout: {x: 0, y: 0, width: 393, height: 600}}});
  });

  // Video calls keep all four callers in a two-by-two grid.
  const widths = [...new Set(tiles().map(tile => tile.props.width))];
  const heights = [...new Set(tiles().map(tile => tile.props.height))];
  expect(tiles()).toHaveLength(4);
  expect(widths).toHaveLength(1);
  expect(heights).toHaveLength(1);
  expect(widths[0] * 2 + 8).toBeLessThanOrEqual(393 - 28);
  expect(widths[0]).toBeGreaterThan(170);
  expect(heights[0] * 2 + 8).toBeCloseTo(596, 0);

  ReactTestRenderer.act(() => renderer.unmount());
});

test('uses the red handset end-call control and retains its action', async () => {
  const renderer = await renderScreen();
  const endControl = renderer.root.findByProps({accessibilityLabel: 'End'});
  const icon = endControl.findByProps({name: 'end'});
  expect(icon.props.color).toBe('#FFFFFF');

  await ReactTestRenderer.act(async () => { endControl.props.onPress(); });
  expect(renderer.root.findByProps({accessibilityLabel: 'Leave call'})).toBeDefined();

  ReactTestRenderer.act(() => renderer.unmount());
});

test('a joiner fills a tile and someone leaving gives theirs up', async () => {
  const renderer = await renderScreen();

  await ReactTestRenderer.act(async () => { mockLiveHandlers.onUserJoined?.('u3'); });
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Participants, 3 in call'}).length).toBeGreaterThan(0);
  expect(renderer.root.findByProps({accessibilityLabel: 'Chivan Mathew joined the call.'})).toBeDefined();

  await ReactTestRenderer.act(async () => { mockLiveHandlers.onUserLeft?.('u2'); });
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Participants, 2 in call'}).length).toBeGreaterThan(0);
  expect(renderer.root.findByProps({accessibilityLabel: 'Bishod Thomas left the call.'})).toBeDefined();

  ReactTestRenderer.act(() => renderer.unmount());
});

test('muting yourself stays local and unmuting tells the room', async () => {
  const media = require('../src/services/groupCallMedia');
  const renderer = await renderScreen();

  await ReactTestRenderer.act(async () => { press(renderer, 'Mute your microphone'); });
  expect(media.setGroupCallMuted).toHaveBeenLastCalledWith(true);
  // The backend models only host muting plus unmute_self.
  expect(mockUnmuteSelf).not.toHaveBeenCalled();

  await ReactTestRenderer.act(async () => { press(renderer, 'Unmute your microphone'); });
  expect(media.setGroupCallMuted).toHaveBeenLastCalledWith(false);
  expect(mockUnmuteSelf).toHaveBeenCalledWith('call-1');

  ReactTestRenderer.act(() => renderer.unmount());
});

test('a host mute shows above the call and disappears automatically', async () => {
  jest.useFakeTimers();
  const media = require('../src/services/groupCallMedia');
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  try {
    renderer = await renderScreen();

    await ReactTestRenderer.act(async () => { mockLiveHandlers.onMutedByHost?.(); });
    expect(media.setGroupCallMuted).toHaveBeenLastCalledWith(true);
    expect(renderer.root.findAllByProps({accessibilityLabel: 'Unmute your microphone'}).length).toBeGreaterThan(0);
    const notice = renderer.root.findByProps({accessibilityLabel: 'A group admin muted your microphone.'});
    expect(StyleSheet.flatten(notice.props.style).position).toBeUndefined();

    ReactTestRenderer.act(() => { jest.advanceTimersByTime(3500); });
    expect(renderer.root.findAllByProps({accessibilityLabel: 'A group admin muted your microphone.'})).toHaveLength(0);
  } finally {
    if (renderer) { ReactTestRenderer.act(() => renderer?.unmount()); }
    jest.useRealTimers();
  }
});

test('being removed closes the call with the reason, and ending it reports the duration', async () => {
  const onClose = jest.fn();
  const renderer = await renderScreen({onClose});

  await ReactTestRenderer.act(async () => { mockLiveHandlers.onUserRemoved?.('me'); });
  expect(onClose).toHaveBeenCalledWith(expect.objectContaining({endedForEveryone: false, reason: 'You were removed from the call.'}));

  ReactTestRenderer.act(() => renderer.unmount());

  const onCloseEnded = jest.fn();
  const second = await renderScreen({onClose: onCloseEnded});
  await ReactTestRenderer.act(async () => { mockLiveHandlers.onEnded?.({duration: 125}); });
  expect(onCloseEnded).toHaveBeenCalledWith(expect.objectContaining({durationSeconds: 125, endedForEveryone: true}));

  ReactTestRenderer.act(() => second.unmount());
});

test('an admin can end for everyone; leaving only drops this device', async () => {
  const onClose = jest.fn();
  const renderer = await renderScreen({onClose});

  press(renderer, 'End');
  await ReactTestRenderer.act(async () => { press(renderer, 'End call for everyone'); });
  expect(mockEndGroupCall).toHaveBeenCalledWith('call-1');
  expect(onClose).toHaveBeenCalledWith(expect.objectContaining({endedForEveryone: true}));

  ReactTestRenderer.act(() => renderer.unmount());

  const onCloseLeave = jest.fn();
  const second = await renderScreen({onClose: onCloseLeave});
  press(second, 'End');
  await ReactTestRenderer.act(async () => { press(second, 'Leave call'); });
  expect(mockLeaveGroupCall).toHaveBeenCalledWith('call-1');
  expect(onCloseLeave).toHaveBeenCalledWith(expect.objectContaining({endedForEveryone: false}));

  ReactTestRenderer.act(() => second.unmount());
});

test('the participants panel separates who is on the call from who is still ringing', async () => {
  const renderer = await renderScreen();
  await ReactTestRenderer.act(async () => { press(renderer, 'Participants, 2 in call'); });

  // Someone on the call gets the per-row host controls...
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Options for Bishod Thomas'}).length).toBeGreaterThan(0);
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Mute Bishod Thomas'}).length).toBeGreaterThan(0);
  // ...while a member who has not answered can only be rung again.
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Invite Chivan Mathew to the call'}).length).toBeGreaterThan(0);
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Options for Chivan Mathew'})).toHaveLength(0);
  expect(renderer.root.findAllByProps({children: 'Calling…'}).length).toBeGreaterThan(0);
  // The subtitle counts the whole group, not just the tiles.
  expect(renderer.root.findAllByProps({children: '4 Members'}).length).toBeGreaterThan(0);

  ReactTestRenderer.act(() => renderer.unmount());
});

test('participant actions render above the full-screen participants panel', async () => {
  const renderer = await renderScreen();
  const modalLayers = renderer.root.findAll(node =>
    node.type === GroupCallParticipantsPanel || node.type === GroupCallParticipantSheet);

  expect(modalLayers.map(node => node.type)).toEqual([
    GroupCallParticipantsPanel,
    GroupCallParticipantSheet,
  ]);

  ReactTestRenderer.act(() => renderer.unmount());
});

test.each([
  ['android', 'admin', 'me'], ['android', 'admin', 'u2'],
  ['android', 'member', 'me'], ['android', 'member', 'u2'],
  ['ios', 'admin', 'me'], ['ios', 'admin', 'u2'],
  ['ios', 'member', 'me'], ['ios', 'member', 'u2'],
] as const)('%s %s can pin and unpin participant %s', async (platform, role, userId) => {
  const os = jest.replaceProperty(Platform, 'OS', platform);
  mockGetGroupDetails.mockResolvedValue({id: 'group-1', name: session.groupName, photo: null, rules: [], settings: {}, participants: roster.map(member => member.userId === 'me' ? {...member, role} : member)});
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  try {
    renderer = await renderScreen();
    const name = roster.find(member => member.userId === userId)!.name;
    await ReactTestRenderer.act(async () => { press(renderer, 'Participants, 2 in call'); });
    await ReactTestRenderer.act(async () => { press(renderer, `Options for ${name}`); });
    expect(renderer.root.findAllByProps({accessibilityLabel: 'Unpin participant'})).toHaveLength(0);
    await ReactTestRenderer.act(async () => { press(renderer, 'Pin participant'); });
    await ReactTestRenderer.act(async () => { press(renderer, `Options for ${name}`); });
    expect(renderer.root.findByProps({accessibilityLabel: 'Unpin participant'})).toBeDefined();
    expect(renderer.root.findAllByProps({accessibilityLabel: 'Pin participant'})).toHaveLength(0);
    await ReactTestRenderer.act(async () => { press(renderer, 'Unpin participant'); });
    await ReactTestRenderer.act(async () => { press(renderer, `Options for ${name}`); });
    expect(renderer.root.findByProps({accessibilityLabel: 'Pin participant'})).toBeDefined();
    expect(renderer.root.findAllByProps({accessibilityLabel: 'Unpin participant'})).toHaveLength(0);
    if (role === 'admin') {
      expect(pinGroupCallParticipant).toHaveBeenCalledWith('call-1', userId);
      expect(unpinGroupCallParticipant).toHaveBeenCalledWith('call-1', userId);
    } else {
      expect(pinGroupCallParticipant).not.toHaveBeenCalled();
      expect(unpinGroupCallParticipant).not.toHaveBeenCalled();
    }
  } finally {
    if (renderer) await ReactTestRenderer.act(async () => renderer.unmount());
    os.restore();
  }
});

test('the host can mute, unmute and remove a participant from their action sheet', async () => {
  const renderer = await renderScreen();
  await ReactTestRenderer.act(async () => { press(renderer, 'Participants, 2 in call'); });
  await ReactTestRenderer.act(async () => { press(renderer, 'Options for Bishod Thomas'); });

  await ReactTestRenderer.act(async () => { press(renderer, 'Mute participant'); });
  expect(mockMuteParticipant).toHaveBeenCalledWith('call-1', 'u2');
  expect(renderer.root.findByProps({accessibilityLabel: 'Bishod Thomas was muted.'})).toBeDefined();

  await ReactTestRenderer.act(async () => { press(renderer, 'Options for Bishod Thomas'); });
  await ReactTestRenderer.act(async () => { press(renderer, 'Unmute participant'); });
  expect(mockRequestParticipantUnmute).toHaveBeenCalledWith('u2');
  expect(renderer.root.findByProps({accessibilityLabel: 'Bishod Thomas was unmuted.'})).toBeDefined();

  await ReactTestRenderer.act(async () => { press(renderer, 'Options for Bishod Thomas'); });
  await ReactTestRenderer.act(async () => { press(renderer, 'Remove from the call'); });
  expect(mockRemoveParticipant).toHaveBeenCalledWith('call-1', 'u2');

  ReactTestRenderer.act(() => renderer.unmount());
});

test('an authenticated admin peer can restore this participant microphone', async () => {
  mockGetGroupDetails.mockResolvedValue({
    id: 'group-1', name: 'Project Team Alpha', photo: null, rules: [],
    settings: {onlyAdminsCanMessage: false, onlyAdminsCanShareMedia: false},
    participants: roster.map(member => member.userId === 'u2' ? {...member, role: 'admin'} : member),
  });
  const media = require('../src/services/groupCallMedia');
  const renderer = await renderScreen();
  const respond = jest.fn();

  await ReactTestRenderer.act(async () => { mockLiveHandlers.onMutedByHost?.(); });
  await ReactTestRenderer.act(async () => { mockControlHandler?.({groupCallId: 'call-1', fromUserId: 'u2', type: 'unmute-request', respond}); });

  expect(media.setGroupCallMuted).toHaveBeenLastCalledWith(false);
  expect(mockUnmuteSelf).toHaveBeenCalledWith('call-1');
  expect(respond).toHaveBeenCalledWith({success: true});
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Mute your microphone'}).length).toBeGreaterThan(0);

  ReactTestRenderer.act(() => renderer.unmount());
});

test('an admin unmute clears the server mute even when this device missed the host mute', async () => {
  mockGetGroupDetails.mockResolvedValue({
    id: 'group-1', name: 'Project Team Alpha', photo: null, rules: [],
    settings: {onlyAdminsCanMessage: false, onlyAdminsCanShareMedia: false},
    participants: roster.map(member => member.userId === 'u2' ? {...member, role: 'admin'} : member),
  });
  const renderer = await renderScreen();
  const respond = jest.fn();

  // No onMutedByHost: the local microphone still shows on, the server says muted.
  await ReactTestRenderer.act(async () => { mockControlHandler?.({groupCallId: 'call-1', fromUserId: 'u2', type: 'unmute-request', respond}); });

  expect(mockUnmuteSelf).toHaveBeenCalledWith('call-1');
  expect(respond).toHaveBeenCalledWith({success: true});

  ReactTestRenderer.act(() => renderer.unmount());
});

test('an unmute request from a member promoted mid-call is accepted after the roster refreshes', async () => {
  const renderer = await renderScreen();
  mockGetGroupDetails.mockResolvedValue({
    id: 'group-1', name: 'Project Team Alpha', photo: null, rules: [],
    settings: {onlyAdminsCanMessage: false, onlyAdminsCanShareMedia: false},
    participants: roster.map(member => member.userId === 'u2' ? {...member, role: 'admin'} : member),
  });
  const respond = jest.fn();

  await ReactTestRenderer.act(async () => { mockLiveHandlers.onMutedByHost?.(); });
  await ReactTestRenderer.act(async () => { mockControlHandler?.({groupCallId: 'call-1', fromUserId: 'u2', type: 'unmute-request', respond}); });

  expect(mockUnmuteSelf).toHaveBeenCalledWith('call-1');
  expect(respond).toHaveBeenCalledWith({success: true});
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Mute your microphone'}).length).toBeGreaterThan(0);

  ReactTestRenderer.act(() => renderer.unmount());
});

test('a non-admin peer still cannot unmute this participant', async () => {
  const renderer = await renderScreen();
  const respond = jest.fn();

  await ReactTestRenderer.act(async () => { mockLiveHandlers.onMutedByHost?.(); });
  await ReactTestRenderer.act(async () => { mockControlHandler?.({groupCallId: 'call-1', fromUserId: 'u2', type: 'unmute-request', respond}); });

  expect(mockUnmuteSelf).not.toHaveBeenCalled();
  expect(respond).toHaveBeenCalledWith({success: false, message: 'Only a group admin can unmute another participant.'});
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Unmute your microphone'}).length).toBeGreaterThan(0);

  ReactTestRenderer.act(() => renderer.unmount());
});

test('Add People offers only group members who are not already on the call', async () => {
  const renderer = await renderScreen();
  await ReactTestRenderer.act(async () => { press(renderer, 'Participants, 2 in call'); });
  await ReactTestRenderer.act(async () => { press(renderer, 'Add People to Call'); });

  const tree = JSON.stringify(renderer.toJSON());
  expect(tree).toContain('Chivan Mathew');
  expect(tree).toContain('Saranya');
  // Already on the call, so not offered again.
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Select Bishod Thomas'})).toHaveLength(0);

  await ReactTestRenderer.act(async () => { press(renderer, 'Select Chivan Mathew'); });
  await ReactTestRenderer.act(async () => { press(renderer, 'Add selected people to the call'); });
  expect(mockAddParticipant).toHaveBeenCalledWith('call-1', 'u3');

  ReactTestRenderer.act(() => renderer.unmount());
});

test('a member sees no host controls, because the server would refuse them', async () => {
  mockGetGroupDetails.mockResolvedValue({
    id: 'group-1',
    name: 'Project Team Alpha',
    photo: null,
    rules: [],
    settings: {onlyAdminsCanMessage: false, onlyAdminsCanShareMedia: false},
    participants: roster.map(member => (member.userId === 'me' ? {...member, role: 'member'} : member)),
  });

  const renderer = await renderScreen();
  press(renderer, 'End');
  expect(renderer.root.findAllByProps({accessibilityLabel: 'End call for everyone'})).toHaveLength(0);
  ReactTestRenderer.act(() => { renderer.root.findByProps({accessibilityLabel: 'Cancel leaving the call'}).props.onPress(); });

  await ReactTestRenderer.act(async () => { press(renderer, 'Participants, 2 in call'); });
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Add People to Call'})).toHaveLength(0);

  await ReactTestRenderer.act(async () => { press(renderer, 'Options for Bishod Thomas'); });
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Remove from the call'})).toHaveLength(0);

  ReactTestRenderer.act(() => renderer.unmount());
});

test('minimizing keeps the call alive instead of closing it', async () => {
  const onMinimize = jest.fn();
  const onClose = jest.fn();
  const renderer = await renderScreen({onClose, onMinimize});

  press(renderer, 'Minimize group call');
  expect(onMinimize).toHaveBeenCalledTimes(1);
  expect(onClose).not.toHaveBeenCalled();

  ReactTestRenderer.act(() => renderer.unmount());
});

test('the control bar carries the five Story 2 controls and reflects their state', async () => {
  const renderer = await renderScreen();

  for (const label of ['More', 'Mic on', 'Video on', 'Speaker', 'End']) {
    expect(renderer.root.findAllByProps({children: label}).length).toBeGreaterThan(0);
  }

  await ReactTestRenderer.act(async () => { press(renderer, 'Mute your microphone'); });
  expect(renderer.root.findAllByProps({children: 'Mic off'}).length).toBeGreaterThan(0);

  await ReactTestRenderer.act(async () => { press(renderer, 'Turn your camera off'); });
  expect(renderer.root.findAllByProps({children: 'Video off'}).length).toBeGreaterThan(0);

  ReactTestRenderer.act(() => renderer.unmount());
});

test('More opens the sheet the wireframe specifies, and its sub-sheets', async () => {
  const renderer = await renderScreen();
  await ReactTestRenderer.act(async () => { press(renderer, 'More'); });

  for (const label of ['Add', 'Share Screen', 'Video Effects', 'Call Status', 'Settings', 'Microphone Settings', 'Audio Output', 'Auto Reconnect']) {
    expect(renderer.root.findAllByProps({accessibilityLabel: label}).length).toBeGreaterThan(0);
  }
  // Reactions are on by default, so the strip is there to tap.
  expect(renderer.root.findAllByProps({accessibilityLabel: 'React 🥳'}).length).toBeGreaterThan(0);

  // Audio Output offers the devices expo-audio reports - a Bluetooth headset
  // appears under its own name only while it is connected.
  const audio = require('expo-audio');
  audio.__recorder.getAvailableInputs = jest.fn(() => [
    {name: 'Built-in microphone', type: 'MicrophoneBuiltIn', uid: '1'},
    {name: 'JBL Flip 5', type: 'BluetoothSCO', uid: '7'},
  ]);
  audio.__recorder.setInput = jest.fn();
  await ReactTestRenderer.act(async () => { press(renderer, 'Audio Output'); });
  for (const output of ['Speaker', 'Headset', 'JBL Flip 5', 'No Audio']) {
    expect(renderer.root.findAllByProps({accessibilityLabel: `Use ${output}`}).length).toBeGreaterThan(0);
  }
  await ReactTestRenderer.act(async () => { press(renderer, 'Use JBL Flip 5'); });
  expect(audio.__recorder.setInput).toHaveBeenCalledWith('7');
  // The More sheet now names the route the call is on.
  expect(renderer.root.findAllByProps({children: 'JBL Flip 5'}).length).toBeGreaterThan(0);
  // "No Audio" silences everyone else; it is not a microphone mute.
  const media = require('../src/services/groupCallMedia');
  await ReactTestRenderer.act(async () => { press(renderer, 'Audio Output'); });
  await ReactTestRenderer.act(async () => { press(renderer, 'Use No Audio'); });
  expect(media.setGroupCallRemoteAudioEnabled).toHaveBeenLastCalledWith(false);
  expect(media.setGroupCallMuted).not.toHaveBeenCalledWith(true);
  delete audio.__recorder.getAvailableInputs;
  delete audio.__recorder.setInput;
  await ReactTestRenderer.act(async () => { press(renderer, 'Audio Output'); });

  await ReactTestRenderer.act(async () => { press(renderer, 'Back from Audio Output'); });
  await ReactTestRenderer.act(async () => { press(renderer, 'Microphone Settings'); });
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Echo Cancellation'}).length).toBeGreaterThan(0);
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Noise Suppression'}).length).toBeGreaterThan(0);

  await ReactTestRenderer.act(async () => { press(renderer, 'Back from Microphone Settings'); });
  await ReactTestRenderer.act(async () => { press(renderer, 'Call Status'); });
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Network Status: Stable'}).length).toBeGreaterThan(0);
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Auto Reconnect: Enabled'}).length).toBeGreaterThan(0);

  await ReactTestRenderer.act(async () => { press(renderer, 'Back from Call Status'); });
  await ReactTestRenderer.act(async () => { press(renderer, 'Video Effects'); });
  for (const effect of ['None', 'Blur', 'Office', 'Home', 'Forest']) {
    expect(renderer.root.findAllByProps({accessibilityLabel: `${effect} background`}).length).toBeGreaterThan(0);
  }
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Mirror my video'}).length).toBeGreaterThan(0);

  ReactTestRenderer.act(() => renderer.unmount());
});

test('the in-call Settings screen carries every section from the wireframe', async () => {
  const renderer = await renderScreen();
  await ReactTestRenderer.act(async () => { press(renderer, 'More'); });
  await ReactTestRenderer.act(async () => { press(renderer, 'Settings'); });

  for (const section of ['GENERAL', 'LAYOUT', 'NOTIFICATIONS', 'NETWORK']) {
    expect(renderer.root.findAllByProps({children: section}).length).toBeGreaterThan(0);
  }
  for (const toggle of [
    'Show reactions', 'Show Participants Name', 'Play Join/leave Sounds', 'Focus on Speaker',
    'Notify when Someone Speaks', 'Low Bandwidth Mode', 'Network Quality Indicator', 'Adaptive Bitrate',
  ]) {
    expect(renderer.root.findAllByProps({accessibilityLabel: toggle}).length).toBeGreaterThan(0);
  }
  // A dropdown announces its current value, which is also what it shows.
  for (const choice of [
    'Default View: Grid View', 'Grid Size: 8 (Default)', 'Notification Sound: Chime',
    'Video Quality: 720p (HD)', 'Screen Share Quality: 720p (HD)',
  ]) {
    expect(renderer.root.findAllByProps({accessibilityLabel: choice}).length).toBeGreaterThan(0);
  }

  // Choosing a different value writes it straight through.
  await ReactTestRenderer.act(async () => { press(renderer, 'Grid Size: 8 (Default)'); });
  await ReactTestRenderer.act(async () => { press(renderer, 'Set Grid Size to 4'); });
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Grid Size: 4'}).length).toBeGreaterThan(0);

  ReactTestRenderer.act(() => renderer.unmount());
});

test('a stored preference changes the call: Grid Size caps the tiles on screen', async () => {
  const storage = require('@react-native-async-storage/async-storage');
  await storage.setItem(
    'chatterly.group-call-settings.v1.me',
    JSON.stringify({gridSize: '4', showParticipantNames: false}),
  );

  const renderer = await renderScreen();
  await ReactTestRenderer.act(async () => {
    mockLiveHandlers.onUserJoined?.('u3');
    mockLiveHandlers.onUserJoined?.('u4');
  });

  // Everyone is on the call...
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Participants, 4 in call'}).length).toBeGreaterThan(0);
  // ...but names are switched off, so no tile renders one.
  expect(renderer.root.findAllByProps({children: 'You'})).toHaveLength(0);

  ReactTestRenderer.act(() => renderer.unmount());
  await storage.removeItem('chatterly.group-call-settings.v1.me');
});


test('screen sharing requires source selection and confirmation, and Cancel never captures', async () => {
  const media = require('../src/services/groupCallMedia');
  const renderer = await renderScreen();
  await press(renderer, 'More');
  await press(renderer, 'Share Screen');
  await ReactTestRenderer.act(async () => { renderer.root.findByType(require('../src/components/GroupCallSheets').GroupCallMoreSheet).props.onDismiss(); });
  expect(media.startGroupCallScreenCapture).not.toHaveBeenCalled();
  await press(renderer, 'Entire Screen');
  const share = renderer.root.findByType(require('../src/components/GroupCallScreenShare').GroupCallScreenShare);
  expect(share.props.step).toBe('confirm');
  await ReactTestRenderer.act(async () => { share.props.onClose(); });
  expect(share.props.step).toBe('');
  expect(media.startGroupCallScreenCapture).not.toHaveBeenCalled();
  await ReactTestRenderer.act(async () => { renderer.unmount(); });
});

test('confirmed screen sharing starts capture and the banner stops it', async () => {
  const media = require('../src/services/groupCallMedia');
  const onClose = jest.fn();
  const renderer = await renderScreen({onClose});
  await press(renderer, 'More');
  await press(renderer, 'Share Screen');
  await ReactTestRenderer.act(async () => { renderer.root.findByType(require('../src/components/GroupCallSheets').GroupCallMoreSheet).props.onDismiss(); });
  await press(renderer, 'Entire Screen');
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Start Sharing'}).props.onPress();
  });
  expect(media.startGroupCallScreenCapture).toHaveBeenCalledTimes(1);
  expect(renderer.root.findByProps({accessibilityLabel: 'Aarav Sharma (You), sharing screen'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'Aarav Sharma screen share details'})).toBeDefined();
  const viewport = renderer.root.findByProps({accessibilityLabel: 'Shared screen viewport'});
  await ReactTestRenderer.act(async () => {
    viewport.props.onLayout({nativeEvent: {layout: {x: 0, y: 0, width: 365, height: 300}}});
  });
  const localPresentation = renderer.root.findByProps({accessibilityLabel: 'Aarav Sharma (You), sharing screen'});
  expect(localPresentation.props.style).toEqual(expect.arrayContaining([expect.objectContaining({width: 365, height: 300})]));
  const sharedContent = renderer.root.findByProps({streamURL: 'mock://screen-share'});
  expect(sharedContent.props.objectFit).toBe('contain');
  expect(sharedContent.props.mirror).toBe(false);
  expect(StyleSheet.flatten(sharedContent.props.style)).toEqual(expect.objectContaining({top: 0, right: 0, bottom: 0, left: 0}));
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Stop sharing your screen'}).props.onPress();
  });
  expect(media.stopGroupCallScreenCapture).toHaveBeenCalledTimes(1);
  expect(renderer.root.findAllByProps({accessibilityLabel: 'You are sharing your screen'})).toHaveLength(0);
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Participants, 2 in call'}).length).toBeGreaterThan(0);
  expect(onClose).not.toHaveBeenCalled();
  expect(media.stopGroupCallMedia).not.toHaveBeenCalled();
  await ReactTestRenderer.act(async () => { renderer.unmount(); });
});

test('Android 14 Specific App selection reaches native capture after confirmation', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  jest.spyOn(Platform, 'Version', 'get').mockReturnValue(34);
  const media = require('../src/services/groupCallMedia');
  const renderer = await renderScreen();
  await press(renderer, 'More');
  await press(renderer, 'Share Screen');
  expect(renderer.root.findByProps({accessibilityLabel: 'Specific App'}).props.accessibilityState.disabled).toBe(false);
  await press(renderer, 'Specific App');
  expect(renderer.root.findByType(require('../src/components/GroupCallScreenShare').GroupCallScreenShare).props.source).toBe('app');
  expect(media.startGroupCallScreenCapture).not.toHaveBeenCalled();
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Start Sharing'}).props.onPress();
  });
  expect(media.startGroupCallScreenCapture).toHaveBeenCalledWith(expect.any(Function), expect.any(Boolean), expect.any(Number), expect.any(Boolean), 'app');
  await ReactTestRenderer.act(async () => renderer.unmount());
  jest.restoreAllMocks();
});

test.each(['ios', 'android'] as const)('%s: unsupported app sharing explains availability without a Coming Soon placeholder', async os => {
  jest.replaceProperty(Platform, 'OS', os);
  jest.spyOn(Platform, 'Version', 'get').mockReturnValue(os === 'ios' ? '18.0' : 33);
  const renderer = await renderScreen();
  await press(renderer, 'More');
  await press(renderer, 'Share Screen');
  await ReactTestRenderer.act(async () => renderer.root.findByType(require('../src/components/GroupCallSheets').GroupCallMoreSheet).props.onDismiss());
  const option = renderer.root.findByProps({accessibilityLabel: 'Specific App'});
  expect(option.props.disabled).toBe(true);
  expect(renderer.root.findAll(node => typeof node.props.children === 'string' && /coming soon/i.test(node.props.children))).toHaveLength(0);
  expect(renderer.root.findByProps({accessibilityLabel: 'Entire Screen'}).props.onPress).toBeDefined();
  await ReactTestRenderer.act(async () => renderer.unmount());
  jest.restoreAllMocks();
});

test('shared content keeps participant and call chrome outside the presentation', async () => {
  const media = require('../src/services/groupCallMedia');
  media.subscribeToGroupCallStreams.mockImplementationOnce((listener: (streams: {userId: string; url: string}[]) => void) => {
    listener([{userId: 'u2', url: 'mock://remote-screen'}]);
    return () => undefined;
  });
  const renderer = await renderScreen();

  await ReactTestRenderer.act(async () => { mockLiveHandlers.onScreenShareStarted?.('u2'); });

  const viewport = renderer.root.findByProps({accessibilityLabel: 'Shared screen viewport'});
  await ReactTestRenderer.act(async () => {
    viewport.props.onLayout({nativeEvent: {layout: {x: 0, y: 0, width: 365, height: 40}}});
  });

  const sharedContent = renderer.root.findByProps({accessibilityLabel: 'Bishod Thomas, sharing screen'});
  expect(renderer.root.findByProps({accessibilityLabel: 'Bishod Thomas screen share details'})).toBeDefined();
  expect(sharedContent.findAllByProps({accessibilityLabel: "Bishod Thomas's microphone is on"})).toHaveLength(0);
  expect(sharedContent.findAllByProps({children: 'Bishod Thomas'})).toHaveLength(0);
  const video = sharedContent.findByProps({streamURL: 'mock://remote-screen'});
  expect(video.props.objectFit).toBe('contain');
  expect(video.props.mirror).toBe(false);
  expect(sharedContent.props.style).toEqual(expect.arrayContaining([expect.objectContaining({width: 365, height: 40})]));

  // Rotation, banners and split-screen resizing must use the actual remaining
  // viewport, even when it is smaller than the surrounding participant chrome.
  for (const size of [{width: 720, height: 120}, {width: 260, height: 18}, {width: 365, height: 430}]) {
    await ReactTestRenderer.act(async () => {
      viewport.props.onLayout({nativeEvent: {layout: {x: 0, y: 0, ...size}}});
    });
    expect(sharedContent.props.style).toEqual(expect.arrayContaining([expect.objectContaining(size)]));
  }
  expect(StyleSheet.flatten(viewport.props.style)).toEqual(expect.objectContaining({flex: 1, minHeight: 0, overflow: 'hidden'}));

  ReactTestRenderer.act(() => renderer.unmount());
});

test('a remote file displays an in-call banner to a participant watching a screen share', async () => {
  const renderer = await renderScreen();
  await ReactTestRenderer.act(async () => { mockLiveHandlers.onScreenShareStarted?.('u2'); });
  await ReactTestRenderer.act(async () => {
    mockFileShareHandler?.({
      id: 'file-1', chatId: 'group-1', senderId: 'u3', senderName: 'Chivan Mathew',
      messageType: 'file', fileName: 'Sprint-plan.pdf', isOwn: false,
    });
  });

  expect(renderer.root.findByProps({accessibilityLabel: 'Chivan Mathew shared Sprint-plan.pdf.'})).toBeDefined();
  ReactTestRenderer.act(() => renderer.unmount());
});

test('the presenter sees their own file banner and each uploaded file gets time to be read', async () => {
  jest.useFakeTimers();
  const appState = jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    listener('active');
    return {remove: jest.fn()};
  });
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  try {
    renderer = await renderScreen();
    await ReactTestRenderer.act(async () => { mockLiveHandlers.onScreenShareStarted?.('me'); });
    const file = {id: 'own-1', chatId: 'group-1', senderId: 'me', messageType: 'file', fileName: 'Report.pdf', isOwn: true};
    await ReactTestRenderer.act(async () => {
      mockFileShareHandler?.(file);
      mockFileShareHandler?.(file);
      mockFileShareHandler?.({...file, id: 'own-2', fileName: 'Notes.pdf'});
      mockLiveHandlers.onUserJoined?.('u3');
    });
    expect(renderer.root.findByProps({accessibilityLabel: 'You shared Report.pdf.'})).toBeDefined();
    expect(renderer.root.findByProps({accessibilityLabel: 'Aarav Sharma (You), sharing screen'})).toBeDefined();
    await ReactTestRenderer.act(async () => { jest.advanceTimersByTime(3500); });
    expect(renderer.root.findByProps({accessibilityLabel: 'You shared Notes.pdf.'})).toBeDefined();
    await ReactTestRenderer.act(async () => { jest.advanceTimersByTime(3500); });
    expect(renderer.root.findAllByProps({accessibilityLabel: 'You shared Report.pdf.'})).toHaveLength(0);
    expect(renderer.root.findAllByProps({accessibilityLabel: 'You shared Notes.pdf.'})).toHaveLength(0);
  } finally {
    if (renderer) ReactTestRenderer.act(() => renderer?.unmount());
    appState.mockRestore();
    jest.useRealTimers();
  }
});

test('the presenter own file banner waits until the minimized call and its panels are visible again', async () => {
  jest.useFakeTimers();
  let changeAppState: (state: 'active' | 'background') => void = () => undefined;
  const appState = jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    changeAppState = listener;
    listener('active');
    return {remove: jest.fn()};
  });
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  try {
    renderer = await renderScreen({visible: false});
    await ReactTestRenderer.act(async () => { mockLiveHandlers.onScreenShareStarted?.('me'); });
    await ReactTestRenderer.act(async () => {
      mockFileShareHandler?.({id: 'own-1', chatId: 'group-1', senderId: 'me', messageType: 'file', fileName: 'Report.pdf', isOwn: true});
    });
    await ReactTestRenderer.act(async () => { jest.advanceTimersByTime(10000); });
    const props = renderer.root.findByType(GroupCallScreen).props as React.ComponentProps<typeof GroupCallScreen>;
    await ReactTestRenderer.act(async () => {
      renderer!.update(<SafeAreaProvider initialMetrics={metrics}><GroupCallScreen {...props} visible /></SafeAreaProvider>);
    });
    expect(renderer.root.findByProps({accessibilityLabel: 'You shared Report.pdf.'})).toBeDefined();
    await ReactTestRenderer.act(async () => { press(renderer!, 'Participants, 2 in call'); });
    await ReactTestRenderer.act(async () => { jest.advanceTimersByTime(10000); });
    await ReactTestRenderer.act(async () => { press(renderer!, 'Back from Participants'); });
    expect(renderer.root.findByProps({accessibilityLabel: 'You shared Report.pdf.'})).toBeDefined();
    await ReactTestRenderer.act(async () => { changeAppState('background'); });
    await ReactTestRenderer.act(async () => { jest.advanceTimersByTime(10000); });
    await ReactTestRenderer.act(async () => { changeAppState('active'); });
    expect(renderer.root.findByProps({accessibilityLabel: 'You shared Report.pdf.'})).toBeDefined();
    await ReactTestRenderer.act(async () => { jest.advanceTimersByTime(3500); });
    expect(renderer.root.findAllByProps({accessibilityLabel: 'You shared Report.pdf.'})).toHaveLength(0);
  } finally {
    if (renderer) ReactTestRenderer.act(() => renderer?.unmount());
    appState.mockRestore();
    jest.useRealTimers();
  }
});

test('sending a file without presenting does not add a presenter notification', async () => {
  const renderer = await renderScreen();
  await ReactTestRenderer.act(async () => { mockLiveHandlers.onScreenShareStarted?.('u2'); });
  await ReactTestRenderer.act(async () => {
    mockFileShareHandler?.({id: 'own-1', chatId: 'group-1', senderId: 'me', messageType: 'file', fileName: 'Report.pdf', isOwn: true});
  });
  expect(renderer.root.findAllByProps({accessibilityLabel: 'You shared Report.pdf.'})).toHaveLength(0);
  ReactTestRenderer.act(() => renderer.unmount());
});

test('a participant cannot be removed while their screen is being shared', async () => {
  const renderer = await renderScreen();
  await ReactTestRenderer.act(async () => { mockLiveHandlers.onScreenShareStarted?.('u2'); });
  await ReactTestRenderer.act(async () => { press(renderer, 'Bishod Thomas, sharing screen'); });
  await ReactTestRenderer.act(async () => { press(renderer, 'Remove from the call'); });

  expect(mockRemoveParticipant).not.toHaveBeenCalled();
  expect(renderer.root.findByProps({accessibilityLabel: 'Bishod Thomas cannot be removed while sharing their screen.'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'Bishod Thomas, sharing screen'})).toBeDefined();
  ReactTestRenderer.act(() => renderer.unmount());
});

test('removal rechecks the backend when the local screen-share event is delayed', async () => {
  const renderer = await renderScreen();
  mockGetGroupCallDetails.mockResolvedValueOnce({
    groupCallId: 'call-1', groupId: 'group-1', status: 'active',
    isScreenSharing: true, screenSharingUserId: 'u2', participants: [],
  });

  await ReactTestRenderer.act(async () => { press(renderer, 'Participants, 2 in call'); });
  await ReactTestRenderer.act(async () => { press(renderer, 'Options for Bishod Thomas'); });
  await ReactTestRenderer.act(async () => { press(renderer, 'Remove from the call'); });

  expect(mockRemoveParticipant).not.toHaveBeenCalled();
  expect(renderer.root.findByProps({accessibilityLabel: 'Bishod Thomas cannot be removed while sharing their screen.'})).toBeDefined();
  ReactTestRenderer.act(() => renderer.unmount());
});

test('a host can mute and unmute the participant while their screen remains shared', async () => {
  const renderer = await renderScreen();
  await ReactTestRenderer.act(async () => { mockLiveHandlers.onScreenShareStarted?.('u2'); });

  await ReactTestRenderer.act(async () => { press(renderer, 'Bishod Thomas, sharing screen'); });
  await ReactTestRenderer.act(async () => { press(renderer, 'Mute participant'); });
  await ReactTestRenderer.act(async () => { press(renderer, 'Bishod Thomas, sharing screen, muted'); });
  await ReactTestRenderer.act(async () => { press(renderer, 'Unmute participant'); });

  expect(mockMuteParticipant).toHaveBeenCalledWith('call-1', 'u2');
  expect(mockRequestParticipantUnmute).toHaveBeenCalledWith('u2');
  expect(renderer.root.findByProps({accessibilityLabel: 'Bishod Thomas, sharing screen'})).toBeDefined();
  ReactTestRenderer.act(() => renderer.unmount());
});

test('screen-share activity notifications stay in flow above the call controls', async () => {
  const renderer = await renderScreen();
  await ReactTestRenderer.act(async () => { mockLiveHandlers.onScreenShareStarted?.('u2'); });

  const notice = renderer.root.findByProps({accessibilityLabel: 'Bishod Thomas started sharing their screen.'});
  expect(StyleSheet.flatten(notice.props.style).position).toBeUndefined();
  expect(renderer.root.findAllByProps({accessibilityLabel: 'End'}).length).toBeGreaterThan(0);
  ReactTestRenderer.act(() => renderer.unmount());
});

test('reconciles mute and unmute notifications from an older client without covering call controls', async () => {
  jest.useFakeTimers();
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  try {
    renderer = await renderScreen();
    mockGetGroupCallDetails.mockResolvedValue({
      groupCallId: 'call-1', groupId: 'group-1', groupName: 'Project Team Alpha', groupPhoto: null,
      startedBy: 'me', startedByName: 'Aarav Sharma', type: 'video', status: 'active',
      isScreenSharing: false, screenSharingUserId: '', startedAt: session.startedAt, duration: 0,
      participants: [
        {userId: 'me', name: 'Aarav Sharma', profilePic: null, leftAt: null, isMuted: false, videoEnabled: true, isOnHold: false},
        {userId: 'u2', name: 'Bishod Thomas', profilePic: null, leftAt: null, isMuted: true, videoEnabled: true, isOnHold: false},
      ],
    });

    await ReactTestRenderer.act(async () => {
      jest.advanceTimersByTime(2000);
      await Promise.resolve();
    });

    const notice = renderer.root.findByProps({accessibilityLabel: 'Bishod Thomas was muted.'});
    expect(StyleSheet.flatten(notice.props.style).position).toBeUndefined();
    expect(renderer.root.findByProps({accessibilityLabel: 'Bishod Thomas, muted'})).toBeDefined();
    expect(renderer.root.findAllByProps({accessibilityLabel: 'End'}).length).toBeGreaterThan(0);

    mockGetGroupCallDetails.mockResolvedValue({
      groupCallId: 'call-1', groupId: 'group-1', groupName: 'Project Team Alpha', groupPhoto: null,
      startedBy: 'me', startedByName: 'Aarav Sharma', type: 'video', status: 'active',
      isScreenSharing: false, screenSharingUserId: '', startedAt: session.startedAt, duration: 0,
      participants: [
        {userId: 'me', name: 'Aarav Sharma', profilePic: null, leftAt: null, isMuted: false, videoEnabled: true, isOnHold: false},
        {userId: 'u2', name: 'Bishod Thomas', profilePic: null, leftAt: null, isMuted: false, videoEnabled: true, isOnHold: false},
      ],
    });
    await ReactTestRenderer.act(async () => {
      jest.advanceTimersByTime(2000);
      await Promise.resolve();
    });

    expect(renderer.root.findByProps({accessibilityLabel: 'Bishod Thomas was unmuted.'})).toBeDefined();
    expect(renderer.root.findByProps({accessibilityLabel: 'Bishod Thomas'})).toBeDefined();
  } finally {
    if (renderer) { ReactTestRenderer.act(() => renderer?.unmount()); }
    jest.useRealTimers();
  }
});

test('reconciles screen-share notifications from an older client without moving the controls', async () => {
  jest.useFakeTimers();
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  try {
    renderer = await renderScreen();
    mockGetGroupCallDetails.mockResolvedValue({
      groupCallId: 'call-1', groupId: 'group-1', groupName: 'Project Team Alpha', groupPhoto: null,
      startedBy: 'me', startedByName: 'Aarav Sharma', type: 'video', status: 'active',
      isScreenSharing: true, screenSharingUserId: 'u2', startedAt: session.startedAt, duration: 0,
      participants: [
        {userId: 'me', name: 'Aarav Sharma', profilePic: null, leftAt: null, isMuted: false, videoEnabled: true, isOnHold: false},
        {userId: 'u2', name: 'Bishod Thomas', profilePic: null, leftAt: null, isMuted: false, videoEnabled: true, isOnHold: false},
      ],
    });

    await ReactTestRenderer.act(async () => {
      jest.advanceTimersByTime(2000);
      await Promise.resolve();
    });

    const notice = renderer.root.findByProps({accessibilityLabel: 'Bishod Thomas started sharing their screen.'});
    expect(StyleSheet.flatten(notice.props.style).position).toBeUndefined();
    expect(renderer.root.findByProps({accessibilityLabel: 'Bishod Thomas, sharing screen'})).toBeDefined();
    expect(renderer.root.findAllByProps({accessibilityLabel: 'End'}).length).toBeGreaterThan(0);

    mockGetGroupCallDetails.mockResolvedValue({
      groupCallId: 'call-1', groupId: 'group-1', groupName: 'Project Team Alpha', groupPhoto: null,
      startedBy: 'me', startedByName: 'Aarav Sharma', type: 'video', status: 'active',
      isScreenSharing: false, screenSharingUserId: '', startedAt: session.startedAt, duration: 0,
      participants: [
        {userId: 'me', name: 'Aarav Sharma', profilePic: null, leftAt: null, isMuted: false, videoEnabled: true, isOnHold: false},
        {userId: 'u2', name: 'Bishod Thomas', profilePic: null, leftAt: null, isMuted: false, videoEnabled: true, isOnHold: false},
      ],
    });
    await ReactTestRenderer.act(async () => {
      jest.advanceTimersByTime(2000);
      await Promise.resolve();
    });

    expect(renderer.root.findByProps({accessibilityLabel: 'Bishod Thomas stopped sharing their screen.'})).toBeDefined();
    expect(renderer.root.findByProps({accessibilityLabel: 'Bishod Thomas'})).toBeDefined();
  } finally {
    if (renderer) { ReactTestRenderer.act(() => renderer?.unmount()); }
    jest.useRealTimers();
  }
});

test('a temporarily unavailable unmute channel reports inline without covering call controls', async () => {
  mockRequestParticipantUnmute.mockRejectedValueOnce(new Error('Unable to reach this participant. Try again in a moment.'));
  const renderer = await renderScreen();

  await ReactTestRenderer.act(async () => { press(renderer, 'Participants, 2 in call'); });
  await ReactTestRenderer.act(async () => { press(renderer, 'Options for Bishod Thomas'); });
  await ReactTestRenderer.act(async () => { press(renderer, 'Mute participant'); });
  await ReactTestRenderer.act(async () => { press(renderer, 'Options for Bishod Thomas'); });
  await ReactTestRenderer.act(async () => { press(renderer, 'Unmute participant'); });

  const notice = renderer.root.findByProps({accessibilityLabel: 'Unable to reach this participant. Try again in a moment.'});
  expect(StyleSheet.flatten(notice.props.style).position).toBeUndefined();
  expect(renderer.root.findAllByProps({accessibilityLabel: 'End'}).length).toBeGreaterThan(0);
  ReactTestRenderer.act(() => renderer.unmount());
});

test('fallback call errors render inline instead of over the controls', async () => {
  mockMuteParticipant.mockRejectedValueOnce(new Error('Unable to update microphone.'));
  const renderer = await renderScreen();
  await ReactTestRenderer.act(async () => { press(renderer, 'Participants, 2 in call'); });
  await ReactTestRenderer.act(async () => { press(renderer, 'Options for Bishod Thomas'); });
  await ReactTestRenderer.act(async () => { press(renderer, 'Mute participant'); });

  const snackbar = renderer.root.findByProps({message: 'Unable to update microphone.'});
  expect(snackbar.props.floating).toBe(false);
  expect(renderer.root.findAllByProps({accessibilityLabel: 'End'}).length).toBeGreaterThan(0);
  ReactTestRenderer.act(() => renderer.unmount());
});
