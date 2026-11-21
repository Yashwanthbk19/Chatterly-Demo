import type {AuthOutcome, AuthUser} from '../types/auth';
import {hasCompletedProfileSetup} from './profileCompletion';

// The backend returns MongoDB documents, so the id arrives as _id.
type RawUser = AuthUser & {_id?: string; status?: string; dob?: string};

type RawAuthPayload = {
  token?: string;
  user?: RawUser | null;
  message?: string;
  isProfileComplete?: unknown;
  profileComplete?: unknown;
  profileCompleted?: unknown;
  requires2FA?: unknown;
  userId?: unknown;
  twoFactorMethod?: unknown;
};

export function normalizeAuthUser(raw: RawUser | null | undefined): AuthUser | null {
  if (!raw) { return null; }
  return {
    ...raw,
    id: raw.id ?? raw._id,
    dateOfBirth: raw.dateOfBirth ?? raw.dob,
  };
}

function firstDefinedFlag(...values: unknown[]): boolean | undefined {
  for (const value of values) {
    if (typeof value === 'boolean') { return value; }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true') { return true; }
      if (normalized === 'false') { return false; }
    }
  }
  return undefined;
}

// Port of normalizeAuthResponse() from the web app's api/auth.js. Every sign-in
// endpoint answers with a slightly different shape; this flattens them so the
// screens only ever deal with AuthOutcome.
export function normalizeAuthResponse(payload: RawAuthPayload | null): AuthOutcome {
  const user = normalizeAuthUser(payload?.user);

  const explicit = firstDefinedFlag(
    payload?.isProfileComplete,
    payload?.profileComplete,
    payload?.profileCompleted,
    user?.isProfileComplete,
    user?.profileComplete,
    user?.profileCompleted,
  );

  return {
    token: String(payload?.token ?? ''),
    user,
    isProfileComplete: explicit ?? hasCompletedProfileSetup(user),
    message: String(payload?.message ?? ''),
    requires2FA: Boolean(payload?.requires2FA),
    twoFactorUserId: String(payload?.userId ?? ''),
    twoFactorMethod: String(payload?.twoFactorMethod ?? ''),
  };
}
