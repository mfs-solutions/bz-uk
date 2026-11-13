import { describe, expect, it } from 'vitest';
import {
  calculateUkHostedCheckoutTotal,
  canReusePendingUkHostedCheckout,
  fingerprintUkHostedCheckoutRequest,
  ukCheckoutAmountsMatch,
} from '../lib/ukHostedCheckoutPricing';

describe('UK hosted checkout pricing', () => {
  it('applies the existing offer discount after the shared order RPC total', () => {
    expect(calculateUkHostedCheckoutTotal(108.15, 10)).toBe(98.15);
  });

  it('rejects invalid quote amounts', () => {
    expect(() => calculateUkHostedCheckoutTotal(10, 10)).toThrow('UK checkout totals are invalid');
    expect(() => calculateUkHostedCheckoutTotal(Number.NaN, 0)).toThrow('UK checkout totals are invalid');
  });

  it('compares server quotes with displayed GBP totals at minor-unit precision', () => {
    expect(ukCheckoutAmountsMatch(19.99, 19.9900000001)).toBe(true);
    expect(ukCheckoutAmountsMatch(19.99, 20)).toBe(false);
    expect(ukCheckoutAmountsMatch(Number.NaN, 20)).toBe(false);
  });

  it('fingerprints the same checkout intent consistently regardless of object key order', async () => {
    await expect(fingerprintUkHostedCheckoutRequest({ cart: ['a'], address: { city: 'London', street: '1 High St' } }))
      .resolves.toBe(await fingerprintUkHostedCheckoutRequest({ address: { street: '1 High St', city: 'London' }, cart: ['a'] }));
  });

  it('reuses an unfinished quote only for the same request and unchanged cart', () => {
    const requestFingerprint = 'a'.repeat(64);
    const cartSnapshot = [
      { id: 'item-1', quantity: 2, updated_at: '2026-11-13T19:00:00.000Z' },
      { id: 'item-2', quantity: 1, updated_at: '2026-11-13T19:00:00.000Z' },
    ];

    expect(canReusePendingUkHostedCheckout(
      requestFingerprint,
      requestFingerprint,
      cartSnapshot,
      [...cartSnapshot].reverse(),
    )).toBe(true);
    expect(canReusePendingUkHostedCheckout('b'.repeat(64), requestFingerprint, cartSnapshot, cartSnapshot)).toBe(false);
    expect(canReusePendingUkHostedCheckout(
      requestFingerprint,
      requestFingerprint,
      cartSnapshot,
      [{ ...cartSnapshot[0], quantity: 3 }, cartSnapshot[1]],
    )).toBe(false);
  });
});
