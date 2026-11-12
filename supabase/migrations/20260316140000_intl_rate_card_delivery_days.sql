-- Add expected_delivery_days column to intl_rate_card
-- Default 11 days for all existing and new rows
alter table public.intl_rate_card
  add column if not exists expected_delivery_days integer not null default 11
  constraint intl_rate_delivery_days_positive check (expected_delivery_days > 0);
