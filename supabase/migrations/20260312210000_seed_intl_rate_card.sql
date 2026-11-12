begin;

-- ============================================================
-- 1. Ensure all target countries exist in the countries table
--    Uses WHERE NOT EXISTS to avoid conflicts.
-- ============================================================

-- United States
INSERT INTO public.countries (country_name, short_code, country_code, currency_code, dialing_code, is_active)
SELECT 'United States', 'USA', 'USA', 'USD', '+1', true
WHERE NOT EXISTS (SELECT 1 FROM public.countries WHERE country_code = 'USA');

-- United Kingdom
INSERT INTO public.countries (country_name, short_code, country_code, currency_code, dialing_code, is_active)
SELECT 'United Kingdom', 'GBR', 'GBR', 'GBP', '+44', true
WHERE NOT EXISTS (SELECT 1 FROM public.countries WHERE country_code = 'GBR');

-- ── Gulf Countries (GCC) ──
INSERT INTO public.countries (country_name, short_code, country_code, currency_code, dialing_code, is_active)
SELECT 'United Arab Emirates', 'ARE', 'ARE', 'AED', '+971', true
WHERE NOT EXISTS (SELECT 1 FROM public.countries WHERE country_code = 'ARE');

INSERT INTO public.countries (country_name, short_code, country_code, currency_code, dialing_code, is_active)
SELECT 'Saudi Arabia', 'SAU', 'SAU', 'SAR', '+966', true
WHERE NOT EXISTS (SELECT 1 FROM public.countries WHERE country_code = 'SAU');

INSERT INTO public.countries (country_name, short_code, country_code, currency_code, dialing_code, is_active)
SELECT 'Qatar', 'QAT', 'QAT', 'QAR', '+974', true
WHERE NOT EXISTS (SELECT 1 FROM public.countries WHERE country_code = 'QAT');

INSERT INTO public.countries (country_name, short_code, country_code, currency_code, dialing_code, is_active)
SELECT 'Kuwait', 'KWT', 'KWT', 'KWD', '+965', true
WHERE NOT EXISTS (SELECT 1 FROM public.countries WHERE country_code = 'KWT');

INSERT INTO public.countries (country_name, short_code, country_code, currency_code, dialing_code, is_active)
SELECT 'Bahrain', 'BHR', 'BHR', 'BHD', '+973', true
WHERE NOT EXISTS (SELECT 1 FROM public.countries WHERE country_code = 'BHR');

INSERT INTO public.countries (country_name, short_code, country_code, currency_code, dialing_code, is_active)
SELECT 'Oman', 'OMN', 'OMN', 'OMR', '+968', true
WHERE NOT EXISTS (SELECT 1 FROM public.countries WHERE country_code = 'OMN');

-- ── European Countries ──
INSERT INTO public.countries (country_name, short_code, country_code, currency_code, dialing_code, is_active)
SELECT 'Germany', 'DEU', 'DEU', 'EUR', '+49', true
WHERE NOT EXISTS (SELECT 1 FROM public.countries WHERE country_code = 'DEU');

INSERT INTO public.countries (country_name, short_code, country_code, currency_code, dialing_code, is_active)
SELECT 'France', 'FRA', 'FRA', 'EUR', '+33', true
WHERE NOT EXISTS (SELECT 1 FROM public.countries WHERE country_code = 'FRA');

INSERT INTO public.countries (country_name, short_code, country_code, currency_code, dialing_code, is_active)
SELECT 'Italy', 'ITA', 'ITA', 'EUR', '+39', true
WHERE NOT EXISTS (SELECT 1 FROM public.countries WHERE country_code = 'ITA');

INSERT INTO public.countries (country_name, short_code, country_code, currency_code, dialing_code, is_active)
SELECT 'Spain', 'ESP', 'ESP', 'EUR', '+34', true
WHERE NOT EXISTS (SELECT 1 FROM public.countries WHERE country_code = 'ESP');

INSERT INTO public.countries (country_name, short_code, country_code, currency_code, dialing_code, is_active)
SELECT 'Netherlands', 'NLD', 'NLD', 'EUR', '+31', true
WHERE NOT EXISTS (SELECT 1 FROM public.countries WHERE country_code = 'NLD');

INSERT INTO public.countries (country_name, short_code, country_code, currency_code, dialing_code, is_active)
SELECT 'Belgium', 'BEL', 'BEL', 'EUR', '+32', true
WHERE NOT EXISTS (SELECT 1 FROM public.countries WHERE country_code = 'BEL');

INSERT INTO public.countries (country_name, short_code, country_code, currency_code, dialing_code, is_active)
SELECT 'Austria', 'AUT', 'AUT', 'EUR', '+43', true
WHERE NOT EXISTS (SELECT 1 FROM public.countries WHERE country_code = 'AUT');

