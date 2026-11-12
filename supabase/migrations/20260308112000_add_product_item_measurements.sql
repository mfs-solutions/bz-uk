-- Add seller product item measurement fields used by listing Product Details > Measurements.
alter table public.products
  add column if not exists measurement_unit_count integer,
  add column if not exists measurement_unit_label text,
  add column if not exists measurement_item_weight numeric(10,3),
  add column if not exists measurement_item_weight_unit_id uuid references public.measurement_units(id) on delete set null,
  add column if not exists measurement_item_length numeric(10,3),
  add column if not exists measurement_item_width numeric(10,3),
  add column if not exists measurement_item_height numeric(10,3),
  add column if not exists measurement_item_dimension_unit_id uuid references public.measurement_units(id) on delete set null,
  add column if not exists measurement_number_of_items integer,
  add column if not exists measurement_total_servings_per_container integer;

create index if not exists idx_products_measurement_item_weight_unit_id
  on public.products(measurement_item_weight_unit_id);

create index if not exists idx_products_measurement_item_dimension_unit_id
  on public.products(measurement_item_dimension_unit_id);
