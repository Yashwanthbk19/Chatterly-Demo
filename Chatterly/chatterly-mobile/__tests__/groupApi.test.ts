import * as FileSystem from 'expo-file-system/legacy';
import {apiRequest, ApiError} from '../src/api/client';
import {API_BASE_URL} from '../src/config/api';
import {createGroup, searchGroups} from '../src/services/groupApi';

jest.mock('expo-file-system/legacy', () => ({getInfoAsync: jest.fn(async () => ({exists:true})),createUploadTask:jest.fn(),FileSystemUploadType:{MULTIPART:1},FileSystemSessionType:{FOREGROUND:0}}));
jest.mock('../src/api/client', () => ({...jest.requireActual('../src/api/client'), apiRequest: jest.fn()}));
jest.mock('../src/services/sessionStore', () => ({getToken: () => 'jwt-token', getSession: () => ({user: {id: 'current-user'}})}));

beforeEach(() => jest.clearAllMocks());

test('searches authenticated groups through the documented endpoint', async () => {
  jest.mocked(apiRequest).mockResolvedValue({json: jest.fn().mockResolvedValue({data: [{_id: 'group-1', groupName: 'Project Team'}]})} as unknown as Response);

  await expect(searchGroups(' Project Team ')).resolves.toEqual([{
    _id: 'group-1', groupName: 'Project Team', type: 'group',
  }]);
  expect(apiRequest).toHaveBeenCalledWith(`${API_BASE_URL}/group/search?keyword=Project%20Team`, expect.objectContaining({
    method: 'GET', headers: expect.objectContaining({Authorization: 'Bearer jwt-token'}),
  }));
});

test('does not call the required-keyword endpoint for blank input', async () => {
  await expect(searchGroups('   ')).resolves.toEqual([]);
  expect(apiRequest).not.toHaveBeenCalled();
});

test('creates a group without a picture using authenticated JSON and a participants array', async () => {
  const group = {_id: 'group-json', groupName: 'Project Team'};
  jest.mocked(apiRequest).mockResolvedValue({json: async () => ({success: true, data: group})} as Response);

  await expect(createGroup({
    groupName: ' Project Team ', description: ' Team updates ',
    participantIds: ['member-1', 'member-2'],
  })).resolves.toEqual(group);
  expect(apiRequest).toHaveBeenCalledTimes(1);
  expect(apiRequest).toHaveBeenCalledWith(`${API_BASE_URL}/group/create`, {
    method: 'POST',
    headers: {Accept: 'application/json', 'Content-Type': 'application/json', Authorization: 'Bearer jwt-token'},
    body: JSON.stringify({groupName: 'Project Team', description: 'Team updates', participants: ['member-1', 'member-2']}),
  }, {allowDevelopmentFallback: false});
});

test('omits an empty description and accepts the group response envelope', async () => {
  const group = {_id: 'group-json', groupName: 'Project Team'};
  jest.mocked(apiRequest).mockResolvedValue({json: async () => ({group})} as Response);
  await expect(createGroup({groupName: 'Project Team', description: '   ', participantIds: ['member-1', 'member-2'], photo: null})).resolves.toEqual(group);
  const options = jest.mocked(apiRequest).mock.calls[0][1];
  expect(JSON.parse(options?.body as string)).toEqual({groupName: 'Project Team', participants: ['member-1', 'member-2']});
});

test.each([{}, {data: {}}, {data: null}])('rejects an incomplete creation response: %j', async payload => {
  jest.mocked(apiRequest).mockResolvedValue({json: async () => payload} as Response);
  await expect(createGroup({groupName: 'Project Team', participantIds: ['member-1', 'member-2']})).rejects.toThrow('did not return the created group');
});

test('preserves a backend validation error without replaying group creation', async () => {
  const rejection = new ApiError('Minimum 3 unique participants required', 400);
  jest.mocked(apiRequest).mockRejectedValueOnce(rejection);
  await expect(createGroup({groupName: 'Project Team', participantIds: ['member-1', 'member-2']})).rejects.toBe(rejection);
  expect(apiRequest).toHaveBeenCalledTimes(1);
});

