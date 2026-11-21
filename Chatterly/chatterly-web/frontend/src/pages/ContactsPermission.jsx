import React from 'react';

export default function ContactsPermission({ isOpen, onClose, onAllow }) {
  if (!isOpen) return null;

  const handleAllowAccess = () => {
    // 1. Store permission in localStorage
    localStorage.setItem('contactsPermissionGranted', 'true');
    
    // 2. Trigger the callback to open the Add Contact modal
    onAllow();
  };

  return (
    <div className="fixed inset-0 bg-[#1A1A1A]/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white rounded-3xl w-full max-w-[400px] shadow-2xl overflow-hidden scale-in p-8 text-center relative">
        
        {/* Icon */}
        <div className="w-16 h-16 bg-[#4C6EF5]/10 text-[#4C6EF5] rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        </div>

        {/* Text Content */}
        <h2 className="text-2xl font-bold text-[#1A1A1A] mb-3">
          Connect with people you know
        </h2>
        <p className="text-[#71767A] text-sm mb-8 leading-relaxed">
          Allow access to your contacts so you can quickly find and chat with your friends, family, and colleagues.
        </p>

        {/* Action Buttons */}
        <div className="flex flex-col gap-3">
          <button 
            onClick={handleAllowAccess}
            className="w-full py-3.5 rounded-2xl font-bold bg-[#4C6EF5] text-white hover:bg-[#3b5bdb] transition-colors"
          >
            Allow Access
          </button>
          <button 
            onClick={onClose}
            className="chatterly-contacts-permission-dismiss w-full py-3.5 rounded-2xl font-bold text-gray-500 hover:bg-gray-100 transition-colors"
          >
            Not Now
          </button>
        </div>

      </div>
    </div>
  );
}