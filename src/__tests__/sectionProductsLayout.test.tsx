import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SectionProducts } from '../pages/SectionProducts';

vi.mock('react-router-dom', () => ({
  useParams: () => ({ section: 'featured' }),
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams()],
}));
vi.mock('../components/layout/StorefrontHeader', () => ({ StorefrontHeader: () => null }));
vi.mock('../components/layout/Footer', () => ({ Footer: () => <footer>Site footer</footer> }));
vi.mock('../components/layout/MobileNav', () => ({ MobileNav: () => null }));
vi.mock('../components/products/ProductCard', () => ({
  ProductCard: ({ product }: { product: { name: string } }) => <div data-testid="product">{product.name}</div>,
}));
vi.mock('../lib/productService', () => ({
  sectionMeta: { featured: { title: 'Featured Products', subtitle: 'Featured items', icon: '⭐' } },
  fetchProductsBySection: vi.fn().mockResolvedValue({
    data: [
      { id: 'a', name: 'First', category: 'home', currency: 'GBP' },
      { id: 'b', name: 'Second', category: 'beauty', currency: 'GBP' },
    ],
  }),
  fetchCategoriesFlat: vi.fn().mockResolvedValue({
    data: [{ id: 'home', name: 'Home' }, { id: 'beauty', name: 'Beauty' }],
  }),
  searchPublicProductsByKeywords: vi.fn(),
}));
vi.mock('../lib/sponsoredProductsService', () => ({
  getActiveSponsoredProductsBySection: vi.fn().mockResolvedValue({}),
}));
vi.mock('../lib/pricingService', () => ({
  fetchPublicProductPrices: vi.fn().mockResolvedValue({
    data: [{ productId: 'a', publicUnitPrice: 10 }, { productId: 'b', publicUnitPrice: 5 }],
    error: null,
  }),
}));
vi.mock('../contexts/CurrencyContext', () => ({
  useCurrency: () => ({ currency: 'GBP', convertPrice: (price: number) => price, formatPrice: String }),
}));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: null, currentAuthUser: null }) }));
vi.mock('../hooks/useDestinationCountry', () => ({ useDestinationCountry: () => 'GB' }));

describe('section product listing', () => {
  it('opens mobile filters and keeps category and price sorting functional', async () => {
    render(<SectionProducts />);
    await screen.findByText('First');
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByTestId('product')).toHaveLength(2));
    expect(screen.getByRole('heading', { name: 'Featured Products' })).toHaveClass('sr-only');
    expect(screen.queryByText('Featured items')).not.toBeInTheDocument();
    expect(screen.queryByText('2 products')).not.toBeInTheDocument();

    const toggle = screen.getByRole('button', { name: 'Filters' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    fireEvent.change(screen.getByRole('combobox', { name: 'Sort products' }), {
      target: { value: 'price-low-high' },
    });
    expect(screen.getAllByTestId('product').map((item) => item.textContent)).toEqual(['Second', 'First']);
    fireEvent.click(screen.getByRole('button', { name: 'Home' }));
    expect(screen.getAllByTestId('product').map((item) => item.textContent)).toEqual(['First']);
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });
});
