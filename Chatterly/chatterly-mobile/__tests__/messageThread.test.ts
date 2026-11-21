import type {ChatMessage} from '../src/types/chat';
import {
  applyReadReceipt,
  applyStatus,
  forwardedMessageForActiveThread,
  sortByTime,
  upsertMessage,
  reconcileStoredAndRemote,
  markDeletedForMe,
  markDeletedForEveryone,
} from '../src/utils/messageThread';

const message = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 'message-1',
  text: 'Hi',
  createdAt: '2026-08-24T00:55:00.000Z',
  isOwn: true,
  status: 'pending',
  messageType: 'text',
  ...overrides,
});

test('folds the server copy onto the optimistic bubble instead of duplicating it', () => {
  const optimistic = message({id: 'temp-1', tempId: 'temp-1', status: 'pending'});
  const stored = message({id: 'server-1', tempId: 'temp-1', status: 'sent'});

  const thread = upsertMessage([optimistic], stored);

  expect(thread).toHaveLength(1);
  expect(thread[0].id).toBe('server-1');
  expect(thread[0].status).toBe('sent');
  // The tempId is kept so a later broadcast carrying only the tempId still
  // finds this bubble.
  expect(thread[0].tempId).toBe('temp-1');
});

test('hydrates a sparse forward response so it can render in the active chat immediately', () => {
  const source = message({
    id: 'source-image',
    text: 'Sunset',
    messageType: 'image',
    mediaUrl: 'https://example.com/sunset.jpg',
    thumbnailUrl: 'https://example.com/sunset-thumb.jpg',
    isOwn: false,
    isPinned: true,
    pinnedAt: '2026-08-24T00:56:00.000Z',
  });
  const persisted = message({
    id: 'forwarded-image',
    text: '',
    messageType: 'image',
    mediaUrl: undefined,
    thumbnailUrl: undefined,
    createdAt: '2026-08-24T01:00:00.000Z',
    status: 'sent',
  });

  expect(forwardedMessageForActiveThread(source, persisted, 'user-ananya')).toEqual(expect.objectContaining({
    id: 'forwarded-image',
    text: 'Sunset',
    mediaUrl: 'https://example.com/sunset.jpg',
    thumbnailUrl: 'https://example.com/sunset-thumb.jpg',
    contactId: 'user-ananya',
    isForwarded: true,
    isOwn: true,
    isPinned: false,
    pinnedAt: null,
    status: 'sent',
  }));
});

test('keeps the text the composer already had when the server echo omits it', () => {
  const optimistic = message({id: 'temp-2', tempId: 'temp-2', text: 'Hello Ananya'});
  const echo = message({id: 'server-2', tempId: 'temp-2', text: '', status: 'delivered'});

  const [merged] = upsertMessage([optimistic], echo);

  expect(merged.text).toBe('Hello Ananya');
  expect(merged.status).toBe('delivered');
});

test('keeps the selected reply card when a partial server echo omits it', () => {
  const optimistic = message({
    id: 'temp-reply', tempId: 'temp-reply', text: 'I will be there',
    replyTo: 'original-1', replyPreview: {content: 'Yes, at 5 PM', messageType: 'text'},
  });
  const echo = message({
    id: 'server-reply', tempId: 'temp-reply', status: 'sent',
    replyTo: null, replyPreview: null,
  });

  const [merged] = upsertMessage([optimistic], echo);

  expect(merged.replyTo).toBe('original-1');
  expect(merged.replyPreview).toEqual({content: 'Yes, at 5 PM', messageType: 'text'});
});

test('does not regress the ticks when an ACK lands after the delivery receipt', () => {
  const delivered = message({id: 'server-3', tempId: 'temp-3', status: 'delivered'});
  const lateAck = message({id: 'server-3', tempId: 'temp-3', status: 'sent'});

  const [merged] = upsertMessage([delivered], lateAck);

  expect(merged.status).toBe('delivered');
});

test('appends a message from the other person as a new bubble', () => {
  const mine = message({id: 'server-4', isOwn: true});
  const theirs = message({id: 'server-5', isOwn: false, text: 'Hey'});

  expect(upsertMessage([mine], theirs)).toHaveLength(2);
});

