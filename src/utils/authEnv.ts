import { isNativePlatform } from '../mobile/nativePlatform';
import { BASE_URL } from '../config/baseUrl';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email.trim());
}

/**
 * Returns the public-facing origin to use when building user-visible URLs
 * (share links, OAuth/email redirects, deep links, canonical URLs, etc.).
 *
 * On native (Capacitor) the WebView's `window.location.origin` is
 * `https://localhost` — an internal implementation detail that must never
 * be shown to users. We always return the configured `BASE_URL` instead.
 *
 * On web we honour the env override, then `window.location.origin`
 * (useful for previews/staging), then fall back to `BASE_URL`.
 */
export function getAppBaseUrl(): string {
  // Native: ALWAYS use the public domain. The WebView origin is internal.
  if (isNativePlatform) {
    return BASE_URL;
  }

  const envUrl = import.meta.env.VITE_PUBLIC_APP_URL?.trim() || import.meta.env.VITE_DOMAIN?.trim();
  if (envUrl) {
    try {
      return new URL(envUrl).origin;
    } catch {
      // fallback below
    }
  }

  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }

  return BASE_URL;
}

export function buildAppRedirect(path: string): string {
  const baseUrl = getAppBaseUrl().replace(/\/+$/, '');
  const safePath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${safePath}`;
}
