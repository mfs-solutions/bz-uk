export {};

declare const Deno: {
  env: { get: (name: string) => string | undefined };
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

// ─── Constants ─────────────────────────────────────────────────

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

const SHIPPO_API_BASE = 'https://api.goshippo.com';

/**
 * Platform operational markup added to every Shippo shipping rate.
 * Read from `shipping_provider_config` table at runtime.
 * Fallback values used if DB lookup fails.
 */
const FALLBACK_DOMESTIC_MARKUP = 1.05;
const FALLBACK_INTL_MARKUP = 1.60;
const FALLBACK_MARKUP_CURRENCY = 'GBP';

// ─── Rate Cache (in-memory, LRU) ──────────────────────────────

const RATE_CACHE_TTL_MS = 5 * 60 * 1000;
const RATE_CACHE_MAX_SIZE = 200;

interface CachedRate {
  data: unknown;
  expiresAt: number;
}

const rateCache = new Map<string, CachedRate>();

function buildCacheKey(fromCountry: string, fromZip: string, toCountry: string, toZip: string, weightG: number): string {
  return `${fromCountry}|${fromZip}|${toCountry}|${toZip}|${weightG}`;
}

function getCachedRate(key: string): unknown | null {
  const entry = rateCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    rateCache.delete(key);
    return null;
  }
  rateCache.delete(key);
  rateCache.set(key, entry);
  return entry.data;
}

function setCachedRate(key: string, data: unknown): void {
  if (rateCache.has(key)) rateCache.delete(key);
  if (rateCache.size >= RATE_CACHE_MAX_SIZE) {
    const firstKey = rateCache.keys().next().value;
    if (firstKey) rateCache.delete(firstKey);
  }
  rateCache.set(key, { data, expiresAt: Date.now() + RATE_CACHE_TTL_MS });
}

// ─── Rate Limiting ─────────────────────────────────────────────

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 20;
const rateLimitMap = new Map<string, number[]>();

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const timestamps = (rateLimitMap.get(key) || []).filter((t) => t > windowStart);
  if (timestamps.length >= RATE_LIMIT_MAX_REQUESTS) {
    rateLimitMap.set(key, timestamps);
    return true;
  }
  timestamps.push(now);
  rateLimitMap.set(key, timestamps);
  if (rateLimitMap.size > 500) {
    for (const [k, ts] of rateLimitMap) {
      if (ts.every((t) => t <= windowStart)) rateLimitMap.delete(k);
    }
  }
  return false;
}

// ─── Helpers ───────────────────────────────────────────────────

function getCorsHeaders(req?: Request) {
  const origin = req?.headers.get('origin') || '';
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

let _activeReq: Request | undefined;

function json(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    headers: {
      ...getCorsHeaders(_activeReq),
      'Content-Type': 'application/json',
    },
    ...init,
  });
}

function supabaseUrl(): string {
  return (Deno.env.get('SUPABASE_URL') || '').trim().replace(/\/+$/, '');
}

/**
 * Accept legacy JWT-format anon keys that the frontend may still send.
 * Decodes the JWT payload and checks role === 'anon' + matching project ref.
 */
function isLegacyAnonJwt(token: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (payload.role !== 'anon') return false;
    const url = Deno.env.get('SUPABASE_URL') || '';
    const m = url.match(/\/\/([^.]+)\./);
    return !!m && payload.ref === m[1];
  } catch {
    return false;
  }
}

function supabaseHeaders(): Record<string, string> {
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim() || '';
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
  };
}

