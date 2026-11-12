-- ============================================================================
-- Follow-up to 20260526260000_fix_grocery_spices_l2_l3.sql.
--
-- Same root cause (the 'grocery' vs 'grocery-gourmet-food' slug bug in
-- 20260412200000_mega_categories_and_hsn.sql) also skipped two more L2
-- branches under Grocery: Dairy & Eggs and Condiments & Sauces, plus all
-- their L3 children. HSN rows for those slugs were already seeded
-- (orphan rows in category_hsn_codes), so we only need to create the
-- category rows — the HSN linkage by slug becomes valid automatically.
-- ============================================================================

DO $$
DECLARE
  _l1 uuid;
  _l2 uuid;
BEGIN
  SELECT id INTO _l1
    FROM public.categories
   WHERE slug = 'grocery-gourmet-food' AND level = 1
   LIMIT 1;

  IF _l1 IS NULL THEN
    RAISE EXCEPTION 'Grocery L1 (slug=grocery-gourmet-food) not found — aborting';
  END IF;

  -- ─── L2: Dairy & Eggs ───
  INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
  VALUES ('Dairy & Eggs', 'dairy-eggs', _l1, 2, 6, true)
  ON CONFLICT (slug) DO NOTHING;

  SELECT id INTO _l2 FROM public.categories WHERE slug = 'dairy-eggs' LIMIT 1;
  IF _l2 IS NULL THEN
    RAISE EXCEPTION 'dairy-eggs L2 insert failed';
  END IF;

  INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
    ('Milk',           'milk',          _l2, 3, 1, true),
    ('Cheese',         'cheese-dairy',  _l2, 3, 2, true),
    ('Butter & Ghee',  'butter-ghee',   _l2, 3, 3, true),
    ('Yoghurt & Curd', 'yoghurt-curd',  _l2, 3, 4, true),
    ('Eggs',           'eggs',          _l2, 3, 5, true),
    ('Paneer',         'paneer',        _l2, 3, 6, true)
  ON CONFLICT (slug) DO NOTHING;

  -- ─── L2: Condiments & Sauces ───
  INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
  VALUES ('Condiments & Sauces', 'condiments-sauces', _l1, 2, 8, true)
  ON CONFLICT (slug) DO NOTHING;

  SELECT id INTO _l2 FROM public.categories WHERE slug = 'condiments-sauces' LIMIT 1;
  IF _l2 IS NULL THEN
    RAISE EXCEPTION 'condiments-sauces L2 insert failed';
  END IF;

  INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
    ('Ketchup',       'ketchup',      _l2, 3, 1, true),
    ('Mayonnaise',    'mayonnaise',   _l2, 3, 2, true),
    ('Soy Sauce',     'soy-sauce',    _l2, 3, 3, true),
    ('Vinegar',       'vinegar',      _l2, 3, 4, true),
    ('Chilli Sauce',  'chilli-sauce', _l2, 3, 5, true)
  ON CONFLICT (slug) DO NOTHING;
END $$;
