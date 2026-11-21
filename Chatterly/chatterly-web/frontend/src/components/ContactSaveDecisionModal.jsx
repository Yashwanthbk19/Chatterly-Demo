import React from 'react';

const formatContactPhone = (phoneValue = '') => {
  const normalizedPhone = String(phoneValue || '').trim();
  if (!normalizedPhone) return 'Phone number unavailable';

  const digits = normalizedPhone.replace(/\D/g, '');
  if (normalizedPhone.startsWith('+')) {
    const countryCodeLength = digits.length > 10 ? digits.length - 10 : 0;
    const countryCode = countryCodeLength ? `+${digits.slice(0, countryCodeLength)}` : '';
    const localNumber = countryCodeLength ? digits.slice(countryCodeLength) : digits;
    if (localNumber.length === 10) {
      return `${countryCode} ${localNumber.slice(0, 3)} ${localNumber.slice(3, 6)} ${localNumber.slice(6)}`.trim();
    }
    return normalizedPhone;
  }

  if (digits.length === 10) {
    return `+91 ${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  }

  return normalizedPhone;
};

const ContactDecisionActionIcon = ({ variant = 'contact' }) => {
  if (variant === 'chat') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="4" y="4.5" width="16" height="14.5" rx="4" stroke="currentColor" strokeWidth="1.7" />
        <path d="M8.25 10h7.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        <path d="M8.25 13.5h4.75" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="10" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M4.75 18.25c.67-2.79 2.77-4.75 5.25-4.75 2.48 0 4.58 1.96 5.25 4.75" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M18 8.5v6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M15 11.5h6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
};

const ContactDecisionAvatar = ({ contact, isRegistered }) => {
  const initials =
    String(contact?.initials || '').trim() ||
    String(contact?.name || '?').trim().charAt(0).toUpperCase() ||
    '?';

  return (
    <div className="mx-auto flex h-[84px] w-[84px] items-center justify-center overflow-hidden rounded-full bg-[#EEF2FF] text-[28px] font-semibold text-[#64748B] shadow-[0_10px_30px_rgba(148,163,184,0.18)]">
      {contact?.profilePic ? (
        <img src={contact.profilePic} alt={contact.name || 'Contact'} className="h-full w-full object-cover" />
      ) : (
        <span className={isRegistered ? 'text-[#8B5CF6]' : 'text-[#64748B]'}>{initials}</span>
      )}
    </div>
  );
};

export default function ContactSaveDecisionModal({
  isOpen,
  variant = 'registered',
  contact = null,
  isBusy = false,
  isAlreadyInvited = false,
  onClose,
  onAddToContact,
  onOpenChat,
  onInvite,
}) {
  if (!isOpen || !contact) return null;

  const isRegistered = variant === 'registered';
  const statusText = String(contact?.status || contact?.bio || '').trim();
  const primaryInviteLabel = isAlreadyInvited ? 'Invited' : 'Invite to Chatterly';

  return (
    <div className="fixed inset-0 z-[225] flex items-end justify-center bg-black/45 p-4 backdrop-blur-sm sm:items-center">
      <div className="relative w-full max-w-[520px] rounded-[30px] border border-[#E2E8F0] bg-[#F8FAFC] p-4 shadow-[0_28px_60px_rgba(15,23,42,0.18)] sm:p-6">
        <button
          type="button"
          onClick={onClose}
          disabled={isBusy}
          className="chatterly-contact-modal-close absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full text-[#94A3B8] transition-colors hover:bg-white hover:text-[#475569] disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Close contact card"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>

        <div className="rounded-[28px] bg-white px-5 pb-5 pt-6 shadow-[0_16px_36px_rgba(148,163,184,0.12)] sm:px-8 sm:pb-7">
          <ContactDecisionAvatar contact={contact} isRegistered={isRegistered} />

          <div className="mt-4 text-center">
            <h3 className="text-[22px] font-bold leading-7 text-[#0F172A]">{contact.name || 'Unknown contact'}</h3>
            <p className="mt-1 text-[14px] font-medium text-[#64748B]">{formatContactPhone(contact.phone)}</p>
            {isRegistered ? (
              <p
                className="mx-auto mt-2 max-w-full whitespace-normal break-words text-[14px] leading-5 text-[#6B7280] [overflow-wrap:anywhere]"
                title={statusText || 'Hey there! I am using Chatterly'}
              >
                {statusText || 'Hey there! I am using Chatterly'}
              </p>
            ) : null}
          </div>

          <div className="mt-6 flex flex-col gap-3">
            {isRegistered ? (
              <>
                <button
                  type="button"
                  onClick={onAddToContact}
                  disabled={isBusy}
                  className="flex w-full items-center justify-center gap-3 rounded-[18px] border border-[#D8E3F0] bg-white px-5 py-4 text-[16px] font-semibold text-[#1E293B] transition-colors hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="text-[#64748B]"><ContactDecisionActionIcon variant="contact" /></span>
                  Add to contact
                </button>
                <button
                  type="button"
                  onClick={onOpenChat}
                  disabled={isBusy}
                  className="flex w-full items-center justify-center gap-3 rounded-[18px] bg-[linear-gradient(90deg,#8B5CF6_0%,#A855F7_100%)] px-5 py-4 text-[16px] font-semibold text-white shadow-[0_14px_30px_rgba(139,92,246,0.28)] transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span><ContactDecisionActionIcon variant="chat" /></span>
                  {isBusy ? 'Opening chat...' : 'Open in chat'}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={onInvite}
                disabled={isBusy || isAlreadyInvited}
                className="flex w-full items-center justify-center gap-3 rounded-[18px] border border-[#D8E3F0] bg-white px-5 py-4 text-[16px] font-semibold text-[#1E293B] transition-colors hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="text-[#64748B]"><ContactDecisionActionIcon variant="contact" /></span>
                {primaryInviteLabel}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
