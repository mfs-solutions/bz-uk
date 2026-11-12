
import { supabase } from './supabase';
import { clearProfileCache } from './profileCache';
import { sanitizeSearchQuery } from '../utils/validation';

// ============================================================
// ADMIN SERVICE — Supabase CRUD for all admin panel operations
// ============================================================

// ---------- SELLERS ----------

export async function getAllSellers(options?: {
  limit?: number;
  offset?: number;
  search?: string;
  kycFilter?: string;
}) {
  const selectCols = options?.kycFilter
    ? '*, seller_kyc!inner(kyc_status, business_name), products(count)'
    : '*, seller_kyc(kyc_status, business_name), products(count)';

  let query = supabase
    .from('profiles')
    .select(selectCols, { count: 'exact' })
    .eq('role', 'seller')
    .order('created_at', { ascending: false });

  if (options?.search) {
    const safe = sanitizeSearchQuery(options.search);
    if (safe) query = query.or(
      `full_name.ilike.%${safe}%,email.ilike.%${safe}%`
    );
  }
  if (options?.kycFilter) {
    query = query.eq('seller_kyc.kyc_status', options.kycFilter);
  }

  const limit = options?.limit || 50;
  const offset = options?.offset || 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  const sellers = (data || []).map((row: any) => {
    const kyc = Array.isArray(row.seller_kyc) ? row.seller_kyc[0] : row.seller_kyc;
    const productCount = Array.isArray(row.products) ? (row.products[0]?.count ?? 0) : 0;
    return {
      id: row.id,
      user_id: row.id,
      shop_name: kyc?.business_name || row.full_name || row.email || 'Seller',
      email: row.email || '',
      phone: row.phone || '',
      full_name: row.full_name || '',
      total_listings: productCount,
      badge: row.badge || undefined,
      kyc_status: kyc?.kyc_status || (row.is_verified ? 'approved' : 'pending'),
      product_approval_status: 'pending' as const,
      created_at: row.created_at,
      is_active: !row.is_banned,
      is_verified: row.is_verified,
    };
  });

  return { sellers, total: count || 0, error: error?.message || null };
}

export async function updateSellerKYC(
  sellerId: string,
  status: string,
  reason?: string
) {
  const { data, error } = await supabase.rpc('admin_update_seller_kyc', {
    p_seller_id: sellerId,
    p_status: status,
    p_reason: reason || null,
  });
  if (error) return { success: false, error: error.message };
  if (data && !data.success) return { success: false, error: data.error };
  return { success: true, error: null };
}

export async function updateSellerBadge(
  sellerId: string,
  badge: string
) {
  const { error } = await supabase.rpc('admin_update_seller_badge', {
    p_seller_id: sellerId,
    p_badge: badge,
  });
  if (error) return { success: false, error: error.message };
  return { success: true, error: null };
}

// ---------- USERS ----------

export async function getAllUsers(options?: {
  limit?: number;
  offset?: number;
  search?: string;
}) {
  let query = supabase
    .from('profiles')
    .select('*', { count: 'exact' })
    .eq('role', 'user')
    .order('created_at', { ascending: false });

  if (options?.search) {
    const safe = sanitizeSearchQuery(options.search);
    if (safe) query = query.or(
      `full_name.ilike.%${safe}%,email.ilike.%${safe}%`
    );
  }

  const limit = options?.limit || 50;
  const offset = options?.offset || 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  return { users: data || [], total: count || 0, error: error?.message || null };
}

export async function banUser(userId: string) {
  const { error } = await supabase
    .from('profiles')
    .update({ is_banned: true })
    .eq('id', userId);
  return { success: !error, error: error?.message || null };
}

export async function unbanUser(userId: string) {
  const { error } = await supabase
    .from('profiles')
    .update({ is_banned: false })
    .eq('id', userId);
  return { success: !error, error: error?.message || null };
}

export async function deleteUser(userId: string) {
  const { error } = await supabase
    .from('profiles')
    .delete()
    .eq('id', userId);
  return { success: !error, error: error?.message || null };
}

// ---------- ORDERS ----------

