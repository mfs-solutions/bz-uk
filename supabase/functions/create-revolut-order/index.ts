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

const MAX_AMOUNT = 50_000_00;

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') || '';
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

function normalizeUrl(input: string, fallback: string): string {
  try {
    return new URL(input).toString();
  } catch {
    return fallback;
  }
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
    const revolutSecretKey = Deno.env.get('REVOLUT_SECRET_KEY');
    if (!revolutSecretKey) {
      return new Response(JSON.stringify({ error: 'Revolut secret key not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const contentLength = Number(req.headers.get('content-length') || '0');
    if (contentLength > 65_536) {
      return new Response(JSON.stringify({ error: 'Request too large' }), {
        status: 413,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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

    const { data: authUser, error: authError } = await supabase.auth.getUser();
    if (authError || !authUser?.user?.id) {
      return new Response(JSON.stringify({ error: 'Invalid authentication token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const {
      amount,
      currency,
      description,
      metadata,
      customer,
      returnUrl,
      cancelUrl,
      failureUrl,
    } = await req.json();

    if (!amount || typeof amount !== 'number' || amount <= 0 || amount > MAX_AMOUNT) {
      return new Response(
        JSON.stringify({ error: `Invalid amount — must be between 1 and ${MAX_AMOUNT}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const normalizedCurrency = String(currency || '').trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(normalizedCurrency)) {
      return new Response(JSON.stringify({ error: 'Invalid currency — must be 3-letter ISO code' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const normalizedReturnUrl = normalizeUrl(String(returnUrl || ''), 'https://bzead.uk/checkout/confirmation');
    const normalizedCancelUrl = normalizeUrl(String(cancelUrl || ''), normalizedReturnUrl);
    const normalizedFailureUrl = normalizeUrl(String(failureUrl || ''), normalizedReturnUrl);

    const apiVersion = Deno.env.get('REVOLUT_API_VERSION') || '2024-09-01';
    const revolutApiBase = (Deno.env.get('REVOLUT_API_BASE_URL') || 'https://merchant.revolut.com').replace(/\/+$/, '');

    const revolutPayload: Record<string, unknown> = {
      amount: Math.round(amount),
      currency: normalizedCurrency,
      description: String(description || 'BZEAD order payment').slice(0, 255),
      metadata: {
        ...(metadata && typeof metadata === 'object' ? metadata : {}),
        source: 'bzeadstore',
        user_id: authUser.user.id,
      },
      customer: {
        email: String(customer?.email || '').trim() || undefined,
        full_name: String(customer?.fullName || '').trim() || undefined,
      },
      checkout: {
        public_id: true,
        return_url: normalizedReturnUrl,
        cancel_url: normalizedCancelUrl,
        failure_url: normalizedFailureUrl,
      },
    };

    const revolutResponse = await fetch(`${revolutApiBase}/api/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${revolutSecretKey}`,
        'Content-Type': 'application/json',
        'Revolut-Api-Version': apiVersion,
      },
      body: JSON.stringify(revolutPayload),
    });

    const revolutResult = await revolutResponse.json().catch(() => null);
    if (!revolutResponse.ok) {
      const errorMessage = String(revolutResult?.message || revolutResult?.error || 'Failed to create Revolut order');
      return new Response(JSON.stringify({ error: errorMessage }), {
        status: revolutResponse.status || 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const orderId = String(revolutResult?.id || '').trim();
    if (!orderId) {
      return new Response(JSON.stringify({ error: 'Revolut order ID missing in response' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const publicOrderId = String(revolutResult?.token || revolutResult?.public_id || '').trim() || undefined;
    const checkoutUrl = String(
      revolutResult?.checkout_url
      || revolutResult?.checkout?.url
      || revolutResult?.payment_url
      || ''
    ).trim() || undefined;

    return new Response(JSON.stringify({
      orderId,
      publicOrderId,
      checkoutUrl,
      rawStatus: revolutResult?.state || revolutResult?.status || null,
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
