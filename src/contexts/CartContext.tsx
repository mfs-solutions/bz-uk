import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type { Product } from '../types';
import { supabase } from '../lib/supabase';
import { fetchMultiSellerTat } from '../lib/tatService';

interface CartItem {
  cartItemId: string;
  product: Product;
  quantity: number;
  selectedSize?: string | null;
  selectedColor?: string | null;
  selectedVariantId?: string | null;
  selectedVariantSku?: string | null;
  variantPrice?: number | null;
}

interface CartContextType {
  items: CartItem[];
  addToCart: (
    product: Product,
    quantity?: number,
    options?: { selectedSize?: string | null; selectedColor?: string | null; selectedVariantId?: string | null; selectedVariantSku?: string | null; variantPrice?: number | null }
  ) => void;
  removeFromCart: (cartItemId: string) => void;
  removeFromCartConfirmed: (cartItemId: string) => Promise<void>;
  updateQuantity: (cartItemId: string, quantity: number) => void;
  clearCart: () => void;
  totalItems: number;
  totalPrice: number;
  createOrderFromCart: (userId: string, shippingAddress: any, billingAddress?: any, paymentMethod?: string) => Promise<any>;
  isCreatingOrder: boolean;
  syncCartWithBackend: (userId: string) => Promise<void>;
  isLoading: boolean;
  loadError: string | null;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

const CART_SNAPSHOT_TTL_MS = 2 * 60 * 1000;
const cartSnapshotKey = (userId: string) => `beauzead_cart_snapshot_v1:${userId}`;

type CartSnapshot = {
  cachedAt: number;
  items: CartItem[];
};

const readCartSnapshot = (userId: string): CartItem[] | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(cartSnapshotKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CartSnapshot;
    if (!parsed || !Array.isArray(parsed.items) || !Number.isFinite(parsed.cachedAt)) return null;
    if (Date.now() - parsed.cachedAt > CART_SNAPSHOT_TTL_MS) return null;
    return parsed.items.filter((item) => item && item.cartItemId && item.product?.id && item.quantity > 0);
  } catch {
    return null;
  }
};

const writeCartSnapshot = (userId: string, items: CartItem[]): void => {
  if (typeof window === 'undefined') return;
  try {
    const trimmed = items
      .filter((item) => item && item.cartItemId && item.product?.id && item.quantity > 0)
      .slice(0, 200);
    window.localStorage.setItem(
      cartSnapshotKey(userId),
      JSON.stringify({ cachedAt: Date.now(), items: trimmed } satisfies CartSnapshot),
    );
  } catch {
    /* ignore */
  }
};

const clearCartSnapshot = (userId: string): void => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(cartSnapshotKey(userId));
  } catch {
    /* ignore */
  }
};

const normalizeVariantToken = (value?: string | null) => {
  const token = (value || '').trim();
  return token ? token.toLowerCase() : '-';
};

const buildCartItemId = (
  productId: string,
  selectedSize?: string | null,
  selectedColor?: string | null,
  selectedVariantSku?: string | null,
) => `${productId}::${normalizeVariantToken(selectedSize)}::${normalizeVariantToken(selectedColor)}::${normalizeVariantToken(selectedVariantSku)}`;

const shouldRetryCreateOrderWithoutCountry = (message: string): boolean => {
  const normalized = String(message || '').toLowerCase();
  return normalized.includes('create_order_secure')
    && normalized.includes('p_country')
    && (normalized.includes('function') || normalized.includes('parameter') || normalized.includes('signature'));
};

