import { supabase } from './supabase.ts';
import { convertAmount, resolveCurrencyFromCountry } from '../utils/currency.ts';
import {
  IS_UK_STOREFRONT,
  isUKCountry,
  STOREFRONT_CURRENCY_CODE,
} from '../config/market.ts';
import { fetchVerifiedVariantPrices } from './pricingService.ts';
import { runtimeEnv } from './runtimeEnv.ts';

export interface CheckoutPricingInputItem {
  cartItemId?: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  currency: string;
  selectedVariantId?: string | null;
  selectedVariantSku?: string | null;
  selectedSize?: string | null;
  selectedColor?: string | null;
}

export interface IneligibleCheckoutItem {
  productId: string;
  productName: string;
  availableCountries: string[];
}

export interface CheckoutPricingLine {
  cartItemId?: string;
  productId: string;
  productName: string;
  quantity: number;
  sourceCurrency: string;
  sourceUnitPrice: number;
  convertedUnitPrice: number;
  convertedLineTotal: number;
  convertedShippingTotal: number;
  offerDiscount: number;
  minQuantityWarning?: string;
  selectedVariantId?: string;
  selectedVariantSku?: string;
}

export interface IntlShippingOption {
  /** Shipping cost in target currency */
  shipping: number;
  /** Total order cost in target currency */
  total: number;
  /** Estimated delivery date range, e.g. "Mar 31, 2026 - Apr 02, 2026" */
  etd: string;
  /** Estimated delivery days, e.g. "5 - 7" */
  estimatedDays: string;
  /** Carrier name from rate lookup (e.g. "Evri", "DPD") */
  carrierName?: string;
  /** Service level from rate lookup (e.g. "Parcelforce Express 48") */
  serviceLevel?: string;
  /** Shippo rate object_id for purchasing this rate */
  rateId?: string;
  /** Shipping provider identifier (e.g. "shippo", "shiprocket") */
  provider?: string;
}

export interface IntlShippingOptions {
  standard: IntlShippingOption;
  premium: IntlShippingOption | null;
  express: IntlShippingOption | null;
}

export interface MinimumOrderConstraint {
  code: 'INDIA_TO_UK_MIN_SUBTOTAL';
  minimumInr: number;
  minimumInCheckoutCurrency: number;
  currentSubtotalInr: number;
  currentSubtotalInCheckoutCurrency: number;
  isMet: boolean;
}

export interface DestinationCheckoutPricing {
  currency: string;
  destinationCountry: string;
  subtotal: number;
  offerDiscount: number;
  platformHandlingCharge: number;
  shipping: number;
  total: number;
  items: CheckoutPricingLine[];
  ineligibleItems: IneligibleCheckoutItem[];
  codEligible: boolean;
  codIneligibleItems: IneligibleCheckoutItem[];
  /** True when at least one item ships internationally (origin ≠ destination) */
  hasInternationalItems: boolean;
  /** Product subtotal expressed in INR (for minimum-order-value validation) */
  subtotalInr: number;
  /** Shipping cost BEFORE platform surcharge (internal — never show to buyer) */
  actualShippingCost: number;
  /** Platform operational surcharge baked into shipping (internal — never show to buyer) */
  platformShippingMargin: number;
  /** International shipping tier options — present only for international orders */
  intlShippingOptions?: IntlShippingOptions;
  /** Error message when international shipping rate lookup fails */
  intlShippingError?: string;
  /** Error message when domestic shipping rate lookup fails (Shippo countries) */
  domesticShippingError?: string;
  /** UK domestic shipping tier options (Standard/Premium/Express from Shippo) */
  ukDomesticShippingOptions?: IntlShippingOptions;
  /** Optional destination-based minimum-order requirement. */
  minimumOrderConstraint?: MinimumOrderConstraint;
}

type ProductCountryRow = {
  id: string;
  origin_country: string | null;
  origin_country_id: string | null;
  currency: string | null;
  is_cod_available: boolean | null;
  shipping_type: string | null;
  courier_partner: string | null;
  preferred_carrier: string | null;
  package_weight: number | string | null;
  package_weight_unit_id: string | null;
  package_length: number | string | null;
  package_length_unit_id: string | null;
  package_width: number | string | null;
  package_width_unit_id: string | null;
  package_height: number | string | null;
  package_height_unit_id: string | null;
  seller_id: string | null;
  hsn_code: string | null;
  ships_internationally: boolean | null;
};

type ProfileCountryRow = {
  id: string;
  country_id: string | null;
};

type MeasurementUnitRow = {
  id: string;
  code: string | null;
};

type OfferRuleRow = {
  product_id: string;
  offer_type: string | null;
  buy_quantity: number | string | null;
  get_quantity: number | string | null;
  special_day_name: string | null;
  discount_percent: number | string | null;
  start_time: string | null;
  end_time: string | null;
  bundle_min_qty: number | string | null;
  bundle_discount: number | string | null;
  is_active: boolean | null;
};

type CountryLookupRow = {
  id: string;
  country_name: string | null;
  country_code: string | null;
  short_code: string | null;
  iso2: string | null;
};

type ShippingProviderConfigRow = {
  country_code: string;
  provider: string;
  domestic: boolean;
  international: boolean;
};

type CheckoutMinOrderRuleRow = {
  origin_iso2: string | null;
  destination_iso2: string | null;
  min_order_inr: number | string | null;
};

type PlatformCommissionRuleRow = {
  zone_code: string | null;
  country_id: string | null;
  from_price: number | string | null;
  to_price: number | string | null;
  charge_percent: number | string | null;
  extra_charge: number | string | null;
};

type PodShippingRateRow = {
  weight_band_unit: string | null;
  weight_band_from: number | string | null;
  weight_band_to: number | string | null;
  currency_code: string | null;
  standard_shipping_amount: number | string | null;
  standard_est_delivery_date: string | null;
  express_shipping_amount: number | string | null;
  express_est_delivery_date: string | null;
};



let checkoutReferenceCache: {
  countries: CountryLookupRow[];
  measurementUnits: MeasurementUnitRow[];
  shippingProviderConfig: ShippingProviderConfigRow[];
  checkoutMinOrderRules: CheckoutMinOrderRuleRow[];
  platformCommissionRules: PlatformCommissionRuleRow[];
  expiresAt: number;
} | null = null;

const CHECKOUT_REFERENCE_CACHE_TTL_MS = 5 * 60 * 1000;

const getCheckoutReferenceData = async (fresh = false) => {
  if (!fresh && checkoutReferenceCache && Date.now() < checkoutReferenceCache.expiresAt) {
    return checkoutReferenceCache;
  }

  const [
    countriesResponse,
    measurementUnitsResponse,
    shippingProviderConfigResponse,
    checkoutMinOrderRulesResponse,
    platformCommissionRulesResponse,
  ] = await Promise.all([
    supabase
      .from('countries')
      .select('id, country_name, country_code, short_code, iso2')
      .eq('is_active', true),
    supabase
      .from('measurement_units')
      .select('id, code')
      .eq('is_active', true),
    supabase
      .from('shipping_provider_config')
      .select('country_code, provider, domestic, international')
      .eq('active', true),
    supabase
      .rpc('get_active_checkout_min_order_rules'),
    supabase
      .from('platform_commission_rules')
      .select('zone_code, country_id, from_price, to_price, charge_percent, extra_charge')
      .eq('is_active', true),
  ]);

  if (checkoutMinOrderRulesResponse.error) {
    throw new Error(
      `[checkoutPricing] Failed to load minimum-order rules: ${checkoutMinOrderRulesResponse.error.message}`
    );
  }
  if (fresh) {
    const error = countriesResponse.error || measurementUnitsResponse.error
      || shippingProviderConfigResponse.error || platformCommissionRulesResponse.error;
    if (error) throw new Error(`[checkoutPricing] Failed to load checkout configuration: ${error.message}`);
  }

  checkoutReferenceCache = {
    countries: (countriesResponse.data || []) as CountryLookupRow[],
    measurementUnits: (measurementUnitsResponse.data || []) as MeasurementUnitRow[],
    shippingProviderConfig: (shippingProviderConfigResponse.data || []) as ShippingProviderConfigRow[],
    checkoutMinOrderRules: (checkoutMinOrderRulesResponse.data || []) as CheckoutMinOrderRuleRow[],
    platformCommissionRules: (platformCommissionRulesResponse.data || []) as PlatformCommissionRuleRow[],
    expiresAt: Date.now() + CHECKOUT_REFERENCE_CACHE_TTL_MS,
  };

  return checkoutReferenceCache;
};

const normalizeCountryToken = (value: string) => value.trim().toUpperCase().replace(/\s+/g, '');

const COUNTRY_TOKEN_ALIASES: Record<string, string[]> = {
  IN: ['IN', 'IND', 'INDIA'],
  GB: ['GB', 'GBR', 'UK', 'UNITEDKINGDOM', 'ENGLAND', 'SCOTLAND', 'WALES', 'NORTHERNIRELAND'],
  IE: ['IE', 'IRL', 'IRELAND'],
};

const ISO3_TO_ISO2: Record<string, string> = {
  IND: 'IN',
  GBR: 'GB',
  IRL: 'IE',
};

const buildCountryTokenSet = (...values: Array<string | null | undefined>): Set<string> => {
  const tokens = new Set<string>();
  for (const value of values) {
    const token = normalizeCountryToken(String(value || ''));
    if (!token) continue;
    tokens.add(token);

    const iso2 = token.length === 3 ? (ISO3_TO_ISO2[token] || '') : token;
    if (iso2) {
      const aliasGroup = COUNTRY_TOKEN_ALIASES[iso2];
      if (Array.isArray(aliasGroup)) {
        for (const alias of aliasGroup) tokens.add(alias);
      }
    }
  }
  return tokens;
};

