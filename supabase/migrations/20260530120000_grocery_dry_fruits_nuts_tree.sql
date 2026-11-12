-- ============================================================
-- Grocery → Dry Fruits & Nuts 3-level category tree + HSN codes
-- L1: Grocery (existing)
--   L2: Dry Fruits, Nuts, Seeds, Dates, Trail Mixes, Dry Fruit Combos
--     L3: product types (with India CBIC HSN codes)
-- Idempotent: ON CONFLICT (slug) DO NOTHING for categories,
--             ON CONFLICT (category_slug) DO UPDATE for HSN.
-- ============================================================
DO $$
DECLARE
  _grocery UUID;
  _l2 UUID;
BEGIN
  SELECT id INTO _grocery FROM public.categories WHERE slug = 'grocery' AND level = 1 LIMIT 1;
  IF _grocery IS NULL THEN
    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES ('Grocery', 'grocery', NULL, 1, 5, true)
    RETURNING id INTO _grocery;
  END IF;

  -- ── L2: Dry Fruits ────────────────────────────────────────
  INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
  VALUES ('Dry Fruits', 'dry-fruits', _grocery, 2, 1, true)
  ON CONFLICT (slug) DO NOTHING;
  SELECT id INTO _l2 FROM public.categories WHERE slug = 'dry-fruits' LIMIT 1;
  INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
    ('Raisins',  'df-raisins',  _l2, 3, 1, true),
    ('Anjeer',   'df-anjeer',   _l2, 3, 2, true),
    ('Apricots', 'df-apricots', _l2, 3, 3, true)
  ON CONFLICT (slug) DO NOTHING;

  -- ── L2: Nuts ──────────────────────────────────────────────
  INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
  VALUES ('Nuts', 'nuts', _grocery, 2, 2, true)
  ON CONFLICT (slug) DO NOTHING;
  SELECT id INTO _l2 FROM public.categories WHERE slug = 'nuts' LIMIT 1;
  INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
    ('Cashew Nuts', 'nuts-cashew',     _l2, 3, 1, true),
    ('Almonds',     'nuts-almonds',    _l2, 3, 2, true),
    ('Pistachios',  'nuts-pistachios', _l2, 3, 3, true),
    ('Walnuts',     'nuts-walnuts',    _l2, 3, 4, true)
  ON CONFLICT (slug) DO NOTHING;

  -- ── L2: Seeds ─────────────────────────────────────────────
  INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
  VALUES ('Seeds', 'seeds', _grocery, 2, 3, true)
  ON CONFLICT (slug) DO NOTHING;
  SELECT id INTO _l2 FROM public.categories WHERE slug = 'seeds' LIMIT 1;
  INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
    ('Sunflower Seeds', 'seeds-sunflower', _l2, 3, 1, true),
    ('Pumpkin Seeds',   'seeds-pumpkin',   _l2, 3, 2, true),
    ('Chia Seeds',      'seeds-chia',      _l2, 3, 3, true),
    ('Flax Seeds',      'seeds-flax',      _l2, 3, 4, true)
  ON CONFLICT (slug) DO NOTHING;

  -- ── L2: Dates ─────────────────────────────────────────────
  INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
  VALUES ('Dates', 'dates', _grocery, 2, 4, true)
  ON CONFLICT (slug) DO NOTHING;
  SELECT id INTO _l2 FROM public.categories WHERE slug = 'dates' LIMIT 1;
  INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
    ('Medjool Dates', 'dates-medjool', _l2, 3, 1, true),
    ('Ajwa Dates',    'dates-ajwa',    _l2, 3, 2, true),
    ('Kimia Dates',   'dates-kimia',   _l2, 3, 3, true)
  ON CONFLICT (slug) DO NOTHING;

  -- ── L2: Trail Mixes ───────────────────────────────────────
  INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
  VALUES ('Trail Mixes', 'trail-mixes', _grocery, 2, 5, true)
  ON CONFLICT (slug) DO NOTHING;
  SELECT id INTO _l2 FROM public.categories WHERE slug = 'trail-mixes' LIMIT 1;
  INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
    ('Mixed Dry Fruits', 'trail-mixed-dry-fruits', _l2, 3, 1, true),
    ('Trail Mix',        'trail-mix',              _l2, 3, 2, true)
  ON CONFLICT (slug) DO NOTHING;

  -- ── L2: Dry Fruit Combos ──────────────────────────────────
  INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
  VALUES ('Dry Fruit Combos', 'dry-fruit-combos', _grocery, 2, 6, true)
  ON CONFLICT (slug) DO NOTHING;
  SELECT id INTO _l2 FROM public.categories WHERE slug = 'dry-fruit-combos' LIMIT 1;
  INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
    ('Mixed Dry Fruits Combo', 'combo-mixed-dry-fruits', _l2, 3, 1, true),
    ('Gift Packs',             'combo-gift-packs',       _l2, 3, 2, true)
  ON CONFLICT (slug) DO NOTHING;
END $$;

-- ── HSN codes (India CBIC 8-digit) for all new category slugs ──
INSERT INTO public.category_hsn_codes (category_slug, hsn_code, description) VALUES
  -- L2 defaults
  ('dry-fruits',       '08134090', 'Dried fruits'),
  ('nuts',             '08134090', 'Edible nuts'),
  ('seeds',            '12079990', 'Edible seeds'),
  ('dates',            '08041030', 'Dates'),
  ('trail-mixes',      '08134090', 'Mixtures of dried fruits & nuts'),
  ('dry-fruit-combos', '08134090', 'Dry fruit combo packs'),
  -- Dry Fruits L3
  ('df-raisins',       '08062010', 'Raisins'),
  ('df-anjeer',        '08042090', 'Dried figs (anjeer)'),
  ('df-apricots',      '08131000', 'Dried apricots'),
  -- Nuts L3
  ('nuts-cashew',      '08013210', 'Cashew kernels (shelled)'),
  ('nuts-almonds',     '08022200', 'Almonds, shelled'),
  ('nuts-pistachios',  '08025200', 'Pistachios, shelled'),
  ('nuts-walnuts',     '08023200', 'Walnuts, shelled'),
  -- Seeds L3
  ('seeds-sunflower',  '12060010', 'Sunflower seeds'),
  ('seeds-pumpkin',    '12079990', 'Pumpkin seeds'),
  ('seeds-chia',       '12079990', 'Chia seeds'),
  ('seeds-flax',       '12040090', 'Flax (linseed) seeds'),
  -- Dates L3
  ('dates-medjool',    '08041030', 'Medjool dates'),
  ('dates-ajwa',       '08041030', 'Ajwa dates'),
  ('dates-kimia',      '08041030', 'Kimia dates'),
  -- Trail Mixes L3
  ('trail-mixed-dry-fruits', '08134090', 'Mixed dry fruits'),
  ('trail-mix',              '08134090', 'Trail mix'),
  -- Dry Fruit Combos L3
  ('combo-mixed-dry-fruits', '08134090', 'Mixed dry fruits combo'),
  ('combo-gift-packs',       '08134090', 'Dry fruit gift packs')
ON CONFLICT (category_slug) DO UPDATE SET hsn_code = EXCLUDED.hsn_code, description = EXCLUDED.description;
