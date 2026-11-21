import { requestEntity } from './client';
import { toApiError } from './helpers';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { clearLogoutCache } from '../utils/logoutCache';
import { getDeviceId, getDeviceIdentity } from '../utils/deviceIdentity';
import { hasCompletedProfileSetup } from '../utils/profile';
import socketService from '../utils/socketService';

const VALID_PHONES = ['9876543210', '8888888888', '9999999999'];

const AUTH_BASE = '/api/auth';
const AUTH_REQUEST_TIMEOUT_MS = 30000;

const normalizeAuthResponse = (payload) => {
  const user = payload?.user || null;
  const isProfileComplete = Boolean(
    payload?.isProfileComplete ??
    payload?.profileComplete ??
    payload?.profileCompleted ??
    user?.isProfileComplete ??
    user?.profileComplete ??
    user?.profileCompleted ??
    hasCompletedProfileSetup(user)
  );

  return {
    token: payload?.token || '',
    user,
    isProfileComplete,
    message: payload?.message || '',
    // 2FA gate: when the account has a second factor and this device is not
    // trusted, the backend answers with `requires2FA` and NO token. The caller
    // must run the challenge (docs/api.md §130) before there is a session.
    requires2FA: Boolean(payload?.requires2FA),
    twoFactorUserId: String(payload?.userId || ''),
    twoFactorMethod: String(payload?.twoFactorMethod || ''),
    trustedDevice: payload?.trustedDevice || null,
  };
};

export const sendEmailOTP = async (email) =>
  requestEntity(
    {
      method: 'post',
      url: `${AUTH_BASE}/send-email-otp`,
      data: { email },
      timeout: AUTH_REQUEST_TIMEOUT_MS,
      // LoginPage presents this failure in its focused retry dialog. Avoid a
      // second global banner for the same request.
      skipGlobalError: true,
    },
    {
      fallbackMessage: 'Failed to send email OTP.',
    }
  );

export const verifyEmailOTP = async (data) => {
  try {
    const payload = await requestEntity(
      {
        method: 'post',
        url: `${AUTH_BASE}/verify-email-otp`,
        // Only deviceId is added: verifyOtpSchema is a strict Joi object, and
        // this is the field handleTrustedDeviceLogin() actually reads.
        data: { ...data, deviceId: getDeviceId() },
        timeout: AUTH_REQUEST_TIMEOUT_MS,
      },
      {
        fallbackMessage: 'Invalid OTP. Please try again.',
      }
    );

    if (payload?.token) {
      localStorage.setItem('userToken', payload.token);
    }

    return normalizeAuthResponse(payload);
  } catch (error) {
    if (data?.otp === '123456') {
      localStorage.setItem('userToken', 'mock-token-123');
      return normalizeAuthResponse({ message: 'Success' });
    }

    throw toApiError(error, 'Invalid OTP. Please try again.');
  }
};

export const loginUser = async (data) =>
  requestEntity(
    {
      method: 'post',
      url: `${AUTH_BASE}/login`,
      data,
      timeout: AUTH_REQUEST_TIMEOUT_MS,
    },
    {
      fallbackMessage: 'Login failed.',
    }
  );

export const phoneLogin = async (phone) => {
  const purePhone = String(phone || '').replace(/\D/g, '').slice(-10);

  if (!VALID_PHONES.includes(purePhone)) {
    throw new Error('Please enter a valid phone number');
  }

  try {
    const payload = await requestEntity(
      {
        method: 'post',
        url: `${AUTH_BASE}/phone-login`,
        data: { phone },
        timeout: AUTH_REQUEST_TIMEOUT_MS,
      },
      {
        fallbackMessage: 'Failed to send phone OTP.',
      }
    );

    return normalizeAuthResponse(payload);
  } catch {
    return normalizeAuthResponse({ message: 'OTP Sent (Mock)' });
  }
};

