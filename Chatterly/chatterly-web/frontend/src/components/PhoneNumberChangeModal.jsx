import React, { useEffect, useRef, useState } from 'react';
import { signInWithPhoneNumber } from 'firebase/auth';
import { authenticateWithPhone } from '../api/auth';
import { updateProfile } from '../api/contactapi';
import { auth } from '../firebase';
import { normalizePhone, sanitizePhoneDigits, validatePhone } from '../utils/formValidators';
import { clearPhoneRecaptchaVerifier, ensurePhoneRecaptchaVerifier } from '../utils/phoneAuth';

const PHONE_CHANGE_RECAPTCHA_CONTAINER_ID = 'profile-phone-change-recaptcha';
const OTP_LENGTH = 6;

const getUserId = (user = {}) =>
  String(user?._id || user?.id || user?.userId || '').trim();

const getVerificationErrorMessage = (error) => {
  const code = String(error?.code || '');

  if (code.includes('invalid-verification-code')) return 'The OTP is incorrect. Please try again.';
  if (code.includes('code-expired') || code.includes('session-expired')) {
    return 'The OTP has expired. Please request a new code.';
  }
  if (code.includes('too-many-requests')) {
    return 'Too many verification attempts. Please wait and try again.';
  }
  if (code.includes('invalid-phone-number')) return 'Enter a valid Indian phone number.';
  if (code.includes('quota-exceeded')) return 'SMS verification is temporarily unavailable. Please try again later.';

  return error?.message || 'Unable to verify the phone number right now.';
};

