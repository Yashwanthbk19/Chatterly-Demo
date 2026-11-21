import * as FileSystem from 'expo-file-system/legacy';
import type {ImagePickerAsset} from 'expo-image-picker';
import {apiRequest, handleApiResponseStatus} from '../api/client';
import {createUsageTransfer} from './dataUsage';
import {API_BASE_URL} from '../config/api';
import {getSession, getToken} from './sessionStore';
import {normalizeMessage, type ChatRecord} from './chatApi';
import type {ChatMessage} from '../types/chat';

export type GroupMemberRole = 'superadmin' | 'admin' | 'moderator' | 'member';

export type GroupRolePermissions = {
  member: {addMembers: boolean};
  moderator: {
    addMembers: boolean;
    assignRoles: boolean;
    pinMessages: boolean;
    editGroupInfo: boolean;
  };
  admin: {approveJoinRequests: boolean};
};

export type GroupRolePermissionsPatch = {
  member?: Partial<GroupRolePermissions['member']>;
  moderator?: Partial<GroupRolePermissions['moderator']>;
  admin?: Partial<GroupRolePermissions['admin']>;
};

export const defaultGroupRolePermissions = (): GroupRolePermissions => ({
  member: {addMembers: false},
  moderator: {
    addMembers: false,
    assignRoles: false,
    pinMessages: false,
    editGroupInfo: false,
  },
  admin: {approveJoinRequests: false},
});

function normalizeGroupRolePermissions(value: any): GroupRolePermissions {
  return {
    member: {addMembers: value?.member?.addMembers === true},
    moderator: {
      addMembers: value?.moderator?.addMembers === true,
      assignRoles: value?.moderator?.assignRoles === true,
      pinMessages: value?.moderator?.pinMessages === true,
      editGroupInfo: value?.moderator?.editGroupInfo === true,
    },
    admin: {approveJoinRequests: value?.admin?.approveJoinRequests === true},
  };
}

export type GroupMember = {
  userId: string;
  name: string;
  phone?: string;
  status?: string;
  profilePic?: string | null;
  role: GroupMemberRole;
  /** The backend's muted participant, shown as "Restricted": every group send route rejects them. */
  isMuted?: boolean;
};

export type GroupDetails = {
  id: string;
  name: string;
  photo?: string | null;
  description?: string;
  rules: string[];
  createdAt?: string;
  createdBy?: {userId: string; name: string} | null;
  settings: {onlyAdminsCanMessage: boolean; onlyAdminsCanShareMedia: boolean};
  rolePermissions?: GroupRolePermissions;
  localPermissions?: {moderatorManageReports: boolean};
  inviteLinkEnabled?: boolean;
  inviteExpiresAt?: string | null;
  participants: GroupMember[];
  memberCount?: number;
};

export type GroupUpload = {uri: string; name: string; type: string};

function authenticatedHeaders(): Record<string, string> {
  const token = getToken();
  return {Accept: 'application/json', 'Content-Type': 'application/json', ...(token ? {Authorization: `Bearer ${token}`} : {})};
}

function memberFromRecord(entry: any): GroupMember | null {
  const user = entry?.user || entry;
  const userId = String(user?._id || user?.id || user?.userId || (typeof user === 'string' ? user : ''));
  if (!userId) return null;
  const rawRole = String(entry?.role || user?.role || 'member').trim().toLowerCase().replace(/[ _-]+/g, '');
  const role: GroupMemberRole = rawRole === 'superadmin' || rawRole === 'owner' ? 'superadmin'
    : rawRole === 'admin' ? 'admin'
    : rawRole === 'moderator' || rawRole === 'mod' ? 'moderator' : 'member';
  return {
    userId,
    name: String(user?.name || user?.fullName || 'Chatterly member'),
    phone: user?.phone || user?.phoneNumber,
    status: user?.status || user?.about || user?.bio,
    profilePic: user?.profilePic || user?.avatar || null,
    role,
    isMuted: Boolean(entry?.isMuted),
  };
}

