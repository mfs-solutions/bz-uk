import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Header } from '../components/layout/Header';
import { MobileNav } from '../components/layout/MobileNav';
import { Footer } from '../components/layout/Footer';

export const TermsService: React.FC = () => {
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
              <span className="text-gray-900">Terms of Use</span>
            </nav>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 py-8">
          <h1 className="text-2xl font-semibold text-gray-900 mb-1">Terms of Use</h1>
          <p className="text-sm text-gray-500 mb-8">Last updated: February 16, 2026</p>

          <div className="text-sm text-gray-700 leading-relaxed space-y-6">

            {/* 1. Acceptance of Terms */}
            <section>
              <h2 className="text-base font-semibold text-gray-900 mb-2 border-b border-gray-300 pb-1">1. Acceptance of Terms</h2>
              <p>
                These Terms of Use ("Terms") govern your use of the Beauzead Store Platform. By accessing or using the Platform, you agree to be bound by these Terms and our Privacy Policy. If you do not agree, do not use the Platform.
              </p>
            </section>

            {/* 2. Account Registration */}
            <section>
              <h2 className="text-base font-semibold text-gray-900 mb-2 border-b border-gray-300 pb-1">2. Account Registration</h2>
              <p className="mb-2">Users may be required to register an account to use certain services.</p>
              <ul className="list-disc list-inside space-y-1 text-gray-600">
                <li>You must provide accurate and up-to-date information.</li>
                <li>You are responsible for maintaining confidentiality of login credentials.</li>
                <li>All activities under your account are your responsibility.</li>
              </ul>
            </section>

            {/* 3. Orders & Payments */}
            <section>
              <h2 className="text-base font-semibold text-gray-900 mb-2 border-b border-gray-300 pb-1">3. Orders & Payments</h2>
              <ul className="list-disc list-inside space-y-1 text-gray-600">
                <li>Placing an order constitutes an offer to purchase products under the applicable price and terms.</li>
                <li>Payment must be completed using authorized payment methods.</li>
                <li>Beauzead Store reserves the right to cancel, refuse, or limit orders in cases of suspected fraud, violation of Terms, or logistical constraints.</li>
              </ul>
            </section>

            {/* 4. Delivery, Cancellation, Returns & Refunds */}
            <section>
              <h2 className="text-base font-semibold text-gray-900 mb-2 border-b border-gray-300 pb-1">4. Delivery, Cancellation, Returns & Refunds</h2>
              <ul className="list-disc list-inside space-y-1 text-gray-600">
                <li>Orders are subject to our Cancellation, Returns & Refund Policy (as posted on the Platform).</li>
                <li>You agree to comply with applicable timelines and conditions for cancellations and returns.</li>
              </ul>
            </section>

            {/* 5. User Conduct */}
            <section>
              <h2 className="text-base font-semibold text-gray-900 mb-2 border-b border-gray-300 pb-1">5. User Conduct</h2>
              <p className="mb-2">Users must not:</p>
              <ul className="list-disc list-inside space-y-1 text-gray-600">
                <li>Violate laws, infringe intellectual property, or commit fraud</li>
                <li>Use the Platform to transmit harmful or unlawful content</li>
                <li>Attempt to disrupt the Platform's operations or compromise security</li>
                <li>Create multiple accounts to exploit offers or promotions</li>
              </ul>
            </section>

            {/* 6. Intellectual Property */}
            <section>
              <h2 className="text-base font-semibold text-gray-900 mb-2 border-b border-gray-300 pb-1">6. Intellectual Property</h2>
              <ul className="list-disc list-inside space-y-1 text-gray-600">
                <li>All content on the Platform (text, graphics, logos, software) is owned by Beauzead Store or its licensors.</li>
                <li>You may not reproduce, modify, distribute, or create derivative works without prior written consent.</li>
              </ul>
            </section>

            {/* 7. Disclaimers */}
            <section>
              <h2 className="text-base font-semibold text-gray-900 mb-2 border-b border-gray-300 pb-1">7. Disclaimers</h2>
              <ul className="list-disc list-inside space-y-1 text-gray-600">
                <li>Products sold via the Platform are the responsibility of respective sellers.</li>
                <li>Beauzead Store does not guarantee product availability, fitness, or accuracy of third-party descriptions.</li>
                <li>The Platform is provided "as is" without warranties of any kind, to the extent permitted by law.</li>
              </ul>
            </section>

            {/* 8. Limitation of Liability */}
            <section>
              <h2 className="text-base font-semibold text-gray-900 mb-2 border-b border-gray-300 pb-1">8. Limitation of Liability</h2>
              <ul className="list-disc list-inside space-y-1 text-gray-600">
                <li>Beauzead Store shall not be liable for indirect, incidental, or consequential damages arising from Platform use or purchases.</li>
                <li>Liability for direct damages is limited to the order value of the product(s) purchased.</li>
              </ul>
            </section>

            {/* 9. Governing Law & Jurisdiction */}
            <section>
              <h2 className="text-base font-semibold text-gray-900 mb-2 border-b border-gray-300 pb-1">9. Governing Law & Jurisdiction</h2>
              <p>
                These Terms shall be governed by the laws of India. Disputes will be subject to the exclusive jurisdiction of courts in the location of Beauzead Store's registered office.
              </p>
            </section>

            {/* 10. Modifications */}
            <section>
              <h2 className="text-base font-semibold text-gray-900 mb-2 border-b border-gray-300 pb-1">10. Modifications</h2>
              <ul className="list-disc list-inside space-y-1 text-gray-600">
                <li>Beauzead Store may revise these Terms at any time.</li>
                <li>Revised Terms are effective upon posting on the Platform.</li>
                <li>Continued use of the Platform constitutes acceptance of updated Terms.</li>
              </ul>
            </section>

            {/* Contact */}
            <section className="border-t border-gray-200 pt-6 mt-8">
              <p className="text-gray-500 text-xs">
                If you have questions about these Terms, please contact us at{' '}
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

export default TermsService;