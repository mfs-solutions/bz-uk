import { supabase } from './supabase';

// Re-use the shared country resolver from shiprocketOpsService
export { resolveCountryToISO2 } from './shiprocketOpsService';

// ─── Types ─────────────────────────────────────────────────────

type ShippoOperation =
  | 'get_rates'
  | 'create_shipment'
  | 'create_label'
  | 'track_shipment'
  | 'validate_address'
  | 'refund_label'
  | 'create_return_label'
  | 'schedule_pickup';

export type ShippoOpsRequest = {
  sellerId: string;
  orderId?: string;
  requestData?: Record<string, unknown>;
};

export type ShippoOpsResult = {
  data: unknown | null;
  error: string | null;
};

// ─── Error normalisation (same pattern as shiprocketOpsService) ─

function normalizeEdgeFunctionError(message: string | undefined, functionName: string): string {
  const raw = String(message || '').trim();
  if (!raw) return `Unable to reach ${functionName}. Please retry.`;

  const lower = raw.toLowerCase();
  if (lower.includes('failed to send a request to the edge function') || lower.includes('failed to fetch')) {
    return `Unable to reach ${functionName}. Please check your internet and retry.`;
  }
  if (lower.includes('edge function returned a non-2xx status code')) {
    return `${functionName} returned an error. Please retry in a moment.`;
  }
  return raw;
}

async function extractEdgeFunctionContextError(error: unknown): Promise<string> {
  const context = (error as any)?.context;
  if (!context || typeof context.text !== 'function') return '';
  try {
    const bodyText = String(await context.text()).trim();
    if (!bodyText) return '';
    try {
      const parsed = JSON.parse(bodyText) as Record<string, unknown>;
      const message = String(parsed.error || parsed.message || '').trim();
      if (message) return message;
    } catch { /* plain text */ }
    return bodyText;
  } catch {
    return '';
  }
}

function extractErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message || '').trim();
  }
  return '';
}

// ─── Core runner ───────────────────────────────────────────────

async function runOperation(action: ShippoOperation, payload: ShippoOpsRequest): Promise<ShippoOpsResult> {
  if (!payload.sellerId?.trim()) {
    return { data: null, error: 'sellerId is required' };
  }

  const anonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();
  const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const functionUrl = `${supabaseUrl}/functions/v1/shippo-ops`;

  const invokeShippoOps = async (token: string) => {
    try {
      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(anonKey ? { apikey: anonKey } : {}),
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action,
          sellerId: payload.sellerId,
          orderId: payload.orderId,
          requestData: payload.requestData || {},
        }),
      });

      const text = await response.text();
      let parsed: Record<string, unknown> = {};
      if (text.trim()) {
        try { parsed = JSON.parse(text) as Record<string, unknown>; } catch { parsed = { error: text.trim() }; }
      }

      if (!response.ok) {
        const message = String(parsed.error || parsed.message || `shippo-ops returned HTTP ${response.status}`).trim();
        return {
          data: null,
          error: { message, context: { text: async () => text } } as unknown,
        };
      }

      return { data: parsed, error: null };
    } catch (e) {
      return {
        data: null,
        error: { message: (e as Error).message || 'Failed to reach shippo-ops' } as unknown,
      };
    }
  };

  const resolveValidAccessToken = async (): Promise<string> => {
    const { data: sessionData } = await supabase.auth.getSession();
    let token = String(sessionData.session?.access_token || '').trim();

    const expiresAt = Number(sessionData.session?.expires_at || 0);
    const now = Math.floor(Date.now() / 1000);
    const shouldRefresh = !token || (expiresAt > 0 && expiresAt <= now + 60);

    if (shouldRefresh) {
      const { data: refreshedData, error: refreshErr } = await supabase.auth.refreshSession();
      if (!refreshErr) {
        token = String(refreshedData.session?.access_token || '').trim();
      }
    }

    if (!token) return '';

    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (!userErr && userData?.user?.id) return token;

    const { data: refreshedData, error: secondRefreshErr } = await supabase.auth.refreshSession();
    if (secondRefreshErr) return '';

    const refreshedToken = String(refreshedData.session?.access_token || '').trim();
    if (!refreshedToken) return '';

    const { data: refreshedUserData, error: refreshedUserErr } = await supabase.auth.getUser(refreshedToken);
    if (refreshedUserErr || !refreshedUserData?.user?.id) return '';

    return refreshedToken;
  };

  let accessToken = await resolveValidAccessToken();
  if (!accessToken) {
    return { data: null, error: 'Session expired. Please login again and retry.' };
  }

  let { data, error } = await invokeShippoOps(accessToken);

  if (error) {
    const contextError = await extractEdgeFunctionContextError(error);
    const combinedError = `${extractErrorMessage(error)} ${contextError}`.toLowerCase();
    const shouldRetryWithFreshSession =
      combinedError.includes('invalid jwt') ||
      combinedError.includes('jwt') ||
      combinedError.includes('invalid authentication token') ||
      combinedError.includes('authentication token');

    if (shouldRetryWithFreshSession) {
      accessToken = await resolveValidAccessToken();
      if (accessToken) {
        const retryResult = await invokeShippoOps(accessToken);
        data = retryResult.data;
        error = retryResult.error;
      }
    }
  }

  if (error) {
    const contextError = await extractEdgeFunctionContextError(error);
    const normalizedError = normalizeEdgeFunctionError(extractErrorMessage(error), 'shippo-ops');
    return { data: null, error: contextError || normalizedError };
  }

  const typed = data as Record<string, unknown> | null;
  if (typed?.error && typeof typed.error === 'string') {
    return { data: null, error: typed.error };
  }

  return { data: typed || null, error: null };
}

