import Stripe from "https://esm.sh/stripe@17.7.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getOrCreateStripeCustomer } from "../create-payment-intent/customer.ts";

const origins = new Set([
  "https://bzead.uk",
  "https://www.bzead.uk",
  "https://main.d2532vkjbofjsn.amplifyapp.com",
]);

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") || "";
  const returnOrigin = origins.has(origin) ? origin : "https://bzead.uk";
  const json = (body: unknown, status: number) => new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": returnOrigin,
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Vary": "Origin",
    },
  });
  if (req.method === "OPTIONS") return json({}, 200);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (Deno.env.get("UK_HOSTED_CHECKOUT_ENABLED") !== "true") {
    return json({ error: "UK hosted checkout is not enabled" }, 503);
  }
  if (Number(req.headers.get("content-length") || "0") > 8192) {
    return json({ error: "Request too large" }, 413);
  }
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const stripeKey = Deno.env.get("UK_STRIPE_SECRET_KEY")?.trim();
  const accountId = Deno.env.get("UK_STRIPE_ACCOUNT_ID")?.trim();
  if (!url || !key || !stripeKey || !/^(sk|rk)_(live|test)_/.test(stripeKey) || !accountId) {
    console.error("[create-uk-hosted-checkout] Missing server configuration");
    return json({ error: "UK payment configuration is unavailable" }, 500);
  }
  const authorization = req.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return json({ error: "Authentication required" }, 401);
  try {
    const body: unknown = await req.json();
    const snapshotId = typeof body === "object" && body !== null && "snapshotId" in body
      ? body.snapshotId : null;
    if (typeof snapshotId !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(snapshotId)) {
      return json({ error: "Invalid checkout reference" }, 400);
    }
    const db = createClient(url, key);
    const { data: auth, error: authError } = await db.auth.getUser(authorization.slice(7));
    if (authError || !auth.user) return json({ error: "Invalid authentication token" }, 401);
    const { data: snapshot, error } = await db.from("uk_hosted_checkout_sessions")
      .select("id,user_id,stripe_session_id,stripe_account_id,livemode,amount_minor,currency,created_at,order_id,closed_at")
      .eq("id", snapshotId).maybeSingle();
    if (error) throw error;
    const livemode = /^(sk|rk)_live_/.test(stripeKey);
    if (!snapshot || snapshot.user_id !== auth.user.id || snapshot.stripe_account_id !== accountId ||
        snapshot.livemode !== livemode || snapshot.currency !== "gbp" ||
        !Number.isSafeInteger(snapshot.amount_minor) || snapshot.amount_minor <= 0 ||
        snapshot.amount_minor > 5_000_000 || snapshot.order_id || snapshot.closed_at) {
      return json({ error: "Checkout is no longer available" }, 409);
    }
    const createdAt = Date.parse(snapshot.created_at);
    if (!Number.isFinite(createdAt) || Date.now() - createdAt > 5 * 60_000 || createdAt > Date.now() + 60_000) {
      return json({ error: "Checkout quote has expired. Return to review for updated prices." }, 409);
    }
    const stripe = new Stripe(stripeKey, {
      apiVersion: "2025-02-24.acacia",
      httpClient: Stripe.createFetchHttpClient(),
    });
    const account = await stripe.accounts.retrieve();
    if (account.id !== accountId) throw new Error("Stripe account does not match UK configuration");
    const customer = await getOrCreateStripeCustomer({
      async find(userId, stripeAccountId, live) {
        const { data, error: lookupError } = await db.from("uk_stripe_customers")
          .select("stripe_customer_id").eq("user_id", userId)
          .eq("stripe_account_id", stripeAccountId).eq("livemode", live).maybeSingle();
        if (lookupError) throw lookupError;
        return data?.stripe_customer_id ?? null;
      },
      async insertIfAbsent(userId, stripeAccountId, live, customerId) {
        const { error: insertError } = await db.from("uk_stripe_customers").upsert({
          user_id: userId, stripe_account_id: stripeAccountId, livemode: live, stripe_customer_id: customerId,
        }, { onConflict: "user_id,stripe_account_id,livemode", ignoreDuplicates: true });
        if (insertError) throw insertError;
      },
    }, async (idempotencyKey) => {
      const created = await stripe.customers.create({ metadata: { user_id: auth.user.id } }, { idempotencyKey });
      return created.id;
    }, auth.user.id, accountId, livemode);
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer,
      client_reference_id: auth.user.id,
      expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
      saved_payment_method_options: {
        payment_method_save: "enabled",
        payment_method_remove: "enabled",
      },
      payment_intent_data: {
        metadata: { uk_checkout_snapshot_id: snapshotId, uk_storefront: "bzead.uk" },
      },
      line_items: [{
        price_data: {
          currency: snapshot.currency,
          unit_amount: snapshot.amount_minor,
          product_data: { name: "BZEAD order" },
        },
        quantity: 1,
      }],
      metadata: { uk_checkout_snapshot_id: snapshotId },
      success_url: `${returnOrigin}/checkout/uk-payment-return?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${returnOrigin}/cart`,
    }, { idempotencyKey: `uk-checkout-${snapshotId}` });
    if (session.status !== "open" || !session.url || session.livemode !== livemode ||
        session.amount_total !== snapshot.amount_minor || session.currency !== snapshot.currency ||
        (snapshot.stripe_session_id && snapshot.stripe_session_id !== session.id)) {
      throw new Error("Stripe Checkout Session does not match the saved quote");
    }
    const { data: saved, error: saveError } = await db.from("uk_hosted_checkout_sessions")
      .update({ stripe_session_id: session.id, updated_at: new Date().toISOString() })
      .eq("id", snapshotId).is("order_id", null).is("closed_at", null).select("stripe_session_id").single();
    if (saveError || saved?.stripe_session_id !== session.id) {
      throw saveError || new Error("Unable to save checkout session");
    }
    return json({ checkoutUrl: session.url, sessionId: session.id }, 200);
  } catch (error) {
    console.error("[create-uk-hosted-checkout] Initialization failed:", error);
    return json({ error: "Unable to initialize UK payment. Please try again." }, 502);
  }
});
