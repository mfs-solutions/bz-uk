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

const SR_API_BASE = 'https://apiv2.shiprocket.in';

const TOKEN_LIFETIME_MS = 10 * 24 * 60 * 60 * 1000;
const TOKEN_REFRESH_BUFFER_MS = 60 * 60 * 1000;

/**
 * Platform operational markup added to every international shipping rate (INR).
 * This is NEVER exposed to the frontend — it's baked into the final rate.
 */
const INTL_SHIPPING_MARKUP_INR = 0;

/**
 * Platform operational markup added to every domestic shipping rate (INR).
 * Baked into the final rate — NEVER exposed to buyer.
 */
const DOMESTIC_SHIPPING_MARKUP_INR = 0;

// ─── Rate Cache (in-memory, edge-safe, LRU) ──────────────────

const RATE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const RATE_CACHE_MAX_SIZE = 200; // prevent unbounded growth

interface CachedRate {
  data: unknown;
  expiresAt: number;
}

const rateCache = new Map<string, CachedRate>();

function buildCacheKey(pickup: string, country: string, weight: number, cod: number): string {
  return `${pickup}|${country}|${weight}|${cod}`;
}

function getCachedRate(key: string): unknown | null {
  const entry = rateCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    rateCache.delete(key);
    return null;
  }
  // LRU: move to end (most recently used)
  rateCache.delete(key);
  rateCache.set(key, entry);
  return entry.data;
}

function setCachedRate(key: string, data: unknown): void {
  // If key already exists, delete first to reinsert at end (LRU)
  if (rateCache.has(key)) {
    rateCache.delete(key);
  }
  // Evict least recently used (first entry) if cache is full
  if (rateCache.size >= RATE_CACHE_MAX_SIZE) {
    const firstKey = rateCache.keys().next().value;
    if (firstKey) rateCache.delete(firstKey);
  }
  rateCache.set(key, { data, expiresAt: Date.now() + RATE_CACHE_TTL_MS });
}

// ─── Rate Limiting (in-memory, sliding window) ────────────────

const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 20;
const RATE_LIMIT_MAP_MAX_SIZE = 500;
const rateLimitMap = new Map<string, number[]>();

function evictStaleRateLimitEntries(now: number): void {
  if (rateLimitMap.size <= RATE_LIMIT_MAP_MAX_SIZE) return;
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  for (const [k, ts] of rateLimitMap) {
    if (ts.every(t => t <= windowStart)) rateLimitMap.delete(k);
  }
}

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  evictStaleRateLimitEntries(now);
  let timestamps = rateLimitMap.get(key) || [];
  // Remove expired entries
  timestamps = timestamps.filter(t => t > windowStart);
  if (timestamps.length >= RATE_LIMIT_MAX_REQUESTS) {
    rateLimitMap.set(key, timestamps);
    return true;
  }
  timestamps.push(now);
  rateLimitMap.set(key, timestamps);
  return false;
}

