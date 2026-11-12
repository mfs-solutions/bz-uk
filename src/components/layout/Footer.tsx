import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Facebook, Instagram, Mail, Phone, MapPin, Loader2 } from 'lucide-react';
import { isNativePlatform } from '../../mobile/nativePlatform';
import { COMPANY_ADDRESS_LINES } from '../../constants/companyContact';
import { BUYER_APP_PLAY_STORE_URL } from '../../lib/appDownload';

export const Footer: React.FC = () => {
  // The native (Capacitor) app shell has its own bottom nav and does not
  // need the website footer. On web this branch is never taken.
  if (isNativePlatform) return null;

  return <FooterImpl />;
};

const FooterImpl: React.FC = () => {
  const navigate = useNavigate();
  const [logoLoadError, setLogoLoadError] = useState(false);
  const [legalLoadingPath, setLegalLoadingPath] = useState<string | null>(null);

  const handleLegalNavigate = (path: string) => {
    setLegalLoadingPath(path);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => {
      navigate(path);
      window.scrollTo({ top: 0, behavior: 'auto' });
      setLegalLoadingPath(null);
    }, 220);
  };

  return (
    <footer data-app-footer="true" className="bg-[#1e293b] text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-8">
          {/* Brand Column */}
          <div>
            {!logoLoadError ? (
              <img
                src="/images/logo/logo.png"
                alt="BZEAD"
                className="h-16 w-auto object-contain mb-4"
                onError={() => setLogoLoadError(true)}
              />
            ) : (
              <div className="text-2xl font-bold tracking-wide text-amber-400 mb-4">BZEAD</div>
            )}
            <p className="text-white text-sm mb-4">
              A premium global marketplace platform with a clean, modern design — supporting global commerce for buyers and sellers worldwide.
            </p>
            <div className="flex space-x-4">
              <a
                href="https://www.facebook.com/share/1CyzEayD3E/"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="BZEAD Facebook"
                className="text-white hover:text-amber-400 transition-colors"
              >
                <Facebook className="h-5 w-5" />
              </a>
              <a
                href="https://www.instagram.com/beauzead?igsh=ZTgwa2lhdTRwNjN4"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="BZEAD Instagram"
                className="text-white hover:text-amber-400 transition-colors"
              >
                <Instagram className="h-5 w-5" />
              </a>
            </div>
          </div>

          {/* Legal Links */}
          <div>
            <h4 className="text-amber-400 font-semibold mb-4">Legal</h4>
            <ul className="space-y-2">
              <li>
                <button onClick={() => handleLegalNavigate('/privacy-policy')} disabled={legalLoadingPath !== null} className="text-white hover:text-amber-400 transition-colors text-sm disabled:opacity-60 flex items-center gap-2">
                  {legalLoadingPath === '/privacy-policy' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Privacy Policy
                </button>
              </li>
              <li>
                <Link to="/deleteaccount" className="text-white hover:text-amber-400 transition-colors text-sm">
                  Delete Account Policy
                </Link>
              </li>
              <li>
                <button onClick={() => handleLegalNavigate('/terms-of-service')} disabled={legalLoadingPath !== null} className="text-white hover:text-amber-400 transition-colors text-sm disabled:opacity-60 flex items-center gap-2">
                  {legalLoadingPath === '/terms-of-service' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Terms of Service
                </button>
              </li>
              <li>
                <button onClick={() => handleLegalNavigate('/shipping-policy')} disabled={legalLoadingPath !== null} className="text-white hover:text-amber-400 transition-colors text-sm disabled:opacity-60 flex items-center gap-2">
                  {legalLoadingPath === '/shipping-policy' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Shipping Policy
                </button>
              </li>
              <li>
                <button onClick={() => handleLegalNavigate('/refund-policy')} disabled={legalLoadingPath !== null} className="text-white hover:text-amber-400 transition-colors text-sm disabled:opacity-60 flex items-center gap-2">
                  {legalLoadingPath === '/refund-policy' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Refund Policy
                </button>
              </li>
              <li>
                <button onClick={() => handleLegalNavigate('/terms-and-conditions')} disabled={legalLoadingPath !== null} className="text-white hover:text-amber-400 transition-colors text-sm disabled:opacity-60 flex items-center gap-2">
                  {legalLoadingPath === '/terms-and-conditions' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Terms &amp; Conditions
                </button>
              </li>
            </ul>
          </div>

          {/* Business Links */}
          <div>
            <h4 className="text-amber-400 font-semibold mb-4">Business</h4>
            <ul className="space-y-2">
              <li>
                <a href="https://www.bzead.com/seller" className="text-white hover:text-amber-400 transition-colors text-sm">
                  Become a Seller
                </a>
              </li>

              <li>
                <Link to="/about" className="text-white hover:text-amber-400 transition-colors text-sm">
                  About Us
                </Link>
              </li>
              <li>
                <Link to="/contact" className="text-white hover:text-amber-400 transition-colors text-sm">
                  Contact Us
                </Link>
              </li>
              <li>
                <a
                  href={BUYER_APP_PLAY_STORE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 mt-2 px-4 py-2 bg-amber-500 text-white text-sm font-semibold rounded-xl hover:bg-amber-600 transition-colors"
                >
                  Download Android App
                </a>
              </li>
            </ul>
          </div>

          {/* Contact Info */}
          <div>
            <h4 className="text-amber-400 font-semibold mb-4">Contact Us</h4>
            <ul className="space-y-3">
              <li className="flex items-start space-x-2">
                <MapPin className="h-5 w-5 text-white flex-shrink-0 mt-0.5" />
                <span className="text-white text-sm">
                  {COMPANY_ADDRESS_LINES[0]}<br />
                  {COMPANY_ADDRESS_LINES[1]}
                </span>
              </li>
              <li className="flex items-center space-x-2">
                <Phone className="h-5 w-5 text-white" />
                <a href="tel:+447555394997" className="text-white hover:text-amber-400 transition-colors text-sm">
                  +44 7555394997
                </a>
              </li>
              <li className="flex items-center space-x-2">
                <Mail className="h-5 w-5 text-white" />
                <a href="mailto:support@bzead.com" className="text-white hover:text-amber-400 transition-colors text-sm">
                  support@bzead.com
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Payment Methods */}
        <div className="border-t border-blue-700 pt-8 pb-6">
          <div className="flex flex-col items-center gap-4">
            <div className="flex flex-wrap justify-center items-center gap-3">
              {/* Visa */}
              <div className="bg-white rounded px-2.5 py-1.5 h-8 flex items-center">
                <svg viewBox="0 0 48 16" className="h-4 w-auto">
                  <text x="0" y="13" fontFamily="Arial, sans-serif" fontWeight="bold" fontSize="16" fill="#1A1F71">VISA</text>
                </svg>
              </div>
              {/* Mastercard */}
              <div className="bg-white rounded px-2 py-1.5 h-8 flex items-center">
                <svg viewBox="0 0 36 22" className="h-5 w-auto">
                  <circle cx="13" cy="11" r="10" fill="#EB001B"/>
                  <circle cx="23" cy="11" r="10" fill="#F79E1B"/>
                  <path d="M18 3.5a10 10 0 0 0 0 15 10 10 0 0 0 0-15z" fill="#FF5F00"/>
                </svg>
              </div>
              {/* Maestro */}
              <div className="bg-white rounded px-2 py-1.5 h-8 flex items-center">
                <svg viewBox="0 0 36 22" className="h-5 w-auto">
                  <circle cx="13" cy="11" r="10" fill="#6C6BBD"/>
                  <circle cx="23" cy="11" r="10" fill="#EB001B"/>
                  <path d="M18 3.5a10 10 0 0 0 0 15 10 10 0 0 0 0-15z" fill="#7673C0"/>
                </svg>
              </div>
              {/* Amex */}
              <div className="bg-[#006FCF] rounded px-2 py-1.5 h-8 flex items-center">
                <svg viewBox="0 0 48 16" className="h-3.5 w-auto">
                  <text x="0" y="12" fontFamily="Arial, sans-serif" fontWeight="bold" fontSize="9" fill="#fff">AMERICAN</text>
                  <text x="0" y="16" fontFamily="Arial, sans-serif" fontWeight="bold" fontSize="5" fill="#fff">EXPRESS</text>
                </svg>
              </div>
              {/* Diners Club */}
              <div className="bg-white rounded px-2 py-1.5 h-8 flex items-center">
                <svg viewBox="0 0 24 24" className="h-5 w-auto">
                  <circle cx="12" cy="12" r="11" fill="none" stroke="#022e5c" strokeWidth="1.5"/>
                  <circle cx="9" cy="12" r="5" fill="none" stroke="#022e5c" strokeWidth="1"/>
                  <circle cx="15" cy="12" r="5" fill="none" stroke="#022e5c" strokeWidth="1"/>
                </svg>
              </div>
              {/* Discover */}
              <div className="bg-white rounded px-2 py-1.5 h-8 flex items-center">
                <svg viewBox="0 0 56 16" className="h-3.5 w-auto">
                  <text x="0" y="12" fontFamily="Arial, sans-serif" fontWeight="bold" fontSize="10" fill="#231F20">DISC</text>
                  <circle cx="32" cy="8" r="6" fill="#F47216"/>
                  <text x="37" y="12" fontFamily="Arial, sans-serif" fontWeight="bold" fontSize="10" fill="#231F20">VER</text>
                </svg>
              </div>
              {/* RuPay */}
              <div className="bg-white rounded px-2 py-1.5 h-8 flex items-center">
                <svg viewBox="0 0 48 16" className="h-3.5 w-auto">
                  <text x="0" y="13" fontFamily="Arial, sans-serif" fontWeight="bold" fontSize="12" fill="#097A44">Ru</text>
                  <text x="18" y="13" fontFamily="Arial, sans-serif" fontWeight="bold" fontSize="12" fill="#F47920">Pay</text>
                </svg>
              </div>
              {/* Net Banking */}
              <div className="bg-[#2D2D2D] rounded px-2.5 py-1.5 h-8 flex items-center">
                <span className="text-[10px] font-semibold text-white whitespace-nowrap">NET BANKING</span>
              </div>
              {/* Cash on Delivery is disabled web-wide — chip intentionally removed */}
              {/* Easy EMI */}
              <div className="bg-[#2D2D2D] rounded px-2.5 py-1.5 h-8 flex items-center">
                <span className="text-[10px] font-semibold text-white whitespace-nowrap">EASY EMI OPTIONS</span>
              </div>
            </div>
            <p className="text-white/70 text-xs">
              Secured Payments powered by <span className="text-amber-400 font-medium">STRIPE</span> — 256-bit SSL encryption Payment Solution
            </p>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-blue-700 pt-6">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <p className="text-white text-sm mb-4 md:mb-0">
              &copy; 2026 BZEAD POWERD BY BEAUZEAD, INDIA All rights reserved.
            </p>
            <p className="text-white text-sm">INDIA | UNITED KINGDOM | KENYA</p>
          </div>
        </div>
      </div>
    </footer>
  );
};
