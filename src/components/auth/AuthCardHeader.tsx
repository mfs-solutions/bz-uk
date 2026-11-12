import React from 'react';
import { AuthBrandMark } from './AuthBrandMark';

interface AuthCardHeaderProps {
  title: string;
  subtitle?: React.ReactNode;
}

export const AuthCardHeader: React.FC<AuthCardHeaderProps> = ({ title, subtitle }) => (
  <div className="auth-card-header">
    <AuthBrandMark />
    <h1 className="auth-title">{title}</h1>
    {subtitle != null && subtitle !== '' && (
      <p className="auth-subtitle">{subtitle}</p>
    )}
  </div>
);
