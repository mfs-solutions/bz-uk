import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import UkHostedCheckoutReturn from '../pages/user/UkHostedCheckoutReturn';

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  syncCartWithBackend: vi.fn(),
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'buyer-1' }, currentAuthUser: null, loading: false }),
}));

vi.mock('../contexts/CartContext', () => ({
  useCart: () => ({ syncCartWithBackend: mocks.syncCartWithBackend }),
}));

vi.mock('../lib/supabase', () => ({
  supabase: { functions: { invoke: mocks.invoke } },
}));

describe('UK hosted checkout return experience', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mocks.syncCartWithBackend.mockResolvedValue(undefined);
  });

  it('shows success and the verified order reference and amount', async () => {
    mocks.invoke.mockResolvedValue({
      data: {
        status: 'success',
        orderId: 'order-123',
        orderNumber: 'BZ-2042',
        amount: 24.5,
        currency: 'GBP',
      },
      error: null,
    });

    render(
      <MemoryRouter initialEntries={['/checkout/uk-payment-return?session_id=cs_live_valid123']}>
        <UkHostedCheckoutReturn />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Payment Successful!' })).toBeInTheDocument();
    expect(screen.getByText('BZ-2042')).toBeInTheDocument();
    expect(screen.getByText('£24.50')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View Order' })).toHaveAttribute('href', '/orders/order-123');
    await waitFor(() => expect(mocks.syncCartWithBackend).toHaveBeenCalledWith('buyer-1'));
  });

  it('does not show success from the Stripe return URL until the backend reports a confirmed order', async () => {
    mocks.invoke.mockResolvedValue({ data: { status: 'processing' }, error: null });

    render(
      <MemoryRouter initialEntries={['/checkout/uk-payment-return?session_id=cs_live_valid123']}>
        <UkHostedCheckoutReturn />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Payment Processing' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Payment Successful!' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Retry Payment' })).not.toBeInTheDocument();
  });

  it('offers retry only after the backend confirms a terminal payment failure', async () => {
    mocks.invoke.mockResolvedValue({ data: { status: 'failed' }, error: null });

    render(
      <MemoryRouter initialEntries={['/checkout/uk-payment-return?session_id=cs_live_valid123']}>
        <UkHostedCheckoutReturn />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Payment Unsuccessful' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Retry Payment' })).toHaveAttribute('href', '/checkout/review');
    expect(screen.getByRole('link', { name: 'Return to Cart' })).toHaveAttribute('href', '/cart');
  });

  it('verifies a cancellation return before showing the cancelled state', async () => {
    localStorage.setItem('beauzead_uk_pending_checkout_session', 'cs_live_cancelled123');
    mocks.invoke.mockResolvedValue({ data: { status: 'cancelled' }, error: null });

    render(
      <MemoryRouter initialEntries={['/checkout/uk-payment-return?action=cancel']}>
        <UkHostedCheckoutReturn />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Payment Cancelled' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Return to Checkout' })).toHaveAttribute('href', '/checkout/review');
    expect(mocks.invoke).toHaveBeenCalledWith('verify-uk-hosted-checkout', {
      body: { sessionId: 'cs_live_cancelled123', action: 'cancel' },
    });
  });
});
