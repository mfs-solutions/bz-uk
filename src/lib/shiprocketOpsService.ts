import { supabase } from './supabase';
import { convertAmount, fetchExchangeRates } from '../utils/currency';

/** ISO 3166-1 alpha-3 → alpha-2 */
const ISO3_TO_ISO2: Record<string, string> = {
  IND: 'IN', GBR: 'GB', USA: 'US', ARE: 'AE', SAU: 'SA', QAT: 'QA',
  KWT: 'KW', BHR: 'BH', OMN: 'OM', DEU: 'DE', FRA: 'FR', ITA: 'IT',
  ESP: 'ES', NLD: 'NL', BEL: 'BE', AUT: 'AT', CHE: 'CH', SWE: 'SE',
  NOR: 'NO', DNK: 'DK', FIN: 'FI', POL: 'PL', PRT: 'PT', IRL: 'IE',
  GRC: 'GR', CZE: 'CZ', ROU: 'RO', HUN: 'HU', BGR: 'BG', HRV: 'HR',
  SVK: 'SK', SVN: 'SI', LTU: 'LT', LVA: 'LV', EST: 'EE', LUX: 'LU',
  MLT: 'MT', CYP: 'CY', ISL: 'IS', GTM: 'GT', CAN: 'CA', AUS: 'AU',
  NZL: 'NZ', JPN: 'JP', KOR: 'KR', SGP: 'SG', MYS: 'MY', THA: 'TH',
  IDN: 'ID', PHL: 'PH', VNM: 'VN', ZAF: 'ZA', BRA: 'BR', MEX: 'MX',
  ARG: 'AR', CHL: 'CL', COL: 'CO', PER: 'PE', TUR: 'TR', ISR: 'IL',
  EGY: 'EG', NGA: 'NG', KEN: 'KE', GHA: 'GH', LKA: 'LK', BGD: 'BD',
  PAK: 'PK', NPL: 'NP', MMR: 'MM', CHN: 'CN', HKG: 'HK', TWN: 'TW',
  RUS: 'RU', UKR: 'UA',
};

/** Country full name → ISO-2 code */
const COUNTRY_NAME_TO_ISO2: Record<string, string> = {
  india: 'IN', 'united kingdom': 'GB', uk: 'GB', england: 'GB', scotland: 'GB',
  wales: 'GB', 'northern ireland': 'GB', 'united states': 'US', 'united states of america': 'US',
  usa: 'US', 'united arab emirates': 'AE', uae: 'AE', 'saudi arabia': 'SA',
  qatar: 'QA', kuwait: 'KW', bahrain: 'BH', oman: 'OM', germany: 'DE',
  france: 'FR', italy: 'IT', spain: 'ES', netherlands: 'NL', belgium: 'BE',
  austria: 'AT', switzerland: 'CH', sweden: 'SE', norway: 'NO', denmark: 'DK',
  finland: 'FI', poland: 'PL', portugal: 'PT', ireland: 'IE', greece: 'GR',
  canada: 'CA', australia: 'AU', 'new zealand': 'NZ', japan: 'JP',
  'south korea': 'KR', singapore: 'SG', malaysia: 'MY', thailand: 'TH',
  indonesia: 'ID', philippines: 'PH', vietnam: 'VN', 'south africa': 'ZA',
  brazil: 'BR', mexico: 'MX', argentina: 'AR', chile: 'CL', colombia: 'CO',
  peru: 'PE', turkey: 'TR', israel: 'IL', egypt: 'EG', nigeria: 'NG',
  kenya: 'KE', ghana: 'GH', 'sri lanka': 'LK', bangladesh: 'BD',
  pakistan: 'PK', nepal: 'NP', myanmar: 'MM', china: 'CN', 'hong kong': 'HK',
  taiwan: 'TW', russia: 'RU', ukraine: 'UA', guatemala: 'GT',
  'czech republic': 'CZ', czechia: 'CZ', romania: 'RO', hungary: 'HU',
  bulgaria: 'BG', croatia: 'HR', slovakia: 'SK', slovenia: 'SI',
  lithuania: 'LT', latvia: 'LV', estonia: 'EE', luxembourg: 'LU',
  malta: 'MT', cyprus: 'CY', iceland: 'IS',
};

/**
 * Resolve a country value (name, ISO-2, or ISO-3) to a 2-letter ISO code.
 * Returns empty string if unresolvable.
 */
export function resolveCountryToISO2(country?: string, countryCode?: string): string {
  // Prefer countryCode if it's already a valid 2-letter code
  const code = String(countryCode || '').trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(code)) return code;
  if (/^[A-Z]{3}$/.test(code) && ISO3_TO_ISO2[code]) return ISO3_TO_ISO2[code];

  const raw = String(country || '').trim();
  const upper = raw.toUpperCase();
  if (/^[A-Z]{2}$/.test(upper)) return upper;
  if (/^[A-Z]{3}$/.test(upper) && ISO3_TO_ISO2[upper]) return ISO3_TO_ISO2[upper];

  const normalized = raw.toLowerCase().replace(/\s+/g, ' ');
  return COUNTRY_NAME_TO_ISO2[normalized] || '';
}

type ShiprocketOperation =
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

export type ShiprocketOpsRequest = {
  sellerId: string;
  orderId?: string;
  requestData?: Record<string, unknown>;
};

export type ShiprocketOpsResult = {
  data: unknown | null;
  error: string | null;
};

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
    } catch {
      // plain text
    }

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