function extractRateLimitKey(req: Request): string {
  // Prefer user token (hashed via simple substring) over IP
  const auth = req.headers.get('authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (token.length > 20) return `tok:${token.slice(-16)}`;
  // Fallback to forwarded IP or connecting IP
  return `ip:${req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown'}`;
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

function serviceRoleKey(): string {
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim() || '';
}

function supabaseHeaders(): Record<string, string> {
  return {
    apikey: serviceRoleKey(),
    Authorization: `Bearer ${serviceRoleKey()}`,
    'Content-Type': 'application/json',
  };
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

// ─── Shiprocket Auth Token (DB-cached) ─────────────────────────

async function getShiprocketToken(): Promise<string> {
  const email = Deno.env.get('SHIPROCKET_API_EMAIL')?.trim();
  const password = Deno.env.get('SHIPROCKET_API_PASSWORD')?.trim();
  if (!email || !password) throw new Error('SHIPROCKET_API_EMAIL / SHIPROCKET_API_PASSWORD not configured');

  // Try cached token from DB
  const lookupUrl = `${supabaseUrl()}/rest/v1/shiprocket_auth_tokens?email=eq.${encodeURIComponent(email)}&select=token,expires_at&limit=1`;
  const lookupRes = await fetch(lookupUrl, { headers: supabaseHeaders() });
  if (lookupRes.ok) {
    const rows = await lookupRes.json();
    if (Array.isArray(rows) && rows.length > 0) {
      const { token, expires_at } = rows[0];
      const expiresAt = new Date(expires_at).getTime();
      if (expiresAt - Date.now() > TOKEN_REFRESH_BUFFER_MS && token) {
        return token;
      }
    }
  }

  // Fetch new token
  const authRes = await fetch(`${SR_API_BASE}/v1/external/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  const authBody = await authRes.json();
  const newToken = authBody?.token;
  if (!newToken) throw new Error('Shiprocket auth failed — no token returned');

  const expiresAt = new Date(Date.now() + TOKEN_LIFETIME_MS).toISOString();

  // Cache in DB
  await fetch(`${supabaseUrl()}/rest/v1/shiprocket_auth_tokens`, {
    method: 'POST',
    headers: { ...supabaseHeaders(), Prefer: 'return=minimal,resolution=merge-duplicates' },
    body: JSON.stringify({ email, token: newToken, expires_at: expiresAt }),
  });

  return newToken;
}

// ─── Shiprocket API Request ────────────────────────────────────

async function shiprocketGet(path: string, baseUrl: string = SR_API_BASE): Promise<{
  ok: boolean;
  status: number;
  data: unknown;
}> {
  const token = await getShiprocketToken();
  const url = `${baseUrl}${path}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  const text = await response.text();
  let parsed: unknown = {};
  if (text.trim()) {
    try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
  }

  // Retry on 401
  if (response.status === 401) {
    const email = Deno.env.get('SHIPROCKET_API_EMAIL')?.trim() || '';
    await fetch(
      `${supabaseUrl()}/rest/v1/shiprocket_auth_tokens?email=eq.${encodeURIComponent(email)}`,
      {
        method: 'PATCH',
        headers: { ...supabaseHeaders(), Prefer: 'return=minimal' },
        body: JSON.stringify({ expires_at: new Date(0).toISOString() }),
      },
    );

    const freshToken = await getShiprocketToken();
    const retryRes = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${freshToken}`, 'Content-Type': 'application/json' },
    });
    const retryText = await retryRes.text();
    let retryParsed: unknown = {};
    if (retryText.trim()) {
      try { retryParsed = JSON.parse(retryText); } catch { retryParsed = { raw: retryText }; }
    }
    return { ok: retryRes.ok, status: retryRes.status, data: retryParsed };
  }

  return { ok: response.ok, status: response.status, data: parsed };
}

// ─── BZEAD Rate Card Lookup (DB-backed) ────────────────────────

/**
 * Resolve a country name or ISO code to the 3-letter country_code in the `countries` table.
 * The edge function receives full country names from the checkout service (e.g. "United Kingdom").
 * Returns null if not found.
 */
async function resolveCountryCode(input: string): Promise<string | null> {
  const cleaned = input.trim();
  if (!cleaned) return null;

  // If already a 3-letter code, return it uppercased
  if (/^[A-Za-z]{3}$/.test(cleaned)) return cleaned.toUpperCase();

  // 2-letter ISO: look up via iso2 column
  if (/^[A-Za-z]{2}$/.test(cleaned)) {
    const url = `${supabaseUrl()}/rest/v1/countries?select=country_code&iso2=eq.${encodeURIComponent(cleaned.toUpperCase())}&limit=1`;
    try {
      const res = await fetch(url, { headers: supabaseHeaders() });
      if (res.ok) {
        const rows = await res.json() as Array<{ country_code: string }>;
        if (rows.length > 0) return rows[0].country_code;
      }
    } catch { /* fall through */ }
    return null;
  }

  // Full country name: look up via country_name (case-insensitive via ilike)
  const url = `${supabaseUrl()}/rest/v1/countries?select=country_code&country_name=ilike.${encodeURIComponent(cleaned)}&limit=1`;
  try {
    const res = await fetch(url, { headers: supabaseHeaders() });
    if (res.ok) {
      const rows = await res.json() as Array<{ country_code: string }>;
      if (rows.length > 0) return rows[0].country_code;
    }
  } catch { /* fall through */ }
  return null;
}

interface RateCardTier {
  service_type: string;
  rate_inr: number;
  delivery_days_min: number;
  delivery_days_max: number;
  free_shipping_above_inr: number;
  customs_threshold_inr: number;
}

/**
 * Fetch BZEAD's own rate card tiers from the DB via the lookup_intl_shipping_tiers RPC.
 * Returns an empty array if the country has no rate card entries (→ fall back to Shiprocket).
 */
async function fetchRateCardTiers(countryCode: string, weightKg: number): Promise<RateCardTier[]> {
  const url = `${supabaseUrl()}/rest/v1/rpc/lookup_intl_shipping_tiers`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { ...supabaseHeaders(), Prefer: 'return=representation' },
      body: JSON.stringify({ p_country_code: countryCode, p_weight_kg: weightKg }),
    });
    if (res.ok) {
      const rows = await res.json() as RateCardTier[];
      return Array.isArray(rows) ? rows : [];
    }
  } catch { /* fall through */ }
  return [];
}

// ─── Tier Selection Logic ──────────────────────────────────────

interface CourierOption {
  courier_company_id: number;
  courier_name: string;
  rate: number;
  etd: string;
  estimated_delivery_days: string;
  etd_hours: number;
}

interface ShippingTier {
  /** Display name: Standard, Premium, Express */
  tier: 'standard' | 'premium' | 'express';
  /** Rate in INR (AFTER markup — this is what the buyer pays) */
  rate: number;
  /** Estimated delivery date range from Shiprocket */
  etd: string;
  /** "5 - 7" style string */
  estimatedDays: string;
  /** Internal courier ID (never exposed to buyer) */
  courierId: number;
}

function selectTiers(couriers: CourierOption[], markup: number): ShippingTier[] {
  if (couriers.length === 0) return [];

  // Sort by rate ascending (cheapest first)
  const byRate = [...couriers].sort((a, b) => a.rate - b.rate);
  // Sort by etd_hours ascending (fastest first)
  const bySpeed = [...couriers].sort((a, b) => a.etd_hours - b.etd_hours);

  const cheapest = byRate[0];
  const fastest = bySpeed[0];

  // Standard = cheapest
  const standard: ShippingTier = {
    tier: 'standard',
    rate: cheapest.rate + markup,
    etd: cheapest.etd,
    estimatedDays: cheapest.estimated_delivery_days,
    courierId: cheapest.courier_company_id,
  };

  const tiers: ShippingTier[] = [standard];

  if (couriers.length === 1) return tiers;

  // Express = fastest (if different from cheapest)
  if (fastest.courier_company_id !== cheapest.courier_company_id) {
    const express: ShippingTier = {
      tier: 'express',
      rate: fastest.rate + markup,
      etd: fastest.etd,
      estimatedDays: fastest.estimated_delivery_days,
      courierId: fastest.courier_company_id,
    };

    // Premium = mid-tier (between cheapest and fastest in both price and speed)
    // Find courier that is faster than standard but cheaper than express
    if (couriers.length >= 3) {
      const candidates = couriers.filter(
        (c) => c.courier_company_id !== cheapest.courier_company_id &&
               c.courier_company_id !== fastest.courier_company_id,
      );

      if (candidates.length > 0) {
        // Pick the one with best balance: sort by (rate_rank + speed_rank)
        const rateRank = new Map(byRate.map((c, i) => [c.courier_company_id, i]));
        const speedRank = new Map(bySpeed.map((c, i) => [c.courier_company_id, i]));
        candidates.sort((a, b) => {
          const scoreA = (rateRank.get(a.courier_company_id) || 0) + (speedRank.get(a.courier_company_id) || 0);
          const scoreB = (rateRank.get(b.courier_company_id) || 0) + (speedRank.get(b.courier_company_id) || 0);
          return scoreA - scoreB;
        });

        const mid = candidates[0];
        tiers.push({
          tier: 'premium',
          rate: mid.rate + markup,
          etd: mid.etd,
          estimatedDays: mid.estimated_delivery_days,
          courierId: mid.courier_company_id,
        });
      }
    }

    tiers.push(express);
  } else if (couriers.length >= 2) {
    // Cheapest and fastest are same courier — pick next fastest as express
    const nextFastest = bySpeed.find((c) => c.courier_company_id !== cheapest.courier_company_id);
    if (nextFastest) {
      tiers.push({
        tier: 'express',
        rate: nextFastest.rate + markup,
        etd: nextFastest.etd,
        estimatedDays: nextFastest.estimated_delivery_days,
        courierId: nextFastest.courier_company_id,
      });
    }
  }

  // Sort output: standard → premium → express
  const order = { standard: 0, premium: 1, express: 2 };
  tiers.sort((a, b) => order[a.tier] - order[b.tier]);

  return tiers;
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

  // Rate limiting
  const rlKey = extractRateLimitKey(req);
  if (isRateLimited(rlKey)) {
    return json({ error: 'Too many requests. Please try again shortly.' }, { status: 429 });
  }

  // Auth: verify Authorization header contains a valid Supabase key or user JWT
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')?.trim() || '';
  if (!token) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }
  // Accept anon key (used by checkout) or validate as user JWT
  if (token !== anonKey && token !== serviceRoleKey() && !isLegacyAnonJwt(token)) {
    const userRes = await fetch(`${supabaseUrl()}/auth/v1/user`, {
      method: 'GET',
      headers: {
        apikey: serviceRoleKey(),
        Authorization: `Bearer ${token}`,
      },
    });
    if (!userRes.ok) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const body = await req.json() as {
      pickup_postcode?: string;
      delivery_country?: string;
      delivery_postcode?: string;
      weight?: number;
      cod?: boolean;
      domestic?: boolean;
    };

    const pickupPostcode = String(body.pickup_postcode || '').trim();
    const deliveryCountry = String(body.delivery_country || '').trim().toUpperCase();
    const deliveryPostcode = String(body.delivery_postcode || '').trim();
    const weight = Number(body.weight);
    const cod = body.cod ? 1 : 0;
    const isDomestic = body.domestic === true || ['IN', 'IND', 'INDIA'].includes(deliveryCountry);

    if (!pickupPostcode) return json({ error: 'pickup_postcode is required' }, { status: 400 });
    if (!weight || weight <= 0) return json({ error: 'weight is required (must be actual product weight in kg, no fallback)' }, { status: 400 });

    if (isDomestic) {
      // ── Domestic India rate lookup via Shiprocket ──
      if (!deliveryPostcode) return json({ error: 'delivery_postcode is required for domestic rates' }, { status: 400 });

      const cacheKey = buildCacheKey(pickupPostcode, `DOM-${deliveryPostcode}`, weight, cod);
      const cached = getCachedRate(cacheKey);
      if (cached) return json(cached);

      const queryParams = new URLSearchParams({
        pickup_postcode: pickupPostcode,
        delivery_postcode: deliveryPostcode,
        weight: String(weight),
        cod: String(cod),
      });

      const result = await shiprocketGet(
        `/v1/external/courier/serviceability/?${queryParams.toString()}`,
        SR_API_BASE,
      );

      if (!result.ok) {
        return json(
          { error: 'No domestic shipping available for this route', details: result.data },
          { status: 422 },
        );
      }

      const rawData = result.data as Record<string, unknown>;
      const innerData = (rawData.data || rawData) as Record<string, unknown>;
      const availableCouriers = (innerData.available_courier_companies || []) as Array<Record<string, unknown>>;

      if (availableCouriers.length === 0) {
        return json(
          { error: 'No domestic courier services available for this route' },
          { status: 422 },
        );
      }

      const couriers: CourierOption[] = availableCouriers
        .filter((c) => !c.blocked)
        .map((c) => ({
          courier_company_id: Number(c.courier_company_id || 0),
          courier_name: String(c.courier_name || ''),
          rate: Number(c.rate || 0),
          etd: String(c.etd || ''),
          estimated_delivery_days: String(c.estimated_delivery_days || ''),
          etd_hours: Number(c.etd_hours || 999),
        }))
        .filter((c) => c.rate > 0);

      if (couriers.length === 0) {
        return json(
          { error: 'No valid domestic courier rates for this route' },
          { status: 422 },
        );
      }

      // India domestic: return ONLY the cheapest courier — no Standard/Premium/Express tiers.
      const allTiers = selectTiers(couriers, DOMESTIC_SHIPPING_MARKUP_INR);
      const cheapest = allTiers.find((t) => t.tier === 'standard') || allTiers[0];

      const response = [{
        tier: cheapest.tier,
        rate: cheapest.rate,
        etd: cheapest.etd,
        estimatedDays: cheapest.estimatedDays,
      }];

      const responseBody = { tiers: response, availableCount: couriers.length, domestic: true };
      setCachedRate(cacheKey, responseBody);

      return json(responseBody);
    }

    // ── International rate lookup ──
    if (!deliveryCountry) return json({ error: 'delivery_country is required' }, { status: 400 });

    // Check rate cache
    const cacheKey = buildCacheKey(pickupPostcode, deliveryCountry, weight, cod);
    const cached = getCachedRate(cacheKey);
    if (cached) {
      return json(cached);
    }

    // ── Try BZEAD rate card first (DB-backed, no Shiprocket dependency) ──
    const resolvedCountryCode = await resolveCountryCode(deliveryCountry);
    if (resolvedCountryCode) {
      const rateCardTiers = await fetchRateCardTiers(resolvedCountryCode, weight);
      if (rateCardTiers.length > 0) {
        const now = new Date();
        const response = rateCardTiers.map((rc) => {
          const minDate = new Date(now);
          minDate.setDate(minDate.getDate() + rc.delivery_days_min);
          const maxDate = new Date(now);
          maxDate.setDate(maxDate.getDate() + rc.delivery_days_max);
          const etd = `${minDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} - ${maxDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;

          return {
            tier: rc.service_type as 'standard' | 'express',
            rate: rc.rate_inr,
            etd,
            estimatedDays: `${rc.delivery_days_min} - ${rc.delivery_days_max}`,
          };
        });

        // Sort: standard first, express second
        const tierOrder: Record<string, number> = { standard: 0, express: 1 };
        response.sort((a, b) => (tierOrder[a.tier] ?? 99) - (tierOrder[b.tier] ?? 99));

        const freeShippingAbove = rateCardTiers[0]?.free_shipping_above_inr || 0;
        const customsThreshold = rateCardTiers[0]?.customs_threshold_inr || 0;

        const responseBody = {
          tiers: response,
          availableCount: rateCardTiers.length,
          source: 'bzead_rate_card',
          freeShippingAboveInr: freeShippingAbove,
          customsThresholdInr: customsThreshold,
        };
        setCachedRate(cacheKey, responseBody);
        return json(responseBody);
      }
    }

    // ── Fallback: Shiprocket live rates (for countries without rate card) ──
    const queryParams = new URLSearchParams({
      pickup_postcode: pickupPostcode,
      delivery_country: deliveryCountry,
      weight: String(weight),
      cod: String(cod),
      is_international: '1',
    });

    if (deliveryPostcode) {
      queryParams.set('delivery_postcode', deliveryPostcode);
    }

    const result = await shiprocketGet(
      `/v1/external/courier/international/serviceability?${queryParams.toString()}`,
      SR_API_BASE,
    );

    if (!result.ok) {
      return json(
        { error: 'No international shipping available for this destination', details: result.data },
        { status: 422 },
      );
    }

    const rawData = result.data as Record<string, unknown>;
    const innerData = (rawData.data || rawData) as Record<string, unknown>;
    const availableCouriers = (innerData.available_courier_companies || []) as Array<Record<string, unknown>>;

    if (availableCouriers.length === 0) {
      return json(
        { error: 'No courier services available for this route' },
        { status: 422 },
      );
    }

    // Extract courier data
    const couriers: CourierOption[] = availableCouriers
      .filter((c) => !c.blocked)
      .map((c) => ({
        courier_company_id: Number(c.courier_company_id || 0),
        courier_name: String(c.courier_name || ''),
        rate: Number((c.rate as Record<string, unknown>)?.rate || c.rate || 0),
        etd: String(c.etd || ''),
        estimated_delivery_days: String(c.estimated_delivery_days || ''),
        etd_hours: Number(c.etd_hours || 999),
      }))
      .filter((c) => c.rate > 0);

    if (couriers.length === 0) {
      return json(
        { error: 'No valid courier rates for this route' },
        { status: 422 },
      );
    }

    // Select 3 tiers with markup applied
    const tiers = selectTiers(couriers, INTL_SHIPPING_MARKUP_INR);

    // Return ONLY sanitised tier data — no raw rates, no courier IDs, no markup details
    const response = tiers.map((t) => ({
      tier: t.tier,
      rate: t.rate,
      etd: t.etd,
      estimatedDays: t.estimatedDays,
    }));

    const responseBody = { tiers: response, availableCount: couriers.length, source: 'shiprocket' };
    setCachedRate(cacheKey, responseBody);

    return json(responseBody);
  } catch (error) {
    console.error('[shiprocket-rate] Error:', error);
    return json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    );
  }
});
