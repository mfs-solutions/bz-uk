import Stripe from "https://esm.sh/stripe@17.7.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getUkCheckoutReturnStatus } from "../_shared/uk-checkout-return.ts";
import { expireOpenUnpaidCheckout } from "../_shared/uk-checkout-lifecycle.ts";

const origins = new Set([
  "https://bzead.uk",
  "https://www.bzead.uk",
  "https://main.d2532vkjbofjsn.amplifyapp.com",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") || "";
  const json = (body: unknown, status: number) => new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": origins.has(origin) ? origin : "https://bzead.uk",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Vary": "Origin",
    },
  });
  if (req.method === "OPTIONS") return json({}, 200);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (Number(req.headers.get("content-length") || "0") > 8192) {
    return json({ error: "Request too large" }, 413);
  }
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const stripeKey = Deno.env.get("UK_STRIPE_SECRET_KEY")?.trim();
  const accountId = Deno.env.get("UK_STRIPE_ACCOUNT_ID")?.trim();
  if (!url || !key || !stripeKey || !/^(sk|rk)_(live|test)_/.test(stripeKey) || !accountId) {
    console.error("[verify-uk-hosted-checkout] Missing server configuration");
    return json({ error: "Payment verification is unavailable" }, 500);
  }
  const authorization = req.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return json({ error: "Authentication required" }, 401);
  try {
    const body: unknown = await req.json();
    const requestedSessionId = isRecord(body) ? body.sessionId : null;
    const requestedSnapshotId = isRecord(body) ? body.snapshotId : null;
    const action = isRecord(body) && "action" in body ? body.action : "verify";
    if (action !== "verify" && action !== "cancel") return json({ error: "Invalid action" }, 400);
    let sessionId = typeof requestedSessionId === "string"
      && /^cs_(test|live)_[A-Za-z0-9]+$/.test(requestedSessionId)
      ? requestedSessionId
      : null;
    const requestedSnapshotReference = typeof requestedSnapshotId === "string"
      && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestedSnapshotId)
      ? requestedSnapshotId
      : null;
    if (!sessionId && !requestedSnapshotReference) {
      return json({ error: "Invalid checkout session" }, 400);
    }
    const db = createClient(url, key);
    const { data: auth, error: authError } = await db.auth.getUser(authorization.slice(7));
    if (authError || !auth.user) return json({ error: "Invalid authentication token" }, 401);
    if (!sessionId && requestedSnapshotReference) {
      const { data: pendingSnapshot, error: pendingSnapshotError } = await db
        .from("uk_hosted_checkout_sessions")
        .select("stripe_session_id")
        .eq("id", requestedSnapshotReference)
        .eq("user_id", auth.user.id)
        .maybeSingle();
      if (pendingSnapshotError) throw pendingSnapshotError;
      if (!pendingSnapshot?.stripe_session_id) {
        return json({ error: "Checkout session not found" }, 404);
      }
      sessionId = pendingSnapshot.stripe_session_id;
    }
    if (!sessionId) return json({ error: "Invalid checkout session" }, 400);
    const stripe = new Stripe(stripeKey, {
      apiVersion: "2025-02-24.acacia",
      httpClient: Stripe.createFetchHttpClient(),
    });
    const account = await stripe.accounts.retrieve();
    if (account.id !== accountId) throw new Error("Stripe account does not match UK configuration");
    const livemode = /^(sk|rk)_live_/.test(stripeKey);
    let session = await stripe.checkout.sessions.retrieve(sessionId);
    const checkoutSnapshotId = session.metadata?.uk_checkout_snapshot_id;
    if (!checkoutSnapshotId) throw new Error("Checkout Session has no saved quote reference");
    const { data: snapshot, error: snapshotError } = await db.from("uk_hosted_checkout_sessions")
      .select("id,user_id,stripe_session_id,stripe_account_id,livemode,amount_minor,currency,order_id,payment_intent_id,payment_failure_confirmed_at")
      .eq("id", checkoutSnapshotId).maybeSingle();
    if (snapshotError) throw snapshotError;
    if (
      !snapshot
      || snapshot.user_id !== auth.user.id
      || snapshot.stripe_session_id !== session.id
      || snapshot.stripe_account_id !== accountId
      || snapshot.livemode !== livemode
      || snapshot.amount_minor !== session.amount_total
      || snapshot.currency !== session.currency
      || session.livemode !== livemode
      || session.currency !== "gbp"
      || session.client_reference_id !== auth.user.id
    ) {
      throw new Error("Checkout Session does not match the authenticated customer's quote");
    }

    if (action === "cancel" && session.status === "open" && session.payment_status === "unpaid") {
      session = await expireOpenUnpaidCheckout(session, {
        retrieve: (id) => stripe.checkout.sessions.retrieve(id),
        expire: (id) => stripe.checkout.sessions.expire(id),
      });
    }

    const paymentIntentId = typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id;
    const paymentIntent = paymentIntentId
      ? await stripe.paymentIntents.retrieve(paymentIntentId)
      : null;
    if (paymentIntent && (
      paymentIntent.livemode !== livemode
      || paymentIntent.currency !== session.currency
      || paymentIntent.amount !== session.amount_total
    )) {
      throw new Error("PaymentIntent does not match the saved checkout amount");
    }
    if (
      paymentIntent?.status === "succeeded"
      && paymentIntent.amount_received !== session.amount_total
    ) {
      throw new Error("Captured PaymentIntent does not match the Checkout Session");
    }

    let confirmedOrder: Record<string, unknown> | null = null;
    if (snapshot.order_id && paymentIntentId && snapshot.payment_intent_id === paymentIntentId) {
      const { data: order, error: orderError } = await db.from("orders")
        .select("id,order_number,total_amount,currency,payment_status,payment_intent_id")
        .eq("id", snapshot.order_id).eq("user_id", auth.user.id).maybeSingle();
      if (orderError) throw orderError;
      if (
        order
        && order.payment_intent_id === paymentIntentId
        && ["completed", "paid", "succeeded"].includes(String(order.payment_status).toLowerCase())
        && String(order.currency).toLowerCase() === session.currency
        && Math.round(Number(order.total_amount) * 100) === session.amount_total
      ) {
        confirmedOrder = order as Record<string, unknown>;
      }
    }

    const status = getUkCheckoutReturnStatus({
      sessionStatus: session.status || "unknown",
      paymentStatus: session.payment_status || "unpaid",
      paymentIntentStatus: paymentIntent?.status,
      failureConfirmed: Boolean(snapshot.payment_failure_confirmed_at),
      orderConfirmed: Boolean(confirmedOrder),
    });

    if (status === "failed" || status === "cancelled") {
      const { error: closeError } = await db.from("uk_hosted_checkout_sessions")
        .update({ closed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", snapshot.id).eq("user_id", auth.user.id)
        .eq("stripe_session_id", session.id).is("order_id", null).is("closed_at", null);
      if (closeError) throw closeError;
    }

    return json({
      status,
      ...(status === "success" && confirmedOrder
        ? {
          orderId: confirmedOrder.id,
          orderNumber: String(confirmedOrder.order_number || confirmedOrder.id),
          amount: Number(session.amount_total) / 100,
          currency: session.currency.toUpperCase(),
        }
        : {}),
    }, 200);
  } catch (error) {
    console.error("[verify-uk-hosted-checkout] Verification failed:", error);
    return json({ error: "Unable to verify payment. If you have paid, do not pay again; contact support." }, 502);
  }
});
