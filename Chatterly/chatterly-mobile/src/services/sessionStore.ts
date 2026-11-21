import type {AuthOutcome, AuthUser} from '../types/auth';
import * as SecureStore from 'expo-secure-store';

// Keep an in-memory copy for synchronous API callers and an encrypted native
// copy so a notification can cold-start the app into an authenticated chat.
export type Session = {
  token: string;
  user: AuthUser | null;
  isProfileComplete: boolean;
};

const SESSION_KEY = 'chatterly.auth-session.v1';

let session: Session | null = null;
let persistenceQueue: Promise<void> = Promise.resolve();

type SessionListener = (session: Session | null) => void;
const sessionListeners = new Set<SessionListener>();

/**
 * Told when an account signs in, signs out, or a saved session is restored at
 * launch - the moments account-backed settings (theme, wallpaper) have to be
 * read again. The providers that hold them mount before the session is
 * restored, so a single check on mount would always see "signed out".
 */
export function subscribeToSessionChange(listener: SessionListener): () => void {
  sessionListeners.add(listener);
  return () => { sessionListeners.delete(listener); };
}

function notifySessionChange(): void {
  const current = session;
  sessionListeners.forEach(listener => {
    try { listener(current); } catch { /* A listener must never break sign-in. */ }
  });
}

function persist(operation: () => Promise<void>): Promise<void> {
  const next = persistenceQueue.catch(() => undefined).then(operation);
  persistenceQueue = next.catch(() => undefined);
  return next;
}

export function saveSession(outcome: AuthOutcome): Promise<void> {
  if (!outcome.token) { return Promise.resolve(); }
  session = {
    token: outcome.token,
    user: outcome.user,
    isProfileComplete: outcome.isProfileComplete,
  };
  const storedSession = JSON.stringify(session);
  notifySessionChange();
  return persist(() => SecureStore.setItemAsync(SESSION_KEY, storedSession));
}

export function getSession(): Session | null {
  return session;
}

export function getToken(): string {
  return session?.token ?? '';
}

export function clearSession(): Promise<void> {
  const hadSession = Boolean(session);
  session = null;
  if (hadSession) { notifySessionChange(); }
  return persist(() => SecureStore.deleteItemAsync(SESSION_KEY));
}

/** Restores the authenticated session before choosing the cold-start route. */
export async function restoreSession(): Promise<Session | null> {
  if (session) { return session; }
  try {
    await persistenceQueue;
    const stored = await SecureStore.getItemAsync(SESSION_KEY);
    if (!stored) { return null; }
    const parsed = JSON.parse(stored) as Partial<Session>;
    if (!parsed.token) {
      await SecureStore.deleteItemAsync(SESSION_KEY);
      return null;
    }
    session = {
      token: parsed.token,
      user: parsed.user || null,
      isProfileComplete: parsed.isProfileComplete !== false,
    };
    notifySessionChange();
    return session;
  } catch {
    return null;
  }
}

export function updateSessionUser(user: Partial<AuthUser>): void {
  if (!session) { return; }
  session = {token: session.token, user: {...session.user, ...user}, isProfileComplete: session.isProfileComplete};
  const storedSession = JSON.stringify(session);
  persist(() => SecureStore.setItemAsync(SESSION_KEY, storedSession)).catch(() => undefined);
}

export function markSessionProfileComplete(user?: AuthUser): Promise<void> {
  if (!session) { return Promise.resolve(); }
  session = {
    ...session,
    user: {...session.user, ...user, isProfileComplete: true},
    isProfileComplete: true,
  };
  const storedSession = JSON.stringify(session);
  return persist(() => SecureStore.setItemAsync(SESSION_KEY, storedSession));
}
