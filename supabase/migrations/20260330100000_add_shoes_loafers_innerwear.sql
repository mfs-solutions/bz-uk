-- ============================================================
-- Add Shoes & Loafers to Footwear (+ men/women/kids variants)
-- Add Innerwear as new Level 2 under Fashion
-- ============================================================

DO $$
DECLARE
  _fashion UUID;
  _dept    UUID;
BEGIN

  SELECT id INTO _fashion FROM public.categories WHERE slug = 'fashion' LIMIT 1;
  IF _fashion IS NULL THEN RAISE EXCEPTION 'Fashion category not found'; END IF;

  -- ────────────────────────────────────────────────────────
  -- 1. Shoes & Loafers under Footwear (Level 2)
  -- ────────────────────────────────────────────────────────
  SELECT id INTO _dept FROM public.categories WHERE slug = 'footwear' LIMIT 1;
  IF _dept IS NOT NULL THEN
    INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
      ('Shoes',   'shoes',   _dept, 3, 6),
      ('Loafers', 'loafers', _dept, 3, 7)
    ON CONFLICT (slug) DO NOTHING;
  END IF;

  -- ────────────────────────────────────────────────────────
  -- 2. Shoes & Loafers under Men
  -- ────────────────────────────────────────────────────────
  SELECT id INTO _dept FROM public.categories WHERE slug = 'men' LIMIT 1;
  IF _dept IS NOT NULL THEN
    INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
      ('Shoes',   'mens-shoes',   _dept, 3, 7),
      ('Loafers', 'mens-loafers', _dept, 3, 8)
    ON CONFLICT (slug) DO NOTHING;
  END IF;

  -- ────────────────────────────────────────────────────────
  -- 3. Shoes & Loafers under Women
  -- ────────────────────────────────────────────────────────
  SELECT id INTO _dept FROM public.categories WHERE slug = 'women' LIMIT 1;
  IF _dept IS NOT NULL THEN
    INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
      ('Shoes',   'womens-shoes',   _dept, 3, 7),
      ('Loafers', 'womens-loafers', _dept, 3, 8)
    ON CONFLICT (slug) DO NOTHING;
  END IF;

  -- ────────────────────────────────────────────────────────
  -- 4. Shoes & Loafers under Kids
  -- ────────────────────────────────────────────────────────
  SELECT id INTO _dept FROM public.categories WHERE slug = 'kids' LIMIT 1;
  IF _dept IS NOT NULL THEN
    INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
      ('Shoes',   'kids-shoes',   _dept, 3, 5),
      ('Loafers', 'kids-loafers', _dept, 3, 6)
    ON CONFLICT (slug) DO NOTHING;
  END IF;

  -- ────────────────────────────────────────────────────────
  -- 5. Innerwear (NEW Level 2 under Fashion)
  -- ────────────────────────────────────────────────────────
  INSERT INTO public.categories (name, slug, parent_id, level, display_order)
  VALUES ('Innerwear', 'innerwear', _fashion, 2, 6)
  ON CONFLICT (slug) DO NOTHING;

  SELECT id INTO _dept FROM public.categories WHERE slug = 'innerwear' LIMIT 1;
  IF _dept IS NOT NULL THEN
    INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
      ('Men''s Innerwear',   'mens-innerwear',   _dept, 3, 1),
      ('Women''s Innerwear', 'womens-innerwear', _dept, 3, 2),
      ('Kids Innerwear',     'kids-innerwear',   _dept, 3, 3)
    ON CONFLICT (slug) DO NOTHING;
  END IF;

END;
$$;

-- ────────────────────────────────────────────────────────
-- HSN codes for the new categories
-- ────────────────────────────────────────────────────────
INSERT INTO public.category_hsn_codes (category_slug, hsn_code, description) VALUES
  -- Footwear sub-categories
  ('shoes',           '64039990', 'Shoes — other footwear'),
  ('loafers',         '64035190', 'Loafers — footwear with leather uppers'),
  ('mens-shoes',      '64039990', 'Men''s Shoes'),
  ('mens-loafers',    '64035190', 'Men''s Loafers'),
  ('womens-shoes',    '64039990', 'Women''s Shoes'),
  ('womens-loafers',  '64035190', 'Women''s Loafers'),
  ('kids-shoes',      '64039990', 'Kids Shoes'),
  ('kids-loafers',    '64035190', 'Kids Loafers'),
  -- Innerwear
  ('innerwear',         '61071100', 'Innerwear — cotton undergarments'),
  ('mens-innerwear',    '61071100', 'Men''s Innerwear — underpants & briefs of cotton'),
  ('womens-innerwear',  '61082100', 'Women''s Innerwear — briefs & panties of cotton'),
  ('kids-innerwear',    '61119090', 'Kids Innerwear — babies'' garments of cotton')
ON CONFLICT (category_slug) DO UPDATE
  SET hsn_code    = EXCLUDED.hsn_code,
      description = EXCLUDED.description;
