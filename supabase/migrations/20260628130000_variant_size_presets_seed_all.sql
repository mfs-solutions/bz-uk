-- =============================================================================
-- Seed the REMAINING variant size presets into public.variant_size_presets so
-- the entire size system is DB-driven (the footwear presets were seeded in
-- 20260628120000). Values mirror src/config/variantThemeConfig.ts exactly.
--
-- preset_key matches SIZE_PRESET_REGISTRY in variantThemeConfig.ts.
-- Re-runnable: on conflict refreshes position/label/chart.
-- =============================================================================

insert into public.variant_size_presets (preset_key, position, value, label, chart) values
  -- APPAREL_ALPHA (clothing alpha sizes)
  ('APPAREL_ALPHA', 0, 'XS',  'XS',  '{"india":"34","us":"0-2","eu":"40","jp":"XS"}'::jsonb),
  ('APPAREL_ALPHA', 1, 'S',   'S',   '{"india":"36","us":"4-6","eu":"42","jp":"S"}'::jsonb),
  ('APPAREL_ALPHA', 2, 'M',   'M',   '{"india":"38","us":"8-10","eu":"44","jp":"M"}'::jsonb),
  ('APPAREL_ALPHA', 3, 'L',   'L',   '{"india":"40","us":"12-14","eu":"46","jp":"L"}'::jsonb),
  ('APPAREL_ALPHA', 4, 'XL',  'XL',  '{"india":"42","us":"16","eu":"48","jp":"LL"}'::jsonb),
  ('APPAREL_ALPHA', 5, 'XXL', 'XXL', '{"india":"44","us":"18","eu":"50","jp":"3L"}'::jsonb),
  ('APPAREL_ALPHA', 6, '3XL', '3XL', '{"india":"46","us":"20","eu":"52","jp":"4L"}'::jsonb),
  ('APPAREL_ALPHA', 7, '4XL', '4XL', '{"india":"48","us":"22","eu":"54","jp":"5L"}'::jsonb),
  ('APPAREL_ALPHA', 8, '5XL', '5XL', '{"india":"50","us":"24","eu":"56","jp":"6L"}'::jsonb),

  -- INNERWEAR_EXTENDED (APPAREL_ALPHA + cm bands)
  ('INNERWEAR_EXTENDED', 0,  'XS',  'XS',  '{"india":"34","us":"0-2","eu":"40","jp":"XS"}'::jsonb),
  ('INNERWEAR_EXTENDED', 1,  'S',   'S',   '{"india":"36","us":"4-6","eu":"42","jp":"S"}'::jsonb),
  ('INNERWEAR_EXTENDED', 2,  'M',   'M',   '{"india":"38","us":"8-10","eu":"44","jp":"M"}'::jsonb),
  ('INNERWEAR_EXTENDED', 3,  'L',   'L',   '{"india":"40","us":"12-14","eu":"46","jp":"L"}'::jsonb),
  ('INNERWEAR_EXTENDED', 4,  'XL',  'XL',  '{"india":"42","us":"16","eu":"48","jp":"LL"}'::jsonb),
  ('INNERWEAR_EXTENDED', 5,  'XXL', 'XXL', '{"india":"44","us":"18","eu":"50","jp":"3L"}'::jsonb),
  ('INNERWEAR_EXTENDED', 6,  '3XL', '3XL', '{"india":"46","us":"20","eu":"52","jp":"4L"}'::jsonb),
  ('INNERWEAR_EXTENDED', 7,  '4XL', '4XL', '{"india":"48","us":"22","eu":"54","jp":"5L"}'::jsonb),
  ('INNERWEAR_EXTENDED', 8,  '5XL', '5XL', '{"india":"50","us":"24","eu":"56","jp":"6L"}'::jsonb),
  ('INNERWEAR_EXTENDED', 9,  '80',  '80',  '{"india":"80 cm","us":"31","eu":"80","jp":"80"}'::jsonb),
  ('INNERWEAR_EXTENDED', 10, '85',  '85',  '{"india":"85 cm","us":"33","eu":"85","jp":"85"}'::jsonb),
  ('INNERWEAR_EXTENDED', 11, '90',  '90',  '{"india":"90 cm","us":"35","eu":"90","jp":"90"}'::jsonb),
  ('INNERWEAR_EXTENDED', 12, '95',  '95',  '{"india":"95 cm","us":"37","eu":"95","jp":"95"}'::jsonb),
  ('INNERWEAR_EXTENDED', 13, '100', '100', '{"india":"100 cm","us":"39","eu":"100","jp":"100"}'::jsonb),

  -- WAIST_SIZES
  ('WAIST_SIZES', 0, '28', '28', '{"india":"28","us":"28","eu":"44","jp":"71 cm"}'::jsonb),
  ('WAIST_SIZES', 1, '30', '30', '{"india":"30","us":"30","eu":"46","jp":"76 cm"}'::jsonb),
  ('WAIST_SIZES', 2, '32', '32', '{"india":"32","us":"32","eu":"48","jp":"81 cm"}'::jsonb),
  ('WAIST_SIZES', 3, '34', '34', '{"india":"34","us":"34","eu":"50","jp":"86 cm"}'::jsonb),
  ('WAIST_SIZES', 4, '36', '36', '{"india":"36","us":"36","eu":"52","jp":"91 cm"}'::jsonb),
  ('WAIST_SIZES', 5, '38', '38', '{"india":"38","us":"38","eu":"54","jp":"97 cm"}'::jsonb),
  ('WAIST_SIZES', 6, '40', '40', '{"india":"40","us":"40","eu":"56","jp":"102 cm"}'::jsonb),
  ('WAIST_SIZES', 7, '42', '42', '{"india":"42","us":"42","eu":"58","jp":"107 cm"}'::jsonb),
  ('WAIST_SIZES', 8, '44', '44', '{"india":"44","us":"44","eu":"60","jp":"112 cm"}'::jsonb),

  -- KIDS_AGE
  ('KIDS_AGE', 0,  '0-3 Months',  '0-3 Months',  '{"india":"Newborn","us":"NB","eu":"50-56","jp":"50"}'::jsonb),
  ('KIDS_AGE', 1,  '3-6 Months',  '3-6 Months',  '{"india":"0-6M","us":"3-6M","eu":"62-68","jp":"60"}'::jsonb),
  ('KIDS_AGE', 2,  '6-12 Months', '6-12 Months', '{"india":"6-12M","us":"6-12M","eu":"74-80","jp":"70"}'::jsonb),
  ('KIDS_AGE', 3,  '1-2 Years',   '1-2 Years',   '{"india":"1-2Y","us":"12-24M","eu":"86-92","jp":"80"}'::jsonb),
  ('KIDS_AGE', 4,  '2-3 Years',   '2-3 Years',   '{"india":"2-3Y","us":"2T-3T","eu":"92-98","jp":"90"}'::jsonb),
  ('KIDS_AGE', 5,  '3-4 Years',   '3-4 Years',   '{"india":"3-4Y","us":"3T-4T","eu":"98-104","jp":"100"}'::jsonb),
  ('KIDS_AGE', 6,  '4-5 Years',   '4-5 Years',   '{"india":"4-5Y","us":"4-5","eu":"104-110","jp":"110"}'::jsonb),
  ('KIDS_AGE', 7,  '5-6 Years',   '5-6 Years',   '{"india":"5-6Y","us":"5-6","eu":"110-116","jp":"110"}'::jsonb),
  ('KIDS_AGE', 8,  '6-8 Years',   '6-8 Years',   '{"india":"6-8Y","us":"6-7","eu":"116-128","jp":"120"}'::jsonb),
  ('KIDS_AGE', 9,  '8-10 Years',  '8-10 Years',  '{"india":"8-10Y","us":"8-10","eu":"128-140","jp":"130"}'::jsonb),
  ('KIDS_AGE', 10, '10-12 Years', '10-12 Years', '{"india":"10-12Y","us":"10-12","eu":"140-152","jp":"140"}'::jsonb),
  ('KIDS_AGE', 11, '12-14 Years', '12-14 Years', '{"india":"12-14Y","us":"14-16","eu":"152-164","jp":"150"}'::jsonb),

  -- PHONE_STORAGE (no chart)
  ('PHONE_STORAGE', 0, '32 GB',  '32 GB',  null),
  ('PHONE_STORAGE', 1, '64 GB',  '64 GB',  null),
  ('PHONE_STORAGE', 2, '128 GB', '128 GB', null),
  ('PHONE_STORAGE', 3, '256 GB', '256 GB', null),
  ('PHONE_STORAGE', 4, '512 GB', '512 GB', null),
  ('PHONE_STORAGE', 5, '1 TB',   '1 TB',   null),

  -- LAPTOP_STORAGE (no chart)
  ('LAPTOP_STORAGE', 0, '128 GB SSD', '128 GB SSD', null),
  ('LAPTOP_STORAGE', 1, '256 GB SSD', '256 GB SSD', null),
  ('LAPTOP_STORAGE', 2, '512 GB SSD', '512 GB SSD', null),
  ('LAPTOP_STORAGE', 3, '1 TB SSD',   '1 TB SSD',   null),
  ('LAPTOP_STORAGE', 4, '1 TB HDD',   '1 TB HDD',   null),
  ('LAPTOP_STORAGE', 5, '2 TB HDD',   '2 TB HDD',   null),

  -- SCREEN_SIZES (no chart)
  ('SCREEN_SIZES', 0, '24 inch', '24 inch', null),
  ('SCREEN_SIZES', 1, '27 inch', '27 inch', null),
  ('SCREEN_SIZES', 2, '32 inch', '32 inch', null),
  ('SCREEN_SIZES', 3, '40 inch', '40 inch', null),
  ('SCREEN_SIZES', 4, '43 inch', '43 inch', null),
  ('SCREEN_SIZES', 5, '50 inch', '50 inch', null),
  ('SCREEN_SIZES', 6, '55 inch', '55 inch', null),
  ('SCREEN_SIZES', 7, '65 inch', '65 inch', null),
  ('SCREEN_SIZES', 8, '75 inch', '75 inch', null),
  ('SCREEN_SIZES', 9, '85 inch', '85 inch', null),

  -- BEAUTY_VOLUME (no chart)
  ('BEAUTY_VOLUME', 0, '15 ml',  '15 ml',  null),
  ('BEAUTY_VOLUME', 1, '30 ml',  '30 ml',  null),
  ('BEAUTY_VOLUME', 2, '50 ml',  '50 ml',  null),
  ('BEAUTY_VOLUME', 3, '100 ml', '100 ml', null),
  ('BEAUTY_VOLUME', 4, '200 ml', '200 ml', null),
  ('BEAUTY_VOLUME', 5, '250 ml', '250 ml', null),
  ('BEAUTY_VOLUME', 6, '500 ml', '500 ml', null),
  ('BEAUTY_VOLUME', 7, '1 L',    '1 L',    null),

  -- GROCERY_WEIGHT (no chart)
  ('GROCERY_WEIGHT', 0, '50 g',  '50 g',  null),
  ('GROCERY_WEIGHT', 1, '100 g', '100 g', null),
  ('GROCERY_WEIGHT', 2, '200 g', '200 g', null),
  ('GROCERY_WEIGHT', 3, '250 g', '250 g', null),
  ('GROCERY_WEIGHT', 4, '500 g', '500 g', null),
  ('GROCERY_WEIGHT', 5, '1 kg',  '1 kg',  null),
  ('GROCERY_WEIGHT', 6, '2 kg',  '2 kg',  null),
  ('GROCERY_WEIGHT', 7, '5 kg',  '5 kg',  null),
  ('GROCERY_WEIGHT', 8, '10 kg', '10 kg', null),
  ('GROCERY_WEIGHT', 9, '25 kg', '25 kg', null),

  -- RING_SIZES
  ('RING_SIZES', 0,  '6',  '6',  '{"india":"6","us":"3","eu":"44","jp":"5"}'::jsonb),
  ('RING_SIZES', 1,  '7',  '7',  '{"india":"7","us":"3.5","eu":"45.5","jp":"6"}'::jsonb),
  ('RING_SIZES', 2,  '8',  '8',  '{"india":"8","us":"4","eu":"46.5","jp":"7"}'::jsonb),
  ('RING_SIZES', 3,  '9',  '9',  '{"india":"9","us":"4.5","eu":"48","jp":"8"}'::jsonb),
  ('RING_SIZES', 4,  '10', '10', '{"india":"10","us":"5","eu":"49","jp":"9"}'::jsonb),
  ('RING_SIZES', 5,  '11', '11', '{"india":"11","us":"5.5","eu":"50.5","jp":"10"}'::jsonb),
  ('RING_SIZES', 6,  '12', '12', '{"india":"12","us":"6","eu":"51.5","jp":"11"}'::jsonb),
  ('RING_SIZES', 7,  '13', '13', '{"india":"13","us":"6.5","eu":"52.5","jp":"12"}'::jsonb),
  ('RING_SIZES', 8,  '14', '14', '{"india":"14","us":"7","eu":"54","jp":"13"}'::jsonb),
  ('RING_SIZES', 9,  '15', '15', '{"india":"15","us":"7.5","eu":"55","jp":"14"}'::jsonb),
  ('RING_SIZES', 10, '16', '16', '{"india":"16","us":"8","eu":"56.5","jp":"15"}'::jsonb),
  ('RING_SIZES', 11, '17', '17', '{"india":"17","us":"8","eu":"57","jp":"16"}'::jsonb),
  ('RING_SIZES', 12, '18', '18', '{"india":"18","us":"8.5","eu":"58","jp":"17"}'::jsonb),
  ('RING_SIZES', 13, '20', '20', '{"india":"20","us":"9.5","eu":"60.5","jp":"19"}'::jsonb),
  ('RING_SIZES', 14, '22', '22', '{"india":"22","us":"10","eu":"63","jp":"21"}'::jsonb),
  ('RING_SIZES', 15, '24', '24', '{"india":"24","us":"11","eu":"65","jp":"23"}'::jsonb),

  -- BOOK_FORMAT (no chart)
  ('BOOK_FORMAT', 0, 'Paperback',    'Paperback',    null),
  ('BOOK_FORMAT', 1, 'Hardcover',    'Hardcover',    null),
  ('BOOK_FORMAT', 2, 'Spiral Bound', 'Spiral Bound', null),

  -- CONSOLE_STORAGE (no chart)
  ('CONSOLE_STORAGE', 0, '256 GB', '256 GB', null),
  ('CONSOLE_STORAGE', 1, '512 GB', '512 GB', null),
  ('CONSOLE_STORAGE', 2, '825 GB', '825 GB', null),
  ('CONSOLE_STORAGE', 3, '1 TB',   '1 TB',   null),
  ('CONSOLE_STORAGE', 4, '2 TB',   '2 TB',   null),

  -- BED_SIZES
  ('BED_SIZES', 0, 'Single',     'Single',     '{"india":"36×72 in","us":"Twin","eu":"90×200 cm","jp":"S (97×195)"}'::jsonb),
  ('BED_SIZES', 1, 'Double',     'Double',     '{"india":"48×72 in","us":"Full","eu":"140×200 cm","jp":"SD (120×195)"}'::jsonb),
  ('BED_SIZES', 2, 'Queen',      'Queen',      '{"india":"60×72 in","us":"Queen","eu":"160×200 cm","jp":"D (140×195)"}'::jsonb),
  ('BED_SIZES', 3, 'King',       'King',       '{"india":"72×72 in","us":"King","eu":"180×200 cm","jp":"Q (160×195)"}'::jsonb),
  ('BED_SIZES', 4, 'Super King', 'Super King', '{"india":"72×78 in","us":"Cal King","eu":"200×200 cm","jp":"K (180×195)"}'::jsonb),

  -- BEDSHEET_SIZES (no chart)
  ('BEDSHEET_SIZES', 0, 'Single', 'Single (60×90 in)',  null),
  ('BEDSHEET_SIZES', 1, 'Double', 'Double (90×100 in)', null),
  ('BEDSHEET_SIZES', 2, 'Queen',  'Queen (90×108 in)',  null),
  ('BEDSHEET_SIZES', 3, 'King',   'King (108×108 in)',  null),

  -- TOWEL_SIZES (no chart)
  ('TOWEL_SIZES', 0, 'Face Towel', 'Face Towel (12×12 in)', null),
  ('TOWEL_SIZES', 1, 'Hand Towel', 'Hand Towel (16×28 in)', null),
  ('TOWEL_SIZES', 2, 'Bath Towel', 'Bath Towel (27×54 in)', null),
  ('TOWEL_SIZES', 3, 'Bath Sheet', 'Bath Sheet (35×60 in)', null),

  -- BRA_SIZES (no chart)
  ('BRA_SIZES', 0,  '28A', '28A', null),
  ('BRA_SIZES', 1,  '28B', '28B', null),
  ('BRA_SIZES', 2,  '28C', '28C', null),
  ('BRA_SIZES', 3,  '30A', '30A', null),
  ('BRA_SIZES', 4,  '30B', '30B', null),
  ('BRA_SIZES', 5,  '30C', '30C', null),
  ('BRA_SIZES', 6,  '30D', '30D', null),
  ('BRA_SIZES', 7,  '32A', '32A', null),
  ('BRA_SIZES', 8,  '32B', '32B', null),
  ('BRA_SIZES', 9,  '32C', '32C', null),
  ('BRA_SIZES', 10, '32D', '32D', null),
  ('BRA_SIZES', 11, '32DD', '32DD', null),
  ('BRA_SIZES', 12, '34A', '34A', null),
  ('BRA_SIZES', 13, '34B', '34B', null),
  ('BRA_SIZES', 14, '34C', '34C', null),
  ('BRA_SIZES', 15, '34D', '34D', null),
  ('BRA_SIZES', 16, '34DD', '34DD', null),
  ('BRA_SIZES', 17, '36A', '36A', null),
  ('BRA_SIZES', 18, '36B', '36B', null),
  ('BRA_SIZES', 19, '36C', '36C', null),
  ('BRA_SIZES', 20, '36D', '36D', null),
  ('BRA_SIZES', 21, '36DD', '36DD', null),
  ('BRA_SIZES', 22, '38B', '38B', null),
  ('BRA_SIZES', 23, '38C', '38C', null),
  ('BRA_SIZES', 24, '38D', '38D', null),
  ('BRA_SIZES', 25, '38DD', '38DD', null),
  ('BRA_SIZES', 26, '40B', '40B', null),
  ('BRA_SIZES', 27, '40C', '40C', null),
  ('BRA_SIZES', 28, '40D', '40D', null),
  ('BRA_SIZES', 29, '42B', '42B', null),
  ('BRA_SIZES', 30, '42C', '42C', null),
  ('BRA_SIZES', 31, '42D', '42D', null),
  ('BRA_SIZES', 32, '44B', '44B', null),
  ('BRA_SIZES', 33, '44C', '44C', null),

  -- STOCKING_SIZES
  ('STOCKING_SIZES', 0, 'S',  'S',  '{"india":"S (155-165 cm)","us":"S","eu":"S","jp":"M"}'::jsonb),
  ('STOCKING_SIZES', 1, 'M',  'M',  '{"india":"M (160-170 cm)","us":"M","eu":"M","jp":"L"}'::jsonb),
  ('STOCKING_SIZES', 2, 'L',  'L',  '{"india":"L (165-175 cm)","us":"L","eu":"L","jp":"LL"}'::jsonb),
  ('STOCKING_SIZES', 3, 'XL', 'XL', '{"india":"XL (170-180 cm)","us":"XL","eu":"XL","jp":"3L"}'::jsonb),

  -- FREE_SIZE (no chart)
  ('FREE_SIZE', 0, 'Free Size', 'Free Size', null)
on conflict (preset_key, value) do update set
  position  = excluded.position,
  label     = excluded.label,
  chart     = excluded.chart,
  is_active = true,
  updated_at = now();
