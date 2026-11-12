import React from 'react';
import { Link } from 'react-router-dom';
import { isNativePlatform } from '../../mobile/nativePlatform';

const BUYER_AUTH_HEADER_LOGO_SRC = '/images/logo/logo.png';

interface BuyerAuthLayoutProps {
  pageTitle: string;
  children: React.ReactNode;
}

export const BuyerAuthLayout: React.FC<BuyerAuthLayoutProps> = ({ pageTitle, children }) => (
  <div
    className="buyer-auth-page"
    style={isNativePlatform ? {
      height: 'calc(100dvh - var(--bz-header-offset, 4rem))',
      display: 'flex',
      flexDirection: 'column',
      overflowY: 'auto',
      minHeight: '0',
    } : undefined}
  >
    <header className="buyer-auth-nav">
      <Link to="/" aria-label="BZEAD home">
        <img src={BUYER_AUTH_HEADER_LOGO_SRC} alt="BZEAD" />
      </Link>
    </header>
    <main
      className="buyer-auth-main"
      style={isNativePlatform ? {
        flex: '1',
        display: 'flex',
        flexDirection: 'column',
        minHeight: '0',
      } : undefined}
    >
      <section className="buyer-auth-intro" aria-hidden="true">
        <div className="buyer-auth-intro-content">
          <h1>Welcome to <strong>BZEAD.</strong><br />The Largest International<br />Marketplace</h1>
          <p>A premium global marketplace platform supporting global commerce for buyers and sellers worldwide</p>
        </div>
        <div className="buyer-auth-illustration">
          <span className="buyer-auth-box buyer-auth-box--left" />
          <span className="buyer-auth-box buyer-auth-box--center" />
          <span className="buyer-auth-box buyer-auth-box--right" />
          <span className="buyer-auth-phone"><i /></span>
        </div>
      </section>
      <section
        className="buyer-auth-form-side"
        style={isNativePlatform ? {
          flex: '1',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px 16px 3.75rem',
          minHeight: '0',
        } : undefined}
      >
        <div className="buyer-auth-page-title">{pageTitle}</div>
        {children}
      </section>
    </main>
  </div>
);
