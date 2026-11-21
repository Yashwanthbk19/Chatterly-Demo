import { useEffect, useState } from 'react';
import { useNetworkStatus, NETWORK_DISPLAY_STATUS } from '../context/NetworkStatusContext';
import { useSocket } from '../context/SocketContext';

const STATUS_CONFIG = {
  [NETWORK_DISPLAY_STATUS.DISCONNECTED]: {
    role: 'alert',
    label: 'Connection interrupted',
    detail: 'Messages will sync when your internet is restored.',
    badge: 'Offline',
    shellClass: 'border-[#F8C7C7] bg-[#FFF7F7]/95 text-[#991B1B]',
    iconClass: 'border-[#FCA5A5] bg-[#FEE2E2] text-[#B91C1C]',
    dotClass: 'bg-[#DC2626]',
  },
  [NETWORK_DISPLAY_STATUS.RECONNECTING]: {
    role: 'status',
    label: 'Reconnecting',
    detail: 'Restoring secure messaging services.',
    badge: 'Syncing',
    shellClass: 'border-[#FED7AA] bg-[#FFFBEB]/95 text-[#92400E]',
    iconClass: 'border-[#FDBA74] bg-[#FFF7ED] text-[#C2410C]',
    dotClass: 'bg-[#F97316]',
  },
};

const getRemainingSeconds = (targetAt, now = Date.now()) => {
  const normalizedTargetAt = Number(targetAt || 0);
  if (!Number.isFinite(normalizedTargetAt) || normalizedTargetAt <= now) {
    return 0;
  }

  return Math.max(0, Math.ceil((normalizedTargetAt - now) / 1000));
};

export default function NetworkStatusBanner() {
  const { isOnline, status } = useNetworkStatus();
  const socketConnection = useSocket();
  const [now, setNow] = useState(() => Date.now());
  const socketStatus = String(socketConnection?.status || '').toLowerCase();
  const shouldShowSocketRecovery =
    isOnline &&
    Boolean(socketConnection?.userId) &&
    ['connecting', 'reconnecting'].includes(socketStatus);
  const reconnectAttempt = Math.max(0, Number(socketConnection?.reconnectAttempt || 0));
  const reconnectRetryAt = Number(socketConnection?.reconnectRetryAt || 0);
  const reconnectTimeoutAt = Number(socketConnection?.reconnectTimeoutAt || 0);
  const displayStatus = !isOnline
    ? NETWORK_DISPLAY_STATUS.DISCONNECTED
    : shouldShowSocketRecovery || status === NETWORK_DISPLAY_STATUS.RECONNECTING
      ? NETWORK_DISPLAY_STATUS.RECONNECTING
      : NETWORK_DISPLAY_STATUS.ONLINE;
  const retryCountdownSeconds = getRemainingSeconds(reconnectRetryAt, now);
  const timeoutCountdownSeconds = getRemainingSeconds(reconnectTimeoutAt, now);

  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      displayStatus !== NETWORK_DISPLAY_STATUS.RECONNECTING ||
      (!reconnectRetryAt && !reconnectTimeoutAt)
    ) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      const currentNow = Date.now();
      setNow(currentNow);

      if (
        (!reconnectRetryAt || reconnectRetryAt <= currentNow) &&
        (!reconnectTimeoutAt || reconnectTimeoutAt <= currentNow)
      ) {
        window.clearInterval(intervalId);
      }
    }, 250);
    return () => window.clearInterval(intervalId);
  }, [displayStatus, reconnectRetryAt, reconnectTimeoutAt]);

  const config =
    displayStatus === NETWORK_DISPLAY_STATUS.RECONNECTING
      ? {
          ...STATUS_CONFIG[NETWORK_DISPLAY_STATUS.RECONNECTING],
          badge: reconnectAttempt > 0 ? `Retry ${reconnectAttempt}` : 'Syncing',
          detail: shouldShowSocketRecovery && retryCountdownSeconds > 0
            ? `Retrying in ${retryCountdownSeconds}s. Messages stay queued safely.`
            : shouldShowSocketRecovery && timeoutCountdownSeconds > 0
              ? `Attempt ${Math.max(1, reconnectAttempt)} times out in ${timeoutCountdownSeconds}s.`
              : STATUS_CONFIG[NETWORK_DISPLAY_STATUS.RECONNECTING].detail,
        }
      : STATUS_CONFIG[displayStatus];

  if (!config) {
    return null;
  }

  return (
    <div
      className={`fixed left-1/2 top-4 z-[130] w-[calc(100vw-2rem)] max-w-[440px] -translate-x-1/2 rounded-[16px] border px-3 py-3 shadow-[0_16px_40px_rgba(15,23,42,0.16)] backdrop-blur-md transition-all duration-200 sm:px-4 ${config.shellClass}`}
      role={config.role}
      aria-live="polite"
    >
      <div className="flex items-center gap-3">
        <span className={`relative flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[12px] border ${config.iconClass}`} aria-hidden="true">
          <span className={`h-2.5 w-2.5 rounded-full ${config.dotClass}`} />
          {displayStatus === NETWORK_DISPLAY_STATUS.RECONNECTING ? (
            <span className={`absolute h-5 w-5 rounded-full border-2 border-current border-t-transparent opacity-80 motion-safe:animate-spin`} />
          ) : null}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate text-[14px] font-semibold leading-5 text-[#111827]">
              {config.label}
            </p>
            <span className="flex-shrink-0 rounded-full border border-current/15 bg-white/70 px-2 py-0.5 text-[11px] font-semibold uppercase leading-4 tracking-[0.08em]">
              {config.badge}
            </span>
          </div>
          <p className="mt-0.5 truncate text-[12px] font-medium leading-4 text-[#475569]">
            {config.detail}
          </p>
        </div>
      </div>
    </div>
  );
}
