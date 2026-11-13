import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  ArrowRight,
  Check,
  CircleAlert,
  Circle,
  CircleX,
  Clock3,
  Loader2,
  Lock,
  RotateCcw,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Header } from '../../components/layout/Header';
import { useAuth } from '../../contexts/AuthContext';
import { useCart } from '../../contexts/CartContext';
import { supabase } from '../../lib/supabase';

type PaymentState =
  | { status: 'verifying' }
  | { status: 'processing'; orderNumber?: string }
  | { status: 'success'; orderId: string; orderNumber: string; amount: number; currency: string }
  | { status: 'failed' }
  | { status: 'cancelled' }
  | { status: 'verification-error' }
  | { status: 'authentication-required' };

const PENDING_UK_CHECKOUT_KEY = 'beauzead_uk_pending_checkout_session';
const PENDING_UK_CHECKOUT_SNAPSHOT_KEY = 'beauzead_uk_pending_checkout_snapshot';
const MAX_AUTOMATIC_CHECKS = 8;
const CHECK_INTERVAL_MS = 1800;
const MAX_AUTOMATIC_VERIFY_DURATION_MS = 25_000;
const REQUEST_TIMEOUT_MS = 8000;
const VERIFYING_MESSAGES = [
  'Connecting securely to Stripe...',
  'Verifying your transaction...',
  'Confirming your order...',
  'Almost there...',
];
const isValidSessionId = (value: string) => /^cs_(test|live)_[A-Za-z0-9]+$/.test(value);
const isValidSnapshotId = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

