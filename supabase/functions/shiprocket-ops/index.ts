export {};

declare const Deno: {
  env: {
    get: (name: string) => string | undefined;
  };
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

// Shiprocket token validity: 10 days. Refresh 1 hour before expiry.
const TOKEN_LIFETIME_MS = 10 * 24 * 60 * 60 * 1000;
const TOKEN_REFRESH_BUFFER_MS = 60 * 60 * 1000;

type OperationName =
  | 'authenticate'
  | 'check_international_serviceability'
  | 'check_domestic_serviceability'
  | 'create_international_order'
  | 'create_domestic_order'
  | 'assign_awb'
  | 'generate_label'
  | 'generate_manifest'
  | 'schedule_pickup'
  | 'track_shipment'
  | 'track_by_awb'
  | 'cancel_order'
  | 'cancel_shipment'
  | 'create_return'
  | 'ndr_reattempt'
  | 'ndr_return_to_origin'
  | 'sync_all_active_shipments'
  | 'add_pickup_location'
  | 'request_pickup_otp'
  | 'verify_pickup_otp';

type IncomingBody = {
  action?: OperationName;
  sellerId?: string;
  orderId?: string;
  requestData?: Record<string, unknown>;
};

type AuthedUser = {
  id: string;
  role?: string;
};

// ─── Helpers ───────────────────────────────────────────────────

function getCorsHeaders(req?: Request) {
  const origin = req?.headers.get('origin') || '';
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
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

// ─── Supabase DB Helpers ───────────────────────────────────────

async function insertRow(table: string, row: Record<string, unknown>): Promise<boolean> {
  const response = await fetch(`${supabaseUrl()}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...supabaseHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify(row),
  });
  if (!response.ok) {
    const details = await response.text();
    console.error(`Failed to insert into ${table} (HTTP ${response.status}): ${details}`);
    return false;
  }
  return true;
}

async function bulkInsertRows(table: string, rows: Record<string, unknown>[]): Promise<boolean> {
  if (rows.length === 0) return true;
  const response = await fetch(`${supabaseUrl()}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...supabaseHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify(rows),
  });
  if (!response.ok) {
    const details = await response.text();
    console.error(`Failed to bulk insert into ${table} (HTTP ${response.status}): ${details}`);
    return false;
  }
  return true;
}

// Bulk upsert helper: rows that collide on `onConflict` columns are merged
// instead of failing the entire batch. Used for idempotent ingestion of
// Shiprocket tracking events where the same activity may arrive repeatedly
// via cron polls, manual refresh, and the webhook.
async function bulkUpsertRows(
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string,
): Promise<boolean> {
  if (rows.length === 0) return true;
  const response = await fetch(
    `${supabaseUrl()}/rest/v1/${table}?on_conflict=${encodeURIComponent(onConflict)}`,
    {
      method: 'POST',
      headers: {
        ...supabaseHeaders(),
        Prefer: 'return=minimal,resolution=merge-duplicates',
      },
      body: JSON.stringify(rows),
    },
  );
  if (!response.ok) {
    const details = await response.text();
    console.error(`Failed to bulk upsert into ${table} (HTTP ${response.status}): ${details}`);
    return false;
  }
  return true;
}

async function upsertRow(table: string, row: Record<string, unknown>, onConflict: string): Promise<boolean> {
  const response = await fetch(`${supabaseUrl()}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      ...supabaseHeaders(),
      Prefer: 'return=minimal,resolution=merge-duplicates',
    },
    body: JSON.stringify(row),
  });
  if (!response.ok) {
    const details = await response.text();
    console.error(`Failed to upsert into ${table} (${onConflict}): ${details}`);
    return false;
  }
  return true;
}

async function patchRows(table: string, filter: string, patch: Record<string, unknown>): Promise<boolean> {
  const response = await fetch(`${supabaseUrl()}/rest/v1/${table}?${filter}`, {
    method: 'PATCH',
    headers: { ...supabaseHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify(patch),
  });
  if (!response.ok) {
    const details = await response.text();
    console.error(`Failed to patch ${table} (${filter}): ${details}`);
    return false;
  }
  return true;
}

async function queryRows<T = Record<string, unknown>>(table: string, query: string): Promise<T[]> {
  const response = await fetch(`${supabaseUrl()}/rest/v1/${table}?${query}`, {
    method: 'GET',
    headers: { ...supabaseHeaders(), Accept: 'application/json' },
  });
  if (!response.ok) return [];
  return (await response.json()) as T[];
}

// ─── Auth: Resolve user from JWT ───────────────────────────────

async function resolveUser(req: Request): Promise<AuthedUser | null> {
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

  const user = (await response.json()) as { id?: string; user_metadata?: { role?: string } };
  if (!user?.id) return null;

  // Fetch role from profiles table
  const profiles = await queryRows<{ role: string }>('profiles', `select=role&id=eq.${user.id}&limit=1`);
  const role = profiles[0]?.role || user.user_metadata?.role || 'user';

  return { id: user.id, role };
}

// ─── Shiprocket Auth Token Management ──────────────────────────

async function getShiprocketToken(): Promise<string> {
  const email = Deno.env.get('SHIPROCKET_API_EMAIL')?.trim();
  const password = Deno.env.get('SHIPROCKET_API_PASSWORD')?.trim();

  if (!email || !password) {
    throw new Error('SHIPROCKET_API_EMAIL and SHIPROCKET_API_PASSWORD must be set');
  }

  // Check cached token in DB
  const cached = await queryRows<{ token: string; expires_at: string }>(
    'shiprocket_auth_tokens',
    `select=token,expires_at&email=eq.${encodeURIComponent(email)}&limit=1`,
  );

  if (cached.length > 0) {
    const expiresAt = new Date(cached[0].expires_at).getTime();
    const now = Date.now();
    if (expiresAt > now + TOKEN_REFRESH_BUFFER_MS) {
      return cached[0].token;
    }
  }

  // Generate new token
  const response = await fetch(`${SR_API_BASE}/v1/external/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Shiprocket auth failed (HTTP ${response.status}): ${errText}`);
  }

  const data = (await response.json()) as { token?: string };
  const token = data.token;
  if (!token) {
    throw new Error('Shiprocket auth returned no token');
  }

  const expiresAt = new Date(Date.now() + TOKEN_LIFETIME_MS).toISOString();

  // Upsert token in DB (one row per email)
  await upsertRow('shiprocket_auth_tokens', {
    email,
    token,
    expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  }, 'email');

  return token;
}

async function shiprocketRequest(
  method: string,
  path: string,
  body?: unknown,
  baseUrl?: string,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const token = await getShiprocketToken();
  const base = baseUrl || SR_API_BASE;
  const url = `${base}${path}`;

  const init: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };

  if (body && method !== 'GET') {
    init.body = JSON.stringify(body);
  }

  const response = await fetch(url, init);
  const text = await response.text();

  let parsed: unknown = {};
  if (text.trim()) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text };
    }
  }

  // If 401, token may have expired early — retry once with fresh token
  if (response.status === 401) {
    // Force refresh by clearing cached token
    const email = Deno.env.get('SHIPROCKET_API_EMAIL')?.trim() || '';
    await patchRows(
      'shiprocket_auth_tokens',
      `email=eq.${encodeURIComponent(email)}`,
      { expires_at: new Date(0).toISOString() },
    );

    const freshToken = await getShiprocketToken();
    const retryInit: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${freshToken}`,
        'Content-Type': 'application/json',
      },
    };
    if (body && method !== 'GET') {
      retryInit.body = JSON.stringify(body);
    }

    const retryResponse = await fetch(url, retryInit);
    const retryText = await retryResponse.text();
    let retryParsed: unknown = {};
    if (retryText.trim()) {
      try {
        retryParsed = JSON.parse(retryText);
      } catch {
        retryParsed = { raw: retryText };
      }
    }

    return { ok: retryResponse.ok, status: retryResponse.status, data: retryParsed };
  }

  return { ok: response.ok, status: response.status, data: parsed };
}

// ─── Operation Log ─────────────────────────────────────────────

async function logOperation(
  sellerId: string,
  orderId: string | undefined,
  operation: string,
  requestPayload: unknown,
  responsePayload: unknown,
  httpStatus: number,
  success: boolean,
  errorMessage?: string,
): Promise<void> {
  await insertRow('shiprocket_operation_logs', {
    seller_id: sellerId,
    order_id: orderId || null,
    operation,
    request_payload: requestPayload || {},
    response_payload: responsePayload || null,
    http_status: httpStatus,
    success,
    error_message: errorMessage || null,
  });
}

// ─── Operation Handlers ────────────────────────────────────────

/**
 * Resolve the seller's effective domestic pickup pincode.
 *
 * Domestic orders are CREATED from the seller's Shiprocket pickup location
 * (see handleCreateDomesticOrder: pickup location pin first, KYC pin only as
 * fallback). Serviceability must be checked against the same origin, otherwise
 * a seller whose KYC pin is stale/invalid is wrongly reported unserviceable
 * for every destination.
 *
 * Service-role read — buyers cannot read seller_pickup_locations under RLS,
 * so this resolution must happen server-side.
 * Returns '' when no usable pickup location exists (caller falls back to its
 * own pickup_postcode, i.e. the seller KYC pin).
 */