test('applies a delivery receipt by server id or by the temp id', () => {
  const thread = [message({id: 'server-6', tempId: 'temp-6', status: 'sent'})];

  expect(applyStatus(thread, 'server-6', 'delivered')[0].status).toBe('delivered');
  expect(applyStatus(thread, 'temp-6', 'delivered')[0].status).toBe('delivered');
  expect(applyStatus(thread, 'someone-else', 'delivered')[0].status).toBe('sent');
});

test('marks only the messages named in a read receipt', () => {
  const thread = [
    message({id: 'a', status: 'delivered'}),
    message({id: 'b', status: 'delivered'}),
  ];

  const [first, second] = applyReadReceipt(thread, ['a']);

  expect(first.status).toBe('read');
  expect(second.status).toBe('delivered');
});

test('treats an empty read receipt as the whole conversation being read', () => {
  const thread = [
    message({id: 'a', status: 'sent'}),
    message({id: 'b', status: 'delivered'}),
    // Inbound messages have no status of ours to report.
    message({id: 'c', isOwn: false, status: 'sent'}),
  ];

  const [first, second, third] = applyReadReceipt(thread, []);

  expect(first.status).toBe('read');
  expect(second.status).toBe('read');
  expect(third.status).toBe('sent');
});

test('orders the thread oldest first, the way it renders', () => {
  const later = message({id: 'b', createdAt: '2026-08-24T01:00:00.000Z'});
  const earlier = message({id: 'a', createdAt: '2026-08-24T00:55:00.000Z'});

  expect(sortByTime([later, earlier]).map(item => item.id)).toEqual(['a', 'b']);
});

test('reconciles cloud history without losing queued device messages', () => {
  const cached = message({id: 'old-id', tempId: 'temp-a', status: 'sent'});
  const queued = message({id: 'temp-b', tempId: 'temp-b', text: 'Offline', queued: true});
  const remote = message({id: 'server-a', tempId: 'temp-a', status: 'delivered'});
  const result = reconcileStoredAndRemote([cached, queued], [remote]);
  expect(result).toHaveLength(2);
  expect(result.find(item => item.tempId === 'temp-a')).toEqual(expect.objectContaining({id: 'server-a', status: 'delivered'}));
  expect(result).toContainEqual(expect.objectContaining({tempId: 'temp-b', queued: true}));
});

test('keeps a cached media batch id when the backend copy has no grouping field', () => {
  const cached = message({id: 'media-1', messageType: 'image', mediaGroupId: 'batch-1', status: 'sent'});
  const remote = message({id: 'media-1', messageType: 'image', status: 'delivered'});
  const [merged] = reconcileStoredAndRemote([cached], [remote]);
  expect(merged.mediaGroupId).toBe('batch-1');
  expect(merged.status).toBe('delivered');
});

test('keeps a content-free delete-for-me tombstone when cloud history omits the recipient-only message', () => {
  const original = message({
    id: 'received-1', isOwn: false, text: 'Private original', messageType: 'image',
    mediaUrl: 'https://cdn.example/original.jpg', mediaGroupId: 'album-1',
  });

  const [tombstone] = markDeletedForMe([original], original.id);
  const reopened = reconcileStoredAndRemote([tombstone], []);

  expect(reopened).toEqual([expect.objectContaining({
    id: 'received-1', text: '', messageType: 'text', deletedForMe: true,
    mediaUrl: undefined, mediaGroupId: null,
  })]);
});

const globalDeletionCases: Array<[NonNullable<ChatMessage['messageType']>, Partial<ChatMessage>]> = [
  ['text', {text: 'Secret'}],
  ['image', {mediaUrl: 'image.jpg', thumbnailUrl: 'thumb.jpg'}],
  ['video', {mediaUrl: 'video.mp4', thumbnailUrl: 'video-thumb.jpg'}],
  ['file', {mediaUrl: 'document.pdf', fileName: 'document.pdf', fileType: 'application/pdf'}],
  ['audio', {mediaUrl: 'voice.m4a', audioDuration: 12, waveform: [4, 8, 6]}],
];