export async function getGroupDetails(groupId: string): Promise<GroupDetails> {
  const response = await apiRequest(`${API_BASE_URL}/group/${encodeURIComponent(groupId)}`, {method: 'GET', headers: authenticatedHeaders()});
  const payload = await response.json();
  const group = payload?.data || payload?.group || payload;
  const rawParticipants = group?.participants ?? group?.members ?? group?.participantDetails;
  let participants = (Array.isArray(rawParticipants) ? rawParticipants : []).map(memberFromRecord).filter(Boolean) as GroupMember[];
  const creatorId = String(group?.createdBy?._id || group?.createdBy?.id || group?.createdBy || '');
  // The creator is immutable on the backend and is always the Super Admin.
  // Preserve that invariant even when an older/partially populated group
  // response omits the participant role.
  if (creatorId) {
    const creator = participants.find(member => member.userId === creatorId);
    if (creator) participants = participants.map(member => member.userId === creatorId ? {...member, role: 'superadmin'} : member);
    else if (group?.createdBy && typeof group.createdBy === 'object') {
      const createdByMember = memberFromRecord({...group.createdBy, role: 'superadmin'});
      if (createdByMember) participants = [...participants, createdByMember];
    }
  }
  const reportedCount = Number(group?.memberCount ?? group?.membersCount ?? group?.participantCount);
  return {
    id: String(group?._id || group?.id || groupId),
    name: String(group?.groupName || group?.name || 'Group'),
    photo: group?.groupPhoto || null,
    description: String(group?.description || ''),
    rules: (Array.isArray(group?.rules) ? group.rules : []).map(String).filter((rule: string) => rule.trim()),
    createdAt: group?.createdAt,
    createdBy: group?.createdBy ? {
      userId: String(group.createdBy?._id || group.createdBy?.id || group.createdBy),
      name: String(group.createdBy?.name || 'a group admin'),
    } : null,
    settings: {
      onlyAdminsCanMessage: Boolean(group?.settings?.onlyAdminsCanMessage),
      onlyAdminsCanShareMedia: Boolean(group?.settings?.onlyAdminsCanShareMedia),
    },
    rolePermissions: normalizeGroupRolePermissions(group?.settings?.rolePermissions),
    inviteLinkEnabled: Boolean(group?.inviteLinkEnabled),
    inviteExpiresAt: group?.inviteExpiresAt ? String(group.inviteExpiresAt) : null,
    participants,
    memberCount: Number.isFinite(reportedCount) ? Math.max(participants.length, reportedCount) : participants.length,
  };
}

export async function getGroupPermissions(groupId: string): Promise<GroupRolePermissions> {
  const response = await apiRequest(`${API_BASE_URL}/group/permissions/${encodeURIComponent(groupId)}`, {
    method: 'GET',
    headers: authenticatedHeaders(),
  });
  const payload = await response.json();
  return normalizeGroupRolePermissions(payload?.data?.rolePermissions ?? payload?.rolePermissions);
}

export async function updateGroupPermissions(
  groupId: string,
  rolePermissions: GroupRolePermissionsPatch,
): Promise<GroupRolePermissions> {
  const response = await apiRequest(`${API_BASE_URL}/group/permissions/${encodeURIComponent(groupId)}`, {
    method: 'PUT',
    headers: authenticatedHeaders(),
    body: JSON.stringify({rolePermissions}),
  });
  const payload = await response.json();
  return normalizeGroupRolePermissions(payload?.data?.rolePermissions ?? payload?.rolePermissions);
}

export async function updateGroupRules(groupId: string, rules: string[]): Promise<void> {
  await apiRequest(`${API_BASE_URL}/group/update-rules`, {method: 'PUT', headers: authenticatedHeaders(), body: JSON.stringify({groupId, rules: rules.map(rule => rule.trim()).filter(Boolean)})});
}

export async function addGroupParticipants(groupId: string, participantIds: string[]): Promise<void> {
  await apiRequest(`${API_BASE_URL}/group/add-participants`, {method: 'PUT', headers: authenticatedHeaders(), body: JSON.stringify({groupId, participants: participantIds})});
}

export async function removeGroupParticipant(groupId: string, participantId: string): Promise<void> {
  await apiRequest(`${API_BASE_URL}/group/remove-participant`, {method: 'PUT', headers: authenticatedHeaders(), body: JSON.stringify({groupId, participantId})});
}

async function sendGroupMembershipNotification(path: 'group-added' | 'group-removed', receiver: string, sender: string, groupId: string, groupName: string): Promise<void> {
  await apiRequest(`${API_BASE_URL}/notification/${path}`, {method: 'POST', headers: authenticatedHeaders(), body: JSON.stringify({receiver, sender, groupId, groupName})});
}