test('creates a group with its selected picture through the documented multipart endpoint', async () => {
  const originalXMLHttpRequest = globalThis.XMLHttpRequest;
  const request: any = {
    status: 201,
    responseText: JSON.stringify({data: {_id: 'group-photo', groupName: 'Photo Team', groupPhoto: 'https://example.com/group.jpg'}}),
    open: jest.fn(),
    setRequestHeader: jest.fn(),
    send: jest.fn((body: FormData) => {
      expect(body).toBeInstanceOf(FormData);
      request.onload();
    }),
  };
  globalThis.XMLHttpRequest = jest.fn(() => request) as never;

  try {
    await expect(createGroup({
      groupName: ' Photo Team ',
      description: 'Updates',
      participantIds: ['member-1', 'member-2'],
      photo: {uri: 'file:///cache/group.png', width: 500, height: 500},
    })).resolves.toEqual(expect.objectContaining({_id: 'group-photo', groupPhoto: 'https://example.com/group.jpg'}));
    expect(request.open).toHaveBeenCalledWith('POST', `${API_BASE_URL}/group/create`);
    expect(request.timeout).toBe(2 * 60 * 1000);
    expect(request.setRequestHeader).toHaveBeenCalledWith('Authorization', 'Bearer jwt-token');
    expect(request.send).toHaveBeenCalledTimes(1);
    expect(apiRequest).not.toHaveBeenCalled();
  } finally {
    globalThis.XMLHttpRequest = originalXMLHttpRequest;
  }
});

test('uses the documented group endpoints for pinned messages', async () => {
  const {getGroupPinnedMessages, pinGroupMessage, unpinGroupMessage} = require('../src/services/groupApi');
  jest.mocked(apiRequest)
    .mockResolvedValueOnce({json: async () => ({data: [
      {_id:'older',content:'Older',sender:{_id:'member-1',name:'Member'},createdAt:'2026-05-20T10:00:00.000Z',pinnedAt:'2026-05-20T10:01:00.000Z',isPinned:true},
      {_id:'newer',content:'Newer',sender:{_id:'admin-1',name:'Admin'},createdAt:'2026-05-20T11:00:00.000Z',pinnedAt:'2026-05-20T11:01:00.000Z',isPinned:true,deletedFor:['current-user']},
    ]})} as Response)
    .mockResolvedValue({} as Response);

  await expect(getGroupPinnedMessages('group/1')).resolves.toEqual(expect.arrayContaining([
    expect.objectContaining({id:'newer',text:'Newer',isPinned:true,senderName:'Admin',deletedForMe:true}),
  ]));
  expect(apiRequest).toHaveBeenNthCalledWith(1, `${API_BASE_URL}/group/pinned-messages/group%2F1`, expect.objectContaining({method:'GET'}));
  await pinGroupMessage('group-1','message-1');
  expect(apiRequest).toHaveBeenNthCalledWith(2, `${API_BASE_URL}/group/pin-message`, expect.objectContaining({method:'POST',body:JSON.stringify({groupId:'group-1',messageId:'message-1'})}));
  await unpinGroupMessage('group-1','message-1');
  expect(apiRequest).toHaveBeenNthCalledWith(3, `${API_BASE_URL}/group/unpin-message`, expect.objectContaining({method:'POST',body:JSON.stringify({groupId:'group-1',messageId:'message-1'})}));
});

