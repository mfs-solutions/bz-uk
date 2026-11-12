import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CategoryProducts } from '../pages/CategoryProducts';

const mocks = vi.hoisted(() => ({
  categoryId: 'category-a',
  fetchCategoryContext: vi.fn(),
  fetchCategoryMaxPrice: vi.fn(),
  fetchProducts: vi.fn(),
  fetchPublicProductPrices: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
  useParams: () => ({ categoryId: mocks.categoryId }),
  useNavigate: () => vi.fn(),
}));
vi.mock('../components/layout/StorefrontHeader', () => ({ StorefrontHeader: () => null }));
vi.mock('../components/layout/Footer', () => ({ Footer: () => null }));
vi.mock('../components/layout/MobileNav', () => ({ MobileNav: () => null }));
vi.mock('../components/products/ProductCard', () => ({
  ProductCard: ({ product }: { product: { id: string } }) => <div data-testid="product">{product.id}</div>,
}));
vi.mock('../lib/productService', () => ({
  fetchCategoryContext: mocks.fetchCategoryContext,
  fetchCategoryMaxPrice: mocks.fetchCategoryMaxPrice,
  fetchProducts: mocks.fetchProducts,
}));
vi.mock('../lib/pricingService', () => ({ fetchPublicProductPrices: mocks.fetchPublicProductPrices }));
vi.mock('../contexts/CurrencyContext', () => ({ useCurrency: () => ({ formatPrice: String }) }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: null, currentAuthUser: null }) }));
vi.mock('../hooks/useDestinationCountry', () => ({ useDestinationCountry: () => 'GB' }));

let intersectionCallback: IntersectionObserverCallback;
class TestIntersectionObserver {
  constructor(callback: IntersectionObserverCallback) { intersectionCallback = callback; }
  observe() {}
  disconnect() {}
  unobserve() {}
}

