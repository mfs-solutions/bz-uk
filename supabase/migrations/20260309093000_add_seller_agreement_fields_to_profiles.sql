begin;

alter table public.profiles
  add column if not exists seller_agreement_accepted boolean not null default false,
  add column if not exists seller_agreement_accepted_at timestamptz;

commit;
