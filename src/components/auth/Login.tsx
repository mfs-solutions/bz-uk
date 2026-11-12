import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Mail, Lock, AlertCircle, CheckCircle, X, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import { validateEmail } from '../../utils/validation';
import { isNativePlatform } from '../../mobile/nativePlatform';
import { Header } from '../layout/Header';
import { MobileNav } from '../layout/MobileNav';
import { AuthCardHeader } from './AuthCardHeader';
import { BuyerAuthLayout } from './BuyerAuthLayout';
interface LoginProps {
  role?: 'user';
}

export const Login: React.FC<LoginProps> = ({ role = 'user' }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [wrongRolePopup, setWrongRolePopup] = useState<'seller' | 'admin' | null>(null);
  const { signIn, signOut, authRole } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Redirect already-logged-in users away from login page
  useEffect(() => {
    if (authRole) navigate('/', { replace: true });
  }, [authRole, navigate]);

  // Check for success message from password reset
  useEffect(() => {
    if (location.state?.message) {
      setSuccessMessage(location.state.message);
      // Clear the state so message doesn't persist on refresh
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const emailError = validateEmail(email);
    if (emailError) {
      setError(emailError);
      setLoading(false);
      return;
    }

    const result = await signIn(email.trim().toLowerCase(), password);

    if (!result.success || result.error) {
      // Better error messages
      const errorMessage = result.error?.message || '';
      if (errorMessage.includes('Incorrect username or password')) {
        setError('Invalid email or password. Please try again.');
      } else if (errorMessage.includes('User does not exist')) {
        setError('No account found with this email. Please sign up first.');
      } else if (errorMessage.includes('NotAuthorizedException')) {
        setError('Incorrect email or password.');
      } else if (errorMessage.toLowerCase().includes('failed to fetch') || errorMessage.toLowerCase().includes('networkerror') || errorMessage.toLowerCase().includes('timed out')) {
        setError('Network error — please check your internet connection and try again.');
      } else {
        setError(errorMessage || 'Failed to sign in');
      }
      setLoading(false);
      return;
    }

    // Redirect based on the actual user role from the result
    const userRole = result.role || role;
    
    // BLOCK: Sellers and admins cannot login through user login page
    if (userRole === 'seller' || userRole === 'admin') {
      setWrongRolePopup(userRole as 'seller' | 'admin');
      await signOut();
      setLoading(false);
      return;
    }

    const from = typeof location.state?.from === 'string' ? location.state.from : null;
    const safeFrom = from && from.startsWith('/') ? from : null;
    navigate(safeFrom || '/'); // Users go to intended page or homepage
    setLoading(false);
  };

  const getSignupLink = () => {
    return '/signup';
  };

  return (
    <>
      {isNativePlatform && <Header />}
      <BuyerAuthLayout pageTitle="Log in">
      {/* ── Wrong-role popup modal ── */}
      {wrongRolePopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-gray-200">
            <button
              onClick={() => setWrongRolePopup(null)}
              className="absolute top-3 right-3 p-1 rounded-full hover:bg-gray-100"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
            <div className="flex justify-center mb-4">
              <div className="w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center">
                <AlertCircle className="w-7 h-7 text-amber-600" />
              </div>
            </div>
            <h2 className="text-lg font-bold text-gray-900 text-center mb-3">Account Type Mismatch</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              The email address you entered is linked to a <span className="font-semibold">{wrongRolePopup === 'seller' ? 'Seller' : 'Admin'}</span> account.
              Buyer access is restricted to accounts registered as buyers.
            </p>
            <p className="text-sm text-gray-600 mt-3 leading-relaxed">
              This storefront supports buyer accounts only. Use the appropriate portal for this account.
            </p>
            <p className="text-sm text-gray-500 mt-3 leading-relaxed">
              If you intend to shop on our platform, you will need to register for a Buyer account.
            </p>
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {wrongRolePopup === 'seller' && (
                <a
                  href="https://www.bzead.com/seller"
                  className="w-full rounded-lg bg-blue-600 text-white py-2.5 text-sm font-semibold text-center hover:bg-blue-700 transition-colors"
                >
                  Open Seller Portal
                </a>
              )}
              <button
                onClick={() => setWrongRolePopup(null)}
                className="w-full rounded-lg border border-gray-300 text-gray-700 py-2.5 text-sm font-semibold hover:bg-gray-50 transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="auth-card auth-card--buyer">
        <Link
          to="/"
          className="auth-top-link"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Home
        </Link>
        <AuthCardHeader
          title="Welcome back"
          subtitle="Sign in to continue shopping on Bzead."
        />
        <form className="space-y-4" onSubmit={handleSubmit}>
          {successMessage && (
            <div className="auth-alert auth-alert--success">
              <CheckCircle className="h-4 w-4 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}
          {error && (
            <div className="auth-alert auth-alert--error">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <div className="space-y-2">
            <label htmlFor="email" className="auth-label">
              Email address
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="auth-input"
                placeholder="you@example.com"
              />
            </div>
          </div>
          <div className="space-y-2">
            <label htmlFor="password" className="auth-label">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="auth-input auth-input--toggle"
                placeholder="Enter your password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-800 transition-colors"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <div className="flex justify-end">
              <Link
                to="/forgot-password"
                className="text-xs font-semibold text-slate-500 hover:text-blue-700 transition-colors"
              >
                Forgot password?
              </Link>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="auth-submit-btn-primary"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>

          {getSignupLink() && (
            <div className="text-center text-xs text-slate-600">
              New here?{' '}
              <Link to={getSignupLink()!} className="auth-footer-link">
                Create your account
              </Link>
            </div>
          )}
        </form>
      </div>
    </BuyerAuthLayout>
      {isNativePlatform && <MobileNav />}
    </>
  );
};
