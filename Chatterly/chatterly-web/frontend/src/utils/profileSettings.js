import { normalizePhone } from './formValidators.js';
import { updateProfile } from '../api/contactapi.js';
import { getStoredUser, normalizeProfile, persistProfileToStorage } from './profile.js';

export const normalizeDatePickerValue = (value = '') => {
  const trimmedValue = String(value || '').trim();
  if (!trimmedValue) return '';

  const isoDateMatch = trimmedValue.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T)/);
  if (isoDateMatch) {
    return `${isoDateMatch[1]}-${isoDateMatch[2]}-${isoDateMatch[3]}`;
  }

  const localDateMatch = trimmedValue.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (localDateMatch) {
    return `${localDateMatch[3]}-${localDateMatch[2]}-${localDateMatch[1]}`;
  }

  return '';
};

export const PROFILE_SETTINGS_DOB_MIN = '1900-01-01';
const DATE_PICKER_ISO_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export const getCurrentDatePickerValue = (today = new Date()) => {
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const validateDatePickerValue = (value = '', validityState = null) => {
  const trimmedValue = String(value || '').trim();

  if (!trimmedValue) {
    return validityState?.badInput ? 'Enter a valid date of birth.' : '';
  }

  const normalizedValue = normalizeDatePickerValue(trimmedValue);
  const isoDateMatch = normalizedValue.match(DATE_PICKER_ISO_PATTERN);

  if (!isoDateMatch) {
    return 'Enter a valid date of birth.';
  }

  const [, yearValue, monthValue, dayValue] = isoDateMatch;
  const year = Number(yearValue);
  const month = Number(monthValue);
  const day = Number(dayValue);
  const parsedDate = new Date(`${yearValue}-${monthValue}-${dayValue}T00:00:00`);
  const isDateValid = (
    Number.isInteger(year) &&
    Number.isInteger(month) &&
    Number.isInteger(day) &&
    parsedDate.getFullYear() === year &&
    parsedDate.getMonth() === month - 1 &&
    parsedDate.getDate() === day
  );

  if (!isDateValid) {
    return 'Enter a valid date of birth.';
  }

  if (validityState?.rangeUnderflow || normalizedValue < PROFILE_SETTINGS_DOB_MIN) {
    return 'Year must be 1900 or later.';
  }

  if (validityState?.rangeOverflow || normalizedValue > getCurrentDatePickerValue()) {
    return 'Date of birth cannot be in the future.';
  }

  return '';
};

// Inline account edits send only changed fields. Profile identity belongs to
// the separate Edit Profile form and must not be revalidated on DOB changes.
export const buildProfileSettingsUpdatePayload = (changes = {}) => {
  const payload = {};
  Object.entries(changes).forEach(([key, value]) => {
    if (value === undefined) return;
    if (key === 'phone') {
      payload.phone = String(value || '').trim() ? normalizePhone(value) : '';
    } else if (key === 'dob' || key === 'dateOfBirth') {
      const dob = normalizeDatePickerValue(value);
      payload.dob = dob;
      payload.dateOfBirth = dob;
    } else {
      payload[key] = value;
    }
  });
  return payload;
};

export const saveProfileSettingsFields = async (profile, changes) => {
  const payload = buildProfileSettingsUpdatePayload(changes);
  const response = await updateProfile(payload, { mode: 'update' });
  const mergedProfileData = { ...profile.raw, ...payload, ...response };
  // Older deployments don't echo DOB. Retain the selected date in the
  // existing frontend cache instead of replacing it with the stale response.
  if (Object.hasOwn(payload, 'dob')) {
    mergedProfileData.dob = payload.dob;
    mergedProfileData.dateOfBirth = payload.dateOfBirth;
  }
  const nextProfile = normalizeProfile(mergedProfileData, getStoredUser());
  persistProfileToStorage(nextProfile, { updateDateOfBirth: Object.hasOwn(payload, 'dob') });
  return nextProfile;
};
