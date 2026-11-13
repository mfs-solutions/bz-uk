import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { CheckCircle2, Package, MapPin, CreditCard, Phone, Mail, Truck, XCircle, Clock3 } from 'lucide-react';
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
  paymentMethod?: string;
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

const PAID_PAYMENT_STATUSES = new Set(['paid', 'completed', 'succeeded']);
const isPaidPaymentStatus = (status: string) => PAID_PAYMENT_STATUSES.has(status.trim().toLowerCase());
const isCodPayment = (paymentStatus: string, paymentMethod?: string) => {
  const method = paymentMethod?.trim().toLowerCase() || '';
  return paymentStatus.trim().toLowerCase() === 'cod'
    || method === 'cod'
    || method.includes('cash_on_delivery')
    || method.includes('cash on delivery');
};

const OrderConfirmationPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = (location.state || {}) as ConfirmationLocationState;
  const { clearCart, removeFromCart } = useCart();
  const { currency, convertPrice } = useCurrency();
  const { user, currentAuthUser, loading: authLoading } = useAuth();
  const [resolvedOrderData, setResolvedOrderData] = useState<OrderData | undefined>();
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

  const requestedOrderId = locationState.orderData?.id || checkoutResult?.orderId || '';
  const requestedPaymentIntentId = paymentIntentFromUrl
    || checkoutResult?.paymentIntentId
    || locationState.orderData?.paymentIntentId
    || '';

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;

    const resolveOrder = async () => {
      setResolvedOrderData(undefined);
      setResolvingOrder(true);

      try {
        if (!userId || (!requestedOrderId && !requestedPaymentIntentId)) return;
        for (let attempt = 0; attempt < 10; attempt += 1) {
          if (cancelled) return;
          let query = supabase.from('orders')
            .select('id, user_id, total_amount, status, payment_status, payment_method, payment_intent_id, shipping_address, billing_address, created_at, updated_at, order_items(*)')
            .eq('user_id', userId);
          if (requestedOrderId) query = query.eq('id', requestedOrderId);
          if (requestedPaymentIntentId) query = query.eq('payment_intent_id', requestedPaymentIntentId);
          query = query.limit(1);
          const { data, error } = await query.maybeSingle();
          if (error) {
            throw error;
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
              paymentMethod: String(data.payment_method || ''),
              paymentIntentId: String(data.payment_intent_id || ''),
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
            if (
              isPaidPaymentStatus(mapped.paymentStatus)
              || isCodPayment(mapped.paymentStatus, mapped.paymentMethod)
              || mapped.paymentStatus.trim().toLowerCase() === 'failed'
            ) return;
            if (!cancelled) setResolvingOrder(false);
          }

          if (attempt === 9) break;
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }
      } catch (error) {
        console.error('[OrderConfirmation] Could not verify the order status:', error);
      } finally {
        if (!cancelled) {
          setResolvingOrder(false);
        }
      }
    };

    void resolveOrder();

    return () => {
      cancelled = true;
    };
  }, [authLoading, requestedOrderId, requestedPaymentIntentId, userId, user?.email]);

  const orderData = resolvedOrderData;
  const isPaid = orderData ? isPaidPaymentStatus(orderData.paymentStatus) : false;
  const isCod = orderData ? isCodPayment(orderData.paymentStatus, orderData.paymentMethod) : false;
  const isPaymentFailed = orderData?.paymentStatus.trim().toLowerCase() === 'failed';

  useEffect(() => {
    if (!orderData) return;

    if (!isPaid && !isCod) return;

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
  }, [orderData, clearCart, removeFromCart, isPaid, isCod]);

  if (authLoading || resolvingOrder) {
    return (
      <div className="min-h-screen bg-[#eaeded] flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="max-w-[560px] w-full bg-white border border-[#ddd] rounded-lg p-8 text-center">
            <h1 className="text-2xl font-bold text-[#0f1111] mb-3">Verifying Your Payment</h1>
            <p className="text-[#555]">Please wait while we securely confirm your payment and order.</p>
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
            <h1 className="text-2xl font-bold text-[#0f1111] mb-3">We’re confirming your payment</h1>
            <p className="text-[#555] mb-1">We don’t have a confirmed order status yet. Your payment may still be processing.</p>
            <p className="text-[#555] mb-3">Please don’t try to pay again while we check the status.</p>
            {requestedPaymentIntentId && (
              <p className="text-xs text-gray-500 mb-4">Payment reference: {requestedPaymentIntentId}</p>
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

  const confirmationTitle = isPaid
    ? 'Order Confirmed!'
    : isPaymentFailed
      ? 'Payment Unsuccessful'
      : isCod
        ? 'Order Placed!'
        : 'Payment Processing';
  const confirmationDescription = isPaid
    ? 'Thank you for your purchase. Your payment has been confirmed and your order is being processed.'
    : isPaymentFailed
      ? 'The payment provider confirmed that this payment did not complete. You can return to checkout when ready.'
      : isCod
        ? 'Your order has been placed. Payment is due when your order is delivered.'
        : 'Your payment is being verified. Please do not try to pay again while we confirm its status.';

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
          <span className={`font-bold border-b-2 pb-1 ${
            isPaymentFailed ? 'text-red-700 border-red-700' : isPaid || isCod ? 'text-[#067d62] border-[#067d62]' : 'text-blue-700 border-blue-700'
          }`}>
            {isPaymentFailed ? 'Payment not completed' : isPaid || isCod ? '✓ Confirmed' : 'Payment processing'}
          </span>
        </div>
        {/* Payment and order status */}
        <div className="bg-white border border-[#ddd] rounded-lg p-8 text-center mb-5">
          <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5 ${
            isPaid || isCod ? 'bg-[#f0faf0]' : isPaymentFailed ? 'bg-red-50' : 'bg-blue-50'
          }`}>
            {isPaid || isCod
              ? <CheckCircle2 size={40} className="text-[#067d62]" />
              : isPaymentFailed
                ? <XCircle size={40} className="text-red-600" />
                : <Clock3 size={40} className="text-blue-600" />}
          </div>
          <h1 className="text-2xl font-bold text-[#0f1111] mb-2">{confirmationTitle}</h1>
          <p className="text-base text-[#555] mb-5">
            {confirmationDescription}
          </p>
          <div className="inline-block bg-[#fffbf0] border-2 border-[#ff9900] rounded-lg px-6 py-3">
            <p className="text-xs text-[#555] font-medium uppercase tracking-wide">Order Number</p>
            <p className="text-xl font-bold text-[#0f1111] mt-0.5">{formatFrontend12DigitId(orderData.id)}</p>
          </div>
          {(isPaid || isCod) && <p className="text-sm text-[#555] mt-4">
            Confirmation email sent to <span className="font-semibold text-gray-700">{orderData.customerEmail}</span>
          </p>}
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
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                  isPaid ? 'bg-green-100 text-green-700' : isPaymentFailed ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                }`}>
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
              <span>{isPaid ? 'Total Paid' : 'Order Total'}</span>
              <span className="text-[#b12704]">{fmtCurrency(convertPrice(orderData.totalAmount), currency)}</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {isPaymentFailed && (
            <button
              onClick={() => navigate('/checkout/review')}
              className="px-6 py-3 bg-[#ffd814] hover:bg-[#f7ca00] border border-[#fcd200] text-[#0f1111] rounded-lg font-bold text-sm transition-colors"
            >
              Return to Checkout
            </button>
          )}
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