const INDIA_COUNTRY_TOKENS = new Set(['INDIA', 'IN', 'IND']);
const TABLE_ONLY_POD_ROUTE_KEYS = new Set([
  'IN->MT',
  'IN->US',
  'IN->FR',
  'IN->DE',
  'IN->CH',
  'IN->KE',
  'IN->AL',
]);
const asFinite = (value: unknown): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const roundTo2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const sanitizePostalCode = (value: string) => value.trim().replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

const normalizeWeightToKg = (value: number, unitCode: string) => {
  const code = unitCode.trim().toUpperCase();
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (code === 'G') return value / 1000;
  if (code === 'LB') return value * 0.453592;
  if (code === 'OZ') return value * 0.0283495;
  return value;
};

const normalizeDimensionToCm = (value: number, unitCode: string) => {
  const code = unitCode.trim().toUpperCase();
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (code === 'MM') return value / 10;
  if (code === 'M') return value * 100;
  if (code === 'IN') return value * 2.54;
  if (code === 'FT') return value * 30.48;
  return value;
};

const convertKgToUnit = (weightKg: number, unitCode: string): number => {
  const code = String(unitCode || '').trim().toUpperCase();
  if (!Number.isFinite(weightKg) || weightKg <= 0) return 0;
  if (code === 'GM' || code === 'G') return weightKg * 1000;
  if (code === 'LB') return weightKg / 0.453592;
  if (code === 'OZ') return weightKg / 0.0283495;
  return weightKg;
};

const parseEstimatedDaysText = (value: string): string => {
  const text = String(value || '').trim();
  if (!text) return '';
  const rangeMatch = text.match(/(\d+)\s*(?:-|to)\s*(\d+)/i);
  if (rangeMatch) return `${rangeMatch[1]}-${rangeMatch[2]}`;
  const singleMatch = text.match(/(\d+)/);
  return singleMatch ? singleMatch[1] : '';
};

// Supabase public function headers are now inlined at each call site.

type ShiprocketDomesticRateResult = {
  standardRate: number;
  tiers: Array<{ tier: string; rate: number; etd: string; estimatedDays: string }>;
} | null;