async function resolveSellerPickupPostcode(sellerId: string): Promise<string> {
  try {
    const url =
      `${supabaseUrl()}/rest/v1/seller_pickup_locations` +
      `?seller_id=eq.${encodeURIComponent(sellerId)}` +
      `&select=pin_code,is_verified,shiprocket_status,updated_at` +
      `&order=updated_at.desc`;
    const response = await fetch(url, { headers: supabaseHeaders() });
    if (!response.ok) return '';
    const rows = (await response.json()) as Array<{
      pin_code?: unknown;
      is_verified?: unknown;
      shiprocket_status?: unknown;
    }>;
    if (!Array.isArray(rows) || rows.length === 0) return '';
    const isSixDigits = (v: unknown) => /^\d{6}$/.test(String(v ?? '').trim());
    const verified = rows.find(
      (r) => isSixDigits(r.pin_code) && (r.shiprocket_status === 1 || r.is_verified === true),
    );
    if (verified) return String(verified.pin_code).trim();
    const anyValid = rows.find((r) => isSixDigits(r.pin_code));
    return anyValid ? String(anyValid.pin_code).trim() : '';
  } catch (e) {
    console.error('resolveSellerPickupPostcode failed:', e);
    return '';
  }
}

async function handleCheckInternationalServiceability(
  sellerId: string,
  requestData: Record<string, unknown>,
): Promise<{ ok: boolean; data: unknown; error?: string }> {
  const pickupPostcode = String(requestData.pickup_postcode || '').trim();
  const deliveryCountry = String(requestData.delivery_country || '').trim();
  const weight = Number(requestData.weight);
  const cod = requestData.cod ? 1 : 0;

  if (!pickupPostcode) return { ok: false, data: null, error: 'pickup_postcode is required' };
  if (!deliveryCountry) return { ok: false, data: null, error: 'delivery_country is required' };
  if (!weight || weight <= 0) return { ok: false, data: null, error: 'weight is required (must be actual product weight in kg, no fallback)' };

  // Shiprocket international serviceability uses delivery_country parameter
  const queryParams = new URLSearchParams({
    pickup_postcode: pickupPostcode,
    delivery_country: deliveryCountry,
    weight: String(weight),
    cod: String(cod),
    is_international: '1',
  });
  // Forward dimensions if provided — affects which couriers Shiprocket returns
  if (requestData.length) queryParams.set('length', String(Number(requestData.length)));
  if (requestData.breadth) queryParams.set('breadth', String(Number(requestData.breadth)));
  if (requestData.height) queryParams.set('height', String(Number(requestData.height)));

  const result = await shiprocketRequest(
    'GET',
    `/v1/external/courier/international/serviceability?${queryParams.toString()}`,
  );

  await logOperation(
    sellerId, undefined, 'check_international_serviceability',
    requestData, result.data, result.status, result.ok,
    result.ok ? undefined : JSON.stringify(result.data),
  );

  if (!result.ok) {
    return { ok: false, data: result.data, error: `Serviceability check failed (HTTP ${result.status})` };
  }

  return { ok: true, data: result.data };
}

async function handleCheckDomesticServiceability(
  sellerId: string,
  requestData: Record<string, unknown>,
): Promise<{ ok: boolean; data: unknown; error?: string }> {
  // Prefer the seller's Shiprocket-verified pickup location pincode — domestic
  // orders are created from the pickup location, so serviceability must be
  // checked against the same origin. Falls back to the caller-provided
  // pickup_postcode (seller KYC pin) when no usable pickup location exists.
  const clientPickup = String(requestData.pickup_postcode || '').trim();
  const resolvedPickup = await resolveSellerPickupPostcode(sellerId);
  const pickupPostcode = resolvedPickup || clientPickup;
  const deliveryPostcode = String(requestData.delivery_postcode || '').trim();
  const weight = Number(requestData.weight);
  const cod = requestData.cod ? 1 : 0;

  if (!pickupPostcode) return { ok: false, data: null, error: 'pickup_postcode is required' };
  if (!deliveryPostcode) return { ok: false, data: null, error: 'delivery_postcode is required' };
  if (!weight || weight <= 0) return { ok: false, data: null, error: 'weight is required and must be > 0' };

  const queryParams = new URLSearchParams({
    pickup_postcode: pickupPostcode,
    delivery_postcode: deliveryPostcode,
    weight: String(weight),
    cod: String(cod),
  });

  const result = await shiprocketRequest(
    'GET',
    `/v1/external/courier/serviceability/?${queryParams.toString()}`,
  );

  // Shiprocket quirk: business errors (e.g. invalid pincode) can arrive as
  // HTTP 200 with a body like { status: 404, message: "Invalid Pincode: X" }.
  // Treat body-level errors as failures so logs and callers see the truth.
  const bodyStatus = Number((result.data as Record<string, unknown> | undefined)?.status ?? 0);
  const effectiveOk = result.ok && !(bodyStatus >= 400);

  const effectiveRequest =
    resolvedPickup && resolvedPickup !== clientPickup
      ? { ...requestData, pickup_postcode: pickupPostcode, pickup_postcode_source: 'seller_pickup_locations' }
      : requestData;

  await logOperation(
    sellerId, undefined, 'check_domestic_serviceability',
    effectiveRequest, result.data, effectiveOk ? result.status : (bodyStatus || result.status), effectiveOk,
    effectiveOk ? undefined : JSON.stringify(result.data),
  );

  if (!effectiveOk) {
    const srMessage = String((result.data as Record<string, unknown> | undefined)?.message || '').trim();
    return {
      ok: false,
      data: result.data,
      error: srMessage || `Domestic serviceability check failed (HTTP ${result.status})`,
    };
  }

  return { ok: true, data: result.data };
}

async function handleCreateDomesticOrder(
  sellerId: string,
  orderId: string | undefined,
  requestData: Record<string, unknown>,
): Promise<{ ok: boolean; data: unknown; error?: string }> {
  const required = [
    'order_id', 'order_date', 'pickup_location',
    'billing_customer_name', 'billing_address', 'billing_city',
    'billing_pincode', 'billing_state', 'billing_country',
    'billing_phone',
    'shipping_customer_name', 'shipping_address', 'shipping_city',
    'shipping_pincode', 'shipping_state', 'shipping_country',
    'shipping_phone',
    'order_items', 'payment_method', 'sub_total',
    'length', 'breadth', 'height', 'weight',
  ];

  const missing = required.filter((field) => {
    const value = requestData[field];
    return value === undefined || value === null || value === '';
  });

  if (missing.length > 0) {
    return { ok: false, data: null, error: `Missing required fields: ${missing.join(', ')}` };
  }

  const items = requestData.order_items as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, data: null, error: 'order_items must be a non-empty array' };
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item.name) return { ok: false, data: null, error: `order_items[${i}].name is required` };
    if (!item.sku) return { ok: false, data: null, error: `order_items[${i}].sku is required` };
    if (!item.units || Number(item.units) <= 0) return { ok: false, data: null, error: `order_items[${i}].units must be > 0` };
    if (!item.selling_price || Number(item.selling_price) <= 0) return { ok: false, data: null, error: `order_items[${i}].selling_price must be > 0` };
  }

  const orderPayload: Record<string, unknown> = {
    order_id: requestData.order_id,
    order_date: requestData.order_date,
    pickup_location: requestData.pickup_location,
    channel_id: requestData.channel_id || undefined,
    billing_customer_name: requestData.billing_customer_name,
    billing_last_name: requestData.billing_last_name || '',
    billing_address: requestData.billing_address,
    billing_address_2: requestData.billing_address_2 || '',
    billing_city: requestData.billing_city,
    billing_pincode: requestData.billing_pincode,
    billing_state: requestData.billing_state,
    billing_country: requestData.billing_country,
    billing_email: requestData.billing_email || '',
    billing_phone: requestData.billing_phone,
    shipping_is_billing: requestData.shipping_is_billing ?? false,
    shipping_customer_name: requestData.shipping_customer_name,
    shipping_last_name: requestData.shipping_last_name || '',
    shipping_address: requestData.shipping_address,
    shipping_address_2: requestData.shipping_address_2 || '',
    shipping_city: requestData.shipping_city,
    shipping_pincode: requestData.shipping_pincode,
    shipping_state: requestData.shipping_state,
    shipping_country: requestData.shipping_country,
    shipping_email: requestData.shipping_email || '',
    shipping_phone: requestData.shipping_phone,
    order_items: items.map((item) => ({
      name: item.name,
      sku: item.sku,
      units: Number(item.units),
      selling_price: Number(item.selling_price),
      discount: Number(item.discount || 0),
      tax: Number(item.tax || 0),
      hsn: String(item.hsn || item.hs_code || ''),
    })),
    payment_method: requestData.payment_method,
    sub_total: Number(requestData.sub_total),
    length: Number(requestData.length),
    breadth: Number(requestData.breadth),
    height: Number(requestData.height),
    weight: Number(requestData.weight),
  };

  if (requestData.gstin) orderPayload.gstin = requestData.gstin;

  const cleanedPayload = Object.fromEntries(
    Object.entries(orderPayload).filter(([, v]) => v !== undefined),
  );

  const result = await shiprocketRequest('POST', '/v1/external/orders/create/adhoc', cleanedPayload);

  await logOperation(
    sellerId, orderId, 'create_domestic_order',
    cleanedPayload, result.data, result.status, result.ok,
    result.ok ? undefined : JSON.stringify(result.data),
  );

  if (!result.ok) {
    return { ok: false, data: result.data, error: `Domestic order creation failed (HTTP ${result.status})` };
  }

  const responseData = result.data as Record<string, unknown>;
  const srOrderId = responseData.order_id as number | undefined;
  const srShipmentId = responseData.shipment_id as number | undefined;
  const channelOrderId = responseData.channel_order_id as string | undefined;

  if (srOrderId) {
    const inserted = await insertRow('shiprocket_shipments', {
      seller_id: sellerId,
      order_id: orderId || null,
      sr_order_id: srOrderId,
      sr_shipment_id: srShipmentId || null,
      sr_channel_order_id: channelOrderId || null,
      status: 'created',
      destination_country: 'India',
      destination_country_code: 'IN',
      is_cod: requestData.payment_method === 'COD',
      invoice_value: Number(requestData.sub_total) || 0,
      invoice_currency: 'INR',
      raw_payload: responseData,
    });
    if (!inserted) {
      return { ok: false, data: result.data, error: 'Order created on Shiprocket but failed to save shipment record locally. Please retry.' };
    }
  }

  return { ok: true, data: result.data };
}