// ─── Public API ────────────────────────────────────────────────

export function getRates(payload: ShippoOpsRequest) {
  return runOperation('get_rates', payload);
}

export function createShipment(payload: ShippoOpsRequest) {
  return runOperation('create_shipment', payload);
}

export function createLabel(payload: ShippoOpsRequest) {
  return runOperation('create_label', payload);
}

export function trackShipment(payload: ShippoOpsRequest) {
  return runOperation('track_shipment', payload);
}

export function validateAddress(payload: ShippoOpsRequest) {
  return runOperation('validate_address', payload);
}

export function refundLabel(payload: ShippoOpsRequest) {
  return runOperation('refund_label', payload);
}

export function createReturnLabel(payload: ShippoOpsRequest) {
  return runOperation('create_return_label', payload);
}

export function schedulePickup(payload: ShippoOpsRequest) {
  return runOperation('schedule_pickup', payload);
}

// ─── Unit conversion helpers ───────────────────────────────────

function normalizeWeightToKg(value: number, unitCode: string): number {
  const code = unitCode.trim().toUpperCase();
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (code === 'G') return value / 1000;
  if (code === 'LB') return value * 0.453592;
  if (code === 'OZ') return value * 0.0283495;
  return value;
}

function normalizeDimensionToCm(value: number, unitCode: string): number {
  const code = unitCode.trim().toUpperCase();
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (code === 'MM') return value / 10;
  if (code === 'M') return value * 100;
  if (code === 'IN') return value * 2.54;
  if (code === 'FT') return value * 30.48;
  return value;
}

// ─── Automated Order → Shippo Shipment ─────────────────────────

export interface CreateShippoShipmentFromOrderResult {
  shippoShipmentId: string | null;
  shippoTransactionId: string | null;
  trackingNumber: string | null;
  labelUrl: string | null;
  courierName: string | null;
  error: string | null;
}

/**
 * Automatically creates a Shippo shipment from a UK-origin order.
 *
 * Flow:
 * 1. Fetch order + items + products + seller KYC
 * 2. Build address_from (seller) and address_to (buyer)
 * 3. Call shippo-ops create_shipment (which gets rates → picks cheapest → purchases label)
 * 4. Return tracking number + label URL
 */
