import {DEFAULT_COUNTRY} from '../src/constants/countries';
import {isDuplicateAccount} from '../src/services/registrationService';
import {validateRegistration} from '../src/utils/registrationValidation';

describe('registration validation', () => {
  test('requires a phone number and validates its length', () => {
    expect(validateRegistration('phone', '', DEFAULT_COUNTRY).phone).toBeDefined();
    expect(validateRegistration('phone', '12345', DEFAULT_COUNTRY).phone).toContain('10-digit');
    expect(validateRegistration('phone', '9876543210', DEFAULT_COUNTRY)).toEqual({});
  });

  test('requires a correctly formatted email address', () => {
    expect(validateRegistration('email', '', DEFAULT_COUNTRY).email).toBe('Required');
    expect(validateRegistration('email', 'user@', DEFAULT_COUNTRY).email).toBe('Please enter a valid email address');
    expect(validateRegistration('email', 'user.com', DEFAULT_COUNTRY).email).toBe('Please enter a valid email address');
    expect(validateRegistration('email', '@domain.com', DEFAULT_COUNTRY).email).toBe('Please enter a valid email address');
    expect(validateRegistration('email', 'person@example.com', DEFAULT_COUNTRY)).toEqual({});
  });

});

describe('duplicate account check', () => {
  const respondWith = (users: unknown[]) => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({success: true, count: users.length, data: users}),
    }) as unknown as typeof fetch;
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('reports an exact email match as taken', async () => {
    respondWith([{email: 'Hello@Chatterly.com', phone: '+919876543210'}]);

    await expect(isDuplicateAccount('email', 'hello@chatterly.com')).resolves.toBe(true);
  });

  test('ignores the substring matches the search regex also returns', async () => {
    // `/auth/search-users` matches on a loose regex, so a lookup for
    // "an@example.com" also comes back with "ryan@example.com".
    respondWith([{email: 'ryan@example.com'}]);

    await expect(isDuplicateAccount('email', 'an@example.com')).resolves.toBe(false);
  });

  test('matches a phone number stored with its country code', async () => {
    respondWith([{phone: '+91 98765 43210'}]);

    await expect(isDuplicateAccount('phone', '9876543210')).resolves.toBe(true);
  });

  test('treats an unreachable lookup as not-taken rather than blocking sign-up', async () => {
    globalThis.fetch = jest.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;

    await expect(isDuplicateAccount('email', 'new@example.com')).resolves.toBe(false);
  });
});