function clearPendingCheckoutContext(sessionId: string, snapshotId: string) {
  try {
    if (localStorage.getItem(PENDING_UK_CHECKOUT_KEY) === sessionId) {
      localStorage.removeItem(PENDING_UK_CHECKOUT_KEY);
    }
    if (localStorage.getItem(PENDING_UK_CHECKOUT_SNAPSHOT_KEY) === snapshotId) {
      localStorage.removeItem(PENDING_UK_CHECKOUT_SNAPSHOT_KEY);
      localStorage.removeItem(PENDING_UK_CHECKOUT_KEY);
    }
  } catch (error) {
    console.warn('[UkHostedCheckoutReturn] Could not clear pending checkout context:', error);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getPaymentState(data: unknown): PaymentState {
  if (!isRecord(data) || typeof data.status !== 'string') {
    throw new Error('Invalid payment verification response');
  }
  if (data.status === 'processing') {
    return {
      status: 'processing',
      ...(typeof data.orderNumber === 'string' ? { orderNumber: data.orderNumber } : {}),
    };
  }
  if (data.status === 'failed' || data.status === 'cancelled') return { status: data.status };
  if (
    data.status === 'success'
    && typeof data.orderId === 'string'
    && data.orderId.length > 0
    && typeof data.orderNumber === 'string'
    && data.orderNumber.length > 0
    && typeof data.amount === 'number'
    && Number.isFinite(data.amount)
    && typeof data.currency === 'string'
    && /^[A-Z]{3}$/.test(data.currency)
  ) {
    return {
      status: 'success',
      orderId: data.orderId,
      orderNumber: data.orderNumber,
      amount: data.amount,
      currency: data.currency,
    };
  }
  throw new Error('Invalid payment verification response');
}

const UkHostedCheckoutReturn: React.FC = () => {
  const location = useLocation();
  const { search, pathname } = location;
  const { user, currentAuthUser, loading } = useAuth();
  const { syncCartWithBackend } = useCart();
  const [attempt, setAttempt] = useState(0);
  const [payment, setPayment] = useState<PaymentState>({ status: 'verifying' });
  const [messageIndex, setMessageIndex] = useState(0);
  const userId = user?.id || currentAuthUser?.userId;
  const searchParams = new URLSearchParams(search);
  const cancelReturn = searchParams.get('action') === 'cancel';
  const sessionIdFromUrl = searchParams.get('session_id') || '';
  const snapshotIdFromUrl = searchParams.get('checkout_id') || '';
  const [storedSessionId] = useState(() => {
    try {
      return localStorage.getItem(PENDING_UK_CHECKOUT_KEY) || '';
    } catch (error) {
      console.warn('[UkHostedCheckoutReturn] Could not read pending checkout session:', error);
      return '';
    }
  });
  const [storedSnapshotId] = useState(() => {
    try {
      return localStorage.getItem(PENDING_UK_CHECKOUT_SNAPSHOT_KEY) || '';
    } catch (error) {
      console.warn('[UkHostedCheckoutReturn] Could not read pending checkout reference:', error);
      return '';
    }
  });
  const snapshotId = snapshotIdFromUrl || (cancelReturn ? storedSnapshotId : '');
  const storedSessionMatchesSnapshot = !snapshotIdFromUrl || storedSnapshotId === snapshotIdFromUrl;
  const sessionId = sessionIdFromUrl
    || (cancelReturn && storedSessionMatchesSnapshot ? storedSessionId : '');

  useEffect(() => {
    if (payment.status !== 'verifying') return;
    const timer = window.setInterval(() => {
      setMessageIndex((index) => (index + 1) % VERIFYING_MESSAGES.length);
    }, 2200);
    return () => window.clearInterval(timer);
  }, [payment.status]);

  useEffect(() => {
    if (loading) return;
    if (!userId) {
      setPayment({ status: 'authentication-required' });
      return;
    }
    if (!isValidSessionId(sessionId) && !isValidSnapshotId(snapshotId)) {
      setPayment({ status: 'verification-error' });
      return;
    }

    let cancelled = false;
    let timer: number | undefined;
    let requestTimer: number | undefined;
    let encounteredVerificationError = false;
    const deadline = Date.now() + MAX_AUTOMATIC_VERIFY_DURATION_MS;
    setPayment({ status: 'verifying' });

    const verify = async () => {
      for (let check = 0; check < MAX_AUTOMATIC_CHECKS; check += 1) {
        if (cancelled) return;
        if (check > 0) {
          if (Date.now() >= deadline) break;
          await new Promise<void>((resolve) => {
            timer = window.setTimeout(resolve, Math.min(CHECK_INTERVAL_MS, deadline - Date.now()));
          });
          if (cancelled) return;
        }

        try {
          const action = cancelReturn && check === 0 ? 'cancel' : 'verify';
          const request = supabase.functions.invoke('verify-uk-hosted-checkout', {
            body: {
              action,
              ...(isValidSessionId(sessionId) ? { sessionId } : { snapshotId }),
            },
          });
          const { data, error } = await Promise.race([
            request,
            new Promise<never>((_, reject) => {
              const timeout = Math.min(REQUEST_TIMEOUT_MS, Math.max(1, deadline - Date.now()));
              requestTimer = window.setTimeout(() => reject(new Error('Payment status check timed out')), timeout);
            }),
          ]);
          if (requestTimer !== undefined) window.clearTimeout(requestTimer);
          requestTimer = undefined;
          if (error) {
            encounteredVerificationError = true;
            console.warn('[UkHostedCheckoutReturn] Payment status check failed:', error);
            continue;
          }

          const nextPayment = getPaymentState(data);
          if (cancelled) return;
          if (nextPayment.status === 'success') {
            setPayment(nextPayment);
            clearPendingCheckoutContext(sessionId, snapshotId);
            void syncCartWithBackend(userId).catch((cartError: unknown) => {
              console.error('[UkHostedCheckoutReturn] Confirmed order cart sync failed:', cartError);
            });
            return;
          }
          if (nextPayment.status === 'failed' || nextPayment.status === 'cancelled') {
            setPayment(nextPayment);
            clearPendingCheckoutContext(sessionId, snapshotId);
            return;
          }
          setPayment(nextPayment);
        } catch (error) {
          if (requestTimer !== undefined) window.clearTimeout(requestTimer);
          requestTimer = undefined;
          encounteredVerificationError = true;
          console.error('[UkHostedCheckoutReturn] Payment verification response was invalid:', error);
          if (Date.now() >= deadline) break;
        }
      }

      if (!cancelled) {
        setPayment({ status: encounteredVerificationError ? 'verification-error' : 'processing' });
      }
    };

    void verify();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
      if (requestTimer !== undefined) window.clearTimeout(requestTimer);
    };
  }, [attempt, cancelReturn, loading, sessionId, snapshotId, syncCartWithBackend, userId]);

  const isVerifying = payment.status === 'verifying' || loading;
  const title = isVerifying
    ? 'Verifying your payment'
    : payment.status === 'success'
      ? 'Payment Successful!'
      : payment.status === 'processing'
        ? 'Payment Processing'
        : payment.status === 'failed'
          ? 'Payment Unsuccessful'
          : payment.status === 'cancelled'
            ? 'You cancelled the payment'
            : payment.status === 'authentication-required'
              ? 'Sign in to check your payment'
              : 'We’re still confirming your payment';

  const description = isVerifying
    ? 'Please wait while we securely confirm your payment with Stripe. This usually takes a few seconds.'
    : payment.status === 'success'
      ? 'Thank you for your purchase! Your payment has been successfully processed.'
      : payment.status === 'processing'
        ? 'Your payment is being verified. Please wait while we confirm your order. Do not retry payment yet.'
        : payment.status === 'failed'
          ? 'We couldn’t complete your payment. You can try again or return to your cart.'
          : payment.status === 'cancelled'
            ? 'No money has been taken from your account and your order was not placed. Your items are still saved in your cart.'
            : payment.status === 'authentication-required'
              ? 'Sign in to the account used for this checkout to securely check its status.'
              : 'We couldn’t confirm the payment status yet. Your payment may still be processing, so please check again before trying to pay.';

  const hasReference = isValidSessionId(sessionId) || isValidSnapshotId(snapshotId);
  const primaryAction = payment.status === 'success'
    ? { label: 'View Order', to: `/orders/${encodeURIComponent(payment.orderId)}`, icon: ArrowRight }
    : payment.status === 'failed'
      ? { label: 'Retry Payment', to: '/checkout/review', icon: RotateCcw }
      : payment.status === 'cancelled'
        ? { label: 'Return to Checkout', to: '/checkout/review', icon: ArrowRight }
        : payment.status === 'authentication-required'
          ? { label: 'Sign In', to: '/login', icon: ArrowRight }
          : payment.status === 'processing'
            ? { label: 'Check Again', to: null, icon: RotateCcw }
            : payment.status === 'verification-error'
              ? hasReference
                ? { label: 'Retry Verification', to: null, icon: RotateCcw }
                : { label: 'Return to Checkout', to: '/checkout/review', icon: ArrowRight }
              : null;

  const secondaryAction = payment.status === 'success'
    ? { label: 'Continue Shopping', to: '/', icon: ShoppingBag }
    : payment.status === 'failed' || payment.status === 'cancelled'
      ? { label: 'Back to Cart', to: '/cart', icon: ShoppingCart }
      : payment.status === 'processing' || payment.status === 'verification-error'
        ? { label: 'View My Orders', to: '/orders', icon: ShoppingBag }
        : null;

  type Row = { icon: LucideIcon; text: string; tone?: 'done' | 'active' | 'idle' };
  const rows: Row[] = isVerifying
    ? [
        { icon: Loader2, text: 'Checking your payment with Stripe', tone: 'active' },
        { icon: Circle, text: 'Confirming your order', tone: 'idle' },
        { icon: Circle, text: 'Preparing your confirmation', tone: 'idle' },
      ]
    : payment.status === 'success'
      ? [
          { icon: Check, text: 'Payment received', tone: 'done' },
          { icon: Check, text: 'Order confirmed', tone: 'done' },
          { icon: Check, text: 'Confirmation is ready', tone: 'done' },
        ]
      : payment.status === 'cancelled'
        ? [
            { icon: Check, text: 'No charge made', tone: 'done' },
            { icon: ShoppingCart, text: 'Items are safe in your cart' },
            { icon: Lock, text: 'Your details are secure' },
          ]
        : payment.status === 'failed'
          ? [
              { icon: ShoppingCart, text: 'Your items are still in your cart' },
              { icon: RotateCcw, text: 'You can try again or use another card' },
              { icon: Lock, text: 'Your details are secure' },
            ]
          : payment.status === 'processing'
            ? [
                { icon: Clock3, text: 'Your payment is still being confirmed' },
                { icon: ShieldCheck, text: 'Please do not pay again yet' },
                { icon: ShoppingBag, text: 'Your order will appear in My Orders' },
              ]
            : payment.status === 'authentication-required'
              ? [
                  { icon: Lock, text: 'Your payment is not affected' },
                  { icon: ShieldCheck, text: 'Sign in with the same account' },
                ]
              : [
                  { icon: ShieldCheck, text: 'Please do not pay again yet' },
                  { icon: ShoppingBag, text: 'Confirmed orders appear in My Orders' },
                  { icon: Lock, text: 'Your details are secure' },
                ];

  const eyebrow = isVerifying
    ? 'SECURE CHECKOUT'
    : payment.status === 'success'
      ? 'ORDER CONFIRMED'
      : payment.status === 'cancelled'
        ? 'PAYMENT CANCELLED'
        : payment.status === 'failed'
          ? 'PAYMENT UNSUCCESSFUL'
          : 'PAYMENT STATUS';
  const state = isVerifying ? 'verifying' : payment.status;

  return (
    <div className="payment-return-shell">
      <Header />
      <main className="payment-return-page">
        <section className="payment-result-card" aria-live="polite" aria-busy={isVerifying}>
          <div className={`payment-result-art payment-result-art--${state}`} aria-hidden="true">
            {isVerifying ? (
              <div className="payment-verification-orbit">
                <div className="payment-art-core"><ShieldCheck size={38} strokeWidth={1.8} /></div>
                <span className="payment-progress-ring" />
              </div>
            ) : payment.status === 'success' ? (
              <div className="payment-art-core payment-art-core--tone"><Check size={40} strokeWidth={2.6} /></div>
            ) : payment.status === 'failed' ? (
              <div className="payment-art-core payment-art-core--tone"><CircleX size={44} strokeWidth={1.8} /></div>
            ) : payment.status === 'cancelled' ? (
              <div className="payment-art-core payment-art-core--tone"><X size={42} strokeWidth={2} /></div>
            ) : payment.status === 'processing' ? (
              <div className="payment-art-core payment-art-core--tone"><Clock3 size={40} strokeWidth={1.8} /></div>
            ) : (
              <div className="payment-art-core payment-art-core--tone"><CircleAlert size={42} strokeWidth={1.8} /></div>
            )}
          </div>

          <div className="payment-result-copy">
            <p className="payment-result-eyebrow">{eyebrow}</p>
            <h1>{title}</h1>
            <p className="payment-result-description">{description}</p>
            {isVerifying && (
              <p className="payment-verification-message">
                {VERIFYING_MESSAGES[messageIndex]}
                <span className="payment-loading-dots" aria-hidden="true"><i /><i /><i /></span>
              </p>
            )}
          </div>

          {payment.status === 'success' && (
            <div className="payment-order-summary" aria-label="Confirmed order payment details">
              <div><span>Order reference</span><strong>{payment.orderNumber}</strong></div>
              <div><span>Amount paid</span><strong>{new Intl.NumberFormat(undefined, {
                style: 'currency',
                currency: payment.currency,
              }).format(payment.amount)}</strong></div>
            </div>
          )}
          {payment.status === 'processing' && payment.orderNumber && (
            <div className="payment-order-reference">
              Order reference <strong>{payment.orderNumber}</strong>
            </div>
          )}

          <ul className="payment-info-card">
            {rows.map(({ icon: RowIcon, text, tone }) => (
              <li key={text} className={tone ? `payment-info-row--${tone}` : undefined}>
                <RowIcon size={20} strokeWidth={2} className={tone === 'active' ? 'payment-spin' : undefined} />
                <span>{text}</span>
              </li>
            ))}
          </ul>

          {!isVerifying && payment.status === 'processing' && (
            <p className="payment-result-note">Please don&apos;t close or pay again while we confirm.</p>
          )}

          <div className="payment-result-actions">
            {primaryAction && (primaryAction.to ? (
              <Link
                className="payment-primary-button"
                to={primaryAction.to}
                state={primaryAction.to === '/login' ? { from: `${pathname}${search}` } : undefined}
              >
                {primaryAction.label}<primaryAction.icon size={18} />
              </Link>
            ) : (
              <button
                type="button"
                className="payment-primary-button"
                onClick={() => {
                  setPayment({ status: 'verifying' });
                  setAttempt((value) => value + 1);
                }}
              >
                {primaryAction.label}<primaryAction.icon size={18} />
              </button>
            ))}
            {secondaryAction && (
              <Link className="payment-secondary-button" to={secondaryAction.to}>
                <secondaryAction.icon size={17} />{secondaryAction.label}
              </Link>
            )}
            {!isVerifying && payment.status !== 'success' && (
              <Link className="payment-support-link" to="/contact">Need help? Contact support</Link>
            )}
          </div>
        </section>
        <p className="payment-return-security"><Lock size={14} />Secured by Stripe · Your payment status is verified securely</p>
      </main>
    </div>
  );
};

export default UkHostedCheckoutReturn;