export async function getAllOrders(options?: {
  limit?: number;
  offset?: number;
  status?: string;
}) {
  let query = supabase
    .from('orders')
    .select('*, order_items(*)', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (options?.status) query = query.eq('status', options.status);

  const limit = options?.limit || 50;
  const offset = options?.offset || 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  return { orders: data || [], total: count || 0, error: error?.message || null };
}

export async function updateOrderStatus(orderId: string, status: string) {
  const { error } = await supabase
    .from('orders')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', orderId);
  return { success: !error, error: error?.message || null };
}

export async function processRefund(
  orderId: string,
  amount: number,
  reason?: string
) {
  const { data, error } = await supabase
    .from('payment_refunds')
    .insert({
      order_id: orderId,
      amount,
      reason: reason || '',
      status: 'processed',
    })
    .select('id')
    .single();

  if (!error) {
    await supabase
      .from('orders')
      .update({ status: 'refunded' })
      .eq('id', orderId);
  }

  return {
    success: !error,
    refundId: data?.id || '',
    error: error?.message || null,
  };
}

// ---------- COMPLAINTS ----------

export async function getAllComplaints(options?: {
  limit?: number;
  offset?: number;
  status?: string;
}) {
  let query = supabase
    .from('complaints')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (options?.status) query = query.eq('status', options.status);

  const limit = options?.limit || 50;
  const offset = options?.offset || 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  return { complaints: data || [], total: count || 0, error: error?.message || null };
}

export async function updateComplaintStatus(
  complaintId: string,
  status: string,
  resolution?: string
) {
  const { error } = await supabase
    .from('complaints')
    .update({
      status,
      resolution: resolution || null,
      resolved_at: status === 'resolved' ? new Date().toISOString() : null,
    })
    .eq('id', complaintId);
  return { success: !error, error: error?.message || null };
}

// ---------- REVIEWS ----------

export async function getAllReviews(options?: {
  limit?: number;
  offset?: number;
  flagged?: boolean;
}) {
  let query = supabase
    .from('reviews')
    .select('*, profiles:user_id(full_name, email)', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (options?.flagged !== undefined) {
    query = query.eq('is_flagged', options.flagged);
  }

  const limit = options?.limit || 50;
  const offset = options?.offset || 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  return { reviews: data || [], total: count || 0, error: error?.message || null };
}

export async function flagReview(reviewId: string) {
  const { error } = await supabase
    .from('reviews')
    .update({ is_flagged: true })
    .eq('id', reviewId);
  return { success: !error, error: error?.message || null };
}

export async function deleteReview(reviewId: string) {
  const { error } = await supabase
    .from('reviews')
    .delete()
    .eq('id', reviewId);
  return { success: !error, error: error?.message || null };
}

// ---------- BANNERS ----------

export async function getAllBanners() {
  const { data, error } = await supabase
    .from('banners')
    .select('*')
    .order('position', { ascending: true });
  return { banners: data || [], error: error?.message || null };
}

export async function createBanner(banner: {
  title: string;
  image_url: string;
  link?: string;
  is_active?: boolean;
  position?: number;
  banner_type?: 'hero' | 'ad' | 'video';
  video_url?: string;
  ad_slot?: number;
}) {
  const { data, error } = await supabase
    .from('banners')
    .insert(banner)
    .select()
    .single();
  return { data, error: error?.message || null };
}

export async function updateBanner(
  bannerId: string,
  updates: Partial<Pick<import('../types').Banner, 'title' | 'image_url' | 'link' | 'is_active' | 'position' | 'banner_type' | 'video_url' | 'ad_slot'>>
) {
  const { data, error } = await supabase
    .from('banners')
    .update(updates)
    .eq('id', bannerId)
    .select()
    .single();
  return { data, error: error?.message || null };
}

export async function deleteBanner(bannerId: string) {
  const { error } = await supabase
    .from('banners')
    .delete()
    .eq('id', bannerId);
  return { success: !error, error: error?.message || null };
}

// ---------- PROMOTIONS ----------

export async function getAllPromotions() {
  const { data, error } = await supabase
    .from('promotions')
    .select('*')
    .order('created_at', { ascending: false });
  return { promotions: data || [], error: error?.message || null };
}

export async function createPromotion(promo: Record<string, unknown>) {
  const { data, error } = await supabase
    .from('promotions')
    .insert(promo)
    .select()
    .single();
  return { data, error: error?.message || null };
}

export async function updatePromotion(
  promoId: string,
  updates: Record<string, unknown>
) {
  const { data, error } = await supabase
    .from('promotions')
    .update(updates)
    .eq('id', promoId)
    .select()
    .single();
  return { data, error: error?.message || null };
}

export async function deletePromotion(promoId: string) {
  const { error } = await supabase
    .from('promotions')
    .delete()
    .eq('id', promoId);
  return { success: !error, error: error?.message || null };
}

// ---------- ACCOUNTS ----------

export async function getAccountSummary(options?: {
  startDate?: string;
  endDate?: string;
}) {
  // Use server-side function — no currency filter (all currencies summed)
  const rpcParams: Record<string, string | null> = {
    p_currency: null,
    p_start_date: options?.startDate || null,
    p_end_date: options?.endDate || null,
  };
  const { data, error } = await supabase.rpc('get_account_summary_safe', rpcParams);

  if (error || !data) {
    // Fallback: client-side computation
    let fallbackQuery = supabase
      .from('orders')
      .select('product_subtotal, total_amount, platform_fee, seller_earning, shipping_charge, actual_shipping_cost, platform_shipping_margin, status, payment_status, created_at');

    if (options?.startDate) fallbackQuery = fallbackQuery.gte('created_at', options.startDate + 'T00:00:00');
    if (options?.endDate) fallbackQuery = fallbackQuery.lte('created_at', options.endDate + 'T23:59:59');

    const { data: orders } = await fallbackQuery;

    const validOrders = (orders || []).filter((o: any) =>
      !['cancelled', 'refunded', 'returned'].includes(o.status) &&
      ['paid', 'completed', 'succeeded'].includes(o.payment_status)
    );

    const totalRevenue = validOrders.reduce(
      (sum: number, o: any) => sum + (o.product_subtotal || o.total_amount || 0), 0
    );
    const platformFees = validOrders.reduce(
      (sum: number, o: any) => sum + (o.platform_fee || 0), 0
    );
    const sellerEarnings = validOrders.reduce(
      (sum: number, o: any) => sum + (o.seller_earning || 0), 0
    );
    const shippingMarkup = validOrders.reduce(
      (sum: number, o: any) => sum + (o.platform_shipping_margin || 0), 0
    );

    return {
      totalRevenue,
      totalExpenses: 0,
      totalPayouts: 0,
      netProfit: platformFees + shippingMarkup,
      platformFees,
      shippingMarkup,
      sellerEarnings,
      orderCount: validOrders.length,
      refunds: 0,
    };
  }

  return {
    totalRevenue: data.total_revenue || 0,
    totalExpenses: 0,
    totalPayouts: data.total_payouts || 0,
    netProfit: data.net_platform_profit || 0,
    platformFees: data.platform_fees || 0,
    shippingMarkup: data.shipping_markup || 0,
    sellerEarnings: data.seller_earnings || 0,
    walletBalance: data.wallet_balance || 0,
    orderCount: data.order_count || 0,
    refunds: data.refunds || 0,
  };
}

export async function getDaybook(options?: {
  limit?: number;
  offset?: number;
  startDate?: string;
  endDate?: string;
}) {
  let query = supabase
    .from('daybook_entries')
    .select('*', { count: 'exact' })
    .order('entry_date', { ascending: false });

  if (options?.startDate) query = query.gte('entry_date', options.startDate);
  if (options?.endDate) query = query.lte('entry_date', options.endDate);

  const limit = options?.limit || 50;
  const offset = options?.offset || 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  return { entries: data || [], total: count || 0, error: error?.message || null };
}

export async function getBankBook(options?: {
  limit?: number;
  offset?: number;
}) {
  let query = supabase
    .from('bank_book_entries')
    .select('*', { count: 'exact' })
    .order('entry_date', { ascending: false });

  const limit = options?.limit || 50;
  const offset = options?.offset || 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  return { entries: data || [], total: count || 0, error: error?.message || null };
}

export async function getAccountHeads() {
  const { data, error } = await supabase
    .from('account_heads')
    .select('*')
    .order('name');
  return { data: data || [], error: error?.message || null };
}

export async function getExpenses(options?: {
  limit?: number;
  offset?: number;
}) {
  let query = supabase
    .from('expense_entries')
    .select('*', { count: 'exact' })
    .order('expense_date', { ascending: false });

  const limit = options?.limit || 50;
  const offset = options?.offset || 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  return { expenses: data || [], total: count || 0, error: error?.message || null };
}

export async function getSellerPayouts(options?: {
  limit?: number;
  offset?: number;
}) {
  let query = supabase
    .from('seller_payouts')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false });

  const limit = options?.limit || 50;
  const offset = options?.offset || 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  return { payouts: data || [], total: count || 0, error: error?.message || null };
}

