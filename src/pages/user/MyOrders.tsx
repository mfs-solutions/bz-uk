import React, { useState, useEffect, useCallback, useRef } from 'react';
import logger from '../../utils/logger';
import { isNativePlatform } from '../../mobile/nativePlatform';
import { Header } from '../../components/layout/Header';
import { Footer } from '../../components/layout/Footer';
import { MobileNav } from '../../components/layout/MobileNav';
import { ListSkeleton } from '../../components/common/Skeleton';
import { useAuth } from '../../contexts/AuthContext';
import { useCurrency } from '../../contexts/CurrencyContext';
import { useCart } from '../../contexts/CartContext';
import { useNavigate } from 'react-router-dom';
import {
  Package, ShoppingBag,
  Clock, Truck, CheckCircle2, XCircle, RotateCw,
  Search, ArrowLeft, Copy, Star, FileText,
  ShoppingCart, HelpCircle, MapPin, X, IndianRupee, ChevronRight,
} from 'lucide-react';
import {
  fetchOrdersByUser,
  fetchOrderById,
  cancelOrder,
  requestReturn,
} from '../../lib/orderService';
import { notifyOrderEvent } from '../../lib/notificationService';
import { supabase } from '../../lib/supabase';
import { formatFrontend12DigitId, buildInvoiceNumber } from '../../utils/idFormatter';
import { generateInvoicePdf } from '../../utils/invoicePdf';
import type { InvoicePdfData, InvoiceLineItem } from '../../utils/invoicePdf';

type OrderStatus =
  | 'pending'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'accepted'
  | 'packed'
  | 'in_transit'
  | 'out_for_delivery'
  | 'return_requested'
  | 'returned'
  | 'refunded';

interface OrderItem {
  id: string;
  product_id: string;
  product_name?: string;
  product_image?: string;
  quantity: number;
  price: number;
  seller_id?: string;
  variant_info?: {
    size?: string | null;
    color?: string | null;
    sku?: string | null;
    hsn_code?: string | null;
  };
}

interface Order {
  id: string;
  rawId: string;
  orderNumber: string;
  date: string;
  dateRaw: string;
  total: number;
  currency: string;
  status: OrderStatus;
  rawStatus: string;
  items: OrderItem[];
  trackingId?: string;
  paymentStatus?: string;
  paymentMethod?: string;
  shippingAddress?: { address_line1?: string; address_line2?: string; city?: string; state?: string; postal_code?: string; country?: string; full_name?: string; name?: string; phone?: string; [key: string]: string | undefined; };
  deliveredAt?: string;
  sellerName?: string;
  sellerId?: string;
  shippingCarrier?: string;
  shippingServiceLevel?: string;
  expectedDeliveryDays?: number;
  paymentIntentId?: string;
  isTemporary?: boolean;
}

const TEMP_PENDING_ORDERS_KEY = 'beauzead_temp_pending_orders';

type TempPendingOrderRecord = {
  tempOrderId: string;
  paymentIntentId: string;
  userId: string;
  totalAmount: number;
  currency: string;
  createdAt: string;
  status: 'processing';
  paymentStatus: 'pending' | 'completed';
  items: Array<{
    productId: string;
    productName: string;
    quantity: number;
    price: number;
    productImage?: string;
  }>;
};