test('persists group timeline notices through the documented JSON message endpoint', async () => {
  const {sendGroupTimelineNotice} = require('../src/services/groupApi');
  jest.mocked(apiRequest).mockResolvedValue({json: async () => ({data: {
    _id:'notice-1',groupId:'g1',sender:'current-user',content:'New group photo added.',messageType:'text',createdAt:'2026-10-16T10:00:00.000Z',
  }})} as Response);

  await expect(sendGroupTimelineNotice('g1','New group photo added.')).resolves.toEqual(expect.objectContaining({
    id:'notice-1',text:'New group photo added.',systemEvent:true,
  }));
  expect(apiRequest).toHaveBeenCalledWith(`${API_BASE_URL}/group/send-message`, {
    method:'POST',
    headers:{Accept:'application/json','Content-Type':'application/json',Authorization:'Bearer jwt-token'},
    body:JSON.stringify({groupId:'g1',content:'New group photo added.'}),
  });
});

test('updates profile details with the documented JSON fields and server result', async () => {
  const {updateGroupInfo} = require('../src/services/groupApi');
  jest.mocked(apiRequest).mockResolvedValue({json: async () => ({data: {groupName: 'Team', description: 'Sprint'}})} as Response);
  await expect(updateGroupInfo('g1', 'Team', 'Sprint')).resolves.toEqual({name: 'Team', description: 'Sprint'});
  expect(apiRequest).toHaveBeenCalledWith(`${API_BASE_URL}/group/update`, expect.objectContaining({method: 'PUT', body: JSON.stringify({groupId: 'g1', groupName: 'Team', description: 'Sprint'})}));
});

const selectedPhoto = {uri:'file:///cache/profile-normalized.jpg',fileName:'profile.jpg',mimeType:'image/jpeg',width:1200,height:900};
function mockUpload(result: {status:number; body:string}) {
  const uploadAsync = jest.fn(async () => result);
  jest.mocked(FileSystem.createUploadTask).mockReturnValue({uploadAsync,cancelAsync:jest.fn()} as unknown as FileSystem.UploadTask);
  return uploadAsync;
}

test('streams the cached photo natively with the documented multipart fields', async () => {
  const {changeGroupPhoto} = require('../src/services/groupApi');
  mockUpload({status:200,body:JSON.stringify({success:true,data:{groupPhoto:'https://example.com/photo.jpg'}})});
  await expect(changeGroupPhoto('g1',selectedPhoto)).resolves.toBe('https://example.com/photo.jpg');
  expect(FileSystem.createUploadTask).toHaveBeenCalledWith(`${API_BASE_URL}/group/change-photo`,selectedPhoto.uri,{
    httpMethod:'PUT',uploadType:FileSystem.FileSystemUploadType.MULTIPART,fieldName:'media',mimeType:'image/jpeg',parameters:{groupId:'g1'},
    headers:{Accept:'application/json',Authorization:'Bearer jwt-token'},sessionType:FileSystem.FileSystemSessionType.FOREGROUND,
  });
  expect(apiRequest).not.toHaveBeenCalled();
});

test('surfaces the backend rejection instead of a generic connection error', async () => {
  const {changeGroupPhoto} = require('../src/services/groupApi');
  mockUpload({status:403,body:JSON.stringify({message:'Only superadmin and admin can change photo'})});
  await expect(changeGroupPhoto('g1',selectedPhoto)).rejects.toThrow('Only superadmin and admin can change photo');
});

test('keeps native upload failure details', async () => {
  const {changeGroupPhoto} = require('../src/services/groupApi');
  mockUpload({status:200,body:''}).mockRejectedValueOnce(new Error('Socket closed'));
  await expect(changeGroupPhoto('g1',selectedPhoto)).rejects.toThrow('Group photo upload failed: Socket closed');
});

test('rejects missing cached files before starting a request', async () => {
  const {changeGroupPhoto} = require('../src/services/groupApi');
  jest.mocked(FileSystem.getInfoAsync).mockResolvedValueOnce({exists:false,isDirectory:false,uri:selectedPhoto.uri});
  await expect(changeGroupPhoto('g1',selectedPhoto)).rejects.toThrow('no longer available');
  expect(FileSystem.createUploadTask).not.toHaveBeenCalled();
});

