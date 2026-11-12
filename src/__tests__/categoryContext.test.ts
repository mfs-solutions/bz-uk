import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchCategoryContext } from '../lib/productService';
import { clearQueryCache } from '../lib/queryCache';

const { categoryLookup, categoryPage } = vi.hoisted(() => ({
  categoryLookup: vi.fn(),
  categoryPage: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => {
      const query = {
        select: () => query,
        order: () => query,
        range: () => query,
        eq: () => query,
        maybeSingle: categoryLookup,
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(categoryPage()).then(resolve),
      };
      return query;
    },
  },
}));

vi.mock('../lib/notificationService', () => ({
  notifyAccountEvent: vi.fn(),
  notifyAdminsOfEvent: vi.fn(),
}));

describe('category context', () => {
  beforeEach(() => {
    clearQueryCache();
    categoryLookup.mockReset();
    categoryPage.mockReset();
  });

  it('starts category and tree lookups concurrently and builds descendant context', async () => {
    const root = { id: 'root', name: 'Fashion', slug: 'fashion', parent_id: null, level: 1, display_order: 0 };
    const child = { id: 'child', name: 'Shoes', parent_id: 'root', level: 2, display_order: 0 };
    const grandchild = { id: 'grandchild', name: 'Boots', parent_id: 'child', level: 3, display_order: 0 };
    let resolveCategory!: (result: unknown) => void;
    categoryLookup.mockReturnValue(new Promise((resolve) => { resolveCategory = resolve; }));
    categoryPage.mockReturnValue({ data: [root, child, grandchild], error: null });
    const result = fetchCategoryContext('fashion');
    await Promise.resolve();
    expect(categoryPage).toHaveBeenCalled();
    resolveCategory({ data: root, error: null });
    const context = await result;
    expect(context.allCategoryIds).toEqual(['root', 'child', 'grandchild']);
    expect(context.categoryNames?.grandchild).toBe('Boots');
    expect(context.parentById).toMatchObject({ grandchild: 'child' });
  });

  it('reports category tree failures instead of returning incomplete products', async () => {
    categoryLookup.mockResolvedValue({ data: { id: 'root' }, error: null });
    categoryPage.mockReturnValue({ data: null, error: { message: 'Tree unavailable' } });
    await expect(fetchCategoryContext('fashion')).rejects.toThrow('Tree unavailable');
  });

  it('returns not found when the category does not exist', async () => {
    categoryLookup.mockResolvedValue({ data: null, error: null });
    categoryPage.mockReturnValue({ data: [], error: null });
    const result = await fetchCategoryContext('missing');
    expect(result.category).toBeNull();
  });
});
