-- ============================================================
-- 1. category_hsn_codes — maps category slug → default HSN code
-- ============================================================
create table if not exists public.category_hsn_codes (
  id            uuid primary key default gen_random_uuid(),
  category_slug text not null unique,
  hsn_code      text not null,
  description   text,
  created_at    timestamptz not null default now()
);

alter table public.category_hsn_codes enable row level security;

create policy "Anyone can read category HSN codes"
  on public.category_hsn_codes for select using (true);

-- ============================================================
-- 2. Add hsn_code column to products
-- ============================================================
alter table public.products
  add column if not exists hsn_code text;

-- ============================================================
-- 3. Seed HSN codes for all categories (level 1 + level 2)
--    HSN is matched at the most specific level available:
--    sub-category first, then main category.
-- ============================================================
insert into public.category_hsn_codes (category_slug, hsn_code, description) values
  -- Electronics (Level 1)
  ('electronics',          '8543',   'Electronics - Electrical machines & apparatus'),
  ('mobiles-accessories',  '8517',   'Mobiles & Accessories - Telephone sets'),
  ('smartphones',          '85171210','Smartphones'),
  ('feature-phones',       '85171290','Feature Phones'),
  ('chargers-cables',      '85044090','Chargers & Cables'),
  ('phone-cases',          '42023190','Phone Cases - Articles of leather'),
  ('screen-protectors',    '70072190','Screen Protectors - Tempered glass'),
  ('computers-laptops',    '8471',   'Computers & Laptops - Automatic data processing machines'),
  ('laptops',              '84713010','Laptops'),
  ('desktops',             '84715000','Desktops'),
  ('monitors',             '85285200','Monitors'),
  ('keyboards-mice',       '84716060','Keyboards & Mice'),
  ('audio',                '8518',   'Audio - Microphones, loudspeakers, headphones'),
  ('headphones',           '85183000','Headphones'),
  ('earbuds',              '85183000','Earbuds'),
  ('speakers',             '85182200','Speakers'),
  ('cameras',              '9006',   'Cameras - Photographic cameras'),
  ('dslr',                 '90065100','DSLR Cameras'),
  ('mirrorless',           '90065900','Mirrorless Cameras'),
  ('action-cameras',       '90065900','Action Cameras'),
  ('smart-devices',        '8517',   'Smart Devices'),
  ('smartwatches',         '91021200','Smartwatches'),
  ('smart-home',           '85176290','Smart Home Devices'),

  -- Fashion (Level 1)
  ('fashion',              '6109',   'Fashion - T-shirts, singlets, other vests (knitted)'),
  ('men',                  '6205',   'Men - Shirts'),
  ('shirts',               '62053000','Shirts - Of man-made fibres'),
  ('t-shirts',             '61091000','T-Shirts - Of cotton'),
  ('jeans',                '62034200','Jeans - Trousers of cotton'),
  ('footwear',             '64039990','Footwear'),
  ('women',                '6204',   'Women - Suits, dresses, skirts'),
  ('dresses',              '62044300','Dresses - Of synthetic fibres'),
  ('tops',                 '61061000','Tops - Blouses of cotton'),
  ('handbags',             '42022210','Handbags'),
  ('jewelry',              '71171900','Jewelry - Imitation jewellery'),
  ('kids',                 '6111',   'Kids - Babies garments'),
  ('boys-clothing',        '62034990','Boys Clothing'),
  ('girls-clothing',       '62044900','Girls Clothing'),
  ('school-wear',          '62114390','School Wear'),

  -- Home & Kitchen (Level 1)
  ('home-kitchen',         '9403',   'Home & Kitchen - Furniture'),
  ('furniture',            '9403',   'Furniture'),
  ('sofas',                '94017100','Sofas - Upholstered seats with metal frame'),
  ('beds',                 '94042100','Beds - Mattresses of cellular rubber/plastics'),
  ('tables',               '94036090','Tables - Other wooden furniture'),
  ('kitchen',              '7323',   'Kitchen - Stainless steel household articles'),
  ('cookware',             '73239390','Cookware'),
  ('storage',              '39241090','Storage - Tableware of plastics'),
  ('appliances',           '85167990','Appliances - Electro-thermic appliances'),
  ('decor',                '6304',   'Decor - Furnishing articles'),
  ('wall-art',             '97011090','Wall Art - Paintings'),
  ('lighting',             '94054090','Lighting - Lamps & light fittings'),

  -- Beauty & Health (Level 1)
  ('beauty-health',        '3304',   'Beauty & Health - Beauty/make-up preparations'),
  ('skincare',             '33049990','Skincare'),
  ('haircare',             '33059090','Haircare'),
  ('makeup',               '33041000','Makeup - Lip make-up preparations'),
  ('grooming',             '85109000','Grooming - Shavers, hair clippers'),
  ('supplements',          '21069099','Supplements - Food supplements'),

  -- Grocery (Level 1)
  ('grocery',              '2106',   'Grocery - Food preparations'),
  ('snacks',               '19059040','Snacks - Biscuits & cookies'),
  ('beverages',            '22029990','Beverages'),
  ('packaged-food',        '21069099','Packaged Food'),
  ('household-essentials', '34022090','Household Essentials - Cleaning preparations'),

  -- Sports & Outdoors (Level 1)
  ('sports-outdoors',      '9506',   'Sports & Outdoors - Articles for gymnastics/athletics'),
  ('fitness-equipment',    '95069990','Fitness Equipment'),
  ('cycling',              '87120090','Cycling - Bicycles'),
  ('camping',              '63062200','Camping - Tents'),
  ('outdoor-gear',         '95069190','Outdoor Gear'),

  -- Toys & Baby (Level 1)
  ('toys-baby',            '9503',   'Toys & Baby - Toys'),
  ('toys-games',           '95030090','Toys & Games'),
  ('baby-care',            '96190090','Baby Care - Diapers'),
  ('school-supplies',      '48201090','School Supplies - Exercise books'),

  -- Automotive (Level 1)
  ('automotive',           '8708',   'Automotive - Parts & accessories of motor vehicles'),
  ('car-accessories',      '87089900','Car Accessories'),
  ('bike-accessories',     '87141090','Bike Accessories'),
  ('tools',                '82055990','Automotive Tools'),

  -- Books & Media (Level 1)
  ('books-media',          '4901',   'Books & Media - Printed books'),
  ('books',                '49011010','Books'),
  ('educational',          '49019900','Educational Materials'),
  ('movies',               '85234920','Movies - Video recordings'),
  ('music',                '85234110','Music - Audio recordings'),

  -- Gaming (Level 1)
  ('gaming',               '9504',   'Gaming - Video game consoles & machines'),
  ('consoles',             '95045000','Consoles - Video game consoles'),
  ('video-games',          '95049090','Video Games'),
  ('gaming-accessories',   '95049010','Gaming Accessories'),

  -- Pets (Level 1)
  ('pets',                 '2309',   'Pets - Preparations for animal feeding'),
  ('pet-food',             '23099090','Pet Food'),
  ('pet-accessories',      '73269099','Pet Accessories'),
  ('pet-grooming',         '96039090','Pet Grooming')

on conflict (category_slug) do update
  set hsn_code = excluded.hsn_code,
      description = excluded.description;
