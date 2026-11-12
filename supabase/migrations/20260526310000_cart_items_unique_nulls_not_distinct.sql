-- Replace the FUNCTIONAL unique index cart_items_unique_variant_v2 with a
-- plain column-tuple UNIQUE constraint that uses NULLS NOT DISTINCT (PG 15+).
--
-- WHY: the frontend syncItemToBackend() upsert uses
--   onConflict: 'user_id,product_id,selected_size,selected_color,selected_variant_sku'
-- which becomes
--   ON CONFLICT (user_id, product_id, selected_size, selected_color, selected_variant_sku)
-- Postgres requires this column tuple to match a NON-functional unique
-- constraint. The previous functional index used COALESCE(...) per column,
-- so PostgREST emitted the column tuple but PG raised
--   "there is no unique or exclusion constraint matching the ON CONFLICT specification"
-- and every upsert silently failed (errors swallowed by the try/catch in
-- syncItemToBackend), so quantity changes never persisted.
--
-- NULLS NOT DISTINCT keeps the behaviour intended by the previous COALESCE
-- index: rows whose (size,color,sku) are NULL collapse onto a single row
-- per (user_id, product_id), preventing the duplicate-row pile-up that
-- caused the earlier 44 / 69 / 83 quantity inflation.

-- 1. Drop the old functional index.
drop index if exists public.cart_items_unique_variant_v2;

-- 2. Defensive dedupe: if any NULL/blank-only duplicates linger, keep the
--    newest row (lower quantity, since the migration that inflated them was
--    already purged). Use ROW_NUMBER, not SUM, to avoid re-introducing the
--    quantity inflation bug.
with ranked as (
  select id,
         row_number() over (
           partition by user_id, product_id, selected_size, selected_color, selected_variant_sku
           order by updated_at desc, id
         ) as rn
    from public.cart_items
)
delete from public.cart_items
 where id in (select id from ranked where rn > 1);

-- 3. Add the proper unique constraint.
alter table public.cart_items
  add constraint cart_items_unique_variant_v2
  unique nulls not distinct (
    user_id, product_id, selected_size, selected_color, selected_variant_sku
  );

comment on constraint cart_items_unique_variant_v2 on public.cart_items is
  'One row per (user, product, size, color, variant SKU). NULL columns treated as equal so onConflict from the JS client resolves correctly.';
