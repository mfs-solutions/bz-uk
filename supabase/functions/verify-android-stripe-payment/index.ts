import Stripe from "https://esm.sh/stripe@20.0.0?target=deno";
import { verifyPayment } from "./payment.ts";

Deno.serve(async (req: Request) => {
  const json = (body: Record<string, unknown>, status: number) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (Number(req.headers.get("content-length") || "0") > 65_536) return json({ error: "Request too large" }, 413);

  const authorization = req.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return json({ error: "Authentication required" }, 401);
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!url || !serviceKey || !stripeKey || !/^(sk|rk)_(live|test)_/.test(stripeKey)) {
    console.error("[verify-android-stripe-payment] Missing server configuration");
    return json({ error: "Server configuration error" }, 500);
  }

  try {
    const userResponse = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: serviceKey, Authorization: authorization },
    });
    if (userResponse.status === 401 || userResponse.status === 403) {
      return json({ error: "Invalid authentication token" }, 401);
    }
    if (!userResponse.ok) throw new Error(`Authentication service returned ${userResponse.status}`);
    const user = await userResponse.json() as { id?: string };
    if (!user.id) return json({ error: "Invalid authentication token" }, 401);

    let body: unknown;
    try {
      body = await req.json();
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      return json({ error: "Invalid request" }, 400);
    }
    const paymentIntentId = typeof body === "object" && body !== null && "paymentIntentId" in body
      ? body.paymentIntentId : null;
    if (typeof paymentIntentId !== "string" || !/^pi_[A-Za-z0-9]{1,128}$/.test(paymentIntentId)) {
      return json({ error: "Invalid payment reference" }, 400);
    }
    const expectedAmount = typeof body === "object" && body !== null && "expectedAmount" in body
      ? body.expectedAmount : null;
    if (typeof expectedAmount !== "number" || !Number.isSafeInteger(expectedAmount) ||
      expectedAmount <= 0 || expectedAmount > 5_000_000) {
      return json({ error: "Invalid payment amount" }, 400);
    }

    const action = typeof body === "object" && body !== null && "action" in body ? body.action : "verify";
    if (action !== "verify" && action !== "cancel" && action !== "recover") return json({ error: "Invalid action" }, 400);
    const stripe = new Stripe(stripeKey, { httpClient: Stripe.createFetchHttpClient() });
    let payment = await stripe.paymentIntents.retrieve(paymentIntentId);
    let result = verifyPayment(payment, user.id, paymentIntentId, /^(sk|rk)_live_/.test(stripeKey), expectedAmount);
    if (result === "mismatch" || payment.metadata.client !== "android_uk") {
      console.error("[verify-android-stripe-payment] Payment does not match authenticated UK checkout");
      return json({ error: "Payment could not be verified" }, 403);
    }
    if (action === "cancel") {
      if (payment.status === "requires_payment_method") {
        payment = await stripe.paymentIntents.cancel(paymentIntentId);
        result = verifyPayment(payment, user.id, paymentIntentId, /^(sk|rk)_live_/.test(stripeKey), expectedAmount);
      }
      if (payment.status !== "canceled" || result !== "failed") {
        return json({ error: "Payment cannot be cancelled. Check its status before paying again." }, 409);
      }
    }
    if (action === "recover" && result === "succeeded") {
      const recovery = await fetch(`${url}/rest/v1/rpc/confirm_android_stripe_order`, {
        method: "POST",
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          p_user_id: user.id,
          p_payment_intent_id: paymentIntentId,
          p_amount_pence: payment.amount_received,
        }),
      });
      if (!recovery.ok) {
        console.error("[verify-android-stripe-payment] Paid order recovery failed:", recovery.status, await recovery.text());
        return json({ error: "Payment received, but order confirmation is pending. Do not pay again." }, 502);
      }
      const order = await recovery.json() as { id?: unknown };
      if (typeof order.id !== "string" || !order.id) {
        throw new Error("Order recovery returned no order ID");
      }
      return json({ status: result, orderId: order.id }, 200);
    }
    return json({ status: result }, 200);
  } catch (error) {
    console.error("[verify-android-stripe-payment] Verification failed:", error);
    return json({ error: "Unable to verify payment. Please try again." }, 502);
  }
});
