-- Add additional listing content columns requested for products.
-- Uses IF NOT EXISTS so it is safe on environments where a column already exists.

alter table if exists public.products
  add column if not exists ingredients text,
  add column if not exists directions text,
  add column if not exists manufacturer_name text,
  add column if not exists manufacturer_country text,
  add column if not exists important_note text;
