import React from 'react';

export default function Logo({ className = "" }) {
  return (
    <div className={`flex items-center gap-3 text-[32px] font-bold text-[#1A1A1A] tracking-tight ${className}`}>
      <svg width="44" height="44" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="flex-shrink-0">
        <path d="M18 78 V 38 C 18 22 30 16 48 16 H 65 C 85 16 92 28 92 46 C 92 64 85 72 65 72 H 35 L 18 78 Z" stroke="#1A1A1A" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M28 72 C 35 88 65 92 88 66" stroke="#1A1A1A" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx="36" cy="46" r="6" fill="#1A1A1A"/>
        <circle cx="55" cy="46" r="6" fill="#1A1A1A"/>
        <circle cx="74" cy="46" r="6" fill="#1A1A1A"/>
      </svg>
      Chatterly
    </div>
  );
}