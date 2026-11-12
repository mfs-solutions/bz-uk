import React, { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { Loader2, ChevronLeft, RotateCcw } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { buildAppRedirect } from '../utils/authEnv';
import { AuthToast } from '../components/common/AuthToast';
import { AuthBrandMark } from '../components/auth/AuthBrandMark';
import { AuthCardHeader } from '../components/auth/AuthCardHeader';
import { Header } from '../components/layout/Header';
import { MobileNav } from '../components/layout/MobileNav';
import { isNativePlatform } from '../mobile/nativePlatform';

const OTPVerification: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { confirmSignUp } = useAuth();
  const [otp, setOtp] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendTimer, setResendTimer] = useState(30);
  const [canResend, setCanResend] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const isBrowser = typeof window !== 'undefined';
  const locationState = (location.state as { email?: string; purpose?: string; role?: string; notice?: string }) || {};

  const storedOtpContext = useMemo(() => {
    if (!isBrowser) return null;
    try {
      const raw = sessionStorage.getItem('otpContext');
      return raw ? JSON.parse(raw) as { email?: string; purpose?: string; role?: string } : null;
    } catch {
      return null;
    }
  }, [isBrowser]);

  const fallbackEmail = useMemo(() => {
    if (!isBrowser) return undefined;
    const isSellerPath = location.pathname.includes('/seller');
    const signupEmail = sessionStorage.getItem(isSellerPath ? 'sellerSignupEmail' : 'signupEmail') || undefined;
    const resetEmail = sessionStorage.getItem(isSellerPath ? 'sellerPasswordResetEmail' : 'passwordResetEmail') || undefined;
    return signupEmail || resetEmail;
  }, [isBrowser, location.pathname]);

  const purpose = locationState.purpose || storedOtpContext?.purpose || (location.pathname.includes('/seller') ? 'seller-signup' : undefined);
  const email = locationState.email || storedOtpContext?.email || fallbackEmail;
  const role = locationState.role || storedOtpContext?.role || (purpose?.includes('seller') ? 'seller' : 'user');
  const shellClass = location.pathname.includes('/seller') ? 'seller-auth-shell' : 'auth-page-shell';
  // On native (Capacitor) for the seller flow, hide the in-card "Back" /
  // "Back to Home" chrome — MobileNav + slim Header already give the user
  // navigation. Web stays byte-identical.
  const isSellerPathForChrome = isNativePlatform && location.pathname.includes('/seller');

  useEffect(() => {
    if (locationState.notice) {
      setToast({ type: 'success', message: locationState.notice });
      const timer = setTimeout(() => setToast(null), 3500);
      return () => clearTimeout(timer);
    }
  }, [locationState.notice]);

  // Persist context for refresh/back-nav resilience
  useEffect(() => {
    if (!isBrowser) return;
    if (email && purpose) {
      sessionStorage.setItem('otpContext', JSON.stringify({ email, purpose, role }));
    }
  }, [email, isBrowser, purpose, role]);

  // Guard: missing context — send user back to a safe auth entry point
  useEffect(() => {
    if (!email || !purpose) {
      const redirectPath = location.pathname.includes('/seller') ? '/seller/login' : '/login';
      navigate(redirectPath, {
        state: { message: 'Session expired. Please start again.' },
        replace: true,
      });
    }
  }, [email, navigate, purpose, location.pathname]);

  // Timer for resend OTP
  useEffect(() => {
    if (resendTimer > 0) {
      const timer = setTimeout(() => setResendTimer((prev) => prev - 1), 1000);
      return () => clearTimeout(timer);
    }
    if (resendTimer === 0) {
      setCanResend(true);
    }
  }, [resendTimer]);

  const handleOtpChange = (value: string) => {
    const digitsOnly = value.replace(/\D/g, '').slice(0, 6);
    setOtp(digitsOnly);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email || !purpose) {
      setError('Session expired. Please restart verification.');
      return;
    }

    const otpCode = otp.trim();
    if (!/^\d{6}$/.test(otpCode)) {
      setError('Please enter a 6-digit OTP code');
      return;
    }

    setIsLoading(true);

    try {
      // Handle different purposes
      if (purpose === 'signup' || purpose === 'seller-signup') {
        // Confirm signup with the OTP code
        const result = await confirmSignUp(email, otpCode);
        
        if (result.success) {
          // Now user has a session — apply pending profile fields from signup
          const pendingCountryId = sessionStorage.getItem('signupCountryId');
          const pendingBusinessTypeId = sessionStorage.getItem('signupBusinessTypeId');
          const pendingFullName = sessionStorage.getItem('signupFullName');
          const pendingPhone = sessionStorage.getItem('signupPhone');

          if (pendingCountryId || pendingBusinessTypeId || pendingFullName || pendingPhone) {
            const { data: { user: currentUser } } = await supabase.auth.getUser();
            if (currentUser) {
              const updates: Record<string, string> = {};
              if (pendingCountryId) updates.country_id = pendingCountryId;
              if (pendingBusinessTypeId && (purpose === 'seller-signup' || role === 'seller')) {
                updates.business_type_id = pendingBusinessTypeId;
              }
              if (pendingFullName) updates.full_name = pendingFullName;
              if (pendingPhone && (purpose === 'seller-signup' || role === 'seller')) {
                updates.phone = pendingPhone;
              }

              if (Object.keys(updates).length > 0) {
                const { error: upsertError } = await supabase
                  .from('profiles')
                  .upsert(
                    {
                      id: currentUser.id,
                      email: currentUser.email || email || '',
                      ...updates,
                    },
                    { onConflict: 'id' }
                  )
                  .select('id, country_id')
                  .single();

                if (upsertError) {
                  console.error('[OTP] Failed to save profile fields after signup:', upsertError.message);
                  // If upsert failed, try a plain UPDATE as fallback (row already exists from trigger)
                  await supabase
                    .from('profiles')
                    .update(updates)
                    .eq('id', currentUser.id);
                }

                await supabase.auth.updateUser({
                  data: {
                    ...(pendingCountryId ? { country_id: pendingCountryId } : {}),
                    ...(pendingBusinessTypeId && (purpose === 'seller-signup' || role === 'seller')
                      ? { business_type_id: pendingBusinessTypeId }
                      : {}),
                    ...(pendingFullName ? { full_name: pendingFullName } : {}),
                    ...(pendingPhone && (purpose === 'seller-signup' || role === 'seller')
                      ? { phone: pendingPhone }
                      : {}),
                  },
                });
              }
            }

            sessionStorage.removeItem('signupCountryId');
            sessionStorage.removeItem('signupBusinessTypeId');
            sessionStorage.removeItem('signupFullName');
            sessionStorage.removeItem('signupPhone');
          }

          setShowSuccess(true);

          // Cleanup OTP context now that verification succeeded
          if (isBrowser) {
            sessionStorage.removeItem('otpContext');
          }
          
          setTimeout(() => {
            if (purpose === 'seller-signup' || role === 'seller') {
              // Seller signup - redirect to seller dashboard
              navigate('/seller/dashboard', { state: { loginSuccess: true } });
            } else {
              // User signup - redirect to home
              navigate('/', { state: { loginSuccess: true } });
            }
          }, 2000);
        } else if (result.alreadyConfirmed) {
          // User is already confirmed and signed in
          setError('This account is already verified. Redirecting to login...');
          setTimeout(() => {
            if (purpose === 'seller-signup' || role === 'seller') {
              navigate('/seller/login');
            } else {
              navigate('/login');
            }
          }, 2000);
        } else {
          setError(result.error?.message || 'Failed to verify OTP. Please try again.');
          setIsLoading(false);
        }
      } else if (purpose === 'password-reset' || purpose === 'seller-password-reset') {
        // Store OTP for password reset - navigate to new password page
        setShowSuccess(true);

        if (isBrowser) {
          sessionStorage.setItem('resetContext', JSON.stringify({ email, otpCode, role }));
          sessionStorage.removeItem('otpContext');
        }
        
        setTimeout(() => {
          const newPasswordPath = purpose === 'seller-password-reset' 
            ? '/seller/new-password' 
            : '/new-password';
            
          navigate(newPasswordPath, { 
            state: { 
              email, 
              otpCode,
              purpose: 'reset',
              role: purpose === 'seller-password-reset' ? 'seller' : 'user'
            }
          });
        }, 1500);
      } else {
        setError('Invalid verification purpose');
        setIsLoading(false);
      }
    } catch (err: any) {
      setError(err.message || 'Error verifying OTP');
      setIsLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (!canResend || isResending) return;
    if (!email || !purpose) {
      setError('Session expired. Please restart verification.');
      return;
    }
    setError('');
    setIsResending(true);
    setResendTimer(30);
    setCanResend(false);
    setOtp('');

    try {
      if (purpose === 'password-reset' || purpose === 'seller-password-reset') {
        // For recovery, Supabase recommends resetPasswordForEmail instead of resend
        const { error: resendError } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: buildAppRedirect(purpose === 'seller-password-reset' ? '/seller/new-password' : '/new-password'),
        });

        if (resendError) {
          throw new Error(resendError.message);
        }
      } else {
        const { error: resendError } = await supabase.auth.resend({
          email,
          type: 'signup',
        });

        if (resendError) {
          throw new Error(resendError.message);
        }
      }

      setToast({ type: 'success', message: 'OTP resent successfully. Please check inbox and spam.' });
    } catch (err: any) {
      setError(err.message || 'Failed to resend OTP');
      setToast({ type: 'error', message: err.message || 'Failed to resend OTP' });
    } finally {
      setIsResending(false);
    }
  };

  return (
    <>
      {isNativePlatform && <Header />}
      <MobileNav />
      <div className={shellClass}>
      {toast && <AuthToast type={toast.type} message={toast.message} />}
      {showSuccess ? (
        <div className="auth-card text-center">
          <AuthBrandMark />
          <div className="mb-4 flex justify-center">
            <div className="bg-green-100 p-4 rounded-full">
              <svg className="w-12 h-12 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
          </div>
          <h1 className="text-2xl md:text-3xl font-semibold mb-2">Email Verified!</h1>
          <p className="text-gray-600 text-sm mb-4">Your account has been successfully created.</p>
          <p className="text-gray-500 text-xs">Redirecting to homepage...</p>
          <div className="flex justify-center mt-4">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-black"></div>
          </div>
        </div>
      ) : (
        <div className="auth-card">
          {!isSellerPathForChrome && (
            <button onClick={() => navigate(-1)} className="auth-top-link" type="button">
              <ChevronLeft size={16} />
              Back
            </button>
          )}

          <AuthCardHeader
            title="Verify your email"
            subtitle={
              <>
                We&apos;ve sent a 6-digit code to{' '}
                <span className="font-semibold text-black">{email}</span>
                <span className="block text-xs text-gray-500 mt-2">
                  Check inbox, spam, and promotions tabs.
                </span>
              </>
            }
          />

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Error Message */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-600 text-sm">
                {error}
              </div>
            )}

            {/* OTP Input */}
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-3">
                Enter OTP Code
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={otp}
                onChange={(e) => handleOtpChange(e.target.value)}
                className="w-full h-12 md:h-14 text-center text-xl md:text-2xl tracking-[0.4em] font-semibold border border-gray-200 rounded-lg focus:outline-none focus:border-gray-700 focus:ring-2 focus:ring-black/10 transition bg-slate-50"
                placeholder="000000"
                autoComplete="one-time-code"
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading || otp.length !== 6}
              className="auth-submit-btn-blue flex items-center justify-center gap-2"
            >
              {isLoading && <Loader2 size={18} className="animate-spin" />}
              {isLoading ? 'Verifying...' : 'Verify OTP'}
            </button>

            {/* Resend OTP */}
            <div className="text-center">
              <p className="text-gray-600 text-sm">
                Didn't receive the code?{' '}
                {canResend ? (
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    disabled={isResending}
                    className="text-black font-semibold hover:underline flex items-center justify-center gap-1 mx-auto mt-1 disabled:opacity-60"
                  >
                    {isResending ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        Resending...
                      </>
                    ) : (
                      <>
                        <RotateCcw size={14} />
                        Resend OTP
                      </>
                    )}
                  </button>
                ) : (
                  <span className="text-gray-500">Resend in {resendTimer}s</span>
                )}
              </p>
            </div>

            {/* Help Text */}
            <p className="text-xs text-gray-500 text-center mt-4">
              The code will expire in 10 minutes
            </p>
          </form>

          {/* Footer Links */}
          {!isSellerPathForChrome && (
            <div className="text-center mt-6 pt-6 border-t border-gray-200">
              <Link to="/" className="text-xs text-gray-500 hover:text-black transition">
                Back to Home
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
    </>
  );
};

export default OTPVerification;
