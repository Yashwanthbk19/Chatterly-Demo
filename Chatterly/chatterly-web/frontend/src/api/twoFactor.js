import { requestResult } from './client';

// Story: Sprint 10 | Story 2 — Two-Factor Authentication (2FA).
// Thin wrappers around the backend endpoints mounted at /api/2fa (documented in
// docs/api.md §106-110). Errors are handled inline by the caller (the setup
// modal), so global error toasts are skipped here to avoid duplicated messaging.

// §106 — Enable 2FA. The backend requires a `method` ("sms" | "authenticator");
// omitting it makes req.body undefined under Express 5 and crashes the handler.
export const enableTwoFactor = (method = 'sms') =>
  requestResult(
    {
      method: 'post',
      url: '/api/2fa/enable',
      data: { method },
      skipGlobalError: true,
    },
    {
      fallbackMessage: 'Failed to enable two-factor authentication.',
    }
  );

// §107 — Disable 2FA. No request body.
export const disableTwoFactor = () =>
  requestResult(
    {
      method: 'post',
      url: '/api/2fa/disable',
      skipGlobalError: true,
    },
    {
      fallbackMessage: 'Failed to disable two-factor authentication.',
    }
  );

// §108 — Setup authenticator. Generates a per-user secret server-side and
// returns the QR code (data URL) plus the manual entry key to display.
export const setupAuthenticator = () =>
  requestResult(
    {
      method: 'post',
      url: '/api/2fa/authenticator/setup',
      skipGlobalError: true,
    },
    {
      fallbackMessage: 'Failed to start authenticator setup.',
      transform: (payload) => ({
        qrCode: payload?.qrCode || '',
        manualKey: payload?.manualKey || '',
      }),
    }
  );

// §109 — Verify authenticator. Checks the 6-digit token against the stored
// secret and returns the account's backup (recovery) codes on success.
export const verifyAuthenticator = (token) =>
  requestResult(
    {
      method: 'post',
      url: '/api/2fa/authenticator/verify',
      data: { token: String(token || '') },
      skipGlobalError: true,
    },
    {
      fallbackMessage: 'Failed to verify the authenticator code.',
      transform: (payload) => ({
        backupCodes: Array.isArray(payload?.backupCodes) ? payload.backupCodes : [],
      }),
    }
  );

// §110 — Verify a backup (recovery) code. Consumes one code on success.
// Intended for the sign-in flow when an authenticator is unavailable.
export const verifyBackupCode = (code) =>
  requestResult(
    {
      method: 'post',
      url: '/api/2fa/verify-backup-code',
      data: { code: String(code || '') },
      skipGlobalError: true,
    },
    {
      fallbackMessage: 'Failed to verify the backup code.',
    }
  );

// There is deliberately no code-sending wrapper for SMS. Enrolling the factor is
// the whole of `enableTwoFactor('sms')`: the account's own number is the one that
// gets challenged, and the code itself is only ever sent at sign-in time by the
// login challenge (Firebase phone OTP → POST /api/auth/complete-login-2fa, §130).
// /api/2fa exposes no send-otp/verify-otp route to call from here.
