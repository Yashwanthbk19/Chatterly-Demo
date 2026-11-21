import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { signInWithPhoneNumber } from 'firebase/auth';
import Logo from '../components/Logo';
import ProfileImageCropModal from '../components/ProfileImageCropModal';
import defaultProfilePic from '../assets/image.png';
import australiaFlag from '../assets/flags/au.svg';
import unitedKingdomFlag from '../assets/flags/gb.svg';
import indiaFlag from '../assets/flags/in.svg';
import japanFlag from '../assets/flags/jp.svg';
import unitedStatesFlag from '../assets/flags/us.svg';
import { findRegisteredUsersByPhone, updateProfile } from '../api/contactapi';
import { isPhoneAvailable } from '../utils/phoneAvailability';
import { auth } from '../firebase';
import {
  DEFAULT_PROFILE_PICTURE,
  persistProfileToStorage,
  splitFullName,
  getStoredUser,
  hasCompletedProfileSetup,
  limitProfileFullName,
  limitProfileStatus,
  limitProfileStatusForTyping,
  normalizeProfilePictureValue,
  resolveProfileDisplayPicture,
  isEmailRequiredForAccount,
  PROFILE_FULL_NAME_MAX_LENGTH,
} from '../utils/profile';
import { sanitizePhoneDigits, validatePhone } from '../utils/formValidators';
import { clearPhoneRecaptchaVerifier, ensurePhoneRecaptchaVerifier } from '../utils/phoneAuth';

const DATE_OF_BIRTH_PATTERN = /^\d{2}-\d{2}-\d{4}$/;
const PROFILE_PHONE_RECAPTCHA_CONTAINER_ID = 'profile-creation-phone-recaptcha';
const PROFILE_PHONE_OTP_LENGTH = 6;
const PROFILE_PHONE_OTP_RESEND_SECONDS = 30;

const getAccountId = (user) => String(user?._id || user?.id || user?.userId || '').trim();

const getPhoneVerificationErrorMessage = (error) => {
  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || '').trim();

  if (/phone already in use|already associated|already exists/i.test(message)) {
    return 'This mobile number is already in use.';
  }
  if (code.includes('billing-not-enabled') || /billing-not-enabled/i.test(message)) {
    return 'SMS verification is unavailable. Please contact support to enable it.';
  }
  if (code.includes('operation-not-allowed') || /operation-not-allowed/i.test(message)) {
    return 'SMS verification is unavailable for this number. Please contact support.';
  }
  if (code.includes('invalid-verification-code')) return 'The OTP is incorrect. Please try again.';
  if (code.includes('code-expired') || code.includes('session-expired')) {
    return 'The OTP has expired. Please request a new code.';
  }
  if (code.includes('too-many-requests')) {
    return 'Too many verification attempts. Please wait and try again.';
  }
  if (code.includes('invalid-phone-number')) return 'Enter a valid mobile number for the selected country code.';
  if (code.includes('quota-exceeded')) {
    return 'SMS verification is temporarily unavailable. Please try again later.';
  }

  return message || 'Unable to verify this mobile number right now.';
};

const formatOtpResendTime = (seconds = 0) => {
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(safeSeconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(safeSeconds % 60).padStart(2, '0')}`;
};

// True when this browser is now signed in to an account other than `setupUser`.
const hasSignedInAccountChanged = (setupUser) => {
  const setupAccountId = getAccountId(setupUser);
  const signedInAccountId = getAccountId(getStoredUser());
  return Boolean(setupAccountId && signedInAccountId && signedInAccountId !== setupAccountId);
};

// The date of birth is typed as three linked parts rather than one masked
// string. A single "DD-MM-YYYY" field re-flowed every digit after an edit, so
// Backspace in the day either did nothing (it only removed the "-", which the
// mask put straight back) or dragged the month and year into the day.
const DATE_OF_BIRTH_SEGMENTS = [
  { key: 'day', label: 'Day', placeholder: 'DD', maxLength: 2, autoComplete: 'bday-day', widthClassName: 'w-[24px]' },
  { key: 'month', label: 'Month', placeholder: 'MM', maxLength: 2, autoComplete: 'bday-month', widthClassName: 'w-[28px]' },
  { key: 'year', label: 'Year', placeholder: 'YYYY', maxLength: 4, autoComplete: 'bday-year', widthClassName: 'w-[44px]' },
];
const EMPTY_DATE_OF_BIRTH_PARTS = { day: '', month: '', year: '' };
const DATE_OF_BIRTH_SEPARATOR_KEYS = new Set(['-', '/', '.', ' ']);

const joinDateOfBirthParts = ({ day, month, year }) =>
  day || month || year ? `${day}-${month}-${year}` : '';

const isDateOfBirthComplete = ({ day, month, year }) =>
  day.length === 2 && month.length === 2 && year.length === 4;

// A single-digit day or month ("5") is written as "05" once the user moves on.
const padDateOfBirthParts = (parts) => ({
  ...parts,
  day: /^[1-9]$/.test(parts.day) ? `0${parts.day}` : parts.day,
  month: /^[1-9]$/.test(parts.month) ? `0${parts.month}` : parts.month,
});

// A whole date pasted (or auto-filled) into any part: DD-MM-YYYY, DD/MM/YYYY,
// DD.MM.YYYY, DDMMYYYY or ISO YYYY-MM-DD. Anything else returns null.
const parseDateOfBirthText = (value = '') => {
  const text = String(value).trim();
  const isoDate = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (isoDate) {
    return padDateOfBirthParts({ day: isoDate[3], month: isoDate[2], year: isoDate[1] });
  }
  const dayFirstDate = text.match(/^(\d{1,2})[-/.\s](\d{1,2})[-/.\s](\d{4})$/);
  if (dayFirstDate) {
    return padDateOfBirthParts({ day: dayFirstDate[1], month: dayFirstDate[2], year: dayFirstDate[3] });
  }
  if (/^\d{8}$/.test(text)) {
    return { day: text.slice(0, 2), month: text.slice(2, 4), year: text.slice(4) };
  }
  return null;
};

const PROFILE_PHONE_COUNTRIES = [
  { name: 'India', code: '+91', flagSrc: indiaFlag, phoneLength: 10, phoneGroups: [5, 5] },
  { name: 'USA', code: '+1', flagSrc: unitedStatesFlag, phoneLength: 10, phoneGroups: [3, 3, 4] },
  { name: 'UK', code: '+44', flagSrc: unitedKingdomFlag, phoneLength: 10, phoneGroups: [4, 6] },
  { name: 'Australia', code: '+61', flagSrc: australiaFlag, phoneLength: 9, phoneGroups: [3, 3, 3] },
  { name: 'Japan', code: '+81', flagSrc: japanFlag, phoneLength: 10, phoneGroups: [2, 4, 4] },
];

const getLocalProfilePhoneDigits = (value, country) => {
  const text = String(value || '').trim();
  const digits = text.replace(/\D/g, '');
  const dialCode = country.code.slice(1);
  return digits.startsWith(dialCode) && (text.startsWith('+') || digits.length === dialCode.length + country.phoneLength)
    ? digits.slice(dialCode.length)
    : digits;
};

const sanitizeProfilePhoneDigits = (value, country) => country.code === '+91'
  ? sanitizePhoneDigits(value)
  : getLocalProfilePhoneDigits(value, country).slice(0, country.phoneLength);

// Keep the stored value as local digits for validation and submission, while
// presenting the conventional grouping for the selected international code.
const formatProfilePhoneForDisplay = (value, country) => {
  const digits = sanitizeProfilePhoneDigits(value, country);
  const groups = [];
  let offset = 0;

  country.phoneGroups.forEach((groupLength) => {
    const group = digits.slice(offset, offset + groupLength);
    if (group) groups.push(group);
    offset += groupLength;
  });

  return groups.join(' ');
};

const normalizeProfilePhone = (value, country) => {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.startsWith('+')) return `+${text.replace(/\D/g, '')}`;
  return `${country.code}${getLocalProfilePhoneDigits(text, country)}`;
};

const validateProfilePhone = (value, country) => {
  if (country.code === '+91') return validatePhone(value);
  const text = String(value || '').trim();
  const digits = getLocalProfilePhoneDigits(text, country);
  const valid = /^[\d+\s()-]+$/.test(text) &&
    (!text.startsWith('+') || text.replace(/\D/g, '').startsWith(country.code.slice(1))) &&
    digits.length === country.phoneLength && /^[1-9]\d*$/.test(digits);
  return { valid, error: valid ? '' : `Enter a valid ${country.phoneLength}-digit mobile number for ${country.name} (${country.code}).` };
};

const isValidDateOfBirth = (value = '') => {
  if (!DATE_OF_BIRTH_PATTERN.test(value)) {
    return false;
  }

  const [day, month, year] = value.split('-').map(Number);
  const parsedDate = new Date(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00`);

  const isDateValid = (
    Number.isInteger(year) &&
    Number.isInteger(month) &&
    Number.isInteger(day) &&
    parsedDate.getFullYear() === year &&
    parsedDate.getMonth() === month - 1 &&
    parsedDate.getDate() === day
  );

  if (!isDateValid) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0); 
  if (parsedDate > today) {
    return false;
  }

  return true;
};

