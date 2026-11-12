import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Header } from '../components/layout/Header';
import { MobileNav } from '../components/layout/MobileNav';
import { Footer } from '../components/layout/Footer';

export const TermsAndConditions: React.FC = () => {
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
              <span className="text-gray-900">Terms &amp; Conditions</span>
            </nav>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 py-8">
          <h1 className="text-2xl font-semibold text-gray-900 mb-1">Terms &amp; Conditions</h1>
          <p className="text-sm text-gray-500 mb-8">Last updated: February 20, 2026</p>

          <div className="text-sm text-gray-700 leading-relaxed space-y-6">

            {/* 1. Introduction */}
            <section>
              <h2 className="text-base font-semibold text-gray-900 mb-2 border-b border-gray-300 pb-1">1. Introduction</h2>
              <p>
                These Terms and Conditions ("Terms") govern your access to and use of the BZEAD platform,
                including the website, mobile application, and all related services (collectively, the "Platform").
                By creating an account or using any part of the Platform, you agree to be bound by these Terms.
                If you do not agree, please do not use the Platform.
              </p>
            </section>

            {/* 2. User Account Responsibility */}
            <section>
              <h2 className="text-base font-semibold text-gray-900 mb-2 border-b border-gray-300 pb-1">2. User Account Responsibility</h2>
              <p className="mb-2">When you create an account on BZEAD, you agree to the following:</p>
              <ul className="list-disc list-inside space-y-1 text-gray-600">
                <li>You must provide accurate, current, and complete information during registration.</li>
                <li>You are solely responsible for maintaining the confidentiality of your login credentials (email and password).</li>
                <li>You are responsible for all activities that occur under your account, whether authorized by you or not.</li>
                <li>You must notify us immediately at <a href="mailto:support@bzead.com" className="text-amber-600 hover:underline">support@bzead.com</a> if you suspect unauthorized access to your account.</li>
                <li>You may not share, transfer, or assign your account to any other person.</li>
                <li>BZEAD reserves the right to suspend or terminate accounts that violate these Terms or are inactive for an extended period.</li>
              </ul>
            </section>

            {/* 3. Transactional Emails & Communications */}
            <section>
              <h2 className="text-base font-semibold text-gray-900 mb-2 border-b border-gray-300 pb-1">3. Transactional Emails &amp; Communications</h2>
              <p className="mb-2">
                By creating an account, you acknowledge and consent to receiving transactional emails that
                are essential to the functioning of your account and use of the Platform. These include:
              </p>
              <ul className="list-disc list-inside space-y-1 text-gray-600 mb-3">
                <li>One-Time Password (OTP) codes for identity verification during login and registration</li>
                <li>Email address verification messages</li>
                <li>Password reset and account recovery notifications</li>
                <li>Order confirmations, shipping updates, and delivery notifications</li>
                <li>Account security alerts (e.g., login from a new device)</li>
              </ul>
              <p className="mb-2">
                These transactional emails are not promotional in nature and are required for the proper
                operation of your account. They cannot be opted out of while your account remains active.
              </p>
              <p>
                We will never send marketing or promotional emails without your explicit prior consent.
                If you have opted in to marketing communications, you may opt out at any time through
                your account settings or by contacting us.
              </p>
            </section>

            {/* 4. Platform Usage Rules */}
            <section>
              <h2 className="text-base font-semibold text-gray-900 mb-2 border-b border-gray-300 pb-1">4. Platform Usage Rules</h2>
              <p className="mb-2">When using the Platform, you agree not to:</p>
              <ul className="list-disc list-inside space-y-1 text-gray-600">
                <li>Violate any applicable law, regulation, or third-party rights</li>
                <li>Use the Platform for any unlawful, fraudulent, or malicious purpose</li>
                <li>Upload, transmit, or distribute harmful, offensive, or misleading content</li>
                <li>Attempt to gain unauthorized access to any part of the Platform or its systems</li>
                <li>Interfere with, disrupt, or compromise the security or functionality of the Platform</li>
                <li>Create multiple accounts to exploit promotions, offers, or platform features</li>
                <li>Scrape, crawl, or use automated tools to extract data from the Platform without written permission</li>
                <li>Impersonate another person or entity, or misrepresent your affiliation with any person or entity</li>
              </ul>
              <p className="mt-2">
                BZEAD reserves the right to investigate and take appropriate action, including suspension
                or termination of accounts, against anyone who violates these rules.
              </p>
            </section>

            {/* 5. Intellectual Property */}
            <section>
              <h2 className="text-base font-semibold text-gray-900 mb-2 border-b border-gray-300 pb-1">5. Intellectual Property</h2>
              <p>
                All content on the Platform — including but not limited to text, images, graphics, logos,
                icons, software, and design elements — is the property of BZEAD or its licensors and is
                protected by applicable copyright, trademark, and intellectual property laws. You may not
                reproduce, distribute, modify, or create derivative works based on any part of the Platform
                without our prior written consent.
              </p>
            </section>

            {/* 6. Purchases & Payments */}
            <section>
              <h2 className="text-base font-semibold text-gray-900 mb-2 border-b border-gray-300 pb-1">6. Purchases &amp; Payments</h2>
              <ul className="list-disc list-inside space-y-1 text-gray-600">
                <li>All prices displayed on the Platform are in the selected currency and include applicable taxes unless otherwise stated.</li>
                <li>Placing an order constitutes an offer to purchase the product(s) under the listed terms.</li>
                <li>Payment must be completed using an authorized payment method available on the Platform.</li>
                <li>All payments are processed securely through our payment partner (Stripe) with 256-bit SSL encryption.</li>
                <li>BZEAD reserves the right to cancel or refuse orders in cases of suspected fraud, pricing errors, or stock unavailability.</li>
              </ul>
            </section>

            {/* 7. Limitation of Liability */}
            <section>
              <h2 className="text-base font-semibold text-gray-900 mb-2 border-b border-gray-300 pb-1">7. Limitation of Liability</h2>
              <p className="mb-2">To the maximum extent permitted by applicable law:</p>
              <ul className="list-disc list-inside space-y-1 text-gray-600">
                <li>
                  BZEAD, its directors, employees, partners, and affiliates shall not be liable for any indirect,
                  incidental, special, consequential, or punitive damages arising from your use of or inability
                  to use the Platform.
                </li>
                <li>
                  BZEAD does not guarantee uninterrupted, secure, or error-free operation of the Platform.
                </li>
                <li>
                  Products sold via the Platform are provided by third-party sellers. BZEAD acts as a
                  marketplace facilitator and is not liable for product quality, authenticity, or fitness
                  for a particular purpose.
                </li>
                <li>
                  Our total liability to you for any claims arising from or related to these Terms or your
                  use of the Platform shall not exceed the amount you have paid to BZEAD in the 12 months
                  preceding the claim.
                </li>
              </ul>
            </section>

            {/* 8. Indemnification */}
            <section>
              <h2 className="text-base font-semibold text-gray-900 mb-2 border-b border-gray-300 pb-1">8. Indemnification</h2>
              <p>
                You agree to indemnify, defend, and hold harmless BZEAD and its officers, directors,
                employees, and agents from and against any claims, liabilities, damages, losses, or expenses
                (including reasonable legal fees) arising from your use of the Platform, violation of these Terms,
                or infringement of any third-party rights.
              </p>
            </section>

            {/* 9. Termination */}
            <section>
              <h2 className="text-base font-semibold text-gray-900 mb-2 border-b border-gray-300 pb-1">9. Termination</h2>
              <p>
                BZEAD may suspend or terminate your access to the Platform at any time, with or without
                notice, for conduct that we determine, in our sole discretion, violates these Terms or is
                harmful to other users, the Platform, or third parties. Upon termination, your right to use
                the Platform ceases immediately, though provisions that by their nature should survive
                termination will remain in effect.
              </p>
            </section>

            {/* 10. Governing Law */}
            <section>
              <h2 className="text-base font-semibold text-gray-900 mb-2 border-b border-gray-300 pb-1">10. Governing Law</h2>
              <p>
                These Terms shall be governed by and construed in accordance with the laws of the
                United Kingdom. Any disputes arising out of or in connection with these Terms shall be
                subject to the exclusive jurisdiction of the courts of England and Wales.
              </p>
            </section>

            {/* 11. Changes to Terms */}
            <section>
              <h2 className="text-base font-semibold text-gray-900 mb-2 border-b border-gray-300 pb-1">11. Changes to Terms</h2>
              <p>
                We reserve the right to modify these Terms at any time. Updated Terms will be posted on
                the Platform with a revised "Last updated" date. Your continued use of the Platform after
                any changes constitutes your acceptance of the updated Terms.
              </p>
            </section>

            {/* Contact */}
            <section className="border-t border-gray-200 pt-6 mt-8">
              <p className="text-gray-500 text-xs">
                If you have questions about these Terms and Conditions, please contact us at{' '}
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

export default TermsAndConditions;
