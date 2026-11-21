import type {ProfileDraft} from '../types/profile';

export type ProfileErrors = Partial<Record<'name' | 'dateOfBirth', string>>;

export const PROFILE_NAME_MAX_LENGTH = 30;
export const PROFILE_STATUS_MAX_LENGTH = 250;
export const PROFILE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export function validateProfileUpdate(name: string, status: string): string | null {
  const cleanName = name.trim();
  if (!cleanName) { return 'Name is required.'; }
  if (cleanName.length > PROFILE_NAME_MAX_LENGTH) { return 'Name cannot exceed 30 characters.'; }
  if (status.length > PROFILE_STATUS_MAX_LENGTH) { return 'Bio cannot exceed 250 characters.'; }
  return null;
}

export function validateProfileImage(image: {mimeType?: string | null; fileName?: string | null; fileSize?: number | null}): string | null {
  const mime = (image.mimeType || '').toLowerCase();
  const name = (image.fileName || '').toLowerCase();
  const supportedMime = ['image/jpeg', 'image/jpg', 'image/png'].includes(mime);
  const supportedExtension = /\.(jpe?g|png)$/.test(name);
  if ((mime && !supportedMime) || (!mime && name && !supportedExtension)) { return 'Only JPG and PNG images are supported.'; }
  if (image.fileSize != null && image.fileSize > PROFILE_IMAGE_MAX_BYTES) { return 'Photo must be 5 MB or smaller.'; }
  return null;
}

export function formatDateOfBirth(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length < 3) { return digits; }
  if (digits.length < 5) { return `${digits.slice(0, 2)}/${digits.slice(2)}`; }
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export function validateProfile(draft: ProfileDraft): ProfileErrors {
  const errors: ProfileErrors = {};
  const name = draft.name.trim();
  if (!name) { errors.name = 'Full name is required.'; }
  else if (name.length < 2) { errors.name = 'Name must be at least 2 characters.'; }
  else if (name.length > PROFILE_NAME_MAX_LENGTH) { errors.name = 'Name cannot exceed 30 characters.'; }

  if (!draft.dateOfBirth) { errors.dateOfBirth = 'Date of birth is required.'; }
  else {
    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(draft.dateOfBirth);
    const valid = match && (() => {
      const day = Number(match[1]);
      const month = Number(match[2]);
      const year = Number(match[3]);
      const date = new Date(year, month - 1, day);
      return year >= 1900 && year <= new Date().getFullYear() &&
        date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
    })();
    if (!valid) { errors.dateOfBirth = 'Enter a valid date as dd/mm/yyyy.'; }
  }
  return errors;
}