test('does not report successful upload without a persisted photo URL', async () => {
  const {changeGroupPhoto} = require('../src/services/groupApi');
  mockUpload({status:200,body:JSON.stringify({success:true,data:{}})});
  await expect(changeGroupPhoto('g1',selectedPhoto)).rejects.toThrow('did not return a group photo');
});

test('removes photos and preserves numeric rule content', async () => {
  const {removeGroupPhoto, updateGroupRules} = require('../src/services/groupApi');
  jest.mocked(apiRequest).mockResolvedValue({} as Response);
  await removeGroupPhoto('g1');
  expect(apiRequest).toHaveBeenLastCalledWith(`${API_BASE_URL}/group/remove-photo`, expect.objectContaining({method: 'DELETE', body: JSON.stringify({groupId: 'g1'})}));
  await updateGroupRules('g1', [' 24 hour notice ', '']);
  expect(apiRequest).toHaveBeenLastCalledWith(`${API_BASE_URL}/group/update-rules`, expect.objectContaining({body: JSON.stringify({groupId: 'g1', rules: ['24 hour notice']})}));
});

test('cancels a timed out native upload and allows the editor to retry', async () => {
  jest.useFakeTimers();
  try {
    const {changeGroupPhoto} = require('../src/services/groupApi');
    let cancelUpload: () => void = () => {};
    const cancelAsync = jest.fn(async () => cancelUpload());
    jest.mocked(FileSystem.createUploadTask).mockReturnValue({
      uploadAsync: jest.fn(() => new Promise(resolve => {cancelUpload = () => resolve(null);})),
      cancelAsync,
    } as unknown as FileSystem.UploadTask);
    const pending = changeGroupPhoto('g1',selectedPhoto).catch((error: Error) => error);
    await jest.advanceTimersByTimeAsync(120000);
    expect(await pending).toEqual(expect.objectContaining({message:expect.stringContaining('timed out')}));
    expect(cancelAsync).toHaveBeenCalledTimes(1);
  } finally {jest.useRealTimers();}
});

test('reads restriction and invite link state from group details', async () => {
  const {getGroupDetails} = require('../src/services/groupApi');
  jest.mocked(apiRequest).mockResolvedValue({json: async () => ({data: {
    _id: 'g1', groupName: 'Team', settings: {}, inviteLinkEnabled: true, inviteExpiresAt: '2026-09-20T00:00:00.000Z',
    participants: [{user: {_id: 'u1', name: 'Chivan'}, role: 'member', isMuted: true}, {user: {_id: 'u2', name: 'Aarav'}, role: 'admin'}],
  }})} as Response);
  const details = await getGroupDetails('g1');
  expect(details.participants.map((member: {isMuted: boolean}) => member.isMuted)).toEqual([true, false]);
  expect(details).toEqual(expect.objectContaining({inviteLinkEnabled: true, inviteExpiresAt: '2026-09-20T00:00:00.000Z'}));
});

test('normalizes group member list variants, role aliases, and the server member count', async () => {
  const {getGroupDetails} = require('../src/services/groupApi');
  jest.mocked(apiRequest).mockResolvedValue({json: async () => ({data: {
    _id: 'g1', groupName: 'Team', membersCount: 7,
    members: [
      {user: {_id: 'u1', name: 'Owner'}, role: 'Super Admin'},
      {user: {_id: 'u2', name: 'Mod'}, role: 'moderator'},
    ],
  }})} as Response);
  const details = await getGroupDetails('g1');
  expect(details.memberCount).toBe(7);
  expect(details.participants.map((member: {role: string}) => member.role)).toEqual(['superadmin', 'moderator']);
});

test('preserves the group creator as Super Admin when an older response omits the role', async () => {
  const {getGroupDetails} = require('../src/services/groupApi');
  jest.mocked(apiRequest).mockResolvedValue({json: async () => ({data: {
    _id: 'g1', groupName: 'Team', createdBy: {_id: 'owner', name: 'Owner'}, settings: {},
    participants: [{user: {_id: 'owner', name: 'Owner'}}, {user: {_id: 'member', name: 'Member'}, role: 'member'}],
  }})} as Response);
  const details = await getGroupDetails('g1');
  expect(details.participants.find((member: {userId: string}) => member.userId === 'owner').role).toBe('superadmin');
});

