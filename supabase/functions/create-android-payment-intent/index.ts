import Stripe from "https://esm.sh/stripe@20.0.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getOrCreateStripeCustomer, mobileSavedCardSessionParams } from "../create-payment-intent/customer.ts";

Deno.serve(async (req: Request) => {
  const json = (body: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (Number(req.headers.get("content-length") || "0") > 65_536) return json({ error: "Request too large" }, 413);
  const authorization = req.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return json({ error: "Authentication required" }, 401);

  try {
    if (Deno.env.get("ANDROID_UK_CHECKOUT_ENABLED") !== "true") {
      return json({ error: "Android UK payment initialization is not enabled." }, 503);
    }
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!url || !serviceKey || !stripeKey || !/^(sk|rk)_(live|test)_/.test(stripeKey)) {
      console.error("[create-android-payment-intent] Server configuration is incomplete");
      return json({ error: "Server configuration error" }, 500);
    }

    const userResponse = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: serviceKey, Authorization: authorization },
    });
    if (!userResponse.ok) return json({ error: "Invalid authentication token" }, 401);
    const user = await userResponse.json() as { id?: string };
    if (!user.id) return json({ error: "Invalid authentication token" }, 401);

    const body = await req.json() as { amount?: unknown; currency?: unknown; metadata?: { item_count?: unknown } };
    if (typeof body.amount !== "number" || !Number.isSafeInteger(body.amount) || body.amount <= 0 || body.amount > 50_000_00) {
      return json({ error: "Invalid payment amount" }, 400);
    }
    if (body.currency !== "gbp") return json({ error: "Only GBP payments are supported" }, 400);

    const stripe = new Stripe(stripeKey, { httpClient: Stripe.createFetchHttpClient() });
    const db = createClient(url, serviceKey);
    const account = await stripe.accounts.retrieve();
    const livemode = /^(sk|rk)_live_/.test(stripeKey);
    const customerId = await getOrCreateStripeCustomer({
      async find(id, accountId, live) {
        const { data, error } = await db.from("stripe_customers")
          .select("stripe_customer_id").eq("user_id", id)
          .eq("stripe_account_id", accountId).eq("livemode", live).maybeSingle();
        if (error) throw new Error(`Stripe customer lookup failed: ${error.message}`);
        return data?.stripe_customer_id ?? null;
      },
      async insertIfAbsent(id, accountId, live, stripeCustomerId) {
        const { error } = await db.from("stripe_customers").upsert({
          user_id: id,
          stripe_account_id: accountId,
          livemode: live,
          stripe_customer_id: stripeCustomerId,
        }, { onConflict: "user_id,stripe_account_id,livemode", ignoreDuplicates: true });
        if (error) throw new Error(`Stripe customer mapping failed: ${error.message}`);
      },
    }, async (idempotencyKey) => {
      const customer = await stripe.customers.create({ metadata: { user_id: user.id! } }, { idempotencyKey });
      return customer.id;
    }, user.id, account.id, livemode);

    const customerSession = await stripe.customerSessions.create(mobileSavedCardSessionParams(customerId));
    const paymentIntent = await stripe.paymentIntents.create({
      amount: body.amount,
      currency: "gbp",
      customer: customerId,
      payment_method_types: ["card"],
      metadata: {
        user_id: user.id,
        source: "bzeadstore",
        client: "android_uk",
        item_count: String(body.metadata?.item_count || ""),
      },
    });

    return json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      customerId,
      customerSessionClientSecret: customerSession.client_secret,
    });
  } catch (error) {
    console.error("[create-android-payment-intent] Payment initialization failed:", error);
    return json({ error: "Unable to initialize secure payment. Please try again." }, 500);
  }
});
