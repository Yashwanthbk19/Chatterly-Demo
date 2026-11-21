export type AuthMethod = 'phone' | 'email' | 'google';

export type AuthUser = {
  id?: string;
  email?: string;
  phone?: string;
  name?: string;
  profilePic?: string;
  status?: string;
  dateOfBirth?: string;
  isProfileComplete?: boolean;
  profileComplete?: boolean;
  profileCompleted?: boolean;
};

// Mirrors normalizeAuthResponse() in the web app's api/auth.js so every
// sign-in method - email OTP, phone OTP and Google - hands the app the same
// shape, whatever the endpoint returned.
export type AuthOutcome = {
  token: string;
  user: AuthUser | null;
  isProfileComplete: boolean;
  message: string;
  // 2FA gate: when the account has a second factor and this device is not
  // trusted, the backend answers with requires2FA and NO token. The caller must
  // run the challenge before there is a session.
  requires2FA: boolean;
  twoFactorUserId: string;
  twoFactorMethod: string;
};
