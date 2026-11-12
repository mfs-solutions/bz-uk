import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Header } from '../components/layout/Header';
import { MobileNav } from '../components/layout/MobileNav';
import { Footer } from '../components/layout/Footer';

export const ShippingPolicy: React.FC = () => {
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
              <span className="text-gray-900">Shipping Policy</span>
            </nav>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 py-8">
          <h1 className="text-2xl font-semibold text-gray-900 mb-1">Shipping Policy</h1>
          <p className="text-sm text-gray-500 mb-4">Last updated: February 16, 2026</p>
          <p className="text-sm text-gray-700 mb-8">
            At Beauzead Store, we are committed to delivering your orders promptly and in excellent condition. Please review our shipping policies below for important information about delivery times, costs, and procedures.
          </p>

          <div className="text-sm text-gray-700 leading-relaxed space-y-6">

            {/* Shipping Methods */}
            <section>
              <h2 className="text-base font-semibold text-gray-900 mb-3 border-b border-gray-300 pb-1">Shipping Methods & Costs</h2>

              <h3 className="font-medium text-gray-900 mt-3 mb-1">Standard Shipping</h3>
              <p className="text-gray-600 mb-1">Reliable and economical shipping for most orders.</p>
              <ul className="list-disc list-inside space-y-1 text-gray-600 mb-3">
                <li>Delivery Time: 5–7 business days</li>
                <li>Cost: FREE on orders over £50, £5.99 otherwise</li>
              </ul>

              <h3 className="font-medium text-gray-900 mt-3 mb-1">Express Shipping</h3>
              <p className="text-gray-600 mb-1">Faster delivery for urgent orders.</p>
              <ul className="list-disc list-inside space-y-1 text-gray-600 mb-3">
                <li>Delivery Time: 2–3 business days</li>
                <li>Cost: £12.99</li>
              </ul>

              <h3 className="font-medium text-gray-900 mt-3 mb-1">Next Day Delivery</h3>
              <p className="text-gray-600 mb-1">Premium overnight delivery service.</p>
              <ul className="list-disc list-inside space-y-1 text-gray-600 mb-3">
                <li>Delivery Time: 1 business day</li>
                <li>Cost: £24.99</li>
              </ul>

              <h3 className="font-medium text-gray-900 mt-3 mb-1">International Shipping</h3>
              <p className="text-gray-600 mb-1">Worldwide shipping to selected countries.</p>
              <ul className="list-disc list-inside space-y-1 text-gray-600">
                <li>Delivery Time: 10–15 business days</li>
                <li>Cost: Varies by destination</li>
              </ul>
            </section>

            {/* Delivery Time Frames */}
            <section>
              <h2 className="text-base font-semibold text-gray-900 mb-2 border-b border-gray-300 pb-1">Delivery Time Frames</h2>
              <ul className="list-disc list-inside space-y-1 text-gray-600">
                <li><strong className="text-gray-900">UK Mainland:</strong> Orders are processed within 24 hours. Delivery times are estimates and may vary based on location and carrier availability.</li>
                <li><strong className="text-gray-900">Weekends & Holidays:</strong> Orders placed on weekends or holidays will be processed on the next business day.</li>
                <li><strong className="text-gray-900">Remote Areas:</strong> Deliveries to Scottish Highlands, Northern Ireland, and Isle of Man may take 1–2 additional business days.</li>
                <li><strong className="text-gray-900">Pre-Order Items:</strong> Items marked as pre-order will be shipped after availability. Estimated dates will be provided.</li>
              </ul>
            </section>

            {/* Shipping Address */}
            <section>
              <h2 className="text-base font-semibold text-gray-900 mb-2 border-b border-gray-300 pb-1">Shipping Address Requirements</h2>
              <p className="mb-2">To ensure successful delivery, please:</p>
              <ul className="list-disc list-inside space-y-1 text-gray-600">
                <li>Provide a complete and accurate delivery address</li>
                <li>Include apartment/flat number if applicable</li>
                <li>Verify your postal code</li>
                <li>Include a contact phone number</li>
                <li>Use the same address for billing and shipping (or notify us of differences)</li>
              </ul>
              <p className="mt-2 text-gray-500 text-xs">
                Note: We are not responsible for undeliverable addresses. If an address is incorrect or incomplete, delivery may be delayed or the package returned to us.
              </p>
            </section>

            {/* Order Tracking */}
            <section>
              <h2 className="text-base font-semibold text-gray-900 mb-2 border-b border-gray-300 pb-1">Order Tracking & Updates</h2>
              <p className="mb-2">Once your order is shipped, you will receive a tracking number via email. You can:</p>
              <ul className="list-disc list-inside space-y-1 text-gray-600">
                <li>Track your package in real-time through your account dashboard</li>
                <li>Use the tracking link sent to your email</li>
                <li>Monitor delivery status updates</li>
                <li>Contact our customer support for shipping inquiries</li>
              </ul>
            </section>

            {/* International Shipping */}
            <section>
              <h2 className="text-base font-semibold text-gray-900 mb-2 border-b border-gray-300 pb-1">International Shipping</h2>

              <h3 className="font-medium text-gray-900 mt-3 mb-1">Eligible Countries</h3>
              <p className="text-gray-600 mb-3">We ship to most countries in Europe, North America, and selected other regions. Check your country's availability at checkout.</p>

              <h3 className="font-medium text-gray-900 mt-3 mb-1">Customs & Import Duties</h3>
              <p className="text-gray-600 mb-3">International orders are subject to customs regulations and may incur import duties, taxes, or fees. These are the responsibility of the recipient and are not included in shipping costs.</p>

              <h3 className="font-medium text-gray-900 mt-3 mb-1">Restricted Items</h3>
              <p className="text-gray-600">Certain items cannot be shipped internationally. These will be marked as "UK Only" in the product listing.</p>
            </section>

            {/* Damage & Lost Packages */}
            <section>
              <h2 className="text-base font-semibold text-gray-900 mb-2 border-b border-gray-300 pb-1">Damage & Lost Packages</h2>
              <ul className="list-disc list-inside space-y-1 text-gray-600">
                <li><strong className="text-gray-900">Upon Delivery:</strong> Inspect your package immediately upon receipt. If the package is damaged or the contents are missing, take photos and report the issue within 48 hours of delivery.</li>
                <li><strong className="text-gray-900">Lost Packages:</strong> If your package does not arrive within the estimated delivery window, contact our support team immediately. We will investigate with the carrier and help resolve the issue.</li>
                <li><strong className="text-gray-900">Our Responsibility:</strong> We will work with our carriers to file claims for lost or damaged packages. Once approved, you will receive a replacement or refund.</li>
              </ul>
            </section>

            {/* Special Handling */}
            <section>
              <h2 className="text-base font-semibold text-gray-900 mb-2 border-b border-gray-300 pb-1">Special Handling & Fragile Items</h2>
              <p className="mb-2">All items are carefully packaged to minimize damage during transit. For fragile items, we use additional protective materials.</p>
              <p className="mb-2">For items requiring special handling (furniture, electronics, artwork, etc.), please select the appropriate shipping method or contact our support team.</p>
              <p>Beauzead Store is not responsible for damage to items caused by improper storage, handling by the recipient, or acts of nature after delivery.</p>
            </section>

            {/* Contact */}
            <section className="border-t border-gray-200 pt-6 mt-8">
              <p className="text-gray-500 text-xs">
                For shipping inquiries, contact us at{' '}
                <a href="mailto:support@bzead.com" className="text-amber-600 hover:underline">support@bzead.com</a>
                {' '}or call +447555394997 (Mon–Fri, 9AM–6PM GMT)
              </p>
            </section>

          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default ShippingPolicy;