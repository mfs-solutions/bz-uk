import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

const PAID_STATES = new Set([
  'COMPLETED',
  'AUTHORISED',
  'AUTHORIZED',
]);

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') || '';
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { orderId } = await req.json();
    const normalizedOrderId = String(orderId || '').trim();
    if (!normalizedOrderId) {
      return new Response(JSON.stringify({ error: 'orderId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const revolutSecretKey = Deno.env.get('REVOLUT_SECRET_KEY');
    if (!revolutSecretKey) {
      return new Response(JSON.stringify({ error: 'Revolut secret key not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const revolutApiBase = (Deno.env.get('REVOLUT_API_BASE_URL') || 'https://merchant.revolut.com').replace(/\/+$/, '');
    const apiVersion = Deno.env.get('REVOLUT_API_VERSION') || '2024-09-01';

    const revolutResponse = await fetch(`${revolutApiBase}/api/orders/${encodeURIComponent(normalizedOrderId)}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${revolutSecretKey}`,
        'Content-Type': 'application/json',
        'Revolut-Api-Version': apiVersion,
      },
    });

    const revolutResult = await revolutResponse.json().catch(() => null);
    if (!revolutResponse.ok) {
      const errorMessage = String(revolutResult?.message || revolutResult?.error || 'Failed to verify Revolut order');
      return new Response(JSON.stringify({ error: errorMessage }), {
        status: revolutResponse.status || 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const orderState = String(revolutResult?.state || revolutResult?.status || '').trim().toUpperCase();
    const isPaid = PAID_STATES.has(orderState);

    let recoveredOrderId: string | null = null;
    if (isPaid) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
      if (!supabaseUrl || !anonKey) {
        return new Response(JSON.stringify({ error: 'Server configuration error' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const supabase = createClient(supabaseUrl, anonKey, {
        global: {
          headers: {
            Authorization: authHeader,
          },
        },
      });

      const { error: recoverError } = await supabase.rpc('recover_order_from_checkout_snapshot', {
        p_payment_intent_id: normalizedOrderId,
      });
      if (recoverError) {
        console.error('[verify-revolut-order] recover_order_from_checkout_snapshot failed:', recoverError.message);
      }

      const { data: order } = await supabase
        .from('orders')
        .select('id')
        .eq('payment_intent_id', normalizedOrderId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      recoveredOrderId = order?.id ? String(order.id) : null;
    }

    return new Response(JSON.stringify({
      orderId: normalizedOrderId,
      orderState,
      isPaid,
      recoveredOrderId: recoveredOrderId || undefined,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
