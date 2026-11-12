-- ============================================================================
-- Comprehensive sweep: insert ALL category rows that the broken mega-migration
-- 20260412200000_mega_categories_and_hsn.sql failed to insert because it
-- looked up its L1 parents by wrong slugs.
--
-- Slug map discovered:
--   migration wrote 'grocery'         → actual L1 'grocery-gourmet-food'
--   migration wrote 'beauty-health'   → actual L1 'beauty-personal-care'
--   migration wrote 'sports-outdoors' → actual L1 'sports-fitness-outdoors'
--   migration wrote 'toys-baby'       → actual L1 'toys-games-baby-products'
--   migration wrote 'home-kitchen'    → actual L1 'home-garden'        (best fit)
--   migration wrote 'automotive'      → actual L1 'automotive-industrial'
--   migration wrote 'books-media'     → actual L1 'books'
--
-- This migration only inserts categories that are CURRENTLY MISSING in
-- production (verified 2026-05-26). Pre-existing rows are protected by
-- ON CONFLICT (slug) DO NOTHING.
--
-- 'oral-care' is placed under 'health-household-baby-care' (the L1 that
-- already owns 'elder-care' and 'personal-hygiene').
--
-- NOT INCLUDED (require structural L1 creation decision from product owner):
--   - 'pets' block      (no Pets L1 exists)
--   - 'gaming' block    (no Gaming L1 exists)
-- ============================================================================

DO $$
DECLARE
  _l1 uuid;
  _l2 uuid;
