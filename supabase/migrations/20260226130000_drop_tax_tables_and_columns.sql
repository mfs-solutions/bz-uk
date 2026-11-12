-- Remove legacy tax integration objects
-- Safe to run multiple times due to IF EXISTS clauses.

drop function if exists public.resolve_tax_rate_for_product(uuid, uuid, text);

alter table if exists public.products
  drop column if exists gst_rate;

alter table if exists public.product_input_snapshots
  drop column if exists tax_details;

drop table if exists public.tax_rules cascade;
