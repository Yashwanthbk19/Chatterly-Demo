import {apiRequest} from '../api/client';
import {API_BASE_URL} from '../config/api';
import {getSession, getToken} from './sessionStore';
import {getChatList, normalizeChatList} from './chatApi';
import {setChatDisappearingTimer, setStoredChatDisappearingTimer} from './disappearingMessages';

export type DisappearingMessageDuration = 'off' | '24h' | '7d' | '30d';

export type PrivacySettings = {
  encryptionEnabled: boolean;
  twoFactorEnabled: boolean;
  blockedUsersCount: number;
  disappearingMessages: DisappearingMessageDuration;
};

export type EncryptionInfo = {
  enabled: boolean;
  title: string;
  description: string;
};

export type EncryptionDetails = {
  messagesEncrypted: boolean;
  callsEncrypted: boolean;
  mediaEncrypted: boolean;
  filesEncrypted: boolean;
  serverCanReadMessages: boolean;
  keyExchange: string;
  encryptionAlgorithm: string;
};

export type BlockedUser = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  profilePic?: string;
  status?: string;
};

export type TwoFactorMethod = 'authenticator' | 'sms';

export type AuthenticatorSetup = {
  qrCode: string;
  manualKey: string;
};

export type TwoFactorEnableResult = {
  message: string;
  backupCodes: string[];
};

export type TrustedDevice = {
  id: string;
  deviceId: string;
  deviceName: string;
  platform: 'android' | 'ios' | 'web';
  browser: string;
  ipAddress: string;
  trusted: boolean;
  lastLoginAt: string;
  createdAt: string;
};

export type RegisterTrustedDeviceInput = {
  deviceId: string;
  deviceName: string;
  platform: 'android' | 'ios' | 'web';
  browser: string;
};

function authenticatedHeaders(): Record<string, string> {
  const token = getToken();
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...(token ? {Authorization: `Bearer ${token}`} : {}),
  };
}

async function jsonRequest(path: string, options: RequestInit = {}): Promise<any> {
  const response = await apiRequest(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {...authenticatedHeaders(), ...(options.headers || {})},
  });
  return response.json();
}

function normalizeDuration(value: unknown): DisappearingMessageDuration {
  return value === '24h' || value === '7d' || value === '30d' ? value : 'off';
}

export async function getPrivacySettings(): Promise<PrivacySettings> {
  const payload = await jsonRequest('/privacy/settings', {method: 'GET'});
  const data = payload?.data || {};
  return {
    encryptionEnabled: Boolean(data.encryptionEnabled),
    twoFactorEnabled: Boolean(data.twoFactorEnabled),
    blockedUsersCount: Number(data.blockedUsersCount) || 0,
    disappearingMessages: normalizeDuration(data.disappearingMessages),
  };
}

export async function updateDisappearingMessages(disappearingMessages: DisappearingMessageDuration): Promise<PrivacySettings | null> {
  if (disappearingMessages === 'off') {
    // The privacy default and existing conversation timers are separate settings.
    // Clear each conversation through the existing API before reporting success.
    const chats = normalizeChatList(await getChatList()).filter(chat => chat.contact.kind !== 'group');
    const results = await Promise.allSettled(chats.map(async chat => {
      await setChatDisappearingTimer(chat.contact.userId, 'off');
      await setStoredChatDisappearingTimer(chat.id, 'off');
    }));
    const failed = results.find(result => result.status === 'rejected');
    if (failed?.status === 'rejected') {
      throw new Error('Unable to clear all disappearing message timers. Please try again.');
    }
  }
  const payload = await jsonRequest('/privacy/settings', {
    method: 'PUT',
    body: JSON.stringify({disappearingMessages}),
  });
  const data = payload?.data;
  if (!data) { return null; }
  return {
    encryptionEnabled: Boolean(data.encryptionEnabled),
    twoFactorEnabled: Boolean(data.twoFactorEnabled),
    blockedUsersCount: Number(data.blockedUsersCount) || 0,
    disappearingMessages: normalizeDuration(data.disappearingMessages),
  };
}

export async function getEncryptionInfo(): Promise<EncryptionInfo> {
  const payload = await jsonRequest('/privacy/encryption-info', {method: 'GET'});
  const data = payload?.data || {};
  return {
    enabled: data.enabled !== false,
    title: String(data.title || 'End-to-End Encryption'),
    description: String(data.description || 'Your messages and calls are protected with end-to-end encryption.'),
  };
}

export async function getEncryptionDetails(): Promise<EncryptionDetails> {
  const payload = await jsonRequest('/privacy/encryption-details', {method: 'GET'});
  const data = payload?.data || {};
  return {
    messagesEncrypted: Boolean(data.messagesEncrypted),
    callsEncrypted: Boolean(data.callsEncrypted),
    mediaEncrypted: Boolean(data.mediaEncrypted),
    filesEncrypted: Boolean(data.filesEncrypted),
    serverCanReadMessages: Boolean(data.serverCanReadMessages),
    keyExchange: String(data.keyExchange || 'ECDH'),
    encryptionAlgorithm: String(data.encryptionAlgorithm || 'AES-256'),
  };
}

/**
 * The security code for the conversation with `userId`.
 *
 * The backend hashes both public keys, so it answers 400 ("Both users must
 * exchange encryption keys first") until each side has one. That message is
 * surfaced verbatim rather than replaced, because it tells the user exactly
 * what is missing.
 */
