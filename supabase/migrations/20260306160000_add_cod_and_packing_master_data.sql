-- Add product-level COD control and packing master tables/columns

create table if not exists public.packing_types (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  description text default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint packing_types_code_unique unique (code)
);

create table if not exists public.measurement_units (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  category text not null check (category in ('weight', 'dimension', 'both')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint measurement_units_code_unique unique (code)
);

alter table public.packing_types enable row level security;
alter table public.measurement_units enable row level security;

grant select on table public.packing_types to anon, authenticated;
grant select on table public.measurement_units to anon, authenticated;

drop policy if exists packing_types_select_all on public.packing_types;
create policy packing_types_select_all
  on public.packing_types
  for select
  to anon, authenticated
  using (is_active = true);

drop policy if exists measurement_units_select_all on public.measurement_units;
create policy measurement_units_select_all
  on public.measurement_units
  for select
  to anon, authenticated
  using (is_active = true);

insert into public.packing_types (code, name, description, is_active)
values
  ('POLYBAG', 'Polybag', 'Lightweight flexible packaging', true),
  ('CORRUGATED_BOX', 'Corrugated Box', 'Rigid corrugated cardboard box', true),
  ('BUBBLE_WRAP', 'Bubble Wrap', 'Protective bubble cushioning wrap', true),
  ('ENVELOPE', 'Envelope', 'Flat document or soft-goods envelope', true),
  ('WOODEN_CRATE', 'Wooden Crate', 'Heavy-duty wooden crate packaging', true)
on conflict (code) do update
set
  name = excluded.name,
  description = excluded.description,
  is_active = excluded.is_active,
  updated_at = now();

insert into public.measurement_units (code, name, category, is_active)
values
  ('KG', 'Kilogram (kg)', 'weight', true),
  ('G', 'Gram (g)', 'weight', true),
  ('LB', 'Pound (lb)', 'weight', true),
  ('OZ', 'Ounce (oz)', 'weight', true),
  ('CM', 'Centimeter (cm)', 'dimension', true),
  ('MM', 'Millimeter (mm)', 'dimension', true),
  ('M', 'Meter (m)', 'dimension', true),
  ('IN', 'Inch (in)', 'dimension', true),
  ('FT', 'Foot (ft)', 'dimension', true)
on conflict (code) do update
set
  name = excluded.name,
  category = excluded.category,
  is_active = excluded.is_active,
  updated_at = now();

alter table public.products
  add column if not exists is_cod_available boolean not null default true,
  add column if not exists packing_type_id uuid references public.packing_types(id) on delete set null,
  add column if not exists package_weight_unit_id uuid references public.measurement_units(id) on delete set null,
  add column if not exists package_length_unit_id uuid references public.measurement_units(id) on delete set null,
  add column if not exists package_width_unit_id uuid references public.measurement_units(id) on delete set null,
  add column if not exists package_height_unit_id uuid references public.measurement_units(id) on delete set null;

create index if not exists idx_products_is_cod_available on public.products(is_cod_available);
create index if not exists idx_products_packing_type_id on public.products(packing_type_id);

update public.products
set
  package_weight_unit_id = coalesce(
    package_weight_unit_id,
    (select id from public.measurement_units where code = 'KG' limit 1)
  ),
  package_length_unit_id = coalesce(
    package_length_unit_id,
    (select id from public.measurement_units where code = 'CM' limit 1)
  ),
  package_width_unit_id = coalesce(
    package_width_unit_id,
    (select id from public.measurement_units where code = 'CM' limit 1)
  ),
  package_height_unit_id = coalesce(
    package_height_unit_id,
    (select id from public.measurement_units where code = 'CM' limit 1)
  );
