import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveCheckoutPaymentProvider } from '../lib/paymentProvider';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('resolveCheckoutPaymentProvider', () => {
  it('keeps bzead.uk on stripe by default until explicitly enabled', () => {
    expect(resolveCheckoutPaymentProvider('bzead.uk')).toBe('stripe');
    expect(resolveCheckoutPaymentProvider('www.bzead.uk')).toBe('stripe');
  });

  it('keeps non-UK hostnames on stripe', () => {
    expect(resolveCheckoutPaymentProvider('bzead.com')).toBe('stripe');
    expect(resolveCheckoutPaymentProvider('localhost')).toBe('stripe');
  });

  it('supports explicit override to revolut on UK hostname', () => {
    vi.stubEnv('VITE_PAYMENT_PROVIDER_BZEAD_UK', 'revolut');
    expect(resolveCheckoutPaymentProvider('bzead.uk')).toBe('revolut');
  });
});
