-- 20260522130000_add_mens_clothing_product_types.sql
-- Adds the full Men's Clothing product-type list (Level-3 categories under
-- Fashion > Men's Clothing) plus matching HSN codes (Indian GST, 8-digit).
--
-- Idempotent: re-runnable. Uses ON CONFLICT(slug)/ON CONFLICT(category_slug)
-- DO NOTHING so existing rows are preserved untouched.
--
-- Men's Clothing id: 1584b8ae-a83c-451c-9110-56fd1f210ba7 (level=2,
-- parent = Fashion). Existing children at display_order 1-4: Shirts,
-- T-Shirts, Jeans, Footwear. New rows start at display_order 5.

BEGIN;

WITH parent AS (
  SELECT id
    FROM public.categories
   WHERE name = 'Men''s Clothing'
     AND level = 2
   LIMIT 1
),
new_types(name, slug, display_order) AS (
  VALUES
    -- Topwear (5–12)
    ('Casual Shirts',           'mc-casual-shirts',          5),
    ('Formal Shirts',           'mc-formal-shirts',          6),
    ('Sweatshirts',             'mc-sweatshirts',            7),
    ('Sweaters',                'mc-sweaters',               8),
    ('Jackets',                 'mc-jackets',                9),
    ('Blazers & Coats',         'mc-blazers-coats',         10),
    ('Suits',                   'mc-suits',                 11),
    ('Rain Jackets',            'mc-rain-jackets',          12),
    -- Ethnic (13–16)
    ('Kurtas & Kurta Sets',     'mc-kurtas-kurta-sets',     13),
    ('Sherwanis',               'mc-sherwanis',             14),
    ('Nehru Jackets',           'mc-nehru-jackets',         15),
    ('Dhotis',                  'mc-dhotis',                16),
    -- Bottomwear (17–20)
    ('Casual Trousers',         'mc-casual-trousers',       17),
    ('Formal Trousers',         'mc-formal-trousers',       18),
    ('Shorts',                  'mc-shorts',                19),
    ('Track Pants & Joggers',   'mc-track-pants-joggers',   20),
    -- Innerwear (21–25)
    ('Briefs & Trunks',         'mc-briefs-trunks',         21),
    ('Boxers',                  'mc-boxers',                22),
    ('Vests',                   'mc-vests',                 23),
    ('Sleepwear & Loungewear',  'mc-sleepwear-loungewear',  24),
    ('Thermals',                'mc-thermals',              25)
)
INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
SELECT nt.name, nt.slug, p.id, 3, nt.display_order, true
  FROM new_types nt
 CROSS JOIN parent p
ON CONFLICT (slug) DO NOTHING;

-- HSN codes (India GST, 8-digit) keyed by category_slug.
-- References (Customs Tariff Schedule, Chapter 61 knitted / 62 not knitted):
--   6203: Men's suits, jackets, blazers, trousers, shorts (woven)
--   6201: Men's overcoats, raincoats, anoraks (woven)
--   6110: Sweaters, pullovers, sweatshirts (knitted)
--   6109: T-shirts, singlets, vests (knitted)
--   6107: Men's underpants, briefs, nightshirts, pyjamas, bathrobes (knitted)
--   6205: Men's shirts (woven)
--   6211: Track suits, other garments (incl. ethnic-style overgarments)

INSERT INTO public.category_hsn_codes (category_slug, hsn_code, description) VALUES
  ('mc-casual-shirts',         '62052000', 'Men''s shirts of cotton (woven)'),
  ('mc-formal-shirts',         '62053000', 'Men''s shirts of man-made fibres (woven)'),
  ('mc-sweatshirts',           '61102000', 'Sweatshirts, knitted - of cotton'),
  ('mc-sweaters',              '61103000', 'Sweaters, pullovers, cardigans - of man-made fibres'),
  ('mc-jackets',               '62033300', 'Men''s jackets and blazers of synthetic fibres'),
  ('mc-blazers-coats',         '62033100', 'Men''s jackets and blazers of wool / fine animal hair'),
  ('mc-suits',                 '62031900', 'Men''s suits - of other textile materials'),
  ('mc-rain-jackets',          '62019300', 'Men''s overcoats / raincoats / wind-cheaters of man-made fibres'),
  ('mc-kurtas-kurta-sets',     '62114200', 'Other garments, men''s - of cotton (kurtas, kurta sets)'),
  ('mc-sherwanis',             '62114390', 'Other garments, men''s - of man-made fibres (sherwanis, ethnic)'),
  ('mc-nehru-jackets',         '62114290', 'Other garments, men''s - of cotton (Nehru jackets)'),
  ('mc-dhotis',                '62034200', 'Men''s trousers / lower garments of cotton (dhotis)'),
  ('mc-casual-trousers',       '62034200', 'Men''s trousers of cotton (woven)'),
  ('mc-formal-trousers',       '62034300', 'Men''s trousers of synthetic fibres (woven)'),
  ('mc-shorts',                '62034990', 'Men''s shorts of other textile materials'),
  ('mc-track-pants-joggers',   '61034300', 'Men''s trousers / track pants of synthetic fibres (knitted)'),
  ('mc-briefs-trunks',         '61071100', 'Men''s underpants and briefs - of cotton (knitted)'),
  ('mc-boxers',                '61071200', 'Men''s underpants and briefs - of man-made fibres (knitted)'),
  ('mc-vests',                 '61099090', 'T-shirts, singlets and other vests - of other textiles (knitted)'),
  ('mc-sleepwear-loungewear',  '61072100', 'Men''s nightshirts and pyjamas - of cotton (knitted)'),
  ('mc-thermals',              '61072200', 'Men''s nightwear / thermals - of man-made fibres (knitted)')
ON CONFLICT (category_slug) DO NOTHING;

COMMIT;

-- Quick verification (run separately):
-- SELECT c.name, c.slug, c.display_order, h.hsn_code
--   FROM public.categories c
--   LEFT JOIN public.category_hsn_codes h ON h.category_slug = c.slug
--  WHERE c.parent_id = '1584b8ae-a83c-451c-9110-56fd1f210ba7'
--    AND c.level = 3
--  ORDER BY c.display_order;
