import type {Country, RegistrationErrors, RegistrationMethod} from '../types/registration';
import {isValidPhoneLength} from './phoneNumber';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;

export function validateRegistration(
  method: RegistrationMethod,
  value: string,
  country: Country,
): RegistrationErrors {
  const trimmed = value.trim();
  if (method === 'phone') {
    if (!trimmed) { return {phone: 'Phone number is required'}; }
    if (!/^\d+$/.test(trimmed)) { return {phone: 'Use numbers only'}; }
    if (!isValidPhoneLength(country, trimmed.length)) {
      return {phone: `Enter a ${country.phoneLengths?.join(' or ') ?? country.phoneLength}-digit phone number`};
    }
    return {};
  }
  if (!trimmed) { return {email: 'Required'}; }
  if (!EMAIL_PATTERN.test(trimmed)) { return {email: 'Please enter a valid email address'}; }
  return {};
}
