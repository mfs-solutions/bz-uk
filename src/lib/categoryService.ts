import { supabase } from './supabase';

/* ═══════════════════════════════════════════════════════════════
   Category Service — CRUD for 3-level categories + HSN codes
   ═══════════════════════════════════════════════════════════════ */

export interface Category {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  level: number;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CategoryHsnCode {
  id: string;
  category_slug: string;
  hsn_code: string;
  description: string | null;
  created_at: string;
}

/* ── Helpers ─────────────────────────────────────────────────── */

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// The `slug` column has a GLOBAL unique constraint (categories_slug_key), but
// category names are NOT unique (e.g. "Mega Combo" exists 40x under different
// parents). A name-only slug therefore collides and the insert fails with a
// 23505 unique violation. This returns the first free slug of the form
// `<base>`, `<base>-2`, `<base>-3`, ... based on slugs already in the table.
async function generateUniqueSlug(base: string): Promise<string> {
  const safeBase = base || 'category';
  const { data, error } = await supabase
    .from('categories')
    .select('slug')
    .or(`slug.eq.${safeBase},slug.like.${safeBase}-%`);
  if (error) throw error;
  const taken = new Set((data ?? []).map((r: { slug: string }) => r.slug));
  if (!taken.has(safeBase)) return safeBase;
  let n = 2;
  while (taken.has(`${safeBase}-${n}`)) n++;
  return `${safeBase}-${n}`;
}

/* ── Fetch ───────────────────────────────────────────────────── */

export async function fetchAllCategories(): Promise<Category[]> {
  // PostgREST returns at most 1000 rows per request; there are more categories
  // than that, so page through with .range() to avoid dropping rows past 1000.
  const pageSize = 1000;
  const all: Category[] = [];
  let from = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('level', { ascending: true })
      .order('display_order', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const batch = data ?? [];
    all.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

export async function fetchCategoriesByLevel(level: number, parentId?: string | null): Promise<Category[]> {
  let query = supabase
    .from('categories')
    .select('*')
    .eq('level', level)
    .order('display_order', { ascending: true });

  if (parentId !== undefined && parentId !== null) {
    query = query.eq('parent_id', parentId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function fetchAllHsnCodes(): Promise<CategoryHsnCode[]> {
  // Page past the 1000-row PostgREST cap so no HSN codes are silently dropped.
  const pageSize = 1000;
  const all: CategoryHsnCode[] = [];
  let from = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from('category_hsn_codes')
      .select('*')
      .order('category_slug', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const batch = data ?? [];
    all.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

/* ── Create ──────────────────────────────────────────────────── */

export async function createCategory(input: {
  name: string;
  parent_id: string | null;
  level: number;
  display_order: number;
  is_active: boolean;
}): Promise<Category> {
  const base = slugify(input.name);
  let slug = await generateUniqueSlug(base);
  // Retry on a 23505 race (another insert grabbed the same slug between the
  // read above and our write). The only unique constraint on categories is
  // categories_slug_key, so a 23505 here always means the slug collided.
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data, error } = await supabase
      .from('categories')
      .insert({ ...input, slug })
      .select()
      .single();
    if (!error) return data;
    if ((error as { code?: string }).code !== '23505') throw error;
    slug = attempt < 2 ? await generateUniqueSlug(base) : `${base}-${Date.now().toString(36)}`;
  }
  throw new Error('Could not create category: slug remained in conflict after several retries');
}

export async function createHsnCode(input: {
  category_slug: string;
  hsn_code: string;
  description: string;
}): Promise<CategoryHsnCode> {
  const { data, error } = await supabase
    .from('category_hsn_codes')
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/* ── Update ──────────────────────────────────────────────────── */

export async function updateCategory(
  id: string,
  input: Partial<Pick<Category, 'name' | 'display_order' | 'is_active'>>,
): Promise<Category> {
  // NOTE: slug is intentionally NOT regenerated on rename. The slug is a
  // stable identifier used by /category/:slug URLs and is the foreign key that
  // links category_hsn_codes (category_hsn_codes.category_slug, UNIQUE).
  // Regenerating it on every rename silently orphaned the HSN row and broke
  // existing category links. Renames only change the display name.
  const payload: Record<string, unknown> = { ...input };
  const { data, error } = await supabase
    .from('categories')
    .update(payload)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateHsnCode(
  id: string,
  input: Partial<Pick<CategoryHsnCode, 'hsn_code' | 'description'>>,
): Promise<CategoryHsnCode> {
  const { data, error } = await supabase
    .from('category_hsn_codes')
    .update(input)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/* ── Delete ──────────────────────────────────────────────────── */

export async function deleteCategory(id: string): Promise<void> {
  const { error } = await supabase.from('categories').delete().eq('id', id);
  if (error) throw error;
}

export async function deleteHsnCode(id: string): Promise<void> {
  const { error } = await supabase.from('category_hsn_codes').delete().eq('id', id);
  if (error) throw error;
}
