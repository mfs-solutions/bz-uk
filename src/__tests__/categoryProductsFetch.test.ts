import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchProducts } from '../lib/productService';

const { from, select, categoryLookup, range, order, or, gte, lte, gt } = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  categoryLookup: vi.fn(),
  range: vi.fn(),
  order: vi.fn(),
  or: vi.fn(),
  gte: vi.fn(),
  lte: vi.fn(),
  gt: vi.fn(),
}));

vi.mock('../lib/supabase', () => {
  const product = { id: 'product', category: 'category' };
  const query = {
    select: (fields: string, options?: unknown) => { select(fields, options); return query; },
    eq: () => query,
    or: (value: string) => { or(value); return query; },
    order: (field: string, options: unknown) => { order(field, options); return query; },
    range: (start: number, end: number) => { range(start, end); return query; },
    gte: (field: string, value: number) => { gte(field, value); return query; },
    lte: (field: string, value: number) => { lte(field, value); return query; },
    gt: (field: string, value: number) => { gt(field, value); return query; },
    in: (field: string) => {
      if (field === 'id') categoryLookup();
      return query;
    },
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve({ data: from.mock.lastCall?.[0] === 'products' ? [product] : [], error: null, count: null }).then(resolve),
  };
  from.mockReturnValue(query);
  return { supabase: { from } };
});

vi.mock('../lib/notificationService', () => ({
  notifyAccountEvent: vi.fn(),
  notifyAdminsOfEvent: vi.fn(),
}));

describe('category product fetch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips unused category enrichment and exact count when requested', async () => {
    await fetchProducts({ categoryIds: ['category'], includeCount: false, resolveCategoryNames: false });

    expect(select).toHaveBeenCalledWith('*', undefined);
    expect(categoryLookup).not.toHaveBeenCalled();
    expect(from).toHaveBeenCalledWith('product_variants');
  });

  it('preserves the default count and category enrichment', async () => {
    await fetchProducts();

    expect(select).toHaveBeenCalledWith('*', { count: 'exact' });
    expect(categoryLookup).toHaveBeenCalled();
  });

  it('applies category filters and stable server-side ordering before paging', async () => {
    await fetchProducts({
      categoryIds: ['parent', 'child'],
      subcategoryId: 'child',
      minPrice: 500,
      maxPrice: 2000,
      minRating: 4,
      inStock: true,
      sortBy: 'price-low-high',
      stableOrder: true,
      limit: 25,
      offset: 25,
      resolveCategoryNames: false,
    });

    expect(or).toHaveBeenNthCalledWith(1, 'category.in.(parent,child),sub_category.in.(parent,child),product_type.in.(parent,child)');
    expect(or).toHaveBeenNthCalledWith(2, 'category.eq.child,sub_category.eq.child,product_type.eq.child');
    expect(gte).toHaveBeenCalledWith('price', 500);
    expect(lte).toHaveBeenCalledWith('price', 2000);
    expect(gte).toHaveBeenCalledWith('rating', 4);
    expect(gt).toHaveBeenCalledWith('stock', 0);
    expect(order.mock.calls).toEqual([
      ['price', { ascending: true }],
      ['created_at', { ascending: false }],
      ['id', { ascending: false }],
    ]);
    expect(range).toHaveBeenCalledWith(25, 49);
  });
});
