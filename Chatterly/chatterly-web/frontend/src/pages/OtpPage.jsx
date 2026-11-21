import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useLocation, Navigate } from 'react-router-dom';
import Logo from '../components/Logo';
import { authenticateWithPhone, verifyEmailOTP, sendEmailOTP } from '../api/auth';
import { getProfile } from '../api/contactapi';
import { signInWithPhoneNumber } from "firebase/auth";
import { auth } from "../firebase";
import { clearPhoneRecaptchaVerifier, ensurePhoneRecaptchaVerifier } from '../utils/phoneAuth';
import {
  ensureBrowserNotificationPermission,
  ensurePushNotificationsForUser,
} from '../utils/pushNotifications';
import { hasCompletedProfileSetup, persistProfileToStorage } from '../utils/profile';
import { savePendingTwoFactor } from '../utils/twoFactorSession';

const OTP_RECAPTCHA_CONTAINER_ID = 'otp-recaptcha-container';

export default function OtpPage() {
  const navigate = useNavigate();
  const location = useLocation();
  
  const { authMethod, contactValue, countryCode } = location.state || {};

  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [timer, setTimer] = useState(30);
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('');
  const otpRefs = useRef([]);

  useEffect(() => {
    let interval;
    if (timer > 0) {
      interval = setInterval(() => setTimer((prev) => prev - 1), 1000);
    }
    return () => clearInterval(interval);
  }, [timer]);

  useEffect(() => () => {
    clearPhoneRecaptchaVerifier({
      containerId: OTP_RECAPTCHA_CONTAINER_ID,
      preserveConfirmationResult: true,
    });
  }, []);

  const handleOtpChange = (index, value) => {
    if (isNaN(value)) return;
    
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    if (value !== '' && index < 5) {
      otpRefs.current[index + 1].focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && otp[index] === '' && index > 0) {
      otpRefs.current[index - 1].focus();
    }
  };

  const handleResendOtp = async () => {
    if (timer !== 0) return;

    setLoading(true);
    setLoadingText('Resending OTP...');

    try {
      if (authMethod === 'phone') {
        const phone = countryCode + contactValue;
        const recaptchaVerifier = await ensurePhoneRecaptchaVerifier({
          auth,
          containerId: OTP_RECAPTCHA_CONTAINER_ID,
        });

        const confirmationResult = await signInWithPhoneNumber(
          auth,
          phone,
          recaptchaVerifier
        );

        window.confirmationResult = confirmationResult;

      } else {
        await sendEmailOTP(contactValue);
      }

      setOtp(['', '', '', '', '', '']);
      setTimer(30);

    } catch (err) {
      clearPhoneRecaptchaVerifier({ containerId: OTP_RECAPTCHA_CONTAINER_ID });
      alert(err.message || "Failed to resend OTP");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    const notificationPermissionPromise = ensureBrowserNotificationPermission({
      requestPermission: true,
      forceRequest: true,
    });
    setLoading(true);
    setLoadingText('Verifying OTP...');

    try {
      const fullOtp = otp.join('');
      let data = null;

      if (authMethod === 'phone') {
        if (!window.confirmationResult) {
          alert('Your OTP session expired. Please request a new OTP and try again.');
          setLoading(false);
          return;
        }

        const result = await window.confirmationResult.confirm(fullOtp);
        const idToken = await result.user.getIdToken();
        data = await authenticateWithPhone(idToken);

      } else {
        data = await verifyEmailOTP({
          email: contactValue,
          otp: fullOtp,
        });
      }

      // 2FA is on for this account and this device isn't trusted: there is no
      // token yet. Park the challenge details and let the chat route's gate run
      // the step-up (docs/api.md §130).
      if (data?.requires2FA) {
        savePendingTwoFactor({
          userId: data.twoFactorUserId,
          method: data.twoFactorMethod,
          phone: authMethod === 'phone' ? `${countryCode}${contactValue}` : '',
        });
        navigate('/chats', { replace: true });
        return;
      }

      if (data && data.token) {
        localStorage.setItem("token", data.token);
        const userData = data.user || data;
        localStorage.setItem("user", JSON.stringify(userData));

        // ✅ START OF FCM TOKEN LOGIC
        try {
          await notificationPermissionPromise;
          const userId = userData._id || userData.id || userData.userId;
          if (userId) {
            await ensurePushNotificationsForUser({
              userId,
              requestPermission: true,
            });
          }
        } catch (fcmError) {
          console.error("Failed to generate or save FCM token:", fcmError);
        }
        // ✅ END OF FCM TOKEN LOGIC

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
          navigate('/chats');
        } else {
          navigate('/create-profile');
        }

      } else {
        alert("Login failed. Please try again.");
        return;
      }

    } catch (err) {
      console.error(err);
      alert(err.message || "Invalid OTP");
    } finally {
      setLoading(false);
    }
  };

  const isOtpComplete = otp.every(digit => digit !== '');

  if (!contactValue) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="chatterly-auth-shell min-h-screen bg-[#F8F9FB] flex items-center justify-center p-4 md:p-8 font-sans">
      {/* UI Code remains exactly the same */}
      <div className="max-w-[1024px] w-full bg-white rounded-[32px] shadow-[0_8px_30px_rgba(0,0,0,0.04)] flex overflow-hidden min-h-[640px] animate-fade-in">
        
        <div className="login-hero hidden lg:flex w-1/2 p-12 flex-col justify-between relative overflow-hidden">
          <div className="login-hero__decor absolute -top-24 -right-16 w-72 h-72 bg-[#8B5CF6] rounded-full blur-[120px] opacity-40"></div>
          <div className="login-hero__decor absolute -bottom-28 -left-20 w-80 h-80 bg-[#4C6EF5] rounded-full blur-[130px] opacity-30"></div>
          <div className="login-hero__decor absolute inset-0 opacity-[0.06] bg-[linear-gradient(rgba(255,255,255,0.5)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.5)_1px,transparent_1px)] bg-[size:34px_34px]"></div>
          <div className="z-10">
            <div className="login-hero__logo mb-12"><Link to="/"><Logo /></Link></div>
            <h1 className="login-hero__title text-4xl font-bold leading-tight mb-4">Secure your<br/>account</h1>
            <p className="login-hero__text leading-relaxed max-w-[320px]">We use industry-standard encryption to ensure your private conversations stay private.</p>
          </div>
          <div className="login-hero__card relative z-10 flex items-center gap-3 rounded-2xl px-4 py-3.5 backdrop-blur-sm max-w-[320px]">
            <span className="login-hero__icon flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
            </span>
            <p className="login-hero__text text-[13px] leading-5">Your one-time code is private — never share it with anyone.</p>
          </div>
        </div>

        <div className="w-full lg:w-1/2 p-8 md:p-16 flex flex-col justify-center relative">
          <div id={OTP_RECAPTCHA_CONTAINER_ID}></div>
          
          {loading && (
            <div className="absolute inset-0 bg-white z-50 flex flex-col items-center justify-center rounded-r-[32px]">
              <div className="w-10 h-10 border-4 border-gray-100 border-t-[#4C6EF5] rounded-full animate-spin mb-4"></div>
              <p className="text-[#71767A] font-medium">{loadingText || 'Processing...'}</p>
            </div>
          )}

          <div className="flex flex-col h-full">
            <button onClick={() => navigate('/login')} className="w-fit p-2 -ml-2 mb-4 text-gray-400 hover:text-[#212529] transition-colors">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            </button>

            <h2 className="text-[32px] font-bold text-[#212529] mb-3">Verify your {authMethod}</h2>
            <p className="text-[#71767A] mb-6 leading-relaxed">Enter the 6-digit code we sent to your {authMethod}.</p>

            <div className="flex items-center gap-2 mb-8 bg-gray-50 w-fit px-4 py-2 rounded-full border border-gray-100">
              <span className="font-medium text-[#212529] tracking-wide">
                {authMethod === 'phone' ? `${countryCode} ${contactValue}` : contactValue}
              </span>
            </div>

            <div className="flex justify-between gap-2 mb-auto">
              {otp.map((digit, index) => (
                <input
                  key={index}
                  ref={el => otpRefs.current[index] = el}
                  type="text"
                  maxLength="1"
                  value={digit}
                  onChange={(e) => handleOtpChange(index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(index, e)} 
                  className="w-12 h-14 md:w-14 md:h-16 border-2 border-gray-300 rounded-xl text-center text-2xl font-bold text-[#212529] outline-none focus:border-[#4C6EF5] focus:ring-1 transition-all"
                />
              ))}
            </div>

            <div className="mt-8 space-y-6">
              <button onClick={handleVerifyOtp} disabled={!isOtpComplete || loading} className={`w-full font-bold py-4 px-6 rounded-2xl transition-all ${isOtpComplete && !loading ? 'bg-[#4C6EF5] text-white hover:bg-[#3b5bdb]' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}>Verify OTP</button>
              <p className="text-sm text-center text-[#71767A]">
                Didn't get the code?{' '}
                <span onClick={handleResendOtp} className={`font-medium transition-colors ${timer === 0 ? 'text-[#4C6EF5] cursor-pointer hover:underline' : 'text-gray-400 cursor-not-allowed'}`}>
                  {timer > 0 ? `Resend in ${timer} seconds` : 'Resend OTP now'}
                </span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
