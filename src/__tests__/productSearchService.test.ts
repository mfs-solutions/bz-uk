import { beforeEach, describe, expect, it, vi } from 'vitest';

const { from, rpc } = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: { from, rpc },
}));

vi.mock('../lib/notificationService', () => ({
  notifyAccountEvent: vi.fn(),
  notifyAdminsOfEvent: vi.fn(),
}));

import { searchPublicProductsByKeywords } from '../lib/productService';

function makeQuery(data: unknown[]) {
  const query: Record<string, any> = {};
  query.select = vi.fn(() => query);
  query.in = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.then = (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
    Promise.resolve({ data, error: null }).then(resolve);
  return query;
}

describe('public product search service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('normalizes queries and sends the requested page to the catalog RPC', async () => {
    rpc.mockResolvedValue({
      data: [{ id: 'product-1', total_count: 74 }],
      error: null,
    });

    const result = await searchPublicProductsByKeywords('  blue   watch  ', 25, 50);

    expect(rpc).toHaveBeenCalledWith('search_products_catalog', {
      p_query_text: 'blue watch',
      p_result_limit: 25,
      p_result_offset: 50,
    });
    expect(result.totalCount).toBe(74);
    expect(result.data).toEqual([{ id: 'product-1', total_count: 74 }]);
  });

  it('hydrates products and restores the RPC rank order', async () => {
    const productQuery = makeQuery([
      { id: 'product-2', category: 'category-1', product_variants: [{ id: 'variant-2' }] },
      { id: 'product-1', category: 'category-1', product_variants: [] },
    ]);
    const categoryQuery = makeQuery([{ id: 'category-1', name: 'Watches' }]);
    from.mockImplementation((table: string) =>
      table === 'products' ? productQuery : categoryQuery,
    );
    rpc.mockResolvedValue({
      data: [
        { id: 'product-1', total_count: 2 },
        { id: 'product-2', total_count: 2 },
      ],
      error: null,
    });

    const result = await searchPublicProductsByKeywords('watch', 2, 0, true);

    expect(result.data.map((product: any) => product.id)).toEqual(['product-1', 'product-2']);
    expect(result.data[0]).toMatchObject({
      category_name: 'Watches',
      has_variants: false,
    });
    expect(result.data[1]).toMatchObject({
      category_name: 'Watches',
      has_variants: true,
    });
    expect(result.totalCount).toBe(2);
  });

  it('returns RPC failures instead of disguising them as empty results', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'Search unavailable' } });

    const result = await searchPublicProductsByKeywords('watch');

    expect(result).toEqual({ data: [], totalCount: 0, error: 'Search unavailable' });
  });
});
