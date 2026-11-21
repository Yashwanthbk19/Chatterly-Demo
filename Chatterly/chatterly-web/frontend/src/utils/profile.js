import defaultProfilePic from '../assets/image.png';

const DEFAULT_STATUS = 'Hey there! I am using Chatterly';
export const PROFILE_FULL_NAME_MAX_LENGTH = 25;
export const PROFILE_NAME_PART_MAX_LENGTH = 25;
export const PROFILE_STATUS_MAX_LENGTH = 250;
const SCRIPT_TAG_PATTERN = /<script\b[^>]*>[\s\S]*?<\/script>/gi;
const HTML_TAG_PATTERN = /<[^>]*>/g;
const DANGEROUS_NAME_TOKENS_PATTERN =
  /\b(?:script|javascript|vbscript|onerror|onload|onclick|alert|prompt|confirm|eval|document|window)\b/gi;
const INVALID_NAME_CHARACTERS_PATTERN = /[^\p{L}\p{M}\p{Extended_Pictographic}\p{Emoji_Presentation}\p{Emoji_Modifier}\u200D\uFE0F\s'.-]/gu;
const INVALID_PROFILE_PICTURE_VALUES = new Set(['null', 'undefined', 'false', 'nan']);
const PROFILE_USERNAME_KEYS = ['username', 'name', 'fullName'];
const PROFILE_PHONE_KEYS = ['phone', 'mobile'];
const PROFILE_EMAIL_KEYS = ['email'];
const PROFILE_COMPLETION_FLAG_KEYS = ['isProfileComplete', 'profileComplete', 'profileCompleted'];
const EMAIL_REQUIRED_AUTH_PROVIDERS = new Set(['email', 'google']);
const PROFILE_CACHE_STORAGE_KEY = 'chatterly_profile_cache';
export const PROFILE_DOB_CACHE_STORAGE_KEY = 'chatterly_profile_dates';
const PROFILE_IMAGE_KEYS = [
  'profileImage',
  'profilePic',
  'profilePicture',
  'photo',
  'photoURL',
  'avatar',
  'avatarUrl',
  'image',
];
export const DEFAULT_PROFILE_PICTURE = defaultProfilePic;

const pickField = (source, keys = []) => {
  if (!source || typeof source !== 'object') {
    return '';
  }

  for (const key of keys) {
    const value = source[key];

    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }

  return '';
};

// BUG_USR_027 FIX: Pick field that explicitly handles null (for profilePic removal)
const pickFieldWithNull = (source, keys = []) => {
  if (!source || typeof source !== 'object') {
    return undefined;
  }

  for (const key of keys) {
    if (key in source) {
      const value = source[key];
      // Return null/empty string explicitly if set, so we know it was intentionally cleared
      if (value === null) return null;
      if (value === '') return '';
      if (value !== undefined && value !== '') {
        return value;
      }
    }
  }

  return undefined;
};

function readStoredProfileCache(storageKey = PROFILE_CACHE_STORAGE_KEY) {
  if (typeof localStorage === 'undefined') {
    return {};
  }

  try {
    const parsedValue = JSON.parse(localStorage.getItem(storageKey) || '{}');
    return parsedValue && typeof parsedValue === 'object' && !Array.isArray(parsedValue)
      ? parsedValue
      : {};
  } catch (error) {
    console.error('Unable to parse stored profile cache:', error);
    return {};
  }
}

function writeStoredProfileCache(cache = {}, storageKey = PROFILE_CACHE_STORAGE_KEY) {
  if (typeof localStorage === 'undefined') {
    return;
  }

  localStorage.setItem(storageKey, JSON.stringify(cache));
}

const getProfileDateCacheKey = (profile) => {
  const accountId = String(pickField(profile, ['_id', 'id', 'userId']) || '').trim();
  return accountId ? `id:${accountId}` : '';
};

function getStoredProfileDateOfBirth(profile) {
  const accountKey = getProfileDateCacheKey(profile);
  if (!accountKey) return '';
  const dob = readStoredProfileCache(PROFILE_DOB_CACHE_STORAGE_KEY)[accountKey];
  return typeof dob === 'string' ? dob.trim() : '';
}

function persistStoredProfileDateOfBirth(profile, dob) {
  const accountKey = getProfileDateCacheKey(profile);
  const dateOfBirth = String(dob || '').trim();
  if (!accountKey || !dateOfBirth) return;
  const dates = readStoredProfileCache(PROFILE_DOB_CACHE_STORAGE_KEY);
  dates[accountKey] = dateOfBirth;
  writeStoredProfileCache(dates, PROFILE_DOB_CACHE_STORAGE_KEY);
}

// Migrate dates saved before the dedicated date record existed. Logout can
// then discard the full profile and session caches while retaining only DOB.
export const preserveStoredProfileDateOfBirth = () => {
  const user = getStoredUser();
  persistStoredProfileDateOfBirth(user, pickField(user, ['dob', 'dateOfBirth']));
};

function buildStoredProfileCacheKeys(profile = {}) {
  if (!profile || typeof profile !== 'object') {
    return [];
  }

  const cacheKeys = new Set();
  const appendCacheKey = (prefix, value, normalizeValue = (entry) => String(entry || '').trim()) => {
    const normalizedValue = normalizeValue(value);
    if (normalizedValue) {
      cacheKeys.add(`${prefix}:${normalizedValue}`);
    }
  };

  appendCacheKey('id', pickField(profile, ['_id', 'id', 'userId']));
  appendCacheKey('email', pickField(profile, PROFILE_EMAIL_KEYS), (value) => String(value || '').trim().toLowerCase());
  appendCacheKey('phone', pickField(profile, PROFILE_PHONE_KEYS), (value) => String(value || '').replace(/\D/g, ''));

  return Array.from(cacheKeys);
}

function getCachedStoredProfile(profile = {}) {
  const cacheKeys = buildStoredProfileCacheKeys(profile);
  if (!cacheKeys.length) {
    return null;
  }

  const storedProfileCache = readStoredProfileCache();
  for (const cacheKey of cacheKeys) {
    const cachedProfile = storedProfileCache[cacheKey];
    if (cachedProfile && typeof cachedProfile === 'object') {
      return cachedProfile;
    }
  }

  return null;
}

function persistStoredProfileCache(profile = {}) {
  const cacheKeys = buildStoredProfileCacheKeys(profile);
  if (!cacheKeys.length) {
    return;
  }

  const storedProfileCache = readStoredProfileCache();
  const cachedProfile = { ...profile };

  cacheKeys.forEach((cacheKey) => {
    storedProfileCache[cacheKey] = cachedProfile;
  });

  writeStoredProfileCache(storedProfileCache);
}

function mergeStoredUserWithCachedProfile(storedUser, cachedProfile) {
  if (!storedUser || typeof storedUser !== 'object' || !cachedProfile || typeof cachedProfile !== 'object') {
    return storedUser;
  }

  const mergedUser = {
    ...cachedProfile,
    ...storedUser,
  };

  const persistedName = limitProfileFullName(
    pickField(storedUser, PROFILE_USERNAME_KEYS) || pickField(cachedProfile, PROFILE_USERNAME_KEYS) || ''
  );
  const persistedFirstName = limitProfileNamePart(
    pickField(storedUser, ['firstName']) || pickField(cachedProfile, ['firstName']) || ''
  );
  const persistedLastName = limitProfileNamePart(
    pickField(storedUser, ['lastName']) || pickField(cachedProfile, ['lastName']) || ''
  );
  const persistedStatus = limitProfileStatus(
    pickField(storedUser, ['status', 'bio']) || pickField(cachedProfile, ['status', 'bio']) || ''
  );
  const persistedPhone = String(
    pickField(storedUser, PROFILE_PHONE_KEYS) || pickField(cachedProfile, PROFILE_PHONE_KEYS) || ''
  ).trim();
  const persistedEmail = String(
    pickField(storedUser, PROFILE_EMAIL_KEYS) || pickField(cachedProfile, PROFILE_EMAIL_KEYS) || ''
  ).trim();
  const persistedDob = String(
    pickField(storedUser, ['dob', 'dateOfBirth']) || pickField(cachedProfile, ['dob', 'dateOfBirth']) || ''
  ).trim();
  const persistedAuthProvider = String(
    pickField(storedUser, ['authProvider']) || pickField(cachedProfile, ['authProvider']) || ''
  ).trim();
  const persistedProfileImage = resolveProfileDisplayPicture(
    pickField(storedUser, PROFILE_IMAGE_KEYS) || pickField(cachedProfile, PROFILE_IMAGE_KEYS) || ''
  );

  if (persistedName) {
    mergedUser.username = persistedName;
    mergedUser.fullName = persistedName;
    mergedUser.name = persistedName;
  }

  mergedUser.firstName = persistedFirstName;
  mergedUser.lastName = persistedLastName;

  if (persistedStatus) {
    mergedUser.status = persistedStatus;
    mergedUser.bio = persistedStatus;
  }

  if (persistedPhone) {
    mergedUser.phone = persistedPhone;
    mergedUser.mobile = persistedPhone;
  }

  if (persistedEmail) {
    mergedUser.email = persistedEmail;
  }

  if (persistedDob) {
    mergedUser.dob = persistedDob;
    mergedUser.dateOfBirth = persistedDob;
  }

  if (persistedAuthProvider) {
    mergedUser.authProvider = persistedAuthProvider;
  }

  mergedUser.profileImage = persistedProfileImage;
  mergedUser.profilePic = persistedProfileImage;
  mergedUser.profilePicture = persistedProfileImage;
  mergedUser.photo = persistedProfileImage;
  mergedUser.photoURL = persistedProfileImage;
  mergedUser.avatar = persistedProfileImage;
  mergedUser.avatarUrl = persistedProfileImage;
  mergedUser.image = persistedProfileImage;

  return mergedUser;
}

export const getStoredUser = () => {
  try {
    const storedUser = JSON.parse(localStorage.getItem('user') || 'null');
    const cachedProfile = getCachedStoredProfile(storedUser);
    const mergedUser = mergeStoredUserWithCachedProfile(storedUser, cachedProfile);
    const savedDob = getStoredProfileDateOfBirth(storedUser);
    return savedDob && mergedUser
      ? { ...mergedUser, dob: savedDob, dateOfBirth: savedDob }
      : mergedUser;
  } catch (error) {
    console.error('Unable to parse stored user profile:', error);
    return null;
  }
};

const normalizeWhitespace = (value = '') =>
  String(value)
    .replace(/\s+/g, ' ')
    .trim();

const normalizeWhitespaceForTyping = (value = '') => {
  const stringValue = String(value);
  const hasTrailingWhitespace = /\s$/.test(stringValue);
  const normalizedValue = stringValue.replace(/\s+/g, ' ').trimStart();

  if (!normalizedValue) {
    return '';
  }

  return hasTrailingWhitespace
    ? `${normalizedValue.trimEnd()} `
    : normalizedValue.trimEnd();
};

const stripUnsafeProfileNameCharacters = (value = '') =>
  String(value)
    .replace(SCRIPT_TAG_PATTERN, ' ')
    .replace(HTML_TAG_PATTERN, ' ')
    .replace(DANGEROUS_NAME_TOKENS_PATTERN, ' ')
    .replace(/[<>]/g, ' ')
    .replace(INVALID_NAME_CHARACTERS_PATTERN, ' ');

export const sanitizeProfileName = (value = '') =>
  normalizeWhitespace(stripUnsafeProfileNameCharacters(value));

export const limitProfileNamePart = (value = '') =>
  normalizeWhitespace(stripUnsafeProfileNameCharacters(value).slice(0, PROFILE_NAME_PART_MAX_LENGTH));

export const splitFullName = (value = '') => {
  const trimmedValue = sanitizeProfileName(value);

  if (!trimmedValue) {
    return {
      firstName: '',
      lastName: '',
    };
  }

  const [firstName = '', ...remainingParts] = trimmedValue.split(/\s+/);

  return {
    firstName: limitProfileNamePart(firstName),
    lastName: limitProfileNamePart(remainingParts.join(' ')),
  };
};

export const limitProfileFullName = (value = '') =>
  normalizeWhitespaceForTyping(stripUnsafeProfileNameCharacters(value).slice(0, PROFILE_FULL_NAME_MAX_LENGTH));

export const limitProfileStatusForTyping = (value = '') =>
  String(value).slice(0, PROFILE_STATUS_MAX_LENGTH);

export const limitProfileStatus = (value = '') =>
  String(value).slice(0, PROFILE_STATUS_MAX_LENGTH).trim();

export const normalizeProfilePictureValue = (value = '') => {
  if (value === null || value === undefined) {
    return '';
  }

  const trimmedValue = String(value).trim();
  if (!trimmedValue) {
    return '';
  }

  const comparableValue = trimmedValue.split(/[?#]/, 1)[0].trim().toLowerCase();
  if (INVALID_PROFILE_PICTURE_VALUES.has(comparableValue)) {
    return '';
  }

  return trimmedValue;
};

const getComparableProfilePictureValue = (value = '') =>
  normalizeProfilePictureValue(value)
    .split(/[?#]/, 1)[0]
    .replace(/\\/g, '/')
    .trim()
    .toLowerCase();

export const isDefaultProfilePictureValue = (value = '') => {
  const comparableValue = getComparableProfilePictureValue(value);
  const comparableDefaultProfilePic = getComparableProfilePictureValue(DEFAULT_PROFILE_PICTURE);

  return Boolean(
    comparableValue &&
      (
        comparableValue === comparableDefaultProfilePic ||
        comparableValue.endsWith('/assets/image.png') ||
        comparableValue.endsWith('/src/assets/image.png') ||
        comparableValue === '/assets/image.png' ||
        comparableValue === '/src/assets/image.png' ||
        comparableValue.startsWith('https://ui-avatars.com/api/')
      )
  );
};

export const isCustomProfilePictureValue = (value = '') => {
  const normalizedValue = normalizeProfilePictureValue(value);
  return Boolean(normalizedValue && !isDefaultProfilePictureValue(normalizedValue));
};

export const resolveProfileDisplayPicture = (value = '') =>
  isCustomProfilePictureValue(value)
    ? normalizeProfilePictureValue(value)
    : DEFAULT_PROFILE_PICTURE;

export const cacheBustProfilePictureValue = (value = '', cacheKey = Date.now()) => {
  const normalizedValue = normalizeProfilePictureValue(value);
  if (
    !normalizedValue ||
    normalizedValue.startsWith('data:') ||
    normalizedValue.startsWith('blob:')
  ) {
    return normalizedValue;
  }

  if (/[?&]t=\d+/i.test(normalizedValue)) {
    return normalizedValue.replace(/([?&])t=\d+/i, `$1t=${cacheKey}`);
  }

  const separator = normalizedValue.includes('?') ? '&' : '?';
  return `${normalizedValue}${separator}t=${cacheKey}`;
};

const hasMeaningfulProfileName = (profile = {}) => {
  const fullName = limitProfileFullName(pickField(profile, PROFILE_USERNAME_KEYS));
  const email = String(pickField(profile, ['email'])).trim().toLowerCase();
  const profilePhoneDigits = String(pickField(profile, PROFILE_PHONE_KEYS)).replace(/\D/g, '');
  const fullNameDigits = fullName.replace(/\D/g, '');

  if (!fullName) {
    return false;
  }

  if (email && fullName.toLowerCase() === email) {
    return false;
  }

  if (profilePhoneDigits && fullNameDigits && fullNameDigits === profilePhoneDigits) {
    return false;
  }

  return true;
};

export const hasCompletedProfile = (profile = {}) => {
  if (!profile || typeof profile !== 'object') {
    return false;
  }

  if (
    profile.isProfileComplete === true ||
    profile.profileComplete === true ||
    profile.profileCompleted === true
  ) {
    return true;
  }

  const firstName = sanitizeProfileName(pickField(profile, ['firstName']));
  const lastName = sanitizeProfileName(pickField(profile, ['lastName']));
  const dob = String(pickField(profile, ['dob', 'dateOfBirth'])).trim();
  const profilePic = normalizeProfilePictureValue(pickField(profile, PROFILE_IMAGE_KEYS));

  return Boolean(firstName || lastName || hasMeaningfulProfileName(profile) || dob || profilePic);
};

const parseProfileCompletionFlag = (value) => {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  const normalizedValue = String(value).trim().toLowerCase();
  if (normalizedValue === 'true' || normalizedValue === '1') {
    return true;
  }

  if (normalizedValue === 'false' || normalizedValue === '0') {
    return false;
  }

  return null;
};

const resolveExplicitProfileCompletionFlag = (profile = {}, fallbackUser = null) => {
  const candidateValues = [
    ...PROFILE_COMPLETION_FLAG_KEYS.map((key) => profile?.[key]),
    ...PROFILE_COMPLETION_FLAG_KEYS.map((key) => fallbackUser?.[key]),
  ]
    .map((value) => parseProfileCompletionFlag(value))
    .filter((value) => value !== null);

  if (!candidateValues.length) {
    return null;
  }

  if (candidateValues.includes(true)) {
    return true;
  }

  return false;
};

export const hasCompletedProfileSetup = (profile = {}, fallbackUser = null) => {
  if (!profile || typeof profile !== 'object') {
    return false;
  }

  // The account's own completion flag is authoritative. The phone number the
  // setup form asks email/Google sign-ups for is optional on the server, so an
  // account the server calls complete may have none — checking the phone first
  // sent such a user to Profile Setup from any freshly opened tab (the tab that
  // signed in had already moved on), where create-profile then refuses with
  // "Profile already completed". The setup form still requires the phone.
  const explicitCompletionFlag = resolveExplicitProfileCompletionFlag(profile, fallbackUser);

  if (explicitCompletionFlag !== null) {
    return explicitCompletionFlag;
  }

  const requiresPhone = isEmailRequiredForAccount(profile, fallbackUser);
  const hasPhone = Boolean(
    String(
      pickField(profile, PROFILE_PHONE_KEYS) || pickField(fallbackUser, PROFILE_PHONE_KEYS) || ''
    ).trim()
  );

  if (requiresPhone && !hasPhone) {
    return false;
  }

  const dob = String(
    pickField(profile, ['dob', 'dateOfBirth']) || pickField(fallbackUser, ['dob', 'dateOfBirth']) || ''
  ).trim();

  return Boolean(dob);
};

export const getInitials = (value = '') =>
  String(value)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || '?';

const resolveNormalizedProfileImage = (profile = {}, fallbackUser = null) => {
  const profileImageFromApi = pickFieldWithNull(profile, PROFILE_IMAGE_KEYS);
  const profileImageFromFallback = pickField(fallbackUser, PROFILE_IMAGE_KEYS);

  if (profileImageFromApi === null || profileImageFromApi === '') {
    return DEFAULT_PROFILE_PICTURE;
  }

  if (profileImageFromApi !== undefined) {
    return resolveProfileDisplayPicture(profileImageFromApi);
  }

  if (profileImageFromFallback) {
    return resolveProfileDisplayPicture(profileImageFromFallback);
  }

  return DEFAULT_PROFILE_PICTURE;
};

export const getAccountAuthProvider = (profile = {}, fallbackUser = null) =>
  String(pickField(profile, ['authProvider']) || pickField(fallbackUser, ['authProvider']) || '')
    .trim()
    .toLowerCase();

export const isEmailRequiredForAccount = (profile = {}, fallbackUser = null) => {
  const authProvider = getAccountAuthProvider(profile, fallbackUser);

  if (authProvider) {
    return EMAIL_REQUIRED_AUTH_PROVIDERS.has(authProvider);
  }

  // Fall back to the persisted email when older auth payloads do not expose the provider.
  return Boolean(
    String(pickField(profile, PROFILE_EMAIL_KEYS) || pickField(fallbackUser, PROFILE_EMAIL_KEYS) || '').trim()
  );
};

export const buildProfileDataModel = (profile = {}, fallbackUser = null) => {
  const profileName = sanitizeProfileName(pickField(profile, PROFILE_USERNAME_KEYS));
  const fallbackName = sanitizeProfileName(pickField(fallbackUser, PROFILE_USERNAME_KEYS));
  const parsedName = splitFullName(profileName || fallbackName);

  const firstName = limitProfileNamePart(pickField(profile, ['firstName']) || parsedName.firstName);
  const lastName = limitProfileNamePart(pickField(profile, ['lastName']) || parsedName.lastName);
  const username = limitProfileFullName(
    `${firstName} ${lastName}`.trim() || profileName || fallbackName
  );
  const phone = String(pickField(profile, PROFILE_PHONE_KEYS) || pickField(fallbackUser, PROFILE_PHONE_KEYS) || '').trim();
  const email = String(pickField(profile, PROFILE_EMAIL_KEYS) || pickField(fallbackUser, PROFILE_EMAIL_KEYS) || '').trim();
  const profileImage = resolveNormalizedProfileImage(profile, fallbackUser);

  return {
    username,
    phone,
    email,
    profileImage,
    firstName,
    lastName,
  };
};

export const normalizeProfile = (profile = {}, fallbackUser = null) => {
  const profileDataModel = buildProfileDataModel(profile, fallbackUser);
  const status = limitProfileStatus(
    pickField(profile, ['status', 'bio']) || pickField(fallbackUser, ['status', 'bio']) || DEFAULT_STATUS
  );
  const dob = String(
    pickField(profile, ['dob', 'dateOfBirth']) || pickField(fallbackUser, ['dob', 'dateOfBirth']) || ''
  ).trim();

  return {
    _id: pickField(profile, ['_id']) || pickField(fallbackUser, ['_id']) || '',
    id: pickField(profile, ['id']) || pickField(fallbackUser, ['id']) || '',
    userId: pickField(profile, ['userId']) || pickField(fallbackUser, ['userId']) || '',
    authProvider: getAccountAuthProvider(profile, fallbackUser),
    firstName: profileDataModel.firstName,
    lastName: profileDataModel.lastName,
    username: profileDataModel.username,
    fullName: profileDataModel.username,
    name: profileDataModel.username,
    status,
    phone: profileDataModel.phone,
    email: profileDataModel.email,
    dob,
    dateOfBirth: dob,
    profileImage: profileDataModel.profileImage,
    profilePic: profileDataModel.profileImage,
    initials: getInitials(profileDataModel.username),
    raw: profile,
  };
};

export const persistProfileToStorage = (profile = {}, { updateDateOfBirth = false } = {}) => {
  const currentUser = getStoredUser() || {};
  const normalizedProfile = normalizeProfile(profile, currentUser);
  const { raw: _RAW, ...profileWithoutRaw } = profile || {};
  const persistedPhone = String(
    pickField(profile, PROFILE_PHONE_KEYS) || pickField(currentUser, PROFILE_PHONE_KEYS) || ''
  ).trim();
  const persistedEmail = String(
    pickField(profile, PROFILE_EMAIL_KEYS) || pickField(currentUser, PROFILE_EMAIL_KEYS) || ''
  ).trim();
  const dateProfile = getProfileDateCacheKey(profile) ? profile : currentUser;
  const incomingDob = String(pickField(profile, ['dob', 'dateOfBirth']) || '').trim();
  // Login responses may omit DOB or echo an older value. Only an explicit
  // date edit should replace the preference selected on this browser.
  const persistedDob =
    (updateDateOfBirth && incomingDob) ||
    getStoredProfileDateOfBirth(dateProfile) ||
    incomingDob ||
    String(pickField(currentUser, ['dob', 'dateOfBirth']) || '').trim();
  const persistedLanguage = String(
    pickField(profile?.raw, ['language']) || pickField(profile, ['language']) || currentUser.language || ''
  ).trim();
  const persistedTimeZone = String(
    pickField(profile?.raw, ['timeZone']) || pickField(profile, ['timeZone']) || currentUser.timeZone || ''
  ).trim();
  const persistedAuthProvider = getAccountAuthProvider(profile, currentUser);
  
  // BUG_USR_027 FIX: If the image is explicitly empty/null, clear it from storage too
  const shouldClearPic =
    profile?.profileImage === null ||
    profile?.profileImage === '' ||
    profile?.profilePic === null ||
    profile?.profilePic === '';
  
  const mergedUser = {
    ...currentUser,
    ...profileWithoutRaw,
    authProvider: normalizedProfile.authProvider || currentUser.authProvider || '',
    username: normalizedProfile.username,
    firstName: normalizedProfile.firstName,
    lastName: normalizedProfile.lastName,
    fullName: normalizedProfile.username,
    name: normalizedProfile.username,
    status: normalizedProfile.status,
    phone: normalizedProfile.phone || persistedPhone,
    mobile: normalizedProfile.phone || persistedPhone,
    email: normalizedProfile.email || persistedEmail,
    dob: persistedDob || currentUser.dob || currentUser.dateOfBirth || '',
    dateOfBirth: persistedDob || currentUser.dateOfBirth || currentUser.dob || '',
    language: persistedLanguage || currentUser.language || 'English (India)',
    timeZone: persistedTimeZone || currentUser.timeZone || 'GMT+05:30 - Asia/Kolkata',
    firstLoginDate:
      profileWithoutRaw.firstLoginDate ||
      profileWithoutRaw.firstLoginAt ||
      currentUser.firstLoginDate ||
      currentUser.firstLoginAt ||
      '',
    firstLoginAt:
      profileWithoutRaw.firstLoginAt ||
      profileWithoutRaw.firstLoginDate ||
      currentUser.firstLoginAt ||
      currentUser.firstLoginDate ||
      '',
    profileImage: shouldClearPic
      ? DEFAULT_PROFILE_PICTURE
      : resolveProfileDisplayPicture(normalizedProfile.profileImage || currentUser.profileImage || currentUser.profilePic),
    profilePic: shouldClearPic
      ? DEFAULT_PROFILE_PICTURE
      : resolveProfileDisplayPicture(normalizedProfile.profileImage || currentUser.profileImage || currentUser.profilePic),
  };

  const resolvedProfileCompletion = hasCompletedProfileSetup(
    {
      ...mergedUser,
      authProvider: persistedAuthProvider || currentUser.authProvider || '',
      email: mergedUser.email || persistedEmail,
      phone: mergedUser.phone || persistedPhone,
      mobile: mergedUser.mobile || persistedPhone,
      dob: mergedUser.dob || persistedDob,
      dateOfBirth: mergedUser.dateOfBirth || persistedDob,
    },
    currentUser
  );

  mergedUser.authProvider = persistedAuthProvider || currentUser.authProvider || '';
  mergedUser.isProfileComplete = resolvedProfileCompletion;
  mergedUser.profileComplete = resolvedProfileCompletion;
  mergedUser.profileCompleted = resolvedProfileCompletion;

  if (!shouldClearPic) {
    mergedUser.profilePicture = mergedUser.profileImage;
  }

  // Also clear related fields if photo removed
  if (shouldClearPic) {
    mergedUser.profilePicture = DEFAULT_PROFILE_PICTURE;
    mergedUser.photo = DEFAULT_PROFILE_PICTURE;
    mergedUser.photoURL = DEFAULT_PROFILE_PICTURE;
    mergedUser.avatar = DEFAULT_PROFILE_PICTURE;
    mergedUser.avatarUrl = DEFAULT_PROFILE_PICTURE;
    mergedUser.image = DEFAULT_PROFILE_PICTURE;
  }

  localStorage.setItem('user', JSON.stringify(mergedUser));
  persistStoredProfileCache(mergedUser);
  persistStoredProfileDateOfBirth(mergedUser, persistedDob);

  return mergedUser;
};

export const defaultStatus = DEFAULT_STATUS;
