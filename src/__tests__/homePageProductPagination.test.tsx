import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { BzeadHomePage } from '../pages/BzeadHomePage';

const mocks = vi.hoisted(() => ({
  getSponsoredCount: vi.fn(),
  fetchSponsoredPage: vi.fn(),
  fetchProductPage: vi.fn(),
  fetchPrices: vi.fn(),
}));

vi.mock('../lib/sponsoredProductsService', () => ({
  getActiveHomepageSponsoredProductCount: mocks.getSponsoredCount,
  fetchActiveHomepageSponsoredProductsPage: mocks.fetchSponsoredPage,
}));
vi.mock('../lib/productService', () => ({
  fetchHomepageProductsPage: mocks.fetchProductPage,
}));
vi.mock('../lib/pricingService', () => ({
  fetchPublicProductPrices: mocks.fetchPrices,
}));
vi.mock('../lib/homePageCache', () => ({
  HOME_CONTENT_CACHE_TTL_MS: 300_000,
  HOME_PRICE_CACHE_TTL_MS: 120_000,
  isCacheFresh: () => false,
  readHomeBannersCache: () => null,
  readHomePricesCache: () => null,
  writeHomeBannersCache: vi.fn(),
  writeHomePricesCache: vi.fn(),
}));
vi.mock('../lib/supabase', () => {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(async () => ({ data: [], error: null })),
  };
  return { supabase: { from: vi.fn(() => query) } };
});
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: null, currentAuthUser: null }),
}));
vi.mock('../hooks/useDestinationCountry', () => ({
  useDestinationCountry: () => 'United Kingdom',
}));
vi.mock('../components/layout/StorefrontHeader', () => ({ StorefrontHeader: () => null }));
vi.mock('../components/layout/MegaMenu', () => ({ MegaMenu: () => null }));
vi.mock('../components/layout/HeroCarousel', () => ({ HeroCarousel: () => null }));
vi.mock('../components/layout/Footer', () => ({ Footer: () => null }));
vi.mock('../components/layout/WelcomeBackBar', () => ({ WelcomeBackBar: () => null }));
vi.mock('../components/layout/Categories', () => ({ Categories: () => null }));
vi.mock('../components/layout/MobileNav', () => ({ MobileNav: () => null }));
vi.mock('../components/layout/VideoAdsBanner', () => ({ VideoAdsBanner: () => null }));
vi.mock('../components/products/ProductCard', () => ({
  ProductCard: ({ product }: { product: { id: string } }) => <div data-testid="product">{product.id}</div>,
}));

const observedCallbacks: IntersectionObserverCallback[] = [];

class TestIntersectionObserver {
  constructor(callback: IntersectionObserverCallback) {
    observedCallbacks.push(callback);
  }
  observe() {}
  disconnect() {}
}

const page = (section: string, offset: number, count: number) => ({
  data: Array.from({ length: Math.min(20, Math.max(0, count - offset)) }, (_, index) => ({
    id: `${section}-${offset + index}`,
    name: `${section} product ${offset + index}`,
    price: 10,
    ...(section === 'hot-deals' ? { mrp: 20 } : {}),
    currency: 'GBP',
    image_url: '',
    created_at: new Date(0).toISOString(),
  })),
  count,
  error: null,
});

