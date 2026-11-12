// supabase/functions/exchange-rates/index.ts
// Secure proxy for exchange rate API — keeps API key server-side.
//
// Deploy: supabase functions deploy exchange-rates --no-verify-jwt
// Set secret: supabase secrets set EXCHANGERATE_API_KEY=your-key
//
// GET → returns { rates: { USD: 1, INR: 83.5, ... } }

export {};

declare const Deno: {
  env: { get: (name: string) => string | undefined };
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

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
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  };
}

// In-memory cache — edge functions are short-lived but this helps within a warm instance
let cachedRates: Record<string, number> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 3600_000; // 1 hour

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // Return cached rates if still fresh
    const now = Date.now();
    if (cachedRates && (now - cacheTimestamp) < CACHE_TTL) {
      return new Response(JSON.stringify({ rates: cachedRates }), {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=3600',
        },
      });
    }

    const apiKey = (Deno.env.get('EXCHANGERATE_API_KEY') || '').trim();

    // Try paid API first (if key is configured)
    if (apiKey) {
      try {
        const res = await fetch(
          `https://v6.exchangerate-api.com/v6/${apiKey}/latest/USD`,
          { signal: AbortSignal.timeout(8000) },
        );
        if (res.ok) {
          const json = await res.json();
          const rates = json.conversion_rates;
          if (rates && typeof rates === 'object' && rates.USD) {
            cachedRates = rates;
            cacheTimestamp = now;
            return new Response(JSON.stringify({ rates }), {
              status: 200,
              headers: {
                ...corsHeaders,
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=3600',
              },
            });
          }
        }
      } catch {
        // fall through to public fallback
      }
    }

    // Fallback: free public API (no key needed)
    try {
      const res = await fetch(
        'https://open.er-api.com/v6/latest/USD',
        { signal: AbortSignal.timeout(8000) },
      );
      if (res.ok) {
        const json = await res.json();
        const rates = json.rates;
        if (rates && typeof rates === 'object' && rates.USD) {
          cachedRates = rates;
          cacheTimestamp = now;
          return new Response(JSON.stringify({ rates }), {
            status: 200,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json',
              'Cache-Control': 'public, max-age=3600',
            },
          });
        }
      }
    } catch {
      // both failed
    }

    // All APIs failed — return 503
    return new Response(
      JSON.stringify({ error: 'Exchange rate providers unavailable' }),
      {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