// Day / month / year entered in three linked inputs inside one bordered field.
// Each part edits on its own, so Backspace in the day only changes the day.
// Typing a full part moves on to the next (selected, so typing replaces it),
// Backspace or ArrowLeft at the start of a part carries on into the previous
// one, and a whole pasted date fills all three.
function DateOfBirthField({ parts, onPartsChange, hasError }) {
  const groupRef = useRef(null);
  const segmentRefs = useRef([]);
  const calendarInputRef = useRef(null);
  const calendarValue = isDateOfBirthComplete(parts) && isValidDateOfBirth(joinDateOfBirthParts(parts))
    ? `${parts.year}-${parts.month}-${parts.day}`
    : '';
  const today = new Date();
  const latestCalendarDate = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-');

  const focusSegment = (index, caret = 'end') => {
    const input = segmentRefs.current[index];
    if (!input) return;
    input.focus();
    if (caret === 'select') {
      input.select();
      return;
    }
    const position = caret === 'start' ? 0 : input.value.length;
    input.setSelectionRange(position, position);
  };

  const handleSegmentChange = (index, event) => {
    const { key, maxLength } = DATE_OF_BIRTH_SEGMENTS[index];
    const nextValue = event.target.value.replace(/\D/g, '').slice(0, maxLength);
    const isNowFull = nextValue.length === maxLength && nextValue.length > parts[key].length;
    onPartsChange((currentParts) => ({ ...currentParts, [key]: nextValue }));

    if (isNowFull && index < DATE_OF_BIRTH_SEGMENTS.length - 1) {
      focusSegment(index + 1, 'select');
    }
  };

  const handleSegmentKeyDown = (index, event) => {
    const input = event.currentTarget;
    const hasSelection = input.selectionStart !== input.selectionEnd;
    const isCaretAtStart = !hasSelection && input.selectionStart === 0;
    const isCaretAtEnd = !hasSelection && input.selectionStart === input.value.length;

    if (event.key === 'Backspace' && isCaretAtStart && index > 0) {
      event.preventDefault();
      const { key: previousKey } = DATE_OF_BIRTH_SEGMENTS[index - 1];
      onPartsChange((currentParts) => ({
        ...currentParts,
        [previousKey]: currentParts[previousKey].slice(0, -1),
      }));
      focusSegment(index - 1);
      return;
    }

    if (event.key === 'ArrowLeft' && isCaretAtStart && index > 0) {
      event.preventDefault();
      focusSegment(index - 1);
      return;
    }

    if (event.key === 'ArrowRight' && isCaretAtEnd && index < DATE_OF_BIRTH_SEGMENTS.length - 1) {
      event.preventDefault();
      focusSegment(index + 1, 'start');
      return;
    }

    if (DATE_OF_BIRTH_SEPARATOR_KEYS.has(event.key)) {
      event.preventDefault();
      if (input.value && index < DATE_OF_BIRTH_SEGMENTS.length - 1) {
        onPartsChange(padDateOfBirthParts);
        focusSegment(index + 1, 'select');
      }
    }
  };

  const handleSegmentPaste = (event) => {
    const pastedParts = parseDateOfBirthText(event.clipboardData?.getData('text'));
    if (!pastedParts) return;
    event.preventDefault();
    onPartsChange(pastedParts);
    focusSegment(DATE_OF_BIRTH_SEGMENTS.length - 1);
  };

  const handleCalendarChange = (event) => {
    const selectedParts = parseDateOfBirthText(event.target.value);
    if (selectedParts) onPartsChange(selectedParts);
  };

  const openCalendarPicker = () => {
    const calendarInput = calendarInputRef.current;
    if (!calendarInput) return;

    if (typeof calendarInput.showPicker === 'function') {
      calendarInput.showPicker();
      return;
    }

    calendarInput.focus();
    calendarInput.click();
  };

  const handleGroupBlur = (event) => {
    if (groupRef.current?.contains(event.relatedTarget)) return;
    onPartsChange(padDateOfBirthParts);
  };

  // A click on the field's frame (not one of the parts) starts at the first
  // unfinished part, as a single input would.
  const handleGroupMouseDown = (event) => {
    if (segmentRefs.current.includes(event.target)) return;
    event.preventDefault();
    const firstIncompleteIndex = DATE_OF_BIRTH_SEGMENTS.findIndex(
      ({ key, maxLength }) => parts[key].length < maxLength
    );
    focusSegment(firstIncompleteIndex === -1 ? DATE_OF_BIRTH_SEGMENTS.length - 1 : firstIncompleteIndex);
  };

  return (
    <div
      ref={groupRef}
      role="group"
      aria-labelledby="profile-date-of-birth-label"
      onBlur={handleGroupBlur}
      onMouseDown={handleGroupMouseDown}
      className={`relative w-full cursor-text rounded-xl border bg-white px-4 pt-6 pb-2 transition-all ${hasError ? 'border-red-500 focus-within:border-red-500' : 'border-gray-200 focus-within:border-[#4C6EF5]'}`}
    >
      <span id="profile-date-of-birth-label" className="pointer-events-none absolute left-4 top-2 text-sm font-medium text-[#111827]">
        Date of Birth <span className="text-red-500" aria-hidden="true">*</span><span className="sr-only"> required</span>
      </span>
      <button
        type="button"
        onMouseDown={(event) => event.stopPropagation()}
        onClick={openCalendarPicker}
        className="absolute right-4 top-3 inline-flex cursor-pointer items-center gap-1 text-sm font-medium text-[#111827]"
        aria-label="Open date of birth calendar"
      >
        <span aria-hidden="true">DD-MM-YYYY</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M16 3v4M8 3v4M3 10h18" />
        </svg>
      </button>
      <input
        ref={calendarInputRef}
        type="date"
        value={calendarValue}
        max={latestCalendarDate}
        onChange={handleCalendarChange}
        tabIndex={-1}
        aria-hidden="true"
        className="pointer-events-none absolute h-px w-px overflow-hidden opacity-0"
      />
      <div className="flex w-fit flex-nowrap items-center whitespace-nowrap font-medium leading-5 text-[#212529] tabular-nums">
        {DATE_OF_BIRTH_SEGMENTS.map((segment, index) => (
          <React.Fragment key={segment.key}>
            {index > 0 ? <span className="mx-0.5 flex-shrink-0 text-gray-400" aria-hidden="true">-</span> : null}
            <input
              ref={(node) => { segmentRefs.current[index] = node; }}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete={segment.autoComplete}
              aria-label={segment.label}
              aria-invalid={hasError || undefined}
              placeholder={segment.placeholder}
              maxLength={segment.maxLength}
              value={parts[segment.key]}
              onChange={(event) => handleSegmentChange(index, event)}
              onKeyDown={(event) => handleSegmentKeyDown(index, event)}
              onPaste={handleSegmentPaste}
              className={`${segment.widthClassName} flex-shrink-0 bg-transparent p-0 text-left leading-5 outline-none caret-[#4C6EF5] placeholder:text-gray-400`}
            />
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const [storedUser] = useState(() => getStoredUser());

  const [fullName, setFullName] = useState(() => {
    const storedName = String(storedUser?.fullName || storedUser?.name || storedUser?.username || '').trim();
    return storedName.toLowerCase() === 'your profile' ? '' : storedName;
  });
  const [dateOfBirthParts, setDateOfBirthParts] = useState(EMPTY_DATE_OF_BIRTH_PARTS);
  const dateOfBirth = joinDateOfBirthParts(dateOfBirthParts);
  const [bio, setBio] = useState('');
  const [country, setCountry] = useState('India');
  const [isCountryMenuOpen, setIsCountryMenuOpen] = useState(false);
  const selectedCountry = PROFILE_PHONE_COUNTRIES.find((item) => item.name === country);
  const [phone, setPhone] = useState(() => {
    const storedPhone = String(storedUser?.phone || storedUser?.mobile || '').trim();
    if (storedPhone.startsWith('+') && !storedPhone.startsWith(selectedCountry.code)) return '';
    return sanitizeProfilePhoneDigits(storedPhone, selectedCountry);
  });
  const [profilePic, setProfilePic] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [imageError, setImageError] = useState('');
  const [pendingCropImage, setPendingCropImage] = useState(null);
  // Judged only once every part is filled in, so a date being typed or edited
  // never shows as an error midway.
  const dobError =
    isDateOfBirthComplete(dateOfBirthParts) && !isValidDateOfBirth(dateOfBirth)
      ? 'Invalid date of birth entered'
      : '';
  const [phoneError, setPhoneError] = useState('');
  const [verifiedPhone, setVerifiedPhone] = useState(() => {
    const storedPhone = storedUser?.phone || storedUser?.mobile || '';
    return !isEmailRequiredForAccount(storedUser) && validateProfilePhone(storedPhone, selectedCountry).valid
      ? normalizeProfilePhone(storedPhone, selectedCountry)
      : '';
  });
  const [phoneVerificationTarget, setPhoneVerificationTarget] = useState('');
  const [isPhoneOtpOpen, setIsPhoneOtpOpen] = useState(false);
  const [phoneOtpDigits, setPhoneOtpDigits] = useState(() => Array(PROFILE_PHONE_OTP_LENGTH).fill(''));
  const [phoneOtpError, setPhoneOtpError] = useState('');
  const [isSendingPhoneOtp, setIsSendingPhoneOtp] = useState(false);
  const [isVerifyingPhoneOtp, setIsVerifyingPhoneOtp] = useState(false);
  const [phoneOtpResendSeconds, setPhoneOtpResendSeconds] = useState(0);

  const [isSettingUp, setIsSettingUp] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef(null);
  const countryMenuRef = useRef(null);
  const phoneOtpInputRefs = useRef([]);
  const phoneOtpConfirmationRef = useRef(null);

  const isEmailOrGoogleAccount = isEmailRequiredForAccount(storedUser);

  const isPhoneValid = (value) => validateProfilePhone(value, selectedCountry).valid;
  const normalizedPhone = normalizeProfilePhone(phone, selectedCountry);
  const isPhoneVerified = Boolean(normalizedPhone && verifiedPhone === normalizedPhone);

  const handlePhoneChange = (event) => {
    const cleaned = sanitizeProfilePhoneDigits(event.target.value, selectedCountry);
    if (cleaned !== phone) setVerifiedPhone('');
    setPhone(cleaned);
    setPhoneError('');
  };

  const handleCountryChange = (countryName) => {
    setCountry(countryName);
    setPhone('');
    setVerifiedPhone('');
    setPhoneError('');
    phoneOtpConfirmationRef.current = null;
    setPhoneVerificationTarget('');
    setIsCountryMenuOpen(false);
  };

  useEffect(() => {
    if (!isCountryMenuOpen) return undefined;

    const handleCountryMenuPointerDown = (event) => {
      if (!countryMenuRef.current?.contains(event.target)) {
        setIsCountryMenuOpen(false);
      }
    };
    const handleCountryMenuKeyDown = (event) => {
      if (event.key === 'Escape') setIsCountryMenuOpen(false);
    };

    document.addEventListener('mousedown', handleCountryMenuPointerDown);
    document.addEventListener('keydown', handleCountryMenuKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleCountryMenuPointerDown);
      document.removeEventListener('keydown', handleCountryMenuKeyDown);
    };
  }, [isCountryMenuOpen]);

  useEffect(() => {
    if (isSettingUp) {
      const timeout = setTimeout(() => setProgress(100), 50);
      return () => clearTimeout(timeout);
    }
  }, [isSettingUp]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    return () => {
      if (pendingCropImage?.src) URL.revokeObjectURL(pendingCropImage.src);
    };
  }, [pendingCropImage]);

  useEffect(() => {
    if (!isPhoneOtpOpen || phoneOtpResendSeconds <= 0) return undefined;
    const timeoutId = window.setTimeout(
      () => setPhoneOtpResendSeconds((seconds) => Math.max(0, seconds - 1)),
      1000
    );
    return () => window.clearTimeout(timeoutId);
  }, [isPhoneOtpOpen, phoneOtpResendSeconds]);

  useEffect(() => () => {
    clearPhoneRecaptchaVerifier({ containerId: PROFILE_PHONE_RECAPTCHA_CONTAINER_ID });
    phoneOtpConfirmationRef.current = null;
  }, []);

  // Another tab can sign in from the login page while this one is still in
  // setup (BUG_USR_314). If it signs in to a different account, this form no
  // longer belongs to the signed-in user: reload so the route guards pick the
  // right page instead of saving these details onto that account.
  useEffect(() => {
    const handleStorage = (event) => {
      if (event.key !== 'user' && event.key !== 'token') return;
      if (hasSignedInAccountChanged(storedUser)) window.location.replace('/create-profile');
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [storedUser]);

  const resetImageSelection = () => {
    setProfilePic(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const clearPendingCropImage = ({ resetFileInput = false } = {}) => {
    if (pendingCropImage?.src) {
      URL.revokeObjectURL(pendingCropImage.src);
    }

    setPendingCropImage(null);

    if (resetFileInput && fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const validImageTypes = ['image/jpeg', 'image/png', 'image/jpg'];
    const isExtensionValid = file.name && /\.(jpg|jpeg|png)$/i.test(file.name);
    
    if (!validImageTypes.includes(file.type) && !isExtensionValid) {
      setImageError('Invalid image format. Please upload a JPG or PNG file.');
      resetImageSelection();
      return;
    }

    const maxSizeInBytes = 2 * 1024 * 1024;
    if (file.size > maxSizeInBytes) {
      setImageError('Image size must be below 2MB. Please choose a smaller file.');
      resetImageSelection();
      return;
    }

    setImageError('');
    clearPendingCropImage();
    setPendingCropImage({
      src: URL.createObjectURL(file),
      name: file.name,
      type: file.type || 'image/jpeg',
    });
  };

  const handleCancelImageCrop = () => {
    clearPendingCropImage({ resetFileInput: true });
  };

  const handleApplyImageCrop = ({ file, previewUrl: croppedPreviewUrl, error }) => {
    if (error) {
      setImageError(error);
      clearPendingCropImage({ resetFileInput: true });
      return;
    }

    if (!file || !croppedPreviewUrl) {
      clearPendingCropImage({ resetFileInput: true });
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);

    setImageError('');
    setProfilePic(file);
    setPreviewUrl(croppedPreviewUrl);
    clearPendingCropImage();
  };

  const isPhoneAvailableForCurrentAccount = (formattedPhone) =>
    isPhoneAvailable(formattedPhone, storedUser, findRegisteredUsersByPhone,
      (value) => normalizeProfilePhone(value, selectedCountry));

  const closePhoneOtpModal = () => {
    if (isSendingPhoneOtp || isVerifyingPhoneOtp) return;
    clearPhoneRecaptchaVerifier({ containerId: PROFILE_PHONE_RECAPTCHA_CONTAINER_ID });
    phoneOtpConfirmationRef.current = null;
    setIsPhoneOtpOpen(false);
    setPhoneOtpDigits(Array(PROFILE_PHONE_OTP_LENGTH).fill(''));
    setPhoneOtpError('');
    setPhoneOtpResendSeconds(0);
  };

  const sendPhoneOtp = async ({ isResend = false } = {}) => {
    if (isSendingPhoneOtp || isVerifyingPhoneOtp) return;

    const validation = validateProfilePhone(phone, selectedCountry);
    if (!validation.valid) {
      setPhoneError(validation.error);
      return;
    }

    const verificationTarget = normalizedPhone;
    setIsSendingPhoneOtp(true);
    setPhoneError('');
    setPhoneOtpError('');

    try {
      const isAvailable = await isPhoneAvailableForCurrentAccount(verificationTarget);
      if (!isAvailable) {
        const warning = 'This mobile number is already in use.';
        setPhoneError(warning);
        if (isResend) setPhoneOtpError(warning);
        return;
      }

      const verifier = await ensurePhoneRecaptchaVerifier({
        auth,
        containerId: PROFILE_PHONE_RECAPTCHA_CONTAINER_ID,
      });
      phoneOtpConfirmationRef.current = await signInWithPhoneNumber(
        auth,
        verificationTarget,
        verifier
      );
      setPhoneVerificationTarget(verificationTarget);
      setPhoneOtpDigits(Array(PROFILE_PHONE_OTP_LENGTH).fill(''));
      setPhoneOtpResendSeconds(PROFILE_PHONE_OTP_RESEND_SECONDS);
      setIsPhoneOtpOpen(true);
      window.requestAnimationFrame(() => phoneOtpInputRefs.current[0]?.focus());
    } catch (error) {
      clearPhoneRecaptchaVerifier({ containerId: PROFILE_PHONE_RECAPTCHA_CONTAINER_ID });
      phoneOtpConfirmationRef.current = null;
      const errorMessage = getPhoneVerificationErrorMessage(error);
      if (isResend || isPhoneOtpOpen) {
        setPhoneOtpError(errorMessage);
      } else {
        setPhoneError(errorMessage);
      }
    } finally {
      setIsSendingPhoneOtp(false);
    }
  };

  const handlePhoneOtpDigitChange = (index, event) => {
    const enteredDigits = event.target.value.replace(/\D/g, '').slice(0, PROFILE_PHONE_OTP_LENGTH - index);
    if (!enteredDigits) {
      setPhoneOtpDigits((currentDigits) => {
        const nextDigits = [...currentDigits];
        nextDigits[index] = '';
        return nextDigits;
      });
      setPhoneOtpError('');
      return;
    }

    setPhoneOtpDigits((currentDigits) => {
      const nextDigits = [...currentDigits];
      enteredDigits.split('').forEach((digit, digitIndex) => {
        nextDigits[index + digitIndex] = digit;
      });
      return nextDigits;
    });
    setPhoneOtpError('');
    phoneOtpInputRefs.current[Math.min(index + enteredDigits.length, PROFILE_PHONE_OTP_LENGTH - 1)]?.focus();
  };

  const handlePhoneOtpKeyDown = (index, event) => {
    if (event.key === 'Backspace' && !phoneOtpDigits[index] && index > 0) {
      event.preventDefault();
      setPhoneOtpDigits((currentDigits) => {
        const nextDigits = [...currentDigits];
        nextDigits[index - 1] = '';
        return nextDigits;
      });
      phoneOtpInputRefs.current[index - 1]?.focus();
      return;
    }

    if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault();
      phoneOtpInputRefs.current[index - 1]?.focus();
    }
    if (event.key === 'ArrowRight' && index < PROFILE_PHONE_OTP_LENGTH - 1) {
      event.preventDefault();
      phoneOtpInputRefs.current[index + 1]?.focus();
    }
  };

  const handlePhoneOtpPaste = (event) => {
    const pastedDigits = event.clipboardData?.getData('text').replace(/\D/g, '').slice(0, PROFILE_PHONE_OTP_LENGTH);
    if (!pastedDigits) return;
    event.preventDefault();
    setPhoneOtpDigits(
      Array.from({ length: PROFILE_PHONE_OTP_LENGTH }, (_, index) => pastedDigits[index] || '')
    );
    setPhoneOtpError('');
    phoneOtpInputRefs.current[Math.min(pastedDigits.length, PROFILE_PHONE_OTP_LENGTH) - 1]?.focus();
  };

  const verifyPhoneOtp = async () => {
    if (isVerifyingPhoneOtp || isSendingPhoneOtp) return;
    const otp = phoneOtpDigits.join('');
    if (!/^\d{6}$/.test(otp)) {
      setPhoneOtpError('Enter the complete 6-digit OTP.');
      return;
    }
    if (!phoneOtpConfirmationRef.current) {
      setPhoneOtpError('Your OTP session expired. Please request a new code.');
      return;
    }

    setIsVerifyingPhoneOtp(true);
    setPhoneOtpError('');
    try {
      const credential = await phoneOtpConfirmationRef.current.confirm(otp);
      const confirmedPhone = normalizeProfilePhone(credential?.user?.phoneNumber || '', selectedCountry);
      if (!confirmedPhone || confirmedPhone !== phoneVerificationTarget) {
        throw new Error('The verified mobile number does not match the number entered.');
      }

      const isAvailable = await isPhoneAvailableForCurrentAccount(phoneVerificationTarget);
      if (!isAvailable) {
        throw new Error('This mobile number is already in use.');
      }

      setVerifiedPhone(phoneVerificationTarget);
      setPhoneError('');
      clearPhoneRecaptchaVerifier({ containerId: PROFILE_PHONE_RECAPTCHA_CONTAINER_ID });
      phoneOtpConfirmationRef.current = null;
      setIsPhoneOtpOpen(false);
      setPhoneOtpDigits(Array(PROFILE_PHONE_OTP_LENGTH).fill(''));
      setPhoneOtpResendSeconds(0);
    } catch (error) {
      const errorMessage = getPhoneVerificationErrorMessage(error);
      setPhoneOtpError(errorMessage);
      if (errorMessage === 'This mobile number is already in use.') setPhoneError(errorMessage);
    } finally {
      setIsVerifyingPhoneOtp(false);
    }
  };

  const handleProfileSubmit = async () => {
    if (isSettingUp || isSendingPhoneOtp || isVerifyingPhoneOtp) return;

    if (hasSignedInAccountChanged(storedUser)) {
      window.location.replace('/create-profile');
      return;
    }

    if (!isPhoneVerified) {
      setPhoneError('Please verify your mobile number before continuing.');
      return;
    }

    if (!isProfileValid || imageError || dobError) return;

    const normalizedDateOfBirth = dateOfBirth;
    const [submitDay, submitMonth, submitYear] = normalizedDateOfBirth.split('-');
    const backendReadyDob = `${submitYear}-${submitMonth}-${submitDay}`;

    try {
      setIsSettingUp(true);
      const normalizedFullName = limitProfileFullName(fullName).trim();
      const parsedName = splitFullName(normalizedFullName);

      const formData = new FormData();
      formData.append("name", normalizedFullName);
      formData.append("fullName", normalizedFullName);
      formData.append("firstName", parsedName.firstName);
      formData.append("lastName", parsedName.lastName);
      formData.append("dob", backendReadyDob); 
      formData.append("status", limitProfileStatus(bio) || "Hey there! I am using Chatterly");
      formData.append("bio", limitProfileStatus(bio) || "Hey there! I am using Chatterly");
      formData.append("phone", normalizedPhone);
      if (isEmailOrGoogleAccount) {
        formData.append("country", country);
      }
      
      if (profilePic) {
        // --- BULLETPROOF BINARY RESOLUTION FIX ---
        let uploadBlob = profilePic;
        let fileName = 'profile.jpg';
        
        try {
          if (previewUrl) {
            const res = await fetch(previewUrl);
            uploadBlob = await res.blob();
          }
          const trueMimeType = uploadBlob.type === 'image/png' ? 'image/png' : 'image/jpeg';
          fileName = `profile.${trueMimeType === 'image/png' ? 'png' : 'jpg'}`;
        } catch (err) {
          console.error('Error resolving blob format:', err);
        }

        formData.append("profilePic", uploadBlob, fileName);
        // -----------------------------------------
      }

      const storedUser = getStoredUser();
      const isNewProfile = !hasCompletedProfileSetup(storedUser);

      if (isNewProfile) {
        const firstLoginDate =
          String(storedUser?.firstLoginDate || storedUser?.firstLoginAt || '').trim() ||
          new Date().toISOString();

        formData.append('firstLoginDate', firstLoginDate);
      }

      const profileResponse = await updateProfile(formData, { 
        mode: isNewProfile ? 'create' : 'update' 
      });

      let responseData = profileResponse;
      
      if (profileResponse?.data) {
        responseData = profileResponse.data;
      }
      
      if (profileResponse?.user) {
        responseData = profileResponse.user;
      }

      if (responseData) {
        let profilePicUrl =
          [
            responseData.profileImage,
            responseData.profilePic,
            responseData.profilePicture,
            responseData.avatar,
            responseData.image,
          ]
            .map((value) => normalizeProfilePictureValue(value))
            .find(Boolean) || '';
        
        if (!profilePicUrl && previewUrl) {
          profilePicUrl = previewUrl;
        }

        profilePicUrl = resolveProfileDisplayPicture(profilePicUrl);

        if (profilePicUrl && profilePicUrl !== DEFAULT_PROFILE_PICTURE && !profilePicUrl.startsWith('blob:')) {
          const separator = profilePicUrl.includes('?') ? '&' : '?';
          profilePicUrl = `${profilePicUrl}${separator}t=${Date.now()}`;
        }

        const profileToStore = {
          ...responseData,
          _id: responseData._id || responseData.id || storedUser?._id,
          id: responseData.id || responseData._id || storedUser?.id || storedUser?._id,
          userId: responseData.userId || responseData._id || responseData.id || storedUser?.userId || storedUser?._id,
          username: responseData.username || responseData.fullName || responseData.name || normalizedFullName,
          firstName: parsedName.firstName,
          lastName: parsedName.lastName,
          fullName: responseData.username || responseData.fullName || responseData.name || normalizedFullName,
          name: responseData.username || responseData.name || responseData.fullName || normalizedFullName,
          status: responseData.status || responseData.bio || bio || "Hey there! I am using Chatterly",
          bio: responseData.bio || responseData.status || bio || "Hey there! I am using Chatterly",
          phone: String(responseData.phone || responseData.mobile || normalizedPhone || storedUser?.phone || storedUser?.mobile || '').trim(),
          mobile: String(responseData.mobile || responseData.phone || normalizedPhone || storedUser?.mobile || storedUser?.phone || '').trim(),
          country: responseData.country || (isEmailOrGoogleAccount ? country : '') || storedUser?.country || '',
          email: responseData.email || storedUser?.email || '',
          authProvider: responseData.authProvider || storedUser?.authProvider || '',
          dob: responseData.dob || backendReadyDob,
          firstLoginDate:
            responseData.firstLoginDate ||
            responseData.firstLoginAt ||
            storedUser?.firstLoginDate ||
            new Date().toISOString(),
          profileImage: profilePicUrl,
          profilePic: profilePicUrl,
          profilePicture: profilePicUrl,
          photo: profilePicUrl,
          photoURL: profilePicUrl,
          avatar: profilePicUrl,
          avatarUrl: profilePicUrl,
          image: profilePicUrl,
          isProfileComplete: true,
          profileComplete: true,
          profileCompleted: true,
        };

        await persistProfileToStorage(profileToStore, { updateDateOfBirth: true });
        
        setTimeout(() => {
          setIsSettingUp(false);
          navigate('/chats', {
            state: { 
              successMessage: 'Profile updated successfully!',
              refresh: true,
              timestamp: Date.now()
            },
            replace: true 
          });
        }, 800);
      }
    } catch (err) {
      console.error("Profile Setup Error:", err);
      if (/phone already in use/i.test(String(err?.message || ''))) {
        setVerifiedPhone('');
        setPhoneError('This mobile number is already in use.');
      } else {
        alert(err?.message || "Something went wrong. Please try again.");
      }
      setIsSettingUp(false);
      setProgress(0);
    }
  };

  const isProfileValid =
    fullName.trim() !== '' &&
    isValidDateOfBirth(dateOfBirth) &&
    isPhoneValid(phone) && isPhoneVerified;

  return (
    <>
      <ProfileImageCropModal
        isOpen={Boolean(pendingCropImage)}
        imageSrc={pendingCropImage?.src || ''}
        imageName={pendingCropImage?.name || ''}
        imageType={pendingCropImage?.type || 'image/jpeg'}
        onCancel={handleCancelImageCrop}
        onApply={handleApplyImageCrop}
      />

      <div
        id={PROFILE_PHONE_RECAPTCHA_CONTAINER_ID}
        className="pointer-events-none absolute h-0 w-0 overflow-hidden"
        aria-hidden="true"
      />

      {isPhoneOtpOpen ? (
        <div
          className="fixed inset-0 z-[150] flex items-center justify-center bg-black/55 px-4 py-8 backdrop-blur-[1px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="profile-phone-verification-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closePhoneOtpModal();
          }}
        >
          <div className="w-full max-w-[408px] rounded-[18px] bg-white px-5 pb-6 pt-5 shadow-[0_28px_80px_rgba(15,23,42,0.3)] sm:px-7">
            <button
              type="button"
              onClick={closePhoneOtpModal}
              disabled={isSendingPhoneOtp || isVerifyingPhoneOtp}
              className="inline-flex items-center gap-1 text-[13px] font-medium text-[#64748B] transition-colors hover:text-[#334155] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m15 18-6-6 6-6" />
              </svg>
              Back
            </button>

            <div className="mt-2 flex flex-col items-center text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#EEF2FF] text-[#4C6EF5]" aria-hidden="true">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="6.5" y="2.5" width="11" height="19" rx="2.2" />
                  <path d="M10 5h4M10.5 18.5h3" />
                  <path d="M10 11.4a2 2 0 1 1 3.7 1.05L15 13.8" />
                </svg>
              </span>
              <h3 id="profile-phone-verification-title" className="mt-4 text-[22px] font-bold text-[#111827]">
                Mobile Verification
              </h3>
              <p className="mt-2 text-[13px] leading-5 text-[#6B7280]">
                We&apos;ve sent a code to <span className="font-semibold text-[#111827]">{phoneVerificationTarget}</span>.
                <br />Please enter it below.
              </p>
            </div>

            <div className="mt-6 flex items-center justify-center gap-2" onPaste={handlePhoneOtpPaste}>
              {phoneOtpDigits.map((digit, index) => (
                <input
                  key={index}
                  ref={(node) => { phoneOtpInputRefs.current[index] = node; }}
                  type="text"
                  inputMode="numeric"
                  autoComplete={index === 0 ? 'one-time-code' : 'off'}
                  maxLength={index === 0 ? PROFILE_PHONE_OTP_LENGTH : 1}
                  value={digit}
                  onChange={(event) => handlePhoneOtpDigitChange(index, event)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      void verifyPhoneOtp();
                      return;
                    }
                    handlePhoneOtpKeyDown(index, event);
                  }}
                  aria-label={`OTP digit ${index + 1}`}
                  className={`h-12 w-11 rounded-[10px] border bg-white text-center text-[18px] font-semibold text-[#111827] outline-none transition-all focus:border-[#4C6EF5] focus:ring-2 focus:ring-[#4C6EF5]/15 ${phoneOtpError ? 'border-red-300' : 'border-[#D8E0EB]'}`}
                />
              ))}
            </div>

            {phoneOtpError ? (
              <p className="mt-3 rounded-[9px] border border-red-100 bg-red-50 px-3 py-2 text-center text-[12px] font-medium leading-5 text-red-600" role="alert">
                {phoneOtpError}
              </p>
            ) : null}

            <div className="mt-4 text-center text-[12px] text-[#94A3B8]">
              Did not receive code?{' '}
              {phoneOtpResendSeconds > 0 ? (
                <span><span className="font-semibold text-[#4C6EF5]">Resend OTP</span> in {formatOtpResendTime(phoneOtpResendSeconds)}</span>
              ) : (
                <button
                  type="button"
                  onClick={() => { void sendPhoneOtp({ isResend: true }); }}
                  disabled={isSendingPhoneOtp || isVerifyingPhoneOtp}
                  className="font-semibold text-[#4C6EF5] hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSendingPhoneOtp ? 'Sending...' : 'Resend OTP'}
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => { void verifyPhoneOtp(); }}
              disabled={isSendingPhoneOtp || isVerifyingPhoneOtp || phoneOtpDigits.some((digit) => !digit)}
              className="mt-5 flex h-12 w-full items-center justify-center rounded-[10px] bg-[#4C6EF5] text-[15px] font-bold text-white shadow-[0_10px_24px_rgba(76,110,245,0.22)] transition-colors hover:bg-[#3B5BDB] disabled:cursor-not-allowed disabled:bg-[#CBD5E1] disabled:shadow-none"
            >
              {isVerifyingPhoneOtp ? 'Verifying...' : 'Verify'}
            </button>
          </div>
        </div>
      ) : null}

      {isSettingUp && (
        <div className="fixed inset-0 bg-white z-[100] flex flex-col items-center justify-center animate-fade-in">
          <div className="mb-8 scale-110"><Logo /></div>
          <div className="w-64 h-1 bg-gray-200 overflow-hidden mb-6 relative">
            <div
              className="absolute left-0 top-0 h-full bg-[#1A1A1A] transition-all duration-[2000ms] ease-out"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
          <p className="text-[#111827] font-semibold text-xl">Setting up your account...</p>
        </div>
      )}

      <div className="chatterly-auth-shell min-h-screen bg-[#F8F9FB] flex items-center justify-center p-4 md:p-8 font-sans">
        <div className="max-w-[1024px] w-full bg-white rounded-[32px] shadow-[0_8px_30px_rgba(0,0,0,0.04)] flex overflow-hidden min-h-[640px] animate-fade-in">
          
          <div className="login-hero hidden lg:flex w-1/2 p-12 flex-col justify-between relative overflow-hidden">
            <div className="z-10">
              <div className="login-hero__logo mb-12"><Link to="/"><Logo /></Link></div>
              <h1 className="login-hero__title text-4xl font-bold leading-tight mb-4">Make it<br/>yours</h1>
              <p className="login-hero__text text-lg leading-relaxed max-w-[340px]">Upload a photo and write a short bio so your friends and colleagues know it's really you.</p>
            </div>
            <div className="login-hero__glow absolute top-0 right-0 w-64 h-64 rounded-full blur-3xl"></div>
          </div>

          <div className="w-full lg:w-1/2 p-8 md:p-16 flex flex-col justify-center relative">
            <div className="flex flex-col h-full">
              <h2 className="text-[32px] font-bold text-black mb-3 select-none pointer-events-none">Your Chatterly Identity</h2>
              <p className="mb-8 text-lg leading-relaxed text-[#1F2937]">Set up your profile to start chatting.</p>

              <div className="mb-8">
                <div className="flex items-center gap-4">
                  <input
                    type="file"
                    accept="image/jpeg, image/png"
                    className="hidden"
                    ref={fileInputRef}
                    onChange={handleImageUpload}
                  />
                  <div
                    onClick={() => fileInputRef.current.click()}
                    className={`w-16 h-16 rounded-full flex items-center justify-center cursor-pointer transition-colors overflow-hidden group relative flex-shrink-0 ${imageError ? 'bg-red-50 border-2 border-red-400 text-red-400' : 'bg-gray-100 border border-gray-200 text-gray-400 hover:bg-gray-200'}`}
                  >
                    {previewUrl ? (
                      <>
                        <img src={previewUrl} alt="Profile preview" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </div>
                      </>
                    ) : (
                      <>
                        <img src={defaultProfilePic} alt="Default profile avatar" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/25 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                        </div>
                      </>
                    )}
                  </div>
                  <div onClick={() => fileInputRef.current.click()} className="text-sm font-medium text-[#4C6EF5] cursor-pointer hover:underline">
                    {previewUrl ? 'Change Profile Photo' : 'Add Profile Photo'}
                  </div>
                </div>
                
                {imageError && (
                  <div className="mt-2 text-sm text-red-500 font-medium flex items-center gap-1">
                    <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    {imageError}
                  </div>
                )}
              </div>

              <div className="space-y-4 mb-auto overflow-y-auto pr-2 pb-2">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="John Doe"
                    value={fullName}
                    onChange={(e) => setFullName(limitProfileFullName(e.target.value))}
                    maxLength={PROFILE_FULL_NAME_MAX_LENGTH}
                    className="w-full border border-gray-200 rounded-xl px-4 py-4 text-[#212529] font-medium outline-none focus:border-[#4C6EF5] transition-all peer pt-6 pb-2"
                  />
                  <label className="absolute left-4 top-2 text-sm text-[#111827] font-medium pointer-events-none">
                    Full Name <span className="text-red-500" aria-hidden="true">*</span><span className="sr-only"> required</span>
                  </label>
                  <span className="absolute right-4 bottom-3 text-sm font-medium text-[#111827]">
                    {fullName.length}/{PROFILE_FULL_NAME_MAX_LENGTH}
                  </span>
                </div>

                <div className="relative">
                  <div className={`w-full border ${phoneError ? 'border-red-500 focus-within:border-red-500' : 'border-gray-200 focus-within:border-[#4C6EF5]'} rounded-xl bg-white px-4 pt-6 pb-2 transition-all`}>
                    <label className="absolute left-4 top-2 text-sm text-[#111827] font-medium pointer-events-none">
                      Phone <span className="text-red-500" aria-hidden="true">*</span><span className="sr-only"> required</span>
                    </label>
                    <div className="flex items-center gap-3">
                      <div ref={countryMenuRef} className="relative flex h-7 flex-shrink-0 items-center border-r border-gray-200 pr-3">
                        <button
                          type="button"
                          onClick={() => setIsCountryMenuOpen((isOpen) => !isOpen)}
                          disabled={isSendingPhoneOtp || isVerifyingPhoneOtp || isSettingUp}
                          className="flex h-full items-center gap-1 text-sm font-semibold text-[#212529] disabled:cursor-not-allowed"
                          aria-label="Country code"
                          aria-haspopup="listbox"
                          aria-expanded={isCountryMenuOpen}
                        >
                          <img
                            src={selectedCountry.flagSrc}
                            alt=""
                            aria-hidden="true"
                            className="h-3.5 w-5 flex-shrink-0 rounded-[2px] object-cover shadow-[0_0_0_1px_rgba(15,23,42,0.12)]"
                          />
                          <span className="max-w-[112px] truncate">{country} ({selectedCountry.code})</span>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                            <path d="m6 9 6 6 6-6" />
                          </svg>
                        </button>
                        {isCountryMenuOpen ? (
                          <div
                            role="listbox"
                            aria-label="Select country code"
                            className="absolute left-0 top-[calc(100%+8px)] z-[80] w-[208px] overflow-hidden rounded-[10px] border border-gray-200 bg-white py-1 shadow-[0_12px_28px_rgba(15,23,42,0.16)]"
                          >
                            {PROFILE_PHONE_COUNTRIES.map((item) => (
                              <button
                                key={item.name}
                                type="button"
                                role="option"
                                aria-selected={item.name === country}
                                onClick={() => handleCountryChange(item.name)}
                                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                                  item.name === country
                                    ? 'bg-[#EEF2FF] font-semibold text-[#1D4ED8]'
                                    : 'font-medium text-[#212529] hover:bg-gray-50'
                                }`}
                              >
                                <img
                                  src={item.flagSrc}
                                  alt=""
                                  aria-hidden="true"
                                  className="h-3.5 w-5 flex-shrink-0 rounded-[2px] object-cover shadow-[0_0_0_1px_rgba(15,23,42,0.12)]"
                                />
                                <span className="min-w-0 flex-1 truncate">{item.name}</span>
                                <span className="flex-shrink-0 text-gray-500">{item.code}</span>
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <input
                        type="tel"
                        inputMode="numeric"
                        autoComplete="tel-national"
                        placeholder="Phone number"
                        value={formatProfilePhoneForDisplay(phone, selectedCountry)}
                        disabled={isSendingPhoneOtp || isVerifyingPhoneOtp || isSettingUp}
                        onChange={handlePhoneChange}
                        aria-invalid={Boolean(phoneError)}
                        aria-describedby={phoneError ? 'profile-phone-error' : undefined}
                        className="min-w-0 flex-1 bg-transparent text-[#212529] font-medium outline-none placeholder:text-gray-400"
                      />
                      {isPhoneVerified ? (
                        <span className="flex flex-shrink-0 items-center gap-1 text-[13px] font-semibold text-[#16A34A]" aria-label="Mobile number verified">
                          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="m5 12 4 4L19 6" />
                          </svg>
                          Verified
                        </span>
                      ) : isPhoneValid(phone) ? (
                        <button
                          type="button"
                          onClick={() => { void sendPhoneOtp(); }}
                          disabled={isSendingPhoneOtp || isVerifyingPhoneOtp}
                          className="flex h-8 flex-shrink-0 items-center justify-center rounded-[8px] bg-[#4C6EF5] px-3.5 text-[13px] font-bold text-white shadow-[0_5px_12px_rgba(76,110,245,0.2)] transition-colors hover:bg-[#3B5BDB] disabled:cursor-not-allowed disabled:bg-[#A5B4FC]"
                        >
                          {isSendingPhoneOtp ? 'Sending...' : 'Verify'}
                        </button>
                      ) : null}
                    </div>
                  </div>
                  {phoneError && (
                    <div id="profile-phone-error" className="mt-1 ml-1 text-sm font-medium text-red-500 flex items-center gap-1" role="alert">
                      <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      {phoneError}
                    </div>
                  )}
                </div>

                <div>
                  <DateOfBirthField
                    parts={dateOfBirthParts}
                    onPartsChange={setDateOfBirthParts}
                    hasError={Boolean(dobError)}
                  />
                  {dobError && (
                    <div className="mt-1 ml-1 text-sm font-medium text-red-500 flex items-center gap-1">
                      <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      {dobError}
                    </div>
                  )}
                </div>

                <div className="relative">
                  <textarea
                    placeholder="Tell us about yourself..."
                    value={bio}
                    onChange={(e) => setBio(limitProfileStatusForTyping(e.target.value))}
                    maxLength={250}
                    className="h-24 w-full resize-none overflow-y-auto rounded-xl border border-gray-200 px-4 pb-8 pt-8 font-medium leading-5 text-[#212529] outline-none transition-all focus:border-[#4C6EF5]"
                  />
                  <label className="pointer-events-none absolute left-4 top-2 bg-white pr-1 text-sm font-medium text-[#111827]">Bio (Optional)</label>
                  <span className="pointer-events-none absolute bottom-3 right-4 bg-white pl-1 text-sm font-medium text-[#111827]">{bio.length}/250</span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleProfileSubmit}
                disabled={isSettingUp || isSendingPhoneOtp || isVerifyingPhoneOtp}
                aria-disabled={!isProfileValid || !!imageError || !!dobError || isSettingUp || isSendingPhoneOtp || isVerifyingPhoneOtp}
                className={`mt-6 w-full font-bold py-4 px-6 rounded-2xl transition-all flex-shrink-0 ${isProfileValid && !imageError && !dobError ? 'bg-[#4C6EF5] text-white hover:bg-[#3b5bdb]' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
