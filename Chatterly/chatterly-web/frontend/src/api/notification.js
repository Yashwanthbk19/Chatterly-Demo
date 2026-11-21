// Notification API clients — backend/src/routes/notificationRoutes.js
// (mounted at /api/notification). Used to push a group add/remove notification
// to another user.

import { requestEntity } from './client';

const assertId = (value, label) => {
  const normalized = String(value || '').trim();
  if (!normalized) throw new Error(`${label} is required.`);
  return normalized;
};

const buildGroupNotificationData = ({ receiver, sender, groupId, groupName }) => ({
  receiver: assertId(receiver, 'Receiver id'),
  sender: assertId(sender, 'Sender id'),
  groupId: assertId(groupId, 'Group id'),
  groupName: String(groupName || ''),
});

export const notifyGroupAdded = async (payload = {}) =>
  requestEntity(
    {
      method: 'post',
      url: '/api/notification/group-added',
      skipGlobalError: true,
      data: buildGroupNotificationData(payload),
    },
    { keys: ['data'], fallbackMessage: 'Failed to send group-added notification.' }
  );

export const notifyGroupRemoved = async (payload = {}) =>
  requestEntity(
    {
      method: 'post',
      url: '/api/notification/group-removed',
      skipGlobalError: true,
      data: buildGroupNotificationData(payload),
    },
    { keys: ['data'], fallbackMessage: 'Failed to send group-removed notification.' }
  );
