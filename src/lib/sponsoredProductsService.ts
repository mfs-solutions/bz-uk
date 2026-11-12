import type { RealtimeChannel } from '@supabase/supabase-js';
import type { Product } from '../types';
import { supabase } from './supabase';

export type SponsoredSection = 'featured' | 'trending' | 'hot-deals';

export interface SponsoredSectionConfig {
  id: string;
  section: SponsoredSection;
  sellerId: string;
  sellerName: string;
  sellerBrand: string;
  productIds: string[];
  startAt: string;
  endAt: string;
  updatedAt: string;
}

export interface SponsoredProductDetail {
  rowId: string;
  section: SponsoredSection;
  productId: string;
  sellerId: string;
  sellerName: string;
  productName: string;
  productImage: string;
  productPrice: number;
  startAt: string;
  endAt: string;
}



const nowIso = () => new Date().toISOString();

export const getSponsoredConfigs = async (): Promise<SponsoredSectionConfig[]> => {
  const { data, error } = await supabase
    .from('sponsored_products')
    .select(
      `id, section, seller_id, product_id, start_at, end_at, updated_at,
      profiles!sponsored_products_seller_id_fkey(full_name)`
    )
    .eq('is_active', true)
    .gt('end_at', nowIso())
    .order('updated_at', { ascending: false });

  if (error || !data) return [];

  const grouped = new Map<string, SponsoredSectionConfig>();

  data.forEach((row: any) => {
    const section = row.section as SponsoredSection;
    if (!section) return;

    const groupKey = `${section}::${row.seller_id}`;

    if (!grouped.has(groupKey)) {
      const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      grouped.set(groupKey, {
        id: row.id,
        section,
        sellerId: row.seller_id,
        sellerName: profile?.full_name || 'Seller',
        sellerBrand: profile?.full_name || 'Brand',
        productIds: [],
        startAt: row.start_at,
        endAt: row.end_at,
        updatedAt: row.updated_at,
      });
    }

    const current = grouped.get(groupKey)!;
    current.productIds.push(row.product_id);
  });

  return Array.from(grouped.values()).map((row) => ({
    ...row,
    productIds: Array.from(new Set(row.productIds)).slice(0, 100),
  }));
};

/** Fetch all active sponsored products for a given section with full product details */
export const getSponsoredProductsBySection = async (
  section: SponsoredSection,
): Promise<SponsoredProductDetail[]> => {
  const now = nowIso();
  const { data, error } = await supabase
    .from('sponsored_products')
    .select(
      `id, section, seller_id, product_id, start_at, end_at,
      products!inner(id, name, image_url, price),
      profiles!sponsored_products_seller_id_fkey(full_name)`
    )
    .eq('section', section)
    .eq('is_active', true)
    .gt('end_at', now)
    .order('created_at', { ascending: false });

  if (error || !data) return [];

  return (data as any[]).map((row) => {
    const product = row.products;
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    return {
      rowId: row.id,
      section: row.section,
      productId: row.product_id,
      sellerId: row.seller_id,
      sellerName: profile?.full_name || 'Seller',
      productName: product?.name || 'Unknown Product',
      productImage: product?.image_url || '',
      productPrice: product?.price || 0,
      startAt: row.start_at,
      endAt: row.end_at,
    };
  });
};

export const getActiveSponsoredProductsBySection = async (
  limitPerSection = 100
): Promise<
  Record<SponsoredSection, Product[]>
> => {
  const now = nowIso();
  const { data } = await supabase
    .from('sponsored_products')
    .select('section, products!inner(*)')
    .eq('is_active', true)
    .lte('start_at', now)
    .gt('end_at', now)
    .eq('products.approval_status', 'approved')
    .eq('products.is_active', true)
    .order('created_at', { ascending: false })
    .limit(200);

  const result: Record<SponsoredSection, Product[]> = {
    featured: [],
    trending: [],
    'hot-deals': [],
  };

  (data || []).forEach((row: any) => {
    const section = row.section as SponsoredSection;
    const product = row.products as Product | null;
    if (!section || !product) return;
    if (result[section].length >= limitPerSection) return;
    result[section].push(product);
  });

  return result;
};

