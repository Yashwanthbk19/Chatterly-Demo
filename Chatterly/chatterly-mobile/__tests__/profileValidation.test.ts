import {formatDateOfBirth, validateProfile, validateProfileImage, validateProfileUpdate} from '../src/utils/profileValidation';

test('formats date of birth while typing', () => {
  expect(formatDateOfBirth('01021999')).toBe('01/02/1999');
});

test('validates profile edits', () => {
  expect(validateProfileUpdate('', '')).toBe('Name is required.');
  expect(validateProfileUpdate('Maya', 'x'.repeat(151))).toBe('Status cannot exceed 150 characters.');
  expect(validateProfileUpdate('Maya Rao', 'Available')).toBeNull();
});

test('allows JPG and PNG profile photos up to 5 MB', () => {
  expect(validateProfileImage({mimeType: 'image/gif', fileName: 'avatar.gif'})).toBe('Only JPG and PNG images are supported.');
  expect(validateProfileImage({mimeType: 'image/png', fileName: 'avatar.png', fileSize: 5 * 1024 * 1024 + 1})).toBe('Photo must be 5 MB or smaller.');
  expect(validateProfileImage({mimeType: 'image/jpeg', fileName: 'avatar.jpg', fileSize: 5 * 1024 * 1024})).toBeNull();
});

test('requires a full name and valid date of birth', () => {
  expect(validateProfile({name: '', dateOfBirth: '', bio: ''})).toEqual({
    name: 'Full name is required.',
    dateOfBirth: 'Date of birth is required.',
  });
  expect(validateProfile({name: 'Maya', dateOfBirth: '31/02/2020', bio: ''})).toEqual({
    dateOfBirth: 'Enter a valid date as dd/mm/yyyy.',
  });
});
