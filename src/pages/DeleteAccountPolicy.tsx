import { Link } from 'react-router-dom';
import { Header } from '../components/layout/Header';
import { MobileNav } from '../components/layout/MobileNav';
import { Footer } from '../components/layout/Footer';

const requestEmail = 'mailto:support@bzead.com?subject=Account%20Deletion%20Request';

export default function DeleteAccountPolicy() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Header />
      <MobileNav />

      <main className="flex-grow">
        <div className="bg-gray-50 border-b border-gray-200">
          <nav aria-label="Breadcrumb" className="max-w-4xl mx-auto px-4 py-3 text-sm text-gray-500">
            <Link to="/" className="hover:text-amber-600 hover:underline">Home</Link>
            <span className="mx-2" aria-hidden="true">›</span>
            <span aria-current="page" className="text-gray-900">Delete Account Policy</span>
          </nav>
        </div>

        <article className="max-w-4xl mx-auto px-4 py-8 pb-24 md:pb-8">
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">Delete Account Policy</h1>
          <p className="text-sm text-gray-600 mb-8">
            This policy explains how to request deletion of your BZEAD account and associated personal data.
          </p>

          <div className="text-sm text-gray-700 leading-relaxed space-y-6">
            <section>
              <h2 className="text-base font-semibold text-gray-900 mb-2">1. How to request account deletion</h2>
              <p className="mb-2">
                Email <a href={requestEmail} className="text-amber-600 hover:underline">support@bzead.com</a> with
                the subject &ldquo;Account Deletion Request&rdquo; and include the email address associated with your account.
                You can make a request even if you cannot sign in.
              </p>
              <p>
                If you can sign in, you can also open <Link to="/profile" className="text-amber-600 hover:underline">My Account</Link>,
                select Login &amp; Security, and choose Delete Account. This takes you to our contact page to send a request;
                it does not delete your account immediately.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-gray-900 mb-2">2. Verifying and processing your request</h2>
              <p>
                We may need to verify that you own the account before acting on your request. Please do not send your
                password, one-time codes, or card details. We aim to respond to legitimate requests within 30 days,
                as described in our <Link to="/privacy-policy" className="text-amber-600 hover:underline">Privacy Policy</Link>.
                A request is not complete until it has been processed and confirmed by our support team.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-gray-900 mb-2">3. What account deletion means</h2>
              <p className="mb-2">
                Once deletion is completed, you may lose access to your profile, saved addresses, wishlist,
                and order history through that account. Please keep any order information you may need and contact
                support about outstanding orders, returns, refunds, or disputes before requesting deletion.
              </p>
              <p>
                Deletion may be permanent and cannot necessarily be reversed. Sending a request does not automatically
                cancel an order or resolve an outstanding payment, return, or refund.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-gray-900 mb-2">4. Data deletion and retention</h2>
              <p>
                Your request may cover account and profile information, saved addresses, and other personal data
                associated with your account. Some information may need to be retained where required or permitted
                by law, or for purposes such as accounting, fraud prevention, resolving disputes, and fulfilling
                existing obligations. Retention depends on the type of information and applicable requirements;
                contact support for details about your request. Payment and delivery providers may also retain
                records under their own obligations and policies.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-gray-900 mb-2">5. Questions and other privacy rights</h2>
              <p>
                For questions about deletion or your personal data, email{' '}
                <a href={requestEmail} className="text-amber-600 hover:underline">support@bzead.com</a>.
                Our <Link to="/privacy-policy" className="text-amber-600 hover:underline">Privacy Policy</Link> provides
                more information about your privacy rights and how to contact us.
              </p>
            </section>

            <a href={requestEmail} className="inline-flex rounded-lg bg-amber-500 px-5 py-3 font-semibold text-white hover:bg-amber-600">
              Request account deletion
            </a>
          </div>
        </article>
      </main>

      <Footer />
    </div>
  );
}
