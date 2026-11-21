import {ApiError} from '../api/client';
import {OTP_LENGTH} from '../constants/otp';
import type {OtpDestination, OtpErrorKind} from '../types/otp';

// Also the paste path: keyboards deliver the whole code in one change event,
// so anything that is not a digit is dropped and the rest is truncated.
export function sanitizeOtpInput(value: string): string {
  return value.replace(/\D/g, '').slice(0, OTP_LENGTH);
}

export function isCompleteOtp(code: string): boolean {
  return code.length === OTP_LENGTH;
}

export function formatCountdown(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * The design writes the cooldown inline - "Resend in 30s" - rather than as a
 * mm:ss clock, so seconds stay bare until the wait is long enough to need a
 * minute. The 30 second cooldown never reaches that, but a backend-imposed
 * wait can.
 */
export function formatResendCountdown(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  if (safeSeconds < 60) { return `${safeSeconds}s`; }
  return formatCountdown(safeSeconds);
}

/**
 * The design prints the destination in full under "Not your Number?", so the
 * user can check it against what they typed before deciding to change it.
 */
export function describeDestination(destination: OtpDestination): string {
  if (destination.channel === 'two-factor-authenticator') { return 'your authenticator app'; }
  return destination.channel === 'phone' || destination.channel === 'two-factor-sms'
    ? `${destination.dialCode}${destination.phone}`
    : destination.email;
}

/** The "Not your Number?" / "Not your Email?" prompt above the destination. */
export function destinationPrompt(destination: OtpDestination): string {
  return destination.channel === 'phone' || destination.channel === 'two-factor-sms'
    ? 'Not your Number?'
    : 'Not your Email?';
}

export function resolveOtpError(error: unknown): OtpErrorKind {
  if (!(error instanceof ApiError)) {
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    const code = typeof error === 'object' && error !== null && 'code' in error
      ? String((error as {code?: unknown}).code).toLowerCase()
      : '';
    if (/too-many-requests|maximum attempts|too many/.test(`${code} ${message}`)) { return 'attempts'; }
    if (/session-expired|code-expired|expired/.test(`${code} ${message}`)) { return 'expired'; }
    if (/invalid-verification-code|invalid verification|incorrect/.test(`${code} ${message}`)) { return 'invalid'; }
    if (/network-request-failed|network|internet|offline/.test(`${code} ${message}`)) { return 'offline'; }
    return 'server';
  }

  // apiRequest leaves status undefined when the request never reached us.
  if (error.status === undefined) {
    return /took too long/i.test(error.message) ? 'server' : 'offline';
  }

  // Message first, then status: the backend raises the attempt limit as a bare
  // Error, so it arrives as an unhandled 500 rather than a 4xx.
  const message = error.message.toLowerCase();
  if (/maximum attempts|too many/.test(message)) { return 'attempts'; }
  // "Invalid or expired OTP." covers both cases, so only a message that
  // mentions expiry on its own is reported as expired.
  if (message.includes('expired') && !message.includes('invalid')) { return 'expired'; }

  if (error.status >= 500) { return 'server'; }
  return 'invalid';
}

export const OTP_ERROR_MESSAGES: Record<OtpErrorKind, string> = {
  invalid: 'That code is incorrect or has expired. Check it and try again.',
  expired: 'This code has expired. Request a new one to continue.',
  attempts: 'Too many incorrect attempts. Request a new code to continue.',
  offline: 'No internet connection. Reconnect and try again.',
  server: 'Something went wrong on our end. Try again in a moment.',
};