export async function getMembershipPlans() {
  const { data, error } = await supabase
    .from('membership_plans')
    .select('*')
    .order('price');
  return { data: data || [], error: error?.message || null };
}

export async function getPlatformCosts() {
  const { data, error } = await supabase
    .from('platform_costs')
    .select('*')
    .order('created_at', { ascending: false });
  return { data: data || [], error: error?.message || null };
}

export async function getPlatformCommissionRules() {
  const { data, error } = await supabase
    .from('platform_commission_rules')
    .select('id, country_id, from_price, to_price, charge_percent, extra_charge, is_active, created_at, updated_at, countries:country_id(country_name, country_code)')
    .order('created_at', { ascending: false });
  return { data: data || [], error: error?.message || null };
}

// ---------- ACCOUNTS CUD ----------

export async function createExpense(expense: Record<string, unknown>) {
  const { data, error } = await supabase
    .from('expense_entries')
    .insert(expense)
    .select()
    .single();
  return { data, error: error?.message || null };
}

export async function updateExpense(id: string, updates: Record<string, unknown>) {
  const { data, error } = await supabase
    .from('expense_entries')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  return { data, error: error?.message || null };
}

export async function deleteExpense(id: string) {
  const { error } = await supabase
    .from('expense_entries')
    .delete()
    .eq('id', id);
  return { success: !error, error: error?.message || null };
}

export async function createAccountHead(head: Record<string, unknown>) {
  const { data, error } = await supabase
    .from('account_heads')
    .insert(head)
    .select()
    .single();
  return { data, error: error?.message || null };
}

export async function updateAccountHead(id: string, updates: Record<string, unknown>) {
  const { data, error } = await supabase
    .from('account_heads')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  return { data, error: error?.message || null };
}

export async function deleteAccountHead(id: string) {
  const { error } = await supabase
    .from('account_heads')
    .delete()
    .eq('id', id);
  return { success: !error, error: error?.message || null };
}

export async function createMembershipPlan(plan: Record<string, unknown>) {
  const { data, error } = await supabase
    .from('membership_plans')
    .insert(plan)
    .select()
    .single();
  return { data, error: error?.message || null };
}

export async function updateMembershipPlan(id: string, updates: Record<string, unknown>) {
  const { data, error } = await supabase
    .from('membership_plans')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  return { data, error: error?.message || null };
}

