import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import MarketingLayout from '../components/MarketingLayout';

// Your image imports
import heroImg from '../assets/hero-img.png';
import desktopAppImg from '../assets/desktop-app.png';
import collageImg from '../assets/collage.png';
import ctaAppImg from '../assets/cta-app.png';

export default function HomePage() {
  // Arriving from another page leaves the window scrolled; start at the top.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <MarketingLayout>
      {/* HERO SECTION */}
      <section className="pt-[140px] lg:pt-[180px] pb-20 px-6 max-w-7xl mx-auto grid lg:grid-cols-2 gap-12 lg:gap-8 items-center">
        <div className="flex flex-col gap-6 z-10 text-center lg:text-left items-center lg:items-start">
          <h1 className="text-4xl md:text-5xl lg:text-[64px] font-bold leading-[1.1] text-[#212529] tracking-tight">
            One place for every conversation.
          </h1>
          <p className="text-lg md:text-xl text-[#71767A] max-w-[480px] leading-relaxed">
            Chatterly is a modern communication platform that combines secure messaging, calls, and collaboration tools into a single, intuitive experience.
          </p>
          <Link 
            to="/login" 
            className="mt-4 px-8 py-4 bg-[#4C6EF5] text-white text-lg font-bold rounded-2xl shadow-[0_8px_24px_rgba(76,110,245,0.25)] hover:bg-[#3b5bdb] hover:-translate-y-1 transition-all inline-block"
          >
            Get Started
          </Link>
        </div>
        
        {/* HERO IMAGE COMPOSITION */}
        <div className="relative w-full flex items-center justify-center">
             {/* Using the imported variable here! */}
             <img 
               src={heroImg} 
               alt="Chatterly Video Calls and Chat UI" 
               className="w-full h-auto object-contain z-10 drop-shadow-2xl"
             />
        </div>
      </section>

      {/* FEATURES GRID */}
      <section className="py-20 lg:py-32 px-6 max-w-7xl mx-auto">
        <h2 className="text-3xl md:text-[40px] font-bold text-center mb-16 text-[#212529]">
          Stay connected, wherever you are!
        </h2>
        
        <div className="grid md:grid-cols-3 gap-8 lg:gap-12">
          {/* Feature 1 */}
          <div className="flex flex-col items-center text-center gap-5">
            <div className="w-[88px] h-[88px] bg-white text-[#4C6EF5] rounded-[24px] flex items-center justify-center shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
               <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
            </div>
            <h3 className="text-[22px] font-bold text-[#212529]">Instant Messaging</h3>
            <p className="text-[#71767A] leading-relaxed max-w-[280px]">Send texts, photos, videos, voice notes, and emojis in real time.</p>
          </div>

          {/* Feature 2 */}
          <div className="flex flex-col items-center text-center gap-5">
            <div className="w-[88px] h-[88px] bg-white text-[#4C6EF5] rounded-[24px] flex items-center justify-center shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
               <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
            </div>
            <h3 className="text-[22px] font-bold text-[#212529]">Voice & Video Calls</h3>
            <p className="text-[#71767A] leading-relaxed max-w-[280px]">High quality calls with friends and family - anywhere in the world.</p>
          </div>

          {/* Feature 3 */}
          <div className="flex flex-col items-center text-center gap-5">
            <div className="w-[88px] h-[88px] bg-white text-[#4C6EF5] rounded-[24px] flex items-center justify-center shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
               <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
            </div>
            <h3 className="text-[22px] font-bold text-[#212529]">Built-in Privacy</h3>
            <p className="text-[#71767A] leading-relaxed max-w-[280px]">End-to-end encryption keeps your conversations yours.</p>
          </div>
        </div>
      </section>

      {/* FEATURE SPLIT 1 */}
      <section className="py-12 px-6 max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <div className="flex flex-col gap-8 order-2 lg:order-1">
            <div className="space-y-4">
              <h2 className="text-4xl lg:text-[48px] font-bold leading-[1.1] text-[#212529]">
                Bring everyone<br/>together
              </h2>
              <p className="text-lg text-[#71767A] leading-relaxed max-w-[400px]">
                Create group chats for family, friends, or communities.
              </p>
            </div>
            
            <ul className="space-y-5">
              <li className="flex items-center gap-4">
                <div className="w-6 h-6 rounded-full bg-[#4C6EF5]/10 text-[#4C6EF5] flex items-center justify-center">✓</div>
                <span className="text-lg font-medium text-[#212529]">Share updates</span>
              </li>
              <li className="flex items-center gap-4">
                <div className="w-6 h-6 rounded-full bg-[#4C6EF5]/10 text-[#4C6EF5] flex items-center justify-center">✓</div>
                <span className="text-lg font-medium text-[#212529]">Pin important messages</span>
              </li>
              <li className="flex items-center gap-4">
                <div className="w-6 h-6 rounded-full bg-[#4C6EF5]/10 text-[#4C6EF5] flex items-center justify-center">✓</div>
                <span className="text-lg font-medium text-[#212529]">Manage members easily</span>
              </li>
            </ul>
          </div>
          
          {/* DESKTOP APP MOCKUP */}
          <div className="relative w-full flex items-center justify-center order-1 lg:order-2">
             {/* Using the imported variable here! */}
             <img 
               src={desktopAppImg} 
               alt="Chatterly Desktop Interface" 
               className="w-full h-auto object-contain drop-shadow-[0_20px_60px_rgba(0,0,0,0.08)]"
             />
          </div>
        </div>
      </section>

      {/* FEATURE SPLIT 2 */}
      <section className="py-20 lg:py-32 px-6 max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          
          {/* FAMILY PHOTO & STICKERS MOCKUP */}
          <div className="relative w-full flex items-center justify-center">
             {/* Using the imported variable here! */}
             <img 
               src={collageImg} 
               alt="Share photos and stickers" 
               className="w-full h-auto object-contain drop-shadow-[0_20px_60px_rgba(0,0,0,0.08)]"
             />
          </div>

          <div className="flex flex-col gap-8">
            <div className="space-y-4">
              <h2 className="text-4xl lg:text-[48px] font-bold leading-[1.1] text-[#212529]">
                Say it your way
              </h2>
              <p className="text-lg text-[#71767A] leading-relaxed max-w-[400px]">
                Express yourself beyond just text with a rich set of features designed to make chatting fun.
              </p>
            </div>
            
            <div className="grid grid-cols-2 gap-y-5 gap-x-4">
              <div className="flex items-center gap-3">
                <div className="w-[42px] h-[42px] rounded-xl bg-gray-100 flex items-center justify-center text-xl">✨</div>
                <span className="text-[17px] font-medium text-[#212529]">Stickers</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-[42px] h-[42px] rounded-xl bg-gray-100 flex items-center justify-center text-xl">😀</div>
                <span className="text-[17px] font-medium text-[#212529]">Emojis</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-[42px] h-[42px] rounded-xl bg-gray-100 flex items-center justify-center text-xl">🎙️</div>
                <span className="text-[17px] font-medium text-[#212529]">Voice messages</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-[42px] h-[42px] rounded-xl bg-gray-100 flex items-center justify-center text-xl">🖼️</div>
                <span className="text-[17px] font-medium text-[#212529]">Photos & videos</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-[42px] h-[42px] rounded-xl bg-gray-100 flex items-center justify-center text-xl">📁</div>
                <span className="text-[17px] font-medium text-[#212529]">File sharing</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* BOTTOM CTA */}
      <section className="py-12 px-6 max-w-7xl mx-auto mb-12">
        <div className="bg-white rounded-[40px] shadow-[0_20px_60px_rgba(0,0,0,0.03)] p-10 md:p-16 lg:p-24 flex flex-col lg:flex-row justify-between items-center gap-12 overflow-hidden relative">
          
          <div className="max-w-xl relative z-10 text-center lg:text-left">
            <h2 className="text-4xl md:text-[42px] font-bold leading-tight text-[#212529] mb-4">
              Ready to Experience a Smarter Way to Chat
            </h2>
            <p className="text-lg text-[#71767A] mb-10">
              No need to download anything, start right from your browser.
            </p>
            
            <Link to="/login" className="inline-flex items-center gap-6 bg-white border border-gray-200 rounded-full p-2 pr-8 cursor-pointer hover:border-[#4C6EF5] hover:shadow-lg transition-all group mx-auto lg:mx-0">
              <div className="flex -space-x-3">
                <div className="w-12 h-12 rounded-full bg-blue-100 border-2 border-white flex items-center justify-center text-xl">👨‍🦱</div>
                <div className="w-12 h-12 rounded-full bg-pink-100 border-2 border-white flex items-center justify-center text-xl">👩‍🦰</div>
                <div className="w-12 h-12 rounded-full bg-yellow-100 border-2 border-white flex items-center justify-center text-xl">👱</div>
              </div>
              <span className="text-lg font-bold text-[#212529] group-hover:text-[#4C6EF5] transition-colors">
                Join Chatterly Now <span className="ml-2 group-hover:translate-x-1 inline-block transition-transform">→</span>
              </span>
            </Link>
          </div>
          
          {/* CTA APP MOCKUP */}
          <div className="hidden lg:block w-[400px] relative z-10">
             {/* Using the imported variable here! */}
             <img 
               src={ctaAppImg} 
               alt="Chatterly Browser App" 
               className="w-full h-auto object-contain drop-shadow-xl"
             />
          </div>

          <div className="absolute -right-20 -bottom-20 w-96 h-96 bg-[#4C6EF5]/5 rounded-full blur-3xl pointer-events-none"></div>
        </div>
      </section>
    </MarketingLayout>
  );
}