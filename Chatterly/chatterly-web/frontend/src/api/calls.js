// Calls API client — backend/src/routes/callRoutes.js (mounted at /api/calls).
//
// POST /calls/start creates the call record and notifies the receiver. The live,
// two-way call (ringing/answer/hangup synced on both ends, plus WebRTC signaling)
// runs over Socket.IO — see utils/socketService.js (initiateCall, acceptCall,
// endCall, …). This REST client mirrors the documented endpoint for callers that
// only need to create the call without the realtime channel.

import { requestEntity } from './client';

export const startCall = async ({ receiverId, type = 'audio' } = {}) => {
  const normalizedReceiverId = String(receiverId || '').trim();
  if (!normalizedReceiverId) {
    throw new Error('Receiver id is required to start a call.');
  }

  return requestEntity(
    {
      method: 'post',
      url: '/api/calls/start',
      data: { receiverId: normalizedReceiverId, type: type || 'audio' },
    },
    { keys: ['data'], fallbackMessage: 'Failed to start call.' }
  );
};