export async function deleteMembershipPlan(id: string) {
  const { error } = await supabase
    .from('membership_plans')
    .delete()
    .eq('id', id);
  return { success: !error, error: error?.message || null };
}

export async function createPlatformCost(cost: Record<string, unknown>) {
  const { data, error } = await supabase
    .from('platform_costs')
    .insert(cost)
    .select()
    .single();
  return { data, error: error?.message || null };
}

export async function updatePlatformCost(id: string, updates: Record<string, unknown>) {
  const { data, error } = await supabase
    .from('platform_costs')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  return { data, error: error?.message || null };
}

export async function deletePlatformCost(id: string) {
  const { error } = await supabase
    .from('platform_costs')
    .delete()
    .eq('id', id);
  return { success: !error, error: error?.message || null };
}

export async function createPlatformCommissionRule(rule: Record<string, unknown>) {
  const { data, error } = await supabase
    .from('platform_commission_rules')
    .insert(rule)
    .select('id, country_id, from_price, to_price, charge_percent, extra_charge, is_active, created_at, updated_at, countries:country_id(country_name, country_code)')
    .single();
  return { data, error: error?.message || null };
}

export async function updatePlatformCommissionRule(id: string, updates: Record<string, unknown>) {
  const { data, error } = await supabase
    .from('platform_commission_rules')
    .update(updates)
    .eq('id', id)
    .select('id, country_id, from_price, to_price, charge_percent, extra_charge, is_active, created_at, updated_at, countries:country_id(country_name, country_code)')
    .single();
  return { data, error: error?.message || null };
}

export async function deletePlatformCommissionRule(id: string) {
  const { error } = await supabase
    .from('platform_commission_rules')
    .delete()
    .eq('id', id);
  return { success: !error, error: error?.message || null };
}

export async function approveSellerPayout(id: string) {
  const { data, error } = await supabase
    .from('seller_payouts')
    .update({ status: 'approved', processed_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  return { data, error: error?.message || null };
}

// ---------- PLATFORM TRANSACTIONS ----------

export async function getPlatformTransactions(options?: {
  limit?: number;
  offset?: number;
  type?: string;
  search?: string;
}) {
  let query = supabase
    .from('platform_transactions')
    .select('*', { count: 'exact' })
    .order('txn_date', { ascending: false });

  if (options?.type && options.type !== 'all') {
    query = query.eq('txn_type', options.type);
  }
  if (options?.search) {
    query = query.or(`description.ilike.%${options.search}%,reference.ilike.%${options.search}%`);
  }

  const limit = options?.limit || 50;
  const offset = options?.offset || 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  return { transactions: data || [], total: count || 0, error: error?.message || null };
}

export async function createPlatformTransaction(txn: Record<string, unknown>) {
  const { data, error } = await supabase
    .from('platform_transactions')
    .insert(txn)
    .select()
    .single();
  return { data, error: error?.message || null };
}

export async function getDailyProfitBreakup(options?: {
  date?: string;
  startDate?: string;
  endDate?: string;
}) {
  const rpcParams: Record<string, string | null> = {
    p_date: options?.date || null,
    p_start_date: options?.startDate || null,
    p_end_date: options?.endDate || null,
  };
  const { data, error } = await supabase.rpc('get_daily_profit_breakup', rpcParams);
  if (error) {
    return { data: null, error: error.message };
  }
  return { data, error: null };
}

export async function getSellerPayoutSummary() {
  const { data, error } = await supabase.rpc('get_seller_payout_summary');
  if (error) {
    return { data: null, error: error.message };
  }
  return { data, error: null };
}

export async function getSellerPayoutsDetailed(options?: {
  limit?: number;
  offset?: number;
  status?: string;
}) {
  let query = supabase
    .from('seller_payouts')
    .select(`
      *,
      profiles:seller_id (
        full_name,
        country_id
      )
    `, { count: 'exact' })
    .order('created_at', { ascending: false });

  if (options?.status && options.status !== 'all') {
    query = query.eq('status', options.status);
  }

  const limit = options?.limit || 50;
  const offset = options?.offset || 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  return { payouts: data || [], total: count || 0, error: error?.message || null };
}

export async function getSettlementRecords() {
  const { data, error } = await supabase
    .from('seller_settlements')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);
  return { data: data || [], error: error?.message || null };
}

export async function getExpensesByCategory() {
  const { data, error } = await supabase
    .from('expense_entries')
    .select('category, amount')
    .order('expense_date', { ascending: false });

  if (error) return { data: {}, error: error.message };

  const categories: Record<string, number> = {};
  (data || []).forEach((e: { category: string; amount: number }) => {
    const cat = e.category || 'Other';
    categories[cat] = (categories[cat] || 0) + (e.amount || 0);
  });
  return { data: categories, error: null };
}

/* ───── Admin Accounts: orders with full details ───── */
export async function getOrdersForAccounts(options?: {
  limit?: number;
  offset?: number;
  startDate?: string;
  endDate?: string;
  sellerId?: string;
  status?: string;
  search?: string;
}) {
  let query = supabase
    .from('orders')
    .select(`
      id, order_number, created_at, status, payment_status, payment_method,
      total_amount, product_subtotal, platform_fee, seller_earning, currency,
      shipping_charge, actual_shipping_cost, platform_shipping_margin,
      settlement_cycle, settlement_status,
      seller_id, user_id,
      shipping_address,
      order_items ( id, product_name, quantity, price, seller_earning, variant_info )
    `, { count: 'exact' })
    .order('created_at', { ascending: false });

  if (options?.startDate) query = query.gte('created_at', options.startDate + 'T00:00:00');
  if (options?.endDate) query = query.lte('created_at', options.endDate + 'T23:59:59');
  if (options?.sellerId && options.sellerId !== 'all') query = query.eq('seller_id', options.sellerId);
  if (options?.status && options.status !== 'all') query = query.eq('status', options.status);
  if (options?.search) {
    const safe = sanitizeSearchQuery(options.search);
    if (safe) query = query.or(`order_number.ilike.%${safe}%`);
  }

  const limit = options?.limit || 50;
  const offset = options?.offset || 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error || !data || data.length === 0) {
    return { orders: data || [], total: count || 0, error: error?.message || null };
  }

  // Enrich with profile names (buyer + seller)
  const userIds = [...new Set(data.map((o: any) => o.user_id).filter(Boolean))];
  const sellerIds = [...new Set(data.map((o: any) => o.seller_id).filter(Boolean))];
  const allIds = [...new Set([...userIds, ...sellerIds])];

  let profileMap: Record<string, string> = {};
  if (allIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', allIds);
    (profiles || []).forEach((p: any) => { profileMap[p.id] = p.full_name || ''; });
  }

  const enriched = data.map((o: any) => ({
    ...o,
    buyer_name: profileMap[o.user_id] || (o.shipping_address as any)?.full_name || '-',
    seller_name: profileMap[o.seller_id] || '-',
  }));

  return { orders: enriched, total: count || 0, error: null };
}

