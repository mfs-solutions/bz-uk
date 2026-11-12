begin;

-- ============================================================
-- Extend intl_rate_card with weight bands up to 30 kg
-- (Delhivery international max parcel weight).
--
-- Bands: 5–7, 7–10, 10–15, 15–20, 20–25, 25–30 kg
-- These supplement the existing 0–0.5, 0.5–1, 1–2, 2–3, 3–5 bands.
--
-- Rate scaling logic (approximate, per-kg rate drops at higher bands):
--   Gulf  (Zone 1):  base ₹525/kg  → tapers to ~₹400/kg at 30kg
--   Europe/UK (Zone 2): base ₹665/kg  → tapers to ~₹510/kg at 30kg
--   US    (Zone 3):  base ₹700/kg  → tapers to ~₹540/kg at 30kg
-- ============================================================

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
        WHEN  6 THEN  3500   --  5–7 kg
        WHEN  7 THEN  4800   --  7–10 kg
        WHEN  8 THEN  6800   -- 10–15 kg
        WHEN  9 THEN  8800   -- 15–20 kg
        WHEN 10 THEN 10500   -- 20–25 kg
        WHEN 11 THEN 12000   -- 25–30 kg
      END
    -- US (Zone 3 — farthest)
    WHEN c.country_code = 'USA' THEN
      CASE wb.band
        WHEN  6 THEN  4700   --  5–7 kg
        WHEN  7 THEN  6500   --  7–10 kg
        WHEN  8 THEN  9200   -- 10–15 kg
        WHEN  9 THEN 12000   -- 15–20 kg
        WHEN 10 THEN 14200   -- 20–25 kg
        WHEN 11 THEN 16200   -- 25–30 kg
      END
    -- UK + Europe (Zone 2)
    ELSE
      CASE wb.band
        WHEN  6 THEN  4450   --  5–7 kg
        WHEN  7 THEN  6150   --  7–10 kg
        WHEN  8 THEN  8700   -- 10–15 kg
        WHEN  9 THEN 11300   -- 15–20 kg
        WHEN 10 THEN 13400   -- 20–25 kg
        WHEN 11 THEN 15300   -- 25–30 kg
      END
  END AS rate_inr,
  true
FROM public.countries c
CROSS JOIN (
  VALUES
    ( 6,  5::numeric,  7::numeric),
    ( 7,  7,          10),
    ( 8, 10,          15),
    ( 9, 15,          20),
    (10, 20,          25),
    (11, 25,          30)
) AS wb(band, wmin, wmax)
WHERE c.country_code IN (
  'USA',
  'GBR',
  'ARE','SAU','QAT','KWT','BHR','OMN',
  'DEU','FRA','ITA','ESP','NLD','BEL','AUT','CHE',
  'SWE','NOR','DNK','FIN','POL','PRT','IRL','GRC',
  'CZE','ROU','HUN','BGR','HRV','SVK','SVN',
  'LTU','LVA','EST','LUX','MLT','CYP','ISL'
)
ON CONFLICT (country_code, service_type, weight_min_kg, weight_max_kg) DO NOTHING;

commit;
