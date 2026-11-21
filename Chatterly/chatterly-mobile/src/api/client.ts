import {
  API_BASE_URL,
  API_FALLBACK_TIMEOUT_MS,
  API_TIMEOUT_MS,
  DEV_API_FALLBACK_BASE_URLS,
} from '../config/api';
import {clearSession, getSession, getToken} from '../services/sessionStore';
import {payloadBytes, recordDataUsage} from '../services/dataUsage';

function recordChatResponse(path: string, response: Response, body: RequestInit['body'], owner: string): void {
  if (!owner || !/\/(?:chats|group)\//.test(path)) { return; }
  const sent = typeof body === 'string' ? payloadBytes(body) : 0;
  try {
    response.clone().text().then(text => {
      recordDataUsage('messages', {sent, received: payloadBytes(text)}, owner);
    }).catch(() => { recordDataUsage('messages', {sent}, owner); });
  } catch { /* Older clients can lack response cloning; keep the request usable. */ }
}

type SessionExpiredListener = (message: string) => void;
const sessionExpiredListeners = new Set<SessionExpiredListener>();
let expirationInProgress = false;

export function subscribeToSessionExpiration(listener: SessionExpiredListener): () => void {
  sessionExpiredListeners.add(listener);
  return () => { sessionExpiredListeners.delete(listener); };
}

export function handleApiResponseStatus(
  status: number,
  message = 'Session expired. Please login again.',
): void {
  if (status !== 401 || !getToken() || expirationInProgress) { return; }
  expirationInProgress = true;

  // Clearing SecureStore is asynchronous and may be queued behind an earlier
  // session write. Navigation must not wait for that device-storage work: the
  // in-memory session is cleared synchronously by clearSession(), so tell the
  // app to leave authenticated screens straight away.
  const clearingSession = clearSession().catch(() => undefined);
  [...sessionExpiredListeners].forEach(listener => {
    try { listener(message); } catch { /* One screen must not block the redirect. */ }
  });

  clearingSession.finally(() => { expirationInProgress = false; });
}

function hostOf(url: string): string {
  return /^https?:\/\/[^/]+/.exec(url)?.[0] || url;
}

export class ApiError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

function fallbackUrlFor(path: string, fallbackBaseUrl: string): string | null {
  if (!path.startsWith(API_BASE_URL)) { return null; }
  return `${fallbackBaseUrl}${path.slice(API_BASE_URL.length)}`;
}

async function fetchWithTimeout(path: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(path, {...options, signal: controller.signal});
  } catch (error) {
    if (timedOut || (error instanceof Error && error.name === 'AbortError')) {
      throw new ApiError('The server took too long to respond.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchDevelopmentFallback(path: string, options: RequestInit): Promise<Response | null> {
  if (!__DEV__) { return null; }

  let lastError: unknown;
  for (const fallbackBaseUrl of DEV_API_FALLBACK_BASE_URLS) {
    const fallbackPath = fallbackUrlFor(path, fallbackBaseUrl);
    if (!fallbackPath) { continue; }

    try {
      return await fetchWithTimeout(fallbackPath, options, API_FALLBACK_TIMEOUT_MS);
    } catch (error) {
      if (error instanceof ApiError && error.status) { throw error; }
      lastError = error;
    }
  }

  if (lastError instanceof ApiError) { throw lastError; }
  return null;
}

export async function apiRequest(path: string, options: RequestInit = {}, policy: {timeoutMs?: number; allowDevelopmentFallback?: boolean} = {}): Promise<Response> {
  const usageOwner = String(getSession?.()?.user?.id || '');
  try {
    const response = await fetchWithTimeout(path, options, policy.timeoutMs ?? API_TIMEOUT_MS);
    if (!response.ok) {
      let message = `Request failed (${response.status})`;
      try {
        const payload = await response.json();
        message = payload?.message || payload?.error || message;
      } catch {
        // The backend may return plain text for infrastructure errors.
      }
      handleApiResponseStatus(response.status, message);
      throw new ApiError(message, response.status);
    }
    recordChatResponse(path, response, options.body, usageOwner);
    return response;
  } catch (error) {
    if (error instanceof ApiError && error.status) { throw error; }

    const fallbackResponse = policy.allowDevelopmentFallback === false ? null : await fetchDevelopmentFallback(path, options);
    if (fallbackResponse) {
      if (!fallbackResponse.ok) {
        let message = `Request failed (${fallbackResponse.status})`;
        try {
          const payload = await fallbackResponse.json();
          message = payload?.message || payload?.error || message;
        } catch {
          // The backend may return plain text for infrastructure errors.
        }
        handleApiResponseStatus(fallbackResponse.status, message);
        throw new ApiError(message, fallbackResponse.status);
      }
      recordChatResponse(path, fallbackResponse, options.body, usageOwner);
      return fallbackResponse;
    }

    if (error instanceof ApiError) { throw error; }

    // In development the host is derived from the Metro server, so naming it
    // turns "cannot connect" into something diagnosable instead of a guess.
    const target = __DEV__ ? ` (tried ${hostOf(path)})` : '';
    throw new ApiError(`Cannot connect to Chatterly. Check your internet connection.${target}`);
  }
}
