import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OrderConfirmationPage from '../pages/user/OrderConfirmation';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  orderResult: null as { data: Record<string, unknown> | null; error: { message: string } | null } | null,
  clearCart: vi.fn(),
  removeFromCart: vi.fn(),
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'buyer-1', email: 'buyer@example.com' }, currentAuthUser: null, loading: false }),
}));

vi.mock('../contexts/CartContext', () => ({
  useCart: () => ({ clearCart: mocks.clearCart, removeFromCart: mocks.removeFromCart }),
}));

vi.mock('../contexts/CurrencyContext', () => ({
  useCurrency: () => ({ currency: 'GBP', convertPrice: (amount: number) => amount }),
}));

vi.mock('../components/layout/Header', () => ({ Header: () => null }));
vi.mock('../components/layout/Footer', () => ({ Footer: () => null }));
vi.mock('../components/layout/MobileNav', () => ({ MobileNav: () => null }));
vi.mock('../lib/supabase', () => ({ supabase: { from: mocks.from } }));

function renderConfirmation(state: Record<string, unknown>) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/checkout/confirmation', state }]}>
      <OrderConfirmationPage />
    </MemoryRouter>,
  );
}

describe('legacy order confirmation verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.orderResult = null;
    mocks.from.mockImplementation(() => {
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        limit: vi.fn(() => query),
        maybeSingle: vi.fn(async () => mocks.orderResult),
      };
      return query;
    });
  });

  it('does not trust browser navigation state to claim a payment succeeded', async () => {
    mocks.orderResult = { data: null, error: { message: 'Unavailable' } };

    renderConfirmation({
      checkoutResult: {
        paymentResult: 'success',
        paymentIntentId: 'pi_unverified',
        items: [],
        totalAmount: 25,
        currency: 'GBP',
      },
    });

    expect(await screen.findByRole('heading', { name: 'We’re confirming your payment' })).toBeInTheDocument();
    expect(screen.queryByText('Payment Successful')).not.toBeInTheDocument();
    expect(screen.queryByText('Total Paid')).not.toBeInTheDocument();
  });

  it('shows a successful confirmation only when the owned database order is paid', async () => {
    mocks.orderResult = {
      data: {
        id: 'order-1',
        user_id: 'buyer-1',
        total_amount: 25,
        status: 'processing',
        payment_status: 'completed',
        payment_method: 'card',
        payment_intent_id: 'pi_paid',
        shipping_address: {},
        billing_address: {},
        created_at: '2026-11-12T00:00:00.000Z',
        updated_at: '2026-11-12T00:00:00.000Z',
        order_items: [],
      },
      error: null,
    };

    renderConfirmation({
      checkoutResult: {
        paymentResult: 'success',
        paymentIntentId: 'pi_paid',
        orderId: 'order-1',
        items: [],
        totalAmount: 25,
        currency: 'GBP',
      },
    });

    expect(await screen.findByRole('heading', { name: 'Order Confirmed!' })).toBeInTheDocument();
    expect(screen.getByText('Total Paid')).toBeInTheDocument();
    await waitFor(() => expect(mocks.from).toHaveBeenCalledWith('orders'));
    expect(mocks.clearCart).toHaveBeenCalled();
  });

  it('keeps processing orders out of the success state and preserves the cart', async () => {
    mocks.orderResult = {
      data: {
        id: 'order-pending',
        user_id: 'buyer-1',
        total_amount: 25,
        status: 'pending',
        payment_status: 'pending',
        payment_method: 'card',
        payment_intent_id: 'pi_processing',
        shipping_address: {},
        billing_address: {},
        created_at: '2026-11-12T00:00:00.000Z',
        updated_at: '2026-11-12T00:00:00.000Z',
        order_items: [],
      },
      error: null,
    };

    renderConfirmation({
      checkoutResult: {
        paymentResult: 'success',
        paymentIntentId: 'pi_processing',
        items: [],
        totalAmount: 25,
        currency: 'GBP',
      },
    });

    expect(await screen.findByRole('heading', { name: 'Payment Processing' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Order Confirmed!' })).not.toBeInTheDocument();
    expect(mocks.clearCart).not.toHaveBeenCalled();
  });

  it('scopes every payment reference lookup to the authenticated customer', async () => {
    mocks.orderResult = { data: null, error: { message: 'Unavailable' } };

    renderConfirmation({
      checkoutResult: {
        paymentResult: 'success',
        paymentIntentId: 'pi_other_buyer',
        items: [],
        totalAmount: 25,
        currency: 'GBP',
      },
    });

    await screen.findByRole('heading', { name: 'We’re confirming your payment' });
    const query = mocks.from.mock.results[0].value;
    expect(query.eq).toHaveBeenCalledWith('user_id', 'buyer-1');
    expect(query.eq).toHaveBeenCalledWith('payment_intent_id', 'pi_other_buyer');
  });
});