/* ───── Sellers list (for filter dropdown) ───── */
export async function getSellersList() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('role', 'seller')
    .order('full_name');
  return { data: data || [], error: error?.message || null };
}

// ---------- PRODUCT VARIANTS ----------

export async function getProductVariants(productId: string) {
  const { data, error } = await supabase
    .from('product_variants')
    .select('*')
    .eq('product_id', productId)
    .order('created_at', { ascending: false });
  return { data: data || [], error: error?.message || null };
}

export async function createProductVariant(variant: Record<string, unknown>) {
  const { data, error } = await supabase
    .from('product_variants')
    .insert(variant)
    .select()
    .single();
  return { data, error: error?.message || null };
}

export async function updateProductVariant(id: string, updates: Record<string, unknown>) {
  const { data, error } = await supabase
    .from('product_variants')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  return { data, error: error?.message || null };
}

export async function deleteProductVariant(id: string) {
  const { error } = await supabase
    .from('product_variants')
    .delete()
    .eq('id', id);
  return { success: !error, error: error?.message || null };
}

export async function getProductColors() {
  const { data, error } = await supabase
    .from('product_colors')
    .select('*')
    .order('name');
  return { data: data || [], error: error?.message || null };
}

export async function createProductColor(color: Record<string, unknown>) {
  const { data, error } = await supabase
    .from('product_colors')
    .insert(color)
    .select()
    .single();
  return { data, error: error?.message || null };
}

// ---------- ADMIN USERS ----------

export async function getAdminUsers() {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', 'admin')
    .order('created_at', { ascending: false });
  return { data: data || [], error: error?.message || null };
}

export async function updateAdminRole(userId: string, _role: string) {
  const { data, error } = await supabase.rpc('admin_promote_user', {
    p_user_id: userId,
  });
  if (error) return { data: null, error: error.message };
  if (data && !data.success) return { data: null, error: data.error };
  return { data, error: null };
}

export async function deleteAdminUser(userId: string) {
  // Demote from admin via secure RPC (prevents self-demotion)
  const { data, error } = await supabase.rpc('admin_demote_user', {
    p_user_id: userId,
  });
  if (error) return { data: null, error: error.message };
  if (data && !data.success) return { data: null, error: data.error };
  return { data, error: null };
}

// ---------- ADMIN ADDRESSES ----------

export async function getAllUsersWithAddresses() {
  const { data: users, error: usersErr } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .order('full_name');
  if (usersErr) return { data: [], error: usersErr.message };

  const results = [];
  for (const user of (users || [])) {
    const { data: addresses } = await supabase
      .from('user_addresses')
      .select('*')
      .eq('user_id', user.id)
      .order('is_default', { ascending: false });
    if (addresses && addresses.length > 0) {
      results.push({
        userId: user.id,
        userName: user.full_name || user.email || 'Unknown',
        userEmail: user.email || '',
        addresses: addresses.map((a: any) => ({
          id: a.id,
          fullName: a.full_name || '',
          phoneNumber: a.phone || '',
          email: a.email || '',
          country: a.country || '',
          streetAddress1: a.street_address_1 || a.address_line1 || '',
          streetAddress2: a.street_address_2 || a.address_line2 || '',
          city: a.city || '',
          state: a.state || '',
          postalCode: a.postal_code || a.zip_code || '',
          addressType: a.address_type || 'home',
          isDefault: a.is_default || false,
          deliveryNotes: a.delivery_notes || '',
        })),
      });
    }
  }
  return { data: results, error: null };
}

