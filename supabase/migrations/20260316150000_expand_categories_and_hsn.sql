-- ============================================================================
-- Expand category tree: add new Level 2 departments + Level 3 subcategories
-- for ALL 11 main categories, plus HSN codes for every new entry.
-- Uses ON CONFLICT (slug) DO NOTHING so re-running is safe.
-- ============================================================================

create unique index if not exists categories_slug_unique
  on public.categories (slug);

DO $$
DECLARE
  -- Level 1 IDs (looked up from existing rows)
  _electronics UUID;
  _fashion UUID;
  _home_kitchen UUID;
  _beauty_health UUID;
  _grocery UUID;
  _sports UUID;
  _toys_baby UUID;
  _automotive UUID;
  _books_media UUID;
  _gaming UUID;
  _pets UUID;

  -- Reusable Level 2 ID
  _dept UUID;
BEGIN

  -- ══════════════════════════════════════════════════════════════════
  -- Look up all Level 1 IDs
  -- ══════════════════════════════════════════════════════════════════
  SELECT id INTO _electronics   FROM public.categories WHERE slug = 'electronics';
  SELECT id INTO _fashion       FROM public.categories WHERE slug = 'fashion';
  SELECT id INTO _home_kitchen  FROM public.categories WHERE slug = 'home-kitchen';
  SELECT id INTO _beauty_health FROM public.categories WHERE slug = 'beauty-health';
  SELECT id INTO _grocery       FROM public.categories WHERE slug = 'grocery';
  SELECT id INTO _sports        FROM public.categories WHERE slug = 'sports-outdoors';
  SELECT id INTO _toys_baby     FROM public.categories WHERE slug = 'toys-baby';
  SELECT id INTO _automotive    FROM public.categories WHERE slug = 'automotive';
  SELECT id INTO _books_media   FROM public.categories WHERE slug = 'books-media';
  SELECT id INTO _gaming        FROM public.categories WHERE slug = 'gaming';
  SELECT id INTO _pets          FROM public.categories WHERE slug = 'pets';

  -- ══════════════════════════════════════════════════════════════════
  -- 1. ELECTRONICS
  -- ══════════════════════════════════════════════════════════════════

  -- Mobiles & Accessories (exists) → add Power Banks
  SELECT id INTO _dept FROM public.categories WHERE slug = 'mobiles-accessories';
  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('Power Banks', 'power-banks', _dept, 3, 6)
  ON CONFLICT (slug) DO NOTHING;

  -- Computers & Laptops (exists) → add separate Keyboards, Mice, Laptop Accessories
  SELECT id INTO _dept FROM public.categories WHERE slug = 'computers-laptops';
  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('Keyboards', 'keyboards', _dept, 3, 5),
    ('Mice', 'mice', _dept, 3, 6),
    ('Laptop Accessories', 'laptop-accessories', _dept, 3, 7)
  ON CONFLICT (slug) DO NOTHING;

  -- Computer Components (NEW Level 2)
  INSERT INTO public.categories (name, slug, parent_id, level, display_order)
  VALUES ('Computer Components', 'computer-components', _electronics, 2, 6)
  ON CONFLICT (slug) DO NOTHING;
  SELECT id INTO _dept FROM public.categories WHERE slug = 'computer-components';
  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('Processors', 'processors', _dept, 3, 1),
    ('Motherboards', 'motherboards', _dept, 3, 2),
    ('Graphics Cards', 'graphics-cards', _dept, 3, 3),
    ('RAM', 'ram', _dept, 3, 4),
    ('Internal Storage', 'internal-storage', _dept, 3, 5),
    ('External Storage', 'external-storage', _dept, 3, 6)
  ON CONFLICT (slug) DO NOTHING;

  -- Audio (exists) → add Soundbars
  SELECT id INTO _dept FROM public.categories WHERE slug = 'audio';
  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('Soundbars', 'soundbars', _dept, 3, 4)
  ON CONFLICT (slug) DO NOTHING;

  -- Cameras (exists) → add Camera Lenses, Camera Accessories
  SELECT id INTO _dept FROM public.categories WHERE slug = 'cameras';
  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('Camera Lenses', 'camera-lenses', _dept, 3, 4),
    ('Camera Accessories', 'camera-accessories', _dept, 3, 5)
  ON CONFLICT (slug) DO NOTHING;

  -- Smart Devices (exists) → add Smart Bands, Smart Lighting
  SELECT id INTO _dept FROM public.categories WHERE slug = 'smart-devices';
  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('Smart Bands', 'smart-bands', _dept, 3, 3),
    ('Smart Lighting', 'smart-lighting', _dept, 3, 4)
  ON CONFLICT (slug) DO NOTHING;

  -- Networking (NEW Level 2)
  INSERT INTO public.categories (name, slug, parent_id, level, display_order)
  VALUES ('Networking', 'networking', _electronics, 2, 7)
  ON CONFLICT (slug) DO NOTHING;
  SELECT id INTO _dept FROM public.categories WHERE slug = 'networking';
  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('Routers', 'routers', _dept, 3, 1),
    ('Modems', 'modems', _dept, 3, 2),
    ('Wi-Fi Extenders', 'wifi-extenders', _dept, 3, 3)
  ON CONFLICT (slug) DO NOTHING;

  -- TV & Home Entertainment (NEW Level 2)
  INSERT INTO public.categories (name, slug, parent_id, level, display_order)
  VALUES ('TV & Home Entertainment', 'tv-home-entertainment', _electronics, 2, 8)
  ON CONFLICT (slug) DO NOTHING;
  SELECT id INTO _dept FROM public.categories WHERE slug = 'tv-home-entertainment';
  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('Televisions', 'televisions', _dept, 3, 1),
    ('Streaming Devices', 'streaming-devices', _dept, 3, 2),
    ('Projectors', 'projectors', _dept, 3, 3),
    ('TV Accessories', 'tv-accessories', _dept, 3, 4)
  ON CONFLICT (slug) DO NOTHING;

  -- ══════════════════════════════════════════════════════════════════
  -- 2. FASHION
  -- ══════════════════════════════════════════════════════════════════

  -- Men (exists) → add Trousers, Jackets
  SELECT id INTO _dept FROM public.categories WHERE slug = 'men';
  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('Trousers', 'trousers', _dept, 3, 5),
    ('Jackets', 'jackets', _dept, 3, 6)
  ON CONFLICT (slug) DO NOTHING;

  -- Women (exists) → add Skirts, Women Footwear
  SELECT id INTO _dept FROM public.categories WHERE slug = 'women';
  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('Skirts', 'skirts', _dept, 3, 5),
    ('Footwear', 'womens-footwear', _dept, 3, 6)
  ON CONFLICT (slug) DO NOTHING;

  -- Kids (exists) → add Kids Footwear
  SELECT id INTO _dept FROM public.categories WHERE slug = 'kids';
  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('Kids Footwear', 'kids-footwear', _dept, 3, 4)
  ON CONFLICT (slug) DO NOTHING;

  -- Footwear (NEW Level 2 under Fashion)
  INSERT INTO public.categories (name, slug, parent_id, level, display_order)
  VALUES ('Footwear', 'footwear', _fashion, 2, 4)
  ON CONFLICT (slug) DO NOTHING;
  SELECT id INTO _dept FROM public.categories WHERE slug = 'footwear';
  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('Sneakers', 'sneakers', _dept, 3, 1),
    ('Sandals', 'sandals', _dept, 3, 2),
    ('Formal Shoes', 'formal-shoes', _dept, 3, 3),
    ('Boots', 'boots', _dept, 3, 4),
    ('Slippers', 'slippers', _dept, 3, 5)
  ON CONFLICT (slug) DO NOTHING;

  -- Accessories (NEW Level 2 under Fashion)
  INSERT INTO public.categories (name, slug, parent_id, level, display_order)
  VALUES ('Accessories', 'fashion-accessories', _fashion, 2, 5)
  ON CONFLICT (slug) DO NOTHING;
  SELECT id INTO _dept FROM public.categories WHERE slug = 'fashion-accessories';
  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('Watches', 'watches', _dept, 3, 1),
    ('Sunglasses', 'sunglasses', _dept, 3, 2),
    ('Belts', 'belts', _dept, 3, 3),
    ('Wallets', 'wallets', _dept, 3, 4)
  ON CONFLICT (slug) DO NOTHING;

  -- ══════════════════════════════════════════════════════════════════
  -- 3. HOME & KITCHEN
  -- ══════════════════════════════════════════════════════════════════

  -- Furniture (exists) → add Chairs, Cabinets
  SELECT id INTO _dept FROM public.categories WHERE slug = 'furniture';
  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('Chairs', 'chairs', _dept, 3, 4),
    ('Cabinets', 'cabinets', _dept, 3, 5)
  ON CONFLICT (slug) DO NOTHING;

  -- Kitchen (exists) → add Kitchen Tools, Storage Containers
  SELECT id INTO _dept FROM public.categories WHERE slug = 'kitchen';
  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('Kitchen Tools', 'kitchen-tools', _dept, 3, 4),
    ('Storage Containers', 'storage-containers', _dept, 3, 5)
  ON CONFLICT (slug) DO NOTHING;

  -- Dining (NEW Level 2)
  INSERT INTO public.categories (name, slug, parent_id, level, display_order)
  VALUES ('Dining', 'dining', _home_kitchen, 2, 4)
  ON CONFLICT (slug) DO NOTHING;
  SELECT id INTO _dept FROM public.categories WHERE slug = 'dining';
  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('Dinner Sets', 'dinner-sets', _dept, 3, 1),
    ('Glassware', 'glassware', _dept, 3, 2),
    ('Cutlery', 'cutlery', _dept, 3, 3),
    ('Tableware', 'tableware', _dept, 3, 4)
  ON CONFLICT (slug) DO NOTHING;

  -- Decor (exists) → add Decorative Items
  SELECT id INTO _dept FROM public.categories WHERE slug = 'decor';
  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('Decorative Items', 'decorative-items', _dept, 3, 3)
  ON CONFLICT (slug) DO NOTHING;

  -- Storage & Organization (NEW Level 2)
  INSERT INTO public.categories (name, slug, parent_id, level, display_order)
  VALUES ('Storage & Organization', 'storage-organization', _home_kitchen, 2, 5)
  ON CONFLICT (slug) DO NOTHING;
  SELECT id INTO _dept FROM public.categories WHERE slug = 'storage-organization';
  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('Storage Boxes', 'storage-boxes', _dept, 3, 1),
    ('Wardrobe Organizers', 'wardrobe-organizers', _dept, 3, 2),
    ('Shelves', 'shelves', _dept, 3, 3)
  ON CONFLICT (slug) DO NOTHING;

  -- Bedding & Bath (NEW Level 2)
  INSERT INTO public.categories (name, slug, parent_id, level, display_order)
  VALUES ('Bedding & Bath', 'bedding-bath', _home_kitchen, 2, 6)
  ON CONFLICT (slug) DO NOTHING;
  SELECT id INTO _dept FROM public.categories WHERE slug = 'bedding-bath';
  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('Bedsheets', 'bedsheets', _dept, 3, 1),
    ('Pillows', 'pillows', _dept, 3, 2),
    ('Blankets', 'blankets', _dept, 3, 3),
    ('Towels', 'towels', _dept, 3, 4)
  ON CONFLICT (slug) DO NOTHING;

  -- ══════════════════════════════════════════════════════════════════
  -- 4. BEAUTY & HEALTH (all Level 3 are new)
  -- ══════════════════════════════════════════════════════════════════

  SELECT id INTO _dept FROM public.categories WHERE slug = 'skincare';
  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('Face Creams', 'face-creams', _dept, 3, 1),
    ('Face Wash', 'face-wash', _dept, 3, 2),
    ('Sunscreen', 'sunscreen', _dept, 3, 3),
    ('Serums', 'serums', _dept, 3, 4)
  ON CONFLICT (slug) DO NOTHING;

  SELECT id INTO _dept FROM public.categories WHERE slug = 'haircare';
  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('Shampoo', 'shampoo', _dept, 3, 1),
    ('Conditioner', 'conditioner', _dept, 3, 2),
    ('Hair Oil', 'hair-oil', _dept, 3, 3),
    ('Hair Styling', 'hair-styling', _dept, 3, 4)
  ON CONFLICT (slug) DO NOTHING;

  SELECT id INTO _dept FROM public.categories WHERE slug = 'makeup';
  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('Lipstick', 'lipstick', _dept, 3, 1),
    ('Foundation', 'foundation', _dept, 3, 2),
    ('Eye Makeup', 'eye-makeup', _dept, 3, 3),
    ('Makeup Kits', 'makeup-kits', _dept, 3, 4)
  ON CONFLICT (slug) DO NOTHING;

  SELECT id INTO _dept FROM public.categories WHERE slug = 'grooming';
  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('Trimmers', 'trimmers', _dept, 3, 1),
    ('Shavers', 'shavers', _dept, 3, 2),
    ('Grooming Kits', 'grooming-kits', _dept, 3, 3)
  ON CONFLICT (slug) DO NOTHING;

  -- Fragrance (NEW Level 2)
  INSERT INTO public.categories (name, slug, parent_id, level, display_order)
  VALUES ('Fragrance', 'fragrance', _beauty_health, 2, 6)
  ON CONFLICT (slug) DO NOTHING;
  SELECT id INTO _dept FROM public.categories WHERE slug = 'fragrance';
  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('Perfumes', 'perfumes', _dept, 3, 1),
    ('Body Sprays', 'body-sprays', _dept, 3, 2)
  ON CONFLICT (slug) DO NOTHING;

  SELECT id INTO _dept FROM public.categories WHERE slug = 'supplements';
  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('Vitamins', 'vitamins', _dept, 3, 1),
    ('Protein Supplements', 'protein-supplements', _dept, 3, 2),
    ('Herbal Supplements', 'herbal-supplements', _dept, 3, 3)
  ON CONFLICT (slug) DO NOTHING;

  -- ══════════════════════════════════════════════════════════════════
  -- 5. GROCERY (all Level 3 are new)
  -- ══════════════════════════════════════════════════════════════════

  SELECT id INTO _dept FROM public.categories WHERE slug = 'snacks';
  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('Chips', 'chips', _dept, 3, 1),
    ('Biscuits', 'biscuits', _dept, 3, 2),
    ('Chocolate', 'chocolate', _dept, 3, 3)
  ON CONFLICT (slug) DO NOTHING;

  SELECT id INTO _dept FROM public.categories WHERE slug = 'beverages';
  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('Tea', 'tea', _dept, 3, 1),
    ('Coffee', 'coffee', _dept, 3, 2),
    ('Soft Drinks', 'soft-drinks', _dept, 3, 3),
    ('Energy Drinks', 'energy-drinks', _dept, 3, 4)
  ON CONFLICT (slug) DO NOTHING;

  SELECT id INTO _dept FROM public.categories WHERE slug = 'packaged-food';
  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('Instant Noodles', 'instant-noodles', _dept, 3, 1),
    ('Pasta', 'pasta', _dept, 3, 2),
    ('Ready Meals', 'ready-meals', _dept, 3, 3)
  ON CONFLICT (slug) DO NOTHING;

  -- Staples (NEW Level 2)
  INSERT INTO public.categories (name, slug, parent_id, level, display_order)
  VALUES ('Staples', 'staples', _grocery, 2, 5)
  ON CONFLICT (slug) DO NOTHING;
  SELECT id INTO _dept FROM public.categories WHERE slug = 'staples';
  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('Rice', 'rice', _dept, 3, 1),
    ('Flour', 'flour', _dept, 3, 2),
    ('Pulses', 'pulses', _dept, 3, 3),
    ('Cooking Oil', 'cooking-oil', _dept, 3, 4)
  ON CONFLICT (slug) DO NOTHING;

  SELECT id INTO _dept FROM public.categories WHERE slug = 'household-essentials';
  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('Cleaning Supplies', 'cleaning-supplies', _dept, 3, 1),
    ('Laundry Products', 'laundry-products', _dept, 3, 2),
    ('Paper Products', 'paper-products', _dept, 3, 3)
  ON CONFLICT (slug) DO NOTHING;

  -- ══════════════════════════════════════════════════════════════════
  -- 6. SPORTS & OUTDOORS (all Level 3 are new)
  -- ══════════════════════════════════════════════════════════════════

  SELECT id INTO _dept FROM public.categories WHERE slug = 'fitness-equipment';
  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('Treadmills', 'treadmills', _dept, 3, 1),
    ('Dumbbells', 'dumbbells', _dept, 3, 2),
    ('Resistance Bands', 'resistance-bands', _dept, 3, 3)
  ON CONFLICT (slug) DO NOTHING;

  SELECT id INTO _dept FROM public.categories WHERE slug = 'cycling';
  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('Bicycles', 'bicycles', _dept, 3, 1),
    ('Helmets', 'cycling-helmets', _dept, 3, 2),
    ('Cycling Accessories', 'cycling-accessories', _dept, 3, 3)
  ON CONFLICT (slug) DO NOTHING;

  SELECT id INTO _dept FROM public.categories WHERE slug = 'camping';
  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('Tents', 'tents', _dept, 3, 1),
    ('Sleeping Bags', 'sleeping-bags', _dept, 3, 2),
    ('Camping Tools', 'camping-tools', _dept, 3, 3)
  ON CONFLICT (slug) DO NOTHING;

  SELECT id INTO _dept FROM public.categories WHERE slug = 'outdoor-gear';
  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('Backpacks', 'backpacks', _dept, 3, 1),
    ('Outdoor Clothing', 'outdoor-clothing', _dept, 3, 2),
    ('Survival Gear', 'survival-gear', _dept, 3, 3)
  ON CONFLICT (slug) DO NOTHING;

  -- ══════════════════════════════════════════════════════════════════
  -- 7. TOYS & BABY (all Level 3 are new)
  -- ══════════════════════════════════════════════════════════════════

  SELECT id INTO _dept FROM public.categories WHERE slug = 'toys-games';
  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('Action Figures', 'action-figures', _dept, 3, 1),
    ('Board Games', 'board-games', _dept, 3, 2),
    ('Educational Toys', 'educational-toys', _dept, 3, 3)
  ON CONFLICT (slug) DO NOTHING;

  SELECT id INTO _dept FROM public.categories WHERE slug = 'baby-care';
  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('Baby Clothing', 'baby-clothing', _dept, 3, 1),
    ('Baby Feeding', 'baby-feeding', _dept, 3, 2),
    ('Baby Hygiene', 'baby-hygiene', _dept, 3, 3)
  ON CONFLICT (slug) DO NOTHING;

  SELECT id INTO _dept FROM public.categories WHERE slug = 'school-supplies';
  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('School Bags', 'school-bags', _dept, 3, 1),
    ('Stationery', 'stationery', _dept, 3, 2),
    ('Lunch Boxes', 'lunch-boxes', _dept, 3, 3)
  ON CONFLICT (slug) DO NOTHING;

  -- ══════════════════════════════════════════════════════════════════
  -- 8. AUTOMOTIVE (all Level 3 are new)
  -- ══════════════════════════════════════════════════════════════════

  SELECT id INTO _dept FROM public.categories WHERE slug = 'car-accessories';
  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('Seat Covers', 'seat-covers', _dept, 3, 1),
    ('Car Electronics', 'car-electronics', _dept, 3, 2),
    ('Car Cleaning', 'car-cleaning', _dept, 3, 3)
  ON CONFLICT (slug) DO NOTHING;

  SELECT id INTO _dept FROM public.categories WHERE slug = 'bike-accessories';
  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('Helmets', 'bike-helmets', _dept, 3, 1),
    ('Riding Gear', 'riding-gear', _dept, 3, 2)
  ON CONFLICT (slug) DO NOTHING;

  SELECT id INTO _dept FROM public.categories WHERE slug = 'tools';
  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('Car Tools', 'car-tools', _dept, 3, 1),
    ('Repair Kits', 'repair-kits', _dept, 3, 2)
  ON CONFLICT (slug) DO NOTHING;

  -- ══════════════════════════════════════════════════════════════════
  -- 9. BOOKS & MEDIA (all Level 3 are new)
  -- ══════════════════════════════════════════════════════════════════

  SELECT id INTO _dept FROM public.categories WHERE slug = 'books';
  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('Fiction', 'fiction', _dept, 3, 1),
    ('Non-Fiction', 'non-fiction', _dept, 3, 2),
    ('Children''s Books', 'childrens-books', _dept, 3, 3)
  ON CONFLICT (slug) DO NOTHING;

  SELECT id INTO _dept FROM public.categories WHERE slug = 'educational';
  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('Academic Books', 'academic-books', _dept, 3, 1),
    ('Competitive Exam Books', 'competitive-exam-books', _dept, 3, 2)
  ON CONFLICT (slug) DO NOTHING;

  SELECT id INTO _dept FROM public.categories WHERE slug = 'movies';
  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('DVD', 'dvd', _dept, 3, 1),
    ('Blu-ray', 'blu-ray', _dept, 3, 2)
  ON CONFLICT (slug) DO NOTHING;

  SELECT id INTO _dept FROM public.categories WHERE slug = 'music';
  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('CDs', 'cds', _dept, 3, 1),
    ('Vinyl Records', 'vinyl-records', _dept, 3, 2)
  ON CONFLICT (slug) DO NOTHING;

  -- ══════════════════════════════════════════════════════════════════
  -- 10. GAMING (all Level 3 are new)
  -- ══════════════════════════════════════════════════════════════════

  SELECT id INTO _dept FROM public.categories WHERE slug = 'consoles';
  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('PlayStation', 'playstation', _dept, 3, 1),
    ('Xbox', 'xbox', _dept, 3, 2),
    ('Nintendo', 'nintendo', _dept, 3, 3)
  ON CONFLICT (slug) DO NOTHING;

  SELECT id INTO _dept FROM public.categories WHERE slug = 'video-games';
  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('Console Games', 'console-games', _dept, 3, 1),
    ('PC Games', 'pc-games', _dept, 3, 2)
  ON CONFLICT (slug) DO NOTHING;

  SELECT id INTO _dept FROM public.categories WHERE slug = 'gaming-accessories';
  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('Controllers', 'controllers', _dept, 3, 1),
    ('Gaming Headsets', 'gaming-headsets', _dept, 3, 2),
    ('Gaming Keyboards', 'gaming-keyboards', _dept, 3, 3)
  ON CONFLICT (slug) DO NOTHING;

  -- ══════════════════════════════════════════════════════════════════
  -- 11. PETS (all Level 3 are new)
  -- ══════════════════════════════════════════════════════════════════

  SELECT id INTO _dept FROM public.categories WHERE slug = 'pet-food';
  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('Dog Food', 'dog-food', _dept, 3, 1),
    ('Cat Food', 'cat-food', _dept, 3, 2)
  ON CONFLICT (slug) DO NOTHING;

  SELECT id INTO _dept FROM public.categories WHERE slug = 'pet-accessories';
  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('Pet Beds', 'pet-beds', _dept, 3, 1),
    ('Pet Toys', 'pet-toys', _dept, 3, 2)
  ON CONFLICT (slug) DO NOTHING;

  SELECT id INTO _dept FROM public.categories WHERE slug = 'pet-grooming';
  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('Grooming Tools', 'grooming-tools', _dept, 3, 1),
    ('Pet Hygiene', 'pet-hygiene', _dept, 3, 2)
  ON CONFLICT (slug) DO NOTHING;

