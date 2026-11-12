import React, { useState, useEffect } from 'react';
import logger from '../../utils/logger';
import { useParams, useNavigate } from 'react-router-dom';
import { Header } from '../../components/layout/Header';
import { Footer } from '../../components/layout/Footer';
import { MobileNav } from '../../components/layout/MobileNav';
import { Skeleton, ListSkeleton } from '../../components/common/Skeleton';
import {
  Package, Truck, RotateCcw, Download, Loader2,
  ArrowLeft, CheckCircle2, Clock,
  ShoppingBag, Copy, Check, XCircle, AlertTriangle, Star,
} from 'lucide-react';
import {
  fetchOrderById, cancelOrder, canCancelOrder,
  requestReturn, canRequestReturn, fetchOrderReturns,
  fetchOrderStatusHistory,
} from '../../lib/orderService';
import { notifyOrderEvent } from '../../lib/notificationService';
import { useCurrency } from '../../contexts/CurrencyContext';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { fetchMultiSellerTat } from '../../lib/tatService';
import { buildInvoiceNumber, formatFrontend12DigitId } from '../../utils/idFormatter';
import { generateInvoicePdf } from '../../utils/invoicePdf';
import { resolveCustomerUnitPrice } from '../../lib/orderPricingViews';
import { openExternalLinkHandler } from '../../mobile/externalLinks';

/* ───────── types ───────── */
interface OrderItem {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  price: number;
  currency: string;
  image: string;
  sellerId?: string;
  selectedSize?: string;
  selectedColor?: string;
  sku?: string;
  hsnCode?: string;
}

interface Order {
  id: string;
  orderNumber: string;
  date: string;
  createdAt: string;
  status: string;
  currency: string;
  total: number;
  subtotal: number;
  shipping: number;
  additionalCharges: number;
  paymentMethod: string;
  paymentStatus?: string;
  shippingAddress?: Record<string, any>;
  phone?: string;
  items: OrderItem[];
}

const computeMonthlyOrderSequence = async (createdAt: string, orderId: string, userId?: string): Promise<number> => {
  const bookingDate = new Date(createdAt);
  if (Number.isNaN(bookingDate.getTime())) return 1;

  const monthStart = new Date(bookingDate.getFullYear(), bookingDate.getMonth(), 1).toISOString();

  let query = supabase
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', monthStart)
    .lte('created_at', createdAt);

  if (userId) {
    query = query.eq('user_id', userId);
  }

  const { count } = await query;

  if (count && count > 0) return count;
  return Number(formatFrontend12DigitId(orderId).slice(-6));
};

interface ShipmentTracking {
  status: 'pending' | 'processing' | 'shipped' | 'in_transit' | 'delivered';
  estimatedDelivery: string;
  carrier: string;
  trackingNumber: string;
  lastUpdate: string;
  provider?: 'shiprocket' | 'shippo';
  trackingUrl?: string | null;
}

interface TrackingEventInfo {
  id: string;
  status: string;
  statusCode: string;
  location: string;
  eventAt: string;
  remarks: string;
}

interface ShipmentInfo {
  id: string;
  sellerId: string;
  sellerName: string;
  awbNumber: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  carrierName?: string;
  provider: 'shiprocket' | 'shippo';
  trackingUrl?: string | null;
  trackingEvents: TrackingEventInfo[];
}


type TabId = 'items' | 'tracking' | 'invoice';

/* ───────── status helpers ───────── */
const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; icon: React.ReactNode }> = {
  pending:     { label: 'Pending',    bg: 'bg-amber-50 border-amber-200',   text: 'text-amber-700',  icon: <Clock size={14} /> },
  new:         { label: 'New Order',  bg: 'bg-amber-50 border-amber-200',   text: 'text-amber-700',  icon: <Clock size={14} /> },
  accepted:    { label: 'Accepted',   bg: 'bg-blue-50 border-blue-200',     text: 'text-blue-700',   icon: <Package size={14} /> },
  packed:      { label: 'Packed',     bg: 'bg-cyan-50 border-cyan-200',     text: 'text-cyan-700',   icon: <Package size={14} /> },
  processing:  { label: 'Processing', bg: 'bg-blue-50 border-blue-200',     text: 'text-blue-700',   icon: <Package size={14} /> },
  shipped:     { label: 'Shipped',    bg: 'bg-indigo-50 border-indigo-200', text: 'text-indigo-700', icon: <Truck size={14} /> },
  in_transit:  { label: 'In Transit', bg: 'bg-purple-50 border-purple-200', text: 'text-purple-700', icon: <Truck size={14} /> },
  out_for_delivery: { label: 'Out for Delivery', bg: 'bg-violet-50 border-violet-200', text: 'text-violet-700', icon: <Truck size={14} /> },
  delivered:   { label: 'Delivered',  bg: 'bg-green-50 border-green-200',   text: 'text-green-700',  icon: <CheckCircle2 size={14} /> },
  cancelled:          { label: 'Cancelled',          bg: 'bg-red-50 border-red-200',       text: 'text-red-600',    icon: <XCircle size={14} /> },
  failed_delivery:    { label: 'Delivery Failed',    bg: 'bg-red-50 border-red-200',       text: 'text-red-600',    icon: <AlertTriangle size={14} /> },
  return_requested:   { label: 'Return Requested',   bg: 'bg-orange-50 border-orange-200', text: 'text-orange-700', icon: <RotateCcw size={14} /> },
  returned:           { label: 'Returned',           bg: 'bg-orange-50 border-orange-200', text: 'text-orange-600', icon: <RotateCcw size={14} /> },
  refunded:           { label: 'Refunded',           bg: 'bg-teal-50 border-teal-200',     text: 'text-teal-700',   icon: <CheckCircle2 size={14} /> },
};

const getStatusCfg = (s: string) => STATUS_CONFIG[s] || STATUS_CONFIG.pending;

/* ───────── tracking URL builder ───────── */
// Shippo carrier slug → public tracking page (used when Shippo's own tracking_url_provider is missing).
const SHIPPO_CARRIER_TRACK_URL: Record<string, (awb: string) => string> = {
  usps:           (a) => `https://tools.usps.com/go/TrackConfirmAction?tLabels=${a}`,
  ups:            (a) => `https://www.ups.com/track?tracknum=${a}`,
  fedex:          (a) => `https://www.fedex.com/fedextrack/?trknbr=${a}`,
  dhl:            (a) => `https://www.dhl.com/en/express/tracking.html?AWB=${a}`,
  dhl_express:    (a) => `https://www.dhl.com/en/express/tracking.html?AWB=${a}`,
  dhl_ecommerce:  (a) => `https://webtrack.dhlglobalmail.com/?trackingnumber=${a}`,
  royal_mail:     (a) => `https://www.royalmail.com/track-your-item#/tracking-results/${a}`,
  royalmail:      (a) => `https://www.royalmail.com/track-your-item#/tracking-results/${a}`,
  hermes:         (a) => `https://www.evri.com/track/parcel/${a}`,
  evri:           (a) => `https://www.evri.com/track/parcel/${a}`,
  dpd:            (a) => `https://track.dpd.co.uk/parcels/${a}`,
  dpd_uk:         (a) => `https://track.dpd.co.uk/parcels/${a}`,
  parcelforce:    (a) => `https://www.parcelforce.com/portal/pw/track?trackNumber=${a}`,
  yodel:          (a) => `https://www.yodel.co.uk/tracking/${a}`,
};

