// Group API clients — one per route in backend/src/routes/groupRoutes.js
// (mounted at /api/group). `createGroup` and `sendGroupMediaUpload` live in
// api/chat.js; everything else for the documented group endpoints is here.

import { requestCollection, requestEntity } from './client';
import { decryptMessageRecords } from './encryption';
import { retryTransient } from '../utils/transientRetry';

const GROUP_NAME_MAX_LENGTH = 50;
const GROUP_DESCRIPTION_MAX_LENGTH = 100;

const assertId = (value, label) => {
  const normalized = String(value || '').trim();
  if (!normalized) throw new Error(`${label} is required.`);
  return normalized;
};

const toIdList = (value) =>
  Array.from(
    new Set(
      (Array.isArray(value) ? value : [value])
        .map((entry) => String(entry || '').trim())
        .filter(Boolean)
    )
  );

export const getMyGroups = async (options = {}) =>
  requestCollection(
    {
      method: 'get',
      url: '/api/group/my-groups',
      skipGlobalLoading: Boolean(options?.skipGlobalLoading),
      signal: options?.signal,
    },
    { keys: ['data', 'groups'], fallbackMessage: 'Failed to load groups.', dedupeKey: 'my-groups' }
  );

export const pinGroupThread = async (groupId) =>
  requestEntity(
    { method: 'post', url: '/api/group/pin-group', data: { groupId: assertId(groupId, 'Group id') } },
    { fallbackMessage: 'Failed to pin group.' }
  );

export const unpinGroupThread = async (groupId) =>
  requestEntity(
    { method: 'post', url: '/api/group/unpin-group', data: { groupId: assertId(groupId, 'Group id') } },
    { fallbackMessage: 'Failed to unpin group.' }
  );

export const searchGroups = async (keyword) =>
  requestCollection(
    {
      method: 'get',
      url: '/api/group/search',
      params: { keyword: String(keyword || '').trim() },
      skipGlobalError: true,
    },
    { keys: ['data', 'groups'], fallbackMessage: 'Failed to search groups.' }
  );

export const getGroupDetails = async (groupId, options = {}) =>
  requestEntity(
    {
      method: 'get',
      url: `/api/group/${assertId(groupId, 'Group id')}`,
      skipGlobalLoading: Boolean(options?.skipGlobalLoading),
      skipGlobalError: Boolean(options?.skipGlobalError),
    },
    { keys: ['data'], fallbackMessage: 'Failed to load group.', dedupeKey: `group-${groupId}` }
  );

export const getGroupPermissions = async (groupId) =>
  requestEntity(
    { method: 'get', url: `/api/group/permissions/${assertId(groupId, 'Group id')}`, skipGlobalLoading: true, skipGlobalError: true },
    { keys: ['data'], fallbackMessage: 'Failed to load group permissions.' }
  );

export const updateGroupPermissions = async ({ groupId, rolePermissions } = {}) =>
  requestEntity(
    { method: 'put', url: `/api/group/permissions/${assertId(groupId, 'Group id')}`, data: { rolePermissions } },
    { keys: ['data'], fallbackMessage: 'Failed to update group permissions.' }
  );

export const getGroupMessages = async (groupId, options = {}) => {
  // Group previews and the open conversation both start from this one request,
  // so a transient failure used to leave "No messages" until the app was reloaded.
  const messages = await retryTransient(() => requestCollection(
    {
      method: 'get',
      url: `/api/group/messages/${assertId(groupId, 'Group id')}`,
      skipGlobalLoading: Boolean(options?.skipGlobalLoading),
      skipGlobalError: Boolean(options?.skipGlobalError),
      signal: options?.signal,
    },
    { keys: ['data', 'messages'], fallbackMessage: 'Failed to load group messages.', dedupeKey: `group-messages-${groupId}` }
  ), { retries: 2, delaysMs: [700, 1800] });
  return decryptMessageRecords(messages);
};

export const getGroupPinnedMessages = async (groupId, options = {}) =>
  requestCollection(
    {
      method: 'get',
      url: `/api/group/pinned-messages/${assertId(groupId, 'Group id')}`,
      skipGlobalLoading: Boolean(options?.skipGlobalLoading),
      skipGlobalError: Boolean(options?.skipGlobalError),
    },
    {
      keys: ['data', 'messages', 'pinnedMessages', 'pins'],
      fallbackMessage: 'Failed to load pinned group messages.',
      dedupeKey: `group-pinned-messages-${groupId}`,
    }
  );

export const pinGroupMessage = async ({ groupId, messageId } = {}) =>
  requestEntity(
    {
      method: 'post',
      url: '/api/group/pin-message',
      data: { groupId: assertId(groupId, 'Group id'), messageId: assertId(messageId, 'Message id') },
    },
    { keys: ['data'], fallbackMessage: 'Failed to pin group message.' }
  );

export const unpinGroupMessage = async ({ groupId, messageId } = {}) =>
  requestEntity(
    {
      method: 'post',
      url: '/api/group/unpin-message',
      data: { groupId: assertId(groupId, 'Group id'), messageId: assertId(messageId, 'Message id') },
    },
    { keys: ['data'], fallbackMessage: 'Failed to unpin group message.' }
  );

export const assignModerator = async ({ groupId, userId } = {}) =>
  requestEntity(
    {
      method: 'post',
      url: '/api/group/assign-moderator',
      data: { groupId: assertId(groupId, 'Group id'), userId: assertId(userId, 'User id') },
    },
    { keys: ['data'], fallbackMessage: 'Failed to assign moderator.' }
  );

