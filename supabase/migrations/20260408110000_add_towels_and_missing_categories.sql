-- ============================================================================
-- Add missing level-3 categories that had HSN codes but no category rows.
-- All HSN codes already exist in category_hsn_codes; this adds the
-- corresponding rows in the categories table with correct parent_id.
--
-- 5 towel types → Bedding & Furnishings (Home & Garden)
-- 1 steam-inhalers → Medical Devices (Health, Household & Baby Care)
-- 2 wellness items → Wellness Products (Health, Household & Baby Care)
-- ============================================================================

DO $$
DECLARE
  _bedding         UUID;
  _medical_devices UUID;
  _wellness        UUID;
BEGIN
  SELECT id INTO _bedding         FROM public.categories WHERE slug = 'bedding-furnishings';
  SELECT id INTO _medical_devices FROM public.categories WHERE slug = 'medical-devices';
  SELECT id INTO _wellness        FROM public.categories WHERE slug = 'wellness-products';

  -- Towels under Bedding & Furnishings
  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('Bath Towels',          'bath-towels',        _bedding, 3, 6),
    ('Beach Towels',         'beach-towels',       _bedding, 3, 7),
    ('Towel Sets',           'towel-sets',         _bedding, 3, 8),
    ('Towels & Bath Linen',  'towels-bath-linen',  _bedding, 3, 9),
    ('Hand Towels',          'hand-towels',        _bedding, 3, 10)
  ON CONFLICT (slug) DO NOTHING;

  -- Steam Inhalers under Medical Devices
  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('Steam Inhalers', 'steam-inhalers', _medical_devices, 3, 5)
  ON CONFLICT (slug) DO NOTHING;

  -- Hot Water Bags & Wellness Devices under Wellness Products
  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('Hot Water Bags',    'hot-water-bags',    _wellness, 3, 5),
    ('Wellness Devices',  'wellness-devices',  _wellness, 3, 6)
  ON CONFLICT (slug) DO NOTHING;
END $$;