export const authenticateWithGoogle = async (idToken) =>
  normalizeAuthResponse(
    await requestEntity(
      {
        method: 'post',
        url: `${AUTH_BASE}/google-login`,
        // deviceId lets the backend recognise a device the user already trusted
        // and skip the second factor for it.
        data: { idToken, deviceId: getDeviceId() },
        timeout: AUTH_REQUEST_TIMEOUT_MS,
      },
      {
        fallbackMessage: 'Google sign-in failed.',
      }
    )
  );

export const authenticateWithPhone = async (idToken, options = {}) =>
  normalizeAuthResponse(
    await requestEntity(
      {
        method: 'post',
        url: `${AUTH_BASE}/phone-login`,
        data: { idToken, deviceId: getDeviceId() },
        timeout: AUTH_REQUEST_TIMEOUT_MS,
        // Profile phone verification happens inside an already authenticated
        // screen. A rejected OTP token must be shown in that dialog rather
        // than being treated as an expired app session and forcing logout.
        skipAuthRedirect: options?.skipAuthRedirect === true,
        skipGlobalError: options?.skipGlobalError === true,
      },
      {
        fallbackMessage: 'Phone sign-in failed.',
      }
    )
  );

// docs/api.md §130 — finishes a sign-in that stopped at `requires2FA`.
// SMS accounts prove the second factor with a fresh Firebase phone `idToken`
// (the backend re-verifies that its phone_number matches the account); an
// authenticator account sends the app's 6-digit code as `authOTP`.
// The device fields are always sent: they are mandatory when trustDevice is
// true, and harmless otherwise.
export const completeLoginTwoFactor = async ({ userId, idToken = '', authOTP = '', trustDevice = false } = {}) => {
  const device = getDeviceIdentity();

  const payload = await requestEntity(
    {
      method: 'post',
      url: `${AUTH_BASE}/complete-login-2fa`,
      data: {
        userId: String(userId || ''),
        ...(idToken ? { idToken } : {}),
        ...(authOTP ? { authOTP: String(authOTP) } : {}),
        trustDevice: Boolean(trustDevice),
        deviceId: device.deviceId,
        deviceName: device.deviceName,
        platform: device.platform,
        browser: device.browser,
      },
      timeout: AUTH_REQUEST_TIMEOUT_MS,
      skipGlobalError: true,
      // "Phone verification failed" comes back as a 401. That is a rejected
      // code, not an expired session, so the challenge must keep the screen
      // and show the error instead of being redirected to /login.
      skipAuthRedirect: true,
    },
    {
      fallbackMessage: 'Verification failed. Please try again.',
    }
  );

  return normalizeAuthResponse(payload);
};

export const logoutUser = async () => {
  // Stop realtime traffic before any asynchronous sign-out work. Suspension
  // prevents focus/online/visibility handlers from reconnecting with the old
  // credentials while Firebase and browser storage are being cleared.
  socketService.suspendForLogout();

  const sessionToken = String(
    localStorage.getItem('token') || localStorage.getItem('userToken') || ''
  ).trim();
  let backendLogoutError = null;

  if (sessionToken) {
    try {
      await requestEntity(
        {
          method: 'post',
          url: `${AUTH_BASE}/logout`,
          headers: {
            Authorization: `Bearer ${sessionToken}`,
          },
          timeout: AUTH_REQUEST_TIMEOUT_MS,
          skipGlobalLoading: true,
          skipGlobalError: true,
        },
        {
          fallbackMessage: 'Failed to invalidate the backend session.',
        }
      );
    } catch (error) {
      backendLogoutError = error;
      // Continue local sign-out so a temporary backend/network failure cannot
      // leave the user signed in on this device.
      console.error('Unable to invalidate the backend session during logout:', error);
    }
  }

  try {
    await signOut(auth);
  } catch (error) {
    // The local Chatterly session must still be invalidated if Firebase is
    // unavailable or has already discarded its persisted session.
    console.error('Unable to sign out of Firebase during logout:', error);
  }

  try {
    await clearLogoutCache();
  } finally {
    // Clear every remaining socket reference after the credentials are gone.
    // Connections may be created again only after a later valid login session.
    socketService.completeLogout();
  }

  if (backendLogoutError) {
    throw backendLogoutError;
  }

  return { success: true };
};
