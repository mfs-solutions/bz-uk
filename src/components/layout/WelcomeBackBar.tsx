import { Link } from 'react-router-dom';
import { isNativePlatform } from '../../mobile/nativePlatform';

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase();
  }
  return (parts[0] || 'U').slice(0, 2).toUpperCase();
}

interface WelcomeBackBarProps {
  isLoggedIn: boolean;
  displayName?: string;
}

export function WelcomeBackBar({ isLoggedIn, displayName }: WelcomeBackBarProps) {
  if (isNativePlatform) return null;

  const name = (displayName || 'User').trim();
  const initials = getInitials(name);

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-2">
      <div className="max-w-7xl mx-auto">
        {!isLoggedIn ? (
          <div className="flex items-center gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 sm:px-5">
            <div
              className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-sky-500 text-sm font-bold text-white"
              aria-hidden
            >
              BZ
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-gray-700">
                Welcome to <span className="font-bold text-gray-900">BZEAD</span>
              </p>
              <p className="mt-0.5 text-xs text-gray-500">Sign in for deals, orders &amp; more.</p>
            </div>
            <div className="flex flex-shrink-0 gap-2">
              <Link
                to="/login"
                className="rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-600"
              >
                Login
              </Link>
              <Link
                to="/signup"
                className="rounded-lg border border-sky-300 bg-white px-3 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-100"
              >
                Sign Up
              </Link>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 sm:px-5">
            <div
              className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-sky-500 text-sm font-bold text-white"
              aria-hidden
            >
              {initials}
            </div>
            <p className="min-w-0 text-sm text-gray-700">
              Welcome back,{' '}
              <span className="font-bold uppercase text-gray-900">{name}</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
