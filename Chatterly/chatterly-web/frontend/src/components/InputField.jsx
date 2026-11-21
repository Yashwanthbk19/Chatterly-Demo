import React from 'react';

export default function InputField({ label, type = 'text', placeholder, id }) {
  return (
    <div className="flex flex-col gap-2 w-full">
      <label htmlFor={id} className="text-sm font-semibold text-[#212529]">
        {label}
      </label>
      <input
        type={type}
        id={id}
        placeholder={placeholder}
        className="px-4 py-3 bg-white border border-[#D4D6D8] rounded-xl text-[#212529] placeholder-[#71767A] focus:outline-none focus:border-[#4C6EF5] focus:ring-1 focus:ring-[#4C6EF5] transition-colors"
      />
    </div>
  );
}