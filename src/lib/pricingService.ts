import { cachedQuery, QUERY_TTL } from './queryCache.ts';
import { supabase } from './supabase.ts';

export interface PublicProductPrice {
  productId: string;
  sellingPrice: number;
  publicUnitPrice: number;
  markupMrp: number;
}

export interface VariantPriceRequest {
  key: string;
  productId: string;
  variantId?: string | null;
  variantSku?: string | null;
  selectedSize?: string | null;
  selectedColor?: string | null;
}

export interface VerifiedVariantPrice {
  productId: string;
  variantId: string;
  variantSku: string;
  sellingPrice: number;
  markupMrp: number;
}

export interface CheckoutPricingItem {
  productId: string;
  quantity: number;
  sellingPrice: number;
  publicUnitPrice: number;
  lineTotal: number;
}

export interface CheckoutIneligibleItem {
  productId: string;
  availableCountries: string[];
}

export interface CheckoutPricingResult {
  baseSubtotal: number;
  buyerProductSubtotal: number;
  platformHandlingCharge: number;
  shipping: number;
  total: number;
  items: CheckoutPricingItem[];
  ineligibleItems: CheckoutIneligibleItem[];
}

const toNumber = (value: unknown): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const normalizeVariantValue = (value?: string | null) => String(value || '').trim().toLowerCase();

export async function fetchVerifiedVariantPrices(
  requests: VariantPriceRequest[],
  country?: string | null,
  fresh = false,
): Promise<{ data: Record<string, VerifiedVariantPrice>; error: string | null }> {
  const validRequests = requests.filter((request) => request.key && request.productId);
  if (validRequests.length === 0) {
    return { data: {}, error: null };
  }

  const productIds = Array.from(new Set(validRequests.map((request) => request.productId)));
  const { data: variantRows, error: variantQueryError } = await supabase
    .from('product_variants')
    .select('id, product_id, sku, price, size, color')
    .in('product_id', productIds);

  if (variantQueryError) {
    return { data: {}, error: `Unable to verify selected product variants: ${variantQueryError.message}` };
  }

  const variantsByProduct = new Map<string, Array<Record<string, unknown>>>();
  (variantRows || []).forEach((row: Record<string, unknown>) => {
    const productId = String(row.product_id || '');
    if (!productId) return;
    const rows = variantsByProduct.get(productId) || [];
    rows.push(row);
    variantsByProduct.set(productId, rows);
  });

  const selectedVariants: Array<{ key: string; productId: string; row: Record<string, unknown> }> = [];
  for (const request of validRequests) {
    const variants = variantsByProduct.get(request.productId) || [];
    const variantId = String(request.variantId || '').trim();
    const variantSku = String(request.variantSku || '').trim();
    const selectedSize = normalizeVariantValue(request.selectedSize);
    const selectedColor = normalizeVariantValue(request.selectedColor);
    const hasSelection = Boolean(variantId || variantSku || selectedSize || selectedColor);

    if (variants.length === 0) {
      if (hasSelection) {
        return { data: {}, error: 'A selected product variant is no longer available. Return to your cart and select it again.' };
      }
      continue;
    }

    if (!hasSelection) {
      return { data: {}, error: 'A product variant must be selected before checkout. Return to your cart and select an available variant.' };
    }

    const matches = variants.filter((row) => {
      if (variantId && String(row.id || '') !== variantId) return false;
      if (variantSku && String(row.sku || '').trim().toLowerCase() !== variantSku.toLowerCase()) return false;
      if (
        selectedSize
        && normalizeVariantValue(String(row.size || '')) !== selectedSize
        && normalizeVariantValue(String(row.size_value || '')) !== selectedSize
      ) return false;
      if (selectedColor && normalizeVariantValue(String(row.color || '')) !== selectedColor) return false;
      return true;
    });

    if (matches.length !== 1) {
      return {
        data: {},
        error: matches.length === 0
          ? 'The selected product variant is unavailable or has changed. Return to your cart and select it again.'
          : 'The selected product variant cannot be uniquely verified. Return to your cart and select it again.',
      };
    }

    const row = matches[0];
    const id = String(row.id || '').trim();
    const sku = String(row.sku || '').trim();
    const basePrice = Number(row.price);
    if (!id || !sku || !Number.isFinite(basePrice) || basePrice <= 0) {
      return { data: {}, error: 'The selected product variant has incomplete pricing information. Please contact support.' };
    }
    selectedVariants.push({ key: request.key, productId: request.productId, row });
  }

  const pricesByKey: Record<string, VerifiedVariantPrice> = {};
  for (const variant of selectedVariants) {
    const basePrice = Number(variant.row.price);
    const fetchPrices = fresh ? fetchPublicProductPricesUncached : fetchPublicProductPrices;
    const { data, error } = await fetchPrices(
      [variant.productId],
      country,
      { [variant.productId]: basePrice },
    );
    if (error) {
      return { data: {}, error: `Unable to verify the selected variant price: ${error}` };
    }
    const priceRow = data.find((row) => row.productId === variant.productId);
    if (!priceRow || !Number.isFinite(priceRow.publicUnitPrice) || priceRow.publicUnitPrice <= 0) {
      return { data: {}, error: 'The selected product variant could not be priced. Return to your cart and try again.' };
    }

    pricesByKey[variant.key] = {
      productId: variant.productId,
      variantId: String(variant.row.id),
      variantSku: String(variant.row.sku).trim(),
      sellingPrice: priceRow.sellingPrice,
      markupMrp: priceRow.markupMrp,
    };
  }

  return { data: pricesByKey, error: null };
}

