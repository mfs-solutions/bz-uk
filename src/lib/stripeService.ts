/**
 * Stripe client-side service
 *
 * Calls the authenticated Supabase Edge Function to initialize Stripe.
 */

import { loadStripe, type Stripe } from '@stripe/stripe-js';
import { supabase } from './supabase';
import { isNativePlatform } from '../mobile/nativePlatform';

// Singleton Stripe instance
let stripePromise: Promise<Stripe | null> | null = null;

export function getStripe(): Promise<Stripe | null> {
  if (!stripePromise) {
    const key = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
    if (!key) {
      console.error('VITE_STRIPE_PUBLISHABLE_KEY is not set');
      return Promise.resolve(null);
    }
    stripePromise = loadStripe(key);
  }
  return stripePromise;
}

interface CreatePaymentIntentParams {
  /** Amount in the smallest currency unit (e.g. cents for USD, paise for INR) */
  amount: number;
  /** ISO 4217 currency code, lowercase (e.g. 'usd', 'inr') */
  currency: string;
  /** Optional metadata to attach to the PaymentIntent */
  metadata?: Record<string, string>;
}

interface PaymentIntentResult {
  clientSecret: string;
  paymentIntentId: string;
  customerSessionClientSecret: string;
}

function parsePaymentIntentResult(data: unknown): PaymentIntentResult {
  if (
    typeof data !== 'object' || data === null
    || !('clientSecret' in data) || typeof data.clientSecret !== 'string' || !data.clientSecret
    || !('paymentIntentId' in data) || typeof data.paymentIntentId !== 'string' || !data.paymentIntentId
    || !('customerSessionClientSecret' in data)
    || typeof data.customerSessionClientSecret !== 'string' || !data.customerSessionClientSecret
  ) {
    throw new Error('Payment initialization did not provide a saved-card session. Please try again.');
  }
  return {
    clientSecret: data.clientSecret,
    paymentIntentId: data.paymentIntentId,
    customerSessionClientSecret: data.customerSessionClientSecret,
  };
}

const extractFunctionErrorMessage = async (error: any): Promise<string> => {
  if (!error) return 'Failed to create payment intent';

  const context = error?.context;
  if (context instanceof Response) {
    try {
      const payload = await context.clone().json();
      if (typeof payload?.error === 'string' && payload.error.trim()) {
        return payload.error;
      }
      if (typeof payload?.message === 'string' && payload.message.trim()) {
        return payload.message;
      }
    } catch {
      try {
        const text = await context.clone().text();
        if (text.trim()) return text;
      } catch {
        /* ignore */
      }
    }

    return `Payment function failed with HTTP ${context.status}`;
  }

  if (typeof context === 'string' && context.trim()) return context;
  if (typeof error.message === 'string' && error.message.trim()) return error.message;
  return 'Failed to create payment intent';
};

/**
 * Create a Stripe PaymentIntent.
 *
 * Uses the same authenticated Edge Function in development and production.
 */
export async function createPaymentIntent(
  params: CreatePaymentIntentParams
): Promise<PaymentIntentResult> {
  // Tag the request so the edge function can disable redirect-based payment methods
  // when called from inside the Capacitor WebView (where Stripe's off-site redirect
  // would land on https://localhost and never return to the app).
  const requestBody = {
    ...params,
    client: isNativePlatform ? 'native' : 'web',
  };

  // Refresh for WebViews; retain a still-valid session if refreshing fails.
  const { data: { session }, error: refreshError } = await supabase.auth.refreshSession();
  let token = session?.access_token;
  if (refreshError || !token) {
    const { data: { session: fallbackSession } } = await supabase.auth.getSession();
    token = fallbackSession?.access_token;
  }
  if (!token) throw new Error('Authentication expired. Please log in again.');

  const { data, error } = await supabase.functions.invoke('create-payment-intent', {
    body: requestBody,
    headers: { Authorization: `Bearer ${token}` },
  });
  if (error) {
    const detailedMessage = await extractFunctionErrorMessage(error);
    throw new Error(detailedMessage || 'Failed to create payment intent');
  }
  return parsePaymentIntentResult(data);
}

/**
 * Convert a display-level amount to Stripe's smallest currency unit.
 * e.g. $10.50 USD → 1050 cents, ¥1000 JPY → 1000 (JPY has no decimals)
 */
const ZERO_DECIMAL_CURRENCIES = new Set([
  'bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga',
  'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf',
]);

export function toStripeAmount(displayAmount: number, currency: string): number {
  const lc = currency.toLowerCase();
  if (ZERO_DECIMAL_CURRENCIES.has(lc)) {
    return Math.round(displayAmount);
  }
  return Math.round(displayAmount * 100);
}

/**
 * Convert Stripe's smallest-unit amount back to a display amount.
 */
export function fromStripeAmount(stripeAmount: number, currency: string): number {
  const lc = currency.toLowerCase();
  if (ZERO_DECIMAL_CURRENCIES.has(lc)) {
    return stripeAmount;
  }
  return stripeAmount / 100;
}
