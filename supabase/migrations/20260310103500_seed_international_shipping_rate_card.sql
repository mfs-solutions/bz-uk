begin;

-- ============================================================
-- Seed international_shipping_rate_card with Delhivery rates
-- Source: https://one.delhivery.com/information-center/rate-calculator
--
-- NOTE: origin_zone column does not exist yet at this migration point.
-- These inserts use the base columns only. The origin_zone column is
-- added in migration 20260310120100 with default 'A', so all rows
-- here will automatically become Zone A.
-- Zone-aware seeds (US Zone B/C/D, UK, etc.) are in migration
-- 20260310120300_seed_zone_aware_rates.sql (runs after column exists).
-- ============================================================

-- Helper: get country_id by country_code
create or replace function pg_temp.country_id_by_code(p_code text)
returns uuid as $$
  select id from public.countries
  where upper(trim(country_code)) = upper(trim(p_code))
     or upper(trim(short_code)) = upper(trim(p_code))
  limit 1;
$$ language sql stable;

-- ==================== UNITED STATES — 0–0.5 kg ====================
-- Origin: 682001 (Kochi, Zone A) | Checked: 2026-03-10
insert into public.international_shipping_rate_card
  (country_id, country_name, country_code, service_type, weight_min_kg, weight_max_kg, rate_inr, currency, is_active, notes)
values
  (pg_temp.country_id_by_code('US'), 'United States', 'US', 'dlv_saver',        0, 0.5, 871.18,  'INR', true, 'Delhivery portal 2026-03-10'),
  (pg_temp.country_id_by_code('US'), 'United States', 'US', 'document',         0, 0.5, 2067.99, 'INR', true, 'Delhivery portal 2026-03-10'),
  (pg_temp.country_id_by_code('US'), 'United States', 'US', 'express',          0, 0.5, 2067.99, 'INR', true, 'Delhivery portal 2026-03-10'),
  (pg_temp.country_id_by_code('US'), 'United States', 'US', 'deferred_express', 0, 0.5, 1964.83, 'INR', true, 'Delhivery portal 2026-03-10');

-- ==================== UNITED KINGDOM — 0–0.5 kg ====================
-- Origin: 682001 (Kochi, Zone A) | Checked: 2026-03-10
insert into public.international_shipping_rate_card
  (country_id, country_name, country_code, service_type, weight_min_kg, weight_max_kg, rate_inr, currency, is_active, notes)
values
  (pg_temp.country_id_by_code('GB'), 'United Kingdom', 'GB', 'dlv_saver',        0, 0.5, 835.42,  'INR', true, 'Delhivery portal 2026-03-10'),
  (pg_temp.country_id_by_code('GB'), 'United Kingdom', 'GB', 'document',         0, 0.5, 1983.15, 'INR', true, 'Delhivery portal 2026-03-10'),
  (pg_temp.country_id_by_code('GB'), 'United Kingdom', 'GB', 'express',          0, 0.5, 1983.15, 'INR', true, 'Delhivery portal 2026-03-10'),
  (pg_temp.country_id_by_code('GB'), 'United Kingdom', 'GB', 'deferred_express', 0, 0.5, 1884.22, 'INR', true, 'Delhivery portal 2026-03-10');

commit;