export async function generateReport(params: {
  type: string;
  startDate?: string;
  endDate?: string;
  format?: string;
  category?: string;
  country?: string;
}) {
  // Build report data from DB
  let reportData: any[] = [];

  if (params.type === 'sales' || params.type === 'revenue') {
    let query = supabase.from('orders').select('*');
    if (params.startDate) query = query.gte('created_at', params.startDate);
    if (params.endDate) query = query.lte('created_at', params.endDate);
    if (params.country) query = query.eq('country', params.country);
    const { data } = await query;
    reportData = data || [];
  } else if (params.type === 'sellers') {
    let query = supabase.from('profiles').select('*').eq('role', 'seller');
    if (params.country) query = query.eq('country', params.country);
    const { data } = await query;
    reportData = data || [];
  } else if (params.type === 'users') {
    let query = supabase.from('profiles').select('*').eq('role', 'user');
    if (params.country) query = query.eq('country', params.country);
    const { data } = await query;
    reportData = data || [];
  } else if (params.type === 'products') {
    let query = supabase.from('products').select('*');
    if (params.category) query = query.eq('category', params.category);
    const { data } = await query;
    reportData = data || [];
  }

  // Create CSV blob
  if (reportData.length === 0) {
    return new Blob(['No data found'], { type: 'text/plain' });
  }

  const headers = Object.keys(reportData[0]).join(',');
  const rows = reportData.map((r) =>
    Object.values(r)
      .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`)
      .join(',')
  );
  const csv = [headers, ...rows].join('\n');
  return new Blob([csv], { type: 'text/csv' });
}

// ---------- ADMIN PROFILE ----------

export async function getAdminProfile(adminId: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', adminId)
    .single();
  return { data, error: error?.message || null };
}

// ---------- NOTIFICATIONS ----------

export async function getNotifications(userId: string) {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  return { data: data || [], error: error?.message || null };
}

export async function markNotificationRead(notificationId: string) {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notificationId);
  return { success: !error, error: error?.message || null };
}

export async function deleteNotification(notificationId: string, userId?: string) {
  let query = supabase
    .from('notifications')
    .delete()
    .eq('id', notificationId);
  if (userId) query = query.eq('user_id', userId);
  const { error } = await query;
  return { success: !error, error: error?.message || null };
}

// ---------- USER ADDRESSES ----------

export async function getUserAddresses(userId: string) {
  const { data, error } = await supabase
    .from('user_addresses')
    .select('*')
    .eq('user_id', userId)
    .order('is_default', { ascending: false });
  return { data: data || [], error: error?.message || null };
}

export async function createUserAddress(address: Record<string, unknown>) {
  clearProfileCache();
  const { data, error } = await supabase
    .from('user_addresses')
    .insert(address)
    .select()
    .single();
  return { data, error: error?.message || null };
}

export async function updateUserAddress(
  addressId: string,
  updates: Record<string, unknown>
) {
  clearProfileCache();
  const { data, error } = await supabase
    .from('user_addresses')
    .update(updates)
    .eq('id', addressId)
    .select()
    .single();
  return { data, error: error?.message || null };
}

export async function deleteUserAddress(addressId: string) {
  clearProfileCache();
  const { data, error } = await supabase
    .from('user_addresses')
    .delete()
    .eq('id', addressId)
    .select('id')
    .maybeSingle();

  const success = Boolean(data?.id) && !error;
  return {
    success,
    error: error?.message || (success ? null : 'Address was not found or could not be deleted.'),
  };
}

export async function setDefaultUserAddress(userId: string, addressId: string) {
  clearProfileCache();
  // First ensure selected address belongs to this user and is marked default.
  const { error: setError } = await supabase
    .from('user_addresses')
    .update({ is_default: true })
    .eq('id', addressId)
    .eq('user_id', userId)
    .select('id')
    .single();
  if (setError) return { success: false, error: setError.message };

  // Then unset all other defaults for the same user.
  const { error: unsetError } = await supabase
    .from('user_addresses')
    .update({ is_default: false })
    .eq('user_id', userId)
    .neq('id', addressId)
    .eq('is_default', true);
  if (unsetError) return { success: false, error: unsetError.message };

  return { success: true, error: null };
}

// ---------- WISHLISTS ----------

export async function getWishlist(userId: string) {
  const { data, error } = await supabase
    .from('wishlists')
    .select('*, products(*)')
    .eq('user_id', userId);
  return { data: data || [], error: error?.message || null };
}

export async function addToWishlist(userId: string, productId: string) {
  const { error } = await supabase
    .from('wishlists')
    .upsert({ user_id: userId, product_id: productId }, { onConflict: 'user_id,product_id', ignoreDuplicates: true });
  return { success: !error, error: error?.message || null };
}

export async function removeFromWishlist(userId: string, productId: string) {
  const { error } = await supabase
    .from('wishlists')
    .delete()
    .eq('user_id', userId)
    .eq('product_id', productId);
  return { success: !error, error: error?.message || null };
}

// ---------- CART ----------

export async function getCartItems(userId: string) {
  const { data, error } = await supabase
    .from('cart_items')
    .select('*, products(*)')
    .eq('user_id', userId);
  return { data: data || [], error: error?.message || null };
}

export async function upsertCartItem(
  userId: string,
  productId: string,
  quantity: number
) {
  const { error } = await supabase
    .from('cart_items')
    .upsert(
      { user_id: userId, product_id: productId, quantity },
      { onConflict: 'user_id,product_id' }
    );
  return { success: !error, error: error?.message || null };
}

export async function removeCartItem(userId: string, productId: string) {
  const { error } = await supabase
    .from('cart_items')
    .delete()
    .eq('user_id', userId)
    .eq('product_id', productId);
  return { success: !error, error: error?.message || null };
}

export async function clearCart(userId: string) {
  const { error } = await supabase
    .from('cart_items')
    .delete()
    .eq('user_id', userId);
  return { success: !error, error: error?.message || null };
}

// ---------- REVIEWS (User) ----------

export async function createReview(review: {
  user_id: string;
  product_id: string;
  rating: number;
  heading?: string;
  comment?: string;
  images?: string[];
  benefits?: string[];
}) {
  const { data, error } = await supabase
    .from('reviews')
    .insert(review)
    .select()
    .single();

  // Recalculate product rating
  if (!error && data) {
    const { data: allReviews } = await supabase
      .from('reviews')
      .select('rating')
      .eq('product_id', review.product_id);
    if (allReviews && allReviews.length > 0) {
      const avg = allReviews.reduce((s, r) => s + r.rating, 0) / allReviews.length;
      await supabase
        .from('products')
        .update({ rating: Math.round(avg * 10) / 10, review_count: allReviews.length })
        .eq('id', review.product_id);
    }
  }

  return { data, error: error?.message || null };
}

// ---------- AUDIT LOGS ----------

export async function getAuditLogs(options?: {
  limit?: number;
  offset?: number;
}) {
  let query = supabase
    .from('audit_logs')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false });

  const limit = options?.limit || 50;
  const offset = options?.offset || 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  return { logs: data || [], total: count || 0, error: error?.message || null };
}

// ---------- SEARCH (Admin Global) ----------

export async function adminGlobalSearch(
  query: string,
  filters: string[] = []
) {
  const results: Array<{
    type: string;
    id: string;
    title: string;
    description: string;
    metadata: string;
  }> = [];

  const safeTerm = `%${sanitizeSearchQuery(query)}%`;

  if (filters.length === 0 || filters.includes('users')) {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, email, role')
      .eq('role', 'user')
      .or(`full_name.ilike.${safeTerm},email.ilike.${safeTerm}`)
      .limit(10);
    (data || []).forEach((u: any) => {
      results.push({
        type: 'user',
        id: u.id,
        title: u.full_name || u.email,
        description: `User: ${u.email}`,
        metadata: u.role,
      });
    });
  }

  if (filters.length === 0 || filters.includes('sellers')) {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, email, role')
      .eq('role', 'seller')
      .or(`full_name.ilike.${safeTerm},email.ilike.${safeTerm}`)
      .limit(10);
    (data || []).forEach((s: any) => {
      results.push({
        type: 'seller',
        id: s.id,
        title: s.full_name || s.email,
        description: `Seller: ${s.email}`,
        metadata: s.role,
      });
    });
  }

  if (filters.length === 0 || filters.includes('products')) {
    const { data } = await supabase
      .from('products')
      .select('id, name, category, price, currency')
      .or(`name.ilike.${safeTerm},description.ilike.${safeTerm}`)
      .limit(10);
    (data || []).forEach((p: any) => {
      results.push({
        type: 'product',
        id: p.id,
        title: p.name,
        description: `Category: ${p.category}`,
        metadata: `${p.currency || 'INR'} ${p.price}`,
      });
    });
  }

  if (filters.length === 0 || filters.includes('orders')) {
    const { data } = await supabase
      .from('orders')
      .select('id, status, total_amount, created_at, currency')
      .or(`id.ilike.${safeTerm},status.ilike.${safeTerm}`)
      .limit(10);
    (data || []).forEach((o: any) => {
      results.push({
        type: 'order',
        id: o.id,
        title: `Order ${o.id.slice(0, 8)}`,
        description: `Status: ${o.status}`,
        metadata: `${o.currency || 'INR'} ${o.total_amount}`,
      });
    });
  }

  return results;
}

// ---------- PRODUCT IMAGES (Admin) ----------

export async function getProductImages(productId: string) {
  const { data, error } = await supabase
    .from('products')
    .select('id, images, image_url')
    .eq('id', productId)
    .single();

  if (error || !data) return [];

  const images: Array<{
    id: string;
    product_id: string;
    image_url: string;
    imageUrl: string;
    is_main: boolean;
    isMainImage: boolean;
    display_order: number;
    displayOrder: number;
  }> = [];

  // Main image
  if (data.image_url) {
    images.push({
      id: `main_${productId}`,
      product_id: productId,
      image_url: data.image_url,
      imageUrl: data.image_url,
      is_main: true,
      isMainImage: true,
      display_order: 0,
      displayOrder: 0,
    });
  }

  // Additional images from JSONB array
  const additionalImages = (data.images || []) as string[];
  additionalImages.forEach((url: string, idx: number) => {
    if (url !== data.image_url) {
      images.push({
        id: `img_${productId}_${idx}`,
        product_id: productId,
        image_url: url,
        imageUrl: url,
        is_main: false,
        isMainImage: false,
        display_order: idx + 1,
        displayOrder: idx + 1,
      });
    }
  });

  return images;
}

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10 MB

function validateImageUpload(file: File) {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new Error('Invalid image type. Allowed: JPEG, PNG, WebP, GIF');
  }
  if (file.size > MAX_IMAGE_SIZE) {
    throw new Error(`File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max: 10MB`);
  }
}

export async function uploadProductImageFile(
  _productId: string,
  file: File,
  _userId: string
): Promise<string> {
  validateImageUpload(file);
  const ext = file.name.split('.').pop() || 'jpg';
  const path = `products/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from('product-images')
    .upload(path, file, { contentType: file.type });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from('product-images').getPublicUrl(path);
  return data.publicUrl;
}

// ---------- KYC REQUIREMENTS ----------

export async function getAllKYCRequirements() {
  const { data, error } = await supabase
    .from('seller_kyc_documents')
    .select('*')
    .order('created_at', { ascending: false });
  return { data: data || [], error: error?.message || null };
}

export async function createKYCRequirement(req: Record<string, unknown>) {
  const { data, error } = await supabase
    .from('seller_kyc_documents')
    .insert(req)
    .select()
    .single();
  return { data, error: error?.message || null };
}

export async function updateKYCRequirement(
  id: string,
  updates: Record<string, unknown>
) {
  const { data, error } = await supabase
    .from('seller_kyc_documents')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  return { data, error: error?.message || null };
}

export async function deleteKYCRequirement(id: string) {
  const { error } = await supabase
    .from('seller_kyc_documents')
    .delete()
    .eq('id', id);
  return { success: !error, error: error?.message || null };
}

// ---------- SYSTEM HEALTH ----------

export async function getSystemHealth() {
  // Gather counts from key tables
  const [profiles, products, orders, complaints] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase.from('products').select('id', { count: 'exact', head: true }),
    supabase.from('orders').select('id', { count: 'exact', head: true }),
    supabase.from('complaints').select('id', { count: 'exact', head: true }),
  ]);

  return {
    totalUsers: profiles.count || 0,
    totalProducts: products.count || 0,
    totalOrders: orders.count || 0,
    totalComplaints: complaints.count || 0,
    dbStatus: 'healthy',
    lastChecked: new Date().toISOString(),
  };
}