const makeProducts = (prefix: string, start: number, count: number) =>
  Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-${start + index}`,
    category: prefix,
    price: 100,
  }));

describe('category product pagination', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal('IntersectionObserver', TestIntersectionObserver);
    mocks.categoryId = 'category-a';
    mocks.fetchCategoryContext.mockImplementation(async (id: string) => ({
      category: { id, name: id, slug: id, parent_id: null, level: 1 },
      parent: null,
      children: [],
      allCategoryIds: [id],
      categoryNames: {},
      parentById: {},
    }));
    mocks.fetchCategoryMaxPrice.mockResolvedValue({ maxPrice: 1000, error: null });
    mocks.fetchProducts.mockImplementation(async ({ categoryIds, offset }: { categoryIds: string[]; offset: number }) => ({
      data: makeProducts(categoryIds[0], offset, offset < 50 ? 25 : 3),
      error: null,
    }));
    mocks.fetchPublicProductPrices.mockResolvedValue({ data: [], error: null });
  });

  it('fetches 25 at a time on scroll and stops after the last page', async () => {
    render(<CategoryProducts />);
    expect(await screen.findAllByTestId('product')).toHaveLength(25);
    expect(screen.getByRole('heading', { level: 1, name: 'category-a' })).toHaveClass('sr-only');
    expect(screen.queryByText(/Showing \d+ results?/)).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(mocks.fetchProducts).toHaveBeenCalledTimes(1);
    expect(mocks.fetchProducts).toHaveBeenLastCalledWith(expect.objectContaining({ limit: 25, offset: 0, stableOrder: true }));

    act(() => intersectionCallback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
    await waitFor(() => expect(screen.getAllByTestId('product')).toHaveLength(50));
    expect(mocks.fetchProducts).toHaveBeenLastCalledWith(expect.objectContaining({ limit: 25, offset: 25 }));
    act(() => intersectionCallback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
    await waitFor(() => expect(screen.getAllByTestId('product')).toHaveLength(53));
    expect(mocks.fetchProducts).toHaveBeenLastCalledWith(expect.objectContaining({ limit: 25, offset: 50 }));
    expect(screen.queryByRole('button', { name: 'Load more products' })).not.toBeInTheDocument();
    expect(mocks.fetchPublicProductPrices.mock.calls.map(call => call[0].length)).toEqual([25, 25, 3]);
  });

  it('restarts from the first page with the selected sort and subcategory', async () => {
    mocks.fetchCategoryContext.mockImplementation(async (id: string) => ({
      category: { id, name: id, slug: id, parent_id: null, level: 1 },
      parent: null,
      children: [{ id: 'child', name: 'Child', slug: 'child', parent_id: id, level: 2 }],
      allCategoryIds: [id, 'child'],
      categoryNames: {},
      parentById: { child: id },
    }));
    render(<CategoryProducts />);
    await screen.findAllByTestId('product');
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'price-low-high' } });
    await waitFor(() => expect(mocks.fetchProducts).toHaveBeenLastCalledWith(expect.objectContaining({
      offset: 0, sortBy: 'price-low-high',
    })));
    fireEvent.click(screen.getAllByRole('button', { name: 'Child' })[0]);
    await waitFor(() => expect(mocks.fetchProducts).toHaveBeenLastCalledWith(expect.objectContaining({
      offset: 0, subcategoryId: 'child', sortBy: 'price-low-high',
    })));
  });

  it('loads the first batch without waiting for the price-range query', async () => {
    let resolveMax!: (value: { maxPrice: number; error: null }) => void;
    mocks.fetchCategoryMaxPrice.mockReturnValue(new Promise(resolve => { resolveMax = resolve; }));
    render(<CategoryProducts />);
    expect(await screen.findAllByTestId('product')).toHaveLength(25);
    expect(mocks.fetchProducts).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole('slider').every(slider => slider.hasAttribute('disabled'))).toBe(true);
    await act(async () => resolveMax({ maxPrice: 2000, error: null }));
    expect(screen.getAllByRole('slider').every(slider => !slider.hasAttribute('disabled'))).toBe(true);
    expect(mocks.fetchProducts).toHaveBeenCalledTimes(1);
  });

  it('applies price, rating and stock filters to the server query', async () => {
    render(<CategoryProducts />);
    await screen.findAllByTestId('product');
    await waitFor(() => expect(screen.getAllByRole('slider')[0]).toBeEnabled());
    fireEvent.change(screen.getAllByRole('slider')[0], { target: { value: '500' } });
    await waitFor(() => expect(mocks.fetchProducts).toHaveBeenLastCalledWith(expect.objectContaining({ minPrice: 500, offset: 0 })));
    fireEvent.click(screen.getByText('In Stock Only'));
    await waitFor(() => expect(mocks.fetchProducts).toHaveBeenLastCalledWith(expect.objectContaining({ minPrice: 500, inStock: true })));
    await screen.findAllByTestId('product');
    fireEvent.click(screen.getAllByRole('button', { name: '& Up' })[0]);
    await waitFor(() => expect(mocks.fetchProducts).toHaveBeenLastCalledWith(expect.objectContaining({ minRating: 4, minPrice: 500, inStock: true })));
  });

  it('keeps loaded products and retries a failed later page', async () => {
    mocks.fetchProducts.mockResolvedValueOnce({ data: makeProducts('category-a', 0, 25), error: null })
      .mockResolvedValueOnce({ data: [], error: 'network error' })
      .mockResolvedValueOnce({ data: makeProducts('category-a', 25, 2), error: null });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      render(<CategoryProducts />);
      await screen.findAllByTestId('product');
      fireEvent.click(screen.getByRole('button', { name: 'Load more products' }));
      expect(await screen.findByText('Failed to load more products. Please try again.')).toBeInTheDocument();
      expect(screen.getAllByTestId('product')).toHaveLength(25);
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
      await waitFor(() => expect(screen.getAllByTestId('product')).toHaveLength(27));
      expect(mocks.fetchProducts).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 25 }));
    } finally {
      consoleError.mockRestore();
    }
  });

  it('ignores a pending page when the sort changes and prevents duplicate page requests', async () => {
    let resolvePage!: (value: { data: ReturnType<typeof makeProducts>; error: null }) => void;
    mocks.fetchProducts.mockImplementation(({ offset }: { offset: number }) => {
      if (offset === 25) return new Promise(resolve => { resolvePage = resolve; });
      return Promise.resolve({ data: makeProducts('category-a', 0, 25), error: null });
    });
    render(<CategoryProducts />);
    await screen.findAllByTestId('product');
    const loadButton = screen.getByRole('button', { name: 'Load more products' });
    fireEvent.click(loadButton);
    fireEvent.click(loadButton);
    expect(mocks.fetchProducts).toHaveBeenCalledTimes(2);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'newest' } });
    await waitFor(() => expect(mocks.fetchProducts).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 0, sortBy: 'newest' })));
    await screen.findAllByTestId('product');
    await act(async () => resolvePage({ data: makeProducts('old-page', 25, 25), error: null }));
    expect(screen.queryByText('old-page-25')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('product')).toHaveLength(25);
  });

  it('ignores a pending page after navigating to another category', async () => {
    let resolvePage!: (value: { data: ReturnType<typeof makeProducts>; error: null }) => void;
    mocks.fetchProducts.mockImplementation(({ categoryIds, offset }: { categoryIds: string[]; offset: number }) => {
      if (categoryIds[0] === 'category-a' && offset === 25) {
        return new Promise(resolve => { resolvePage = resolve; });
      }
      return Promise.resolve({ data: makeProducts(categoryIds[0], 0, 25), error: null });
    });
    const { rerender } = render(<CategoryProducts />);
    await screen.findAllByTestId('product');
    fireEvent.click(screen.getByRole('button', { name: 'Load more products' }));
    mocks.categoryId = 'category-b';
    rerender(<CategoryProducts />);
    await screen.findByText('category-b-0');
    await act(async () => resolvePage({ data: makeProducts('category-a', 25, 25), error: null }));
    expect(screen.queryByText('category-a-25')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('product')).toHaveLength(25);
  });
});
