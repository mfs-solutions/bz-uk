-- Combo Offers category tree
-- Adds 1 L1 ("Combo Offers"), 40 L2 sub-categories, 15 L3 product types
-- under each L2 (= 600 L3 rows), and one HSN mapping per L2 slug.
-- The seller wizard's resolveHsn() picks the most specific category slug
-- (L3 -> L2 -> L1), so HSN keyed on L2 slugs is the right granularity.
-- L3 slugs are scoped "<type>-in-<l2>" to satisfy categories_slug_unique.

BEGIN;

-- ── L1 ──────────────────────────────────────────────────────────────
INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
VALUES ('Combo Offers', 'combo-offers', NULL, 1, 23, true)
ON CONFLICT (slug) DO NOTHING;

-- ── L2 sub-categories + HSN map ─────────────────────────────────────
WITH l1 AS (SELECT id FROM public.categories WHERE slug = 'combo-offers'),
l2_data(name, slug, display_order, hsn_code) AS (VALUES
  ('Home Utility Combos',               'home-utility-combos',                1,  '39249090'),
  ('Kitchen Combos',                    'kitchen-combos',                     2,  '85094000'),
  ('Electronics Combos',                'electronics-combos',                 3,  '85437099'),
  ('Mobile Accessories Combos',         'mobile-accessories-combos',          4,  '85177990'),
  ('Computer Accessories Combos',       'computer-accessories-combos',        5,  '84733099'),
  ('Travel Combos',                     'travel-combos',                      6,  '42029200'),
  ('Office Essentials Combos',          'office-essentials-combos',           7,  '48201000'),
  ('Study & Student Combos',            'study-student-combos',               8,  '48201000'),
  ('Beauty & Personal Care Combos',     'beauty-personal-care-combos',        9,  '33049990'),
  ('Health & Wellness Combos',          'health-wellness-combos',             10, '90191090'),
  ('Fitness & Sports Combos',           'fitness-sports-combos',              11, '95069190'),
  ('Fashion Combos',                    'fashion-combos',                     12, '62034990'),
  ('Men''s Fashion Combos',             'mens-fashion-combos',                13, '62034990'),
  ('Women''s Fashion Combos',           'womens-fashion-combos',              14, '62046990'),
  ('Kids Combos',                       'kids-combos',                        15, '61112000'),
  ('Baby Care Combos',                  'baby-care-combos',                   16, '96190010'),
  ('Grocery Combos',                    'grocery-combos',                     17, '21069099'),
  ('Snacks & Beverage Combos',          'snacks-beverage-combos',             18, '21069099'),
  ('Dry Fruits & Nuts Combos',          'dry-fruits-nuts-combos',             19, '08029090'),
  ('Festival Combos',                   'festival-combos',                    20, '95059090'),
  ('Gift Combos',                       'gift-combos',                        21, '48239099'),
  ('Corporate Gift Combos',             'corporate-gift-combos',              22, '48239099'),
  ('Wedding Gift Combos',               'wedding-gift-combos',                23, '48239099'),
  ('Housewarming Gift Combos',          'housewarming-gift-combos',           24, '94036000'),
  ('Rakhi Special Combos',              'rakhi-special-combos',               25, '71179090'),
  ('Diwali Special Combos',             'diwali-special-combos',              26, '95059090'),
  ('Christmas Special Combos',          'christmas-special-combos',           27, '95051000'),
  ('New Year Special Combos',           'new-year-special-combos',            28, '95059090'),
  ('Home Decor Combos',                 'home-decor-combos',                  29, '83062900'),
  ('Furniture Combos',                  'furniture-combos',                   30, '94036000'),
  ('Garden & Outdoor Combos',           'garden-outdoor-combos',              31, '39269099'),
  ('Pet Care Combos',                   'pet-care-combos',                    32, '23091000'),
  ('Automotive Combos',                 'automotive-combos',                  33, '87089900'),
  ('DIY & Tools Combos',                'diy-tools-combos',                   34, '82055990'),
  ('Smart Home Combos',                 'smart-home-combos',                  35, '85371000'),
  ('Eco-Friendly Combos',               'eco-friendly-combos',                36, '39269099'),
  ('Premium Combos',                    'premium-combos',                     37, '48239099'),
  ('Family Value Packs',                'family-value-packs',                 38, '21069099'),
  ('Daily Essentials Combos',           'daily-essentials-combos',            39, '39249090'),
  ('Multi-Utility Combos',              'multi-utility-combos',               40, '39269099')
)
INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
SELECT d.name, d.slug, l1.id, 2, d.display_order, true
FROM l2_data d, l1
ON CONFLICT (slug) DO NOTHING;

