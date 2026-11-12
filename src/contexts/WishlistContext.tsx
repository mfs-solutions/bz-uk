import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type { Product } from '../types';
import { supabase } from '../lib/supabase';
import { addToWishlist as addToWishlistInBackend } from '../lib/adminService';

interface WishlistContextType {
  items: Product[];
  addToWishlist: (product: Product) => void;
  addToWishlistConfirmed: (product: Product, userId: string) => Promise<void>;
  removeFromWishlist: (productId: string) => void;
  isInWishlist: (productId: string) => boolean;
  clearWishlist: () => void;
  syncToBackend: (userId: string) => Promise<void>;
  loadFromBackend: (userId: string, options?: { mergeLocal?: boolean }) => Promise<void>;
}

const WishlistContext = createContext<WishlistContextType | undefined>(undefined);

export const WishlistProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<Product[]>([]);
  const itemsRef = useRef(items);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    const savedWishlist = localStorage.getItem('beauzead_wishlist');
    if (savedWishlist) {
      try { setItems(JSON.parse(savedWishlist)); } catch { /* ignore */ }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('beauzead_wishlist', JSON.stringify(items));
  }, [items]);

  const syncToBackend = useCallback(async (userId: string) => {
    for (const product of itemsRef.current) {
      await supabase
        .from('wishlists')
        .upsert(
          { user_id: userId, product_id: product.id },
          { onConflict: 'user_id,product_id', ignoreDuplicates: true }
        );
    }
  }, []);

  const loadFromBackend = useCallback(async (userId: string, options?: { mergeLocal?: boolean }) => {
    const { data } = await supabase
      .from('wishlists')
      .select('*, products(*)')
      .eq('user_id', userId);

    const backendProducts = (data || [])
      .map((w: any) => w.products)
      .filter(Boolean) as Product[];

    if (!options?.mergeLocal) {
      if (backendProducts.length > 0) setItems(backendProducts);
      return;
    }

    // Merge local + backend (prevents losing local wishlist on login)
    const currentItems = itemsRef.current;
    const merged = new Map<string, Product>();
    for (const p of backendProducts) merged.set(p.id, p);
    for (const p of currentItems) merged.set(p.id, p);

    const mergedProducts = Array.from(merged.values());
    setItems(mergedProducts);

    if (mergedProducts.length > 0) {
      await supabase
        .from('wishlists')
        .upsert(
          mergedProducts.map((p) => ({ user_id: userId, product_id: p.id })),
          { onConflict: 'user_id,product_id', ignoreDuplicates: true }
        );
    }
  }, []);

  const addToWishlist = useCallback((product: Product) => {
    setItems((prev) => {
      if (!prev.find((item) => item.id === product.id)) return [...prev, product];
      return prev;
    });
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase
            .from('wishlists')
            .upsert(
              { user_id: user.id, product_id: product.id },
              { onConflict: 'user_id,product_id', ignoreDuplicates: true }
            );
        }
      } catch { /* silent — localStorage is fallback */ }
    })();
  }, []);

  const addToWishlistConfirmed = useCallback(async (product: Product, userId: string) => {
    const result = await addToWishlistInBackend(userId, product.id);
    if (!result.success) throw new Error(result.error || 'Unable to add product to wishlist.');
    setItems((prev) => prev.some((item) => item.id === product.id) ? prev : [...prev, product]);
  }, []);

  const removeFromWishlist = useCallback((productId: string) => {
    setItems((prev) => prev.filter((item) => item.id !== productId));
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase
            .from('wishlists')
            .delete()
            .eq('user_id', user.id)
            .eq('product_id', productId);
        }
      } catch { /* silent */ }
    })();
  }, []);

  const isInWishlist = (productId: string) => items.some((item) => item.id === productId);

  const clearWishlist = useCallback(() => setItems([]), []);

  // Clear wishlist from localStorage + state on logout
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setItems([]);
        localStorage.removeItem('beauzead_wishlist');
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  return (
    <WishlistContext.Provider value={{ items, addToWishlist, addToWishlistConfirmed, removeFromWishlist, isInWishlist, clearWishlist, syncToBackend, loadFromBackend }}>
      {children}
    </WishlistContext.Provider>
  );
};

export const useWishlist = () => {
  const context = useContext(WishlistContext);
  if (context === undefined) throw new Error('useWishlist must be used within a WishlistProvider');
  return context;
};
