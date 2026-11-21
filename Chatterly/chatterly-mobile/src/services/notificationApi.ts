import {apiRequest} from '../api/client';
import {API_BASE_URL} from '../config/api';
import {getSession, getToken} from './sessionStore';

function authenticatedHeaders(): Record<string, string> {
  const token = getToken();
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...(token ? {Authorization: `Bearer ${token}`} : {}),
  };
}

export async function saveDevicePushToken(fcmToken: string): Promise<void> {
  const userId = String(getSession()?.user?.id || '');
  if (!userId || !fcmToken) { return; }
  await apiRequest(`${API_BASE_URL}/chats/save-token`, {
    method: 'POST',
    headers: authenticatedHeaders(),
    body: JSON.stringify({userId, fcmToken}),
  });
}

/**
 * Kept separate from message persistence: a failed push must never turn a
 * successfully stored chat message into a failed bubble.
 */
export async function sendMessageNotification(
  receiverId: string,
  body: string,
  chatId: string,
): Promise<void> {
  const sender = getSession()?.user;
  const senderId = String(sender?.id || '');
  const senderProfilePic = String(sender?.profilePic || '').trim();
  if (!senderId || !receiverId || !body.trim()) { return; }
  await apiRequest(`${API_BASE_URL}/chats/notify`, {
    method: 'POST',
    headers: authenticatedHeaders(),
    body: JSON.stringify({
      receiverId,
      senderId,
      ...(senderProfilePic ? {senderProfilePic} : {}),
      body: body.trim(),
      redir: `/chat/${encodeURIComponent(chatId)}?senderId=${encodeURIComponent(senderId)}`,
    }),
  });
}

// At-most-once on this device. The key is the persisted message id (or the
// stable tempId while the ACK is resolving), so retrying a socket send cannot
// fan out a second push for the same message.
const attemptedPushes = new Set<string>();
const attemptedOrder: string[] = [];
const MAX_ATTEMPTED_PUSHES = 500;

export async function notifyMessageOnce(
  messageKey: string,
  receiverId: string,
  body: string,
  chatId: string,
): Promise<void> {
  if (!messageKey || attemptedPushes.has(messageKey)) { return; }
  attemptedPushes.add(messageKey);
  attemptedOrder.push(messageKey);
  if (attemptedOrder.length > MAX_ATTEMPTED_PUSHES) {
    attemptedPushes.delete(attemptedOrder.shift()!);
  }
  await sendMessageNotification(receiverId, body, chatId);
}

/** The documented notify route accepts one receiver, so group delivery fans out
 * to the members returned by the group details endpoint. */
export async function notifyGroupMessageOnce(
  messageKey: string,
  recipients: string[],
  body: string,
  groupId: string,
): Promise<void> {
  if (!messageKey || !body.trim()) { return; }
  const sender = getSession()?.user;
  const senderId = String(sender?.id || '');
  const senderProfilePic = String(sender?.profilePic || '').trim();
  if (!senderId) { return; }
  await Promise.all(recipients.filter(id => id && id !== senderId).map(async receiverId => {
    const key = `group:${messageKey}:${receiverId}`;
    if (attemptedPushes.has(key)) { return; }
    attemptedPushes.add(key);
    attemptedOrder.push(key);
    if (attemptedOrder.length > MAX_ATTEMPTED_PUSHES) { attemptedPushes.delete(attemptedOrder.shift()!); }
    await apiRequest(`${API_BASE_URL}/chats/notify`, {
      method: 'POST',
      headers: authenticatedHeaders(),
      body: JSON.stringify({
        receiverId,
        senderId,
        ...(senderProfilePic ? {senderProfilePic} : {}),
        body: body.trim(),
        type: 'group_message',
        groupId,
        redir: `/chat/${encodeURIComponent(groupId)}?groupId=${encodeURIComponent(groupId)}`,
      }),
    });
  }));
}
