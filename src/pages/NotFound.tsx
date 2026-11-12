import { Link } from 'react-router-dom';
import { Header } from '../components/layout/Header';
import { MobileNav } from '../components/layout/MobileNav';
import { isNativePlatform } from '../mobile/nativePlatform';

const NotFound = () => (
  <>
    {isNativePlatform && <Header />}
    <MobileNav />
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
    <div className="text-center max-w-md">
      <h1 className="text-8xl font-bold text-amber-500 mb-4">404</h1>
      <h2 className="text-2xl font-semibold text-gray-800 mb-2">Page Not Found</h2>
      <p className="text-gray-500 mb-8">
        The page you're looking for doesn't exist or has been moved.
      </p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Link
          to="/"
          className="btn-primary inline-flex items-center justify-center"
        >
          Go Home
        </Link>
        <button
          onClick={() => window.history.back()}
          className="btn-secondary inline-flex items-center justify-center"
        >
          Go Back
        </button>
      </div>
    </div>
  </div>
  </>
);

export default NotFound;
