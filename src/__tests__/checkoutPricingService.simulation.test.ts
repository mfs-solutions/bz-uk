import { beforeEach, describe, expect, it, vi } from 'vitest';

type TableRow = Record<string, any>;

const hoisted = vi.hoisted(() => ({
  mockTables: {} as Record<string, TableRow[]>,
  mockRpcRows: {} as Record<string, TableRow[]>,
  mockRpcCalls: [] as Array<{ functionName: string; args: Record<string, any> }>,
  mockFetchOk: true as boolean,
  mockFetchRate: 120 as number,
  mockFetchCalls: [] as Array<{ url: string; body: any }>,
}));

function setTable(tableName: string, rows: TableRow[]) {
  hoisted.mockTables[tableName] = rows;
}

function setRpcRows(functionName: string, rows: TableRow[]) {
  hoisted.mockRpcRows[functionName] = rows;
}

function applyFilters(rows: TableRow[], filters: Array<{ type: 'eq' | 'in'; column: string; value: any }>) {
  return filters.reduce((acc, filter) => {
    if (filter.type === 'eq') {
      return acc.filter((row) => row[filter.column] === filter.value);
    }

    return acc.filter((row) => (Array.isArray(filter.value) ? filter.value.includes(row[filter.column]) : false));
  }, rows);
}

function buildQuery(tableName: string) {
  const filters: Array<{ type: 'eq' | 'in'; column: string; value: any }> = [];

  const execute = async () => {
    const rows = Array.isArray(hoisted.mockTables[tableName]) ? hoisted.mockTables[tableName] : [];
    return {
      data: applyFilters(rows, filters),
      error: null,
    };
  };

  const chain = {
    select() {
      return chain;
    },
    order() {
      return chain;
    },
    in(column: string, value: any[]) {
      filters.push({ type: 'in', column, value });
      return chain;
    },
    eq(column: string, value: any) {
      filters.push({ type: 'eq', column, value });
      return chain;
    },
    then(resolve: any, reject?: any) {
      return execute().then(resolve, reject);
    },
  };

  return chain;
}

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (tableName: string) => buildQuery(tableName),
    rpc: async (functionName: string, args: Record<string, any> = {}) => {
      hoisted.mockRpcCalls.push({ functionName, args });
      const rows = hoisted.mockRpcRows[functionName] || [];
      if (rows.length === 0 && functionName === 'get_public_product_prices_with_overrides') {
        return {
          data: Object.entries(args.p_price_overrides || {}).map(([productId, price]) => ({
            product_id: productId,
            selling_price: price,
            markup_mrp: price,
          })),
          error: null,
        };
      }
      return { data: rows, error: null };
    },
  },
}));

// Mock global fetch for Shiprocket rate calls
globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  let body: any = {};
  try { body = JSON.parse(String(init?.body || '{}')); } catch { /* ignore */ }
  hoisted.mockFetchCalls.push({ url, body });
  if (!hoisted.mockFetchOk) {
    return new Response(JSON.stringify({ error: 'network' }), { status: 500 });
  }

  if (url.includes('shippo-rate')) {
    const shippoResponse = {
      cheapest: {
        rate: hoisted.mockFetchRate,
        currency: 'GBP',
        estimated_delivery_days: 2,
        courier_name: 'Evri',
        service_level: 'ParcelShop Drop-Off',
        rate_id: 'shippo-cheapest-rate',
      },
      tiers: {
        standard: {
          rate: hoisted.mockFetchRate,
          currency: 'GBP',
          estimated_delivery_days: 2,
          courier_name: 'Evri',
          service_level: 'ParcelShop Drop-Off',
          rate_id: 'shippo-standard-rate',
        },
        express: {
          rate: hoisted.mockFetchRate + 2,
          currency: 'GBP',
          estimated_delivery_days: 1,
          courier_name: 'Evri',
          service_level: 'Express',
          rate_id: 'shippo-express-rate',
        },
      },
      provider: 'shippo',
    };
    return new Response(JSON.stringify(shippoResponse), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  const responseData = {
    tiers: [
      { tier: 'standard', rate: hoisted.mockFetchRate, etd: '3-5 days', estimatedDays: '5' },
    ],
    availableCount: 1,
    domestic: true,
  };
  return new Response(JSON.stringify(responseData), { status: 200, headers: { 'Content-Type': 'application/json' } });
}) as any;