const fetchShiprocketDomesticRate = async (params: {
  pickupPincode: string;
  destinationPincode: string;
  weightKg: number;
  cod?: boolean;
}): Promise<ShiprocketDomesticRateResult> => {
  try {
    const supabaseUrlBase = String(runtimeEnv.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '');
    const anonKey = String(runtimeEnv.VITE_SUPABASE_ANON_KEY || '').trim();

    const rateRes = await fetch(`${supabaseUrlBase}/functions/v1/shiprocket-rate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(anonKey ? { apikey: anonKey, Authorization: `Bearer ${anonKey}` } : {}),
      },
      body: JSON.stringify({
        pickup_postcode: params.pickupPincode,
        delivery_postcode: params.destinationPincode,
        weight: params.weightKg,
        cod: params.cod || false,
        domestic: true,
      }),
    });

    if (!rateRes.ok) {
      console.warn('[Shiprocket] domestic rate HTTP error:', rateRes.status);
      return null;
    }

    const rateBody = await rateRes.json() as {
      tiers?: Array<{ tier: string; rate: number; etd: string; estimatedDays: string }>;
      availableCount?: number;
      domestic?: boolean;
    };

    if (!Array.isArray(rateBody.tiers) || rateBody.tiers.length === 0) {
      return null;
    }

    const stdTier = rateBody.tiers.find((t) => t.tier === 'standard');
    return {
      standardRate: stdTier?.rate || rateBody.tiers[0].rate,
      tiers: rateBody.tiers,
    };
  } catch (err) {
    console.warn('[Shiprocket] domestic rate fetch exception:', err);
    return null;
  }
};

const resolveDestinationCurrency = async (country: string): Promise<string> => {
  const cleaned = country.trim();
  if (IS_UK_STOREFRONT) {
    if (cleaned && !isUKCountry(cleaned)) {
      throw new Error('UK storefront checkout only supports delivery addresses in the United Kingdom.');
    }
    return STOREFRONT_CURRENCY_CODE;
  }
  if (!cleaned) return 'INR';
  return resolveCurrencyFromCountry(cleaned);
};

export async function calculateDestinationCheckoutPricing(input: {
  items: CheckoutPricingInputItem[];
  destinationCountry: string;
  destinationPostalCode?: string;
  rates: Record<string, number>;
  isCod?: boolean;
  strict?: boolean;
}): Promise<DestinationCheckoutPricing> {
  const filteredItems = input.items.filter((item) => item.productId && item.quantity > 0);
  const destinationCountry = input.destinationCountry.trim();

  if (filteredItems.length === 0) {
    const emptyCurrency = await resolveDestinationCurrency(
      destinationCountry || (IS_UK_STOREFRONT ? '' : 'IN'),
    );
    return {
      currency: emptyCurrency,
      destinationCountry,
      subtotal: 0,
      offerDiscount: 0,
      platformHandlingCharge: 0,
      shipping: 0,
      total: 0,
      items: [],
      ineligibleItems: [],
      codEligible: false,
      codIneligibleItems: [],
      hasInternationalItems: false,
      subtotalInr: 0,
      actualShippingCost: 0,
      platformShippingMargin: 0,
    };
  }

  const targetCurrency = await resolveDestinationCurrency(
    destinationCountry || (IS_UK_STOREFRONT ? 'United Kingdom' : 'IN'),
  );
  const productIds = Array.from(new Set(filteredItems.map((item) => item.productId)));
  const destinationPostalCode = sanitizePostalCode(input.destinationPostalCode || '');

  const destinationToken = normalizeCountryToken(destinationCountry);
  const destinationTokenSet = buildCountryTokenSet(destinationCountry, destinationToken);
  const destinationLooksIndia = Array.from(destinationTokenSet).some((token) => INDIA_COUNTRY_TOKENS.has(token));

  const verifiedVariantPrices = await fetchVerifiedVariantPrices(
    filteredItems.map((item, index) => ({
      key: String(index),
      productId: item.productId,
      variantId: item.selectedVariantId,
      variantSku: item.selectedVariantSku,
      selectedSize: item.selectedSize,
      selectedColor: item.selectedColor,
    })),
    destinationCountry || null,
    input.strict,
  );
  if (verifiedVariantPrices.error) {
    throw new Error(verifiedVariantPrices.error);
  }
  const variantPriceByIndex = verifiedVariantPrices.data;
  const nonVariantProductIds = Array.from(new Set(
    filteredItems
      .filter((_, index) => !variantPriceByIndex[String(index)])
      .map((item) => item.productId),
  ));

  const markupPriceByProductId = new Map<string, number>();
  try {
    if (nonVariantProductIds.length > 0) {
      const { data: markupRows, error: markupErr } = await supabase.rpc(
        'get_public_product_prices',
        { p_product_ids: nonVariantProductIds, p_country: destinationCountry || null }
      );
      if (markupErr && input.strict) throw new Error(`Unable to verify product prices: ${markupErr.message}`);
      if (!markupErr && Array.isArray(markupRows)) {
        for (const row of markupRows as Array<{ product_id: string; selling_price: unknown }>) {
          const price = Number(row.selling_price);
          if (row.product_id && Number.isFinite(price) && price > 0) {
            markupPriceByProductId.set(String(row.product_id), price);
          }
        }
      }
    }
  } catch (error) {
    if (input.strict) throw error;
    // Non-fatal: per-country table fallback below can still populate markup prices.
  }

  const [
    productRowsResponse,
    offerRulesResponse,
    referenceData,
  ] = await Promise.all([
    supabase
      .from('products')
      .select('id, origin_country, origin_country_id, currency, is_cod_available, shipping_type, courier_partner, preferred_carrier, package_weight, package_weight_unit_id, package_length, package_length_unit_id, package_width, package_width_unit_id, package_height, package_height_unit_id, seller_id, hsn_code, ships_internationally')
      .in('id', productIds),
    supabase
      .from('offer_rules')
      .select('product_id, offer_type, buy_quantity, get_quantity, special_day_name, discount_percent, start_time, end_time, bundle_min_qty, bundle_discount, is_active')
      .in('product_id', productIds)
      .eq('is_active', true),
    getCheckoutReferenceData(input.strict),
  ]);

  if (input.strict && (productRowsResponse.error || offerRulesResponse.error)) {
    throw new Error('Unable to verify products or offers for checkout.');
  }
  const productRows = (productRowsResponse.data || []) as ProductCountryRow[];
  const countries = referenceData.countries;
  const measurementUnitRows = referenceData.measurementUnits;
  const offerRuleRows = (offerRulesResponse.data || []) as OfferRuleRow[];
  const shippingProviderConfigRows = referenceData.shippingProviderConfig;
  const checkoutMinOrderRules = referenceData.checkoutMinOrderRules;

  // Build lookup: country_code → { shippo_domestic, shippo_intl, shiprocket_intl }
  const shippoCountryCodes = new Set<string>();
  const shippoIntlCountryCodes = new Set<string>();
  for (const row of shippingProviderConfigRows) {
    if (row.provider === 'shippo' && row.domestic) shippoCountryCodes.add(row.country_code);
    if (row.provider === 'shippo' && row.international) shippoIntlCountryCodes.add(row.country_code);
  }

  const nowTs = Date.now();
  const offersByProductId = new Map<string, OfferRuleRow[]>();
  offerRuleRows.forEach((row) => {
    const startTs = row.start_time ? new Date(row.start_time).getTime() : null;
    const endTs = row.end_time ? new Date(row.end_time).getTime() : null;
    if (Number.isFinite(startTs) && nowTs < startTs!) return;
    if (Number.isFinite(endTs) && nowTs > endTs!) return;
    const key = String(row.product_id);
    const list = offersByProductId.get(key) || [];
    list.push(row);
    offersByProductId.set(key, list);
  });
  const sellerIds = Array.from(new Set(productRows.map((row) => String(row.seller_id || '')).filter(Boolean)));
  const [sellerProfilesResponse, sellerKycPostalResponse] = await Promise.all([
    sellerIds.length > 0
      ? supabase.from('profiles').select('id, country_id').in('id', sellerIds)
      : Promise.resolve({ data: [], error: null }),
    sellerIds.length > 0
      ? supabase.from('seller_kyc').select('seller_id, business_postal_code').in('seller_id', sellerIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (input.strict && (sellerProfilesResponse.error || sellerKycPostalResponse.error)) {
    throw new Error('Unable to verify seller shipping information.');
  }
  const sellerProfileRows = (sellerProfilesResponse.data || []) as ProfileCountryRow[];
  const kycPostalBySellerId = new Map(
    ((sellerKycPostalResponse.data || []) as { seller_id: string; business_postal_code: string }[])
      .filter((row) => row.seller_id && row.business_postal_code)
      .map((row) => [String(row.seller_id), sanitizePostalCode(String(row.business_postal_code))])
  );
  const unitCodeById = new Map(
    measurementUnitRows
      .filter((row) => row.id)
      .map((row) => [String(row.id), String(row.code || '').toUpperCase()])
  );

  const destinationCountryRow = countries.find((country) => {
    const rowTokens = buildCountryTokenSet(country.country_name, country.country_code, country.short_code, country.iso2);
    for (const token of rowTokens) {
      if (destinationTokenSet.has(token)) return true;
    }
    return false;
  });
  const destinationCountryId = destinationCountryRow?.id || null;

  if (destinationCountryId) {
    const { data: countryPriceRows, error: countryPriceError } = await supabase
      .from('product_country_selling_prices')
      .select('product_id, selling_price')
      .in('product_id', productIds)
      .eq('country_id', destinationCountryId);

    if (input.strict && countryPriceError) throw new Error('Unable to verify destination pricing.');
    (countryPriceRows || []).forEach((row: any) => {
      const productId = String(row.product_id || '');
      const sellingPrice = Number(row.selling_price);
      if (productId && Number.isFinite(sellingPrice) && sellingPrice >= 0) {
        // Country-specific product prices are highest priority when present.
        markupPriceByProductId.set(productId, sellingPrice);
      }
    });
  }

  const productCurrencyByProductId = new Map(
    productRows
      .filter((row) => row.id)
      .map((row) => [String(row.id), String(row.currency || 'INR').toUpperCase()])
  );

  const countryNameById = new Map(
    countries
      .filter((country) => country.id)
      .map((country) => [String(country.id), String(country.country_name || '').trim()])
  );

  // Map country_id and normalized country names to ISO 2-letter code for provider routing.
  // Uses the iso2 column (e.g. "GB", "US", "IN") which matches shipping_provider_config
  // and external APIs (Shippo, Shiprocket). Falls back to country_code if iso2 is missing.
  const countryCodeById = new Map(
    countries
      .filter((country) => country.id && (country.iso2 || country.country_code))
      .map((country) => [String(country.id), String(country.iso2 || country.country_code || '').toUpperCase()])
  );
  const countryCodeByToken = new Map(
    countries
      .filter((country) => country.iso2 || country.country_code)
      .flatMap((country) => {
        const code = String(country.iso2 || country.country_code || '').toUpperCase();
        const entries: [string, string][] = [];
        if (country.country_name) entries.push([normalizeCountryToken(String(country.country_name)), code]);
        if (country.country_code) entries.push([normalizeCountryToken(String(country.country_code)), code]);
        if (country.short_code) entries.push([normalizeCountryToken(String(country.short_code)), code]);
        if (country.iso2) entries.push([normalizeCountryToken(String(country.iso2)), code]);
        return entries;
      })
  );

  /** Resolve a country token (name/code) to ISO 2-letter code using countries table */
  const resolveIsoCode = (token: string, countryId?: string): string => {
    if (countryId) {
      const byId = countryCodeById.get(countryId);
      if (byId) return byId;
    }
    return countryCodeByToken.get(token) || token;
  };

  const countryIdByToken = new Map(
    countries
      .filter((country) => country.id)
      .flatMap((country) => {
        const id = String(country.id);
        return Array.from(
          buildCountryTokenSet(country.country_name, country.country_code, country.short_code, country.iso2)
        ).map((token) => [token, id] as [string, string]);
      })
  );

  /** Resolve a country token (name/code) to country_id using countries table */
  const resolveCountryId = (token: string, countryId?: string): string => {
    if (countryId) return countryId;
    return countryIdByToken.get(token) || '';
  };

  type ShipmentMetrics = {
    totalWeightKg: number;
    chargeableWeightKg: number;
    maxLengthCm: number;
    maxWidthCm: number;
    maxHeightCm: number;
  };

  const buildShipmentMetrics = <
    T extends {
      weightPerUnitKg: number;
      quantity: number;
      packageLengthCm: number;
      packageWidthCm: number;
      packageHeightCm: number;
    },
  >(items: T[]): ShipmentMetrics => {
    const totalWeightKg = items.reduce((sum, item) => sum + item.weightPerUnitKg * item.quantity, 0);
    const maxLengthCm = items.reduce((max, item) => Math.max(max, item.packageLengthCm), 1);
    const maxWidthCm = items.reduce((max, item) => Math.max(max, item.packageWidthCm), 1);
    const maxHeightCm = items.reduce((max, item) => Math.max(max, item.packageHeightCm), 1);
    const volumetricWeightKg = (maxLengthCm * maxWidthCm * maxHeightCm) / 5000;
    const chargeableWeightKg = Math.max(totalWeightKg, volumetricWeightKg, 0.1);

    return {
      totalWeightKg,
      chargeableWeightKg,
      maxLengthCm,
      maxWidthCm,
      maxHeightCm,
    };
  };

  type PodRateCardMatch = {
    standardAmount: number;
    expressAmount: number;
    currencyCode: string;
    standardEta: string;
    expressEta: string;
  };

  const podRateCardRowsCache = new Map<string, PodShippingRateRow[]>();

  const loadPodRateCardRows = async (originCountryId: string, destinationCountryId: string): Promise<PodShippingRateRow[]> => {
    const cacheKey = `${originCountryId}:${destinationCountryId}`;
    const cachedRows = podRateCardRowsCache.get(cacheKey);
    if (cachedRows) return cachedRows;

    const { data, error } = await supabase
      .from('product_origin_destination_shipping_rates')
      .select('weight_band_unit, weight_band_from, weight_band_to, currency_code, standard_shipping_amount, standard_est_delivery_date, express_shipping_amount, express_est_delivery_date')
      .eq('product_origin_country_id', originCountryId)
      .eq('destination_country_id', destinationCountryId)
      .order('weight_band_from', { ascending: true });

    if (error || !Array.isArray(data)) {
      podRateCardRowsCache.set(cacheKey, []);
      return [];
    }

    const rows = data as PodShippingRateRow[];
    podRateCardRowsCache.set(cacheKey, rows);
    return rows;
  };

  const selectPodRateCardRowForWeight = (rows: PodShippingRateRow[], shipmentWeightKg: number): PodShippingRateRow | null => {
    if (rows.length === 0 || shipmentWeightKg <= 0) return null;

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const unit = String(row.weight_band_unit || 'KG').trim().toUpperCase() || 'KG';
      const fromValue = asFinite(row.weight_band_from);
      const toValue = asFinite(row.weight_band_to);
      if (toValue <= fromValue) continue;

      const convertedWeight = convertKgToUnit(shipmentWeightKg, unit);
      const isLastRow = index === rows.length - 1;
      const withinBand = convertedWeight >= fromValue && (convertedWeight < toValue || (isLastRow && convertedWeight <= toValue));
      if (withinBand) return row;
    }

    return null;
  };

  const resolvePodRateCardMatch = async (params: {
    originCountryId: string;
    destinationCountryId: string;
    shipmentWeightKg: number;
  }): Promise<PodRateCardMatch | null> => {
    if (!params.originCountryId || !params.destinationCountryId || params.shipmentWeightKg <= 0) return null;

    const rows = await loadPodRateCardRows(params.originCountryId, params.destinationCountryId);
    const matchedRow = selectPodRateCardRowForWeight(rows, params.shipmentWeightKg);
    if (!matchedRow) return null;

    const standardAmount = Math.max(0, asFinite(matchedRow.standard_shipping_amount));
    const expressAmount = Math.max(0, asFinite(matchedRow.express_shipping_amount));
    const currencyCode = String(matchedRow.currency_code || 'INR').trim().toUpperCase() || 'INR';
    const standardEta = String(matchedRow.standard_est_delivery_date || '').trim();
    const expressEta = String(matchedRow.express_est_delivery_date || '').trim() || standardEta;

    return {
      standardAmount,
      expressAmount,
      currencyCode,
      standardEta,
      expressEta,
    };
  };

  /** Check if an origin country uses Shippo for domestic shipping (DB-driven) */
  const isShippoOrigin = (token: string, countryId?: string): boolean => {
    const iso = resolveIsoCode(token, countryId);
    return shippoCountryCodes.has(iso);
  };

  /** Check if an origin country uses Shippo for international shipping (DB-driven) */
  const isShippoIntlOrigin = (token: string, countryId?: string): boolean => {
    const iso = resolveIsoCode(token, countryId);
    return shippoIntlCountryCodes.has(iso);
  };

  const destinationIsoToken = normalizeCountryToken(resolveIsoCode(destinationToken, destinationCountryId || undefined));
  const requiresTableOnlyPodRoute = (originIsoToken: string): boolean =>
    TABLE_ONLY_POD_ROUTE_KEYS.has(`${normalizeCountryToken(originIsoToken)}->${destinationIsoToken}`);

  const productById = new Map(productRows.map((row) => [String(row.id), row]));
  const sellerCountryBySellerId = new Map(
    sellerProfileRows
      .filter((row) => row.id)
      .map((row) => [String(row.id), String(row.country_id || '')])
  );

  // Build pickup pincode map: seller KYC postal code → product
  const pickupPincodeByProductId = new Map<string, string>();
  for (const [productId, productRow] of productById) {
    if (pickupPincodeByProductId.has(productId)) continue;
    const sellerId = String(productRow.seller_id || '');
    if (!sellerId) continue;
    const kycPincode = kycPostalBySellerId.get(sellerId) || '';
    if (kycPincode) pickupPincodeByProductId.set(productId, kycPincode);
  }

  const ineligibleItems: IneligibleCheckoutItem[] = [];
  const codIneligibleItems: IneligibleCheckoutItem[] = [];
  const lines: CheckoutPricingLine[] = [];
  let hasInternationalItems = false;
  let subtotalInrAccum = 0;
  const subtotalInrByOriginIsoToken = new Map<string, number>();

  // ── India-domestic items → Shiprocket live rate (grouped per seller) ──
  type DomesticSellerItem = {
    lineIndex: number;
    productId: string;
    quantity: number;
    weightPerUnitKg: number;
    packageLengthCm: number;
    packageWidthCm: number;
    packageHeightCm: number;
    pickupPincode: string;
    sourceCurrency: string;
    fallbackShippingTotal: number;
    originCountryId: string;
    originCountryToken: string;
    originCountryIso: string;
  };
  const domesticSellerGroups = new Map<string, DomesticSellerItem[]>();

  // ── UK-origin domestic items → Shippo live rate (grouped per seller) ──
  type ShippoDomesticItem = {
    lineIndex: number;
    productId: string;
    quantity: number;
    weightPerUnitKg: number;
    packageLengthCm: number;
    packageWidthCm: number;
    packageHeightCm: number;
    pickupPincode: string;
    sourceCurrency: string;
    fallbackShippingTotal: number;
    originCountryIso: string;
    originCountryId: string;
    originCountryToken: string;
  };
  const shippoDomesticGroups = new Map<string, ShippoDomesticItem[]>();

  // Track international items with weight data for weight-based rate card fallback
  type IntlWeightItem = {
    lineIndex: number;
    productId: string;
    quantity: number;
    weightPerUnitKg: number;
    packageLengthCm: number;
    packageWidthCm: number;
    packageHeightCm: number;
    sourceCurrency: string;
    sellerId: string;
    pickupPincode: string;
    originCountryIso: string;
    originCountryToken: string;
    originCountryId: string;
  };
  const intlItemsWithWeight: IntlWeightItem[] = [];

  for (const [itemIndex, item] of filteredItems.entries()) {
    const productRow = productById.get(item.productId);
    const profileCountryId = sellerCountryBySellerId.get(String(productRow?.seller_id || '')) || '';
    const profileCountryName = profileCountryId ? (countryNameById.get(profileCountryId) || '') : '';
    const effectiveOriginCountryId = String(productRow?.origin_country_id || profileCountryId || '');
    const effectiveOriginCountryToken = normalizeCountryToken(String(productRow?.origin_country || profileCountryName || ''));
    const productOriginToken = normalizeCountryToken(String(productRow?.origin_country || ''));
    const effectiveOriginIso2 = resolveIsoCode(effectiveOriginCountryToken, effectiveOriginCountryId);
    const hasDomesticConfig = false; // Legacy domestic shipping tables removed; Shiprocket handles all shipping
    // Legacy fallback: treat as India domestic ONLY if the product has no origin country,
    // the seller also has no known non-India country, AND has a domestic shipping config.
    // This prevents misclassifying foreign-origin products that lack origin_country as Indian domestic.
    const sellerCountryToken = profileCountryId ? normalizeCountryToken(countryNameById.get(profileCountryId) || '') : '';
    const sellerLooksNonIndia = sellerCountryToken && !INDIA_COUNTRY_TOKENS.has(sellerCountryToken);
    const isLegacyDomesticIndiaFallback =
      !effectiveOriginCountryId
      && !effectiveOriginCountryToken
      && !productOriginToken
      && !sellerLooksNonIndia
      && hasDomesticConfig
      && destinationLooksIndia;

    const isOriginCountryBuyer =
      (destinationCountryId && effectiveOriginCountryId && effectiveOriginCountryId === destinationCountryId)
      || (effectiveOriginCountryToken && effectiveOriginCountryToken === destinationToken)
      || (productOriginToken && productOriginToken === destinationToken)
      || isLegacyDomesticIndiaFallback;

    // All products are available to all countries — no eligibility gating.

    // Track international items
    if (!isOriginCountryBuyer) {
      hasInternationalItems = true;
    }

    // COD not available for international orders
    if (!isOriginCountryBuyer) {
      codIneligibleItems.push({
        productId: item.productId,
        productName: item.productName,
        availableCountries: [],
      });
    } else if (productRow?.is_cod_available === false) {
      codIneligibleItems.push({
        productId: item.productId,
        productName: item.productName,
        availableCountries: [],
      });
    }

    // Markup prices inherit each product's source currency.
    // Fallback unitPrice keeps the caller-provided source currency.
    const verifiedVariantPrice = variantPriceByIndex[String(itemIndex)];
    const hasMarkupPrice = !verifiedVariantPrice && markupPriceByProductId.has(item.productId);
    const sourceUnitPrice = verifiedVariantPrice
      ? verifiedVariantPrice.sellingPrice
      : hasMarkupPrice
        ? markupPriceByProductId.get(item.productId)!
        : asFinite(item.unitPrice);
    const sourceCurrency = verifiedVariantPrice || hasMarkupPrice
      ? (productCurrencyByProductId.get(item.productId) || (item.currency || 'INR').toUpperCase())
      : (item.currency || 'INR').toUpperCase();
    const sourceLineTotal = sourceUnitPrice * item.quantity;

    // Accumulate product subtotal in INR for minimum-order validation
    const lineTotalInr = sourceCurrency === 'INR'
      ? sourceLineTotal
      : convertAmount(sourceLineTotal, sourceCurrency, 'INR', input.rates);
    subtotalInrAccum += lineTotalInr;
    const normalizedOriginIsoToken = normalizeCountryToken(effectiveOriginIso2 || effectiveOriginCountryToken || productOriginToken);
    if (normalizedOriginIsoToken) {
      subtotalInrByOriginIsoToken.set(
        normalizedOriginIsoToken,
        (subtotalInrByOriginIsoToken.get(normalizedOriginIsoToken) || 0) + lineTotalInr
      );
    }

    // --- Offer discount calculation ---
    const productOffers = offersByProductId.get(item.productId) || [];
    let sourceOfferDiscount = 0;
    for (const offer of productOffers) {
      const offerType = String(offer.offer_type || '').toLowerCase();
      if (offerType === 'special_day' || offerType === 'special_day_offer') {
        const pct = asFinite(offer.discount_percent);
        if (pct > 0 && pct <= 100) {
          sourceOfferDiscount = Math.max(sourceOfferDiscount, sourceLineTotal * pct / 100);
        }
      } else if (offerType === 'bundle_discount') {
        const minQty = Math.floor(asFinite(offer.bundle_min_qty));
        const pct = asFinite(offer.bundle_discount);
        if (minQty > 0 && pct > 0 && pct <= 100 && item.quantity >= minQty) {
          sourceOfferDiscount = Math.max(sourceOfferDiscount, sourceLineTotal * pct / 100);
        }
      } else if (offerType === 'buy_x_get_y') {
        const buyQty = Math.floor(asFinite(offer.buy_quantity));
        const getQty = Math.floor(asFinite(offer.get_quantity));
        if (buyQty > 0 && getQty > 0 && item.quantity >= buyQty) {
          const freeItems = Math.floor(item.quantity / buyQty) * getQty;
          const discount = Math.min(freeItems, item.quantity) * sourceUnitPrice;
          sourceOfferDiscount = Math.max(sourceOfferDiscount, discount);
        }
      }
    }
    sourceOfferDiscount = Math.min(sourceOfferDiscount, sourceLineTotal);

    let minQuantityWarning: string | undefined;

    let shippingPerUnit = 0;
    if (isOriginCountryBuyer) {
      shippingPerUnit = 0; // Shiprocket/Shippo live rate overrides below
    }

    // India domestic fallback: use a low placeholder; Shiprocket live rate will override below
    if (isOriginCountryBuyer && !isShippoOrigin(effectiveOriginCountryToken, effectiveOriginCountryId) && shippingPerUnit <= 0) {
      shippingPerUnit = 50;
    }
    // Shippo-origin domestic: use a low placeholder; Shippo live rate will override below
    if (isOriginCountryBuyer && isShippoOrigin(effectiveOriginCountryToken, effectiveOriginCountryId) && shippingPerUnit <= 0) {
      shippingPerUnit = 4.99;
    }

    const sourceShippingTotal = shippingPerUnit * item.quantity;

    // Check if this item qualifies for domestic live rate (combined per seller)
    const hasPickupPincode = Boolean(pickupPincodeByProductId.get(item.productId));
    const isItemShippoOrigin = isShippoOrigin(effectiveOriginCountryToken, effectiveOriginCountryId);
    const useShiprocketDomesticRate =
      isOriginCountryBuyer
      && !isItemShippoOrigin
      && Boolean(productRow)
      && destinationPostalCode
      && hasPickupPincode;
    const useShippoDomesticRate =
      isOriginCountryBuyer
      && isItemShippoOrigin
      && Boolean(productRow)
      && destinationPostalCode
      && hasPickupPincode;

    const pickupPincode = (useShiprocketDomesticRate || useShippoDomesticRate) ? (pickupPincodeByProductId.get(item.productId) || '') : '';

    const lineIndex = lines.length;

    const convertedUnitPrice = roundTo2(convertAmount(sourceUnitPrice, sourceCurrency, targetCurrency, input.rates));
    const convertedLineTotal = roundTo2(convertAmount(sourceLineTotal, sourceCurrency, targetCurrency, input.rates));
    const convertedShippingTotal = roundTo2(convertAmount(sourceShippingTotal, sourceCurrency, targetCurrency, input.rates));
    const convertedOfferDiscount = roundTo2(convertAmount(sourceOfferDiscount, sourceCurrency, targetCurrency, input.rates));

    lines.push({
      cartItemId: item.cartItemId,
      productId: item.productId,
      productName: item.productName,
      quantity: item.quantity,
      sourceCurrency,
      sourceUnitPrice,
      convertedUnitPrice,
      convertedLineTotal,
      convertedShippingTotal,
      offerDiscount: convertedOfferDiscount,
      selectedVariantId: verifiedVariantPrice?.variantId,
      selectedVariantSku: verifiedVariantPrice?.variantSku,
      minQuantityWarning,
    });

    // Group India domestic items by seller for Shiprocket rate lookup
    if (useShiprocketDomesticRate && pickupPincode && productRow) {
      const sellerId = String(productRow.seller_id || '');
      if (sellerId) {
        const originCountryId = resolveCountryId(effectiveOriginCountryToken, effectiveOriginCountryId);
        const originCountryIso = resolveIsoCode(effectiveOriginCountryToken, originCountryId || undefined);
        const domesticGroupKey = `${sellerId}:${originCountryId || originCountryIso || effectiveOriginCountryToken || 'UNKNOWN'}`;
        const weightUnitCode = unitCodeById.get(String(productRow.package_weight_unit_id || '')) || 'KG';
        const lengthUnitCode = unitCodeById.get(String(productRow.package_length_unit_id || '')) || 'CM';
        const widthUnitCode = unitCodeById.get(String(productRow.package_width_unit_id || '')) || 'CM';
        const heightUnitCode = unitCodeById.get(String(productRow.package_height_unit_id || '')) || 'CM';

        const weightPerUnit = Math.max(normalizeWeightToKg(asFinite(productRow.package_weight), weightUnitCode), 0.1);
        const packageLengthCm = Math.max(normalizeDimensionToCm(asFinite(productRow.package_length), lengthUnitCode), 1);
        const packageWidthCm = Math.max(normalizeDimensionToCm(asFinite(productRow.package_width), widthUnitCode), 1);
        const packageHeightCm = Math.max(normalizeDimensionToCm(asFinite(productRow.package_height), heightUnitCode), 1);

        const group = domesticSellerGroups.get(domesticGroupKey) || [];
        group.push({
          lineIndex,
          productId: item.productId,
          quantity: item.quantity,
          weightPerUnitKg: weightPerUnit,
          packageLengthCm,
          packageWidthCm,
          packageHeightCm,
          pickupPincode,
          sourceCurrency,
          fallbackShippingTotal: sourceShippingTotal,
          originCountryId,
          originCountryToken: effectiveOriginCountryToken,
          originCountryIso,
        });
        domesticSellerGroups.set(domesticGroupKey, group);
      }
    }

    // Group UK-origin domestic items by seller for Shippo rate lookup
    if (useShippoDomesticRate && pickupPincode && productRow) {
      const sellerId = String(productRow.seller_id || '');
      if (sellerId) {
        const originCountryId = resolveCountryId(effectiveOriginCountryToken, effectiveOriginCountryId);
        const originCountryIso = resolveIsoCode(effectiveOriginCountryToken, originCountryId || undefined);
        const shippoDomesticGroupKey = `${sellerId}:${originCountryId || originCountryIso || effectiveOriginCountryToken || 'UNKNOWN'}`;
        const weightUnitCode = unitCodeById.get(String(productRow.package_weight_unit_id || '')) || 'KG';
        const lengthUnitCode = unitCodeById.get(String(productRow.package_length_unit_id || '')) || 'CM';
        const widthUnitCode = unitCodeById.get(String(productRow.package_width_unit_id || '')) || 'CM';
        const heightUnitCode = unitCodeById.get(String(productRow.package_height_unit_id || '')) || 'CM';

        const weightPerUnit = Math.max(normalizeWeightToKg(asFinite(productRow.package_weight), weightUnitCode), 0.1);
        const packageLengthCm = Math.max(normalizeDimensionToCm(asFinite(productRow.package_length), lengthUnitCode), 1);
        const packageWidthCm = Math.max(normalizeDimensionToCm(asFinite(productRow.package_width), widthUnitCode), 1);
        const packageHeightCm = Math.max(normalizeDimensionToCm(asFinite(productRow.package_height), heightUnitCode), 1);

        const group = shippoDomesticGroups.get(shippoDomesticGroupKey) || [];
        group.push({
          lineIndex,
          productId: item.productId,
          quantity: item.quantity,
          weightPerUnitKg: weightPerUnit,
          packageLengthCm,
          packageWidthCm,
          packageHeightCm,
          pickupPincode,
          sourceCurrency,
          fallbackShippingTotal: sourceShippingTotal,
          originCountryIso,
          originCountryId,
          originCountryToken: effectiveOriginCountryToken,
        });
        shippoDomesticGroups.set(shippoDomesticGroupKey, group);
      }
    }

    // Track all international items with weight data for rate card lookup
    if (!isOriginCountryBuyer && productRow) {
      const wUnitCode = unitCodeById.get(String(productRow.package_weight_unit_id || '')) || 'KG';
      const wPerUnit = normalizeWeightToKg(asFinite(productRow.package_weight), wUnitCode);
      if (wPerUnit > 0) {
        const lUnitCode = unitCodeById.get(String(productRow.package_length_unit_id || '')) || 'CM';
        const wdUnitCode = unitCodeById.get(String(productRow.package_width_unit_id || '')) || 'CM';
        const hUnitCode = unitCodeById.get(String(productRow.package_height_unit_id || '')) || 'CM';
        intlItemsWithWeight.push({
          lineIndex,
          productId: item.productId,
          quantity: item.quantity,
          weightPerUnitKg: Math.max(wPerUnit, 0.1),
          packageLengthCm: Math.max(normalizeDimensionToCm(asFinite(productRow.package_length), lUnitCode), 1),
          packageWidthCm: Math.max(normalizeDimensionToCm(asFinite(productRow.package_width), wdUnitCode), 1),
          packageHeightCm: Math.max(normalizeDimensionToCm(asFinite(productRow.package_height), hUnitCode), 1),
          sourceCurrency,
          sellerId: String(productRow.seller_id || ''),
          pickupPincode: pickupPincodeByProductId.get(item.productId) || kycPostalBySellerId.get(String(productRow.seller_id || '')) || '',
          originCountryIso: resolveIsoCode(effectiveOriginCountryToken, effectiveOriginCountryId || undefined),
          originCountryToken: effectiveOriginCountryToken,
          originCountryId: resolveCountryId(effectiveOriginCountryToken, effectiveOriginCountryId),
        });
      }
    }
  }

  type ShippoDomTier = {
    tier: 'standard' | 'express';
    rate: number;
    estimatedDays: string;
    etd: string;
    carrierName?: string;
    serviceLevel?: string;
    rateId?: string;
    provider?: string;
    currency?: string;
  };
  let shippoDomesticTiers: ShippoDomTier[] = [];
  let shippoDomStandardRate = 0;
  let shippoDomRateCurrency = 'GBP';

  // ── Fetch Shiprocket domestic rate per seller and distribute across items ──
  await Promise.all(Array.from(domesticSellerGroups.values()).map(async (sellerItems) => {
    if (sellerItems.length === 0) return;

    const firstItem = sellerItems[0];
    const pickupPincode = firstItem.pickupPincode;
    const originCountryId = resolveCountryId(firstItem.originCountryToken, firstItem.originCountryId);
    const shipment = buildShipmentMetrics(sellerItems);

    const tableMatch = destinationCountryId
      ? await resolvePodRateCardMatch({
          originCountryId,
          destinationCountryId,
          shipmentWeightKg: shipment.chargeableWeightKg,
        })
      : null;

    if (tableMatch) {
      const totalWeight = shipment.totalWeightKg > 0 ? shipment.totalWeightKg : 1;
      for (const item of sellerItems) {
        const itemWeight = item.weightPerUnitKg * item.quantity;
        const itemShare = tableMatch.standardAmount * (itemWeight / totalWeight);
        lines[item.lineIndex].convertedShippingTotal = roundTo2(
          convertAmount(itemShare, tableMatch.currencyCode, targetCurrency, input.rates)
        );
      }

      if (shippoDomesticTiers.length === 0) {
        shippoDomesticTiers = [
          {
            tier: 'standard',
            rate: tableMatch.standardAmount,
            estimatedDays: parseEstimatedDaysText(tableMatch.standardEta),
            etd: tableMatch.standardEta,
            provider: 'bzead-rate-card',
            currency: tableMatch.currencyCode,
          },
          {
            tier: 'express',
            rate: tableMatch.expressAmount > 0 ? tableMatch.expressAmount : tableMatch.standardAmount,
            estimatedDays: parseEstimatedDaysText(tableMatch.expressEta),
            etd: tableMatch.expressEta,
            provider: 'bzead-rate-card',
            currency: tableMatch.currencyCode,
          },
        ];
        shippoDomStandardRate = tableMatch.standardAmount;
        shippoDomRateCurrency = tableMatch.currencyCode;
      }
      return;
    }

    const shiprocketResult = await fetchShiprocketDomesticRate({
      pickupPincode,
      destinationPincode: destinationPostalCode,
      weightKg: shipment.chargeableWeightKg,
      cod: input.isCod,
    });

    if (shiprocketResult !== null && shiprocketResult.standardRate >= 0) {
      const bestRate = shiprocketResult.standardRate;
      const totalWeight = shipment.totalWeightKg > 0 ? shipment.totalWeightKg : 1;

      for (const item of sellerItems) {
        const itemWeight = item.weightPerUnitKg * item.quantity;
        const itemShareOfShipping = bestRate * (itemWeight / totalWeight);
        lines[item.lineIndex].convertedShippingTotal = roundTo2(
          convertAmount(itemShareOfShipping, 'INR', targetCurrency, input.rates)
        );
      }
    } else {
      for (const item of sellerItems) {
        lines[item.lineIndex].convertedShippingTotal = roundTo2(
          convertAmount(item.fallbackShippingTotal, item.sourceCurrency, targetCurrency, input.rates)
        );
      }
    }
  }));

  // ── Fetch Shippo domestic live rates per seller ──
  {
    const supabaseUrlBase = String(runtimeEnv.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '');
    const anonKey = String(runtimeEnv.VITE_SUPABASE_ANON_KEY || '').trim();

    await Promise.all(Array.from(shippoDomesticGroups.values()).map(async (sellerItems) => {
      if (sellerItems.length === 0) return;
      const firstItem = sellerItems[0];
      const pickupPostcode = firstItem.pickupPincode;
      const originIso = firstItem.originCountryIso;
      const originCountryId = resolveCountryId(firstItem.originCountryToken, firstItem.originCountryId);
      const shipment = buildShipmentMetrics(sellerItems);

      const tableMatch = destinationCountryId
        ? await resolvePodRateCardMatch({
            originCountryId,
            destinationCountryId,
            shipmentWeightKg: shipment.chargeableWeightKg,
          })
        : null;

      if (tableMatch) {
        const totalWeight = shipment.totalWeightKg > 0 ? shipment.totalWeightKg : 1;
        for (const item of sellerItems) {
          const itemWeight = item.weightPerUnitKg * item.quantity;
          const itemShare = tableMatch.standardAmount * (itemWeight / totalWeight);
          lines[item.lineIndex].convertedShippingTotal = roundTo2(
            convertAmount(itemShare, tableMatch.currencyCode, targetCurrency, input.rates)
          );
        }

        if (shippoDomesticTiers.length === 0) {
          shippoDomesticTiers = [
            {
              tier: 'standard',
              rate: tableMatch.standardAmount,
              estimatedDays: parseEstimatedDaysText(tableMatch.standardEta),
              etd: tableMatch.standardEta,
              provider: 'bzead-rate-card',
              currency: tableMatch.currencyCode,
            },
            {
              tier: 'express',
              rate: tableMatch.expressAmount > 0 ? tableMatch.expressAmount : tableMatch.standardAmount,
              estimatedDays: parseEstimatedDaysText(tableMatch.expressEta),
              etd: tableMatch.expressEta,
              provider: 'bzead-rate-card',
              currency: tableMatch.currencyCode,
            },
          ];
          shippoDomStandardRate = tableMatch.standardAmount;
          shippoDomRateCurrency = tableMatch.currencyCode;
        }
        return;
      }

      try {
        const rateRes = await fetch(`${supabaseUrlBase}/functions/v1/shippo-rate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(anonKey ? { apikey: anonKey, Authorization: `Bearer ${anonKey}` } : {}),
          },
          body: JSON.stringify({
            from_country: originIso,
            from_zip: pickupPostcode,
            to_country: originIso,
            to_zip: destinationPostalCode,
            weight_g: Math.round(shipment.chargeableWeightKg * 1000),
            length_cm: shipment.maxLengthCm,
            width_cm: shipment.maxWidthCm,
            height_cm: shipment.maxHeightCm,
          }),
        });

        if (rateRes.ok) {
          const rateBody = await rateRes.json() as {
            cheapest?: { rate?: number; currency?: string; estimated_delivery_days?: number; courier_name?: string; service_level?: string; rate_id?: string } | null;
            tiers?: Record<string, { rate?: number; currency?: string; estimated_delivery_days?: number; courier_name?: string; service_level?: string; rate_id?: string } | null>;
            provider?: string;
          };
          // Use cheapest rate for Shippo domestic
          const cheapestRate = rateBody.cheapest?.rate
            ?? rateBody.tiers?.standard?.rate
            ?? null;
          const rateCurrency =
            rateBody.cheapest?.currency
            || rateBody.tiers?.standard?.currency
            || (originIso === 'US' ? 'USD' : originIso === 'CA' ? 'CAD' : originIso === 'GB' ? 'GBP' : 'EUR');

          if (cheapestRate !== null && cheapestRate !== undefined && cheapestRate >= 0) {
            const totalWeight = shipment.totalWeightKg > 0 ? shipment.totalWeightKg : 1;
            for (const item of sellerItems) {
              const itemWeight = item.weightPerUnitKg * item.quantity;
              const itemShareOfShipping = cheapestRate * (itemWeight / totalWeight);
              lines[item.lineIndex].convertedShippingTotal = roundTo2(
                convertAmount(itemShareOfShipping, rateCurrency, targetCurrency, input.rates)
              );
            }
          }

          // Capture tier data for delivery speed selector + delivery dates
          if (shippoDomesticTiers.length === 0 && rateBody.tiers && typeof rateBody.tiers === 'object') {
            for (const key of ['standard', 'express'] as const) {
              const t = rateBody.tiers[key];
              if (t && typeof t.rate === 'number') {
                const days = t.estimated_delivery_days ?? 0;
                shippoDomesticTiers.push({
                  tier: key,
                  rate: t.rate,
                  estimatedDays: days > 0 ? String(days) : '',
                  etd: days > 0 ? `${days} days` : '',
                  carrierName: t.courier_name || undefined,
                  serviceLevel: t.service_level || undefined,
                  rateId: t.rate_id || undefined,
                  provider: rateBody.provider || 'shippo',
                  currency: t.currency || rateCurrency,
                });
              }
            }
            const stdTier = shippoDomesticTiers.find((t) => t.tier === 'standard');
            if (stdTier) {
              shippoDomStandardRate = stdTier.rate;
              shippoDomRateCurrency = stdTier.currency || rateCurrency;
            }
          }
          // else: keep fallback set earlier
        }
      } catch (e) {
        console.error('[checkoutPricing] Shippo domestic rate failed:', e);
        // Fallback already set
      }
    }));
  }

  // ── Fetch international shipping rates (Shiprocket for non-Shippo-origin, Shippo for Shippo-origin) ──
  type IntlTier = { tier: 'standard' | 'premium' | 'express'; rate: number; etd: string; estimatedDays: string; carrierName?: string; serviceLevel?: string; rateId?: string; provider?: string };
  let intlTiers: IntlTier[] = [];
  let intlStandardRate = 0;
  let intlRateCurrency = 'INR';
  let missingRequiredPodRateRoute = false;
  // Populated from intl_shipping_country_config.free_shipping_above_inr via rate response
  let intlFreeShippingThresholdInr = 0;
  const shiprocketLiveIntlItemsForFreeShipping: IntlWeightItem[] = [];

  // Split international items by origin: Shippo-origin → Shippo, rest → Shiprocket
  const shiprocketOriginIntlItems = intlItemsWithWeight.filter((si) => !isShippoIntlOrigin(si.originCountryToken, si.originCountryId));
  const shippoOriginIntlItems = intlItemsWithWeight.filter((si) => isShippoIntlOrigin(si.originCountryToken, si.originCountryId));

  const groupIntlItemsByRoute = (items: IntlWeightItem[]) => {
    const groups = new Map<string, IntlWeightItem[]>();
    for (const item of items) {
      const groupKey = `${item.sellerId || 'UNKNOWN'}:${item.originCountryId || item.originCountryIso || item.originCountryToken || 'UNKNOWN'}`;
      const groupItems = groups.get(groupKey) || [];
      groupItems.push(item);
      groups.set(groupKey, groupItems);
    }
    return groups;
  };

  {
    const supabaseUrlBase = String(runtimeEnv.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '');
    const anonKey = String(runtimeEnv.VITE_SUPABASE_ANON_KEY || '').trim();

    // ── Non-Shippo-origin items → Shiprocket ──
    if (shiprocketOriginIntlItems.length > 0) {
      const destCountryForShiprocket = String(destinationCountryRow?.country_name || destinationCountry || '').trim();
      const routeGroups = groupIntlItemsByRoute(shiprocketOriginIntlItems);

      await Promise.all(Array.from(routeGroups.values()).map(async (groupItems) => {
        if (groupItems.length === 0) return;
        const firstItem = groupItems[0];
        const shipment = buildShipmentMetrics(groupItems);
        const originCountryId = resolveCountryId(firstItem.originCountryToken, firstItem.originCountryId);
        const originIsoToken = normalizeCountryToken(
          firstItem.originCountryIso || resolveIsoCode(firstItem.originCountryToken, originCountryId || undefined)
        );

        const tableMatch = destinationCountryId
          ? await resolvePodRateCardMatch({
              originCountryId,
              destinationCountryId,
              shipmentWeightKg: shipment.chargeableWeightKg,
            })
          : null;

        if (tableMatch) {
          const totalWeight = shipment.totalWeightKg > 0 ? shipment.totalWeightKg : 1;
          for (const item of groupItems) {
            const itemWeight = item.weightPerUnitKg * item.quantity;
            const itemShare = tableMatch.standardAmount * (itemWeight / totalWeight);
            lines[item.lineIndex].convertedShippingTotal = roundTo2(
              convertAmount(itemShare, tableMatch.currencyCode, targetCurrency, input.rates)
            );
          }

          if (intlTiers.length === 0) {
            intlRateCurrency = tableMatch.currencyCode;
            intlStandardRate = tableMatch.standardAmount;
            intlTiers = [
              {
                tier: 'standard',
                rate: tableMatch.standardAmount,
                etd: tableMatch.standardEta,
                estimatedDays: parseEstimatedDaysText(tableMatch.standardEta),
                provider: 'bzead-rate-card',
              },
              {
                tier: 'express',
                rate: tableMatch.expressAmount > 0 ? tableMatch.expressAmount : tableMatch.standardAmount,
                etd: tableMatch.expressEta,
                estimatedDays: parseEstimatedDaysText(tableMatch.expressEta),
                provider: 'bzead-rate-card',
              },
            ];
          }
          return;
        }

        if (requiresTableOnlyPodRoute(originIsoToken)) {
          missingRequiredPodRateRoute = true;
          for (const item of groupItems) {
            lines[item.lineIndex].convertedShippingTotal = 0;
          }
          return;
        }

        if (!destCountryForShiprocket) return;

        const pickupPostcodeForIntl = firstItem.pickupPincode || kycPostalBySellerId.get(firstItem.sellerId) || '';

        try {
          const rateRes = await fetch(`${supabaseUrlBase}/functions/v1/shiprocket-rate`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(anonKey ? { apikey: anonKey, Authorization: `Bearer ${anonKey}` } : {}),
            },
            body: JSON.stringify({
              pickup_postcode: pickupPostcodeForIntl,
              delivery_country: destCountryForShiprocket,
              delivery_postcode: input.destinationPostalCode || '',
              weight: shipment.chargeableWeightKg,
            }),
          });

          if (!rateRes.ok) return;

          const rateBody = await rateRes.json() as { tiers?: IntlTier[]; freeShippingAboveInr?: number };
          if (!Array.isArray(rateBody.tiers) || rateBody.tiers.length === 0) return;

          shiprocketLiveIntlItemsForFreeShipping.push(...groupItems);

          if (intlTiers.length === 0) {
            intlTiers = rateBody.tiers;
            intlRateCurrency = 'INR';
          }

          if (typeof rateBody.freeShippingAboveInr === 'number' && rateBody.freeShippingAboveInr > 0) {
            intlFreeShippingThresholdInr = Math.max(intlFreeShippingThresholdInr, rateBody.freeShippingAboveInr);
          }

          const stdTier = rateBody.tiers.find((tier) => tier.tier === 'standard') || intlTiers.find((tier) => tier.tier === 'standard');
          if (!stdTier) return;

          if (intlStandardRate <= 0) {
            intlStandardRate = stdTier.rate;
          }

          const totalWeight = shipment.totalWeightKg > 0 ? shipment.totalWeightKg : 1;
          for (const item of groupItems) {
            const itemWeight = item.weightPerUnitKg * item.quantity;
            const itemShare = stdTier.rate * (itemWeight / totalWeight);
            lines[item.lineIndex].convertedShippingTotal = roundTo2(
              convertAmount(itemShare, 'INR', targetCurrency, input.rates)
            );
          }
        } catch (e) {
          console.error('[checkoutPricing] Shiprocket rate fetch failed:', e);
        }
      }));
    }

    // ── Shippo-origin items → Shippo ──
    if (shippoOriginIntlItems.length > 0) {
      const destCountryForShippo = String(destinationCountryRow?.country_name || destinationCountry || '').trim();
      const routeGroups = groupIntlItemsByRoute(shippoOriginIntlItems);

      await Promise.all(Array.from(routeGroups.values()).map(async (groupItems) => {
        if (groupItems.length === 0) return;

        const firstItem = groupItems[0];
        const shipment = buildShipmentMetrics(groupItems);
        const originCountryId = resolveCountryId(firstItem.originCountryToken, firstItem.originCountryId);
        const originIso = firstItem.originCountryIso || resolveIsoCode(firstItem.originCountryToken, originCountryId || undefined) || 'GB';
        const originIsoToken = normalizeCountryToken(originIso);

        const tableMatch = destinationCountryId
          ? await resolvePodRateCardMatch({
              originCountryId,
              destinationCountryId,
              shipmentWeightKg: shipment.chargeableWeightKg,
            })
          : null;

        if (tableMatch) {
          const totalWeight = shipment.totalWeightKg > 0 ? shipment.totalWeightKg : 1;
          for (const item of groupItems) {
            const itemWeight = item.weightPerUnitKg * item.quantity;
            const itemShare = tableMatch.standardAmount * (itemWeight / totalWeight);
            lines[item.lineIndex].convertedShippingTotal = roundTo2(
              convertAmount(itemShare, tableMatch.currencyCode, targetCurrency, input.rates)
            );
          }

          if (intlTiers.length === 0) {
            intlRateCurrency = tableMatch.currencyCode;
            intlStandardRate = tableMatch.standardAmount;
            intlTiers = [
              {
                tier: 'standard',
                rate: tableMatch.standardAmount,
                etd: tableMatch.standardEta,
                estimatedDays: parseEstimatedDaysText(tableMatch.standardEta),
                provider: 'bzead-rate-card',
              },
              {
                tier: 'express',
                rate: tableMatch.expressAmount > 0 ? tableMatch.expressAmount : tableMatch.standardAmount,
                etd: tableMatch.expressEta,
                estimatedDays: parseEstimatedDaysText(tableMatch.expressEta),
                provider: 'bzead-rate-card',
              },
            ];
          }
          return;
        }

        if (requiresTableOnlyPodRoute(originIsoToken)) {
          missingRequiredPodRateRoute = true;
          for (const item of groupItems) {
            lines[item.lineIndex].convertedShippingTotal = 0;
          }
          return;
        }

        if (!destCountryForShippo) return;

        const pickupPostcodeForShippo = firstItem.pickupPincode || kycPostalBySellerId.get(firstItem.sellerId) || '';
        const destIso = destinationCountryRow?.iso2 || destinationCountryRow?.country_code || '';
        const destPostcode = input.destinationPostalCode || '';

        try {
          const rateRes = await fetch(`${supabaseUrlBase}/functions/v1/shippo-rate`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(anonKey ? { apikey: anonKey, Authorization: `Bearer ${anonKey}` } : {}),
            },
            body: JSON.stringify({
              from_country: originIso,
              from_zip: pickupPostcodeForShippo,
              to_country: destIso || destCountryForShippo,
              to_zip: destPostcode,
              weight_g: Math.round(shipment.chargeableWeightKg * 1000),
              length_cm: shipment.maxLengthCm,
              width_cm: shipment.maxWidthCm,
              height_cm: shipment.maxHeightCm,
            }),
          });

          if (!rateRes.ok) return;

          const rateBody = await rateRes.json() as {
            tiers?: Record<string, { tier?: string; rate?: number; currency?: string; estimated_delivery_days?: number; courier_name?: string; service_level?: string; rate_id?: string } | null>;
            provider?: string;
          };
          const shippoTiers: IntlTier[] = [];
          const shippoIntlCurrency = originIso === 'US' ? 'USD' : originIso === 'CA' ? 'CAD' : originIso === 'GB' ? 'GBP' : 'EUR';
          if (rateBody.tiers && typeof rateBody.tiers === 'object' && !Array.isArray(rateBody.tiers)) {
            for (const key of ['standard', 'premium', 'express'] as const) {
              const tier = rateBody.tiers[key];
              if (tier && typeof tier.rate === 'number') {
                const days = tier.estimated_delivery_days ?? 0;
                shippoTiers.push({
                  tier: key,
                  rate: tier.rate,
                  etd: days > 0 ? `${days} days` : '',
                  estimatedDays: days > 0 ? String(days) : '',
                  carrierName: tier.courier_name || undefined,
                  serviceLevel: tier.service_level || undefined,
                  rateId: tier.rate_id || undefined,
                  provider: rateBody.provider || 'shippo',
                });
              }
            }
          }

          if (shippoTiers.length === 0) return;

          if (intlTiers.length === 0) {
            intlTiers = shippoTiers;
            intlRateCurrency = shippoIntlCurrency;
            const firstStandard = shippoTiers.find((tier) => tier.tier === 'standard');
            if (firstStandard) intlStandardRate = firstStandard.rate;
          }

          const stdTier = shippoTiers.find((tier) => tier.tier === 'standard');
          if (!stdTier) return;

          const totalWeight = shipment.totalWeightKg > 0 ? shipment.totalWeightKg : 1;
          for (const item of groupItems) {
            const itemWeight = item.weightPerUnitKg * item.quantity;
            const itemShare = stdTier.rate * (itemWeight / totalWeight);
            lines[item.lineIndex].convertedShippingTotal = roundTo2(
              convertAmount(itemShare, shippoIntlCurrency, targetCurrency, input.rates)
            );
          }
        } catch (e) {
          console.error('[checkoutPricing] Shippo rate fetch failed:', e);
        }
      }));
    }
  }

  // ── Free shipping: zero out all Shiprocket-routed international lines when the marked-up
  //    INR subtotal meets the DB-configured threshold (intl_shipping_country_config.free_shipping_above_inr).
  //    Threshold value comes from the shiprocket-rate edge function response — never hardcoded here.
  if (intlFreeShippingThresholdInr > 0 && shiprocketLiveIntlItemsForFreeShipping.length > 0) {
    // Sum INR subtotal per unique origin ISO (e.g. 'IN' for India) across Shiprocket items
    const originIsoSet = new Set(
      shiprocketLiveIntlItemsForFreeShipping.map((si) =>
        normalizeCountryToken(resolveIsoCode(si.originCountryToken, si.originCountryId))
      )
    );
    const routeSubtotalInr = Array.from(originIsoSet).reduce(
      (sum, iso) => sum + (subtotalInrByOriginIsoToken.get(iso) || 0),
      0
    );
    if (routeSubtotalInr >= intlFreeShippingThresholdInr) {
      for (const si of shiprocketLiveIntlItemsForFreeShipping) {
        lines[si.lineIndex].convertedShippingTotal = 0;
      }
    }
  }

  if (missingRequiredPodRateRoute) {
    intlTiers = [];
  }

  // ── Safety: international shipping must NEVER be 0 ──
  // If both Shiprocket and Shippo rate lookups failed/returned nothing, flag the error
  let intlShippingError: string | undefined;
  if (hasInternationalItems && intlTiers.length === 0) {
    intlShippingError = 'Not a Serviceable Area — no shipping available for this route.';
  }

  // ── Safety: Shippo domestic must surface a clear error when no rates found ──
  let domesticShippingError: string | undefined;
  if (!hasInternationalItems && shippoDomesticGroups.size > 0 && shippoDomesticTiers.length === 0) {
    domesticShippingError = 'Not a Serviceable Area — no shipping available for this route.';
  }

  // ── Capture pre-surcharge shipping (internal cost breakdown) ──
  const actualShippingCost = lines.reduce((sum, line) => sum + line.convertedShippingTotal, 0);

  // ── Platform shipping margin tracking ──
  // India domestic ₹15 markup is already baked into the rate returned by shiprocket-rate edge function.
  // Do NOT add it again here — just track it for reporting.
  const platformShippingMargin = (() => {
    // Count India-domestic lines to know if the edge-fn markup applies
    const indiaDomesticLineIndices = new Set<number>();
    for (const [, sellerItems] of domesticSellerGroups) {
      for (const si of sellerItems) indiaDomesticLineIndices.add(si.lineIndex);
    }
    if (destinationLooksIndia && indiaDomesticLineIndices.size === 0) {
      const ukDomesticLineIndices = new Set<number>();
      for (const [, items] of shippoDomesticGroups) {
        for (const si of items) ukDomesticLineIndices.add(si.lineIndex);
      }
      const intlLineIndices = new Set<number>();
      for (const si of intlItemsWithWeight) intlLineIndices.add(si.lineIndex);
      for (let i = 0; i < lines.length; i++) {
        if (!ukDomesticLineIndices.has(i) && !intlLineIndices.has(i)) {
          indiaDomesticLineIndices.add(i);
        }
      }
    }
    if (indiaDomesticLineIndices.size > 0) {
      return roundTo2(convertAmount(15, 'INR', targetCurrency, input.rates));
    }
    return 0;
  })();

  const subtotal = roundTo2(lines.reduce((sum, line) => sum + line.convertedLineTotal, 0));
  const offerDiscount = roundTo2(lines.reduce((sum, line) => sum + line.offerDiscount, 0));
  const shipping = roundTo2(lines.reduce((sum, line) => sum + line.convertedShippingTotal, 0));
  const payableBeforeCommission = (subtotal - offerDiscount) + shipping;
  const commissionPct = 0;
  const platformHandlingCharge = roundTo2(payableBeforeCommission * commissionPct / 100);
  const total = roundTo2(payableBeforeCommission + platformHandlingCharge);
  // Cash on Delivery is disabled web-wide (business decision).
  // Flip COD_DISABLED to false to re-enable per-item eligibility.
  const COD_DISABLED = true;
  const codEligibleByItems = ineligibleItems.length === 0 && codIneligibleItems.length === 0 && lines.length > 0;
  const codEligible = !COD_DISABLED && codEligibleByItems;

  let minimumOrderConstraint: MinimumOrderConstraint | undefined;
  const matchingRouteRules = checkoutMinOrderRules
    .map((rule) => {
      const originIsoToken = normalizeCountryToken(String(rule.origin_iso2 || ''));
      const destinationRuleToken = normalizeCountryToken(String(rule.destination_iso2 || ''));
      const minimumInr = asFinite(rule.min_order_inr);
      return { originIsoToken, destinationRuleToken, minimumInr };
    })
    .filter((rule) => rule.originIsoToken && rule.destinationRuleToken && rule.minimumInr > 0)
    .filter((rule) => rule.destinationRuleToken === destinationIsoToken);

  for (const rule of matchingRouteRules) {
    const currentSubtotalInr = roundTo2(subtotalInrByOriginIsoToken.get(rule.originIsoToken) || 0);
    if (currentSubtotalInr <= 0) continue;
    const minimumInCheckoutCurrency = roundTo2(
      convertAmount(rule.minimumInr, 'INR', targetCurrency, input.rates)
    );
    const currentSubtotalInCheckoutCurrency = roundTo2(
      convertAmount(currentSubtotalInr, 'INR', targetCurrency, input.rates)
    );
    minimumOrderConstraint = {
      code: 'INDIA_TO_UK_MIN_SUBTOTAL',
      minimumInr: roundTo2(rule.minimumInr),
      minimumInCheckoutCurrency,
      currentSubtotalInr,
      currentSubtotalInCheckoutCurrency,
      isMet: currentSubtotalInr >= rule.minimumInr,
    };
    break;
  }

  // ── Build international shipping options (Standard / Premium / Express) from live rates ──
  let intlShippingOptions: IntlShippingOptions | undefined;
  if (hasInternationalItems && intlTiers.length > 0) {
    const stdTier = intlTiers.find((t) => t.tier === 'standard');
    const premTier = intlTiers.find((t) => t.tier === 'premium');
    const expTier = intlTiers.find((t) => t.tier === 'express');

    const standardOption: IntlShippingOption = {
      shipping,
      total,
      etd: stdTier?.etd || '',
      estimatedDays: stdTier?.estimatedDays || '',
      carrierName: stdTier?.carrierName,
      serviceLevel: stdTier?.serviceLevel,
      rateId: stdTier?.rateId,
      provider: stdTier?.provider,
    };

    const baseIntlStandardRate = stdTier ? stdTier.rate : intlStandardRate;

    let premiumOption: IntlShippingOption | null = null;
    if (premTier && Number.isFinite(baseIntlStandardRate)) {
      const rateDelta = premTier.rate - baseIntlStandardRate;
      const shippingDelta = convertAmount(rateDelta, intlRateCurrency, targetCurrency, input.rates);
      const premShipping = roundTo2(shipping + shippingDelta);
      const premPayable = (subtotal - offerDiscount) + premShipping;
      const premCommission = roundTo2(premPayable * (commissionPct / 100));
      premiumOption = {
        shipping: premShipping,
        total: roundTo2(premPayable + premCommission),
        etd: premTier.etd,
        estimatedDays: premTier.estimatedDays,
        carrierName: premTier.carrierName,
        serviceLevel: premTier.serviceLevel,
        rateId: premTier.rateId,
        provider: premTier.provider,
      };
    }

    let expressOption: IntlShippingOption | null = null;
    if (expTier && Number.isFinite(baseIntlStandardRate)) {
      const rateDelta = expTier.rate - baseIntlStandardRate;
      const shippingDelta = convertAmount(rateDelta, intlRateCurrency, targetCurrency, input.rates);
      const expShipping = roundTo2(shipping + shippingDelta);
      const expPayable = (subtotal - offerDiscount) + expShipping;
      const expCommission = roundTo2(expPayable * (commissionPct / 100));
      expressOption = {
        shipping: expShipping,
        total: roundTo2(expPayable + expCommission),
        etd: expTier.etd,
        estimatedDays: expTier.estimatedDays,
        carrierName: expTier.carrierName,
        serviceLevel: expTier.serviceLevel,
        rateId: expTier.rateId,
        provider: expTier.provider,
      };
    }

    intlShippingOptions = { standard: standardOption, premium: premiumOption, express: expressOption };
  }

  // ── Build Shippo domestic shipping options (Standard / Express) ──
  let ukDomesticShippingOptions: IntlShippingOptions | undefined;
  if (!hasInternationalItems && shippoDomesticTiers.length > 0) {
    const stdTier = shippoDomesticTiers.find((t) => t.tier === 'standard');
    const expTier = shippoDomesticTiers.find((t) => t.tier === 'express');
    const baseShippoStandardRate = stdTier ? stdTier.rate : shippoDomStandardRate;

    const standardOption: IntlShippingOption = {
      shipping,
      total,
      etd: stdTier?.etd || '',
      estimatedDays: stdTier?.estimatedDays || '',
      carrierName: stdTier?.carrierName,
      serviceLevel: stdTier?.serviceLevel,
      rateId: stdTier?.rateId,
      provider: stdTier?.provider,
    };

    let expressOption: IntlShippingOption | null = null;
    if (expTier && Number.isFinite(baseShippoStandardRate)) {
      const rateDelta = expTier.rate - baseShippoStandardRate;
      const shippingDelta = convertAmount(rateDelta, shippoDomRateCurrency, targetCurrency, input.rates);
      const expShipping = roundTo2(shipping + shippingDelta);
      const expPayable = (subtotal - offerDiscount) + expShipping;
      const expCommission = roundTo2(expPayable * (commissionPct / 100));
      expressOption = {
        shipping: expShipping,
        total: roundTo2(expPayable + expCommission),
        etd: expTier.etd,
        estimatedDays: expTier.estimatedDays,
        carrierName: expTier.carrierName,
        serviceLevel: expTier.serviceLevel,
        rateId: expTier.rateId,
        provider: expTier.provider,
      };
    }

    ukDomesticShippingOptions = { standard: standardOption, premium: null, express: expressOption };
  }

  if (IS_UK_STOREFRONT) {
    const convertedAmounts = [
      subtotal,
      offerDiscount,
      platformHandlingCharge,
      shipping,
      total,
      subtotalInrAccum,
      platformShippingMargin,
      ...lines.flatMap((line) => [
        line.convertedUnitPrice,
        line.convertedLineTotal,
        line.convertedShippingTotal,
        line.offerDiscount,
      ]),
      ...(minimumOrderConstraint
        ? [
            minimumOrderConstraint.minimumInCheckoutCurrency,
            minimumOrderConstraint.currentSubtotalInCheckoutCurrency,
          ]
        : []),
      ...(intlShippingOptions
        ? [intlShippingOptions.standard, intlShippingOptions.premium, intlShippingOptions.express]
            .filter((option): option is IntlShippingOption => option !== null)
            .flatMap((option) => [option.shipping, option.total])
        : []),
      ...(ukDomesticShippingOptions
        ? [ukDomesticShippingOptions.standard, ukDomesticShippingOptions.express]
            .filter((option): option is IntlShippingOption => option !== null)
            .flatMap((option) => [option.shipping, option.total])
        : []),
    ];
    if (convertedAmounts.some((amount) => !Number.isFinite(amount))) {
      throw new Error('GBP pricing or shipping conversion is unavailable. Checkout is blocked until the required exchange rates are available.');
    }
  }

  return {
    currency: targetCurrency,
    destinationCountry,
    subtotal,
    offerDiscount,
    platformHandlingCharge,
    shipping,
    total,
    items: lines,
    ineligibleItems,
    codEligible,
    codIneligibleItems,
    hasInternationalItems,
    subtotalInr: subtotalInrAccum,
    actualShippingCost,
    platformShippingMargin,
    intlShippingOptions,
    intlShippingError,
    domesticShippingError,
    ukDomesticShippingOptions,
    minimumOrderConstraint,
  };
}
