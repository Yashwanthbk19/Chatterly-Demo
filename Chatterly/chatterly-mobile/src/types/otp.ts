export type OtpChannel =
  | 'phone'
  | 'email'
  | 'google'
  | 'two-factor-authenticator'
  | 'two-factor-sms';

// Where the code was sent. Phone keeps the parts separate so the subscriber
// digits can be masked without re-parsing a formatted string.
export type OtpDestination =
  | {channel: 'phone'; dialCode: string; phone: string}
  | {channel: 'email' | 'google'; email: string}
  | {channel: 'two-factor-authenticator'; userId: string}
  | {channel: 'two-factor-sms'; userId: string; dialCode: string; phone: string};

export type OtpErrorKind = 'invalid' | 'expired' | 'attempts' | 'offline' | 'server';
