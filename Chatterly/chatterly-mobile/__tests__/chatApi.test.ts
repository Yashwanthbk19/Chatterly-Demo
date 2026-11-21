import {apiRequest} from '../src/api/client';
import {API_BASE_URL} from '../src/config/api';
import {
  getCallStatus,
  archiveChat,
  deleteChat,
  deleteMessage,
  enrichChatList,
  findDirectChatForUser,
  getChatFiles,
  getChatList,
  getForwardDestinations,
  getMediaDownloadUrl,
  getChatMessages,
  markChatUnread,
  pinMessage,
  pinChatThread,
  locationMessage,
  normalizeMessage,
  normalizeChatList,
  searchChatContacts,
  sendChatMedia,
  sendChatFile,
  sendChatMessage,
  startChat,
  unpinMessage,
  unpinChatThread,
} from '../src/services/chatApi';
import {clearChatListActivities, recordChatListActivity} from '../src/services/chatListActivity';

jest.mock('../src/api/client', () => ({apiRequest: jest.fn()}));
jest.mock('../src/services/sessionStore', () => ({
  getToken: () => 'jwt-token',
  getSession: () => ({token: 'jwt-token', user: {id: 'current-user'}}),
}));

function apiResponse(payload: unknown): Response {
  return {json: jest.fn().mockResolvedValue(payload)} as unknown as Response;
}

test('resolves download links without probing development hosts or waiting on the normal API timeout', async () => {
  jest.mocked(apiRequest).mockResolvedValueOnce(apiResponse({downloadUrl: 'https://signed.example/report.pdf'}));
  await expect(getMediaDownloadUrl('message/1')).resolves.toBe('https://signed.example/report.pdf');
  expect(apiRequest).toHaveBeenCalledWith(
    `${API_BASE_URL}/chats/download/message%2F1`,
    expect.objectContaining({method: 'GET'}),
    {timeoutMs: 5000, allowDevelopmentFallback: false},
  );
});

beforeEach(() => {
  jest.clearAllMocks();
  clearChatListActivities();
});

test('keeps a just-messaged contact in recent destinations while the backend list catches up', async () => {
  jest.mocked(apiRequest).mockResolvedValueOnce(apiResponse({data: []}));
  recordChatListActivity({
    ownerId: 'current-user', chatId: 'chat-anil',
    contact: {userId: 'user-anil', name: 'Anil - Anil', kind: 'contact'},
    preview: 'Yes', createdAt: '2026-10-13T12:01:00.000Z',
    messageId: 'message-yes', status: 'sent',
  });

  await expect(getForwardDestinations()).resolves.toEqual([
    expect.objectContaining({id: 'user-anil', name: 'Anil - Anil', recent: true}),
  ]);
  expect(apiRequest).toHaveBeenCalledWith(`${API_BASE_URL}/chats/list`, expect.objectContaining({method: 'GET'}));
});

test('finds a direct chat by either string or populated participant id', () => {
  const chats = [
    {_id: 'group-1', type: 'group', participants: [{user: 'target-user'}]},
    {_id: 'chat-1', type: 'chat', participants: [{user: 'current-user'}, {user: {_id: 'target-user'}}]},
  ];

  expect(findDirectChatForUser(chats, 'target-user')?._id).toBe('chat-1');
  expect(findDirectChatForUser(chats, 'missing-user')).toBeNull();
});

test('encodes a compatible maps link and renders it as a location message', () => {
  const content = locationMessage(9.9252, 78.1198, 'Madurai');
  expect(content).toContain('https://www.google.com/maps?q=9.925200,78.119800');
  expect(normalizeMessage({
    _id: 'location-1', sender: 'target-user', encryptedContent: content,
  })).toEqual(expect.objectContaining({
    messageType: 'location', latitude: 9.9252, longitude: 78.1198,
    locationName: 'Madurai', text: '',
  }));
});

test('normalizes member add and removal timeline entries as centered system events', () => {
  expect(normalizeMessage({
    _id: 'member-added-1', sender: { _id: 'current-user', name: 'Admin' },
    content: 'Nina added to the group.', messageType: 'text',
  })).toEqual(expect.objectContaining({systemEvent: true, text: 'Nina added to the group.'}));
  expect(normalizeMessage({
    _id: 'member-removed-1', sender: { _id: 'current-user', name: 'Admin' },
    content: 'Nina removed from the group.', messageType: 'text',
  })).toEqual(expect.objectContaining({systemEvent: true, text: 'Nina removed from the group.'}));
});

