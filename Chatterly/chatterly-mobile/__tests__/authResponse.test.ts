import {normalizeAuthResponse} from '../src/utils/authResponse';
import {hasCompletedProfileSetup} from '../src/utils/profileCompletion';

describe('normalizeAuthResponse', () => {
  test('flattens a verified email sign-in', () => {
    const outcome = normalizeAuthResponse({
      success: true,
      token: 'jwt-1',
      isProfileComplete: false,
      user: {_id: 'u1', email: 'person@example.com', name: 'Person'},
    } as never);

    expect(outcome.token).toBe('jwt-1');
    expect(outcome.isProfileComplete).toBe(false);
    expect(outcome.requires2FA).toBe(false);
    // Mongo returns _id; screens read id.
    expect(outcome.user?.id).toBe('u1');
  });

  test('carries the 2FA gate through without a token', () => {
    const outcome = normalizeAuthResponse({
      success: true,
      requires2FA: true,
      userId: 'u9',
      twoFactorMethod: 'sms',
    } as never);

    expect(outcome.requires2FA).toBe(true);
    expect(outcome.twoFactorUserId).toBe('u9');
    expect(outcome.twoFactorMethod).toBe('sms');
    expect(outcome.token).toBe('');
  });

  test('reads the completion flag however the endpoint spells it', () => {
    expect(normalizeAuthResponse({profileComplete: true} as never).isProfileComplete).toBe(true);
    expect(normalizeAuthResponse({profileCompleted: 'true'} as never).isProfileComplete).toBe(true);
    expect(normalizeAuthResponse({user: {isProfileComplete: true}} as never).isProfileComplete).toBe(true);
  });

  test('falls back to the profile itself when no flag is sent', () => {
    // google-login on a brand new account returns no flag at all.
    expect(normalizeAuthResponse({token: 't', user: {email: 'a@b.com'}} as never).isProfileComplete)
      .toBe(false);
    expect(normalizeAuthResponse({token: 't', user: {dob: '1998-04-02'}} as never).isProfileComplete)
      .toBe(true);
  });

  test('survives an empty or missing payload', () => {
    const outcome = normalizeAuthResponse(null);
    expect(outcome).toEqual({
      token: '',
      user: null,
      isProfileComplete: false,
      message: '',
      requires2FA: false,
      twoFactorUserId: '',
      twoFactorMethod: '',
    });
  });
});

describe('hasCompletedProfileSetup', () => {
  test('an explicit flag decides it', () => {
    expect(hasCompletedProfileSetup({isProfileComplete: true})).toBe(true);
    expect(hasCompletedProfileSetup({isProfileComplete: false})).toBe(false);
  });

  test('any explicit true wins over a false', () => {
    expect(hasCompletedProfileSetup({isProfileComplete: false, profileComplete: true})).toBe(true);
  });

  test('without a flag, a saved date of birth counts as complete', () => {
    expect(hasCompletedProfileSetup({name: 'Person'})).toBe(false);
    expect(hasCompletedProfileSetup({dateOfBirth: '1998-04-02'})).toBe(true);
    expect(hasCompletedProfileSetup({dateOfBirth: '   '})).toBe(false);
  });

  test('handles a missing user', () => {
    expect(hasCompletedProfileSetup(null)).toBe(false);
  });
});
