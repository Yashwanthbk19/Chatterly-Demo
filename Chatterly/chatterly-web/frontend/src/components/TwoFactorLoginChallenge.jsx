import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { signInWithPhoneNumber } from 'firebase/auth';
import { auth } from '../firebase';
import { completeLoginTwoFactor } from '../api/auth';
import { getProfile } from '../api/contactapi';
import { clearPhoneRecaptchaVerifier, ensurePhoneRecaptchaVerifier } from '../utils/phoneAuth';
import { clearPendingTwoFactor } from '../utils/twoFactorSession';
import { hasCompletedProfileSetup, persistProfileToStorage } from '../utils/profile';
import { ensurePushNotificationsForUser } from '../utils/pushNotifications';

// Sign-in step-up challenge (docs/api.md §130). Shown over the chat screen when
// a login came back with `requires2FA`, i.e. the account has a second factor and
// this device is not trusted yet.
//
// SMS accounts prove the factor with a fresh Firebase phone OTP — the same
// number the account signs in with — and the backend re-verifies that the
// resulting idToken's phone_number matches the user. Authenticator accounts type
// the code from their app instead. Either way the JWT only exists after this.

const TWO_FACTOR_RECAPTCHA_CONTAINER_ID = 'two-factor-recaptcha-container';
const RESEND_COOLDOWN_SECONDS = 30;

// India is the app's default dialing code (see LoginPage's country list).
const normalizePhoneForFirebase = (value = '') => {
  const trimmed = String(value).trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('+')) return trimmed.replace(/\s+/g, '');

  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return '';
  return `+91${digits.slice(-10)}`;
};

const maskPhone = (value = '') => {
  const digits = String(value).replace(/\D/g, '');
  if (digits.length < 4) return String(value);
  return `••• ••• ${digits.slice(-4)}`;
};

// Firebase and the backend both speak in codes here; neither is readable.
const describeChallengeError = (error) => {
  const code = String(error?.code || '');
  const message = String(error?.message || '');

  if (code.includes('invalid-verification-code') || /invalid-verification-code/.test(message)) {
    return 'That code is not right. Check the message and try again.';
  }
  if (code.includes('code-expired') || /code-expired/.test(message)) {
    return 'That code has expired. Send a new one and try again.';
  }
  if (code.includes('too-many-requests') || /too-many-requests/.test(message)) {
    return 'Too many attempts. Wait a few minutes before requesting another code.';
  }
  if (code.includes('invalid-phone-number') || /invalid-phone-number/.test(message)) {
    return 'That does not look like a valid mobile number.';
  }
  // Project-level configuration, not anything the user did: Firebase refuses
  // accounts:sendVerificationCode outright, so no SMS is sent. Phone sign-in
  // needs the Firebase project on the Blaze plan (or the number registered
  // under Auth â†’ Phone numbers for testing).
  if (code.includes('billing-not-enabled') || /billing-not-enabled/.test(message)) {
    return 'SMS verification is not available on this account yet — text-message sign-in is not enabled for this app. Contact support, or sign in from a device you have already trusted.';
  }
  if (code.includes('operation-not-allowed') || /operation-not-allowed/.test(message)) {
    return 'Phone sign-in is turned off for this app. Contact support to finish setting up SMS verification.';
  }
  if (code.includes('quota-exceeded') || /quota-exceeded/.test(message)) {
    return 'The daily SMS limit for this app has been reached. Please try again later.';
  }
  if (code.includes('captcha-check-failed') || /captcha-check-failed/.test(message)) {
    return 'The security check did not complete. Refresh the page and try again.';
  }
  // The backend answers 401 "Phone verification failed" when the verified number
  // is not the one on the account (authController.completeLogin2FA).
  if (/phone verification failed/i.test(message)) {
    return 'This number is not the one registered on your account. Use the mobile number you sign in with.';
  }
  if (/user not found/i.test(message)) {
    return 'We could not find an account for that number.';
  }

  return message || 'That code did not work. Please try again.';
};