END $$;

-- ============================================================================
-- HSN codes for all NEW categories (India CBIC 8-digit HSN)
-- Uses ON CONFLICT (category_slug) DO NOTHING for idempotency
-- ============================================================================
INSERT INTO public.category_hsn_codes (category_slug, hsn_code, description) VALUES
  -- Electronics — new entries
  ('power-banks',        '85076000', 'Lithium-ion accumulators (power banks)'),
  ('keyboards',          '84716060', 'Keyboards'),
  ('mice',               '84716060', 'Mice / pointing devices'),
  ('laptop-accessories',  '84733099', 'Parts of data processing machines'),
  ('computer-components', '84733020', 'Computer components & parts'),
  ('processors',         '84733020', 'Central processing units'),
  ('motherboards',       '84733020', 'Motherboards / printed circuit assemblies'),
  ('graphics-cards',     '84715000', 'Processing units for ADP machines'),
  ('ram',                '84733020', 'Random access memory modules'),
  ('internal-storage',   '84717020', 'Hard disk drives / SSDs — internal'),
  ('external-storage',   '84717020', 'Hard disk drives / SSDs — external'),
  ('soundbars',          '85182100', 'Soundbar loudspeakers'),
  ('camera-lenses',      '90021100', 'Camera objective lenses'),
  ('camera-accessories',  '90069900', 'Parts & accessories of cameras'),
  ('smart-bands',        '91021200', 'Smart fitness bands'),
  ('smart-lighting',     '94054090', 'Smart LED lighting fixtures'),
  ('networking',         '85176290', 'Networking apparatus'),
  ('routers',            '85176290', 'Network routers'),
  ('modems',             '85176100', 'Modems / base stations'),
  ('wifi-extenders',     '85176290', 'Wi-Fi range extenders'),
  ('tv-home-entertainment', '85287200', 'TV & home entertainment'),
  ('televisions',        '85287200', 'Television receivers'),
  ('streaming-devices',  '85219000', 'Video recording / reproducing apparatus'),
  ('projectors',         '85286200', 'Projectors'),
  ('tv-accessories',     '85299090', 'Parts of TV apparatus'),

  -- Fashion — new entries
  ('trousers',           '62034200', 'Trousers of cotton'),
  ('jackets',            '62013000', 'Jackets & blazers'),
  ('skirts',             '62045200', 'Skirts of cotton'),
  ('womens-footwear',    '64039990', 'Women footwear'),
  ('kids-footwear',      '64039990', 'Kids footwear'),
  ('footwear',           '64039990', 'Footwear — general'),
  ('sneakers',           '64041100', 'Sports footwear — tennis, basketball etc'),
  ('sandals',            '64022000', 'Sandals & chappals'),
  ('formal-shoes',       '64035190', 'Footwear with leather uppers'),
  ('boots',              '64039100', 'Boots covering the ankle'),
  ('slippers',           '64041990', 'Footwear with rubber/plastic soles'),
  ('fashion-accessories', '71171900', 'Fashion accessories — imitation jewellery'),
  ('watches',            '91021200', 'Wrist watches — digital'),
  ('sunglasses',         '90041000', 'Sunglasses'),
  ('belts',              '42033000', 'Belts of leather'),
  ('wallets',            '42023100', 'Wallets / purses of leather'),

  -- Home & Kitchen — new entries
  ('chairs',             '94017900', 'Seats with metal frames'),
  ('cabinets',           '94035000', 'Wooden furniture — bedroom'),
  ('kitchen-tools',      '82159990', 'Kitchen hand tools'),
  ('storage-containers',  '39241090', 'Plastic tableware & kitchenware'),
  ('dining',             '69111090', 'Tableware / kitchenware — porcelain'),
  ('dinner-sets',        '69111090', 'Dinner sets — porcelain / china'),
  ('glassware',          '70134990', 'Glassware for table / kitchen'),
  ('cutlery',            '82159990', 'Cutlery — knives, spoons, forks'),
  ('tableware',          '69120090', 'Ceramic tableware'),
  ('decorative-items',   '83062990', 'Statuettes & decorative articles'),
  ('storage-organization', '39249090', 'Storage & household articles of plastic'),
  ('storage-boxes',      '39249090', 'Storage boxes of plastics'),
  ('wardrobe-organizers', '39249090', 'Wardrobe organizers of plastics'),
  ('shelves',            '94036090', 'Other wooden furniture — shelves'),
  ('bedding-bath',       '63023100', 'Bedding & bath linen'),
  ('bedsheets',          '63023100', 'Bed linen of cotton'),
  ('pillows',            '94049010', 'Pillows & cushions'),
  ('blankets',           '63012000', 'Blankets of wool / cotton'),
  ('towels',             '63026000', 'Toilet linen — terry towelling of cotton'),

  -- Beauty & Health — new entries
  ('face-creams',        '33049990', 'Beauty / skincare preparations — creams'),
  ('face-wash',          '34011990', 'Face wash / soap'),
  ('sunscreen',          '33049990', 'Sunscreen preparations'),
  ('serums',             '33049990', 'Skin serums'),
  ('shampoo',            '33051000', 'Shampoos'),
  ('conditioner',        '33059090', 'Hair conditioners'),
  ('hair-oil',           '33059010', 'Hair oils'),
  ('hair-styling',       '33059090', 'Hair styling preparations'),
  ('lipstick',           '33041000', 'Lip make-up preparations'),
  ('foundation',         '33041000', 'Foundation / face make-up'),
  ('eye-makeup',         '33042000', 'Eye make-up preparations'),
  ('makeup-kits',        '33049100', 'Beauty make-up powders / kits'),
  ('trimmers',           '85109000', 'Hair trimmers — electric'),
  ('shavers',            '85109000', 'Electric shavers'),
  ('grooming-kits',      '85109000', 'Grooming kits — electric'),
  ('fragrance',          '33030010', 'Fragrance / perfumery'),
  ('perfumes',           '33030010', 'Perfumes & toilet waters'),
  ('body-sprays',        '33030090', 'Body sprays & deodorants'),
  ('vitamins',           '21069099', 'Vitamin supplements'),
  ('protein-supplements', '21069099', 'Protein / nutritional supplements'),
  ('herbal-supplements',  '21069099', 'Herbal dietary supplements'),

  -- Grocery — new entries
  ('chips',              '19059040', 'Chips / crisps — savoury snacks'),
  ('biscuits',           '19059040', 'Biscuits & cookies'),
  ('chocolate',          '18069000', 'Chocolate & cocoa preparations'),
  ('tea',                '09021000', 'Green tea / black tea'),
  ('coffee',             '09011100', 'Coffee — not roasted, not decaffeinated'),
  ('soft-drinks',        '22021090', 'Aerated / soft drinks'),
  ('energy-drinks',      '22029990', 'Energy drinks — non-alcoholic'),
  ('instant-noodles',    '19023010', 'Instant noodles'),
  ('pasta',              '19021990', 'Pasta — other'),
  ('ready-meals',        '21069099', 'Ready to eat meals'),
  ('staples',            '10063090', 'Staple food grains'),
  ('rice',               '10063090', 'Semi-milled / wholly milled rice'),
  ('flour',              '11010000', 'Wheat / meslin flour'),
  ('pulses',             '07134000', 'Lentils — dried, shelled'),
  ('cooking-oil',        '15079090', 'Soya-bean / vegetable cooking oil'),
  ('cleaning-supplies',  '34022090', 'Surface-active cleaning preparations'),
  ('laundry-products',   '34022090', 'Laundry detergent preparations'),
  ('paper-products',     '48189090', 'Paper products — napkins, tissues'),

  -- Sports & Outdoors — new entries
  ('treadmills',         '95069190', 'Treadmills / exercise machines'),
  ('dumbbells',          '95069190', 'Dumbbells & free weights'),
  ('resistance-bands',   '95069190', 'Resistance / exercise bands'),
  ('bicycles',           '87120090', 'Bicycles & other cycles'),
  ('cycling-helmets',    '65061090', 'Safety helmets — cycling'),
  ('cycling-accessories', '87149900', 'Cycling parts & accessories'),
  ('tents',              '63062200', 'Tents — synthetic fibres'),
  ('sleeping-bags',      '94042990', 'Sleeping bags'),
  ('camping-tools',      '82055990', 'Camping hand tools'),
  ('backpacks',          '42029290', 'Backpacks / rucksacks'),
  ('outdoor-clothing',   '62114390', 'Outdoor / sports clothing'),
  ('survival-gear',      '95069190', 'Survival & outdoor gear'),

  -- Toys & Baby — new entries
  ('action-figures',     '95030090', 'Action figure toys'),
  ('board-games',        '95049090', 'Board / parlour games'),
  ('educational-toys',   '95030090', 'Educational / learning toys'),
  ('baby-clothing',      '61119090', 'Babies garments — knitted'),
  ('baby-feeding',       '39241090', 'Baby feeding bottles / accessories'),
  ('baby-hygiene',       '96190090', 'Baby diapers & hygiene products'),
  ('school-bags',        '42029290', 'School bags / satchels'),
  ('stationery',         '48201090', 'Stationery — exercise books'),
  ('lunch-boxes',        '39241090', 'Lunch boxes — plastic'),

  -- Automotive — new entries
  ('seat-covers',        '87089900', 'Seat covers for motor vehicles'),
  ('car-electronics',    '85122099', 'Automotive electrical equipment'),
  ('car-cleaning',       '34022090', 'Car cleaning products'),
  ('bike-helmets',       '65061090', 'Safety helmets — motorcycles'),
  ('riding-gear',        '62114390', 'Riding / protective gear'),
  ('car-tools',          '82055990', 'Automotive hand tools'),
  ('repair-kits',        '82055990', 'Repair kits & tool sets'),

  -- Books & Media — new entries
  ('fiction',            '49011010', 'Printed books — fiction'),
  ('non-fiction',        '49011010', 'Printed books — non-fiction'),
  ('childrens-books',    '49011010', 'Printed books — children'),
  ('academic-books',     '49019900', 'Academic / textbooks'),
  ('competitive-exam-books', '49019900', 'Competitive exam preparation books'),
  ('dvd',               '85234920', 'DVDs — recorded'),
  ('blu-ray',           '85234920', 'Blu-ray discs — recorded'),
  ('cds',               '85234110', 'CDs — recorded audio'),
  ('vinyl-records',     '85234110', 'Vinyl / gramophone records'),

  -- Gaming — new entries
  ('playstation',        '95045000', 'PlayStation consoles'),
  ('xbox',               '95045000', 'Xbox consoles'),
  ('nintendo',           '95045000', 'Nintendo consoles'),
  ('console-games',      '95049090', 'Console video games'),
  ('pc-games',           '95049090', 'PC video games'),
  ('controllers',        '95049010', 'Game controllers'),
  ('gaming-headsets',    '85183000', 'Gaming headsets / headphones'),
  ('gaming-keyboards',   '84716060', 'Gaming keyboards'),

  -- Pets — new entries
  ('dog-food',           '23099090', 'Dog food preparations'),
  ('cat-food',           '23099090', 'Cat food preparations'),
  ('pet-beds',           '94042990', 'Pet beds / cushions'),
  ('pet-toys',           '95030090', 'Pet toys'),
  ('grooming-tools',     '96039090', 'Pet grooming brushes / combs'),
  ('pet-hygiene',        '96039090', 'Pet hygiene products')
ON CONFLICT (category_slug) DO NOTHING;
