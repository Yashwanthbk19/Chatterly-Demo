import { requestCollection, requestEntity, requestPayload } from './client';
import { extractCollection } from './helpers';
import {
  getStoredUser,
  splitFullName,
  limitProfileFullName,
  limitProfileStatus,
  limitProfileNamePart,
} from '../utils/profile';

const NOT_FOUND_STATUSES = new Set([404, 405]);

const PROFILE_UPDATE_CANDIDATES = [
  { method: 'patch', url: '/api/auth/update-profile' },
];
const PROFILE_CREATE_ONLY_FIELDS = ['firstLoginDate'];

export const getChats = async () =>
  requestCollection(
    {
      method: 'get',
      url: '/api/chats/list',
    },
    {
      fallbackMessage: 'Failed to load chats.',
      dedupeKey: 'contactapi-chat-list',
    }
  );

export const getContacts = getChats;

export const findRegisteredUsersByPhone = (phone) =>
  requestCollection(
    {
      method: 'get',
      url: '/api/auth/search-users',
      // Search treats q as a regular expression; omit the leading '+'.
      params: { q: String(phone || '').replace(/\D/g, '') },
      timeout: 5000,
      skipGlobalLoading: true,
      skipGlobalError: true,
    },
    { keys: ['data', 'users'], fallbackMessage: 'Unable to check mobile number.' }
  );

export const getRegisteredUserById = async (userId, options = {}) => {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) return null;

  const users = await requestCollection(
    {
      method: 'get',
      url: '/api/auth/search-users',
      params: { q: normalizedUserId },
      skipGlobalError: true,
      skipGlobalLoading: Boolean(options?.skipGlobalLoading),
    },
    {
      keys: ['data', 'users'],
      fallbackMessage: 'Failed to load registered user.',
      dedupeKey: `registered-user:${normalizedUserId}`,
    }
  );

  const matchedUser = users.find(
    (user) => String(user?._id || user?.id || user?.userId || '').trim() === normalizedUserId
  );
  if (!matchedUser) return null;

  return {
    _id: normalizedUserId,
    phone: String(
      matchedUser?.phone || matchedUser?.phoneNumber || matchedUser?.mobile || ''
    ).trim(),
  };
};

export const syncContacts = async (contacts, options = {}) => {
  const payload = await requestPayload(
    {
      method: 'post',
      url: '/api/user/syncContacts',
      data: { contacts },
      skipGlobalLoading: Boolean(options?.skipGlobalLoading),
      skipGlobalError: Boolean(options?.skipGlobalError),
    },
    {
      fallbackMessage: 'Failed to sync contact.',
    }
  );

  return {
    registered: extractCollection(payload, ['registered']),
    unRegistered: extractCollection(payload, ['unRegistered']),
    message: payload?.message || '',
  };
};

export const getMessages = async (chatId) =>
  requestCollection(
    {
      method: 'get',
      url: `/api/chats/messages/${chatId}`,
    },
    {
      fallbackMessage: 'Failed to load messages.',
      dedupeKey: chatId ? `contactapi-chat-messages-${chatId}` : '',
    }
  );

export const sendMessage = async (data) =>
  requestEntity(
    {
      method: 'post',
      url: '/api/chats/send',
      data,
    },
    {
      fallbackMessage: 'Failed to send message.',
    }
  );

const shouldTryNextProfileEndpoint = (error) => NOT_FOUND_STATUSES.has(error?.status);

const tryProfileUpdateCandidates = async (candidates, buildConfig, options) => {
  let lastError = null;

  for (const candidate of candidates) {
    try {
      const config = buildConfig(candidate);
      const payload = await requestPayload(config, { fallbackMessage: options?.fallbackMessage });

      if (payload?.user) return payload.user;
      if (payload?.data) return payload.data;
      if (payload?.profile) return payload.profile;
      return payload;
    } catch (error) {
      if (shouldTryNextProfileEndpoint(error)) {
        lastError = error;
        continue;
      }
      throw error;
    }
  }

  throw lastError || new Error(options?.fallbackMessage || 'Failed to update profile.');
};

export const getProfile = async () => {
  // The current backend contract only exposes profile create/update routes.
  // Use the persisted authenticated user as the canonical read source.
  return getStoredUser() || {};
};

const isFormDataPayload = (payload) =>
  typeof FormData !== 'undefined' && payload instanceof FormData;

const cloneFormData = (payload) => {
  const clonedPayload = new FormData();
  payload.forEach((value, key) => clonedPayload.append(key, value));
  return clonedPayload;
};

const removeCreateOnlyProfileFields = (payload) => {
  if (isFormDataPayload(payload)) {
    const nextPayload = cloneFormData(payload);
    PROFILE_CREATE_ONLY_FIELDS.forEach((field) => nextPayload.delete(field));
    return nextPayload;
  }

  if (!payload || typeof payload !== 'object') {
    return payload;
  }

  const nextPayload = { ...payload };
  PROFILE_CREATE_ONLY_FIELDS.forEach((field) => {
    delete nextPayload[field];
  });
  return nextPayload;
};

