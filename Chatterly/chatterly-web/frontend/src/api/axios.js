import axios from 'axios';
import { resolveApiBaseUrl } from '../utils/backendUrl';
import { expireStoredSession, getStoredSessionExpiryReason } from '../utils/sessionExpiry';

const activitySubscribers = new Set();
const errorSubscribers = new Set();
const activeTrackedRequests = new Map();
let nextRequestTrackId = 0;
let authSessionGeneration = 0;

const emitActivity = () => {
  const snapshot = {
    isLoading: activeTrackedRequests.size > 0,
    requestCount: activeTrackedRequests.size,
  };

  activitySubscribers.forEach((callback) => callback(snapshot));
};

const emitError = (error) => {
  errorSubscribers.forEach((callback) => callback(error));
};

const incrementPendingRequests = (config = {}) => {
  const requestTrackId = `request-${Date.now()}-${nextRequestTrackId += 1}`;
  const timeoutMs = Number(config.timeout || 10000);
  const cleanupDelayMs = Number.isFinite(timeoutMs) && timeoutMs > 0
    ? timeoutMs + 5000
    : 15000;
  const timerScope = typeof window !== 'undefined' ? window : globalThis;
  const timeoutId = timerScope.setTimeout(() => {
    if (!activeTrackedRequests.has(requestTrackId)) {
      return;
    }

    activeTrackedRequests.delete(requestTrackId);
    emitActivity();
  }, cleanupDelayMs);

  activeTrackedRequests.set(requestTrackId, timeoutId);
  emitActivity();

  return requestTrackId;
};

const decrementPendingRequests = (config = {}) => {
  const requestTrackId = config?.metadata?.requestTrackId;
  if (!requestTrackId || !activeTrackedRequests.has(requestTrackId)) {
    return;
  }

  const timerScope = typeof window !== 'undefined' ? window : globalThis;
  timerScope.clearTimeout(activeTrackedRequests.get(requestTrackId));
  activeTrackedRequests.delete(requestTrackId);
  emitActivity();
};

if (typeof window !== 'undefined') {
  window.addEventListener('chatterly:logout-start', () => {
    authSessionGeneration += 1;
    activeTrackedRequests.forEach((timeoutId) => window.clearTimeout(timeoutId));
    activeTrackedRequests.clear();
    emitActivity();
  });
}

const createApiError = (error) => {
  const message =
    error?.response?.data?.message ||
    error?.response?.data?.error ||
    error?.message ||
    'Something went wrong';

  const apiError = new Error(message);
  apiError.status = error?.response?.status || error?.status || null;
  apiError.data = error?.response?.data || error?.data || null;
  apiError.raw = error?.response || null;
  apiError.config = error?.config || null;
  apiError.code = error?.code || null;
  apiError.name = error?.name || apiError.name;

  return apiError;
};

const axiosInstance = axios.create({
  baseURL: resolveApiBaseUrl(),
  timeout: 10000,
});

const isChatMediaUploadRequest = (config = {}) => {
  const method = String(config?.method || 'get').trim().toLowerCase();
  const requestUrl = String(config?.url || '').trim();
  return method === 'post' && /\/api\/(?:chats|group)\/send-media(?:[/?#]|$)/i.test(requestUrl);
};

axiosInstance.interceptors.request.use(
  (config) => {
    if (!config?.skipAuthRedirect && getStoredSessionExpiryReason()) {
      expireStoredSession();
      window.location.replace('/login');
      return Promise.reject(new Error('Session expired'));
    }
    const token = localStorage.getItem('token');
    // Media uploads expose their own progress inside the active conversation.
    // Keep them out of the app-wide loader even if an upload caller omits or
    // loses the custom skip flag while forwarding the Axios config.
    const shouldTrackActivity = !config?.skipGlobalLoading && !isChatMediaUploadRequest(config);
    config.metadata = {
      ...(config.metadata || {}),
      tracksGlobalLoading: shouldTrackActivity,
      // Associate every request with the login session that created it. A
      // request from the previous account may finish after logout (or even
      // after another login) and must not surface as a current-session error.
      authTokenSnapshot: String(token || ''),
      authSessionGeneration,
    };

    if (shouldTrackActivity) {
      config.metadata.requestTrackId = incrementPendingRequests(config);
    }

    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => {
    if (error?.config?.metadata?.tracksGlobalLoading) {
      decrementPendingRequests(error.config);
    }
    return Promise.reject(createApiError(error));
  }
);

axiosInstance.interceptors.response.use(
  (response) => {
    if (response?.config?.metadata?.tracksGlobalLoading) {
      decrementPendingRequests(response.config);
    }
    return response;
  },
  (error) => {
    if (error?.config?.metadata?.tracksGlobalLoading) {
      decrementPendingRequests(error.config);
    }

    const shouldSkipGlobalError = Boolean(error?.config?.skipGlobalError);
    const apiError = createApiError(error);

    // A 401 normally means the session died, so the app drops the token and
    // bounces to /login. Sign-in endpoints are the exception: there is no
    // session yet, and their 401 is a rejected credential the caller has to
    // show in place (e.g. a wrong 2FA code) — redirecting would wipe the
    // half-finished login instead.
    if (apiError.status === 401 && !error?.config?.skipAuthRedirect) {
      expireStoredSession();
      window.location.replace('/login');
    }

    // An aborted request is not a failure the user can act on - it is a screen
    // that moved on, or a refresh that superseded this one. Surfacing it put a
    // "Request failed / canceled" banner over ordinary navigation.
    const wasCanceled =
      apiError.code === 'ERR_CANCELED' ||
      apiError.name === 'CanceledError' ||
      axios.isCancel?.(error);

    const requestAuthToken = String(error?.config?.metadata?.authTokenSnapshot || '');
    const currentAuthToken = String(localStorage.getItem('token') || '');
    const requestAuthSessionGeneration = Number(error?.config?.metadata?.authSessionGeneration);
    const belongsToInactiveSession =
      requestAuthToken !== currentAuthToken ||
      (Number.isFinite(requestAuthSessionGeneration) && requestAuthSessionGeneration !== authSessionGeneration);

    if (!shouldSkipGlobalError && !wasCanceled && !belongsToInactiveSession) {
      console.error('API Error:', apiError.message);
      emitError(apiError);
    }

    return Promise.reject(apiError);
  }
);

export const subscribeToApiActivity = (callback) => {
  activitySubscribers.add(callback);
  callback({
    isLoading: activeTrackedRequests.size > 0,
    requestCount: activeTrackedRequests.size,
  });

  return () => {
    activitySubscribers.delete(callback);
  };
};

export const subscribeToApiErrors = (callback) => {
  errorSubscribers.add(callback);

  return () => {
    errorSubscribers.delete(callback);
  };
};

export default axiosInstance;

