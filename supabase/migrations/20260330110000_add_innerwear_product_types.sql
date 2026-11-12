-- ============================================================
-- Add Innerwear as Level 3 Product Type under Men, Women, Kids
-- (so sellers see it when selecting Fashion → Men/Women/Kids)
-- ============================================================

DO $$
DECLARE
  _dept UUID;
BEGIN

  -- Men → Innerwear (Level 3)
  SELECT id INTO _dept FROM public.categories WHERE slug = 'men' LIMIT 1;
  IF _dept IS NOT NULL THEN
    INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
      ('Innerwear', 'mens-innerwear-type', _dept, 3, 9)
    ON CONFLICT (slug) DO NOTHING;
  END IF;

  -- Women → Innerwear (Level 3)
  SELECT id INTO _dept FROM public.categories WHERE slug = 'women' LIMIT 1;
  IF _dept IS NOT NULL THEN
    INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
      ('Innerwear', 'womens-innerwear-type', _dept, 3, 9)
    ON CONFLICT (slug) DO NOTHING;
  END IF;

  -- Kids → Innerwear (Level 3)
  SELECT id INTO _dept FROM public.categories WHERE slug = 'kids' LIMIT 1;
  IF _dept IS NOT NULL THEN
    INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
      ('Innerwear', 'kids-innerwear-type', _dept, 3, 7)
    ON CONFLICT (slug) DO NOTHING;
  END IF;

END;
$$;

-- HSN codes for the new product type entries
INSERT INTO public.category_hsn_codes (category_slug, hsn_code, description) VALUES
  ('mens-innerwear-type',   '61071100', 'Men''s Innerwear — underpants & briefs of cotton'),
  ('womens-innerwear-type', '61082100', 'Women''s Innerwear — briefs & panties of cotton'),
  ('kids-innerwear-type',   '61119090', 'Kids Innerwear — babies'' garments of cotton')
ON CONFLICT (category_slug) DO UPDATE
  SET hsn_code    = EXCLUDED.hsn_code,
      description = EXCLUDED.description;
