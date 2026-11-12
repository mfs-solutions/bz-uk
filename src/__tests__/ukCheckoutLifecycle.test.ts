import { describe, expect, it, vi } from 'vitest';
import {
  expireOpenUnpaidCheckout,
  getAbandonedCheckoutAction,
} from '../../supabase/functions/_shared/uk-checkout-lifecycle';

describe('UK abandoned Stripe checkout lifecycle', () => {
  it('expires an open unpaid Stripe session on the next checkout attempt', () => {
    expect(getAbandonedCheckoutAction({ id: 'cs_test_open', status: 'open', payment_status: 'unpaid' })).toBe('expire');
  });

  it('closes an expired unpaid session so a new quote can be created', () => {
    expect(getAbandonedCheckoutAction({ id: 'cs_test_expired', status: 'expired', payment_status: 'unpaid' })).toBe('close');
  });

  it('never retries a session Stripe reports as paid', () => {
    expect(getAbandonedCheckoutAction({ id: 'cs_test_paid', status: 'complete', payment_status: 'paid' })).toBe('paid');
  });

  it('expires the existing Stripe session before allowing a retry', async () => {
    const expire = vi.fn().mockResolvedValue({
      id: 'cs_test_abandoned', status: 'expired', payment_status: 'unpaid',
    });
    const retrieve = vi.fn();

    await expect(expireOpenUnpaidCheckout(
      { id: 'cs_test_abandoned', status: 'open', payment_status: 'unpaid' },
      { retrieve, expire },
    )).resolves.toMatchObject({ status: 'expired', payment_status: 'unpaid' });

    expect(expire).toHaveBeenCalledWith('cs_test_abandoned');
    expect(retrieve).not.toHaveBeenCalled();
  });

  it('does not expire a completed session during a payment attempt', async () => {
    const expire = vi.fn();
    const session = { id: 'cs_test_processing', status: 'complete', payment_status: 'unpaid' };

    await expect(expireOpenUnpaidCheckout(session, {
      retrieve: vi.fn(),
      expire,
    })).resolves.toBe(session);

    expect(expire).not.toHaveBeenCalled();
  });

  it('rechecks Stripe after an expiry race and propagates failure if it remains open', async () => {
    const expired = { id: 'cs_test_race', status: 'expired', payment_status: 'unpaid' };
    const retrieve = vi.fn().mockResolvedValue(expired);
    const expire = vi.fn().mockRejectedValue(new Error('Session is no longer open'));

    await expect(expireOpenUnpaidCheckout(
      { id: 'cs_test_race', status: 'open', payment_status: 'unpaid' },
      { retrieve, expire },
    )).resolves.toBe(expired);
    expect(retrieve).toHaveBeenCalledWith('cs_test_race');

    const expireError = new Error('Stripe unavailable');
    await expect(expireOpenUnpaidCheckout(
      { id: 'cs_test_open', status: 'open', payment_status: 'unpaid' },
      {
        retrieve: vi.fn().mockResolvedValue({ id: 'cs_test_open', status: 'open', payment_status: 'unpaid' }),
        expire: vi.fn().mockRejectedValue(expireError),
      },
    )).rejects.toBe(expireError);
  });

  it.each(['requires_payment_method', 'canceled'])(
    'closes a completed session when Stripe confirms its payment intent is %s',
    (paymentIntentStatus) => {
      expect(getAbandonedCheckoutAction(
        { id: 'cs_test_failed', status: 'complete', payment_status: 'unpaid' },
        paymentIntentStatus,
      )).toBe('close');
    },
  );

  it.each(['processing', 'requires_action', 'requires_confirmation', undefined])(
    'blocks a new payment while a completed session may still finish (%s)',
    (paymentIntentStatus) => {
      expect(getAbandonedCheckoutAction(
        { id: 'cs_test_processing', status: 'complete', payment_status: 'unpaid' },
        paymentIntentStatus,
      )).toBe('processing');
    },
  );
});
