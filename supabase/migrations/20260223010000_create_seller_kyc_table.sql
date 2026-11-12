-- Create seller_kyc table if it does not already exist.
-- This matches all columns referenced by kycService.ts and SellerKYC type.

begin;

create table if not exists public.seller_kyc (
  id            uuid primary key default gen_random_uuid(),
  seller_id     uuid not null references public.profiles(id) on delete cascade,

  -- Pre-filled from signup
  email         text,
  phone         text,
  full_name     text,
  country       text,

  -- Tax & Business Information
  pan           text,
  gstin         text,

  -- Identity Verification
  id_type       text,  -- aadhar | passport | voter | driver_license
  id_number     text,
  id_document_url text,

  -- Business Address (flattened)
  business_street_address_1 text,
  business_street_address_2 text,
  business_city             text,
  business_state            text,
  business_postal_code      text,
  business_country          text,
  address_proof_url         text,

  -- Bank Details
  bank_holder_name  text,
  account_number    text,
  account_type      text,  -- checking | savings | current
  ifsc_code         text,
  bank_statement_url text,

  -- Compliance & Legal
  pep_declaration   boolean default false,
  sanctions_check   boolean default false,
  aml_compliance    boolean default false,
  tax_compliance    boolean default false,
  terms_accepted    boolean default false,

  -- KYC Status & Metadata
  kyc_status        text not null default 'draft',  -- draft | pending | approved | rejected
  kyc_tier          smallint default 1,
  rejection_reason  text,
  verified_by_admin uuid,
  verified_at       timestamptz,

  -- Timestamps
  submitted_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- Each seller can only have one KYC record
  constraint seller_kyc_seller_id_unique unique (seller_id)
);

-- Enable RLS
alter table public.seller_kyc enable row level security;

-- Grant access to authenticated users (RLS policies control visibility)
grant select, insert, update, delete on table public.seller_kyc to authenticated;

-- ── RLS Policies ──────────────────────────────────────────────────────

-- Seller: read own KYC row
drop policy if exists seller_kyc_select_own on public.seller_kyc;
create policy seller_kyc_select_own
  on public.seller_kyc for select to authenticated
  using (seller_id = auth.uid());

-- Seller: create own KYC row
drop policy if exists seller_kyc_insert_own on public.seller_kyc;
create policy seller_kyc_insert_own
  on public.seller_kyc for insert to authenticated
  with check (seller_id = auth.uid());

-- Seller: update own KYC row
drop policy if exists seller_kyc_update_own on public.seller_kyc;
create policy seller_kyc_update_own
  on public.seller_kyc for update to authenticated
  using (seller_id = auth.uid())
  with check (seller_id = auth.uid());

-- Admin: read ALL KYC rows
drop policy if exists seller_kyc_admin_select_all on public.seller_kyc;
create policy seller_kyc_admin_select_all
  on public.seller_kyc for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
    or coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'admin'
    or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
  );

-- Admin: update ALL KYC rows
drop policy if exists seller_kyc_admin_update_all on public.seller_kyc;
create policy seller_kyc_admin_update_all
  on public.seller_kyc for update to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
    or coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'admin'
    or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
    or coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'admin'
    or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
  );

-- Admin: delete KYC rows
drop policy if exists seller_kyc_admin_delete_all on public.seller_kyc;
create policy seller_kyc_admin_delete_all
  on public.seller_kyc for delete to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
    or coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'admin'
    or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
  );

-- Auto-update updated_at timestamp
create or replace function public.update_seller_kyc_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists seller_kyc_updated_at on public.seller_kyc;
create trigger seller_kyc_updated_at
  before update on public.seller_kyc
  for each row execute function public.update_seller_kyc_updated_at();

commit;
