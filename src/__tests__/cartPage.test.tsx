import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CartPage } from '../pages/user/Cart';

const mocks = vi.hoisted(() => ({
  addToWishlistConfirmed: vi.fn(),
  removeFromCart: vi.fn(),
  removeFromCartConfirmed: vi.fn(),
  updateQuantity: vi.fn(),
  navigate: vi.fn(),
  variantPrices: vi.fn(),
  authUser: { id: 'user-1', country: 'India' },
  item: {
    cartItemId: 'item-1',
    product: {
      id: 'product-1', name: 'Test product', slug: 'test-product',
      brand: 'Test seller', image_url: '/test.png', price: 100,
      currency: 'INR', stock: 5,
    },
    quantity: 2,
    selectedSize: 'M',
    selectedColor: 'Blue',
    selectedVariantId: 'variant-1',
  },
}));

const items = [mocks.item];

vi.mock('../components/layout/Header', () => ({ Header: () => null }));
vi.mock('../components/layout/Footer', () => ({ Footer: () => null }));
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: mocks.authUser, currentAuthUser: null }),
}));
vi.mock('../contexts/CartContext', () => ({
  useCart: () => ({
    items, removeFromCart: mocks.removeFromCart, removeFromCartConfirmed: mocks.removeFromCartConfirmed, updateQuantity: mocks.updateQuantity,
  }),
}));
vi.mock('../contexts/CurrencyContext', () => ({
  useCurrency: () => ({
    formatPrice: (price: number) => `INR ${price}`, convertPrice: (price: number) => price, currency: 'INR',
  }),
}));
vi.mock('../contexts/WishlistContext', () => ({
  useWishlist: () => ({ addToWishlistConfirmed: mocks.addToWishlistConfirmed }),
}));
vi.mock('../hooks/useDestinationCountry', () => ({ useDestinationCountry: () => 'India' }));
vi.mock('../lib/pricingService', () => ({
  fetchVerifiedVariantPrices: mocks.variantPrices,
  fetchPublicProductPrices: vi.fn().mockResolvedValue({ data: [] }),
  calculateCheckoutPricing: vi.fn().mockResolvedValue({ data: { items: [] }, error: null }),
}));
vi.mock('../lib/productService', () => ({
  fetchProductById: vi.fn().mockResolvedValue({ data: { stock: 10 }, error: null }),
}));
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => mocks.navigate,
}));