export function fetchPublicProductPrices(
  productIds: string[],
  country?: string | null,
  priceOverrides?: Record<string, number>,
) {
  const ids = Array.from(new Set(productIds.filter(Boolean))).sort();
  const overrides = priceOverrides
    ? Object.entries(priceOverrides).sort(([a], [b]) => a.localeCompare(b))
    : [];
  const key = `prices:${(country || '').trim().toUpperCase()}:${ids.join(',')}:${JSON.stringify(overrides)}`;
  return cachedQuery(
    key,
    QUERY_TTL.prices,
    () => fetchPublicProductPricesUncached(productIds, country, priceOverrides),
    (result) => !result.error,
  );
}

async function fetchPublicProductPricesUncached(
  productIds: string[],
  country?: string | null,
  priceOverrides?: Record<string, number>,
) {
  const uniqueProductIds = Array.from(new Set(productIds.filter(Boolean)));
  if (uniqueProductIds.length === 0) {
    return { data: [] as PublicProductPrice[], error: null as string | null };
  }

  const hasOverrides = Boolean(
    priceOverrides
    && Object.keys(priceOverrides).length > 0
    && Object.values(priceOverrides).some((value) => Number.isFinite(Number(value)) && Number(value) > 0)
  );

  const rpcName = hasOverrides
    ? 'get_public_product_prices_with_overrides'
    : 'get_public_product_prices';

  const rpcPayload: Record<string, unknown> = {
    p_product_ids: uniqueProductIds,
    p_country: country || null,
  };

  if (hasOverrides) {
    rpcPayload.p_price_overrides = priceOverrides;
  }

  const { data, error } = await supabase.rpc(rpcName, rpcPayload);

  if (error) {
    const message = error.message || 'Failed to fetch public product prices.';
    return { data: [] as PublicProductPrice[], error: message };
  }

  const parsed = ((data || []) as any[]).map((row) => ({
    productId: String(row.product_id),
    sellingPrice: toNumber(row.selling_price),
    publicUnitPrice: toNumber(row.selling_price),
    markupMrp: toNumber(row.markup_mrp),
  }));

  return { data: parsed, error: null as string | null };
}

export async function calculateCheckoutPricing(items: Array<{ productId: string; quantity: number }>, country?: string | null) {
  const payload = items
    .filter((item) => item.productId && item.quantity > 0)
    .map((item) => ({
      product_id: item.productId,
      quantity: item.quantity,
    }));

  if (payload.length === 0) {
    return {
      data: {
        baseSubtotal: 0,
        buyerProductSubtotal: 0,
        platformHandlingCharge: 0,
        shipping: 0,
        total: 0,
        items: [],
        ineligibleItems: [],
      } as CheckoutPricingResult,
      error: null as string | null,
    };
  }

  const { data, error } = await supabase.rpc('calculate_checkout_pricing', {
    p_items: payload,
    p_country: country || null,
  });

  if (error) {
    return { data: null as CheckoutPricingResult | null, error: error.message || 'Failed to calculate checkout pricing.' };
  }

  const raw = data as any;
  const baseSubtotal = toNumber(raw?.base_subtotal);
  const platformHandlingCharge = toNumber(raw?.platform_commission_charge ?? raw?.platform_handling_charge);
  const shipping = toNumber(raw?.shipping);
  const parsed: CheckoutPricingResult = {
    baseSubtotal,
    buyerProductSubtotal: baseSubtotal,
    platformHandlingCharge,
    shipping,
    total: baseSubtotal + platformHandlingCharge + shipping,
    items: ((raw?.items || []) as any[]).map((item) => ({
      productId: String(item.product_id),
      quantity: toNumber(item.quantity),
      sellingPrice: toNumber(item.selling_price),
      publicUnitPrice: toNumber(item.selling_price),
      lineTotal: toNumber(item.selling_price) * toNumber(item.quantity),
    })),
    ineligibleItems: ((raw?.ineligible_items || []) as any[]).map((item) => ({
      productId: String(item.product_id || ''),
      availableCountries: Array.isArray(item.available_countries)
        ? item.available_countries.map((country: unknown) => String(country || '').trim()).filter(Boolean)
        : [],
    })),
  };

  return { data: parsed, error: null as string | null };
}
