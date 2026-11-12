import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Header } from '../components/layout/Header';
import { MobileNav } from '../components/layout/MobileNav';
import { Footer } from '../components/layout/Footer';

export const PrivacyPolicy: React.FC = () => {
  const navigate = useNavigate();
  const [navLoading, setNavLoading] = useState<'back' | 'home' | null>(null);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  const navigateWithLoading = (type: 'back' | 'home') => {
    setNavLoading(type);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => {
      if (type === 'back') {
        navigate(-1);
      } else {
        navigate('/');
      }
      window.scrollTo({ top: 0, behavior: 'auto' });
      setNavLoading(null);
    }, 220);
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Header />
      <MobileNav />

      <main className="flex-grow">
        {/* Breadcrumb */}
        <div className="bg-gray-50 border-b border-gray-200">
          <div className="max-w-4xl mx-auto px-4 py-3">
            <nav className="text-sm text-gray-500">
              <button onClick={() => navigateWithLoading('back')} disabled={navLoading !== null} className="hover:text-amber-600 hover:underline disabled:opacity-60 inline-flex items-center gap-1">
                {navLoading === 'back' && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Back
              </button>
              <span className="mx-2">•</span>
              <button onClick={() => navigateWithLoading('home')} disabled={navLoading !== null} className="hover:text-amber-600 hover:underline disabled:opacity-60 inline-flex items-center gap-1">
                {navLoading === 'home' && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Home
              </button>
              <span className="mx-2">›</span>
              <span className="text-gray-900">Privacy Policy</span>
            </nav>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 py-8">
          <h1 className="text-2xl font-semibold text-gray-900 mb-1">Privacy Policy</h1>
          <p className="text-sm text-gray-500 mb-8">Last updated: February 20, 2026</p>

          <div className="text-sm text-gray-700 leading-relaxed space-y-6">

            {/* 1. Introduction */}
            <section>
              <h2 className="text-base font-semibold text-gray-900 mb-2">1. Introduction</h2>
              <p>
                At Beauzead Store ("we", "our", "us"), your privacy and data security are paramount. This Privacy Policy explains how we collect, use, share, and protect your personal information when you use our platform, services, or mobile application (collectively, the "Platform").
              </p>
              <p className="mt-2">
                By using the Platform, you consent to the practices described in this Privacy Policy.
              </p>
            </section>

            {/* 2. Information We Collect */}
            <section>
              <h2 className="text-base font-semibold text-gray-900 mb-2">2. Information We Collect</h2>
              <p className="mb-3">We collect the following categories of information:</p>

              <h3 className="font-medium text-gray-900 mb-1">2.1 Personal Information</h3>
              <ul className="list-disc list-inside mb-3 space-y-1 text-gray-600">
                <li>Name, contact details (email, phone number), delivery address, and payment details</li>
                <li>Account credentials for Platform login</li>
                <li>Order and purchase history</li>
              </ul>

              <h3 className="font-medium text-gray-900 mb-1">2.2 Non-Personal Information</h3>
              <ul className="list-disc list-inside mb-3 space-y-1 text-gray-600">
                <li>Device information (IP address, browser type, operating system)</li>
                <li>Location data when using location-enabled services</li>
                <li>Platform usage data, analytics, and preferences</li>
              </ul>

              <h3 className="font-medium text-gray-900 mb-1">2.3 Sensitive Information</h3>
              <ul className="list-disc list-inside space-y-1 text-gray-600">
                <li>Health-related data when purchasing medicines (with explicit consent)</li>
                <li>Payment information securely processed by authorized payment gateways</li>
              </ul>
            </section>

            {/* 3. Use of Information */}
            <section>
              <h2 className="text-base font-semibold text-gray-900 mb-2">3. Use of Information</h2>
              <p className="mb-2">We use your information to:</p>
              <ul className="list-disc list-inside space-y-1 text-gray-600">
                <li>Process and fulfill orders</li>
                <li>Provide customer support and handle returns or refunds</li>
                <li>Personalize offers, promotions, and recommendations</li>
                <li>Conduct research and analytics to improve services</li>
                <li>Comply with legal obligations and prevent fraudulent activity</li>
                <li>Communicate important updates about the Platform, policies, or services</li>
              </ul>
            </section>

            {/* 4. Email Communications */}
            <section>
              <h2 className="text-base font-semibold text-gray-900 mb-2">4. Email Communications</h2>
              <p className="mb-3">
                We use email exclusively for essential, transactional purposes related to your account and platform activity. These include:
              </p>
              <ul className="list-disc list-inside space-y-1 text-gray-600 mb-3">
                <li>One-Time Password (OTP) codes for account verification</li>
                <li>Email address verification during registration</li>
                <li>Password reset and account recovery notifications</li>
                <li>Order confirmations and shipping updates</li>
                <li>Account security alerts</li>
              </ul>
              <p className="mb-2">
                <strong className="text-gray-900">No Marketing Emails Without Consent:</strong> We do not send promotional, marketing, or advertising emails unless you have explicitly opted in to receive them. You may withdraw your marketing consent at any time through your account settings or by contacting us at{' '}
                <a href="mailto:support@bzead.com" className="text-amber-600 hover:underline">support@bzead.com</a>.
              </p>
              <p>
                Transactional emails are essential to the operation of your account and cannot be opted out of while your account remains active.
              </p>
            </section>

            {/* 5. Sharing of Information */}
            <section>
              <h2 className="text-base font-semibold text-gray-900 mb-2">5. Sharing of Information</h2>
              <p className="mb-2">
                We do not sell your personal information. We may share information with:
              </p>
              <ul className="list-disc list-inside space-y-1 text-gray-600">
                <li>Sellers and brand partners to fulfill orders and process returns</li>
                <li>Delivery and logistics partners for shipping and delivery</li>
                <li>Payment processors for secure transactions</li>
                <li>Legal authorities when required by law or for dispute resolution</li>
                <li>Service providers assisting in Platform operations (analytics, IT services)</li>
              </ul>
            </section>

            {/* 6. Data Security */}
            <section>
              <h2 className="text-base font-semibold text-gray-900 mb-2">6. Data Security</h2>
              <p>
                We implement industry-standard security measures, including encryption and secure storage, to protect your data. While we strive to safeguard your information, no method of transmission over the internet is 100% secure.
              </p>
            </section>

            {/* 7. Cookies & Tracking */}
            <section>
              <h2 className="text-base font-semibold text-gray-900 mb-2">7. Cookies & Tracking</h2>
              <p className="mb-2">We use cookies and similar technologies to:</p>
              <ul className="list-disc list-inside space-y-1 text-gray-600">
                <li>Enhance user experience</li>
                <li>Track Platform performance and analytics</li>
                <li>Deliver personalized content, offers, and ads</li>
              </ul>
              <p className="mt-2">
                You may manage cookie preferences through your browser or device settings.
              </p>
              <h3 className="text-sm font-semibold text-gray-900 mt-4 mb-1">7.1 Third-Party Advertising (Google AdSense)</h3>
              <p className="mb-2">
                We use Google AdSense, a third-party advertising service provided by Google LLC, to display ads on certain parts of our Platform. Google and its partners use cookies (including the DoubleClick DART cookie) and similar technologies to serve ads based on your prior visits to our Platform and other sites on the internet.
              </p>
              <p className="mb-2">
                Google's use of advertising cookies enables it and its partners to serve ads to you based on your visits to our Platform and/or other sites on the internet. You may opt out of personalized advertising by visiting{' '}
                <a href="https://www.google.com/settings/ads" target="_blank" rel="noopener noreferrer" className="text-amber-600 hover:underline">Google Ads Settings</a>
                {' '}or learn more about how Google uses data at{' '}
                <a href="https://policies.google.com/technologies/ads" target="_blank" rel="noopener noreferrer" className="text-amber-600 hover:underline">policies.google.com/technologies/ads</a>.
              </p>
              <p>
                For more information about cookies used by third-party advertising vendors, visit{' '}
                <a href="https://www.aboutads.info/" target="_blank" rel="noopener noreferrer" className="text-amber-600 hover:underline">aboutads.info</a>.
              </p>
            </section>

            {/* 8. Your Rights */}
            <section>
              <h2 className="text-base font-semibold text-gray-900 mb-2">8. Your Rights</h2>
              <p className="mb-2">You may:</p>
              <ul className="list-disc list-inside space-y-1 text-gray-600">
                <li>Access, correct, or update your personal information</li>
                <li>Request deletion of your personal information, subject to legal and business obligations</li>
                <li>Opt-out of promotional communications</li>
                <li>Withdraw consent to data processing, subject to contractual obligations</li>
                <li>Request a copy of your personal data in a portable format</li>
                <li>Object to processing of your personal data for specific purposes</li>
              </ul>
              <p className="mt-2">
                Requests can be made via Customer Support at{' '}
                <a href="mailto:support@bzead.com" className="text-amber-600 hover:underline">support@bzead.com</a>.
                We will respond to all legitimate requests within 30 days.
              </p>
              <p className="mt-2">
                For account deletion instructions, see our{' '}
                <Link to="/deleteaccount" className="text-amber-600 hover:underline">Delete Account Policy</Link>.
              </p>
            </section>

            {/* 9. Children's Privacy */}
            <section>
              <h2 className="text-base font-semibold text-gray-900 mb-2">9. Children's Privacy</h2>
              <p>
                Our Platform is not intended for children under 18. We do not knowingly collect personal information from minors.
              </p>
            </section>

            {/* 10. Updates to Privacy Policy */}
            <section>
              <h2 className="text-base font-semibold text-gray-900 mb-2">10. Updates to Privacy Policy</h2>
              <p>
                We may revise this Privacy Policy from time to time. Updates will be effective immediately upon posting on the Platform. Continued use of the Platform constitutes acceptance of the updated Privacy Policy.
              </p>
            </section>

            {/* Contact */}
            <section className="border-t border-gray-200 pt-6 mt-8">
              <p className="text-gray-500 text-xs">
                If you have questions about this Privacy Policy or wish to exercise your data rights, please contact us at{' '}
                <a href="mailto:support@bzead.com" className="text-amber-600 hover:underline">support@bzead.com</a>
              </p>
            </section>

          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default PrivacyPolicy;
