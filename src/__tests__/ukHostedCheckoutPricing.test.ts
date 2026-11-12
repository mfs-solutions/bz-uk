import { describe, expect, it } from 'vitest';
import { calculateUkHostedCheckoutTotal } from '../lib/ukHostedCheckoutPricing';

describe('UK hosted checkout pricing', () => {
  it('applies the existing offer discount after the shared order RPC total', () => {
    expect(calculateUkHostedCheckoutTotal(108.15, 10)).toBe(98.15);
  });

  it('rejects invalid quote amounts', () => {
    expect(() => calculateUkHostedCheckoutTotal(10, 10)).toThrow('UK checkout totals are invalid');
    expect(() => calculateUkHostedCheckoutTotal(Number.NaN, 0)).toThrow('UK checkout totals are invalid');
  });
});
