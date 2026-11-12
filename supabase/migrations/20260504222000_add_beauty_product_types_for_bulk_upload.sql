DO $$
DECLARE
  _skincare UUID;
  _makeup UUID;
BEGIN
  SELECT id INTO _skincare
  FROM public.categories
  WHERE slug = 'skincare' AND level = 2
  LIMIT 1;

  IF _skincare IS NOT NULL THEN
    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES
      ('Toners', 'toners', _skincare, 3, 5, true),
      ('Skin Care Kits', 'skin-care-kits', _skincare, 3, 6, true)
    ON CONFLICT (slug) DO NOTHING;
  END IF;

  SELECT id INTO _makeup
  FROM public.categories
  WHERE slug = 'makeup' AND level = 2
  LIMIT 1;

  IF _makeup IS NOT NULL THEN
    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES
      ('Lip Balm', 'lip-balm', _makeup, 3, 12, true)
    ON CONFLICT (slug) DO NOTHING;
  END IF;
END $$;

INSERT INTO public.category_hsn_codes (category_slug, hsn_code, description)
VALUES
  ('toners', '33049990', 'Skin toner preparations'),
  ('skin-care-kits', '33049990', 'Skin care kits and combo sets'),
  ('lip-balm', '33041000', 'Lip balm and lip care preparations')
ON CONFLICT (category_slug) DO UPDATE
SET hsn_code = EXCLUDED.hsn_code, description = EXCLUDED.description;
