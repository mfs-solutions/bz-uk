import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Package, Truck } from 'lucide-react';
import { useCart } from '../../contexts/CartContext';
import { useAuth } from '../../contexts/AuthContext';
import { useCurrency } from '../../contexts/CurrencyContext';
import { Header } from '../../components/layout/Header';
import { MobileNav } from '../../components/layout/MobileNav';
import {
  calculateDestinationCheckoutPricing,
  type DestinationCheckoutPricing,
} from '../../lib/checkoutPricingService';
import { fetchPublicProductPrices } from '../../lib/pricingService';
import { supabase } from '../../lib/supabase';
import { formatCurrency, hasCurrencyRate, isExchangeRateUnavailable } from '../../utils/currency';
import { fetchMultiSellerTat, checkDeliveryServiceability } from '../../lib/tatService';
import { Footer } from '../../components/layout/Footer';
import {
  IS_UK_STOREFRONT,
  isUKCountry,
  STOREFRONT_CURRENCY_CODE,
  STOREFRONT_COUNTRY_NAME,
} from '../../config/market';

interface ShippingData {
  street: string;
  street2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  countryCode?: string;
  fullName: string;
  phone: string;
  email: string;
  notes?: string;
  selectedAddressId?: string;
}

const UUID_LIKE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const getProductMetaLabel = (product: { category?: string; category_name?: string | null }) => {
  const rawLabel = String(product.category_name || product.category || '').trim();
  if (!rawLabel) return '';
  if (UUID_LIKE_PATTERN.test(rawLabel)) return '';
  return rawLabel;
};

const OrderSummaryPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { items } = useCart();
  const { user, currentAuthUser } = useAuth();
  const { rates } = useCurrency();

  const [shippingData, setShippingData] = useState<ShippingData | null>(null);
  const [pricing, setPricing] = useState<DestinationCheckoutPricing | null>(null);
  const [pricingLoading, setPricingLoading] = useState(false);
  const [deliveryEstimateLoading, setDeliveryEstimateLoading] = useState(false);
  const [estimatedDeliveryDate, setEstimatedDeliveryDate] = useState<string | null>(null);
  const [selectedCartItemIds, setSelectedCartItemIds] = useState<string[]>([]);
  const [pincodeNotServiceable, setPincodeNotServiceable] = useState(false);
  const [productValidationWarning, setProductValidationWarning] = useState<string | null>(null);
  const [pricingError, setPricingError] = useState<string | null>(null);
  const [shippingTier, setShippingTier] = useState<'standard' | 'premium' | 'express'>('standard');
  const [pincodeCodAvailable, setPincodeCodAvailable] = useState<boolean | null>(null);
  const [proceedError, setProceedError] = useState<string | null>(null);
  const [publicPriceMap, setPublicPriceMap] = useState<Record<string, number>>({});
  const [publicPriceLoading, setPublicPriceLoading] = useState(false);
  const pricingRequestRef = useRef(0);

  const activeCartItems = useMemo(
    () => items.filter((item) => selectedCartItemIds.includes(item.cartItemId)),
    [items, selectedCartItemIds],
  );

  const destinationCountryForPricing = IS_UK_STOREFRONT
    ? STOREFRONT_COUNTRY_NAME
    : shippingData?.country || user?.country || '';

  useEffect(() => {
    const loadPublicPrices = async () => {
      if (!destinationCountryForPricing) {
        setPublicPriceMap({});
        setPublicPriceLoading(true);
        return;
      }

      if (activeCartItems.length === 0) {
        setPublicPriceMap({});
        setPublicPriceLoading(false);
        return;
      }

      setPublicPriceLoading(true);
      const { data } = await fetchPublicProductPrices(
        activeCartItems.map((item) => item.product.id),
        destinationCountryForPricing,
      );
      const map: Record<string, number> = {};
      (data || []).forEach((item) => {
        map[item.productId] = item.publicUnitPrice;
      });
      setPublicPriceMap(map);
      setPublicPriceLoading(false);
    };

    void loadPublicPrices();
  }, [activeCartItems, destinationCountryForPricing]);

  const hasUnresolvedPublicPrices = activeCartItems.some(
    (item) => typeof publicPriceMap[item.product.id] !== 'number'
      && typeof item.variantPrice !== 'number'
      && typeof item.product.price !== 'number'
  );

  const pricingItems = useMemo(
    () => activeCartItems.map((item) => ({
      cartItemId: item.cartItemId,
      productId: item.product.id,
      productName: item.product.name,
      quantity: item.quantity,
      unitPrice: item.variantPrice ?? publicPriceMap[item.product.id] ?? item.product.price ?? 0,
      currency: item.product.currency || 'INR',
      selectedVariantId: item.selectedVariantId,
      selectedVariantSku: item.selectedVariantSku,
      selectedSize: item.selectedSize,
      selectedColor: item.selectedColor,
    })),
    [activeCartItems, publicPriceMap],
  );

  useEffect(() => {
    const savedShipping = localStorage.getItem('beauzead_checkout_shipping');
    try {
      if (savedShipping) {
        const parsedShipping = JSON.parse(savedShipping) as ShippingData;
        if (IS_UK_STOREFRONT && !isUKCountry(parsedShipping.country)) {
          navigate('/checkout/shipping');
          return;
        }
        setShippingData(parsedShipping);
      } else {
        navigate('/checkout/shipping');
      }
    } catch {
      navigate('/checkout/shipping');
    }

    const routeSelected = (location.state as any)?.selectedCartItemIds as string[] | undefined;
    const persisted = localStorage.getItem('beauzead_checkout_selected_cart_ids');
    let parsedPersisted: string[] = [];
    try { parsedPersisted = persisted ? (JSON.parse(persisted) as string[]) : []; } catch { /* corrupted */ }
    let shippingSelected: string[] | undefined;
    try { shippingSelected = savedShipping ? (JSON.parse(savedShipping)?.selectedCartItemIds as string[] | undefined) : undefined; } catch { /* corrupted */ }
    const selectedSource = routeSelected?.length ? routeSelected : (shippingSelected?.length ? shippingSelected : parsedPersisted);

    if (selectedSource?.length) {
      setSelectedCartItemIds(selectedSource);
      localStorage.setItem('beauzead_checkout_selected_cart_ids', JSON.stringify(selectedSource));
    } else {
      const allIds = items.map((item) => item.cartItemId);
      setSelectedCartItemIds(allIds);
      localStorage.setItem('beauzead_checkout_selected_cart_ids', JSON.stringify(allIds));
    }

    if (items.length === 0) {
      navigate('/cart');
      return;
    }

    if (selectedCartItemIds.length > 0 && activeCartItems.length === 0) {
      navigate('/cart');
    }
  }, [items, selectedCartItemIds.length, activeCartItems.length, location.state, navigate]);

  useEffect(() => {
    const destinationCountry = destinationCountryForPricing;
    if (pricingItems.length === 0) {
      setPricing(null);
      setPricingLoading(false);
      setEstimatedDeliveryDate(null);
      return;
    }

    if (hasUnresolvedPublicPrices) {
      setPricingLoading(false);
      setEstimatedDeliveryDate(null);
      return;
    }

    const requestId = pricingRequestRef.current + 1;
    pricingRequestRef.current = requestId;
    setPricingLoading(true);
    setDeliveryEstimateLoading(true);
    setPricingError(null);

    void (async () => {
      try {
        const data = await calculateDestinationCheckoutPricing({
          items: pricingItems,
          destinationCountry,
          destinationPostalCode: shippingData?.postalCode || '',
          rates,
        });
        if (pricingRequestRef.current !== requestId) return;
        setPricing(data);

        // Validate products have weight configured (required for shipping)
        const productIds = activeCartItems.map((item) => item.product.id);
        const { data: productWeights } = await supabase
          .from('products')
          .select('id, name, package_weight')
          .in('id', productIds);
        if (pricingRequestRef.current !== requestId) return;
        const missingWeight = (productWeights || []).filter((p: any) => !p.package_weight || Number(p.package_weight) <= 0);
        if (missingWeight.length > 0) {
          const names = missingWeight.map((p: any) => p.name).join(', ');
          setProductValidationWarning(`Missing package weight for: ${names}. Shipping cost may be inaccurate.`);
        } else {
          setProductValidationWarning(null);
        }

        // Check serviceability BEFORE TAT — only for domestic orders
        const destinationPin = String(shippingData?.postalCode || '').replace(/\s+/g, '');
        const userId = user?.id || (currentAuthUser as any)?.userId || '';

        // Resolve actual seller ID from cart items (serviceability needs the seller's pickup pincode)
        const firstSellerId = activeCartItems[0]?.product?.seller_id || '';

        // Determine if this is an international order (destination is NOT India)
        const destCountryToken = (destinationCountry || '').trim().toUpperCase().replace(/\s+/g, '');
        const isInternationalOrder = Boolean(destCountryToken) && !['INDIA', 'IN', 'IND'].includes(destCountryToken);

        if (!isInternationalOrder && destinationPin.length === 6) {
          const svcResult = await checkDeliveryServiceability(destinationPin, firstSellerId || userId);
          if (pricingRequestRef.current !== requestId) return;
          setPincodeNotServiceable(!svcResult.serviceable);
          // Extract pincode-level COD availability
          setPincodeCodAvailable(svcResult.codAvailable ?? false);
          if (!svcResult.serviceable) {
            setDeliveryEstimateLoading(false);
            return;
          }
        } else if (isInternationalOrder) {
          // International orders — skip domestic serviceability check; COD never available
          setPincodeNotServiceable(false);
          setPincodeCodAvailable(false);
        }

        // Compute estimated delivery date — use carrier-aware TAT for domestic
        if (!isInternationalOrder) {
          const tatResult = await fetchMultiSellerTat(productIds, destinationPin, userId);
          if (pricingRequestRef.current !== requestId) return;
          if (tatResult.maxTatDays > 0 && tatResult.maxExpectedDate) {
            setEstimatedDeliveryDate(
              new Date(tatResult.maxExpectedDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }),
            );
          } else {
            setEstimatedDeliveryDate(null);
          }
        } else {
          // International: TAT is not available via domestic APIs; clear estimate
          setEstimatedDeliveryDate(null);
        }
        setDeliveryEstimateLoading(false);
      } catch (err) {
        console.error('Failed to refresh checkout pricing:', err);
        if (pricingRequestRef.current === requestId) {
          setPricingError(err instanceof Error
            ? err.message
            : 'Unable to load backend checkout configuration. Please refresh and try again.');
          setPricing(null);
        }
        if (pricingRequestRef.current === requestId) {
          setDeliveryEstimateLoading(false);
        }
      } finally {
        if (pricingRequestRef.current === requestId) {
          setPricingLoading(false);
        }
      }
    })();
  }, [destinationCountryForPricing, shippingData?.postalCode, pricingItems, rates, activeCartItems, hasUnresolvedPublicPrices]);

  const pricingByProductId = useMemo(
    () => new Map((pricing?.items || []).map((item) => [item.productId, item])),
    [pricing]
  );
  const pricingByCartItemId = useMemo(
    () => new Map((pricing?.items || []).filter((item) => item.cartItemId).map((item) => [item.cartItemId!, item])),
    [pricing],
  );
  const getPricingLine = (cartItem: (typeof activeCartItems)[number]) => (
    pricingByCartItemId.get(cartItem.cartItemId)
    || (cartItem.selectedVariantId || cartItem.selectedVariantSku || cartItem.selectedSize || cartItem.selectedColor
      ? undefined
      : pricingByProductId.get(cartItem.product.id))
  );
  const targetCurrency = (
    pricing?.currency || (IS_UK_STOREFRONT ? STOREFRONT_CURRENCY_CODE : 'INR')
  ).toUpperCase();
  const requiresFxConversion = Boolean(
    pricing?.items?.some((line) => String(line.sourceCurrency || '').toUpperCase() !== targetCurrency)
  );
  const fxUnavailableForCheckout = IS_UK_STOREFRONT
    ? !hasCurrencyRate(STOREFRONT_CURRENCY_CODE, rates)
      || Boolean(pricing?.items?.some((line) =>
        String(line.sourceCurrency || '').toUpperCase() !== STOREFRONT_CURRENCY_CODE
        && !hasCurrencyRate(line.sourceCurrency, rates)))
    : requiresFxConversion && isExchangeRateUnavailable();

  // Determine if this is an international order in the render scope
  const destCountryForRender = (shippingData?.country || user?.country || '').trim().toUpperCase().replace(/\s+/g, '');
  const isInternationalOrder = Boolean(destCountryForRender) && !['INDIA', 'IN', 'IND'].includes(destCountryForRender);
  const isIndiaDestinationOrder = ['INDIA', 'IN', 'IND'].includes(destCountryForRender);

  // Final COD eligibility: pricing-level check + pincode-level COD check (India domestic only)
  const finalCodEligible = !isInternationalOrder && (pricing?.codEligible ?? false) && (pincodeCodAvailable === true);

  // SL30: Block checkout if any item is missing a converted price (prevents wrong-currency fallback)
  const hasMissingConvertedPrices = Boolean(
    pricing && activeCartItems.some((item) => !getPricingLine(item)?.convertedUnitPrice)
  );

  const intlOptions = pricing?.intlShippingOptions;
  const ukDomOptions = pricing?.ukDomesticShippingOptions;
  // Unified tier options — international OR UK domestic (both use Shippo tiers)
  const tierOptions = intlOptions || ukDomOptions || null;
  const activeOption = tierOptions
    ? (shippingTier === 'express' && tierOptions.express
        ? tierOptions.express
        : shippingTier === 'premium' && tierOptions.premium
          ? tierOptions.premium
          : tierOptions.standard)
    : null;

  const displayShipping = activeOption ? activeOption.shipping : (pricing?.shipping || 0);
  const displayTotal = activeOption ? activeOption.total : (pricing?.total || 0);
  const intlShippingError = pricing?.intlShippingError;
  const domesticShippingError = pricing?.domesticShippingError;
  const shippingNotServiceable = Boolean(intlShippingError || domesticShippingError);
  const minimumOrderConstraint = pricing?.minimumOrderConstraint;
  const minimumOrderNotMet = Boolean(minimumOrderConstraint && !minimumOrderConstraint.isMet);


  const isPricingReady = Boolean(
    !pricingLoading
    && !publicPriceLoading
    && !hasUnresolvedPublicPrices
    && !deliveryEstimateLoading
    && !pincodeNotServiceable
    &&
    pricing
    && displayTotal > 0
    && !fxUnavailableForCheckout
    && !shippingNotServiceable
    && !hasMissingConvertedPrices
    && !minimumOrderNotMet
    && !pricingError
    && !productValidationWarning
  );

  const calculateTotal = () => displayTotal;

  const handleProceedToPayment = async () => {
    setProceedError(null);

    const userId = user?.id || currentAuthUser?.userId;
    if (!userId) {
      navigate('/login', { state: { from: '/checkout/shipping' } });
      return;
    }

    if (!shippingData) {
      navigate('/checkout/shipping');
      return;
    }

    if (pricingLoading || deliveryEstimateLoading) {
      setProceedError('Shipping charges and delivery estimate are still refreshing. Please wait a moment.');
      return;
    }

    if (publicPriceLoading || hasUnresolvedPublicPrices) {
      setProceedError('Final item prices are still loading. Please wait a moment.');
      return;
    }

    if (pricingError) {
      setProceedError(pricingError);
      return;
    }

    if (!pricing || pricing.total <= 0) {
      setProceedError('Pricing is still loading. Please wait a moment and try again.');
      return;
    }

    if (fxUnavailableForCheckout) {
      setProceedError('Live currency conversion is temporarily unavailable. Please try again in a moment.');
      return;
    }

    if (hasMissingConvertedPrices) {
      setProceedError('Some items could not be priced in your checkout currency. Please refresh or try again.');
      return;
    }

    if (productValidationWarning) {
      setProceedError('Some products are missing package weight information required for accurate shipping. Please contact the seller.');
      return;
    }

    if (pincodeNotServiceable) {
      setProceedError('Your pincode is not a serviceable area. Please try with another pincode.');
      return;
    }

    if (minimumOrderNotMet) {
      return;
    }

    // M14: Re-check stock at payment stage
    try {
      const productIds = activeCartItems.map((item) => item.product.id);
      const { data: freshProducts } = await supabase
        .from('products')
        .select('id, stock, name')
        .in('id', productIds);
      if (freshProducts) {
        const stockMap = new Map(freshProducts.map((p) => [p.id, p]));
        const outOfStock: string[] = [];
        for (const item of activeCartItems) {
          const fresh = stockMap.get(item.product.id);
          if (!fresh || fresh.stock < item.quantity) {
            outOfStock.push(fresh?.name || item.product.name);
          }
        }
        if (outOfStock.length > 0) {
          setProceedError(`Insufficient stock for: ${outOfStock.join(', ')}. Please update quantities or remove items.`);
          return;
        }
      }
    } catch {
      setProceedError('Could not verify stock availability. Please try again.');
      return;
    }

    const checkoutItems = activeCartItems
      .map((item) => {
        const pricingLine = getPricingLine(item);
        return pricingLine ? { item, pricingLine } : null;
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
    if (checkoutItems.length !== activeCartItems.length) {
      setProceedError('A selected item or variant price could not be verified. Return to your cart and select it again.');
      return;
    }

    navigate('/checkout/payment', {
      state: {
        items: checkoutItems.map(({ item, pricingLine }) => ({
          cartItemId: item.cartItemId,
          productId: item.product.id,
          productName: item.product.name,
          quantity: item.quantity,
          price: pricingLine.convertedUnitPrice,
          buyerUnitPrice: pricingLine.convertedUnitPrice,
          sellerId: item.product.seller_id,
          selectedSize: item.selectedSize || undefined,
          selectedColor: item.selectedColor || undefined,
          selectedVariantId: pricingLine.selectedVariantId || item.selectedVariantId || undefined,
          selectedVariantSku: pricingLine.selectedVariantSku || item.selectedVariantSku || undefined,
          productImage: item.product.image_url || (item.product.images?.[0]) || '',
        })),
        totalAmount: calculateTotal(),
        subtotalAmount: pricing?.subtotal || 0,
        buyerProductSubtotalAmount: (pricing?.subtotal || 0) - (pricing?.offerDiscount || 0),
        shippingAmount: displayShipping,
        platformChargeAmount: pricing?.platformHandlingCharge || 0,
        actualShippingCost: pricing?.actualShippingCost || 0,
        platformShippingMargin: pricing?.platformShippingMargin || 0,
        shippingTier: tierOptions ? shippingTier : undefined,
        estimatedDeliveryDate: activeOption?.etd || undefined,
        estimatedDeliveryDays: activeOption?.estimatedDays || undefined,
        shippingCarrier: activeOption?.carrierName || undefined,
        shippingServiceLevel: activeOption?.serviceLevel || undefined,
        shippingRateId: activeOption?.rateId || undefined,
        shippingProvider: activeOption?.provider || (!isInternationalOrder && isIndiaDestinationOrder ? 'shiprocket' : undefined),
        currency: targetCurrency,
        shippingAddress: {
          street: shippingData.street,
          city: shippingData.city,
          state: shippingData.state,
          postalCode: shippingData.postalCode,
          country: shippingData.country,
          countryCode: shippingData.countryCode,
        },
        customerId: userId,
        customerEmail: shippingData?.email || user?.email || '',
        customerName: shippingData?.fullName || user?.full_name || user?.first_name || '',
        customerPhone: shippingData.phone,
        notes: shippingData.notes,
        codEligible: finalCodEligible,
        codIneligibleItems: pricing?.codIneligibleItems || [],
      },
    });
  };

  if (!shippingData) {
    return (
      <div className="min-h-screen bg-gray-50 py-8 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Loading order details...</p>
        </div>
      </div>
    );
  }

  return (
    <>
    <Header />
    <div className="min-h-screen bg-[#eaeded] py-4">
      <div className="max-w-[1100px] mx-auto px-3 sm:px-4 pb-24 md:pb-5">
        <h1 className="mb-4 text-xl font-bold text-[#0f1111]">Order Summary</h1>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5">
          <div className="space-y-2 sm:space-y-4">
            <div className="bg-white border border-[#ddd] rounded-lg p-4 sm:p-5">
              <h2 className="text-[15px] font-bold text-[#0f1111] mb-3 flex items-center justify-between gap-3">
                <span>Deliver to:</span>
                <button
                  onClick={() => navigate('/checkout/shipping')}
                  className="text-[#007185] hover:text-[#c7511f] border border-[#ddd] rounded px-3 py-1.5 text-[13px] font-medium cursor-pointer"
                >
                  Change
                </button>
              </h2>
              <div>
                <p className="font-bold text-[14px] text-[#0f1111]">{shippingData.fullName}</p>
                <div className="text-[13px] text-[#555] mt-1 leading-relaxed">
                  <p>{shippingData.street}</p>
                  {shippingData.street2 && <p>{shippingData.street2}</p>}
                  <p>{shippingData.city}, {shippingData.state} {shippingData.postalCode}</p>
                  <p>{shippingData.country}</p>
                  <p>Phone: {shippingData.phone}</p>
                </div>
                {shippingData.notes && (
                  <div className="mt-2.5 pt-2.5 border-t border-[#ddd]">
                    <p className="text-[12px] text-[#555] font-semibold">Delivery Notes:</p>
                    <p className="text-[13px] text-[#555]">{shippingData.notes}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white border border-[#ddd] rounded-lg p-4 sm:p-5">
              <h2 className="text-[15px] font-bold text-[#0f1111] mb-3">
                Items & Delivery
              </h2>

              {/* Delivery estimate banner — Shiprocket TAT for India, tier-based for UK/Intl */}
              {estimatedDeliveryDate && (
                <div className="bg-[#f0faf0] border border-[#c3e6cb] rounded-md p-2.5 mb-4 text-[13px]">
                  <strong className="text-[#067d62]">Estimated Delivery:</strong> {estimatedDeliveryDate}
                </div>
              )}
              {!estimatedDeliveryDate && activeOption?.estimatedDays && !pricingLoading && (
                <div className="bg-[#f0faf0] border border-[#c3e6cb] rounded-md p-2.5 mb-4 text-[13px]">
                  <strong className="text-[#067d62]">Estimated Delivery:</strong> {activeOption.estimatedDays} business days
                </div>
              )}
              {deliveryEstimateLoading && !estimatedDeliveryDate && !activeOption?.estimatedDays && (
                <div className="bg-[#f0faf0] border border-[#c3e6cb] rounded-md p-2.5 mb-4 text-[13px]">
                  <strong className="text-[#067d62]">Estimated Delivery:</strong> calculating from shipping configuration...
                </div>
              )}
              {/* L6: Fallback for international orders when no estimate is available */}
              {isInternationalOrder && !estimatedDeliveryDate && !activeOption?.estimatedDays && !deliveryEstimateLoading && !pricingLoading && (
                <div className="bg-[#f0faf0] border border-[#c3e6cb] rounded-md p-2.5 mb-4 text-[13px]">
                  <strong className="text-[#067d62]">Estimated Delivery:</strong> Varies by destination — contact support for estimates
                </div>
              )}

              <div>
                {activeCartItems.map((item) => {
                  const categoryLabel = getProductMetaLabel(item.product);
                  const productImgSrc = item.product.images?.[0] || item.product.image_url;

                  return (
                    <div
                      key={item.cartItemId}
                      className="flex gap-3 py-3 border-b border-[#eee] last:border-b-0"
                    >
                      {productImgSrc ? (
                        <img
                          src={productImgSrc}
                          alt={item.product.name}
                          className="w-16 h-16 sm:w-20 sm:h-20 object-contain rounded-md border border-[#eee] bg-white flex-shrink-0"
                        />
                      ) : (
                        <div className="w-16 h-16 sm:w-20 sm:h-20 bg-[#f7f7f7] rounded-md border border-[#eee] flex items-center justify-center flex-shrink-0">
                          <Package size={28} className="text-gray-400" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-medium text-[#0f1111] leading-snug line-clamp-2">{item.product.name}</p>
                        {(item.selectedSize || item.selectedColor) && (
                          <p className="text-[12px] text-[#666] mt-0.5">
                            {`Size: ${item.selectedSize || 'N/A'} • Color: ${item.selectedColor || 'N/A'}`}
                          </p>
                        )}
                        {categoryLabel && <p className="text-[12px] text-[#666]">{categoryLabel}</p>}
                        <div className="flex items-center gap-4 mt-1.5">
                          <span className="text-[15px] font-bold text-[#b12704]">
                            {getPricingLine(item)?.convertedUnitPrice
                              ? formatCurrency(getPricingLine(item)!.convertedUnitPrice, targetCurrency)
                              : <span className="text-gray-400 text-xs animate-pulse">Pricing…</span>}
                          </span>
                          <span className="text-[12px] text-[#555] bg-[#f0f0f0] px-2.5 py-0.5 rounded">Qty: {item.quantity}</span>
                        </div>
                        {(getPricingLine(item)?.offerDiscount || 0) > 0 && (
                          <p className="text-[12px] text-[#067d62] font-semibold mt-1">
                            -{formatCurrency(getPricingLine(item)?.offerDiscount || 0, targetCurrency)} offer
                          </p>
                        )}
                        {getPricingLine(item)?.minQuantityWarning && (
                          <p className="text-[12px] text-amber-600 font-medium mt-0.5">
                            {getPricingLine(item)?.minQuantityWarning}
                          </p>
                        )}
                        <p className="text-[12px] text-[#067d62] font-semibold mt-1">✓ {(!pricing || pricingLoading) ? <span className="animate-pulse text-gray-400">Calculating delivery...</span> : (pricing.shipping || 0) === 0 ? 'FREE Delivery' : 'Delivery Included'}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div>
            <div className="bg-white border border-[#ddd] rounded-lg p-5 sticky top-5">
              <h2 className="text-[16px] font-bold text-[#0f1111] mb-4">Price Details</h2>

              <div className="space-y-2 mb-3">
                {pricingLoading && (
                  <div className="text-xs text-gray-400">Checking configured shipping table, then carrier fallback...</div>
                )}
                {deliveryEstimateLoading && (
                  <div className="text-xs text-gray-400">Fetching delivery date...</div>
                )}
                <div className="flex justify-between text-[14px]">
                  <span className="text-[#555]">Items ({activeCartItems.length})</span>
                  <span>{formatCurrency(pricing ? pricing.subtotal : Number.NaN, targetCurrency)}</span>
                </div>
                {(pricing?.offerDiscount || 0) > 0 && (
                  <div className="flex justify-between text-[14px] text-[#067d62] font-semibold">
                    <span>Savings</span>
                    <span>-{formatCurrency(pricing?.offerDiscount || 0, targetCurrency)}</span>
                  </div>
                )}
                <div className="flex justify-between text-[14px]">
                  <span className="text-[#555]">Shipping</span>
                  {shippingNotServiceable
                    ? <span className="text-[#b12704] font-semibold text-xs">Not a Serviceable Area</span>
                    : (!pricing || pricingLoading)
                      ? <span className="text-gray-400 text-xs animate-pulse">Calculating...</span>
                      : <span className="text-[#067d62] font-semibold">{(displayShipping || 0) === 0 && !pricing.hasInternationalItems ? 'FREE' : formatCurrency(displayShipping, targetCurrency)}</span>
                  }
                </div>

                {/* COD availability — only for India domestic orders */}
                {!isInternationalOrder && !pricingLoading && !deliveryEstimateLoading && pricing && (
                  <div className="flex justify-between text-[14px]">
                    <span className="text-[#555]">Cash on Delivery</span>
                    {finalCodEligible
                      ? <span className="text-[#067d62] font-semibold">Available ✓</span>
                      : <span className="text-[#b12704] font-semibold text-xs">Not Available</span>
                    }
                  </div>
                )}

                {shippingNotServiceable && (
                  <div className="bg-red-50 border border-red-200 rounded-md p-3 mt-2 text-xs text-red-700 flex items-center gap-2">
                    <svg className="w-4 h-4 flex-shrink-0 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
                    <span>{intlShippingError || domesticShippingError}</span>
                  </div>
                )}

                {/* International shipping tier selector — Temu/Shein style */}
                {tierOptions && !pricingLoading && (
                  <div className="mt-4 space-y-2.5">
                    <p className="text-xs font-bold text-gray-800 uppercase tracking-wider">Choose Delivery Speed</p>

                    {/* Standard tier card */}
                    <label
                      className={`relative flex items-center gap-3 cursor-pointer rounded-xl border-2 p-3.5 transition-all ${
                        shippingTier === 'standard'
                          ? 'border-emerald-500 bg-emerald-50/60 shadow-sm'
                          : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50/50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="shippingTier"
                        value="standard"
                        checked={shippingTier === 'standard'}
                        onChange={() => setShippingTier('standard')}
                        className="sr-only"
                      />
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                        shippingTier === 'standard' ? 'border-emerald-500' : 'border-gray-300'
                      }`}>
                        {shippingTier === 'standard' && <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-gray-900">Standard</span>
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Best Value</span>
                          </div>
                          <span className="text-sm font-bold text-gray-900">
                            {formatCurrency(tierOptions.standard.shipping, targetCurrency)}
                          </span>
                        </div>
                        {tierOptions.standard.carrierName && (
                          <p className="text-[11px] text-gray-500 mt-0.5">
                            via {tierOptions.standard.carrierName}{tierOptions.standard.serviceLevel ? ` · ${tierOptions.standard.serviceLevel}` : ''}
                          </p>
                        )}
                        {estimatedDeliveryDate ? (
                          <p className="text-xs text-gray-500 mt-0.5">
                            Estimated Delivery: {estimatedDeliveryDate}
                          </p>
                        ) : tierOptions.standard.estimatedDays && (
                          <p className="text-xs text-gray-500 mt-0.5">
                            {tierOptions.standard.estimatedDays} business days
                            {tierOptions.standard.etd ? ` · ${tierOptions.standard.etd}` : ''}
                          </p>
                        )}
                      </div>
                    </label>

                    {/* Premium tier card */}
                    {tierOptions.premium && (
                      <label
                        className={`relative flex items-center gap-3 cursor-pointer rounded-xl border-2 p-3.5 transition-all ${
                          shippingTier === 'premium'
                            ? 'border-blue-500 bg-blue-50/60 shadow-sm'
                            : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50/50'
                        }`}
                      >
                        <input
                          type="radio"
                          name="shippingTier"
                          value="premium"
                          checked={shippingTier === 'premium'}
                          onChange={() => setShippingTier('premium')}
                          className="sr-only"
                        />
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                          shippingTier === 'premium' ? 'border-blue-500' : 'border-gray-300'
                        }`}>
                          {shippingTier === 'premium' && <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-gray-900">Premium</span>
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">Priority</span>
                            </div>
                            <span className="text-sm font-bold text-gray-900">
                              {formatCurrency(tierOptions.premium.shipping, targetCurrency)}
                            </span>
                          </div>
                          {tierOptions.premium.carrierName && (
                            <p className="text-[11px] text-gray-500 mt-0.5">
                              via {tierOptions.premium.carrierName}{tierOptions.premium.serviceLevel ? ` · ${tierOptions.premium.serviceLevel}` : ''}
                            </p>
                          )}
                          {estimatedDeliveryDate ? (
                            <p className="text-xs text-gray-500 mt-0.5">
                              Estimated Delivery: {estimatedDeliveryDate}
                            </p>
                          ) : tierOptions.premium.estimatedDays && (
                            <p className="text-xs text-gray-500 mt-0.5">
                              {tierOptions.premium.estimatedDays} business days
                              {tierOptions.premium.etd ? ` · ${tierOptions.premium.etd}` : ''}
                            </p>
                          )}
                        </div>
                      </label>
                    )}

                    {/* Express tier card */}
                    {tierOptions.express && (
                      <label
                        className={`relative flex items-center gap-3 cursor-pointer rounded-xl border-2 p-3.5 transition-all ${
                          shippingTier === 'express'
                            ? 'border-orange-500 bg-orange-50/60 shadow-sm'
                            : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50/50'
                        }`}
                      >
                        <input
                          type="radio"
                          name="shippingTier"
                          value="express"
                          checked={shippingTier === 'express'}
                          onChange={() => setShippingTier('express')}
                          className="sr-only"
                        />
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                          shippingTier === 'express' ? 'border-orange-500' : 'border-gray-300'
                        }`}>
                          {shippingTier === 'express' && <div className="w-2.5 h-2.5 rounded-full bg-orange-500" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-gray-900">Express</span>
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700">Fastest</span>
                            </div>
                            <span className="text-sm font-bold text-gray-900">
                              {formatCurrency(tierOptions.express.shipping, targetCurrency)}
                            </span>
                          </div>
                          {tierOptions.express.carrierName && (
                            <p className="text-[11px] text-gray-500 mt-0.5">
                              via {tierOptions.express.carrierName}{tierOptions.express.serviceLevel ? ` · ${tierOptions.express.serviceLevel}` : ''}
                            </p>
                          )}
                          {tierOptions.express.estimatedDays && (
                            <p className="text-xs text-gray-500 mt-0.5">
                              {tierOptions.express.estimatedDays} business days
                              {tierOptions.express.etd ? ` · ${tierOptions.express.etd}` : ''}
                            </p>
                          )}
                        </div>
                      </label>
                    )}
                  </div>
                )}

                {/* Delivery estimate for India domestic orders (from Shiprocket TAT) */}
                {!tierOptions && estimatedDeliveryDate && (
                  <div className="flex items-center gap-2 text-[13px] text-[#555] mt-1">
                    <Truck size={14} className="text-[#067d62]" />
                    <span>Est. Delivery: <span className="font-semibold text-[#0f1111]">{estimatedDeliveryDate}</span></span>
                  </div>
                )}
                {deliveryEstimateLoading && !estimatedDeliveryDate && !tierOptions && (
                  <div className="flex items-center gap-2 text-[13px] text-[#555] mt-1">
                    <Truck size={14} className="text-[#067d62]" />
                    <span>Est. Delivery: calculating...</span>
                  </div>
                )}
              </div>

              {fxUnavailableForCheckout && (
                <div className="mb-4 rounded-lg border border-blue-700 bg-blue-800 px-3 py-2 text-sm text-white">
                  Live currency conversion is temporarily unavailable. Please try again in a moment.
                </div>
              )}

              {hasMissingConvertedPrices && !pricingLoading && (
                <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-700 font-semibold">
                  Some item prices could not be converted to your currency. Please refresh the page.
                </div>
              )}

              {pincodeNotServiceable && (
                <div className="mb-4 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 font-semibold">
                  Your pincode is not a serviceable area. Please try with another pincode.
                </div>
              )}

              {minimumOrderNotMet && minimumOrderConstraint && (
                <div className="mb-4 rounded-lg bg-[#0B2A66] px-4 py-3 text-sm text-white">
                  <p className="font-semibold">Minimum product value for shipment is <strong>{formatCurrency(minimumOrderConstraint.minimumInCheckoutCurrency, targetCurrency)}</strong></p>
                  <p className="mt-1 text-white/80 text-xs">Add more items to complete your order.</p>
                </div>
              )}

              {productValidationWarning && (
                <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                  {productValidationWarning}
                </div>
              )}

              {pricingError && (
                <div className="mb-4 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 font-semibold">
                  {pricingError}
                </div>
              )}

              {!minimumOrderNotMet && (
                <div className="border-t-2 border-[#ddd] pt-3 mt-3 mb-4">
                  <div className="flex justify-between text-[18px] font-bold text-[#b12704]">
                    <span>Order Total</span>
                    <span>{formatCurrency(pricing ? calculateTotal() : Number.NaN, targetCurrency)}</span>
                  </div>
                </div>
              )}

              {proceedError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-3">
                  {proceedError}
                </div>
              )}

              {minimumOrderNotMet ? (
                <button
                  onClick={() => navigate('/cart')}
                  className="w-full py-3.5 bg-[#0B2A66] hover:bg-[#081F4D] text-white rounded-lg text-[15px] font-bold cursor-pointer transition-colors"
                >
                  ← Back to Cart
                </button>
              ) : (
                <button
                  onClick={handleProceedToPayment}
                  disabled={!isPricingReady}
                  className="w-full py-3.5 bg-[#ffd814] hover:bg-[#f7ca00] border border-[#fcd200] disabled:bg-gray-200 disabled:border-gray-300 text-[#0f1111] rounded-lg text-[15px] font-bold cursor-pointer transition-colors"
                >
                  {pricingLoading
                    ? 'Refreshing Shipping...'
                    : deliveryEstimateLoading
                      ? 'Fetching Delivery Date...'
                    : pincodeNotServiceable
                      ? 'Pincode not serviceable'
                    : pricingError
                      ? 'Checkout config unavailable'
                    : isPricingReady
                      ? 'Proceed to Payment'
                      : 'Resolve checkout issues to continue'}
                </button>
              )}

              <div className="flex items-center justify-center gap-1.5 text-[12px] text-[#067d62] mt-3">
                🔒 Secure checkout powered by Stripe
              </div>

              <hr className="border-t border-[#eee] my-4" />

              {!IS_UK_STOREFRONT && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[12px] text-[#555]">Accepted:</span>
                  <span className="px-2 py-1 bg-[#f0f0f0] rounded text-[11px] font-semibold text-[#555]">Visa</span>
                  <span className="px-2 py-1 bg-[#f0f0f0] rounded text-[11px] font-semibold text-[#555]">Mastercard</span>
                  <span className="px-2 py-1 bg-[#f0f0f0] rounded text-[11px] font-semibold text-[#555]">RuPay</span>
                  <span className="px-2 py-1 bg-[#f0f0f0] rounded text-[11px] font-semibold text-[#555]">UPI</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      </div>
      <MobileNav />
    <Footer />
    </>
  );
};

export default OrderSummaryPage;