vi.mock('../utils/currency', () => ({
  resolveCurrencyFromCountry: vi.fn(async (country: string) => {
    const token = String(country || '').trim().toUpperCase();
    if (token === 'UNITED STATES' || token === 'US' || token === 'USA') {
      return 'USD';
    }
    if (token === 'UNITED KINGDOM' || token === 'UK' || token === 'GB' || token === 'GBR') {
      return 'GBP';
    }
    return 'INR';
  }),
  convertAmount: vi.fn((amount: number, fromCurrency: string, toCurrency: string, rates: Record<string, number>) => {
    const from = String(fromCurrency || 'INR').toUpperCase();
    const to = String(toCurrency || 'INR').toUpperCase();
    if (from === to) return amount;

    const fromRate = Number(rates[from]);
    const toRate = Number(rates[to]);
    if (!Number.isFinite(fromRate) || !Number.isFinite(toRate) || fromRate <= 0 || toRate <= 0) {
      return amount;
    }

    const inUsd = from === 'USD' ? amount : amount / fromRate;
    return to === 'USD' ? inUsd : inUsd * toRate;
  }),
}));

import { calculateDestinationCheckoutPricing } from '../lib/checkoutPricingService';
import { fetchVerifiedVariantPrices } from '../lib/pricingService';

describe('checkout pricing simulation: legacy + shiprocket', () => {
  beforeEach(() => {
    hoisted.mockFetchCalls = [];
    hoisted.mockFetchOk = true;
    hoisted.mockFetchRate = 120;
    hoisted.mockRpcRows = {};
    hoisted.mockRpcCalls = [];
    setTable('product_variants', []);

    setRpcRows('get_active_checkout_min_order_rules', [
      { origin_iso2: 'IN', destination_iso2: 'GB', min_order_inr: 3200 },
      { origin_iso2: 'IN', destination_iso2: 'MT', min_order_inr: 3200 },
    ]);

    setTable('products', [
      {
        id: 'legacy-p1',
        origin_country: null,
        origin_country_id: null,
        is_cod_available: true,
        shipping_type: null,
        courier_partner: null,
        package_weight: null,
        package_weight_unit_id: null,
        package_length: null,
        package_length_unit_id: null,
        package_width: null,
        package_width_unit_id: null,
        package_height: null,
        package_height_unit_id: null,
        seller_id: 'seller-1',
      },
      {
        id: 'modern-p2',
        origin_country: 'India',
        origin_country_id: 'c-ind',
        is_cod_available: true,
        shipping_type: 'shiprocket',
        courier_partner: 'shiprocket',
        package_weight: 1,
        package_weight_unit_id: 'u-kg',
        package_length: 10,
        package_length_unit_id: 'u-cm',
        package_width: 10,
        package_width_unit_id: 'u-cm',
        package_height: 10,
        package_height_unit_id: 'u-cm',
        seller_id: 'seller-2',
      },
    ]);

    setTable('countries', [
      { id: 'c-ind', country_name: 'India', country_code: 'IN', short_code: 'IND', iso2: 'IN', is_active: true },
      { id: 'c-us', country_name: 'United States', country_code: 'US', short_code: 'USA', iso2: 'US', is_active: true },
      { id: 'c-gbr', country_name: 'United Kingdom', country_code: 'GB', short_code: 'GBR', iso2: 'GB', is_active: true },
      { id: 'c-mlt', country_name: 'Malta', country_code: 'MT', short_code: 'MLT', iso2: 'MT', is_active: true },
    ]);

    setTable('shipping_provider_config', [
      { country_code: 'GB', provider: 'shippo', domestic: true, international: true, active: true },
    ]);

    setTable('product_origin_destination_shipping_rates', []);

    setTable('product_international_shipping', [
      { product_id: 'modern-p2', country_id: 'c-us', country_name: 'United States', shipping_charge: 200 },
    ]);

    setTable('measurement_units', [
      { id: 'u-kg', code: 'KG', is_active: true },
      { id: 'u-cm', code: 'CM', is_active: true },
    ]);

    // Seller KYC data provides pickup postal codes for Shiprocket rate calls
    setTable('seller_kyc', [
      { seller_id: 'seller-1', business_postal_code: '670702' },
      { seller_id: 'seller-2', business_postal_code: '670702' },
    ]);

    // Empty profiles simulates buyer role RLS where seller profile country may not be readable.
    setTable('profiles', []);
  });

  it('prices multiple selected variants of the same product independently', async () => {
    setTable('product_variants', [
      { id: 'variant-459', product_id: 'modern-p2', sku: 'SKU-459', size: 'Small', color: 'Silver', price: 459 },
      { id: 'variant-499', product_id: 'modern-p2', sku: 'SKU-499', size: 'Large', color: 'Silver', price: 499 },
    ]);

    const pricing = await calculateDestinationCheckoutPricing({
      items: [
        {
          cartItemId: 'cart-small',
          productId: 'modern-p2',
          productName: 'Variant Product',
          quantity: 1,
          unitPrice: 459,
          currency: 'INR',
          selectedVariantId: 'variant-459',
          selectedVariantSku: 'SKU-459',
          selectedSize: 'Small',
          selectedColor: 'Silver',
        },
        {
          cartItemId: 'cart-large',
          productId: 'modern-p2',
          productName: 'Variant Product',
          quantity: 1,
          unitPrice: 459,
          currency: 'INR',
          selectedVariantId: 'variant-499',
          selectedVariantSku: 'SKU-499',
          selectedSize: 'Large',
          selectedColor: 'Silver',
        },
      ],
      destinationCountry: 'India',
      rates: { INR: 83, USD: 1 },
    });

    expect(pricing.items.map((item) => [item.cartItemId, item.sourceUnitPrice, item.selectedVariantSku])).toEqual([
      ['cart-small', 459, 'SKU-459'],
      ['cart-large', 499, 'SKU-499'],
    ]);
    expect(pricing.subtotal).toBe(958);
  });

  it('rejects missing, invalid, or ambiguous variant selections instead of using the parent price', async () => {
    setTable('product_variants', [
      { id: 'variant-one', product_id: 'modern-p2', sku: 'SKU-ONE', size: 'One', color: 'Silver', price: 499 },
      { id: 'variant-two', product_id: 'modern-p2', sku: 'SKU-TWO', size: 'Two', color: 'Silver', price: 599 },
    ]);

    const missing = await fetchVerifiedVariantPrices([
      { key: 'cart-1', productId: 'modern-p2' },
    ], 'India');
    const invalid = await fetchVerifiedVariantPrices([
      { key: 'cart-1', productId: 'modern-p2', variantSku: 'SKU-DELETED' },
    ], 'India');
    const ambiguous = await fetchVerifiedVariantPrices([
      { key: 'cart-1', productId: 'modern-p2', selectedColor: 'Silver' },
    ], 'India');

    expect(missing.error).toMatch(/variant must be selected/i);
    expect(invalid.error).toMatch(/unavailable or has changed/i);
    expect(ambiguous.error).toMatch(/cannot be uniquely verified/i);
  });

  it('keeps non-variant products on the existing product-price path', async () => {
    const result = await fetchVerifiedVariantPrices([
      { key: 'cart-1', productId: 'modern-p2' },
    ], 'India');

    expect(result).toEqual({ data: {}, error: null });
    expect(hoisted.mockRpcCalls).toHaveLength(0);
  });

  it('India checkout: legacy item remains eligible and Shiprocket live rate is applied', async () => {
    const pricing = await calculateDestinationCheckoutPricing({
      items: [
        { productId: 'legacy-p1', productName: 'Legacy Product', quantity: 2, unitPrice: 1000, currency: 'INR' },
        { productId: 'modern-p2', productName: 'Modern Product', quantity: 1, unitPrice: 500, currency: 'INR' },
      ],
      destinationCountry: 'India',
      destinationPostalCode: '110001',
      rates: { INR: 83, USD: 1 },
    });

    expect(pricing.destinationCountry).toBe('India');
    expect(pricing.currency).toBe('INR');
    expect(pricing.ineligibleItems).toHaveLength(0);
    expect(pricing.items).toHaveLength(2);

    // legacy-p1 has no origin country → treated as international (0 shipping)
    // modern-p2 gets Shiprocket live rate: 120
    expect(pricing.shipping).toBe(120);
    expect(pricing.subtotal).toBe(2500);
    expect(pricing.platformHandlingCharge).toBe(0);
    expect(pricing.total).toBe(2620);
    // legacy-p1 goes international → COD not eligible
    expect(pricing.codEligible).toBe(false);

    // Only modern-p2 gets a Shiprocket domestic rate call
    expect(hoisted.mockFetchCalls.length).toBe(1);
  });

  it('US checkout: legacy item is available but has no international shipping configured', async () => {
    const pricing = await calculateDestinationCheckoutPricing({
      items: [
        { productId: 'legacy-p1', productName: 'Legacy Product', quantity: 1, unitPrice: 1000, currency: 'INR' },
      ],
      destinationCountry: 'United States',
      destinationPostalCode: '10001',
      rates: { INR: 83, USD: 1 },
    });

    expect(pricing.currency).toBe('USD');
    // All products available to all countries — no eligibility gating
    expect(pricing.items).toHaveLength(1);
    expect(pricing.ineligibleItems).toHaveLength(0);
    expect(pricing.shipping).toBe(0);
    // 1000 INR → USD = 1000/83 ≈ 12.05
    expect(pricing.subtotal).toBe(12.05);
    expect(pricing.platformHandlingCharge).toBe(0);
    expect(pricing.total).toBe(12.05);
    expect(pricing.codEligible).toBe(false);
  });

  it('India buyer with seller and buyer pincode uses Shiprocket live rate path', async () => {
    const pricing = await calculateDestinationCheckoutPricing({
      items: [
        { productId: 'modern-p2', productName: 'Modern Product', quantity: 1, unitPrice: 500, currency: 'INR' },
      ],
      destinationCountry: 'India',
      destinationPostalCode: '560002',
      rates: { INR: 83, USD: 1 },
    });

    expect(pricing.ineligibleItems).toHaveLength(0);
    // Shiprocket live rate (120) — ₹15 markup already baked into edge function rate
    expect(pricing.shipping).toBe(120);
    expect(pricing.subtotal).toBe(500);
    expect(pricing.platformHandlingCharge).toBe(0);
    expect(pricing.total).toBe(620);
    expect(pricing.codEligible).toBe(true);

    expect(hoisted.mockFetchCalls.length).toBe(1);
    expect(hoisted.mockFetchCalls[0]?.url).toContain('shiprocket-rate');
  });

  it('falls back to configured domestic charge when Shiprocket live-rate call fails', async () => {
    hoisted.mockFetchOk = false;

    const pricing = await calculateDestinationCheckoutPricing({
      items: [
        { productId: 'modern-p2', productName: 'Modern Product', quantity: 2, unitPrice: 500, currency: 'INR' },
      ],
      destinationCountry: 'India',
      destinationPostalCode: '560002',
      rates: { INR: 83, USD: 1 },
    });

    // Fallback is flat domestic shipping placeholder (2 × 50)
    expect(pricing.shipping).toBe(100);
    expect(hoisted.mockFetchCalls.length).toBe(1);
  });

  it('two products from same seller get ONE combined Shiprocket rate call', async () => {
    // Add a second product from the same seller (seller-2)
    setTable('products', [
      {
        id: 'modern-p2',
        origin_country: 'India',
        origin_country_id: 'c-ind',
        is_cod_available: true,
        shipping_type: 'shiprocket',
        courier_partner: 'shiprocket',
        package_weight: 1,
        package_weight_unit_id: 'u-kg',
        package_length: 20,
        package_length_unit_id: 'u-cm',
        package_width: 15,
        package_width_unit_id: 'u-cm',
        package_height: 10,
        package_height_unit_id: 'u-cm',
        seller_id: 'seller-2',
      },
      {
        id: 'modern-p3',
        origin_country: 'India',
        origin_country_id: 'c-ind',
        is_cod_available: true,
        shipping_type: 'shiprocket',
        courier_partner: 'shiprocket',
        package_weight: 0.5,
        package_weight_unit_id: 'u-kg',
        package_length: 10,
        package_length_unit_id: 'u-cm',
        package_width: 10,
        package_width_unit_id: 'u-cm',
        package_height: 5,
        package_height_unit_id: 'u-cm',
        seller_id: 'seller-2',
      },
    ]);

    // Mock returns 120 as combined shipping for the whole seller shipment
    hoisted.mockFetchRate = 120;

    const pricing = await calculateDestinationCheckoutPricing({
      items: [
        { productId: 'modern-p2', productName: 'Product A', quantity: 1, unitPrice: 500, currency: 'INR' },
        { productId: 'modern-p3', productName: 'Product B', quantity: 2, unitPrice: 300, currency: 'INR' },
      ],
      destinationCountry: 'India',
      destinationPostalCode: '560002',
      rates: { INR: 83, USD: 1 },
    });

    // Only ONE Shiprocket rate call for both products (same seller)
    expect(hoisted.mockFetchCalls.length).toBe(1);

    // Combined weight: p2=1kg*1 + p3=0.5kg*2 = 2kg total
    // Shipping distributed by weight: p2 gets 1/2 * 120 = 60, p3 gets 1/2 * 120 = 60
    // ₹15 markup already baked into edge function rate — no additional surcharge
    expect(pricing.shipping).toBe(120);
    expect(pricing.items).toHaveLength(2);

    const itemA = pricing.items.find((i) => i.productId === 'modern-p2');
    const itemB = pricing.items.find((i) => i.productId === 'modern-p3');
    expect(itemA?.convertedShippingTotal).toBe(60);
    expect(itemB?.convertedShippingTotal).toBe(60);

    expect(pricing.ineligibleItems).toHaveLength(0);
    expect(pricing.codEligible).toBe(true);
  });

  it('passes COD flag to Shiprocket live-rate request when isCod is true', async () => {
    hoisted.mockFetchRate = 150;

    const pricing = await calculateDestinationCheckoutPricing({
      items: [
        { productId: 'modern-p2', productName: 'Modern Product', quantity: 1, unitPrice: 500, currency: 'INR' },
      ],
      destinationCountry: 'India',
      destinationPostalCode: '560002',
      rates: { INR: 83, USD: 1 },
      isCod: true,
    });

    expect(hoisted.mockFetchCalls.length).toBe(1);
    expect(hoisted.mockFetchCalls[0]?.url).toContain('shiprocket-rate');
    // ₹15 markup already baked into edge function rate — no additional surcharge
    expect(pricing.shipping).toBe(150);
  });

  it('UK-to-UK up to 5kg uses configured table rate and avoids live Shippo call', async () => {
    setTable('products', [
      {
        id: 'gb-p1',
        origin_country: 'United Kingdom',
        origin_country_id: 'c-gbr',
        is_cod_available: true,
        shipping_type: 'shippo',
        courier_partner: 'shippo',
        package_weight: 2,
        package_weight_unit_id: 'u-kg',
        package_length: 20,
        package_length_unit_id: 'u-cm',
        package_width: 15,
        package_width_unit_id: 'u-cm',
        package_height: 10,
        package_height_unit_id: 'u-cm',
        seller_id: 'seller-uk',
      },
    ]);

    setTable('seller_kyc', [
      { seller_id: 'seller-uk', business_postal_code: 'EC1A1BB' },
    ]);

    setTable('product_origin_destination_shipping_rates', [
      {
        product_origin_country_id: 'c-gbr',
        destination_country_id: 'c-gbr',
        weight_band_unit: 'KG',
        weight_band_from: 0,
        weight_band_to: 5,
        currency_code: 'GBP',
        standard_shipping_amount: 0,
        standard_est_delivery_date: '3-5 DAYS',
        express_shipping_amount: 8.92,
        express_est_delivery_date: 'NEXT DAY',
      },
    ]);

    const pricing = await calculateDestinationCheckoutPricing({
      items: [
        { productId: 'gb-p1', productName: 'UK Product', quantity: 1, unitPrice: 1000, currency: 'INR' },
      ],
      destinationCountry: 'United Kingdom',
      destinationPostalCode: 'SW1A1AA',
      rates: { INR: 83, USD: 1, GBP: 0.79 },
    });

    expect(pricing.currency).toBe('GBP');
    expect(pricing.shipping).toBe(0);
    expect(pricing.ukDomesticShippingOptions?.standard.shipping).toBe(0);
    expect(pricing.ukDomesticShippingOptions?.standard.etd).toBe('3-5 DAYS');
    expect(pricing.ukDomesticShippingOptions?.express?.shipping).toBe(8.92);
    expect(hoisted.mockFetchCalls.some((call) => call.url.includes('shippo-rate'))).toBe(false);
  });

  it('UK-to-UK above 5kg falls back to live Shippo rate when no table band matches', async () => {
    setTable('products', [
      {
        id: 'gb-p2',
        origin_country: 'United Kingdom',
        origin_country_id: 'c-gbr',
        is_cod_available: true,
        shipping_type: 'shippo',
        courier_partner: 'shippo',
        package_weight: 6,
        package_weight_unit_id: 'u-kg',
        package_length: 25,
        package_length_unit_id: 'u-cm',
        package_width: 20,
        package_width_unit_id: 'u-cm',
        package_height: 15,
        package_height_unit_id: 'u-cm',
        seller_id: 'seller-uk',
      },
    ]);

    setTable('seller_kyc', [
      { seller_id: 'seller-uk', business_postal_code: 'EC1A1BB' },
    ]);

    setTable('product_origin_destination_shipping_rates', [
      {
        product_origin_country_id: 'c-gbr',
        destination_country_id: 'c-gbr',
        weight_band_unit: 'KG',
        weight_band_from: 0,
        weight_band_to: 5,
        currency_code: 'GBP',
        standard_shipping_amount: 0,
        standard_est_delivery_date: '3-5 DAYS',
        express_shipping_amount: 8.92,
        express_est_delivery_date: 'NEXT DAY',
      },
    ]);

    hoisted.mockFetchRate = 6.72;

    const pricing = await calculateDestinationCheckoutPricing({
      items: [
        { productId: 'gb-p2', productName: 'UK Heavy Product', quantity: 1, unitPrice: 1000, currency: 'INR' },
      ],
      destinationCountry: 'United Kingdom',
      destinationPostalCode: 'SW1A1AA',
      rates: { INR: 83, USD: 1, GBP: 0.79 },
    });

    const shippoCalls = hoisted.mockFetchCalls.filter((call) => call.url.includes('shippo-rate'));
    expect(shippoCalls.length).toBe(1);
    expect(pricing.shipping).toBe(6.72);
    expect(pricing.ukDomesticShippingOptions?.standard.shipping).toBe(6.72);
  });

  it('applies India-to-UK minimum-order constraint with buyer-currency conversion', async () => {
    const rates = { INR: 83, USD: 1, GBP: 0.79 };
    const pricing = await calculateDestinationCheckoutPricing({
      items: [
        { productId: 'modern-p2', productName: 'Modern Product', quantity: 1, unitPrice: 2000, currency: 'INR' },
      ],
      destinationCountry: 'United Kingdom',
      destinationPostalCode: 'SW1A1AA',
      rates,
    });

    expect(pricing.currency).toBe('GBP');
    expect(pricing.minimumOrderConstraint).toBeTruthy();
    expect(pricing.minimumOrderConstraint?.code).toBe('INDIA_TO_UK_MIN_SUBTOTAL');
    expect(pricing.minimumOrderConstraint?.minimumInr).toBe(3200);
    expect(pricing.minimumOrderConstraint?.currentSubtotalInr).toBe(2000);
    expect(pricing.minimumOrderConstraint?.isMet).toBe(false);
    expect(pricing.minimumOrderConstraint?.minimumInCheckoutCurrency).toBeCloseTo(30.46, 2);
    expect(pricing.minimumOrderConstraint?.currentSubtotalInCheckoutCurrency).toBeCloseTo(19.04, 2);
  });

  it('India to Malta shipment: 550 INR x 6, 250gm item, uses POD table and satisfies 3200 INR minimum', async () => {
    setTable('products', [
      {
        id: 'modern-p2',
        origin_country: 'India',
        origin_country_id: 'c-ind',
        is_cod_available: true,
        shipping_type: 'shiprocket',
        courier_partner: 'shiprocket',
        package_weight: 250,
        package_weight_unit_id: 'u-g',
        package_length: 10,
        package_length_unit_id: 'u-cm',
        package_width: 10,
        package_width_unit_id: 'u-cm',
        package_height: 10,
        package_height_unit_id: 'u-cm',
        seller_id: 'seller-2',
      },
    ]);

    setTable('measurement_units', [
      { id: 'u-kg', code: 'KG', is_active: true },
      { id: 'u-g', code: 'G', is_active: true },
      { id: 'u-cm', code: 'CM', is_active: true },
    ]);

    setTable('product_origin_destination_shipping_rates', [
      {
        product_origin_country_id: 'c-ind',
        destination_country_id: 'c-mlt',
        weight_band_unit: 'KG',
        weight_band_from: 0,
        weight_band_to: 1,
        currency_code: 'INR',
        standard_shipping_amount: 0,
        standard_est_delivery_date: '11-15 DAYS',
        express_shipping_amount: 1912,
        express_est_delivery_date: '8-10 DAYS',
      },
      {
        product_origin_country_id: 'c-ind',
        destination_country_id: 'c-mlt',
        weight_band_unit: 'KG',
        weight_band_from: 1,
        weight_band_to: 2,
        currency_code: 'INR',
        standard_shipping_amount: 0,
        standard_est_delivery_date: '13-15 DAYS',
        express_shipping_amount: 4300,
        express_est_delivery_date: '8-10 DAYS',
      },
    ]);

    const pricing = await calculateDestinationCheckoutPricing({
      items: [
        { productId: 'modern-p2', productName: 'Modern Product', quantity: 6, unitPrice: 550, currency: 'INR' },
      ],
      destinationCountry: 'Malta',
      destinationPostalCode: 'VLT1111',
      rates: { INR: 83, USD: 1, EUR: 0.92 },
    });

    expect(pricing.destinationCountry).toBe('Malta');
    expect(pricing.currency).toBe('INR');
    expect(pricing.subtotal).toBe(3300);
    expect(pricing.shipping).toBe(0);
    expect(pricing.platformHandlingCharge).toBe(0);
    expect(pricing.total).toBe(3300);
    expect(pricing.minimumOrderConstraint?.minimumInr).toBe(3200);
    expect(pricing.minimumOrderConstraint?.currentSubtotalInr).toBe(3300);
    expect(pricing.minimumOrderConstraint?.isMet).toBe(true);
    expect(pricing.intlShippingOptions?.standard.etd).toBe('13-15 DAYS');
    expect(pricing.intlShippingOptions?.express?.shipping).toBe(4300);
    expect(hoisted.mockFetchCalls.length).toBe(0);
  });
});
