// supabase/functions/create-payment-intent/index.ts
// Supabase Edge Function — creates a Stripe PaymentIntent
//
// Deploy: supabase functions deploy create-payment-intent --no-verify-jwt
// Set secret: supabase secrets set STRIPE_SECRET_KEY=your_stripe_secret_key
//
// Request body: { amount: number, currency: string, metadata?: Record<string, string> }
// Response:     { clientSecret, paymentIntentId, customerSessionClientSecret }

import Stripe from "https://esm.sh/stripe@17.7.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getOrCreateStripeCustomer, savedCardSessionParams } from "./customer.ts";

const ALLOWED_ORIGINS = [
  'https://bzead.uk',
  'https://www.bzead.uk',
  'https://bzead.in',
  'https://www.bzead.in',
  'https://bzead.eu',
  'https://www.bzead.eu',
  'https://bzead.asia',
  'https://www.bzead.asia',
  'https://main.dodpm249jwwgd.amplifyapp.com',
  'https://main.d2532vkjbofjsn.amplifyapp.com',
  'https://www.bzead.com',
  'https://bzead.com',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  // Capacitor / Ionic mobile WebView origins (Android uses https://localhost when androidScheme is 'https')
  'https://localhost',
  'capacitor://localhost',
  'ionic://localhost',
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') || '';
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

// Maximum allowed payment amount in smallest currency unit (e.g. 500000 INR = ₹5,00,000)
const MAX_AMOUNT = 50_000_00;
const UK_AMPLIFY_ORIGIN = 'https://main.d2532vkjbofjsn.amplifyapp.com';

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  const origin = req.headers.get('origin') || '';

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (origin === UK_AMPLIFY_ORIGIN) {
    return new Response(
      JSON.stringify({ error: "UK storefront payments must use UK Stripe-hosted checkout" }),
      { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    // 1. Validate Stripe secret key
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      return new Response(
        JSON.stringify({ error: "Stripe secret key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Enforce max request size (64 KB — payment requests are small)
    const contentLength = Number(req.headers.get('content-length') || '0');
    if (contentLength > 65_536) {
      return new Response(
        JSON.stringify({ error: "Request too large" }),
        { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Parse request body
    const { amount, currency, metadata, client } = await req.json();

    // 4. Require authenticated user — verify JWT cryptographically via Supabase
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Authentication required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let userId: string;
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!supabaseUrl || !serviceRoleKey) {
        console.error("[create-payment-intent] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
        return new Response(
          JSON.stringify({ error: "Server configuration error" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const jwt = authHeader.replace("Bearer ", "");
      const authRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
        method: "GET",
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${jwt}`,
        },
      });

      if (!authRes.ok) {
        console.error("[create-payment-intent] Auth failed:", authRes.status, await authRes.text().catch(() => ""));
        return new Response(
          JSON.stringify({ error: "Invalid authentication token" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const authUser = await authRes.json() as { id?: string };
      if (!authUser?.id) {
        console.error("[create-payment-intent] No user ID in auth response");
        return new Response(
          JSON.stringify({ error: "Invalid authentication token" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      userId = authUser.id;
    } catch (authErr) {
      console.error("[create-payment-intent] Auth exception:", authErr);
      return new Response(
        JSON.stringify({ error: "Authentication validation failed" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!amount || typeof amount !== "number" || amount <= 0) {
      return new Response(
        JSON.stringify({ error: "Invalid amount — must be a positive number" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (amount > MAX_AMOUNT) {
      return new Response(
        JSON.stringify({ error: `Amount exceeds maximum allowed (${MAX_AMOUNT})` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!currency || typeof currency !== "string") {
      return new Response(
        JSON.stringify({ error: "Invalid currency — must be a string (e.g. 'inr', 'usd')" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Create Stripe PaymentIntent
    const stripe = new Stripe(stripeKey, {
      apiVersion: "2025-02-24.acacia",
      httpClient: Stripe.createFetchHttpClient(),
    });

    const normalizedCurrency = currency.toLowerCase().trim();

    // Validate ISO 4217 format only (3 lowercase letters). Stripe is the source of truth
    // for which currencies are actually chargeable on this account — let it return the
    // detailed error if the currency isn't supported, instead of maintaining a duplicate list here.
    if (!/^[a-z]{3}$/.test(normalizedCurrency)) {
      return new Response(
        JSON.stringify({ error: `Invalid currency code '${currency}' — must be a 3-letter ISO 4217 code (e.g. 'usd', 'inr')` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Server configuration error");
    }
    const db = createClient(supabaseUrl, serviceRoleKey);
    const account = await stripe.accounts.retrieve();
    if (!/^(sk|rk)_(live|test)_/.test(stripeKey)) {
      throw new Error("Unrecognized Stripe secret key mode");
    }
    const livemode = /^(sk|rk)_live_/.test(stripeKey);
    const customerId = await getOrCreateStripeCustomer({
      async find(id, accountId, live) {
        const { data, error } = await db.from("stripe_customers")
          .select("stripe_customer_id")
          .eq("user_id", id)
          .eq("stripe_account_id", accountId)
          .eq("livemode", live)
          .maybeSingle();
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
      const customer = await stripe.customers.create(
        { metadata: { user_id: userId } },
        { idempotencyKey },
      );
      return customer.id;
    }, userId, account.id, livemode);

    const customerSession = await stripe.customerSessions.create(savedCardSessionParams(customerId));

    const paymentIntentPayload: Stripe.PaymentIntentCreateParams = {
      amount: Math.round(amount), // already in smallest unit from frontend
      currency: normalizedCurrency,
      customer: customerId,
      metadata: {
        ...metadata,
        user_id: userId,
        source: "bzeadstore",
      },
    };

    if (client === 'native') {
      // A Capacitor WebView cannot reliably resume off-site payment redirects.
      paymentIntentPayload.automatic_payment_methods = { enabled: true, allow_redirects: 'never' };
    } else {
      paymentIntentPayload.payment_method_types = ['card'];
    }

    const paymentIntent = await stripe.paymentIntents.create(paymentIntentPayload);

    // 6. Return client secret
    return new Response(
      JSON.stringify({
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        customerSessionClientSecret: customerSession.client_secret,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("[create-payment-intent] Payment initialization failed:", err);
    return new Response(
      JSON.stringify({ error: "Unable to initialize secure payment. Please try again." }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
