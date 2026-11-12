import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MyOrders } from '../pages/user/MyOrders';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  fetchOrders: vi.fn(),
  user: { id: 'buyer-1' },
}));

vi.mock('../components/layout/Header', () => ({ Header: () => null }));
vi.mock('../components/layout/Footer', () => ({ Footer: () => null }));
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: mocks.user, currentAuthUser: null }),
}));
vi.mock('../contexts/CurrencyContext', () => ({
  useCurrency: () => ({ formatPrice: (amount: number) => `INR ${amount}` }),
}));
vi.mock('../contexts/CartContext', () => ({
  useCart: () => ({ addToCart: vi.fn() }),
}));
vi.mock('../lib/orderService', () => ({
  fetchOrdersByUser: mocks.fetchOrders,
  fetchOrderById: vi.fn(),
  cancelOrder: vi.fn(),
  requestReturn: vi.fn(),
}));
vi.mock('../lib/notificationService', () => ({ notifyOrderEvent: vi.fn() }));
vi.mock('../utils/invoicePdf', () => ({ generateInvoicePdf: vi.fn() }));
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => mocks.navigate,
}));

describe('order list layout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mocks.fetchOrders.mockResolvedValue({
      data: [{
        id: 'order-123', created_at: '2025-07-01T00:00:00Z', completed_at: '2025-07-20T00:00:00Z',
        status: 'delivered', total_amount: 500, currency: 'INR', payment_status: 'completed',
        order_items: [
          { id: 'item-1', product_id: 'p1', product_name: 'First product', quantity: 2, variant_info: { size: 'M' } },
          { id: 'item-2', product_id: 'p2', product_name: 'Second product', quantity: 1 },
        ],
      }],
    });
  });

  it('shows a compact order row and retains the existing details and actions when expanded', async () => {
    render(<MemoryRouter><MyOrders /></MemoryRouter>);
    const product = await screen.findByText('First product');
    expect(screen.getByText(/\+1 more item/)).toBeInTheDocument();
    expect(screen.getByText(/Delivered on 20 Jul 2025/)).toBeInTheDocument();

    fireEvent.click(product.closest('summary')!);
    expect(screen.getByText('Qty: 2 · Size: M')).toBeVisible();
    expect(screen.getByText('INR 500')).toBeVisible();
    expect(screen.getByRole('button', { name: /Track My Order/ })).toBeVisible();
    expect(screen.getByRole('button', { name: /Return \/ Refund/ })).toBeVisible();
    expect(screen.getByRole('button', { name: /Invoice/ })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'View order details' }));
    expect(mocks.navigate).toHaveBeenCalledWith('/orders/order-123');
  });
});