INSERT INTO public.countries (country_name, short_code, country_code, currency_code, dialing_code, is_active)
SELECT 'Switzerland', 'CHE', 'CHE', 'CHF', '+41', true
WHERE NOT EXISTS (SELECT 1 FROM public.countries WHERE country_code = 'CHE');

INSERT INTO public.countries (country_name, short_code, country_code, currency_code, dialing_code, is_active)
SELECT 'Sweden', 'SWE', 'SWE', 'SEK', '+46', true
WHERE NOT EXISTS (SELECT 1 FROM public.countries WHERE country_code = 'SWE');

INSERT INTO public.countries (country_name, short_code, country_code, currency_code, dialing_code, is_active)
SELECT 'Norway', 'NOR', 'NOR', 'NOK', '+47', true
WHERE NOT EXISTS (SELECT 1 FROM public.countries WHERE country_code = 'NOR');

INSERT INTO public.countries (country_name, short_code, country_code, currency_code, dialing_code, is_active)
SELECT 'Denmark', 'DNK', 'DNK', 'DKK', '+45', true
WHERE NOT EXISTS (SELECT 1 FROM public.countries WHERE country_code = 'DNK');

INSERT INTO public.countries (country_name, short_code, country_code, currency_code, dialing_code, is_active)
SELECT 'Finland', 'FIN', 'FIN', 'EUR', '+358', true
WHERE NOT EXISTS (SELECT 1 FROM public.countries WHERE country_code = 'FIN');

INSERT INTO public.countries (country_name, short_code, country_code, currency_code, dialing_code, is_active)
SELECT 'Poland', 'POL', 'POL', 'PLN', '+48', true
WHERE NOT EXISTS (SELECT 1 FROM public.countries WHERE country_code = 'POL');

INSERT INTO public.countries (country_name, short_code, country_code, currency_code, dialing_code, is_active)
SELECT 'Portugal', 'PRT', 'PRT', 'EUR', '+351', true
WHERE NOT EXISTS (SELECT 1 FROM public.countries WHERE country_code = 'PRT');

INSERT INTO public.countries (country_name, short_code, country_code, currency_code, dialing_code, is_active)
SELECT 'Ireland', 'IRL', 'IRL', 'EUR', '+353', true
WHERE NOT EXISTS (SELECT 1 FROM public.countries WHERE country_code = 'IRL');

INSERT INTO public.countries (country_name, short_code, country_code, currency_code, dialing_code, is_active)
SELECT 'Greece', 'GRC', 'GRC', 'EUR', '+30', true
WHERE NOT EXISTS (SELECT 1 FROM public.countries WHERE country_code = 'GRC');

INSERT INTO public.countries (country_name, short_code, country_code, currency_code, dialing_code, is_active)
SELECT 'Czech Republic', 'CZE', 'CZE', 'CZK', '+420', true
WHERE NOT EXISTS (SELECT 1 FROM public.countries WHERE country_code = 'CZE');

INSERT INTO public.countries (country_name, short_code, country_code, currency_code, dialing_code, is_active)
SELECT 'Romania', 'ROU', 'ROU', 'RON', '+40', true
WHERE NOT EXISTS (SELECT 1 FROM public.countries WHERE country_code = 'ROU');

INSERT INTO public.countries (country_name, short_code, country_code, currency_code, dialing_code, is_active)
SELECT 'Hungary', 'HUN', 'HUN', 'HUF', '+36', true
WHERE NOT EXISTS (SELECT 1 FROM public.countries WHERE country_code = 'HUN');

INSERT INTO public.countries (country_name, short_code, country_code, currency_code, dialing_code, is_active)
SELECT 'Bulgaria', 'BGR', 'BGR', 'BGN', '+359', true
WHERE NOT EXISTS (SELECT 1 FROM public.countries WHERE country_code = 'BGR');

INSERT INTO public.countries (country_name, short_code, country_code, currency_code, dialing_code, is_active)
SELECT 'Croatia', 'HRV', 'HRV', 'EUR', '+385', true
WHERE NOT EXISTS (SELECT 1 FROM public.countries WHERE country_code = 'HRV');

INSERT INTO public.countries (country_name, short_code, country_code, currency_code, dialing_code, is_active)
SELECT 'Slovakia', 'SVK', 'SVK', 'EUR', '+421', true
WHERE NOT EXISTS (SELECT 1 FROM public.countries WHERE country_code = 'SVK');

INSERT INTO public.countries (country_name, short_code, country_code, currency_code, dialing_code, is_active)
SELECT 'Slovenia', 'SVN', 'SVN', 'EUR', '+386', true
WHERE NOT EXISTS (SELECT 1 FROM public.countries WHERE country_code = 'SVN');