const triggerScroll = () => {
  const callback = observedCallbacks.at(-1);
  if (!callback) throw new Error('No section scroll observer is active.');
  act(() => callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
};

describe('homepage product section pagination', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    observedCallbacks.length = 0;
    vi.stubGlobal('IntersectionObserver', TestIntersectionObserver);
    mocks.getSponsoredCount.mockResolvedValue({ count: 0, error: null });
    mocks.fetchSponsoredPage.mockResolvedValue({ data: [], count: 0, error: null });
    mocks.fetchProductPage.mockImplementation(async (section: string, _limit: number, offset: number) => ({
      ...page(section, offset, section === 'featured' ? 45 : section === 'hot-deals' ? 25 : 3),
    }));
    mocks.fetchPrices.mockResolvedValue({ data: [], error: null });
  });

  it('loads 20 at a time and starts each section only after the previous section is complete', async () => {
    render(<MemoryRouter><BzeadHomePage /></MemoryRouter>);

    await waitFor(() => expect(mocks.fetchProductPage).toHaveBeenCalledWith('featured', 20, 0));
    expect(mocks.fetchProductPage).toHaveBeenCalledTimes(1);
    expect(mocks.fetchProductPage).not.toHaveBeenCalledWith('hot-deals', expect.anything(), expect.anything());
    expect(mocks.fetchProductPage).not.toHaveBeenCalledWith('trending', expect.anything(), expect.anything());

    triggerScroll();
    await waitFor(() => expect(mocks.fetchProductPage).toHaveBeenLastCalledWith('featured', 20, 20));
    expect(screen.getAllByTestId('product')).toHaveLength(40);
    expect(mocks.fetchProductPage).toHaveBeenCalledTimes(2);

    triggerScroll();
    await waitFor(() => expect(mocks.fetchProductPage).toHaveBeenLastCalledWith('hot-deals', 20, 0));
    expect(screen.getAllByTestId('product')).toHaveLength(65);
    expect(mocks.fetchProductPage.mock.calls.map(([section, , offset]) => [section, offset])).toEqual([
      ['featured', 0],
      ['featured', 20],
      ['featured', 40],
      ['hot-deals', 0],
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Load next Hot Deals 🔥 batch' }));
    await waitFor(() => expect(mocks.fetchProductPage).toHaveBeenLastCalledWith('trending', 20, 0));
    expect(mocks.fetchProductPage.mock.calls.map(([section, , offset]) => [section, offset])).toEqual([
      ['featured', 0],
      ['featured', 20],
      ['featured', 40],
      ['hot-deals', 0],
      ['hot-deals', 20],
      ['trending', 0],
    ]);
  });

  it('does not issue duplicate requests when load-more is triggered repeatedly during a page load', async () => {
    let resolveNextPage!: (result: ReturnType<typeof page>) => void;
    mocks.fetchProductPage.mockImplementation((section: string, _limit: number, offset: number) => {
      if (section === 'featured' && offset === 20) {
        return new Promise((resolve) => { resolveNextPage = resolve; });
      }
      return Promise.resolve(page(section, offset, 45));
    });

    render(<MemoryRouter><BzeadHomePage /></MemoryRouter>);
    await waitFor(() => expect(mocks.fetchProductPage).toHaveBeenCalledWith('featured', 20, 0));

    const loadMore = await screen.findByRole('button', { name: 'Load next Featured Products batch' });
    fireEvent.click(loadMore);
    fireEvent.click(loadMore);
    expect(mocks.fetchProductPage.mock.calls.filter(([, , offset]) => offset === 20)).toHaveLength(1);

    await act(async () => resolveNextPage(page('featured', 20, 45)));
    await waitFor(() => expect(screen.getAllByTestId('product')).toHaveLength(40));
  });

  it('uses sponsored pages in their database order without requesting fallback products', async () => {
    const sponsoredProduct = (id: string) => ({
      id,
      name: id,
      price: 10,
      currency: 'GBP',
      image_url: '',
      created_at: new Date(0).toISOString(),
    });
    mocks.getSponsoredCount.mockResolvedValue({ count: 3, error: null });
    mocks.fetchSponsoredPage.mockImplementation(async (section: string) => {
      if (section === 'featured') {
        return { data: [sponsoredProduct('sponsored-first'), sponsoredProduct('sponsored-second')], count: 2, error: null };
      }
      if (section === 'trending') {
        return { data: [sponsoredProduct('sponsored-third')], count: 1, error: null };
      }
      return { data: [], count: 0, error: null };
    });

    render(<MemoryRouter><BzeadHomePage /></MemoryRouter>);

    await waitFor(() => expect(mocks.fetchSponsoredPage).toHaveBeenCalledWith('trending', 20, 0));
    expect(mocks.fetchSponsoredPage.mock.calls.map(([section]) => section)).toEqual([
      'featured',
      'hot-deals',
      'trending',
    ]);
    expect(mocks.fetchProductPage).not.toHaveBeenCalled();
    expect(screen.getAllByTestId('product').map((product) => product.textContent)).toEqual([
      'sponsored-first',
      'sponsored-second',
      'sponsored-third',
    ]);
  });
});
