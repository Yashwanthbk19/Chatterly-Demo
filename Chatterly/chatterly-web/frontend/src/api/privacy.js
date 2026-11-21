import { requestEntity } from './client';

const BACKEND_OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

export const getPrivacySettings = () =>
  requestEntity(
    {
      method: 'get',
      url: '/api/privacy/settings',
      skipGlobalLoading: true,
      skipGlobalError: true,
    },
    {
      keys: ['data'],
      fallbackMessage: 'Failed to fetch privacy settings.',
      dedupeKey: 'privacy-settings',
    }
  );

export const updatePrivacySettings = (settings) =>
  requestEntity(
    {
      method: 'put',
      url: '/api/privacy/settings',
      data: settings,
      skipGlobalLoading: true,
      skipGlobalError: true,
    },
    {
      keys: ['data'],
      fallbackMessage: 'Failed to update privacy settings.',
    }
  );

export const getEncryptionInfo = () =>
  requestEntity(
    {
      method: 'get',
      url: '/api/privacy/encryption-info',
      skipGlobalLoading: true,
      skipGlobalError: true,
    },
    {
      keys: ['data'],
      fallbackMessage: 'Failed to fetch encryption information.',
      dedupeKey: 'privacy-encryption-info',
    }
  );

export const getEncryptionDetails = () =>
  requestEntity(
    {
      method: 'get',
      url: '/api/privacy/encryption-details',
      skipGlobalLoading: true,
      skipGlobalError: true,
    },
    {
      keys: ['data'],
      fallbackMessage: 'Failed to fetch encryption details.',
      dedupeKey: 'privacy-encryption-details',
    }
  );


export const getSecurityCode = (userId) => {
  const normalizedUserId = String(userId || '').trim();
  if (!BACKEND_OBJECT_ID_PATTERN.test(normalizedUserId)) {
    throw new Error('A valid user id is required to fetch the security code.');
  }

  return requestEntity(
    {
      method: 'get',
      url: `/api/privacy/security-code/${encodeURIComponent(normalizedUserId)}`,
      skipGlobalLoading: true,
      skipGlobalError: true,
    },
    {
      keys: ['data'],
      fallbackMessage: 'Failed to fetch the security code.',
      dedupeKey: `privacy-security-code-${normalizedUserId}`,
    }
  );
};
