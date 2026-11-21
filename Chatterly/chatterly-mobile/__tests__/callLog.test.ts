import {callLogDisplayKind, callLogDisplayLabel, formatCallLogDuration, formatCallLogText, isCallLogMessage} from '../src/utils/callLog';
import {messagePreview} from '../src/utils/messagePreview';
import {normalizeMessage} from '../src/services/chatApi';

jest.mock('../src/services/sessionStore', () => ({
  getSession: () => ({token: 'jwt', user: {id: 'me'}}),
  getToken: () => 'jwt',
}));

test('a logged duration reads as a timer rather than raw seconds', () => {
  expect(formatCallLogDuration(0)).toBe('00:00');
  expect(formatCallLogDuration(65)).toBe('01:05');
  expect(formatCallLogDuration(3725)).toBe('01:02:05');
  expect(formatCallLogDuration(-1)).toBe('00:00');
});

test('the backend sentences become the lines the thread shows', () => {
  expect(formatCallLogText('video group call started')).toBe('Video group call started');
  expect(formatCallLogText('video group call ended (125s)')).toBe('Video group call ended · 02:05');
  expect(formatCallLogText('audio call completed (65s)')).toBe('Audio call completed · 01:05');
  expect(formatCallLogText('Missed audio call')).toBe('Missed audio call');
  expect(formatCallLogText('Outgoing video call - Not Answered')).toBe('Outgoing video call — Not Answered');
  expect(formatCallLogText('   ')).toBe('Call');
});

test('only a call message is a call log', () => {
  expect(isCallLogMessage('call')).toBe(true);
  expect(isCallLogMessage('text')).toBe(false);
  expect(isCallLogMessage(undefined)).toBe(false);
});

test('maps backend call status and direction to the four conversation icons', () => {
  expect(callLogDisplayKind({callStatus: 'missed', isOwn: false, text: 'Audio call missed'})).toBe('missed');
  expect(callLogDisplayKind({callStatus: 'completed', isOwn: false, text: 'Audio call completed'})).toBe('incoming');
  expect(callLogDisplayKind({callStatus: 'completed', isOwn: true, text: 'Audio call completed'})).toBe('outgoing');
  expect(callLogDisplayKind({callStatus: 'rejected', isOwn: true, text: 'Audio call rejected'})).toBe('declined');
});

test('recognizes statuses in legacy call text when callStatus is absent', () => {
  expect(callLogDisplayKind({isOwn: true, text: 'Outgoing video call — Not Answered'})).toBe('missed');
  expect(callLogDisplayKind({isOwn: false, text: 'Incoming audio call declined'})).toBe('declined');
});

test('renders call events as concise call cards instead of backend sentences', () => {
  expect(callLogDisplayLabel({callStatus: 'completed', isOwn: true, text: 'Audio call completed · 01:05'})).toEqual({title: 'Outgoing audio call', detail: '01:05'});
  expect(callLogDisplayLabel({callStatus: 'rejected', isOwn: false, text: 'audio call rejected'})).toEqual({title: 'Audio call rejected', detail: ''});
  expect(callLogDisplayLabel({callStatus: 'missed', isOwn: false, text: 'audio call missed'})).toEqual({title: 'Missed audio call', detail: ''});
});

test('a call log is a timeline notice, not a chat bubble from whoever started it', () => {
  const message = normalizeMessage({
    _id: 'm1',
    sender: 'someone-else',
    groupId: 'group-1',
    messageType: 'call',
    encryptedContent: 'video group call ended (125s)',
    createdAt: '2026-09-21T10:00:00.000Z',
  } as never);

  expect(message.systemEvent).toBe(true);
  expect(message.messageType).toBe('call');
  expect(message.text).toBe('Video group call ended · 02:05');
});

test('a call log keeps the call it belongs to, which is how a member rejoins', () => {
  const started = normalizeMessage({
    _id: 'm1',
    sender: 'someone-else',
    groupId: 'group-1',
    messageType: 'call',
    callId: {_id: 'call-9'},
    callStatus: 'started',
    encryptedContent: 'video group call started',
    createdAt: '2026-09-21T10:00:00.000Z',
  } as never);
  expect(started.callId).toBe('call-9');
  expect(started.callStatus).toBe('started');

  // An ordinary message carries neither.
  const text = normalizeMessage({
    _id: 'm2', sender: 'someone-else', chatId: 'chat-1', encryptedContent: 'hello',
  } as never);
  expect(text.callId).toBeNull();
  expect(text.callStatus).toBeNull();
});

test('the chat list shows the call, not a phantom document', () => {
  const preview = messagePreview({
    id: 'm1',
    text: 'Video group call ended · 02:05',
    createdAt: '2026-09-21T10:00:00.000Z',
    isOwn: false,
    messageType: 'call',
  });
  expect(preview).toBe('Video group call ended · 02:05');
});