export const notifyGroupAdded = (receiver: string, sender: string, groupId: string, groupName: string) => sendGroupMembershipNotification('group-added', receiver, sender, groupId, groupName);
export const notifyGroupRemoved = (receiver: string, sender: string, groupId: string, groupName: string) => sendGroupMembershipNotification('group-removed', receiver, sender, groupId, groupName);

export async function sendGroupTimelineNotice(groupId: string, content: string): Promise<ChatMessage> {
  const response = await apiRequest(`${API_BASE_URL}/group/send-message`, {
    method: 'POST',
    headers: authenticatedHeaders(),
    body: JSON.stringify({groupId, content}),
  });
  const payload = await response.json();
  return {...normalizeMessage(payload?.data || {}), systemEvent: true};
}

export async function sendGroupMessage(groupId: string, content: string, replyTo?: string): Promise<ChatMessage> {
  const response = await apiRequest(`${API_BASE_URL}/group/send-message`, {
    method: 'POST', headers: authenticatedHeaders(), body: JSON.stringify({groupId, content: content.trim(), ...(replyTo ? {replyTo} : {})}),
  });
  const payload = await response.json();
  return normalizeMessage(payload?.data || {}, true);
}

function uploadGroup(path: 'send-media' | 'send-file', groupId: string, file: GroupUpload, caption?: string, onProgress?: (progress: number) => void): Promise<ChatMessage> {
  const form = new FormData();
  form.append('groupId', groupId);
  form.append(path === 'send-file' ? 'file' : 'media', {uri: file.uri, name: file.name, type: file.type} as never);
  if (caption?.trim()) form.append('caption', caption.trim());
  const token = getToken();
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', `${API_BASE_URL}/group/${path}`);
    const recordSent = createUsageTransfer('sent');
    request.timeout = 15 * 60 * 1000;
    request.setRequestHeader('Accept', 'application/json');
    if (token) request.setRequestHeader('Authorization', `Bearer ${token}`);
    if (request.upload) request.upload.onprogress = event => {
      recordSent(event.loaded);
      if (event.lengthComputable) { onProgress?.(event.loaded / event.total); }
    };
    request.onerror = () => reject(new Error('Unable to upload group attachment.'));
    request.ontimeout = () => reject(new Error('The group attachment upload timed out.'));
    request.onload = () => {
      let payload: any = {};
      try { payload = JSON.parse(request.responseText || '{}'); } catch { /* handled below */ }
      if (request.status < 200 || request.status >= 300) { handleApiResponseStatus(request.status); reject(new Error(payload?.message || 'Unable to upload group attachment.')); return; }
      recordSent(Number(payload?.data?.mediaSize || payload?.data?.fileSize || 0));
      resolve(normalizeMessage(payload?.data || {}, true));
    };
    request.send(form);
  });
}

export const sendGroupMedia = (groupId: string, file: GroupUpload, caption?: string, onProgress?: (progress: number) => void) => uploadGroup('send-media', groupId, file, caption, onProgress);
export const sendGroupFile = (groupId: string, file: GroupUpload, onProgress?: (progress: number) => void) => uploadGroup('send-file', groupId, file, undefined, onProgress);

async function groupMessageAction(path: 'pin-message' | 'unpin-message', groupId: string, messageId: string): Promise<void> {
  await apiRequest(`${API_BASE_URL}/group/${path}`, {
    method: 'POST',
    headers: authenticatedHeaders(),
    body: JSON.stringify({groupId, messageId}),
  });
}

/** Pinned group messages use group-specific authorization and routes. */
export const pinGroupMessage = (groupId: string, messageId: string) => groupMessageAction('pin-message', groupId, messageId);
export const unpinGroupMessage = (groupId: string, messageId: string) => groupMessageAction('unpin-message', groupId, messageId);

async function groupThreadAction(path: 'pin-group' | 'unpin-group', groupId: string): Promise<void> {
  await apiRequest(`${API_BASE_URL}/group/${path}`, {
    method: 'POST',
    headers: authenticatedHeaders(),
    body: JSON.stringify({groupId}),
  });
}

