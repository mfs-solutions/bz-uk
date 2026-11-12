import { resolveVariantTheme } from '../config/variantThemeConfig';
import { fetchPublicProductPrices } from './pricingService';
import type { Product } from '../types';

type ProductVariantRow = Record<string, any>;

const COLOR_NAME_HEX_MAP: Record<string, string> = {
  black: '#000000',
  white: '#FFFFFF',
  red: '#DC2626',
  scarlet: '#DC2626',
  crimson: '#B91C1C',
  blue: '#2563EB',
  green: '#22C55E',
  yellow: '#EAB308',
  orange: '#F97316',
  pink: '#EC4899',
  purple: '#7C3AED',
  violet: '#8B5CF6',
  indigo: '#4F46E5',
  brown: '#8B5A2B',
  grey: '#6B7280',
  gray: '#6B7280',
  silver: '#94A3B8',
  gold: '#D4AF37',
  maroon: '#7F1D1D',
  navy: '#1E3A8A',
  olive: '#556B2F',
  teal: '#0D9488',
  cyan: '#0891B2',
  magenta: '#C026D3',
  fuchsia: '#D946EF',
  fuschia: '#D946EF',
  rose: '#F43F5E',
  plum: '#7E3A8F',
  wine: '#7F1D3F',
  burgundy: '#7F1D1D',
  coral: '#FB7185',
  peach: '#FDBA74',
  nude: '#C08457',
  mint: '#6EE7B7',
  lime: '#84CC16',
  beige: '#D6D3C6',
  cream: '#FFF7D6',
};

const BLACK_SHADE_HINTS = ['black', 'charcoal', 'onyx', 'noir', 'ebony', 'jet'];

const normalizeToken = (value: unknown) => String(value || '').trim().toLowerCase();

export const parseColorTokens = (rawColor: unknown): string[] => {
  const value = String(rawColor || '').trim();
  if (!value || value.toUpperCase() === 'DEFAULT') return [];
  return value
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean);
};

const inferColorHexFromName = (colorName: string): string | null => {
  const normalized = colorName.toLowerCase().trim();
  if (!normalized) return null;
  if (COLOR_NAME_HEX_MAP[normalized]) return COLOR_NAME_HEX_MAP[normalized];

  let bestMatch: { index: number; keyLength: number; hex: string } | null = null;
  for (const [key, mappedHex] of Object.entries(COLOR_NAME_HEX_MAP)) {
    const index = normalized.indexOf(key);
    if (index === -1) continue;
    if (!bestMatch || index < bestMatch.index || (index === bestMatch.index && key.length > bestMatch.keyLength)) {
      bestMatch = { index, keyLength: key.length, hex: mappedHex };
    }
  }

  return bestMatch?.hex || null;
};

export const resolveColorHex = (colorName: string, explicitHex?: string | null): string => {
  const normalizedName = colorName.toLowerCase().trim();
  const inferredHex = inferColorHexFromName(normalizedName);
  const hex = String(explicitHex || '').trim();
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex)) {
    const normalizedHex = hex.toLowerCase();
    const isBlackHex = normalizedHex === '#000' || normalizedHex === '#000000';
    const looksLikeBlackShade = BLACK_SHADE_HINTS.some((token) => normalizedName.includes(token));
    if (isBlackHex && !looksLikeBlackShade && inferredHex) return inferredHex;
    return hex;
  }
  if (inferredHex) return inferredHex;
  return '#9CA3AF';
};

export interface VariantSelectionState {
  variants: ProductVariantRow[];
  availableSizes: string[];
  availableColors: string[];
  colorHexByName: Map<string, string>;
  requiresSizeSelection: boolean;
  requiresColorSelection: boolean;
  preferredSize: string;
  preferredColor: string;
  currentVariant: ProductVariantRow | null;
  defaultVariant: ProductVariantRow | null;
  effectiveStock: number;
  inStock: boolean;
  hasSizeOptions: boolean;
  hasColorOptions: boolean;
  sizeLabel: string;
  colorLabel: string;
  shouldOpenSelector: boolean;
}

export interface VariantCartChoice {
  selectedSize: string | null;
  selectedColor: string | null;
  variant: ProductVariantRow | null;
}

export interface VariantPriceResolution {
  publicUnitPrice: number | null;
  markupMrp: number | null;
}

