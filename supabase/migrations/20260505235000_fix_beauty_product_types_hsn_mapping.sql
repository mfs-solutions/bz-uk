-- Fix: Add missing beauty product types and their HSN code mappings
-- This migration corrects the previous migration which used wrong table name

DO $$
DECLARE
  v_skincare_id uuid;
  v_makeup_id uuid;
BEGIN
  SELECT id INTO v_skincare_id
  FROM public.categories
  WHERE slug = 'skincare' AND level = 2
  LIMIT 1;

  IF v_skincare_id IS NULL THEN
    RAISE EXCEPTION 'Parent category slug=skincare (level=2) not found';
  END IF;

  SELECT id INTO v_makeup_id
  FROM public.categories
  WHERE slug = 'makeup' AND level = 2
  LIMIT 1;

  IF v_makeup_id IS NULL THEN
    RAISE EXCEPTION 'Parent category slug=makeup (level=2) not found';
  END IF;

  INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
  VALUES
    ('Toners', 'toners', v_skincare_id, 3, 5, true),
    ('Skin Care Kits', 'skin-care-kits', v_skincare_id, 3, 6, true),
    ('Lip Balm', 'lip-balm', v_makeup_id, 3, 12, true)
  ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name, parent_id = EXCLUDED.parent_id, level = EXCLUDED.level, 
      display_order = EXCLUDED.display_order, is_active = EXCLUDED.is_active;
END $$;

INSERT INTO public.category_hsn_codes (category_slug, hsn_code, description)
VALUES
  ('toners', '33049990', 'Skin toner preparations'),
  ('skin-care-kits', '33049990', 'Skin care kits and combo sets'),
  ('lip-balm', '33041000', 'Lip balm and lip care preparations')
ON CONFLICT (category_slug) DO UPDATE
SET hsn_code = EXCLUDED.hsn_code, description = EXCLUDED.description;