BEGIN

  -- ───────────────────────── GROCERY (Frozen Foods) ─────────────────────────
  SELECT id INTO _l1 FROM public.categories
   WHERE slug = 'grocery-gourmet-food' AND level = 1 LIMIT 1;
  IF _l1 IS NULL THEN RAISE EXCEPTION 'L1 grocery-gourmet-food missing'; END IF;

  INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
  VALUES ('Frozen Foods', 'frozen-foods', _l1, 2, 9, true)
  ON CONFLICT (slug) DO NOTHING;

  SELECT id INTO _l2 FROM public.categories WHERE slug = 'frozen-foods' LIMIT 1;
  INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
    ('Frozen Vegetables', 'frozen-vegetables', _l2, 3, 1, true),
    ('Frozen Snacks',     'frozen-snacks',     _l2, 3, 2, true),
    ('Ice Cream',         'ice-cream',         _l2, 3, 3, true),
    ('Frozen Parathas',   'frozen-parathas',   _l2, 3, 4, true)
  ON CONFLICT (slug) DO NOTHING;

  -- ───────────────────────── BOOKS (Audiobooks + Magazines) ─────────────────
  SELECT id INTO _l1 FROM public.categories
   WHERE slug = 'books' AND level = 1 LIMIT 1;
  IF _l1 IS NULL THEN RAISE EXCEPTION 'L1 books missing'; END IF;

  INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
  VALUES ('Audiobooks', 'audiobooks', _l1, 2, 8, true)
  ON CONFLICT (slug) DO NOTHING;

  SELECT id INTO _l2 FROM public.categories WHERE slug = 'audiobooks' LIMIT 1;
  INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
    ('Fiction Audiobooks',     'audiobooks-fiction',     _l2, 3, 1, true),
    ('Non-Fiction Audiobooks', 'audiobooks-non-fiction', _l2, 3, 2, true),
    ('Kids Audiobooks',        'audiobooks-kids',        _l2, 3, 3, true)
  ON CONFLICT (slug) DO NOTHING;

  INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
  VALUES ('Magazines & Newspapers', 'magazines-newspapers', _l1, 2, 9, true)
  ON CONFLICT (slug) DO NOTHING;

  SELECT id INTO _l2 FROM public.categories WHERE slug = 'magazines-newspapers' LIMIT 1;
  INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
    ('Magazines',  'magazines',  _l2, 3, 1, true),
    ('Newspapers', 'newspapers', _l2, 3, 2, true)
  ON CONFLICT (slug) DO NOTHING;

  -- ─────────────────── HEALTH/HOUSEHOLD/BABY-CARE (Oral Care) ───────────────
  SELECT id INTO _l1 FROM public.categories
   WHERE slug = 'health-household-baby-care' AND level = 1 LIMIT 1;
  IF _l1 IS NULL THEN RAISE EXCEPTION 'L1 health-household-baby-care missing'; END IF;

  INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
  VALUES ('Oral Care', 'oral-care', _l1, 2, 10, true)
  ON CONFLICT (slug) DO NOTHING;

  SELECT id INTO _l2 FROM public.categories WHERE slug = 'oral-care' LIMIT 1;
  INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
    ('Toothbrushes',   'toothbrushes',    _l2, 3, 1, true),
    ('Mouthwash',      'mouthwash',       _l2, 3, 2, true),
    ('Dental Floss',   'dental-floss',    _l2, 3, 3, true),
    ('Toothpaste',     'toothpaste-care', _l2, 3, 4, true)
  ON CONFLICT (slug) DO NOTHING;

  -- ──────────────── SPORTS (Water Sports + Martial Arts) ────────────────────
  SELECT id INTO _l1 FROM public.categories
   WHERE slug = 'sports-fitness-outdoors' AND level = 1 LIMIT 1;
  IF _l1 IS NULL THEN RAISE EXCEPTION 'L1 sports-fitness-outdoors missing'; END IF;

  INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
  VALUES ('Water Sports', 'water-sports', _l1, 2, 9, true)
  ON CONFLICT (slug) DO NOTHING;

  SELECT id INTO _l2 FROM public.categories WHERE slug = 'water-sports' LIMIT 1;
  INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
    ('Swim Goggles',    'swim-goggles',    _l2, 3, 1, true),
    ('Swimming Floats', 'swimming-floats', _l2, 3, 2, true),
    ('Surfboards',      'surfboards',      _l2, 3, 3, true),
    ('Life Jackets',    'life-jackets',    _l2, 3, 4, true)
  ON CONFLICT (slug) DO NOTHING;

  INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
  VALUES ('Martial Arts', 'martial-arts', _l1, 2, 10, true)
  ON CONFLICT (slug) DO NOTHING;

  SELECT id INTO _l2 FROM public.categories WHERE slug = 'martial-arts' LIMIT 1;
  INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
    ('Boxing Gloves',  'boxing-gloves',  _l2, 3, 1, true),
    ('Punching Bags',  'punching-bags',  _l2, 3, 2, true),
    ('Karate Belts',   'karate-belts',   _l2, 3, 3, true),
    ('Shin Guards',    'shin-guards',    _l2, 3, 4, true)
  ON CONFLICT (slug) DO NOTHING;

  -- ──────────────── HOME & GARDEN (originally home-kitchen) ─────────────────
  SELECT id INTO _l1 FROM public.categories
   WHERE slug = 'home-garden' AND level = 1 LIMIT 1;
  IF _l1 IS NULL THEN RAISE EXCEPTION 'L1 home-garden missing'; END IF;

  INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
  VALUES ('Bathroom Accessories', 'bathroom-accessories', _l1, 2, 9, true)
  ON CONFLICT (slug) DO NOTHING;

  SELECT id INTO _l2 FROM public.categories WHERE slug = 'bathroom-accessories' LIMIT 1;
  INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
    ('Soap Dispensers',     'soap-dispensers',     _l2, 3, 1, true),
    ('Shower Curtains',     'shower-curtains',     _l2, 3, 2, true),
    ('Bathroom Shelves',    'bathroom-shelves',    _l2, 3, 3, true),
    ('Toilet Seat Covers',  'toilet-seat-covers',  _l2, 3, 4, true),
    ('Towel Racks',         'towel-racks',         _l2, 3, 5, true)
  ON CONFLICT (slug) DO NOTHING;

  INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
  VALUES ('Home Improvement', 'home-improvement', _l1, 2, 10, true)
  ON CONFLICT (slug) DO NOTHING;

  SELECT id INTO _l2 FROM public.categories WHERE slug = 'home-improvement' LIMIT 1;
  INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
    ('Paint & Primers',     'hi-paint',         _l2, 3, 1, true),
    ('Plumbing Supplies',   'hi-plumbing',      _l2, 3, 2, true),
    ('Electrical Fittings', 'hi-electrical',    _l2, 3, 3, true),
    ('Door Hardware',       'hi-door-hardware', _l2, 3, 4, true),
    ('Wallpaper',           'hi-wallpaper',     _l2, 3, 5, true),
    ('Tiles & Flooring',    'hi-tiles',         _l2, 3, 6, true)
  ON CONFLICT (slug) DO NOTHING;

  INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
  VALUES ('Laundry & Ironing', 'laundry-ironing', _l1, 2, 11, true)
  ON CONFLICT (slug) DO NOTHING;

  SELECT id INTO _l2 FROM public.categories WHERE slug = 'laundry-ironing' LIMIT 1;
  INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
    ('Irons',           'li-irons',           _l2, 3, 1, true),
    ('Ironing Boards',  'li-ironing-boards',  _l2, 3, 2, true),
    ('Drying Racks',    'li-drying-racks',    _l2, 3, 3, true),
    ('Laundry Baskets', 'li-laundry-baskets', _l2, 3, 4, true),
    ('Clothes Hangers', 'li-hangers',         _l2, 3, 5, true)
  ON CONFLICT (slug) DO NOTHING;

END $$;
