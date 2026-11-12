import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleAlert,
  Circle,
  CircleX,
  Clock3,
  RotateCcw,
  ShieldCheck,
  ShoppingBag,
} from 'lucide-react';
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
  const [storedSessionId] = useState(() => {
    try {
      return localStorage.getItem(PENDING_UK_CHECKOUT_KEY) || '';
    } catch (error) {
      console.warn('[UkHostedCheckoutReturn] Could not read pending checkout session:', error);
      return '';
    }
  });
  const sessionId = sessionIdFromUrl || (cancelReturn ? storedSessionId : '');

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
    if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId)) {
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
            body: { sessionId, action },
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
            try {
              if (localStorage.getItem(PENDING_UK_CHECKOUT_KEY) === sessionId) {
                localStorage.removeItem(PENDING_UK_CHECKOUT_KEY);
              }
            } catch (storageError) {
              console.warn('[UkHostedCheckoutReturn] Could not clear pending checkout session:', storageError);
            }
            void syncCartWithBackend(userId).catch((cartError: unknown) => {
              console.error('[UkHostedCheckoutReturn] Confirmed order cart sync failed:', cartError);
            });
            return;
          }
          if (nextPayment.status === 'failed' || nextPayment.status === 'cancelled') {
            setPayment(nextPayment);
            try {
              if (localStorage.getItem(PENDING_UK_CHECKOUT_KEY) === sessionId) {
                localStorage.removeItem(PENDING_UK_CHECKOUT_KEY);
              }
            } catch (storageError) {
              console.warn('[UkHostedCheckoutReturn] Could not clear pending checkout session:', storageError);
            }
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
  }, [attempt, cancelReturn, loading, sessionId, syncCartWithBackend, userId]);

  const isVerifying = payment.status === 'verifying' || loading;
  const title = isVerifying
    ? 'Verifying Your Payment'
    : payment.status === 'success'
      ? 'Payment Successful!'
      : payment.status === 'processing'
        ? 'Payment Processing'
        : payment.status === 'failed'
          ? 'Payment Unsuccessful'
          : payment.status === 'cancelled'
            ? 'Payment Cancelled'
            : payment.status === 'authentication-required'
              ? 'Sign in to check your payment'
              : 'We’re still confirming your payment';

  const description = isVerifying
    ? 'Please wait while we securely confirm your payment.'
    : payment.status === 'success'
      ? 'Thank you for your purchase! Your payment has been successfully processed.'
      : payment.status === 'processing'
        ? 'Your payment is being verified. Please wait while we confirm your order. Do not retry payment yet.'
        : payment.status === 'failed'
          ? 'We couldn’t complete your payment. You can try again or return to your cart.'
          : payment.status === 'cancelled'
            ? 'Your payment was not completed. You can return to checkout whenever you’re ready.'
            : payment.status === 'authentication-required'
              ? 'Sign in to the account used for this checkout to securely check its status.'
              : 'We couldn’t confirm the payment status yet. Your payment may still be processing, so please check again before trying to pay.';

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
                ? /^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId)
                  ? { label: 'Retry Verification', to: null, icon: RotateCcw }
                  : { label: 'Return to Checkout', to: '/checkout/review', icon: ArrowRight }
              : null;

  const secondaryAction = payment.status === 'success'
    ? { label: 'Continue Shopping', to: '/', icon: ShoppingBag }
    : payment.status === 'failed'
      ? { label: 'Return to Cart', to: '/cart', icon: ShoppingBag }
      : payment.status === 'cancelled'
        ? { label: 'Continue Shopping', to: '/', icon: ShoppingBag }
        : payment.status === 'processing' || payment.status === 'verification-error'
          ? { label: 'Continue Shopping', to: '/', icon: ShoppingBag }
          : null;

  return (
    <main className="payment-return-page">
      <div className="payment-return-brand" aria-label="BZEAD">
        BZ<span>E</span>AD
      </div>
      <section
        className={`payment-result-card payment-result-card--${isVerifying ? 'verifying' : payment.status}`}
        aria-live="polite"
        aria-busy={isVerifying}
      >
        <div className={`payment-result-art payment-result-art--${isVerifying ? 'verifying' : payment.status}`} aria-hidden="true">
          {isVerifying ? (
            <div className="payment-verification-orbit">
              <span className="payment-orbit-dot payment-orbit-dot--one" />
              <span className="payment-orbit-dot payment-orbit-dot--two" />
              <span className="payment-orbit-dot payment-orbit-dot--three" />
              <div className="payment-art-core"><ShieldCheck size={42} strokeWidth={1.7} /></div>
              <span className="payment-progress-ring" />
            </div>
          ) : payment.status === 'success' ? (
            <div className="payment-success-mark"><Circle size={86} strokeWidth={1.35} /><Check className="payment-success-check" size={38} strokeWidth={2.8} /></div>
          ) : payment.status === 'failed' ? (
            <CircleX size={86} strokeWidth={1.4} />
          ) : payment.status === 'cancelled' ? (
            <ArrowLeft size={76} strokeWidth={1.5} />
          ) : payment.status === 'processing' ? (
            <div className="payment-processing-mark"><Clock3 size={76} strokeWidth={1.4} /><span /></div>
          ) : (
            <CircleAlert size={82} strokeWidth={1.4} />
          )}
        </div>

        <div className="payment-result-copy">
          <p className="payment-result-eyebrow">
            {isVerifying ? 'SECURE CHECKOUT' : payment.status === 'success' ? 'ORDER CONFIRMED' : 'PAYMENT STATUS'}
          </p>
          <h1>{title}</h1>
          <p className="payment-result-description">{description}</p>
          {isVerifying && (
            <>
              <p className="payment-result-secondary">This usually takes just a few seconds.</p>
              <p className="payment-verification-message">
                {VERIFYING_MESSAGES[messageIndex]}
                <span className="payment-loading-dots" aria-hidden="true"><i /><i /><i /></span>
              </p>
            </>
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
        </div>
      </section>
      <p className="payment-return-security"><ShieldCheck size={15} />Your payment status is verified securely</p>
    </main>
  );
};

export default UkHostedCheckoutReturn;
