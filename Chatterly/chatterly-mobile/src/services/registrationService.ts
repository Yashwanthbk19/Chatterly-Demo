import {apiRequest} from '../api/client';
import {API_BASE_URL} from '../config/api';
import type {RegistrationMethod} from '../types/registration';

type SearchedUser = {email?: string; phone?: string};

/**
 * Sprint 1 Story 1's "Duplicate Account Check".
 *
 * The backend has no dedicated availability route, so this uses the public
 * `/auth/search-users` lookup, which matches name, email and phone. That match
 * is a case-insensitive *substring* regex, so a search for "an@x.com" would
 * also return "ryan@x.com" - the results are therefore compared exactly here
 * rather than trusted as a hit count.
 */
export async function isDuplicateAccount(method: RegistrationMethod, value: string): Promise<boolean> {
  const needle = value.trim().toLowerCase();
  if (!needle) { return false; }

  try {
    const response = await apiRequest(
      `${API_BASE_URL}/auth/search-users?q=${encodeURIComponent(needle)}`,
      {method: 'GET', headers: {Accept: 'application/json'}},
    );
    const payload = await response.json();
    const users: SearchedUser[] = Array.isArray(payload?.data) ? payload.data : [];

    return users.some(user => {
      const stored = String((method === 'email' ? user.email : user.phone) || '').trim().toLowerCase();
      if (!stored) { return false; }
      if (stored === needle) { return true; }
      // Numbers are stored with a country code that the composer may omit, so
      // a phone comparison falls back to matching on the trailing digits.
      if (method !== 'phone') { return false; }
      const storedDigits = stored.replace(/\D/g, '');
      const needleDigits = needle.replace(/\D/g, '');
      return needleDigits.length >= 6 && storedDigits.endsWith(needleDigits);
    });
  } catch {
    // A lookup that cannot reach the server must not block sign-up: the real
    // uniqueness check happens on the backend when the account is created.
    return false;
  }
}
