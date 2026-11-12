import { supabase } from './supabase';
import { roundMoney } from '../utils/hardening';
import { sumSellerOrderTotal } from './orderPricingViews';

const shouldRetryCreateOrderWithoutCountry = (message: string): boolean => {
  const normalized = String(message || '').toLowerCase();
  return normalized.includes('create_order_secure')
    && normalized.includes('p_country')
    && (normalized.includes('function') || normalized.includes('parameter') || normalized.includes('signature'));
};

const pickLatestShipmentByOrder = (rows: any[]) => {
  const latestByOrderId = new Map<string, any>();

  (rows || []).forEach((row: any) => {
    const orderId = String(row?.order_id || '');
    if (!orderId) return;

    const current = latestByOrderId.get(orderId);
    const rowTs = new Date(row?.updated_at || row?.created_at || 0).getTime();
    const currentTs = new Date(current?.updated_at || current?.created_at || 0).getTime();
    if (!current || rowTs > currentTs) latestByOrderId.set(orderId, row);
  });

  return latestByOrderId;
};

const getLatestShipmentsByOrderIdsInternal = async (orderIds: string[]) => {
  const uniqueOrderIds = Array.from(new Set(orderIds.filter(Boolean)));
  if (uniqueOrderIds.length === 0) return new Map<string, any>();

  const { data } = await supabase
    .from('shiprocket_shipments')
    .select('order_id, awb_number, status, created_at, updated_at')
    .in('order_id', uniqueOrderIds);

  return pickLatestShipmentByOrder(data || []);
};

export const getLatestShipmentsByOrderIds = async (orderIds: string[]) => {
  return getLatestShipmentsByOrderIdsInternal(orderIds);
};

// ============================================================
// ORDER SERVICE — Supabase CRUD for orders & related tables
// ============================================================

// ---------- FETCH ORDERS ----------

export async function fetchOrdersBySeller(
  sellerId: string,
  options?: { limit?: number; offset?: number; status?: string }
) {
  const limit = options?.limit || 100;
  const offset = options?.offset || 0;



  const grouped = new Map<string, any>();
  const normalizeStatus = (status: string) => (status === 'pending' ? 'new' : status);
  const requestedStatus = options?.status ? normalizeStatus(options.status) : null;

  const pushOrderItem = (item: any, sourceSellerId?: string) => {
    const order = item.orders;
    if (!order) return;

    const orderStatus = normalizeStatus(order.status || 'new');
    if (requestedStatus && orderStatus !== requestedStatus) return;

    const current = grouped.get(order.id) || {
      ...order,
      status: orderStatus,
      seller_id: sourceSellerId || item.seller_id || order.seller_id || sellerId,
      order_items: [],
    };

    const alreadyAdded = current.order_items.some((existing: any) => existing.id === item.id);
    if (!alreadyAdded) {
      current.order_items.push(item);
    }

    grouped.set(order.id, current);
  };

  const [byItemResult, byOrderResult, sellerProductsResult] = await Promise.all([
    supabase
      .from('order_items')
      .select('id, order_id, product_id, product_name, product_image, quantity, price, customer_unit_price, seller_unit_price, customer_line_total, seller_line_total, seller_id, variant_info, orders:order_id(*), products:product_id(image_url, images)', { count: 'exact' })
      .eq('seller_id', sellerId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1),
    supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('seller_id', sellerId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1),
    supabase.from('products').select('id').eq('seller_id', sellerId),
  ]);

  if (byItemResult.error && byOrderResult.error) {
    return { data: [], error: `Failed to load orders: ${byItemResult.error.message}`, count: 0 };
  }

  (byItemResult.data || []).forEach((item: any) => pushOrderItem(item));

  (byOrderResult.data || []).forEach((order: any) => {
    const orderStatus = normalizeStatus(order.status || 'new');
    if (requestedStatus && orderStatus !== requestedStatus) return;

    const existing = grouped.get(order.id) || {
      ...order,
      status: orderStatus,
      seller_id: order.seller_id || sellerId,
      order_items: [],
    };

    (order.order_items || []).forEach((item: any) => {
      if (item.seller_id && item.seller_id !== sellerId) return;
      const alreadyAdded = existing.order_items.some((entry: any) => entry.id === item.id);
      if (!alreadyAdded) {
        existing.order_items.push(item);
      }
    });

    grouped.set(order.id, existing);
  });

  const sellerProductIds = (sellerProductsResult.data || []).map((product: any) => product.id).filter(Boolean);

  if (sellerProductIds.length > 0) {
    const { data: byProductItems } = await supabase
      .from('order_items')
      .select('id, order_id, product_id, product_name, product_image, quantity, price, customer_unit_price, seller_unit_price, customer_line_total, seller_line_total, seller_id, variant_info, orders:order_id(*), products:product_id(image_url, images)')
      .in('product_id', sellerProductIds)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    (byProductItems || []).forEach((item: any) => pushOrderItem(item, sellerId));
  }

  const mergedOrders = Array.from(grouped.values())
    .map((order: any) => ({
      ...order,
      seller_total_amount: sumSellerOrderTotal(order.order_items || []),
      total_amount:
        Number(order.total_amount || 0) > 0
          ? Number(order.total_amount)
          : (order.order_items || []).reduce(
              (sum: number, item: any) => sum + Number(item.price || 0) * Number(item.quantity || 0),
              0,
            ),
    }))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const shipmentByOrderId = await getLatestShipmentsByOrderIds(mergedOrders.map((order: any) => String(order.id)));
  const trackingEnrichedOrders = mergedOrders.map((order: any) => {
    const shipment = shipmentByOrderId.get(String(order.id));
    const fallbackTracking = shipment?.awb_number || shipment?.waybill || null;
    const fallbackStatus = shipment?.status ? String(shipment.status).toLowerCase() : null;

    return {
      ...order,
      tracking_number: order.tracking_number || fallbackTracking,
      status: order.status || fallbackStatus || 'new',
    };
  });

  return {
    data: trackingEnrichedOrders,
    error: null,
    count: byItemResult.count || byOrderResult.count || trackingEnrichedOrders.length,
  };
}

