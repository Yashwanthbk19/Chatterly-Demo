/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';

export const NETWORK_DISPLAY_STATUS = Object.freeze({
  ONLINE: 'online',
  RECONNECTING: 'reconnecting',
  DISCONNECTED: 'disconnected',
});

const RECONNECTING_STATUS_DURATION_MS = 3500;

const getNavigatorOnlineStatus = () => {
  if (typeof navigator === 'undefined') {
    return true;
  }

  return navigator.onLine;
};

const NetworkStatusContext = createContext({
  isOnline: true,
  status: NETWORK_DISPLAY_STATUS.ONLINE,
  lastChangedAt: 0,
});

export function NetworkStatusProvider({ children }) {
  const reconnectingTimerRef = useRef(null);
  const [networkState, setNetworkState] = useState(() => {
    const isOnline = getNavigatorOnlineStatus();
    return {
      isOnline,
      status: isOnline
        ? NETWORK_DISPLAY_STATUS.ONLINE
        : NETWORK_DISPLAY_STATUS.DISCONNECTED,
      lastChangedAt: Date.now(),
    };
  });

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const clearReconnectingTimer = () => {
      if (reconnectingTimerRef.current) {
        window.clearTimeout(reconnectingTimerRef.current);
        reconnectingTimerRef.current = null;
      }
    };

    const updateOnlineStatus = () => {
      const isOnline = getNavigatorOnlineStatus();
      const changedAt = Date.now();

      clearReconnectingTimer();

      setNetworkState((previousState) => {
        const shouldShowReconnecting =
          isOnline &&
          (!previousState.isOnline ||
            previousState.status === NETWORK_DISPLAY_STATUS.DISCONNECTED);

        return {
          isOnline,
          status: isOnline
            ? shouldShowReconnecting
              ? NETWORK_DISPLAY_STATUS.RECONNECTING
              : NETWORK_DISPLAY_STATUS.ONLINE
            : NETWORK_DISPLAY_STATUS.DISCONNECTED,
          lastChangedAt: changedAt,
        };
      });

      if (isOnline) {
        reconnectingTimerRef.current = window.setTimeout(() => {
          reconnectingTimerRef.current = null;
          setNetworkState((previousState) => (
            previousState.isOnline
              ? {
                  ...previousState,
                  status: NETWORK_DISPLAY_STATUS.ONLINE,
                  lastChangedAt: Date.now(),
                }
              : previousState
          ));
        }, RECONNECTING_STATUS_DURATION_MS);
      }
    };

    updateOnlineStatus();
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    return () => {
      clearReconnectingTimer();
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
    };
  }, []);

  return (
    <NetworkStatusContext.Provider value={networkState}>
      {children}
    </NetworkStatusContext.Provider>
  );
}

export const useNetworkStatus = () => useContext(NetworkStatusContext);
