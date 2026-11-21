import {apiRequest} from '../api/client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {API_BASE_URL} from '../config/api';
import {getSession, getToken} from './sessionStore';

export type BroadcastParticipant = {
  _id: string;
  name: string;
  profilePic?: string | null;
};

export type BroadcastList = {
  _id: string;
  name: string;
  createdBy?: string | BroadcastParticipant;
  participants: BroadcastParticipant[];
  createdAt?: string;
  updatedAt?: string;
  /** The broadcast API has no image field; this URI is retained on this device. */
  imageUri?: string | null;
};

export type StoredBroadcastMessage = {
  id: string;
  text: string;
  createdAt: string;
  recipients: number;
  fileName?: string;
  fileType?: string;
  fileSize?: number;
  /** Sender-side retained copy used to reopen a sent broadcast attachment. */
  fileUri?: string;
};

const BROADCAST_IMAGES_KEY = '@chatterly/broadcast-images';
const userStorageKey = (suffix: string) => `@chatterly/${suffix}:${getSession()?.user?.id || 'anonymous'}`;
const broadcastMessagesKey = () => userStorageKey('broadcast-messages-v1');
const deletedBroadcastsKey = () => userStorageKey('deleted-broadcasts-v1');

async function getBroadcastImages(): Promise<Record<string, string>> {
  try {
    const value = await AsyncStorage.getItem(BROADCAST_IMAGES_KEY);
    const parsed = value ? JSON.parse(value) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export async function saveBroadcastImage(broadcastId: string, imageUri: string): Promise<void> {
  const images = await getBroadcastImages();
  images[broadcastId] = imageUri;
  await AsyncStorage.setItem(BROADCAST_IMAGES_KEY, JSON.stringify(images));
}

async function readObject<T>(key: string): Promise<Record<string, T>> {
  try {
    const value = await AsyncStorage.getItem(key);
    const parsed = value ? JSON.parse(value) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export async function getBroadcastMessages(broadcastId: string): Promise<StoredBroadcastMessage[]> {
  const messages = await readObject<StoredBroadcastMessage[]>(broadcastMessagesKey());
  const records = Array.isArray(messages[broadcastId]) ? messages[broadcastId] : [];
  return records.filter(message => message?.id && message?.text && !Number.isNaN(Date.parse(message.createdAt)));
}

export async function saveBroadcastMessage(broadcastId: string, message: StoredBroadcastMessage): Promise<void> {
  const key = broadcastMessagesKey();
  const messages = await readObject<StoredBroadcastMessage[]>(key);
  const current = Array.isArray(messages[broadcastId]) ? messages[broadcastId] : [];
  messages[broadcastId] = [...current.filter(item => item.id !== message.id), message].slice(-500);
  await AsyncStorage.setItem(key, JSON.stringify(messages));
}

export async function deleteBroadcast(broadcastId: string): Promise<void> {
  await apiRequest(`${API_BASE_URL}/broadcast/delete-broadcast`, {
    method: 'DELETE',
    headers: authenticatedHeaders(),
    body: JSON.stringify({broadcastId}),
  });

  // Clear the device-only data after the backend confirms the deletion.
  const deletedKey = deletedBroadcastsKey();
  const messagesKey = broadcastMessagesKey();
  const [deleted, messages, images] = await Promise.all([
    readObject<boolean>(deletedKey),
    readObject<StoredBroadcastMessage[]>(messagesKey),
    getBroadcastImages(),
  ]);
  deleted[broadcastId] = true;
  delete messages[broadcastId];
  delete images[broadcastId];
  await Promise.all([
    AsyncStorage.setItem(deletedKey, JSON.stringify(deleted)),
    AsyncStorage.setItem(messagesKey, JSON.stringify(messages)),
    AsyncStorage.setItem(BROADCAST_IMAGES_KEY, JSON.stringify(images)),
  ]);
}

type BroadcastRecord = Omit<BroadcastList, 'participants'> & {
  participants?: Array<string | Partial<BroadcastParticipant>>;
};

function authenticatedHeaders(): Record<string, string> {
  const token = getToken();
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...(token ? {Authorization: `Bearer ${token}`} : {}),
  };
}

function normalizeParticipant(value: string | Partial<BroadcastParticipant>): BroadcastParticipant {
  if (typeof value === 'string') {
    return {_id: value, name: 'Chatterly user', profilePic: null};
  }
  return {
    _id: String(value._id || ''),
    name: String(value.name || 'Chatterly user'),
    profilePic: value.profilePic || null,
  };
}

function normalizeBroadcast(value: BroadcastRecord): BroadcastList {
  return {
    ...value,
    _id: String(value._id || ''),
    name: String(value.name || 'Broadcast'),
    participants: (value.participants || []).map(normalizeParticipant).filter(member => member._id),
  };
}

export async function createBroadcast(name: string, participantIds: string[]): Promise<BroadcastList> {
  const uniqueParticipantIds = [...new Set(participantIds.filter(Boolean))];
  if (uniqueParticipantIds.length < 2) { throw new Error('Minimum 2 participants required.'); }
  const response = await apiRequest(`${API_BASE_URL}/broadcast/create`, {
    method: 'POST',
    headers: authenticatedHeaders(),
    body: JSON.stringify({name: name.trim(), participants: uniqueParticipantIds}),
  });
  const payload = await response.json();
  return normalizeBroadcast(payload?.data || {});
}

export async function getBroadcastLists(): Promise<BroadcastList[]> {
  const response = await apiRequest(`${API_BASE_URL}/broadcast/my-lists`, {
    method: 'GET',
    headers: authenticatedHeaders(),
  });
  const payload = await response.json();
  const records = payload?.data || [];
  if (!Array.isArray(records)) return [];
  const [images, deleted] = await Promise.all([getBroadcastImages(), readObject<boolean>(deletedBroadcastsKey())]);
  return records.map(normalizeBroadcast).filter(item => item._id && !deleted[item._id]).map(item => ({...item, imageUri: images[item._id] || item.imageUri || null}));
}

export async function getBroadcastDetails(broadcastId: string): Promise<BroadcastList> {
  const response = await apiRequest(`${API_BASE_URL}/broadcast/${encodeURIComponent(broadcastId)}`, {
    method: 'GET',
    headers: authenticatedHeaders(),
  });
  const payload = await response.json();
  const details = normalizeBroadcast(payload?.data || {});
  const images = await getBroadcastImages();
  return {...details, imageUri: images[details._id] || details.imageUri || null};
}

export async function sendBroadcastMessage(broadcastId: string, content: string): Promise<{totalRecipients: number; messagesCreated: number}> {
  const response = await apiRequest(`${API_BASE_URL}/broadcast/send`, {
    method: 'POST',
    headers: authenticatedHeaders(),
    body: JSON.stringify({broadcastId, content: content.trim()}),
  });
  const payload = await response.json();
  return {
    totalRecipients: Number(payload?.totalRecipients || 0),
    messagesCreated: Number(payload?.messagesCreated || 0),
  };
}

async function updateBroadcastMember(path: '/broadcast/add-member' | '/broadcast/remove-member', broadcastId: string, userId: string): Promise<void> {
  await apiRequest(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: authenticatedHeaders(),
    body: JSON.stringify({broadcastId, userId}),
  });
}

export const addBroadcastMember = (broadcastId: string, userId: string) => updateBroadcastMember('/broadcast/add-member', broadcastId, userId);
export const removeBroadcastMember = (broadcastId: string, userId: string) => updateBroadcastMember('/broadcast/remove-member', broadcastId, userId);
