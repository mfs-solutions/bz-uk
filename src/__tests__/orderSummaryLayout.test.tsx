import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OrderSummaryPage from '../pages/user/OrderSummary';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  user: { id: 'buyer-1', country: 'India' },
  rates: {},
  items: [{
    cartItemId: 'item-1', quantity: 2, selectedSize: 'M', selectedColor: 'Blue',
    product: { id: 'p1', name: 'Test product', price: 100, currency: 'INR', image_url: '/product.png' },
  }],
}));

vi.mock('../components/layout/Header', () => ({ Header: () => null }));
vi.mock('../components/layout/Footer', () => ({ Footer: () => null }));
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: mocks.user, currentAuthUser: null }),
}));
vi.mock('../contexts/CartContext', () => ({ useCart: () => ({ items: mocks.items }) }));
vi.mock('../contexts/CurrencyContext', () => ({ useCurrency: () => ({ rates: mocks.rates }) }));
vi.mock('../lib/pricingService', () => ({
  fetchPublicProductPrices: vi.fn().mockResolvedValue({ data: [{ productId: 'p1', publicUnitPrice: 100 }] }),
}));
vi.mock('../lib/checkoutPricingService', () => ({
  calculateDestinationCheckoutPricing: vi.fn().mockReturnValue(new Promise(() => {})),
}));
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => mocks.navigate,
}));

describe('checkout order summary layout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem('beauzead_checkout_shipping', JSON.stringify({
      fullName: 'Test Buyer', street: 'Main Road', street2: 'Near market',
      city: 'Kannur', state: 'Kerala', postalCode: '670702', country: 'India',
      phone: '1234567890', email: 'buyer@example.com', notes: 'Call first',
    }));
    localStorage.setItem('beauzead_checkout_selected_cart_ids', JSON.stringify(['item-1']));
  });

  it('displays the selected address and cart item while preserving change-address navigation', async () => {
    render(<MemoryRouter><OrderSummaryPage /></MemoryRouter>);
    expect(await screen.findByText('Test Buyer')).toBeInTheDocument();
    expect(screen.getByText('Main Road')).toBeInTheDocument();
    expect(screen.getByText('Near market')).toBeInTheDocument();
    expect(screen.getByText('Call first')).toBeInTheDocument();
    expect(await screen.findByText('Test product')).toBeInTheDocument();
    expect(screen.getByText('Size: M • Color: Blue')).toBeInTheDocument();
    expect(screen.getByText('Qty: 2')).toBeInTheDocument();
    expect(screen.getByText('Price Details')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    expect(mocks.navigate).toHaveBeenCalledWith('/checkout/shipping');
  });
});