export const pinGroupThread = (groupId: string) => groupThreadAction('pin-group', groupId);
export const unpinGroupThread = (groupId: string) => groupThreadAction('unpin-group', groupId);

export async function getGroupPinnedMessages(groupId: string): Promise<ChatMessage[]> {
  const response = await apiRequest(`${API_BASE_URL}/group/pinned-messages/${encodeURIComponent(groupId)}`, {
    method: 'GET',
    headers: authenticatedHeaders(),
  });
  const payload = await response.json();
  const records = payload?.data || payload?.messages || [];
  return Array.isArray(records)
    ? records
      .map(record => normalizeMessage(record))
      .sort((first, second) => Date.parse(second.pinnedAt || second.createdAt) - Date.parse(first.pinnedAt || first.createdAt))
    : [];
}

async function groupAction(path: 'leave' | 'clear-chat', groupId: string, method: 'PUT' | 'POST'): Promise<string> {
  const response = await apiRequest(`${API_BASE_URL}/group/${path}`, {method, headers: authenticatedHeaders(), body: JSON.stringify({groupId})});
  const payload = await response.json();
  return String(payload?.message || 'Group updated successfully.');
}

export const leaveGroup = (groupId: string) => groupAction('leave', groupId, 'PUT');
export const clearGroupChat = (groupId: string) => groupAction('clear-chat', groupId, 'POST');

export async function deleteGroup(groupId: string): Promise<string> {
  const response = await apiRequest(`${API_BASE_URL}/group/delete/${encodeURIComponent(groupId)}`, {method: 'DELETE', headers: authenticatedHeaders()});
  const payload = await response.json();
  return String(payload?.message || 'Group deleted successfully.');
}

export async function reportGroup(groupId: string, reason = 'Spam', description = 'Reported from group chat'): Promise<string> {
  const reporterId = String(getSession()?.user?.id || '');
  const response = await apiRequest(`${API_BASE_URL}/report/report-group`, {method: 'POST', headers: authenticatedHeaders(), body: JSON.stringify({reporterId, reportedGroupId: groupId, reason, description})});
  const payload = await response.json();
  return String(payload?.message || 'Report submitted successfully.');
}

export type CreateGroupInput = {
  groupName: string;
  description?: string;
  participantIds: string[];
  photo?: ImagePickerAsset | null;
};

export type CreatedGroup = {
  _id: string;
  groupName: string;
  description?: string;
  groupPhoto?: string;
};

function groupPhotoPart(photo: ImagePickerAsset): {uri: string; name: string; type: string} {
  const uriName = photo.uri.split(/[\\/]/).pop()?.split('?')[0];
  const name = photo.fileName || uriName || `group-${Date.now()}.jpg`;
  const extension = name.split('.').pop()?.toLowerCase();
  const inferredType = extension === 'png' ? 'image/png'
    : extension === 'webp' ? 'image/webp'
      : extension === 'heic' || extension === 'heif' ? `image/${extension}`
        : 'image/jpeg';
  return {uri: photo.uri, name, type: photo.mimeType || inferredType};
}

function createGroupWithPhoto(form: FormData): Promise<CreatedGroup> {
  const token = getToken();
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', `${API_BASE_URL}/group/create`);
    request.timeout = 2 * 60 * 1000;
    request.setRequestHeader('Accept', 'application/json');
    if (token) request.setRequestHeader('Authorization', `Bearer ${token}`);
    request.onerror = () => reject(new Error('Unable to upload the group picture.'));
    request.ontimeout = () => reject(new Error('The group picture upload timed out. Please try again.'));
    request.onload = () => {
      let payload: any = {};
      try { payload = JSON.parse(request.responseText || '{}'); } catch { /* handled below */ }
      if (request.status < 200 || request.status >= 300) {
        handleApiResponseStatus(request.status);
        reject(new Error(payload?.message || payload?.error || 'Unable to create the group with this picture.'));
        return;
      }
      const created = payload?.data || payload?.group;
      if (!created?._id) {
        reject(new Error('The server did not return the created group.'));
        return;
      }
      resolve(created as CreatedGroup);
    };
    request.send(form);
  });
}

