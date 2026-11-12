// supabase/functions/stripe-webhook/index.ts
// Stripe Webhook handler — verifies signature and confirms payments server-side
//
// Deploy: supabase functions deploy stripe-webhook --no-verify-jwt
// Set secrets:
//   supabase secrets set STRIPE_SECRET_KEY=sk_live_...
//   supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
//
// Configure in Stripe Dashboard → Developers → Webhooks:
//   URL: https://<project>.supabase.co/functions/v1/stripe-webhook
//   Events: payment_intent.succeeded, payment_intent.payment_failed

import Stripe from "https://esm.sh/stripe@14.14.0?target=deno";

export {};

declare const Deno: {
  env: { get: (name: string) => string | undefined };
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function supabaseHeaders(): Record<string, string> {
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim() || '';
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
  };
}

function supabaseUrl(): string {
  return (Deno.env.get('SUPABASE_URL') || '').trim().replace(/\/+$/, '');
}

function toMajorAmount(amountMinor: number, currency: string): number {
  const zeroDecimalCurrencies = new Set(['jpy']);
  const normalized = String(currency || '').trim().toLowerCase();
  if (zeroDecimalCurrencies.has(normalized)) {
    return amountMinor;
  }
  return Number((amountMinor / 100).toFixed(2));
}

// Log webhook event for dead-letter / audit
async function logWebhookEvent(event: {
  event_id: string;
  event_type: string;
  payment_intent_id: string | null;
  status: 'processed' | 'failed' | 'skipped';
  error_message?: string;
  raw_payload: unknown;
}) {
  try {
    await fetch(`${supabaseUrl()}/rest/v1/stripe_webhook_events`, {
      method: 'POST',
      headers: { ...supabaseHeaders(), Prefer: 'return=minimal' },
      body: JSON.stringify({
        stripe_event_id: event.event_id,
        event_type: event.event_type,
        payment_intent_id: event.payment_intent_id,
        status: event.status,
        error_message: event.error_message || null,
        payload: event.raw_payload,
        processed_at: new Date().toISOString(),
      }),
    });
  } catch (err) {
    console.error('[stripe-webhook] Failed to log event:', err);
  }
}

// Check if event was already processed (idempotency)
async function isEventProcessed(stripeEventId: string): Promise<boolean> {
  try {
    const response = await fetch(
      `${supabaseUrl()}/rest/v1/stripe_webhook_events?stripe_event_id=eq.${encodeURIComponent(stripeEventId)}&status=eq.processed&select=id&limit=1`,
      { method: 'GET', headers: supabaseHeaders() },
    );
    if (!response.ok) return false;
    const rows = await response.json();
    return Array.isArray(rows) && rows.length > 0;
  } catch {
    return false;
  }
}

// Update refund_requests row from a Stripe refund object (charge.refunded / refund.updated)
async function syncRefundStatus(refund: { id: string; status?: string | null; failure_reason?: string | null }) {
  if (!refund?.id) return;
  try {
    await fetch(`${supabaseUrl()}/rest/v1/rpc/stripe_webhook_update_refund_status`, {
      method: 'POST',
      headers: { ...supabaseHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        p_stripe_refund_id: refund.id,
        p_stripe_refund_status: refund.status || 'pending',
        p_failure_reason: refund.failure_reason || null,
      }),
    });
  } catch (err) {
    console.error('[stripe-webhook] syncRefundStatus failed:', err);
  }
}

// Find order by payment_intent_id
async function findOrderByPaymentIntent(paymentIntentId: string): Promise<{ id: string; payment_status: string } | null> {
  try {
    const response = await fetch(
      `${supabaseUrl()}/rest/v1/orders?payment_intent_id=eq.${encodeURIComponent(paymentIntentId)}&select=id,payment_status&limit=1`,
      { method: 'GET', headers: supabaseHeaders() },
    );
    if (!response.ok) return null;
    const rows = await response.json();
    return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  } catch {
    return null;
  }
}

