import {apiRequest} from '../api/client';
import {API_BASE_URL} from '../config/api';
import type {AuthOutcome} from '../types/auth';
import {normalizeAuthResponse} from '../utils/authResponse';
import {getDeviceId, getDeviceIdentity} from '../utils/deviceIdentity';

export async function checkAuthService(): Promise<void> {
  await apiRequest(`${API_BASE_URL}/health`, {
    method: 'GET',
    headers: {Accept: 'application/json, text/plain'},
  });
}

const JSON_HEADERS = {'Content-Type': 'application/json', Accept: 'application/json'};

async function postJson(path: string, body: unknown): Promise<Record<string, unknown>> {
  const response = await apiRequest(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
  return response.json() as Promise<Record<string, unknown>>;
}

type MessageResponse = {message?: string};

export async function sendEmailOtp(email: string): Promise<string> {
  const payload = await postJson('/auth/send-email-otp', {email}) as MessageResponse;
  return payload.message || 'OTP sent to email';
}

export async function resendEmailOtp(email: string): Promise<string> {
  const payload = await postJson('/auth/resend-email-otp', {email}) as MessageResponse;
  return payload.message || 'A new code is on its way';
}

// The web sends only deviceId alongside email and otp: verifyOtpSchema is a
// strict Joi object and deviceId is the field handleTrustedDeviceLogin reads.
export async function verifyEmailOtp(email: string, otp: string): Promise<AuthOutcome> {
  const identity = await getDeviceIdentity();
  const payload = await postJson('/auth/verify-email-otp', {
    email,
    otp,
    deviceId: identity.deviceId,
    deviceName: identity.deviceName,
    platform: identity.platform,
  });
  return normalizeAuthResponse(payload);
}

// Takes the Firebase ID token from firebaseAuth.signInWithGoogle().
export async function googleLogin(idToken: string): Promise<AuthOutcome> {
  // Match the live web client and controller contract. `deviceId` also lets
  // the backend recognise a trusted device when account 2FA is enabled.
  const payload = await postJson('/auth/google-login', {idToken, deviceId: await getDeviceId()});
  return normalizeAuthResponse(payload);
}

// Takes the Firebase ID token from firebaseAuth.confirmPhoneCode().
export async function phoneLogin(idToken: string): Promise<AuthOutcome> {
  const payload = await postJson('/auth/phone-login', {idToken, deviceId: await getDeviceId()});
  return normalizeAuthResponse(payload);
}

export async function completeLoginTwoFactor(
  userId: string,
  proof: {authOTP: string} | {idToken: string},
): Promise<AuthOutcome> {
  const identity = await getDeviceIdentity();
  const payload = await postJson('/auth/complete-login-2fa', {
    userId,
    ...proof,
    trustDevice: false,
    deviceId: identity.deviceId,
    deviceName: identity.deviceName,
    platform: identity.platform,
    browser: identity.browser,
  });
  return normalizeAuthResponse(payload);
}

/** Revokes the current device session before its local encrypted copy is removed. */
export async function logoutSession(token: string): Promise<void> {
  if (!token) { return; }
  await apiRequest(`${API_BASE_URL}/auth/logout`, {
    method: 'POST',
    headers: {Accept: 'application/json', Authorization: `Bearer ${token}`},
  });
}
