export type CheckoutPaymentProvider = 'stripe' | 'revolut';

const REVOLUT_HOSTNAMES = new Set([
  'bzead.uk',
  'www.bzead.uk',
]);

const STRIPE_PROVIDER: CheckoutPaymentProvider = 'stripe';
const REVOLUT_PROVIDER: CheckoutPaymentProvider = 'revolut';

const normalizeProviderOverride = (value: string): CheckoutPaymentProvider | null => {
  const token = value.trim().toLowerCase();
  if (token === STRIPE_PROVIDER) return STRIPE_PROVIDER;
  if (token === REVOLUT_PROVIDER) return REVOLUT_PROVIDER;
  return null;
};

export function resolveCheckoutPaymentProvider(hostnameInput?: string): CheckoutPaymentProvider {
  const hostname = (hostnameInput
    ?? (typeof window !== 'undefined' ? window.location.hostname : '')
  ).trim().toLowerCase();

  if (!hostname || !REVOLUT_HOSTNAMES.has(hostname)) {
    return STRIPE_PROVIDER;
  }

  const explicitOverride = normalizeProviderOverride(
    String(import.meta.env.VITE_PAYMENT_PROVIDER_BZEAD_UK || '')
  );
  return explicitOverride || STRIPE_PROVIDER;
}