async function findCheckoutSnapshot(paymentIntentId: string): Promise<{
  rpc_params: Record<string, unknown>;
  recovery_attempts: number;
} | null> {
  try {
    const response = await fetch(
      `${supabaseUrl()}/rest/v1/checkout_payment_snapshots?payment_intent_id=eq.${encodeURIComponent(paymentIntentId)}&select=rpc_params,recovery_attempts&limit=1`,
      { method: 'GET', headers: supabaseHeaders() },
    );
    if (!response.ok) return null;
    const rows = await response.json();
    return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  } catch {
    return null;
  }
}

async function updateCheckoutSnapshotRecovery(
  paymentIntentId: string,
  patch: {
    recovery_status?: 'pending' | 'recovered' | 'failed';
    recovered_order_id?: string | null;
    recovery_attempts?: number;
    last_error?: string | null;
  },
): Promise<void> {
  try {
    await fetch(
      `${supabaseUrl()}/rest/v1/checkout_payment_snapshots?payment_intent_id=eq.${encodeURIComponent(paymentIntentId)}`,
      {
        method: 'PATCH',
        headers: { ...supabaseHeaders(), Prefer: 'return=minimal' },
        body: JSON.stringify({
          ...patch,
          updated_at: new Date().toISOString(),
        }),
      },
    );
  } catch {
    // non-fatal: this is observability only
  }
}