// A blurred stand-in for the chat UI. The real ChatListPage cannot render here —
// there is no token yet, so every request it makes would 401 — but the screen
// behind the challenge still needs to read as the app.
const BlurredChatBackdrop = () => (
  <div className="pointer-events-none absolute inset-0 select-none overflow-hidden blur-[7px]" aria-hidden="true">
    <div className="flex h-full w-full bg-[#F4F6FB]">
      <div className="hidden h-full w-[74px] flex-col items-center gap-6 border-r border-[#E4E9F2] bg-white py-6 md:flex">
        <div className="h-10 w-10 rounded-[14px] bg-[#EDE7FF]" />
        {[0, 1, 2].map((key) => (
          <div key={key} className="h-9 w-9 rounded-[12px] bg-[#F1F5F9]" />
        ))}
      </div>
      <div className="h-full w-full max-w-[360px] border-r border-[#E4E9F2] bg-white p-5">
        <div className="h-9 w-40 rounded-full bg-[#EEF2F7]" />
        <div className="mt-5 h-10 w-full rounded-[14px] bg-[#F4F6FB]" />
        <div className="mt-6 space-y-4">
          {[0, 1, 2, 3, 4, 5].map((key) => (
            <div key={key} className="flex items-center gap-3">
              <div className="h-12 w-12 flex-shrink-0 rounded-full bg-[#EEF2F7]" />
              <div className="min-w-0 flex-1">
                <div className="h-3.5 w-1/2 rounded-full bg-[#EEF2F7]" />
                <div className="mt-2 h-3 w-3/4 rounded-full bg-[#F4F6FB]" />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="hidden h-full flex-1 flex-col bg-[#F7F8FC] p-6 lg:flex">
        <div className="h-12 w-full rounded-[16px] bg-white" />
        <div className="mt-6 flex-1 space-y-4">
          <div className="h-14 w-2/5 rounded-[18px] bg-white" />
          <div className="ml-auto h-16 w-2/5 rounded-[18px] bg-[#E9DDFF]" />
          <div className="h-12 w-1/3 rounded-[18px] bg-white" />
          <div className="ml-auto h-10 w-1/4 rounded-[18px] bg-[#E9DDFF]" />
        </div>
        <div className="h-14 w-full rounded-[18px] bg-white" />
      </div>
    </div>
  </div>
);

export default function TwoFactorLoginChallenge({ pending, onVerified, onCancel }) {
  const isSmsMethod = pending?.method !== 'authenticator';
  const knownPhone = String(pending?.phone || '');

  // SMS with a known number sends the code immediately; without one (email or
  // Google sign-in) the user is asked which number to use first.
  const [step, setStep] = useState(() => {
    if (!isSmsMethod) return 'code';
    return knownPhone ? 'sending' : 'phone';
  });
  const [phoneInput, setPhoneInput] = useState(knownPhone);
  const [activePhone, setActivePhone] = useState(knownPhone);
  const [code, setCode] = useState(Array(6).fill(''));
  const [errorMessage, setErrorMessage] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [trustDevice, setTrustDevice] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  const codeInputRefs = useRef([]);
  const confirmationRef = useRef(null);
  const autoSendStartedRef = useRef(false);

  const joinedCode = useMemo(() => code.join(''), [code]);
  const isCodeComplete = joinedCode.length === 6;

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
      clearPhoneRecaptchaVerifier({ containerId: TWO_FACTOR_RECAPTCHA_CONTAINER_ID });
    };
  }, []);

  useEffect(() => {
    if (resendIn <= 0) return undefined;
    const timer = window.setTimeout(() => setResendIn((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resendIn]);

  const sendSmsCode = useCallback(async (rawPhone) => {
    const phone = normalizePhoneForFirebase(rawPhone);

    if (!phone) {
      setErrorMessage('Enter the phone number on your account.');
      setStep('phone');
      return;
    }

    setIsBusy(true);
    setErrorMessage('');

    try {
      const verifier = await ensurePhoneRecaptchaVerifier({
        auth,
        containerId: TWO_FACTOR_RECAPTCHA_CONTAINER_ID,
      });
      confirmationRef.current = await signInWithPhoneNumber(auth, phone, verifier);
      setActivePhone(phone);
      setCode(Array(6).fill(''));
      setStatusMessage(`We sent a 6-digit code to ${maskPhone(phone)}.`);
      setResendIn(RESEND_COOLDOWN_SECONDS);
      setStep('code');
    } catch (error) {
      clearPhoneRecaptchaVerifier({ containerId: TWO_FACTOR_RECAPTCHA_CONTAINER_ID });
      setErrorMessage(describeChallengeError(error));
      setStep('phone');
    } finally {
      setIsBusy(false);
    }
  }, []);

  // Auto-send once for a phone sign-in, where the number is already known.
  useEffect(() => {
    if (!isSmsMethod || autoSendStartedRef.current || !knownPhone) return;
    autoSendStartedRef.current = true;
    sendSmsCode(knownPhone);
  }, [isSmsMethod, knownPhone, sendSmsCode]);

  const finishSignIn = useCallback(async (result) => {
    if (!result?.token) {
      throw new Error(result?.message || 'Verification failed. Please try again.');
    }

    localStorage.setItem('token', result.token);
    const userData = result.user || {};
    localStorage.setItem('user', JSON.stringify(userData));
    clearPendingTwoFactor();

    let resolvedUser = userData;
    try {
      const profileData = await getProfile();
      resolvedUser = persistProfileToStorage(
        profileData && typeof profileData === 'object' ? { ...userData, ...profileData } : userData
      );
    } catch {
      resolvedUser = persistProfileToStorage(userData);
    }

    const userId = resolvedUser?._id || resolvedUser?.id || resolvedUser?.userId;
    if (userId) {
      // Best effort — a failed FCM registration must not block the sign-in.
      ensurePushNotificationsForUser({ userId, requestPermission: false }).catch(() => {});
    }

    onVerified?.({
      user: resolvedUser,
      isProfileComplete: result.isProfileComplete || hasCompletedProfileSetup(resolvedUser),
    });
  }, [onVerified]);

  const handleVerify = async () => {
    if (!isCodeComplete || isBusy) return;

    setIsBusy(true);
    setErrorMessage('');

    try {
      if (isSmsMethod) {
        if (!confirmationRef.current) {
          throw new Error('This code request expired. Send a new code and try again.');
        }
        // Firebase checks the SMS code; the backend then re-checks that the
        // resulting idToken belongs to the account's own phone number.
        const credential = await confirmationRef.current.confirm(joinedCode);
        const idToken = await credential.user.getIdToken();
        await finishSignIn(
          await completeLoginTwoFactor({ userId: pending.userId, idToken, trustDevice })
        );
        return;
      }

      await finishSignIn(
        await completeLoginTwoFactor({ userId: pending.userId, authOTP: joinedCode, trustDevice })
      );
    } catch (error) {
      setCode(Array(6).fill(''));
      codeInputRefs.current[0]?.focus();
      setErrorMessage(describeChallengeError(error));
    } finally {
      setIsBusy(false);
    }
  };

  const handleCodeChange = (index, value) => {
    const digit = String(value || '').replace(/\D/g, '').slice(-1);
    setErrorMessage('');
    setCode((current) => {
      const next = [...current];
      next[index] = digit;
      return next;
    });
    if (digit && index < 5) codeInputRefs.current[index + 1]?.focus();
  };

  const handleCodeKeyDown = (index, event) => {
    if (event.key === 'Backspace' && !code[index] && index > 0) {
      codeInputRefs.current[index - 1]?.focus();
    }
    if (event.key === 'Enter' && isCodeComplete) handleVerify();
  };

  const handleCodePaste = (event) => {
    const pasted = String(event.clipboardData?.getData('text') || '').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    event.preventDefault();
    setErrorMessage('');
    setCode(Array.from({ length: 6 }, (_, index) => pasted[index] || ''));
    codeInputRefs.current[Math.min(pasted.length, 5)]?.focus();
  };

  const handleCancel = () => {
    clearPhoneRecaptchaVerifier({ containerId: TWO_FACTOR_RECAPTCHA_CONTAINER_ID });
    clearPendingTwoFactor();
    onCancel?.();
  };

  const title = isSmsMethod ? 'Verify it’s you' : 'Enter your authenticator code';
  const subtitle = isSmsMethod
    ? 'Two-step verification is on for this account. Enter the code we texted to your registered number to finish signing in.'
    : 'Two-step verification is on for this account. Open your authenticator app and enter the current 6-digit code.';

  return (
    <div className="chatterly-2fa-challenge fixed inset-0 z-[400] overflow-hidden">
      <BlurredChatBackdrop />
      <div className="absolute inset-0 bg-[rgba(15,23,42,0.35)]" aria-hidden="true" />

      <div className="relative flex h-full w-full items-center justify-center overflow-y-auto px-4 py-8">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="two-factor-challenge-title"
          className="w-full max-w-[430px] rounded-[22px] bg-white p-7 shadow-[0_28px_80px_rgba(15,23,42,0.32)]"
        >
          <div id={TWO_FACTOR_RECAPTCHA_CONTAINER_ID} />

          <span className="flex h-12 w-12 items-center justify-center rounded-[16px] bg-[#F1EBFE] text-[#7C3AED]">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="5" y="10" width="14" height="10" rx="2.5" />
              <path d="M8.5 10V7.5a3.5 3.5 0 0 1 7 0V10" />
              <path d="M12 14v2" />
            </svg>
          </span>

          <h2 id="two-factor-challenge-title" className="mt-4 text-[20px] font-bold leading-7 text-[#0B1220]">
            {title}
          </h2>
          <p className="mt-1.5 text-[13px] font-medium leading-5 text-[#64748B]">{subtitle}</p>

          {step === 'phone' ? (
            <div className="mt-6">
              <label htmlFor="two-factor-phone" className="text-[12px] font-semibold text-[#334155]">
                Mobile number on your account
              </label>
              <p className="mt-1 text-[11px] font-medium leading-4 text-[#94A3B8]">
                Use the number you created the account with — the code can only be sent there.
              </p>
              <input
                id="two-factor-phone"
                type="tel"
                inputMode="tel"
                value={phoneInput}
                onChange={(event) => { setErrorMessage(''); setPhoneInput(event.target.value); }}
                placeholder="+91 98765 43210"
                className="mt-2 h-[46px] w-full rounded-[12px] border border-[#E2E8F0] px-4 text-[14px] text-[#111827] outline-none placeholder:text-[#CBD5E1] focus:border-[#8B5CF6]"
              />
              <button
                type="button"
                onClick={() => sendSmsCode(phoneInput)}
                disabled={isBusy || !phoneInput.trim()}
                className="mt-4 inline-flex h-[46px] w-full items-center justify-center rounded-[12px] bg-[#8B5CF6] text-[14px] font-semibold text-white transition-colors hover:bg-[#7C3AED] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isBusy ? 'Sending…' : 'Send code'}
              </button>
            </div>
          ) : step === 'sending' ? (
            <div className="mt-8 flex flex-col items-center gap-3 py-6">
              <span className="h-9 w-9 animate-spin rounded-full border-[3px] border-[#EDE9FE] border-t-[#8B5CF6]" />
              <p className="text-[13px] font-medium text-[#64748B]">Sending your verification code…</p>
            </div>
          ) : (
            <div className="mt-6">
              {statusMessage ? (
                <p className="text-[12px] font-medium leading-5 text-[#334155]">{statusMessage}</p>
              ) : null}

              <div className="mt-3 flex justify-between gap-2" onPaste={handleCodePaste}>
                {code.map((digit, index) => (
                  <input
                    key={`two-factor-code-${index}`}
                    ref={(element) => { codeInputRefs.current[index] = element; }}
                    type="text"
                    inputMode="numeric"
                    autoComplete={index === 0 ? 'one-time-code' : 'off'}
                    maxLength={1}
                    value={digit}
                    autoFocus={index === 0}
                    onChange={(event) => handleCodeChange(index, event.target.value)}
                    onKeyDown={(event) => handleCodeKeyDown(index, event)}
                    className="h-[52px] w-[52px] rounded-[12px] border-2 border-[#E2E8F0] text-center text-[20px] font-bold text-[#111827] outline-none transition-colors focus:border-[#8B5CF6]"
                  />
                ))}
              </div>

              <label className="mt-5 flex cursor-pointer items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={trustDevice}
                  onChange={(event) => setTrustDevice(event.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-[#CBD5E1] text-[#8B5CF6] focus:ring-[#8B5CF6]"
                />
                <span className="text-[12px] font-medium leading-5 text-[#475569]">
                  Trust this device — skip this step the next time you sign in here.
                </span>
              </label>

              <button
                type="button"
                onClick={handleVerify}
                disabled={!isCodeComplete || isBusy}
                className="mt-5 inline-flex h-[48px] w-full items-center justify-center rounded-[12px] bg-[#8B5CF6] text-[14px] font-semibold text-white transition-colors hover:bg-[#7C3AED] disabled:cursor-not-allowed disabled:bg-[#E9E7F5] disabled:text-[#A5B0C2]"
              >
                {isBusy ? 'Verifying…' : 'Verify and continue'}
              </button>

              {isSmsMethod ? (
                <p className="mt-3 text-center text-[12px] font-medium text-[#64748B]">
                  Didn&apos;t get the code?{' '}
                  <button
                    type="button"
                    onClick={() => sendSmsCode(activePhone || phoneInput)}
                    disabled={isBusy || resendIn > 0}
                    className="font-semibold text-[#8B5CF6] disabled:cursor-not-allowed disabled:text-[#A5B0C2]"
                  >
                    {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
                  </button>
                </p>
              ) : null}
            </div>
          )}

          {errorMessage ? (
            <p role="alert" className="mt-4 rounded-[10px] bg-[#FEF2F2] px-3 py-2 text-[12px] font-medium leading-5 text-[#DC2626]">
              {errorMessage}
            </p>
          ) : null}

          <button
            type="button"
            onClick={handleCancel}
            className="mt-5 w-full text-center text-[12px] font-semibold text-[#64748B] transition-colors hover:text-[#111827]"
          >
            Cancel and sign in with a different account
          </button>
        </div>
      </div>
    </div>
  );
}
