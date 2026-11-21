import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import Logo from '../components/Logo';
import Loader from '../components/loader';
import defaultProfilePic from '../assets/image.png';
import { getProfile } from '../api/contactapi';
import { getStoredUser, normalizeProfile, normalizeProfilePictureValue, resolveProfileDisplayPicture } from '../utils/profile';

const DetailCard = ({ label, value }) => (
  <div className="rounded-2xl border border-gray-100 bg-[#F8FAFC] px-5 py-4">
    <p className="mb-1 text-sm font-semibold uppercase tracking-[0.14em] text-[#1F2937]">{label}</p>
    <p className="text-sm font-medium text-[#212529]">{value || 'Not added yet'}</p>
  </div>
);

export default function Profile() {
  const navigate = useNavigate();
  const location = useLocation();
  const [profile, setProfile] = useState(() => normalizeProfile({}, getStoredUser()));
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!location.state?.successMessage) {
      return;
    }

    setSuccessMessage(location.state.successMessage);
    
    if (location.state?.refresh) {
      setRefreshKey(prev => prev + 1);
    }
    
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.pathname, location.state, navigate]);

  useEffect(() => {
    if (!successMessage) {
      return undefined;
    }

    const timeout = window.setTimeout(() => setSuccessMessage(''), 3000);
    return () => window.clearTimeout(timeout);
  }, [successMessage]);

  useEffect(() => {
    let isMounted = true;

    const loadProfile = async () => {
      const fallbackUser = getStoredUser();
      setIsLoading(true);

      try {
        const data = await getProfile();

        if (!isMounted) {
          return;
        }

        const normalizedProfilePic =
          [
            data?.profileImage,
            data?.profilePic,
            data?.profilePicture,
            data?.avatar,
            data?.image,
          ]
            .map((value) => normalizeProfilePictureValue(value))
            .find(Boolean) || '';
        const displayProfilePic = resolveProfileDisplayPicture(normalizedProfilePic);
        let processedData = {
          ...data,
          profileImage: displayProfilePic,
          profilePic: displayProfilePic,
        };
        if (displayProfilePic && displayProfilePic !== defaultProfilePic && !displayProfilePic.includes('?t=')) {
          const separator = displayProfilePic.includes('?') ? '&' : '?';
          const cacheBustedProfileImage = `${displayProfilePic}${separator}t=${Date.now()}`;
          processedData = {
            ...processedData,
            profileImage: cacheBustedProfileImage,
            profilePic: cacheBustedProfileImage,
          };
        }

        setProfile(normalizeProfile(processedData, fallbackUser));
        setError('');
      } catch (fetchError) {
        if (!isMounted) {
          return;
        }

        const stored = getStoredUser();
        setProfile(normalizeProfile({}, stored));
        setError(fetchError?.message || 'Unable to load your profile details right now.');
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
  }, [refreshKey]);

  return (
    <div className="chatterly-auth-shell min-h-screen bg-[#F8F9FB] p-4 md:p-8 font-sans">
      <div className="mx-auto flex min-h-[calc(100vh-2rem)] max-w-[1120px] overflow-hidden rounded-[32px] bg-white shadow-[0_8px_30px_rgba(0,0,0,0.04)] md:min-h-[720px]">
        <div className="login-hero hidden w-[38%] flex-col justify-between p-12 lg:flex">
          <div>
            <Link to="/chats" className="login-hero__logo mb-12 inline-block">
              <Logo />
            </Link>
            <p className="login-hero__eyebrow mb-4 text-sm font-semibold uppercase tracking-[0.2em]">Profile</p>
            <h1 className="login-hero__title mb-4 text-4xl font-bold leading-tight">Your Chatterly Identity</h1>
            <p className="login-hero__text max-w-[320px] text-lg leading-relaxed">
              Keep your name, photo, and status up to date so people can recognize you instantly.
            </p>
          </div>

          <div className="login-hero__card rounded-[28px] p-6 backdrop-blur-sm">
            <p className="login-hero__title text-sm font-semibold">Visible to your contacts</p>
            <p className="login-hero__text mt-2 text-base leading-relaxed">
              Your profile photo, name, and status help conversations feel more personal.
            </p>
          </div>
        </div>

        <div className="flex flex-1 flex-col p-6 md:p-10 lg:p-14">
          <div className="mb-8 flex items-center justify-between gap-4">
            <button
              onClick={() => navigate('/chats')}
              className="inline-flex items-center gap-2 text-sm font-semibold text-gray-400 transition-colors hover:text-[#212529]"
              type="button"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
              </svg>
              Back to chats
            </button>

            <button
              onClick={() => navigate('/profile/edit')}
              className="rounded-2xl bg-[#EEF2FF] px-5 py-3 text-sm font-bold text-black transition-colors hover:bg-[#E2E8FF]"
              type="button"
            >
              Edit Profile
            </button>
          </div>

          {successMessage ? (
            <div
              className="mb-6 rounded-2xl border border-green-100 bg-green-50 px-5 py-4 text-sm font-medium text-green-700"
              role="status"
              aria-live="polite"
            >
              {successMessage}
            </div>
          ) : null}

          {error ? (
            <div className="mb-6 rounded-2xl border border-amber-100 bg-amber-50 px-5 py-4 text-sm font-medium text-amber-700">
              {error}
            </div>
          ) : null}

          {isLoading ? (
            <div className="flex flex-1 items-center justify-center">
              <Loader text="Loading profile..." />
            </div>
          ) : (
            <div className="flex flex-1 flex-col gap-8">
              <div className="rounded-[28px] border border-gray-100 bg-[#FCFCFD] p-6 md:p-8">
                <div className="flex flex-col gap-6 md:flex-row md:items-center">
                  <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-[#EEF2FF] text-3xl font-bold text-[#4C6EF5] shadow-sm">
                    {profile.profileImage ? (
                      <img 
                        key={profile.profileImage} // CRITICAL FIX: Force re-render when URL changes
                        src={profile.profileImage} 
                        alt={profile.username} 
                        className="h-full w-full object-cover" 
                        onError={(event) => {
                          event.currentTarget.src = defaultProfilePic;
                        }}
                      />
                    ) : (
                      <img
                        src={defaultProfilePic}
                        alt={profile.username}
                        className="h-full w-full object-cover"
                        onError={(event) => {
                          event.currentTarget.src = defaultProfilePic;
                        }}
                      />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-[32px] font-bold text-[#212529]">{profile.username}</h2>
                    <p className="mt-2 break-all text-lg font-medium leading-relaxed text-[#1F2937]">{profile.status}</p>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <DetailCard label="Phone" value={profile.phone} />
                <DetailCard label="Email" value={profile.email} />
              </div>

              <div className="rounded-[28px] border border-gray-100 bg-white p-6 md:p-8">
                <p className="mb-6 text-base font-semibold uppercase tracking-[0.18em] text-[#1F2937]">About</p>
                <div className="grid gap-4 md:grid-cols-3">
                  <DetailCard label="Username" value={profile.username} />
                  <DetailCard label="First Name" value={profile.firstName} />
                  <DetailCard label="Last Name" value={profile.lastName} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
