begin;

create index if not exists idx_products_search_public_id_normalized
  on public.products (lower(trim(public_product_id)))
  where public_product_id is not null;

create index if not exists idx_products_search_sku_normalized
  on public.products (lower(trim(sku)))
  where sku is not null;

create index if not exists idx_product_variants_search_sku_normalized
  on public.product_variants (lower(trim(sku)))
  where sku is not null;

create or replace function public.search_products_catalog(
  p_query_text text,
  p_result_limit integer default 24,
  p_result_offset integer default 0
)
returns table (
  id uuid,
  public_product_id varchar(12),
  name text,
  slug text,
  brand text,
  short_description text,
  description text,
  image_url text,
  tags text[],
  is_active boolean,
  approval_status text,
  created_at timestamptz,
  category uuid,
  sub_category uuid,
  product_type uuid,
  rank real,
  total_count bigint
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with normalized_query as (
    select lower(regexp_replace(trim(coalesce(p_query_text, '')), $re$['`]$re$, '', 'g')) as query
  ),
  fts_matches as (
    select
      result.id,
      (400000 + greatest(result.rank, 0) * 10000)::real as rank
    from normalized_query q
    cross join lateral public.search_products_fts(p_query_text, 5000) result
    where q.query <> ''
  ),
  direct_matches as (
    select
      p.id,
      case
        when lower(trim(coalesce(p.public_product_id, ''))) = q.query
          or lower(trim(coalesce(p.sku, ''))) = q.query
          or exists (
            select 1
            from public.product_variants pv
            where pv.product_id = p.id
              and lower(trim(coalesce(pv.sku, ''))) = q.query
          )
          then 1000000::real
        when lower(trim(coalesce(p.name, ''))) = q.query
          then 900000::real
        when left(lower(coalesce(p.name, '')), length(q.query)) = q.query
          then 800000::real
        when lower(trim(coalesce(p.brand, ''))) = q.query
          then 700000::real
        when left(lower(coalesce(p.brand, '')), length(q.query)) = q.query
          then 600000::real
        when position(q.query in lower(coalesce(p.name, ''))) > 0
          then 500000::real
        when position(q.query in lower(coalesce(p.brand, ''))) > 0
          then 450000::real
        when exists (
          select 1
          from public.product_variants pv
          where pv.product_id = p.id
            and position(
              q.query in lower(concat_ws(' ', pv.sku, pv.size, pv.size_value, pv.color))
            ) > 0
        )
          then 400000::real
        when exists (
          select 1
          from public.categories c
          where c.id in (p.category, p.sub_category, p.product_type)
            and position(q.query in lower(coalesce(c.name, ''))) > 0
        )
          then 250000::real
        else (
          200000
          + greatest(
              word_similarity(q.query, lower(coalesce(p.name, ''))),
              word_similarity(q.query, lower(coalesce(p.brand, '')))
            ) * 10000
        )::real
      end as rank
    from public.products p
    cross join normalized_query q
    where q.query <> ''
      and p.approval_status = 'approved'
      and p.is_active = true
      and (
        lower(trim(coalesce(p.public_product_id, ''))) = q.query
        or lower(trim(coalesce(p.sku, ''))) = q.query
        or lower(trim(coalesce(p.name, ''))) = q.query
        or left(lower(coalesce(p.name, '')), length(q.query)) = q.query
        or lower(trim(coalesce(p.brand, ''))) = q.query
        or left(lower(coalesce(p.brand, '')), length(q.query)) = q.query
        or position(q.query in lower(coalesce(p.name, ''))) > 0
        or position(q.query in lower(coalesce(p.brand, ''))) > 0
        or exists (
          select 1
          from public.product_variants pv
          where pv.product_id = p.id
            and (
              lower(trim(coalesce(pv.sku, ''))) = q.query
              or position(
                q.query in lower(concat_ws(' ', pv.sku, pv.size, pv.size_value, pv.color))
              ) > 0
            )
        )
        or exists (
          select 1
          from public.categories c
          where c.id in (p.category, p.sub_category, p.product_type)
            and position(q.query in lower(coalesce(c.name, ''))) > 0
        )
        or q.query <% coalesce(p.name, '')
        or q.query <% coalesce(p.brand, '')
      )
  ),
  best_matches as (
    select matches.id, max(matches.rank) as rank
    from (
      select id, rank from fts_matches
      union all
      select id, rank from direct_matches
    ) matches
    group by matches.id
  ),
  counted_matches as (
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
      matches.rank,
      count(*) over () as total_count
    from best_matches matches
    join public.products p on p.id = matches.id
    where p.approval_status = 'approved'
      and p.is_active = true
  )
  select
    result.id,
    result.public_product_id,
    result.name,
    result.slug,
    result.brand,
    result.short_description,
    result.description,
    result.image_url,
    result.tags,
    result.is_active,
    result.approval_status,
    result.created_at,
    result.category,
    result.sub_category,
    result.product_type,
    result.rank,
    result.total_count
  from counted_matches result
  order by result.rank desc, result.created_at desc, result.id
  limit least(greatest(coalesce(p_result_limit, 24), 1), 50)
  offset least(greatest(coalesce(p_result_offset, 0), 0), 10000);
$$;

grant execute on function public.search_products_catalog(text, integer, integer)
  to anon, authenticated;

commit;
