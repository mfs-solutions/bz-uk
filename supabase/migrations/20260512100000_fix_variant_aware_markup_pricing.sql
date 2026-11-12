-- Fix variant-aware markup pricing in get_public_product_prices_with_overrides.
--
-- ROOT BUG: the previous RPC used `coalesce(country_price.selling_price, effective_base_price)`
-- which ALWAYS returns the flat stored selling_price when any country pricing row exists,
-- completely ignoring any variant price override passed from the product details page.
--
-- FIX STRATEGY:
--   1. When an override (variant price) is provided AND markup_percent is set:
--      selling_price = override_price * (1 + markup_percent / 100)
--      markup_mrp    = (override_price * mrp_ratio) * (1 + markup_percent / 100)
--   2. When no override but product has variants AND markup_percent is set:
--      selling_price = min_variant_price * (1 + markup_percent / 100)   [listing card]
--      markup_mrp    = (min_variant_price * mrp_ratio) * (1 + markup_percent / 100)
--   3. Otherwise: use stored flat selling_price / markup_mrp (backward compat).
--
-- Also adds a BEFORE INSERT/UPDATE trigger on product_country_selling_prices so that
-- markup_percent is automatically recomputed whenever selling_price is saved by the admin.

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1.  Auto-sync trigger: keep markup_percent in sync with selling_price
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.sync_country_price_markup_percent()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_base_price numeric;
begin
  -- Fetch the product's default_selling_price (or price as fallback)
  select coalesce(nullif(p.default_selling_price, 0), nullif(p.price, 0))
    into v_base_price
    from public.products p
   where p.id = NEW.product_id;

  if v_base_price is not null and v_base_price > 0 and NEW.selling_price is not null then
    NEW.markup_percent := round(((NEW.selling_price / v_base_price) - 1) * 100, 4);
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_sync_markup_percent on public.product_country_selling_prices;
create trigger trg_sync_markup_percent
  before insert or update of selling_price
  on public.product_country_selling_prices
  for each row
  execute function public.sync_country_price_markup_percent();

-- Back-fill any rows where markup_percent is still NULL after previous migration
update public.product_country_selling_prices pcsp
set markup_percent = round(
  ((pcsp.selling_price / coalesce(nullif(p.default_selling_price, 0), nullif(p.price, 0))) - 1) * 100,
  4
)
from public.products p
where pcsp.product_id = p.id
  and pcsp.markup_percent is null
  and coalesce(nullif(p.default_selling_price, 0), nullif(p.price, 0)) > 0;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2.  Rewrite get_public_product_prices_with_overrides
-- ─────────────────────────────────────────────────────────────────────────────
drop function if exists public.get_public_product_prices_with_overrides(uuid[], text, jsonb);

