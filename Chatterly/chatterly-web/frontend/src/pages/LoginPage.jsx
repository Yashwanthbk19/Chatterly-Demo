import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Logo from '../components/Logo';
import { authenticateWithGoogle, sendEmailOTP } from '../api/auth';
import { getProfile } from '../api/contactapi';
import { signInWithPhoneNumber, signInWithPopup, GoogleAuthProvider } from "firebase/auth";
import { auth } from "../firebase";
import { clearPhoneRecaptchaVerifier, ensurePhoneRecaptchaVerifier } from '../utils/phoneAuth';
import { hasCompletedProfileSetup, persistProfileToStorage } from '../utils/profile';
import { savePendingTwoFactor } from '../utils/twoFactorSession';
import { ensureBrowserNotificationPermission } from '../utils/pushNotifications';
import { consumeSessionExpiredNotice, touchSessionActivity } from '../utils/sessionExpiry';

import loginBrandingImg from '../assets/login_branding.png'; 

const LOGIN_RECAPTCHA_CONTAINER_ID = 'recaptcha-container';
const DEFAULT_ERROR_POPUP_STATE = Object.freeze({
  show: false,
  title: 'Sign In Failed',
  subtitle: 'Unable to complete sign in',
  message: '',
  actionLabel: 'Try Again',
  nextStep: '',
});

const getPhoneSignInErrorDetails = (error) => {
  const code = String(error?.code || '');
  const message = String(error?.message || '');

  if (code.includes('billing-not-enabled') || /billing-not-enabled/.test(message)) {
    return {
      title: 'Phone Sign-In Unavailable',
      subtitle: 'SMS OTP cannot be sent',
      message: 'Firebase SMS phone authentication needs billing enabled, or the number must be added as a Firebase test phone number.',
      actionLabel: 'Use Email Instead',
      nextStep: 'email_entry',
    };
  }
  if (code.includes('operation-not-allowed') || /operation-not-allowed/.test(message)) {
    return {
      title: 'Phone Sign-In Unavailable',
      subtitle: 'SMS OTP cannot be sent',
      message: 'Phone sign-in is turned off for this app. Enable the Phone provider in Firebase Authentication.',
    };
  }
  if (code.includes('quota-exceeded') || /quota-exceeded/.test(message)) {
    return {
      title: 'SMS Limit Reached',
      subtitle: 'Unable to send OTP',
      message: 'The SMS limit for this app has been reached. Please try again later.',
    };
  }
  if (code.includes('invalid-phone-number') || /invalid-phone-number/.test(message)) {
    return {
      title: 'Invalid Phone Number',
      subtitle: 'Unable to send OTP',
      message: 'Please enter a valid phone number for the selected country.',
    };
  }

  return {
    title: 'Sign In Failed',
    subtitle: 'Unable to complete sign in',
    message: message || 'Something went wrong. Please try again.',
  };
};

const getEmailSignInErrorDetails = (error) => {
  const status = Number(error?.status || 0);
  const code = String(error?.code || '');
  const message = String(error?.message || '');
  const isServiceUnavailable =
    !status ||
    [502, 503, 504].includes(status) ||
    code === 'ERR_NETWORK' ||
    /network error|failed to fetch|load failed/i.test(message);

  if (isServiceUnavailable) {
    return {
      title: 'Email OTP Unavailable',
      subtitle: 'Unable to send security code',
      message: 'The email service could not be reached. Please check your connection and try again.',
    };
  }

  return {
    title: 'Unable to Send OTP',
    subtitle: 'Security code was not sent',
    message: message || 'Unable to send the security code. Please try again.',
  };
};

