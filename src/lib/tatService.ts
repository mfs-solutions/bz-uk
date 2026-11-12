/**
 * Expected TAT (Turn-Around-Time) Service
 *
 * Provides delivery time estimates and serviceability checks.
 * India domestic: uses Shiprocket for serviceability and live TAT via shiprocket-ops.
 * Shippo origins: uses Shippo for serviceability.
 * TAT estimates use carrier-based static defaults.
 */

import { supabase } from './supabase';
import { checkDomesticServiceability, resolveCountryToISO2 } from './shiprocketOpsService';
import { getShippingProvider } from './shippoOpsService';

export type DeliveryProvider = 'shiprocket' | 'shippo';
export { resolveCountryToISO2, getShippingProvider };

/* ────────────────────────── Types ────────────────────────── */

export interface TatResult {
  /** Number of days for delivery (0 if unknown) */
  tatDays: number;
  /** ISO date string of expected delivery (empty string if unknown) */
  expectedDeliveryDate: string;
}

export interface TatInput {
  originPin: string;
  destinationPin: string;
  sellerId: string;
  /** S = Surface, E = Express (default), N = Next Day */
  mot?: 'S' | 'E' | 'N';
}

/** Per-seller TAT result */
export interface SellerTatResult {
  sellerId: string;
  sellerName?: string;
  originPin: string;
  tat: TatResult;
}

/* ────────────────────────── Cache ────────────────────────── */

const TAT_CACHE = new Map<string, { result: TatResult; timestamp: number }>();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

function cacheKey(originPin: string, destinationPin: string): string {
  return `${originPin}:${destinationPin}`;
}

function getCached(originPin: string, destinationPin: string): TatResult | null {
  const key = cacheKey(originPin, destinationPin);
  const entry = TAT_CACHE.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    TAT_CACHE.delete(key);
    return null;
  }
  return entry.result;
}

function setCache(originPin: string, destinationPin: string, result: TatResult): void {
  const key = cacheKey(originPin, destinationPin);
  TAT_CACHE.set(key, { result, timestamp: Date.now() });
}

/* ────────────────────────── Shared ────────────────────────── */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/* ────────────────── Serviceability ────────────────── */

export interface ServiceabilityResult {
  serviceable: boolean;
  /** Whether COD is available for this pincode (domestic India only) */
  codAvailable?: boolean;
  /** Present if international check */
  international?: boolean;
  /** Raw payload from provider */
  raw?: unknown;
}

const SERVICEABILITY_CACHE = new Map<string, { result: ServiceabilityResult; timestamp: number }>();

function getServiceabilityCached(pin: string): ServiceabilityResult | null {
  const entry = SERVICEABILITY_CACHE.get(pin);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    SERVICEABILITY_CACHE.delete(pin);
    return null;
  }
  return entry.result;
}

function setServiceabilityCache(pin: string, result: ServiceabilityResult): void {
  SERVICEABILITY_CACHE.set(pin, { result, timestamp: Date.now() });
}

/**
 * Check whether a destination postal code is serviceable.
 * - Domestic India (6-digit pincode): checks via Shiprocket API
 * - International (country_code provided): checks products.ships_internationally flag
 * Results are cached for CACHE_TTL_MS.
 *
 * @param pincode - postal/zip code (any format)
 * @param sellerId - seller (or user) ID for auth
 * @param countryCode - optional country code for international checks
 * @param productId - optional product UUID for accurate international checks
 */
