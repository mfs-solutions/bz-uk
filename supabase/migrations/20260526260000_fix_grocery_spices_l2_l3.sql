-- ============================================================================
-- Fix: missing "Spices & Masalas" L2 + L3 tree under Grocery & Gourmet Food.
--
-- Root cause: migration 20260412200000_mega_categories_and_hsn.sql looked up
-- the Grocery L1 by slug 'grocery', but the actual L1 slug is
-- 'grocery-gourmet-food'. The entire grocery insert block was silently
-- skipped (the IF _l1 IS NOT NULL guard short-circuited). The HSN seed block
-- at the bottom of that same migration ran unconditionally, leaving orphan
-- HSN rows that point to category slugs that never existed.
--
-- This migration creates the missing L2 + a richer L3 set (10 sub-categories)
-- and seeds HSN codes for the newly added L3s. Pre-existing HSN rows for
-- spices/masalas/whole/ground/blends/dry-herbs/ohf-spices are left intact
-- (ON CONFLICT DO NOTHING).
-- ============================================================================

DO $$
DECLARE
  _l1 uuid;
  _l2 uuid;
BEGIN
  -- Locate the Grocery L1 using the CORRECT slug this time.
  SELECT id INTO _l1
    FROM public.categories
   WHERE slug = 'grocery-gourmet-food' AND level = 1
   LIMIT 1;

  IF _l1 IS NULL THEN
    RAISE EXCEPTION 'Grocery L1 (slug=grocery-gourmet-food) not found — aborting';
  END IF;

  -- L2: Spices & Masalas
  INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
  VALUES ('Spices & Masalas', 'spices-masalas', _l1, 2, 7, true)
  ON CONFLICT (slug) DO NOTHING;

  SELECT id INTO _l2 FROM public.categories WHERE slug = 'spices-masalas' LIMIT 1;
  IF _l2 IS NULL THEN
    RAISE EXCEPTION 'spices-masalas L2 insert failed';
  END IF;

  -- L3 sub-categories under Spices & Masalas
  INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
    ('Whole Spices',              'whole-spices',     _l2, 3,  1, true),
    ('Ground Spices',             'ground-spices',    _l2, 3,  2, true),
    ('Masala Blends',             'masala-blends',    _l2, 3,  3, true),
    ('Dry Herbs',                 'dry-herbs',        _l2, 3,  4, true),
    ('Spice Pastes & Wet Masalas','spice-pastes',     _l2, 3,  5, true),
    ('Cooking Salts',             'cooking-salts',    _l2, 3,  6, true),
    ('Saffron',                   'saffron',          _l2, 3,  7, true),
    ('Asafoetida (Hing)',         'asafoetida',       _l2, 3,  8, true),
    ('Tamarind',                  'tamarind',         _l2, 3,  9, true),
    ('Tempering Seeds',           'tempering-seeds',  _l2, 3, 10, true),
    ('Organic Spices',            'organic-spices',   _l2, 3, 11, true)
  ON CONFLICT (slug) DO NOTHING;
END $$;

-- ---------------------------------------------------------------------------
-- HSN seed for the newly added L3 slugs (8-digit GST codes).
-- Pre-existing rows for whole/ground/masala/dry-herbs/ohf-spices/spices-masalas
-- are untouched via ON CONFLICT DO NOTHING.
-- ---------------------------------------------------------------------------
INSERT INTO public.category_hsn_codes (category_slug, hsn_code, description) VALUES
  ('spice-pastes',    '21039040', 'Mixed condiments and mixed seasonings — pastes'),
  ('cooking-salts',   '25010020', 'Salt (including table, rock, sea, kala namak)'),
  ('saffron',         '09102010', 'Saffron'),
  ('asafoetida',      '13019033', 'Asafoetida (Hing) — natural gums and resins'),
  ('tamarind',        '08134010', 'Tamarind, dried'),
  ('tempering-seeds', '12074090', 'Sesame / oilseeds — other (for tempering use)'),
  ('organic-spices',  '09109190', 'Organic mixtures of spices')
ON CONFLICT (category_slug) DO NOTHING;