const callCreateOrderSecure = async (params: Record<string, unknown>) => {
  const payload: Record<string, unknown> = { ...params };
  const shippingAddress = payload.p_shipping_address as Record<string, unknown> | null | undefined;
  const explicitCountry = String(payload.p_country || '').trim();
  const inferredCountry = String(shippingAddress?.country || '').trim();
  const destinationCountry = explicitCountry || inferredCountry;

  if (destinationCountry) {
    payload.p_country = destinationCountry;
  }

  let result = await supabase.rpc('create_order_secure', payload);

  if (result.error && destinationCountry) {
    const message = String(result.error.message || '');
    if (shouldRetryCreateOrderWithoutCountry(message)) {
      const { p_country, ...legacyPayload } = payload;
      result = await supabase.rpc('create_order_secure', legacyPayload);
    }
  }

  return result;
};

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Tombstones: cartItemIds the user has just locally removed. While present,
  // syncCartWithBackend MUST NOT re-introduce these rows from the DB — the
  // DELETE may not have propagated yet, or another in-flight write might have
  // re-created the row.
  const pendingDeletesRef = useRef<Set<string>>(new Set());

  // Debounce realtime-driven syncs so a burst of writes (e.g. our own DELETE
  // followed by our own UPSERT) collapses into a single sync call.
  const realtimeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear in-memory cart on logout. DB (cart_items) is the only source of
  // truth — there is no localStorage to wipe.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setItems([]);
        setIsLoading(false);
        setLoadError(null);
        pendingDeletesRef.current.clear();
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // ---- Per-variant backend sync ----

  const syncItemToBackend = async (
    productId: string,
    quantity: number,
    selectedSize: string | null,
    selectedColor: string | null,
    selectedVariantId: string | null,
    selectedVariantSku: string | null,
    variantPrice?: number | null,
  ) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Normalise nulls to empty string for the unique constraint
      const sizeVal = selectedSize || '';
      const colorVal = selectedColor || '';
      const skuVal = selectedVariantSku || '';

      if (quantity <= 0) {
        // Delete this specific variant row — must filter on variant SKU too,
        // otherwise multiple SKUs sharing (size,color) will be wiped together.
        let query = supabase
          .from('cart_items')
          .delete()
          .eq('user_id', user.id)
          .eq('product_id', productId);

        if (sizeVal) {
          query = query.eq('selected_size', sizeVal);
        } else {
          query = query.is('selected_size', null);
        }
        if (colorVal) {
          query = query.eq('selected_color', colorVal);
        } else {
          query = query.is('selected_color', null);
        }
        if (skuVal) {
          query = query.eq('selected_variant_sku', skuVal);
        } else {
          query = query.is('selected_variant_sku', null);
        }

        await query;
      } else {
        // Persist the markup-resolved unit price so the cart shows the SAME
        // per-variant price after a page refresh. Without this the row is
        // re-hydrated with no price and the display falls back to the base
        // product price (variant price silently lost on reload).
        const row: Record<string, any> = {
          user_id: user.id,
          product_id: productId,
          quantity,
          selected_size: sizeVal || null,
          selected_color: colorVal || null,
          selected_variant_id: selectedVariantId || null,
          selected_variant_sku: selectedVariantSku || null,
        };
        // Only write unit_price when we actually have one, so a price-less
        // quantity update never wipes a previously stored variant price.
        if (variantPrice != null) row.unit_price = variantPrice;
        await supabase.from('cart_items').upsert(
          row,
          { onConflict: 'user_id,product_id,selected_size,selected_color,selected_variant_sku' }
        );
      }
    } catch {
      /* silent — DB is the only source of truth; UI will reconcile on next sync */
    }
  };

  // Read cart_items from DB once. Returns the parsed rows or throws.
  const fetchCartFromDb = async (userId: string): Promise<CartItem[]> => {
    const { data: dbItems, error } = await supabase
      .from('cart_items')
      .select('*, products(*)')
      .eq('user_id', userId);
    if (error) throw error;

    const rows = (dbItems || []).filter((row: any) => row.products);
    const variantSkus = [...new Set(
      rows.map((row: any) => String(row.selected_variant_sku || '').trim().toUpperCase()).filter(Boolean)
    )];
    const productIds = [...new Set(rows.map((row: any) => String(row.products?.id || '')).filter(Boolean))];

    const variantStockBySku = new Map<string, number>();
    const variantSumByProduct = new Map<string, number>();

    if (variantSkus.length > 0) {
      const { data: variantRows } = await supabase
        .from('product_variants')
        .select('sku, stock')
        .in('sku', variantSkus);
      for (const row of variantRows || []) {
        const sku = String(row.sku || '').trim().toUpperCase();
        if (sku) variantStockBySku.set(sku, Number(row.stock || 0));
      }
    }

    if (productIds.length > 0) {
      const { data: comboRows } = await supabase
        .from('product_variants')
        .select('product_id, stock')
        .in('product_id', productIds)
        .eq('variant_type', 'combination');
      for (const row of comboRows || []) {
        const pid = String(row.product_id);
        variantSumByProduct.set(pid, (variantSumByProduct.get(pid) || 0) + Number(row.stock || 0));
      }
    }

    const resolveAvailableStock = (product: Product, variantSku?: string | null): number => {
      const skuKey = String(variantSku || '').trim().toUpperCase();
      if (skuKey && variantStockBySku.has(skuKey)) {
        return variantStockBySku.get(skuKey) || 0;
      }
      const variantSum = variantSumByProduct.get(String(product.id)) || 0;
      if (variantSum > 0) return variantSum;
      return Number(product.stock || 0);
    };

    return rows.map((row: any) => {
        const size = row.selected_size || null;
        const color = row.selected_color || null;
        const variantId = row.selected_variant_id || null;
        const variantSku = row.selected_variant_sku || null;
        const baseProduct = row.products as Product;
        const availableStock = resolveAvailableStock(baseProduct, variantSku);
        return {
          cartItemId: buildCartItemId(row.products.id, size, color, variantSku),
          product: { ...baseProduct, stock: availableStock },
          quantity: Number(row.quantity || 0),
          selectedSize: size,
          selectedColor: color,
          selectedVariantId: variantId,
          selectedVariantSku: variantSku,
          // Restore the per-variant price captured at add-to-cart time so the
          // displayed price is stable across refreshes.
          variantPrice: row.unit_price != null ? Number(row.unit_price) : null,
        };
      });
  };

  const syncCartWithBackend = useCallback(async (userId: string, opts?: { silent?: boolean }) => {
    const silent = Boolean(opts?.silent);
    if (!silent) {
      setIsLoading(true);
      setLoadError(null);
    }

    // Try once, on failure wait briefly and retry exactly once.
    let backendCart: CartItem[] = [];
    let lastErr: unknown = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        backendCart = await fetchCartFromDb(userId);
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
        if (attempt === 1) {
          await new Promise((r) => setTimeout(r, 500));
        }
      }
    }

    if (lastErr) {
      console.error('Failed to sync cart with backend:', lastErr);
      if (!silent) {
        setLoadError(lastErr instanceof Error ? lastErr.message : 'Failed to load cart');
        setIsLoading(false);
      }
      return;
    }

    // DB is the sole source of truth. Replace state with DB rows, except
    // for tombstoned cartItemIds whose DELETE may still be in flight.
    const merged = backendCart
      .filter((item) => !pendingDeletesRef.current.has(item.cartItemId))
      .filter((item) => item.quantity > 0);

    setItems(() => {
      const tombstones = pendingDeletesRef.current;
      return merged.filter((item) => !tombstones.has(item.cartItemId));
    });
    writeCartSnapshot(userId, merged);
    if (!silent) setIsLoading(false);
  }, []);

  // Initial load from DB on mount (and whenever auth user changes).
  useEffect(() => {
    let disposed = false;

    const loadInitial = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (disposed) return;
      if (!user) {
        setItems([]);
        setIsLoading(false);
        setLoadError(null);
        return;
      }
      const snapshot = readCartSnapshot(user.id);
      if (snapshot && snapshot.length > 0) {
        setItems(snapshot);
        setIsLoading(false);
      }
      await syncCartWithBackend(user.id, { silent: Boolean(snapshot && snapshot.length > 0) });
    };

    void loadInitial();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
        void loadInitial();
      }
    });

    return () => {
      disposed = true;
      subscription.unsubscribe();
    };
  }, [syncCartWithBackend]);

  // Reconcile cart when another tab changes backend cart rows.
  useEffect(() => {
    let disposed = false;
    let channel: any = null;

    const setupRealtimeSync = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || disposed) return;

      channel = supabase
        .channel(`cart_items_sync:${user.id}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'cart_items', filter: `user_id=eq.${user.id}` },
          () => {
            // Debounce so a burst of own-writes (e.g. delete+upsert from this
            // tab) collapses into a single read-only reconciliation.
            if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current);
            realtimeDebounceRef.current = setTimeout(() => {
              void syncCartWithBackend(user.id);
            }, 300);
          },
        )
        .subscribe();
    };

    void setupRealtimeSync();

    return () => {
      disposed = true;
      if (realtimeDebounceRef.current) {
        clearTimeout(realtimeDebounceRef.current);
        realtimeDebounceRef.current = null;
      }
      if (channel) supabase.removeChannel(channel);
    };
  }, [syncCartWithBackend]);

  const addToCart = (
    product: Product,
    quantity: number = 1,
    options?: { selectedSize?: string | null; selectedColor?: string | null; selectedVariantId?: string | null; selectedVariantSku?: string | null; variantPrice?: number | null }
  ) => {
    const selectedSize = options?.selectedSize || null;
    const selectedColor = options?.selectedColor || null;
    const selectedVariantId = options?.selectedVariantId || null;
    const selectedVariantSku = options?.selectedVariantSku || null;
    const variantPrice = options?.variantPrice != null ? options.variantPrice : null;
    const cartItemId = buildCartItemId(product.id, selectedSize, selectedColor, selectedVariantSku);

    // If the user just removed this exact variant and now re-adds it, clear
    // the tombstone so the new add is not suppressed by the sync layer.
    pendingDeletesRef.current.delete(cartItemId);

    setItems((prev) => {
      const existing = prev.find((item) => item.cartItemId === cartItemId);
      const newQty = existing ? existing.quantity + quantity : quantity;

      const resolvedPrice = variantPrice ?? existing?.variantPrice ?? null;
      const updated = existing
        ? prev.map((item) => item.cartItemId === cartItemId ? { ...item, quantity: newQty, selectedVariantId, variantPrice: resolvedPrice } : item)
        : [...prev, { cartItemId, product, quantity, selectedSize, selectedColor, selectedVariantId, selectedVariantSku, variantPrice }];

      void syncItemToBackend(product.id, newQty, selectedSize, selectedColor, selectedVariantId, selectedVariantSku, resolvedPrice);
      return updated;
    });
  };

  const removeFromCart = (cartItemId: string) => {
    setItems((prev) => {
      const target = prev.find((item) => item.cartItemId === cartItemId);
      if (!target) return prev;

      const updated = prev.filter((item) => item.cartItemId !== cartItemId);

      // Tombstone the row so the next sync (realtime echo / CartAutoSync /
      // multi-tab) doesn't re-introduce it before the DELETE lands.
      pendingDeletesRef.current.add(cartItemId);

      void (async () => {
        try {
          await syncItemToBackend(
            target.product.id,
            0,
            target.selectedSize || null,
            target.selectedColor || null,
            target.selectedVariantId || null,
            target.selectedVariantSku || null,
          );
        } finally {
          // Hold the tombstone briefly after the DELETE returns so any
          // realtime echo / stale upsert that was already in flight is
          // suppressed by the next debounced sync.
          setTimeout(() => {
            pendingDeletesRef.current.delete(cartItemId);
          }, 1500);
        }
      })();

      return updated;
    });
  };

  const removeFromCartConfirmed = async (cartItemId: string) => {
    const target = items.find((item) => item.cartItemId === cartItemId);
    if (!target) throw new Error('Cart item is no longer available.');
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError) throw authError;
    if (!user) throw new Error('Please sign in to update your cart.');

    pendingDeletesRef.current.add(cartItemId);
    try {
      let query = supabase.from('cart_items').delete()
        .eq('user_id', user.id)
        .eq('product_id', target.product.id);
      query = target.selectedSize ? query.eq('selected_size', target.selectedSize) : query.is('selected_size', null);
      query = target.selectedColor ? query.eq('selected_color', target.selectedColor) : query.is('selected_color', null);
      query = target.selectedVariantSku ? query.eq('selected_variant_sku', target.selectedVariantSku) : query.is('selected_variant_sku', null);
      const { data, error } = await query.select('id');
      if (error) throw error;
      if (!data?.length) throw new Error('Cart item could not be removed.');
      setItems((prev) => prev.filter((item) => item.cartItemId !== cartItemId));
      setTimeout(() => pendingDeletesRef.current.delete(cartItemId), 1500);
    } catch (error) {
      pendingDeletesRef.current.delete(cartItemId);
      throw error;
    }
  };

  const updateQuantity = (cartItemId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(cartItemId);
      return;
    }

    setItems((prev) => {
      const target = prev.find((item) => item.cartItemId === cartItemId);
      if (!target) return prev;

      const updated = prev.map((item) => item.cartItemId === cartItemId ? { ...item, quantity } : item);

      void syncItemToBackend(target.product.id, quantity, target.selectedSize || null, target.selectedColor || null, target.selectedVariantId || null, target.selectedVariantSku || null, target.variantPrice ?? null);
      return updated;
    });
  };

  const clearCart = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('cart_items').delete().eq('user_id', user.id);
        clearCartSnapshot(user.id);
      }
    } catch {
      /* silent */
    }
    setItems([]);
  };

  const createOrderFromCart = async (
    userId: string,
    shippingAddress: any,
    _billingAddress?: any,
    _paymentMethod: string = 'card'
  ) => {
    try {
      setIsCreatingOrder(true);
      if (items.length === 0) throw new Error('Cart is empty. Cannot create order.');

      const destinationPin = shippingAddress?.postalCode || shippingAddress?.postal_code || '';
      const productIds = items.map((item) => String(item.product.id));
      const tatResult = await fetchMultiSellerTat(productIds, destinationPin, userId);
      const maxDeliveryDays = tatResult.maxTatDays || null;
      const expectedDeliveryDateIso = tatResult.maxExpectedDate || null;

      // Build items for secure backend order creation (no prices sent — DB looks them up)
      const rpcItems = items.map((item) => {
        // Only fall back to the parent product SKU if the product has a single
        // (or zero) variant. For multi-variant products, never send the parent
        // SKU — it cannot identify a variant and pollutes order_items.variant_info.
        const variantCount = Array.isArray((item.product as any).product_variants)
          ? (item.product as any).product_variants.length
          : 0;
        const safeSku = item.selectedVariantSku
          || (variantCount > 1 ? null : (item.product.sku || null));
        return {
          product_id: String(item.product.id),
          quantity: item.quantity,
          product_name: item.product.name,
          product_image: item.product.image_url || (item.product.images?.[0]) || '',
          variant_info: {
            size: item.selectedSize || null,
            color: item.selectedColor || null,
            sku: safeSku,
            hsn_code: item.product.hsn_code || null,
          },
        };
      });

      const enrichedAddress = {
        ...shippingAddress,
        full_name: shippingAddress?.full_name || shippingAddress?.fullName || shippingAddress?.name || null,
        phone: shippingAddress?.phone || shippingAddress?.phone_number || null,
        expected_delivery_days: maxDeliveryDays || null,
        expected_delivery_date: expectedDeliveryDateIso || null,
      };

      // All financial fields computed server-side via secure DB function
      const { data: order, error: orderErr } = await callCreateOrderSecure({
        p_user_id: userId,
        p_items: rpcItems,
        p_shipping_address: enrichedAddress,
        p_payment_method: _paymentMethod || 'card',
        p_payment_status: 'pending',
        p_order_status: 'pending',
        p_country: shippingAddress?.country || null,
      });

      if (orderErr || !order) throw new Error(orderErr?.message || 'Failed to create order');

      await clearCart();
      return order;
    } catch (error) {
      console.error('Failed to create order:', error);
      throw error;
    } finally {
      setIsCreatingOrder(false);
    }
  };

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalPrice = items.reduce((sum, item) => sum + (item.variantPrice ?? item.product.price) * item.quantity, 0);

  return (
    <CartContext.Provider value={{ items, addToCart, removeFromCart, removeFromCartConfirmed, updateQuantity, clearCart, totalItems, totalPrice, createOrderFromCart, isCreatingOrder, syncCartWithBackend, isLoading, loadError }}>
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (context === undefined) throw new Error('useCart must be used within a CartProvider');
  return context;
};
