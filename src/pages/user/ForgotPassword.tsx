import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Loader2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { validateEmail } from '../../utils/validation';
import { AuthCardHeader } from '../../components/auth/AuthCardHeader';
import { Header } from '../../components/layout/Header';
import { MobileNav } from '../../components/layout/MobileNav';
import { isNativePlatform } from '../../mobile/nativePlatform';
import { BuyerAuthLayout } from '../../components/auth/BuyerAuthLayout';

const ForgotPassword: React.FC = () => {
  const navigate = useNavigate();
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      setError('Please enter your email address');
      return;
    }

    const emailError = validateEmail(normalizedEmail);
    if (emailError) {
      setError(emailError);
      return;
    }

    setIsLoading(true);

    try {
      const result = await resetPassword(normalizedEmail, '/new-password');
      if (result.success) {
        sessionStorage.setItem('passwordResetEmail', normalizedEmail);
        sessionStorage.setItem('otpContext', JSON.stringify({ email: normalizedEmail, purpose: 'password-reset', role: 'user' }));
        setIsLoading(false);
        // Navigate to OTP verification page
        navigate('/otp-verification', {
          state: {
            email: normalizedEmail,
            purpose: 'password-reset',
            role: 'user',
            notice: 'Reset OTP sent. Please check inbox, spam, and promotions tabs.'
          }
        });
      } else {
        setError(result.error?.message || 'Failed to send reset code');
        setIsLoading(false);
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
      setIsLoading(false);
    }
  };

  return (
    <>
      {isNativePlatform && <Header />}
      <MobileNav />
      <BuyerAuthLayout pageTitle="Reset password">
      <div className="auth-card">
        <Link
          to="/"
          className="auth-top-link"
        >
          Back to Home
        </Link>

        <AuthCardHeader
          title="Reset Password"
          subtitle="Enter your email to receive reset code"
        />

        <form onSubmit={handleEmailSubmit} className="space-y-6">
          {error && (
            <div className="text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium text-gray-700">
              Email
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="auth-input"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="auth-submit-btn-primary"
          >
            {isLoading ? <Loader2 className="inline animate-spin mr-2" size={18} /> : ''}
            Send Reset Code
          </button>

          <div className="text-center text-sm">
            <Link to="/login" className="text-gray-600 hover:text-black font-semibold">
              Back to Login
            </Link>
          </div>
          <p className="text-xs text-gray-500 text-center">
            We only send transactional emails. Check spam if the message is delayed.
          </p>
        </form>
      </div>
    </BuyerAuthLayout>
    </>
  );
};

export default ForgotPassword;
