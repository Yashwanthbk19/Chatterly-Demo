import React from 'react';

export default function Loader({ fullScreen = false, text = "Loading..." }) {
  const spinner = (
    <div className="flex flex-col items-center gap-3">
      <div className="relative w-12 h-12">
        {/* Faded background track */}
        <div className="absolute inset-0 border-4 border-[#D4D6D8] rounded-full opacity-30"></div>
        {/* Spinning primary ring */}
        <div className="absolute inset-0 border-4 border-[#4C6EF5] border-t-transparent rounded-full animate-spin"></div>
      </div>
      {/* Optional loading text matching your typography */}
      {text && <span className="text-sm font-semibold text-[#71767A] animate-pulse">{text}</span>}
    </div>
  );

  // If fullScreen is true, render an overlay
  if (fullScreen) {
    return (
      <div className="fixed inset-0 z-[100] bg-white/80 backdrop-blur-sm flex justify-center items-center">
        {spinner}
      </div>
    );
  }

  // Otherwise, render inline
  return (
    <div className="flex justify-center items-center w-full p-8">
      {spinner}
    </div>
  );
}