import { useCallback, useMemo, useState } from 'react';
import {
  addBroadcastParticipants,
  createBroadcast,
  createBroadcastModel,
  getBroadcastParticipantId,
  removeBroadcastParticipants,
  setBroadcastParticipants,
  updateBroadcastModel,
} from '../utils/broadcast';

const toBroadcastList = (broadcasts) => {
  if (!Array.isArray(broadcasts)) return [];
  return broadcasts
    .map((broadcast) => createBroadcastModel(broadcast))
    .filter((broadcast) => broadcast.id);
};

/**
 * useBroadcasts — central state for broadcast lists.
 *
 * State shape per broadcast:
 *   { id, name, members[], createdBy, createdAt, lastMessage }
 *
 * Operations:
 *   - createBroadcast: add a new broadcast
 *   - updateBroadcast: edit broadcast metadata for future edit flows
 *   - updateParticipants: replace, add, or remove participants on a broadcast
 *   - deleteBroadcast: remove a broadcast by id
 */
export const useBroadcasts = (initialBroadcasts = []) => {
  const [broadcasts, setBroadcasts] = useState(() => toBroadcastList(initialBroadcasts));

  const createNewBroadcast = useCallback((draft) => {
    const nextBroadcast = createBroadcast(draft);
    setBroadcasts((current) => [
      nextBroadcast,
      ...current.filter((broadcast) => broadcast.id !== nextBroadcast.id),
    ]);
    return nextBroadcast;
  }, []);

  const updateBroadcast = useCallback((broadcastId, updates) => {
    const targetId = String(broadcastId ?? '').trim();
    if (!targetId) return;

    setBroadcasts((current) =>
      current.map((broadcast) =>
        broadcast.id === targetId || broadcast.broadcastId === targetId
          ? updateBroadcastModel(broadcast, updates)
          : broadcast
      )
    );
  }, []);

  const updateParticipants = useCallback((broadcastId, change) => {
    const targetId = String(broadcastId ?? '').trim();
    if (!targetId) return;

    setBroadcasts((current) =>
      current.map((broadcast) => {
        if (broadcast.id !== targetId && broadcast.broadcastId !== targetId) return broadcast;

        if (Array.isArray(change)) {
          return setBroadcastParticipants(broadcast, change);
        }
        if (change && typeof change === 'object') {
          let next = broadcast;
          if (change.set !== undefined) {
            next = setBroadcastParticipants(next, change.set);
          }
          if (change.add !== undefined) {
            next = addBroadcastParticipants(next, change.add);
          }
          if (change.remove !== undefined) {
            next = removeBroadcastParticipants(next, change.remove);
          }
          return next;
        }
        return broadcast;
      })
    );
  }, []);

  const addParticipants = useCallback((broadcastId, participants) => {
    updateParticipants(broadcastId, { add: participants });
  }, [updateParticipants]);

  const removeParticipants = useCallback((broadcastId, participants) => {
    updateParticipants(broadcastId, { remove: participants });
  }, [updateParticipants]);

  const deleteBroadcast = useCallback((broadcastId) => {
    const targetId = String(broadcastId ?? '').trim();
    if (!targetId) return;
    setBroadcasts((current) =>
      current.filter((broadcast) => broadcast.id !== targetId && broadcast.broadcastId !== targetId)
    );
  }, []);

  const getBroadcast = useCallback(
    (broadcastId) => {
      const targetId = String(broadcastId ?? '').trim();
      if (!targetId) return null;
      return broadcasts.find((broadcast) => broadcast.id === targetId || broadcast.broadcastId === targetId) || null;
    },
    [broadcasts]
  );

  const broadcastsById = useMemo(
    () =>
      broadcasts.reduce((map, broadcast) => {
        map[broadcast.id] = broadcast;
        return map;
      }, {}),
    [broadcasts]
  );

  const resetBroadcasts = useCallback(
    (nextBroadcasts = []) => setBroadcasts(toBroadcastList(nextBroadcasts)),
    []
  );

  return {
    broadcasts,
    broadcastsById,
    createBroadcast: createNewBroadcast,
    updateBroadcast,
    updateParticipants,
    addParticipants,
    removeParticipants,
    deleteBroadcast,
    getBroadcast,
    resetBroadcasts,
    getParticipantId: getBroadcastParticipantId,
  };
};

export default useBroadcasts;