async function recoverOrderFromSnapshot(paymentIntentId: string): Promise<{ id: string } | null> {
  const snapshot = await findCheckoutSnapshot(paymentIntentId);
  if (!snapshot || !snapshot.rpc_params) {
    return null;
  }

  await updateCheckoutSnapshotRecovery(paymentIntentId, {
    recovery_attempts: Number(snapshot.recovery_attempts || 0) + 1,
    recovery_status: 'pending',
  });

  const response = await fetch(`${supabaseUrl()}/rest/v1/rpc/recover_paid_order_from_snapshot`, {
    method: 'POST',
    headers: { ...supabaseHeaders(), Prefer: 'return=representation' },
    body: JSON.stringify({ p_payment_intent_id: paymentIntentId }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    await updateCheckoutSnapshotRecovery(paymentIntentId, {
      recovery_status: 'failed',
      last_error: `create_order_secure failed: ${errorText.slice(0, 500)}`,
    });
    throw new Error(`create_order_secure failed: ${errorText}`);
  }

  const data = await response.json() as { id?: string } | null;
  if (!data?.id) {
    await updateCheckoutSnapshotRecovery(paymentIntentId, {
      recovery_status: 'failed',
      last_error: 'create_order_secure returned no order id',
    });
    throw new Error('create_order_secure returned no order id');
  }

  await updateCheckoutSnapshotRecovery(paymentIntentId, {
    recovery_status: 'recovered',
    recovered_order_id: data.id,
    last_error: null,
  });
  return { id: data.id };
}

async function recordPaymentIntent(orderId: string, paymentIntent: Stripe.PaymentIntent): Promise<void> {
  const paymentIntentId = paymentIntent?.id;
  if (!paymentIntentId) return;

  try {
    const existingResponse = await fetch(
      `${supabaseUrl()}/rest/v1/payment_intents?stripe_payment_intent_id=eq.${encodeURIComponent(paymentIntentId)}&select=id&limit=1`,
      { method: 'GET', headers: supabaseHeaders() },
    );
    if (existingResponse.ok) {
      const existingRows = await existingResponse.json();
      if (Array.isArray(existingRows) && existingRows.length > 0) {
        return;
      }
    }

    await fetch(`${supabaseUrl()}/rest/v1/payment_intents`, {
      method: 'POST',
      headers: { ...supabaseHeaders(), Prefer: 'return=minimal' },
      body: JSON.stringify({
        order_id: orderId,
        stripe_payment_intent_id: paymentIntentId,
        status: paymentIntent.status,
        amount: toMajorAmount(paymentIntent.amount || 0, paymentIntent.currency || 'inr'),
        currency: String(paymentIntent.currency || 'inr').toLowerCase(),
      }),
    });
  } catch {
    // non-fatal for fulfillment flow
  }
}

// Confirm payment via direct DB update (service role — bypasses RLS)
async function confirmPayment(orderId: string): Promise<boolean> {
  try {
    const response = await fetch(
      `${supabaseUrl()}/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}&payment_status=neq.completed`,
      {
        method: 'PATCH',
        headers: { ...supabaseHeaders(), Prefer: 'return=minimal' },
        body: JSON.stringify({
          payment_status: 'completed',
          updated_at: new Date().toISOString(),
        }),
      },
    );
    return response.ok;
  } catch {
    return false;
  }
}

// Capture Stripe processing fee from balance_transaction and persist on order.
// Locked: only writes when orders.stripe_fee is currently NULL.
async function recordStripeFee(
  orderId: string,
  paymentIntent: Stripe.PaymentIntent,
  stripe: Stripe,
): Promise<void> {
  try {
    const chargeId =
      (typeof paymentIntent.latest_charge === 'string'
        ? paymentIntent.latest_charge
        : paymentIntent.latest_charge?.id) || null;
    if (!chargeId) return;

    const charge = await stripe.charges.retrieve(chargeId, {
      expand: ['balance_transaction'],
    });
    const bt = charge.balance_transaction;
    if (!bt || typeof bt === 'string') return;

    const feeMajor = toMajorAmount(bt.fee || 0, bt.currency || paymentIntent.currency || 'inr');
    if (!Number.isFinite(feeMajor) || feeMajor <= 0) return;

    await fetch(
      `${supabaseUrl()}/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}&stripe_fee=is.null`,
      {
        method: 'PATCH',
        headers: { ...supabaseHeaders(), Prefer: 'return=minimal' },
        body: JSON.stringify({ stripe_fee: feeMajor }),
      },
    );
  } catch (err) {
    // Non-fatal: fulfillment must not block on fee capture
    console.warn(`[stripe-webhook] recordStripeFee failed for order ${orderId}:`, err);
  }
}

// ─── order_placed email dispatch ──────────────────────────────────
//
// Fires from payment_intent.succeeded so buyer / seller / admin always get
// the order confirmation email even when the buyer never returns to the
// checkout success page (e.g. 3DS / UPI / wallet redirect, tab closed).
// `send-email` already deduplicates by (order_id, event_type, recipient_type,
// email) so calling it again from the client is safe.
async function fetchOne<T = any>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, { method: 'GET', headers: supabaseHeaders() });
    if (!r.ok) return null;
    const rows = await r.json();
    return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  } catch { return null; }
}

async function fetchMany<T = any>(url: string): Promise<T[]> {
  try {
    const r = await fetch(url, { method: 'GET', headers: supabaseHeaders() });
    if (!r.ok) return [];
    const rows = await r.json();
    return Array.isArray(rows) ? rows : [];
  } catch { return []; }
}

