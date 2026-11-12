import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Star, ShoppingCart,
  CreditCard, ChevronLeft, ChevronRight,
  Info, X,
  ArrowLeft, Loader2, Ruler, Share2,
  Shield, RotateCcw, Package, CheckCircle2, XCircle, ChevronUp
} from 'lucide-react';
import { resolveVariantTheme } from '../config/variantThemeConfig';
import type { SizeChart } from '../config/variantThemeConfig';
import { useVariantPresetsVersion } from '../lib/variantSizePresetsService';
import { DetailSkeleton } from '../components/common/Skeleton';
import { Header } from '../components/layout/Header';
import { Footer } from '../components/layout/Footer';
import { MobileNav } from '../components/layout/MobileNav';
import { DeliveryEstimate } from '../components/products/DeliveryEstimate';
import { ProductImageLightbox } from '../components/products/ProductImageLightbox';
import { fetchProductById, fetchProductReviews, fetchSimilarProducts, resolveProductImageUrl, fetchConditionDetails, fetchReturnPolicy } from '../lib/productService';
import type { ProductConditionDetails, ProductReturnPolicy } from '../types';
import { useCart } from '../contexts/CartContext';
import { useCurrency } from '../contexts/CurrencyContext';
import { useAuth } from '../contexts/AuthContext';
import { fetchPublicProductPrices } from '../lib/pricingService';
import { useDestinationCountry } from '../hooks/useDestinationCountry';
import { useDeliveryEstimate } from '../hooks/useDeliveryEstimate';
import { supabase } from '../lib/supabase';
import { flyToCart, getCartTarget } from '../utils/flyToCart';
import { buildAppRedirect } from '../utils/authEnv';
import { shareProduct } from '../utils/shareProduct';

interface ReviewItem {
  id: string;
  reviewerName: string;
  rating: number;
  heading: string;
  text: string;
  date: string;
  images: string[];
}

interface SimilarProduct {
  id: string;
  name: string;
  image_url: string;
  brand: string;
  price: number;
  currency: string;
  rating: number;
  discount_price: number | null;
}

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

const parseColorTokens = (rawColor: unknown): string[] => {
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

const resolveColorHex = (colorName: string, explicitHex?: string | null): string => {
  const normalizedName = colorName.toLowerCase().trim();
  const inferredHex = inferColorHexFromName(normalizedName);

  const hex = String(explicitHex || '').trim();
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex)) {
    const normalizedHex = hex.toLowerCase();
    const isBlackHex = normalizedHex === '#000' || normalizedHex === '#000000';
    const looksLikeBlackShade = BLACK_SHADE_HINTS.some((token) => normalizedName.includes(token));

    // Some seller records store #000000 as a placeholder for all shades.
    // If the color name clearly indicates a different shade, trust the name.
    if (isBlackHex && !looksLikeBlackShade && inferredHex) {
      return inferredHex;
    }

    return hex;
  }

  if (inferredHex) return inferredHex;

  return '#9CA3AF';
};

