// A login that hits 2FA never receives a JWT: `/api/auth/phone-login`,
// `/verify-email-otp` and `/google-login` all return
// `{ requires2FA: true, userId, twoFactorMethod }` instead (see authController).
// The challenge that finishes the sign-in therefore has to carry that handful of
// values across the navigation into /chats, without anything that resembles a
// session — hence sessionStorage: it survives the redirect and a refresh, and
// dies with the tab.

const PENDING_TWO_FACTOR_STORAGE_KEY = 'chatterly_pending_2fa';

const readStorage = () => {
  try {
    return sessionStorage.getItem(PENDING_TWO_FACTOR_STORAGE_KEY);
  } catch (error) {
    return null;
  }
};

export const readPendingTwoFactor = () => {
  const raw = readStorage();
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (!parsed?.userId) return null;

    return {
      userId: String(parsed.userId),
      // "sms" | "authenticator" — the account's enrolled second factor.
      method: String(parsed.method || 'sms'),
      // Known for phone sign-ins (E.164); empty for email/Google, where the
      // challenge asks for the number instead.
      phone: String(parsed.phone || ''),
      startedAt: Number(parsed.startedAt) || 0,
    };
  } catch (error) {
    return null;
  }
};

export const savePendingTwoFactor = ({ userId, method = 'sms', phone = '' } = {}) => {
  if (!userId) return null;

  const pending = {
    userId: String(userId),
    method: String(method || 'sms'),
    phone: String(phone || ''),
    startedAt: Date.now(),
  };

  try {
    sessionStorage.setItem(PENDING_TWO_FACTOR_STORAGE_KEY, JSON.stringify(pending));
  } catch (error) {
    // Nothing to do: the caller still navigates, and the gate will send the user
    // back to /login because no challenge can be read.
  }

  return pending;
};

export const clearPendingTwoFactor = () => {
  try {
    sessionStorage.removeItem(PENDING_TWO_FACTOR_STORAGE_KEY);
  } catch (error) {
    // ignore
  }
};

export const hasPendingTwoFactor = () => Boolean(readPendingTwoFactor());
