import React, { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import Logo from './Logo';
import { MARKETING_FOOTER_COLUMNS, MARKETING_NAV_LINKS } from '../constants/marketingPages';

const navLinkClassName = ({ isActive }) =>
  `transition-colors hover:text-[#4C6EF5] ${isActive ? 'text-[#4C6EF5]' : ''}`;

function MarketingHeader() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  // The header stays mounted from one page to the next, so a link in the
  // small-screen menu closes it on the way out.
  const closeMenu = () => setIsMenuOpen(false);

  return (
    <header className="fixed top-0 w-full bg-white/90 backdrop-blur-md z-50 border-b border-gray-100">
      <div className="max-w-7xl mx-auto px-6 h-[88px] flex justify-between items-center">
        <Link to="/" aria-label="Chatterly home">
          <Logo className="text-2xl" />
        </Link>

        <nav className="hidden lg:flex items-center gap-10 text-[15px] font-medium text-[#3F4346]" aria-label="Main">
          {MARKETING_NAV_LINKS.map((link) => (
            <NavLink key={link.to} to={link.to} className={navLinkClassName}>
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            to="/login"
            className="hidden md:flex px-8 py-2.5 border-2 border-gray-200 rounded-full font-bold text-[#212529] hover:border-[#4C6EF5] hover:text-[#4C6EF5] transition-all items-center justify-center"
          >
            Log In
          </Link>

          <button
            type="button"
            className="lg:hidden p-2 text-gray-600"
            aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={isMenuOpen}
            aria-controls="marketing-mobile-menu"
            onClick={() => setIsMenuOpen((isOpen) => !isOpen)}
          >
            {isMenuOpen ? (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            ) : (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
            )}
          </button>
        </div>
      </div>

      {isMenuOpen ? (
        <nav
          id="marketing-mobile-menu"
          className="lg:hidden border-t border-gray-100 bg-white px-6 py-4"
          aria-label="Main"
        >
          <div className="flex flex-col gap-1 text-[15px] font-medium text-[#3F4346]">
            {MARKETING_NAV_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                onClick={closeMenu}
                className={({ isActive }) => `rounded-xl px-3 py-2.5 hover:bg-gray-50 ${navLinkClassName({ isActive })}`}
              >
                {link.label}
              </NavLink>
            ))}
            <Link
              to="/login"
              onClick={closeMenu}
              className="md:hidden mt-2 rounded-full border-2 border-gray-200 px-6 py-2.5 text-center font-bold text-[#212529] transition-all hover:border-[#4C6EF5] hover:text-[#4C6EF5]"
            >
              Log In
            </Link>
          </div>
        </nav>
      ) : null}
    </header>
  );
}

function MarketingFooter() {
  const footerLinkClassName = 'text-[#71767A] hover:text-[#4C6EF5] font-medium transition-colors';

  return (
    <footer className="bg-white pt-20 pb-10 px-6 border-t border-gray-100">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-8 mb-16">
          <div className="col-span-2 flex flex-col gap-4">
            <Logo className="text-2xl" />
            <p className="text-[#71767A] max-w-[260px] leading-relaxed mt-2">
              Private messaging for real conversations. Connect with your team securely.
            </p>
          </div>

          {MARKETING_FOOTER_COLUMNS.map((column) => (
            <div key={column.title} className="flex flex-col gap-5">
              <h4 className="font-bold text-[#212529]">{column.title}</h4>
              {column.links.map((link) => (
                link.to ? (
                  <Link key={link.label} to={link.to} className={footerLinkClassName}>{link.label}</Link>
                ) : (
                  <a key={link.label} href="#" className={footerLinkClassName}>{link.label}</a>
                )
              ))}
            </div>
          ))}
        </div>

        <div className="flex flex-col md:flex-row justify-between items-center pt-8 border-t border-gray-100 gap-6">
          <p className="text-sm text-[#71767A] font-medium">© 2026 Chatterly. All rights reserved.</p>

          <div className="flex items-center gap-6 text-sm font-medium text-[#71767A]">
            <a href="#" className="hover:text-[#4C6EF5] transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-[#4C6EF5] transition-colors">Terms of Service</a>
            <a href="#" className="hover:text-[#4C6EF5] transition-colors">Cookie Policy</a>
          </div>
        </div>
      </div>
    </footer>
  );
}

// Shared chrome for the public pages: the fixed header (with a menu on small
// screens, where the nav links are otherwise hidden) and the site footer.
export default function MarketingLayout({ children }) {
  return (
    <div className="min-h-screen bg-[#F8F9FB] font-sans text-[#212529] overflow-x-hidden">
      <MarketingHeader />
      {children}
      <MarketingFooter />
    </div>
  );
}
