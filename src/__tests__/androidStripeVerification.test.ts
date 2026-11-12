import { describe, expect, it } from 'vitest';
import { verifyPayment, type PaymentForVerification } from '../../supabase/functions/verify-android-stripe-payment/payment';

const payment: PaymentForVerification = {
  id: 'pi_test123',
  status: 'succeeded',
  currency: 'gbp',
  amount: 1250,
  amount_received: 1250,
  livemode: false,
  metadata: { user_id: 'buyer-1', source: 'bzeadstore' },
};

describe('Android Stripe payment verification', () => {
  it('accepts a fully received GBP payment belonging to the authenticated buyer', () => {
    expect(verifyPayment(payment, 'buyer-1', 'pi_test123', false, 1250)).toBe('succeeded');
  });

  it.each([
    { ...payment, id: 'pi_other' },
    { ...payment, metadata: { ...payment.metadata, user_id: 'another-buyer' } },
    { ...payment, metadata: { ...payment.metadata, source: 'other' } },
    { ...payment, currency: 'inr' },
    { ...payment, livemode: true },
    { ...payment, amount_received: 1249 },
    { ...payment, amount: 0 },
    { ...payment, amount: 12.5 },
  ])('rejects mismatched payment %#', (badPayment) => {
    expect(verifyPayment(badPayment, 'buyer-1', 'pi_test123', false, 1250)).toBe('mismatch');
  });

  it('distinguishes unfinished and failed payments', () => {
    expect(verifyPayment({ ...payment, status: 'processing', amount_received: 0 }, 'buyer-1', 'pi_test123', false, 1250)).toBe('pending');
    expect(verifyPayment({ ...payment, status: 'canceled', amount_received: 0 }, 'buyer-1', 'pi_test123', false, 1250)).toBe('failed');
    expect(verifyPayment({ ...payment, status: 'unknown' }, 'buyer-1', 'pi_test123', false, 1250)).toBe('mismatch');
  });

  it('rejects a payment amount that differs from the prepared checkout', () => {
    expect(verifyPayment(payment, 'buyer-1', 'pi_test123', false, 1200)).toBe('mismatch');
  });

  it('accepts a live payment only when the server is using live mode', () => {
    expect(verifyPayment({ ...payment, livemode: true }, 'buyer-1', 'pi_test123', true, 1250)).toBe('succeeded');
    expect(verifyPayment({ ...payment, livemode: true }, 'buyer-1', 'pi_test123', false, 1250)).toBe('mismatch');
  });

  it.each(['processing', 'requires_action', 'requires_confirmation', 'requires_capture'])(
    'does not confirm an unfinished %s payment',
    (status) => {
      expect(verifyPayment({ ...payment, status, amount_received: 0 }, 'buyer-1', 'pi_test123', false, 1250)).toBe('pending');
    },
  );
});
