-- Seed the last two inline variant size presets (PACK_COUNT, APPLIANCE_CAPACITY)
-- so that ALL size option lists in the app are sourced from the database.
-- Values mirror the hardcoded fallbacks in src/config/variantThemeConfig.ts
-- exactly, so this has no effect on existing listed products.
-- Idempotent: safe to re-run.

insert into public.variant_size_presets (preset_key, position, value, label, chart) values
  -- PACK_COUNT (multipacks; no size chart)
  ('PACK_COUNT', 0, '1 Pack',  '1 Pack',  null),
  ('PACK_COUNT', 1, '2 Pack',  '2 Pack',  null),
  ('PACK_COUNT', 2, '4 Pack',  '4 Pack',  null),
  ('PACK_COUNT', 3, '6 Pack',  '6 Pack',  null),
  ('PACK_COUNT', 4, '10 Pack', '10 Pack', null),
  ('PACK_COUNT', 5, '12 Pack', '12 Pack', null),

  -- APPLIANCE_CAPACITY (washing machines / fridges / ACs; no size chart)
  ('APPLIANCE_CAPACITY', 0, '5 L',     '5 L',     null),
  ('APPLIANCE_CAPACITY', 1, '6 kg',    '6 kg',    null),
  ('APPLIANCE_CAPACITY', 2, '7 kg',    '7 kg',    null),
  ('APPLIANCE_CAPACITY', 3, '8 kg',    '8 kg',    null),
  ('APPLIANCE_CAPACITY', 4, '10 kg',   '10 kg',   null),
  ('APPLIANCE_CAPACITY', 5, '1 Ton',   '1 Ton',   null),
  ('APPLIANCE_CAPACITY', 6, '1.5 Ton', '1.5 Ton', null),
  ('APPLIANCE_CAPACITY', 7, '2 Ton',   '2 Ton',   null)
on conflict (preset_key, value) do update set
  position  = excluded.position,
  label     = excluded.label,
  chart     = excluded.chart,
  is_active = true,
  updated_at = now();