export const isProductUsedInOtherSection = (
  productId: string,
  section: SponsoredSection,
  configs: SponsoredSectionConfig[]
) => {
  const now = Date.now();
  return configs.some(
    (row) =>
      row.section !== section &&
      new Date(row.endAt).getTime() > now &&
      row.productIds.includes(productId)
  );
};

export const saveSponsoredSectionConfig = async (input: {
  section: SponsoredSection;
  sellerId: string;
  sellerName: string;
  sellerBrand: string;
  productIds: string[];
  startAt: string;
  endAt: string;
}) => {
  const startMs = new Date(input.startAt).getTime();
  const endMs = new Date(input.endAt).getTime();

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return { success: false, error: 'Invalid start/end datetime.' };
  }

  const duration = endMs - startMs;
  if (duration < 24 * 60 * 60 * 1000) {
    return { success: false, error: 'Duration must be at least 24 hours.' };
  }

  if (duration > 30 * 24 * 60 * 60 * 1000) {
    return { success: false, error: 'Duration cannot exceed 30 days.' };
  }

  if (input.productIds.length === 0) {
    return { success: false, error: 'Please add at least one product.' };
  }

  if (input.productIds.length > 100) {
    return { success: false, error: 'A section can contain maximum 100 products.' };
  }

  const uniqueProductIds = Array.from(new Set(input.productIds)).slice(0, 100);

  const { error } = await supabase.rpc('admin_replace_sponsored_section', {
    p_section: input.section,
    p_seller_id: input.sellerId,
    p_product_ids: uniqueProductIds,
    p_start_at: input.startAt,
    p_end_at: input.endAt,
  });

  if (error) {
    return { success: false, error: error.message || 'Failed to save sponsored products.' };
  }

  return { success: true };
};

export const deleteSponsoredSectionConfig = async (
  section: SponsoredSection,
  sellerId: string
): Promise<{ success: boolean; error?: string }> => {
  const { error } = await supabase.rpc('admin_delete_sponsored_section', {
    p_section: section,
    p_seller_id: sellerId,
  });

  if (error) {
    return { success: false, error: error.message || 'Failed to delete sponsored section.' };
  }

  return { success: true };
};

/** Remove a single product from a sponsored section */
export const removeSponsoredProduct = async (
  section: SponsoredSection,
  productId: string,
): Promise<{ success: boolean; error?: string }> => {
  const { error } = await supabase.rpc('admin_remove_sponsored_product', {
    p_section: section,
    p_product_id: productId,
  });

  if (error) {
    return { success: false, error: error.message || 'Failed to remove product.' };
  }

  return { success: true };
};

/** Add products to a sponsored section */
export const addSponsoredProducts = async (input: {
  section: SponsoredSection;
  sellerId: string;
  productIds: string[];
  startAt: string;
  endAt: string;
}): Promise<{ success: boolean; error?: string }> => {
  if (input.productIds.length === 0) {
    return { success: false, error: 'Please select at least one product.' };
  }

  const uniqueProductIds = Array.from(new Set(input.productIds)).slice(0, 100);

  const { error } = await supabase.rpc('admin_add_sponsored_products', {
    p_section: input.section,
    p_seller_id: input.sellerId,
    p_product_ids: uniqueProductIds,
    p_start_at: input.startAt,
    p_end_at: input.endAt,
  });

  if (error) {
    return { success: false, error: error.message || 'Failed to add products.' };
  }

  return { success: true };
};

export const subscribeSponsoredProducts = (
  onChange: () => void
): (() => void) => {
  const channel: RealtimeChannel = supabase
    .channel('sponsored-products-changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'sponsored_products' },
      () => onChange()
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
};