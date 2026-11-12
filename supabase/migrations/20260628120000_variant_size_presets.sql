-- =============================================================================
-- Variant size presets — make the predefined size dropdown lists (shoe sizes,
-- etc.) editable from the database instead of being hardcoded in the frontend
-- config (src/config/variantThemeConfig.ts).
--
-- The frontend keeps the hardcoded arrays as a FALLBACK. At runtime it loads
-- rows from this table and, for any preset_key present here, overrides the
-- matching in-memory preset. Presets NOT present here keep their config
-- defaults. This guarantees the UI never breaks if the table is empty or the
-- fetch fails.
--
-- preset_key matches the SIZE_PRESET_REGISTRY keys in variantThemeConfig.ts
-- (e.g. 'MENS_SHOE', 'WOMENS_SHOE', 'KIDS_SHOE').
-- =============================================================================

create table if not exists public.variant_size_presets (
  id          uuid primary key default gen_random_uuid(),
  preset_key  text not null,
  position    integer not null default 0,
  value       text not null,
  label       text not null,
  chart       jsonb,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (preset_key, value)
);

create index if not exists idx_variant_size_presets_key
  on public.variant_size_presets (preset_key, position);

-- updated_at trigger
create or replace function public.tg_variant_size_presets_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_variant_size_presets_updated_at on public.variant_size_presets;
create trigger trg_variant_size_presets_updated_at
  before update on public.variant_size_presets
  for each row execute function public.tg_variant_size_presets_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.variant_size_presets enable row level security;

-- Public read (buyers use anon key on the product page size guide; sellers use
-- their authenticated session in the listing form). Non-sensitive reference data.
drop policy if exists "variant_size_presets_select_all" on public.variant_size_presets;
create policy "variant_size_presets_select_all"
  on public.variant_size_presets
  for select
  to anon, authenticated
  using (true);

