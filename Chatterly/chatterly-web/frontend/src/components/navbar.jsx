import React from 'react';
import Button from './Button'; // Assuming your Button component is in the same folder

export default function Navbar() {
  return (
    <nav className="sticky top-0 z-50 w-full bg-white border-b border-[#D4D6D8] px-6 py-4 flex justify-between items-center shadow-sm">
      
      {/* Brand / Logo Area */}
      <div className="flex items-center gap-2 cursor-pointer">
        {/* Placeholder Logo Icon */}
        <div className="w-10 h-10 rounded-xl bg-[#4C6EF5] flex items-center justify-center text-white shadow-[0_4px_12px_rgba(76,110,245,0.24)]">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <span className="text-xl font-bold text-[#212529] tracking-tight">
          BrandName
        </span>
      </div>

      {/* Center Navigation Links (Hidden on small screens) */}
      <div className="hidden md:flex items-center gap-8">
        <a href="#home" className="text-sm font-semibold text-[#212529] hover:text-[#4C6EF5] transition-colors">Home</a>
        <a href="#features" className="text-sm font-semibold text-[#71767A] hover:text-[#4C6EF5] transition-colors">Features</a>
        <a href="#about" className="text-sm font-semibold text-[#71767A] hover:text-[#4C6EF5] transition-colors">About</a>
      </div>

      {/* Action Buttons Area */}
      <div className="flex items-center gap-3 w-auto">
        <div className="hidden sm:block w-24">
          <Button variant="outline" type="button">Log in</Button>
        </div>
        <div className="w-28">
          <Button variant="primary" type="button">Sign up</Button>
        </div>
      </div>

    </nav>
  );
}