-- Full-text search upgrade for products table
--
-- STRATEGY:
--   1. Add search_vector tsvector column (weighted: name=A, brand=B, short_desc=C, tags=D)
--   2. Apostrophes/backticks stripped before indexing so "Pond's"→"ponds", "L'Oreal"→"loreal"
--      This means queries like "ponds", "pond's", or "loreal" all find the right products.
--   3. GIN index on search_vector → O(log N) lookup instead of full-table ilike scan
--   4. Trigram GIN indexes on name/brand for partial-word fallback (e.g. typing "niaci")
--   5. BEFORE INSERT/UPDATE trigger keeps search_vector in sync automatically
--   6. RPC search_products_fts: FTS primary → trigram ilike fallback if FTS returns 0
--   7. Grant execute to anon + authenticated so Supabase JS client can call it

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Enable pg_trgm for trigram similarity / partial-word fallback
-- ─────────────────────────────────────────────────────────────────────────────
create extension if not exists pg_trgm schema extensions;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Add search_vector column (safe to run multiple times)
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.products
  add column if not exists search_vector tsvector;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Helper: normalize text before vectorising
--    Strips apostrophes/backticks so "Pond's"→"Ponds", "L'Oreal"→"LOreal"
--    This lets users search with or without the apostrophe and always match.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.normalize_search_text(input_text text)
returns text
language sql
immutable
security invoker
set search_path = public
as $$
  select regexp_replace(coalesce(input_text, ''), $re$['`]$re$, '', 'g')
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Trigger function — rebuild search_vector on INSERT/UPDATE
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.products_update_search_vector()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.search_vector :=
    setweight(to_tsvector('simple', public.normalize_search_text(new.name)),              'A') ||
    setweight(to_tsvector('simple', public.normalize_search_text(new.brand)),             'B') ||
    setweight(to_tsvector('simple', public.normalize_search_text(new.short_description)), 'C') ||
    setweight(to_tsvector('simple', public.normalize_search_text(
      array_to_string(coalesce(new.tags, '{}'), ' ')
    )), 'D');
  return new;
end;
$$;

-- Drop and recreate trigger to ensure it's on the right columns
drop trigger if exists products_search_vector_trigger on public.products;
create trigger products_search_vector_trigger
  before insert or update of name, brand, short_description, tags
  on public.products
  for each row execute function public.products_update_search_vector();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. GIN index on search_vector (primary FTS index — fast @@ lookups)
-- ─────────────────────────────────────────────────────────────────────────────
create index if not exists idx_products_search_vector
  on public.products using gin(search_vector);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Trigram GIN indexes on name and brand
--    Used for partial-word fallback: typing "niaci" finds "Niacinamide"
-- ─────────────────────────────────────────────────────────────────────────────
create index if not exists idx_products_name_trgm
  on public.products using gin(name gin_trgm_ops);

create index if not exists idx_products_brand_trgm
  on public.products using gin(brand gin_trgm_ops);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Backfill existing products
-- ─────────────────────────────────────────────────────────────────────────────
update public.products
set search_vector =
  setweight(to_tsvector('simple', public.normalize_search_text(name)),              'A') ||
  setweight(to_tsvector('simple', public.normalize_search_text(brand)),             'B') ||
  setweight(to_tsvector('simple', public.normalize_search_text(short_description)), 'C') ||
  setweight(to_tsvector('simple', public.normalize_search_text(
    array_to_string(coalesce(tags, '{}'), ' ')
  )), 'D');

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. RPC: search_products_fts
--
--    Flow:
--      a) Normalize query (strip apostrophes)
--      b) Build tsquery with websearch_to_tsquery('simple', ...)
--      c) Run FTS with ts_rank_cd scoring
--      d) If FTS returns 0 rows → trigram/ilike fallback for partial words
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.search_products_fts(
  query_text   text,
  result_limit int default 8
)
returns table (
  id                uuid,
  public_product_id varchar(12),
  name              text,
  slug              text,
  brand             text,
  short_description text,
  description       text,
  image_url         text,
  tags              text[],
  is_active         boolean,
  approval_status   text,
  created_at        timestamptz,
  category          uuid,
  sub_category      uuid,
  product_type      uuid,
  rank              float4
)
language plpgsql
security invoker
set search_path = public, extensions  -- extensions needed for word_similarity (pg_trgm)
as $$
declare
  clean      text;
  ts_query   tsquery;
  fts_count  int := 0;
begin
  -- Normalize: lowercase, strip apostrophes/backticks
  clean := lower(regexp_replace(trim(query_text), $re$['`]$re$, '', 'g'));
  if clean = '' then return; end if;

  -- Build tsquery; websearch_to_tsquery handles multi-word, quoted phrases,
  -- minus-exclusion, and most punctuation gracefully.
  begin
    ts_query := websearch_to_tsquery('simple', clean);
  exception when others then
    ts_query := null;
  end;

  -- ── Primary: full-text search ──────────────────────────────────────────────
  if ts_query is not null and ts_query::text <> '' then
    return query
      select
        p.id,
        p.public_product_id,
        p.name,
        p.slug,
        p.brand,
        p.short_description,
        p.description,
        p.image_url,
        p.tags,
        p.is_active,
        p.approval_status,
        p.created_at,
        p.category,
        p.sub_category,
        p.product_type,
        ts_rank_cd(p.search_vector, ts_query, 32)::float4 as rank
      from public.products p
      where p.approval_status = 'approved'
        and p.is_active = true
        and p.search_vector @@ ts_query
      order by rank desc, p.created_at desc
      limit result_limit;

    get diagnostics fts_count = row_count;
    if fts_count > 0 then return; end if;
  end if;

  -- ── Fallback: trigram / ilike for partial words ────────────────────────────
  -- Handles: "niaci" finding "Niacinamide", very short 1-3 char queries, etc.
  return query
    select
      p.id,
      p.public_product_id,
      p.name,
      p.slug,
      p.brand,
      p.short_description,
      p.description,
      p.image_url,
      p.tags,
      p.is_active,
      p.approval_status,
      p.created_at,
      p.category,
      p.sub_category,
      p.product_type,
      greatest(
        word_similarity(clean, lower(coalesce(p.name, ''))),
        word_similarity(clean, lower(coalesce(p.brand, '')))
      )::float4 as rank
    from public.products p
    where p.approval_status = 'approved'
      and p.is_active = true
      and (
        lower(p.name)              ilike '%' || clean || '%'
        or lower(p.brand)          ilike '%' || clean || '%'
        or lower(p.short_description) ilike '%' || clean || '%'
      )
    order by rank desc, p.created_at desc
    limit result_limit;
end;
$$;

-- Grant to anon (guest users) and authenticated (logged-in users)
grant execute on function public.search_products_fts(text, int) to anon;
grant execute on function public.search_products_fts(text, int) to authenticated;

-- Grant normalize helper to service_role (internal use)
grant execute on function public.normalize_search_text(text) to service_role;

commit;
