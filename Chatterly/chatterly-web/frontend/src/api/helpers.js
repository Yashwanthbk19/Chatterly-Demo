export const extractPayload = (response) => response?.data?.data ?? response?.data ?? null;

export const extractMessage = (response) =>
  response?.data?.message || response?.data?.data?.message || '';

export const extractCollection = (payload, keys = []) => {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (payload && typeof payload === 'object') {
    for (const key of keys) {
      if (Array.isArray(payload[key])) {
        return payload[key];
      }
    }
  }

  return [];
};

export const extractEntity = (payload, keys = []) => {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    for (const key of keys) {
      const nestedValue = payload[key];

      if (nestedValue && typeof nestedValue === 'object' && !Array.isArray(nestedValue)) {
        return nestedValue;
      }
    }

    return payload;
  }

  return {};
};

export const createApiResponse = ({
  success = true,
  message = '',
  data = null,
  raw = null,
}) => ({
  success,
  message,
  data,
  raw,
});

export const toApiError = (error, fallbackMessage = 'Something went wrong') => {
  const status = error?.response?.status || error?.status || null;
  const statusMessage =
    status === 404
      ? 'The requested API resource was not found.'
      : fallbackMessage;

  if (error instanceof Error) {
    if (!error.message || error.message === 'Request failed with status code 404') {
      error.message = statusMessage;
    }

    error.success = false;
    error.status = error.status || status;
    error.data = error.data || error?.response?.data || error?.data || null;
    error.raw = error.raw || error?.response?.data || null;

    return error;
  }

  const message =
    error?.response?.data?.message ||
    error?.data?.message ||
    error?.message ||
    (typeof error === 'string' ? error : statusMessage);

  const apiError = new Error(message);
  apiError.success = false;
  apiError.status = status;
  apiError.data = error?.response?.data || error?.data || null;
  apiError.raw = error?.response?.data || null;

  return apiError;
};