const buildProfileFormData = (payload) => {
  const formData = cloneFormData(payload);
  const hasName = ['username', 'fullName', 'name', 'firstName', 'lastName'].some((key) => formData.has(key));
  const fullNameValue = limitProfileFullName(
    String(formData.get('username') || formData.get('fullName') || formData.get('name') || '').trim()
  );
  const parsedName = splitFullName(fullNameValue);
  const firstName = limitProfileNamePart(String(formData.get('firstName') || parsedName.firstName || '').trim());
  const lastName = limitProfileNamePart(String(formData.get('lastName') || parsedName.lastName || '').trim());
  const fullName = limitProfileFullName(
    String(formData.get('username') || formData.get('fullName') || formData.get('name') || `${firstName} ${lastName}`.trim()).trim()
  );
  const status = limitProfileStatus(formData.get('status') || formData.get('bio') || '');

  if (hasName) {
    formData.set('firstName', firstName);
    formData.set('lastName', lastName);
    formData.set('fullName', fullName);
    formData.set('name', fullName);
  }
  if (status || formData.has('status') || formData.has('bio')) {
    formData.set('status', status);
    formData.set('bio', status);
  }

  if (formData.has('profileImage') && !formData.has('profilePic')) {
    formData.set('profilePic', formData.get('profileImage'));
  }

  // Keep the local profile model canonical, but preserve the backend contract.
  formData.delete('username');
  formData.delete('profileImage');

  if (formData.get('removeProfilePic') === true || formData.get('removeProfilePic') === 'true') {
    formData.set('removeProfilePic', 'true');
  }

  return formData;
};

const buildProfilePayload = (payload = {}) => {
  const fullNameValue = limitProfileFullName(String(payload.username || payload.fullName || payload.name || '').trim());
  const parsedName = splitFullName(fullNameValue);
  const firstName = limitProfileNamePart(String(payload.firstName || parsedName.firstName || '').trim());
  const lastName = limitProfileNamePart(String(payload.lastName || parsedName.lastName || '').trim());
  const fullName = limitProfileFullName(
    String(payload.username || payload.fullName || payload.name || `${firstName} ${lastName}`.trim()).trim()
  );
  const status = limitProfileStatus(payload.status || payload.bio || '');
  const {
    username: _USERNAME,
    profileImage: localProfileImage,
    ...apiPayload
  } = payload;

  const result = {
    ...apiPayload,
  };

  // PATCH must not invent unrelated fields for an account-row update.
  // Sending an unchanged name can trigger duplicate-username validation.
  if (['username', 'fullName', 'name', 'firstName', 'lastName'].some((key) => Object.hasOwn(payload, key))) {
    Object.assign(result, { firstName, lastName, fullName, name: fullName });
  }
  if (Object.hasOwn(payload, 'status') || Object.hasOwn(payload, 'bio')) {
    Object.assign(result, { status, bio: status });
  }

  if (localProfileImage !== undefined && payload.profilePic === undefined) {
    result.profilePic = localProfileImage;
  }

  if (payload.removeProfilePic === true) {
    result.removeProfilePic = "true";
  }

  return result;
};

const getProfileRequestConfig = (candidate, payload, isMultipart) => ({
  ...candidate,
  data: payload,
  skipGlobalError: true,
  ...(isMultipart
    ? {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    : {}),
});

const createProfile = async (payload, isMultipart) => {
  const config = getProfileRequestConfig(
    {
      method: 'post',
      url: '/api/auth/create-profile',
    },
    payload,
    isMultipart
  );

  const response = await requestPayload(config, { fallbackMessage: 'Failed to save profile.' });

  if (response?.user) return response.user;
  if (response?.data) return response.data;
  if (response?.profile) return response.profile;
  return response;
};

export const updateProfile = async (payload, options = {}) => {
  const mode = options?.mode || 'update';
  const isMultipart = isFormDataPayload(payload);
  const profileData = isMultipart ? buildProfileFormData(payload) : buildProfilePayload(payload);
  const updateProfileData = removeCreateOnlyProfileFields(profileData);
  let shouldFallbackToCreate = mode === 'create';

  if (mode === 'create') {
    try {
      return await createProfile(profileData, isMultipart);
    } catch (error) {
      const profileAlreadyExists = /profile already completed|already completed|already exists/i.test(error?.message || '');

      if (!profileAlreadyExists) {
        throw error;
      }

      shouldFallbackToCreate = false;
    }
  }

  try {
    return await tryProfileUpdateCandidates(
      PROFILE_UPDATE_CANDIDATES,
      (candidate) => getProfileRequestConfig(candidate, updateProfileData, isMultipart),
      {
        fallbackMessage: 'Failed to update profile.',
      }
    );
  } catch (error) {
    if (mode !== 'create' || !shouldTryNextProfileEndpoint(error) || !shouldFallbackToCreate) {
      throw error;
    }

    return createProfile(profileData, isMultipart);
  }
};