export async function createShippoShipmentFromOrder(
  sellerId: string,
  orderId: string,
  selectionMode: 'cheapest' | 'fastest' = 'cheapest',
  rateId?: string,
): Promise<CreateShippoShipmentFromOrderResult> {
  // Idempotency: check for existing non-failed shipment
  const { data: existingShipment } = await supabase
    .from('shippo_shipments')
    .select('id, shippo_shipment_id, shippo_transaction_id, tracking_number, label_url, courier_name, status')
    .eq('order_id', orderId)
    .eq('seller_id', sellerId)
    .not('status', 'in', '(failed,cancelled)')
    .limit(1)
    .maybeSingle();

  if (existingShipment && existingShipment.tracking_number) {
    return {
      shippoShipmentId: existingShipment.shippo_shipment_id || null,
      shippoTransactionId: existingShipment.shippo_transaction_id || null,
      trackingNumber: existingShipment.tracking_number,
      labelUrl: existingShipment.label_url || null,
      courierName: existingShipment.courier_name || null,
      error: null,
    };
  }

  // 1. Fetch order with items
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .eq('id', orderId)
    .single();

  if (orderErr || !order) {
    return { shippoShipmentId: null, shippoTransactionId: null, trackingNumber: null, labelUrl: null, courierName: null, error: orderErr?.message || 'Order not found' };
  }

  const allItems = (order.order_items || []) as any[];
  if (allItems.length === 0) {
    return { shippoShipmentId: null, shippoTransactionId: null, trackingNumber: null, labelUrl: null, courierName: null, error: 'Order has no items' };
  }

  // 2. Fetch product details
  const productIds = [...new Set(allItems.map((i: any) => i.product_id).filter(Boolean))];
  const [productsResult, unitsResult] = await Promise.all([
    supabase
      .from('products')
      .select('id, name, sku, seller_id, hsn_code, package_weight, package_weight_unit_id, package_length, package_length_unit_id, package_width, package_width_unit_id, package_height, package_height_unit_id')
      .in('id', productIds),
    supabase
      .from('measurement_units')
      .select('id, code')
      .eq('is_active', true),
  ]);

  const productMap = new Map((productsResult.data || []).map((p: any) => [p.id, p]));
  const unitCodeById = new Map(
    (unitsResult.data || []).map((u: any) => [String(u.id), String(u.code || '').toUpperCase()]),
  );

  // Filter to seller's items
  const items = allItems.filter((item: any) => {
    if (item.seller_id === sellerId) return true;
    const product = productMap.get(item.product_id);
    return product?.seller_id === sellerId;
  });

  if (items.length === 0) {
    return { shippoShipmentId: null, shippoTransactionId: null, trackingNumber: null, labelUrl: null, courierName: null, error: 'No items in this order belong to this seller' };
  }

  // 3. Calculate combined weight and dimensions
  let totalWeightKg = 0;
  let maxLengthCm = 0;
  let maxWidthCm = 0;
  let maxHeightCm = 0;

  const lineItems: Array<{ name: string; sku: string; quantity: number; price: number; currency: string; hs_code: string }> = [];

  for (const item of items) {
    const product = productMap.get(item.product_id);
    const qty = Number(item.quantity || 1);
    const variantInfo = item.variant_info || {};
    const sku = variantInfo.sku || product?.sku || `PROD-${item.product_id?.slice(0, 8) || 'UNKNOWN'}`;
    const productName = item.product_name || product?.name || 'Product';
    const hsCode = product?.hsn_code || variantInfo.hsn_code || '';
    const sellingPrice = Number(item.price || item.unit_price || 0);
    const currency = String(item.currency || order.currency || 'GBP').toUpperCase();

    lineItems.push({ name: productName, sku, quantity: qty, price: sellingPrice, currency, hs_code: hsCode });

    const weightUnitCode = unitCodeById.get(String(product?.package_weight_unit_id || '')) || 'KG';
    const weightPerUnitKg = Math.max(normalizeWeightToKg(Number(product?.package_weight || 0), weightUnitCode), 0.1);
    totalWeightKg += weightPerUnitKg * qty;

    const lengthUnitCode = unitCodeById.get(String(product?.package_length_unit_id || '')) || 'CM';
    const widthUnitCode = unitCodeById.get(String(product?.package_width_unit_id || '')) || 'CM';
    const heightUnitCode = unitCodeById.get(String(product?.package_height_unit_id || '')) || 'CM';
    maxLengthCm = Math.max(maxLengthCm, normalizeDimensionToCm(Number(product?.package_length || 0), lengthUnitCode));
    maxWidthCm = Math.max(maxWidthCm, normalizeDimensionToCm(Number(product?.package_width || 0), widthUnitCode));
    maxHeightCm = Math.max(maxHeightCm, normalizeDimensionToCm(Number(product?.package_height || 0), heightUnitCode));
  }

  if (totalWeightKg <= 0) {
    return { shippoShipmentId: null, shippoTransactionId: null, trackingNumber: null, labelUrl: null, courierName: null, error: 'Products have no weight configured — cannot create shipment' };
  }

  // 4. Fetch seller KYC for sender address
  const { data: kyc } = await supabase
    .from('seller_kyc')
    .select('full_name, email, phone, company_name, business_street_address_1, business_street_address_2, business_city, business_postal_code, business_state, country')
    .eq('seller_id', sellerId)
    .maybeSingle();

  if (!kyc || !kyc.business_street_address_1 || !kyc.business_city || !kyc.business_postal_code) {
    return { shippoShipmentId: null, shippoTransactionId: null, trackingNumber: null, labelUrl: null, courierName: null, error: 'Seller KYC address is incomplete — cannot create Shippo shipment' };
  }

  // 5. Extract shipping (buyer) address
  const shipping = order.shipping_address || {};
  const customerName = shipping.full_name || shipping.name || shipping.fullName || 'Customer';
  const customerPhone = shipping.phone || shipping.phone_number || shipping.mobile || '';
  const customerEmail = shipping.email || '';
  const shippingStreet1 = shipping.street_address_1 || shipping.street || shipping.address || shipping.address_line_1 || shipping.line1 || '';
  const shippingStreet2 = shipping.street_address_2 || shipping.line2 || '';
  const shippingCity = shipping.city || '';
  const shippingState = shipping.state || '';
  const shippingPostalCode = shipping.postal_code || shipping.postalCode || shipping.pin || '';
  const shippingCountry = shipping.country_code || shipping.countryCode || shipping.country || 'GB';

  if (!shippingStreet1 || !shippingCity || !shippingPostalCode) {
    return { shippoShipmentId: null, shippoTransactionId: null, trackingNumber: null, labelUrl: null, courierName: null, error: 'Order shipping address is incomplete' };
  }

  // 6. Call shippo-ops create_shipment
  const result = await createShipment({
    sellerId,
    orderId,
    requestData: {
      address_from: {
        name: kyc.full_name || kyc.company_name || 'Seller',
        company: kyc.company_name || '',
        street1: kyc.business_street_address_1,
        street2: kyc.business_street_address_2 || '',
        city: kyc.business_city,
        state: kyc.business_state || '',
        zip: kyc.business_postal_code,
        country: 'GB',
        phone: kyc.phone || '',
        email: kyc.email || '',
      },
      address_to: {
        name: customerName,
        street1: shippingStreet1,
        street2: shippingStreet2,
        city: shippingCity,
        state: shippingState,
        zip: shippingPostalCode,
        country: shippingCountry,
        phone: customerPhone,
        email: customerEmail,
      },
      parcels: [
        {
          length: Math.max(Math.round(maxLengthCm), 1).toString(),
          width: Math.max(Math.round(maxWidthCm), 1).toString(),
          height: Math.max(Math.round(maxHeightCm), 1).toString(),
          distance_unit: 'cm',
          weight: Math.max(Number(totalWeightKg.toFixed(2)), 0.1).toString(),
          mass_unit: 'kg',
        },
      ],
      selection_mode: selectionMode,
      ...(rateId ? { rate_id: rateId } : {}),
      line_items: lineItems,
    },
  });

  if (result.error) {
    return { shippoShipmentId: null, shippoTransactionId: null, trackingNumber: null, labelUrl: null, courierName: null, error: result.error };
  }

  const d = result.data as Record<string, unknown>;
  return {
    shippoShipmentId: (d.shipment_id as string) || null,
    shippoTransactionId: (d.transaction_id as string) || null,
    trackingNumber: (d.tracking_number as string) || null,
    labelUrl: (d.label_url as string) || null,
    courierName: (d.courier_name as string) || null,
    error: null,
  };
}

// ─── Shipping Provider Router ──────────────────────────────────

export type ShippingProvider = 'shiprocket' | 'shippo';

/**
 * Determine which shipping provider to use based on origin country.
 *
 * Routing rules:
 * - India origin, domestic (India→India) → Shiprocket
 * - India origin, international (India→abroad) → Shiprocket
 * - UK/US/CA/AU/EU origin (domestic or international) → Shippo
 */
export function getShippingProvider(
  originCountry: string,
  _destinationCountry: string,
): ShippingProvider {
  const origin = normalizeCountryToken(originCountry);

  if (isUK(origin)) return 'shippo';

  if (isIndia(origin)) {
    return 'shiprocket';
  }

  // Default: use Shippo for any non-India origin
  return 'shippo';
}

function normalizeCountryToken(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ');
}

function isUK(token: string): boolean {
  return ['gb', 'uk', 'united kingdom', 'england', 'scotland', 'wales', 'northern ireland', 'gbr'].includes(token);
}

function isIndia(token: string): boolean {
  return ['in', 'india', 'ind'].includes(token);
}
