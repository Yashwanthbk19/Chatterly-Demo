import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Logo from '../components/Logo';
import Loader from '../components/loader';
import ProfileImageCropModal from '../components/ProfileImageCropModal';
import CompressionIndicator from '../components/CompressionIndicator';
import defaultProfilePic from '../assets/image.png';
import { getProfile, updateProfile } from '../api/contactapi';
import useMediaCompression from '../hooks/useMediaCompression';
import {
  validateProfileForm,
  normalizePhone,
  sanitizePhoneDigits,
  PHONE_COUNTRY_CODE,
  PHONE_LOCAL_DIGIT_LIMIT,
  EMAIL_MAX_LENGTH,
} from '../utils/formValidators';
import {
  cacheBustProfilePictureValue,
  DEFAULT_PROFILE_PICTURE,
  getStoredUser,
  isCustomProfilePictureValue,
  normalizeProfile,
  normalizeProfilePictureValue,
  persistProfileToStorage,
  resolveProfileDisplayPicture,
  isEmailRequiredForAccount,
  limitProfileNamePart,
  limitProfileStatus,
  limitProfileStatusForTyping,
  PROFILE_NAME_PART_MAX_LENGTH,
  PROFILE_STATUS_MAX_LENGTH,
} from '../utils/profile';

const emptyErrors = {
  firstName: '',
  lastName: '',
  status: '',
  email: '',
  phone: '',
};

const EMAIL_REQUIRED_MESSAGE = 'Email is required for this account.';
const SUPPORTED_PROFILE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/jpg']);
const SUPPORTED_PROFILE_IMAGE_EXTENSIONS = /\.(jpg|jpeg|png)$/i;
const PROFILE_IMAGE_ACCEPT = '.jpg,.jpeg,.png,image/jpeg,image/png';
const PROFILE_IMAGE_TYPES_LABEL = 'JPG or PNG';

const getProfileImageFileName = (blob, fallbackName = 'profile') => {
  const mimeType = String(blob?.type || '').toLowerCase();
  const fallbackExtension = String(fallbackName || '').match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  const extension =
    mimeType === 'image/png'
        ? 'png'
        : mimeType === 'image/jpeg' || mimeType === 'image/jpg'
          ? 'jpg'
          : fallbackExtension && ['jpg', 'jpeg', 'png'].includes(fallbackExtension)
            ? fallbackExtension
            : 'jpg';

  return `profile.${extension === 'jpeg' ? 'jpg' : extension}`;
};

const buildEditableFormState = (profile = {}) => ({
  firstName: profile.firstName || '',
  lastName: profile.lastName || '',
  status: profile.status || '',
  email: profile.email || '',
  phone: sanitizePhoneDigits(profile.phone || ''),
});

const getComparableFormState = (formData = {}) => ({
  firstName: limitProfileNamePart(formData.firstName || '').trim(),
  lastName: limitProfileNamePart(formData.lastName || '').trim(),
  status: limitProfileStatus(formData.status || ''),
  email: String(formData.email || '').trim().toLowerCase(),
  phone: formData.phone && String(formData.phone).trim() ? normalizePhone(String(formData.phone).trim()) : '',
});

const readBlobAsDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Unable to read the selected image.'));
    reader.readAsDataURL(blob);
  });