export async function checkDeliveryServiceability(
  pincode: string,
  sellerId: string,
  countryCode?: string,
  productId?: string,
): Promise<ServiceabilityResult> {
  const pin = sanitizePin(pincode);
  if (!pin) return { serviceable: false };

  // Normalize freeform country to ISO-2 code
  const isoCode = countryCode ? resolveCountryToISO2(countryCode) : '';

  const cacheKeyStr = isoCode ? `${isoCode}:${pin}:${productId || ''}` : pin;
  const cached = getServiceabilityCached(cacheKeyStr);
  if (cached) return cached;

  try {
    // International check: just verify the product ships internationally
    if (isoCode && !isIndiaCountry(isoCode)) {
      let serviceable = true;
      if (productId && UUID_RE.test(productId)) {
        const { data } = await supabase
          .from('products')
          .select('ships_internationally')
          .eq('id', productId)
          .single();
        serviceable = Boolean(data?.ships_internationally);
      }
      const result: ServiceabilityResult = { serviceable, international: true };
      setServiceabilityCache(cacheKeyStr, result);
      return result;
    }

    // Domestic India: check via Shiprocket
    // Resolve seller pickup pincode from seller_kyc
    const { data: kycData } = await supabase
      .from('seller_kyc')
      .select('business_postal_code')
      .eq('seller_id', sellerId)
      .maybeSingle();
    const pickupPincode = sanitizePin(kycData?.business_postal_code || '');

    if (!pickupPincode) {
      // No pickup pincode — seller has no KYC / business address; block checkout
      const result: ServiceabilityResult = { serviceable: false };
      setServiceabilityCache(cacheKeyStr, result);
      return result;
    }

    const response = await checkDomesticServiceability({
      sellerId,
      requestData: {
        pickup_postcode: pickupPincode,
        delivery_postcode: pin,
        weight: 0.5,
        cod: 0,
      },
    });

    if (response.error) {
      console.error('[Serviceability] Shiprocket API error:', response.error);
      // Fail-closed: block checkout when we cannot verify serviceability
      return { serviceable: false };
    }

    const shiprocketRes = response.data as Record<string, unknown> | undefined;
    // Defensive unwrap: documented Shiprocket domestic shape is { payload: { data: ... } },
    // observed live shape is flat { data: ... }. Handle both before reading the courier list.
    const payload = (shiprocketRes as Record<string, unknown> | undefined)?.payload ?? shiprocketRes;
    const available = ((payload as Record<string, unknown> | undefined)?.data ?? payload) as any;
    const serviceable = Boolean(
      available?.available_courier_companies?.length > 0
      || available?.recommended_courier_company_id
    );
    const codAvailable = serviceable && Boolean(available?.available_courier_companies?.some?.((c: any) => c.cod === 1));
    const result: ServiceabilityResult = { serviceable, codAvailable, raw: shiprocketRes };
    setServiceabilityCache(cacheKeyStr, result);
    return result;
  } catch (err) {
    console.error('[Serviceability] Check failed:', err);
    return { serviceable: false }; // fail-closed: block checkout when serviceability unknown
  }
}

/** Returns true if the value looks like a valid Indian 6-digit pincode */
export function isIndianPincode(value: string): boolean {
  return /^\d{6}$/.test(value);
}

/** Returns true if the country string represents India */
export function isIndiaCountry(country: string): boolean {
  const c = String(country || '').trim().toUpperCase();
  return c === 'IN' || c === 'IND' || c === 'INDIA';
}

/* ────────────────────────── Core ────────────────────────── */

/**
 * Fetch expected TAT for a single origin → destination lane.

 * India domestic (both pincodes are 6-digit): calls Shiprocket serviceability API
 * to get real estimated_delivery_days from available couriers. India domestic never
 * falls back to an admin-configured or static delivery estimate.
 * Non-India routes: uses carrier-based static defaults.
 * Uses in-memory cache to avoid duplicate computations.
 */
