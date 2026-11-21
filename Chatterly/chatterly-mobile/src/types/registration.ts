export type RegistrationMethod = 'phone' | 'email';

export type Country = {
  name: string;
  code: string;
  dialCode: string;
  flag: string;
  phoneLength: number;
  /** Allowed national lengths when a region uses more than one; phoneLength is the maximum. */
  phoneLengths?: readonly number[];
};

export type RegistrationErrors = {phone?: string; email?: string};
