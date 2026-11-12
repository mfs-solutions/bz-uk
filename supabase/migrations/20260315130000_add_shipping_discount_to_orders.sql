-- Add shipping_charge and offer_discount to orders table for invoice display
alter table public.orders add column if not exists shipping_charge numeric(12,2) default 0;
alter table public.orders add column if not exists offer_discount numeric(12,2) default 0;