export default function EditProfile() {
  const navigate = useNavigate();
  const initialProfile = normalizeProfile({}, getStoredUser());
  const [profile, setProfile] = useState(initialProfile);
  const [formData, setFormData] = useState(() => buildEditableFormState(initialProfile));
  const [initialFormData, setInitialFormData] = useState(() => buildEditableFormState(initialProfile));
  const [errors, setErrors] = useState(emptyErrors);
  const [formError, setFormError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [profilePicFile, setProfilePicFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [imageError, setImageError] = useState('');
  const [pendingCropImage, setPendingCropImage] = useState(null);
  const fileInputRef = useRef(null);

  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [isRemovingPic, setIsRemovingPic] = useState(false);

  const mediaCompression = useMediaCompression(2000);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  useEffect(() => {
    return () => {
      if (pendingCropImage?.src) {
        URL.revokeObjectURL(pendingCropImage.src);
      }
    };
  }, [pendingCropImage]);

  useEffect(() => {
    let isMounted = true;

    const loadProfile = async () => {
      const fallbackUser = getStoredUser();
      setIsLoading(true);

      try {
        const data = await getProfile();
        const normalizedProfile = normalizeProfile(data, fallbackUser);

        if (!isMounted) {
          return;
        }

        setProfile(normalizedProfile);
        const nextFormData = buildEditableFormState(normalizedProfile);
        setFormData(nextFormData);
        setInitialFormData(nextFormData);
        setErrors(emptyErrors);
      } catch {
        const fallbackProfile = normalizeProfile({}, fallbackUser);

        if (!isMounted) {
          return;
        }

        setProfile(fallbackProfile);
        const nextFormData = buildEditableFormState(fallbackProfile);
        setFormData(nextFormData);
        setInitialFormData(nextFormData);
        setErrors(emptyErrors);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadProfile();

    return () => {
      isMounted = false;
    };
  }, []);

  const getValidationErrors = (nextFormData = formData) =>
    validateProfileForm(nextFormData, {
      requirePhone: true,
      requireEmail: isEmailRequired,
      requiredEmailMessage: EMAIL_REQUIRED_MESSAGE,
    });

  const handleFieldChange = (field, value) => {
    const normalizedValue =
      field === 'firstName' || field === 'lastName'
        ? limitProfileNamePart(value)
        : field === 'email'
          ? String(value).slice(0, EMAIL_MAX_LENGTH)
        : field === 'phone'
          ? sanitizePhoneDigits(value)
        : field === 'status'
          ? limitProfileStatusForTyping(value)
          : value;

    const nextFormData = {
      ...formData,
      [field]: normalizedValue,
    };

    setFormData(nextFormData);
    setErrors({
      ...emptyErrors,
      ...getValidationErrors(nextFormData),
    });

    setFormError('');
  };

  const clearSelectedImage = ({ keepError = false } = {}) => {
    setProfilePicFile(null);

    if (!keepError) {
      setImageError('');
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl('');
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const clearPendingCropImage = ({ resetFileInput = false } = {}) => {
    if (pendingCropImage?.src) {
      URL.revokeObjectURL(pendingCropImage.src);
    }

    setPendingCropImage(null);

    if (resetFileInput && fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleImageUpload = (event) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const isMimeTypeValid = SUPPORTED_PROFILE_IMAGE_TYPES.has(String(file.type || '').toLowerCase());
    const isExtensionValid = Boolean(file.name && SUPPORTED_PROFILE_IMAGE_EXTENSIONS.test(file.name));

    if (!isMimeTypeValid || !isExtensionValid) {
      setImageError(`Please upload a ${PROFILE_IMAGE_TYPES_LABEL} image.`);
      clearSelectedImage({ keepError: true });
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setImageError('Image size must be under 2MB.');
      clearSelectedImage({ keepError: true });
      return;
    }

    setImageError('');
    setFormError('');
    setShowRemoveConfirm(false);
    clearPendingCropImage();

    setPendingCropImage({
      src: URL.createObjectURL(file),
      name: file.name,
      type: file.type || 'image/jpeg',
    });
  };

  const handleCancelImageCrop = () => {
    clearPendingCropImage({ resetFileInput: true });
  };

  const handleApplyImageCrop = ({ file, previewUrl: croppedPreviewUrl, error }) => {
    if (error) {
      setImageError(error);
      clearPendingCropImage({ resetFileInput: true });
      return;
    }

    if (!file || !croppedPreviewUrl) {
      clearPendingCropImage({ resetFileInput: true });
      return;
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setImageError('');
    setProfilePicFile(file);
    setPreviewUrl(croppedPreviewUrl);
    setFormError('');
    setShowRemoveConfirm(false);
    clearPendingCropImage();
  };

  const handleRemoveProfilePic = async () => {
    setIsRemovingPic(true);
    setFormError('');

    try {
      const firstName = limitProfileNamePart(formData.firstName);
      const lastName = limitProfileNamePart(formData.lastName);

      const payload = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        status: limitProfileStatus(formData.status),
        fullName: `${firstName} ${lastName}`.trim(),
        name: `${firstName} ${lastName}`.trim(),
        bio: limitProfileStatus(formData.status),
      };

      const response = await updateProfile(
        { ...payload, removeProfilePic: true, profilePic: null },
        { mode: 'update' }
      );

      clearSelectedImage();
      setPreviewUrl('');
      setProfilePicFile(null);
      setShowRemoveConfirm(false);

      const rawUpdate = {
        ...profile.raw,
        ...payload,
        ...response,
        profileImage: null,
        profilePic: null,
        photo: null,
        avatar: null,
        image: null,
      };

      const nextProfile = normalizeProfile(rawUpdate, getStoredUser());
      nextProfile.profileImage = DEFAULT_PROFILE_PICTURE;
      nextProfile.profilePic = DEFAULT_PROFILE_PICTURE;

      persistProfileToStorage(nextProfile);
      setProfile(nextProfile);

      const storedUser = getStoredUser();
      if (storedUser) {
        const cleanedUser = {
          ...storedUser,
          profileImage: DEFAULT_PROFILE_PICTURE,
          profilePic: DEFAULT_PROFILE_PICTURE,
          profilePicture: DEFAULT_PROFILE_PICTURE,
          photo: DEFAULT_PROFILE_PICTURE,
          photoURL: DEFAULT_PROFILE_PICTURE,
          avatar: DEFAULT_PROFILE_PICTURE,
          avatarUrl: DEFAULT_PROFILE_PICTURE,
          image: DEFAULT_PROFILE_PICTURE,
        };
        localStorage.setItem('user', JSON.stringify(cleanedUser));
      }

      navigate('/profile', {
        state: {
          successMessage: 'Profile picture removed successfully.',
          refresh: true,
          timestamp: Date.now(),
        },
      });
    } catch (error) {
      console.error('Remove photo error:', error);
      setFormError(error?.message || 'Unable to remove profile picture.');
    } finally {
      setIsRemovingPic(false);
    }
  };

  const validateForm = () => {
    const validationErrors = getValidationErrors();

    setErrors({
      ...emptyErrors,
      ...validationErrors,
    });

    return Object.keys(validationErrors).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!canSave) {
      return;
    }

    if (!validateForm()) {
      return;
    }

    const firstName = limitProfileNamePart(formData.firstName);
    const lastName = limitProfileNamePart(formData.lastName);

    const payload = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      status: limitProfileStatus(formData.status),
      fullName: `${firstName} ${lastName}`.trim(),
      name: `${firstName} ${lastName}`.trim(),
      bio: limitProfileStatus(formData.status),
    };

    // Send the complete contact identity with every update. Some deployments
    // validate the whole profile on PATCH; omitting an unchanged phone or email
    // made a perfectly valid email-only edit fail server-side.
    const trimmedEmail = formData.email.trim();
    if (trimmedEmail) {
      payload.email = trimmedEmail;
    }

    if (formData.phone && formData.phone.trim()) {
      payload.phone = normalizePhone(formData.phone);
    }

    setIsSaving(true);
    setFormError('');

    try {
      let response;
      let uploadedProfileImageFallback = '';
      const existingProfileImage = normalizeProfilePictureValue(profile.profileImage || profile.profilePic);

      if (profilePicFile) {
        const formPayload = new FormData();
        formPayload.append('firstName', payload.firstName);
        formPayload.append('lastName', payload.lastName);
        formPayload.append('fullName', payload.fullName);
        formPayload.append('name', payload.name);
        formPayload.append('status', payload.status);
        formPayload.append('bio', payload.bio);

        if (payload.email) formPayload.append('email', payload.email);
        if (payload.phone) formPayload.append('phone', payload.phone);

        const compressionResult = await mediaCompression.compress(profilePicFile);

        if (!compressionResult.success) {
          throw new Error(compressionResult.error || 'Failed to compress image');
        }

        let uploadBlob = compressionResult.blob;
        let fileName = getProfileImageFileName(uploadBlob, profilePicFile.name);

        try {
          if (previewUrl) {
            const res = await fetch(previewUrl);
            uploadBlob = await res.blob();
          }
          fileName = getProfileImageFileName(uploadBlob, profilePicFile.name);
        } catch (err) {
          console.error('Error resolving blob format:', err);
        }

        try {
          uploadedProfileImageFallback = await readBlobAsDataUrl(uploadBlob);
        } catch (error) {
          console.error('Error preparing local profile photo fallback:', error);
        }

        formPayload.append('profilePic', uploadBlob, fileName);

        response = await updateProfile(formPayload, { mode: 'update' });
      } else {
        response = await updateProfile(payload, { mode: 'update' });
      }

      const responseProfileImage =
        [
          response?.profileImage,
          response?.profilePic,
          response?.profilePicture,
          response?.photo,
          response?.photoURL,
          response?.avatar,
          response?.avatarUrl,
          response?.image,
        ]
          .map((value) => normalizeProfilePictureValue(value))
          .find(Boolean) || '';
      const shouldPreferUploadedProfileImage =
        Boolean(uploadedProfileImageFallback) &&
        (
          !responseProfileImage ||
          normalizeProfilePictureValue(responseProfileImage) === existingProfileImage
        );
      const persistedProfileImage = shouldPreferUploadedProfileImage
        ? uploadedProfileImageFallback
        : responseProfileImage
          ? cacheBustProfilePictureValue(responseProfileImage, Date.now())
          : '';
      const mergedProfileData = {
        ...profile.raw,
        ...payload,
        ...response,
      };

      if (persistedProfileImage) {
        mergedProfileData.profileImage = persistedProfileImage;
        mergedProfileData.profilePic = persistedProfileImage;
        mergedProfileData.profilePicture = persistedProfileImage;
        mergedProfileData.photo = persistedProfileImage;
        mergedProfileData.photoURL = persistedProfileImage;
        mergedProfileData.avatar = persistedProfileImage;
        mergedProfileData.avatarUrl = persistedProfileImage;
        mergedProfileData.image = persistedProfileImage;
      }

      const nextProfile = normalizeProfile(mergedProfileData, getStoredUser());
      persistProfileToStorage(nextProfile);
      setProfile(nextProfile);
      const nextEditableFormState = buildEditableFormState(nextProfile);
      setFormData(nextEditableFormState);
      setInitialFormData(nextEditableFormState);
      clearSelectedImage();
      mediaCompression.reset();
      navigate('/profile', {
        state: {
          successMessage: 'Profile updated successfully.',
          refresh: true,
          timestamp: Date.now(),
        },
      });
    } catch (error) {
      setFormError(error?.message || 'Unable to update your profile right now.');
      mediaCompression.reset();
    } finally {
      setIsSaving(false);
    }
  };

  const inputBaseClass =
    'w-full rounded-2xl border px-5 py-5 text-lg text-[#212529] font-medium outline-none transition-all';

  const currentProfilePic = resolveProfileDisplayPicture(profile.profileImage || profile.profilePic);
  const hasCustomProfilePic = isCustomProfilePictureValue(currentProfilePic);
  const hasSelectedOrCustomPic = Boolean(previewUrl || hasCustomProfilePic);
  const isEmailRequired = isEmailRequiredForAccount(profile, getStoredUser());
  const comparableCurrentForm = getComparableFormState(formData);
  const comparableInitialForm = getComparableFormState(initialFormData);
  const isFormValid = Object.keys(getValidationErrors()).length === 0;
  const hasFormChanges =
    Boolean(profilePicFile) ||
    Object.keys(comparableInitialForm).some((key) => comparableCurrentForm[key] !== comparableInitialForm[key]);
  const canSave = hasFormChanges && isFormValid && !isSaving && !isRemovingPic && !mediaCompression.isCompressing;
  
  return (
    <>
      <ProfileImageCropModal
        isOpen={Boolean(pendingCropImage)}
        imageSrc={pendingCropImage?.src || ''}
        imageName={pendingCropImage?.name || ''}
        imageType={pendingCropImage?.type || 'image/jpeg'}
        onCancel={handleCancelImageCrop}
        onApply={handleApplyImageCrop}
      />

      <div className="chatterly-auth-shell min-h-screen bg-[#F8F9FB] p-4 md:p-8 font-sans">
        <div className="mx-auto flex min-h-[calc(100vh-2rem)] max-w-[1240px] overflow-hidden rounded-[32px] bg-white shadow-[0_8px_30px_rgba(0,0,0,0.04)] md:min-h-[840px]">
        <div className="login-hero hidden w-[38%] flex-col justify-between p-12 lg:flex">
          <div>
            <Link to="/profile" className="login-hero__logo mb-12 inline-block">
              <Logo />
            </Link>
            <p className="login-hero__eyebrow mb-4 text-sm font-semibold uppercase tracking-[0.2em]">Edit Profile</p>
            <h1 className="login-hero__title mb-4 text-[48px] font-bold leading-tight">Update how you appear</h1>
            <p className="login-hero__text max-w-[320px] text-base leading-relaxed">
              Keep your display name and status current so teammates and friends can find you quickly.
            </p>
          </div>

          <div className="login-hero__card rounded-[28px] p-6 backdrop-blur-sm">
            <p className="login-hero__title text-base font-semibold">Profile details</p>
            <p className="login-hero__text mt-2 text-base leading-relaxed">
              Update the details people use to recognize and reach you in conversations.
            </p>
          </div>
        </div>

        <div className="flex flex-1 flex-col p-8 md:p-16 lg:p-20">
          <div className="mb-12 flex items-center justify-between gap-6">
            <button
              onClick={() => navigate('/profile')}
              title="Return to your profile without saving"
              className="inline-flex items-center gap-2 text-sm font-semibold text-gray-400 transition-colors hover:text-[#212529]"
              type="button"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
              </svg>
              Back to profile
            </button>
          </div>

          {isLoading ? (
            <div className="flex flex-1 items-center justify-center">
              <Loader text="Loading profile..." />
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-12">
              <div className="rounded-[28px] border border-gray-100 bg-[#FCFCFD] p-8 sm:p-10 md:p-12">
                <div className="flex flex-col gap-8 md:flex-row md:items-center md:gap-10">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={PROFILE_IMAGE_ACCEPT}
                    className="hidden"
                    onChange={handleImageUpload}
                  />

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="group relative h-36 w-36 shrink-0 overflow-hidden rounded-full bg-[#EEF2FF] shadow-sm"
                    aria-label="Upload profile photo"
                    title={hasSelectedOrCustomPic ? 'Choose a different profile photo' : 'Choose a profile photo'}
                  >
                    <img
                      src={previewUrl || currentProfilePic || defaultProfilePic}
                      alt={profile.username || profile.fullName || 'Profile'}
                      className="h-full w-full object-cover"
                    />
                    <div className="absolute inset-0 hidden items-center justify-center bg-black/45 text-xs font-semibold text-white group-hover:flex">
                      {hasSelectedOrCustomPic ? 'Change' : 'Add'}
                    </div>
                  </button>

                  <div className="min-w-0">
                    <h2 className="text-3xl font-bold leading-tight text-[#212529] sm:text-4xl lg:text-[52px]">Edit your details</h2>
                    <p className="mt-4 text-xl leading-relaxed text-[#374151]">
                      Save your latest first name, last name, status, and profile photo.
                    </p>

                    <div className="mt-6 flex flex-wrap items-center gap-6">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        title={hasSelectedOrCustomPic ? 'Choose a different profile photo' : 'Choose a profile photo'}
                        className="text-sm font-semibold text-[#4C6EF5] transition-colors hover:text-[#3b5bdb]"
                      >
                        {hasSelectedOrCustomPic ? 'Change profile photo' : 'Add profile photo'}
                      </button>

                      {hasCustomProfilePic && (
                        <button
                          type="button"
                          onClick={() => setShowRemoveConfirm(true)}
                          title="Remove your current profile picture"
                          className="text-sm font-semibold text-red-500 transition-colors hover:text-red-700"
                        >
                          Remove photo
                        </button>
                      )}
                    </div>

                    {showRemoveConfirm && (
                      <div
                        className="mt-3 flex items-center gap-3 rounded-xl border border-red-100 bg-red-50 p-3"
                        role="alertdialog"
                        aria-modal="true"
                        aria-label="Confirm profile picture removal"
                      >
                        <span className="text-sm text-red-700">Are you sure you want to remove your profile picture?</span>
                        <button
                          type="button"
                          onClick={handleRemoveProfilePic}
                          disabled={isRemovingPic}
                          title="Confirm profile picture removal"
                          className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-red-600 disabled:bg-red-300"
                        >
                          {isRemovingPic ? 'Removing...' : 'Confirm'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowRemoveConfirm(false)}
                          title="Keep your current profile picture"
                          className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-bold text-gray-600 transition-colors hover:bg-gray-100"
                        >
                          Cancel
                        </button>
                      </div>
                    )}

                    {imageError ? <p className="mt-2 text-sm font-medium text-red-500">{imageError}</p> : null}
                  </div>
                </div>
              </div>

              {formError ? (
                <div className="rounded-2xl border border-red-100 bg-red-50 px-5 py-4 text-sm font-medium text-red-600">
                  {formError}
                </div>
              ) : null}

              <div className="grid gap-10 md:grid-cols-2">
                <div>
                  <label className="mb-4 block text-lg font-semibold text-[#212529]" htmlFor="firstName">
                    First Name *
                  </label>
                  <input
                    id="firstName"
                    type="text"
                    title="Enter your first name"
                    value={formData.firstName}
                    onChange={(event) => handleFieldChange('firstName', event.target.value)}
                    maxLength={PROFILE_NAME_PART_MAX_LENGTH}
                    className={`${inputBaseClass} ${
                      errors.firstName ? 'border-red-300 bg-red-50/40 focus:border-red-400' : 'border-gray-200 focus:border-[#4C6EF5]'
                    }`}
                    placeholder="Enter your first name"
                  />
                  <p className="mt-2 text-sm font-medium text-[#111827]">
                    {formData.firstName.length}/{PROFILE_NAME_PART_MAX_LENGTH}
                  </p>
                  {errors.firstName ? <p className="mt-2 text-sm font-medium text-red-500">{errors.firstName}</p> : null}
                </div>

                <div>
                  <label className="mb-4 block text-lg font-semibold text-[#212529]" htmlFor="lastName">
                    Last Name *
                  </label>
                  <input
                    id="lastName"
                    type="text"
                    title="Enter your last name"
                    value={formData.lastName}
                    onChange={(event) => handleFieldChange('lastName', event.target.value)}
                    maxLength={PROFILE_NAME_PART_MAX_LENGTH}
                    className={`${inputBaseClass} ${
                      errors.lastName ? 'border-red-300 bg-red-50/40 focus:border-red-400' : 'border-gray-200 focus:border-[#4C6EF5]'
                    }`}
                    placeholder="Enter your last name"
                  />
                  <p className="mt-2 text-sm font-medium text-[#111827]">
                    {formData.lastName.length}/{PROFILE_NAME_PART_MAX_LENGTH}
                  </p>
                  {errors.lastName ? <p className="mt-2 text-sm font-medium text-red-500">{errors.lastName}</p> : null}
                </div>
              </div>

              <div>
                <label className="mb-4 block text-lg font-semibold text-[#212529]" htmlFor="status">
                  Status *
                </label>
                <textarea
                  id="status"
                  title="Write a short status people can see on your profile"
                  value={formData.status}
                  onChange={(event) => handleFieldChange('status', event.target.value)}
                  maxLength={PROFILE_STATUS_MAX_LENGTH}
                  className={`${inputBaseClass} min-h-[200px] resize-none ${
                    errors.status ? 'border-red-300 bg-red-50/40 focus:border-red-400' : 'border-gray-200 focus:border-[#4C6EF5]'
                  }`}
                  placeholder="Tell people what you're up to"
                />
                <p className="mt-2 text-sm font-medium text-[#111827]">{formData.status.length}/{PROFILE_STATUS_MAX_LENGTH}</p>
                {errors.status ? <p className="mt-2 text-sm font-medium text-red-500">{errors.status}</p> : null}
              </div>

              <div className="grid gap-10 md:grid-cols-2">
                <div>
                  <label className="mb-4 block text-lg font-semibold text-[#212529]" htmlFor="phone">
                    Phone Number *
                  </label>
                  <div
                    className={`flex items-center gap-3 rounded-2xl border px-5 py-5 text-lg transition-all ${
                      errors.phone
                        ? 'border-red-300 bg-red-50/40 focus-within:border-red-400'
                        : 'border-gray-200 focus-within:border-[#4C6EF5]'
                    }`}
                  >
                    <span className="shrink-0 font-medium text-[#212529]">{PHONE_COUNTRY_CODE}</span>
                    <input
                      id="phone"
                      type="tel"
                      title="Enter your 10-digit mobile number"
                      inputMode="numeric"
                      autoComplete="tel-national"
                      maxLength={PHONE_LOCAL_DIGIT_LIMIT}
                      value={formData.phone}
                      onChange={(event) => handleFieldChange('phone', event.target.value)}
                      className="w-full border-0 bg-transparent p-0 text-[#212529] font-medium outline-none placeholder:text-[#111827]"
                      placeholder="9876543210"
                    />
                  </div>
                  <p className="mt-2 text-sm font-medium text-[#111827]">
                    Enter only the 10 mobile digits after {PHONE_COUNTRY_CODE}.
                  </p>
                  {errors.phone ? <p className="mt-2 text-sm font-medium text-red-500">{errors.phone}</p> : null}
                </div>
                <div>
                  <label className="mb-4 block text-lg font-semibold text-[#212529]" htmlFor="email">
                    Email ID {isEmailRequired ? '*' : '(Optional)'}
                  </label>
                  <input
                    id="email"
                    type="email"
                    title="Enter the email address associated with your account"
                    value={formData.email}
                    onChange={(event) => handleFieldChange('email', event.target.value)}
                    maxLength={EMAIL_MAX_LENGTH}
                    className={`${inputBaseClass} ${
                      errors.email ? 'border-red-300 bg-red-50/40 focus:border-red-400' : 'border-gray-200 focus:border-[#4C6EF5]'
                    }`}
                    placeholder="you@example.com"
                  />
                  <p className="mt-2 text-sm font-medium text-[#111827]">
                    {isEmailRequired
                      ? `Required because this account was created with email. Max ${EMAIL_MAX_LENGTH} characters.`
                      : `Optional for phone-only accounts. Max ${EMAIL_MAX_LENGTH} characters.`}
                  </p>
                  {errors.email ? <p className="mt-2 text-sm font-medium text-red-500">{errors.email}</p> : null}
                </div>
              </div>

              <CompressionIndicator
                stage={mediaCompression.stage}
                stats={mediaCompression.compressionStats}
                label="Compressing and uploading media"
                isVisible={mediaCompression.isCompressing}
              />

              <div className="mt-auto flex flex-col gap-5 pt-6 md:flex-row">
                <button
                  onClick={() => navigate('/profile')}
                  title="Discard changes and return to your profile"
                  className="rounded-2xl border border-gray-200 px-7 py-6 text-lg font-bold text-[#212529] transition-colors hover:bg-gray-50"
                  type="button"
                >
                  Cancel
                </button>
                <button
                  disabled={!canSave}
                  title={canSave ? 'Save your profile changes' : 'Make a valid change before saving'}
                  className="rounded-2xl bg-[#4C6EF5] px-7 py-6 text-lg font-bold text-white transition-colors hover:bg-[#3b5bdb] disabled:cursor-not-allowed disabled:bg-[#A5B4FC]"
                  type="submit"
                >
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          )}
        </div>
        </div>
      </div>
    </>
  );
}
