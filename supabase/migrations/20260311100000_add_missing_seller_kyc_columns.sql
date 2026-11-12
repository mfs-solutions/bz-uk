-- Add missing seller_kyc columns used by SellerKYCMultiStep form.
-- Safe on existing environments (adds only missing columns).

begin;

alter table if exists public.seller_kyc
  -- Draft / progress tracking
  add column if not exists kyc_form_id              text,
  add column if not exists current_step              integer default 1,
  add column if not exists completed_steps           jsonb default '[]'::jsonb,
  add column if not exists reference_number          text,
  add column if not exists business_address          jsonb default '{}'::jsonb,

  -- Step 2: Business details
  add column if not exists business_registration_number text,
  add column if not exists tax_type                  text,
  add column if not exists tax_id_number             text,
  add column if not exists declaration_accepted      boolean default false,

  -- Step 3: Bank details
  add column if not exists bank_name                 text,
  add column if not exists branch_name               text,
  add column if not exists swift_routing_code        text,
  add column if not exists bank_authorization        boolean default false,

  -- Step 4: Document URLs
  add column if not exists id_back_url               text,
  add column if not exists business_reg_url          text,
  add column if not exists tax_doc_url               text;

-- Index on kyc_form_id for quick lookups
create index if not exists idx_seller_kyc_form_id on public.seller_kyc (kyc_form_id);

commit;