// ═══════════════════════════════════════
// Manual Payouts (Admin → Seller)
// ═══════════════════════════════════════

/** Get all manual payout records with seller names */
export async function getManualPayouts() {
  const { data, error } = await supabase
    .from('manual_payouts')
    .select('*, profiles!manual_payouts_seller_id_fkey(full_name)')
    .order('created_at', { ascending: false });
  return {
    payouts: (data || []).map((p: any) => ({
      ...p,
      seller_name: p.profiles?.full_name || 'Unknown',
    })),
    error: error?.message || null,
  };
}

/** Server-side aggregated payout cycles per seller (uses DB RPC — zero client-side grouping) */
export async function getPayoutCycleSummary() {
  const { data, error } = await supabase.rpc('get_payout_cycle_summary');
  if (error) return { cycles: [], error: error.message };
  return {
    cycles: (data || []).map((r: any) => ({
      seller_id: r.seller_id,
      seller_name: r.seller_name,
      cycle_key: r.cycle_key,
      cycle: r.cycle_label,
      total_orders: Number(r.total_orders),
      total_product_amount: Number(r.total_product_amount),
      platform_cut: Number(r.platform_cut),
      total_payable: Number(r.total_payable),
      currency: r.currency || 'INR',
      is_paid: r.is_paid || false,
      payout_id: r.payout_id || null,
    })),
    error: null,
  };
}

