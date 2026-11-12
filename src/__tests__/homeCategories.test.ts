import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchCategories, fetchCategoriesFlat } from '../lib/productService';

const { from, eq, range, response } = vi.hoisted(() => ({
  from: vi.fn(),
  eq: vi.fn(),
  range: vi.fn(),
  response: vi.fn(),
}));

vi.mock('../lib/supabase', () => {
  const query = {
    select: () => query,
    order: () => query,
    range: (start: number, end: number) => { range(start, end); return query; },
    eq: (field: string, value: unknown) => { eq(field, value); return query; },
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(response()).then(resolve),
  };
  from.mockReturnValue(query);
  return { supabase: { from } };
});

vi.mock('../lib/notificationService', () => ({
  notifyAccountEvent: vi.fn(),
  notifyAdminsOfEvent: vi.fn(),
}));

describe('homepage categories', () => {
  beforeEach(() => {
    eq.mockClear();
    range.mockClear();
    response.mockReset();
  });

  it('fetches only active top-level categories and preserves pagination', async () => {
    const firstPage = Array.from({ length: 1000 }, (_, index) => ({ id: String(index), level: 1 }));
    response.mockReturnValueOnce({ data: firstPage, error: null });
    response.mockReturnValueOnce({ data: [{ id: 'last', level: 1 }], error: null });

    const result = await fetchCategories();

    expect(result.data).toHaveLength(1001);
    expect(eq).toHaveBeenCalledWith('is_active', true);
    expect(eq).toHaveBeenCalledWith('level', 1);
    expect(range).toHaveBeenNthCalledWith(1, 0, 999);
    expect(range).toHaveBeenNthCalledWith(2, 1000, 1999);
  });

  it('does not restrict the full category tree to top-level categories', async () => {
    response.mockReturnValue({ data: [{ id: 'child', level: 2 }], error: null });

    const result = await fetchCategoriesFlat();

    expect(result.data).toHaveLength(1);
    expect(eq).not.toHaveBeenCalledWith('level', expect.anything());
  });
});