/** Normalize documented search results for the shared inbox row mapper. */
export async function searchGroups(keyword: string): Promise<ChatRecord[]> {
  const normalizedKeyword = keyword.trim();
  if (!normalizedKeyword) return [];
  const response = await apiRequest(`${API_BASE_URL}/group/search?keyword=${encodeURIComponent(normalizedKeyword)}`, {
    method: 'GET',
    headers: authenticatedHeaders(),
  });
  const payload = await response.json();
  const records = payload?.data || payload?.groups || [];
  return Array.isArray(records) ? records.map(record => ({...record, type: 'group'})) : [];
}

export async function createGroup(input: CreateGroupInput): Promise<CreatedGroup> {
  if (input.photo) {
    const form = new FormData();
    form.append('groupName', input.groupName.trim());
    if (input.description?.trim()) form.append('description', input.description.trim());
    input.participantIds.forEach(id => form.append('participants', id));
    form.append('media', groupPhotoPart(input.photo) as never);
    return createGroupWithPhoto(form);
  }

  // Without a file, use the endpoint's JSON contract rather than sending a
  // text-only multipart body through React Native's fetch transport.
  const response = await apiRequest(`${API_BASE_URL}/group/create`, {
    method: 'POST',
    headers: authenticatedHeaders(),
    body: JSON.stringify({
      groupName: input.groupName.trim(),
      ...(input.description?.trim() ? {description: input.description.trim()} : {}),
      participants: input.participantIds,
    }),
  }, {allowDevelopmentFallback: false});
  const payload = await response.json();
  const created = payload?.data || payload?.group;
  if (!created?._id) {
    throw new Error('The server did not return the created group.');
  }
  return created as CreatedGroup;
}

export async function assignGroupModerator(groupId: string, userId: string): Promise<void> {
  const token = getToken();
  await apiRequest(`${API_BASE_URL}/group/assign-moderator`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(token ? {Authorization: `Bearer ${token}`} : {}),
    },
    body: JSON.stringify({groupId, userId}),
  });
}

export async function assignGroupAdmin(groupId: string, userId: string): Promise<void> {
  const token = getToken();
  await apiRequest(`${API_BASE_URL}/group/assign-admin`, {
    method: 'POST',
    headers: {Accept: 'application/json', 'Content-Type': 'application/json', ...(token ? {Authorization: `Bearer ${token}`} : {})},
    body: JSON.stringify({groupId, userId}),
  });
}

async function removeGroupRole(path: 'remove-admin' | 'remove-moderator', groupId: string, userId: string): Promise<void> {
  await apiRequest(`${API_BASE_URL}/group/${path}`, {method: 'POST', headers: authenticatedHeaders(), body: JSON.stringify({groupId, userId})});
}

export const removeGroupAdmin = (groupId: string, userId: string) => removeGroupRole('remove-admin', groupId, userId);
export const removeGroupModerator = (groupId: string, userId: string) => removeGroupRole('remove-moderator', groupId, userId);

async function memberRestriction(path: 'mute-member' | 'unmute-member', groupId: string, userId: string): Promise<void> {
  await apiRequest(`${API_BASE_URL}/group/${path}`, {method: 'POST', headers: authenticatedHeaders(), body: JSON.stringify({groupId, userId})});
}

/** Restricting is the backend's mute-member: the member stays in the group but cannot send. */
export const restrictGroupMember = (groupId: string, userId: string) => memberRestriction('mute-member', groupId, userId);
export const unrestrictGroupMember = (groupId: string, userId: string) => memberRestriction('unmute-member', groupId, userId);

export type BulkRestrictionResult = {restrictedIds: string[]; failures: Array<{userId: string; message: string}>};

/**
 * There is no bulk route, so members are restricted one request at a time.
 * Sequential on purpose: each call loads and saves the whole group document,
 * and parallel saves of the same document can overwrite each other.
 */
export async function restrictGroupMembers(groupId: string, userIds: string[]): Promise<BulkRestrictionResult> {
  const result: BulkRestrictionResult = {restrictedIds: [], failures: []};
  for (const userId of userIds) {
    try {
      await restrictGroupMember(groupId, userId);
      result.restrictedIds.push(userId);
    } catch (error) {
      result.failures.push({userId, message: error instanceof Error ? error.message : 'Unable to restrict this member.'});
    }
  }
  return result;
}