export function buildVariantSelectionState(
  product: Product | null | undefined,
  selection?: { selectedSize?: string | null; selectedColor?: string | null },
): VariantSelectionState {
  const variants = Array.isArray((product as any)?.product_variants)
    ? ((product as any).product_variants as ProductVariantRow[])
    : [];

  const sizeVariants = variants
    .filter((variant) => variant?.variant_type === 'size' || variant?.variant_type === 'combination')
    .map((variant) => String(variant?.size || variant?.size_value || '').trim())
    .filter((size) => Boolean(size) && size.toUpperCase() !== 'DEFAULT');

  const colorVariants = variants
    .filter((variant) => variant?.variant_type === 'color' || variant?.variant_type === 'combination')
    .flatMap((variant) => parseColorTokens(variant?.color));

  const availableSizes = Array.from(new Set(sizeVariants));
  const availableColors = Array.from(new Set(colorVariants));
  const requiresSizeSelection = availableSizes.length > 1;
  const requiresColorSelection = availableColors.length > 1;

  const firstInStockVariant = variants.find((variant) => Number(variant?.stock ?? 0) > 0) || null;
  const preferredSize = (() => {
    const candidate = String(firstInStockVariant?.size || firstInStockVariant?.size_value || '').trim();
    return candidate && availableSizes.includes(candidate) ? candidate : availableSizes[0] || '';
  })();
  const preferredColor = (() => {
    const candidate = parseColorTokens(firstInStockVariant?.color).find((token) => availableColors.includes(token));
    return candidate || availableColors[0] || '';
  })();

  const normalizedSelectedSize = normalizeToken(selection?.selectedSize);
  const normalizedSelectedColor = normalizeToken(selection?.selectedColor);
  const variantColorTokens = (variant: ProductVariantRow) => parseColorTokens(variant?.color).map((token) => token.toLowerCase());

  const currentVariant = (() => {
    const combinationMatch = variants.find((variant) => {
      if (variant?.variant_type !== 'combination') return false;
      const variantSize = normalizeToken(variant?.size);
      const variantSizeValue = normalizeToken(variant?.size_value);
      const colorTokens = variantColorTokens(variant);
      if (requiresSizeSelection && (!normalizedSelectedSize || (variantSize !== normalizedSelectedSize && variantSizeValue !== normalizedSelectedSize))) {
        return false;
      }
      if (requiresColorSelection && (!normalizedSelectedColor || !colorTokens.includes(normalizedSelectedColor))) {
        return false;
      }
      if (!requiresSizeSelection && normalizedSelectedSize && variantSize !== normalizedSelectedSize && variantSizeValue !== normalizedSelectedSize) {
        return false;
      }
      if (!requiresColorSelection && normalizedSelectedColor && colorTokens.length > 0 && !colorTokens.includes(normalizedSelectedColor)) {
        return false;
      }
      return true;
    });
    if (combinationMatch) return combinationMatch;

    if (!requiresSizeSelection && !requiresColorSelection) {
      const firstWithSku = variants.find((variant) => String(variant?.sku || '').trim().length > 0);
      if (firstWithSku) return firstWithSku;
      return variants[0] || null;
    }

    return null;
  })();

  const defaultVariant = currentVariant
    || variants.find((variant) => String(variant?.sku || '').trim().length > 0)
    || variants[0]
    || null;

  const optionKeys = new Set(
    variants.map((variant) => {
      const sizeKey = normalizeToken(variant?.size || variant?.size_value || '');
      const colorKey = variantColorTokens(variant).sort().join('|');
      return `${sizeKey}::${colorKey}`;
    }),
  );
  const hasDistinctChoices = availableSizes.length > 1 || availableColors.length > 1 || optionKeys.size > 1;
  const shouldOpenSelector = variants.length > 0 && hasDistinctChoices;

  const effectiveStock = currentVariant
    ? Number(currentVariant.stock ?? 0)
    : Number((product as any)?.stock ?? 0);

  const colorHexByName = new Map<string, string>();
  variants.forEach((variant) => {
    parseColorTokens(variant?.color).forEach((token) => {
      const key = token.toLowerCase();
      if (!colorHexByName.has(key)) {
        colorHexByName.set(key, resolveColorHex(token, variant?.color_hex));
      }
    });
  });

  const theme = resolveVariantTheme(
    String((product as any)?.product_type_slug || ''),
    String((product as any)?.sub_category_slug || ''),
    String((product as any)?.category_slug || ''),
  );

  return {
    variants,
    availableSizes,
    availableColors,
    colorHexByName,
    requiresSizeSelection,
    requiresColorSelection,
    preferredSize,
    preferredColor,
    currentVariant,
    defaultVariant,
    effectiveStock,
    inStock: effectiveStock > 0,
    hasSizeOptions: availableSizes.length > 0,
    hasColorOptions: availableColors.length > 0,
    sizeLabel: theme.sizeLabel || 'Size',
    colorLabel: theme.colorLabel || 'Color',
    shouldOpenSelector,
  };
}

export function resolveDirectCartVariantChoice(product: Product | null | undefined): VariantCartChoice {
  const seedState = buildVariantSelectionState(product, {});
  const selectedSize = seedState.hasSizeOptions ? seedState.preferredSize || null : null;
  const selectedColor = seedState.hasColorOptions ? seedState.preferredColor || null : null;
  const resolvedState = buildVariantSelectionState(product, { selectedSize, selectedColor });
  return {
    selectedSize,
    selectedColor,
    variant: resolvedState.currentVariant || resolvedState.defaultVariant || null,
  };
}

export async function resolveVariantPrice(
  product: Product,
  country: string | null | undefined,
  fallbackPublicUnitPrice?: number,
  variantPriceOverride?: number | null,
): Promise<VariantPriceResolution> {
  const fallback = Number.isFinite(Number(fallbackPublicUnitPrice))
    ? Number(fallbackPublicUnitPrice)
    : (Number.isFinite(Number(variantPriceOverride)) && Number(variantPriceOverride) > 0 ? Number(variantPriceOverride) : Number(product.price || 0));

  if (!country) {
    return {
      publicUnitPrice: fallback > 0 ? fallback : null,
      markupMrp: Number(product.mrp || 0) > 0 ? Number(product.mrp) : null,
    };
  }

  const overrides = Number.isFinite(Number(variantPriceOverride)) && Number(variantPriceOverride) > 0
    ? { [product.id]: Number(variantPriceOverride) }
    : undefined;

  const { data } = await fetchPublicProductPrices([product.id], country, overrides);
  const hit = data[0];
  if (!hit) {
    return {
      publicUnitPrice: fallback > 0 ? fallback : null,
      markupMrp: Number(product.mrp || 0) > 0 ? Number(product.mrp) : null,
    };
  }

  return {
    publicUnitPrice: Number.isFinite(hit.publicUnitPrice) && hit.publicUnitPrice > 0 ? hit.publicUnitPrice : (fallback > 0 ? fallback : null),
    markupMrp: Number.isFinite(hit.markupMrp) && hit.markupMrp > 0 ? hit.markupMrp : (Number(product.mrp || 0) > 0 ? Number(product.mrp) : null),
  };
}