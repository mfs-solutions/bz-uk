begin;

insert into public.checkout_min_order_rules (origin_iso2, destination_iso2, min_order_inr, is_active)
values
  ('IN', 'US', 3200, true),
  ('IN', 'FR', 3200, true),
  ('IN', 'DE', 3200, true),
  ('IN', 'CH', 3200, true),
  ('IN', 'KE', 3200, true),
  ('IN', 'AL', 3200, true)
on conflict (origin_iso2, destination_iso2)
do update
set
  min_order_inr = excluded.min_order_inr,
  is_active = excluded.is_active,
  updated_at = now();

commit;
