import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ShippingAddressPage from '../pages/user/ShippingAddress';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  getAddresses: vi.fn(),
  createAddress: vi.fn(),
  pricing: vi.fn(),
  rates: { GBP: 1 },
  items: [{
    cartItemId: 'cart-1',
    product: { id: 'product-1', name: 'Product', price: 10, currency: 'GBP' },
    quantity: 1,
  }],
}));

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => mocks.navigate,
}));
vi.mock('../config/market', () => ({
  IS_UK_STOREFRONT: true,
  STOREFRONT_COUNTRY_NAME: 'United Kingdom',
  STOREFRONT_COUNTRY_CODE: 'GB',
  STOREFRONT_CURRENCY_CODE: 'GBP',
  isUKCountry: (country: string) => ['united kingdom', 'gb', 'uk'].includes(country.toLowerCase()),
}));
vi.mock('../components/layout/Header', () => ({ Header: () => null }));
vi.mock('../components/layout/Footer', () => ({ Footer: () => <footer>Footer component</footer> }));
vi.mock('../components/layout/MobileNav', () => ({ MobileNav: () => null }));
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'buyer', full_name: 'Buyer', email: 'buyer@example.com', phone: '07700900000' },
    currentAuthUser: null, loading: false,
  }),
}));
vi.mock('../contexts/CartContext', () => ({ useCart: () => ({ items: mocks.items }) }));
vi.mock('../contexts/CurrencyContext', () => ({ useCurrency: () => ({ rates: mocks.rates }) }));
vi.mock('../lib/adminService', () => ({
  getUserAddresses: mocks.getAddresses,
  createUserAddress: mocks.createAddress,
}));
vi.mock('../lib/checkoutPricingService', () => ({ calculateDestinationCheckoutPricing: mocks.pricing }));
vi.mock('../lib/pricingService', () => ({
  fetchPublicProductPrices: vi.fn().mockResolvedValue({ data: [], error: null }),
}));
vi.mock('../lib/shippingDataService', () => ({
  fetchCountries: vi.fn().mockResolvedValue({ data: [], error: null }),
}));
vi.mock('../lib/locationService', () => ({ detectLocationWithCaching: vi.fn() }));
vi.mock('../utils/currency', () => ({
  formatCurrency: (value: number) => `£${value}`,
  hasCurrencyRate: () => true,
  isExchangeRateUnavailable: () => false,
}));

const ukAddress = {
  id: 'uk', full_name: 'Buyer', phone_number: '07700900000', email: 'buyer@example.com',
  country: 'United Kingdom', street_address_1: '12 High Street', city: 'London',
  state: 'London', postal_code: 'SW1A 1AA', is_default: true,
};
const overseasAddress = {
  ...ukAddress, id: 'overseas', country: 'India', street_address_1: 'Other Street', is_default: false,
};

const renderPage = () => render(<MemoryRouter><ShippingAddressPage /></MemoryRouter>);

describe('checkout shipping addresses', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mocks.getAddresses.mockResolvedValue({ data: [ukAddress, overseasAddress], error: null });
    mocks.pricing.mockResolvedValue({ subtotal: 10, total: 12, shipping: 2, currency: 'GBP', items: [] });
  });

  it('shows saved addresses first, selects the default and hides addresses outside the storefront country', async () => {
    renderPage();
    expect(await screen.findByText(/12 High Street/)).toBeInTheDocument();
    expect(screen.queryByText(/Other Street/)).not.toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(1);
    expect(screen.getByRole('radio', { name: /12 High Street/ })).toBeChecked();
    expect(screen.queryByRole('textbox', { name: /street address/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/order summary/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Footer component')).not.toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Saved addresses' }).querySelector('ul'))
      .toHaveClass('overflow-y-auto');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Continue to review' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Continue to review' }));
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/checkout/review'));
    expect(JSON.parse(localStorage.getItem('beauzead_checkout_shipping') || '{}')).toMatchObject({
      selectedAddressId: 'uk', street: '12 High Street', country: 'United Kingdom',
    });
    expect(mocks.createAddress).not.toHaveBeenCalled();
  });

  it('opens the new address form on request and keeps a draft when returning to saved addresses', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Add New' }));
    const street = screen.getByLabelText(/street address/i);
    fireEvent.change(street, { target: { value: 'New Road' } });
    fireEvent.click(screen.getByRole('tab', { name: /Saved Addresses/ }));
    expect(screen.getByText(/12 High Street/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add New' }));
    expect(screen.getByLabelText(/street address/i)).toHaveValue('New Road');
  });

  it('keeps another selected saved address when the new address form is opened and closed', async () => {
    mocks.getAddresses.mockResolvedValue({
      data: [ukAddress, { ...ukAddress, id: 'second', street_address_1: '24 Park Road', postal_code: 'M1 1AE', is_default: false }],
      error: null,
    });
    renderPage();
    fireEvent.click(await screen.findByRole('radio', { name: /24 Park Road/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Add New' }));
    fireEvent.click(screen.getByRole('tab', { name: /Saved Addresses/ }));
    expect(screen.getByRole('radio', { name: /24 Park Road/ })).toBeChecked();
    await waitFor(() => expect(mocks.pricing).toHaveBeenLastCalledWith(expect.objectContaining({
      destinationPostalCode: 'M1 1AE',
    })));
  });

  it('shows saved addresses first even if a new-address draft exists', async () => {
    localStorage.setItem('beauzead_checkout_shipping_draft:GB:buyer', JSON.stringify({
      formData: { street_address_1: 'Draft Road' },
    }));
    renderPage();
    expect(await screen.findByText(/12 High Street/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add New' }));
    expect(screen.getByLabelText(/street address/i)).toHaveValue('Draft Road');
  });

  it('offers adding an address when none exist', async () => {
    mocks.getAddresses.mockResolvedValue({ data: [], error: null });
    renderPage();
    expect(await screen.findByText(/no saved addresses yet/i)).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Continue to review' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Add a new address' }));
    expect(screen.getByLabelText(/street address/i)).toBeInTheDocument();
  });

  it('shows a retryable error instead of presenting a failed lookup as an empty list', async () => {
    mocks.getAddresses.mockResolvedValueOnce({ data: [], error: 'Network error' })
      .mockResolvedValueOnce({ data: [ukAddress], error: null });
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent("couldn't load your saved addresses");
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText(/12 High Street/)).toBeInTheDocument();
  });
});
