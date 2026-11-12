import { describe, expect, it, vi } from 'vitest';
import { getOrCreateStripeCustomer, mobileSavedCardSessionParams, savedCardSessionParams, type CustomerStore } from '../../supabase/functions/create-payment-intent/customer';

describe('saved Stripe payment methods', () => {
  it('uses the mobile payment element for native card saving and redisplay', () => {
    expect(mobileSavedCardSessionParams('cus_123')).toEqual({
      customer: 'cus_123',
      components: {
        mobile_payment_element: {
          enabled: true,
          features: {
            payment_method_save: 'enabled',
            payment_method_redisplay: 'enabled',
            payment_method_remove: 'enabled',
          },
        },
      },
    });
  });
  it('enables opt-in saving, reuse, and removal for on-session purchases', () => {
    expect(savedCardSessionParams('cus_123')).toEqual({
      customer: 'cus_123',
      components: {
        payment_element: {
          enabled: true,
          features: {
            payment_method_save: 'enabled',
            payment_method_save_usage: 'on_session',
            payment_method_redisplay: 'enabled',
            payment_method_remove: 'enabled',
          },
        },
      },
    });
  });

  it('reuses the authenticated user’s existing customer for the same account and mode', async () => {
    const store: CustomerStore = { find: vi.fn().mockResolvedValue('cus_existing'), insertIfAbsent: vi.fn() };
    const create = vi.fn();
    await expect(getOrCreateStripeCustomer(store, create, 'user_a', 'acct_1', true)).resolves.toBe('cus_existing');
    expect(store.find).toHaveBeenCalledWith('user_a', 'acct_1', true);
    expect(create).not.toHaveBeenCalled();
  });

  it('creates a customer idempotently and returns the canonical stored mapping', async () => {
    const store: CustomerStore = {
      find: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce('cus_winner'),
      insertIfAbsent: vi.fn().mockResolvedValue(undefined),
    };
    const create = vi.fn().mockResolvedValue('cus_new');
    await expect(getOrCreateStripeCustomer(store, create, 'user_a', 'acct_1', false)).resolves.toBe('cus_winner');
    expect(create).toHaveBeenCalledWith('bzead-customer-acct_1-test-user_a');
    expect(store.insertIfAbsent).toHaveBeenCalledWith('user_a', 'acct_1', false, 'cus_new');
  });

  it('fails closed if the customer mapping cannot be persisted', async () => {
    const store: CustomerStore = {
      find: vi.fn().mockResolvedValue(null),
      insertIfAbsent: vi.fn().mockResolvedValue(undefined),
    };
    await expect(getOrCreateStripeCustomer(store, async () => 'cus_new', 'user_a', 'acct_1', false))
      .rejects.toThrow('mapping could not be saved');
  });

  it('propagates a database error instead of creating a payment without a saved-card session', async () => {
    const store: CustomerStore = {
      find: vi.fn().mockRejectedValue(new Error('database unavailable')),
      insertIfAbsent: vi.fn(),
    };
    const create = vi.fn();
    await expect(getOrCreateStripeCustomer(store, create, 'user_a', 'acct_1', true))
      .rejects.toThrow('database unavailable');
    expect(create).not.toHaveBeenCalled();
  });
});