/** Record a manual payout */
export async function createManualPayout(payout: {
  seller_id: string;
  cycle: string;
  payout_date: string;
  amount: number;
  mode_of_pay: string;
  transaction_no: string;
  total_orders: number;
  total_product_amount: number;
  platform_cut: number;
  currency: string;
}) {
  const { error } = await supabase
    .from('manual_payouts')
    .insert({ ...payout, status: 'paid' });
  return { error: error?.message || null };
}

/** Get all manual payouts for a specific seller (for seller wallet view) */
export async function getSellerManualPayouts(sellerId: string) {
  const { data, error } = await supabase
    .from('manual_payouts')
    .select('*')
    .eq('seller_id', sellerId)
    .order('created_at', { ascending: false });
  return { payouts: data || [], error: error?.message || null };
}

/** Fetch active payment modes from DB (no hardcoding) */
export async function getPaymentModes() {
  const { data, error } = await supabase
    .from('payment_modes')
    .select('code, label')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  return { modes: data || [], error: error?.message || null };
}

/** Fetch platform commission rate from DB */
export async function getPlatformCommissionRate() {
  const { data, error } = await supabase.rpc('get_platform_commission_rate');
  if (error) return { rate: 9, error: error.message };
  return { rate: Number(data) || 9, error: null };
}