test('gets and updates the documented group role permissions', async () => {
  const {getGroupPermissions, updateGroupPermissions} = require('../src/services/groupApi');
  const rolePermissions = {
    member: {addMembers: true},
    moderator: {addMembers: false, assignRoles: true, pinMessages: true, editGroupInfo: false},
    admin: {approveJoinRequests: true},
  };
  jest.mocked(apiRequest)
    .mockResolvedValueOnce({json: async () => ({data: {groupId: 'g1', rolePermissions}})} as Response)
    .mockResolvedValueOnce({json: async () => ({data: {groupId: 'g1', rolePermissions}})} as Response);

  await expect(getGroupPermissions('group/1')).resolves.toEqual(rolePermissions);
  expect(apiRequest).toHaveBeenNthCalledWith(1, `${API_BASE_URL}/group/permissions/group%2F1`, expect.objectContaining({method: 'GET'}));
  await expect(updateGroupPermissions('group/1', {moderator: {assignRoles: true}})).resolves.toEqual(rolePermissions);
  expect(apiRequest).toHaveBeenNthCalledWith(2, `${API_BASE_URL}/group/permissions/group%2F1`, expect.objectContaining({
    method: 'PUT', body: JSON.stringify({rolePermissions: {moderator: {assignRoles: true}}}),
  }));
});

test('restricts through mute-member one member at a time and reports partial failures', async () => {
  const {restrictGroupMembers, unrestrictGroupMember} = require('../src/services/groupApi');
  jest.mocked(apiRequest)
    .mockResolvedValueOnce({} as Response)
    .mockRejectedValueOnce(new Error('Member not found'))
    .mockResolvedValueOnce({} as Response);
  await expect(restrictGroupMembers('g1', ['a', 'b', 'c'])).resolves.toEqual({restrictedIds: ['a', 'c'], failures: [{userId: 'b', message: 'Member not found'}]});
  expect(apiRequest).toHaveBeenCalledTimes(3);
  expect(apiRequest).toHaveBeenNthCalledWith(1, `${API_BASE_URL}/group/mute-member`, expect.objectContaining({method: 'POST', body: JSON.stringify({groupId: 'g1', userId: 'a'})}));
  jest.mocked(apiRequest).mockResolvedValue({} as Response);
  await unrestrictGroupMember('g1', 'a');
  expect(apiRequest).toHaveBeenLastCalledWith(`${API_BASE_URL}/group/unmute-member`, expect.objectContaining({method: 'POST', body: JSON.stringify({groupId: 'g1', userId: 'a'})}));
});

test('toggles the invite link through the group invite routes and rejects an unconfigured link', async () => {
  const {enableGroupInviteLink, disableGroupInviteLink} = require('../src/services/groupApi');
  jest.mocked(apiRequest).mockResolvedValueOnce({json: async () => ({inviteLink: 'https://chatterly.app/groups/invite/abc'})} as Response);
  await expect(enableGroupInviteLink('g1')).resolves.toBe('https://chatterly.app/groups/invite/abc');
  expect(apiRequest).toHaveBeenLastCalledWith(`${API_BASE_URL}/group/g1/invite-link`, expect.objectContaining({method: 'POST'}));
  jest.mocked(apiRequest).mockResolvedValueOnce({json: async () => ({inviteLink: 'undefined/groups/invite/abc'})} as Response);
  await expect(enableGroupInviteLink('g1')).rejects.toThrow('not configured');
  jest.mocked(apiRequest).mockResolvedValueOnce({} as Response);
  await disableGroupInviteLink('g1');
  expect(apiRequest).toHaveBeenLastCalledWith(`${API_BASE_URL}/group/g1/invite-link`, expect.objectContaining({method: 'DELETE'}));
});
