// Device identity for the trusted-device half of the 2FA login contract
// (docs/api.md §130 — `POST /api/auth/complete-login-2fa` takes deviceId,
// deviceName, platform and browser, and rejects a `trustDevice: true` request
// that omits any of them).
//
// The same `deviceId` is sent on every login call: the backend's
// handleTrustedDeviceLogin() looks it up and skips the second factor when the
// device was trusted before, so it must stay stable for this browser profile.

const DEVICE_ID_STORAGE_KEY = 'chatterly_device_id';

const createDeviceId = () => {
  const cryptoRef = globalThis.crypto;
  if (typeof cryptoRef?.randomUUID === 'function') {
    return cryptoRef.randomUUID();
  }
  return `device-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

export const getDeviceId = () => {
  try {
    const stored = String(localStorage.getItem(DEVICE_ID_STORAGE_KEY) || '').trim();
    if (stored) return stored;

    const deviceId = createDeviceId();
    localStorage.setItem(DEVICE_ID_STORAGE_KEY, deviceId);
    return deviceId;
  } catch (error) {
    // Private mode / blocked storage: still send a usable id for this page life,
    // it just won't be recognised as trusted on the next login.
    return createDeviceId();
  }
};

export const detectBrowserName = (userAgent = navigator.userAgent || '') => {
  if (/Edg\//i.test(userAgent)) return 'Edge';
  if (/OPR\/|Opera/i.test(userAgent)) return 'Opera';
  if (/Firefox\//i.test(userAgent)) return 'Firefox';
  if (/Chrome\//i.test(userAgent)) return 'Chrome';
  if (/Safari\//i.test(userAgent)) return 'Safari';
  return 'Browser';
};

// Human-readable OS, for the device name the user sees in Trusted Devices.
export const detectOsName = (userAgent = navigator.userAgent || '') => {
  if (/Android/i.test(userAgent)) return 'Android';
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'iOS';
  if (/Windows/i.test(userAgent)) return 'Windows';
  if (/Mac OS X|Macintosh/i.test(userAgent)) return 'macOS';
  if (/Linux/i.test(userAgent)) return 'Linux';
  return 'Web';
};

// The API value. completeLogin2FASchema (and verifyOtpSchema) pin `platform` to
// Joi.valid("android", "ios", "web") and Joi rejects anything else with a 400,
// so a desktop OS has to be reported as "web" — the readable name lives in
// deviceName instead.
export const detectPlatform = (userAgent = navigator.userAgent || '') => {
  if (/Android/i.test(userAgent)) return 'android';
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'ios';
  return 'web';
};

export const getDeviceIdentity = () => ({
  deviceId: getDeviceId(),
  deviceName: `${detectBrowserName()} on ${detectOsName()}`,
  platform: detectPlatform(),
  browser: detectBrowserName(),
});
