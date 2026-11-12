import Stripe from "https://esm.sh/stripe@17.7.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { recoverUkHostedCheckout } from "../_shared/uk-hosted-checkout.ts";
import { sendUkOrderEmail, sendUkOrderPush } from "../_shared/uk-order-email.ts";

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const stripeKey = Deno.env.get("UK_STRIPE_SECRET_KEY")?.trim();
  const webhookSecret = Deno.env.get("UK_STRIPE_WEBHOOK_SECRET")?.trim();
  const accountId = Deno.env.get("UK_STRIPE_ACCOUNT_ID")?.trim();
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!stripeKey || !/^(sk|rk)_(live|test)_/.test(stripeKey) ||
      !webhookSecret || !accountId || !supabaseUrl || !serviceKey) {
    console.error("[uk-hosted-checkout-webhook] Server configuration is incomplete");
    return json({ error: "Webhook not configured" }, 500);
  }
  if (Number(req.headers.get("content-length") || "0") > 1_048_576) {
    return json({ error: "Payload too large" }, 413);
  }
  const signature = req.headers.get("stripe-signature");
  if (!signature) return json({ error: "Missing signature" }, 400);

  const stripe = new Stripe(stripeKey, {
    apiVersion: "2025-02-24.acacia",
    httpClient: Stripe.createFetchHttpClient(),
  });
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      await req.text(), signature, webhookSecret, undefined, Stripe.createSubtleCryptoProvider(),
    );
  } catch (error) {
    console.error("[uk-hosted-checkout-webhook] Invalid signature:", error);
    return json({ error: "Invalid signature" }, 400);
  }
  if (event.type !== "checkout.session.completed" &&
      event.type !== "checkout.session.async_payment_succeeded" &&
      event.type !== "checkout.session.async_payment_failed" &&
      event.type !== "checkout.session.expired") {
    return json({ received: true }, 200);
  }

  try {
    const livemode = /^(sk|rk)_live_/.test(stripeKey);
    const account = await stripe.accounts.retrieve();
    if (account.id !== accountId || event.livemode !== livemode ||
        (event.account && event.account !== accountId)) {
      throw new Error("Stripe account or mode mismatch");
    }

    const eventSession = event.data.object as Stripe.Checkout.Session;
    const db = createClient(supabaseUrl, serviceKey);
    if (event.type === "checkout.session.expired") {
      if (eventSession.metadata?.uk_checkout_snapshot_id) {
        const { error } = await db.from("uk_hosted_checkout_sessions")
          .update({ closed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq("id", eventSession.metadata.uk_checkout_snapshot_id)
          .eq("stripe_session_id", eventSession.id)
          .eq("stripe_account_id", accountId)
          .eq("livemode", livemode)
          .is("order_id", null)
          .is("closed_at", null);
        if (error) throw error;
      }
      return json({ received: true }, 200);
    }
    if (event.type === "checkout.session.async_payment_failed") {
      const session = await stripe.checkout.sessions.retrieve(eventSession.id);
      const snapshotId = session.metadata?.uk_checkout_snapshot_id;
      const paymentIntentId = typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id;
      if (
        !snapshotId
        || session.status !== "complete"
        || session.payment_status !== "unpaid"
        || session.livemode !== livemode
        || session.currency !== "gbp"
        || !paymentIntentId
      ) {
        return json({ received: true }, 200);
      }
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      if (
        paymentIntent.livemode !== livemode
        || paymentIntent.currency !== session.currency
        || paymentIntent.amount !== session.amount_total
        || (paymentIntent.status !== "requires_payment_method" && paymentIntent.status !== "canceled")
      ) {
        return json({ received: true }, 200);
      }
      const { error } = await db.from("uk_hosted_checkout_sessions")
        .update({
          payment_failure_confirmed_at: new Date().toISOString(),
          closed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", snapshotId)
        .eq("stripe_session_id", session.id)
        .eq("stripe_account_id", accountId)
        .eq("livemode", livemode)
        .eq("amount_minor", session.amount_total)
        .eq("currency", session.currency)
        .is("order_id", null);
      if (error) throw error;
      return json({ received: true }, 200);
    }
    const result = await recoverUkHostedCheckout(stripe, db, eventSession.id, accountId, livemode);
    if (result.status === "paid") {
      const { error } = await db.rpc("notify_uk_hosted_order", { p_snapshot_id: result.snapshotId });
      if (error) throw error;
      await sendUkOrderEmail(db, supabaseUrl, serviceKey, result.orderId, result.snapshotId);
      await sendUkOrderPush(db, supabaseUrl, serviceKey, result.orderId, result.snapshotId);
    }
    return json({ received: true }, 200);
  } catch (error) {
    console.error("[uk-hosted-checkout-webhook] Payment recovery failed:", error);
    return json({ error: "Unable to recover UK order" }, 500);
  }
});