const PhoneNumberChangeModal = ({
  isOpen,
  currentPhone = '',
  currentUserId = '',
  onClose,
  onCompleted,
  t = (value) => value,
}) => {
  const confirmationResultRef = useRef(null);
  const phoneInputRef = useRef(null);
  const otpInputRef = useRef(null);
  const isBusyRef = useRef(false);
  const onCloseRef = useRef(onClose);
  const [step, setStep] = useState('confirm');
  const [phoneDigits, setPhoneDigits] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);

  useEffect(() => {
    isBusyRef.current = isBusy;
    onCloseRef.current = onClose;
  }, [isBusy, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    setStep('confirm');
    setPhoneDigits('');
    setOtp('');
    setError('');
    setIsBusy(false);
    setResendSeconds(0);
    confirmationResultRef.current = null;
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || step !== 'otp' || resendSeconds <= 0) return undefined;
    const timeoutId = window.setTimeout(
      () => setResendSeconds((seconds) => Math.max(0, seconds - 1)),
      1000
    );
    return () => window.clearTimeout(timeoutId);
  }, [isOpen, resendSeconds, step]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const handleEscape = (event) => {
      if (event.key === 'Escape' && !isBusyRef.current) onCloseRef.current?.();
    };
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('keydown', handleEscape);
      clearPhoneRecaptchaVerifier({ containerId: PHONE_CHANGE_RECAPTCHA_CONTAINER_ID });
      confirmationResultRef.current = null;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (step === 'phone') phoneInputRef.current?.focus();
    if (step === 'otp') otpInputRef.current?.focus();
  }, [isOpen, step]);

  if (!isOpen) return null;

  const formattedPhone = normalizePhone(phoneDigits);
  const formattedCurrentPhone = normalizePhone(currentPhone);

  const closeModal = () => {
    if (!isBusy) onClose?.();
  };

  const validateNewPhone = () => {
    const validation = validatePhone(phoneDigits);
    if (!validation.valid) {
      setError(validation.error);
      return false;
    }
    if (formattedPhone === formattedCurrentPhone) {
      setError('Enter a phone number different from your current number.');
      return false;
    }
    return true;
  };

  const handlePhoneInputChange = (event) => {
    const rawValue = event.target.value;
    const nextPhoneDigits = sanitizePhoneDigits(rawValue);
    setPhoneDigits(nextPhoneDigits);

    if (!rawValue.trim()) {
      setError('');
      return;
    }

    const validation = validatePhone(rawValue);
    const containsNonNumericInput = /\D/.test(rawValue);
    setError(containsNonNumericInput || nextPhoneDigits.length === 10 ? validation.error : '');
  };

  const handlePhoneInputBlur = () => {
    if (!phoneDigits) return;
    const validation = validatePhone(phoneDigits);
    setError(validation.valid ? '' : validation.error);
  };

  const sendOtp = async () => {
    if (isBusy || !validateNewPhone()) return;

    setIsBusy(true);
    setError('');
    confirmationResultRef.current = null;

    try {
      const verifier = await ensurePhoneRecaptchaVerifier({
        auth,
        containerId: PHONE_CHANGE_RECAPTCHA_CONTAINER_ID,
      });
      confirmationResultRef.current = await signInWithPhoneNumber(auth, formattedPhone, verifier);
      setOtp('');
      setStep('otp');
      setResendSeconds(30);
    } catch (sendError) {
      clearPhoneRecaptchaVerifier({ containerId: PHONE_CHANGE_RECAPTCHA_CONTAINER_ID });
      setError(getVerificationErrorMessage(sendError));
    } finally {
      setIsBusy(false);
    }
  };

  const verifyAndUpdatePhone = async () => {
    if (isBusy) return;
    if (!/^\d{6}$/.test(otp)) {
      setError('Enter the complete 6-digit OTP.');
      return;
    }
    if (!confirmationResultRef.current) {
      setError('Your OTP session expired. Please request a new code.');
      return;
    }

    setIsBusy(true);
    setError('');
    let profileWasUpdated = false;

    try {
      const firebaseCredential = await confirmationResultRef.current.confirm(otp);
      const idToken = await firebaseCredential.user.getIdToken(true);

      // The documented profile endpoint binds the verified number to the
      // currently authenticated Chatterly account. Only after that succeeds
      // can phone-login safely resolve this number to the same account instead
      // of treating it as a new phone-login registration.
      const profileResponse = await updateProfile({ phone: formattedPhone }, { mode: 'update' });
      profileWasUpdated = true;

      const phoneAuthResult = await authenticateWithPhone(idToken, {
        skipAuthRedirect: true,
        skipGlobalError: true,
      });
      const verifiedUserId = phoneAuthResult?.requires2FA
        ? String(phoneAuthResult.twoFactorUserId || '').trim()
        : getUserId(phoneAuthResult?.user);
      const expectedUserId = String(currentUserId || getUserId(profileResponse)).trim();

      if (!expectedUserId || !verifiedUserId || expectedUserId !== verifiedUserId) {
        throw new Error('Phone verification did not resolve to your current account. No change was saved.');
      }
      if (!phoneAuthResult?.requires2FA && !phoneAuthResult?.token) {
        throw new Error('Phone verification could not refresh your session. No change was saved.');
      }

      if (phoneAuthResult.token) {
        localStorage.setItem('token', phoneAuthResult.token);
      }

      await onCompleted?.({
        phone: formattedPhone,
        profileResponse,
        verifiedUser: phoneAuthResult.user || null,
      });
      onClose?.();
    } catch (verificationError) {
      if (profileWasUpdated && formattedCurrentPhone) {
        try {
          await updateProfile({ phone: formattedCurrentPhone }, { mode: 'update' });
        } catch (rollbackError) {
          console.error('Unable to restore the previous phone number:', rollbackError);
          setError('Verification could not finish and the previous number could not be restored. Refresh your profile before trying again.');
          setIsBusy(false);
          return;
        }
      }
      setError(getVerificationErrorMessage(verificationError));
    } finally {
      setIsBusy(false);
    }
  };

  const goBackToPhoneEntry = () => {
    if (isBusy) return;
    clearPhoneRecaptchaVerifier({ containerId: PHONE_CHANGE_RECAPTCHA_CONTAINER_ID });
    confirmationResultRef.current = null;
    setOtp('');
    setError('');
    setResendSeconds(0);
    setStep('phone');
  };

  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-black/40 px-6 py-10"
      role="dialog"
      aria-modal="true"
      aria-labelledby="phone-change-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeModal();
      }}
    >
      <div className="w-full max-w-[470px] rounded-[22px] bg-white p-7 shadow-[0_24px_60px_rgba(15,23,42,0.28)] sm:p-8">
        <div id={PHONE_CHANGE_RECAPTCHA_CONTAINER_ID} />

        <div className="flex items-start justify-between gap-5">
          <div className="min-w-0">
            <h3 id="phone-change-title" className="text-[21px] font-semibold leading-7 text-[#111827]">
              {step === 'confirm'
                ? t('Change phone number?')
                : step === 'phone'
                  ? t('Enter new phone number')
                  : t('Verify phone number')}
            </h3>
            <p className="mt-2 text-[13px] leading-5 text-[#6B7280]">
              {step === 'confirm'
                ? t('Your new phone number must be verified with a one-time SMS code.')
                : step === 'phone'
                  ? t('Enter a valid Indian mobile number. We will send a 6-digit OTP.')
                  : `${t('Enter the 6-digit OTP sent to')} ${formattedPhone}.`}
            </p>
          </div>
          <button
            type="button"
            onClick={closeModal}
            disabled={isBusy}
            aria-label={t('Close')}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-[#6B7280] transition-colors hover:bg-[#F1F5F9] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {step === 'confirm' ? (
          <div className="mt-6 rounded-[12px] border border-[#E5E7EB] bg-[#F8FAFC] px-4 py-3">
            <p className="text-[12px] font-medium text-[#6B7280]">{t('Current phone number')}</p>
            <p className="mt-1 text-[14px] font-semibold text-[#24324A]">{formattedCurrentPhone || t('Not set')}</p>
          </div>
        ) : null}

        {step === 'phone' ? (
          <form className="mt-6" onSubmit={(event) => { event.preventDefault(); void sendOtp(); }}>
            <label htmlFor="new-profile-phone" className="mb-2 block text-[13px] font-semibold text-[#182236]">
              {t('New phone number')}
            </label>
            <div className="flex h-12 items-center rounded-[12px] border border-[#D8E0EB] bg-white focus-within:border-[#8B5CF6]">
              <span className="border-r border-[#E5E7EB] px-3.5 text-[14px] font-semibold text-[#374151]">+91</span>
              <input
                ref={phoneInputRef}
                id="new-profile-phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                maxLength={10}
                value={phoneDigits}
                onChange={handlePhoneInputChange}
                onBlur={handlePhoneInputBlur}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? 'profile-phone-change-error' : undefined}
                placeholder="9876543210"
                className="h-full min-w-0 flex-1 bg-transparent px-3.5 text-[14px] font-medium text-[#24324A] outline-none"
              />
            </div>
          </form>
        ) : null}

        {step === 'otp' ? (
          <div className="mt-6">
            <label htmlFor="profile-phone-otp" className="mb-2 block text-[13px] font-semibold text-[#182236]">
              {t('One-time password')}
            </label>
            <input
              ref={otpInputRef}
              id="profile-phone-otp"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={OTP_LENGTH}
              value={otp}
              onChange={(event) => {
                setOtp(event.target.value.replace(/\D/g, '').slice(0, OTP_LENGTH));
                setError('');
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void verifyAndUpdatePhone();
                }
              }}
              aria-describedby="profile-phone-otp-help"
              className="h-14 w-full rounded-[12px] border border-[#D8E0EB] bg-white px-4 text-center text-[22px] font-semibold tracking-[0.45em] text-[#24324A] outline-none transition-colors focus:border-[#8B5CF6]"
              placeholder="000000"
            />
            <p id="profile-phone-otp-help" className="mt-3 text-center text-[12px] text-[#6B7280]">
              {resendSeconds > 0 ? (
                `${t('Resend OTP in')} ${resendSeconds}s`
              ) : (
                <button type="button" onClick={() => void sendOtp()} disabled={isBusy} className="font-semibold text-[#7C3AED] hover:underline disabled:cursor-not-allowed disabled:opacity-50">
                  {t('Resend OTP')}
                </button>
              )}
            </p>
          </div>
        ) : null}

        {error ? (
          <p id="profile-phone-change-error" className="mt-4 rounded-[10px] border border-red-100 bg-red-50 px-3.5 py-2.5 text-[12px] font-medium leading-5 text-[#EF3333]" role="alert">
            {t(error)}
          </p>
        ) : null}

        <div className="mt-7 flex items-center justify-end gap-3 border-t border-[#EEF1F6] pt-5">
          <button
            type="button"
            onClick={step === 'otp' ? goBackToPhoneEntry : closeModal}
            disabled={isBusy}
            className="h-11 rounded-[10px] px-4 text-[13px] font-semibold text-[#374151] transition-colors hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t(step === 'otp' ? 'Back' : 'Cancel')}
          </button>
          <button
            type="button"
            onClick={() => {
              if (step === 'confirm') {
                setStep('phone');
                setError('');
              } else if (step === 'phone') {
                void sendOtp();
              } else {
                void verifyAndUpdatePhone();
              }
            }}
            disabled={isBusy || (step === 'phone' && phoneDigits.length !== 10) || (step === 'otp' && otp.length !== OTP_LENGTH)}
            className="h-11 rounded-[10px] bg-[#8B5CF6] px-5 text-[13px] font-semibold text-white shadow-[0_8px_18px_rgba(139,92,246,0.22)] transition-colors hover:bg-[#7C3AED] disabled:cursor-not-allowed disabled:bg-[#D7DEE8] disabled:text-[#53657F] disabled:shadow-none"
          >
            {isBusy
              ? t(step === 'otp' ? 'Verifying...' : 'Sending...')
              : t(step === 'confirm' ? 'Continue' : step === 'phone' ? 'Send OTP' : 'Verify & Update')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PhoneNumberChangeModal;