/** Enables the link (or refreshes its 7 day expiry) and returns the shareable URL. */
export async function enableGroupInviteLink(groupId: string): Promise<string> {
  const response = await apiRequest(`${API_BASE_URL}/group/${encodeURIComponent(groupId)}/invite-link`, {method: 'POST', headers: authenticatedHeaders()});
  const payload = await response.json();
  const link = String(payload?.inviteLink || '');
  // The server builds the link from APP_URL; without it the URL starts with "undefined".
  if (!/^https?:\/\//i.test(link)) throw new Error('The invite link is not configured on the server yet.');
  return link;
}

export async function disableGroupInviteLink(groupId: string): Promise<void> {
  await apiRequest(`${API_BASE_URL}/group/${encodeURIComponent(groupId)}/invite-link`, {method: 'DELETE', headers: authenticatedHeaders()});
}

export async function updateGroupMessagePermissions(
  groupId: string,
  settings: {membersCanSendMessages: boolean; membersCanShareMedia: boolean},
): Promise<void> {
  const token = getToken();
  await apiRequest(`${API_BASE_URL}/group/admin-message`, {
    method: 'PUT',
    headers: {Accept: 'application/json', 'Content-Type': 'application/json', ...(token ? {Authorization: `Bearer ${token}`} : {})},
    body: JSON.stringify({
      groupId,
      onlyAdminsCanMessage: !settings.membersCanSendMessages,
      onlyAdminsCanShareMedia: !settings.membersCanShareMedia,
    }),
  });
}

export async function updateGroupInfo(groupId: string, groupName: string, description: string): Promise<{name: string; description: string}> {
  const response = await apiRequest(`${API_BASE_URL}/group/update`, {method: 'PUT', headers: authenticatedHeaders(), body: JSON.stringify({groupId, groupName, description})});
  const payload = await response.json();
  return {name: String(payload.data.groupName), description: String(payload.data.description || '')};
}

/** Stream the prepared cache file natively, without React Native fetch/FormData. */
export async function changeGroupPhoto(groupId: string, photo: ImagePickerAsset): Promise<string> {
  const token = getToken();
  if (!token) throw new Error('Your session has expired. Please sign in again.');
  if (!photo.uri.startsWith('file://')) throw new Error('Please select the photo again before saving.');
  const file = await FileSystem.getInfoAsync(photo.uri);
  if (!file.exists) throw new Error('The selected photo is no longer available. Please select it again.');

  const task = FileSystem.createUploadTask(`${API_BASE_URL}/group/change-photo`, photo.uri, {
    httpMethod: 'PUT',
    uploadType: FileSystem.FileSystemUploadType.MULTIPART,
    fieldName: 'media',
    mimeType: photo.mimeType || 'image/jpeg',
    parameters: {groupId},
    headers: {Accept: 'application/json', Authorization: `Bearer ${token}`},
    sessionType: FileSystem.FileSystemSessionType.FOREGROUND,
  });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    task.cancelAsync().catch(() => undefined);
  }, 120000);
  let result: FileSystem.FileSystemUploadResult | null | undefined;
  try {
    result = await task.uploadAsync();
  } catch (error) {
    if (timedOut) throw new Error('Group photo upload timed out. Your selected photo is kept; please try saving again.');
    const reason = error instanceof Error ? error.message : 'Network request failed';
    throw new Error(`Group photo upload failed: ${reason}`);
  } finally {
    clearTimeout(timer);
  }
  if (!result) throw new Error(timedOut ? 'Group photo upload timed out. Please try saving again.' : 'Group photo upload was cancelled. Please try saving again.');
  let payload: {message?: string; error?: string; success?: boolean; data?: {groupPhoto?: string}} = {};
  try { payload = JSON.parse(result.body); } catch { /* Report HTTP status below. */ }
  if (result.status < 200 || result.status >= 300 || payload.success === false) {
    throw new Error(payload.message || payload.error || `Group photo upload failed (HTTP ${result.status}). Please try again.`);
  }
  if (!payload.data?.groupPhoto) throw new Error('The server did not return a group photo. Please reload group information before retrying.');
  return payload.data.groupPhoto;
}

export async function removeGroupPhoto(groupId: string): Promise<void> {
  await apiRequest(`${API_BASE_URL}/group/remove-photo`, {method: 'DELETE', headers: authenticatedHeaders(), body: JSON.stringify({groupId})});
}
