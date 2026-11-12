import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { CheckCircle2, Package, MapPin, CreditCard, Phone, Mail, Truck, XCircle } from 'lucide-react';
import { useCart } from '../../contexts/CartContext';
import { useCurrency } from '../../contexts/CurrencyContext';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { formatCurrency as fmtCurrency } from '../../utils/currency';
import { formatFrontend12DigitId } from '../../utils/idFormatter';
import { Header } from '../../components/layout/Header';
import { Footer } from '../../components/layout/Footer';
import { MobileNav } from '../../components/layout/MobileNav';

interface OrderData {
  id: string;
  customerId: string;
  customerEmail: string;
  totalAmount: number;
  orderStatus: 'pending' | 'new' | 'accepted' | 'processing' | 'packed' | 'shipped' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'cancelled' | 'return_requested' | 'returned' | 'refunded';
  paymentStatus: string;
  paymentIntentId: string;
  items: Array<{
    productId: string;
    productName: string;
    quantity: number;
    price: number;
  }>;
  shippingAddress: {
    street: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  billingAddress?: {
    street: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  createdAt: string;
  updatedAt: string;
}

interface CheckoutResultItem {
  productId: string;
  productName: string;
  quantity: number;
  price: number;
  productImage?: string;
  selectedSize?: string;
  selectedColor?: string;
}

interface CheckoutResultState {
  paymentResult: 'success' | 'failed';
  paymentIntentId: string;
  orderId?: string;
  tempOrderId?: string;
  items: CheckoutResultItem[];
  totalAmount: number;
  currency: string;
  failureReason?: string;
}

interface ConfirmationLocationState {
  orderData?: OrderData;
  checkoutResult?: CheckoutResultState;
}

const TEMP_PENDING_ORDERS_KEY = 'beauzead_temp_pending_orders';

const getTempOrderIdFromStorage = (paymentIntentId: string): string => {
  if (!paymentIntentId || typeof window === 'undefined') return '';
  try {
    const raw = localStorage.getItem(TEMP_PENDING_ORDERS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return '';
    const match = list.find((entry: any) => String(entry?.paymentIntentId || '') === paymentIntentId);
    return String(match?.tempOrderId || '').trim();
  } catch {
    return '';
  }
};

const removeTempPendingOrder = (paymentIntentId: string) => {
  if (!paymentIntentId || typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(TEMP_PENDING_ORDERS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return;
    const next = list.filter((entry: any) => String(entry?.paymentIntentId || '') !== paymentIntentId);
    localStorage.setItem(TEMP_PENDING_ORDERS_KEY, JSON.stringify(next));
  } catch {
    // non-blocking cleanup
  }
};

const OrderConfirmationPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = (location.state || {}) as ConfirmationLocationState;
  const { clearCart, removeFromCart } = useCart();
  const { currency, convertPrice } = useCurrency();
  const { user, currentAuthUser, loading: authLoading } = useAuth();
  const [resolvedOrderData, setResolvedOrderData] = useState<OrderData | undefined>(
    locationState.orderData,
  );
  const [resolvingOrder, setResolvingOrder] = useState(false);
  const checkoutResult = locationState.checkoutResult;

  const userId = user?.id || currentAuthUser?.userId || null;

  const paymentIntentFromUrl = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return (
      params.get('payment_intent')
      || params.get('payment_intent_id')
      || params.get('pi')
      || ''
    ).trim();
  }, [location.search]);

  const tempOrderIdFromUrl = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return (params.get('temp_order_id') || '').trim();
  }, [location.search]);

  const tempOrderId = useMemo(() => {
    if (tempOrderIdFromUrl) return tempOrderIdFromUrl;
    return getTempOrderIdFromStorage(paymentIntentFromUrl);
  }, [tempOrderIdFromUrl, paymentIntentFromUrl]);

  useEffect(() => {
    if (checkoutResult || resolvedOrderData || authLoading) return;

    if (!paymentIntentFromUrl) {
      return;
    }

    let cancelled = false;

    const resolveOrderFromPaymentIntent = async () => {
      setResolvingOrder(true);

      try {
        // Order recovery may complete after checkout returns from external auth,
        // so poll briefly before surfacing a delayed-confirmation message.
        for (let attempt = 0; attempt < 10; attempt += 1) {
          let query = supabase
            .from('orders')
            .select('id, user_id, total_amount, status, payment_status, payment_intent_id, shipping_address, billing_address, created_at, updated_at, order_items(*)')
            .eq('payment_intent_id', paymentIntentFromUrl)
            .limit(1);

          if (userId) {
            query = query.eq('user_id', userId);
          }

          const { data, error } = await query.maybeSingle();
          if (error) {
            return;
          }

          if (data) {
            const shippingAddress = (typeof data.shipping_address === 'object' && data.shipping_address)
              ? data.shipping_address as Record<string, any>
              : {};
            const billingAddress = (typeof data.billing_address === 'object' && data.billing_address)
              ? data.billing_address as Record<string, any>
              : undefined;

            const mapped: OrderData = {
              id: String(data.id),
              customerId: String(data.user_id || userId || ''),
              customerEmail: user?.email || '',
              totalAmount: Number(data.total_amount || 0),
              orderStatus: (data.status || 'pending') as OrderData['orderStatus'],
              paymentStatus: String(data.payment_status || 'pending'),
              paymentIntentId: String(data.payment_intent_id || paymentIntentFromUrl),
              items: ((data.order_items || []) as any[]).map((item) => ({
                productId: String(item.product_id || ''),
                productName: String(item.product_name || 'Product'),
                quantity: Number(item.quantity || 1),
                price: Number(item.price || 0),
              })),
              shippingAddress: {
                street: String(shippingAddress.street || shippingAddress.address_line1 || ''),
                city: String(shippingAddress.city || ''),
                state: String(shippingAddress.state || ''),
                postalCode: String(shippingAddress.postalCode || shippingAddress.postal_code || ''),
                country: String(shippingAddress.country || ''),
              },
              billingAddress: billingAddress
                ? {
                    street: String(billingAddress.street || billingAddress.address_line1 || ''),
                    city: String(billingAddress.city || ''),
                    state: String(billingAddress.state || ''),
                    postalCode: String(billingAddress.postalCode || billingAddress.postal_code || ''),
                    country: String(billingAddress.country || ''),
                  }
                : undefined,
              createdAt: String(data.created_at || new Date().toISOString()),
              updatedAt: String(data.updated_at || new Date().toISOString()),
            };

            if (!cancelled) {
              setResolvedOrderData(mapped);
            }
            return;
          }

          await new Promise((resolve) => setTimeout(resolve, 1500));
        }

      } finally {
        if (!cancelled) {
          setResolvingOrder(false);
        }
      }
    };

    resolveOrderFromPaymentIntent();

    return () => {
      cancelled = true;
    };
  }, [checkoutResult, resolvedOrderData, authLoading, paymentIntentFromUrl, userId, user?.email]);

  const orderData = resolvedOrderData;

  useEffect(() => {
    if (!orderData) return;

    removeTempPendingOrder(orderData.paymentIntentId || paymentIntentFromUrl);

    // Clear only purchased cart items when available; fallback to full clear.
    const purchasedCartItemIds = (orderData.items || [])
      .map((item: any) => String(item?.cartItemId || ''))
      .filter(Boolean);

    if (purchasedCartItemIds.length > 0) {
      purchasedCartItemIds.forEach((cartItemId) => removeFromCart(cartItemId));
    } else {
      clearCart();
    }

    // Clear checkout data from localStorage
    localStorage.removeItem('beauzead_checkout_shipping');
    localStorage.removeItem('beauzead_checkout_selected_cart_ids');
  }, [orderData, clearCart, removeFromCart]);

  useEffect(() => {
    if (!checkoutResult || checkoutResult.paymentResult !== 'success') return;
    clearCart();
    localStorage.removeItem('beauzead_checkout_shipping');
    localStorage.removeItem('beauzead_checkout_selected_cart_ids');
  }, [checkoutResult, clearCart]);

  if (!checkoutResult && (authLoading || resolvingOrder)) {
    return (
      <div className="min-h-screen bg-[#eaeded] flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="max-w-[560px] w-full bg-white border border-[#ddd] rounded-lg p-8 text-center">
            <h1 className="text-2xl font-bold text-[#0f1111] mb-3">Finalizing Your Order</h1>
            <p className="text-[#555]">Your payment is confirmed. We are fetching your order details now.</p>
          </div>
        </div>
        <Footer />
        <MobileNav />
      </div>
    );
  }

  if (checkoutResult) {
    const isSuccess = checkoutResult.paymentResult === 'success';
    const displayOrderId = checkoutResult.orderId || checkoutResult.tempOrderId || tempOrderId;

    return (
      <div className="min-h-screen bg-[#f3f4f6] flex flex-col">
        <Header />
        <div className="flex-1 py-4 pb-20">
          <div className="max-w-[560px] mx-auto px-3">

            {/* Status banner */}
            <div className={`flex items-center gap-2.5 rounded-lg px-4 py-3 mb-3 ${isSuccess ? 'bg-[#f0faf0] border border-[#c6f0d8]' : 'bg-[#fff1f0] border border-[#ffd0cc]'}`}>
              {isSuccess
                ? <CheckCircle2 size={20} className="text-[#067d62] shrink-0" />
                : <XCircle size={20} className="text-[#b12704] shrink-0" />}
              <div className="min-w-0">
                <p className={`text-[13px] font-bold leading-tight ${isSuccess ? 'text-[#067d62]' : 'text-[#b12704]'}`}>
                  {isSuccess ? 'Payment Successful' : 'Payment Failed'}
                </p>
                {!isSuccess && checkoutResult.failureReason && (
                  <p className="text-[11px] text-[#b12704] mt-0.5 leading-snug">{checkoutResult.failureReason}</p>
                )}
              </div>
            </div>

            {/* Reference */}
            {(displayOrderId || checkoutResult.paymentIntentId) && (
              <div className="bg-white border border-[#e5e7eb] rounded-lg px-3 py-2.5 mb-3 space-y-0.5">
                {displayOrderId && (
                  <p className="text-[11px] text-gray-500">{isSuccess ? 'Order ID' : 'Reference'}: <span className="font-semibold text-gray-800">{displayOrderId}</span></p>
                )}
                {checkoutResult.paymentIntentId && (
                  <p className="text-[10px] text-gray-400 font-mono truncate">PI: {checkoutResult.paymentIntentId}</p>
                )}
              </div>
            )}

            {/* Items */}
            <div className="bg-white border border-[#e5e7eb] rounded-lg p-3 mb-3">
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Items</p>
              <div className="divide-y divide-gray-100">
                {(checkoutResult.items || []).map((item, index) => (
                  <div key={`${item.productId}-${index}`} className="flex gap-2.5 py-2 first:pt-0 last:pb-0">
                    <div className="w-[52px] h-[52px] rounded border border-gray-100 bg-gray-50 overflow-hidden shrink-0">
                      {item.productImage
                        ? <img src={item.productImage} alt={item.productName} className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center text-[9px] text-gray-400">No img</div>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-semibold text-[#0f1111] line-clamp-2 leading-snug">{item.productName}</p>
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {item.selectedSize && <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-px rounded">Size: {item.selectedSize}</span>}
                        {item.selectedColor && <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-px rounded">Color: {item.selectedColor}</span>}
                      </div>
                      <p className="text-[10px] text-gray-500 mt-0.5">Qty: {item.quantity} · {fmtCurrency(item.price, checkoutResult.currency)} each</p>
                    </div>
                    <p className="text-[13px] font-bold text-[#b12704] shrink-0 self-center">{fmtCurrency(item.price * item.quantity, checkoutResult.currency)}</p>
                  </div>
                ))}
              </div>
              <div className="border-t border-[#e5e7eb] mt-2 pt-2 flex justify-between items-center">
                <span className="text-[12px] font-semibold text-gray-700">Total</span>
                <span className="text-[14px] font-bold text-[#0f1111]">{fmtCurrency(checkoutResult.totalAmount, checkoutResult.currency)}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => navigate('/orders')}
                className="py-2.5 bg-[#ffd814] hover:bg-[#f7ca00] border border-[#fcd200] text-[#0f1111] rounded-lg font-bold text-[12px] transition-colors"
              >
                MY ORDERS
              </button>
              <button
                onClick={() => navigate('/cart')}
                className="py-2.5 bg-white border border-[#ddd] hover:bg-gray-50 text-[#0f1111] rounded-lg font-bold text-[12px] transition-colors"
              >
                BACK TO CART
              </button>
            </div>

          </div>
        </div>
        <Footer />
        <MobileNav />
      </div>
    );
  }

  if (!orderData) {
    return (
      <div className="min-h-screen bg-[#eaeded] flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="max-w-[560px] w-full bg-white border border-[#ddd] rounded-lg p-8 text-center">
            <h1 className="text-2xl font-bold text-[#0f1111] mb-3">Payment Received &amp; Your order is creating</h1>
            <p className="text-[#555] mb-1">Your payment is successful. We are creating your order now.</p>
            <p className="text-[#555] mb-3">Please keep this page open for a moment.</p>
            {tempOrderId && (
              <p className="text-sm text-[#0f1111] font-semibold mb-1">Your Order ID: {tempOrderId}</p>
            )}
            {paymentIntentFromUrl && (
              <p className="text-xs text-gray-500 mb-4">Payment reference: {paymentIntentFromUrl}</p>
            )}
            <div className="text-left bg-gray-50 border border-gray-200 rounded-md p-3 mb-5">
              <p className="text-xs font-semibold text-gray-700 mb-2">Contact Support</p>
              <div className="flex items-center gap-2 text-sm text-gray-700 mb-1">
                <Mail size={14} />
                <span>support@bzead.com</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <Phone size={14} />
                <span>WhatsApp: +44 7555 394997</span>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={() => navigate('/orders')}
                className="px-4 py-2.5 bg-[#ffd814] hover:bg-[#f7ca00] border border-[#fcd200] text-[#0f1111] rounded-md font-semibold text-sm"
              >
                Go To My Orders
              </button>
              <button
                onClick={() => navigate('/contact')}
                className="px-4 py-2.5 bg-white border border-[#ddd] hover:bg-gray-50 text-[#0f1111] rounded-md font-semibold text-sm"
              >
                Contact Support
              </button>
            </div>
          </div>
        </div>
        <Footer />
        <MobileNav />
      </div>
    );
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'accepted':
        return 'bg-teal-100 text-teal-700';
      case 'processing':
        return 'bg-blue-100 text-blue-700';
      case 'packed':
        return 'bg-indigo-100 text-indigo-700';
      case 'shipped':
      case 'in_transit':
        return 'bg-purple-100 text-purple-700';
      case 'out_for_delivery':
        return 'bg-orange-100 text-orange-700';
      case 'delivered':
        return 'bg-green-100 text-green-700';
      case 'cancelled':
        return 'bg-red-100 text-red-700';
      case 'return_requested':
      case 'returned':
        return 'bg-amber-100 text-amber-700';
      case 'refunded':
        return 'bg-yellow-100 text-yellow-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <div className="min-h-screen bg-[#eaeded] flex flex-col">
      <Header />
      <div className="flex-1 py-6">
      <div className="max-w-[900px] mx-auto px-4">
        {/* Progress Steps */}
        <div className="flex items-center justify-center gap-6 sm:gap-10 mb-6 text-[13px] font-medium">
          <span className="text-gray-400">Cart</span>
          <span className="text-gray-400">Shipping</span>
          <span className="text-gray-400">Review & Pay</span>
          <span className="text-[#067d62] font-bold border-b-2 border-[#067d62] pb-1">✓ Confirmed</span>
        </div>
        {/* Success Header */}
        <div className="bg-white border border-[#ddd] rounded-lg p-8 text-center mb-5">
          <div className="w-20 h-20 bg-[#f0faf0] rounded-full flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 size={40} className="text-[#067d62]" />
          </div>
          <h1 className="text-2xl font-bold text-[#0f1111] mb-2">Order Confirmed!</h1>
          <p className="text-base text-[#555] mb-5">
            Thank you for your purchase. Your order has been successfully placed.
          </p>
          <div className="inline-block bg-[#fffbf0] border-2 border-[#ff9900] rounded-lg px-6 py-3">
            <p className="text-xs text-[#555] font-medium uppercase tracking-wide">Order Number</p>
            <p className="text-xl font-bold text-[#0f1111] mt-0.5">{formatFrontend12DigitId(orderData.id)}</p>
          </div>
          <p className="text-sm text-[#555] mt-4">
            Confirmation email sent to <span className="font-semibold text-gray-700">{orderData.customerEmail}</span>
          </p>
        </div>

        {/* Order Status */}
        <div className="bg-white border border-[#ddd] rounded-lg p-6 mb-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-[#0f1111]">Order Status</h2>
            <span className={`px-4 py-2 rounded-full text-sm font-semibold ${getStatusColor(orderData.orderStatus)}`}>
              {orderData.orderStatus.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
            </span>
          </div>
          <p className="text-sm text-gray-600">
            Placed on {formatDate(orderData.createdAt)}
          </p>
          
          {/* Order Timeline */}
          <div className="mt-6 space-y-4">
            {(() => {
              const steps = [
                { key: 'pending', label: 'Order Placed', desc: 'Your order has been received and is being processed', Icon: CheckCircle2 },
                { key: 'accepted', label: 'Accepted', desc: 'Seller has accepted your order', Icon: CheckCircle2 },
                { key: 'processing', label: 'Processing', desc: 'Your order is being prepared for shipment', Icon: Package },
                { key: 'packed', label: 'Packed', desc: 'Your order has been packed and is ready to ship', Icon: Package },
                { key: 'shipped', label: 'Shipped', desc: 'Your order has been handed to the courier', Icon: Truck },
                { key: 'in_transit', label: 'In Transit', desc: 'Your order is on its way to you', Icon: Truck },
                { key: 'out_for_delivery', label: 'Out for Delivery', desc: 'Your order is arriving today', Icon: MapPin },
                { key: 'delivered', label: 'Delivered', desc: 'Your order has been delivered', Icon: CheckCircle2 },
              ];
              const progression = steps.map(s => s.key);
              const currentIdx = progression.indexOf(orderData.orderStatus);
              return steps.map((step, idx) => {
                const isActive = currentIdx >= idx;
                const StepIcon = step.Icon;
                return (
                  <div key={step.key} className="flex items-start gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                      isActive ? 'bg-green-100' : 'bg-gray-100'
                    }`}>
                      <StepIcon size={20} className={isActive ? 'text-green-600' : 'text-gray-500'} />
                    </div>
                    <div>
                      <p className={`font-semibold ${isActive ? 'text-gray-900' : 'text-gray-400'}`}>{step.label}</p>
                      <p className="text-sm text-gray-600">{step.desc}</p>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>

        {/* Order Details */}
        <div className="bg-white border border-[#ddd] rounded-lg p-6 mb-5">
          <h2 className="text-lg font-bold text-[#0f1111] mb-4">Order Details</h2>
          
          {/* Items */}
          <div className="mb-6">
            <h3 className="font-semibold text-gray-900 mb-3">Items</h3>
            <div className="space-y-3">
              {orderData.items.map((item, index) => (
                <div key={index} className="flex justify-between items-center pb-3 border-b border-gray-200 last:border-0 last:pb-0">
                  <div>
                    <p className="font-semibold text-gray-900">{item.productName}</p>
                    <p className="text-sm text-gray-600">Quantity: {item.quantity}</p>
                  </div>
                  <p className="font-bold text-gray-900">{fmtCurrency(convertPrice(item.price * item.quantity), currency)}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Shipping Address */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <MapPin size={18} className="text-blue-600" />
              <h3 className="font-semibold text-gray-900">Shipping Address</h3>
            </div>
            <div className="bg-gray-50 border border-gray-100 rounded-md p-4 space-y-1">
              {(orderData.shippingAddress as any)?.full_name && (
                <p className="text-sm font-medium text-gray-900">{(orderData.shippingAddress as any).full_name}</p>
              )}
              <p className="text-sm text-gray-600">{orderData.shippingAddress.street}</p>
              <p className="text-sm text-gray-600">
                {orderData.shippingAddress.city}, {orderData.shippingAddress.state}{' '}
                {orderData.shippingAddress.postalCode}
              </p>
              <p className="text-sm text-gray-600">{orderData.shippingAddress.country}</p>
              {(orderData.shippingAddress as any)?.phone && (
                <div className="flex items-center gap-1.5 pt-1 text-sm text-gray-600">
                  <Phone size={13} className="text-gray-400" />
                  <span>{(orderData.shippingAddress as any).phone}</span>
                </div>
              )}
            </div>
          </div>

          {/* Payment Information */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <CreditCard size={20} className="text-blue-600" />
              <h3 className="font-semibold text-gray-900">Payment Information</h3>
            </div>
            <div className="bg-gray-50 border border-gray-100 rounded-md p-4">
              <div className="flex justify-between items-center mb-2">
                <p className="text-sm text-gray-600">Payment Status</p>
                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                  {orderData.paymentStatus}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <p className="text-sm text-gray-600">Transaction ID</p>
                <p className="text-sm font-mono text-gray-700">
                  {orderData.paymentIntentId
                    ? `****${orderData.paymentIntentId.slice(-8)}`
                    : '—'}
                </p>
              </div>
            </div>
          </div>

          {/* Order Total */}
          <div className="border-t-2 border-[#ddd] pt-4">
            <div className="flex justify-between items-center text-[18px] font-bold">
              <span>Total Paid</span>
              <span className="text-[#b12704]">{fmtCurrency(convertPrice(orderData.totalAmount), currency)}</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <button
            onClick={() => navigate('/orders')}
            className="px-6 py-3 bg-[#ffd814] hover:bg-[#f7ca00] border border-[#fcd200] text-[#0f1111] rounded-lg font-bold text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <Package size={16} />
            View All Orders
          </button>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-3 bg-white border border-[#ddd] hover:bg-gray-50 text-[#0f1111] rounded-lg font-bold text-sm transition-colors cursor-pointer"
          >
            Continue Shopping
          </button>
        </div>

        {/* Help Section */}
        <div className="mt-5 bg-white border border-[#ddd] rounded-lg p-6">
          <h3 className="font-semibold text-[#0f1111] mb-2">Need Help?</h3>
          <p className="text-sm text-gray-600 mb-4">
            If you have any questions about your order, please contact our support team through the Contact page.
          </p>
          <button
            onClick={() => navigate('/contact')}
            className="text-sm font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1.5"
          >
            <Mail size={14} />
            Contact Support
          </button>
        </div>
      </div>
      </div>
      <Footer />
      <MobileNav />
    </div>
  );
};

export default OrderConfirmationPage;
