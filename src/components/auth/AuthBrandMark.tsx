import React from 'react';

/** Canonical logo for login, signup, OTP, password reset, and seller auth screens. */
export const AUTH_LOGO_SRC = '/images/logo/invoice-logo.png';

export const AuthBrandMark: React.FC = () => (
  <div className="auth-brand-mark">
    <img
      src={AUTH_LOGO_SRC}
      alt="BZEAD"
      className="auth-brand-logo"
    />
  </div>
);