-- Only admins can modify the lists.
drop policy if exists "variant_size_presets_admin_all" on public.variant_size_presets;
create policy "variant_size_presets_admin_all"
  on public.variant_size_presets
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ── Seed: footwear presets (match variantThemeConfig.ts exactly) ─────────────
-- Re-runnable: on conflict refresh ordering / label / chart.
insert into public.variant_size_presets (preset_key, position, value, label, chart) values
  -- Men's footwear: UK 3 → UK 12 in 0.5 steps
  ('MENS_SHOE',  0,  'UK 3',    'UK 3',    '{"india":"3","us":"4","eu":"36","jp":"21.5"}'::jsonb),
  ('MENS_SHOE',  1,  'UK 3.5',  'UK 3.5',  '{"india":"3.5","us":"4.5","eu":"36.5","jp":"22"}'::jsonb),
  ('MENS_SHOE',  2,  'UK 4',    'UK 4',    '{"india":"4","us":"5","eu":"37","jp":"22.5"}'::jsonb),
  ('MENS_SHOE',  3,  'UK 4.5',  'UK 4.5',  '{"india":"4.5","us":"5.5","eu":"37.5","jp":"23"}'::jsonb),
  ('MENS_SHOE',  4,  'UK 5',    'UK 5',    '{"india":"5","us":"6","eu":"38","jp":"23.5"}'::jsonb),
  ('MENS_SHOE',  5,  'UK 5.5',  'UK 5.5',  '{"india":"5.5","us":"6.5","eu":"38.5","jp":"24"}'::jsonb),
  ('MENS_SHOE',  6,  'UK 6',    'UK 6',    '{"india":"6","us":"7","eu":"39","jp":"24.5"}'::jsonb),
  ('MENS_SHOE',  7,  'UK 6.5',  'UK 6.5',  '{"india":"6.5","us":"7.5","eu":"39.5","jp":"25"}'::jsonb),
  ('MENS_SHOE',  8,  'UK 7',    'UK 7',    '{"india":"7","us":"8","eu":"40","jp":"25.5"}'::jsonb),
  ('MENS_SHOE',  9,  'UK 7.5',  'UK 7.5',  '{"india":"7.5","us":"8.5","eu":"40.5","jp":"26"}'::jsonb),
  ('MENS_SHOE',  10, 'UK 8',    'UK 8',    '{"india":"8","us":"9","eu":"41","jp":"26.5"}'::jsonb),
  ('MENS_SHOE',  11, 'UK 8.5',  'UK 8.5',  '{"india":"8.5","us":"9.5","eu":"41.5","jp":"27"}'::jsonb),
  ('MENS_SHOE',  12, 'UK 9',    'UK 9',    '{"india":"9","us":"10","eu":"42","jp":"27.5"}'::jsonb),
  ('MENS_SHOE',  13, 'UK 9.5',  'UK 9.5',  '{"india":"9.5","us":"10.5","eu":"42.5","jp":"28"}'::jsonb),
  ('MENS_SHOE',  14, 'UK 10',   'UK 10',   '{"india":"10","us":"11","eu":"43","jp":"28.5"}'::jsonb),
  ('MENS_SHOE',  15, 'UK 10.5', 'UK 10.5', '{"india":"10.5","us":"11.5","eu":"43.5","jp":"29"}'::jsonb),
  ('MENS_SHOE',  16, 'UK 11',   'UK 11',   '{"india":"11","us":"12","eu":"44","jp":"29.5"}'::jsonb),
  ('MENS_SHOE',  17, 'UK 11.5', 'UK 11.5', '{"india":"11.5","us":"12.5","eu":"44.5","jp":"30"}'::jsonb),
  ('MENS_SHOE',  18, 'UK 12',   'UK 12',   '{"india":"12","us":"13","eu":"45","jp":"30.5"}'::jsonb),

  -- Women's footwear: UK 3 → UK 10 in 0.5 steps
  ('WOMENS_SHOE', 0,  'UK 3',    'UK 3',    '{"india":"3","us":"5","eu":"36","jp":"22"}'::jsonb),
  ('WOMENS_SHOE', 1,  'UK 3.5',  'UK 3.5',  '{"india":"3.5","us":"5.5","eu":"36.5","jp":"22.5"}'::jsonb),
  ('WOMENS_SHOE', 2,  'UK 4',    'UK 4',    '{"india":"4","us":"6","eu":"37","jp":"23"}'::jsonb),
  ('WOMENS_SHOE', 3,  'UK 4.5',  'UK 4.5',  '{"india":"4.5","us":"6.5","eu":"37.5","jp":"23.5"}'::jsonb),
  ('WOMENS_SHOE', 4,  'UK 5',    'UK 5',    '{"india":"5","us":"7","eu":"38","jp":"24"}'::jsonb),
  ('WOMENS_SHOE', 5,  'UK 5.5',  'UK 5.5',  '{"india":"5.5","us":"7.5","eu":"38.5","jp":"24.5"}'::jsonb),
  ('WOMENS_SHOE', 6,  'UK 6',    'UK 6',    '{"india":"6","us":"8","eu":"39","jp":"25"}'::jsonb),
  ('WOMENS_SHOE', 7,  'UK 6.5',  'UK 6.5',  '{"india":"6.5","us":"8.5","eu":"39.5","jp":"25.5"}'::jsonb),
  ('WOMENS_SHOE', 8,  'UK 7',    'UK 7',    '{"india":"7","us":"9","eu":"40","jp":"26"}'::jsonb),
  ('WOMENS_SHOE', 9,  'UK 7.5',  'UK 7.5',  '{"india":"7.5","us":"9.5","eu":"40.5","jp":"26.5"}'::jsonb),
  ('WOMENS_SHOE', 10, 'UK 8',    'UK 8',    '{"india":"8","us":"10","eu":"41","jp":"27"}'::jsonb),
  ('WOMENS_SHOE', 11, 'UK 8.5',  'UK 8.5',  '{"india":"8.5","us":"10.5","eu":"41.5","jp":"27.5"}'::jsonb),
  ('WOMENS_SHOE', 12, 'UK 9',    'UK 9',    '{"india":"9","us":"11","eu":"42","jp":"28"}'::jsonb),
  ('WOMENS_SHOE', 13, 'UK 9.5',  'UK 9.5',  '{"india":"9.5","us":"11.5","eu":"42.5","jp":"28.5"}'::jsonb),
  ('WOMENS_SHOE', 14, 'UK 10',   'UK 10',   '{"india":"10","us":"12","eu":"43","jp":"29"}'::jsonb),

  -- Kids footwear (child scale + UK 1-5)
  ('KIDS_SHOE', 0,  'UK C4',  'UK C4',  '{"india":"C4","us":"C5","eu":"20","jp":"12"}'::jsonb),
  ('KIDS_SHOE', 1,  'UK C5',  'UK C5',  '{"india":"C5","us":"C6","eu":"21","jp":"13"}'::jsonb),
  ('KIDS_SHOE', 2,  'UK C6',  'UK C6',  '{"india":"C6","us":"C7","eu":"23","jp":"14"}'::jsonb),
  ('KIDS_SHOE', 3,  'UK C7',  'UK C7',  '{"india":"C7","us":"C8","eu":"24","jp":"15"}'::jsonb),
  ('KIDS_SHOE', 4,  'UK C8',  'UK C8',  '{"india":"C8","us":"C9","eu":"25","jp":"16"}'::jsonb),
  ('KIDS_SHOE', 5,  'UK C9',  'UK C9',  '{"india":"C9","us":"C10","eu":"27","jp":"17"}'::jsonb),
  ('KIDS_SHOE', 6,  'UK C10', 'UK C10', '{"india":"C10","us":"C11","eu":"28","jp":"17.5"}'::jsonb),
  ('KIDS_SHOE', 7,  'UK C11', 'UK C11', '{"india":"C11","us":"C12","eu":"29","jp":"18"}'::jsonb),
  ('KIDS_SHOE', 8,  'UK C12', 'UK C12', '{"india":"C12","us":"C13","eu":"30","jp":"19"}'::jsonb),
  ('KIDS_SHOE', 9,  'UK 1',   'UK 1',   '{"india":"1","us":"2","eu":"33","jp":"20.5"}'::jsonb),
  ('KIDS_SHOE', 10, 'UK 2',   'UK 2',   '{"india":"2","us":"3","eu":"34","jp":"21.5"}'::jsonb),
  ('KIDS_SHOE', 11, 'UK 3',   'UK 3',   '{"india":"3","us":"4","eu":"35","jp":"22"}'::jsonb),
  ('KIDS_SHOE', 12, 'UK 4',   'UK 4',   '{"india":"4","us":"5","eu":"36","jp":"23"}'::jsonb),
  ('KIDS_SHOE', 13, 'UK 5',   'UK 5',   '{"india":"5","us":"6","eu":"37","jp":"24"}'::jsonb)
on conflict (preset_key, value) do update set
  position  = excluded.position,
  label     = excluded.label,
  chart     = excluded.chart,
  is_active = true,
  updated_at = now();

comment on table public.variant_size_presets is
  'Editable size dropdown presets keyed by preset_key (matches SIZE_PRESET_REGISTRY in variantThemeConfig.ts). Frontend overrides hardcoded defaults with active rows.';