const ProductDetailsPage: React.FC = () => {
  const { productId } = useParams();
  const navigate = useNavigate();
  const { addToCart } = useCart();
  const { convertPrice, formatPrice } = useCurrency();
  const { user, currentAuthUser } = useAuth();

  const [product, setProduct] = useState<any>(null);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [similarProducts, setSimilarProducts] = useState<SimilarProduct[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeImage, setActiveImage] = useState(0);
  const [selectedSize, setSelectedSize] = useState('');
  const [selectedColor, setSelectedColor] = useState('');
  const [isOffersModalOpen, setIsOffersModalOpen] = useState(false);
  const [nowTs] = useState(() => Date.now());
  const [publicPriceMap, setPublicPriceMap] = useState<Record<string, number>>({});
  const [publicMrpMap, setPublicMrpMap] = useState<Record<string, number>>({});
  const [publicPriceLoading, setPublicPriceLoading] = useState(false);
  const [isSizeGuideOpen, setIsSizeGuideOpen] = useState(false);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const gallerySwipedRef = useRef(false);
  const [addingToCart, setAddingToCart] = useState(false);
  const [cartAddedToast, setCartAddedToast] = useState(false);
  const productImageRef = useRef<HTMLImageElement>(null);
  const galleryTouchStartX = useRef<number | null>(null);
  const [shareCopiedToast, setShareCopiedToast] = useState(false);
  const [conditionDetails, setConditionDetails] = useState<ProductConditionDetails | null>(null);
  const [returnPolicy, setReturnPolicy] = useState<ProductReturnPolicy | null>(null);
  const [activeDetailTab, setActiveDetailTab] = useState<'details' | 'specifications' | 'reviews'>('details');
  const detailTabPanelRef = useRef<HTMLDivElement>(null);
  // Re-render the size guide once DB-driven size presets load/override defaults.
  useVariantPresetsVersion();

  // Compute weight in kg for delivery estimate hook
  const productWeightKg = (() => {
    const w = Number(product?.package_weight);
    if (!w || w <= 0) return undefined;
    const unit = String((product as any)?._weightUnitCode || 'KG').toUpperCase();
    if (unit === 'G') return w / 1000;
    if (unit === 'LB') return w * 0.453592;
    if (unit === 'OZ') return w * 0.0283495;
    return w; // KG
  })();

  const delivery = useDeliveryEstimate(
    productId,
    user?.id || (currentAuthUser as any)?.userId || undefined,
    product?.origin_country,
    product ? Boolean(product.ships_internationally) : undefined,
    product?.seller_id ? String(product.seller_id) : undefined,
    productWeightKg,
  );

  useEffect(() => {
    if (!productId) return;
    setLoading(true);
    
    fetchProductById(productId).then(async ({ data }) => {
      if (data) {
        setProduct(data);
        if (data.slug && data.slug !== productId) {
          navigate(`/products/${data.slug}`, { replace: true });
        }
        const [reviewResponse, similarResponse, weightUnitResponse] = await Promise.all([
          fetchProductReviews(data.id),
          fetchSimilarProducts(data.category, data.id, 8, {
            subCategory: data.sub_category,
            productType: data.product_type,
          }),
          data.package_weight_unit_id
            ? supabase.from('measurement_units').select('code, name').eq('id', data.package_weight_unit_id).maybeSingle()
            : Promise.resolve({ data: null } as any),
        ]);

        const revData = reviewResponse?.data || [];
        setReviews((revData || []).map((r: any) => ({
          id: r.id,
          reviewerName: r.profiles?.full_name || 'Anonymous',
          rating: r.rating,
          heading: r.heading || '',
          text: r.comment || '',
          date: new Date(r.created_at).toLocaleDateString(),
          images: r.images || [],
        })));

        const simData = similarResponse?.data || [];
        setSimilarProducts(simData as SimilarProduct[]);

        // Store weight unit info on the product object for display
        const weightUnit = weightUnitResponse?.data;
        if (weightUnit) {
          data._weightUnitCode = String(weightUnit.code || 'KG').toUpperCase();
          data._weightUnitName = String(weightUnit.name || '');
        }

        // Fetch condition details & return policy for used/refurbished products
        const condition = String(data.item_condition || 'brand_new');
        if (condition !== 'brand_new') {
          const [cdRes, rpRes] = await Promise.all([
            fetchConditionDetails(data.id),
            fetchReturnPolicy(data.id),
          ]);
          if (cdRes.data) setConditionDetails(cdRes.data as ProductConditionDetails);
          if (rpRes.data) setReturnPolicy(rpRes.data as ProductReturnPolicy);
        } else {
          setConditionDetails(null);
          setReturnPolicy(null);
        }
      }
      setLoading(false);
    });
  }, [productId, navigate]);

  const selectedCountry = useDestinationCountry({
    userId: user?.id || currentAuthUser?.userId || null,
    userCountry: user?.country || '',
  });

  useEffect(() => {
    const loadPublicPrices = async () => {
      if (!selectedCountry) {
        setPublicPriceMap({});
        setPublicMrpMap({});
        setPublicPriceLoading(true);
        return;
      }

      const ids = Array.from(new Set([
        product?.id,
        ...similarProducts.map((item) => item.id),
      ].filter(Boolean) as string[]));

      if (ids.length === 0) {
        setPublicPriceMap({});
        setPublicMrpMap({});
        setPublicPriceLoading(false);
        return;
      }

      let priceOverrides: Record<string, number> | undefined;
      if (product?.id) {
        const variants = Array.isArray(product.product_variants) ? product.product_variants : [];
        const normSize = String(selectedSize || '').trim().toLowerCase();
        const normColor = String(selectedColor || '').trim().toLowerCase();

        if (normSize || normColor) {
          const selectedVariant = variants.find((v: any) => {
            if (v?.variant_type !== 'combination' && v?.variant_type !== 'size' && v?.variant_type !== 'color') return false;
            // Match against both `size` (e.g. "473 ML") and `size_value` (e.g. "473")
            // because the size buttons display `size` while DB rows may use either.
            const vSizeFull = String(v?.size || '').trim().toLowerCase();
            const vSizeVal = String(v?.size_value || '').trim().toLowerCase();
            const vColor = String(v?.color || '').trim().toLowerCase();
            if (normSize && vSizeFull !== normSize && vSizeVal !== normSize) return false;
            if (normColor && vColor !== normColor && vColor !== 'default') return false;
            return true;
          });

          const selectedVariantPrice = Number(selectedVariant?.price || 0);
          if (selectedVariantPrice > 0) {
            priceOverrides = { [product.id]: selectedVariantPrice };
          }
        }
      }

      setPublicPriceLoading(true);
      const { data } = await fetchPublicProductPrices(ids, selectedCountry, priceOverrides);
      const map: Record<string, number> = {};
      const mrpMap: Record<string, number> = {};
      (data || []).forEach((entry) => {
        map[entry.productId] = entry.publicUnitPrice;
        if (entry.markupMrp > 0) mrpMap[entry.productId] = entry.markupMrp;
      });
      setPublicPriceMap(map);
      setPublicMrpMap(mrpMap);
      setPublicPriceLoading(false);
    };

    void loadPublicPrices();
  }, [product?.id, product?.product_variants, similarProducts, selectedCountry, selectedSize, selectedColor]);

  const sizeVariants: string[] = (product?.product_variants || [])
    .filter((v: any) => v.variant_type === 'size' || v.variant_type === 'combination')
    .map((v: any) => (v.size || v.size_value || '').toString().trim())
    .filter((s: string) => Boolean(s) && s.toUpperCase() !== 'DEFAULT');

  const colorVariants: string[] = (product?.product_variants || [])
    .filter((v: any) => v.variant_type === 'color' || v.variant_type === 'combination')
    .flatMap((v: any) => parseColorTokens(v.color));

  const availableSizes: string[] = Array.from(new Set<string>(sizeVariants));
  const availableColors: string[] = Array.from(new Set<string>(colorVariants));
  const colorHexByName = new Map<string, string>();
  (product?.product_variants || []).forEach((variant: any) => {
    const tokens = parseColorTokens(variant?.color);
    if (tokens.length === 0) return;
    tokens.forEach((token) => {
      const key = token.toLowerCase();
      if (colorHexByName.has(key)) return;
      colorHexByName.set(key, resolveColorHex(token, variant?.color_hex));
    });
  });

  const requiresSizeSelection = availableSizes.length > 1;
  const requiresColorSelection = availableColors.length > 1;

  // Prefer the first IN-STOCK variant for default selection, so a product that
  // has stock never defaults to a sold-out colour/size (which would otherwise
  // render the page as "Out Of Stock" right after listing/approval).
  const firstInStockVariant = (product?.product_variants || []).find(
    (v: any) => Number(v?.stock ?? 0) > 0
  );
  const preferredSize: string = (() => {
    const s = (firstInStockVariant?.size || firstInStockVariant?.size_value || '').toString().trim();
    return s && availableSizes.includes(s) ? s : availableSizes[0];
  })();
  const preferredColor: string = (() => {
    const match = parseColorTokens(firstInStockVariant?.color).find((t) => availableColors.includes(t));
    return match || availableColors[0];
  })();

  useEffect(() => {
    if (availableSizes.length >= 1 && !selectedSize) {
      setSelectedSize(preferredSize);
      return;
    }

    if (availableSizes.length > 1 && selectedSize && !availableSizes.includes(selectedSize)) {
      setSelectedSize('');
    }
  }, [availableSizes, selectedSize, preferredSize]);

  useEffect(() => {
    if (availableColors.length >= 1 && !selectedColor) {
      setSelectedColor(preferredColor);
      return;
    }

    if (availableColors.length > 1 && selectedColor && !availableColors.includes(selectedColor)) {
      setSelectedColor('');
    }
  }, [availableColors, selectedColor, preferredColor]);

  // Reset gallery position when variant selection changes
  useEffect(() => {
    setActiveImage(0);
  }, [selectedSize, selectedColor]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white text-gray-900 pb-16 md:pb-0">
        <Header />
        <div className="max-w-6xl mx-auto px-4 py-8">
          <DetailSkeleton />
        </div>
        <div className="hidden md:block">
          <Footer />
        </div>
        <MobileNav />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-white text-gray-900 pb-16 md:pb-0">
        <Header />
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-amber-600 hover:text-amber-600-light transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="text-sm font-medium">Back</span>
          </button>
          <div className="mt-10 bg-gray-50 border border-gray-200 rounded-2xl p-8 text-center">
            <h1 className="text-2xl font-semibold mb-3">Product not found</h1>
            <p className="text-gray-500 text-sm">Please return to the catalog and try another item.</p>
          </div>
        </div>
        <div className="hidden md:block">
          <Footer />
        </div>
        <MobileNav />
      </div>
    );
  }

  // Resolve the currently selected variant (if any).
  // Primary path: match a "combination" variant by selected size/color.
  // Fallback: when no size/color picker is shown (variants exist but lack
  // size/color metadata), pick the first variant with a non-empty SKU so
  // the cart records the real variant SKU instead of the parent product SKU.
  const currentVariant = (() => {
    const variants = Array.isArray(product?.product_variants) ? product.product_variants : [];
    const normSize = String(selectedSize || '').trim().toLowerCase();
    const normColor = String(selectedColor || '').trim().toLowerCase();

    const variantColorTokens = (v: any) =>
      parseColorTokens(v?.color).map((t) => t.toLowerCase());

    const combinationMatch = variants.find((v: any) => {
      if (v?.variant_type !== 'combination') return false;
      // The size buttons are labelled from `v.size` first (see availableSizes),
      // but a row may carry both `size` ("10-11 years CM") and `size_value`
      // ("10-11 years"). Match the selection against BOTH fields — identical to
      // the price-override matcher above — otherwise rows whose `size` has a
      // unit suffix never match and the variant image/stock/SKU silently breaks.
      const vSizeFull = String(v?.size || '').trim().toLowerCase();
      const vSizeVal = String(v?.size_value || '').trim().toLowerCase();
      const vTokens = variantColorTokens(v);
      if (requiresSizeSelection && vSizeFull !== normSize && vSizeVal !== normSize) return false;
      if (requiresColorSelection && !vTokens.includes(normColor)) return false;
      return true;
    });
    if (combinationMatch) return combinationMatch;

    // No combination matched. If the UI isn't asking the user to pick a
    // size/color (because the variants have no such metadata), fall back to
    // the first variant carrying a real SKU. This prevents the cart from
    // defaulting to the parent product's SKU and writing a wrong SKU into
    // order_items.variant_info.sku.
    if (!requiresSizeSelection && !requiresColorSelection) {
      const firstWithSku = variants.find((v: any) => String(v?.sku || '').trim().length > 0);
      if (firstWithSku) return firstWithSku;
    }

    return null;
  })();

  // Variant-aware stock
  const effectiveStock = currentVariant ? Number(currentVariant.stock ?? 0) : Number(product.stock ?? 0);
  const inStock = effectiveStock > 0;

  const publicUnitPrice = typeof publicPriceMap[product.id] === 'number'
    ? publicPriceMap[product.id]
    : (typeof currentVariant?.price === 'number' ? Number(currentVariant.price) : product.price);
  const publicPriceSourceCurrency = (product.currency || 'INR').toUpperCase();
  const effectiveMrp = publicMrpMap[product.id] ?? product.mrp;
  const convertedPrice = publicUnitPrice != null
    ? convertPrice(publicUnitPrice, publicPriceSourceCurrency)
    : null;
  const originalPrice = publicUnitPrice != null && effectiveMrp && effectiveMrp > publicUnitPrice
    ? convertPrice(effectiveMrp, publicPriceSourceCurrency)
    : convertedPrice;
  const discountPercent = publicUnitPrice != null && effectiveMrp && effectiveMrp > publicUnitPrice
    ? Math.round(((effectiveMrp - publicUnitPrice) / effectiveMrp) * 100)
    : 0;

  const getStockStatus = () => {
    if (!inStock) return { label: 'Out Of Stock', color: 'text-red-500' };
    if (effectiveStock < 10) return { label: 'Limited Stock', color: 'text-blue-500' };
    return { label: 'In Stock', color: 'text-green-500' };
  };

  const stockStatus = getStockStatus();



  const allOffers = Array.isArray(product.offer_rules) ? product.offer_rules : [];
  const activeOffers = allOffers.filter((offer: any) => {
    if (offer?.is_active === false) return false;
    const startTs = offer?.start_time ? new Date(offer.start_time).getTime() : null;
    const endTs = offer?.end_time ? new Date(offer.end_time).getTime() : null;
    if (startTs && nowTs < startTs) return false;
    if (endTs && nowTs > endTs) return false;
    return true;
  });

  const formatOfferTitle = (offerType: string) => {
    if (offerType === 'buy_x_get_y') return 'Buy X Get Y';
    if (offerType === 'bundle_discount') return 'Bundle Discount';
    if (offerType === 'special_day') return 'Special Day';
    return (offerType || 'Offer').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  };

  const formatOfferDisplayTitle = (offer: any) => {
    if (offer?.offer_type === 'special_day' && offer?.special_day_name) {
      return `${offer.special_day_name} Offer`;
    }
    return formatOfferTitle(offer?.offer_type || '');
  };

  const formatOfferSummary = (offer: any) => {
    if (offer?.discount_percent != null) return `${offer.discount_percent}% OFF`;
    if (offer?.offer_type === 'buy_x_get_y' && offer?.buy_quantity && offer?.get_quantity) {
      return `Buy ${offer.buy_quantity} Get ${offer.get_quantity}`;
    }
    if (offer?.offer_type === 'bundle_discount' && offer?.bundle_min_qty && offer?.bundle_discount != null) {
      return `${offer.bundle_discount}% OFF on ${offer.bundle_min_qty}+ items`;
    }
    return formatOfferTitle(offer?.offer_type || '');
  };

  // Format weight with proper unit conversion
  const formatWeight = () => {
    const weight = Number(product.package_weight);
    if (!weight || weight <= 0) return null;
    const unitCode = String(product._weightUnitCode || 'KG').toUpperCase();
    if (unitCode === 'G') return weight >= 1000 ? `${(weight / 1000).toFixed(2).replace(/\.?0+$/, '')} kg` : `${weight} g`;
    if (unitCode === 'LB') return `${weight} lb`;
    if (unitCode === 'OZ') return `${weight} oz`;
    // KG is default
    return `${weight} kg`;
  };
  const formattedWeight = formatWeight();

  const packageSummary = [
    formattedWeight,
    (product.package_length || product.package_width || product.package_height)
      ? `${product.package_length || 0} × ${product.package_width || 0} × ${product.package_height || 0} cm`
      : null,
  ].filter(Boolean).join(' | ');

  const hasSizeOptions = availableSizes.length > 0;
  const hasColorOptions = availableColors.length > 0;
  const hasOfferSection = activeOffers.length > 0;

  const highlightItems: string[] = Array.isArray(product?.highlights)
    ? product.highlights
        .map((item: unknown) => String(item || '').trim())
        .filter(Boolean)
    : [];

  const detailPoints: string[] = (() => {
    const description = String(product.description || '').trim();
    if (!description) return [];

    const parsedDescriptionPoints = description
      .split(/\r?\n|•/)
      .map((segment) => segment.replace(/^[-*\s]+/, '').trim())
      .filter(Boolean);

    if (parsedDescriptionPoints.length > 1) return parsedDescriptionPoints;
    return [description];
  })();

  const specificationRows = (() => {
    const specs = product?.specifications;
    if (!specs || typeof specs !== 'object' || Array.isArray(specs)) return [] as Array<{ key: string; value: string }>;
    return Object.entries(specs as Record<string, unknown>)
      .map(([key, value]) => ({ key: String(key || '').trim(), value: String(value ?? '').trim() }))
      .filter((row) => row.key && row.value);
  })();

  const ingredientItems = String(product?.ingredients || '')
    .split(/\r?\n|,/) 
    .map((item) => item.trim())
    .filter(Boolean);

  const ingredientRows: Array<[string, string]> = [];
  for (let i = 0; i < ingredientItems.length; i += 2) {
    ingredientRows.push([ingredientItems[i], ingredientItems[i + 1] || '']);
  }

  const directionLines = String(product?.directions || '')
    .split(/\r?\n/) 
    .map((line) => line.trim())
    .filter(Boolean);

  const averageRating = product.rating > 0
    ? Number(product.rating)
    : (reviews.length > 0 ? Number((reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)) : 0);

  const renderCommonBenefitsStrip = (className = 'mt-4') => (
    <div className={`${className} border border-gray-300 rounded-md bg-[#f7f8f8] px-3 py-3.5 min-h-[96px]`}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 md:gap-0">
        <div className="flex items-center gap-2.5 px-2 py-2 md:border-r border-gray-300">
          <div className="w-7 h-7 rounded-full bg-white border border-gray-300 flex items-center justify-center text-[#7b5a00]"><Package size={13} /></div>
          <div>
            <p className="text-[12px] text-[#111111] font-semibold font-[Arial,sans-serif] leading-4">Free Shipping</p>
            <p className="text-[10px] text-[#666666] font-[Arial,sans-serif] leading-4">Free shipping for order above $100</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 px-2 py-2 md:border-r border-gray-300">
          <div className="w-7 h-7 rounded-full bg-white border border-gray-300 flex items-center justify-center text-[#7b5a00]"><CreditCard size={13} /></div>
          <div>
            <p className="text-[12px] text-[#111111] font-semibold font-[Arial,sans-serif] leading-4">Flexible Payment</p>
            <p className="text-[10px] text-[#666666] font-[Arial,sans-serif] leading-4">Multiple secure payment options</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 px-2 py-2">
          <div className="w-7 h-7 rounded-full bg-white border border-gray-300 flex items-center justify-center text-[#7b5a00]"><Shield size={13} /></div>
          <div>
            <p className="text-[12px] text-[#111111] font-semibold font-[Arial,sans-serif] leading-4">24x7 Support</p>
            <p className="text-[10px] text-[#666666] font-[Arial,sans-serif] leading-4">We support online all days</p>
          </div>
        </div>
      </div>
    </div>
  );

  // Use variant images if available, else product-level images.
  // Fallback: if the matched (size,color) row has no images, look for ANY
  // variant row whose color tokens include the selected color and carries
  // images — sellers commonly attach photos to one row per color, not to
  // every (size×color) combination.
  const currentVariantImages = currentVariant && Array.isArray(currentVariant.images) && currentVariant.images.length > 0
    ? currentVariant.images
    : null;

  const colorOnlyImages = (() => {
    if (currentVariantImages) return null;
    if (!selectedColor) return null;
    const variants = Array.isArray(product?.product_variants) ? product.product_variants : [];
    const normColor = selectedColor.trim().toLowerCase();
    const hit = variants.find((v: any) => {
      const tokens = parseColorTokens(v?.color).map((t) => t.toLowerCase());
      if (!tokens.includes(normColor)) return false;
      return Array.isArray(v?.images) && v.images.length > 0;
    });
    return hit ? hit.images : null;
  })();

  const variantImages = currentVariantImages || colorOnlyImages;

  const galleryImages: string[] = (() => {
    const resolve = (u: unknown): string =>
      typeof u === 'string' && u.trim() ? resolveProductImageUrl(u as string) : '';

    // Product-level images are the canonical gallery (min 5 enforced at listing).
    const productImgs = (Array.isArray(product.images) ? product.images : [])
      .map(resolve)
      .filter(Boolean);

    // Variant-specific images (optional) lead the gallery so the selected
    // colour/size photo appears first, but they NEVER replace the product images.
    const variantImgs = (Array.isArray(variantImages) ? variantImages : [])
      .map(resolve)
      .filter(Boolean);

    const deduped = Array.from(new Set([...variantImgs, ...productImgs]));
    if (deduped.length > 0) return deduped;

    const resolvedPrimary = resolveProductImageUrl(product.image_url);
    return resolvedPrimary ? [resolvedPrimary] : [];
  })();

  const validateVariantSelection = () => {
    if (requiresSizeSelection && !selectedSize) {
      return false;
    }
    if (requiresColorSelection && !selectedColor) {
      return false;
    }
    return true;
  };

  const resolveSelectedVariantSku = () => {
    return String(currentVariant?.sku || '').trim() || null;
  };

  const handleShareProduct = async () => {
    const shareSlug = String(product.slug || productId || '').trim();
    if (!shareSlug) return;
    const shareUrl = buildAppRedirect(`/share/${shareSlug}`);
    try {
      const result = await shareProduct({
        title: product.name,
        text: product.short_description?.slice(0, 100) || '',
        shareUrl,
      });
      if (result === 'copied') {
        setShareCopiedToast(true);
        setTimeout(() => setShareCopiedToast(false), 2000);
      }
    } catch {
      // Share unsupported or blocked
    }
  };

  const goToPrevGalleryImage = () => {
    if (galleryImages.length <= 1) return;
    setActiveImage((i) => (i === 0 ? galleryImages.length - 1 : i - 1));
  };

  const goToNextGalleryImage = () => {
    if (galleryImages.length <= 1) return;
    setActiveImage((i) => (i === galleryImages.length - 1 ? 0 : i + 1));
  };

  const handleGalleryTouchStart = (e: React.TouchEvent) => {
    gallerySwipedRef.current = false;
    galleryTouchStartX.current = e.touches[0]?.clientX ?? null;
  };

  const handleGalleryTouchEnd = (e: React.TouchEvent) => {
    if (galleryTouchStartX.current == null || galleryImages.length <= 1) return;
    const endX = e.changedTouches[0]?.clientX;
    if (endX == null) return;
    const delta = endX - galleryTouchStartX.current;
    if (Math.abs(delta) >= 44) {
      gallerySwipedRef.current = true;
      if (delta < 0) goToNextGalleryImage();
      else goToPrevGalleryImage();
    }
    galleryTouchStartX.current = null;
  };

  const openImageLightbox = () => {
    if (gallerySwipedRef.current) {
      gallerySwipedRef.current = false;
      return;
    }
    setIsLightboxOpen(true);
  };

  const handleDetailTabChange = (tab: 'details' | 'specifications' | 'reviews') => {
    setActiveDetailTab(tab);
    requestAnimationFrame(() => {
      detailTabPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const detailTabButtonClass = (tab: 'details' | 'specifications' | 'reviews') => {
    const isActive = activeDetailTab === tab;
    const base = 'py-2.5 text-[10px] font-bold text-center font-[Arial,sans-serif] transition-all';
    const inactive = 'bg-[#E5E7EB] text-[#6B7280] hover:opacity-90';
    if (!isActive) {
      const border = tab !== 'reviews' ? ' border-r border-gray-500' : '';
      return `${base}${border} ${inactive}`;
    }
    const activeText = 'text-white shadow-inner';
    if (tab === 'details') {
      return `${base} border-r border-gray-500 bg-[#6D28D9] ${activeText}`;
    }
    if (tab === 'specifications') {
      return `${base} border-r border-gray-500 bg-[#0F766E] ${activeText}`;
    }
    return `${base} bg-[#EA580C] ${activeText}`;
  };

  return (
    // overflow-x-clip (not -hidden) prevents this wrapper from becoming a scroll container,
    // which would otherwise demote the sticky <Header> inside it (sticky needs a non-scrolling ancestor).
    <div className="min-h-screen bg-white pdp-page-shell text-gray-900 pb-24 md:pb-0 selection:bg-yellow-500 selection:text-black font-sans overflow-x-clip max-w-[100vw]">
      <Header />

      <div className="max-w-7xl mx-auto px-4 md:px-6 pt-4 md:pt-8 w-full min-w-0 box-border">
        <nav
          className="flex flex-nowrap items-center gap-1 text-xs font-medium text-gray-500 mb-3 md:mb-6 min-w-0 overflow-hidden w-full"
          aria-label="Breadcrumb"
        >
          <button onClick={() => navigate('/')} className="hover:text-gray-900 transition-colors shrink-0">
            Home
          </button>
          {product.category_name && product.category_slug && (
            <>
              <ChevronRight size={10} className="shrink-0 text-gray-400" aria-hidden />
              <button
                onClick={() => navigate(`/category/${product.category_slug}`)}
                className="hover:text-gray-900 transition-colors shrink-0 text-gray-700 max-w-[22vw] sm:max-w-none truncate"
                title={product.category_name}
              >
                {product.category_name}
              </button>
            </>
          )}
          {product.sub_category_name && product.sub_category_slug && (
            <>
              <ChevronRight size={10} className="shrink-0 text-gray-400" aria-hidden />
              <button
                onClick={() => navigate(`/category/${product.sub_category_slug}`)}
                className="hover:text-gray-900 transition-colors shrink-0 text-gray-700 max-w-[26vw] sm:max-w-none truncate"
                title={product.sub_category_name}
              >
                {product.sub_category_name}
              </button>
            </>
          )}
          {product.product_type_name && (
            <>
              <ChevronRight size={10} className="shrink-0 text-gray-400" aria-hidden />
              <span
                className="shrink-0 text-gray-700 max-w-[22vw] sm:max-w-none truncate"
                title={product.product_type_name}
              >
                {product.product_type_name}
              </span>
            </>
          )}
          <ChevronRight size={10} className="shrink-0 text-gray-400" aria-hidden />
          <span
            className="text-black font-medium truncate min-w-0 flex-1"
            title={product.name}
          >
            {product.name}
          </span>
        </nav>

        <div className="grid lg:grid-cols-12 gap-4 lg:gap-10 items-start w-full min-w-0">
          {/* Left Column: Image Gallery */}
          <div className="lg:col-span-5 w-full min-w-0 max-w-full overflow-hidden">
            {galleryImages.length > 0 ? (
              <div className="bg-white border border-gray-200 rounded-2xl p-3 sm:p-4 w-full max-w-full box-border overflow-hidden">
                <div
                  className="relative rounded-xl border border-gray-200 bg-gray-50 overflow-hidden w-full max-w-full aspect-square sm:aspect-[4/5] md:aspect-auto md:min-h-[28rem] touch-pan-y"
                  onTouchStart={handleGalleryTouchStart}
                  onTouchEnd={handleGalleryTouchEnd}
                >
                  <button
                    type="button"
                    onClick={openImageLightbox}
                    className="absolute inset-0 z-[1] cursor-zoom-in"
                    aria-label="View full screen image"
                  />
                  <img
                    ref={productImageRef}
                    id="product-hero-image"
                    key={activeImage}
                    src={galleryImages[activeImage] || ''}
                    alt={product.name}
                    className="absolute inset-0 w-full h-full max-w-full max-h-full object-contain z-[0] transition-opacity duration-200 mx-auto pointer-events-none"
                    onError={(e) => { e.currentTarget.style.opacity = '0'; }}
                  />
                  {galleryImages.length > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={goToPrevGalleryImage}
                        className="absolute left-1.5 sm:left-3 top-1/2 -translate-y-1/2 z-[3] p-1.5 sm:p-2.5 bg-white/90 backdrop-blur-sm rounded-full transition-all border border-gray-200 text-[#0B2A66] hover:bg-white hover:text-[#081F4D] shadow-sm active:scale-95"
                        aria-label="Previous image"
                      >
                        <ChevronLeft size={18} strokeWidth={2.25} className="sm:w-5 sm:h-5" />
                      </button>
                      <button
                        type="button"
                        onClick={goToNextGalleryImage}
                        className="absolute right-1.5 sm:right-3 top-1/2 -translate-y-1/2 z-[3] p-1.5 sm:p-2.5 bg-white/90 backdrop-blur-sm rounded-full transition-all border border-gray-200 text-[#0B2A66] hover:bg-white hover:text-[#081F4D] shadow-sm active:scale-95"
                        aria-label="Next image"
                      >
                        <ChevronRight size={18} strokeWidth={2.25} className="sm:w-5 sm:h-5" />
                      </button>
                      <span className="absolute bottom-2 left-1/2 -translate-x-1/2 z-[3] px-2 py-0.5 rounded-full bg-black/50 text-white text-[10px] font-semibold tabular-nums pointer-events-none">
                        {activeImage + 1} / {galleryImages.length}
                      </span>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => { void handleShareProduct(); }}
                    className="absolute top-2 right-2 sm:top-4 sm:right-4 z-[3] p-2 sm:p-3 bg-white/90 backdrop-blur-sm rounded-md transition-all border border-gray-200 text-[#0B2A66] hover:bg-white hover:text-[#081F4D] shadow-sm"
                    aria-label="Share product"
                  >
                    <Share2 size={16} strokeWidth={2.25} className="sm:w-[18px] sm:h-[18px]" />
                  </button>
                </div>

                {galleryImages.length > 1 && (
                  <div className="mt-3 flex gap-2 overflow-x-auto no-scrollbar scroll-smooth pb-0.5 w-full max-w-full">
                    {galleryImages.map((img: string, i: number) => (
                      <button
                        key={i}
                        onClick={() => setActiveImage(i)}
                        className={`flex-shrink-0 w-14 h-14 rounded-md overflow-hidden border-2 bg-white ${
                          activeImage === i ? 'border-black' : 'border-gray-200 hover:border-gray-400'
                        }`}
                      >
                        <img src={img} className="w-full h-full object-cover" alt={`Gallery ${i + 1}`} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-gray-50 border border-gray-200 rounded-2xl min-h-[22rem] sm:min-h-[26rem] flex items-center justify-center">
                <p className="text-gray-400 text-sm">No image available</p>
              </div>
            )}
          </div>

          {/* Right Column: Product Info */}
          <div className="lg:col-span-7 flex flex-col min-w-0 w-full max-w-full overflow-hidden">
            <div className="border-b border-black/15 pb-3 md:pb-4 mb-3 md:mb-4 w-full min-w-0">
              {(() => {
                const cond = product.item_condition || 'brand_new';
                const isBrandNew = cond === 'brand_new';
                const label = ({
                  brand_new: 'Brand New',
                  used_open_box: 'Used — Open Box',
                  used_like_new: 'Used — Like New',
                  used_very_good: 'Used — Very Good',
                  used_good: 'Used — Good',
                  used_acceptable: 'Used — Acceptable',
                  refurbished: 'Refurbished',
                } as Record<string, string>)[cond] || cond;
                return (
                  <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-3 py-1 rounded-full mb-2 uppercase tracking-[0.08em] ${
                    isBrandNew
                      ? 'bg-[#e11d24] border border-[#e11d24] text-white'
                      : 'bg-amber-50 border border-amber-300 text-amber-800'
                  }`}>
                    <Package size={13} />
                    {label}
                  </span>
                );
              })()}

              <h1
                className="text-[17px] sm:text-[22px] lg:text-[30px] font-medium mb-2 leading-[1.35] sm:leading-[1.28] text-black font-[Arial,sans-serif] break-words [overflow-wrap:anywhere] whitespace-normal w-full"
                title={product.name}
              >
                {product.name}
              </h1>

              <div className="flex items-center gap-2.5 mb-2 border-b border-gray-200 pb-1.5">
                {product.brand && <p className="text-[12px] font-medium text-[#1f5ea8] font-[Arial,sans-serif] leading-4">{product.brand}</p>}
                {averageRating > 0 && (
                  <>
                    <span className="text-[12px] text-[#111111] font-semibold font-[Arial,sans-serif]">{averageRating.toFixed(1)}</span>
                    <div className="flex items-center gap-0.5 text-orange-500">
                      {[...Array(5)].map((_, idx) => (
                        <Star key={idx} size={11} className={idx < Math.round(averageRating) ? 'fill-orange-500' : ''} />
                      ))}
                    </div>
                    <span className="text-[11px] text-[#1f5ea8] font-[Arial,sans-serif] whitespace-nowrap">{reviews.length} REVIEWS</span>
                  </>
                )}
              </div>

              {product.short_description && (
                <p className="mb-2.5 text-[12px] text-[#555555] leading-5 font-[Arial,sans-serif]">{product.short_description}</p>
              )}

              <div className="hidden">
                {(product.rating > 0 || reviews.length > 0) && (
                  <div className="flex items-center gap-1 bg-gray-50 px-2 py-0.5 rounded border border-black/10">
                    <Star size={13} className="fill-yellow-500 text-yellow-500" />
                    <span className="text-[12px] font-bold text-black">{product.rating > 0 ? product.rating : (reviews.length > 0 ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1) : null)}</span>
                  </div>
                )}
                <span className="text-[10px] font-semibold text-gray-500 tracking-wide">
                  {reviews.length} {reviews.length === 1 ? 'Review' : 'Reviews'}
                </span>
                <span className={`text-[10px] font-semibold ${stockStatus.color}`}>
                  {stockStatus.label}
                </span>
              </div>
              {shareCopiedToast && (
                <div className="mb-4 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 text-blue-700 text-sm font-semibold flex items-center gap-2 animate-in fade-in duration-300">
                  <Share2 size={14} /> Link copied to clipboard
                </div>
              )}

              {!inStock && (
                <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-500 text-xs font-bold">
                  <Info size={16} /> This Product Is Currently Out Of Stock.
                </div>
              )}

              <div className="mb-1.5 space-y-1.5">
                {publicUnitPrice != null ? (
                  <>
                    {originalPrice != null && (
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="text-[12px] text-[#565959] font-[Arial,sans-serif]">MRP:</span>
                        <span className="text-[13px] text-[#565959] line-through font-[Arial,sans-serif]">{formatPrice(effectiveMrp, publicPriceSourceCurrency)}</span>
                        {discountPercent > 0 && (
                          <span className="text-[12px] text-[#cc0c39] font-semibold font-[Arial,sans-serif]">({discountPercent}% OFF)</span>
                        )}
                      </div>
                    )}
                    <div className="flex items-end gap-2.5 flex-wrap">
                      <span className="text-[28px] sm:text-[36px] md:text-[38px] font-semibold text-gray-900 tracking-tight leading-none font-[Arial,sans-serif] break-all">
                        {formatPrice(publicUnitPrice, publicPriceSourceCurrency)}
                      </span>
                      <span className="text-[12px] text-[#565959] font-[Arial,sans-serif] pb-1">Selling Price</span>
                    </div>
                  </>
                ) : (
                  <span className="text-[13px] font-semibold text-gray-500 tracking-tight">
                    {publicPriceLoading ? 'Loading price...' : 'Loading price...'}
                  </span>
                )}
                <span className="block text-[11px] text-[#666666] font-[Arial,sans-serif]">Inclusive of all taxes</span>
              </div>
            </div>

            {/* Selection Area */}
            {hasOfferSection && (
              <div className="mb-2.5 border border-[#2f16c7] rounded-sm overflow-hidden">
                <div className="bg-[#2f16c7] text-center py-1.5">
                  <p className="text-[10px] text-white font-bold tracking-wide font-[Arial,sans-serif] uppercase">Offer Section</p>
                </div>
                <div className="px-3 py-2 bg-white">
                  <p className="text-[11px] font-semibold text-[#111111] font-[Arial,sans-serif] break-words">{formatOfferSummary(activeOffers[0])}</p>
                </div>
              </div>
            )}

            {(hasColorOptions || hasSizeOptions) && (
              <div className="space-y-1.5 mb-3">
                {hasColorOptions && (
                  <div className="flex items-center gap-2.5">
                    <p className="text-[11px] text-[#111111] font-[Arial,sans-serif] whitespace-nowrap">Colour: <span className="font-semibold">{selectedColor || availableColors[0] || ''}</span></p>
                    <div className="flex items-center gap-2 flex-wrap">
                      {availableColors.map((color: string) => {
                        const normalizedColor = color.toLowerCase();
                        const colorHex = colorHexByName.get(normalizedColor) || resolveColorHex(color);
                        const isSelected = selectedColor === color || (!selectedColor && availableColors[0] === color);
                        return (
                          <button
                            key={color}
                            onClick={() => setSelectedColor(color)}
                            aria-label={`Select color ${color}`}
                            className={`w-6 h-6 rounded-full border ${isSelected ? 'ring-2 ring-black border-black' : 'border-gray-400'}`}
                            style={{ backgroundColor: colorHex }}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}

                {hasSizeOptions && (
                  <div className="flex items-center gap-2">
                    <p className="text-[11px] text-[#111111] font-[Arial,sans-serif] whitespace-nowrap">Size:</p>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {availableSizes.map((size: string) => (
                        <button
                          key={size}
                          onClick={() => setSelectedSize(size)}
                          className={`h-8 min-w-[42px] px-3 border rounded-[2px] text-[12px] font-[Arial,sans-serif] ${
                            selectedSize === size
                              ? 'bg-[#ffe59c] border-[#333333] text-[#111111]'
                              : 'bg-white border-gray-300 text-[#333333]'
                          }`}
                        >
                          {size}
                        </button>
                      ))}
                    </div>
                    {hasSizeOptions && (
                      <button
                        onClick={() => setIsSizeGuideOpen(true)}
                        className="ml-auto text-[9px] text-[#1f5ea8] hover:underline font-[Arial,sans-serif]"
                      >
                        Size Guide
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* CTA Buttons — 3 equal columns on mobile so Share is never clipped */}
            <div className="grid grid-cols-3 gap-2 mb-2.5 w-full">
              <button
                type="button"
                onClick={async () => {
                  if (!user) {
                    navigate('/login');
                    return;
                  }
                  if (!validateVariantSelection()) return;
                  setAddingToCart(true);
                  try {
                    const img = productImageRef.current;
                    const cart = getCartTarget();
                    if (img && cart) {
                      flyToCart(img, cart);
                    }
                    // Delay state mutation so animation starts on the real DOM first
                    await new Promise((r) => setTimeout(r, 300));
                    addToCart(product, 1, {
                      selectedSize: selectedSize || null,
                      selectedColor: selectedColor || null,
                      selectedVariantId: String(currentVariant?.id || '').trim() || null,
                      selectedVariantSku: resolveSelectedVariantSku(),
                      // Always pass markup-resolved publicUnitPrice into cart.
                      // This prevents any raw base-price fallback in cart totals.
                      variantPrice: publicUnitPrice,
                    });
                    setCartAddedToast(true);
                    setTimeout(() => setCartAddedToast(false), 2000);
                  } finally {
                    setAddingToCart(false);
                  }
                }}
                disabled={!inStock || addingToCart || publicUnitPrice == null || (requiresSizeSelection && !selectedSize) || (requiresColorSelection && !selectedColor)}
                className="h-9 min-w-0 px-1.5 bg-[#374151] disabled:opacity-40 text-white font-semibold rounded-md transition-all flex items-center justify-center gap-1 text-[10px] whitespace-nowrap hover:bg-[#1f2937] active:scale-[0.98] border border-[#4b5563]"
              >
                {addingToCart ? <Loader2 size={15} className="animate-spin shrink-0" /> : <ShoppingCart size={15} className="shrink-0" />}
                <span className="truncate">{addingToCart ? 'Adding...' : 'Add To Cart'}</span>
              </button>
              <button
                type="button"
                disabled={!inStock || publicUnitPrice == null || (requiresSizeSelection && !selectedSize) || (requiresColorSelection && !selectedColor)}
                onClick={() => {
                  if (!user) {
                    navigate('/login');
                    return;
                  }
                  if (!validateVariantSelection()) return;
                  addToCart(product, 1, {
                    selectedSize: selectedSize || null,
                    selectedColor: selectedColor || null,
                    selectedVariantId: String(currentVariant?.id || '').trim() || null,
                    selectedVariantSku: resolveSelectedVariantSku(),
                    // Always pass the geo-markup price (publicUnitPrice) as variantPrice.
                    variantPrice: publicUnitPrice,
                  });
                  navigate('/cart');
                }}
                className="h-9 min-w-0 px-1.5 bg-[#2f6fe4] disabled:opacity-40 text-white font-semibold rounded-md transition-all flex items-center justify-center gap-1 text-[10px] whitespace-nowrap hover:bg-[#235ec8] active:scale-[0.98]"
              >
                <CreditCard size={15} className="shrink-0" />
                <span className="truncate">Buy Now</span>
              </button>
              <button
                type="button"
                onClick={() => { void handleShareProduct(); }}
                className="h-9 min-w-0 px-1.5 text-[10px] font-semibold text-white bg-[#0B2A66] hover:bg-[#081F4D] transition-colors rounded-md border border-[#1e40af] flex items-center justify-center gap-1 whitespace-nowrap"
                aria-label="Share product"
              >
                <Share2 size={15} className="shrink-0 text-white" strokeWidth={2.25} />
                <span className="truncate text-white">Share</span>
              </button>
            </div>

            {/* Cart Added Toast */}
            {cartAddedToast && (
              <div className="mb-4 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-green-700 text-sm font-semibold flex items-center gap-2 animate-in fade-in duration-300">
                <ShoppingCart size={16} /> Product added to cart
              </div>
            )}

            {/* Delivery Estimate */}
            <DeliveryEstimate delivery={delivery} />
          </div>
        </div>

        {/* Full-width content sections */}
        <div className="mt-6 space-y-4" ref={detailTabPanelRef}>
          <div className="grid grid-cols-3 border border-gray-500 bg-[#E5E7EB] text-center min-h-[38px] rounded-t-md overflow-hidden" role="tablist" aria-label="Product information">
            <button
              type="button"
              role="tab"
              aria-selected={activeDetailTab === 'details'}
              onClick={() => handleDetailTabChange('details')}
              className={detailTabButtonClass('details')}
            >
              Product Details
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeDetailTab === 'specifications'}
              onClick={() => handleDetailTabChange('specifications')}
              className={detailTabButtonClass('specifications')}
            >
              Specifications
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeDetailTab === 'reviews'}
              onClick={() => handleDetailTabChange('reviews')}
              className={detailTabButtonClass('reviews')}
            >
              Reviews
            </button>
          </div>

          {activeDetailTab === 'details' && (
            <div role="tabpanel" className="space-y-4">
              {detailPoints.length > 0 && (
                <div className="bg-white border border-gray-300 rounded-md overflow-hidden">
                  <div className="bg-[#f0f2f2] border-b border-gray-300 px-4 py-2.5 flex items-center justify-between">
                    <h3 className="text-[14px] font-bold text-[#0f1111] font-[Arial,sans-serif]">About Product</h3>
                    <ChevronUp size={16} className="text-[#111111]" />
                  </div>
                  <ul className="list-disc pl-8 pr-4 py-2.5 space-y-1.5">
                    {detailPoints.map((point, index) => (
                      <li key={`${point}-${index}`} className="text-[12px] text-[#0f1111] leading-5 font-[Arial,sans-serif] break-words">
                        <span className="min-w-0">{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {highlightItems.length > 0 && (
                <div className="bg-white border border-gray-300 rounded-md overflow-hidden">
                  <div className="bg-[#f0f2f2] border-b border-gray-300 px-4 py-2.5 flex items-center justify-between">
                    <h3 className="text-[14px] font-bold text-[#0f1111] font-[Arial,sans-serif]">Highlights</h3>
                    <ChevronUp size={16} className="text-[#111111]" />
                  </div>
                  <ul className="px-4 py-2.5 list-disc pl-8 space-y-1">
                    {highlightItems.map((item, index) => (
                      <li key={`${item}-${index}`} className="text-[12px] text-[#0f1111] leading-5 font-[Arial,sans-serif] break-words">{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {ingredientItems.length > 0 && (
                <div className="bg-white border border-gray-300 rounded-md overflow-hidden">
                  <div className="bg-[#f0f2f2] border-b border-gray-300 px-4 py-2.5 flex items-center justify-between">
                    <h3 className="text-[14px] font-bold text-[#0f1111] font-[Arial,sans-serif]">Ingredients</h3>
                    <ChevronUp size={16} className="text-[#111111]" />
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[12px] min-w-[240px] font-[Arial,sans-serif]">
                      <tbody>
                        {ingredientRows.map(([left, right], index) => (
                          <tr key={`${left}-${index}`} className="border-t border-gray-200 first:border-t-0">
                            <td className="px-4 py-2 text-[#0f1111] w-1/2">{left}</td>
                            <td className="px-4 py-2 text-[#0f1111] w-1/2">{right || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {directionLines.length > 0 && (
                <div className="bg-white border border-gray-300 rounded-md overflow-hidden">
                  <div className="bg-[#f0f2f2] border-b border-gray-300 px-4 py-2.5 flex items-center justify-between">
                    <h3 className="text-[14px] font-bold text-[#0f1111] font-[Arial,sans-serif]">Directions</h3>
                    <ChevronUp size={16} className="text-[#111111]" />
                  </div>
                  <div className="px-4 py-2.5 space-y-1.5 text-[12px] text-[#0f1111] leading-5 font-[Arial,sans-serif]">
                    {directionLines.map((line, index) => (
                      <p key={`${line}-${index}`}>{line}</p>
                    ))}
                  </div>
                </div>
              )}

              {String(product.important_note || '').trim() && (
                <div className="rounded-md border border-[#6aa6ff] bg-[#eef5ff] overflow-hidden">
                  <div className="bg-[#f0f2f2] border-b border-[#c7d9ff] px-4 py-2.5 flex items-center justify-between">
                    <h3 className="text-[14px] font-bold text-[#0f1111] font-[Arial,sans-serif]">Important Note</h3>
                    <ChevronUp size={16} className="text-[#111111]" />
                  </div>
                  <p className="px-4 py-2.5 text-[12px] text-[#0f1111] leading-5 font-[Arial,sans-serif] whitespace-pre-line">{String(product.important_note || '').trim()}</p>
                </div>
              )}

              {renderCommonBenefitsStrip('mt-1')}

              {detailPoints.length === 0 && highlightItems.length === 0 && ingredientItems.length === 0 && directionLines.length === 0 && !String(product.important_note || '').trim() && (
                <p className="text-sm text-[#565959] font-[Arial,sans-serif] py-4">No product details available.</p>
              )}
            </div>
          )}

          {activeDetailTab === 'specifications' && (
            <div role="tabpanel" className="space-y-4">
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3.5">
                {specificationRows.length > 0 && (
                  <div className="bg-white border border-gray-300 rounded-md overflow-hidden">
                    <div className="bg-[#f0f2f2] border-b border-gray-300 px-4 py-2.5 flex items-center justify-between">
                      <h3 className="text-[14px] font-bold text-[#0f1111] font-[Arial,sans-serif]">Features & Specs</h3>
                      <ChevronUp size={16} className="text-[#111111]" />
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-[12px] min-w-[240px] font-[Arial,sans-serif]">
                        <tbody>
                          {specificationRows.map((row) => (
                            <tr key={row.key} className="border-t border-gray-100 first:border-t-0">
                              <td className="px-4 py-2 font-semibold text-[#37475a] w-[44%]">{row.key}</td>
                              <td className="px-4 py-2 text-[#0f1111]">{row.value}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div className="bg-white border border-gray-300 rounded-md overflow-hidden">
                  <div className="bg-[#f0f2f2] border-b border-gray-300 px-4 py-2.5 flex items-center justify-between">
                    <h3 className="text-[14px] font-bold text-[#0f1111] font-[Arial,sans-serif]">Item Details</h3>
                    <ChevronUp size={16} className="text-[#111111]" />
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[12px] min-w-[240px] font-[Arial,sans-serif]">
                      <tbody>
                        <tr className="border-t border-gray-200"><td className="px-4 py-2 font-semibold text-[#37475a] w-[44%]">Brand</td><td className="px-4 py-2 text-[#0f1111]">{product.brand || 'N/A'}</td></tr>
                        {product.sku && <tr className="border-t border-gray-200"><td className="px-4 py-2 font-semibold text-[#37475a]">SKU</td><td className="px-4 py-2 text-[#0f1111]">{product.sku}</td></tr>}
                        {product.hsn_code && <tr className="border-t border-gray-200"><td className="px-4 py-2 font-semibold text-[#37475a]">HSN Code</td><td className="px-4 py-2 text-[#0f1111]">{product.hsn_code}</td></tr>}
                        <tr className="border-t border-gray-200"><td className="px-4 py-2 font-semibold text-[#37475a]">Category</td><td className="px-4 py-2 text-[#0f1111]">{product.sub_category_name || product.category_name || 'N/A'}</td></tr>
                        <tr className="border-t border-gray-200"><td className="px-4 py-2 font-semibold text-[#37475a]">In Stock</td><td className="px-4 py-2 text-[#0f1111]">{inStock ? 'Yes' : 'No'}</td></tr>
                        <tr className="border-t border-gray-200"><td className="px-4 py-2 font-semibold text-[#37475a]">Manufacturer Name</td><td className="px-4 py-2 text-[#0f1111]">{product.manufacturer_name || 'N/A'}</td></tr>
                        <tr className="border-t border-gray-200"><td className="px-4 py-2 font-semibold text-[#37475a]">Manufacturer Country</td><td className="px-4 py-2 text-[#0f1111]">{product.manufacturer_country || 'N/A'}</td></tr>
                        <tr className="border-t border-gray-200"><td className="px-4 py-2 font-semibold text-[#37475a]">Country of Origin</td><td className="px-4 py-2 text-[#0f1111]">{product.origin_country || 'N/A'}</td></tr>
                        {formattedWeight && (
                          <tr className="border-t border-gray-200"><td className="px-4 py-2 font-semibold text-[#37475a]">Item Weight</td><td className="px-4 py-2 text-[#0f1111]">{formattedWeight}</td></tr>
                        )}
                        {(product.package_length || product.package_width || product.package_height) && (
                          <tr className="border-t border-gray-200"><td className="px-4 py-2 font-semibold text-[#37475a]">Dimensions</td><td className="px-4 py-2 text-[#0f1111]">{product.package_length || 0} × {product.package_width || 0} × {product.package_height || 0} cm</td></tr>
                        )}
                        {packageSummary && (
                          <tr className="border-t border-gray-200"><td className="px-4 py-2 font-semibold text-[#37475a]">Package</td><td className="px-4 py-2 text-[#0f1111]">{packageSummary}</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

        {(conditionDetails || returnPolicy) && (
        <div className="mt-8 md:mt-10 space-y-8 md:space-y-10">
          {/* Condition Details — only for used/refurbished products */}
          {conditionDetails && product.item_condition && product.item_condition !== 'brand_new' && (
            <div className="bg-white border border-black/15 rounded-2xl p-4 sm:p-6 md:p-8">
              <div className="flex items-center gap-2 mb-4 md:mb-6">
                <Shield size={16} className="text-amber-600" />
                <h3 className="text-[10px] font-bold text-gray-600 uppercase tracking-widest font-semibold">Condition Details</h3>
              </div>
              <div className="overflow-x-auto border border-gray-200 rounded-xl">
                <table className="w-full text-xs min-w-[280px]">
                  <tbody>
                    <tr className="border-t border-gray-100">
                      <td className="px-3 sm:px-4 py-2.5 font-semibold text-gray-600 w-2/5 sm:w-1/2">Item Condition</td>
                      <td className="px-3 sm:px-4 py-2.5 text-gray-900 font-semibold">
                        {({ used_open_box: 'Used — Open Box', used_like_new: 'Used — Like New', used_very_good: 'Used — Very Good', used_good: 'Used — Good', used_acceptable: 'Used — Acceptable', refurbished: 'Refurbished' } as Record<string, string>)[product.item_condition] || product.item_condition}
                      </td>
                    </tr>
                    <tr className="border-t border-gray-100">
                      <td className="px-3 sm:px-4 py-2.5 font-semibold text-gray-600">Usage Duration</td>
                      <td className="px-3 sm:px-4 py-2.5 text-gray-900">
                        {({ less_than_1_month: 'Less than 1 month', '1_6_months': '1–6 months', '6_12_months': '6–12 months', '1_2_years': '1–2 years', '2_plus_years': '2+ years' } as Record<string, string>)[conditionDetails.usage_duration] || conditionDetails.usage_duration}
                      </td>
                    </tr>
                    <tr className="border-t border-gray-100">
                      <td className="px-3 sm:px-4 py-2.5 font-semibold text-gray-600">Working Condition</td>
                      <td className="px-3 sm:px-4 py-2.5 text-gray-900">
                        <span className={`inline-flex items-center gap-1 ${conditionDetails.working_condition === 'works_perfectly' ? 'text-green-700' : conditionDetails.working_condition === 'minor_issues' ? 'text-amber-700' : 'text-red-700'}`}>
                          {conditionDetails.working_condition === 'works_perfectly' ? <CheckCircle2 size={13} /> : conditionDetails.working_condition === 'minor_issues' ? <Info size={13} /> : <XCircle size={13} />}
                          {({ works_perfectly: 'Works Perfectly', minor_issues: 'Minor Issues', needs_repair: 'Needs Repair' } as Record<string, string>)[conditionDetails.working_condition] || conditionDetails.working_condition}
                        </span>
                      </td>
                    </tr>
                    {conditionDetails.working_condition_notes && (
                      <tr className="border-t border-gray-100">
                        <td className="px-3 sm:px-4 py-2.5 font-semibold text-gray-600">Condition Notes</td>
                        <td className="px-3 sm:px-4 py-2.5 text-gray-900">{conditionDetails.working_condition_notes}</td>
                      </tr>
                    )}
                    <tr className="border-t border-gray-100">
                      <td className="px-3 sm:px-4 py-2.5 font-semibold text-gray-600">Original Packaging</td>
                      <td className="px-3 sm:px-4 py-2.5 text-gray-900">{conditionDetails.original_packaging ? 'Yes' : 'No'}</td>
                    </tr>
                    <tr className="border-t border-gray-100">
                      <td className="px-3 sm:px-4 py-2.5 font-semibold text-gray-600">Original Invoice</td>
                      <td className="px-3 sm:px-4 py-2.5 text-gray-900">{conditionDetails.original_invoice ? 'Yes' : 'No'}</td>
                    </tr>
                    {conditionDetails.accessories_included && (
                      <tr className="border-t border-gray-100">
                        <td className="px-3 sm:px-4 py-2.5 font-semibold text-gray-600">Accessories Included</td>
                        <td className="px-3 sm:px-4 py-2.5 text-gray-900">{conditionDetails.accessories_included}</td>
                      </tr>
                    )}
                    <tr className="border-t border-gray-100">
                      <td className="px-3 sm:px-4 py-2.5 font-semibold text-gray-600">Ownership</td>
                      <td className="px-3 sm:px-4 py-2.5 text-gray-900">
                        {({ first_owner: 'First Owner', second_owner: 'Second Owner', multiple_owners: 'Multiple Owners' } as Record<string, string>)[conditionDetails.ownership_type] || conditionDetails.ownership_type}
                      </td>
                    </tr>
                    <tr className="border-t border-gray-100">
                      <td className="px-3 sm:px-4 py-2.5 font-semibold text-gray-600">Scratches / Defects</td>
                      <td className="px-3 sm:px-4 py-2.5 text-gray-900">{conditionDetails.has_scratches ? 'Yes' : 'No'}</td>
                    </tr>
                    {conditionDetails.has_scratches && conditionDetails.scratch_description && (
                      <tr className="border-t border-gray-100">
                        <td className="px-3 sm:px-4 py-2.5 font-semibold text-gray-600">Defect Description</td>
                        <td className="px-3 sm:px-4 py-2.5 text-gray-900">{conditionDetails.scratch_description}</td>
                      </tr>
                    )}
                    {conditionDetails.has_scratches && Array.isArray(conditionDetails.scratch_images) && conditionDetails.scratch_images.length > 0 && (
                      <tr className="border-t border-gray-100">
                        <td className="px-3 sm:px-4 py-2.5 font-semibold text-gray-600">Defect Photos</td>
                        <td className="px-3 sm:px-4 py-2.5">
                          <div className="flex gap-2 flex-wrap">
                            {conditionDetails.scratch_images.map((img, idx) => (
                              <img key={idx} src={resolveProductImageUrl(img)} alt={`Defect ${idx + 1}`} className="w-16 h-16 object-cover rounded-lg border border-gray-200" />
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                    {product.item_condition === 'refurbished' && conditionDetails.refurbished_by && (
                      <tr className="border-t border-gray-100">
                        <td className="px-3 sm:px-4 py-2.5 font-semibold text-gray-600">Refurbished By</td>
                        <td className="px-3 sm:px-4 py-2.5 text-gray-900">
                          {({ brand_authorized: 'Brand Authorized', local_technician: 'Local Technician', self_refurbished: 'Self Refurbished' } as Record<string, string>)[conditionDetails.refurbished_by] || conditionDetails.refurbished_by}
                        </td>
                      </tr>
                    )}
                    {product.item_condition === 'refurbished' && conditionDetails.repair_details && (
                      <tr className="border-t border-gray-100">
                        <td className="px-3 sm:px-4 py-2.5 font-semibold text-gray-600">Repair Details</td>
                        <td className="px-3 sm:px-4 py-2.5 text-gray-900">{conditionDetails.repair_details}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Return & Refund Policy — only for used/refurbished products */}
          {returnPolicy && product.item_condition && product.item_condition !== 'brand_new' && (
            <div className="bg-white border border-black/15 rounded-2xl p-4 sm:p-6 md:p-8">
              <div className="flex items-center gap-2 mb-4 md:mb-6">
                <RotateCcw size={16} className="text-amber-600" />
                <h3 className="text-[10px] font-bold text-gray-600 uppercase tracking-widest font-semibold">Return & Refund Policy</h3>
              </div>
              <div className="overflow-x-auto border border-gray-200 rounded-xl">
                <table className="w-full text-xs min-w-[280px]">
                  <tbody>
                    <tr className="border-t border-gray-100">
                      <td className="px-3 sm:px-4 py-2.5 font-semibold text-gray-600 w-2/5 sm:w-1/2">Returns Accepted</td>
                      <td className="px-3 sm:px-4 py-2.5 text-gray-900">
                        <span className={`inline-flex items-center gap-1 font-semibold ${returnPolicy.accepts_returns ? 'text-green-700' : 'text-red-700'}`}>
                          {returnPolicy.accepts_returns ? <><CheckCircle2 size={13} /> Yes</> : <><XCircle size={13} /> No</>}
                        </span>
                      </td>
                    </tr>
                    {returnPolicy.accepts_returns && returnPolicy.return_window && (
                      <tr className="border-t border-gray-100">
                        <td className="px-3 sm:px-4 py-2.5 font-semibold text-gray-600">Return Window</td>
                        <td className="px-3 sm:px-4 py-2.5 text-gray-900">
                          {({ '24_hours': '24 Hours', '48_hours': '48 Hours', '3_days': '3 Days', '5_days': '5 Days' } as Record<string, string>)[returnPolicy.return_window] || returnPolicy.return_window}
                        </td>
                      </tr>
                    )}
                    {returnPolicy.accepts_returns && Array.isArray(returnPolicy.accepted_return_reasons) && returnPolicy.accepted_return_reasons.length > 0 && (
                      <tr className="border-t border-gray-100">
                        <td className="px-3 sm:px-4 py-2.5 font-semibold text-gray-600">Accepted Return Reasons</td>
                        <td className="px-3 sm:px-4 py-2.5 text-gray-900">
                          <ul className="list-disc list-inside space-y-0.5">
                            {returnPolicy.accepted_return_reasons.map((reason, idx) => (
                              <li key={idx}>{reason.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    )}
                    {returnPolicy.accepts_returns && returnPolicy.return_shipping_by && (
                      <tr className="border-t border-gray-100">
                        <td className="px-3 sm:px-4 py-2.5 font-semibold text-gray-600">Return Shipping Paid By</td>
                        <td className="px-3 sm:px-4 py-2.5 text-gray-900">{returnPolicy.return_shipping_by === 'seller' ? 'Seller' : 'Buyer'}</td>
                      </tr>
                    )}
                    {returnPolicy.accepts_returns && returnPolicy.refund_type && (
                      <tr className="border-t border-gray-100">
                        <td className="px-3 sm:px-4 py-2.5 font-semibold text-gray-600">Refund Type</td>
                        <td className="px-3 sm:px-4 py-2.5 text-gray-900">
                          {({ full_refund: 'Full Refund', partial_refund: 'Partial Refund', replacement: 'Replacement Only' } as Record<string, string>)[returnPolicy.refund_type] || returnPolicy.refund_type}
                        </td>
                      </tr>
                    )}
                    {returnPolicy.accepts_returns && returnPolicy.proof_requirement && (
                      <tr className="border-t border-gray-100">
                        <td className="px-3 sm:px-4 py-2.5 font-semibold text-gray-600">Proof Requirement</td>
                        <td className="px-3 sm:px-4 py-2.5 text-gray-900">
                          {({ unboxing_video: 'Unboxing Video Required', photos: 'Photos Required', none: 'None Required' } as Record<string, string>)[returnPolicy.proof_requirement] || returnPolicy.proof_requirement}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
        )}
            </div>
          )}

          {activeDetailTab === 'reviews' && (
        <section role="tabpanel" className="pt-2">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-4">
              <h2 className="text-2xl font-bold text-[#0f1111] mb-2 font-[Arial,sans-serif]">Customer reviews</h2>
              <div className="flex items-center gap-2 mb-1">
                <div className="flex items-center gap-0.5 text-[#f69931]">
                  {[...Array(5)].map((_, idx) => (
                    <Star key={idx} size={16} className={idx < Math.round(averageRating) ? 'fill-[#f69931]' : 'text-gray-300'} />
                  ))}
                </div>
                <span className="text-[15px] text-[#0f1111] font-[Arial,sans-serif]">{averageRating.toFixed(1)} out of 5</span>
              </div>
              <p className="text-[13px] text-[#565959] mb-4 font-[Arial,sans-serif]">{reviews.length} global ratings</p>

              <div className="space-y-2.5 mb-6">
                {[5, 4, 3, 2, 1].map((starValue) => {
                  const count = reviews.filter((review) => Math.round(review.rating) === starValue).length;
                  const percentage = reviews.length > 0 ? Math.round((count / reviews.length) * 100) : 0;
                  return (
                    <div key={starValue} className="grid grid-cols-[54px_1fr_40px] items-center gap-2">
                      <span className="text-[13px] text-[#007185] font-[Arial,sans-serif]">{starValue} star</span>
                      <div className="h-5 rounded-sm border border-gray-300 overflow-hidden bg-white">
                        <div className="h-full bg-[#ff6a00]" style={{ width: `${percentage}%` }} />
                      </div>
                      <span className="text-[13px] text-[#007185] text-right font-[Arial,sans-serif]">{percentage}%</span>
                    </div>
                  );
                })}
              </div>

              <div className="border-t border-gray-200 pt-4">
                <h3 className="text-[16px] font-bold text-[#0f1111] mb-1.5 font-[Arial,sans-serif]">Review this product</h3>
                <p className="text-[13px] text-[#565959] mb-3 font-[Arial,sans-serif]">Share your thoughts with other customers</p>
                <button
                  onClick={() => {
                    if (!user) { navigate('/login'); return; }
                    navigate(`/products/${productId}/review`);
                  }}
                  className="w-full h-8 rounded-full border border-[#888c8c] bg-white text-[13px] text-[#0f1111] font-[Arial,sans-serif] hover:bg-gray-50"
                >
                  Write a product review
                </button>
              </div>
            </div>

            <div className="lg:col-span-8">
              {reviews.length === 0 ? (
                <div className="text-sm text-[#565959] font-[Arial,sans-serif]">No reviews yet. Be the first to review.</div>
              ) : (
                <div className="space-y-5">
                  {reviews.slice(0, 4).map((review) => (
                    <article key={review.id} className="border-b border-gray-200 pb-5 last:border-b-0 last:pb-0">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-7 h-7 rounded-full border border-gray-300 bg-gray-100 flex items-center justify-center text-[12px] font-semibold text-[#0f1111] font-[Arial,sans-serif]">
                          {review.reviewerName.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-[13px] text-[#0f1111] font-[Arial,sans-serif]">{review.reviewerName}</span>
                      </div>

                      <div className="flex items-center gap-1.5 mb-1.5">
                        <div className="flex items-center gap-0.5 text-[#f69931]">
                          {[...Array(5)].map((_, idx) => (
                            <Star key={idx} size={14} className={idx < review.rating ? 'fill-[#f69931]' : 'text-gray-300'} />
                          ))}
                        </div>
                        <p className="text-[14px] font-bold text-[#0f1111] line-clamp-1 font-[Arial,sans-serif]">{review.heading || 'Verified Purchase'}</p>
                      </div>

                      <p className="text-[12px] text-[#565959] mb-2 font-[Arial,sans-serif]">Reviewed on {review.date}</p>
                      <p className="text-[14px] text-[#0f1111] leading-5 mb-2.5 font-[Arial,sans-serif]">{review.text}</p>

                      {review.images.length > 0 && (
                        <img
                          src={review.images[0]}
                          className="w-20 h-20 object-cover border border-gray-300 rounded-sm mb-2"
                          alt="Review"
                          onError={(e) => {
                            e.currentTarget.style.opacity = '0';
                          }}
                        />
                      )}

                      <p className="text-[12px] text-[#565959] font-[Arial,sans-serif]">0 people found this helpful</p>
                    </article>
                  ))}

                  {reviews.length > 4 && (
                    <button className="text-[13px] text-[#007185] hover:underline font-[Arial,sans-serif]">See more reviews</button>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>
          )}
        </div>

        {/* Similar Products Section */}
        <section className="mt-16 md:mt-32 pb-12 md:pb-20">
          <h2 className="text-xl md:text-2xl font-semibold mb-8 md:mb-12 uppercase tracking-widest border-l-4 border-yellow-500 pl-4 md:pl-6">
            Similar Products
          </h2>
          {similarProducts.length === 0 ? (
            <div className="text-center py-8 text-gray-400">No similar products found.</div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8">
              {similarProducts.map((item) => (
                <div
                  key={item.id}
                  onClick={() => { navigate(`/products/${(item as any).slug || item.id}`); window.scrollTo(0, 0); }}
                  className="group bg-white border border-black/15 rounded-2xl overflow-hidden hover:border-black/40 transition-all cursor-pointer"
                >
                  <div className="aspect-square bg-gray-50 overflow-hidden">
                    <img
                      src={item.image_url || ''}
                      className="w-full h-full object-cover group-hover:scale-105 transition-all duration-700"
                      alt={item.name}
                      onError={(e) => { e.currentTarget.style.opacity = '0'; }}
                    />
                  </div>
                  <div className="p-3 md:p-6">
                    <p className="text-[9px] font-bold text-gray-500 uppercase mb-1 md:mb-2 font-semibold">{item.brand || ''}</p>
                    <h4 className="text-xs font-semibold text-black line-clamp-1 group-hover:text-gray-700 transition-colors">
                      {item.name}
                    </h4>
                    <p className="text-sm font-bold text-gray-900 mt-2 md:mt-3 font-semibold">
                      {(typeof publicPriceMap[item.id] === 'number' || typeof item.price === 'number')
                        ? formatPrice(
                          typeof publicPriceMap[item.id] === 'number' ? publicPriceMap[item.id] : item.price,
                          item.currency || 'INR'
                        )
                        : (publicPriceLoading ? 'Loading price...' : 'Loading price...')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Review Modal Dialog */}
      {isOffersModalOpen && (
        <div className="fixed inset-0 z-[10001] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl p-5 md:p-6 relative max-h-[85vh] overflow-y-auto border border-gray-200">
            <button
              onClick={() => setIsOffersModalOpen(false)}
              className="absolute top-4 right-4 text-gray-500 hover:text-gray-900"
            >
              <X size={20} />
            </button>
            <h3 className="text-base font-semibold text-gray-900 mb-4">All Offers</h3>
            <div className="space-y-3">
              {activeOffers.map((offer: any) => (
                <div key={offer.id} className="border border-gray-200 rounded-xl p-3 bg-gray-50">
                  <p className="text-sm font-semibold text-gray-900">{formatOfferDisplayTitle(offer)}</p>
                  <p className="text-xs text-green-700 font-semibold mt-1">{formatOfferSummary(offer)}</p>
                  {(offer.start_time || offer.end_time) && (
                    <p className="text-[11px] text-gray-600 mt-1">
                      {offer.start_time ? new Date(offer.start_time).toLocaleDateString() : 'Now'} - {offer.end_time ? new Date(offer.end_time).toLocaleDateString() : 'No end date'}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Size Guide Modal */}
      {isSizeGuideOpen && (() => {
        const theme = resolveVariantTheme(
          product.product_type_slug || '',
          product.sub_category_slug || '',
          product.category_slug || '',
        );
        const charted = theme.sizes.filter(s => s.chart && Object.keys(s.chart).length > 0);
        const regions = charted.length > 0
          ? Array.from(new Set(charted.flatMap(s => Object.keys(s.chart as SizeChart))))
          : [];
        return (
          <div className="fixed inset-0 z-[10003] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-md rounded-lg p-5 md:p-6 relative max-h-[85vh] overflow-y-auto border border-gray-200">
              <button
                onClick={() => setIsSizeGuideOpen(false)}
                className="absolute top-4 right-4 text-gray-500 hover:text-gray-900"
              >
                <X size={20} />
              </button>
              <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2"><Ruler size={16} /> Size Guide</h3>
              {charted.length > 0 ? (
                <div className="overflow-x-auto border border-gray-200 rounded-lg">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left px-3 py-2 text-gray-600 font-semibold">{theme.sizeLabel || 'Size'}</th>
                        {regions.map(r => (
                          <th key={r} className="text-left px-3 py-2 text-gray-600 font-semibold capitalize">{r}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {charted.map(s => (
                        <tr key={s.value} className="border-t border-gray-100">
                          <td className="px-3 py-2 font-semibold text-gray-900">{s.label}</td>
                          {regions.map(r => (
                            <td key={r} className="px-3 py-2 text-gray-700">{(s.chart as Record<string, string>)[r] || '—'}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-gray-500">No size chart available for this product category.</p>
              )}
            </div>
          </div>
        );
      })()}

      <ProductImageLightbox
        images={galleryImages}
        initialIndex={activeImage}
        open={isLightboxOpen}
        onClose={() => setIsLightboxOpen(false)}
        productName={product.name}
        onIndexChange={setActiveImage}
      />

      <div className="hidden md:block">
        <Footer />
      </div>
      <MobileNav />
    </div>
  );
};

export default ProductDetailsPage;
