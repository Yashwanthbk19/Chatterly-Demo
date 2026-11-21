// Call history API client - backend/src/routes/callHistoryRoutes.js
// Mounted at /api/call and intentionally read-only for the History UI.

import { requestEntity } from './client';

export const getCallHistory = async () =>
  requestEntity(
    {
      method: 'get',
      url: '/api/call/history',
      skipGlobalError: true,
      // The Calls panel shows its own loading state; the app-wide loader popping
      // up over it on every visit read as a stray notification.
      skipGlobalLoading: true,
    },
    {
      fallbackMessage: 'Failed to load call history.',
      dedupeKey: 'call-history',
    }
  );

export const getCallDetails = async (callId, { type = 'personal', signal } = {}) => {
  const normalizedCallId = String(callId || '').trim();
  if (!normalizedCallId) {
    throw new Error('Call id is required.');
  }

  return requestEntity(
    {
      method: 'get',
      url: `/api/call/details/${encodeURIComponent(normalizedCallId)}`,
      params: { type: type === 'group' ? 'group' : 'personal' },
      signal,
      skipGlobalError: true,
      skipGlobalLoading: true,
    },
    { fallbackMessage: 'Failed to load call details.' }
  );
};
