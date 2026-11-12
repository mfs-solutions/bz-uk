export type AbandonedCheckoutAction = "expire" | "close" | "paid" | "processing";

export interface CheckoutSessionLifecycleState {
  id: string;
  status: string;
  payment_status: string;
}

export interface CheckoutSessionLifecycleApi {
  retrieve(sessionId: string): Promise<CheckoutSessionLifecycleState>;
  expire(sessionId: string): Promise<CheckoutSessionLifecycleState>;
}

export function getAbandonedCheckoutAction(
  session: CheckoutSessionLifecycleState,
  paymentIntentStatus?: string,
): AbandonedCheckoutAction {
  if (session.payment_status === "paid" || paymentIntentStatus === "succeeded") return "paid";
  if (session.status === "expired" && session.payment_status === "unpaid") return "close";
  if (session.status === "open" && session.payment_status === "unpaid") return "expire";
  if (
    session.status === "complete"
    && session.payment_status === "unpaid"
    && (paymentIntentStatus === "requires_payment_method" || paymentIntentStatus === "canceled")
  ) {
    return "close";
  }
  return "processing";
}

export async function expireOpenUnpaidCheckout(
  session: CheckoutSessionLifecycleState,
  stripeCheckout: CheckoutSessionLifecycleApi,
): Promise<CheckoutSessionLifecycleState> {
  if (getAbandonedCheckoutAction(session) !== "expire") return session;

  try {
    return await stripeCheckout.expire(session.id);
  } catch (expireError) {
    const latestSession = await stripeCheckout.retrieve(session.id);
    if (getAbandonedCheckoutAction(latestSession) === "expire") throw expireError;
    return latestSession;
  }
}