export const removeModerator = async ({ groupId, userId } = {}) =>
  requestEntity(
    {
      method: 'post',
      url: '/api/group/remove-moderator',
      data: { groupId: assertId(groupId, 'Group id'), userId: assertId(userId, 'User id') },
    },
    { keys: ['data'], fallbackMessage: 'Failed to remove moderator.' }
  );

export const assignAdmin = async ({ groupId, userId } = {}) =>
  requestEntity(
    {
      method: 'post',
      url: '/api/group/assign-admin',
      data: { groupId: assertId(groupId, 'Group id'), userId: assertId(userId, 'User id') },
    },
    { keys: ['data'], fallbackMessage: 'Failed to assign admin.' }
  );

export const removeAdmin = async ({ groupId, userId } = {}) =>
  requestEntity(
    {
      method: 'post',
      url: '/api/group/remove-admin',
      data: { groupId: assertId(groupId, 'Group id'), userId: assertId(userId, 'User id') },
    },
    { keys: ['data'], fallbackMessage: 'Failed to remove admin.' }
  );

export const addParticipants = async ({ groupId, participants } = {}) =>
  requestEntity(
    {
      method: 'put',
      url: '/api/group/add-participants',
      data: { groupId: assertId(groupId, 'Group id'), participants: toIdList(participants) },
    },
    { keys: ['data'], fallbackMessage: 'Failed to add participants.' }
  );

export const removeParticipant = async ({ groupId, participantId } = {}) =>
  requestEntity(
    {
      method: 'put',
      url: '/api/group/remove-participant',
      data: { groupId: assertId(groupId, 'Group id'), participantId: assertId(participantId, 'Participant id') },
    },
    { keys: ['data'], fallbackMessage: 'Failed to remove participant.' }
  );

export const leaveGroup = async (groupId) =>
  requestEntity(
    { method: 'put', url: '/api/group/leave', data: { groupId: assertId(groupId, 'Group id') } },
    { fallbackMessage: 'Failed to leave group.' }
  );

export const updateGroup = async ({ groupId, groupName, description } = {}) => {
  const data = { groupId: assertId(groupId, 'Group id') };
  if (groupName !== undefined) {
    data.groupName = String(groupName || '').trim();
    if (!data.groupName) throw new Error('Group name is required.');
    if (data.groupName.length > GROUP_NAME_MAX_LENGTH) {
      throw new Error(`Group name cannot exceed ${GROUP_NAME_MAX_LENGTH} characters.`);
    }
  }
  if (description !== undefined) {
    data.description = String(description || '').trim();
    if (data.description.length > GROUP_DESCRIPTION_MAX_LENGTH) {
      throw new Error(`Group description cannot exceed ${GROUP_DESCRIPTION_MAX_LENGTH} characters.`);
    }
  }
  return requestEntity(
    { method: 'put', url: '/api/group/update', data },
    { keys: ['data'], fallbackMessage: 'Failed to update group.' }
  );
};

// PUT /group/admin-message — toggle "only admins can message".
export const updateGroupSettings = async ({ groupId, onlyAdminsCanMessage } = {}) =>
  requestEntity(
    {
      method: 'put',
      url: '/api/group/admin-message',
      data: { groupId: assertId(groupId, 'Group id'), onlyAdminsCanMessage: Boolean(onlyAdminsCanMessage) },
    },
    { keys: ['data'], fallbackMessage: 'Failed to update group settings.' }
  );

export const generateGroupInviteLink = async (groupId) =>
  requestEntity(
    { method: 'post', url: `/api/group/${assertId(groupId, 'Group id')}/invite-link` },
    { fallbackMessage: 'Failed to generate group invite link.' }
  );

export const sendGroupMessage = async ({ groupId, content, replyTo = null } = {}) => {
  const data = { groupId: assertId(groupId, 'Group id'), content: String(content || '') };
  if (replyTo) data.replyTo = replyTo;
  return requestEntity(
    { method: 'post', url: '/api/group/send-message', data },
    { keys: ['data'], fallbackMessage: 'Failed to send group message.' }
  );
};

export const sendGroupFile = async ({ groupId, file } = {}) => {
  if (!file) throw new Error('A file is required.');
  const formData = new FormData();
  formData.append('groupId', assertId(groupId, 'Group id'));
  formData.append('file', file, file.name || 'attachment');
  return requestEntity(
    { method: 'post', url: '/api/group/send-file', data: formData },
    { keys: ['data'], fallbackMessage: 'Failed to send group file.' }
  );
};

export const changeGroupPhoto = async ({ groupId, media } = {}) => {
  if (!media) throw new Error('A group photo is required.');
  const formData = new FormData();
  formData.append('groupId', assertId(groupId, 'Group id'));
  formData.append('media', media, media.name || 'group-photo');
  return requestEntity(
    { method: 'put', url: '/api/group/change-photo', data: formData },
    { keys: ['data'], fallbackMessage: 'Failed to update group photo.' }
  );
};

export const removeGroupPhoto = async (groupId) =>
  requestEntity(
    { method: 'delete', url: '/api/group/remove-photo', data: { groupId: assertId(groupId, 'Group id') } },
    { keys: ['data'], fallbackMessage: 'Failed to remove group photo.' }
  );

export const deleteGroup = async (groupId) =>
  requestEntity(
    { method: 'delete', url: `/api/group/delete/${assertId(groupId, 'Group id')}` },
    { fallbackMessage: 'Failed to delete group.' }
  );

