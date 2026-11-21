export const SESSION_LAST_ACTIVITY_KEY = 'chatterly_session_last_activity';
export const SESSION_EXPIRED_NOTICE_KEY = 'chatterly_session_expired_notice';
export const SESSION_EXPIRED_MESSAGE = 'Session expired, please log in again';

const DEFAULT_INACTIVITY_MINUTES = 30;

export const getSessionInactivityTimeoutMs = () => {
  const configuredMinutes = Number(import.meta.env.VITE_SESSION_INACTIVITY_TIMEOUT_MINUTES);
  const minutes = Number.isFinite(configuredMinutes) && configuredMinutes > 0
    ? configuredMinutes
    : DEFAULT_INACTIVITY_MINUTES;
  return minutes * 60 * 1000;
};

const getJwtExpiryMs = (token = '') => {
  try {
    const payload = String(token).split('.')[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = JSON.parse(atob(normalized));
    const expirySeconds = Number(decoded?.exp);
    return Number.isFinite(expirySeconds) ? expirySeconds * 1000 : null;
  } catch {
    return null;
  }
};

export const getStoredSessionExpiryReason = (now = Date.now()) => {
  if (typeof localStorage === 'undefined') return '';
  const token = String(localStorage.getItem('token') || '').trim();
  if (!token) return '';

  const tokenExpiry = getJwtExpiryMs(token);
  if (tokenExpiry && now >= tokenExpiry) return 'token';

  const lastActivity = Number(localStorage.getItem(SESSION_LAST_ACTIVITY_KEY));
  if (Number.isFinite(lastActivity) && lastActivity > 0 && now - lastActivity >= getSessionInactivityTimeoutMs()) {
    return 'inactive';
  }
  return '';
};

export const touchSessionActivity = (now = Date.now()) => {
  if (typeof localStorage === 'undefined' || !localStorage.getItem('token')) return;
  localStorage.setItem(SESSION_LAST_ACTIVITY_KEY, String(now));
};

export const initializeSessionActivity = () => {
  if (typeof localStorage === 'undefined' || !localStorage.getItem('token')) return;
  const stored = Number(localStorage.getItem(SESSION_LAST_ACTIVITY_KEY));
  if (!Number.isFinite(stored) || stored <= 0) touchSessionActivity();
};

export const expireStoredSession = () => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('chatterly:logout-start', { detail: { reason: 'session-expired' } }));
  localStorage.removeItem('token');
  localStorage.removeItem('userToken');
  localStorage.removeItem('user');
  localStorage.removeItem(SESSION_LAST_ACTIVITY_KEY);
  sessionStorage.setItem(SESSION_EXPIRED_NOTICE_KEY, SESSION_EXPIRED_MESSAGE);
};

export const consumeSessionExpiredNotice = () => {
  if (typeof sessionStorage === 'undefined') return '';
  const message = sessionStorage.getItem(SESSION_EXPIRED_NOTICE_KEY) || '';
  sessionStorage.removeItem(SESSION_EXPIRED_NOTICE_KEY);
  return message;
};
