import { useCallback, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  SESSION_LAST_ACTIVITY_KEY,
  expireStoredSession,
  getSessionInactivityTimeoutMs,
  getStoredSessionExpiryReason,
  initializeSessionActivity,
  touchSessionActivity,
} from '../utils/sessionExpiry';

const ACTIVITY_WRITE_THROTTLE_MS = 1000;

export default function SessionExpiryManager() {
  const location = useLocation();
  const navigate = useNavigate();
  const expiryTimerRef = useRef(null);
  const lastWriteRef = useRef(0);

  const clearExpiryTimer = useCallback(() => {
    if (expiryTimerRef.current) window.clearTimeout(expiryTimerRef.current);
    expiryTimerRef.current = null;
  }, []);

  const expireAndRedirect = useCallback(() => {
    if (!localStorage.getItem('token')) return;
    clearExpiryTimer();
    expireStoredSession();
    navigate('/login', { replace: true });
  }, [clearExpiryTimer, navigate]);

  const scheduleExpiry = useCallback(() => {
    clearExpiryTimer();
    if (!localStorage.getItem('token')) return;
    if (getStoredSessionExpiryReason()) {
      expireAndRedirect();
      return;
    }
    const lastActivity = Number(localStorage.getItem(SESSION_LAST_ACTIVITY_KEY)) || Date.now();
    const remaining = Math.max(0, getSessionInactivityTimeoutMs() - (Date.now() - lastActivity));
    expiryTimerRef.current = window.setTimeout(expireAndRedirect, remaining);
  }, [clearExpiryTimer, expireAndRedirect]);

  useEffect(() => {
    if (!localStorage.getItem('token')) {
      clearExpiryTimer();
      return undefined;
    }

    initializeSessionActivity();
    scheduleExpiry();

    const recordActivity = () => {
      const now = Date.now();
      if (now - lastWriteRef.current < ACTIVITY_WRITE_THROTTLE_MS) return;
      lastWriteRef.current = now;
      touchSessionActivity(now);
      scheduleExpiry();
    };
    const recheckSession = () => {
      if (document.visibilityState === 'visible' && getStoredSessionExpiryReason()) expireAndRedirect();
      else scheduleExpiry();
    };
    const handleStorage = (event) => {
      if (event.key === 'token' && !event.newValue) {
        clearExpiryTimer();
        navigate('/login', { replace: true });
        return;
      }
      if (event.key === SESSION_LAST_ACTIVITY_KEY || event.key === 'token') recheckSession();
    };
    const activityEvents = ['pointerdown', 'keydown', 'touchstart', 'wheel'];
    activityEvents.forEach((eventName) => window.addEventListener(eventName, recordActivity, { passive: true }));
    window.addEventListener('focus', recheckSession);
    document.addEventListener('visibilitychange', recheckSession);
    window.addEventListener('storage', handleStorage);

    return () => {
      clearExpiryTimer();
      activityEvents.forEach((eventName) => window.removeEventListener(eventName, recordActivity));
      window.removeEventListener('focus', recheckSession);
      document.removeEventListener('visibilitychange', recheckSession);
      window.removeEventListener('storage', handleStorage);
    };
  }, [clearExpiryTimer, expireAndRedirect, location.pathname, navigate, scheduleExpiry]);

  return null;
}