const readTempPendingOrders = (): TempPendingOrderRecord[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(TEMP_PENDING_ORDERS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const mapTempPendingOrder = (record: TempPendingOrderRecord): Order => ({
  id: `temp-${record.tempOrderId}`,
  rawId: `temp-${record.tempOrderId}`,
  orderNumber: record.tempOrderId,
  date: new Date(record.createdAt).toLocaleDateString('en-IN', { year: 'numeric', month: '2-digit', day: '2-digit' }),
  dateRaw: record.createdAt,
  total: Number(record.totalAmount || 0),
  currency: record.currency || 'INR',
  status: 'processing',
  rawStatus: 'processing',
  items: (record.items || []).map((item, idx) => ({
    id: `temp-item-${record.tempOrderId}-${idx + 1}`,
    product_id: item.productId,
    product_name: item.productName,
    product_image: item.productImage || '',
    quantity: Number(item.quantity || 1),
    price: Number(item.price || 0),
    variant_info: {},
  })),
  paymentStatus: record.paymentStatus || 'completed',
  sellerName: 'Processing...',
  paymentIntentId: record.paymentIntentId,
  isTemporary: true,
});

const STATUS_CONFIG: Record<OrderStatus, { label: string; icon: React.ReactNode; bg: string; text: string; dot: string; border: string }> = {
  pending:    { label: 'Pending',    icon: <Clock size={14} />,         bg: 'bg-amber-50',  text: 'text-amber-700',  dot: 'bg-amber-500', border: 'border-amber-200' },
  processing: { label: 'Processing', icon: <RotateCw size={14} />,     bg: 'bg-blue-50',   text: 'text-blue-700',   dot: 'bg-blue-500', border: 'border-blue-200' },
  accepted:   { label: 'Accepted',   icon: <CheckCircle2 size={14} />, bg: 'bg-yellow-50',  text: 'text-yellow-700',  dot: 'bg-yellow-500', border: 'border-yellow-200' },
  packed:     { label: 'Packed',     icon: <Package size={14} />,      bg: 'bg-cyan-50',   text: 'text-cyan-700',   dot: 'bg-cyan-500', border: 'border-cyan-200' },
  shipped:    { label: 'Shipped',    icon: <Truck size={14} />,        bg: 'bg-indigo-50',  text: 'text-indigo-700', dot: 'bg-indigo-500', border: 'border-indigo-200' },
  in_transit: { label: 'In Transit', icon: <Truck size={14} />,        bg: 'bg-purple-50', text: 'text-purple-600', dot: 'bg-purple-500', border: 'border-purple-200' },
  out_for_delivery: { label: 'Out for Delivery', icon: <Truck size={14} />, bg: 'bg-purple-50', text: 'text-purple-700', dot: 'bg-purple-500', border: 'border-purple-200' },
  delivered:  { label: 'Delivered',  icon: <CheckCircle2 size={14} />, bg: 'bg-green-50',   text: 'text-green-600',  dot: 'bg-green-500', border: 'border-green-200' },
  cancelled:  { label: 'Cancelled',  icon: <XCircle size={14} />,     bg: 'bg-red-50',     text: 'text-red-700',    dot: 'bg-red-500', border: 'border-red-200' },
  return_requested: { label: 'Return Requested', icon: <RotateCw size={14} />, bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-500', border: 'border-orange-200' },
  returned:   { label: 'Returned',   icon: <RotateCw size={14} />,    bg: 'bg-orange-50',  text: 'text-orange-600', dot: 'bg-orange-500', border: 'border-orange-200' },
  refunded:   { label: 'Refunded',   icon: <RotateCw size={14} />,    bg: 'bg-gray-50',    text: 'text-gray-600',   dot: 'bg-gray-500', border: 'border-gray-200' },
};

const normalizeOrderStatus = (status: string): OrderStatus => {
  const normalized = (status || '').toLowerCase();
  if (normalized === 'new') return 'pending';
  if (normalized in STATUS_CONFIG) return normalized as OrderStatus;
  return 'pending';
};

type FilterKey = 'all' | 'pending' | 'accepted' | 'shipped' | 'delivered' | 'cancelled' | 'returns';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'shipped', label: 'Shipped' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'returns', label: 'Returns' },
];

const matchesFilter = (status: OrderStatus, filter: FilterKey): boolean => {
  if (filter === 'all') return true;
  if (filter === 'pending') return status === 'pending' || status === 'processing';
  if (filter === 'accepted') return status === 'accepted' || status === 'packed';
  if (filter === 'shipped') return status === 'shipped' || status === 'in_transit' || status === 'out_for_delivery';
  if (filter === 'delivered') return status === 'delivered';
  if (filter === 'cancelled') return status === 'cancelled';
  if (filter === 'returns') return status === 'return_requested' || status === 'returned' || status === 'refunded';
  return false;
};

// Button visibility per status
const canTrack = (s: OrderStatus) => ['in_transit', 'out_for_delivery', 'delivered', 'shipped'].includes(s);
const canCancel = (s: OrderStatus) => ['pending', 'processing', 'accepted'].includes(s);
const canReturn = (s: OrderStatus) => s === 'delivered';
const canInvoice = (s: OrderStatus) => s === 'delivered';
const canReview = (s: OrderStatus) => s === 'delivered';
const canBuyAgain = (s: OrderStatus) => ['delivered', 'cancelled', 'returned', 'refunded'].includes(s);
// Refund can be requested only when order is CANCELLED and was PAID.
const isPaidStatus = (p?: string) => ['paid', 'completed', 'succeeded'].includes((p || '').toLowerCase());
const canRequestRefund = (s: OrderStatus, p?: string) => s === 'cancelled' && isPaidStatus(p);

interface RefundRequestInfo {
  id: string;
  refund_number: string;
  status: 'requested' | 'accepted' | 'rejected' | 'paid' | 'failed';
  admin_note?: string | null;
  stripe_refund_status?: string | null;
}

const PLATFORM_FEE_RATE = 0.03;

export const MyOrders: React.FC = () => {
  const { user, currentAuthUser } = useAuth();
  const { formatPrice } = useCurrency();
  const { addToCart } = useCart();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFilter, setSelectedFilter] = useState<FilterKey>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Cancel modal
  const [cancelModal, setCancelModal] = useState<{ orderId: string; orderNumber: string } | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  // Return modal
  const [returnModal, setReturnModal] = useState<{ orderId: string; orderNumber: string } | null>(null);
  const [returnReason, setReturnReason] = useState('');
  const [returnDescription, setReturnDescription] = useState('');

  // Refund request modal & cache
  const [refundModal, setRefundModal] = useState<{ orderId: string; orderRawId: string; orderNumber: string; amount: number; currency: string } | null>(null);
  const [refundReason, setRefundReason] = useState('');
  const [refundRequests, setRefundRequests] = useState<Record<string, RefundRequestInfo>>({});

  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 3500);
  }, []);

  useEffect(() => () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); }, []);

  const userId = user?.id || currentAuthUser?.userId;

  const loadOrders = useCallback(async (showLoading = true) => {
    if (!userId) return;

    try {
      if (showLoading) setLoading(true);
      const result = await fetchOrdersByUser(userId);

      if (result?.data) {
        // Resolve seller names
        const allSellerIds = new Set<string>();
        result.data.forEach((o: any) => {
          const items = o.order_items || [];
          items.forEach((item: any) => { if (item.seller_id) allSellerIds.add(item.seller_id); });
        });
        const sellerNameMap = new Map<string, string>();
        if (allSellerIds.size > 0) {
          try {
            const { data: profiles } = await supabase
              .from('profiles')
              .select('id, full_name')
              .in('id', Array.from(allSellerIds));
            (profiles || []).forEach((p: any) => sellerNameMap.set(p.id, p.full_name || 'Seller'));
          } catch { /* non-blocking */ }
        }

        const fetchedOrders: Order[] = result.data.map((order: any) => {
          const rawItems = order.order_items || [];
          const items: OrderItem[] = rawItems.map((item: any) => ({
            id: item.id,
            product_id: item.product_id,
            product_name: item.product_name || item.name || 'Product',
            product_image: item.product_image || item.image_url || null,
            quantity: item.quantity || 1,
            price: item.price || 0,
            seller_id: item.seller_id,
            variant_info: item.variant_info || {},
          }));

          const firstSellerId = items[0]?.seller_id;

          return {
            id: order.id,
            rawId: order.id,
            orderNumber: `ORD-${formatFrontend12DigitId(order.id)}`,
            date: new Date(order.created_at).toLocaleDateString('en-IN', { year: 'numeric', month: '2-digit', day: '2-digit' }),
            dateRaw: order.created_at,
            total: order.total_amount || 0,
            currency: order.currency || 'INR',
            status: normalizeOrderStatus(order.status),
            rawStatus: order.status || 'new',
            items,
            trackingId: order.tracking_number || null,
            paymentStatus: order.payment_status || 'pending',
            paymentMethod: order.payment_method || null,
            paymentIntentId: order.payment_intent_id || undefined,
            shippingAddress: typeof order.shipping_address === 'string'
              ? (() => { try { return JSON.parse(order.shipping_address); } catch { return null; } })()
              : order.shipping_address || null,
            deliveredAt: order.completed_at || null,
            sellerName: firstSellerId ? sellerNameMap.get(firstSellerId) || 'Seller' : 'Seller',
            sellerId: firstSellerId || undefined,
            shippingCarrier: order.shipping_carrier || undefined,
            shippingServiceLevel: order.shipping_service_level || undefined,
            expectedDeliveryDays: order.expected_delivery_days || undefined,
          };
        });

        const existingPis = new Set(
          fetchedOrders
            .map((order) => String(order.paymentIntentId || '').trim())
            .filter(Boolean),
        );

        const tempOrders = readTempPendingOrders()
          .filter((record) => record.userId === userId)
          .filter((record) => !existingPis.has(String(record.paymentIntentId || '').trim()))
          .map(mapTempPendingOrder);

        const merged = [...tempOrders, ...fetchedOrders].sort(
          (a, b) => new Date(b.dateRaw).getTime() - new Date(a.dateRaw).getTime(),
        );

        setOrders(merged);
      } else {
        const tempOrders = readTempPendingOrders()
          .filter((record) => record.userId === userId)
          .map(mapTempPendingOrder)
          .sort((a, b) => new Date(b.dateRaw).getTime() - new Date(a.dateRaw).getTime());
        setOrders(tempOrders);
      }
    } catch (error) {
      logger.error(error as Error, { context: 'Failed to load orders from Supabase' });
      const tempOrders = readTempPendingOrders()
        .filter((record) => record.userId === userId)
        .map(mapTempPendingOrder)
        .sort((a, b) => new Date(b.dateRaw).getTime() - new Date(a.dateRaw).getTime());
      setOrders(tempOrders);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      navigate('/login');
      return;
    }

    loadOrders(true);

    const pollTimer = setInterval(() => {
      loadOrders(false);
    }, 5000);

    return () => {
      clearInterval(pollTimer);
    };
  }, [userId, navigate, loadOrders]);

  // Fetch the buyer's refund requests (RLS scopes by user_id) whenever the
  // set of cancelled+paid order ids changes.
  const cancelledPaidOrderIds = orders
    .filter((o) => canRequestRefund(o.status, o.paymentStatus) && !o.isTemporary)
    .map((o) => o.rawId)
    .join(',');

  useEffect(() => {
    if (!userId) return;
    const ids = cancelledPaidOrderIds ? cancelledPaidOrderIds.split(',') : [];
    if (ids.length === 0) {
      setRefundRequests({});
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('refund_requests')
          .select('id, refund_number, status, admin_note, stripe_refund_status, order_id')
          .in('order_id', ids);
        if (cancelled) return;
        if (error) {
          logger.error(error as Error, { context: 'Failed to load refund requests' });
          return;
        }
        const map: Record<string, RefundRequestInfo> = {};
        (data || []).forEach((r: { id: string; refund_number: string; status: string; admin_note: string | null; stripe_refund_status: string | null; order_id: string }) => {
          map[r.order_id] = {
            id: r.id,
            refund_number: r.refund_number,
            status: r.status as RefundRequestInfo['status'],
            admin_note: r.admin_note,
            stripe_refund_status: r.stripe_refund_status,
          };
        });
        setRefundRequests(map);
      } catch (err) {
        if (!cancelled) logger.error(err as Error, { context: 'Failed to load refund requests' });
      }
    })();
    return () => { cancelled = true; };
  }, [userId, cancelledPaidOrderIds]);

  // ─── ACTION HANDLERS ───

  const handleCopyTracking = useCallback(async (trackingId: string, orderId: string) => {
    try {
      await navigator.clipboard.writeText(trackingId);
      setCopiedId(orderId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      showToast('Failed to copy', 'error');
    }
  }, [showToast]);

  const handleCancelOrder = useCallback(async () => {
    if (!cancelModal || !cancelReason.trim() || !userId) return;
    setActionLoading(`cancel-${cancelModal.orderId}`);
    try {
      const result = await cancelOrder({
        orderId: cancelModal.orderId,
        cancelledBy: userId,
        role: 'buyer',
        reason: cancelReason.trim(),
      });
      if (result.success) {
        setOrders(prev => prev.map(o =>
          o.id === cancelModal.orderId ? { ...o, status: 'cancelled' as OrderStatus, rawStatus: 'cancelled' } : o
        ));
        // Notify buyer + seller(s) + admin (in-app + push + email)
        const cancelledOrder = orders.find(o => o.id === cancelModal.orderId);
        const sellerIds = cancelledOrder
          ? [...new Set(cancelledOrder.items.map(i => i.seller_id).filter(Boolean))] as string[]
          : [];
        notifyOrderEvent({
          type: 'order_cancelled',
          orderId: cancelModal.orderId,
          orderNumber: cancelModal.orderNumber,
          buyerId: userId,
          buyerEmail: user?.email || undefined,
          buyerName: user?.full_name || user?.email || 'Customer',
          sellerIds,
          adminNotify: true,
          title: 'Order Cancelled',
          message: `Order #${cancelModal.orderNumber} was cancelled. Reason: ${cancelReason.trim()}`,
          emailData: {
            order_id: cancelModal.orderNumber,
            customer_name: user?.full_name || user?.email || 'Customer',
            reason: cancelReason.trim(),
          },
        }).catch(() => { /* non-blocking */ });
        showToast('Order cancelled successfully', 'success');
      } else {
        showToast(result.error || 'Failed to cancel order', 'error');
      }
    } catch {
      showToast('Failed to cancel order', 'error');
    } finally {
      setActionLoading(null);
      setCancelModal(null);
      setCancelReason('');
    }
  }, [cancelModal, cancelReason, userId, showToast, orders, user]);

  const handleRequestReturn = useCallback(async () => {
    if (!returnModal || !returnReason.trim() || !userId) return;
    setActionLoading(`return-${returnModal.orderId}`);
    try {
      const result = await requestReturn({
        orderId: returnModal.orderId,
        userId,
        reason: returnReason.trim(),
        description: returnDescription.trim() || undefined,
      });
      if (result.data) {
        setOrders(prev => prev.map(o =>
          o.id === returnModal.orderId ? { ...o, status: 'return_requested' as OrderStatus, rawStatus: 'return_requested' } : o
        ));
        showToast('Return request submitted', 'success');
      } else {
        showToast(result.error || 'Failed to submit return', 'error');
      }
    } catch {
      showToast('Failed to submit return request', 'error');
    } finally {
      setActionLoading(null);
      setReturnModal(null);
      setReturnReason('');
      setReturnDescription('');
    }
  }, [returnModal, returnReason, returnDescription, userId, showToast]);

  const handleRequestRefund = useCallback(async () => {
    if (!refundModal || !userId) return;
    const reason = refundReason.trim();
    if (!reason) {
      showToast('Please provide a reason', 'error');
      return;
    }
    setActionLoading(`refund-${refundModal.orderId}`);
    try {
      const { data, error } = await supabase.rpc('request_refund', {
        p_order_id: refundModal.orderRawId,
        p_reason: reason,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (row?.id) {
        setRefundRequests((prev) => ({
          ...prev,
          [refundModal.orderRawId]: {
            id: row.id as string,
            refund_number: (row.refund_number as string) || 'REF-PENDING',
            status: 'requested',
            admin_note: null,
          },
        }));
        showToast(`Refund requested · ${row.refund_number || ''}`, 'success');
      } else {
        showToast('Refund request submitted', 'success');
      }
      setRefundModal(null);
      setRefundReason('');
    } catch (err) {
      const msg = (err as { message?: string })?.message || 'Failed to submit refund request';
      logger.error(err as Error, { context: 'request_refund' });
      showToast(msg, 'error');
    } finally {
      setActionLoading(null);
    }
  }, [refundModal, refundReason, userId, showToast]);

  const handleDownloadInvoice = useCallback(async (order: Order) => {
    setActionLoading(`invoice-${order.id}`);
    try {
      // Fetch full order details for invoice
      const { data: fullOrder } = await fetchOrderById(order.id);
      if (!fullOrder) {
        showToast('Could not load order details', 'error');
        return;
      }

      // Fetch seller profile for invoice
      let sellerName = order.sellerName || 'Seller';
      let sellerAddress = '';
      let sellerContact = '';
      if (order.sellerId) {
        const { data: sellerProfile } = await supabase
          .from('profiles')
          .select('full_name, phone, address')
          .eq('id', order.sellerId)
          .single();
        if (sellerProfile) {
          sellerName = sellerProfile.full_name || sellerName;
          sellerContact = sellerProfile.phone || '';
          sellerAddress = sellerProfile.address || '';
        }
      }

      const addr = order.shippingAddress;
      const buyerAddress = addr
        ? [addr.address_line1, addr.address_line2, addr.city, addr.state, addr.postal_code, addr.country].filter(Boolean).join(', ')
        : '';

      // Fetch product-level SKU/HSN for items missing them in variant_info
      const productIdsNeedingMeta = order.items
        .filter(item => !item.variant_info?.sku || !item.variant_info?.hsn_code)
        .map(item => item.product_id)
        .filter(Boolean);

      let productMetaMap = new Map<string, { sku: string | null; hsn_code: string | null }>();
      if (productIdsNeedingMeta.length > 0) {
        const { data: products } = await supabase
          .from('products')
          .select('id, sku, hsn_code')
          .in('id', productIdsNeedingMeta);
        if (products) {
          productMetaMap = new Map(products.map((p: any) => [String(p.id), { sku: p.sku || null, hsn_code: p.hsn_code || null }]));
        }
      }

      const invoiceItems: InvoiceLineItem[] = order.items.map(item => {
        const meta = productMetaMap.get(String(item.product_id));
        return {
          name: item.product_name || 'Product',
          sku: item.variant_info?.sku || meta?.sku || undefined,
          hsn_code: item.variant_info?.hsn_code || meta?.hsn_code || undefined,
          qty: item.quantity,
          unitPrice: item.price,
          total: item.price * item.quantity,
        };
      });

      const invoiceData: InvoicePdfData = {
        invoiceNumber: buildInvoiceNumber(order.dateRaw, undefined, order.id),
        orderId: order.orderNumber,
        orderDate: order.date,
        deliveryDate: order.deliveredAt
          ? new Date(order.deliveredAt).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })
          : undefined,
        paymentMethod: order.paymentMethod || 'Online',
        sellerName,
        sellerAddress,
        sellerContact,
        buyerName: user?.full_name || user?.email || '',
        buyerAddress,
        buyerPhone: addr?.phone || '',
        items: invoiceItems,
        currency: order.currency,
        totalPaid: order.total,
        platformFeeRate: PLATFORM_FEE_RATE,
        shippingCharge: (fullOrder as any).shipping_charge || 0,
        offerDiscount: (fullOrder as any).offer_discount || 0,
      };

      await generateInvoicePdf(invoiceData, formatPrice);
      showToast('Invoice downloaded', 'success');
    } catch {
      showToast('Failed to generate invoice', 'error');
    } finally {
      setActionLoading(null);
    }
  }, [formatPrice, showToast, user]);

  const handleBuyAgain = useCallback(async (order: Order) => {
    if (order.items.length === 0) {
      showToast('No items to re-order', 'error');
      return;
    }
    setActionLoading(`buyagain-${order.id}`);
    try {
      const productIds = order.items.map((item) => item.product_id);
      const { data: products } = await supabase
        .from('products')
        .select('*')
        .in('id', productIds);
      const productMap = new Map((products || []).map((p) => [p.id, p]));

      let addedCount = 0;
      const unavailable: string[] = [];
      for (const item of order.items) {
        const product = productMap.get(item.product_id);
        if (product) {
          addToCart(product, item.quantity, {
            selectedSize: item.variant_info?.size || null,
            selectedColor: item.variant_info?.color || null,
            selectedVariantSku: item.variant_info?.sku || null,
          });
          addedCount++;
        } else {
          unavailable.push(item.product_name || item.product_id);
        }
      }
      if (unavailable.length > 0 && addedCount === 0) {
        showToast(`All items are no longer available: ${unavailable.join(', ')}`, 'error');
      } else if (unavailable.length > 0) {
        showToast(`Some items are no longer available: ${unavailable.join(', ')}`, 'error');
      } else {
        showToast('Items added to cart', 'success');
      }
      if (addedCount > 0) navigate('/cart');
    } catch {
      showToast('Failed to add items to cart', 'error');
    } finally {
      setActionLoading(null);
    }
  }, [addToCart, navigate, showToast]);

  const handleTrackOrder = useCallback((order: Order) => {
    navigate(`/orders/${order.id}`);
  }, [navigate]);

  // ─── FILTERING ───

  const filteredOrders = orders
    .filter((o) => matchesFilter(o.status, selectedFilter))
    .filter((o) =>
      !searchQuery ||
      o.orderNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.trackingId?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.items.some(item => item.product_name?.toLowerCase().includes(searchQuery.toLowerCase()))
    );

  const filterCounts = (key: FilterKey): number => {
    if (key === 'all') return orders.length;
    return orders.filter(o => matchesFilter(o.status, key)).length;
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      <Header />

      {/* Toast */}
      {toast && (
        <div className={`fixed top-16 left-1/2 -translate-x-1/2 z-[100] px-5 py-3 rounded-xl shadow-lg text-sm font-semibold transition-all ${
          toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.message}
        </div>
      )}

      <main className="flex-grow w-full">
        {/* Header Bar — hidden on native (uses global Header + Android back button) */}
        {!isNativePlatform && (
          <header
            className="bg-[#0f172a] text-white sticky z-[70]"
            style={{ top: 'var(--bz-header-offset)' }}
          >
            <div className="max-w-4xl mx-auto px-4 h-10 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button onClick={() => navigate(-1)} className="text-white/70 hover:text-white">
                  <ArrowLeft size={20} />
                </button>
                <h1 className="text-base font-bold tracking-tight">My Orders</h1>
              </div>
              <span className="text-xs text-white/60">{orders.length} order{orders.length !== 1 ? 's' : ''}</span>
            </div>
          </header>
        )}

        {/* Search */}
        <div className="max-w-4xl mx-auto px-4 pt-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              type="text"
              placeholder="Search by Order ID, Product Name, or Tracking #"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white border border-gray-200 rounded-xl pl-10 pr-4 py-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm"
            />
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="max-w-4xl mx-auto px-4 pt-3 pb-1">
          <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
            {FILTERS.map((f) => {
              const count = filterCounts(f.key);
              const isActive = selectedFilter === f.key;
              return (
                <button
                  key={f.key}
                  onClick={() => setSelectedFilter(f.key)}
                  className={`px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {f.label} ({count})
                </button>
              );
            })}
          </div>
        </div>

        {/* Orders */}
        <div className="max-w-4xl mx-auto px-4 py-3 space-y-2">
          {loading ? (
            <ListSkeleton rows={4} withThumb />
          ) : filteredOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 px-4">
              <div className="w-20 h-20 rounded-full bg-blue-50 flex items-center justify-center mb-6">
                <ShoppingBag className="h-10 w-10 text-blue-400" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2 text-center">
                {searchQuery ? 'No matching orders' : selectedFilter !== 'all' ? 'No orders in this category' : 'No orders yet'}
              </h2>
              <p className="text-gray-500 text-sm text-center max-w-sm mb-6">
                {searchQuery
                  ? 'Try a different search term.'
                  : 'When you place an order, it will appear here.'}
              </p>
              {!searchQuery && selectedFilter === 'all' && (
                <button
                  onClick={() => navigate('/')}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl font-semibold transition shadow-sm"
                >
                  Start Shopping
                </button>
              )}
            </div>
          ) : (
            filteredOrders.map((order) => {
              const cfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending;
              const firstItem = order.items[0];
              const extraItems = order.items.length - 1;

              return (
                <details key={order.id} className="group bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  <summary className="flex items-center gap-3 p-3 sm:p-4 cursor-pointer list-none [&::-webkit-details-marker]:hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">
                      <div className="w-16 h-16 bg-gray-100 rounded-xl flex items-center justify-center overflow-hidden flex-shrink-0">
                        {firstItem?.product_image ? (
                          <img
                            src={firstItem.product_image}
                            alt={firstItem.product_name || 'Product'}
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <Package className="text-gray-300" size={28} />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900">
                          {cfg.label}
                          {order.status === 'delivered' && order.deliveredAt && (
                            <> on {new Date(order.deliveredAt).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })}</>
                          )}
                        </p>
                        <p className="text-xs text-gray-500 mt-1 truncate">{firstItem?.product_name || 'Order details'}</p>
                        {extraItems > 0 && (
                          <p className="text-xs text-blue-600 mt-0.5">+{extraItems} more item{extraItems > 1 ? 's' : ''}</p>
                        )}
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-gray-600 transition-transform group-open:rotate-90" aria-hidden="true" />
                  </summary>
                  <div className="border-t border-gray-100 pt-3">
                  <div className="px-4 pb-3 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-gray-500">Order {order.orderNumber} · {order.date}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span className={`inline-flex items-center gap-1.5 ${cfg.bg} ${cfg.text} border ${cfg.border} text-[10px] font-bold px-2.5 py-1 rounded-lg uppercase tracking-wider`}>
                          <span className={`w-2 h-2 rounded-full ${cfg.dot}`}></span>
                          {cfg.label}
                        </span>
                        {order.paymentStatus === 'completed' && (
                          <span className="text-xs font-semibold text-green-600">Paid</span>
                        )}
                      </div>
                    </div>
                    <p className="text-sm font-bold text-gray-900 whitespace-nowrap">{formatPrice(order.total, order.currency)}</p>
                  </div>
                  {firstItem && (
                    <div className="px-4 pb-3">
                        <p className="text-xs text-gray-500 mt-0.5">
                          Qty: {firstItem.quantity}
                          {firstItem.variant_info?.size ? ` · Size: ${firstItem.variant_info.size}` : ''}
                          {firstItem.variant_info?.color ? ` · ${firstItem.variant_info.color}` : ''}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">Seller: {order.sellerName}</p>
                    </div>
                  )}
                  {!order.isTemporary && (
                    <button type="button" onClick={() => navigate(`/orders/${order.id}`)} className="mx-4 mb-3 text-xs font-semibold text-blue-600 hover:underline">
                      View order details
                    </button>
                  )}

                  {/* Carrier Info */}
                  {order.shippingCarrier && (
                    <div className="mx-4 mb-3 bg-gray-50 rounded-xl px-3 py-2 flex items-center gap-2">
                      <Truck className="text-gray-500 flex-shrink-0" size={14} />
                      <p className="text-xs text-gray-700 font-medium">
                        {order.shippingCarrier}{order.shippingServiceLevel ? ` · ${order.shippingServiceLevel}` : ''}
                        {order.expectedDeliveryDays ? ` · Est. ${order.expectedDeliveryDays} days` : ''}
                      </p>
                    </div>
                  )}

                  {/* Tracking Info */}
                  {order.trackingId && canTrack(order.status) && (
                    <div className="mx-4 mb-3 bg-blue-50 rounded-xl px-3 py-2.5 flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <Truck className="text-blue-500 flex-shrink-0" size={14} />
                        <div className="min-w-0">
                          <p className="text-[10px] font-bold text-blue-400 uppercase">Tracking #</p>
                          <p className="text-xs font-mono font-bold text-blue-700 truncate">{order.trackingId}</p>
                        </div>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleCopyTracking(order.trackingId!, order.id); }}
                        className="text-[10px] font-bold text-blue-600 bg-blue-100 hover:bg-blue-200 px-2.5 py-1 rounded-lg flex items-center gap-1 flex-shrink-0"
                      >
                        <Copy size={10} />
                        {copiedId === order.id ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                  )}

                  {/* Delivered date */}
                  {order.status === 'delivered' && order.deliveredAt && (
                    <div className="mx-4 mb-3 bg-green-50 rounded-xl px-3 py-2 flex items-center gap-2">
                      <CheckCircle2 className="text-green-500" size={14} />
                      <p className="text-xs text-green-700 font-medium">
                        Delivered on <span className="font-bold">
                          {new Date(order.deliveredAt).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })}
                        </span>
                      </p>
                    </div>
                  )}

                  {/* Estimated Delivery */}
                  {order.status !== 'delivered' && order.status !== 'cancelled' && order.status !== 'returned' && order.status !== 'refunded' && (() => {
                    const etd = order.shippingAddress?.expected_delivery_date || order.shippingAddress?.expectedDeliveryDate || '';
                    if (!etd) return null;
                    return (
                      <div className="mx-4 mb-3 bg-amber-50 rounded-xl px-3 py-2 flex items-center gap-2">
                        <Clock className="text-amber-500 flex-shrink-0" size={14} />
                        <p className="text-xs text-amber-700 font-medium">
                          Est. Delivery: <span className="font-bold">{/^\d{4}-\d{2}-\d{2}/.test(etd) ? new Date(etd).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' }) : etd}</span>
                        </p>
                      </div>
                    );
                  })()}

                  {/* Action Buttons */}
                  <div className="px-4 pb-4 flex flex-wrap gap-2">
                    {order.isTemporary ? (
                      <div className="w-full bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-700 font-medium">
                        Payment received. Your order is being created now. It will become fully trackable shortly.
                      </div>
                    ) : (
                      <>
                    {/* Track Order */}
                    {canTrack(order.status) && (
                      <button
                        onClick={() => handleTrackOrder(order)}
                        className="flex-1 min-w-[140px] bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition active:scale-[0.97]"
                      >
                        <MapPin size={14} />
                        Track My Order
                      </button>
                    )}

                    {/* Cancel Order */}
                    {canCancel(order.status) && (
                      <button
                        onClick={() => setCancelModal({ orderId: order.id, orderNumber: order.orderNumber })}
                        disabled={actionLoading === `cancel-${order.id}`}
                        className="flex-1 min-w-[140px] bg-red-50 border border-red-200 hover:bg-red-100 text-red-600 font-bold text-xs px-4 py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition active:scale-[0.97] disabled:opacity-50"
                      >
                        <XCircle size={14} />
                        {actionLoading === `cancel-${order.id}` ? 'Cancelling...' : 'Cancel Order'}
                      </button>
                    )}

                    {/* Rate & Review */}
                    {canReview(order.status) && order.items.length > 0 && (
                      <button
                        onClick={() => navigate(`/products/${order.items[0].product_id}/review`)}
                        className="flex-1 min-w-[100px] bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs px-4 py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition active:scale-[0.97]"
                      >
                        <Star size={13} />
                        Rate & Review
                      </button>
                    )}

                    {/* Return / Refund */}
                    {canReturn(order.status) && (
                      <button
                        onClick={() => setReturnModal({ orderId: order.id, orderNumber: order.orderNumber })}
                        disabled={actionLoading === `return-${order.id}`}
                        className="flex-1 min-w-[100px] bg-orange-50 border border-orange-200 hover:bg-orange-100 text-orange-600 font-bold text-xs px-4 py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition active:scale-[0.97] disabled:opacity-50"
                      >
                        <RotateCw size={14} />
                        {actionLoading === `return-${order.id}` ? 'Submitting...' : 'Return / Refund'}
                      </button>
                    )}

                    {/* Invoice */}
                    {canInvoice(order.status) && (
                      <button
                        onClick={() => handleDownloadInvoice(order)}
                        disabled={actionLoading === `invoice-${order.id}`}
                        className="flex-1 min-w-[100px] bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-bold text-xs px-4 py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition active:scale-[0.97] disabled:opacity-50"
                      >
                        <FileText size={14} />
                        {actionLoading === `invoice-${order.id}` ? 'Generating...' : 'Invoice'}
                      </button>
                    )}

                    {/* Buy Again */}
                    {canBuyAgain(order.status) && (
                      <button
                        onClick={() => handleBuyAgain(order)}
                        disabled={actionLoading === `buyagain-${order.id}`}
                        className="flex-1 min-w-[100px] bg-blue-50 border border-blue-200 hover:bg-blue-100 text-blue-600 font-bold text-xs px-4 py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition active:scale-[0.97] disabled:opacity-50"
                      >
                        <ShoppingCart size={14} />
                        {actionLoading === `buyagain-${order.id}` ? 'Adding...' : 'Buy Again'}
                      </button>
                    )}

                    {/* Request Refund (cancelled + paid) */}
                    {canRequestRefund(order.status, order.paymentStatus) && !order.isTemporary && (
                      refundRequests[order.rawId] ? (() => {
                        const rr = refundRequests[order.rawId];
                        const stripeOk = rr.stripe_refund_status === 'succeeded';
                        const colorCls =
                          rr.status === 'paid'
                            ? (stripeOk
                              ? 'bg-green-50 border-green-300 text-green-800'
                              : 'bg-emerald-50 border-emerald-200 text-emerald-700')
                            : rr.status === 'failed'
                              ? 'bg-red-50 border-red-200 text-red-700'
                              : rr.status === 'accepted'
                                ? 'bg-blue-50 border-blue-200 text-blue-700'
                                : rr.status === 'rejected'
                                  ? 'bg-gray-100 border-gray-200 text-gray-600'
                                  : 'bg-amber-50 border-amber-200 text-amber-700';
                        const label =
                          rr.status === 'paid'
                            ? (stripeOk
                              ? `Refund Paid · ${rr.refund_number}`
                              : `Refund Paid · Settling at bank`)
                            : rr.status === 'failed'
                              ? 'Refund Failed — contact support'
                              : rr.status === 'accepted'
                                ? 'Refund Accepted · Processing'
                                : rr.status === 'rejected'
                                  ? `Refund Rejected · ${rr.refund_number}`
                                  : `Refund Requested · ${rr.refund_number}`;
                        return (
                          <div
                            className={`flex-1 min-w-[160px] font-bold text-xs px-4 py-2.5 rounded-xl flex items-center justify-center gap-1.5 border ${colorCls}`}
                            title={rr.admin_note || rr.refund_number}
                          >
                            <IndianRupee size={13} />
                            {label}
                          </div>
                        );
                      })() : (
                        <button
                          onClick={() => {
                            setRefundModal({
                              orderId: order.id,
                              orderRawId: order.rawId,
                              orderNumber: order.orderNumber,
                              amount: order.total,
                              currency: order.currency,
                            });
                            setRefundReason('');
                          }}
                          disabled={actionLoading === `refund-${order.id}`}
                          className="flex-1 min-w-[140px] bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition active:scale-[0.97] disabled:opacity-50"
                        >
                          <IndianRupee size={14} />
                          Request Refund
                        </button>
                      )
                    )}

                    {/* Need Help — always visible */}
                    <button
                      onClick={() => navigate('/contact')}
                      className="flex-1 min-w-[100px] bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-bold text-xs px-4 py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition active:scale-[0.97]"
                    >
                      <HelpCircle size={14} />
                      Need Help
                    </button>
                      </>
                    )}
                  </div>
                </div>
                </details>
              );
            })
          )}
        </div>

        <div className="h-20"></div>
      </main>

      {/* ─── Cancel Order Modal ─── */}
      {cancelModal && (
        <div
          className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-order-modal-title"
          onClick={(e) => { if (e.target === e.currentTarget) { setCancelModal(null); setCancelReason(''); } }}
          onKeyDown={(e) => { if (e.key === 'Escape') { setCancelModal(null); setCancelReason(''); } }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <h3 id="cancel-order-modal-title" className="text-base font-bold text-gray-900">Cancel Order</h3>
              <button onClick={() => { setCancelModal(null); setCancelReason(''); }} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <div className="px-5 pb-2">
              <p className="text-sm text-gray-500 mb-1">Order: <span className="font-semibold text-gray-700">{cancelModal.orderNumber}</span></p>
              <p className="text-xs text-gray-400 mb-3">This action cannot be undone. A refund will be initiated.</p>
            </div>
            <div className="px-5 pb-4">
              <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wider">Reason for cancellation *</label>
              <select
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-red-400 mb-3"
              >
                <option value="">Select a reason</option>
                <option value="Changed my mind">Changed my mind</option>
                <option value="Found better price elsewhere">Found better price elsewhere</option>
                <option value="Ordered by mistake">Ordered by mistake</option>
                <option value="Delivery too slow">Delivery too slow</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div className="px-5 pb-5 flex gap-3">
              <button
                onClick={() => { setCancelModal(null); setCancelReason(''); }}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-sm py-2.5 rounded-xl transition"
              >
                Keep Order
              </button>
              <button
                onClick={handleCancelOrder}
                disabled={!cancelReason || actionLoading === `cancel-${cancelModal.orderId}`}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold text-sm py-2.5 rounded-xl transition disabled:opacity-50"
              >
                {actionLoading === `cancel-${cancelModal.orderId}` ? 'Cancelling...' : 'Cancel Order'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Return Request Modal ─── */}
      {returnModal && (
        <div
          className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="return-order-modal-title"
          onClick={(e) => { if (e.target === e.currentTarget) { setReturnModal(null); setReturnReason(''); setReturnDescription(''); } }}
          onKeyDown={(e) => { if (e.key === 'Escape') { setReturnModal(null); setReturnReason(''); setReturnDescription(''); } }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <h3 id="return-order-modal-title" className="text-base font-bold text-gray-900">Request Return / Refund</h3>
              <button onClick={() => { setReturnModal(null); setReturnReason(''); setReturnDescription(''); }} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <div className="px-5 pb-2">
              <p className="text-sm text-gray-500 mb-1">Order: <span className="font-semibold text-gray-700">{returnModal.orderNumber}</span></p>
            </div>
            <div className="px-5 pb-4 space-y-3">
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wider">Reason for return *</label>
                <select
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-400"
                >
                  <option value="">Select a reason</option>
                  <option value="Defective or damaged product">Defective or damaged product</option>
                  <option value="Wrong item received">Wrong item received</option>
                  <option value="Item not as described">Item not as described</option>
                  <option value="Quality not satisfactory">Quality not satisfactory</option>
                  <option value="Size/fit issue">Size/fit issue</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wider">Additional details</label>
                <textarea
                  value={returnDescription}
                  onChange={(e) => setReturnDescription(e.target.value)}
                  placeholder="Describe the issue (optional)"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none h-20"
                />
              </div>
            </div>
            <div className="px-5 pb-5 flex gap-3">
              <button
                onClick={() => { setReturnModal(null); setReturnReason(''); setReturnDescription(''); }}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-sm py-2.5 rounded-xl transition"
              >
                Cancel
              </button>
              <button
                onClick={handleRequestReturn}
                disabled={!returnReason || actionLoading === `return-${returnModal.orderId}`}
                className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-bold text-sm py-2.5 rounded-xl transition disabled:opacity-50"
              >
                {actionLoading === `return-${returnModal.orderId}` ? 'Submitting...' : 'Submit Return'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Request Refund Modal ─── */}
      {refundModal && (
        <div
          className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="refund-modal-title"
          onClick={(e) => { if (e.target === e.currentTarget) { setRefundModal(null); setRefundReason(''); } }}
          onKeyDown={(e) => { if (e.key === 'Escape') { setRefundModal(null); setRefundReason(''); } }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <h3 id="refund-modal-title" className="text-base font-bold text-gray-900">Request Refund</h3>
              <button onClick={() => { setRefundModal(null); setRefundReason(''); }} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <div className="px-5 pb-2">
              <p className="text-sm text-gray-500 mb-1">Order: <span className="font-semibold text-gray-700">{refundModal.orderNumber}</span></p>
              <p className="text-xs text-gray-400 mb-3">
                Refund amount: <span className="font-semibold text-gray-700">{formatPrice(refundModal.amount, refundModal.currency)}</span>.
                A refund ID will be generated and the request will be reviewed by our team.
              </p>
            </div>
            <div className="px-5 pb-4">
              <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wider">Reason for refund *</label>
              <textarea
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                placeholder="Tell us why you want this refund"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-none h-24"
              />
            </div>
            <div className="px-5 pb-5 flex gap-3">
              <button
                onClick={() => { setRefundModal(null); setRefundReason(''); }}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-sm py-2.5 rounded-xl transition"
              >
                Cancel
              </button>
              <button
                onClick={handleRequestRefund}
                disabled={!refundReason.trim() || actionLoading === `refund-${refundModal.orderId}`}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm py-2.5 rounded-xl transition disabled:opacity-50"
              >
                {actionLoading === `refund-${refundModal.orderId}` ? 'Submitting...' : 'Submit Refund Request'}
              </button>
            </div>
          </div>
        </div>
      )}

      <Footer />
      <MobileNav />
    </div>
  );
};