test('normalizes group photo changes as centered system events', () => {
  expect(normalizeMessage({
    _id: 'group-photo-added', sender: { _id: 'current-user', name: 'Admin' },
    content: 'New group photo added.', messageType: 'text',
  })).toEqual(expect.objectContaining({systemEvent: true, text: 'New group photo added.'}));
  expect(normalizeMessage({
    _id: 'group-photo-removed', sender: { _id: 'current-user', name: 'Admin' },
    content: 'Group photo removed.', messageType: 'text',
  })).toEqual(expect.objectContaining({systemEvent: true, text: 'Group photo removed.'}));
});

test('rebuilds an album from the stored upload names after a reinstall', async () => {
  const stored = (id: string, minute: number, fileName: string, messageType = 'image') => ({
    _id: id, sender: 'current-user', messageType, mediaUrl: `https://cdn.example/${id}`,
    fileName, createdAt: `2026-10-14T09:0${minute}:00.000Z`,
  });
  jest.mocked(apiRequest).mockResolvedValueOnce(apiResponse({data: [
    stored('a', 1, 'IMG_1~album-lq3x9k2f7a.jpg'),
    stored('b', 2, 'IMG_2~album-lq3x9k2f7a.jpg'),
    stored('c', 3, 'clip~album-lq3x9k2f7a.mp4', 'video'),
    stored('d', 4, 'IMG_3.jpg'),
  ]}));

  const messages = await getChatMessages('chat-1');

  expect(messages.map(message => message.mediaGroupId)).toEqual([
    'media-batch-lq3x9k2f7a', 'media-batch-lq3x9k2f7a', 'media-batch-lq3x9k2f7a', undefined,
  ]);
  // The tag never leaks into the name a download or a forward would use.
  expect(messages.map(message => message.fileName)).toEqual(['IMG_1.jpg', 'IMG_2.jpg', 'clip.mp4', 'IMG_3.jpg']);
  // A plain record has no album key at all, so a reload cannot wipe the id this
  // device already holds for a message it sent itself.
  expect('mediaGroupId' in messages[3]).toBe(false);
});

test('only photos and videos carry an album tag; a document keeps its literal name', () => {
  const document = normalizeMessage({
    _id: 'doc-1', sender: 'current-user', messageType: 'file', fileName: 'notes~album-abc123.pdf',
  });

  expect(document.fileName).toBe('notes~album-abc123.pdf');
  expect('mediaGroupId' in document).toBe(false);
});

test.each([
  {fileType: 'video/mp4', fileName: 'camera-upload'},
  {fileType: 'application/octet-stream', fileName: 'camera-upload.MP4'},
])('normalizes a generic video file so Download saves it to Gallery', file => {
  expect(normalizeMessage({
    _id: 'video-file', sender: 'target-user', messageType: 'file',
    mediaUrl: 'https://cdn.example/camera-upload', ...file,
  })).toEqual(expect.objectContaining({messageType: 'video'}));
});

