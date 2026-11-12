-- ─────────────────────────────────────────────────────────────────────────────
-- Cart uniqueness must include selected_variant_sku so SKU-only-differentiated
-- variants (12 known products on prod) stop colliding under the prior
-- (user_id, product_id, selected_size, selected_color) key.
--
-- Postgres treats NULLs as distinct; using a unique INDEX on COALESCE(...)
-- preserves uniqueness for rows with null size/color/sku.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Drop the old table-level unique constraint if it exists.
alter table public.cart_items
  drop constraint if exists cart_items_unique_variant;

-- 2. Deduplicate existing rows BEFORE creating the new unique index.
--    Strategy: for each (user, product, size, color, sku) group keep the
--    most recently updated row, sum quantities from duplicates into it,
--    then delete the duplicate rows.
with ranked as (
  select id, user_id, product_id,
         coalesce(selected_size,'')         as sz,
         coalesce(selected_color,'')        as cl,
         coalesce(selected_variant_sku,'')  as sku,
         quantity, updated_at,
         row_number() over (
           partition by user_id, product_id,
                        coalesce(selected_size,''),
                        coalesce(selected_color,''),
                        coalesce(selected_variant_sku,'')
           order by updated_at desc, quantity desc, id
         ) as rn
  from public.cart_items
),
keepers as (
  select user_id, product_id, sz, cl, sku, id as keeper_id,
         (select sum(r2.quantity)
            from ranked r2
           where r2.user_id    = r1.user_id
             and r2.product_id = r1.product_id
             and r2.sz = r1.sz and r2.cl = r1.cl and r2.sku = r1.sku) as merged_qty
  from ranked r1
  where rn = 1
)
update public.cart_items ci
   set quantity = least(keepers.merged_qty, 999)
  from keepers
 where ci.id = keepers.keeper_id
   and ci.quantity <> least(keepers.merged_qty, 999);

delete from public.cart_items ci
 where exists (
   select 1
     from public.cart_items dupe
    where dupe.user_id    = ci.user_id
      and dupe.product_id = ci.product_id
      and coalesce(dupe.selected_size,'')         = coalesce(ci.selected_size,'')
      and coalesce(dupe.selected_color,'')        = coalesce(ci.selected_color,'')
      and coalesce(dupe.selected_variant_sku,'')  = coalesce(ci.selected_variant_sku,'')
      and (dupe.updated_at, dupe.quantity, dupe.id) > (ci.updated_at, ci.quantity, ci.id)
 );

-- 3. Create the new functional unique index that includes variant SKU.
drop index if exists public.cart_items_unique_variant_v2;

create unique index cart_items_unique_variant_v2
  on public.cart_items (
    user_id,
    product_id,
    coalesce(selected_size, ''),
    coalesce(selected_color, ''),
    coalesce(selected_variant_sku, '')
  );

comment on index public.cart_items_unique_variant_v2 is
  'One row per (user, product, size, color, variant SKU). Replaces cart_items_unique_variant.';