describe('cart item cards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    items.splice(0, items.length, mocks.item);
    mocks.addToWishlistConfirmed.mockResolvedValue(undefined);
    mocks.removeFromCartConfirmed.mockResolvedValue(undefined);
    mocks.variantPrices.mockResolvedValue({
      data: { 'item-1': { sellingPrice: 125 } }, error: null, errorsByKey: {},
    });
  });

  it('shows verified pricing and variant details and confirms removal', async () => {
    render(<MemoryRouter><CartPage /></MemoryRouter>);
    expect(await screen.findByText('INR 125')).toBeInTheDocument();
    expect(screen.getByText('Size: M · Color: Blue')).toBeInTheDocument();
    expect(screen.getByText('In Stock')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Select Test product' })).toBeChecked();
    const productLink = screen.getByRole('link', { name: 'Test product' });
    expect(productLink).toHaveAttribute('title', 'Test product');
    expect(productLink.parentElement).toHaveClass('truncate');
    expect(productLink.parentElement).not.toHaveClass('line-clamp-2');

    fireEvent.click(screen.getByRole('button', { name: 'Remove Test product from cart' }));
    expect(screen.getByText('Remove Item')).toBeInTheDocument();
    expect(mocks.removeFromCart).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /^Remove$/ }));
    expect(mocks.removeFromCart).toHaveBeenCalledWith('item-1');
  });

  it('shows loading until wishlist and cart updates complete, then displays success', async () => {
    let finishWishlist!: () => void;
    let finishRemoval!: () => void;
    mocks.addToWishlistConfirmed.mockReturnValue(new Promise<void>((resolve) => { finishWishlist = resolve; }));
    mocks.removeFromCartConfirmed.mockReturnValue(new Promise<void>((resolve) => { finishRemoval = resolve; }));
    render(<MemoryRouter><CartPage /></MemoryRouter>);
    await screen.findByText('INR 125');
    fireEvent.click(screen.getByRole('button', { name: 'Add Test product to wishlist' }));
    expect(mocks.addToWishlistConfirmed).toHaveBeenCalledWith(mocks.item.product, 'user-1');
    expect(screen.getByRole('button', { name: 'Adding Test product to wishlist' })).toBeDisabled();
    expect(screen.getByText('Adding to Wishlist…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Proceed to Checkout/ })).toBeDisabled();
    expect(mocks.removeFromCartConfirmed).not.toHaveBeenCalled();
    await act(async () => { finishWishlist(); });
    expect(mocks.removeFromCartConfirmed).toHaveBeenCalledWith('item-1');
    expect(screen.getByText('Adding to Wishlist…')).toBeInTheDocument();
    await act(async () => { finishRemoval(); });
    const message = screen.getByText('Product added to wishlist');
    const summary = screen.getByText(/Subtotal/).closest('.native-cart-checkout');
    expect(summary).toContainElement(message);
    expect(message.closest('[role="alert"]')?.parentElement).toHaveClass('bottom-full');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    expect(screen.queryByText('Product added to wishlist')).not.toBeInTheDocument();
  });

  it('keeps the item in the cart and reports wishlist failure', async () => {
    mocks.addToWishlistConfirmed.mockRejectedValue(new Error('Network error'));
    render(<MemoryRouter><CartPage /></MemoryRouter>);
    await screen.findByText('INR 125');
    fireEvent.click(screen.getByRole('button', { name: 'Add Test product to wishlist' }));
    expect(await screen.findByText('Could not add product to your wishlist. Please try again.')).toBeInTheDocument();
    expect(mocks.removeFromCartConfirmed).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Add Test product to wishlist' })).toBeEnabled();
  });

  it('keeps the notification visible when the last item is moved to the wishlist', async () => {
    const { rerender } = render(<MemoryRouter><CartPage /></MemoryRouter>);
    await screen.findByText('INR 125');
    fireEvent.click(screen.getByRole('button', { name: 'Add Test product to wishlist' }));
    await screen.findByText('Product added to wishlist');
    items.splice(0);
    rerender(<MemoryRouter><CartPage /></MemoryRouter>);
    expect(screen.getByText('Your Cart is Empty')).toBeInTheDocument();
    const message = screen.getByText('Product added to wishlist');
    expect(message.closest('[role="alert"]')?.parentElement).toHaveClass('fixed', 'bottom-4');
  });

  it('reports a partial failure if the wishlist succeeds but the cart removal fails', async () => {
    mocks.removeFromCartConfirmed.mockRejectedValue(new Error('Network error'));
    render(<MemoryRouter><CartPage /></MemoryRouter>);
    await screen.findByText('INR 125');
    fireEvent.click(screen.getByRole('button', { name: 'Add Test product to wishlist' }));
    expect(await screen.findByText('Product was added to your wishlist, but could not be removed from your cart.')).toBeInTheDocument();
    expect(screen.queryByText('Product added to wishlist')).not.toBeInTheDocument();
  });

  it('updates quantity and checks out only selected cart items', async () => {
    render(<MemoryRouter><CartPage /></MemoryRouter>);
    await screen.findByText('INR 125');
    fireEvent.click(screen.getByRole('button', { name: 'Increase quantity of Test product' }));
    expect(mocks.updateQuantity).toHaveBeenCalledWith('item-1', 3);
    await waitFor(() => expect(screen.getByRole('button', { name: /Proceed to Checkout/ })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: /Proceed to Checkout/ }));
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/checkout/shipping', {
      state: { selectedCartItemIds: ['item-1'] },
    }));
    expect(JSON.parse(localStorage.getItem('beauzead_checkout_selected_cart_ids') || '[]')).toEqual(['item-1']);
  });

  it('shows variant verification errors and prevents checkout', async () => {
    mocks.variantPrices.mockResolvedValue({
      data: {}, error: 'Variant unavailable',
    });
    render(<MemoryRouter><CartPage /></MemoryRouter>);
    expect(await screen.findByText('Variant unavailable')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Proceed to Checkout/ })).toBeDisabled();
  });
});
