import {ApiError} from '../src/api/client';
import {
  OTP_ERROR_MESSAGES,
  describeDestination,
  destinationPrompt,
  formatCountdown,
  formatResendCountdown,
  isCompleteOtp,
  resolveOtpError,
  sanitizeOtpInput,
} from '../src/utils/otpValidation';

describe('otp input handling', () => {
  test('keeps digits only and stops at six', () => {
    expect(sanitizeOtpInput('12ab34')).toBe('1234');
    expect(sanitizeOtpInput('123456789')).toBe('123456');
    // A pasted code arrives as one change event.
    expect(sanitizeOtpInput('482 913')).toBe('482913');
  });

  test('reports completeness at six digits', () => {
    expect(isCompleteOtp('12345')).toBe(false);
    expect(isCompleteOtp('123456')).toBe(true);
  });

  test('formats the resend countdown as mm:ss', () => {
    expect(formatCountdown(30)).toBe('00:30');
    expect(formatCountdown(9)).toBe('00:09');
    expect(formatCountdown(0)).toBe('00:00');
    expect(formatCountdown(-4)).toBe('00:00');
    expect(formatCountdown(102)).toBe('01:42');
  });

  // The design writes the cooldown inline: "Resend in 30s".
  test('writes the resend cooldown in bare seconds until it needs a minute', () => {
    expect(formatResendCountdown(30)).toBe('30s');
    expect(formatResendCountdown(9)).toBe('9s');
    expect(formatResendCountdown(0)).toBe('0s');
    expect(formatResendCountdown(-4)).toBe('0s');
    expect(formatResendCountdown(102)).toBe('01:42');
  });
});

describe('otp destination', () => {
  // The design prints it in full under "Not your Number?" so the user can check
  // it against what they typed before deciding to change it.
  test('shows the destination in full so it can be checked', () => {
    expect(describeDestination({channel: 'email', email: 'person@example.com'}))
      .toBe('person@example.com');
    expect(describeDestination({channel: 'phone', dialCode: '+91', phone: '9876543210'}))
      .toBe('+919876543210');
    expect(describeDestination({channel: 'google', email: 'google@example.com'}))
      .toBe('google@example.com');
  });

  test('names the thing being changed in the prompt above it', () => {
    expect(destinationPrompt({channel: 'phone', dialCode: '+91', phone: '9876543210'}))
      .toBe('Not your Number?');
    expect(destinationPrompt({channel: 'email', email: 'person@example.com'}))
      .toBe('Not your Email?');
  });
});

describe('otp error mapping', () => {
  test('separates a lost connection from a slow server', () => {
    expect(resolveOtpError(new ApiError('Cannot connect to Chatterly. Check your internet connection.')))
      .toBe('offline');
    expect(resolveOtpError(new ApiError('The server took too long to respond.'))).toBe('server');
  });

  test('reads the attempt limit even though the backend returns it as a 500', () => {
    expect(resolveOtpError(new ApiError('Maximum attempts reached', 500))).toBe('attempts');
  });

  test('treats the combined invalid-or-expired reply as an incorrect code', () => {
    expect(resolveOtpError(new ApiError('Invalid or expired OTP.', 400))).toBe('invalid');
  });

  test('reports expiry when the message mentions it alone', () => {
    expect(resolveOtpError(new ApiError('This OTP has expired', 400))).toBe('expired');
  });

  test('falls back to a server fault for unexpected failures', () => {
    expect(resolveOtpError(new ApiError('Internal Server Error', 500))).toBe('server');
    expect(resolveOtpError(new Error('boom'))).toBe('server');
  });

  test('maps native Firebase phone verification errors to the OTP states', () => {
    expect(resolveOtpError(Object.assign(new Error('invalid verification code'), {code: 'auth/invalid-verification-code'}))).toBe('invalid');
    expect(resolveOtpError(Object.assign(new Error('session expired'), {code: 'auth/session-expired'}))).toBe('expired');
    expect(resolveOtpError(Object.assign(new Error('network failed'), {code: 'auth/network-request-failed'}))).toBe('offline');
    expect(resolveOtpError(Object.assign(new Error('too many requests'), {code: 'auth/too-many-requests'}))).toBe('attempts');
  });

  test('has copy for every error kind', () => {
    expect(Object.keys(OTP_ERROR_MESSAGES).sort())
      .toEqual(['attempts', 'expired', 'invalid', 'offline', 'server']);
  });
});