async function handleCreateInternationalOrder(
  sellerId: string,
  orderId: string | undefined,
  requestData: Record<string, unknown>,
): Promise<{ ok: boolean; data: unknown; error?: string }> {
  // Validate mandatory fields for international orders
  const required = [
    'order_id', 'order_date', 'pickup_location',
    'billing_customer_name', 'billing_address', 'billing_city',
    'billing_pincode', 'billing_state', 'billing_country',
    'billing_phone',
    'shipping_customer_name', 'shipping_address', 'shipping_city',
    'shipping_pincode', 'shipping_state', 'shipping_country',
    'shipping_phone',
    'order_items', 'payment_method', 'sub_total',
    'length', 'breadth', 'height', 'weight',
  ];

  const missing = required.filter((field) => {
    const value = requestData[field];
    if (value === undefined || value === null || value === '') return true;
    return false;
  });

  if (missing.length > 0) {
    return { ok: false, data: null, error: `Missing required fields: ${missing.join(', ')}` };
  }

  // Validate order_items have HS codes
  const items = requestData.order_items as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, data: null, error: 'order_items must be a non-empty array' };
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item.name) return { ok: false, data: null, error: `order_items[${i}].name is required` };
    if (!item.sku) return { ok: false, data: null, error: `order_items[${i}].sku is required` };
    if (!item.units || Number(item.units) <= 0) return { ok: false, data: null, error: `order_items[${i}].units must be > 0` };
    if (!item.selling_price || Number(item.selling_price) <= 0) return { ok: false, data: null, error: `order_items[${i}].selling_price must be > 0` };
    if (!item.hsn && !item.hs_code) return { ok: false, data: null, error: `order_items[${i}].hsn is required for international shipments` };
  }

  // Build Shiprocket order payload
  const orderPayload: Record<string, unknown> = {
    order_id: requestData.order_id,
    order_date: requestData.order_date,
    pickup_location: requestData.pickup_location,
    channel_id: requestData.channel_id || undefined,
    billing_customer_name: requestData.billing_customer_name,
    billing_last_name: requestData.billing_last_name || '',
    billing_address: requestData.billing_address,
    billing_address_2: requestData.billing_address_2 || '',
    billing_city: requestData.billing_city,
    billing_pincode: requestData.billing_pincode,
    billing_state: requestData.billing_state,
    billing_country: requestData.billing_country,
    billing_email: requestData.billing_email || '',
    billing_phone: requestData.billing_phone,
    shipping_is_billing: requestData.shipping_is_billing ?? false,
    shipping_customer_name: requestData.shipping_customer_name,
    shipping_last_name: requestData.shipping_last_name || '',
    shipping_address: requestData.shipping_address,
    shipping_address_2: requestData.shipping_address_2 || '',
    shipping_city: requestData.shipping_city,
    shipping_pincode: requestData.shipping_pincode,
    shipping_state: requestData.shipping_state,
    shipping_country: requestData.shipping_country,
    shipping_email: requestData.shipping_email || '',
    shipping_phone: requestData.shipping_phone,
    order_items: items.map((item) => ({
      name: item.name,
      sku: item.sku,
      units: Number(item.units),
      selling_price: Number(item.selling_price),
      discount: Number(item.discount || 0),
      tax: Number(item.tax || 0),
      hsn: String(item.hsn || item.hs_code),
    })),
    payment_method: requestData.payment_method,
    sub_total: Number(requestData.sub_total),
    length: Number(requestData.length),
    breadth: Number(requestData.breadth),
    height: Number(requestData.height),
    weight: Number(requestData.weight),
    // International-specific fields
    purpose_of_shipment: requestData.purpose_of_shipment || 'SALE',
    currency: requestData.currency || 'INR',
  };

  // Optional international fields
  if (requestData.gstin) orderPayload.gstin = requestData.gstin;
  if (requestData.export_type) orderPayload.export_type = requestData.export_type;
  if (requestData.invoice_number) orderPayload.invoice_number = requestData.invoice_number;
  if (requestData.invoice_date) orderPayload.invoice_date = requestData.invoice_date;

  // Remove undefined values
  const cleanedPayload = Object.fromEntries(
    Object.entries(orderPayload).filter(([, v]) => v !== undefined),
  );

  const result = await shiprocketRequest('POST', '/v1/external/orders/create/adhoc', cleanedPayload);

  await logOperation(
    sellerId, orderId, 'create_international_order',
    cleanedPayload, result.data, result.status, result.ok,
    result.ok ? undefined : JSON.stringify(result.data),
  );

  if (!result.ok) {
    return { ok: false, data: result.data, error: `Order creation failed (HTTP ${result.status})` };
  }

  // Persist shipment record
  const responseData = result.data as Record<string, unknown>;
  const srOrderId = responseData.order_id as number | undefined;
  const srShipmentId = responseData.shipment_id as number | undefined;
  const channelOrderId = responseData.channel_order_id as string | undefined;

  if (srOrderId) {
    const inserted = await insertRow('shiprocket_shipments', {
      seller_id: sellerId,
      order_id: orderId || null,
      sr_order_id: srOrderId,
      sr_shipment_id: srShipmentId || null,
      sr_channel_order_id: channelOrderId || null,
      status: 'created',
      destination_country: String(requestData.shipping_country || ''),
      destination_country_code: String(requestData.shipping_country_code || '').slice(0, 3),
      is_cod: requestData.payment_method === 'COD',
      invoice_value: Number(requestData.sub_total) || 0,
      invoice_currency: String(requestData.currency || 'INR'),
      raw_payload: responseData,
    });
    if (!inserted) {
      return { ok: false, data: result.data, error: 'Order created on Shiprocket but failed to save shipment record locally. Please retry — the system will resume from this point.' };
    }
  }

  return { ok: true, data: result.data };
}