async function resolveUserIdFromToken(req: Request): Promise<string | null> {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;

  const response = await fetch(`${supabaseUrl()}/auth/v1/user`, {
    method: 'GET',
    headers: {
      apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim() || '',
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) return null;
  const user = (await response.json()) as { id?: string };
  return user?.id || null;
}

function shippoHeaders(): Record<string, string> {
  const token = Deno.env.get('SHIPPO_API_TOKEN')?.trim() || '';
  return {
    Authorization: `ShippoToken ${token}`,
    'Content-Type': 'application/json',
  };
}

// ─── Shipping Provider Config (DB-driven) ──────────────────────

interface ShippingProviderMarkup {
  markup_domestic: number;
  markup_intl: number;
  markup_currency: string;
}

async function fetchMarkupConfig(fromCountry: string): Promise<ShippingProviderMarkup> {
  try {
    const base = supabaseUrl();
    const response = await fetch(
      `${base}/rest/v1/shipping_provider_config?country_code=eq.${encodeURIComponent(fromCountry)}&provider=eq.shippo&active=eq.true&select=markup_domestic,markup_intl,markup_currency&limit=1`,
      { headers: { ...supabaseHeaders(), Accept: 'application/json' } },
    );
    if (response.ok) {
      const rows = (await response.json()) as ShippingProviderMarkup[];
      if (rows.length > 0) return rows[0];
    }
  } catch (e) {
    console.error('[shippo-rate] Failed to fetch markup config:', e);
  }
  return { markup_domestic: FALLBACK_DOMESTIC_MARKUP, markup_intl: FALLBACK_INTL_MARKUP, markup_currency: FALLBACK_MARKUP_CURRENCY };
}

// ─── Main Handler ──────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  _activeReq = req;

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  // Auth: verify Authorization header contains a valid Supabase key or user JWT
  const authHeader = req.headers.get('authorization') || '';
  const authToken = authHeader.replace(/^Bearer\s+/i, '').trim();
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')?.trim() || '';
  const svcRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim() || '';
  if (!authToken) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }
  let userId: string | null = null;
  if (authToken === anonKey || authToken === svcRoleKey || isLegacyAnonJwt(authToken)) {
    userId = null; // known key — allow through
  } else {
    // Validate as user JWT
    const userRes = await fetch(`${supabaseUrl()}/auth/v1/user`, {
      method: 'GET',
      headers: { apikey: svcRoleKey, Authorization: `Bearer ${authToken}` },
    });
    if (!userRes.ok) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userData = (await userRes.json()) as { id?: string };
    userId = userData?.id || null;
  }

  const rateLimitKey = userId || (req.headers.get('x-forwarded-for') || 'anon');
  if (isRateLimited(rateLimitKey)) {
    return json({ error: 'Too many requests. Please wait and retry.' }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Validate required fields
  const fromCountry = String(body.from_country || '').trim().toUpperCase();
  const fromZip = String(body.from_zip || body.from_postal_code || '').trim();
  const fromCity = String(body.from_city || '').trim();
  const toCountry = String(body.to_country || '').trim().toUpperCase();
  const toZip = String(body.to_zip || body.to_postal_code || '').trim();
  const toCity = String(body.to_city || '').trim();
  const weightG = parseFloat(String(body.weight_g || body.weight || '0'));
  const lengthCm = parseFloat(String(body.length_cm || body.length || '10'));
  const widthCm = parseFloat(String(body.width_cm || body.width || '10'));
  const heightCm = parseFloat(String(body.height_cm || body.height || '10'));

  if (!fromCountry || !toCountry) {
    return json({ error: 'from_country and to_country are required' }, { status: 400 });
  }
  if (weightG <= 0) {
    return json({ error: 'weight must be greater than 0' }, { status: 400 });
  }

  // Validate origin country is supported by Shippo via DB config
  const markupConfig = await fetchMarkupConfig(fromCountry);
  // If no config found in DB, the function still works with fallback markup.
  // The Shippo API itself decides if it has carriers for this origin.

  // Check Shippo config
  const shippoToken = Deno.env.get('SHIPPO_API_TOKEN')?.trim();
  if (!shippoToken) {
    return json({ error: 'Shippo integration not configured' }, { status: 503 });
  }

  // Check cache
  const cacheKey = buildCacheKey(fromCountry, fromZip, toCountry, toZip, Math.round(weightG));
  const cached = getCachedRate(cacheKey);
  if (cached) {
    return json(cached);
  }

  // Call Shippo API
  const shipmentPayload = {
    address_from: {
      name: 'Seller',
      street1: String(body.from_address || ''),
      city: fromCity,
      state: String(body.from_state || ''),
      zip: fromZip,
      country: fromCountry,
    },
    address_to: {
      name: 'Customer',
      street1: String(body.to_address || ''),
      city: toCity,
      state: String(body.to_state || ''),
      zip: toZip,
      country: toCountry,
    },
    parcels: [{
      length: String(lengthCm),
      width: String(widthCm),
      height: String(heightCm),
      distance_unit: 'cm',
      weight: String(weightG),
      mass_unit: 'g',
    }],
    async: false,
  };

  let result;
  try {
    const response = await fetch(`${SHIPPO_API_BASE}/shipments/`, {
      method: 'POST',
      headers: shippoHeaders(),
      body: JSON.stringify(shipmentPayload),
    });
    result = { ok: response.ok, status: response.status, data: await response.json().catch(() => ({})) };
  } catch (err) {
    return json({ error: 'Failed to reach Shippo API', details: String(err) }, { status: 502 });
  }

  if (!result.ok) {
    return json({ error: 'Shippo API error', details: result.data }, { status: 502 });
  }

  const shipmentData = result.data as Record<string, unknown>;
  const rates = (shipmentData.rates || []) as Record<string, unknown>[];

  if (rates.length === 0) {
    return json({ error: 'No rates available for this route' }, { status: 422 });
  }

  const isDomestic = fromCountry === toCountry;
  const shippoMarkup = isDomestic ? markupConfig.markup_domestic : markupConfig.markup_intl;

  // Normalize carrier names (Hermes UK rebranded to Evri in 2022)
  function normalizeCourier(name: string): string {
    const n = name.trim();
    if (/hermes/i.test(n)) return 'Evri';
    return n;
  }

  // Structure rates with markup — use carrier-reported days only, no fake fallbacks
  const structuredRates = rates.map((rate) => {
    const baseAmount = parseFloat(String(rate.amount || '0'));
    const finalAmount = parseFloat((baseAmount + shippoMarkup).toFixed(2));
    const rawDays = parseInt(String(rate.estimated_days || '0'), 10);
    const estimatedDays = rawDays > 0 ? rawDays : 0;
    const now = new Date();
    const estimatedDeliveryDate = estimatedDays > 0
      ? new Date(now.getTime() + estimatedDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      : null;

    return {
      rate_id: rate.object_id,
      courier_name: normalizeCourier(String(rate.provider || '')),
      service_level: (rate.servicelevel as Record<string, unknown>)?.name || '',
      rate: finalAmount,
      currency: String(rate.currency || 'GBP'),
      estimated_delivery_days: estimatedDays,
      estimated_delivery_date: estimatedDeliveryDate,
      arrives_by: rate.arrives_by || estimatedDeliveryDate,
    };
  });

  // Sort: cheapest first for standard, fastest first for express
  const sortedByPrice = [...structuredRates].sort((a, b) => a.rate - b.rate);
  // For express: prefer rates with real carrier estimates (non-fallback) over fallback rates
  const ratesWithRealEstimate = structuredRates.filter((r) => {
    const rawDays = parseInt(String(rates.find((raw) => raw.object_id === r.rate_id)?.estimated_days || '0'), 10);
    return rawDays > 0;
  });
  const sortedBySpeed = [...(ratesWithRealEstimate.length > 0 ? ratesWithRealEstimate : structuredRates)]
    .sort((a, b) => a.estimated_delivery_days - b.estimated_delivery_days);

  // Standard = cheapest rate; Express = fastest DIFFERENT rate (null if same as standard)
  const standard = sortedByPrice[0] || null;
  const expressCandidate = sortedBySpeed[0] || null;
  const express = expressCandidate && expressCandidate.rate_id !== standard?.rate_id
    ? expressCandidate
    : null;

  const responseBody = {
    provider: 'shippo',
    route: isDomestic ? `${fromCountry}_DOMESTIC` : `${fromCountry}_TO_${toCountry}`,
    tiers: {
      standard: standard ? { ...standard, tier: 'standard' } : null,
      premium: null,
      express: express ? { ...express, tier: 'express' } : null,
    },
    all_rates: structuredRates,
    cheapest: standard,
    fastest: express || standard,
  };

  setCachedRate(cacheKey, responseBody);

  return json(responseBody);
});
