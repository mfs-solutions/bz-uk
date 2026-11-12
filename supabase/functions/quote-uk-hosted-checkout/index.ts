import Stripe from "https://esm.sh/stripe@17.7.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { calculateDestinationCheckoutPricing } from "../../../src/lib/checkoutPricingService.ts";
import { isUKCountry } from "../../../src/config/market.ts";
import { calculateUkHostedCheckoutTotal } from "../../../src/lib/ukHostedCheckoutPricing.ts";
import {
  expireOpenUnpaidCheckout,
  getAbandonedCheckoutAction,
} from "../_shared/uk-checkout-lifecycle.ts";
import { recoverUkHostedCheckout } from "../_shared/uk-hosted-checkout.ts";
import { sendUkOrderEmail, sendUkOrderPush } from "../_shared/uk-order-email.ts";

const origins = new Set([
  "https://bzead.uk",
  "https://www.bzead.uk",
  "https://main.d2532vkjbofjsn.amplifyapp.com",
]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const token = (value: string | null) => value?.trim().toLowerCase() || "-";

type CartRow = {
  id: string;
  product_id: string;
  quantity: number;
  selected_size: string | null;
  selected_color: string | null;
  selected_variant_id: string | null;
  selected_variant_sku: string | null;
  updated_at: string;
};

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
  if (Deno.env.get("UK_HOSTED_CHECKOUT_ENABLED") !== "true") {
    return json({ error: "UK hosted checkout is not enabled" }, 503);
  }
  if (Number(req.headers.get("content-length") || "0") > 32_768) return json({ error: "Request too large" }, 413);
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const stripeKey = Deno.env.get("UK_STRIPE_SECRET_KEY")?.trim();
  const accountId = Deno.env.get("UK_STRIPE_ACCOUNT_ID")?.trim();
  if (!url || !key || !stripeKey || !/^(sk|rk)_(live|test)_/.test(stripeKey) || !accountId) {
    console.error("[quote-uk-hosted-checkout] Missing server configuration");
    return json({ error: "UK checkout is unavailable" }, 500);
  }
  const authorization = req.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return json({ error: "Authentication required" }, 401);

  try {
    const body: unknown = await req.json();
    if (!isRecord(body) || !Array.isArray(body.cartItemIds) ||
        body.cartItemIds.length < 1 || body.cartItemIds.length > 50 ||
        body.cartItemIds.some((id) => typeof id !== "string" || id.length > 512) ||
        new Set(body.cartItemIds).size !== body.cartItemIds.length ||
        !isRecord(body.shippingAddress)) {
      return json({ error: "Invalid checkout details" }, 400);
    }
    const address = body.shippingAddress;
    for (const field of ["street", "city", "postalCode", "country"]) {
      if (typeof address[field] !== "string" || !address[field].trim() || address[field].length > 256) {
        return json({ error: "Please provide a complete delivery address" }, 400);
      }
    }
    if (!isUKCountry(String(address.country))) return json({ error: "A UK delivery address is required" }, 400);
    const tier = body.shippingTier || "standard";
    if (tier !== "standard" && tier !== "premium" && tier !== "express") {
      return json({ error: "Invalid delivery option" }, 400);
    }
    const text = (value: unknown) => typeof value === "string" ? value.trim().slice(0, 1000) : "";
    const db = createClient(url, key);
    const { data: auth, error: authError } = await db.auth.getUser(authorization.slice(7));
    if (authError || !auth.user) return json({ error: "Invalid authentication token" }, 401);
    const stripe = new Stripe(stripeKey, {
      apiVersion: "2025-02-24.acacia",
      httpClient: Stripe.createFetchHttpClient(),
    });
    const livemode = /^(sk|rk)_live_/.test(stripeKey);
    const account = await stripe.accounts.retrieve();
    if (account.id !== accountId) throw new Error("Stripe account does not match UK configuration");
    const { error: staleError } = await db.from("uk_hosted_checkout_sessions")
      .delete().eq("user_id", auth.user.id).is("stripe_session_id", null).is("order_id", null)
      .lt("created_at", new Date(Date.now() - 5 * 60_000).toISOString());
    if (staleError) throw staleError;
    const { data: active, error: activeError } = await db.from("uk_hosted_checkout_sessions")
      .select("id,stripe_session_id,stripe_account_id,livemode,amount_minor,currency")
      .eq("user_id", auth.user.id)
      .is("order_id", null).is("closed_at", null).maybeSingle();
    if (activeError) throw activeError;
    if (active) {
      if (!active.stripe_session_id) {
        return json({ error: "Your checkout is still being prepared. Please try again in a few seconds." }, 409);
      }
      if (active.stripe_account_id !== accountId || active.livemode !== livemode || active.currency !== "gbp") {
        throw new Error("Active checkout does not match UK Stripe configuration");
      }

      let existingSession = await stripe.checkout.sessions.retrieve(active.stripe_session_id);
      if (
        existingSession.metadata?.uk_checkout_snapshot_id !== active.id
        || existingSession.livemode !== livemode
        || existingSession.currency !== active.currency
        || existingSession.amount_total !== active.amount_minor
      ) {
        throw new Error("Active Stripe Checkout Session does not match its saved quote");
      }

      let paymentIntentStatus: string | undefined;
      const getPaymentIntentId = () => typeof existingSession.payment_intent === "string"
        ? existingSession.payment_intent
        : existingSession.payment_intent?.id;
      const inspectCompletedUnpaidPayment = async () => {
        if (existingSession.status !== "complete" || existingSession.payment_status !== "unpaid") return;
        const intentId = getPaymentIntentId();
        if (!intentId) return;
        const paymentIntent = await stripe.paymentIntents.retrieve(intentId);
        if (
          paymentIntent.livemode !== livemode
          || paymentIntent.currency !== active.currency
          || paymentIntent.amount !== active.amount_minor
        ) {
          throw new Error("Active payment does not match its saved checkout quote");
        }
        paymentIntentStatus = paymentIntent.status;
      };
      await inspectCompletedUnpaidPayment();

      let action = getAbandonedCheckoutAction(existingSession, paymentIntentStatus);
      if (action === "expire") {
        existingSession = await expireOpenUnpaidCheckout(existingSession, {
          retrieve: (sessionId) => stripe.checkout.sessions.retrieve(sessionId),
          expire: (sessionId) => stripe.checkout.sessions.expire(sessionId),
        });
        await inspectCompletedUnpaidPayment();
        action = getAbandonedCheckoutAction(existingSession, paymentIntentStatus);
      }

      if (action === "paid") {
        const recovered = await recoverUkHostedCheckout(
          stripe, db, existingSession.id, accountId, livemode, auth.user.id,
        );
        if (recovered.status !== "paid") {
          return json({
            error: "Your previous payment is being confirmed. Please do not pay again yet.",
            status: "processing",
          }, 409);
        }
        const { error: notificationError } = await db.rpc("notify_uk_hosted_order", {
          p_snapshot_id: recovered.snapshotId,
        });
        if (notificationError) throw notificationError;
        await sendUkOrderEmail(db, url, key, recovered.orderId, recovered.snapshotId);
        await sendUkOrderPush(db, url, key, recovered.orderId, recovered.snapshotId);
        return json({
          error: "Your previous payment was successful. Your order is confirmed.",
          status: "paid",
          orderId: recovered.orderId,
        }, 409);
      }

      if (action !== "close") {
        return json({
          error: "Your previous payment is still processing. We’re confirming its status; please do not pay again yet.",
          status: "processing",
        }, 409);
      }

      const { error: closeError } = await db.from("uk_hosted_checkout_sessions")
        .update({ closed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", active.id).eq("user_id", auth.user.id)
        .eq("stripe_session_id", existingSession.id).is("order_id", null).is("closed_at", null);
      if (closeError) throw closeError;
    }
    const { data: rows, error: cartError } = await db.from("cart_items")
      .select("id,product_id,quantity,selected_size,selected_color,selected_variant_id,selected_variant_sku,updated_at")
      .eq("user_id", auth.user.id);
    if (cartError) throw cartError;
    const requested = new Set(body.cartItemIds);
    const cart = (rows as CartRow[] || []).filter((row) =>
      requested.has(`${row.product_id}::${token(row.selected_size)}::${token(row.selected_color)}::${token(row.selected_variant_sku)}`)
    );
    if (cart.length !== requested.size || cart.some((item) => !uuid.test(item.id) || !uuid.test(item.product_id) ||
        !Number.isSafeInteger(item.quantity) || item.quantity <= 0 || item.quantity > 1000)) {
      return json({ error: "Your cart changed. Return to review and try again." }, 409);
    }
    const productIds = [...new Set(cart.map((item) => item.product_id))];
    const [{ data: products, error: productError }, { data: countryRows, error: rateError },
      { data: variants, error: variantError }] = await Promise.all([
      db.from("products").select("id,name,price,currency,stock,sku,hsn_code,image_url,seller_id").in("id", productIds),
      db.from("countries").select("id,country_name,country_code,short_code,iso2,currency_code,exchange_rate").eq("is_active", true).not("exchange_rate", "is", null),
      db.from("product_variants").select("id,product_id,sku,price,stock").in("product_id", productIds),
    ]);
    if (productError || rateError || variantError) throw productError || rateError || variantError;
    if (!products || products.length !== productIds.length || !countryRows?.length) {
      throw new Error("Products or exchange rates are unavailable");
    }
    const rates: Record<string, number> = {};
    for (const row of countryRows) {
      const code = String(row.currency_code || "").toUpperCase();
      const rate = Number(row.exchange_rate);
      if (code && Number.isFinite(rate) && rate > 0 && !rates[code]) rates[code] = rate;
    }
    if (!rates.GBP || !rates.INR) throw new Error("Required exchange rates are unavailable");
    const productMap = new Map(products.map((product) => [product.id, product]));
    const stockRequired = new Map<string, { quantity: number; stock: number }>();
    for (const item of cart) {
      const product = productMap.get(item.product_id);
      if (!product) throw new Error("Cart product no longer exists");
      const productVariants = (variants || []).filter((variant) => variant.product_id === item.product_id);
      const matching = productVariants.filter((variant) =>
        (!item.selected_variant_id || variant.id === item.selected_variant_id) &&
        (!item.selected_variant_sku || token(variant.sku) === token(item.selected_variant_sku))
      );
      if (productVariants.length && (matching.length !== 1 || (!item.selected_variant_id && !item.selected_variant_sku))) {
        return json({ error: "A selected variant is no longer available. Return to your cart." }, 409);
      }
      const variant = matching[0];
      const stockKey = variant ? `variant:${variant.id}` : `product:${item.product_id}`;
      const previous = stockRequired.get(stockKey);
      stockRequired.set(stockKey, {
        quantity: (previous?.quantity || 0) + item.quantity,
        stock: Number(variant ? variant.stock : product.stock),
      });
    }
    if ([...stockRequired.values()].some((item) => !Number.isFinite(item.stock) || item.stock < item.quantity)) {
      return json({ error: "An item is out of stock. Return to your cart." }, 409);
    }
    const pricingItems = cart.map((item) => {
      const product = productMap.get(item.product_id);
      const price = Number(product?.price);
      const currency = String(product?.currency || "").toUpperCase();
      if (!product || !Number.isFinite(price) || price <= 0 || !currency || !rates[currency]) {
        throw new Error("A product price or currency could not be verified");
      }
      return {
        productId: item.product_id,
        productName: String(product.name || "Product"),
        quantity: item.quantity,
        unitPrice: price,
        currency,
        selectedVariantId: item.selected_variant_id,
        selectedVariantSku: item.selected_variant_sku,
        selectedSize: item.selected_size,
        selectedColor: item.selected_color,
      };
    });
    const quote = await calculateDestinationCheckoutPricing({
      items: pricingItems,
      destinationCountry: String(address.country),
      destinationPostalCode: String(address.postalCode),
      rates,
      strict: true,
    });
    const selected = (quote.intlShippingOptions || quote.ukDomesticShippingOptions)?.[tier];
    if ((tier !== "standard" && !selected) || quote.intlShippingError || quote.domesticShippingError ||
        quote.ineligibleItems.length || (quote.minimumOrderConstraint && !quote.minimumOrderConstraint.isMet) ||
        quote.items.length !== cart.length ||
        quote.items.some((line) => line.convertedUnitPrice <= 0 || line.convertedLineTotal <= 0)) {
      return json({ error: "Products or the selected delivery option are no longer available. Return to review." }, 409);
    }
    const shipping = selected?.shipping ?? quote.shipping;
    const requestedDeliveryDate = typeof body.estimatedDeliveryDate === "string"
      ? new Date(body.estimatedDeliveryDate)
      : null;
    const deliveryDate = requestedDeliveryDate && Number.isFinite(requestedDeliveryDate.getTime())
      ? requestedDeliveryDate.toISOString()
      : null;
    const selectedDeliveryDays = selected?.estimatedDays
      ? parseInt(selected.estimatedDays, 10)
      : typeof body.estimatedDeliveryDays === "string"
        ? parseInt(body.estimatedDeliveryDays, 10)
        : NaN;
    const rpcItems = cart.map((item, index) => {
      const product = productMap.get(item.product_id)!;
      return {
        product_id: item.product_id,
        quantity: item.quantity,
        product_name: pricingItems[index].productName,
        product_image: product.image_url || "",
        variant_info: {
          size: item.selected_size, color: item.selected_color,
          sku: quote.items[index].selectedVariantSku || item.selected_variant_sku || product.sku,
          hsn_code: product.hsn_code,
        },
      };
    });
    const { data: sharedTotals, error: sharedTotalsError } = await db.rpc("quote_uk_hosted_checkout_total", {
      p_items: rpcItems,
      p_country: "United Kingdom",
      p_shipping_charge: shipping,
    });
    if (sharedTotalsError) throw sharedTotalsError;
    if (!isRecord(sharedTotals)) throw new Error("Shared order pricing returned an invalid quote");
    const sharedSubtotal = Number(sharedTotals.product_subtotal);
    const sharedRpcTotal = Number(sharedTotals.total_amount);
    const platformHandlingCharge = Number(sharedTotals.platform_handling_charge);
    if (!isRecord(sharedTotals.financial_snapshot)) {
      throw new Error("Shared order pricing returned no financial snapshot");
    }
    if (![sharedSubtotal, sharedRpcTotal, platformHandlingCharge].every(Number.isFinite) ||
        sharedSubtotal <= 0 || sharedRpcTotal <= 0 || platformHandlingCharge < 0) {
      throw new Error("Shared order pricing returned invalid amounts");
    }
    const snapshotLines = quote.items.map((line, index) => {
      const item = cart[index];
      const product = productMap.get(item.product_id)!;
      const productVariants = (variants || []).filter((variant) => variant.product_id === item.product_id);
      const selectedVariant = productVariants.find((variant) =>
        (line.selectedVariantId && variant.id === line.selectedVariantId) ||
        (!line.selectedVariantId && line.selectedVariantSku && token(variant.sku) === token(line.selectedVariantSku))
      );
      const sellerUnitPrice = productVariants.length > 1 && selectedVariant
        ? Number(selectedVariant.price)
        : Number(product.price);
      if (!Number.isFinite(sellerUnitPrice) || sellerUnitPrice <= 0) {
        throw new Error("A seller price could not be captured for checkout");
      }
      return { ...line, seller_unit_price: sellerUnitPrice };
    });
    const total = calculateUkHostedCheckoutTotal(sharedRpcTotal, quote.offerDiscount);
    const amount = Math.round(total * 100);
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 5_000_000 ||
        !Number.isFinite(shipping) || shipping < 0 ||
        quote.offerDiscount > sharedSubtotal ||
        Math.round((sharedRpcTotal - quote.offerDiscount) * 100) !== amount) {
      throw new Error("Quote totals are invalid");
    }
    const shippingAddress = {
      street: text(address.street), city: text(address.city), state: text(address.state),
      postalCode: text(address.postalCode), country: text(address.country), countryCode: text(address.countryCode),
      full_name: text(body.customerName), phone: text(body.customerPhone),
    };
    const snapshot = {
      user_id: auth.user.id,
      stripe_account_id: accountId,
      livemode: /^(sk|rk)_live_/.test(stripeKey),
      amount_minor: amount,
      currency: "gbp",
      quote: {
        subtotal: sharedSubtotal,
        offer_discount: quote.offerDiscount,
        shipping,
        platform_handling_charge: platformHandlingCharge,
        total,
        financial_snapshot: sharedTotals.financial_snapshot,
        lines: snapshotLines,
      },
      cart_snapshot: cart.map((item) => ({ id: item.id, quantity: item.quantity, updated_at: item.updated_at })),
      rpc_params: {
        p_user_id: auth.user.id, p_items: rpcItems,
        p_shipping_address: shippingAddress, p_billing_address: shippingAddress,
        p_phone: text(body.customerPhone), p_notes: text(body.notes),
        p_currency: "GBP", p_country: "United Kingdom",
        p_shipping_charge: shipping, p_actual_shipping_cost: quote.actualShippingCost,
        p_platform_shipping_margin: quote.platformShippingMargin,
        p_shipping_carrier: selected?.carrierName || null,
        p_shipping_service_level: selected?.serviceLevel || null,
        p_shipping_provider: selected?.provider || null,
        p_shipping_rate_id: selected?.rateId || null,
        p_expected_delivery_date: deliveryDate,
        p_expected_delivery_days: Number.isSafeInteger(selectedDeliveryDays) && selectedDeliveryDays > 0
          ? selectedDeliveryDays
          : null,
      },
    };
    const { data: saved, error: saveError } = await db.from("uk_hosted_checkout_sessions")
      .insert(snapshot).select("id").single();
    if (saveError || !saved?.id) throw saveError || new Error("Could not save checkout quote");
    return json({
      snapshotId: saved.id,
      currency: "GBP",
      total,
      shipping,
      subtotal: sharedSubtotal,
      offerDiscount: quote.offerDiscount,
      platformHandlingCharge,
    }, 200);
  } catch (error) {
    console.error("[quote-uk-hosted-checkout] Quote failed:", error);
    return json({ error: "Unable to verify your checkout. Please return to review and try again." }, 502);
  }
});