export async function getSecurityCode(userId: string): Promise<string> {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) { throw new Error('Open a one-to-one conversation before viewing its security code.'); }

  const payload = await jsonRequest(`/privacy/security-code/${encodeURIComponent(normalizedUserId)}`, {method: 'GET'});
  const code = String(payload?.data?.securityCode || payload?.securityCode || '');
  if (!code) { throw new Error(payload?.message || 'The security code could not be loaded. Please try again.'); }
  return code;
}

export async function setTwoFactorEnabled(enabled: boolean): Promise<string> {
  const payload = await jsonRequest(enabled ? '/2fa/enable' : '/2fa/disable', {
    method: 'POST',
    ...(enabled ? {body: JSON.stringify({method: 'sms'})} : {}),
  });
  return String(payload?.message || `Two-factor authentication ${enabled ? 'enabled' : 'disabled'}.`);
}

export async function enableTwoFactor(method: TwoFactorMethod): Promise<string> {
  const result = await enableTwoFactorSetup(method);
  return result.message;
}

export async function enableTwoFactorSetup(method: TwoFactorMethod): Promise<TwoFactorEnableResult> {
  const payload = await jsonRequest('/2fa/enable', {
    method: 'POST',
    body: JSON.stringify({method}),
  });
  const codes = payload?.backupCodes || payload?.data?.backupCodes || [];
  return {
    message: String(payload?.message || 'Two-factor authentication enabled.'),
    backupCodes: Array.isArray(codes) ? codes.map((code: unknown) => String(code)) : [],
  };
}

export async function disableTwoFactor(): Promise<string> {
  const payload = await jsonRequest('/2fa/disable', {method: 'POST'});
  return String(payload?.message || 'Two-factor authentication disabled.');
}

export async function setupAuthenticator(): Promise<AuthenticatorSetup> {
  const payload = await jsonRequest('/2fa/authenticator/setup', {method: 'POST'});
  return {
    qrCode: String(payload?.qrCode || payload?.data?.qrCode || ''),
    manualKey: String(payload?.manualKey || payload?.data?.manualKey || ''),
  };
}

export async function verifyAuthenticator(token: string): Promise<string[]> {
  const payload = await jsonRequest('/2fa/authenticator/verify', {
    method: 'POST',
    body: JSON.stringify({token}),
  });
  const codes = payload?.backupCodes || payload?.data?.backupCodes || [];
  return Array.isArray(codes) ? codes.map((code: unknown) => String(code)) : [];
}

function normalizeTrustedDevice(value: any): TrustedDevice {
  const platform = value?.platform === 'ios' || value?.platform === 'web' ? value.platform : 'android';
  return {
    id: String(value?._id || value?.id || value?.deviceId || ''),
    deviceId: String(value?.deviceId || value?._id || value?.id || ''),
    deviceName: String(value?.deviceName || value?.name || 'Unknown device'),
    platform,
    browser: String(value?.browser || ''),
    ipAddress: String(value?.ipAddress || ''),
    trusted: value?.trusted !== false,
    lastLoginAt: String(value?.lastLoginAt || value?.updatedAt || ''),
    createdAt: String(value?.createdAt || ''),
  };
}

export async function getTrustedDevices(): Promise<TrustedDevice[]> {
  const payload = await jsonRequest('/trusted-devices/list', {method: 'GET'});
  const devices = Array.isArray(payload?.data) ? payload.data : [];
  return devices.map(normalizeTrustedDevice).filter((device: TrustedDevice) => Boolean(device.deviceId));
}

export async function registerTrustedDevice(input: RegisterTrustedDeviceInput): Promise<TrustedDevice> {
  const payload = await jsonRequest('/trusted-devices/register', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return normalizeTrustedDevice(payload?.data || {});
}

export async function removeTrustedDevice(deviceId: string): Promise<string> {
  if (!deviceId.trim()) { throw new Error('A device ID is required.'); }
  const payload = await jsonRequest(`/trusted-devices/${encodeURIComponent(deviceId)}`, {method: 'DELETE'});
  return String(payload?.message || 'Trusted device removed successfully.');
}

export async function getBlockedUsers(): Promise<BlockedUser[]> {
  const payload = await jsonRequest('/block/blocked-users', {method: 'GET'});
  const records = payload?.blockedUsers || payload?.data || [];
  if (!Array.isArray(records)) { return []; }
  return records.map((user: any) => ({
    id: String(user?._id || user?.id || ''),
    name: String(user?.name || user?.fullName || 'Chatterly user'),
    email: user?.email ? String(user.email) : undefined,
    phone: user?.phone ? String(user.phone) : undefined,
    profilePic: user?.profilePic ? String(user.profilePic) : undefined,
    status: user?.status ? String(user.status) : undefined,
  })).filter((user: BlockedUser) => Boolean(user.id));
}

export async function unblockUser(blockedUserId: string): Promise<string> {
  const payload = await jsonRequest('/block/unblock', {
    method: 'POST',
    body: JSON.stringify({blockedUserId}),
  });
  return String(payload?.message || 'User unblocked successfully.');
}

export async function reportUser(reportedUserId: string, reason: string, description: string): Promise<string> {
  const reporterId = String(getSession()?.user?.id || '');
  if (!reporterId) { throw new Error('Your session has expired. Please sign in again.'); }
  if (!reportedUserId.trim()) { throw new Error('Enter the user ID you want to report.'); }
  const payload = await jsonRequest('/report/report-user', {
    method: 'POST',
    body: JSON.stringify({
      reporterId,
      reportedUserId: reportedUserId.trim(),
      reason,
      description: description.trim(),
    }),
  });
  return String(payload?.message || 'Report submitted successfully.');
}