async function handleAssignAwb(
  sellerId: string,
  orderId: string | undefined,
  requestData: Record<string, unknown>,
): Promise<{ ok: boolean; data: unknown; error?: string }> {
  const srShipmentId = requestData.shipment_id || requestData.sr_shipment_id;
  const courierId = requestData.courier_id;

  if (!srShipmentId) {
    return { ok: false, data: null, error: 'shipment_id is required' };
  }

  const payload: Record<string, unknown> = {
    shipment_id: [Number(srShipmentId)],
  };
  if (courierId) {
    payload.courier_id = Number(courierId);
  }

  const result = await shiprocketRequest('POST', '/v1/external/courier/assign/awb', payload);

  await logOperation(
    sellerId, orderId, 'assign_awb',
    payload, result.data, result.status, result.ok,
    result.ok ? undefined : JSON.stringify(result.data),
  );

  if (!result.ok) {
    const errorPayload = (result.data && typeof result.data === 'object')
      ? (result.data as Record<string, unknown>)
      : {};
    const upstreamMessage = String(errorPayload.message || '').trim();

    // Common stuck state seen after cancel/reassign attempts on the same shipment.
    // Surface a specific actionable message instead of a generic HTTP 500.
    if (
      result.status === 500
      && upstreamMessage.toUpperCase().includes('AWB IS ALREADY ASSIGNED')
      && upstreamMessage.toUpperCase().includes('CANCELLATION REQUESTED')
    ) {
      return {
        ok: false,
        data: result.data,
        error: `${upstreamMessage}. This shipment is in cancellation flow at Shiprocket. Use Recreate Shipment after cancellation completes.`,
      };
    }

    const detailedError = upstreamMessage || `AWB assignment failed (HTTP ${result.status})`;
    return { ok: false, data: result.data, error: detailedError };
  }

  // Update shipment record with AWB
  const responseData = result.data as Record<string, unknown>;

  // Shiprocket may return HTTP 200 but with awb_assign_status: 0 (soft failure)
  // e.g. insufficient wallet balance returns status_code: 350
  const awbAssignStatus = responseData.awb_assign_status as number | undefined;
  if (awbAssignStatus === 0) {
    const srMessage = (responseData.response as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
    const errorMsg = (srMessage?.awb_assign_error as string)
      || (responseData.message as string)
      || 'AWB assignment rejected by Shiprocket';
    return { ok: false, data: result.data, error: errorMsg };
  }

  const awbResponse = responseData.response as Record<string, unknown> | undefined;
  const awbData = awbResponse?.data as Record<string, unknown> | undefined;
  const awbCode = awbData?.awb_code as string | undefined;
  const courierName = awbData?.courier_name as string | undefined;
  const assignedCourierId = awbData?.courier_company_id as number | undefined;

  if (awbCode) {
    await patchRows(
      'shiprocket_shipments',
      `sr_shipment_id=eq.${Number(srShipmentId)}`,
      {
        awb_number: awbCode,
        courier_name: courierName || null,
        courier_id: assignedCourierId || null,
        status: 'awb_assigned',
        raw_payload: responseData,
      },
    );
  }

  return { ok: true, data: result.data };
}

async function handleGenerateLabel(
  sellerId: string,
  orderId: string | undefined,
  requestData: Record<string, unknown>,
): Promise<{ ok: boolean; data: unknown; error?: string }> {
  const shipmentId = requestData.shipment_id || requestData.sr_shipment_id;
  if (!shipmentId) {
    return { ok: false, data: null, error: 'shipment_id is required' };
  }

  const payload = { shipment_id: [Number(shipmentId)] };
  const result = await shiprocketRequest('POST', '/v1/external/courier/generate/label', payload);

  await logOperation(
    sellerId, orderId, 'generate_label',
    payload, result.data, result.status, result.ok,
    result.ok ? undefined : JSON.stringify(result.data),
  );

  if (!result.ok) {
    return { ok: false, data: result.data, error: `Label generation failed (HTTP ${result.status})` };
  }

  const responseData = result.data as Record<string, unknown>;
  const labelUrl = responseData.label_url as string | undefined;

  if (labelUrl) {
    await patchRows(
      'shiprocket_shipments',
      `sr_shipment_id=eq.${Number(shipmentId)}`,
      { label_url: labelUrl },
    );
  }

  return { ok: true, data: result.data };
}

async function handleGenerateManifest(
  sellerId: string,
  orderId: string | undefined,
  requestData: Record<string, unknown>,
): Promise<{ ok: boolean; data: unknown; error?: string }> {
  const shipmentId = requestData.shipment_id || requestData.sr_shipment_id;
  if (!shipmentId) {
    return { ok: false, data: null, error: 'shipment_id is required' };
  }

  const payload = { shipment_id: [Number(shipmentId)] };
  const result = await shiprocketRequest('POST', '/v1/external/courier/generate/manifest', payload);

  await logOperation(
    sellerId, orderId, 'generate_manifest',
    payload, result.data, result.status, result.ok,
    result.ok ? undefined : JSON.stringify(result.data),
  );

  if (!result.ok) {
    return { ok: false, data: result.data, error: `Manifest generation failed (HTTP ${result.status})` };
  }

  const responseData = result.data as Record<string, unknown>;
  const manifestUrl = responseData.manifest_url as string | undefined;

  if (manifestUrl) {
    await patchRows(
      'shiprocket_shipments',
      `sr_shipment_id=eq.${Number(shipmentId)}`,
      { manifest_url: manifestUrl },
    );
  }

  return { ok: true, data: result.data };
}

async function handleSchedulePickup(
  sellerId: string,
  orderId: string | undefined,
  requestData: Record<string, unknown>,
): Promise<{ ok: boolean; data: unknown; error?: string }> {
  const shipmentId = requestData.shipment_id || requestData.sr_shipment_id;
  const pickupDate = requestData.pickup_date;

  if (!shipmentId) return { ok: false, data: null, error: 'shipment_id is required' };

  const payload: Record<string, unknown> = {
    shipment_id: [Number(shipmentId)],
  };
  if (pickupDate) {
    payload.pickup_date = Array.isArray(pickupDate) ? pickupDate : [String(pickupDate)];
  }

  const result = await shiprocketRequest('POST', '/v1/external/courier/generate/pickup', payload);

  await logOperation(
    sellerId, orderId, 'schedule_pickup',
    payload, result.data, result.status, result.ok,
    result.ok ? undefined : JSON.stringify(result.data),
  );

  if (!result.ok) {
    return { ok: false, data: result.data, error: `Pickup scheduling failed (HTTP ${result.status})` };
  }

  // Check for soft failures (HTTP 200 but pickup actually failed)
  const pickupData = result.data as Record<string, unknown>;
  const pickupStatus = pickupData?.pickup_status as number | undefined;
  if (pickupStatus === 0) {
    const pickupMsg = (pickupData?.response as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
    const errorMsg = (pickupMsg?.message as string)
      || (pickupData?.message as string)
      || 'Pickup scheduling rejected by Shiprocket';
    return { ok: false, data: result.data, error: errorMsg };
  }

  return { ok: true, data: result.data };
}

// Map Shiprocket numeric status IDs to our internal shipment status.
// IDs sourced from Shiprocket docs:
//   1=NEW, 3=PICKUP_SCHEDULED, 4=PICKUP_QUEUED, 5=MANIFEST_GENERATED,
//   6=SHIPPED, 7=DELIVERED, 8=ATTEMPTED, 9=OUT_FOR_DELIVERY,
//   12=PICKUP_ERROR, 13=RTO_INITIATED, 14=RTO_DELIVERED,
//   15=CANCELLED, 16=RTO_ACKNOWLEDGED, 17=RETURN_INITIATED,
//   18/20=IN_TRANSIT, 19=OUT_FOR_PICKUP, 42=PICKED_UP
function shiprocketStatusIdToInternal(statusId: number): string {
  if (statusId === 7) return 'delivered';
  if (statusId === 9) return 'out_for_delivery';
  if ([6, 18, 19, 20, 42].includes(statusId)) return 'in_transit';
  if ([15].includes(statusId)) return 'cancelled';
  if ([13, 14, 16].includes(statusId)) return 'rto';
  if ([3, 4, 5].includes(statusId)) return 'in_transit';
  return '';
}

function normalizeShiprocketStatus(rawStatus: unknown): string {
  // Numeric Shiprocket status IDs come straight from the tracking payload
  // (e.g. tracking_data.shipment_status: 7). Map them first.
  if (typeof rawStatus === 'number' && Number.isFinite(rawStatus)) {
    const mapped = shiprocketStatusIdToInternal(rawStatus);
    if (mapped) return mapped;
  }

  const raw = String(rawStatus || '').trim();
  if (!raw) return '';

  // Pure-digit strings ("7") are still status IDs.
  if (/^\d+$/.test(raw)) {
    const mapped = shiprocketStatusIdToInternal(Number(raw));
    if (mapped) return mapped;
  }

  const normalized = raw.toLowerCase().replace(/\s+/g, '_');

  // Substring match catches variants like "delivered_to_consignee",
  // "delivered_(rto)", "out_for_delivery_attempt_2", etc.
  if (normalized.includes('delivered') && !normalized.includes('rto') && !normalized.includes('undelivered')) {
    return 'delivered';
  }
  if (normalized.includes('out_for_delivery')) return 'out_for_delivery';
  if (['in_transit', 'shipped', 'picked_up', 'pickup_scheduled', 'manifest_generated', 'awb_assigned'].includes(normalized)
      || normalized.startsWith('in_transit')) {
    return 'in_transit';
  }
  if (normalized.includes('rto')) return 'rto';
  if (normalized.includes('cancel')) return 'cancelled';

  return normalized;
}

function extractTrackingSnapshot(payload: Record<string, unknown> | undefined): {
  awbNumber: string | null;
  courierName: string | null;
  shipmentStatus: string;
  orderStatus: string | null;
} {
  const trackingData = (payload?.tracking_data || payload || {}) as Record<string, unknown>;
  const shipmentTrack = Array.isArray(trackingData?.shipment_track)
    ? (trackingData.shipment_track as Array<Record<string, unknown>>)
    : [];
  const latestTrack = shipmentTrack[0] || {};

  const awbCandidates = [
    trackingData.awb_code,
    trackingData.awb,
    latestTrack.awb_code,
    latestTrack.awb,
    payload?.awb_code,
    payload?.awb,
  ];
  const courierCandidates = [
    trackingData.courier_name,
    latestTrack.courier_name,
    payload?.courier_name,
  ];
  // Status ID (numeric, e.g. 7=DELIVERED) takes precedence over text labels
  // because Shiprocket's /track/awb response sometimes only carries the
  // delivered state in tracking_data.shipment_status (numeric) while the
  // shipment_track[0].current_status text lags by a poll cycle.
  const statusIdCandidates = [
    (latestTrack as Record<string, unknown>).current_status_id,
    (latestTrack as Record<string, unknown>).status,
    trackingData.shipment_status_id,
    trackingData.shipment_status,
    payload?.current_status_id,
    payload?.shipment_status_id,
  ];
  const statusTextCandidates = [
    latestTrack.current_status,
    trackingData.current_status,
    payload?.current_status,
    payload?.shipment_status,
  ];

  const awbNumber = awbCandidates
    .map((value) => String(value || '').trim())
    .find(Boolean) || null;
  const courierName = courierCandidates
    .map((value) => String(value || '').trim())
    .find(Boolean) || null;

  // First, try to resolve from numeric Shiprocket status IDs.
  let shipmentStatus = '';
  for (const candidate of statusIdCandidates) {
    if (candidate === null || candidate === undefined || candidate === '') continue;
    const asNumber = typeof candidate === 'number' ? candidate : Number(candidate);
    if (!Number.isFinite(asNumber) || asNumber <= 0) continue;
    const mapped = shiprocketStatusIdToInternal(asNumber);
    if (mapped) { shipmentStatus = mapped; break; }
  }
  // Fallback to text labels if the numeric ID didn't resolve.
  if (!shipmentStatus) {
    shipmentStatus = normalizeShiprocketStatus(
      statusTextCandidates.map((value) => String(value || '').trim()).find(Boolean) || '',
    );
  }

  let orderStatus: string | null = null;
  if (shipmentStatus === 'delivered') orderStatus = 'delivered';
  else if (shipmentStatus === 'out_for_delivery') orderStatus = 'out_for_delivery';
  else if (shipmentStatus === 'cancelled') orderStatus = 'cancelled';
  else if (awbNumber) orderStatus = 'in_transit';

  return { awbNumber, courierName, shipmentStatus, orderStatus };
}

async function reconcileShipmentAndOrderFromTracking(
  localShipmentId: string | null,
  orderId: string | null | undefined,
  trackingPayload: Record<string, unknown> | undefined,
): Promise<void> {
  const snapshot = extractTrackingSnapshot(trackingPayload);

  if (localShipmentId) {
    const shipmentPatch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      raw_payload: trackingPayload || {},
    };
    if (snapshot.awbNumber) shipmentPatch.awb_number = snapshot.awbNumber;
    if (snapshot.courierName) shipmentPatch.courier_name = snapshot.courierName;
    if (snapshot.shipmentStatus) shipmentPatch.status = snapshot.shipmentStatus;

    await patchRows(
      'shiprocket_shipments',
      `id=eq.${encodeURIComponent(localShipmentId)}`,
      shipmentPatch,
    );
  }

  if (orderId) {
    const orderPatch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      shipping_provider: 'shiprocket',
    };
    if (snapshot.awbNumber) orderPatch.tracking_number = snapshot.awbNumber;
    if (snapshot.courierName) orderPatch.shipping_carrier = snapshot.courierName;
    if (snapshot.orderStatus) orderPatch.status = snapshot.orderStatus;

    await patchRows(
      'orders',
      `id=eq.${encodeURIComponent(orderId)}`,
      orderPatch,
    );
  }
}