test.each(globalDeletionCases)('globally tombstones %s content without moving it or changing its timestamp', (messageType, content) => {
  const original = message({
    id: `global-${messageType}`, createdAt: '2026-08-24T03:15:00.000Z',
    messageType, ...content,
  });

  const [deleted] = markDeletedForEveryone([original], original.id);

  expect(deleted).toEqual(expect.objectContaining({
    id: original.id,
    createdAt: original.createdAt,
    isOwn: original.isOwn,
    isDeleted: true,
    text: '',
    messageType: 'text',
    mediaUrl: undefined,
    thumbnailUrl: undefined,
    fileName: undefined,
    waveform: undefined,
  }));
});

test('does not restore cached content when the server returns a global deletion', () => {
  const cached = message({id: 'global-1', text: 'Original text'});
  const deleted = message({id: 'global-1', text: '', isDeleted: true});

  const [merged] = reconcileStoredAndRemote([cached], [deleted]);

  expect(merged).toEqual(expect.objectContaining({id: 'global-1', text: '', isDeleted: true}));
});

test.each(['me', 'everyone'] as const)('keeps an audio deletion for %s through stale history and socket echoes', scope => {
  const audio = message({id:'voice-1',messageType:'audio',text:'',status:'sent',mediaUrl:'https://cdn.example/voice.m4a',audioDuration:12,waveform:[4,8,6]});
  const deleted = scope === 'me' ? markDeletedForMe([audio], audio.id) : markDeletedForEveryone([audio], audio.id);
  const stale = {...audio,isDeleted:false,deletedForMe:false};
  const refreshed = reconcileStoredAndRemote(deleted, [stale]);
  const echoed = upsertMessage(refreshed, stale);
  expect(echoed).toHaveLength(1);
  expect(echoed[0]).toEqual(expect.objectContaining({
    [scope === 'me' ? 'deletedForMe' : 'isDeleted']:true,
    messageType:'text',mediaUrl:undefined,audioDuration:undefined,waveform:undefined,
  }));
});

test('retains an everyone-deletion marker when history omits it, so a delayed audio echo stays deleted', () => {
  const audio = message({id:'voice-omitted',messageType:'audio',status:'sent',mediaUrl:'voice.m4a'});
  const deleted = markDeletedForEveryone([audio], audio.id);
  const reopened = reconcileStoredAndRemote(deleted, []);
  expect(reopened).toHaveLength(1);
  const [echoed] = upsertMessage(reopened, {...audio,isDeleted:false});
  expect(echoed.isDeleted).toBe(true);
  expect(echoed.mediaUrl).toBeUndefined();
});

test.each(['me', 'everyone'] as const)('keeps deletion for %s when a late upload assigns the voice note its server ID', scope => {
  const audio = message({id:'temp-voice',tempId:'temp-voice',messageType:'audio',mediaUrl:'file:///voice.m4a',queued:true});
  const deleted = scope === 'me' ? markDeletedForMe([audio], audio.id) : markDeletedForEveryone([audio], audio.id);
  const acknowledged = upsertMessage(deleted, {...audio,id:'server-voice',status:'sent',isDeleted:false,deletedForMe:false});
  const delayedLocalCopy = upsertMessage(acknowledged, audio);
  const echoed = upsertMessage(delayedLocalCopy, {...audio,id:'server-voice',tempId:null,status:'delivered',isDeleted:false,deletedForMe:false});
  expect(echoed).toHaveLength(1);
  expect(echoed[0]).toEqual(expect.objectContaining({
    id:'server-voice',tempId:'temp-voice',queued:false,
    [scope === 'me' ? 'deletedForMe' : 'isDeleted']:true,
    mediaUrl:undefined,messageType:'text',
  }));
});

test('a read receipt never paints ticks on a message the server has not seen', () => {
  const thread = [
    message({id: 'sent-1', status: 'sent'}),
    message({id: 'temp-1', status: 'pending'}),
    message({id: 'temp-2', status: 'failed'}),
  ];

  // The blanket form the server uses for "the whole chat was read".
  const [acknowledged, pending, failed] = applyReadReceipt(thread, []);

  expect(acknowledged.status).toBe('read');
  // The receiver cannot have read what is still sitting in our outbox.
  expect(pending.status).toBe('pending');
  expect(failed.status).toBe('failed');
});
