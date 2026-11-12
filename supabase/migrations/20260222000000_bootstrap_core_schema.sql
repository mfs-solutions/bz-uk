-- Bootstrap core schema for environments where baseline SQL was not replayed.
-- This migration is intentionally idempotent and non-destructive.

begin;

create extension if not exists pgcrypto;

create table if not exists public.countries (
  id uuid primary key default gen_random_uuid(),
  country_name text,
  short_code varchar(3),
  country_code varchar(3),
  currency_code varchar(3) default 'INR',
  dialing_code varchar(10) default '+91',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.business_types (
  id uuid primary key default gen_random_uuid(),
  type_name text,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  phone text,
  avatar_url text,
  role text not null default 'user',
  is_verified boolean not null default false,
  approved boolean not null default false,
  country_id uuid references public.countries(id) on delete set null,
  business_type_id uuid references public.business_types(id) on delete set null,
  currency text default 'INR',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text,
  slug text,
  parent_id uuid references public.categories(id) on delete cascade,
  level int not null default 1,
  display_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid references public.profiles(id) on delete set null,
  name text not null default '',
  slug text not null default '',
  description text default '',
  short_description text default '',
  category uuid,
  sub_category uuid,
  brand text default '',
  model_number text default '',
  sku text default '',
  price numeric(12,2) not null default 0,
  mrp numeric(12,2),
  discount_price numeric(12,2),
  currency text not null default 'INR',
  origin_country text default '',
  origin_country_id uuid references public.countries(id) on delete set null,
  stock integer not null default 0,
  image_url text default '',
  images text[] default '{}',
  videos text[] default '{}',
  highlights jsonb default '[]'::jsonb,
  specifications jsonb default '{}'::jsonb,
  seller_notes text[] default '{}',
  platform_fee numeric(8,2),
  commission numeric(8,2),
  package_weight numeric(10,3),
  package_length numeric(10,3),
  package_width numeric(10,3),
  package_height numeric(10,3),
  shipping_type text default 'self',
  manufacturer_name text default '',
  manufacturer_address text default '',
  packing_details text default '',
  courier_partner text default '',
  cancellation_policy_days integer default 7,
  return_policy_days integer default 7,
  approval_status text not null default 'pending',
  is_active boolean not null default false,
  is_featured boolean not null default false,
  rating numeric(4,2) default 0,
  review_count integer default 0,
  tags text[] default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  variant_type text,
  size text,
  size_system text,
  size_value text,
  color text,
  color_hex text,
  sku text,
  price numeric(12,2) not null default 0,
  stock integer not null default 0,
  quantity integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.delivery_countries (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  country_code text,
  country_name text,
  delivery_charge numeric(12,2) not null default 0,
  min_order_qty integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.offer_rules (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  offer_type text,
  buy_quantity integer,
  get_quantity integer,
  special_day_name text,
  discount_percent numeric(8,2),
  start_time timestamptz,
  end_time timestamptz,
  bundle_min_qty integer,
  bundle_discount numeric(8,2),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tax_rules (
  id uuid primary key default gen_random_uuid(),
  name text default '',
  percentage numeric(8,4) not null default 0,
  country text default '',
  country_code text default '',
  product_id uuid references public.products(id) on delete cascade,
  category_id uuid,
  priority integer default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.countries (id, country_name, short_code, country_code, currency_code, dialing_code, is_active)
values
  ('508157e5-f8b4-4801-ae01-70c8a46671ff', 'India', 'IND', 'IND', 'INR', '+91', true),
  ('5040c610-e64f-44ca-b6ec-3e0ddb20d32b', 'United Kingdom', 'GBR', 'GBR', 'GBP', '+44', true)
on conflict (id) do update
set
  country_name = excluded.country_name,
  short_code = excluded.short_code,
  country_code = excluded.country_code,
  currency_code = excluded.currency_code,
  dialing_code = excluded.dialing_code,
  is_active = excluded.is_active;

create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

commit;