async function handleTrackShipment(
  sellerId: string,
  orderId: string | undefined,
  requestData: Record<string, unknown>,
): Promise<{ ok: boolean; data: unknown; error?: string }> {
  const srShipmentId = requestData.shipment_id || requestData.sr_shipment_id;

  if (!srShipmentId) {
    return { ok: false, data: null, error: 'shipment_id is required' };
  }

  const result = await shiprocketRequest('GET', `/v1/external/courier/track/shipment/${Number(srShipmentId)}`);

  await logOperation(
    sellerId, orderId, 'track_shipment',
    requestData, result.data, result.status, result.ok,
    result.ok ? undefined : JSON.stringify(result.data),
  );

  if (!result.ok) {
    return { ok: false, data: result.data, error: `Tracking failed (HTTP ${result.status})` };
  }

  // Store tracking events
  const trackingData = result.data as Record<string, unknown>;
  const activities = (trackingData as any)?.tracking_data?.shipment_track_activities as Array<Record<string, unknown>> | undefined;
  const shipments = await queryRows<{ id: string; order_id: string | null }>(
    'shiprocket_shipments',
    `select=id,order_id&sr_shipment_id=eq.${Number(srShipmentId)}&limit=1`,
  );
  const localShipmentId = shipments[0]?.id || null;
  const localOrderId = orderId || shipments[0]?.order_id || null;

  await reconcileShipmentAndOrderFromTracking(localShipmentId, localOrderId, trackingData);

  if (activities && activities.length > 0) {
    // Batch fetch existing events for dedup (single query instead of N queries)
    const existingKeys = new Set<string>();
    if (localShipmentId) {
      const existingEvents = await queryRows<{ event_at: string; sr_status: string; location: string }>(
        'shiprocket_tracking_events',
        `select=event_at,sr_status,location&shipment_id=eq.${encodeURIComponent(localShipmentId)}`,
      );
      for (const e of existingEvents) {
        existingKeys.add(`${e.event_at || ''}|${e.sr_status || ''}|${e.location || ''}`);
      }
    }

    const newEvents: Record<string, unknown>[] = [];
    for (const event of activities) {
      const eventAt = event.date ? new Date(String(event.date)).toISOString() : null;
      const srStatus = String(event['sr-status'] || '');
      const location = String(event.location || '');
      const key = `${eventAt || ''}|${srStatus}|${location}`;
      if (existingKeys.has(key)) continue;
      existingKeys.add(key);
      newEvents.push({
        shipment_id: localShipmentId || null,
        seller_id: sellerId,
        sr_status: srStatus,
        sr_status_id: Number(event['sr-status-id'] || event.status_id || 0) || null,
        sr_status_label: String(event['sr-status-label'] || ''),
        activity: String(event.activity || ''),
        location,
        event_at: eventAt,
        raw_payload: event,
      });
    }

    if (newEvents.length > 0) {
      // Upsert so concurrent webhook/cron writes never lose data and a single
      // duplicate row (e.g. timestamp-format drift in the dedup key) cannot
      // poison the whole batch with a 409.
      await bulkUpsertRows(
        'shiprocket_tracking_events',
        newEvents,
        'shipment_id,event_at,sr_status,location',
      );
    }

    // Reconcile shipment status from latest tracking data
    if (localShipmentId) {
      const shipmentTrack = (trackingData as any)?.tracking_data?.shipment_track as Array<Record<string, unknown>> | undefined;
      const latestTrack = shipmentTrack?.[0];
      if (latestTrack) {
        const srCurrentStatus = normalizeShiprocketStatus(latestTrack.current_status || '');
        if (srCurrentStatus) {
          await patchRows(
            'shiprocket_shipments',
            `id=eq.${encodeURIComponent(localShipmentId)}`,
            { status: srCurrentStatus, updated_at: new Date().toISOString() },
          );
        }
      }
    }
  }

  return { ok: true, data: result.data };
}

async function handleTrackByAwb(
  sellerId: string,
  orderId: string | undefined,
  requestData: Record<string, unknown>,
): Promise<{ ok: boolean; data: unknown; error?: string }> {
  const awbNumber = String(requestData.awb_number || requestData.awb || '').trim();

  if (!awbNumber) {
    return { ok: false, data: null, error: 'awb_number is required' };
  }

  const result = await shiprocketRequest('GET', `/v1/external/courier/track/awb/${encodeURIComponent(awbNumber)}`);

  await logOperation(
    sellerId, orderId, 'track_by_awb',
    requestData, result.data, result.status, result.ok,
    result.ok ? undefined : JSON.stringify(result.data),
  );

  if (!result.ok) {
    return { ok: false, data: result.data, error: `AWB tracking failed (HTTP ${result.status})` };
  }

  // Store tracking events
  const trackingData = (result.data as Record<string, unknown>)?.tracking_data as Record<string, unknown> | undefined;
  const activities = trackingData?.shipment_track_activities as Array<Record<string, unknown>> | undefined;
  const shipments = await queryRows<{ id: string; order_id: string | null }>(
    'shiprocket_shipments',
    `select=id,order_id&awb_number=eq.${encodeURIComponent(awbNumber)}&limit=1`,
  );
  const localShipmentId = shipments[0]?.id || null;
  const localOrderId = orderId || shipments[0]?.order_id || null;

  await reconcileShipmentAndOrderFromTracking(localShipmentId, localOrderId, result.data as Record<string, unknown>);

  if (activities && activities.length > 0) {
    // Batch fetch existing events for dedup (single query instead of N queries)
    const existingKeys = new Set<string>();
    if (localShipmentId) {
      const existingEvents = await queryRows<{ event_at: string; sr_status: string; location: string }>(
        'shiprocket_tracking_events',
        `select=event_at,sr_status,location&shipment_id=eq.${encodeURIComponent(localShipmentId)}`,
      );
      for (const e of existingEvents) {
        existingKeys.add(`${e.event_at || ''}|${e.sr_status || ''}|${e.location || ''}`);
      }
    }

    const newEvents: Record<string, unknown>[] = [];
    for (const event of activities) {
      const eventAt = event.date ? new Date(String(event.date)).toISOString() : null;
      const srStatus = String(event['sr-status'] || '');
      const location = String(event.location || '');
      const key = `${eventAt || ''}|${srStatus}|${location}`;
      if (existingKeys.has(key)) continue;
      existingKeys.add(key);
      newEvents.push({
        shipment_id: localShipmentId || null,
        seller_id: sellerId,
        sr_status: srStatus,
        sr_status_id: Number(event['sr-status-id'] || event.status_id || 0) || null,
        sr_status_label: String(event['sr-status-label'] || ''),
        activity: String(event.activity || ''),
        location,
        event_at: eventAt,
        raw_payload: event,
      });
    }

    if (newEvents.length > 0) {
      await bulkUpsertRows(
        'shiprocket_tracking_events',
        newEvents,
        'shipment_id,event_at,sr_status,location',
      );
    }

    // Reconcile shipment status from latest tracking data
    if (localShipmentId) {
      const shipmentTrack = trackingData?.shipment_track as Array<Record<string, unknown>> | undefined;
      const latestTrack = shipmentTrack?.[0];
      if (latestTrack) {
        const srCurrentStatus = normalizeShiprocketStatus(latestTrack.current_status || '');
        if (srCurrentStatus) {
          await patchRows(
            'shiprocket_shipments',
            `id=eq.${encodeURIComponent(localShipmentId)}`,
            { status: srCurrentStatus, updated_at: new Date().toISOString() },
          );
        }
      }
    }
  }

  return { ok: true, data: result.data };
}

async function handleCancelOrder(
  sellerId: string,
  orderId: string | undefined,
  requestData: Record<string, unknown>,
): Promise<{ ok: boolean; data: unknown; error?: string }> {
  const srOrderIds = requestData.sr_order_ids || requestData.ids;
  if (!srOrderIds || !Array.isArray(srOrderIds) || srOrderIds.length === 0) {
    return { ok: false, data: null, error: 'sr_order_ids (array of Shiprocket order IDs) is required' };
  }

  const payload = { ids: srOrderIds.map(Number) };
  const result = await shiprocketRequest('POST', '/v1/external/orders/cancel', payload);

  await logOperation(
    sellerId, orderId, 'cancel_order',
    payload, result.data, result.status, result.ok,
    result.ok ? undefined : JSON.stringify(result.data),
  );

  if (!result.ok) {
    return { ok: false, data: result.data, error: `Order cancellation failed (HTTP ${result.status})` };
  }

  // Update local shipment status
  for (const srId of srOrderIds) {
    await patchRows(
      'shiprocket_shipments',
      `sr_order_id=eq.${Number(srId)}`,
      { status: 'cancelled' },
    );
  }

  // Sync with orders table if orderId provided
  if (orderId) {
    await patchRows('orders', `id=eq.${encodeURIComponent(orderId)}`, {
      status: 'cancelled',
      updated_at: new Date().toISOString(),
    });
  }

  return { ok: true, data: result.data };
}

