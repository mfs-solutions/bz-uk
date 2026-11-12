begin;

alter table public.uk_hosted_checkout_sessions
  add column if not exists payment_failure_confirmed_at timestamptz;

commit;