async function runOperation(action: ShiprocketOperation, payload: ShiprocketOpsRequest): Promise<ShiprocketOpsResult> {
  if (!payload.sellerId?.trim()) {
    return { data: null, error: 'sellerId is required' };
  }

  const anonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();
  const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const functionUrl = `${supabaseUrl}/functions/v1/shiprocket-ops`;

  const invokeShiprocketOps = async (token: string) => {
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
        try {
          parsed = JSON.parse(text) as Record<string, unknown>;
        } catch {
          parsed = { error: text.trim() };
        }
      }

      if (!response.ok) {
        const message = String(parsed.error || parsed.message || `shiprocket-ops returned HTTP ${response.status}`).trim();
        return {
          data: null,
          error: {
            message,
            context: { text: async () => text },
          } as unknown,
        };
      }

      return { data: parsed, error: null };
    } catch (e) {
      return {
        data: null,
        error: {
          message: (e as Error).message || 'Failed to reach shiprocket-ops',
        } as unknown,
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

  let { data, error } = await invokeShiprocketOps(accessToken);

  if (error) {
    const contextError = await extractEdgeFunctionContextError(error);
    const combinedError = `${extractErrorMessage(error)} ${contextError}`.toLowerCase();
    const shouldRetryWithFreshSession = combinedError.includes('invalid jwt')
      || combinedError.includes('jwt')
      || combinedError.includes('invalid authentication token')
      || combinedError.includes('authentication token');

    if (shouldRetryWithFreshSession) {
      accessToken = await resolveValidAccessToken();
      if (accessToken) {
        const retryResult = await invokeShiprocketOps(accessToken);
        data = retryResult.data;
        error = retryResult.error;
      }
    }
  }

  if (error) {
    const contextError = await extractEdgeFunctionContextError(error);
    const normalizedError = normalizeEdgeFunctionError(extractErrorMessage(error), 'shiprocket-ops');
    return {
      data: null,
      error: contextError || normalizedError,
    };
  }

  const typed = data as { data?: unknown; error?: string };
  if (typed?.error) {
    return { data: null, error: typed.error };
  }

  return {
    data: typed?.data || null,
    error: null,
  };
}

// ─── Public API ────────────────────────────────────────────────

export function checkInternationalServiceability(payload: ShiprocketOpsRequest) {
  return runOperation('check_international_serviceability', payload);
}

export function checkDomesticServiceability(payload: ShiprocketOpsRequest) {
  return runOperation('check_domestic_serviceability', payload);
}

export function createInternationalOrder(payload: ShiprocketOpsRequest) {
  return runOperation('create_international_order', payload);
}

export function createDomesticOrder(payload: ShiprocketOpsRequest) {
  return runOperation('create_domestic_order', payload);
}

export function assignAwb(payload: ShiprocketOpsRequest) {
  return runOperation('assign_awb', payload);
}

export function generateLabel(payload: ShiprocketOpsRequest) {
  return runOperation('generate_label', payload);
}

export function generateManifest(payload: ShiprocketOpsRequest) {
  return runOperation('generate_manifest', payload);
}

export function schedulePickup(payload: ShiprocketOpsRequest) {
  return runOperation('schedule_pickup', payload);
}

export function trackShipment(payload: ShiprocketOpsRequest) {
  return runOperation('track_shipment', payload);
}

export function trackByAwb(payload: ShiprocketOpsRequest) {
  return runOperation('track_by_awb', payload);
}

export function cancelOrder(payload: ShiprocketOpsRequest) {
  return runOperation('cancel_order', payload);
}

export function cancelShipment(payload: ShiprocketOpsRequest) {
  return runOperation('cancel_shipment', payload);
}

export function createReturn(payload: ShiprocketOpsRequest) {
  return runOperation('create_return', payload);
}

export function ndrReattempt(payload: ShiprocketOpsRequest) {
  return runOperation('ndr_reattempt', payload);
}

export function ndrReturnToOrigin(payload: ShiprocketOpsRequest) {
  return runOperation('ndr_return_to_origin', payload);
}

export function syncAllActiveShipments(payload: ShiprocketOpsRequest) {
  return runOperation('sync_all_active_shipments', payload);
}

export function addPickupLocation(payload: ShiprocketOpsRequest) {
  return runOperation('add_pickup_location', payload);
}

export function requestPickupOtp(payload: ShiprocketOpsRequest) {
  return runOperation('request_pickup_otp', payload);
}

export function verifyPickupOtp(payload: ShiprocketOpsRequest) {
  return runOperation('verify_pickup_otp', payload);
}

// ─── Automated Order → Shiprocket International Shipment ──────

export interface CreateIntlShipmentFromOrderResult {
  srOrderId: number | null;
  srShipmentId: number | null;
  awbNumber: string | null;
  labelUrl: string | null;
  error: string | null;
  pickupScheduled?: boolean;
  pickupError?: string | null;
}

// Unit conversion helpers
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

function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

function extractShiprocketCourierRate(rawCourier: Record<string, unknown>): number {
  // PRIMARY: use rate field directly if it's a number
  const rate = rawCourier.rate;
  if (typeof rate === 'number' && Number.isFinite(rate) && rate > 0) return rate;
  if (typeof rate === 'string') {
    const parsed = parseFloat(rate);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }

  // FALLBACK: if rate is 0 or missing, check nested rate object
  if (rate && typeof rate === 'object') {
    const rateObj = rate as Record<string, unknown>;
    const r = rateObj.rate;
    if (typeof r === 'number' && Number.isFinite(r) && r > 0) return r;
    if (typeof r === 'string') {
      const parsed = parseFloat(r);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
  }

  // FINAL FALLBACK: check secondary fields only if primary rate is 0/missing
  if (Number(rate || 0) === 0) {
    const secondaryFields = [
      rawCourier.freight_charge,
      rawCourier.total_charges,
      rawCourier.shipment_charge,
    ];
    for (const f of secondaryFields) {
      if (typeof f === 'number' && Number.isFinite(f) && f > 0) return f;
      if (typeof f === 'string') {
        const parsed = parseFloat(f);
        if (Number.isFinite(parsed) && parsed > 0) return parsed;
      }
    }
  }

  return 0;
}

function resolveInrUnitPrice(params: {
  candidatePrice: number;
  sellerUnitPrice: number;
  fromCurrency: string;
  rates: Record<string, number> | null;
}): number {
  const candidate = Number.isFinite(params.candidatePrice) ? params.candidatePrice : 0;
  const sellerUnit = Number.isFinite(params.sellerUnitPrice) ? params.sellerUnitPrice : 0;
  const fromCurrency = String(params.fromCurrency || 'INR').trim().toUpperCase();

  if (fromCurrency === 'INR') return roundMoney(candidate);

  const rates = params.rates || {};
  const canConvert = Number(rates[fromCurrency]) > 0 && Number(rates.INR) > 0;
  if (canConvert) {
    return roundMoney(convertAmount(candidate, fromCurrency, 'INR', rates));
  }

  // If rates are unavailable, prefer seller snapshot (stored in INR) over foreign-currency price.
  if (sellerUnit > 0) return roundMoney(sellerUnit);
  return roundMoney(candidate);
}

/**
 * Automatically creates a Shiprocket international shipment from an order.
 * Fetches order items, product details (weight, dimensions, HS codes),
 * shipping address, and builds a complete international shipment payload.
 *
 * Flow:
 * 1. Create order in Shiprocket
 * 2. Assign AWB (courier)
 * 3. Generate shipping label
 * 4. Schedule pickup
 */
export async function createIntlShipmentFromOrder(
  sellerId: string,
  orderId: string,
  overrideCourierId?: number,
): Promise<CreateIntlShipmentFromOrderResult> {
  // Idempotency: check if a non-cancelled shipment already exists for this order + seller
  const { data: existingShipment } = await supabase
    .from('shiprocket_shipments')
    .select('id, sr_order_id, sr_shipment_id, awb_number, label_url, status')
    .eq('order_id', orderId)
    .eq('seller_id', sellerId)
    .neq('status', 'cancelled')
    .limit(1)
    .maybeSingle();

  if (existingShipment && existingShipment.sr_order_id) {
    // Only return early if shipment is COMPLETE (has AWB).
    // If AWB is missing, the pipeline was interrupted — allow resumption below.
    if (existingShipment.awb_number) {
      return {
        srOrderId: existingShipment.sr_order_id,
        srShipmentId: existingShipment.sr_shipment_id || null,
        awbNumber: existingShipment.awb_number,
        labelUrl: existingShipment.label_url || null,
        error: null,
      };
    }
  }

  // 1. Fetch order with items
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .eq('id', orderId)
    .single();

  if (orderErr || !order) {
    return { srOrderId: null, srShipmentId: null, awbNumber: null, labelUrl: null, error: orderErr?.message || 'Order not found' };
  }

  // Guard: must be international destination
  const shipping = order.shipping_address || {};
  const destCountryISO2 = resolveCountryToISO2(shipping.country, shipping.countryCode);
  if (!destCountryISO2 || destCountryISO2 === 'IN') {
    return {
      srOrderId: null, srShipmentId: null, awbNumber: null, labelUrl: null,
      error: !destCountryISO2
        ? 'Could not resolve shipping country to an ISO code. Please update the order address.'
        : 'This order has a domestic destination. Use createDomesticShipmentFromOrder instead.',
    };
  }

  const allItems = (order.order_items || []) as any[];
  if (allItems.length === 0) {
    return { srOrderId: null, srShipmentId: null, awbNumber: null, labelUrl: null, error: 'Order has no items' };
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
    return { srOrderId: null, srShipmentId: null, awbNumber: null, labelUrl: null, error: 'No items in this order belong to this seller' };
  }

  const orderCurrency = String(order.currency || 'INR').trim().toUpperCase();
  let exchangeRates: Record<string, number> | null = null;
  if (orderCurrency !== 'INR') {
    try {
      exchangeRates = await fetchExchangeRates();
    } catch {
      exchangeRates = null;
    }
  }

  // 3. Build order_items and calculate combined weight/dims
  const orderItems: Array<Record<string, unknown>> = [];
  let totalWeightKg = 0;
  let maxLengthCm = 0;
  let maxWidthCm = 0;
  let maxHeightCm = 0;
  let subTotal = 0;

  for (const item of items) {
    const product = productMap.get(item.product_id);
    const qty = Number(item.quantity || 1);
    const variantInfo = item.variant_info || {};
    const sku = variantInfo.sku || product?.sku || `PROD-${item.product_id?.slice(0, 8) || 'UNKNOWN'}`;
    const productName = item.product_name || product?.name || 'Product';
    const hsCode = product?.hsn_code || variantInfo.hsn_code || '';
    const sellingPrice = resolveInrUnitPrice({
      candidatePrice: Number(item.customer_unit_price ?? item.price ?? item.unit_price ?? 0),
      sellerUnitPrice: Number(item.seller_unit_price ?? 0),
      fromCurrency: orderCurrency,
      rates: exchangeRates,
    });

    if (!hsCode) {
      return {
        srOrderId: null, srShipmentId: null, awbNumber: null, labelUrl: null,
        error: `Product "${productName}" is missing an HS code — required for international shipments.`,
      };
    }

    orderItems.push({
      name: productName,
      sku,
      units: qty,
      selling_price: sellingPrice,
      hsn: hsCode,
    });

    subTotal += roundMoney(sellingPrice * qty);

    // Weight
    const weightUnitCode = unitCodeById.get(String(product?.package_weight_unit_id || '')) || 'KG';
    const weightPerUnitKg = Math.max(normalizeWeightToKg(Number(product?.package_weight || 0), weightUnitCode), 0.1);
    totalWeightKg += weightPerUnitKg * qty;

    // Dimensions
    const lengthUnitCode = unitCodeById.get(String(product?.package_length_unit_id || '')) || 'CM';
    const widthUnitCode = unitCodeById.get(String(product?.package_width_unit_id || '')) || 'CM';
    const heightUnitCode = unitCodeById.get(String(product?.package_height_unit_id || '')) || 'CM';
    maxLengthCm = Math.max(maxLengthCm, normalizeDimensionToCm(Number(product?.package_length || 0), lengthUnitCode));
    maxWidthCm = Math.max(maxWidthCm, normalizeDimensionToCm(Number(product?.package_width || 0), widthUnitCode));
    maxHeightCm = Math.max(maxHeightCm, normalizeDimensionToCm(Number(product?.package_height || 0), heightUnitCode));
  }

  // 4. Extract shipping address fields
  const customerName = shipping.full_name || shipping.name || shipping.fullName || 'Customer';
  const customerPhone = shipping.phone || shipping.phone_number || shipping.mobile || '';
  const customerEmail = shipping.email || '';
  const shippingAddress = shipping.street_address_1 || shipping.street || shipping.address || shipping.address_line_1 || shipping.line1 || '';
  const shippingAddress2 = shipping.street_address_2 || shipping.line2 || '';
  const shippingCity = shipping.city || '';
  const shippingState = shipping.state || '';
  const shippingPincode = shipping.postal_code || shipping.postalCode || shipping.pin || '';
  const shippingCountry = shipping.country || destCountryISO2;

  if (!customerName) {
    return { srOrderId: null, srShipmentId: null, awbNumber: null, labelUrl: null, error: 'Order shipping address has no recipient name' };
  }
  if (!shippingAddress) {
    return { srOrderId: null, srShipmentId: null, awbNumber: null, labelUrl: null, error: 'Order shipping address has no street address' };
  }
  if (!customerPhone) {
    return { srOrderId: null, srShipmentId: null, awbNumber: null, labelUrl: null, error: 'Order shipping address has no phone number' };
  }
  if (!shippingCity) {
    return { srOrderId: null, srShipmentId: null, awbNumber: null, labelUrl: null, error: 'Order shipping address has no city' };
  }
  if (!shippingState) {
    return { srOrderId: null, srShipmentId: null, awbNumber: null, labelUrl: null, error: 'Order shipping address has no state' };
  }
  if (!shippingPincode) {
    return { srOrderId: null, srShipmentId: null, awbNumber: null, labelUrl: null, error: 'Order shipping address has no postal code' };
  }
  if (totalWeightKg <= 0) {
    return { srOrderId: null, srShipmentId: null, awbNumber: null, labelUrl: null, error: 'Products have no weight configured — cannot create shipment' };
  }

  // 5. Fetch seller KYC for billing/pickup info
  const { data: kyc } = await supabase
    .from('seller_kyc')
    .select('full_name, email, phone, business_street_address_1, business_city, business_postal_code, business_state, country')
    .eq('seller_id', sellerId)
    .maybeSingle();

  // 6. Fetch seller's pickup location name from seller_pickup_locations
  const { data: pickupLoc } = await supabase
    .from('seller_pickup_locations')
    .select('pickup_location_name, pin_code')
    .eq('seller_id', sellerId)
    .limit(1)
    .maybeSingle();

  const pickupLocationName = pickupLoc?.pickup_location_name || 'Primary';
  const pickupPinCode = pickupLoc?.pin_code || kyc?.business_postal_code || '';

  // International shipping is ALWAYS prepaid — COD is not available for international orders
  const paymentMethod = 'Prepaid';

  const orderDate = order.created_at
    ? new Date(order.created_at).toISOString().replace('T', ' ').slice(0, 16)
    : new Date().toISOString().replace('T', ' ').slice(0, 16);

  // Use order's Bzead ID as the Shiprocket reference order_id
  const srReferenceOrderId = `BZEAD-${orderId.slice(0, 8)}-${Date.now()}`;

  // 7. Check international courier serviceability FIRST to get courier + shipping cost
  let courierId: number | undefined = overrideCourierId;
  let shippingCharges = 0;

  if (!courierId && pickupPinCode && destCountryISO2) {
    // No courier pre-selected by admin — auto-detect
    const svcResult = await checkInternationalServiceability({
      sellerId,
      requestData: {
        pickup_postcode: pickupPinCode,
        delivery_country: destCountryISO2,
        weight: Math.max(Number(totalWeightKg.toFixed(2)), 0.1),
      },
    });

    if (svcResult.error) {
      return { srOrderId: null, srShipmentId: null, awbNumber: null, labelUrl: null, error: `Courier serviceability check failed: ${svcResult.error}` };
    }

    if (svcResult.data) {
      const svcData = svcResult.data as Record<string, unknown>;
      // Defensive unwrap: documented shape { payload: { data: ... } }, live shape { data: ... }.
      const innerData = ((svcData.payload ?? svcData.data ?? svcData)) as Record<string, unknown>;
      const couriers = (innerData.available_courier_companies || []) as Array<Record<string, unknown>>;
      const validCouriers = couriers
        .filter((c) => !c.blocked)
        .filter((c) => extractShiprocketCourierRate(c) > 0)
        .sort((a, b) => extractShiprocketCourierRate(a) - extractShiprocketCourierRate(b));

      const bestCourier = validCouriers[0];
      if (bestCourier) {
        courierId = Number(bestCourier.courier_company_id);
        shippingCharges = extractShiprocketCourierRate(bestCourier);
      }
    }
  }

  if (!courierId) {
    return { srOrderId: null, srShipmentId: null, awbNumber: null, labelUrl: null, error: 'No international couriers available for this route' };
  }

  // 8. Create order in Shiprocket (skip if resuming a partial shipment)
  let srOrderId: number | undefined | null = existingShipment?.sr_order_id ?? null;
  let srShipmentId: number | undefined | null = existingShipment?.sr_shipment_id ?? null;

  if (!srOrderId) {
    const createResult = await createInternationalOrder({
      sellerId,
      orderId,
      requestData: {
        order_id: srReferenceOrderId,
        order_date: orderDate,
        pickup_location: pickupLocationName,
        billing_customer_name: kyc?.full_name || customerName,
        billing_address: kyc?.business_street_address_1 || shippingAddress,
        billing_city: kyc?.business_city || shippingCity,
        billing_pincode: kyc?.business_postal_code || shippingPincode,
        billing_state: kyc?.business_state || shippingState,
        billing_country: kyc?.country || 'India',
        billing_email: kyc?.email || customerEmail,
        billing_phone: kyc?.phone || customerPhone,
        shipping_is_billing: false,
        shipping_customer_name: customerName,
        shipping_address: shippingAddress,
        shipping_address_2: shippingAddress2,
        shipping_city: shippingCity,
        shipping_pincode: shippingPincode,
        shipping_state: shippingState,
        shipping_country: shippingCountry,
        shipping_country_code: destCountryISO2,
        shipping_email: customerEmail,
        shipping_phone: customerPhone,
        order_items: orderItems,
        payment_method: paymentMethod,
        sub_total: roundMoney(subTotal),
        length: Math.max(Math.round(maxLengthCm), 1),
        breadth: Math.max(Math.round(maxWidthCm), 1),
        height: Math.max(Math.round(maxHeightCm), 1),
        weight: Math.max(Number(totalWeightKg.toFixed(2)), 0.1),
        purpose_of_shipment: 'SALE',
        currency: 'INR',
        invoice_number: `BZEAD-INV-${orderId.slice(0, 8).toUpperCase()}`,
        invoice_date: orderDate,
        ...(courierId ? { courier_id: courierId } : {}),
        ...(shippingCharges > 0 ? { shipping_charges: shippingCharges } : {}),
      },
    });

    if (createResult.error) {
      return { srOrderId: null, srShipmentId: null, awbNumber: null, labelUrl: null, error: createResult.error };
    }

    const createData = createResult.data as Record<string, unknown>;
    srOrderId = createData.order_id as number | undefined;
    srShipmentId = createData.shipment_id as number | undefined;
  }

  if (!srOrderId || !srShipmentId) {
    return {
      srOrderId: srOrderId || null,
      srShipmentId: srShipmentId || null,
      awbNumber: null,
      labelUrl: null,
      error: 'Order created but no shipment ID returned from Shiprocket',
    };
  }

  const output: CreateIntlShipmentFromOrderResult = {
    srOrderId,
    srShipmentId,
    awbNumber: null,
    labelUrl: null,
    error: null,
  };

  // 9. Assign AWB with selected courier (courier_id from step 7)
  const awbPayload: Record<string, unknown> = { shipment_id: srShipmentId };
  if (courierId) {
    awbPayload.courier_id = courierId;
  }
  const awbResult = await assignAwb({
    sellerId,
    orderId,
    requestData: awbPayload,
  });

  if (awbResult.error) {
    output.error = `Order created (SR#${srOrderId}) but AWB assignment failed: ${awbResult.error}`;
    return output;
  }

  const awbData = awbResult.data as Record<string, unknown>;
  const awbResponse = awbData?.response as Record<string, unknown> | undefined;
  const awbInner = awbResponse?.data as Record<string, unknown> | undefined;
  output.awbNumber = (awbInner?.awb_code as string) || null;

  // 10. Generate label
  if (srShipmentId) {
    const labelResult = await generateLabel({
      sellerId,
      orderId,
      requestData: { shipment_id: srShipmentId },
    });

    if (labelResult.error) {
      console.error('[createIntlShipmentFromOrder] Label generation failed:', labelResult.error);
    } else {
      const labelData = labelResult.data as Record<string, unknown>;
      output.labelUrl = (labelData?.label_url as string) || null;
    }
  }

  // 11. Schedule pickup
  try {
    const now = new Date();
    const pickupDate = new Date(now);
    if (now.getHours() >= 16) {
      pickupDate.setDate(pickupDate.getDate() + 1);
    }
    const pickupDateStr = pickupDate.toISOString().split('T')[0];

    const pickupResult = await schedulePickup({
      sellerId,
      orderId,
      requestData: {
        shipment_id: srShipmentId,
        pickup_date: pickupDateStr,
      },
    });

    if (pickupResult.error) {
      output.pickupScheduled = false;
      output.pickupError = pickupResult.error;
    } else {
      output.pickupScheduled = true;
    }
  } catch (pickupErr) {
    output.pickupScheduled = false;
    output.pickupError = pickupErr instanceof Error ? pickupErr.message : 'Pickup scheduling failed';
  }

  return output;
}

// ─── Automated Order → Shiprocket Domestic Shipment ───────────

export interface CreateDomesticShipmentFromOrderResult {
  srOrderId: number | null;
  srShipmentId: number | null;
  awbNumber: string | null;
  labelUrl: string | null;
  error: string | null;
  pickupScheduled?: boolean;
  pickupError?: string | null;
}

export async function createDomesticShipmentFromOrder(
  sellerId: string,
  orderId: string,
  overrideCourierId?: number,
): Promise<CreateDomesticShipmentFromOrderResult> {
  // Idempotency: check if a non-cancelled shipment already exists
  const { data: existingShipment } = await supabase
    .from('shiprocket_shipments')
    .select('id, sr_order_id, sr_shipment_id, awb_number, label_url, status')
    .eq('order_id', orderId)
    .eq('seller_id', sellerId)
    .neq('status', 'cancelled')
    .limit(1)
    .maybeSingle();

  if (existingShipment && existingShipment.sr_order_id) {
    if (existingShipment.awb_number) {
      return {
        srOrderId: existingShipment.sr_order_id,
        srShipmentId: existingShipment.sr_shipment_id || null,
        awbNumber: existingShipment.awb_number,
        labelUrl: existingShipment.label_url || null,
        error: null,
      };
    }
  }

  // 1. Fetch order with items
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .eq('id', orderId)
    .single();

  if (orderErr || !order) {
    return { srOrderId: null, srShipmentId: null, awbNumber: null, labelUrl: null, error: orderErr?.message || 'Order not found' };
  }

  // Guard: must be domestic destination (India)
  const shipping = order.shipping_address || {};
  const destCountryISO2 = resolveCountryToISO2(shipping.country, shipping.countryCode);
  if (destCountryISO2 && destCountryISO2 !== 'IN') {
    return {
      srOrderId: null, srShipmentId: null, awbNumber: null, labelUrl: null,
      error: 'This order has an international destination. Use createIntlShipmentFromOrder instead.',
    };
  }

  const allItems = (order.order_items || []) as any[];
  if (allItems.length === 0) {
    return { srOrderId: null, srShipmentId: null, awbNumber: null, labelUrl: null, error: 'Order has no items' };
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
    return { srOrderId: null, srShipmentId: null, awbNumber: null, labelUrl: null, error: 'No items in this order belong to this seller' };
  }

  const orderCurrency = String(order.currency || 'INR').trim().toUpperCase();
  let exchangeRates: Record<string, number> | null = null;
  if (orderCurrency !== 'INR') {
    try {
      exchangeRates = await fetchExchangeRates();
    } catch {
      exchangeRates = null;
    }
  }

  // 3. Build order_items and calculate combined weight/dims
  const orderItems: Array<Record<string, unknown>> = [];
  let totalWeightKg = 0;
  let maxLengthCm = 0;
  let maxWidthCm = 0;
  let maxHeightCm = 0;
  let subTotal = 0;

  for (const item of items) {
    const product = productMap.get(item.product_id);
    const qty = Number(item.quantity || 1);
    const variantInfo = item.variant_info || {};
    const sku = variantInfo.sku || product?.sku || `PROD-${item.product_id?.slice(0, 8) || 'UNKNOWN'}`;
    const productName = item.product_name || product?.name || 'Product';
    const hsCode = product?.hsn_code || variantInfo.hsn_code || '';
    const sellingPrice = resolveInrUnitPrice({
      candidatePrice: Number(item.customer_unit_price ?? item.price ?? item.unit_price ?? 0),
      sellerUnitPrice: Number(item.seller_unit_price ?? 0),
      fromCurrency: orderCurrency,
      rates: exchangeRates,
    });

    orderItems.push({
      name: productName,
      sku,
      units: qty,
      selling_price: sellingPrice,
      ...(hsCode ? { hsn: hsCode } : {}),
    });

    subTotal += roundMoney(sellingPrice * qty);

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

  // 4. Extract shipping address fields
  const customerName = shipping.full_name || shipping.name || shipping.fullName || 'Customer';
  const customerPhone = shipping.phone || shipping.phone_number || shipping.mobile || '';
  const customerEmail = shipping.email || '';
  const shippingAddress = shipping.street_address_1 || shipping.street || shipping.address || shipping.address_line_1 || shipping.line1 || '';
  const shippingAddress2 = shipping.street_address_2 || shipping.line2 || '';
  const shippingCity = shipping.city || '';
  const shippingState = shipping.state || '';
  const shippingPincode = shipping.postal_code || shipping.postalCode || shipping.pin || '';

  if (!customerName) return { srOrderId: null, srShipmentId: null, awbNumber: null, labelUrl: null, error: 'Order shipping address has no recipient name' };
  if (!shippingAddress) return { srOrderId: null, srShipmentId: null, awbNumber: null, labelUrl: null, error: 'Order shipping address has no street address' };
  if (!customerPhone) return { srOrderId: null, srShipmentId: null, awbNumber: null, labelUrl: null, error: 'Order shipping address has no phone number' };
  if (!shippingCity) return { srOrderId: null, srShipmentId: null, awbNumber: null, labelUrl: null, error: 'Order shipping address has no city' };
  if (!shippingState) return { srOrderId: null, srShipmentId: null, awbNumber: null, labelUrl: null, error: 'Order shipping address has no state' };
  if (!shippingPincode) return { srOrderId: null, srShipmentId: null, awbNumber: null, labelUrl: null, error: 'Order shipping address has no postal code' };
  if (totalWeightKg <= 0) return { srOrderId: null, srShipmentId: null, awbNumber: null, labelUrl: null, error: 'Products have no weight configured — cannot create shipment' };

  // 5. Fetch seller KYC for billing/pickup info
  const { data: kyc } = await supabase
    .from('seller_kyc')
    .select('full_name, email, phone, business_street_address_1, business_city, business_postal_code, business_state, country')
    .eq('seller_id', sellerId)
    .maybeSingle();

  // 6. Fetch seller's pickup location
  const { data: pickupLoc } = await supabase
    .from('seller_pickup_locations')
    .select('pickup_location_name, pin_code')
    .eq('seller_id', sellerId)
    .limit(1)
    .maybeSingle();

  const pickupLocationName = pickupLoc?.pickup_location_name || 'Primary';
  const pickupPinCode = pickupLoc?.pin_code || kyc?.business_postal_code || '';

  // Domestic supports both COD and Prepaid
  const paymentMethod = order.payment_status === 'paid' ? 'Prepaid' : 'COD';

  const orderDate = order.created_at
    ? new Date(order.created_at).toISOString().replace('T', ' ').slice(0, 16)
    : new Date().toISOString().replace('T', ' ').slice(0, 16);

  const srReferenceOrderId = `BZEAD-DOM-${orderId.slice(0, 8)}-${Date.now()}`;

  // 7. Check domestic courier serviceability to get courier + rate
  let courierId: number | undefined = overrideCourierId;

  if (!courierId && pickupPinCode && shippingPincode) {
    const svcResult = await checkDomesticServiceability({
      sellerId,
      requestData: {
        pickup_postcode: pickupPinCode,
        delivery_postcode: shippingPincode,
        weight: Math.max(Number(totalWeightKg.toFixed(2)), 0.1),
        cod: paymentMethod === 'COD' ? 1 : 0,
      },
    });

    if (svcResult.error) {
      return { srOrderId: null, srShipmentId: null, awbNumber: null, labelUrl: null, error: `Domestic courier serviceability failed: ${svcResult.error}` };
    }

    if (svcResult.data) {
      const svcData = svcResult.data as Record<string, unknown>;
      // Defensive unwrap: documented shape { payload: { data: ... } }, live shape { data: ... }.
      const innerData = ((svcData.payload ?? svcData.data ?? svcData)) as Record<string, unknown>;
      const couriers = (innerData.available_courier_companies || []) as Array<Record<string, unknown>>;
      // Pick cheapest available
      const validCouriers = couriers
        .filter((c) => !c.blocked)
        .filter((c) => extractShiprocketCourierRate(c) > 0)
        .sort((a, b) => extractShiprocketCourierRate(a) - extractShiprocketCourierRate(b));
      const bestCourier = validCouriers[0];
      if (bestCourier) {
        courierId = Number(bestCourier.courier_company_id);
      }
    }
  }

  if (!courierId) {
    return { srOrderId: null, srShipmentId: null, awbNumber: null, labelUrl: null, error: 'No domestic couriers available for this route' };
  }

  // 8. Create domestic order in Shiprocket
  let srOrderId: number | undefined | null = existingShipment?.sr_order_id ?? null;
  let srShipmentId: number | undefined | null = existingShipment?.sr_shipment_id ?? null;

  if (!srOrderId) {
    const createResult = await createDomesticOrder({
      sellerId,
      orderId,
      requestData: {
        order_id: srReferenceOrderId,
        order_date: orderDate,
        pickup_location: pickupLocationName,
        billing_customer_name: kyc?.full_name || customerName,
        billing_address: kyc?.business_street_address_1 || shippingAddress,
        billing_city: kyc?.business_city || shippingCity,
        billing_pincode: kyc?.business_postal_code || shippingPincode,
        billing_state: kyc?.business_state || shippingState,
        billing_country: 'India',
        billing_email: kyc?.email || customerEmail,
        billing_phone: kyc?.phone || customerPhone,
        shipping_is_billing: false,
        shipping_customer_name: customerName,
        shipping_address: shippingAddress,
        shipping_address_2: shippingAddress2,
        shipping_city: shippingCity,
        shipping_pincode: shippingPincode,
        shipping_state: shippingState,
        shipping_country: 'India',
        shipping_email: customerEmail,
        shipping_phone: customerPhone,
        order_items: orderItems,
        payment_method: paymentMethod,
        sub_total: roundMoney(subTotal),
        length: Math.max(Math.round(maxLengthCm), 1),
        breadth: Math.max(Math.round(maxWidthCm), 1),
        height: Math.max(Math.round(maxHeightCm), 1),
        weight: Math.max(Number(totalWeightKg.toFixed(2)), 0.1),
      },
    });

    if (createResult.error) {
      return { srOrderId: null, srShipmentId: null, awbNumber: null, labelUrl: null, error: createResult.error };
    }

    const createData = createResult.data as Record<string, unknown>;
    srOrderId = createData.order_id as number | undefined;
    srShipmentId = createData.shipment_id as number | undefined;
  }

  if (!srOrderId || !srShipmentId) {
    return {
      srOrderId: srOrderId || null,
      srShipmentId: srShipmentId || null,
      awbNumber: null,
      labelUrl: null,
      error: 'Domestic order created but no shipment ID returned from Shiprocket',
    };
  }

  const output: CreateDomesticShipmentFromOrderResult = {
    srOrderId,
    srShipmentId,
    awbNumber: null,
    labelUrl: null,
    error: null,
  };

  // 9. Assign AWB with selected courier
  const awbPayload: Record<string, unknown> = { shipment_id: srShipmentId };
  if (courierId) awbPayload.courier_id = courierId;

  const awbResult = await assignAwb({ sellerId, orderId, requestData: awbPayload });

  if (awbResult.error) {
    output.error = `Order created (SR#${srOrderId}) but AWB assignment failed: ${awbResult.error}`;
    return output;
  }

  const awbData = awbResult.data as Record<string, unknown>;
  const awbResponse = awbData?.response as Record<string, unknown> | undefined;
  const awbInner = awbResponse?.data as Record<string, unknown> | undefined;
  output.awbNumber = (awbInner?.awb_code as string) || null;

  // 10. Generate label
  if (srShipmentId) {
    const labelResult = await generateLabel({ sellerId, orderId, requestData: { shipment_id: srShipmentId } });
    if (!labelResult.error) {
      const labelData = labelResult.data as Record<string, unknown>;
      output.labelUrl = (labelData?.label_url as string) || null;
    }
  }

  // 11. Schedule pickup
  try {
    const now = new Date();
    const pickupDate = new Date(now);
    if (now.getHours() >= 16) pickupDate.setDate(pickupDate.getDate() + 1);
    const pickupDateStr = pickupDate.toISOString().split('T')[0];

    const pickupResult = await schedulePickup({
      sellerId,
      orderId,
      requestData: { shipment_id: srShipmentId, pickup_date: pickupDateStr },
    });

    output.pickupScheduled = !pickupResult.error;
    if (pickupResult.error) output.pickupError = pickupResult.error;
  } catch (pickupErr) {
    output.pickupScheduled = false;
    output.pickupError = pickupErr instanceof Error ? pickupErr.message : 'Pickup scheduling failed';
  }

  return output;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sync-only flow: creates the order in Shiprocket (lands in "New Orders") but
// does NOT assign AWB / generate label / schedule pickup. Use this from admin
// dashboard to first push the order to Shiprocket — courier can be picked
// later via the existing createIntlShipmentFromOrder / createDomesticShipmentFromOrder
// flow, which detects the existing sr_order_id and resumes from AWB assignment.
//
// All prices are converted to INR using live exchange rates regardless of the
// order's display currency — Shiprocket requires INR-denominated values.
// ─────────────────────────────────────────────────────────────────────────────

export interface SyncOrderToShiprocketResult {
  srOrderId: number | null;
  srShipmentId: number | null;
  destination: 'domestic' | 'international' | null;
  alreadySynced: boolean;
  error: string | null;
}

export async function syncOrderToShiprocket(
  sellerId: string,
  orderId: string,
): Promise<SyncOrderToShiprocketResult> {
  // Idempotency: if a non-cancelled shipment already exists, do not re-push.
  const { data: existingShipment } = await supabase
    .from('shiprocket_shipments')
    .select('id, sr_order_id, sr_shipment_id, status')
    .eq('order_id', orderId)
    .eq('seller_id', sellerId)
    .neq('status', 'cancelled')
    .limit(1)
    .maybeSingle();

  if (existingShipment && existingShipment.sr_order_id) {
    return {
      srOrderId: existingShipment.sr_order_id,
      srShipmentId: existingShipment.sr_shipment_id || null,
      destination: null,
      alreadySynced: true,
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
    return { srOrderId: null, srShipmentId: null, destination: null, alreadySynced: false, error: orderErr?.message || 'Order not found' };
  }

  const shipping = order.shipping_address || {};
  const destCountryISO2 = resolveCountryToISO2(shipping.country, shipping.countryCode);
  const isIntl = !!destCountryISO2 && destCountryISO2 !== 'IN';

  const allItems = (order.order_items || []) as any[];
  if (allItems.length === 0) {
    return { srOrderId: null, srShipmentId: null, destination: null, alreadySynced: false, error: 'Order has no items' };
  }

  // 2. Fetch product details + measurement units
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

  const items = allItems.filter((item: any) => {
    if (item.seller_id === sellerId) return true;
    const product = productMap.get(item.product_id);
    return product?.seller_id === sellerId;
  });

  if (items.length === 0) {
    return { srOrderId: null, srShipmentId: null, destination: null, alreadySynced: false, error: 'No items in this order belong to this seller' };
  }

  // 3. Currency: ALWAYS convert to INR for Shiprocket (regardless of order's display currency)
  const orderCurrency = String(order.currency || 'INR').trim().toUpperCase();
  let exchangeRates: Record<string, number> | null = null;
  if (orderCurrency !== 'INR') {
    try {
      exchangeRates = await fetchExchangeRates();
    } catch {
      exchangeRates = null;
    }
    if (!exchangeRates) {
      return {
        srOrderId: null, srShipmentId: null, destination: null, alreadySynced: false,
        error: `Failed to fetch exchange rates — cannot convert ${orderCurrency} to INR for Shiprocket sync.`,
      };
    }
  }

  // 4. Build order_items + aggregate dims/weight (all values in INR)
  const orderItems: Array<Record<string, unknown>> = [];
  let totalWeightKg = 0;
  let maxLengthCm = 0;
  let maxWidthCm = 0;
  let maxHeightCm = 0;
  let subTotal = 0;

  for (const item of items) {
    const product = productMap.get(item.product_id);
    const qty = Number(item.quantity || 1);
    const variantInfo = item.variant_info || {};
    const sku = variantInfo.sku || product?.sku || `PROD-${item.product_id?.slice(0, 8) || 'UNKNOWN'}`;
    const productName = item.product_name || product?.name || 'Product';
    const hsCode = product?.hsn_code || variantInfo.hsn_code || '';

    const sellingPriceInr = resolveInrUnitPrice({
      candidatePrice: Number(item.customer_unit_price ?? item.price ?? item.unit_price ?? 0),
      sellerUnitPrice: Number(item.seller_unit_price ?? 0),
      fromCurrency: orderCurrency,
      rates: exchangeRates,
    });

    if (isIntl && !hsCode) {
      return {
        srOrderId: null, srShipmentId: null, destination: 'international', alreadySynced: false,
        error: `Product "${productName}" is missing an HS code — required for international shipments.`,
      };
    }

    orderItems.push({
      name: productName,
      sku,
      units: qty,
      selling_price: sellingPriceInr,
      ...(hsCode ? { hsn: hsCode } : {}),
    });

    subTotal += roundMoney(sellingPriceInr * qty);

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

  // 5. Shipping address
  const customerName = shipping.full_name || shipping.name || shipping.fullName || 'Customer';
  const customerPhone = shipping.phone || shipping.phone_number || shipping.mobile || '';
  const customerEmail = shipping.email || '';
  const shippingAddress = shipping.street_address_1 || shipping.street || shipping.address || shipping.address_line_1 || shipping.line1 || '';
  const shippingAddress2 = shipping.street_address_2 || shipping.line2 || '';
  const shippingCity = shipping.city || '';
  const shippingState = shipping.state || '';
  const shippingPincode = shipping.postal_code || shipping.postalCode || shipping.pin || '';
  const shippingCountry = shipping.country || (isIntl ? destCountryISO2 : 'India');

  if (!shippingAddress) return { srOrderId: null, srShipmentId: null, destination: isIntl ? 'international' : 'domestic', alreadySynced: false, error: 'Order shipping address has no street address' };
  if (!customerPhone) return { srOrderId: null, srShipmentId: null, destination: isIntl ? 'international' : 'domestic', alreadySynced: false, error: 'Order shipping address has no phone number' };
  if (!shippingCity) return { srOrderId: null, srShipmentId: null, destination: isIntl ? 'international' : 'domestic', alreadySynced: false, error: 'Order shipping address has no city' };
  if (!shippingState) return { srOrderId: null, srShipmentId: null, destination: isIntl ? 'international' : 'domestic', alreadySynced: false, error: 'Order shipping address has no state' };
  if (!shippingPincode) return { srOrderId: null, srShipmentId: null, destination: isIntl ? 'international' : 'domestic', alreadySynced: false, error: 'Order shipping address has no postal code' };
  if (totalWeightKg <= 0) return { srOrderId: null, srShipmentId: null, destination: isIntl ? 'international' : 'domestic', alreadySynced: false, error: 'Products have no weight configured — cannot sync to Shiprocket' };

  // 6. Seller KYC + pickup location
  const { data: kyc } = await supabase
    .from('seller_kyc')
    .select('full_name, email, phone, business_street_address_1, business_city, business_postal_code, business_state, country')
    .eq('seller_id', sellerId)
    .maybeSingle();

  const { data: pickupLoc } = await supabase
    .from('seller_pickup_locations')
    .select('pickup_location_name, pin_code')
    .eq('seller_id', sellerId)
    .limit(1)
    .maybeSingle();

  const pickupLocationName = pickupLoc?.pickup_location_name || 'Primary';

  // International is always Prepaid; Domestic depends on payment_status
  const paymentMethod = isIntl ? 'Prepaid' : (order.payment_status === 'paid' ? 'Prepaid' : 'COD');

  const orderDate = order.created_at
    ? new Date(order.created_at).toISOString().replace('T', ' ').slice(0, 16)
    : new Date().toISOString().replace('T', ' ').slice(0, 16);

  const srReferenceOrderId = `BZEAD-${isIntl ? 'INTL' : 'DOM'}-${orderId.slice(0, 8)}-${Date.now()}`;

  // 7. Build request payload (NO courier_id → order lands in "New Orders" without AWB)
  const basePayload: Record<string, unknown> = {
    order_id: srReferenceOrderId,
    order_date: orderDate,
    pickup_location: pickupLocationName,
    billing_customer_name: kyc?.full_name || customerName,
    billing_address: kyc?.business_street_address_1 || shippingAddress,
    billing_city: kyc?.business_city || shippingCity,
    billing_pincode: kyc?.business_postal_code || shippingPincode,
    billing_state: kyc?.business_state || shippingState,
    billing_country: kyc?.country || 'India',
    billing_email: kyc?.email || customerEmail,
    billing_phone: kyc?.phone || customerPhone,
    shipping_is_billing: false,
    shipping_customer_name: customerName,
    shipping_address: shippingAddress,
    shipping_address_2: shippingAddress2,
    shipping_city: shippingCity,
    shipping_pincode: shippingPincode,
    shipping_state: shippingState,
    shipping_country: shippingCountry,
    shipping_email: customerEmail,
    shipping_phone: customerPhone,
    order_items: orderItems,
    payment_method: paymentMethod,
    sub_total: roundMoney(subTotal),
    length: Math.max(Math.round(maxLengthCm), 1),
    breadth: Math.max(Math.round(maxWidthCm), 1),
    height: Math.max(Math.round(maxHeightCm), 1),
    weight: Math.max(Number(totalWeightKg.toFixed(2)), 0.1),
  };

  if (isIntl) {
    basePayload.shipping_country_code = destCountryISO2;
    basePayload.purpose_of_shipment = 'SALE';
    basePayload.currency = 'INR';
    basePayload.invoice_number = `BZEAD-INV-${orderId.slice(0, 8).toUpperCase()}`;
    basePayload.invoice_date = orderDate;
  }

  // 8. Call the appropriate create-order edge action
  const createResult = isIntl
    ? await createInternationalOrder({ sellerId, orderId, requestData: basePayload })
    : await createDomesticOrder({ sellerId, orderId, requestData: basePayload });

  if (createResult.error) {
    return { srOrderId: null, srShipmentId: null, destination: isIntl ? 'international' : 'domestic', alreadySynced: false, error: createResult.error };
  }

  const createData = createResult.data as Record<string, unknown> | null;
  const srOrderId = createData ? (createData.order_id as number | undefined) : undefined;
  const srShipmentId = createData ? (createData.shipment_id as number | undefined) : undefined;

  return {
    srOrderId: srOrderId || null,
    srShipmentId: srShipmentId || null,
    destination: isIntl ? 'international' : 'domestic',
    alreadySynced: false,
    error: srOrderId ? null : 'Shiprocket did not return an order_id',
  };
}
