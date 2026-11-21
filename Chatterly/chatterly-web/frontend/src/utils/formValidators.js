/**
 * Form Validation Utilities
 * Email and phone number validation
 */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const EMAIL_MAX_LENGTH = 254;
export const PHONE_COUNTRY_CODE = '+91';
export const PHONE_LOCAL_DIGIT_LIMIT = 10;
const PHONE_COUNTRY_CODE_DIGITS = PHONE_COUNTRY_CODE.replace('+', '');
const PHONE_REGEX = new RegExp(`^\\+${PHONE_COUNTRY_CODE_DIGITS}\\d{${PHONE_LOCAL_DIGIT_LIMIT}}$`);
const PHONE_DIGITS_ONLY = new RegExp(`^\\d{${PHONE_LOCAL_DIGIT_LIMIT}}$`);
const PHONE_LOCAL_START_DIGIT_REGEX = /^[6-9]/;
const EXPLICIT_COUNTRY_CODE_PATTERN = /^\s*\+?\s*91(?:\s|$)/;
const PHONE_ALLOWED_CHARACTERS_PATTERN = /^[\d+\s()-]+$/;
const INVALID_PHONE_FORMAT_MESSAGE =
  'Invalid phone number. Enter a 10-digit Indian mobile number starting with 6, 7, 8, or 9.';

export const validateEmail = (email) => {
  if (!email || !email.trim()) {
    return { valid: false, error: 'Email is required' };
  }

  const trimmedEmail = email.trim().toLowerCase();

  if (trimmedEmail.length > EMAIL_MAX_LENGTH) {
    return { valid: false, error: `Email ID cannot exceed ${EMAIL_MAX_LENGTH} characters` };
  }

  if (!EMAIL_REGEX.test(trimmedEmail)) {
    return { valid: false, error: 'Invalid email format (e.g., user@example.com)' };
  }

  return { valid: true, error: '' };
};

const getOnlyPhoneDigits = (phone = '') => String(phone || '').replace(/\D/g, '');

export const extractLocalPhoneDigits = (phone = '') => {
  const stringValue = String(phone || '');
  const cleanedDigits = getOnlyPhoneDigits(stringValue);

  if (!cleanedDigits) {
    return '';
  }

  const hasExplicitCountryCode = EXPLICIT_COUNTRY_CODE_PATTERN.test(stringValue);

  if (
    cleanedDigits.startsWith(PHONE_COUNTRY_CODE_DIGITS) &&
    (hasExplicitCountryCode || cleanedDigits.length > PHONE_LOCAL_DIGIT_LIMIT)
  ) {
    return cleanedDigits.slice(PHONE_COUNTRY_CODE_DIGITS.length);
  }

  return cleanedDigits;
};

export const sanitizePhoneDigits = (phone = '') =>
  extractLocalPhoneDigits(phone).slice(0, PHONE_LOCAL_DIGIT_LIMIT);

export const normalizePhone = (phone) => {
  const localDigits = sanitizePhoneDigits(phone);

  if (!localDigits) {
    return '';
  }

  return `${PHONE_COUNTRY_CODE}${localDigits}`;
};

export const validatePhone = (phone) => {
  const rawPhone = String(phone || '').trim();
  const localDigits = extractLocalPhoneDigits(phone);

  if (!rawPhone) {
    return { valid: false, error: 'Phone number is required' };
  }

  if (!PHONE_ALLOWED_CHARACTERS_PATTERN.test(rawPhone)) {
    return {
      valid: false,
      error: 'Invalid phone number. Use numbers only.',
    };
  }

  if (!localDigits || localDigits.length !== PHONE_LOCAL_DIGIT_LIMIT) {
    return {
      valid: false,
      error: INVALID_PHONE_FORMAT_MESSAGE,
    };
  }

  if (!PHONE_DIGITS_ONLY.test(localDigits)) {
    return {
      valid: false,
      error: 'Invalid phone number. Use numbers only.',
    };
  }

  if (!PHONE_LOCAL_START_DIGIT_REGEX.test(localDigits)) {
    return {
      valid: false,
      error: INVALID_PHONE_FORMAT_MESSAGE,
    };
  }

  if (!PHONE_REGEX.test(normalizePhone(localDigits))) {
    return {
      valid: false,
      error: INVALID_PHONE_FORMAT_MESSAGE,
    };
  }

  return { valid: true, error: '' };
};

export const validateProfileForm = (formData, options = {}) => {
  const errors = {};
  const requirePhone = options.requirePhone === true;
  const requireEmail = options.requireEmail === true;
  const requiredPhoneMessage = options.requiredPhoneMessage || 'Phone number is required';
  const requiredEmailMessage = options.requiredEmailMessage || 'Email is required';

  // First name
  if (formData.firstName !== undefined && formData.firstName.trim()) {
    if (formData.firstName.trim().length < 2) {
      errors.firstName = 'First name must be at least 2 characters';
    }
    if (formData.firstName.trim().length > 30) {
      errors.firstName = 'First name cannot exceed 30 characters';
    }
  }

  // Last name
  if (formData.lastName !== undefined && formData.lastName.trim()) {
    if (formData.lastName.trim().length < 2) {
      errors.lastName = 'Last name must be at least 2 characters';
    }
    if (formData.lastName.trim().length > 30) {
      errors.lastName = 'Last name cannot exceed 30 characters';
    }
  }

  // Status
  if (formData.status !== undefined && formData.status.trim()) {
    if (formData.status.trim().length > 150) {
      errors.status = 'Status cannot exceed 150 characters';
    }
  }

  // Email
  const trimmedEmail = String(formData.email || '').trim();
  if (requireEmail && !trimmedEmail) {
    errors.email = requiredEmailMessage;
  } else if (formData.email !== undefined && trimmedEmail) {
    const emailValidation = validateEmail(formData.email);
    if (!emailValidation.valid) {
      errors.email = emailValidation.error;
    }
  }

  // Phone
  const trimmedPhone = String(formData.phone || '').trim();
  if (requirePhone && !trimmedPhone) {
    errors.phone = requiredPhoneMessage;
  } else if (formData.phone !== undefined && trimmedPhone) {
    const phoneValidation = validatePhone(formData.phone);
    if (!phoneValidation.valid) {
      errors.phone = phoneValidation.error;
    }
  }

  return errors;
};

export default {
  extractLocalPhoneDigits,
  sanitizePhoneDigits,
  validateEmail,
  validatePhone,
  validateProfileForm,
  normalizePhone,
};
