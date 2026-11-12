-- Align seller_kyc schema with seller profile/dashboard data usage.
-- Safe on existing environments (adds only missing columns).

begin;

alter table if exists public.seller_kyc
  add column if not exists business_name text,
  add column if not exists brand_name text,
  add column if not exists business_type_id uuid references public.business_types(id) on delete set null;

create index if not exists idx_seller_kyc_business_type_id on public.seller_kyc (business_type_id);

commit;
