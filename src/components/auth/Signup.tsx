import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { Mail, Lock, User, AlertCircle, Eye, EyeOff, Globe, ChevronDown, ArrowLeft } from 'lucide-react';
import { validateEmail, validatePassword, validateFullName } from '../../utils/validation';
import { AuthToast } from '../common/AuthToast';
import { isNativePlatform } from '../../mobile/nativePlatform';
import { Header } from '../layout/Header';
import { MobileNav } from '../layout/MobileNav';
import { AuthCardHeader } from './AuthCardHeader';
import { BuyerAuthLayout } from './BuyerAuthLayout';

interface SignupProps {
  role?: 'user';
}

interface Country {
  id: string;
  countryName: string;
  shortCode: string;
  currency: string;
  dialCode?: string;
}

export const Signup: React.FC<SignupProps> = ({ role = 'user' }) => {
  const existingEmailMessage = 'A user account already exists with this email address. Please use another email address.';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [countryId, setCountryId] = useState('');
  const [countries, setCountries] = useState<Country[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [passwordErrors, setPasswordErrors] = useState<string[]>([]);
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const otpPurpose = 'signup';
  const otpPath = '/otp-verification';
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const goToOtp = (targetEmail: string, opts?: { fullName?: string; countryId?: string }) => {
    sessionStorage.setItem('signupEmail', targetEmail);
    if (opts?.countryId) {
      sessionStorage.setItem('signupCountryId', opts.countryId);
    }
    if (opts?.fullName) {
      sessionStorage.setItem('signupFullName', opts.fullName);
    }
    sessionStorage.setItem(
      'otpContext',
      JSON.stringify({ email: targetEmail, purpose: otpPurpose, role })
    );
    setLoading(false);
    navigate(otpPath, {
      state: {
        email: targetEmail,
        purpose: otpPurpose,
        role: role,
        notice: 'OTP sent successfully. Please check your inbox and spam folder.'
      }
    });
  };

  // Load countries from Supabase
  useEffect(() => {
    const loadCountries = async () => {
      try {
        const { data, error: fetchErr } = await supabase
          .from('countries')
          .select('id, country_name, short_code, currency_code, dialing_code')
          .eq('is_active', true)
          .order('country_name');

        if (fetchErr || !data || data.length === 0) {
          console.error('Failed to load countries:', fetchErr?.message);
          setCountries([]);
        } else {
          const mapped: Country[] = data.map((c: any) => ({
            id: c.id,
            countryName: c.country_name,
            shortCode: c.short_code,
            currency: c.currency_code,
            dialCode: c.dialing_code,
          }));
          setCountries(mapped);
        }
      } catch (err) {
        console.error('Error loading countries:', err);
        setCountries([]);
      }
    };
    loadCountries();
  }, []);

  const selectedCountry = countries.find((c) => c.id === countryId);

  const handlePasswordChange = (value: string) => {
    setPassword(value);
    if (value) {
      setPasswordErrors(validatePassword(value));
    } else {
      setPasswordErrors([]);
    }
  };

  const handleFullNameChange = (value: string) => {
    setFullName(value);
    setError('');
  };

  const handleDetailsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedFullName = fullName.trim();

    const emailError = validateEmail(normalizedEmail);
    if (emailError) {
      setError(emailError);
      return;
    }

    // Validate full name
    const nameError = validateFullName(normalizedFullName);
    if (nameError) {
      setError(nameError);
      return;
    }

    // Validate password
    const pwErrors = validatePassword(password);
    if (pwErrors.length > 0) {
      setPasswordErrors(pwErrors);
      return;
    }

    if (!countryId) {
      setError('Please select your country');
      return;
    }

    setLoading(true);

    try {
      const result = await signUp(
        normalizedEmail,
        password,
        role,
        normalizedFullName,
        selectedCountry?.currency,
        undefined,
        countryId || undefined,
      );

      if (result.success) {
        setToast({ type: 'success', message: 'Verification code sent. Check your inbox and spam folder.' });
        goToOtp(normalizedEmail, {
          fullName: normalizedFullName,
          countryId: countryId || undefined,
        });
      } else {
        const msg = result.error?.message || 'Failed to sign up';
        const lowered = msg.toLowerCase();
        const looksLikeExisting = lowered.includes('already exists') || lowered.includes('already registered') || lowered.includes('already been registered') || lowered.includes('duplicate key');
        setError(looksLikeExisting ? existingEmailMessage : msg);
        setLoading(false);
      }
    } catch (err: any) {
      const msg = err.message || '';
      const lowered = msg.toLowerCase();
      const looksLikeExisting = lowered.includes('already exists') || lowered.includes('already registered') || lowered.includes('already been registered') || lowered.includes('duplicate key');
      setError(looksLikeExisting ? existingEmailMessage : (msg || 'An error occurred during signup'));
      setLoading(false);
    }
  };

  const getLoginLink = () => {
    return '/login';
  };

  return (
    <>
      {isNativePlatform && <Header />}
      <BuyerAuthLayout pageTitle="Create account">
      {toast && <AuthToast type={toast.type} message={toast.message} />}
      <div className="auth-card auth-card--buyer">
        <Link
          to="/"
          className="auth-top-link"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Home
        </Link>
        <AuthCardHeader title="Create your account" />

        <form className="space-y-4" onSubmit={handleDetailsSubmit}>
            {error && (
              <div className="auth-alert auth-alert--error">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <div className="space-y-4">
              <div>
                <label htmlFor="country" className="auth-label block mb-2">
                  Country
                </label>
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-500" />
                  <select
                    id="country"
                    value={countryId}
                    onChange={(e) => setCountryId(e.target.value)}
                    className="auth-select"
                  >
                    <option value="">Select your country</option>
                    {countries.map((country) => (
                      <option key={country.id} value={country.id}>
                        {country.countryName}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-500 pointer-events-none" />
                </div>
                {selectedCountry && (
                  <p className="mt-1 text-xs text-gray-500">
                    Currency: <span className="text-black font-semibold">{selectedCountry.currency}</span>
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="fullName" className="auth-label block mb-2">
                  Full Name
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-500" />
                  <input
                    id="fullName"
                    name="fullName"
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => handleFullNameChange(e.target.value)}
                    className="auth-input"
                    placeholder="Enter your full name"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="email" className="auth-label block mb-2">
                  Email address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-500" />
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

              <div>
                <label htmlFor="password" className="auth-label block mb-2">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-500" />
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    value={password}
                    onChange={(e) => handlePasswordChange(e.target.value)}
                    className={`auth-input auth-input--toggle ${
                      passwordErrors.length > 0 ? '!border-red-300 focus:!border-red-500 focus:!ring-red-500/15' : ''
                    }`}
                    placeholder="Create a strong password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-black"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {passwordErrors.length === 0 && (
                  <p className="auth-field-hint">
                    Use 8+ characters with a mix of letters, numbers &amp; symbols.
                  </p>
                )}
                {passwordErrors.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {passwordErrors.map((err, idx) => (
                      <p key={idx} className="text-xs text-red-600 flex items-start gap-2">
                        <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                        {err}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={loading || passwordErrors.length > 0 || !fullName || !email || !password || !countryId}
                className="auth-submit-btn-primary disabled:opacity-50"
              >
                {loading ? 'Sending OTP...' : 'Create account'}
              </button>
            </div>

            <div className="text-center text-xs text-slate-600">
              Already have an account?{' '}
              <Link to={getLoginLink()} className="auth-footer-link">
                Sign in
              </Link>
            </div>
          </form>
      </div>
    </BuyerAuthLayout>
      {isNativePlatform && <MobileNav />}
    </>
  );
};
