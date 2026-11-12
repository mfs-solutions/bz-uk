export interface CustomerStore {
  find(userId: string, accountId: string, livemode: boolean): Promise<string | null>;
  insertIfAbsent(userId: string, accountId: string, livemode: boolean, customerId: string): Promise<void>;
}

export function savedCardSessionParams(customerId: string) {
  return {
    customer: customerId,
    components: {
      payment_element: {
        enabled: true,
        features: {
          payment_method_save: "enabled",
          payment_method_save_usage: "on_session",
          payment_method_redisplay: "enabled",
          payment_method_remove: "enabled",
        } as const,
      },
    },
  };
}

export function mobileSavedCardSessionParams(customerId: string) {
  return {
    customer: customerId,
    components: {
      mobile_payment_element: {
        enabled: true,
        features: {
          payment_method_save: "enabled",
          payment_method_redisplay: "enabled",
          payment_method_remove: "enabled",
        } as const,
      },
    },
  };
}

export async function getOrCreateStripeCustomer(
  store: CustomerStore,
  create: (idempotencyKey: string) => Promise<string>,
  userId: string,
  accountId: string,
  livemode: boolean,
): Promise<string> {
  const existing = await store.find(userId, accountId, livemode);
  if (existing) return existing;

  const customerId = await create(`bzead-customer-${accountId}-${livemode ? 'live' : 'test'}-${userId}`);
  await store.insertIfAbsent(userId, accountId, livemode, customerId);
  const saved = await store.find(userId, accountId, livemode);
  if (!saved) throw new Error('Stripe customer mapping could not be saved');
  return saved;
}
