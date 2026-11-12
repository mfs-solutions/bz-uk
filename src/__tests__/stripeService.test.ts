import { beforeEach, describe, it, expect, vi } from 'vitest';
import { createPaymentIntent, toStripeAmount, fromStripeAmount } from '../lib/stripeService';

const mocks = vi.hoisted(() => ({
  refreshSession: vi.fn(),
  getSession: vi.fn(),
  invoke: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { refreshSession: mocks.refreshSession, getSession: mocks.getSession },
    functions: { invoke: mocks.invoke },
  },
}));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.refreshSession.mockResolvedValue({ data: { session: { access_token: 'token' } }, error: null });
  mocks.invoke.mockResolvedValue({
    data: { clientSecret: 'secret', paymentIntentId: 'pi_test', customerSessionClientSecret: 'session_secret' },
    error: null,
  });
});

describe('createPaymentIntent', () => {
  it('forwards GBP payment requests and returns the saved-card session', async () => {
    await expect(createPaymentIntent({ amount: 1000, currency: 'gbp' }))
      .resolves.toEqual({ clientSecret: 'secret', paymentIntentId: 'pi_test', customerSessionClientSecret: 'session_secret' });
    expect(mocks.invoke).toHaveBeenCalledWith('create-payment-intent', {
      body: { amount: 1000, currency: 'gbp', client: 'web' },
      headers: { Authorization: 'Bearer token' },
    });
  });

  it('rejects a response without a saved-card session', async () => {
    mocks.invoke.mockResolvedValue({ data: { clientSecret: 'secret', paymentIntentId: 'pi_test' }, error: null });
    await expect(createPaymentIntent({ amount: 1000, currency: 'gbp' }))
      .rejects.toThrow('did not provide a saved-card session');
  });

  it('uses the existing session if refresh fails, and reports expired authentication', async () => {
    mocks.refreshSession.mockResolvedValue({ data: { session: null }, error: new Error('refresh failed') });
    mocks.getSession.mockResolvedValueOnce({ data: { session: { access_token: 'fallback' } } })
      .mockResolvedValueOnce({ data: { session: null } });
    await createPaymentIntent({ amount: 1000, currency: 'gbp' });
    expect(mocks.invoke.mock.calls[0][1].headers.Authorization).toBe('Bearer fallback');
    await expect(createPaymentIntent({ amount: 1000, currency: 'gbp' }))
      .rejects.toThrow('Authentication expired');
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
  });

  it('surfaces payment initialization errors', async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: { message: 'Payment unavailable' } });
    await expect(createPaymentIntent({ amount: 1000, currency: 'gbp' })).rejects.toThrow('Payment unavailable');
  });
});

describe('toStripeAmount', () => {
  it('converts USD dollars to cents', () => {
    expect(toStripeAmount(10.50, 'USD')).toBe(1050);
  });

  it('converts INR to paise', () => {
    expect(toStripeAmount(499.99, 'INR')).toBe(49999);
  });

  it('handles zero-decimal currency (JPY)', () => {
    expect(toStripeAmount(1000, 'JPY')).toBe(1000);
  });

  it('handles zero-decimal currency (KRW)', () => {
    expect(toStripeAmount(5000, 'KRW')).toBe(5000);
  });

  it('rounds to nearest integer', () => {
    expect(toStripeAmount(10.555, 'USD')).toBe(1056);
  });

  it('handles zero amount', () => {
    expect(toStripeAmount(0, 'USD')).toBe(0);
  });

  it('is case-insensitive for currency', () => {
    expect(toStripeAmount(10, 'usd')).toBe(1000);
    expect(toStripeAmount(10, 'Usd')).toBe(1000);
  });
});

describe('fromStripeAmount', () => {
  it('converts cents back to USD', () => {
    expect(fromStripeAmount(1050, 'USD')).toBe(10.50);
  });

  it('converts paise back to INR', () => {
    expect(fromStripeAmount(49999, 'INR')).toBe(499.99);
  });

  it('handles zero-decimal currency (JPY)', () => {
    expect(fromStripeAmount(1000, 'JPY')).toBe(1000);
  });

  it('round-trips correctly', () => {
    const original = 99.99;
    const stripe = toStripeAmount(original, 'EUR');
    const back = fromStripeAmount(stripe, 'EUR');
    expect(back).toBe(original);
  });
});
