import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../components/layout/Header';
import { MobileNav } from '../components/layout/MobileNav';
import { Footer } from '../components/layout/Footer';
import { Skeleton, SkeletonText } from '../components/common/Skeleton';
import { openExternalLinkHandler } from '../mobile/externalLinks';
import { COMPANY_ADDRESS } from '../constants/companyContact';

const LoadingStage: React.FC = () => {
  const navigate = useNavigate();

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <div className="border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <button
            onClick={handleBack}
            className="text-sm text-slate-700 hover:text-amber-700 transition-colors"
            aria-label="Go back"
          >
            ← Back
          </button>
        </div>
      </div>

      <div className="flex-1 w-full max-w-4xl mx-auto px-4 py-8">
        <Skeleton rounded="md" className="h-7 w-48 mb-6" />
        <div className="space-y-6">
          <SkeletonText lines={4} />
          <SkeletonText lines={3} />
          <SkeletonText lines={5} />
        </div>
      </div>
    </div>
  );
};

export const About: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const timer = window.setTimeout(() => setLoading(false), 700);
    return () => window.clearTimeout(timer);
  }, []);

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate('/');
  };

  const commitments = useMemo(
    () => [
      'Fair and transparent marketplace operations',
      'Fraud prevention and identity verification',
      'Secure payments',
      'Reliable shipping integration',
      'Responsible data protection',
    ],
    []
  );

  if (loading) {
    return <LoadingStage />;
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Header />
      <MobileNav />

      <main className="flex-grow">
        <div className="bg-gray-50 border-b border-gray-200">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
            <button
              onClick={handleBack}
              className="text-sm text-slate-700 hover:text-amber-700 transition-colors"
              aria-label="Go back"
            >
              ← Back
            </button>
            <p className="text-xs text-gray-500">Updated date: 20th feb 2026</p>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 py-8">
          <h1 className="text-2xl font-semibold text-gray-900 mb-6">About BZEAD</h1>

          <div className="text-sm text-gray-700 leading-relaxed space-y-6">
            <section>
              <p>
                BZEAD is an online marketplace platform operated under BEAUZEAD, a private limited company
                registered in INDIA.
              </p>
              <div className="mt-3 space-y-1 text-gray-600">
                <p>Company Name: BEAUZEAD LTD</p>
                <p>Company Registration Number: UDYAM-KL-04-0079675</p>
                <p>Registered in: INDIA</p>
                <p>
                  Parent Website:{' '}
                  <a
                    href="https://www.bzead.com"
                    onClick={openExternalLinkHandler('https://www.bzead.com')}
                    rel="noreferrer"
                    className="text-amber-700 hover:underline"
                  >
                    https://www.bzead.com
                  </a>
                </p>
              </div>
              <p className="mt-3">
                BEAUZEAD is incorporated under the Companies Act 2006 as a private company limited by shares,
                with its registered office at {COMPANY_ADDRESS}.
              </p>
              <p className="mt-3">
                BZEAD operates as a global e-commerce platform currently focusing on Asia and the United Kingdom.
                Our mission is to provide a secure, transparent, and reliable marketplace for buyers and sellers.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-gray-900 mb-2">Our Platform</h2>
              <p>
                BZEAD connects verified sellers with buyers through a structured and secure online system. All seller
                registrations undergo verification procedures to ensure authenticity and reduce fraudulent activity.
              </p>
              <p className="mt-3">
                We are committed to maintaining ethical trade practices and ensuring safe transactions across our
                platform.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-gray-900 mb-2">Payment &amp; Shipping Partners</h2>
              <p>To ensure reliable operations:</p>
              <ul className="list-disc list-inside mt-2 space-y-1 text-gray-600">
                <li>Stripe is used as our secure payment gateway for processing online payments.</li>
              </ul>
              <p className="mt-3">
                These integrations help us deliver smooth and secure transaction experiences for our users.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-gray-900 mb-2">Data Protection &amp; Compliance</h2>
              <p>At BZEAD, we respect user privacy and data protection standards.</p>
              <ul className="list-disc list-inside mt-2 space-y-1 text-gray-600">
                <li>We do not sell or misuse buyer or seller personal information.</li>
                <li>
                  Personal and business data collected during seller registration is used strictly for identity
                  verification and fraud prevention.
                </li>
                <li>We follow responsible data handling practices in line with applicable regulations.</li>
                <li>
                  We only send transactional communications such as account verification, OTP authentication, order
                  updates, and essential service notifications.
                </li>
                <li>We do not send unsolicited marketing communications without user consent.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-base font-semibold text-gray-900 mb-2">Tax &amp; Regulatory Responsibility</h2>
              <p>
                We aim to operate transparently across supported countries. Our systems are structured to support
                proper tax documentation and regulatory compliance in applicable jurisdictions.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-gray-900 mb-2">Our Commitment</h2>
              <p className="mb-2">We are committed to:</p>
              <ul className="list-disc list-inside space-y-1 text-gray-600">
                {commitments.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <p className="mt-3">Our goal is to build long-term trust with our customers and sellers.</p>
            </section>

            <section className="border-t border-gray-200 pt-6 mt-8">
              <h2 className="text-base font-semibold text-gray-900 mb-2">Contact Information</h2>
              <div className="space-y-3 text-gray-600">
                <div>
                  <p className="text-gray-900">For general inquiries:</p>
                  <a href="mailto:support@bzead.com" className="text-amber-700 hover:underline">
                    support@bzead.com
                  </a>
                </div>
                <div>
                  <p className="text-gray-900">For admin contact:</p>
                  <a href="mailto:admin@bzead.com" className="text-amber-700 hover:underline">
                    admin@bzead.com
                  </a>
                </div>
                <div>
                  <a href="tel:+447555394997" className="text-amber-700 hover:underline">
                    +44 7555394997
                  </a>
                </div>
                <div>
                  <p className="text-gray-900">Address:</p>
                  <p>{COMPANY_ADDRESS}</p>
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default About;