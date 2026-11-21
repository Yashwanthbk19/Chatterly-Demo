import type {AuthUser} from '../types/auth';

// Ported from hasCompletedProfileSetup() in the web app's utils/profile.js.
// The backend spells the flag three different ways depending on the endpoint,
// so all three are read before falling back to the date of birth.
const COMPLETION_FLAG_KEYS = ['isProfileComplete', 'profileComplete', 'profileCompleted'] as const;

function parseCompletionFlag(value: unknown): boolean | null {
  if (typeof value === 'boolean') { return value; }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') { return true; }
    if (normalized === 'false') { return false; }
  }
  return null;
}

// An explicit true anywhere wins, matching the web's resolver.
function resolveExplicitFlag(user: AuthUser | null): boolean | null {
  if (!user) { return null; }

  const flags = COMPLETION_FLAG_KEYS
    .map(key => parseCompletionFlag(user[key]))
    .filter((value): value is boolean => value !== null);

  if (flags.length === 0) { return null; }
  return flags.includes(true);
}

export function hasCompletedProfileSetup(user: AuthUser | null): boolean {
  if (!user) { return false; }

  const explicit = resolveExplicitFlag(user);
  if (explicit !== null) { return explicit; }

  // No flag from the server: a saved date of birth is the web's proxy for
  // "the create-profile form was submitted".
  return Boolean(String(user.dateOfBirth ?? '').trim());
}
