import React from 'react';

export default function Button({ children, onClick, type = 'button', variant = 'primary' }) {
  const baseStyle = "w-full py-3.5 rounded-xl font-bold transition-colors flex justify-center items-center gap-2";
  const variants = {
    primary: "bg-[#4C6EF5] text-white hover:bg-blue-600 shadow-[0_4px_12px_rgba(76,110,245,0.24)]",
    outline: "bg-white border border-[#D4D6D8] text-[#212529] hover:bg-gray-50"
  };

  return (
    <button type={type} onClick={onClick} className={`${baseStyle} ${variants[variant]}`}>
      {children}
    </button>
  );
}