const slugifyCarrier = (name?: string): string =>
  (name || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

const generateTrackingUrl = (
  awbNumber: string,
  provider: 'shiprocket' | 'shippo' = 'shiprocket',
  carrierName?: string,
  providerTrackingUrl?: string | null,
): string | null => {
  if (!awbNumber || awbNumber === 'Pending' || awbNumber === 'N/A') return null;

  // If Shippo (or future provider) already returned a ready tracking URL, prefer it.
  if (providerTrackingUrl && /^https?:\/\//i.test(providerTrackingUrl)) {
    return providerTrackingUrl;
  }

  if (provider === 'shippo') {
    const slug = slugifyCarrier(carrierName);
    // Try exact match first, then common partial matches (e.g. "usps_priority" -> "usps").
    const exact = SHIPPO_CARRIER_TRACK_URL[slug];
    if (exact) return exact(awbNumber);
    for (const key of Object.keys(SHIPPO_CARRIER_TRACK_URL)) {
      if (slug.startsWith(key + '_') || slug.includes('_' + key + '_') || slug.endsWith('_' + key)) {
        return SHIPPO_CARRIER_TRACK_URL[key](awbNumber);
      }
    }
    return null; // Unknown Shippo carrier → no Track button; AWB copy still works.
  }

  // Default: Shiprocket public tracking page (works for all SR-onboarded couriers).
  // Note: the legacy `track.shiprocket.in` domain serves an invalid TLS cert and is
  // unreachable from modern browsers — Shiprocket's current public tracker is
  // hosted at `shiprocket.co/tracking/{awb}`.
  return `https://shiprocket.co/tracking/${awbNumber}`;
};

/* ───────── timeline builder ───────── */
const TIMELINE_STEPS = ['pending', 'processing', 'shipped', 'in_transit', 'delivered'];

const normalizeTrackingStatus = (status: string): ShipmentTracking['status'] => {
  const normalized = (status || '').toLowerCase();
  if (normalized === 'new' || normalized === 'pending') return 'pending';
  if (normalized === 'accepted' || normalized === 'packed' || normalized === 'processing') return 'processing';
  if (normalized === 'shipped') return 'shipped';
  if (normalized === 'in_transit') return 'in_transit';
  if (normalized === 'out_for_delivery') return 'in_transit';
  if (normalized === 'delivered') return 'delivered';
  return 'pending';
};

function buildTimeline(status: string, orderDate: string, lastUpdate: string) {
  const idx = TIMELINE_STEPS.indexOf(status);
  const orderDt = new Date(orderDate);

  return TIMELINE_STEPS.map((step, i) => {
    const done = i <= idx;
    const current = i === idx;
    let date = '';
    if (done && i === 0) date = orderDt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    else if (current) date = lastUpdate;
    return { step, label: STATUS_CONFIG[step]?.label || step, done, current, date };
  });
}

/* ═══════════════════════════════════════════════════ */

export const OrderDetails: React.FC = () => {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const { formatPrice } = useCurrency();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<TabId>('items');
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<Order | null>(null);
  const [shipping, setShipping] = useState<ShipmentTracking | null>(null);
  const [shipments, setShipments] = useState<ShipmentInfo[]>([]);
  const [copied, setCopied] = useState(false);
  const [copiedAwb, setCopiedAwb] = useState<string | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState('');

  /* cancel / return state */
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState<string | null>(null); // itemId
  const [returnReason, setReturnReason] = useState('');
  const [returnDescription, setReturnDescription] = useState('');
  const [returning, setReturning] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [statusHistory, setStatusHistory] = useState<any[]>([]);
  const [orderReturns, setOrderReturns] = useState<any[]>([]);
  const [invoiceSequenceCache, setInvoiceSequenceCache] = useState<number | null>(null);

  /* ── redirect when orderId is missing ── */
  useEffect(() => {
    if (!orderId) {
      navigate('/orders', { replace: true });
    }
  }, [orderId, navigate]);

  /* ── fetch ── */
  useEffect(() => {
    if (!orderId) return;
    (async () => {
      try {
        setLoading(true);
        const result = await fetchOrderById(orderId);
        const d = result.data;
        if (!d) return;

        let orderItems: OrderItem[] = [];
        try {
          const raw = d.order_items || d.items;
          const items = typeof raw === 'string' ? JSON.parse(raw) : raw;
          orderItems = Array.isArray(items)
            ? items.map((item: any, i: number) => ({
                id: item.id || `${i}`,
                productId: item.product_id || item.productId,
                productName: item.product_name || item.productName,
                quantity: item.quantity,
                price: resolveCustomerUnitPrice(item),
                currency: item.currency || d.currency || 'INR',
                image: item.image || item.product_image || '/images/logo/logo.png',
                sellerId: item.seller_id || undefined,
                selectedSize: item.variant_info?.size || item.variantInfo?.size || undefined,
                selectedColor: item.variant_info?.color || item.variantInfo?.color || undefined,
                sku: item.variant_info?.sku || item.variantInfo?.sku || undefined,
                hsnCode: item.variant_info?.hsn_code || item.variantInfo?.hsn_code || undefined,
              }))
            : [];
        } catch (e) {
          logger.error(e as Error, { context: 'Failed to parse order items' });
        }

        const itemsTotal = orderItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
        const shippingCharge = Number(d.shipping_charge || 0);
        // L13: Use explicit platform_fee from DB when available, fall back to remainder
        const platformFee = d.platform_fee != null
          ? Math.max(0, Number(d.platform_fee))
          : Math.max(0, Number(d.total_amount || 0) - itemsTotal - shippingCharge);

        setOrder({
          id: d.id,
          orderNumber: formatFrontend12DigitId(d.id),
          date: new Date(d.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }),
          createdAt: d.created_at,
          status: d.status,
          currency: d.currency || 'INR',
          total: d.total_amount,
          subtotal: itemsTotal || d.total_amount,
          shipping: shippingCharge,
          additionalCharges: Math.max(0, platformFee),
          paymentMethod: d.payment_method || 'Card',
          paymentStatus: d.payment_status || 'pending',
          shippingAddress: d.shipping_address || null,
          phone: d.phone || null,
          items: orderItems,
        });

        let mappedStatus: ShipmentTracking['status'] = normalizeTrackingStatus(d.status);

        // Fetch ALL shipments for this order (multi-seller) — Shiprocket first
        let carrierName = d.shipping_carrier || 'Standard Shipping';
        let trackingNumber = d.tracking_number || '';
        let activeProvider: 'shiprocket' | 'shippo' = 'shiprocket';
        let activeTrackingUrl: string | null = null;

        const { data: srShipments } = await supabase
          .from('shiprocket_shipments')
          .select('id, seller_id, awb_number, courier_name, status, created_at, updated_at')
          .eq('order_id', d.id)
          .order('created_at', { ascending: false });

        if (srShipments && srShipments.length > 0) {
          const latestSr = srShipments[0];
          carrierName = latestSr.courier_name || 'Shiprocket';
          activeProvider = 'shiprocket';
          if (latestSr.awb_number) {
            trackingNumber = latestSr.awb_number;
          }
          if (latestSr.status) {
            mappedStatus = normalizeTrackingStatus(String(latestSr.status));
          }

          // Resolve seller names
          const srSellerIds = [...new Set(srShipments.map(s => s.seller_id).filter(Boolean))];
          const srSellerNameMap = new Map<string, string>();
          if (srSellerIds.length > 0) {
            try {
              const { data: profiles } = await supabase
                .from('profiles')
                .select('id, full_name')
                .in('id', srSellerIds);
              (profiles || []).forEach((p: any) => srSellerNameMap.set(p.id, p.full_name || 'Seller'));
            } catch {
              // Non-blocking: RLS may restrict profile access
            }
          }

          // Fetch Shiprocket tracking events
          const srShipmentIds = srShipments.map(s => s.id).filter(Boolean);
          const srEventsByShipment = new Map<string, TrackingEventInfo[]>();
          if (srShipmentIds.length > 0) {
            const { data: srEvents } = await supabase
              .from('shiprocket_tracking_events')
              .select('id, shipment_id, sr_status, sr_status_label, activity, location, event_at')
              .in('shipment_id', srShipmentIds)
              .order('event_at', { ascending: false });
            (srEvents || []).forEach((e: any) => {
              const list = srEventsByShipment.get(e.shipment_id) || [];
              list.push({
                id: e.id,
                status: e.sr_status_label || e.sr_status || '',
                statusCode: e.sr_status || '',
                location: e.location || '',
                eventAt: e.event_at || '',
                remarks: e.activity || '',
              });
              srEventsByShipment.set(e.shipment_id, list);
            });
          }

          setShipments(srShipments.map(s => ({
            id: s.id,
            sellerId: s.seller_id,
            sellerName: srSellerNameMap.get(s.seller_id) || 'Seller',
            awbNumber: s.awb_number || '',
            status: s.status || 'created',
            createdAt: s.created_at,
            updatedAt: s.updated_at,
            carrierName: s.courier_name || 'Shiprocket',
            provider: 'shiprocket' as const,
            trackingUrl: null,
            trackingEvents: srEventsByShipment.get(s.id) || [],
          })));
        }

        // Shippo fallback: if no Shiprocket shipments, check Shippo (UK-origin sellers)
        if (!srShipments || srShipments.length === 0) {
          const { data: spShipments } = await supabase
            .from('shippo_shipments')
            .select('id, seller_id, tracking_number, courier_name, service_level, label_url, status, created_at, updated_at, raw_payload')
            .eq('order_id', d.id)
            .order('created_at', { ascending: false });

          if (spShipments && spShipments.length > 0) {
            const latestSp = spShipments[0];
            carrierName = latestSp.courier_name || latestSp.service_level || 'Shippo';
            activeProvider = 'shippo';
            const latestRp = (latestSp as any).raw_payload || {};
            const latestProviderUrl =
              latestRp.tracking_url_provider ||
              latestRp.tracking_url ||
              latestRp?.transaction?.tracking_url_provider ||
              null;
            activeTrackingUrl = typeof latestProviderUrl === 'string' ? latestProviderUrl : null;
            if (latestSp.tracking_number) {
              trackingNumber = latestSp.tracking_number;
            }
            if (latestSp.status) {
              mappedStatus = normalizeTrackingStatus(String(latestSp.status));
            }

            // Resolve seller names
            const spSellerIds = [...new Set(spShipments.map(s => s.seller_id).filter(Boolean))];
            const spSellerNameMap = new Map<string, string>();
            if (spSellerIds.length > 0) {
              try {
                const { data: profiles } = await supabase
                  .from('profiles')
                  .select('id, full_name')
                  .in('id', spSellerIds);
                (profiles || []).forEach((p: any) => spSellerNameMap.set(p.id, p.full_name || 'Seller'));
              } catch {
                // Non-blocking: RLS may restrict profile access
              }
            }

            // Fetch Shippo tracking events
            const spShipmentIds = spShipments.map(s => s.id).filter(Boolean);
            const spEventsByShipment = new Map<string, TrackingEventInfo[]>();
            if (spShipmentIds.length > 0) {
              const { data: spEvents } = await supabase
                .from('shippo_tracking_events')
                .select('id, shipment_id, status, status_details, location, event_at')
                .in('shipment_id', spShipmentIds)
                .order('event_at', { ascending: false });
              (spEvents || []).forEach((e: any) => {
                const list = spEventsByShipment.get(e.shipment_id) || [];
                list.push({
                  id: e.id,
                  status: e.status || '',
                  statusCode: e.status || '',
                  location: e.location || '',
                  eventAt: e.event_at || '',
                  remarks: e.status_details || '',
                });
                spEventsByShipment.set(e.shipment_id, list);
              });
            }

            setShipments(spShipments.map(s => {
              const rp = (s as any).raw_payload || {};
              const providerUrl =
                rp.tracking_url_provider ||
                rp.tracking_url ||
                rp?.transaction?.tracking_url_provider ||
                null;
              return {
                id: s.id,
                sellerId: s.seller_id,
                sellerName: spSellerNameMap.get(s.seller_id) || 'Seller',
                awbNumber: s.tracking_number || '',
                status: s.status || 'created',
                createdAt: s.created_at,
                updatedAt: s.updated_at,
                carrierName: s.courier_name || s.service_level || 'Shippo',
                provider: 'shippo' as const,
                trackingUrl: typeof providerUrl === 'string' ? providerUrl : null,
                trackingEvents: spEventsByShipment.get(s.id) || [],
              };
            }));
          }
        }

        // Derive delivery estimate
        const shippingAddr = d.shipping_address || {};
        const destinationPin = String(shippingAddr.postalCode || shippingAddr.postal_code || shippingAddr.pin_code || '').replace(/\s+/g, '');
        const productIdsForTat = Array.isArray(d.order_items)
          ? d.order_items.map((item: any) => String(item.product_id || item.productId || '')).filter(Boolean)
          : [];
        const userId = user?.id || '';
        let expectedDate = '';

        // Use stored ETD from order columns first, then from checkout shipping address
        const storedEtd = d.expected_delivery_date || shippingAddr.expected_delivery_date || shippingAddr.expectedDeliveryDate || '';
        if (storedEtd) {
          // If it's an ISO date, format it; if it's already a display string (e.g. "Mar 31, 2026 - Apr 02, 2026"), use as-is
          const parsed = new Date(storedEtd);
          expectedDate = !isNaN(parsed.getTime()) && storedEtd.includes('-') && storedEtd.length <= 12
            ? parsed.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
            : storedEtd;
        }

        // Fallback: fetch TAT for domestic orders
        if (!expectedDate && destinationPin && productIdsForTat.length > 0 && userId) {
          try {
            const tatResult = await fetchMultiSellerTat(productIdsForTat, destinationPin, userId);
            if (tatResult.maxExpectedDate) {
              expectedDate = new Date(tatResult.maxExpectedDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
            }
          } catch (tatErr) {
            console.error('[TAT] OrderDetails TAT fetch failed:', tatErr);
          }
        }

        setShipping({
          status: mappedStatus,
          estimatedDelivery: expectedDate,
          carrier: carrierName,
          trackingNumber: trackingNumber || 'N/A',
          lastUpdate: new Date(d.updated_at).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
          provider: activeProvider,
          trackingUrl: activeTrackingUrl,
        });

        const invoiceSequence = await computeMonthlyOrderSequence(d.created_at, d.id, user?.id);
        setInvoiceSequenceCache(invoiceSequence);
        setInvoiceNumber(buildInvoiceNumber(d.created_at, invoiceSequence, d.id));
      } catch (err) {
        logger.error(err as Error, { context: 'Failed to fetch order details' });
      } finally {
        setLoading(false);
      }
    })();
  }, [orderId, user]);

  /* fetch status history + returns after order loads */
  useEffect(() => {
    if (!order?.id) return;
    fetchOrderStatusHistory(order.id).then(({ data }) => setStatusHistory(data || [])).catch(() => {});
    fetchOrderReturns(order.id).then(({ data }) => setOrderReturns(data || [])).catch(() => {});
  }, [order?.id, order?.status]);

  /* ── CANCEL ORDER ── */
  const handleCancelOrder = async () => {
    if (!order || !user?.id || !cancelReason.trim()) return;
    setCancelling(true);
    const { success, error } = await cancelOrder({
      orderId: order.id,
      cancelledBy: user.id,
      role: 'buyer',
      reason: cancelReason.trim(),
    });
    if (success) {
      /* notify seller(s) + admin */
      const sellerIds = [...new Set(order.items.map(i => i.sellerId).filter(Boolean))] as string[];
      await notifyOrderEvent({
        type: 'order_cancelled',
        orderId: order.id,
        orderNumber: order.orderNumber,
        buyerId: user.id,
        buyerEmail: user.email || undefined,
        buyerName: user.full_name || user.email || 'Customer',
        sellerIds,
        adminNotify: true,
        title: 'Order Cancelled',
        message: `Order #${order.orderNumber} was cancelled. Reason: ${cancelReason.trim()}`,
        emailData: {
          order_id: order.orderNumber,
          customer_name: order.shippingAddress?.name || order.shippingAddress?.full_name || 'Customer',
          reason: cancelReason.trim(),
        },
      });
      setOrder(prev => prev ? { ...prev, status: 'cancelled' } : prev);
      setShowCancelModal(false);
      setCancelReason('');
      setActionError(null);
    } else {
      setActionError(error || 'Failed to cancel order');
    }
    setCancelling(false);
  };

  /* ── RETURN ITEM ── */
  const handleInitiateReturn = async (itemId: string) => {
    if (!order || !user?.id || !returnReason.trim()) return;
    setReturning(true);

    const item = order.items.find(i => i.id === itemId);
    // M18: For full-order return ('all'), sum all item quantities
    const returnQuantity = item ? item.quantity : order.items.reduce((sum, i) => sum + i.quantity, 0);
    const { data, error } = await requestReturn({
      orderId: order.id,
      orderItemId: item?.id || undefined,
      userId: user.id,
      reason: returnReason.trim(),
      description: returnDescription.trim() || undefined,
      quantity: returnQuantity,
    });

    if (data) {
      const sellerIds = [...new Set(order.items.map(i => i.sellerId).filter(Boolean))] as string[];
      await notifyOrderEvent({
        type: 'return_requested',
        orderId: order.id,
        orderNumber: order.orderNumber,
        buyerId: user.id,
        sellerIds,
        adminNotify: true,
        title: 'Return Requested',
        message: `Return requested for order #${order.orderNumber}. Reason: ${returnReason.trim()}`,
        metadata: { return_id: data.id },
        emailData: {
          order_id: order.orderNumber,
          customer_name: order.shippingAddress?.name || order.shippingAddress?.full_name || 'Customer',
          reason: returnReason.trim(),
        },
      });
      setOrder(prev => prev ? { ...prev, status: 'return_requested' } : prev);
      setShowReturnModal(null);
      setReturnReason('');
      setReturnDescription('');
      setActionError(null);
    } else {
      setActionError(error || 'Failed to submit return request');
    }
    setReturning(false);
  };

  const handleDownloadInvoice = async () => {
    if (!order || invoiceLoading) return;
    setInvoiceLoading(true);
    try {

    const invoiceSequence = invoiceSequenceCache ?? await computeMonthlyOrderSequence(order.createdAt, order.id, user?.id);

    const formatDate = (value: Date | string) => {
      const date = value instanceof Date ? value : new Date(value);
      if (Number.isNaN(date.getTime())) return 'N/A';
      return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    };

    const bookingDate = new Date(order.createdAt);
    const resolvedInvoiceNumber = invoiceNumber || buildInvoiceNumber(order.createdAt, invoiceSequence, order.id);
    const bookingId = order.orderNumber;

    const productIds = Array.from(new Set(order.items.map((item) => item.productId).filter(Boolean)));

    const productsResponse = productIds.length > 0
      ? await supabase
          .from('products')
          .select('id, public_product_id, brand, seller_id')
          .in('id', productIds)
          .then((res) => res.data || [])
      : [] as any[];

    const productById = new Map<string, any>((productsResponse || []).map((row: any) => [String(row.id), row]));

    const sellerGroups = new Map<string, { brands: Set<string> }>();
    order.items.forEach((item) => {
      const meta = productById.get(item.productId);
      const sellerId = String(item.sellerId || meta?.seller_id || 'N/A');
      const brand = String(meta?.brand || 'N/A').trim();
      const existing = sellerGroups.get(sellerId) || { brands: new Set<string>() };
      if (brand) existing.brands.add(brand);
      sellerGroups.set(sellerId, existing);
    });

    const sellerIds = Array.from(sellerGroups.keys()).filter((id) => id !== 'N/A');
    const sellerById = new Map<string, any>();
    const sellerKycById = new Map<string, any>();
    if (sellerIds.length > 0) {
      try {
        const [kycData, profileData] = await Promise.all([
          supabase
            .from('seller_kyc')
            .select('seller_id, business_name, full_name, email, phone, business_street_address_1, business_street_address_2, business_city, business_state, business_postal_code, business_country')
            .in('seller_id', sellerIds)
            .then((res) => res.data || []),
          supabase
            .from('profiles')
            .select('id, full_name, email, phone')
            .in('id', sellerIds)
            .then((res) => res.data || []),
        ]);
        (kycData || []).forEach((row: any) => sellerKycById.set(String(row.seller_id), row));
        (profileData || []).forEach((row: any) => sellerById.set(String(row.id), row));
      } catch {
        // Non-blocking: buyer may not have RLS access to seller profiles/KYC.
      }
    }

    // Use stored delivery date from checkout (TAT API), or call TAT API as fallback
    const shippingAddress = order.shippingAddress || {};
    const destinationPin = String(shippingAddress.postalCode || shippingAddress.postal_code || '').replace(/\s+/g, '');
    const storedDeliveryDate = shippingAddress.expected_delivery_date || shippingAddress.expectedDeliveryDate || '';
    let invoiceDeliveryDate = storedDeliveryDate;
    if (!invoiceDeliveryDate && destinationPin && productIds.length > 0) {
      try {
        const tatResult = await fetchMultiSellerTat(productIds, destinationPin, user?.id || '');
        invoiceDeliveryDate = tatResult.maxExpectedDate || '';
      } catch {
        invoiceDeliveryDate = '';
      }
    }

    const buyerName = user?.full_name || 'Buyer';
    const buyerPhone = order.phone || user?.phone || 'Not available';
    const buyerAddress = `${String(shippingAddress.street || '')} ${String(shippingAddress.city || '')} ${String(shippingAddress.state || '')} ${String(shippingAddress.postalCode || '')} ${String(shippingAddress.country || '')}`.trim() || 'Not available';

    const items = order.items.map((item) => {
      return {
        name: item.productName,
        sku: item.sku || undefined,
        hsn_code: item.hsnCode || undefined,
        qty: Number(item.quantity || 0),
        unitPrice: Number(item.price || 0),
        total: Number(item.price || 0) * Number(item.quantity || 0),
      };
    });

    const firstSellerId = sellerIds[0];
    const firstSellerProfile = firstSellerId ? sellerById.get(firstSellerId) : null;
    const firstSellerKyc = firstSellerId ? sellerKycById.get(firstSellerId) : null;
    const sellerName =
      firstSellerKyc?.business_name
      || firstSellerKyc?.full_name
      || firstSellerProfile?.full_name
      || firstSellerProfile?.email
      || 'Seller';
    const sellerAddress = [
      firstSellerKyc?.business_street_address_1,
      firstSellerKyc?.business_street_address_2,
      firstSellerKyc?.business_city,
      firstSellerKyc?.business_state,
      firstSellerKyc?.business_postal_code,
      firstSellerKyc?.business_country,
    ].filter(Boolean).join(', ');
    const sellerContact = firstSellerKyc?.phone || firstSellerKyc?.email || firstSellerProfile?.phone || firstSellerProfile?.email || '';

    await generateInvoicePdf(
      {
        invoiceNumber: resolvedInvoiceNumber,
        orderId: bookingId,
        orderDate: formatDate(bookingDate),
        deliveryDate: invoiceDeliveryDate ? formatDate(new Date(invoiceDeliveryDate)) : 'Not available',
        paymentMethod: `${String(order.paymentStatus || 'pending').toUpperCase()} via ${order.paymentMethod}`,
        sellerName,
        sellerAddress,
        sellerContact,
        buyerName,
        buyerAddress,
        buyerPhone,
        items,
        currency: order.currency,
        totalPaid: Number(order.total || 0),
        shippingCharge: Number(order.shipping || 0),
      },
      formatPrice,
    );

    logger.log('Invoice downloaded', { orderId });
    } finally {
      setInvoiceLoading(false);
    }
  };

  const copyTrackingNumber = () => {
    if (shipping?.trackingNumber && shipping.trackingNumber !== 'N/A') {
      navigator.clipboard.writeText(shipping.trackingNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const copyAwb = (awb: string) => {
    if (awb) {
      navigator.clipboard.writeText(awb);
      setCopiedAwb(awb);
      setTimeout(() => setCopiedAwb(null), 2000);
    }
  };

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'items',    label: 'Items',    icon: <Package size={16} /> },
    { id: 'tracking', label: 'Tracking', icon: <Truck size={16} /> },
    { id: 'invoice',  label: 'Invoice',  icon: <Download size={16} /> },
  ];

  /* ═══════════════════════ RENDER ═══════════════════════ */
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header />

      <main className="flex-1 w-full max-w-4xl mx-auto px-4 sm:px-6 py-6 pb-24 md:pb-10">
        {/* Back */}
        <button
          onClick={() => navigate('/orders')}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-5 transition-colors"
        >
          <ArrowLeft size={16} /> Back to Orders
        </button>

        {/* ── Loading ── */}
        {loading ? (
          <div className="space-y-4">
            <Skeleton rounded="2xl" className="h-28 w-full" />
            <ListSkeleton rows={3} withThumb />
            <Skeleton rounded="2xl" className="h-40 w-full" />
          </div>
        ) : !order ? (
          /* ── Empty state ── */
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <ShoppingBag size={28} className="text-gray-400" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Order Not Found</h2>
            <p className="text-gray-500 text-sm mb-6">We couldn't find the order you're looking for.</p>
            <button
              onClick={() => navigate('/orders')}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-600 hover:text-amber-700 transition"
            >
              <ArrowLeft size={14} /> Back to Orders
            </button>
          </div>
        ) : (
          <>
            {/* ═══ Header Card ═══ */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 sm:p-6 mb-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-lg sm:text-xl font-bold text-gray-900">
                      Order #{order.orderNumber}
                    </h1>
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${getStatusCfg(order.status).bg} ${getStatusCfg(order.status).text}`}>
                      {getStatusCfg(order.status).icon}
                      {getStatusCfg(order.status).label}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 mt-1">Placed on {order.date}</p>
                </div>
                <div className="text-left sm:text-right">
                  <p className="text-xs text-gray-400 uppercase tracking-wide">Total</p>
                  <p className="text-xl font-bold text-gray-900">{formatPrice(order.total, order.currency)}</p>
                </div>
              </div>

              {/* ── Action buttons ── */}
              <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-gray-100">
                {canCancelOrder(order.status, 'buyer') && (
                  <button
                    onClick={() => setShowCancelModal(true)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-red-600 bg-red-50 border border-red-200 rounded-xl hover:bg-red-100 transition"
                  >
                    <XCircle size={14} />
                    Cancel Order
                  </button>
                )}
                {canRequestReturn(order.status) && (
                  <button
                    onClick={() => setShowReturnModal('all')}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-orange-600 bg-orange-50 border border-orange-200 rounded-xl hover:bg-orange-100 transition"
                  >
                    <RotateCcw size={14} />
                    Return / Refund
                  </button>
                )}
              </div>
            </div>

            {/* ═══ Tabs ═══ */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="flex border-b border-gray-100">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex-1 py-3.5 text-sm font-medium flex items-center justify-center gap-1.5 transition-colors relative ${
                      activeTab === tab.id
                        ? 'text-amber-600'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {tab.icon}
                    {tab.label}
                    {activeTab === tab.id && (
                      <span className="absolute bottom-0 left-4 right-4 h-0.5 bg-amber-500 rounded-full" />
                    )}
                  </button>
                ))}
              </div>

              <div className="p-5 sm:p-6">
                {/* ═══════════ ITEMS TAB ═══════════ */}
                {activeTab === 'items' && (
                  <div className="space-y-5">
                    {order.items.length === 0 ? (
                      <p className="text-center text-gray-400 py-8 text-sm">No items found</p>
                    ) : (
                      order.items.map((item) => (
                        <div
                          key={item.id}
                          className="flex gap-4 p-4 rounded-xl bg-gray-50/60 border border-gray-100 hover:border-gray-200 transition"
                        >
                          <img
                            src={item.image}
                            alt={item.productName}
                            className="w-20 h-20 sm:w-24 sm:h-24 object-cover rounded-lg flex-shrink-0 bg-white"
                          />
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-gray-900 text-sm sm:text-base truncate">
                              {item.productName}
                            </h3>
                            {(item.selectedSize || item.selectedColor) && (
                              <p className="text-xs text-gray-500 mt-0.5 flex flex-wrap gap-1">
                                <span className="bg-gray-100 px-1.5 py-0.5 rounded">Size: {item.selectedSize || 'N/A'}</span>
                                <span className="bg-gray-100 px-1.5 py-0.5 rounded">Color: {item.selectedColor || 'N/A'}</span>
                              </p>
                            )}
                            <div className="flex items-center gap-3 mt-2 text-sm">
                              <span className="text-gray-500">Qty: {item.quantity}</span>
                              <span className="text-gray-300">&#8226;</span>
                              <span className="text-gray-500">{formatPrice(item.price, item.currency)} each</span>
                            </div>
                            <div className="flex items-center justify-between mt-2">
                              <p className="font-semibold text-gray-900 text-sm sm:text-base">
                                {formatPrice(item.price * item.quantity, item.currency)}
                              </p>
                              <div className="flex items-center gap-2">
                                {order.status === 'delivered' && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); navigate(`/products/${item.productId}/review`); }}
                                    className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 hover:text-amber-700 transition"
                                  >
                                    <Star size={12} />
                                    Write Review
                                  </button>
                                )}
                                {canRequestReturn(order.status) && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setShowReturnModal(item.id); }}
                                    className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 hover:text-amber-700 transition"
                                  >
                                    <RotateCcw size={12} />
                                    Return
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))
                    )}

                    {/* Summary */}
                    <div className="rounded-xl bg-amber-50/50 border border-amber-100 p-4 mt-2">
                      <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Order Summary</h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-500">Subtotal</span>
                          <span className="text-gray-700 font-medium">{formatPrice(order.subtotal, order.currency)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Shipping</span>
                          <span className="text-gray-700 font-medium">
                            {order.shipping > 0 ? formatPrice(order.shipping, order.currency) : <span className="text-green-600">Free</span>}
                          </span>
                        </div>
                        {order.additionalCharges > 0 && (
                          <div className="flex justify-between">
                            <span className="text-gray-500">Platform Fee</span>
                            <span className="text-gray-700 font-medium">{formatPrice(order.additionalCharges, order.currency)}</span>
                          </div>
                        )}
                        <div className="border-t border-amber-200/60 pt-2 mt-2 flex justify-between">
                          <span className="text-gray-900 font-semibold">Total</span>
                          <span className="text-base font-bold text-gray-900">{formatPrice(order.total, order.currency)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ═══════════ TRACKING TAB ═══════════ */}
                {activeTab === 'tracking' && (
                  <div className="space-y-6">
                    {/* Return status banner */}
                    {orderReturns.length > 0 && (
                      <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
                        <h4 className="text-sm font-semibold text-orange-800 mb-2 flex items-center gap-1.5">
                          <RotateCcw size={14} /> Return Request{orderReturns.length > 1 ? 's' : ''}
                        </h4>
                        {orderReturns.map((ret: any) => (
                          <div key={ret.id} className="text-sm text-orange-700 mb-1">
                            <span className="font-medium capitalize">{(ret.status || '').replace(/_/g, ' ')}</span>
                            {ret.reason && <span className="text-orange-600"> — {ret.reason}</span>}
                            {ret.seller_response && <p className="text-xs text-orange-500 mt-0.5">Seller: {ret.seller_response}</p>}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* ── Multi-shipment view (Shiprocket / Shippo) ── */}
                    {shipments.length > 0 ? (
                      <div className="space-y-4">
                        {shipments.length > 1 && (
                          <p className="text-xs text-gray-500">
                            This order has {shipments.length} shipments from different sellers.
                          </p>
                        )}
                        {shipments.map((shipment) => {
                          const statusCfg = getStatusCfg(shipment.status);
                          return (
                            <div key={shipment.id} className="rounded-xl border border-gray-200 overflow-hidden">
                              {/* Shipment header */}
                              <div className="bg-gray-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-gray-100">
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-semibold text-gray-900">{shipment.sellerName}</p>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <span className="text-xs text-gray-500">{shipment.carrierName || 'Shiprocket'}</span>
                                    <span className="text-gray-300">&#8226;</span>
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-mono text-xs text-amber-600 font-semibold">{shipment.awbNumber || 'Pending'}</span>
                                      {shipment.awbNumber && (
                                        <button onClick={() => copyAwb(shipment.awbNumber)} className="text-gray-400 hover:text-gray-600 transition flex-shrink-0">
                                          {copiedAwb === shipment.awbNumber ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  {generateTrackingUrl(shipment.awbNumber, shipment.provider, shipment.carrierName, shipment.trackingUrl) && (
                                    <a
                                      href={generateTrackingUrl(shipment.awbNumber, shipment.provider, shipment.carrierName, shipment.trackingUrl)!}
                                      onClick={openExternalLinkHandler(generateTrackingUrl(shipment.awbNumber, shipment.provider, shipment.carrierName, shipment.trackingUrl)!)}
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition flex-shrink-0"
                                    >
                                      <Truck size={12} />
                                      Track
                                    </a>
                                  )}
                                  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${statusCfg.bg} ${statusCfg.text}`}>
                                    {statusCfg.icon}
                                    {statusCfg.label}
                                  </span>
                                </div>
                              </div>

                              {/* Tracking events or fallback timeline */}
                              <div className="p-4">
                                {shipment.trackingEvents.length > 0 ? (
                                  <div className="space-y-0">
                                    {shipment.trackingEvents.map((evt, i) => {
                                      const isLast = i === shipment.trackingEvents.length - 1;
                                      return (
                                        <div key={evt.id} className="flex gap-4">
                                          <div className="flex flex-col items-center w-5">
                                            <div className={`w-3 h-3 rounded-full flex-shrink-0 border-2 ${
                                              i === 0
                                                ? 'bg-amber-500 border-amber-500'
                                                : 'bg-white border-gray-200'
                                            }`} />
                                            {!isLast && <div className="w-0.5 flex-1 min-h-[2rem] bg-gray-200" />}
                                          </div>
                                          <div className={`pb-4 ${isLast ? 'pb-0' : ''}`}>
                                            <p className={`text-sm font-medium ${i === 0 ? 'text-gray-900' : 'text-gray-600'}`}>
                                              {evt.status || evt.statusCode || 'Update'}
                                            </p>
                                            {evt.location && <p className="text-xs text-gray-500">{evt.location}</p>}
                                            {evt.remarks && <p className="text-xs text-gray-400">{evt.remarks}</p>}
                                            {evt.eventAt && (
                                              <p className="text-xs text-gray-400 mt-0.5">
                                                {new Date(evt.eventAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                              </p>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  /* Fallback: step-based timeline from shipment status */
                                  <div className="space-y-0">
                                    {buildTimeline(
                                      normalizeTrackingStatus(shipment.status),
                                      shipment.createdAt,
                                      new Date(shipment.updatedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
                                    ).map((step, i, arr) => {
                                      const isLast = i === arr.length - 1;
                                      return (
                                        <div key={step.step} className="flex gap-4">
                                          <div className="flex flex-col items-center w-5">
                                            <div className={`w-3 h-3 rounded-full flex-shrink-0 border-2 ${
                                              step.done
                                                ? 'bg-amber-500 border-amber-500'
                                                : step.current
                                                  ? 'bg-white border-amber-500'
                                                  : 'bg-white border-gray-200'
                                            }`} />
                                            {!isLast && (
                                              <div className={`w-0.5 flex-1 min-h-[2rem] ${
                                                step.done && arr[i + 1]?.done ? 'bg-amber-400' : 'bg-gray-200'
                                              }`} />
                                            )}
                                          </div>
                                          <div className={`pb-5 ${isLast ? 'pb-0' : ''}`}>
                                            <p className={`text-sm font-medium ${step.done ? 'text-gray-900' : 'text-gray-400'}`}>
                                              {step.label}
                                            </p>
                                            {step.date && <p className="text-xs text-gray-400 mt-0.5">{step.date}</p>}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : shipping ? (
                      /* ── Fallback: single-tracking view (legacy) ── */
                      <div className="space-y-6">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Carrier</p>
                            <p className="font-semibold text-gray-900 text-sm">{shipping.carrier}</p>
                          </div>
                          <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Tracking #</p>
                            <div className="flex items-center gap-2">
                              <p className="font-mono text-sm text-amber-600 font-semibold truncate">{shipping.trackingNumber}</p>
                              {shipping.trackingNumber !== 'N/A' && (
                                <button onClick={copyTrackingNumber} className="text-gray-400 hover:text-gray-600 transition flex-shrink-0">
                                  {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                                </button>
                              )}
                            </div>
                          </div>
                          <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Est. Delivery</p>
                            <div className="flex items-center justify-between">
                              <p className="font-semibold text-gray-900 text-sm">
                                {shipping.estimatedDelivery || 'Delivery date will be updated soon'}
                              </p>
                              {generateTrackingUrl(shipping.trackingNumber, shipping.provider, shipping.carrier, shipping.trackingUrl) && (
                                <a
                                  href={generateTrackingUrl(shipping.trackingNumber, shipping.provider, shipping.carrier, shipping.trackingUrl)!}
                                  onClick={openExternalLinkHandler(generateTrackingUrl(shipping.trackingNumber, shipping.provider, shipping.carrier, shipping.trackingUrl)!)}
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition flex-shrink-0 whitespace-nowrap"
                                >
                                  <Truck size={12} />
                                  Track
                                </a>
                              )}
                            </div>
                          </div>
                        </div>

                        <div>
                          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Delivery Timeline</h3>
                          <div className="space-y-0">
                            {buildTimeline(shipping.status, order.createdAt, shipping.lastUpdate).map((step, i, arr) => {
                              const isLast = i === arr.length - 1;
                              return (
                                <div key={step.step} className="flex gap-4">
                                  <div className="flex flex-col items-center w-5">
                                    <div className={`w-3 h-3 rounded-full flex-shrink-0 border-2 ${
                                      step.done
                                        ? 'bg-amber-500 border-amber-500'
                                        : step.current
                                          ? 'bg-white border-amber-500'
                                          : 'bg-white border-gray-200'
                                    }`} />
                                    {!isLast && (
                                      <div className={`w-0.5 flex-1 min-h-[2rem] ${
                                        step.done && arr[i + 1]?.done ? 'bg-amber-400' : 'bg-gray-200'
                                      }`} />
                                    )}
                                  </div>
                                  <div className={`pb-5 ${isLast ? 'pb-0' : ''}`}>
                                    <p className={`text-sm font-medium ${step.done ? 'text-gray-900' : 'text-gray-400'}`}>
                                      {step.label}
                                    </p>
                                    {step.date && <p className="text-xs text-gray-400 mt-0.5">{step.date}</p>}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        <p className="text-xs text-gray-400 text-center">Last updated: {shipping.lastUpdate}</p>
                      </div>
                    ) : (
                      <p className="text-center text-gray-400 py-8 text-sm">No tracking information available yet.</p>
                    )}

                    {/* Status history */}
                    {statusHistory.length > 0 && (
                      <div>
                        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Status History</h3>
                        <div className="space-y-2">
                          {statusHistory.map((h: any) => {
                            // Scrub any role attribution from notes shown to buyers.
                            // Buyers should never see "by admin" / "Updated by admin" phrasing.
                            const rawNote = String(h?.note || '');
                            const cleanedNote = rawNote
                              .replace(/\bupdated\s+by\s+admin\b[:\s-]*/gi, '')
                              .replace(/\bby\s+admin\b[:\s-]*/gi, '')
                              .replace(/\s{2,}/g, ' ')
                              .trim();
                            return (
                              <div key={h.id} className="flex items-start gap-3 text-sm">
                                <span className="text-xs text-gray-400 whitespace-nowrap min-w-[6rem]">
                                  {new Date(h.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                </span>
                                <span className="text-gray-700">
                                  <span className="font-medium capitalize">{(h.to_status || '').replace(/_/g, ' ')}</span>
                                  {cleanedNote && <span className="text-gray-500"> — {cleanedNote}</span>}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ═══════════ INVOICE TAB ═══════════ */}
                {activeTab === 'invoice' && order && (
                  <div className="space-y-5">
                    {/* Invoice summary */}
                    <div className="rounded-xl border border-gray-100 divide-y divide-gray-100">
                      {[
                        { label: 'Invoice ID',      value: invoiceNumber || buildInvoiceNumber(order.createdAt, undefined, order.id) },
                        { label: 'Invoice Date',    value: order.date },
                        { label: 'Payment Method',  value: order.paymentMethod },
                        { label: 'Items',            value: `${order.items.length} item${order.items.length !== 1 ? 's' : ''}` },
                      ].map((row) => (
                        <div key={row.label} className="flex justify-between py-3 px-4 text-sm">
                          <span className="text-gray-500">{row.label}</span>
                          <span className="font-medium text-gray-900">{row.value}</span>
                        </div>
                      ))}
                      <div className="flex justify-between py-3.5 px-4 bg-amber-50/40">
                        <span className="text-gray-900 font-semibold text-sm">Total Amount</span>
                        <span className="font-bold text-gray-900">{formatPrice(order.total, order.currency)}</span>
                      </div>
                    </div>

                    {/* Download */}
                    <button
                      onClick={handleDownloadInvoice}
                      disabled={invoiceLoading}
                      className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-white font-medium text-sm px-6 py-3 rounded-xl transition-colors shadow-sm disabled:opacity-50"
                    >
                      {invoiceLoading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                      {invoiceLoading ? 'Generating...' : 'Download Invoice (PDF)'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </main>

      {/* ═══ Cancel Modal ═══ */}
      {showCancelModal && order && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => { setShowCancelModal(false); setCancelReason(''); setActionError(null); }} onKeyDown={(e) => { if (e.key === 'Escape') { setShowCancelModal(false); setCancelReason(''); setActionError(null); } }}>
          <div role="dialog" aria-modal="true" aria-labelledby="cancel-modal-title" className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle size={20} className="text-red-500" />
              <h3 id="cancel-modal-title" className="text-lg font-bold text-gray-900">Cancel Order</h3>
            </div>
            {actionError && (
              <div className="mb-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{actionError}</div>
            )}
            <p className="text-sm text-gray-500 mb-4">Are you sure you want to cancel order #{order.orderNumber}? This action cannot be undone.</p>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reason for cancellation *</label>
            <select
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm mb-4 focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
            >
              <option value="">Select a reason</option>
              <option value="Changed my mind">Changed my mind</option>
              <option value="Found a better price">Found a better price</option>
              <option value="Ordered by mistake">Ordered by mistake</option>
              <option value="Delivery time too long">Delivery time too long</option>
              <option value="Other">Other</option>
            </select>
            <div className="flex gap-3">
              <button
                onClick={() => { setShowCancelModal(false); setCancelReason(''); setActionError(null); }}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition"
              >
                Keep Order
              </button>
              <button
                onClick={handleCancelOrder}
                disabled={!cancelReason.trim() || cancelling}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-red-600 rounded-xl hover:bg-red-700 transition disabled:opacity-50"
              >
                {cancelling ? 'Cancelling...' : 'Cancel Order'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Return Modal ═══ */}
      {showReturnModal && order && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => { setShowReturnModal(null); setReturnReason(''); setReturnDescription(''); setActionError(null); }} onKeyDown={(e) => { if (e.key === 'Escape') { setShowReturnModal(null); setReturnReason(''); setReturnDescription(''); setActionError(null); } }}>
          <div role="dialog" aria-modal="true" aria-labelledby="return-modal-title" className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-4">
              <RotateCcw size={20} className="text-orange-500" />
              <h3 id="return-modal-title" className="text-lg font-bold text-gray-900">Request Return</h3>
            </div>
            {actionError && (
              <div className="mb-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{actionError}</div>
            )}
            <p className="text-sm text-gray-500 mb-4">Submit a return request for order #{order.orderNumber}.</p>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reason *</label>
            <select
              value={returnReason}
              onChange={(e) => setReturnReason(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm mb-3 focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
            >
              <option value="">Select a reason</option>
              <option value="Defective/Damaged product">Defective/Damaged product</option>
              <option value="Wrong item received">Wrong item received</option>
              <option value="Item not as described">Item not as described</option>
              <option value="Size/Fit issue">Size/Fit issue</option>
              <option value="Quality not satisfactory">Quality not satisfactory</option>
              <option value="Other">Other</option>
            </select>
            <label className="block text-sm font-medium text-gray-700 mb-1">Additional details</label>
            <textarea
              value={returnDescription}
              onChange={(e) => setReturnDescription(e.target.value)}
              rows={3}
              placeholder="Describe the issue..."
              className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm mb-4 resize-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
            />
            <div className="flex gap-3">
              <button
                onClick={() => { setShowReturnModal(null); setReturnReason(''); setReturnDescription(''); setActionError(null); }}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition"
              >
                Cancel
              </button>
              <button
                onClick={() => handleInitiateReturn(showReturnModal)}
                disabled={!returnReason.trim() || returning}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-orange-500 rounded-xl hover:bg-orange-600 transition disabled:opacity-50"
              >
                {returning ? 'Submitting...' : 'Submit Return'}
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

export default OrderDetails;
