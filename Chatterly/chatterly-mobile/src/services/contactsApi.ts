import {apiRequest} from '../api/client';
import {API_BASE_URL} from '../config/api';
import {getToken} from './sessionStore';

export type SyncedContactUser = {
  _id?: string;
  id?: string;
  name?: string;
  fullName?: string;
  phone?: string;
  phoneNumber?: string;
  profilePic?: string;
  status?: string;
};

export type SyncContactsResponse = {
  message?: string;
  registered?: SyncedContactUser[];
  unRegistered?: string[];
};

export async function syncContacts(phoneNumbers: string[]): Promise<SyncContactsResponse> {
  const token = getToken();
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await apiRequest(`${API_BASE_URL}/user/syncContacts`, {
    method: 'POST',
    headers,
    body: JSON.stringify({contacts: phoneNumbers}),
  });

  return response.json() as Promise<SyncContactsResponse>;
}

export type RegisteredUser = {userId: string; name: string; phone: string; email: string; profilePic: string | null};

/**
 * One account's registered details, by id.
 *
 * `GET /api/chats/profile/:userId` (the profile view) never returns the phone
 * number, so this reads `GET /api/auth/search-users?q=<userId>`, whose `$or`
 * matches the id exactly and selects `_id name email phone profilePic` - the
 * same lookup the web client's `getRegisteredUserById` makes. The search can
 * also match names or numbers that merely contain the id, so only the row with
 * this exact id is used.
 */
export async function getRegisteredUser(userId: string): Promise<RegisteredUser | null> {
  const id = String(userId || '').trim();
  if (!id) { return null; }
  const token = getToken();
  const response = await apiRequest(`${API_BASE_URL}/auth/search-users?q=${encodeURIComponent(id)}`, {
    method: 'GET',
    headers: {Accept: 'application/json', ...(token ? {Authorization: `Bearer ${token}`} : {})},
  });
  const payload = await response.json();
  const rows: SyncedContactUser[] = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.users) ? payload.users : [];
  const match = rows.find(row => String(row?._id || row?.id || '') === id) as (SyncedContactUser & {email?: string}) | undefined;
  if (!match) { return null; }
  return {
    userId: id,
    name: String(match.name || match.fullName || ''),
    phone: String(match.phone || match.phoneNumber || '').trim(),
    email: String(match.email || '').trim(),
    profilePic: match.profilePic || null,
  };
}
