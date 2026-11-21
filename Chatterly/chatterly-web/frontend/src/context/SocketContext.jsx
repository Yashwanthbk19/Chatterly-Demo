import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import socketService from '../utils/socketService';
import { getStoredUser } from '../utils/profile';

// ✅ 1. Isolated Badge Component
const ConnectionBadge = ({ recoveredAt, recoveredAfterAttempts }) => {
  const [visible, setVisible] = useState(false);
  const previousRecoveredAtRef = useRef(Number(recoveredAt || 0));

  useEffect(() => {
    const normalizedRecoveredAt = Number(recoveredAt || 0);

    if (!normalizedRecoveredAt || normalizedRecoveredAt === previousRecoveredAtRef.current) {
      previousRecoveredAtRef.current = normalizedRecoveredAt;
      setVisible(false);
      return undefined;
    }

    previousRecoveredAtRef.current = normalizedRecoveredAt;
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), 3000);
    return () => clearTimeout(timer);
  }, [recoveredAt]);

  if (!visible) return null;

  return (
    <div className="pointer-events-none fixed left-1/2 top-6 z-[99999] flex -translate-x-1/2 items-center gap-2 rounded-[14px] border border-[#BBF7D0] bg-white/95 px-3.5 py-2 text-[#166534] shadow-[0_14px_34px_rgba(15,23,42,0.14)] backdrop-blur-md animate-in fade-in slide-in-from-top-4 duration-300">
      <span className="relative flex h-3 w-3" aria-hidden="true">
        <span className="absolute inline-flex h-full w-full rounded-full bg-[#22C55E] opacity-30 motion-safe:animate-ping" />
        <span className="relative inline-flex h-3 w-3 rounded-full bg-[#16A34A]" />
      </span>
      <span className="text-[13px] font-semibold leading-5">
        {recoveredAfterAttempts > 1
          ? `Connection restored after ${recoveredAfterAttempts} retries`
          : 'Connection restored'}
      </span>
    </div>
  );
};

const SocketContext = createContext({
  isConnected: false,
  status: 'disconnected',
  socketId: '',
  transport: '',
  userId: '',
  lastError: '',
  reconnectAttempt: 0,
  reconnectTimeoutAt: 0,
  reconnectRetryAt: 0,
  recoveredAt: 0,
  recoveredAfterAttempts: 0,
});

const resolveSocketSession = () => {
  const storedUser = getStoredUser() || {};
  const token =
    String(localStorage.getItem('token') || localStorage.getItem('userToken') || '').trim();
  const userId =
    storedUser?._id ||
    storedUser?.userId ||
    storedUser?.id ||
    '';

  return {
    token,
    userId: userId ? String(userId) : '',
  };
};

const syncSocketSession = () => {
  const session = resolveSocketSession();

  if (session.token && session.userId) {
    socketService.connect(session);
  } else {
    socketService.disconnect();
  }
};

// The socket is a singleton, but StrictMode runs this provider's effect twice in
// dev (mount → cleanup → mount). Disconnecting straight away in the cleanup kills
// the handshake that the first mount just started, which the browser reports as
// "WebSocket is closed before the connection is established" and costs a second
// connect. Defer the teardown one tick so the immediate remount can cancel it; a
// real unmount still disconnects.
let pendingDisconnectId = 0;

const cancelPendingDisconnect = () => {
  if (!pendingDisconnectId) return;
  window.clearTimeout(pendingDisconnectId);
  pendingDisconnectId = 0;
};

const scheduleSocketDisconnect = () => {
  cancelPendingDisconnect();
  pendingDisconnectId = window.setTimeout(() => {
    pendingDisconnectId = 0;
    socketService.disconnect();
  }, 0);
};

export function SocketProvider({ children }) {
  const [connectionState, setConnectionState] = useState(() => socketService.getSnapshot());

  useEffect(() => {
    const unsubscribe = socketService.subscribeConnection(setConnectionState);
    const syncOnVisibility = () => {
      if (document.visibilityState === 'visible') {
        syncSocketSession();
      }
    };

    cancelPendingDisconnect();
    syncSocketSession();

    window.addEventListener('focus', syncSocketSession);
    window.addEventListener('online', syncSocketSession);
    window.addEventListener('storage', syncSocketSession);
    document.addEventListener('visibilitychange', syncOnVisibility);

    return () => {
      unsubscribe();
      window.removeEventListener('focus', syncSocketSession);
      window.removeEventListener('online', syncSocketSession);
      window.removeEventListener('storage', syncSocketSession);
      document.removeEventListener('visibilitychange', syncOnVisibility);
      scheduleSocketDisconnect();
    };
  }, []);

  return (
    <SocketContext.Provider value={connectionState}>
      {children}
      <ConnectionBadge
        recoveredAt={connectionState.recoveredAt}
        recoveredAfterAttempts={connectionState.recoveredAfterAttempts}
      />
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}
