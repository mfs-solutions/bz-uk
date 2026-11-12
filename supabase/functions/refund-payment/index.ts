// supabase/functions/refund-payment/index.ts
// Admin-triggered Stripe refund.
//
// Deploy:  supabase functions deploy refund-payment
// Secrets: STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto)
//
// Request body: { refund_request_id: string }
// Response:     { ok: true, stripe_refund_id, status } | { error }
//
// Flow:
//   1. Verify caller is admin (Supabase JWT + profiles.role check)
//   2. Look up the refund_requests row + order.payment_intent_id via RPC
//   3. Call stripe.refunds.create({ payment_intent, amount, metadata })
//   4. Persist Stripe response via admin_mark_refund_paid RPC
//   5. (Webhook keeps the row in sync as the bank settlement progresses)

import Stripe from 'https://esm.sh/stripe@14.14.0?target=deno';

const ALLOWED_ORIGINS = [
  'https://bzead.uk',
  'https://www.bzead.uk',
  'https://bzead.in',
  'https://www.bzead.in',
  'https://bzead.asia',
  'https://www.bzead.asia',
  'https://bzead.eu',
  'https://www.bzead.eu',
  'https://www.bzead.com',
  'https://bzead.com',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'https://localhost',
  'capacitor://localhost',
  'ionic://localhost',
];

function corsHeaders(req: Request) {
  const origin = req.headers.get('origin') || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extra },
  });
}

// Stripe expects the smallest currency unit. Most currencies = ×100;
// zero-decimal currencies (JPY, KRW, VND, ...) are passed as-is.
const ZERO_DECIMAL = new Set([
  'BIF','CLP','DJF','GNF','JPY','KMF','KRW','MGA','PYG','RWF','UGX','VND','VUV','XAF','XOF','XPF',
]);

function toStripeMinorUnit(amount: number, currency: string): number {
  const cur = currency.toUpperCase();
  if (ZERO_DECIMAL.has(cur)) return Math.round(amount);
  return Math.round(amount * 100);
}

Deno.serve(async (req: Request) => {
  const cors = corsHeaders(req);

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors);

  try {
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')?.trim();
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!stripeKey || !supabaseUrl || !serviceRoleKey) {
      console.error('[refund-payment] Missing required environment variables');
      return json({ error: 'Server configuration error' }, 500, cors);
    }

    // ── 1. Authn / Authz ───────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'Authentication required' }, 401, cors);
    }
    const jwt = authHeader.replace('Bearer ', '').trim();

    const authRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: serviceRoleKey, Authorization: `Bearer ${jwt}` },
    });
    if (!authRes.ok) {
      return json({ error: 'Invalid authentication token' }, 401, cors);
    }
    const authUser = await authRes.json() as { id?: string };
    if (!authUser?.id) return json({ error: 'Invalid authentication token' }, 401, cors);

    // Check admin role
    const profRes = await fetch(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${authUser.id}&select=role&limit=1`,
      { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } },
    );
    if (!profRes.ok) return json({ error: 'Role check failed' }, 500, cors);
    const profRows = await profRes.json() as Array<{ role?: string }>;
    if (!profRows.length || profRows[0].role !== 'admin') {
      return json({ error: 'Admin role required' }, 403, cors);
    }

    // ── 2. Parse body ──────────────────────────────────────────
    const contentLength = Number(req.headers.get('content-length') || '0');
    if (contentLength > 8192) return json({ error: 'Request too large' }, 413, cors);
    const body = await req.json().catch(() => ({})) as { refund_request_id?: string };
    const requestId = (body.refund_request_id || '').trim();
    if (!requestId) return json({ error: 'refund_request_id is required' }, 400, cors);

    // ── 3. Load context via RPC (uses caller JWT so admin check runs again) ──
    const ctxRes = await fetch(`${supabaseUrl}/rest/v1/rpc/admin_get_refund_payout_context`, {
      method: 'POST',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${jwt}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_request_id: requestId }),
    });
    if (!ctxRes.ok) {
      const txt = await ctxRes.text().catch(() => '');
      console.error('[refund-payment] context RPC failed:', ctxRes.status, txt);
      return json({ error: 'Failed to load refund context' }, 400, cors);
    }
    const ctxRows = await ctxRes.json() as Array<{
      request_id: string;
      refund_number: string;
      order_id: string;
      payment_intent_id: string | null;
      amount: number | string;
      currency: string;
      current_status: string;
    }>;
    if (!ctxRows.length) return json({ error: 'Refund request not found' }, 404, cors);
    const ctx = ctxRows[0];

    if (!['accepted', 'failed'].includes(ctx.current_status)) {
      return json({
        error: `Refund cannot be paid in status "${ctx.current_status}". Only accepted (or previously failed) requests are payable.`,
      }, 409, cors);
    }
    if (!ctx.payment_intent_id) {
      return json({ error: 'Order has no Stripe payment_intent_id; refund cannot be issued.' }, 422, cors);
    }

    // ── 4. Call Stripe ────────────────────────────────────────
    const stripe = new Stripe(stripeKey, {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient(),
    });

    const amountMinor = toStripeMinorUnit(Number(ctx.amount), ctx.currency);
    let refund: Stripe.Refund;
    try {
      refund = await stripe.refunds.create(
        {
          payment_intent: ctx.payment_intent_id,
          amount: amountMinor,
          metadata: {
            refund_request_id: ctx.request_id,
            refund_number: ctx.refund_number,
            order_id: ctx.order_id,
          },
        },
        {
          // Idempotency: re-running with same request_id will not double-refund.
          idempotencyKey: `refund_request_${ctx.request_id}`,
        },
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Stripe refund failed';
      console.error('[refund-payment] stripe.refunds.create failed:', msg);
      return json({ error: msg }, 502, cors);
    }

    // ── 5. Persist result ─────────────────────────────────────
    const markRes = await fetch(`${supabaseUrl}/rest/v1/rpc/admin_mark_refund_paid`, {
      method: 'POST',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${jwt}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_request_id: ctx.request_id,
        p_stripe_refund_id: refund.id,
        p_stripe_refund_status: refund.status || 'pending',
      }),
    });
    if (!markRes.ok) {
      const txt = await markRes.text().catch(() => '');
      console.error('[refund-payment] admin_mark_refund_paid failed:', markRes.status, txt);
      // Refund was created at Stripe but we failed to persist. Return the Stripe
      // refund id so the admin can reconcile manually.
      return json({
        ok: false,
        warning: 'Stripe refund created but DB update failed; please reconcile.',
        stripe_refund_id: refund.id,
        status: refund.status,
        db_error: txt,
      }, 207, cors);
    }

    return json({
      ok: true,
      stripe_refund_id: refund.id,
      status: refund.status,
    }, 200, cors);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[refund-payment] unexpected:', msg);
    return json({ error: msg }, 500, cors);
  }
});