export async function fetchExpectedTat(input: TatInput): Promise<TatResult> {
  const origin = sanitizePin(input.originPin);
  const destination = sanitizePin(input.destinationPin);

  if (!origin || !destination) {
    console.warn('[TAT] Invalid pincodes:', { origin: input.originPin, destination: input.destinationPin });
    return { tatDays: 0, expectedDeliveryDate: '' };
  }

  // Check cache first
  const cached = getCached(origin, destination);
  if (cached) {
    console.log('[TAT] Cache hit:', origin, '→', destination, '=', cached.tatDays, 'days');
    return cached;
  }

  // Only call Shiprocket live API for India domestic (both pincodes are 6-digit Indian)
  if (isIndianPincode(origin) && isIndianPincode(destination) && input.sellerId) {
    try {
      const response = await checkDomesticServiceability({
        sellerId: input.sellerId,
        requestData: {
          pickup_postcode: origin,
          delivery_postcode: destination,
          weight: 0.5,
          cod: 0,
        },
      });

      if (!response.error && response.data) {
        const payload = (response.data as Record<string, unknown>)?.payload ?? response.data;
        const innerData = (payload as Record<string, unknown>)?.data ?? payload;
        const couriers = (innerData as Record<string, unknown>)?.available_courier_companies as
          Array<Record<string, unknown>> | undefined;

        if (Array.isArray(couriers) && couriers.length > 0) {
          // Parse estimated_delivery_days from all non-blocked couriers
          const validDays = couriers
            .filter((c) => !c.blocked)
            .map((c) => {
              // estimated_delivery_days can be "5" or "3 - 5" — take the max number
              const raw = String(c.estimated_delivery_days || '');
              const nums = raw.match(/\d+/g);
              if (nums && nums.length > 0) return Math.max(...nums.map(Number));
              // Fallback to etd_hours if available
              const etdHours = Number(c.etd_hours || 0);
              if (etdHours > 0) return Math.ceil(etdHours / 24);
              return 0;
            })
            .filter((d) => d > 0);

          if (validDays.length > 0) {
            // Use the fastest (minimum) estimate from available couriers
            const tatDays = Math.min(...validDays);
            const dt = new Date();
            dt.setDate(dt.getDate() + tatDays);
            const result: TatResult = { tatDays, expectedDeliveryDate: dt.toISOString().split('T')[0] };
            console.log('[TAT] Live Shiprocket estimate:', origin, '→', destination, '=', result.tatDays, 'days');
            setCache(origin, destination, result);
            return result;
          }
        }
      }
    } catch (err) {
      console.warn('[TAT] Shiprocket live TAT lookup failed, falling back to default:', err);
    }
  }

  const indiaDomestic = isIndianPincode(origin) && isIndianPincode(destination);
  if (indiaDomestic) {
    return { tatDays: 0, expectedDeliveryDate: '' };
  }

  // Fallback: static carrier estimate for non-India routes only.
  const fallbackDays = CARRIER_TAT.shippo.domestic;
  const dt = new Date();
  dt.setDate(dt.getDate() + fallbackDays);
  const result: TatResult = { tatDays: fallbackDays, expectedDeliveryDate: dt.toISOString().split('T')[0] };

  console.log('[TAT] Fallback estimate:', origin, '→', destination, '=', result.tatDays, 'days');
  setCache(origin, destination, result);
  return result;
}

/* ────────────────── Multi-Seller TAT ────────────────── */

/**
 * Resolve pickup pincodes for products and fetch TAT per unique seller lane.
 * Returns per-seller TAT results + the maximum delivery days across all sellers.
 */
export async function fetchMultiSellerTat(
  productIds: string[],
  destinationPin: string,
  _userId: string,
): Promise<{ sellerResults: SellerTatResult[]; maxTatDays: number; maxExpectedDate: string }> {
  if (!productIds.length || !destinationPin) {
    return { sellerResults: [], maxTatDays: 0, maxExpectedDate: '' };
  }

  const sellerPincodeMap = await resolveSellerPickupPincodes(productIds);

  const uniqueLanes = new Map<string, { sellerId: string; originPin: string }>();
  for (const { sellerId, originPin } of sellerPincodeMap.values()) {
    if (sellerId && originPin) {
      uniqueLanes.set(`${sellerId}:${originPin}`, { sellerId, originPin });
    }
  }

  if (uniqueLanes.size === 0) {
    return { sellerResults: [], maxTatDays: 0, maxExpectedDate: '' };
  }

  const entries = Array.from(uniqueLanes.values());
  const tatResults = await Promise.all(
    entries.map(async (lane) => {
      const dest = sanitizePin(destinationPin);
      const tat = await fetchExpectedTat({
            originPin: lane.originPin,
            destinationPin: dest,
            sellerId: lane.sellerId,
            mot: 'E',
          });
      return {
        sellerId: lane.sellerId,
        originPin: lane.originPin,
        tat,
      };
    }),
  );

  let maxTatDays = 0;
  let maxExpectedDate = '';

  const sellerResults: SellerTatResult[] = tatResults.map((r) => {
    if (r.tat.tatDays > maxTatDays) {
      maxTatDays = r.tat.tatDays;
      maxExpectedDate = r.tat.expectedDeliveryDate;
    }
    return r;
  });

  return { sellerResults, maxTatDays, maxExpectedDate };
}