async function sendOrderPlacedEmail(orderId: string): Promise<void> {
  try {
    // 1. Order + buyer (incl. shipping address and buyer-side totals)
    const order = await fetchOne<{
      id: string;
      order_number: string;
      user_id: string;
      total_amount: number;
      currency: string;
      payment_method: string | null;
      shipping_carrier: string | null;
      shipping_service_level: string | null;
      expected_delivery_date: string | null;
      shipping_address: Record<string, unknown> | null;
      created_at: string;
    }>(
      `${supabaseUrl()}/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}` +
      `&select=id,order_number,user_id,total_amount,currency,payment_method,shipping_carrier,shipping_service_level,expected_delivery_date,shipping_address,created_at&limit=1`,
    );
    if (!order) {
      console.warn(`[stripe-webhook] sendOrderPlacedEmail: order not found ${orderId}`);
      return;
    }

    const buyer = await fetchOne<{ id: string; email: string; full_name: string | null }>(
      `${supabaseUrl()}/rest/v1/profiles?id=eq.${encodeURIComponent(order.user_id)}&select=id,email,full_name&limit=1`,
    );

    // 2. Order items — pull BOTH sides (buyer-currency markup + seller-currency listed price)
    type OrderItemRow = {
      product_name: string | null;
      quantity: number;
      price: number | null;                // legacy / buyer-currency unit price
      seller_id: string | null;
      customer_unit_price: number | null;
      customer_line_total: number | null;
      buyer_currency: string | null;
      seller_unit_price: number | null;
      seller_line_total: number | null;
      seller_currency: string | null;
    };
    const items = await fetchMany<OrderItemRow>(
      `${supabaseUrl()}/rest/v1/order_items?order_id=eq.${encodeURIComponent(orderId)}` +
      `&select=product_name,quantity,price,seller_id,customer_unit_price,customer_line_total,buyer_currency,seller_unit_price,seller_line_total,seller_currency`,
    );

    const buyerCcy = String(order.currency || 'INR').toUpperCase();

    // Items as buyer sees them (buyer-currency line totals)
    const buyerItems = items.map((it) => {
      const lineTotal = Number(
        it.customer_line_total ?? ((it.customer_unit_price ?? it.price ?? 0) * (it.quantity || 1)),
      );
      return {
        name: it.product_name || 'Item',
        quantity: it.quantity,
        price: `${buyerCcy} ${lineTotal.toFixed(2)}`,
      };
    });

    const sellerIds = Array.from(new Set(
      items.map((it) => it.seller_id).filter((x): x is string => !!x),
    ));
    const sellers = sellerIds.length > 0
      ? await fetchMany<{ id: string; email: string; full_name: string | null }>(
          `${supabaseUrl()}/rest/v1/profiles?id=in.(${sellerIds.map(encodeURIComponent).join(',')})&select=id,email,full_name`,
        )
      : [];

    const admins = await fetchMany<{ id: string; email: string; full_name: string | null }>(
      `${supabaseUrl()}/rest/v1/profiles?role=eq.admin&select=id,email,full_name`,
    );

    // ── Shipping address (denormalised JSON on orders) ──
    const sa = order.shipping_address || {};
    const pick = (...keys: string[]): string => {
      for (const k of keys) {
        const v = (sa as Record<string, unknown>)[k];
        if (typeof v === 'string' && v.trim()) return v.trim();
      }
      return '';
    };
    const buyerName = pick('full_name', 'name', 'fullName') || buyer?.full_name || 'Customer';
    const shipLines = [
      buyerName,
      pick('address_line1', 'addressLine1', 'line1', 'street', 'address'),
      pick('address_line2', 'addressLine2', 'line2'),
      [pick('city', 'town'), pick('state', 'region'), pick('postal_code', 'postalCode', 'zip')]
        .filter(Boolean).join(', '),
      pick('country', 'countryName'),
      pick('phone', 'mobile') ? `Phone: ${pick('phone', 'mobile')}` : '',
    ].filter(Boolean);
    const buyerAddressStr = shipLines.join('\n');

    const orderIdShort = order.id.slice(0, 8).toUpperCase();
    const orderDateStr = new Date(order.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

    // ── Common shipping/delivery hints ──
    const commonShip: Record<string, string> = {};
    if (order.shipping_carrier) commonShip.carrier = order.shipping_carrier;
    if (order.shipping_service_level) commonShip.service_level = order.shipping_service_level;
    if (order.expected_delivery_date) {
      commonShip.delivery_date = new Date(order.expected_delivery_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    }

    // ── BUYER payload — buyer-currency, full totals ──
    const buyerData: Record<string, unknown> = {
      order_id: orderIdShort,
      order_date: orderDateStr,
      customer_name: buyerName,
      currency: buyerCcy,
      order_total: Number(order.total_amount || 0).toFixed(2),
      payment_method: order.payment_method === 'cod' ? 'Cash on Delivery' : 'Card',
      items: buyerItems,
      ...commonShip,
    };

    // ── ADMIN payload — same shape as buyer (admin section adds breakdown) ──
    const adminData: Record<string, unknown> = { ...buyerData };

    // ── SELLER payload — per seller; ONLY order details, seller-currency listed prices ──
    // No order_total, no currency, no payment_method (those rows auto-hide in template).
    // Items use seller_unit_price × qty in seller_currency.
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim() || '';
    const sendEmailUrl = `${supabaseUrl()}/functions/v1/send-email`;
    const sendHeaders = {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    };

    let totalSent = 0, totalSkipped = 0, totalFailed = 0;
    const callSendEmail = async (label: string, payload: unknown) => {
      try {
        const resp = await fetch(sendEmailUrl, { method: 'POST', headers: sendHeaders, body: JSON.stringify(payload) });
        if (!resp.ok) {
          const txt = await resp.text();
          console.error(`[stripe-webhook] sendOrderPlacedEmail[${label}]: send-email HTTP ${resp.status}: ${txt.slice(0, 300)}`);
          return;
        }
        const r = await resp.json().catch(() => ({}));
        totalSent += r.sent || 0;
        totalSkipped += r.skipped || 0;
        totalFailed += r.failed || 0;
      } catch (e) {
        console.error(`[stripe-webhook] sendOrderPlacedEmail[${label}] error:`, e);
      }
    };

    // (a) Buyer
    if (buyer?.email) {
      await callSendEmail('buyer', {
        eventType: 'order_placed',
        data: buyerData,
        recipients: [{
          email: buyer.email,
          recipientType: 'buyer',
          recipientName: buyer.full_name || 'Customer',
          recipientUserId: buyer.id,
        }],
      });
    }

    // (b) Sellers — one call per seller with seller-scoped data
    for (const s of sellers) {
      if (!s.email) continue;
      const myItems = items.filter((it) => it.seller_id === s.id);
      if (myItems.length === 0) continue;

      const sellerCcy = String(myItems[0].seller_currency || 'INR').toUpperCase();
      const sellerItems = myItems.map((it) => {
        const unit = Number(it.seller_unit_price ?? 0);
        const qty = Number(it.quantity || 1);
        const lineTotal = Number(it.seller_line_total ?? (unit * qty));
        return {
          name: it.product_name || 'Item',
          quantity: qty,
          price: `${sellerCcy} ${lineTotal.toFixed(2)}`,
        };
      });

      const sellerData: Record<string, unknown> = {
        order_id: orderIdShort,
        order_date: orderDateStr,
        customer_name: buyerName,
        items: sellerItems,
        // Ship-to address (renders for seller via renderEmailHtml)
        buyer_address: buyerAddressStr,
        // NO order_total, NO currency, NO payment_method — seller does not see money breakdown
      };

      await callSendEmail(`seller:${s.id}`, {
        eventType: 'order_placed',
        data: sellerData,
        recipients: [{
          email: s.email,
          recipientType: 'seller',
          recipientName: s.full_name || 'Seller',
          recipientUserId: s.id,
        }],
      });
    }

    // (c) Admins — full buyer-currency payload
    const adminRecipients = admins
      .filter((a) => a.email)
      .map((a) => ({ email: a.email, recipientType: 'admin' as const, recipientName: a.full_name || 'Admin', recipientUserId: a.id }));
    if (adminRecipients.length > 0) {
      await callSendEmail('admins', {
        eventType: 'order_placed',
        data: adminData,
        recipients: adminRecipients,
      });
    }

    console.info(`[stripe-webhook] sendOrderPlacedEmail: ${orderId} sent=${totalSent} skipped=${totalSkipped} failed=${totalFailed}`);
  } catch (err) {
    // Non-fatal: payment confirmation must not block on email
    console.error('[stripe-webhook] sendOrderPlacedEmail unhandled error:', err);
  }
}

// Mark payment as failed
async function markPaymentFailed(orderId: string): Promise<boolean> {
  try {
    const response = await fetch(
      `${supabaseUrl()}/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}`,
      {
        method: 'PATCH',
        headers: { ...supabaseHeaders(), Prefer: 'return=minimal' },
        body: JSON.stringify({
          payment_status: 'failed',
          status: 'cancelled',
          updated_at: new Date().toISOString(),
        }),
      },
    );
    return response.ok;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  // Only accept POST
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')?.trim();
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')?.trim();

  if (!stripeKey || !webhookSecret) {
    console.error('[stripe-webhook] Missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET');
    return json({ error: 'Webhook not configured' }, 500);
  }

  // Read raw body for signature verification
  const contentLength = Number(req.headers.get('content-length') || '0');
  if (contentLength > 1_048_576) {
    console.error('[stripe-webhook] Payload too large:', contentLength);
    return json({ error: 'Payload too large' }, 413);
  }
  const rawBody = await req.text();
  const signature = req.headers.get('stripe-signature');

  if (!signature) {
    console.error('[stripe-webhook] Missing stripe-signature header');
    return json({ error: 'Missing signature' }, 400);
  }

  // Verify Stripe signature
  const stripe = new Stripe(stripeKey, {
    apiVersion: '2023-10-16',
    httpClient: Stripe.createFetchHttpClient(),
  });

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      webhookSecret,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Signature verification failed';
    console.error(`[stripe-webhook] Signature verification failed: ${msg}`);
    return json({ error: 'Invalid signature' }, 400);
  }

  // Idempotency: skip if already processed
  if (await isEventProcessed(event.id)) {
    console.log(`[stripe-webhook] Event ${event.id} already processed, skipping`);
    return json({ received: true, skipped: true });
  }

  const paymentIntent = event.data.object as Stripe.PaymentIntent;
  const paymentIntentId = paymentIntent?.id || null;

  try {
    switch (event.type) {
      case 'payment_intent.succeeded': {
        if (!paymentIntentId) {
          await logWebhookEvent({
            event_id: event.id,
            event_type: event.type,
            payment_intent_id: null,
            status: 'failed',
            error_message: 'No payment_intent_id in event',
            raw_payload: event.data.object,
          });
          return json({ received: true, error: 'No payment intent ID' });
        }

        // Find order (or recover it from a checkout snapshot)
        let order = await findOrderByPaymentIntent(paymentIntentId);
        if (!order) {
          console.warn(`[stripe-webhook] No order found for PI ${paymentIntentId}, attempting recovery`);
          const recovered = await recoverOrderFromSnapshot(paymentIntentId);

          if (!recovered) {
            await logWebhookEvent({
              event_id: event.id,
              event_type: event.type,
              payment_intent_id: paymentIntentId,
              status: 'failed',
              error_message: 'Order missing and no checkout snapshot found for recovery',
              raw_payload: event.data.object,
            });
            return json({ received: false, error: 'Order recovery snapshot not found' }, 500);
          }

          order = await findOrderByPaymentIntent(paymentIntentId);
          if (!order) {
            await logWebhookEvent({
              event_id: event.id,
              event_type: event.type,
              payment_intent_id: paymentIntentId,
              status: 'failed',
              error_message: 'Recovered order not queryable by payment_intent_id',
              raw_payload: event.data.object,
            });
            return json({ received: false, error: 'Recovered order lookup failed' }, 500);
          }
        }

        // Already confirmed
        if (['completed', 'succeeded'].includes(order.payment_status)) {
          await recordPaymentIntent(order.id, paymentIntent);
          await recordStripeFee(order.id, paymentIntent, stripe);
          // Backfill order_placed email if the client never fired it.
          // send-email is idempotent on (order_id, event_type, recipient_type, email).
          await sendOrderPlacedEmail(order.id);
          await logWebhookEvent({
            event_id: event.id,
            event_type: event.type,
            payment_intent_id: paymentIntentId,
            status: 'skipped',
            error_message: `Already ${order.payment_status}`,
            raw_payload: event.data.object,
          });
          return json({ received: true });
        }

        // Confirm payment
        const confirmed = await confirmPayment(order.id);
        await recordPaymentIntent(order.id, paymentIntent);
        await recordStripeFee(order.id, paymentIntent, stripe);
        if (confirmed) {
          // Server-side order_placed email so buyer / seller / admin always get
          // notified even if the buyer never returned to the checkout success page.
          await sendOrderPlacedEmail(order.id);
        }
        await logWebhookEvent({
          event_id: event.id,
          event_type: event.type,
          payment_intent_id: paymentIntentId,
          status: confirmed ? 'processed' : 'failed',
          error_message: confirmed ? undefined : 'DB update failed',
          raw_payload: event.data.object,
        });

        console.log(`[stripe-webhook] Payment confirmed for order ${order.id}`);
        break;
      }

      case 'payment_intent.payment_failed': {
        if (!paymentIntentId) break;

        const order = await findOrderByPaymentIntent(paymentIntentId);
        if (order && !['completed', 'succeeded'].includes(order.payment_status)) {
          await markPaymentFailed(order.id);
          console.warn(`[stripe-webhook] Payment failed for order ${order.id}`);
        }

        await logWebhookEvent({
          event_id: event.id,
          event_type: event.type,
          payment_intent_id: paymentIntentId,
          status: 'processed',
          raw_payload: event.data.object,
        });
        break;
      }

      case 'refund.updated':
      case 'refund.failed':
      case 'refund.created': {
        // event.data.object is a Stripe.Refund here, NOT a PaymentIntent.
        const refund = event.data.object as unknown as Stripe.Refund;
        await syncRefundStatus({
          id: refund.id,
          status: refund.status,
          failure_reason: refund.failure_reason,
        });
        await logWebhookEvent({
          event_id: event.id,
          event_type: event.type,
          payment_intent_id: (refund.payment_intent as string) || null,
          status: 'processed',
          raw_payload: event.data.object,
        });
        break;
      }

      case 'charge.refunded':
      case 'charge.refund.updated': {
        // event.data.object is a Stripe.Charge — refunds are inside charge.refunds.data
        const charge = event.data.object as unknown as Stripe.Charge;
        const refunds = charge.refunds?.data || [];
        for (const r of refunds) {
          await syncRefundStatus({
            id: r.id,
            status: r.status,
            failure_reason: r.failure_reason,
          });
        }
        await logWebhookEvent({
          event_id: event.id,
          event_type: event.type,
          payment_intent_id: (charge.payment_intent as string) || null,
          status: 'processed',
          raw_payload: event.data.object,
        });
        break;
      }

      default:
        // Log unhandled events for audit
        await logWebhookEvent({
          event_id: event.id,
          event_type: event.type,
          payment_intent_id: paymentIntentId,
          status: 'skipped',
          error_message: `Unhandled event type: ${event.type}`,
          raw_payload: event.data.object,
        });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown processing error';
    console.error(`[stripe-webhook] Processing error: ${msg}`);
    await logWebhookEvent({
      event_id: event.id,
      event_type: event.type,
      payment_intent_id: paymentIntentId,
      status: 'failed',
      error_message: msg,
      raw_payload: event.data.object,
    });
    // Return non-2xx so Stripe retries transient failures automatically.
    return json({ received: false, error: msg }, 500);
  }

  return json({ received: true });
});
