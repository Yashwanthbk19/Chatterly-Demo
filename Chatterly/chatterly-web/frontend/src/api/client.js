import axiosInstance from './axios';
import {
  createApiResponse,
  extractCollection,
  extractEntity,
  extractMessage,
  extractPayload,
  toApiError,
} from './helpers';

const inFlightRequests = new Map();
let authRequestGeneration = 0;

const getCurrentAuthRequestScope = () => {
  const sessionToken = typeof localStorage !== 'undefined'
    ? String(localStorage.getItem('token') || localStorage.getItem('userToken') || '')
    : '';

  return `${authRequestGeneration}:${sessionToken}`;
};

if (typeof window !== 'undefined') {
  window.addEventListener('chatterly:logout-start', () => {
    // In-flight request de-duplication is only valid inside one authenticated
    // session. A quick re-login must not adopt a chat-list promise that was
    // created with the previous token (and may already be failing/canceling).
    authRequestGeneration += 1;
    inFlightRequests.clear();
  });
}

export const requestPayload = async (config, options = {}) => {
  const {
    fallbackMessage = 'Something went wrong',
    dedupeKey = '',
  } = options;

  const runRequest = async () => {
    try {
      const response = await axiosInstance(config);
      return extractPayload(response);
    } catch (error) {
      throw toApiError(error, fallbackMessage);
    }
  };

  // A caller that brought its own AbortSignal owns this request's lifetime, so
  // it must not be shared: aborting one screen's copy would reject the promise
  // every other caller is awaiting, and the next caller would adopt the dead one
  // instead of fetching again (that is what left the group list permanently
  // empty after a remount).
  if (!dedupeKey || config?.signal) {
    return runRequest();
  }

  const authScope = getCurrentAuthRequestScope();
  const inFlightRequest = inFlightRequests.get(dedupeKey);
  if (inFlightRequest?.authScope === authScope) {
    return inFlightRequest.promise;
  }

  const requestPromise = runRequest().finally(() => {
    if (inFlightRequests.get(dedupeKey)?.promise === requestPromise) {
      inFlightRequests.delete(dedupeKey);
    }
  });

  inFlightRequests.set(dedupeKey, { authScope, promise: requestPromise });

  return requestPromise;
};

export const requestResult = async (config, options = {}) => {
  const {
    fallbackMessage = 'Something went wrong',
    emptyData = null,
    transform,
    dedupeKey = '',
  } = options;

  try {
    const payload = await requestPayload(config, { fallbackMessage, dedupeKey });
    const response = { data: payload };
    const data = typeof transform === 'function' ? transform(payload, response) : payload;

    return createApiResponse({
      success: true,
      message: extractMessage(response) || payload?.message || '',
      data: data ?? emptyData,
      raw: payload ?? null,
    });
  } catch (error) {
    throw toApiError(error, fallbackMessage);
  }
};

export const requestEntity = async (config, options = {}) => {
  const {
    keys = [],
    fallbackMessage = 'Something went wrong',
    dedupeKey = '',
  } = options;

  const payload = await requestPayload(config, { fallbackMessage, dedupeKey });
  return extractEntity(payload, keys);
};

export const requestCollection = async (config, options = {}) => {
  const {
    keys = [],
    fallbackMessage = 'Something went wrong',
    mapItem,
    dedupeKey = '',
  } = options;

  const payload = await requestPayload(config, { fallbackMessage, dedupeKey });
  const collection = extractCollection(payload, keys);

  return typeof mapItem === 'function' ? collection.map(mapItem) : collection;
};
