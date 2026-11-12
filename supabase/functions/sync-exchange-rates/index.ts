// supabase/functions/sync-exchange-rates/index.ts
// Internal scheduled function — fetches live exchange rates and overwrites
// exchange_rate column in the countries table (base: 1 USD = N local units).
//
// Invoked by: pg_cron via pg_net every hour at :05 UTC
// Deploy: supabase functions deploy sync-exchange-rates --no-verify-jwt
//
// Required Supabase secrets (auto-provided by platform):
//   SUPABASE_URL              — project REST endpoint
//   SUPABASE_SERVICE_ROLE_KEY — full DB write access
//
// Optional secret (improves rate data quality):
//   EXCHANGERATE_API_KEY      — paid ExchangeRate-API v6 key
//   supabase secrets set EXCHANGERATE_API_KEY=your-key

export {};

declare const Deno: {
  env: { get: (name: string) => string | undefined };
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

Deno.serve(async (_req: Request) => {
  try {
    const supabaseUrl = (Deno.env.get('SUPABASE_URL') || '').trim();
    const serviceRoleKey = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim();
    const apiKey = (Deno.env.get('EXCHANGERATE_API_KEY') || '').trim();

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // ── Step 1: Fetch latest rates (base USD = 1) ─────────────────────────
    // Retries up to 2 full rounds (paid API → free API) before giving up.
    // If both rounds fail the DB is NOT updated — existing rates are preserved.
    let rates: Record<string, number> | null = null;

    for (let round = 1; round <= 2 && !rates; round++) {
      // Primary: paid ExchangeRate-API v6 (if key is set)
      if (apiKey && !rates) {
        try {
          const res = await fetch(
            `https://v6.exchangerate-api.com/v6/${apiKey}/latest/USD`,
            { signal: AbortSignal.timeout(10_000) },
          );
          if (res.ok) {
            const json = await res.json();
            if (
              json.conversion_rates &&
              typeof json.conversion_rates === 'object' &&
              json.conversion_rates.USD
            ) {
              rates = json.conversion_rates as Record<string, number>;
            }
          }
        } catch { /* fall through to free API */ }
      }

      // Fallback within the round: free public API (no key, updates ~daily)
      if (!rates) {
        try {
          const res = await fetch(
            'https://open.er-api.com/v6/latest/USD',
            { signal: AbortSignal.timeout(10_000) },
          );
          if (res.ok) {
            const json = await res.json();
            if (json.rates && typeof json.rates === 'object' && json.rates.USD) {
              rates = json.rates as Record<string, number>;
            }
          }
        } catch { /* fall through to next round */ }
      }
    }

    if (!rates) {
      // Both rounds failed — DB retains existing exchange_rate values.
      // pg_cron will retry automatically on the next hourly schedule.
      return new Response(
        JSON.stringify({ error: 'All exchange rate providers unavailable — existing rates preserved' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // ── Step 2: Bulk-overwrite exchange_rate via update_exchange_rates RPC ─
    // Single SQL UPDATE for all currencies — see migration for function def.
    const rpcRes = await fetch(`${supabaseUrl}/rest/v1/rpc/update_exchange_rates`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({ rates }),
    });

    if (!rpcRes.ok) {
      const errText = await rpcRes.text();
      return new Response(
        JSON.stringify({ error: `RPC update_exchange_rates failed: ${errText}` }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const rowsUpdated: number = await rpcRes.json();

    return new Response(
      JSON.stringify({
        success: true,
        rates_fetched: Object.keys(rates).length,
        rows_updated: rowsUpdated,
        timestamp: new Date().toISOString(),
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
});