export async function fetchOrdersByUser(userId: string) {
  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  const orders = data || [];
  const shipmentByOrderId = await getLatestShipmentsByOrderIds(orders.map((order: any) => String(order.id)));
  const enrichedOrders = orders.map((order: any) => {
    const shipment = shipmentByOrderId.get(String(order.id));
    const fallbackTracking = shipment?.awb_number || shipment?.waybill || null;
    const fallbackStatus = shipment?.status ? String(shipment.status).toLowerCase() : null;

    return {
      ...order,
      tracking_number: order.tracking_number || fallbackTracking,
      status: order.status || fallbackStatus || 'new',
    };
  });

  return { data: enrichedOrders, error: error?.message || null };
}

export async function fetchOrderById(orderId: string) {
  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .eq('id', orderId)
    .single();

  if (!data || error) return { data, error: error?.message || null };

  const shipmentByOrderId = await getLatestShipmentsByOrderIds([String(data.id)]);
  const shipment = shipmentByOrderId.get(String(data.id));
  const fallbackTracking = shipment?.awb_number || shipment?.waybill || null;
  const fallbackStatus = shipment?.status ? String(shipment.status).toLowerCase() : null;

  return {
    data: {
      ...data,
      tracking_number: data.tracking_number || fallbackTracking,
      status: data.status || fallbackStatus || 'new',
    },
    error: null,
  };
}

// ---------- CREATE ORDER (secure: all financials computed server-side) ----------

