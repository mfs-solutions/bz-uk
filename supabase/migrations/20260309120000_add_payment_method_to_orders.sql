-- Add payment_method column to orders table.
-- This column was referenced by checkout and cart flows but was never added to
-- the schema, causing "Could not find the 'payment_method' column" at runtime.

begin;

do $$
begin
  if to_regclass('public.orders') is not null then
    alter table public.orders
      add column if not exists payment_method text;

    comment on column public.orders.payment_method is
      'Payment method used for this order (e.g. card, cod, bank_transfer)';
  end if;
end
$$;

commit;