async function handleCancelShipment(
  sellerId: string,
  orderId: string | undefined,
  requestData: Record<string, unknown>,
): Promise<{ ok: boolean; data: unknown; error?: string }> {
  const awbs = requestData.awbs;
  if (!awbs || !Array.isArray(awbs) || awbs.length === 0) {
    return { ok: false, data: null, error: 'awbs (array of AWB numbers) is required' };
  }

  const payload = { awbs: awbs.map(String) };
  const result = await shiprocketRequest('POST', '/v1/external/orders/cancel/shipment/awbs', payload);

  await logOperation(
    sellerId, orderId, 'cancel_shipment',
    payload, result.data, result.status, result.ok,
    result.ok ? undefined : JSON.stringify(result.data),
  );

  if (!result.ok) {
    return { ok: false, data: result.data, error: `Shipment cancellation failed (HTTP ${result.status})` };
  }

  for (const awb of awbs) {
    await patchRows(
      'shiprocket_shipments',
      `awb_number=eq.${encodeURIComponent(String(awb))}`,
      { status: 'cancelled' },
    );
  }

  return { ok: true, data: result.data };
}

async function handleCreateReturn(
  sellerId: string,
  orderId: string | undefined,
  requestData: Record<string, unknown>,
): Promise<{ ok: boolean; data: unknown; error?: string }> {
  // Shiprocket return order creation
  const required = ['order_id', 'order_date', 'order_items', 'pickup_customer_name',
    'pickup_address', 'pickup_city', 'pickup_state', 'pickup_country', 'pickup_pincode', 'pickup_phone'];

  const missing = required.filter((field) => !requestData[field]);

  if (missing.length > 0) {
    return { ok: false, data: null, error: `Missing required fields for return: ${missing.join(', ')}` };
  }

  // Validate order_items
  const items = requestData.order_items as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, data: null, error: 'order_items must be a non-empty array' };
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item.name) return { ok: false, data: null, error: `order_items[${i}].name is required` };
    if (!item.sku) return { ok: false, data: null, error: `order_items[${i}].sku is required` };
    if (!item.units || Number(item.units) <= 0) return { ok: false, data: null, error: `order_items[${i}].units must be > 0` };
    if (!item.selling_price || Number(item.selling_price) <= 0) return { ok: false, data: null, error: `order_items[${i}].selling_price must be > 0` };
  }

  // Build sanitized return payload
  const returnPayload: Record<string, unknown> = {
    order_id: requestData.order_id,
    order_date: requestData.order_date,
    pickup_customer_name: String(requestData.pickup_customer_name).trim(),
    pickup_last_name: String(requestData.pickup_last_name || '').trim(),
    pickup_address: String(requestData.pickup_address).trim(),
    pickup_address_2: String(requestData.pickup_address_2 || '').trim(),
    pickup_city: String(requestData.pickup_city).trim(),
    pickup_state: String(requestData.pickup_state).trim(),
    pickup_country: String(requestData.pickup_country).trim(),
    pickup_pincode: String(requestData.pickup_pincode).trim(),
    pickup_email: String(requestData.pickup_email || '').trim(),
    pickup_phone: String(requestData.pickup_phone).trim(),
    shipping_customer_name: String(requestData.shipping_customer_name || requestData.pickup_customer_name || '').trim(),
    shipping_address: String(requestData.shipping_address || requestData.pickup_address || '').trim(),
    shipping_city: String(requestData.shipping_city || requestData.pickup_city || '').trim(),
    shipping_state: String(requestData.shipping_state || requestData.pickup_state || '').trim(),
    shipping_country: String(requestData.shipping_country || requestData.pickup_country || '').trim(),
    shipping_pincode: String(requestData.shipping_pincode || requestData.pickup_pincode || '').trim(),
    shipping_phone: String(requestData.shipping_phone || requestData.pickup_phone || '').trim(),
    order_items: items.map((item) => ({
      name: item.name,
      sku: item.sku,
      units: Number(item.units),
      selling_price: Number(item.selling_price),
      discount: Number(item.discount || 0),
      qc_enable: item.qc_enable ?? true,
    })),
    payment_method: String(requestData.payment_method || 'Prepaid'),
    sub_total: Number(requestData.sub_total || 0),
    length: Number(requestData.length || 10),
    breadth: Number(requestData.breadth || 10),
    height: Number(requestData.height || 10),
    weight: Number(requestData.weight || 0.5),
  };

  const result = await shiprocketRequest('POST', '/v1/external/orders/create/return', returnPayload);

  await logOperation(
    sellerId, orderId, 'create_return',
    requestData, result.data, result.status, result.ok,
    result.ok ? undefined : JSON.stringify(result.data),
  );

  if (!result.ok) {
    return { ok: false, data: result.data, error: `Return creation failed (HTTP ${result.status})` };
  }

  // Update local shipment status
  const responseData = result.data as Record<string, unknown>;
  const srOrderId = requestData.order_id;
  if (srOrderId) {
    await patchRows(
      'shiprocket_shipments',
      `sr_order_id=eq.${Number(srOrderId)}`,
      { status: 'return_requested' },
    );
  }

  if (orderId) {
    await patchRows('orders', `id=eq.${encodeURIComponent(orderId)}`, {
      status: 'return_requested',
      updated_at: new Date().toISOString(),
    });
  }

  return { ok: true, data: responseData };
}

// ─── NDR: Reattempt Delivery ──────────────────────────────────

async function handleNdrReattempt(
  sellerId: string,
  orderId: string | undefined,
  requestData: Record<string, unknown>,
): Promise<{ ok: boolean; data: unknown; error?: string }> {
  const awb = String(requestData.awb_number || '').trim();
  if (!awb) return { ok: false, data: null, error: 'awb_number is required' };

  // Verify shipment belongs to seller and is in failed state
  const shipments = await queryRows<{ id: string; status: string; order_id: string | null }>(
    'shiprocket_shipments',
    `select=id,status,order_id&awb_number=eq.${encodeURIComponent(awb)}&seller_id=eq.${encodeURIComponent(sellerId)}&limit=1`,
  );
  if (shipments.length === 0) return { ok: false, data: null, error: 'Shipment not found' };

  const shipment = shipments[0];
  if (shipment.status !== 'failed' && shipment.status !== 'delivery_attempted') {
    return { ok: false, data: null, error: `Cannot reattempt: shipment status is "${shipment.status}"` };
  }

  // Shiprocket NDR action API: action 1 = re-attempt delivery
  const ndrPayload = {
    awb: awb,
    action: 1,
    comments: String(requestData.comments || 'Reattempt delivery requested by admin').trim(),
  };

  const result = await shiprocketRequest('POST', '/v1/external/courier/assign/update', ndrPayload);

  await logOperation(
    sellerId, orderId || shipment.order_id || undefined, 'ndr_reattempt',
    ndrPayload, result.data, result.status, result.ok,
    result.ok ? undefined : JSON.stringify(result.data),
  );

  if (result.ok) {
    await patchRows(
      'shiprocket_shipments',
      `id=eq.${encodeURIComponent(shipment.id)}`,
      { ndr_action_required: false, status: 'in_transit', updated_at: new Date().toISOString() },
    );
    if (shipment.order_id) {
      await patchRows(
        'orders',
        `id=eq.${encodeURIComponent(shipment.order_id)}`,
        { status: 'in_transit', updated_at: new Date().toISOString() },
      );
    }
  }

  if (!result.ok) {
    const errorData = result.data as Record<string, unknown> | undefined;
    return { ok: false, data: result.data, error: String(errorData?.message || errorData?.error || `NDR reattempt failed (HTTP ${result.status})`) };
  }

  return { ok: true, data: result.data };
}

// ─── NDR: Return to Origin ────────────────────────────────────

async function handleNdrReturnToOrigin(
  sellerId: string,
  orderId: string | undefined,
  requestData: Record<string, unknown>,
): Promise<{ ok: boolean; data: unknown; error?: string }> {
  const awb = String(requestData.awb_number || '').trim();
  if (!awb) return { ok: false, data: null, error: 'awb_number is required' };

  // Verify shipment belongs to seller and is in failed state
  const shipments = await queryRows<{ id: string; status: string; order_id: string | null }>(
    'shiprocket_shipments',
    `select=id,status,order_id&awb_number=eq.${encodeURIComponent(awb)}&seller_id=eq.${encodeURIComponent(sellerId)}&limit=1`,
  );
  if (shipments.length === 0) return { ok: false, data: null, error: 'Shipment not found' };

  const shipment = shipments[0];
  if (shipment.status !== 'failed' && shipment.status !== 'delivery_attempted') {
    return { ok: false, data: null, error: `Cannot RTO: shipment status is "${shipment.status}"` };
  }

  // Shiprocket NDR action API: action 2 = return to origin
  const ndrPayload = {
    awb: awb,
    action: 2,
    comments: String(requestData.comments || 'Return to origin requested by admin').trim(),
  };

  const result = await shiprocketRequest('POST', '/v1/external/courier/assign/update', ndrPayload);

  await logOperation(
    sellerId, orderId || shipment.order_id || undefined, 'ndr_return_to_origin',
    ndrPayload, result.data, result.status, result.ok,
    result.ok ? undefined : JSON.stringify(result.data),
  );

  if (result.ok) {
    await patchRows(
      'shiprocket_shipments',
      `id=eq.${encodeURIComponent(shipment.id)}`,
      { ndr_action_required: false, status: 'rto', updated_at: new Date().toISOString() },
    );
    if (shipment.order_id) {
      await patchRows(
        'orders',
        `id=eq.${encodeURIComponent(shipment.order_id)}`,
        { status: 'returned', updated_at: new Date().toISOString() },
      );
    }
  }

  if (!result.ok) {
    const errorData = result.data as Record<string, unknown> | undefined;
    return { ok: false, data: result.data, error: String(errorData?.message || errorData?.error || `NDR RTO failed (HTTP ${result.status})`) };
  }

  return { ok: true, data: result.data };
}

