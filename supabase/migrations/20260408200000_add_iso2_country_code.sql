-- Add ISO 3166-1 alpha-2 (2-letter) country code column to countries table.
-- The existing country_code / short_code columns store 3-letter (alpha-3) codes.
-- shipping_provider_config and Shippo/Shiprocket APIs use 2-letter codes,
-- so we need a canonical iso2 column to bridge the mismatch.

-- First, deduplicate: there are 2 "United States" rows (one country_code='US', one 'USA').
-- The 'USA' row (251c57c7) is referenced by profiles. Delete the unreferenced 'US' row.
DELETE FROM countries WHERE id = '6ef1b5c4-0933-4013-9b51-05cf04abca3f';

ALTER TABLE countries
  ADD COLUMN iso2 TEXT;

-- Populate iso2 for every existing country (ISO 3166-1 alpha-2 standard)
UPDATE countries SET iso2 = CASE country_code
  -- A
  WHEN 'ARE' THEN 'AE'
  WHEN 'AUS' THEN 'AU'
  WHEN 'AUT' THEN 'AT'
  -- B
  WHEN 'BEL' THEN 'BE'
  WHEN 'BGD' THEN 'BD'
  WHEN 'BGR' THEN 'BG'
  WHEN 'BHR' THEN 'BH'
  -- C
  WHEN 'CHE' THEN 'CH'
  WHEN 'CHN' THEN 'CN'
  WHEN 'CYP' THEN 'CY'
  WHEN 'CZE' THEN 'CZ'
  -- D
  WHEN 'DEU' THEN 'DE'
  WHEN 'DNK' THEN 'DK'
  -- E
  WHEN 'ESP' THEN 'ES'
  WHEN 'EST' THEN 'EE'
  -- F
  WHEN 'FIN' THEN 'FI'
  WHEN 'FRA' THEN 'FR'
  -- G
  WHEN 'GBR' THEN 'GB'
  WHEN 'GRC' THEN 'GR'
  -- H
  WHEN 'HRV' THEN 'HR'
  WHEN 'HUN' THEN 'HU'
  -- I
  WHEN 'IDN' THEN 'ID'
  WHEN 'IND' THEN 'IN'
  WHEN 'IRL' THEN 'IE'
  WHEN 'ISL' THEN 'IS'
  WHEN 'ITA' THEN 'IT'
  -- J
  WHEN 'JPN' THEN 'JP'
  -- K
  WHEN 'KOR' THEN 'KR'
  WHEN 'KWT' THEN 'KW'
  -- L
  WHEN 'LKA' THEN 'LK'
  WHEN 'LTU' THEN 'LT'
  WHEN 'LUX' THEN 'LU'
  WHEN 'LVA' THEN 'LV'
  -- M
  WHEN 'MLT' THEN 'MT'
  WHEN 'MYS' THEN 'MY'
  -- N
  WHEN 'NLD' THEN 'NL'
  WHEN 'NOR' THEN 'NO'
  WHEN 'NPL' THEN 'NP'
  WHEN 'NZL' THEN 'NZ'
  -- O
  WHEN 'OMN' THEN 'OM'
  -- P
  WHEN 'PAK' THEN 'PK'
  WHEN 'PHL' THEN 'PH'
  WHEN 'POL' THEN 'PL'
  WHEN 'PRT' THEN 'PT'
  -- Q
  WHEN 'QAT' THEN 'QA'
  -- R
  WHEN 'ROU' THEN 'RO'
  -- S
  WHEN 'SAU' THEN 'SA'
  WHEN 'SGP' THEN 'SG'
  WHEN 'SVK' THEN 'SK'
  WHEN 'SVN' THEN 'SI'
  WHEN 'SWE' THEN 'SE'
  -- T
  WHEN 'THA' THEN 'TH'
  -- U
  WHEN 'USA' THEN 'US'
  -- V
  WHEN 'VNM' THEN 'VN'
  ELSE NULL
END;

-- Make iso2 NOT NULL now that all rows are populated
ALTER TABLE countries
  ALTER COLUMN iso2 SET NOT NULL;

-- Add unique constraint — every country must have a distinct 2-letter code
CREATE UNIQUE INDEX countries_iso2_unique ON countries (iso2);

-- Add a CHECK constraint for exactly 2 uppercase letters
ALTER TABLE countries
  ADD CONSTRAINT countries_iso2_format CHECK (iso2 ~ '^[A-Z]{2}$');

COMMENT ON COLUMN countries.iso2 IS 'ISO 3166-1 alpha-2 (2-letter) country code, e.g. GB, US, IN';
