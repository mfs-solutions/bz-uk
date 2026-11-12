import { supabase } from './supabase';
import type { Promotion } from '../types';

export async function fetchSellerPromotions(sellerId: string): Promise<{ data: Promotion[]; error: string | null }> {
  const { data, error } = await supabase
    .from('promotions')
    .select('*')
    .or(`applicable_to.eq.common,and(applicable_to.eq.seller,applicable_ids.cs.{${sellerId}})`)
    .order('created_at', { ascending: false });

  if (error) return { data: [], error: error.message };
  return { data: (data || []) as Promotion[], error: null };
}

export async function createSellerPromotion(
  sellerId: string,
  input: Pick<Promotion, 'title' | 'description' | 'discount_type' | 'discount_value' | 'start_date' | 'end_date'>
): Promise<{ data: Promotion | null; error: string | null }> {
  const payload = {
    title: input.title,
    description: input.description || null,
    discount_type: input.discount_type,
    discount_value: input.discount_value,
    applicable_to: 'seller',
    applicable_ids: [sellerId],
    start_date: input.start_date,
    end_date: input.end_date,
    is_active: true,
    current_uses: 0,
  };

  const { data, error } = await supabase
    .from('promotions')
    .insert(payload)
    .select('*')
    .single();

  if (error) return { data: null, error: error.message };
  return { data: data as Promotion, error: null };
}

export async function updateSellerPromotionStatus(
  promotionId: string,
  isActive: boolean,
  sellerId: string
): Promise<{ success: boolean; error: string | null }> {
  const { error } = await supabase
    .from('promotions')
    .update({ is_active: isActive })
    .eq('id', promotionId)
    .contains('applicable_ids', [sellerId]);

  if (error) return { success: false, error: error.message };
  return { success: true, error: null };
}