export async function createOrder(orderData: {
  user_id: string;
  total_amount?: number;
  currency?: string;
  shipping_address?: Record<string, unknown>;
  billing_address?: Record<string, unknown>;
  phone?: string;
  notes?: string;
  payment_intent_id?: string;
  payment_method?: string;
  payment_status?: string;
  order_status?: string;
  shipping_charge?: number;
  actual_shipping_cost?: number;
  platform_shipping_margin?: number;
  items: Array<{
    product_id: string;
    product_name?: string;
    product_image?: string;
    quantity: number;
    variant_info?: Record<string, unknown>;
  }>;
}) {
  const { items, ...order } = orderData;

  const rpcItems = items.map((item) => ({
    product_id: String(item.product_id),
    quantity: item.quantity,
    product_name: item.product_name || '',
    product_image: item.product_image || '',
    variant_info: item.variant_info || {},
  }));

  const shippingCountry = String((order.shipping_address as Record<string, unknown> | null)?.country || '').trim();
  const rpcPayload: Record<string, unknown> = {
    p_user_id: order.user_id,
    p_items: rpcItems,
    p_shipping_address: order.shipping_address || null,
    p_billing_address: order.billing_address || null,
    p_phone: order.phone || null,
    p_notes: order.notes || null,
    p_payment_intent_id: order.payment_intent_id || null,
    p_payment_method: order.payment_method || 'card',
    p_payment_status: order.payment_status || 'pending',
    p_order_status: order.order_status || 'pending',
    p_currency: order.currency || 'INR',
    p_shipping_charge: order.shipping_charge ?? 0,
    p_actual_shipping_cost: order.actual_shipping_cost ?? 0,
    p_platform_shipping_margin: order.platform_shipping_margin ?? 0,
  };

  if (shippingCountry) {
    rpcPayload.p_country = shippingCountry;
  }

  let { data, error } = await supabase.rpc('create_order_secure', rpcPayload);

  if (error && shippingCountry && shouldRetryCreateOrderWithoutCountry(error.message || '')) {
    const { p_country, ...legacyPayload } = rpcPayload;
    const retryResult = await supabase.rpc('create_order_secure', legacyPayload);
    data = retryResult.data;
    error = retryResult.error;
  }

  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

// ---------- UPDATE ORDER ----------

const VALID_ORDER_STATUSES = new Set([
  'pending', 'new', 'accepted', 'processing', 'packed', 'shipped',
  'in_transit', 'out_for_delivery', 'delivered',
  'cancelled', 'return_requested', 'returned', 'refunded',
]);

const VALID_TRANSITIONS: Record<string, Set<string>> = {
  pending: new Set(['accepted', 'cancelled']),
  new: new Set(['accepted', 'cancelled']),
  processing: new Set(['accepted', 'cancelled']),
  accepted: new Set(['packed', 'cancelled']),
  packed: new Set(['in_transit', 'shipped', 'cancelled']),
  // Carriers can jump straight from shipped/in_transit to delivered
  // (especially for international shipments where there's no separate
  // "out for delivery" scan). Allow the carrier-driven terminal jumps
  // so the Shiprocket / Shippo trackers can finalise the order.
  shipped: new Set(['in_transit', 'out_for_delivery', 'delivered']),
  in_transit: new Set(['out_for_delivery', 'delivered']),
  out_for_delivery: new Set(['delivered']),
  delivered: new Set(['return_requested']),
  return_requested: new Set(['returned', 'delivered']),
  returned: new Set(['refunded']),
  cancelled: new Set([]),
  refunded: new Set([]),
};

export async function updateOrderStatus(
  orderId: string,
  updates: {
    status?: string;
    tracking_number?: string;
    payment_status?: string;
    completed_at?: string;
  }
) {
  if (updates.status && !VALID_ORDER_STATUSES.has(updates.status)) {
    return { data: null, error: `Invalid order status: ${updates.status}` };
  }

  // Validate status transition and apply atomic status guard
  let fromStatus: string | null = null;
  if (updates.status) {
    const { data: current, error: fetchErr } = await supabase
      .from('orders')
      .select('status')
      .eq('id', orderId)
      .single();
    if (fetchErr || !current) {
      return { data: null, error: fetchErr?.message || 'Order not found' };
    }
    const allowed = VALID_TRANSITIONS[current.status];
    if (allowed && !allowed.has(updates.status)) {
      return { data: null, error: `Cannot transition from "${current.status}" to "${updates.status}"` };
    }
    fromStatus = current.status;
  }

  // Use .eq('status', fromStatus) as an atomic guard against concurrent updates
  let query = supabase
    .from('orders')
    .update(updates)
    .eq('id', orderId);
  if (fromStatus) {
    query = query.eq('status', fromStatus);
  }
  const { data, error } = await query.select('*, order_items(*)').single();
  if (!error && !data && fromStatus) {
    return { data: null, error: 'Order status has already changed. Please refresh and try again.' };
  }
  return { data, error: error?.message || null };
}

// ---------- CANCEL ORDER ----------

/** Cancellable statuses — only before shipment */
const BUYER_CANCELLABLE = new Set(['pending', 'new', 'processing', 'accepted']);
const SELLER_CANCELLABLE = new Set(['pending', 'new', 'processing', 'accepted', 'packed']);
const ADMIN_CANCELLABLE = new Set(['pending', 'new', 'processing', 'accepted', 'packed', 'in_transit', 'out_for_delivery']);

export function canCancelOrder(status: string, role: 'buyer' | 'seller' | 'admin') {
  const s = status === 'pending' ? 'new' : status;
  if (role === 'admin') return ADMIN_CANCELLABLE.has(s);
  if (role === 'seller') return SELLER_CANCELLABLE.has(s);
  return BUYER_CANCELLABLE.has(s);
}

export async function cancelOrder(input: {
  orderId: string;
  cancelledBy: string;
  role: 'buyer' | 'seller' | 'admin';
  reason: string;
}) {
  const { orderId, cancelledBy, role, reason } = input;

  // Buyers have no RLS UPDATE on orders. Use the SECURITY DEFINER RPC which
  // validates ownership + cancellable status server-side and writes the
  // cancellation + status-history rows atomically.
  if (role === 'buyer') {
    const { data, error } = await supabase.rpc('cancel_order_by_user', {
      p_order_id: orderId,
      p_reason: reason,
    });
    if (error) return { success: false, error: error.message };
    const result = data as { success: boolean; error?: string } | null;
    if (!result || !result.success) {
      return { success: false, error: result?.error || 'Cancellation failed' };
    }
    return { success: true, error: null };
  }

  // Fetch current order to validate
  const { data: order, error: fetchErr } = await supabase
    .from('orders')
    .select('id, status, total_amount')
    .eq('id', orderId)
    .single();

  if (fetchErr || !order) return { success: false, error: fetchErr?.message || 'Order not found' };

  if (!canCancelOrder(order.status, role)) {
    return { success: false, error: `Cannot cancel order in "${order.status}" status` };
  }

  const fromStatus = order.status;
  const toStatus = role === 'seller' ? 'cancelled' : 'cancelled';

  // Update order — includes status guard to prevent concurrent cancellations
  const { data: updatedRows, error: updateErr } = await supabase
    .from('orders')
    .update({
      status: toStatus,
      cancellation_reason: reason,
      cancelled_at: new Date().toISOString(),
      cancelled_by: cancelledBy,
    })
    .eq('id', orderId)
    .eq('status', fromStatus)
    .select('id');

  if (!updateErr && (!updatedRows || updatedRows.length === 0)) {
    return { success: false, error: 'Order status has already changed. Please refresh and try again.' };
  }

  if (updateErr) return { success: false, error: updateErr.message };

  // Insert cancellation record
  await supabase.from('order_cancellations').insert({
    order_id: orderId,
    cancelled_by: cancelledBy,
    role,
    reason,
    status: 'cancelled',
    refund_status: order.total_amount > 0 ? 'pending' : 'not_applicable',
    refund_amount: order.total_amount || 0,
  });

  // Insert status history
  await supabase.from('order_status_history').insert({
    order_id: orderId,
    from_status: fromStatus,
    to_status: toStatus,
    changed_by: cancelledBy,
    role,
    note: `Cancelled by ${role}: ${reason}`,
  });

  return { success: true, error: null };
}

// ---------- RETURN ORDER ----------

const RETURNABLE_STATUSES = new Set(['delivered']);

export function canRequestReturn(status: string) {
  return RETURNABLE_STATUSES.has(status);
}

export async function requestReturn(input: {
  orderId: string;
  orderItemId?: string;
  userId: string;
  reason: string;
  description?: string;
  quantity?: number;
  images?: string[];
}) {
  const { orderId, orderItemId, userId, reason, description, quantity, images } = input;

  // Validate order is delivered
  const { data: order, error: fetchErr } = await supabase
    .from('orders')
    .select('id, status')
    .eq('id', orderId)
    .eq('user_id', userId)
    .single();

  if (fetchErr || !order) return { data: null, error: fetchErr?.message || 'Order not found' };
  if (!canRequestReturn(order.status)) {
    return { data: null, error: `Cannot return order in "${order.status}" status` };
  }

  const { data, error } = await supabase
    .from('order_returns')
    .insert({
      order_id: orderId,
      order_item_id: orderItemId || null,
      user_id: userId,
      reason,
      description: description || null,
      quantity: quantity || 1,
      images: images || [],
      status: 'requested',
    })
    .select()
    .single();

  if (error) return { data: null, error: error.message };

  // Update order status
  await supabase.from('orders').update({ status: 'return_requested' }).eq('id', orderId);

  // Insert status history
  await supabase.from('order_status_history').insert({
    order_id: orderId,
    from_status: order.status,
    to_status: 'return_requested',
    changed_by: userId,
    role: 'buyer',
    note: `Return requested: ${reason}`,
  });

  return { data, error: null };
}

export async function processReturn(input: {
  returnId: string;
  action: 'approve' | 'reject';
  processedBy: string;
  role: 'seller' | 'admin';
  response?: string;
  refundAmount?: number;
}) {
  const { returnId, action, processedBy, role, response, refundAmount } = input;

  const newStatus = action === 'approve' ? 'approved' : 'rejected';

  const { data, error } = await supabase
    .from('order_returns')
    .update({
      status: newStatus,
      seller_response: response || null,
      refund_amount: refundAmount || 0,
      resolved_by: processedBy,
      resolved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', returnId)
    .eq('status', 'requested') // Prevents double-processing
    .select('*, orders:order_id(id, status)')
    .single();

  if (error) return { success: false, error: error.message };

  // Update parent order status
  const orderId = data.order_id;
  const orderStatus = action === 'approve' ? 'returned' : 'delivered';

  await supabase.from('orders').update({ status: orderStatus }).eq('id', orderId);

  await supabase.from('order_status_history').insert({
    order_id: orderId,
    from_status: 'return_requested',
    to_status: orderStatus,
    changed_by: processedBy,
    role,
    note: `Return ${action}d by ${role}${response ? ': ' + response : ''}`,
  });

  return { success: true, error: null };
}

export async function fetchOrderReturns(orderId: string) {
  const { data, error } = await supabase
    .from('order_returns')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false });
  return { data: data || [], error: error?.message || null };
}

export async function fetchReturnsByUser(userId: string) {
  const { data, error } = await supabase
    .from('order_returns')
    .select('*, orders:order_id(id, order_number, total_amount)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  return { data: data || [], error: error?.message || null };
}

export async function fetchReturnsBySeller(sellerId: string) {
  // First get order_ids that belong to this seller (via order_items)
  const { data: sellerItems, error: itemsErr } = await supabase
    .from('order_items')
    .select('order_id')
    .eq('seller_id', sellerId);

  if (itemsErr || !sellerItems || sellerItems.length === 0) {
    return { data: [], error: itemsErr?.message || null };
  }

  const orderIds = [...new Set(sellerItems.map((i: any) => i.order_id))];

  const { data, error } = await supabase
    .from('order_returns')
    .select('*, orders:order_id(id, order_number, total_amount, user_id)')
    .in('order_id', orderIds)
    .order('created_at', { ascending: false });

  return { data: data || [], error: error?.message || null };
}

// ---------- ORDER STATUS HISTORY ----------

export async function recordStatusChange(input: {
  orderId: string;
  fromStatus: string;
  toStatus: string;
  changedBy: string;
  role: 'buyer' | 'seller' | 'admin' | 'system';
  note?: string;
}) {
  const { error } = await supabase.from('order_status_history').insert({
    order_id: input.orderId,
    from_status: input.fromStatus,
    to_status: input.toStatus,
    changed_by: input.changedBy,
    role: input.role,
    note: input.note || null,
  });
  return { success: !error, error: error?.message || null };
}

export async function fetchOrderStatusHistory(orderId: string) {
  const { data, error } = await supabase
    .from('order_status_history')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at', { ascending: true });
  return { data: data || [], error: error?.message || null };
}

// ---------- FETCH CANCELLATION ----------

export async function fetchOrderCancellation(orderId: string) {
  const { data, error } = await supabase
    .from('order_cancellations')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return { data, error: error?.message || null };
}

// ---------- SELLER PROFILE ----------

export async function fetchSellerProfile(sellerId: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', sellerId)
    .single();
  return { data, error: error?.message || null };
}

export async function updateSellerProfile(
  sellerId: string,
  updates: Record<string, unknown>
) {
  const { data, error } = await supabase
    .from('profiles')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', sellerId)
    .select()
    .single();
  return { data, error: error?.message || null };
}

// ---------- SELLER LOGO UPLOAD ----------

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB for logos

export async function uploadSellerLogo(
  sellerId: string,
  file: File
): Promise<{ url: string | null; error: string | null }> {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return { url: null, error: 'Invalid image type. Allowed: JPEG, PNG, WebP, GIF' };
  }
  if (file.size > MAX_IMAGE_SIZE) {
    return { url: null, error: `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max: 5MB` };
  }
  const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
  const path = `${sellerId}/logo_${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('product-images')
    .upload(path, file, { upsert: true, contentType: file.type });

  if (uploadError) return { url: null, error: uploadError.message };

  const { data: urlData } = supabase.storage
    .from('product-images')
    .getPublicUrl(path);

  return { url: urlData?.publicUrl || null, error: null };
}

// ---------- SELLER BANK DETAILS (from KYC) ----------

export async function fetchSellerBankDetails(sellerId: string) {
  const { data, error } = await supabase
    .from('seller_kyc')
    .select('bank_holder_name, account_number, ifsc_code, account_type')
    .eq('seller_id', sellerId)
    .maybeSingle();
  return { data, error: error?.message || null };
}

// ---------- WITHDRAWALS (secure: backend validates balance) ----------

export async function createWithdrawal(
  sellerId: string,
  amount: number,
  currency: string,
  bankDetails?: Record<string, unknown>
) {
  const { data, error } = await supabase.rpc('request_withdrawal_secure', {
    p_seller_id: sellerId,
    p_amount: amount,
    p_currency: currency,
    p_bank_details: bankDetails || null,
  });
  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

export async function fetchWithdrawals(sellerId: string) {
  const { data, error } = await supabase
    .from('withdrawals')
    .select('*')
    .eq('seller_id', sellerId)
    .order('created_at', { ascending: false });
  return { data: data || [], error: error?.message || null };
}

// ---------- SELLER PAYOUTS ----------

export async function fetchSellerPayouts(sellerId: string) {
  const { data, error } = await supabase
    .from('seller_payouts')
    .select('*')
    .eq('seller_id', sellerId)
    .order('created_at', { ascending: false });
  return { data: data || [], error: error?.message || null };
}

// ---------- SETTLEMENT SERVICE ----------

/** Get settlement cycle label from a date */
export function getSettlementCycle(date: Date): string {
  const day = date.getDate();
  return day >= 1 && day <= 15 ? 'CYCLE_1' : 'CYCLE_2';
}

/** Human-readable cycle label e.g. "1 Mar – 15 Mar 2026" */
export function getSettlementCycleLabel(cycle: string, referenceDate: Date): string {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  const monthName = referenceDate.toLocaleString('en-IN', { month: 'short' });
  if (cycle === 'CYCLE_1') {
    return `1 ${monthName} – 15 ${monthName} ${year}`;
  }
  const lastDay = new Date(year, month + 1, 0).getDate();
  return `16 ${monthName} – ${lastDay} ${monthName} ${year}`;
}

/** Fetch all orders with settlement data for a seller (DB-driven, no frontend calc) */
export async function fetchSellerSettlementOrders(
  sellerId: string,
  filters?: { cycle?: string; status?: string; settlementStatus?: string }
) {
  // Get order_items for this seller, then fetch their parent orders with settlement columns
  const { data: sellerItems, error: itemsErr } = await supabase
    .from('order_items')
    .select('order_id')
    .eq('seller_id', sellerId);

  // Columns required for seller-currency-locked settlement view:
  //   seller_items_subtotal, seller_payout_total → in seller currency (locked)
  //   platform_markup_total_inr → in INR (locked)
  //   seller_currency, buyer_to_seller_fx_rate → snapshot tags
  //   product_subtotal, platform_fee, seller_earning, total_amount → kept for buyer/admin views and legacy fallback
  const settlementSelect =
    'id, order_number, created_at, status, product_subtotal, platform_fee, seller_earning, settlement_cycle, settlement_status, total_amount, currency, seller_currency, buyer_to_seller_fx_rate, seller_items_subtotal, seller_payout_total, platform_markup_total_inr';

  if (itemsErr || !sellerItems?.length) {
    // Fallback: also check orders.seller_id
    const { data: directOrders, error: directErr } = await supabase
      .from('orders')
      .select(settlementSelect)
      .eq('seller_id', sellerId)
      .order('created_at', { ascending: false });

    if (directErr) return { data: [], error: directErr.message };
    return { data: directOrders || [], error: null };
  }

  const orderIds = [...new Set(sellerItems.map((i: any) => i.order_id))];

  let query = supabase
    .from('orders')
    .select(settlementSelect)
    .in('id', orderIds)
    .order('created_at', { ascending: false });

  if (filters?.cycle) query = query.eq('settlement_cycle', filters.cycle);
  if (filters?.status) query = query.eq('status', filters.status);
  if (filters?.settlementStatus) query = query.eq('settlement_status', filters.settlementStatus);

  const { data, error } = await query;
  return { data: data || [], error: error?.message || null };
}

/** Calculate settlement summary from DB columns (no frontend math) */
export function calculateSettlementSummary(orders: any[]) {
  let totalOrders = 0;
  let totalProductSubtotal = 0;
  let totalPlatformFee = 0;
  let totalSellerEarning = 0;
  let pendingEarning = 0;
  let completedEarning = 0;

  orders.forEach((order: any) => {
    // Prefer locked seller-currency columns (subtotal & payout in seller currency).
    // Fallback to legacy buyer-currency columns for ultra-old rows missing the snapshot.
    const sellerSubtotal = Number(
      order.seller_items_subtotal ?? order.product_subtotal ?? 0,
    );
    const sellerPayout = Number(
      order.seller_payout_total ?? order.seller_earning ?? 0,
    );
    const sellerFee = Math.max(0, sellerSubtotal - sellerPayout);

    if (order.status === 'cancelled' || order.status === 'returned' || order.status === 'refunded') return;

    totalOrders++;
    totalProductSubtotal += sellerSubtotal;
    totalPlatformFee += sellerFee;
    totalSellerEarning += sellerPayout;

    if (order.status === 'delivered' && order.settlement_status === 'pending') {
      pendingEarning += sellerPayout;
    } else if (order.settlement_status === 'completed') {
      completedEarning += sellerPayout;
    }
  });

  return {
    totalOrders,
    totalProductSubtotal: roundMoney(totalProductSubtotal),
    totalPlatformFee: roundMoney(totalPlatformFee),
    totalSellerEarning: roundMoney(totalSellerEarning),
    pendingEarning: roundMoney(pendingEarning),
    completedEarning: roundMoney(completedEarning),
  };
}

/** Fetch seller_settlements records */
export async function fetchSellerSettlements(sellerId: string) {
  const { data, error } = await supabase
    .from('seller_settlements')
    .select('*')
    .eq('seller_id', sellerId)
    .order('created_at', { ascending: false });
  return { data: data || [], error: error?.message || null };
}

// ---------- WALLET LEDGER (source of truth) ----------

/** Get seller wallet balance from ledger via secure DB function */
export async function getSellerWalletBalance(sellerId: string) {
  const { data, error } = await supabase.rpc('get_seller_wallet_balance', {
    p_seller_id: sellerId,
  });
  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

/** Fetch wallet ledger transactions */
export async function fetchWalletTransactions(sellerId: string) {
  const { data, error } = await supabase
    .from('seller_wallet_transactions')
    .select('*, orders!seller_wallet_transactions_order_id_fkey(order_number)')
    .eq('seller_id', sellerId)
    .order('created_at', { ascending: false });

  // Fallback if FK join fails
  if (error) {
    const { data: fallback, error: fallbackErr } = await supabase
      .from('seller_wallet_transactions')
      .select('*')
      .eq('seller_id', sellerId)
      .order('created_at', { ascending: false });
    return { data: fallback || [], error: fallbackErr?.message || null };
  }

  return { data: data || [], error: null };
}

// ---------- ADMIN: SETTLEMENT BATCH ----------

/** Process settlement batch (admin only) */
export async function processSettlementBatch(cycle?: string) {
  const { data, error } = await supabase.rpc('process_settlement_batch', {
    p_cycle: cycle || null,
  });
  if (error) return { data: null, error: error.message };
  return { data, error: null };
}