INSERT INTO public.countries (country_name, short_code, country_code, currency_code, dialing_code, is_active)
SELECT 'Lithuania', 'LTU', 'LTU', 'EUR', '+370', true
WHERE NOT EXISTS (SELECT 1 FROM public.countries WHERE country_code = 'LTU');

INSERT INTO public.countries (country_name, short_code, country_code, currency_code, dialing_code, is_active)
SELECT 'Latvia', 'LVA', 'LVA', 'EUR', '+371', true
WHERE NOT EXISTS (SELECT 1 FROM public.countries WHERE country_code = 'LVA');

INSERT INTO public.countries (country_name, short_code, country_code, currency_code, dialing_code, is_active)
SELECT 'Estonia', 'EST', 'EST', 'EUR', '+372', true
WHERE NOT EXISTS (SELECT 1 FROM public.countries WHERE country_code = 'EST');

INSERT INTO public.countries (country_name, short_code, country_code, currency_code, dialing_code, is_active)
SELECT 'Luxembourg', 'LUX', 'LUX', 'EUR', '+352', true
WHERE NOT EXISTS (SELECT 1 FROM public.countries WHERE country_code = 'LUX');

INSERT INTO public.countries (country_name, short_code, country_code, currency_code, dialing_code, is_active)
SELECT 'Malta', 'MLT', 'MLT', 'EUR', '+356', true
WHERE NOT EXISTS (SELECT 1 FROM public.countries WHERE country_code = 'MLT');

INSERT INTO public.countries (country_name, short_code, country_code, currency_code, dialing_code, is_active)
SELECT 'Cyprus', 'CYP', 'CYP', 'EUR', '+357', true
WHERE NOT EXISTS (SELECT 1 FROM public.countries WHERE country_code = 'CYP');

INSERT INTO public.countries (country_name, short_code, country_code, currency_code, dialing_code, is_active)
SELECT 'Iceland', 'ISL', 'ISL', 'ISK', '+354', true
WHERE NOT EXISTS (SELECT 1 FROM public.countries WHERE country_code = 'ISL');


-- ============================================================
-- 2. Seed intl_rate_card for DLV Saver service
--    Fetches country_code and country_name FROM the countries
--    table. Rates are initial estimates (INR) — admin will
--    update with actual Delhivery calculator rates.
--
--    Zone pricing (approximate):
--      Gulf  (ARE,SAU,QAT,KWT,BHR,OMN) — nearest zone
--      Europe / UK                      — mid zone
--      US                               — far zone
-- ============================================================

-- Helper: define weight bands and zone rates in a CTE,
-- then join to the countries table for proper codes/names.

INSERT INTO public.intl_rate_card
  (country_code, country_name, service_type, weight_min_kg, weight_max_kg, rate_inr, is_active)
SELECT
  c.country_code,
  c.country_name,
  'dlv_saver',
  wb.wmin,
  wb.wmax,
  CASE
    -- Gulf countries (Zone 1 — closest)
    WHEN c.country_code IN ('ARE','SAU','QAT','KWT','BHR','OMN') THEN
      CASE wb.band
        WHEN 1 THEN 650
        WHEN 2 THEN 900
        WHEN 3 THEN 1350
        WHEN 4 THEN 1800
        WHEN 5 THEN 2625
      END
    -- US (Zone 3 — farthest)
    WHEN c.country_code = 'USA' THEN
      CASE wb.band
        WHEN 1 THEN 871
        WHEN 2 THEN 1200
        WHEN 3 THEN 1800
        WHEN 4 THEN 2400
        WHEN 5 THEN 3500
      END
    -- UK + Europe (Zone 2)
    ELSE
      CASE wb.band
        WHEN 1 THEN 830
        WHEN 2 THEN 1140
        WHEN 3 THEN 1710
        WHEN 4 THEN 2280
        WHEN 5 THEN 3325
      END
  END AS rate_inr,
  true
FROM public.countries c
CROSS JOIN (
  VALUES
    (1, 0::numeric, 0.5::numeric),
    (2, 0.5, 1),
    (3, 1,   2),
    (4, 2,   3),
    (5, 3,   5)
) AS wb(band, wmin, wmax)
WHERE c.country_code IN (
  -- US
  'USA',
  -- UK
  'GBR',
  -- Gulf (GCC)
  'ARE','SAU','QAT','KWT','BHR','OMN',
  -- Europe
  'DEU','FRA','ITA','ESP','NLD','BEL','AUT','CHE',
  'SWE','NOR','DNK','FIN','POL','PRT','IRL','GRC',
  'CZE','ROU','HUN','BGR','HRV','SVK','SVN',
  'LTU','LVA','EST','LUX','MLT','CYP','ISL'
)
ON CONFLICT (country_code, service_type, weight_min_kg, weight_max_kg) DO NOTHING;

commit;
