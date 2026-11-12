import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Header } from '../components/layout/Header';
import { MobileNav } from '../components/layout/MobileNav';
import { Footer } from '../components/layout/Footer';

export const RefundPolicy: React.FC = () => {
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
              <span className="text-gray-900">Cancellation & Return Policy</span>
            </nav>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 py-8">
          <h1 className="text-2xl font-semibold text-gray-900 mb-1">Order Cancellation & Return Policy</h1>
          <p className="text-sm text-gray-500 mb-4">Last updated: February 16, 2026</p>
          <p className="text-sm text-gray-700 mb-8">
            At Beauzead Store, we are committed to delivering a seamless and trustworthy shopping experience. Our cancellation and return policies are designed to be transparent, fair, and customer-friendly while ensuring smooth order fulfillment with our seller partners.
          </p>

          <div className="text-sm text-gray-700 leading-relaxed space-y-6">

            {/* Cancellation Policy */}
            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-3 border-b border-gray-300 pb-1">Cancellation Policy</h2>
              <div className="space-y-3">
                <p>Customers may cancel an order anytime before it is dispatched. Once an order is out for delivery, cancellation is no longer possible. However, customers may choose to decline the order at the time of delivery.</p>
                <p>Cancellation timeframes may vary depending on the product category. Once the specified cancellation window has expired, the order cannot be cancelled.</p>
                <p>In some cases, cancellations made after the permitted window may incur a cancellation fee. The cancellation window and applicable charges mentioned on the product page or order confirmation page shall be considered final.</p>
                <p>If an order is cancelled by Beauzead Store or the seller due to unforeseen circumstances, customers will receive a full refund for prepaid orders.</p>
                <p>Beauzead Store reserves the right to accept or reject cancellation requests and to revise cancellation windows or charges from time to time to ensure operational efficiency and customer satisfaction.</p>
              </div>
            </section>

            {/* Cancellation Policy – Hyperlocal */}
            <section>
              <h2 className="text-base font-semibold text-gray-900 mb-2 border-b border-gray-300 pb-1">Cancellation Policy – Hyperlocal / Minutes Delivery</h2>
              <p className="mb-3">Orders placed under Beauzead Store MINUTES delivery are fulfilled on priority due to ultra-fast delivery timelines and are therefore non-cancellable and non-refundable via self-service.</p>
              <p className="mb-2">Cancellation or refund requests may be considered through Beauzead Store Customer Support in the following situations:</p>
              <ul className="list-disc list-inside space-y-1 text-gray-600">
                <li>The order is not delivered within the estimated delivery time shown at checkout</li>
                <li>The delivery partner has not picked up the order</li>
                <li>The seller has not accepted or has cancelled the order for reasons not attributable to the customer</li>
                <li>Any other exceptional scenario as determined by Beauzead Store</li>
              </ul>
            </section>

            {/* Returns Policy */}
            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-3 border-b border-gray-300 pb-1">Returns Policy</h2>
              <p className="mb-2">Returns are offered by Beauzead Store's trusted sellers in accordance with this policy. Not all products within a category are eligible for return.</p>
              <p className="mb-2">The return, replacement, or refund policy displayed on the product page will always take precedence over this general policy.</p>
              <p>Beauzead Store encourages customers to review product-specific return conditions carefully before placing an order.</p>
            </section>

            {/* Part 1 */}
            <section>
              <h2 className="text-base font-semibold text-gray-900 mb-3 border-b border-gray-300 pb-1">Part 1 – Category, Return Window & Available Actions</h2>

              <h3 className="font-medium text-gray-900 mt-4 mb-1">Furniture & Home Essentials</h3>
              <ul className="list-disc list-inside space-y-1 text-gray-600 mb-1">
                <li>Return Window: 10 days</li>
                <li>Available Actions: Refund or Replacement</li>
                <li>Products requiring installation must be installed by authorized service personnel</li>
                <li>Only one replacement is permitted per order</li>
              </ul>

              <h3 className="font-medium text-gray-900 mt-4 mb-1">Lifestyle (Clothing, Footwear, Watches, Bags, Winterwear & Accessories)</h3>
              <ul className="list-disc list-inside space-y-1 text-gray-600 mb-1">
                <li>Return Window: 10 days</li>
                <li>Available Actions: Refund, Replacement, or Exchange</li>
              </ul>

              <h3 className="font-medium text-gray-900 mt-4 mb-1">Medicines</h3>
              <ul className="list-disc list-inside space-y-1 text-gray-600 mb-1">
                <li>Allopathy & Homeopathy: 2 days – Refund only</li>
                <li>Prescription Medicines: 3 days – Refund for damaged, wrong, or expired items only</li>
              </ul>

              <h3 className="font-medium text-gray-900 mt-4 mb-1">Home Decor, Furnishing & Household Items</h3>
              <ul className="list-disc list-inside space-y-1 text-gray-600 mb-1">
                <li>Return Window: 7 days</li>
                <li>Available Actions: Refund or Replacement</li>
              </ul>

              <h3 className="font-medium text-gray-900 mt-4 mb-1">Books, Toys, Stationery, Sports Equipment & Musical Instruments</h3>
              <ul className="list-disc list-inside space-y-1 text-gray-600 mb-1">
                <li>Return Window: 7 days</li>
                <li>Available Actions: Replacement only for defective or incorrect items</li>
              </ul>

              <h3 className="font-medium text-gray-900 mt-4 mb-1">Mobiles, Electronics & Appliances</h3>
              <ul className="list-disc list-inside space-y-1 text-gray-600 mb-1">
                <li>Return Window: 7 days</li>
                <li>Available Actions: Replacement or Authorized Service Center repair only</li>
                <li>Final resolution is subject to brand warranty and seller approval</li>
              </ul>

              <h3 className="font-medium text-gray-900 mt-4 mb-1">Grocery</h3>
              <ul className="list-disc list-inside space-y-1 text-gray-600 mb-1">
                <li>Fresh produce & dairy: 1–2 days refund</li>
                <li>Packaged grocery items: 7 days refund</li>
                <li>Hyperlocal grocery orders follow separate timelines</li>
              </ul>
            </section>

            {/* Non-Returnable Items */}
            <section>
              <h2 className="text-base font-semibold text-gray-900 mb-2 border-b border-gray-300 pb-1">Non-Returnable Items</h2>
              <p className="mb-2">Certain products are non-returnable due to hygiene, safety, or regulatory reasons. These include, but are not limited to:</p>
              <ul className="list-disc list-inside space-y-1 text-gray-600">
                <li>Personal hygiene and intimate care items</li>
                <li>Innerwear and select wellness products</li>
              </ul>
              <p className="mt-2">The return eligibility shown on the product page shall always prevail.</p>
            </section>

            {/* Part 2 */}
            <section>
              <h2 className="text-base font-semibold text-gray-900 mb-2 border-b border-gray-300 pb-1">Part 2 – Return Pick-Up & Quality Check</h2>
              <p className="mb-2">To ensure a smooth return experience, products must meet the following conditions:</p>
              <ul className="list-disc list-inside space-y-1 text-gray-600">
                <li>Correct product with matching serial/IMEI numbers and intact tags</li>
                <li>All original accessories, manuals, and promotional freebies included</li>
                <li>Product must be unused, undamaged, and untampered</li>
                <li>Original packaging must be intact</li>
                <li>Devices must be reset and all security locks removed</li>
              </ul>
              <p className="mt-2">Beauzead Store's pickup partner may decline the return if these conditions are not met.</p>
            </section>

            {/* Part 3 */}
            <section>
              <h2 className="text-base font-semibold text-gray-900 mb-2 border-b border-gray-300 pb-1">Part 3 – General Return Guidelines</h2>
              <ul className="list-disc list-inside space-y-1 text-gray-600">
                <li>If replacement is not feasible, a refund will be issued</li>
                <li>Missing or damaged accessories may be replaced or compensated via an e-voucher</li>
                <li>For open-box deliveries, issues must be reported at the time of delivery</li>
                <li>Furniture and large appliances may be inspected by authorized service personnel</li>
                <li>Beauzead Store reserves the right to limit or restrict returns in cases of misuse or policy abuse</li>
              </ul>
            </section>

            {/* Refund Timeline */}
            <section>
              <h2 className="text-base font-semibold text-gray-900 mb-2 border-b border-gray-300 pb-1">Refund Timeline</h2>
              <ul className="list-disc list-inside space-y-1 text-gray-600">
                <li>Refunds are initiated once the returned product is received and verified by the seller</li>
                <li>Refunds are typically processed within 5–7 business days</li>
                <li>Customers can track refund status via the Order Details section</li>
              </ul>
            </section>

            {/* Contact */}
            <section className="border-t border-gray-200 pt-6 mt-8">
              <p className="text-gray-500 text-xs">
                For cancellation or return assistance, contact bzead Customer Support at{' '}
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

export default RefundPolicy;