import Stripe from "https://esm.sh/stripe@17.7.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Database = ReturnType<typeof createClient>;

export async function recoverUkHostedCheckout(
  stripe: Stripe,
  db: Database,
  sessionId: string,
  accountId: string,
  livemode: boolean,
  userId?: string,
): Promise<
  | { status: "unpaid" | "expired" }
  | { status: "paid"; orderId: string; paymentIntentId: string; snapshotId: string }
> {
  if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId)) {
    throw new Error("Invalid checkout session ID");
  }
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  const snapshotId = session.metadata?.uk_checkout_snapshot_id;
  if (!snapshotId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(snapshotId) ||
      session.livemode !== livemode || session.currency !== "gbp" ||
      !session.amount_total || session.amount_total <= 0) {
    throw new Error("Invalid UK checkout session");
  }
  const { data: snapshot, error } = await db.from("uk_hosted_checkout_sessions")
    .select("user_id,stripe_session_id,stripe_account_id,livemode,amount_minor,currency")
    .eq("id", snapshotId).maybeSingle();
  if (error) throw error;
  if (!snapshot || snapshot.stripe_session_id !== session.id ||
      snapshot.stripe_account_id !== accountId || snapshot.livemode !== livemode ||
      snapshot.amount_minor !== session.amount_total || snapshot.currency !== session.currency ||
      (userId && snapshot.user_id !== userId)) {
    throw new Error("Checkout session does not match the saved payment");
  }
  if (session.payment_status !== "paid") {
    return { status: session.status === "expired" ? "expired" : "unpaid" };
  }
  const paymentIntentId = typeof session.payment_intent === "string"
    ? session.payment_intent : session.payment_intent?.id;
  if (!paymentIntentId) throw new Error("Paid checkout has no payment intent");
  const payment = await stripe.paymentIntents.retrieve(paymentIntentId);
  if (payment.status !== "succeeded" || payment.livemode !== livemode ||
      payment.amount_received !== session.amount_total || payment.currency !== session.currency) {
    throw new Error("Captured payment does not match Checkout Session");
  }
  const { data: order, error: recoveryError } = await db.rpc("recover_uk_hosted_checkout", {
    p_snapshot_id: snapshotId,
    p_session_id: session.id,
    p_account_id: accountId,
    p_livemode: livemode,
    p_payment_intent_id: payment.id,
    p_amount_minor: payment.amount_received,
    p_currency: payment.currency,
  });
  if (recoveryError || typeof order?.id !== "string" || !order.id) {
    throw recoveryError || new Error("Order recovery returned no order");
  }
  return { status: "paid", orderId: order.id, paymentIntentId: payment.id, snapshotId };
}