export default function LoginPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState('method_select');
  const [loadingText, setLoadingText] = useState('');
  const [error, setError] = useState(''); 
  
  const [authMethod, setAuthMethod] = useState('phone');
  const [countryCode, setCountryCode] = useState('+91');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [email, setEmail] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [errorPopup, setErrorPopup] = useState(DEFAULT_ERROR_POPUP_STATE);
  const [sessionExpiredMessage] = useState(() => consumeSessionExpiredNotice());

  const closeErrorPopup = () => {
    setErrorPopup(DEFAULT_ERROR_POPUP_STATE);
  };

  useEffect(() => () => {
    clearPhoneRecaptchaVerifier({
      containerId: LOGIN_RECAPTCHA_CONTAINER_ID,
      preserveConfirmationResult: true,
    });
  }, []);

  const countries = [
    { code: '+91', flag: '🇮🇳', name: 'India', length: [10], maxLength: 10 },
    { code: '+1', flag: '🇺🇸', name: 'USA', length: [10], maxLength: 10 },
    { code: '+44', flag: '🇬🇧', name: 'UK', length: [11], maxLength: 11 }, 
    { code: '+61', flag: '🇦🇺', name: 'Australia', length: [9], maxLength: 9 },
    { code: '+81', flag: '🇯🇵', name: 'Japan', length: [10, 11], maxLength: 11 }, 
  ];

  const selectedCountry = countries.find(c => c.code === countryCode);
  
  const emailRegex = /^[0-9._%+-]*[a-z][a-z0-9._%+-]*@[a-z0-9.-]+\.[a-z]{3,}$/;

  const getPhoneValidationMessage = (value = '') => {
    if (!value || !selectedCountry) return '';
    if (!selectedCountry.length.includes(value.length)) {
      return `Phone number must be ${selectedCountry.length.join(' or ')} digits.`;
    }
    if (countryCode === '+91' && !['6', '7', '8', '9'].includes(value[0])) {
      return 'Invalid phone number. Indian numbers must start with 6, 7, 8, or 9.';
    }
    return '';
  };
  
  const checkPhoneValidity = () => {
    return Boolean(phoneNumber) && Boolean(selectedCountry) && !getPhoneValidationMessage(phoneNumber);
  };

  const isPhoneValid = checkPhoneValidity();
  const isEmailValid = emailRegex.test(email);

  const sanitizePhoneInput = (value = '') =>
    value.replace(/\D/g, '').slice(0, selectedCountry?.maxLength || 10);

  const handleMethodSelect = (method) => {
    setError('');
    setAuthMethod(method);
    setStep('loading');
    setLoadingText('');
    setTimeout(() => {
      setStep(method === 'phone' ? 'phone_entry' : 'email_entry');
    }, 1750);
  };

  const handleSendOtp = async () => {
    if (authMethod === 'phone') {
      const phoneValidationMessage = getPhoneValidationMessage(phoneNumber);
      setPhoneError(phoneValidationMessage);
      if (phoneValidationMessage) {
        return;
      }
    }

    const isValid = authMethod === 'phone' ? isPhoneValid : isEmailValid;
    
    if (isValid) {
      setStep('loading');
      setLoadingText('Sending OTP');
      
      try {
        if (authMethod === 'phone') {
          const phone = countryCode + phoneNumber;
          const recaptchaVerifier = await ensurePhoneRecaptchaVerifier({
            auth,
            containerId: LOGIN_RECAPTCHA_CONTAINER_ID,
          });

          const confirmationResult = await signInWithPhoneNumber(
            auth,
            phone,
            recaptchaVerifier
          );
          window.confirmationResult = confirmationResult;

        } else {
          await sendEmailOTP(email.trim());
        }

        navigate('/otp', { 
          state: { 
            authMethod, 
            contactValue: authMethod === 'phone' ? phoneNumber : email.trim(),
            countryCode
          } 
        });
      } catch (err) {
        clearPhoneRecaptchaVerifier({ containerId: LOGIN_RECAPTCHA_CONTAINER_ID });
        const signInErrorDetails = authMethod === 'phone'
          ? getPhoneSignInErrorDetails(err)
          : getEmailSignInErrorDetails(err);
        setErrorPopup({
          show: true,
          title: signInErrorDetails.title,
          subtitle: signInErrorDetails.subtitle,
          message: signInErrorDetails.message,
          actionLabel: signInErrorDetails.actionLabel || 'Try Again',
          nextStep: signInErrorDetails.nextStep || '',
        });
        setStep(authMethod === 'phone' ? 'phone_entry' : 'email_entry');
      }
    }
  };

  const handlePhoneInput = (e) => {
    setError('');
    const numericValue = sanitizePhoneInput(e.target.value);
    setPhoneNumber(numericValue);
    setPhoneError(getPhoneValidationMessage(numericValue));
  };

  const handleGoogleLogin = async () => {
    void ensureBrowserNotificationPermission({
      requestPermission: true,
      forceRequest: true,
    });
    try {
      setStep('loading');
      setLoadingText('Connecting to Google...');
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const idToken = await result.user.getIdToken();
      const data = await authenticateWithGoogle(idToken);

      // Account has 2FA and this device isn't trusted — no token yet; the chat
      // route's gate runs the step-up challenge (docs/api.md §130).
      if (data?.requires2FA) {
        savePendingTwoFactor({
          userId: data.twoFactorUserId,
          method: data.twoFactorMethod,
        });
        navigate('/chats', { replace: true });
        return;
      }

      if (data && data.token) {
        localStorage.setItem("token", data.token);
        touchSessionActivity();
        const userData = data.user || data;
        localStorage.setItem("user", JSON.stringify(userData));

        let resolvedUser = userData;

        try {
          const profileData = await getProfile();
          resolvedUser = persistProfileToStorage(
            profileData && typeof profileData === 'object'
              ? { ...userData, ...profileData }
              : userData
          );
        } catch (profileError) {
          console.error('Failed to hydrate authenticated profile:', profileError);
          resolvedUser = persistProfileToStorage(userData);
        }

        const hasFinishedProfileSetup =
          data.isProfileComplete === true ||
          String(data.isProfileComplete) === 'true' ||
          hasCompletedProfileSetup(resolvedUser);

        if (hasFinishedProfileSetup) {
          navigate("/chats");
        } else {
          navigate("/create-profile");
        }
      } else {
        alert("Login failed");
      }
    } catch (err) {
      setErrorPopup({
        show: true,
        title: 'Google Sign-In Failed',
        subtitle: 'Unable to connect to Google',
        message: err.message || 'Google sign-in failed. Please try again.',
        actionLabel: 'Try Again',
        nextStep: '',
      });
      setStep('method_select');
    }
  };

  return (
    <>
      <div className="chatterly-auth-shell min-h-screen bg-[#F8F9FB] flex items-center justify-center p-4 md:p-8 font-sans">
        <style>{`
          @keyframes expandCard { 0% { transform: scaleX(0.9) scaleY(0.95); opacity: 0; } 100% { transform: scaleX(1) scaleY(1); opacity: 1; } }
          @keyframes slideFromCenterLeft { 0% { transform: translateX(30%); opacity: 0; } 100% { transform: translateX(0); opacity: 1; } }
          @keyframes slideFromCenterRight { 0% { transform: translateX(-30%); opacity: 0; } 100% { transform: translateX(0); opacity: 1; } }
          .animate-expand-card { animation: expandCard 0.8s cubic-bezier(0.22, 1, 0.36, 1) forwards; }
          .animate-slide-left { animation: slideFromCenterLeft 0.8s cubic-bezier(0.22, 1, 0.36, 1) forwards; }
          .animate-slide-right { animation: slideFromCenterRight 0.8s cubic-bezier(0.22, 1, 0.36, 1) forwards; }
        `}</style>

        <div className="max-w-[1024px] w-full bg-white rounded-[32px] shadow-[0_8px_30px_rgba(0,0,0,0.04)] flex overflow-hidden min-h-[640px] animate-expand-card relative">
          <div className="login-hero hidden lg:flex w-1/2 p-12 flex-col justify-between relative overflow-hidden animate-slide-left">
            <div className="login-hero__decor absolute -top-24 -right-16 w-72 h-72 bg-[#8B5CF6] rounded-full blur-[120px] opacity-40"></div>
            <div className="login-hero__decor absolute -bottom-28 -left-20 w-80 h-80 bg-[#4C6EF5] rounded-full blur-[130px] opacity-30"></div>
            <div className="login-hero__decor absolute inset-0 opacity-[0.06] bg-[linear-gradient(rgba(255,255,255,0.5)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.5)_1px,transparent_1px)] bg-[size:34px_34px]"></div>
            <div className="z-10">
              {/* The brand mark stays clickable but out of the tab order, so the
                  first Tab lands on "Continue with phone number", not the logo. */}
              <div className="login-hero__logo mb-12"><Link to="/" tabIndex={-1} aria-label="Chatterly home"><Logo /></Link></div>
              <h1 className="login-hero__title text-4xl font-bold leading-tight mb-4">Stay close to the<br/>people who matter</h1>
              <div className="login-hero__badge flex items-center gap-2 text-sm font-medium backdrop-blur-sm w-fit px-3 py-1.5 rounded-full mb-8">
                <span>🔒</span> Secure conversations. Private by default.
              </div>
              <p className="login-hero__text leading-relaxed max-w-[320px]">Chat, share updates, and make calls with friends, teams, and communities — all in one place.</p>
            </div>
            <div className="relative z-10 w-full flex-1 flex items-center justify-center p-6">
              <img src={loginBrandingImg} alt="People connecting on Chatterly" className="login-hero__img w-full h-full object-contain" />
            </div>
          </div>

          <div className="w-full lg:w-1/2 p-8 md:p-16 flex flex-col justify-center relative animate-slide-right">
            <div id={LOGIN_RECAPTCHA_CONTAINER_ID}></div>
            {step === 'loading' && (
              <div className="absolute inset-0 bg-white z-50 flex flex-col items-center justify-center rounded-r-[32px]">
                <div className="w-10 h-10 border-4 border-gray-100 border-t-[#4C6EF5] rounded-full animate-spin mb-4"></div>
                {loadingText && <p className="text-[#71767A] font-medium">{loadingText}</p>}
              </div>
            )}

            {step === 'method_select' && (
              <div className="animate-fade-in relative z-10">
                <div className="lg:hidden mb-8 flex justify-center"><Logo /></div>
                <h2 className="text-[32px] font-bold text-[#212529] mb-3">Start chatting in seconds</h2>
                {sessionExpiredMessage && (
                  <p role="alert" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
                    {sessionExpiredMessage}
                  </p>
                )}
                <div className="space-y-4">
                  <button onClick={() => handleMethodSelect('phone')} className="w-full bg-[#4C6EF5] text-white font-bold py-4 px-6 rounded-2xl hover:bg-[#3b5bdb] transition-colors flex items-center justify-center gap-2 relative z-10">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                    Continue with phone number
                  </button>
                  <div className="flex items-center gap-4 my-6">
                    <div className="flex-1 h-px bg-gray-200"></div>
                    <span className="text-sm text-[#71767A] font-medium">or continue with</span>
                    <div className="flex-1 h-px bg-gray-200"></div>
                  </div>
                  <button onClick={() => handleMethodSelect('email')} className="w-full bg-white border border-gray-200 text-[#212529] font-bold py-4 px-6 rounded-2xl hover:bg-gray-50 transition-colors flex items-center justify-between group relative z-10">
                    <div className="flex items-center gap-3">
                      <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg> Email
                    </div>
                    <span className="text-gray-400 group-hover:translate-x-1 transition-transform">→</span>
                  </button>
                  <button onClick={handleGoogleLogin} className="w-full bg-white border border-gray-200 text-[#212529] font-bold py-4 px-6 rounded-2xl hover:bg-gray-50 transition-colors flex items-center justify-between group relative z-10">
                    <div className="flex items-center gap-3">
                      <svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" /><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" /><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" /><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" /></svg> Google
                    </div>
                    <span className="text-gray-400 group-hover:translate-x-1 transition-transform">→</span>
                  </button>
                </div>
              </div>
            )}

            {step === 'phone_entry' && (
              <div className="animate-fade-in flex flex-col">
                <button onClick={() => { setStep('method_select'); setPhoneError(''); }} className="w-fit p-2 -ml-2 mb-4 text-gray-400 hover:text-[#212529] transition-colors relative z-10">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                </button>
                <h2 className="text-[32px] font-bold text-[#212529] mb-3">Enter your phone number</h2>
                <div className="space-y-4 mb-auto">
                  <div className="border border-gray-200 rounded-xl px-4 py-3 flex items-center justify-between relative bg-white">
                    <select className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" value={countryCode} onChange={(e) => {setCountryCode(e.target.value); setPhoneNumber(''); setPhoneError('');}}>
                      {countries.map((c) => <option key={c.code} value={c.code}>{c.name} ({c.code})</option>)}
                    </select>
                    <div className="flex items-center gap-2 font-medium text-[#212529] pointer-events-none">
                      <span>{selectedCountry?.flag}</span><span>{selectedCountry?.name} ({selectedCountry?.code})</span>
                    </div>
                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </div>
                  <input type="tel" placeholder="Enter your Phone number" maxLength={selectedCountry?.maxLength || 10} value={phoneNumber} onChange={handlePhoneInput} onBlur={(e) => setPhoneError(getPhoneValidationMessage(sanitizePhoneInput(e.target.value)))} className={`w-full border rounded-xl px-4 py-4 text-[#212529] font-medium outline-none focus:ring-1 transition-all ${phoneError ? 'border-red-400 focus:border-red-400 focus:ring-red-200' : 'border-gray-200 focus:border-[#4C6EF5]'}`} />
                  {phoneError && (
                    <div className="flex items-center gap-2 mt-1 text-red-500 text-sm">
                      <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                      <span>{phoneError}</span>
                    </div>
                  )}
                </div>
                <div className="mt-8">
                  <button onClick={handleSendOtp} disabled={!isPhoneValid} className={`w-full font-bold py-4 px-6 rounded-2xl transition-all ${isPhoneValid ? 'bg-[#4C6EF5] text-white hover:bg-[#3b5bdb]' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}>Send OTP</button>
                </div>
              </div>
            )}

            {step === 'email_entry' && (
              <div className="animate-fade-in flex flex-col">
                <button onClick={() => { setEmail(''); setStep('method_select'); setError(''); }} className="w-fit p-2 -ml-2 mb-4 text-gray-400 hover:text-[#212529] transition-colors relative z-10">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                </button>
                <h2 className="text-[32px] font-bold text-[#212529] mb-3">Enter your email</h2>
                <div className="space-y-4 mb-auto">
                  <input type="email" placeholder="name@example.com" value={email} onChange={(e) => {setEmail(e.target.value.toLowerCase()); setError('');}} className={`w-full border rounded-xl px-4 py-4 font-medium outline-none transition-all ${email && !isEmailValid ? 'border-red-500' : 'border-gray-200 focus:border-[#4C6EF5]'}`} />
                  {email && !isEmailValid && (
                    <p className="text-xs text-red-500 mt-1 font-medium">Please enter a valid email address.</p>
                  )}
                  {error && <p className="text-sm text-red-500 font-medium mt-1">⚠️ {error}</p>}
                </div>
                <div className="mt-8">
                  <button onClick={handleSendOtp} disabled={!isEmailValid} className={`w-full font-bold py-4 px-6 rounded-2xl transition-all ${isEmailValid ? 'bg-[#4C6EF5] text-white hover:bg-[#3b5bdb]' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}>Send OTP</button>
                </div>
              </div>
            )}
          </div>
        </div>

        {errorPopup.show && (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4"
            style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="sign-in-error-title"
            aria-describedby="sign-in-error-message"
          >
            <div className="relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl animate-expand-card">
              <button
                type="button"
                onClick={closeErrorPopup}
                className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#4C6EF5]/30"
                aria-label="Close sign-in error"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                </div>
                <div className="min-w-0 pr-8">
                  <h3 id="sign-in-error-title" className="text-[#212529] font-bold text-lg">{errorPopup.title || DEFAULT_ERROR_POPUP_STATE.title}</h3>
                  <p className="text-[#71767A] text-sm">{errorPopup.subtitle || DEFAULT_ERROR_POPUP_STATE.subtitle}</p>
                </div>
              </div>
              <p id="sign-in-error-message" className="text-[#212529] text-sm mb-6 bg-red-50 rounded-xl px-4 py-3 border border-red-100 leading-relaxed">{errorPopup.message}</p>
              <button
                onClick={() => {
                  const nextStep = errorPopup.nextStep;
                  closeErrorPopup();
                  if (nextStep) {
                    setError('');
                    setAuthMethod(nextStep === 'email_entry' ? 'email' : authMethod);
                    setStep(nextStep);
                  }
                }}
                className="w-full bg-[#4C6EF5] text-white font-bold py-3 px-6 rounded-xl hover:bg-[#3b5bdb] transition-colors"
              >
                {errorPopup.actionLabel || DEFAULT_ERROR_POPUP_STATE.actionLabel}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