/**
 * Fetch TAT for a single product+seller (used on ProductDetailsPage).
 */
export async function fetchProductTat(
  productId: string,
  destinationPin: string,
  _userId: string,
): Promise<TatResult> {
  const sellerPincodeMap = await resolveSellerPickupPincodes([productId]);
  const entry = sellerPincodeMap.get(productId);

  if (!entry?.originPin) {
    return { tatDays: 0, expectedDeliveryDate: '' };
  }

  const dest = sanitizePin(destinationPin);

  return fetchExpectedTat({
    originPin: entry.originPin,
    destinationPin: dest,
    sellerId: entry.sellerId,
    mot: 'E',
  });
}

/* ────────────────── Pickup Pincode Resolution ────────────────── */

/**
 * Resolves seller pickup pincodes for a list of product IDs.
 * Uses seller_kyc.business_postal_code as the source.
 */
async function resolveSellerPickupPincodes(
  productIds: string[],
): Promise<Map<string, { sellerId: string; originPin: string }>> {
  const result = new Map<string, { sellerId: string; originPin: string }>();

  const validUuids = productIds.filter((id) => UUID_RE.test(id));
  if (validUuids.length === 0) {
    console.warn('[TAT] resolveSellerPickupPincodes: no valid UUIDs in', productIds);
    return result;
  }

  const { data: products } = await supabase
    .from('products')
    .select('id, seller_id')
    .in('id', validUuids);

  if (!products?.length) return result;

  const sellerByProduct = new Map<string, string>();
  products.forEach((p: any) => {
    sellerByProduct.set(String(p.id), String(p.seller_id || ''));
  });

  // Get unique seller IDs
  const sellerIds = [...new Set(products.map((p: any) => String(p.seller_id || '')).filter(Boolean))];
  if (sellerIds.length === 0) return result;

  const { data: kycData } = await supabase
    .from('seller_kyc')
    .select('seller_id, business_postal_code')
    .in('seller_id', sellerIds);

  const kycPinBySeller = new Map<string, string>();
  (kycData || []).forEach((row: any) => {
    kycPinBySeller.set(String(row.seller_id), String(row.business_postal_code || ''));
  });

  for (const productId of validUuids) {
    const sellerId = sellerByProduct.get(productId) || '';
    if (!sellerId) continue;
    const pin = kycPinBySeller.get(sellerId) || '';
    if (pin) {
      result.set(productId, { sellerId, originPin: sanitizePin(pin) });
    }
  }

  return result;
}

/* ────────────────── Helpers ────────────────── */

function sanitizePin(pin: string): string {
  return String(pin || '').replace(/\s+/g, '').trim();
}

/* ────────────────── Carrier-Based TAT Estimate ────────────────── */

/** Static carrier-specific delivery windows (business days). */
const CARRIER_TAT: Record<DeliveryProvider, { domestic: number; international: number }> = {
  shiprocket: { domestic: 5,  international: 10 },   // India domestic + intl
  shippo:     { domestic: 5,  international: 10 },   // UK/US/etc origin
};

/**
 * Build a TatResult from carrier defaults.
 * The real carrier APIs return exact estimates at order-creation time;
 * this gives a reasonable pre-checkout estimate on the PDP.
 */
export function estimateCarrierTat(
  provider: DeliveryProvider,
  isDomestic: boolean,
): TatResult {
  const days = isDomestic
    ? CARRIER_TAT[provider].domestic
    : CARRIER_TAT[provider].international;
  if (!days) return { tatDays: 0, expectedDeliveryDate: '' };
  const dt = new Date();
  dt.setDate(dt.getDate() + days);
  return { tatDays: days, expectedDeliveryDate: dt.toISOString().split('T')[0] };
}