test.each([
  {fileName: 'quarterly-report.pdf', fileType: 'image/jpeg'},
  {fileName: 'quarterly-report', fileType: 'application/pdf'},
  {fileName: 'planning.xlsx', fileType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'},
])('normalizes a document mislabeled by the server as an image', file => {
  expect(normalizeMessage({
    _id: 'document-file', sender: 'target-user', messageType: 'image',
    mediaUrl: 'https://cdn.example/document', ...file,
  })).toEqual(expect.objectContaining({messageType: 'file'}));
});

test('loads the chat list and starts a new chat through the documented endpoints', async () => {
  jest.mocked(apiRequest)
    .mockResolvedValueOnce(apiResponse({success: true, data: [{_id: 'chat-existing'}]}))
    .mockResolvedValueOnce(apiResponse({message: 'Chat created', chat: {_id: 'chat-new'}}));

  await expect(getChatList()).resolves.toEqual([{_id: 'chat-existing'}]);
  await expect(startChat('target-user')).resolves.toEqual({chatId: 'chat-new', chat: {_id: 'chat-new'}});

  expect(apiRequest).toHaveBeenNthCalledWith(1, `${API_BASE_URL}/chats/list`, expect.objectContaining({method: 'GET'}));
  expect(apiRequest).toHaveBeenNthCalledWith(2, `${API_BASE_URL}/chats/start`, expect.objectContaining({
    method: 'POST',
    body: JSON.stringify({receiverId: 'target-user'}),
  }));
});

test('loads ordered messages and sends the composer text to the backend', async () => {
  jest.mocked(apiRequest)
    .mockResolvedValueOnce(apiResponse({data: [
      {_id: 'later', sender: 'target-user', encryptedContent: 'Second', createdAt: '2026-08-19T06:02:00.000Z'},
      {_id: 'earlier', sender: 'current-user', encryptedContent: 'First', createdAt: '2026-08-19T06:01:00.000Z'},
    ]}))
    .mockResolvedValueOnce(apiResponse({data: {
      _id: 'sent',
      sender: 'current-user',
      encryptedContent: 'Hello',
      createdAt: '2026-08-19T06:03:00.000Z',
    }}));

  const messages = await getChatMessages('chat-1');
  expect(messages.map(message => message.text)).toEqual(['First', 'Second']);
  expect(messages[0].isOwn).toBe(true);

  await expect(sendChatMessage('target-user', '  Hello  ')).resolves.toEqual(expect.objectContaining({
    id: 'sent',
    text: 'Hello',
    isOwn: true,
  }));
  expect(apiRequest).toHaveBeenLastCalledWith(`${API_BASE_URL}/chats/send`, expect.objectContaining({
    method: 'POST',
    body: JSON.stringify({receiverId: 'target-user', encryptedContent: 'Hello'}),
  }));
});

test('shows one chat event for one unanswered one-to-one audio call', async () => {
  jest.mocked(apiRequest).mockResolvedValueOnce(apiResponse({data: [
    {
      _id: 'caller-copy', chatId: 'chat-1', sender: 'current-user', receiver: 'friend',
      encryptedContent: 'Audio call - Not Answered', messageType: 'call', callStatus: 'not_answered',
      createdAt: '2026-10-16T10:00:00.000Z',
    },
    {
      _id: 'receiver-copy', chatId: 'chat-1', sender: 'friend', receiver: 'current-user',
      encryptedContent: 'Missed audio call', messageType: 'call', callStatus: 'missed',
      createdAt: '2026-10-16T10:00:00.200Z',
    },
  ]}));

  await expect(getChatMessages('chat-1')).resolves.toEqual([
    expect.objectContaining({id: 'caller-copy', callStatus: 'not_answered', isOwn: true}),
  ]);
});

test('keeps the receiver-specific copy when loading the same unanswered call', async () => {
  jest.mocked(apiRequest).mockResolvedValueOnce(apiResponse({data: [
    {
      _id: 'caller-copy', sender: 'friend', receiver: 'current-user',
      encryptedContent: 'Audio call - Not Answered', messageType: 'call', callStatus: 'not_answered',
      createdAt: '2026-10-16T10:00:00.000Z',
    },
    {
      _id: 'receiver-copy', sender: 'current-user', receiver: 'friend',
      encryptedContent: 'Missed audio call', messageType: 'call', callStatus: 'missed',
      createdAt: '2026-10-16T10:00:00.200Z',
    },
  ]}));

  await expect(getChatMessages('chat-1')).resolves.toEqual([
    expect.objectContaining({id: 'receiver-copy', callStatus: 'missed', isOwn: true}),
  ]);
});

test('does not collapse separate missed calls or different call types', async () => {
  jest.mocked(apiRequest).mockResolvedValueOnce(apiResponse({data: [
    {_id: 'audio-out', sender: 'current-user', receiver: 'friend', encryptedContent: 'Audio call - Not Answered', messageType: 'call', callStatus: 'not_answered', createdAt: '2026-10-16T10:00:00.000Z'},
    {_id: 'video-missed', sender: 'friend', receiver: 'current-user', encryptedContent: 'Missed video call', messageType: 'call', callStatus: 'missed', createdAt: '2026-10-16T10:00:00.200Z'},
    {_id: 'audio-missed-later', sender: 'friend', receiver: 'current-user', encryptedContent: 'Missed audio call', messageType: 'call', callStatus: 'missed', createdAt: '2026-10-16T10:00:08.000Z'},
  ]}));

  await expect(getChatMessages('chat-1')).resolves.toHaveLength(3);
});

test('uploads a selected image through the documented multipart media endpoint', async () => {
  const originalXMLHttpRequest = globalThis.XMLHttpRequest;
  const progress = jest.fn();
  const uploadComplete = jest.fn();
  const request: any = {
    status: 200,
    responseText: JSON.stringify({data: {
      _id: 'media-1', sender: 'current-user', receiver: 'target-user',
      messageType: 'image', mediaUrl: 'https://cdn.example/photo.jpg',
      caption: 'Holiday', status: 'sent', createdAt: '2026-08-27T10:00:00.000Z',
    }}),
    upload: {},
    open: jest.fn(),
    setRequestHeader: jest.fn(),
    send: jest.fn((body: FormData) => {
      expect(body).toBeInstanceOf(FormData);
      request.upload.onprogress({lengthComputable: true, loaded: 60, total: 100});
      request.upload.onload();
      request.onload();
    }),
  };
  globalThis.XMLHttpRequest = jest.fn(() => request) as never;

  try {
    await expect(sendChatMedia('target-user', {
      uri: 'file:///cache/photo.jpg', name: 'photo.jpg', type: 'image/jpeg',
    }, {caption: 'Holiday', onUploadComplete: uploadComplete, onUploadProgress: progress})).resolves.toEqual(expect.objectContaining({
      id: 'media-1', messageType: 'image', mediaUrl: 'https://cdn.example/photo.jpg',
      text: 'Holiday', status: 'sent', isOwn: true,
    }));

    expect(request.open).toHaveBeenCalledWith('POST', `${API_BASE_URL}/chats/send-media`);
    expect(request.timeout).toBe(15 * 60 * 1000);
    expect(request.setRequestHeader).toHaveBeenCalledWith('Authorization', 'Bearer jwt-token');
    expect(request.send).toHaveBeenCalledTimes(1);
    expect(progress).toHaveBeenNthCalledWith(1, 0.6);
    expect(progress).toHaveBeenLastCalledWith(1);
    expect(uploadComplete).toHaveBeenCalledTimes(1);
  } finally {
    globalThis.XMLHttpRequest = originalXMLHttpRequest;
  }
});

test('loads recent files and uploads a document through the documented file endpoints', async () => {
  jest.mocked(apiRequest).mockResolvedValueOnce(apiResponse({data: [{
    _id:'file-old', sender:'target-user', messageType:'file', fileName:'brief.pdf',
    fileType:'application/pdf', fileSize:2400000, createdAt:'2026-08-27T10:17:00.000Z',
  }]}));
  await expect(getChatFiles('chat/file 1')).resolves.toEqual([expect.objectContaining({
    id:'file-old', fileName:'brief.pdf', mediaSize:2400000, messageType:'file',
  })]);
  expect(apiRequest).toHaveBeenCalledWith(`${API_BASE_URL}/chats/files/chat%2Ffile%201`, expect.objectContaining({method:'GET'}));

  const originalXMLHttpRequest = globalThis.XMLHttpRequest;
  const progress = jest.fn();
  const request: any = {
    status:200,
    responseText:JSON.stringify({data:{_id:'file-new',messageType:'image',mediaUrl:'https://cdn.example/brief.pdf',fileSize:2400000,status:'sent'}}),
    upload:{}, open:jest.fn(), setRequestHeader:jest.fn(),
    send:jest.fn(() => {
      request.upload.onprogress({lengthComputable:true,loaded:25,total:100});
      request.onload();
    }),
  };
  globalThis.XMLHttpRequest = jest.fn(() => request) as never;
  try {
    await expect(sendChatFile('target-user', {uri:'file:///brief.pdf',name:'brief.pdf',type:'application/pdf'}, {onUploadProgress:progress})).resolves.toEqual(expect.objectContaining({
      id:'file-new', fileName:'brief.pdf', mediaSize:2400000, messageType:'file', isOwn:true,
      fileType:'application/pdf',
    }));
    expect(request.open).toHaveBeenCalledWith('POST', `${API_BASE_URL}/chats/send-file`);
    expect(progress).toHaveBeenNthCalledWith(1, 0.25);
    expect(progress).toHaveBeenLastCalledWith(1);
  } finally {
    globalThis.XMLHttpRequest = originalXMLHttpRequest;
  }
});

test('normalizes populated chats for the mobile chat list', () => {
  const chats = normalizeChatList([{
    _id: 'chat-1',
    participants: [
      {user: 'current-user', markedUnread: true, markedUnreadAt: '2026-08-20T10:01:00.000Z'},
      {user: {_id: 'friend-1', name: 'Ananya', profilePic: 'https://example.com/ananya.jpg', lastSeen: '2026-08-19T10:00:00.000Z'} as never},
    ],
    lastMessage: {encryptedContent: 'See you soon', createdAt: '2026-08-20T10:00:00.000Z'},
    unreadCount: 2,
  }]);

  expect(chats).toEqual([expect.objectContaining({
    id: 'chat-1',
    contact: expect.objectContaining({userId: 'friend-1', name: 'Ananya'}),
    lastMessage: 'See you soon',
    unreadCount: 2,
    markedUnread: true,
  })]);
});

const groupRow = (lastMessage: Record<string, unknown>, pinned = false) => ({
  _id: 'group-1', type: 'group', groupName: 'Team', groupPhoto: '', unreadCount: 0, pinned,
  participants: [
    {user: {_id: 'current-user', name: 'Me'}, role: 'superadmin', pinned},
    {user: {_id: 'friend', name: 'Friend'}, role: 'member'},
  ],
  lastMessage,
});

test('a group notice shows in the chat list preview as the sentence it is', () => {
  // The backend makes a membership or role notice the group's last message.
  const rows = normalizeChatList([
    groupRow({_id: 'n1', sender: 'current-user', messageType: 'system', content: 'Abc was added to the group', createdAt: '2026-10-14T09:00:00.000Z'}),
    groupRow({_id: 'n2', sender: 'current-user', messageType: 'system', content: 'Ravi was promoted to Moderator', createdAt: '2026-10-14T09:05:00.000Z'}),
  ]);

  expect(rows.map(row => row.lastMessage)).toEqual(['Abc was added to the group', 'Ravi was promoted to Moderator']);
});

test('a group pinned on the server is still pinned when the list is loaded again', () => {
  const [pinned, notPinned] = normalizeChatList([
    groupRow({_id: 'm1', sender: 'friend', messageType: 'text', content: 'hi'}, true),
    {...groupRow({_id: 'm2', sender: 'friend', messageType: 'text', content: 'hi'}, false), _id: 'group-2'},
  ]);

  expect(pinned).toEqual(expect.objectContaining({id: 'group-1', pinned: true}));
  expect(notPinned).toEqual(expect.objectContaining({id: 'group-2', pinned: false}));
});

test('uses only the signed-in participant archive state and restores server pin state', () => {
  const [chat] = normalizeChatList([{
    _id: 'chat-1',
    isPinned: true,
    participants: [
      {user: 'current-user', archived: false},
      {user: {_id: 'friend-1', name: 'Ananya'} as never, archived: true},
    ],
  }]);

  expect(chat.archived).toBe(false);
  expect(chat.pinned).toBe(true);
});

// Every one of these is mounted under /api/chats on the backend. A path that
// drops the prefix 404s at runtime while still looking plausible in a diff -
// this test previously asserted "/delete" and so locked the bug in place.
test('uses documented chat list action endpoints', async () => {
  jest.mocked(apiRequest).mockResolvedValue(apiResponse({success: true}));

  await archiveChat('chat-1');
  await markChatUnread('chat-2');
  await deleteChat('chat-3');
  await deleteMessage('message-1');
  await deleteMessage('message-2', true);
  await pinMessage('message-3');
  await unpinMessage('message-3');
  await pinChatThread('chat-4');
  await unpinChatThread('chat-4');

  expect(apiRequest).toHaveBeenNthCalledWith(1, `${API_BASE_URL}/chats/archive`, expect.objectContaining({method: 'POST', body: JSON.stringify({chatId: 'chat-1'})}));
  expect(apiRequest).toHaveBeenNthCalledWith(2, `${API_BASE_URL}/chats/mark-unread`, expect.objectContaining({method: 'PUT', body: JSON.stringify({chatId: 'chat-2'})}));
  expect(apiRequest).toHaveBeenNthCalledWith(3, `${API_BASE_URL}/chats/delete`, expect.objectContaining({method: 'POST', body: JSON.stringify({chatId: 'chat-3'})}));
  expect(apiRequest).toHaveBeenNthCalledWith(4, `${API_BASE_URL}/chats/message/delete/me`, expect.objectContaining({method: 'POST', body: JSON.stringify({messageId: 'message-1'})}));
  expect(apiRequest).toHaveBeenNthCalledWith(5, `${API_BASE_URL}/chats/message/delete/everyone`, expect.objectContaining({method: 'POST', body: JSON.stringify({messageId: 'message-2'})}));
  expect(apiRequest).toHaveBeenNthCalledWith(6, `${API_BASE_URL}/chats/pin`, expect.objectContaining({method: 'POST', body: JSON.stringify({messageId: 'message-3'})}));
  expect(apiRequest).toHaveBeenNthCalledWith(7, `${API_BASE_URL}/chats/unpin`, expect.objectContaining({method: 'POST', body: JSON.stringify({messageId: 'message-3'})}));
  expect(apiRequest).toHaveBeenNthCalledWith(8, `${API_BASE_URL}/chats/pin-chat`, expect.objectContaining({method: 'POST', body: JSON.stringify({chatId: 'chat-4'})}));
  expect(apiRequest).toHaveBeenNthCalledWith(9, `${API_BASE_URL}/chats/unpin-chat`, expect.objectContaining({method: 'POST', body: JSON.stringify({chatId: 'chat-4'})}));
});

test('searches registered chat contacts through the documented endpoint', async () => {
  jest.mocked(apiRequest).mockResolvedValue(apiResponse([{_id: 'friend-1', name: 'Ananya', phone: '+919000000000'}]));

  await expect(searchChatContacts(' Ana ')).resolves.toEqual([
    {userId: 'friend-1', name: 'Ananya', phone: '+919000000000', thumbnail: null},
  ]);
  expect(apiRequest).toHaveBeenCalledWith(`${API_BASE_URL}/chats/contacts/search?q=Ana`, expect.objectContaining({method: 'GET'}));
});

// GET /chats/list is a raw aggregation: it never $lookups the participant or
// the last message, so both arrive as bare ObjectId strings. Without the
// enrichment pass every row reads "Chatterly user" with no preview and no ticks.
test('fills in the identity and preview the chat list endpoint leaves unpopulated', async () => {
  const rows = normalizeChatList([
    {
      _id: 'chat-1',
      participants: [{user: 'current-user'}, {user: 'friend-1'}],
      lastMessage: 'message-1',
      unreadCount: 0,
      updatedAt: '2026-08-24T00:55:00.000Z',
    },
  ]);

  expect(rows[0].contact.name).toBe('Chatterly user');
  expect(rows[0].lastMessage).toBe('');

  jest.mocked(apiRequest).mockResolvedValue(apiResponse({
    data: [{
      _id: 'message-1',
      sender: {_id: 'current-user', name: 'Me'},
      receiver: {_id: 'friend-1', name: 'Ananya', profilePic: 'https://cdn/ananya.png'},
      encryptedContent: 'Hi',
      status: 'delivered',
      createdAt: '2026-08-24T00:55:00.000Z',
    }],
  }));

  const [enriched] = await enrichChatList(rows);

  expect(apiRequest).toHaveBeenCalledWith(`${API_BASE_URL}/chats/messages/chat-1`, expect.objectContaining({method: 'GET'}));
  expect(enriched.contact.name).toBe('Ananya');
  expect(enriched.contact.thumbnail).toBe('https://cdn/ananya.png');
  expect(enriched.lastMessage).toBe('Hi');
  // Our own outgoing message, so the row carries ticks at the delivered rung.
  expect(enriched.lastMessageIsOwn).toBe(true);
  expect(enriched.lastMessageStatus).toBe('delivered');
  expect(enriched.lastMessageId).toBe('message-1');
});

test('leaves a row untouched when its lookup fails rather than dropping the list', async () => {
  const rows = normalizeChatList([
    {_id: 'chat-1', participants: [{user: 'current-user'}, {user: 'friend-1'}], updatedAt: '2026-08-24T00:55:00.000Z'},
  ]);
  jest.mocked(apiRequest).mockRejectedValue(new Error('offline'));

  await expect(enrichChatList(rows)).resolves.toEqual(rows);
});

test('does not re-fetch a row the list endpoint already described fully', async () => {
  const rows = normalizeChatList([
    {
      _id: 'chat-1',
      participants: [{user: 'current-user'}, {user: {_id: 'friend-1', name: 'Ananya'}}],
      lastMessage: {_id: 'message-1', encryptedContent: 'Hi', sender: 'friend-1', createdAt: '2026-08-24T00:55:00.000Z'},
      updatedAt: '2026-08-24T00:55:00.000Z',
    },
  ]);

  await enrichChatList(rows);

  expect(apiRequest).not.toHaveBeenCalled();
});

test('enriches a group preview through the group messages endpoint', async () => {
  const rows = normalizeChatList([{
    _id: 'group-1', type: 'group', groupName: 'Project Team',
    participants: [{user: 'current-user'}, {user: 'friend-1'}],
    lastMessage: 'group-message-1', updatedAt: '2026-08-24T00:55:00.000Z',
  }]);
  jest.mocked(apiRequest).mockResolvedValue(apiResponse({data: [{
    _id: 'group-message-1', groupId: 'group-1', sender: 'friend-1', content: 'Meeting at 5 PM',
    createdAt: '2026-08-24T00:55:00.000Z',
  }]}));

  await expect(enrichChatList(rows)).resolves.toEqual([expect.objectContaining({
    id: 'group-1', lastMessage: 'Meeting at 5 PM',
    contact: expect.objectContaining({name: 'Project Team', kind: 'group'}),
  })]);
  expect(apiRequest).toHaveBeenCalledWith(`${API_BASE_URL}/group/messages/group-1`, expect.objectContaining({method: 'GET'}));
});


test('reads call status from the documented personal call details endpoint', async () => {
  jest.mocked(apiRequest).mockResolvedValue(apiResponse({success: true, data: {status: 'missed'}}));
  await expect(getCallStatus('call-7')).resolves.toBe('missed');
  expect(apiRequest).toHaveBeenCalledWith(`${API_BASE_URL}/call/details/call-7?type=personal`, expect.objectContaining({method: 'GET'}));
});

test('does not invent a terminal status for a failed call details response', async () => {
  jest.mocked(apiRequest).mockResolvedValue(apiResponse({success: false, message: 'Call not found'}));
  await expect(getCallStatus('call-7')).rejects.toThrow('Call not found');
});


test('offline call copies do not count as incoming activity for the caller', () => {
  const {countOutgoingMissedCopies} = require('../src/services/chatApi');
  const outgoing = {messageType: 'call', callStatus: 'not_answered', sender: 'current-user', receiver: 'friend', createdAt: '2026-10-16T10:00:00Z'};
  const copy = {...outgoing, callStatus: 'missed', sender: 'friend', receiver: 'current-user'};
  expect(countOutgoingMissedCopies([outgoing, copy], 'current-user')).toBe(1);
  expect(countOutgoingMissedCopies([outgoing, copy], 'friend')).toBe(0);
  expect(countOutgoingMissedCopies([copy], 'current-user')).toBe(0);
  expect(countOutgoingMissedCopies([outgoing, {...copy, status: 'read'}], 'current-user')).toBe(0);
  expect(countOutgoingMissedCopies([outgoing, {...copy, createdAt: '2026-10-16T11:00:00Z'}], 'current-user')).toBe(0);
  expect(countOutgoingMissedCopies([
    {...outgoing, callStatus: 'Not-Answered'},
    {...copy, callStatus: 'MISSED'},
  ], 'current-user')).toBe(1);
});


test('a stored rules notice remains a system notice and list preview after reloading', () => {
  const {messagePreview} = require('../src/utils/messagePreview');
  const record = {_id: 'rules-notice', sender: 'other', groupId: 'g1', encryptedContent: 'Group rules updated.', messageType: 'text' as const, createdAt: '2026-10-16T10:00:00Z'};
  for (let i = 0; i < 2; i++) {
    const message = normalizeMessage(JSON.parse(JSON.stringify(record)));
    expect(message.systemEvent).toBe(true);
    expect(message.createdAt).toBe(record.createdAt);
    expect(messagePreview(message)).toBe('Group rules updated.');
  }
});
