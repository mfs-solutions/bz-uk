import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Header } from '../../components/layout/Header';
import { Footer } from '../../components/layout/Footer';

import { ListSkeleton } from '../../components/common/Skeleton';
import { ToastContainer } from '../../components/common/ToastContainer';
import { useToast } from '../../hooks/useToast';
import { useAuth } from '../../contexts/AuthContext';
import { useCart } from '../../contexts/CartContext';
import { useCurrency } from '../../contexts/CurrencyContext';
import { useWishlist } from '../../contexts/WishlistContext';
import { useNavigate, Link } from 'react-router-dom';
import { ShoppingCart, Loader2, AlertTriangle, Trash2, Heart } from 'lucide-react';
import {
  calculateCheckoutPricing,
  fetchPublicProductPrices,
  fetchVerifiedVariantPrices,
  type CheckoutPricingResult,
} from '../../lib/pricingService';
import { clearQueryCache } from '../../lib/queryCache';
import { fetchProductById } from '../../lib/productService';
import { useDestinationCountry } from '../../hooks/useDestinationCountry';
import { isNativePlatform } from '../../mobile/nativePlatform';

export const CartPage: React.FC = () => {
  const { user, currentAuthUser } = useAuth();
  const { items: cartItems, removeFromCart, removeFromCartConfirmed, updateQuantity } = useCart();
  const { formatPrice, convertPrice, currency } = useCurrency();
  const { addToWishlistConfirmed } = useWishlist();
  const toast = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [checkingOut, setCheckingOut] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [pricing, setPricing] = useState<CheckoutPricingResult | null>(null);
  const [pricingLoading, setPricingLoading] = useState(false);
  const [pricingFailed, setPricingFailed] = useState(false);
  // publicPriceMap: markup prices from get_public_product_prices RPC (same source as
  // home page / product details page). This is the single source of truth for display
  // prices and is NOT affected by the calculateCheckoutPricing country timing issue.
  const [publicPriceMap, setPublicPriceMap] = useState<Record<string, number>>({});
  const [variantPriceMap, setVariantPriceMap] = useState<Record<string, number>>({});
  const [variantPriceError, setVariantPriceError] = useState<string | null>(null);
  const [, setPublicPriceLoading] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [wishlistMovingId, setWishlistMovingId] = useState<string | null>(null);
  const wishlistMoveInProgress = useRef(false);

  useEffect(() => {
    if (!user && !currentAuthUser) {
      navigate('/login');
      return;
    }
    setLoading(false);
  }, [user, currentAuthUser, navigate]);

  const handleUpdateQuantity = (cartItemId: string, newQuantity: number) => {
    if (newQuantity < 1) {
      setConfirmRemoveId(cartItemId);
      return;
    }
    // M2: Cap quantity at available stock
    const cartItem = cartItems.find((i) => i.cartItemId === cartItemId);
    if (cartItem && newQuantity > cartItem.product.stock) {
      return;
    }
    setUpdatingId(cartItemId);
    updateQuantity(cartItemId, newQuantity);
    setTimeout(() => setUpdatingId(null), 300);
  };

  const handleRemoveItem = (cartItemId: string) => {
    setUpdatingId(cartItemId);
    removeFromCart(cartItemId);
    setTimeout(() => {
      setUpdatingId(null);
      setConfirmRemoveId(null);
    }, 300);
  };

  const handleAddToWishlist = async (cartItem: (typeof cartItems)[0]) => {
    if (wishlistMoveInProgress.current) return;
    wishlistMoveInProgress.current = true;
    setWishlistMovingId(cartItem.cartItemId);
    let added = false;
    try {
      const userId = user?.id || currentAuthUser?.userId;
      if (!userId) throw new Error('Please sign in to update your wishlist.');
      await addToWishlistConfirmed(cartItem.product, userId);
      added = true;
      await removeFromCartConfirmed(cartItem.cartItemId);
      toast.success('Product added to wishlist');
    } catch (error) {
      console.error('Unable to move cart item to wishlist:', error);
      toast.error(added
        ? 'Product was added to your wishlist, but could not be removed from your cart.'
        : 'Could not add product to your wishlist. Please try again.');
    } finally {
      wishlistMoveInProgress.current = false;
      setWishlistMovingId(null);
    }
  };

  const selectedCountry = useDestinationCountry({
    userId: user?.id || currentAuthUser?.userId || null,
    userCountry: user?.country || '',
  });

  useEffect(() => {
    setSelectedItemIds((prev) => {
      const available = new Set(cartItems.map((item) => item.cartItemId));
      const stillSelected = prev.filter((id) => available.has(id));
      if (stillSelected.length === 0 && cartItems.length > 0) {
        return cartItems.map((item) => item.cartItemId);
      }
      return stillSelected;
    });
  }, [cartItems]);

  const selectedCartItems = useMemo(
    () => cartItems.filter((item) => selectedItemIds.includes(item.cartItemId)),
    [cartItems, selectedItemIds]
  );

  // Fetch per-item markup prices (same RPC used by home/product pages).
  // selectedCountry may be empty on first render; the effect re-runs when it resolves.
  useEffect(() => {
    let cancelled = false;
    const loadPublicPrices = async () => {
      if (!selectedCountry) {
        setPublicPriceMap({});
        setVariantPriceMap({});
        setPublicPriceLoading(true);
        return;
      }

      if (cartItems.length === 0) {
        setPublicPriceMap({});
        setVariantPriceMap({});
        setVariantPriceError(null);
        setPublicPriceLoading(false);
        return;
      }

      setPublicPriceLoading(true);
      try {
        const variantResult = await fetchVerifiedVariantPrices(
          cartItems.map((item) => ({
            key: item.cartItemId,
            productId: item.product.id,
            variantId: item.selectedVariantId,
            variantSku: item.selectedVariantSku,
            selectedSize: item.selectedSize,
            selectedColor: item.selectedColor,
          })),
          selectedCountry,
        );
        if (cancelled) return;
        setVariantPriceError(variantResult.error);
        if (variantResult.error) {
          console.error('[Cart] Unable to verify selected variant pricing:', variantResult.error);
          setVariantPriceMap({});
        } else {
          setVariantPriceMap(Object.fromEntries(
            Object.entries(variantResult.data).map(([key, price]) => [key, price.sellingPrice]),
          ));
        }
        const ids = Array.from(new Set(cartItems.map((i) => i.product.id)));
        const { data } = await fetchPublicProductPrices(ids, selectedCountry);
        if (cancelled) return;
        const map: Record<string, number> = {};
        (data || []).forEach((row) => { map[row.productId] = row.publicUnitPrice; });
        setPublicPriceMap(map);
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : 'Unable to verify cart pricing.';
          console.error('[Cart] Failed to load prices:', error);
          setVariantPriceError(message);
          setVariantPriceMap({});
        }
      } finally {
        if (!cancelled) setPublicPriceLoading(false);
      }
    };
    void loadPublicPrices();
    return () => {
      cancelled = true;
    };
  }, [cartItems, selectedCountry]);

  useEffect(() => {
    const loadPricing = async () => {
      if (selectedCartItems.length === 0) {
        setPricing(null);
        setPricingLoading(false);
        setPricingFailed(false);
        return;
      }
      // Don't call RPC with empty country — it would return base prices with no markup.
      // The publicPriceMap (from fetchPublicProductPrices above) handles display prices;
      // wait until selectedCountry is resolved before computing checkout subtotals.
      if (!selectedCountry) return;
      setPricingLoading(true);
      setPricingFailed(false);
      const items = selectedCartItems.map((item) => ({
        productId: item.product.id,
        quantity: item.quantity,
      }));
      const MAX_RETRIES = 3;
      let lastErrorMessage = '';
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          const { data, error } = await calculateCheckoutPricing(items, selectedCountry);
          if (!error && data) {
            setPricing(data);
            setPricingLoading(false);
            return;
          }
          if (error) {
            lastErrorMessage = String(error);
          }
          if (attempt < MAX_RETRIES) {
            await new Promise((r) => setTimeout(r, attempt * 1000));
          }
        } catch (error) {
          lastErrorMessage = error instanceof Error ? error.message : String(error || 'Unknown pricing error');
          if (attempt < MAX_RETRIES) {
            await new Promise((r) => setTimeout(r, attempt * 1000));
          }
        }
      }
      setPricingLoading(false);
      // Keep cart usable when public per-item prices are already resolved.
      // calculate_checkout_pricing is secondary here because shipping is computed at checkout.
      const hasFallbackUnitPrices = selectedCartItems.every((item) => {
        return typeof publicPriceMap[item.product.id] === 'number'
          || typeof item.variantPrice === 'number'
          || typeof item.product.price === 'number';
      });

      if (hasFallbackUnitPrices) {
        if (lastErrorMessage) {
          console.error('Cart pricing RPC failed, using public price fallback:', lastErrorMessage);
        }
        setPricingFailed(false);
        return;
      }

      setPricingFailed(true);
    };
    void loadPricing();
  }, [selectedCartItems, selectedCountry, publicPriceMap]);

  const pricingByProductId = new Map((pricing?.items || []).map((item) => [item.productId, item]));
  const hasVariantSelection = (item: (typeof cartItems)[number]) => Boolean(
    item.selectedVariantId || item.selectedVariantSku || item.selectedSize || item.selectedColor,
  );
  const hasResolvedSelectedPrices = selectedCartItems.every((item) => {
    if (hasVariantSelection(item)) {
      return typeof variantPriceMap[item.cartItemId] === 'number';
    }
    return typeof publicPriceMap[item.product.id] === 'number'
      || typeof pricingByProductId.get(item.product.id)?.publicUnitPrice === 'number'
      || typeof item.product.price === 'number';
  }) && !variantPriceError;
  const handleCheckout = async () => {
    if (selectedCartItems.length === 0) {
      alert('PLEASE SELECT ANY ITEM TO PROCEED');
      return;
    }
    if (!hasResolvedSelectedPrices) {
      alert('Please wait for final prices to load.');
      return;
    }
    // Bypass cached data: re-read stock and prices from the database before checkout.
    if (checkingOut) return;
    setCheckingOut(true);
    clearQueryCache();
    let liveStock = new Map<string, number>();
    try {
      const results = await Promise.all(
        Array.from(new Set(selectedCartItems.map((item) => item.product.id)))
          .map(async (id) => [id, (await fetchProductById(id)).data?.stock] as const),
      );
      liveStock = new Map(results.filter(([, stock]) => typeof stock === 'number') as [string, number][]);
      await fetchPublicProductPrices(Array.from(liveStock.keys()), selectedCountry);
    } catch (error) {
      console.error('[Cart] Unable to refresh checkout data:', error);
    } finally {
      setCheckingOut(false);
    }
    // M1: Block checkout if any selected item is out of stock
    const outOfStock = selectedCartItems.filter(
      (item) => (liveStock.get(item.product.id) ?? item.product.stock) <= 0,
    );
    if (outOfStock.length > 0) {
      alert(`These items are out of stock: ${outOfStock.map((i) => i.product.name).join(', ')}. Please remove them to continue.`);
      return;
    }
    localStorage.setItem('beauzead_checkout_selected_cart_ids', JSON.stringify(selectedItemIds));
    navigate('/checkout/shipping', { state: { selectedCartItemIds: selectedItemIds } });
  };

  const isAllSelected = cartItems.length > 0 && selectedItemIds.length === cartItems.length;

  const resolvePublicPriceSourceCurrency = (cartItem: (typeof cartItems)[number]): string =>
    (cartItem.product.currency || 'INR').toUpperCase();

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedItemIds([]);
      return;
    }
    setSelectedItemIds(cartItems.map((item) => item.cartItemId));
  };

  const toggleSelectItem = (cartItemId: string) => {
    setSelectedItemIds((prev) =>
      prev.includes(cartItemId)
        ? prev.filter((id) => id !== cartItemId)
        : [...prev, cartItemId]
    );
  };

  /* ─── Compute display subtotal from selected items (L1: convert each to user currency) ─── */
  const displaySubtotal = selectedCartItems.reduce((sum, item) => {
    const unit = hasVariantSelection(item)
      ? variantPriceMap[item.cartItemId]
      : publicPriceMap[item.product.id]
        ?? pricingByProductId.get(item.product.id)?.publicUnitPrice
        ?? item.product.price;

    if (typeof unit !== 'number') {
      return sum;
    }

    return sum + convertPrice(unit * item.quantity, resolvePublicPriceSourceCurrency(item));
  }, 0);

  return (
    <div
      className="h-[100dvh] overflow-hidden bg-white flex flex-col md:min-h-screen md:h-auto md:overflow-visible"
      style={isNativePlatform ? { height: '100dvh', overflow: 'hidden' } : undefined}
    >
      <Header />
      {cartItems.length === 0 && (
        <ToastContainer
          toasts={toast.toasts}
          dismiss={toast.dismiss}
          className={`fixed ${isNativePlatform ? 'bottom-20' : 'bottom-4'} left-2 right-2 mx-auto`}
        />
      )}

      <main
        className="flex flex-1 min-h-0 w-full max-w-[1100px] mx-auto flex-col bg-white px-0 py-0 pb-0 md:block md:bg-transparent md:px-4 md:py-5 md:pb-5"
        style={isNativePlatform ? { flex: 1, minHeight: 0, overflowY: 'auto', display: 'block' } : undefined}
      >

        {/* ─── Loading ─── */}
        {loading ? (
          <ListSkeleton rows={4} withThumb className="py-2" />

        ) : cartItems.length === 0 ? (
          /* ─── Empty Cart ─── */
          <div className="bg-white border border-[#ddd] rounded-[10px] p-8 sm:p-12 text-center">
            <ShoppingCart className="h-14 w-14 text-[#888] mx-auto mb-4" />
            <h2 className="text-xl sm:text-2xl font-bold text-[#0f1111] mb-2">Your Cart is Empty</h2>
            <p className="text-[14px] text-[#555] mb-6">Add items to your cart to get started with shopping.</p>
            <button
              onClick={() => window.history.length > 1 ? navigate(-1) : navigate('/')}
              className="bg-[#ffd814] border border-[#fcd200] text-[#0f1111] px-6 py-2.5 rounded-[10px] text-[15px] font-bold cursor-pointer hover:bg-[#f7ca00] transition-colors"
            >
              Continue Shopping
            </button>
          </div>

        ) : (
          <>
            {/* ═══════════════════════════════════════════════
                 CART ITEMS CARD
                ═══════════════════════════════════════════════ */}
            <div
              className="flex flex-1 min-h-0 flex-col bg-white border-0 rounded-none p-0 md:block md:border md:border-[#ddd] md:rounded-[10px] md:p-6 md:mb-4"
              style={isNativePlatform ? { display: 'block' } : undefined}
            >
              <h1 className="hidden text-[18px] sm:text-[22px] font-bold text-[#0f1111] mb-0.5 md:block">Shopping Cart</h1>
              <p className="hidden text-[12px] text-[#888] mb-3 md:block">{cartItems.length} item{cartItems.length !== 1 ? 's' : ''} in your cart</p>

              {/* Select All Row */}
              <div className="flex items-center bg-white px-3 py-2 md:justify-between md:bg-transparent md:px-0 md:py-0 md:pb-3 md:border-b md:border-[#eee] md:mb-0">
                <label className="flex items-center gap-2 text-[13px] font-semibold text-[#555] cursor-pointer md:font-normal">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={toggleSelectAll}
                    className="w-[18px] h-[18px] accent-[#ff9900] cursor-pointer"
                  />
                  <span>Select All Items</span>
                </label>
                <button
                  onClick={toggleSelectAll}
                  className="hidden text-[13px] text-[#007185] font-semibold bg-transparent border-none cursor-pointer hover:text-[#c7511f] hover:underline md:block"
                >
                  {isAllSelected ? 'Deselect all' : `${selectedItemIds.length} selected`}
                </button>
              </div>

              {/* ─── Cart Items ─── */}
              <div
                className="native-cart-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain bg-white px-0 md:block md:overflow-visible"
                style={isNativePlatform ? { display: 'block', overflow: 'visible' } : undefined}
              >
                {cartItems.map((cartItem) => {
                const itemPrice = hasVariantSelection(cartItem)
                  ? variantPriceMap[cartItem.cartItemId]
                  : publicPriceMap[cartItem.product.id]
                    ?? pricingByProductId.get(cartItem.product.id)?.publicUnitPrice
                    ?? cartItem.product.price;
                const isMovingToWishlist = wishlistMovingId === cartItem.cartItemId;
                const isUpdating = updatingId === cartItem.cartItemId || isMovingToWishlist;

                return (
                  <div
                    key={cartItem.cartItemId}
                    className={`mb-1.5 bg-white border-y border-slate-200 last:mb-0 md:border ${isUpdating ? 'opacity-60' : ''}`}
                    aria-busy={isUpdating}
                  >
                    <div className="flex gap-2 px-2.5 py-2 sm:p-4 sm:gap-3">
                      <input
                        type="checkbox"
                        checked={selectedItemIds.includes(cartItem.cartItemId)}
                        onChange={() => toggleSelectItem(cartItem.cartItemId)}
                        disabled={isUpdating}
                        aria-label={`Select ${cartItem.product.name}`}
                        className="mt-1 w-[18px] h-[18px] accent-[#ff9900] cursor-pointer shrink-0"
                      />
                      <div className="flex shrink-0 flex-col items-center gap-1">
                        <div className="rounded border border-slate-200 bg-white overflow-hidden w-[64px] h-[64px] sm:w-[96px] sm:h-[96px]">
                          <img
                            src={cartItem.product.image_url}
                            alt={cartItem.product.name}
                            className="w-full h-full object-contain"
                          />
                        </div>
                        <div className="flex items-center border border-slate-200 rounded overflow-hidden">
                          <button
                            type="button"
                            onClick={() => handleUpdateQuantity(cartItem.cartItemId, cartItem.quantity - 1)}
                            disabled={isUpdating}
                            aria-label={`Decrease quantity of ${cartItem.product.name}`}
                            className="w-6 h-7 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                          >
                            −
                          </button>
                          <span className="min-w-6 h-7 flex items-center justify-center text-sm font-semibold border-x border-slate-200">
                            {cartItem.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleUpdateQuantity(cartItem.cartItemId, cartItem.quantity + 1)}
                            disabled={isUpdating || cartItem.quantity >= cartItem.product.stock}
                            aria-label={`Increase quantity of ${cartItem.product.name}`}
                            className="w-6 h-7 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                          >
                            +
                          </button>
                        </div>
                        {isUpdating && <Loader2 className="w-4 h-4 text-[#ff9900] animate-spin" />}
                      </div>
                      <div className="flex-1 min-w-0">
                      <div className="text-[14px] sm:text-[15px] font-semibold leading-snug truncate mb-0.5">
                        <Link
                          to={`/products/${cartItem.product.slug || cartItem.product.id}`}
                          title={cartItem.product.name}
                          className="text-[#0f1111] hover:text-[#c45500] hover:underline transition-colors"
                        >
                          {cartItem.product.name}
                        </Link>
                      </div>
                      <div className="text-[11px] text-[#888] mb-0.5">
                        Sold by: <strong className="text-[#555]">{cartItem.product.brand || 'BZEAD Seller'}</strong>
                      </div>
                      {(cartItem.selectedSize || cartItem.selectedColor) && (
                        <p className="text-[11px] text-[#888] mb-0.5">
                          {cartItem.selectedSize && `Size: ${cartItem.selectedSize}`}
                          {cartItem.selectedSize && cartItem.selectedColor && ' · '}
                          {cartItem.selectedColor && `Color: ${cartItem.selectedColor}`}
                        </p>
                      )}
                      <div className="mt-1 text-[16px] sm:text-[18px] font-bold text-[#b12704]">
                        {typeof itemPrice === 'number'
                          ? formatPrice(itemPrice, resolvePublicPriceSourceCurrency(cartItem))
                          : 'Loading…'}
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {cartItem.product.stock > 0 ? (
                          <span className="inline-block text-[11px] font-semibold px-2 py-0.5 rounded bg-[#d1fae5] text-[#047857]">In Stock</span>
                        ) : (
                          <span className="inline-block text-[11px] font-semibold px-2 py-0.5 rounded bg-[#fee2e2] text-[#b91c1c]">Out of Stock</span>
                        )}
                      </div>

                      </div>
                    </div>
                    <div className="grid grid-cols-2 border-t border-slate-100 divide-x divide-slate-100">
                      <button
                        type="button"
                        onClick={() => handleAddToWishlist(cartItem)}
                        disabled={isUpdating || wishlistMovingId !== null}
                        aria-label={isMovingToWishlist ? `Adding ${cartItem.product.name} to wishlist` : `Add ${cartItem.product.name} to wishlist`}
                        className="flex min-h-10 items-center justify-center gap-2 px-2 text-xs sm:text-sm font-semibold text-slate-600 hover:bg-slate-50 hover:text-[#007185] disabled:opacity-50"
                      >
                        {isMovingToWishlist
                          ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
                          : <Heart className="h-4 w-4 shrink-0" aria-hidden="true" />}
                        {isMovingToWishlist ? 'Adding to Wishlist…' : 'Add to Wishlist'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmRemoveId(cartItem.cartItemId)}
                        disabled={isUpdating}
                        data-no-global-confirm="true"
                        aria-label={`Remove ${cartItem.product.name} from cart`}
                        className="flex min-h-10 items-center justify-center gap-2 px-2 text-xs sm:text-sm font-semibold text-slate-600 hover:bg-slate-50 hover:text-[#b12704] disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                        Remove
                      </button>
                    </div>
                  </div>
                );
                })}
              </div>
            </div>

            {/* ═══════════════════════════════════════════════
                 CART SUMMARY (sticky above MobileNav on native)
                ═══════════════════════════════════════════════ */}
            <div
              className="native-cart-checkout relative shrink-0 px-2 pt-2 md:px-0 md:pt-0"
              style={isNativePlatform ? {
                position: 'sticky',
                bottom: 0,
                zIndex: 10,
                background: '#fff',
                borderTop: '1px solid #e5e7eb',
                boxShadow: '0 -2px 10px rgba(0,0,0,0.07)',
                padding: '8px 16px 10px',
              } : undefined}
            >
              <ToastContainer
                toasts={toast.toasts}
                dismiss={toast.dismiss}
                className="absolute bottom-full left-2 right-2 mx-auto mb-2 md:fixed md:bottom-4 md:left-auto md:right-4 md:mb-0"
              />
              {pricingLoading ? (
                <div className="bg-white border border-[#ddd] rounded-[10px] p-6 sm:p-8 text-center">
                <div className="flex items-center justify-center gap-3 mb-3">
                  <Loader2 className="h-6 w-6 text-[#ff9900] animate-spin" />
                  <span className="text-[15px] font-semibold text-[#0f1111]">Updating prices…</span>
                </div>
                <p className="text-[13px] text-[#888]">Please wait a moment</p>
                </div>
              ) : (
                <div className="bg-white border border-[#ddd] rounded-[10px] p-3 sm:p-5">
                <h2 className="hidden text-[18px] font-bold text-[#0f1111] mb-4 md:block">Cart Summary</h2>

                {variantPriceError && (
                  <div className="mb-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 font-semibold">
                    {variantPriceError}
                  </div>
                )}

                <div className="flex justify-between text-[14px] mb-2">
                  <span className="text-[#555]">Subtotal ({selectedCartItems.length} item{selectedCartItems.length !== 1 ? 's' : ''})</span>
                  <span className="font-semibold text-[#0f1111]">
                    {selectedCartItems.length > 0 ? formatPrice(displaySubtotal, currency) : '—'}
                  </span>
                </div>
                <hr className="border-t-2 border-[#ddd] my-2.5 sm:my-3.5" />

                <div className="flex justify-between text-[18px] font-bold text-[#b12704]">
                  <span>Estimated Total</span>
                  <span>{selectedCartItems.length > 0 ? formatPrice(displaySubtotal, currency) : '—'}</span>
                </div>

                <button
                  onClick={handleCheckout}
                  disabled={!hasResolvedSelectedPrices || wishlistMovingId !== null || checkingOut}
                  className="w-full mt-3 py-3 bg-[#ffd814] border border-[#fcd200] rounded-[10px] text-[15px] font-bold text-[#0f1111] cursor-pointer hover:bg-[#f7ca00] active:bg-[#e8b800] transition-colors"
                >
                  {checkingOut ? 'Checking latest prices…' : 'Proceed to Checkout →'}
                </button>

                <p className="hidden text-center text-[12px] text-[#067d62] mt-2.5 md:block">
                  🔒 Secure checkout powered by <strong>Stripe</strong>
                </p>

                <button
                  onClick={() => window.history.length > 1 ? navigate(-1) : navigate('/')}
                  className="hidden w-full mt-2 py-2 bg-transparent border border-[#ddd] rounded-[10px] text-[13px] font-semibold text-[#007185] cursor-pointer hover:bg-[#f0f9fa] transition-colors md:block"
                >
                  Continue Shopping
                </button>
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {/* ─── Confirm Remove Dialog ─── */}
      {confirmRemoveId && (
        <div className="fixed inset-0 z-[10001] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[12px] p-5 sm:p-6 max-w-sm w-full shadow-xl border border-[#ddd]">
            <h3 className="text-[17px] font-bold text-[#0f1111] mb-2">Remove Item</h3>
            <p className="text-[14px] text-[#555] mb-6">Are you sure you want to remove this item from your cart?</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmRemoveId(null)}
                className="flex-1 px-4 py-2.5 border border-[#ddd] rounded-[10px] text-[#0f1111] text-[14px] font-semibold hover:bg-[#f5f5f5] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => handleRemoveItem(confirmRemoveId)}
                className="flex-1 px-4 py-2.5 bg-[#b12704] text-white rounded-[10px] text-[14px] font-semibold hover:bg-[#961f03] transition-colors cursor-pointer"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Pricing Failed Dialog ─── */}
      {pricingFailed && !hasResolvedSelectedPrices && (
        <div className="fixed inset-0 z-[10001] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[12px] p-6 sm:p-8 max-w-sm w-full shadow-xl border border-[#ddd] text-center">
            <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-[#fff3cd] flex items-center justify-center">
              <AlertTriangle className="h-7 w-7 text-[#ff9900]" />
            </div>
            <h3 className="text-[17px] font-bold text-[#0f1111] mb-2">Unable to Load Prices</h3>
            <p className="text-[14px] text-[#555] mb-6 leading-relaxed">
              We're having trouble connecting right now. Your cart items are safe — please refresh to try again.
            </p>
            <div className="flex flex-col gap-2.5">
              <button
                onClick={() => window.location.reload()}
                className="w-full py-3 bg-[#ffd814] border border-[#fcd200] rounded-[10px] text-[15px] font-bold text-[#0f1111] cursor-pointer hover:bg-[#f7ca00] transition-colors"
              >
                Refresh Page
              </button>
              <button
                onClick={() => window.history.length > 1 ? navigate(-1) : navigate('/')}
                className="w-full py-2.5 bg-transparent border border-[#ddd] rounded-[10px] text-[13px] font-semibold text-[#007185] cursor-pointer hover:bg-[#f0f9fa] transition-colors"
              >
                Go Back
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="hidden md:block">
        <Footer />
      </div>
    </div>
  );
};