-- HSN mapping per L2 slug (resolveHsn fallback walks L3 -> L2 -> L1).
INSERT INTO public.category_hsn_codes (category_slug, hsn_code, description)
SELECT slug, hsn_code, name
FROM (VALUES
  ('home-utility-combos',                '39249090', 'Home Utility Combos'),
  ('kitchen-combos',                     '85094000', 'Kitchen Combos'),
  ('electronics-combos',                 '85437099', 'Electronics Combos'),
  ('mobile-accessories-combos',          '85177990', 'Mobile Accessories Combos'),
  ('computer-accessories-combos',        '84733099', 'Computer Accessories Combos'),
  ('travel-combos',                      '42029200', 'Travel Combos'),
  ('office-essentials-combos',           '48201000', 'Office Essentials Combos'),
  ('study-student-combos',               '48201000', 'Study & Student Combos'),
  ('beauty-personal-care-combos',        '33049990', 'Beauty & Personal Care Combos'),
  ('health-wellness-combos',             '90191090', 'Health & Wellness Combos'),
  ('fitness-sports-combos',              '95069190', 'Fitness & Sports Combos'),
  ('fashion-combos',                     '62034990', 'Fashion Combos'),
  ('mens-fashion-combos',                '62034990', 'Men''s Fashion Combos'),
  ('womens-fashion-combos',              '62046990', 'Women''s Fashion Combos'),
  ('kids-combos',                        '61112000', 'Kids Combos'),
  ('baby-care-combos',                   '96190010', 'Baby Care Combos'),
  ('grocery-combos',                     '21069099', 'Grocery Combos'),
  ('snacks-beverage-combos',             '21069099', 'Snacks & Beverage Combos'),
  ('dry-fruits-nuts-combos',             '08029090', 'Dry Fruits & Nuts Combos'),
  ('festival-combos',                    '95059090', 'Festival Combos'),
  ('gift-combos',                        '48239099', 'Gift Combos'),
  ('corporate-gift-combos',              '48239099', 'Corporate Gift Combos'),
  ('wedding-gift-combos',                '48239099', 'Wedding Gift Combos'),
  ('housewarming-gift-combos',           '94036000', 'Housewarming Gift Combos'),
  ('rakhi-special-combos',               '71179090', 'Rakhi Special Combos'),
  ('diwali-special-combos',              '95059090', 'Diwali Special Combos'),
  ('christmas-special-combos',           '95051000', 'Christmas Special Combos'),
  ('new-year-special-combos',            '95059090', 'New Year Special Combos'),
  ('home-decor-combos',                  '83062900', 'Home Decor Combos'),
  ('furniture-combos',                   '94036000', 'Furniture Combos'),
  ('garden-outdoor-combos',              '39269099', 'Garden & Outdoor Combos'),
  ('pet-care-combos',                    '23091000', 'Pet Care Combos'),
  ('automotive-combos',                  '87089900', 'Automotive Combos'),
  ('diy-tools-combos',                   '82055990', 'DIY & Tools Combos'),
  ('smart-home-combos',                  '85371000', 'Smart Home Combos'),
  ('eco-friendly-combos',                '39269099', 'Eco-Friendly Combos'),
  ('premium-combos',                     '48239099', 'Premium Combos'),
  ('family-value-packs',                 '21069099', 'Family Value Packs'),
  ('daily-essentials-combos',            '39249090', 'Daily Essentials Combos'),
  ('multi-utility-combos',               '39269099', 'Multi-Utility Combos')
) AS v(slug, hsn_code, name)
ON CONFLICT (category_slug) DO NOTHING;

-- ── L3 product types (15 per L2 = 600 rows). Slug scoped to its L2 ───
WITH l2 AS (
  SELECT id, slug
  FROM public.categories
  WHERE level = 2
    AND parent_id = (SELECT id FROM public.categories WHERE slug = 'combo-offers')
),
types(name, base_slug, display_order) AS (VALUES
  ('Daily Use Combo',          'daily-use-combo',          1),
  ('Utility Combo',            'utility-combo',            2),
  ('Value Combo',              'value-combo',              3),
  ('Saver Combo',              'saver-combo',              4),
  ('Family Combo',             'family-combo',             5),
  ('Premium Combo',            'premium-combo',            6),
  ('Travel Essentials Combo',  'travel-essentials-combo',  7),
  ('Home Essentials Combo',    'home-essentials-combo',    8),
  ('Gift Pack',                'gift-pack',                9),
  ('Festival Pack',            'festival-pack',            10),
  ('Corporate Pack',           'corporate-pack',           11),
  ('Starter Pack',             'starter-pack',             12),
  ('Mega Combo',               'mega-combo',               13),
  ('Smart Combo',              'smart-combo',              14),
  ('Limited Edition Combo',    'limited-edition-combo',    15)
)
INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
SELECT t.name,
       t.base_slug || '-in-' || l2.slug,
       l2.id,
       3,
       t.display_order,
       true
FROM l2 CROSS JOIN types t
ON CONFLICT (slug) DO NOTHING;

COMMIT;
