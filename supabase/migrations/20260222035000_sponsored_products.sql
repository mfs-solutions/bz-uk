-- Sponsored products scheduling for homepage sections
-- Sections: featured, trending, hot-deals

create extension if not exists btree_gist;

create table if not exists public.sponsored_products (
  id uuid primary key default gen_random_uuid(),
  section text not null check (section in ('featured', 'trending', 'hot-deals')),
  seller_id uuid not null references public.profiles(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sponsored_products_duration_chk check (
    end_at > start_at
    and end_at - start_at >= interval '24 hours'
    and end_at - start_at <= interval '30 days'
  )
);

create index if not exists idx_sponsored_products_section_time
  on public.sponsored_products (section, start_at, end_at)
  where is_active = true;

create index if not exists idx_sponsored_products_product_time
  on public.sponsored_products (product_id, start_at, end_at)
  where is_active = true;

-- A product cannot be sponsored in multiple sections over overlapping time windows.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'sponsored_products_no_cross_section_overlap'
  ) then
    alter table public.sponsored_products
      add constraint sponsored_products_no_cross_section_overlap
      exclude using gist (
        product_id with =,
        tstzrange(start_at, end_at, '[)') with &&
      )
      where (is_active = true);
  end if;
end $$;

create or replace function public.set_sponsored_products_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_sponsored_products_updated_at on public.sponsored_products;
create trigger trg_sponsored_products_updated_at
before update on public.sponsored_products
for each row execute function public.set_sponsored_products_updated_at();

create or replace function public.validate_sponsored_products_row()
returns trigger
language plpgsql
as $$
declare
  product_seller_id uuid;
  seller_verified boolean;
begin
  select p.seller_id into product_seller_id
  from public.products p
  where p.id = new.product_id;

  if product_seller_id is null then
    raise exception 'Selected product does not exist.';
  end if;

  if product_seller_id <> new.seller_id then
    raise exception 'Selected product does not belong to selected seller.';
  end if;

  select coalesce(pr.is_verified, false) into seller_verified
  from public.profiles pr
  where pr.id = new.seller_id and pr.role = 'seller';

  if not seller_verified then
    raise exception 'Selected seller is not verified.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_sponsored_products_row on public.sponsored_products;
create trigger trg_validate_sponsored_products_row
before insert or update on public.sponsored_products
for each row execute function public.validate_sponsored_products_row();

create or replace function public.enforce_sponsored_section_limit()
returns trigger
language plpgsql
as $$
declare
  overlap_count integer;
begin
  select count(*) into overlap_count
  from public.sponsored_products sp
  where sp.section = new.section
    and sp.is_active = true
    and sp.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
    and tstzrange(sp.start_at, sp.end_at, '[)') && tstzrange(new.start_at, new.end_at, '[)');

  if overlap_count >= 20 then
    raise exception 'A section can have at most 20 sponsored products in overlapping duration windows.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_sponsored_section_limit on public.sponsored_products;
create trigger trg_enforce_sponsored_section_limit
before insert or update on public.sponsored_products
for each row execute function public.enforce_sponsored_section_limit();

alter table public.sponsored_products enable row level security;

-- Public can read only currently active sponsored rows.
drop policy if exists sponsored_products_public_read_active on public.sponsored_products;
create policy sponsored_products_public_read_active
on public.sponsored_products
for select
using (
  is_active = true
  and start_at <= now()
  and end_at > now()
);

-- Admin can read everything.
drop policy if exists sponsored_products_admin_read_all on public.sponsored_products;
create policy sponsored_products_admin_read_all
on public.sponsored_products
for select
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);

-- Admin can insert.
drop policy if exists sponsored_products_admin_insert on public.sponsored_products;
create policy sponsored_products_admin_insert
on public.sponsored_products
for insert
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);

-- Admin can update.
drop policy if exists sponsored_products_admin_update on public.sponsored_products;
create policy sponsored_products_admin_update
on public.sponsored_products
for update
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);

-- Admin can delete.
drop policy if exists sponsored_products_admin_delete on public.sponsored_products;
create policy sponsored_products_admin_delete
on public.sponsored_products
for delete
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);