create or replace function public.get_public_product_prices_with_overrides(
  p_product_ids     uuid[],
  p_country         text   default null,
  p_price_overrides jsonb  default null
)
returns table (
  product_id        uuid,
  selling_price     numeric,
  tax_rate          numeric,
  public_unit_price numeric,
  markup_mrp        numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with normalized_country as (
    select upper(regexp_replace(coalesce(p_country, ''), '\s+', '', 'g')) as country_token
  ),
  buyer_country as (
    select c.id
    from public.countries c
    cross join normalized_country nc
    where c.is_active = true
      and (
        upper(regexp_replace(coalesce(c.country_name, ''), '\s+', '', 'g')) = nc.country_token
        or upper(regexp_replace(coalesce(c.country_code, ''), '\s+', '', 'g')) = nc.country_token
        or upper(regexp_replace(coalesce(c.short_code, ''), '\s+', '', 'g')) = nc.country_token
        or upper(regexp_replace(coalesce(c.iso2, ''), '\s+', '', 'g')) = nc.country_token
      )
    order by c.country_name
    limit 1
  ),
  product_rows as (
    select
      p.id                                                      as product_id,
      coalesce(nullif(p.price, 0), 0)                           as raw_base_price,
      coalesce(nullif(p.default_selling_price, 0), p.price, 0)  as default_selling_price,
      coalesce(nullif(p.mrp, 0), 0)                             as base_mrp,
      -- Explicit variant price override provided by the caller (e.g. product details page)
      case
        when p_price_overrides is null then null
        when p_price_overrides ? p.id::text then (p_price_overrides ->> p.id::text)::numeric
        else null
      end as override_price
    from public.products p
    where p.id = any(p_product_ids)
  ),
  min_variant as (
    -- Cheapest available variant price per product (used for listing card display)
    select pv.product_id, min(pv.price) as min_price
    from public.product_variants pv
    where pv.product_id = any(p_product_ids)
      and pv.price is not null
      and pv.price > 0
    group by pv.product_id
  )
  select
    pr.product_id,

    -- ── SELLING PRICE ──────────────────────────────────────────────────────
    round(
      case
        -- Variant selected (override) + markup % known → apply markup to variant price
        when pr.override_price is not null
          and cp.markup_percent is not null
          and cp.markup_percent > 0
          then pr.override_price * (1.0 + cp.markup_percent / 100.0)

        -- Variant selected but no markup (0% or NULL) → use override directly
        when pr.override_price is not null
          then coalesce(cp.selling_price, pr.override_price)

        -- Listing card + variants exist + markup % known → use min variant price with markup
        when mv.min_price is not null
          and cp.markup_percent is not null
          and cp.markup_percent > 0
          then mv.min_price * (1.0 + cp.markup_percent / 100.0)

        -- Country flat price exists (no variants, or markup_percent = 0) → use stored price
        when cp.selling_price is not null
          then cp.selling_price

        -- Absolute fallback: product default selling price
        else pr.default_selling_price
      end,
      2
    ) as selling_price,

    0::numeric as tax_rate,

    -- ── PUBLIC UNIT PRICE (identical formula) ──────────────────────────────
    round(
      case
        when pr.override_price is not null
          and cp.markup_percent is not null
          and cp.markup_percent > 0
          then pr.override_price * (1.0 + cp.markup_percent / 100.0)
        when pr.override_price is not null
          then coalesce(cp.selling_price, pr.override_price)
        when mv.min_price is not null
          and cp.markup_percent is not null
          and cp.markup_percent > 0
          then mv.min_price * (1.0 + cp.markup_percent / 100.0)
        when cp.selling_price is not null
          then cp.selling_price
        else pr.default_selling_price
      end,
      2
    ) as public_unit_price,

    -- ── MARKUP MRP ─────────────────────────────────────────────────────────
    -- Derive variant/listing MRP by scaling product.mrp proportionally to the
    -- variant price, then applying the same markup percent.
    round(
      case
        -- Override: scale product.mrp by (override / base) then apply markup
        when pr.override_price is not null
          and cp.markup_percent is not null
          and cp.markup_percent > 0
          and pr.base_mrp > 0
          and pr.raw_base_price > 0
          then (pr.override_price * (pr.base_mrp::numeric / pr.raw_base_price::numeric))
               * (1.0 + cp.markup_percent / 100.0)

        -- Min variant: same approach with min_price
        when mv.min_price is not null
          and cp.markup_percent is not null
          and cp.markup_percent > 0
          and pr.base_mrp > 0
          and pr.raw_base_price > 0
          then (mv.min_price * (pr.base_mrp::numeric / pr.raw_base_price::numeric))
               * (1.0 + cp.markup_percent / 100.0)

        -- Stored markup_mrp from country pricing row
        when cp.markup_mrp is not null and cp.markup_mrp > 0
          then cp.markup_mrp

        -- Fallback: raw product MRP
        when pr.base_mrp > 0
          then pr.base_mrp

        else null
      end,
      2
    ) as markup_mrp

  from product_rows pr
  left join buyer_country bc on true
  left join lateral (
    select pcsp.selling_price, pcsp.markup_percent, pcsp.markup_mrp
    from public.product_country_selling_prices pcsp
    where pcsp.product_id = pr.product_id
      and bc.id is not null
      and pcsp.country_id = bc.id
    limit 1
  ) cp on true
  left join min_variant mv on mv.product_id = pr.product_id;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3.  Re-create the wrapper (return type unchanged)
-- ─────────────────────────────────────────────────────────────────────────────
drop function if exists public.get_public_product_prices(uuid[], text);

create or replace function public.get_public_product_prices(
  p_product_ids uuid[],
  p_country     text default null
)
returns table (
  product_id        uuid,
  selling_price     numeric,
  tax_rate          numeric,
  public_unit_price numeric,
  markup_mrp        numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select * from public.get_public_product_prices_with_overrides(p_product_ids, p_country, null::jsonb);
$$;

grant execute on function public.get_public_product_prices(uuid[], text)
  to anon, authenticated;
grant execute on function public.get_public_product_prices_with_overrides(uuid[], text, jsonb)
  to anon, authenticated;

commit;