// ─── Bulk Reconciliation: Sync All Active Shipments ───────────

const TERMINAL_STATUSES = ['delivered', 'cancelled', 'rto'];

async function handleSyncAllActiveShipments(
  sellerId: string,
): Promise<{ ok: boolean; data: unknown; error?: string }> {
  // Fetch all non-terminal shipments that can still be reconciled either by AWB
  // or by Shiprocket shipment id. This covers shipments that were created first
  // and later progressed/assigned in the Shiprocket dashboard.
  const activeShipments = await queryRows<{
    id: string;
    awb_number: string;
    sr_shipment_id: number | null;
    status: string;
    seller_id: string;
    order_id: string | null;
  }>(
    'shiprocket_shipments',
    `select=id,awb_number,sr_shipment_id,status,seller_id,order_id&status=not.in.(${TERMINAL_STATUSES.join(',')})&or=(awb_number.not.is.null,sr_shipment_id.not.is.null)&order=created_at.asc&limit=200`,
  );

  if (activeShipments.length === 0) {
    return { ok: true, data: { synced: 0, message: 'No active shipments to sync' } };
  }

  const results: Array<{ awb: string; status: string; updated: boolean; error?: string }> = [];

  for (const shipment of activeShipments) {
    try {
      const trackResult = shipment.awb_number
        ? await shiprocketRequest(
          'GET',
          `/v1/external/courier/track/awb/${encodeURIComponent(shipment.awb_number)}`,
        )
        : await shiprocketRequest(
          'GET',
          `/v1/external/courier/track/shipment/${Number(shipment.sr_shipment_id)}`,
        );

      if (!trackResult.ok) {
        results.push({ awb: shipment.awb_number || String(shipment.sr_shipment_id || ''), status: shipment.status, updated: false, error: `HTTP ${trackResult.status}` });
        continue;
      }

      const trackingRoot = trackResult.data as Record<string, unknown>;
      await reconcileShipmentAndOrderFromTracking(shipment.id, shipment.order_id, trackingRoot);

      const snapshot = extractTrackingSnapshot(trackingRoot);
      const trackingData = trackingRoot?.tracking_data as Record<string, unknown> | undefined;
      const activities = trackingData?.shipment_track_activities as Array<Record<string, unknown>> | undefined;

      // Batch insert new tracking events
      if (activities && activities.length > 0) {
        const existingEvents = await queryRows<{ event_at: string; sr_status: string; location: string }>(
          'shiprocket_tracking_events',
          `select=event_at,sr_status,location&shipment_id=eq.${encodeURIComponent(shipment.id)}`,
        );
        const existingKeys = new Set(
          existingEvents.map(e => `${e.event_at || ''}|${e.sr_status || ''}|${e.location || ''}`),
        );

        const newEvents: Record<string, unknown>[] = [];
        for (const event of activities) {
          const eventAt = event.date ? new Date(String(event.date)).toISOString() : null;
          const srStatus = String(event['sr-status'] || '');
          const location = String(event.location || '');
          const key = `${eventAt || ''}|${srStatus}|${location}`;
          if (existingKeys.has(key)) continue;
          existingKeys.add(key);
          newEvents.push({
            shipment_id: shipment.id,
            seller_id: shipment.seller_id,
            sr_status: srStatus,
            sr_status_id: Number(event['sr-status-id'] || event.status_id || 0) || null,
            sr_status_label: String(event['sr-status-label'] || ''),
            activity: String(event.activity || ''),
            location,
            event_at: eventAt,
            raw_payload: event,
          });
        }

        if (newEvents.length > 0) {
          await bulkUpsertRows(
            'shiprocket_tracking_events',
            newEvents,
            'shipment_id,event_at,sr_status,location',
          );
        }
      }

      // Reconcile shipment status
      const shipmentTrack = trackingData?.shipment_track as Array<Record<string, unknown>> | undefined;
      const latestTrack = shipmentTrack?.[0];
      let newStatus = shipment.status;
      let updated = false;

      if (latestTrack) {
        const srCurrentStatus = normalizeShiprocketStatus(latestTrack.current_status || '');
        if (srCurrentStatus && srCurrentStatus !== shipment.status) {
          await patchRows(
            'shiprocket_shipments',
            `id=eq.${encodeURIComponent(shipment.id)}`,
            { status: srCurrentStatus, updated_at: new Date().toISOString() },
          );
          newStatus = srCurrentStatus;
          updated = true;
        }
      }

      if (snapshot.awbNumber && snapshot.awbNumber !== shipment.awb_number) {
        updated = true;
      }

      results.push({ awb: snapshot.awbNumber || shipment.awb_number || String(shipment.sr_shipment_id || ''), status: newStatus, updated });
    } catch (err) {
      results.push({
        awb: shipment.awb_number || String(shipment.sr_shipment_id || ''),
        status: shipment.status,
        updated: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  const syncedCount = results.filter(r => r.updated).length;
  return {
    ok: true,
    data: {
      total: activeShipments.length,
      synced: syncedCount,
      results,
    },
  };
}

// ─── Pickup Location: Add to Shiprocket ────────────────────────

async function handleAddPickupLocation(
  sellerId: string,
  requestData: Record<string, unknown>,
): Promise<{ ok: boolean; data: unknown; error?: string }> {
  const pickup_location = String(requestData.pickup_location || '').trim();
  const name = String(requestData.name || '').trim();
  const email = String(requestData.email || '').trim();
  const phone = String(requestData.phone || '').trim();
  const address = String(requestData.address || '').trim();
  const address_2 = String(requestData.address_2 || '').trim();
  const city = String(requestData.city || '').trim();
  const state = String(requestData.state || '').trim();
  const country = String(requestData.country || '').trim();
  const pin_code = String(requestData.pin_code || '').trim();

  if (!pickup_location || !name || !email || !phone || !address || !city || !state || !country || !pin_code) {
    return { ok: false, data: null, error: 'Missing required fields for pickup location' };
  }

  const body: Record<string, unknown> = {
    pickup_location,
    name,
    email,
    phone: Number(phone.replace(/\D/g, '')),
    address,
    address_2,
    city,
    state,
    country,
    pin_code: Number(pin_code.replace(/\D/g, '')),
  };

  // Optional fields
  if (requestData.lat) body.lat = Number(requestData.lat);
  if (requestData.long) body.long = Number(requestData.long);
  if (requestData.address_type) body.address_type = String(requestData.address_type);
  if (requestData.vendor_name) body.vendor_name = String(requestData.vendor_name);
  if (requestData.gstin) body.gstin = String(requestData.gstin);
  if (requestData.is_hyperlocal) body.is_hyperlocal = 1;

  const result = await shiprocketRequest('POST', '/v1/external/settings/company/addpickup', body);

  console.log('[addpickup] Shiprocket response:', JSON.stringify(result.data));

  await logOperation(sellerId, undefined, 'add_pickup_location', body, result.data, result.status, result.ok);

  if (!result.ok) {
    const errData = result.data as Record<string, unknown>;
    const errMsg = String(errData?.message || errData?.error || 'Failed to add pickup location on Shiprocket');
    return { ok: false, data: result.data, error: errMsg };
  }

  // Save Shiprocket response to seller_pickup_locations
  const resData = result.data as Record<string, unknown>;
  const addressData = (resData.address || {}) as Record<string, unknown>;

  // The addpickup response returns pickup_id which is NOT the same as pickup_address_id
  // needed for OTP. We must fetch the list of pickup addresses to get the real address.id.
  let pickupAddressId: string | number | undefined;
  let companyId = addressData.company_id;
  let pickupCode = addressData.pickup_code;
  let statusVal = addressData.status;
  let phoneVerified = addressData.phone_verified;
  let rtoAddressId = addressData.rto_address_id;

  // Fetch all pickup addresses to find the correct pickup_address_id
  const listResult = await shiprocketRequest('GET', '/v1/external/settings/company/pickup');
  if (listResult.ok) {
    const listData = listResult.data as Record<string, unknown>;
    const dataObj = (listData?.data || {}) as Record<string, unknown>;
    const addresses = (dataObj?.shipping_address || []) as Array<Record<string, unknown>>;
    // Match by pickup_location name (case-insensitive)
    const matched = addresses.find(
      (a) => String(a.pickup_location || '').toLowerCase() === pickup_location.toLowerCase(),
    );
    if (matched) {
      pickupAddressId = matched.id;
      companyId = companyId || matched.company_id;
      pickupCode = pickupCode || matched.pickup_code;
      statusVal = statusVal !== undefined ? statusVal : matched.status;
      phoneVerified = phoneVerified !== undefined ? phoneVerified : matched.phone_verified;
      rtoAddressId = rtoAddressId || matched.rto_address_id;
      console.log('[addpickup] Matched address from list. pickup_address_id:', pickupAddressId, 'pickup_location:', pickup_location);
    } else {
      console.log('[addpickup] Could not find matching address in list for:', pickup_location, 'addresses:', addresses.map(a => ({ id: a.id, name: a.pickup_location })));
    }
  }

  // Fallback: use address.id from addpickup response, then pickup_id
  if (!pickupAddressId) {
    pickupAddressId = addressData.id || resData.pickup_id;
    console.log('[addpickup] Using fallback pickup_address_id:', pickupAddressId);
  }

  if (pickupAddressId) {
    // Auto-verify: Shiprocket public API does not expose pickup phone OTP.
    // The address is validated by Shiprocket during addpickup, so we mark it verified.
    await patchRows(
      'seller_pickup_locations',
      `seller_id=eq.${sellerId}&pickup_location_name=eq.${encodeURIComponent(pickup_location)}`,
      {
        shiprocket_pickup_id: Number(pickupAddressId),
        shiprocket_pickup_code: pickupCode ? String(pickupCode) : null,
        shiprocket_company_id: companyId ? Number(companyId) : null,
        shiprocket_status: statusVal !== undefined ? Number(statusVal) : 0,
        phone_verified: 1,
        is_verified: true,
        shiprocket_rto_address_id: rtoAddressId ? Number(rtoAddressId) : null,
        shiprocket_synced: true,
        otp_verified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    );
  }

  // Include pickup_address_id in response and auto_verified flag
  const responseData = {
    ...(resData as object),
    pickup_address_id: pickupAddressId ? String(pickupAddressId) : undefined,
    auto_verified: true,
  };

  return { ok: true, data: responseData };
}

// ─── Pickup Location: Request OTP ──────────────────────────────

async function handleRequestPickupOtp(
  sellerId: string,
  requestData: Record<string, unknown>,
): Promise<{ ok: boolean; data: unknown; error?: string }> {
  // Shiprocket does NOT expose a public API for pickup phone OTP verification.
  // The phone verification is only available through the Shiprocket web dashboard.
  // Auto-mark as verified since the address was already validated by Shiprocket
  // during addpickup. Sellers can optionally verify in Shiprocket dashboard.
  const pickupAddressIdRaw = String(requestData.pickup_address_id || '').trim();

  if (pickupAddressIdRaw) {
    await patchRows(
      'seller_pickup_locations',
      `seller_id=eq.${sellerId}&shiprocket_pickup_id=eq.${pickupAddressIdRaw}`,
      {
        phone_verified: 1,
        is_verified: true,
        otp_verified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    );
  }

  console.log('[request_pickup_otp] Auto-verified (Shiprocket public API does not support pickup OTP). pickup_address_id:', pickupAddressIdRaw);
  await logOperation(sellerId, undefined, 'request_pickup_otp', requestData, { auto_verified: true }, 200, true);

  return { ok: true, data: { auto_verified: true, message: 'Pickup address auto-verified. Shiprocket public API does not support OTP for pickup phone verification.' } };
}

// ─── Pickup Location: Verify OTP ──────────────────────────────

async function handleVerifyPickupOtp(
  sellerId: string,
  requestData: Record<string, unknown>,
): Promise<{ ok: boolean; data: unknown; error?: string }> {
  // Shiprocket does NOT expose a public API for pickup phone OTP verification.
  // Auto-mark as verified.
  const pickupAddressIdRaw = String(requestData.pickup_address_id || '').trim();

  if (pickupAddressIdRaw) {
    await patchRows(
      'seller_pickup_locations',
      `seller_id=eq.${sellerId}&shiprocket_pickup_id=eq.${pickupAddressIdRaw}`,
      {
        otp_verified_at: new Date().toISOString(),
        phone_verified: 1,
        is_verified: true,
        updated_at: new Date().toISOString(),
      },
    );
  }

  return { ok: true, data: { auto_verified: true } };
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
  const auth = req.headers.get('authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (token.length > 20) return `tok:${token.slice(-16)}`;
  return `ip:${req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown'}`;
}

// ─── Main Handler ──────────────────────────────────────────────

Deno.serve(async (req) => {
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

  try {
    // Auth — normal user-JWT path, OR cron bypass via x-cron-secret header.
    // The cron path is restricted to a fixed allow-list of read/sync operations
    // and grants admin-equivalent privileges only for those.
    let user = await resolveUser(req);
    const CRON_ALLOWED_OPS = new Set(['sync_all_active_shipments', 'track_by_awb', 'track_shipment']);
    const cronSecret = (Deno.env.get('SHIPROCKET_CRON_SECRET') || '').trim();
    const incomingCronSecret = (req.headers.get('x-cron-secret') || '').trim();
    const isCronCaller =
      !!cronSecret &&
      !!incomingCronSecret &&
      incomingCronSecret === cronSecret;
    if (!user && isCronCaller) {
      user = { id: 'cron', role: 'admin' };
    }
    if (!user) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await req.json()) as IncomingBody;
    const action = body.action;
    const sellerId = body.sellerId || user.id;
    const orderId = body.orderId;
    const requestData = (body.requestData || {}) as Record<string, unknown>;

    // Cron caller may only invoke the explicit sync/tracking operations.
    if (isCronCaller && !CRON_ALLOWED_OPS.has(action as string)) {
      return json({ error: 'cron caller may only invoke sync/tracking operations' }, { status: 403 });
    }

    // Only sellers and admins can use this — except read-only serviceability checks
    // which any authenticated user (including anonymous guests) can call.
    const GUEST_ALLOWED_OPS = new Set(['check_international_serviceability', 'check_domestic_serviceability']);
    if (user.role !== 'seller' && user.role !== 'admin' && !GUEST_ALLOWED_OPS.has(action as string)) {
      return json({ error: 'Only sellers and admins can access shipping operations' }, { status: 403 });
    }

    // Sellers can only operate on their own data (skip for guest-allowed ops)
    if (user.role === 'seller' && sellerId !== user.id) {
      return json({ error: 'Sellers can only manage their own shipments' }, { status: 403 });
    }

    // Shipment mutations are admin-only. Sellers can still use read-only operations.
    const ADMIN_ONLY_OPS = new Set([
      'create_international_order',
      'create_domestic_order',
      'assign_awb',
      'generate_label',
      'generate_manifest',
      'schedule_pickup',
      'cancel_order',
      'cancel_shipment',
      'create_return',
      'ndr_reattempt',
      'ndr_return_to_origin',
      'add_pickup_location',
      'request_pickup_otp',
      'verify_pickup_otp',
      'sync_all_active_shipments',
    ]);
    if (ADMIN_ONLY_OPS.has(action as string) && user.role !== 'admin') {
      return json({ error: 'Only admins can create or modify shipments' }, { status: 403 });
    }

    if (!action) {
      return json({ error: 'action is required' }, { status: 400 });
    }

    let result: { ok: boolean; data: unknown; error?: string };

    switch (action) {
      case 'check_international_serviceability':
        result = await handleCheckInternationalServiceability(sellerId, requestData);
        break;

      case 'check_domestic_serviceability':
        result = await handleCheckDomesticServiceability(sellerId, requestData);
        break;

      case 'create_international_order':
        result = await handleCreateInternationalOrder(sellerId, orderId, requestData);
        break;

      case 'create_domestic_order':
        result = await handleCreateDomesticOrder(sellerId, orderId, requestData);
        break;

      case 'assign_awb':
        result = await handleAssignAwb(sellerId, orderId, requestData);
        break;

      case 'generate_label':
        result = await handleGenerateLabel(sellerId, orderId, requestData);
        break;

      case 'generate_manifest':
        result = await handleGenerateManifest(sellerId, orderId, requestData);
        break;

      case 'schedule_pickup':
        result = await handleSchedulePickup(sellerId, orderId, requestData);
        break;

      case 'track_shipment':
        result = await handleTrackShipment(sellerId, orderId, requestData);
        break;

      case 'track_by_awb':
        result = await handleTrackByAwb(sellerId, orderId, requestData);
        break;

      case 'cancel_order':
        result = await handleCancelOrder(sellerId, orderId, requestData);
        break;

      case 'cancel_shipment':
        result = await handleCancelShipment(sellerId, orderId, requestData);
        break;

      case 'create_return':
        result = await handleCreateReturn(sellerId, orderId, requestData);
        break;

      case 'ndr_reattempt':
        result = await handleNdrReattempt(sellerId, orderId, requestData);
        break;

      case 'ndr_return_to_origin':
        result = await handleNdrReturnToOrigin(sellerId, orderId, requestData);
        break;

      case 'sync_all_active_shipments':
        // Admin-only: require admin role
        if (user.role !== 'admin') {
          return json({ error: 'Only admins can trigger bulk sync' }, { status: 403 });
        }
        result = await handleSyncAllActiveShipments(sellerId);
        break;

      case 'add_pickup_location':
        result = await handleAddPickupLocation(sellerId, requestData);
        break;

      case 'request_pickup_otp':
        result = await handleRequestPickupOtp(sellerId, requestData);
        break;

      case 'verify_pickup_otp':
        result = await handleVerifyPickupOtp(sellerId, requestData);
        break;

      default:
        return json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    if (!result.ok) {
      return json(
        { error: result.error, data: result.data },
        { status: 422 },
      );
    }

    return json({ data: result.data });
  } catch (error) {
    console.error('[shiprocket-ops] Error:', error);
    return json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    );
  }
});
