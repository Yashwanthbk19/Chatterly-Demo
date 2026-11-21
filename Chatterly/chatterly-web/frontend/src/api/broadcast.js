import { requestCollection, requestEntity } from './client';

const BROADCAST_SEND_BASE_TIMEOUT_MS = 30000;
const BROADCAST_SEND_PER_RECIPIENT_TIMEOUT_MS = 4000;
const BROADCAST_SEND_MAX_TIMEOUT_MS = 180000;

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

const resolveBroadcastSendTimeout = (recipientCount = 0) => {
  const normalizedRecipientCount = Number(recipientCount);

  if (!Number.isFinite(normalizedRecipientCount) || normalizedRecipientCount <= 0) {
    return BROADCAST_SEND_BASE_TIMEOUT_MS;
  }

  return Math.min(
    BROADCAST_SEND_MAX_TIMEOUT_MS,
    BROADCAST_SEND_BASE_TIMEOUT_MS +
      Math.ceil(normalizedRecipientCount) * BROADCAST_SEND_PER_RECIPIENT_TIMEOUT_MS
  );
};

export const getMyBroadcasts = async (options = {}) =>
  requestCollection(
    { method: 'get', url: '/api/broadcast/my-lists', skipGlobalError: true, skipGlobalLoading: Boolean(options?.skipGlobalLoading) },
    {
      keys: ['data', 'broadcasts', 'items', 'results'],
      fallbackMessage: 'Failed to load broadcasts.',
      dedupeKey: 'my-broadcasts',
    }
  );

export const createBroadcast = async ({ name, participants } = {}) => {
  const normalizedName = String(name || '').trim();
  const participantIds = toIdList(participants);

  if (!normalizedName) throw new Error('Broadcast name is required.');
  if (!participantIds.length) throw new Error('At least one participant is required.');

  return requestEntity(
    {
      method: 'post',
      url: '/api/broadcast/create',
      skipGlobalError: true,
      data: {
        name: normalizedName,
        participants: participantIds,
      },
    },
    {
      keys: ['data', 'broadcast'],
      fallbackMessage: 'Failed to create broadcast.',
      dedupeKey: `create-broadcast:${normalizedName}:${participantIds.join(',')}`,
    }
  );
};

export const getBroadcastDetails = async (broadcastId, options = {}) =>
  requestEntity(
    {
      method: 'get',
      url: `/api/broadcast/${assertId(broadcastId, 'Broadcast id')}`,
      skipGlobalLoading: Boolean(options?.skipGlobalLoading),
      skipGlobalError: true,
    },
    {
      keys: ['data'],
      fallbackMessage: 'Failed to load broadcast.',
      dedupeKey: `broadcast-${broadcastId}`,
    }
  );

export const addBroadcastMember = async ({ broadcastId, userId } = {}) =>
  requestEntity(
    {
      method: 'post',
      url: '/api/broadcast/add-member',
      skipGlobalError: true,
      data: {
        broadcastId: assertId(broadcastId, 'Broadcast id'),
        userId: assertId(userId, 'User id'),
      },
    },
    {
      keys: ['data', 'broadcast'],
      fallbackMessage: 'Failed to add broadcast recipient.',
    }
  );

export const removeBroadcastMember = async ({ broadcastId, userId } = {}) =>
  requestEntity(
    {
      method: 'post',
      url: '/api/broadcast/remove-member',
      skipGlobalError: true,
      data: {
        broadcastId: assertId(broadcastId, 'Broadcast id'),
        userId: assertId(userId, 'User id'),
      },
    },
    {
      keys: ['data', 'broadcast'],
      fallbackMessage: 'Failed to remove broadcast recipient.',
    }
  );

export const deleteBroadcast = async (broadcastId) =>
  requestEntity(
    {
      method: 'delete',
      url: '/api/broadcast/delete-broadcast',
      skipGlobalError: true,
      data: { broadcastId: assertId(broadcastId, 'Broadcast id') },
    },
    {
      keys: ['data'],
      fallbackMessage: 'Failed to delete broadcast.',
    }
  );

export const sendBroadcastMessage = async ({
  broadcastId,
  content,
  recipientCount = 0,
} = {}) => {
  const normalizedBroadcastId = assertId(broadcastId, 'Broadcast id');
  const normalizedContent = String(content || '').trim();

  if (!normalizedContent) throw new Error('Message content is required.');

  return requestEntity(
    {
      method: 'post',
      url: '/api/broadcast/send',
      skipGlobalError: true,
      // Broadcast delivery fans out server-side, so it needs a longer timeout
      // than the default single-message request window.
      timeout: resolveBroadcastSendTimeout(recipientCount),
      data: {
        broadcastId: normalizedBroadcastId,
        content: normalizedContent,
      },
    },
    {
      keys: ['data', 'message', 'broadcastMessage'],
      fallbackMessage: 'Failed to send broadcast message.',
    }
  );
};


