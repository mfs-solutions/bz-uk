-- ============================================================
-- Complete Level‑3 product‑types for EVERY Level‑2 sub‑category
-- + 8‑digit HSN codes for all entries
-- + Fix existing 4‑digit HSN → 8‑digit
-- ============================================================

-- ============================================================
-- PART A: Update existing 4‑digit HSN codes to full 8‑digit
-- ============================================================
UPDATE category_hsn_codes SET hsn_code = '85437099' WHERE category_slug = 'electronics'     AND length(hsn_code) < 8;
UPDATE category_hsn_codes SET hsn_code = '85171290' WHERE category_slug = 'mobiles-accessories' AND length(hsn_code) < 8;
UPDATE category_hsn_codes SET hsn_code = '85183000' WHERE category_slug = 'audio'           AND length(hsn_code) < 8;
UPDATE category_hsn_codes SET hsn_code = '84713010' WHERE category_slug = 'computers-laptops' AND length(hsn_code) < 8;
UPDATE category_hsn_codes SET hsn_code = '90065900' WHERE category_slug = 'cameras'         AND length(hsn_code) < 8;
UPDATE category_hsn_codes SET hsn_code = '85176290' WHERE category_slug = 'smart-devices'   AND length(hsn_code) < 8;
UPDATE category_hsn_codes SET hsn_code = '61091000' WHERE category_slug = 'fashion'         AND length(hsn_code) < 8;
UPDATE category_hsn_codes SET hsn_code = '62053000' WHERE category_slug = 'men'             AND length(hsn_code) < 8;
UPDATE category_hsn_codes SET hsn_code = '62044300' WHERE category_slug = 'women'           AND length(hsn_code) < 8;
UPDATE category_hsn_codes SET hsn_code = '61119090' WHERE category_slug = 'kids'            AND length(hsn_code) < 8;
UPDATE category_hsn_codes SET hsn_code = '94031090' WHERE category_slug = 'furniture'       AND length(hsn_code) < 8;
UPDATE category_hsn_codes SET hsn_code = '94031090' WHERE category_slug = 'home-kitchen'    AND length(hsn_code) < 8;
UPDATE category_hsn_codes SET hsn_code = '73239390' WHERE category_slug = 'kitchen'         AND length(hsn_code) < 8;
UPDATE category_hsn_codes SET hsn_code = '63049200' WHERE category_slug = 'decor'           AND length(hsn_code) < 8;
UPDATE category_hsn_codes SET hsn_code = '33049990' WHERE category_slug = 'beauty-health'   AND length(hsn_code) < 8;
UPDATE category_hsn_codes SET hsn_code = '95069990' WHERE category_slug = 'sports-outdoors' AND length(hsn_code) < 8;
UPDATE category_hsn_codes SET hsn_code = '95030090' WHERE category_slug = 'toys-baby'       AND length(hsn_code) < 8;
UPDATE category_hsn_codes SET hsn_code = '87089900' WHERE category_slug = 'automotive'      AND length(hsn_code) < 8;
UPDATE category_hsn_codes SET hsn_code = '21069099' WHERE category_slug = 'grocery'         AND length(hsn_code) < 8;
UPDATE category_hsn_codes SET hsn_code = '49011010' WHERE category_slug = 'books-media'     AND length(hsn_code) < 8;
UPDATE category_hsn_codes SET hsn_code = '95045000' WHERE category_slug = 'gaming'          AND length(hsn_code) < 8;
UPDATE category_hsn_codes SET hsn_code = '23099090' WHERE category_slug = 'pets'            AND length(hsn_code) < 8;

-- ============================================================
-- PART B: Helper – insert Level‑3 categories + HSN codes
-- ============================================================
DO $$
DECLARE
  _parent_id uuid;
  _new_id    uuid;
BEGIN

  -- =====================  ELECTRONICS  =====================

  -- Mobiles & Smartphones
  SELECT id INTO _parent_id FROM categories WHERE slug = 'mobiles-smartphones' LIMIT 1;
  IF _parent_id IS NOT NULL THEN
    INSERT INTO categories (name, slug, parent_id, level, display_order, is_active) VALUES
      ('Smartphones',      'ms-smartphones',       _parent_id, 3, 1, true),
      ('Feature Phones',   'ms-feature-phones',    _parent_id, 3, 2, true),
      ('Refurbished Phones','ms-refurbished-phones',_parent_id, 3, 3, true)
    ON CONFLICT (slug) DO NOTHING;
    INSERT INTO category_hsn_codes (category_slug, hsn_code, description) VALUES
      ('ms-smartphones',       '85171210', 'Smartphones'),
      ('ms-feature-phones',    '85171290', 'Feature Phones'),
      ('ms-refurbished-phones','85171210', 'Refurbished Phones'),
      ('mobiles-smartphones',  '85171210', 'Mobiles & Smartphones')
    ON CONFLICT (category_slug) DO UPDATE SET hsn_code = EXCLUDED.hsn_code;
  END IF;

  -- Mobile Accessories
  SELECT id INTO _parent_id FROM categories WHERE slug = 'mobile-accessories' LIMIT 1;
  IF _parent_id IS NOT NULL THEN
    INSERT INTO categories (name, slug, parent_id, level, display_order, is_active) VALUES
      ('Phone Cases & Covers', 'ma-phone-cases',     _parent_id, 3, 1, true),
      ('Screen Protectors',    'ma-screen-protectors',_parent_id, 3, 2, true),
      ('Chargers & Cables',    'ma-chargers-cables',  _parent_id, 3, 3, true),
      ('Power Banks',          'ma-power-banks',      _parent_id, 3, 4, true),
      ('Phone Holders',        'ma-phone-holders',    _parent_id, 3, 5, true)
    ON CONFLICT (slug) DO NOTHING;
    INSERT INTO category_hsn_codes (category_slug, hsn_code, description) VALUES
      ('ma-phone-cases',      '42023190', 'Phone Cases & Covers'),
      ('ma-screen-protectors','70072190', 'Screen Protectors'),
      ('ma-chargers-cables',  '85044090', 'Chargers & Cables'),
      ('ma-power-banks',      '85076000', 'Power Banks'),
      ('ma-phone-holders',    '39269099', 'Phone Holders'),
      ('mobile-accessories',  '42023190', 'Mobile Accessories')
    ON CONFLICT (category_slug) DO UPDATE SET hsn_code = EXCLUDED.hsn_code;
  END IF;

  -- Laptops & Computers
  SELECT id INTO _parent_id FROM categories WHERE slug = 'laptops-computers' LIMIT 1;
  IF _parent_id IS NOT NULL THEN
    INSERT INTO categories (name, slug, parent_id, level, display_order, is_active) VALUES
      ('Laptops',          'lc-laptops',          _parent_id, 3, 1, true),
      ('Desktops',         'lc-desktops',         _parent_id, 3, 2, true),
      ('All-in-One PCs',   'lc-all-in-one',       _parent_id, 3, 3, true),
      ('Chromebooks',      'lc-chromebooks',       _parent_id, 3, 4, true),
      ('Mini PCs',         'lc-mini-pcs',          _parent_id, 3, 5, true)
    ON CONFLICT (slug) DO NOTHING;
    INSERT INTO category_hsn_codes (category_slug, hsn_code, description) VALUES
      ('lc-laptops',     '84713010', 'Laptops'),
      ('lc-desktops',    '84715000', 'Desktops'),
      ('lc-all-in-one',  '84715000', 'All-in-One PCs'),
      ('lc-chromebooks', '84713010', 'Chromebooks'),
      ('lc-mini-pcs',    '84715000', 'Mini PCs'),
      ('laptops-computers','84713010', 'Laptops & Computers')
    ON CONFLICT (category_slug) DO UPDATE SET hsn_code = EXCLUDED.hsn_code;
  END IF;

  -- Computer Accessories
  SELECT id INTO _parent_id FROM categories WHERE slug = 'computer-accessories' LIMIT 1;
  IF _parent_id IS NOT NULL THEN
    INSERT INTO categories (name, slug, parent_id, level, display_order, is_active) VALUES
      ('Keyboards',        'ca-keyboards',         _parent_id, 3, 1, true),
      ('Mice',             'ca-mice',               _parent_id, 3, 2, true),
      ('Webcams',          'ca-webcams',            _parent_id, 3, 3, true),
      ('USB Hubs & Docks', 'ca-usb-hubs',           _parent_id, 3, 4, true),
      ('Laptop Bags',      'ca-laptop-bags',         _parent_id, 3, 5, true)
    ON CONFLICT (slug) DO NOTHING;
    INSERT INTO category_hsn_codes (category_slug, hsn_code, description) VALUES
      ('ca-keyboards',   '84716060', 'Keyboards'),
      ('ca-mice',        '84716060', 'Mice'),
      ('ca-webcams',     '85258090', 'Webcams'),
      ('ca-usb-hubs',    '84733099', 'USB Hubs & Docks'),
      ('ca-laptop-bags', '42029290', 'Laptop Bags'),
      ('computer-accessories','84716060', 'Computer Accessories')
    ON CONFLICT (category_slug) DO UPDATE SET hsn_code = EXCLUDED.hsn_code;
  END IF;

  -- Audio (Headphones, Speakers)
  SELECT id INTO _parent_id FROM categories WHERE slug = 'audio-headphones-speakers-' LIMIT 1;
  IF _parent_id IS NOT NULL THEN
    INSERT INTO categories (name, slug, parent_id, level, display_order, is_active) VALUES
      ('Headphones',       'ahs-headphones',   _parent_id, 3, 1, true),
      ('Earbuds',          'ahs-earbuds',      _parent_id, 3, 2, true),
      ('Bluetooth Speakers','ahs-bt-speakers', _parent_id, 3, 3, true),
      ('Soundbars',        'ahs-soundbars',    _parent_id, 3, 4, true),
      ('Home Theatre',     'ahs-home-theatre', _parent_id, 3, 5, true)
    ON CONFLICT (slug) DO NOTHING;
    INSERT INTO category_hsn_codes (category_slug, hsn_code, description) VALUES
      ('ahs-headphones',  '85183000', 'Headphones'),
      ('ahs-earbuds',     '85183000', 'Earbuds'),
      ('ahs-bt-speakers', '85182200', 'Bluetooth Speakers'),
      ('ahs-soundbars',   '85182100', 'Soundbars'),
      ('ahs-home-theatre','85182100', 'Home Theatre Systems'),
      ('audio-headphones-speakers-','85183000', 'Audio (Headphones, Speakers)')
    ON CONFLICT (category_slug) DO UPDATE SET hsn_code = EXCLUDED.hsn_code;
  END IF;

  -- Tablets
  SELECT id INTO _parent_id FROM categories WHERE slug = 'tablets' LIMIT 1;
  IF _parent_id IS NOT NULL THEN
    INSERT INTO categories (name, slug, parent_id, level, display_order, is_active) VALUES
      ('Android Tablets',  'tab-android',   _parent_id, 3, 1, true),
      ('iPads',            'tab-ipads',     _parent_id, 3, 2, true),
      ('Windows Tablets',  'tab-windows',   _parent_id, 3, 3, true),
      ('E-Readers',        'tab-ereaders',  _parent_id, 3, 4, true)
    ON CONFLICT (slug) DO NOTHING;
    INSERT INTO category_hsn_codes (category_slug, hsn_code, description) VALUES
      ('tab-android',  '84713010', 'Android Tablets'),
      ('tab-ipads',    '84713010', 'iPads'),
      ('tab-windows',  '84713010', 'Windows Tablets'),
      ('tab-ereaders', '84713010', 'E-Readers'),
      ('tablets',      '84713010', 'Tablets')
    ON CONFLICT (category_slug) DO UPDATE SET hsn_code = EXCLUDED.hsn_code;
  END IF;

  -- Televisions
  SELECT id INTO _parent_id FROM categories WHERE slug = 'televisions' LIMIT 1;
  IF _parent_id IS NOT NULL THEN
    INSERT INTO categories (name, slug, parent_id, level, display_order, is_active) VALUES
      ('LED TVs',          'tv-led',        _parent_id, 3, 1, true),
      ('OLED TVs',         'tv-oled',       _parent_id, 3, 2, true),
      ('QLED TVs',         'tv-qled',       _parent_id, 3, 3, true),
      ('Smart TVs',        'tv-smart',      _parent_id, 3, 4, true)
    ON CONFLICT (slug) DO NOTHING;
    INSERT INTO category_hsn_codes (category_slug, hsn_code, description) VALUES
      ('tv-led',   '85287200', 'LED TVs'),
      ('tv-oled',  '85287200', 'OLED TVs'),
      ('tv-qled',  '85287200', 'QLED TVs'),
      ('tv-smart', '85287200', 'Smart TVs'),
      ('televisions','85287200', 'Televisions')
    ON CONFLICT (category_slug) DO UPDATE SET hsn_code = EXCLUDED.hsn_code;
  END IF;

  -- Wearable Technology
  SELECT id INTO _parent_id FROM categories WHERE slug = 'wearable-technology' LIMIT 1;
  IF _parent_id IS NOT NULL THEN
    INSERT INTO categories (name, slug, parent_id, level, display_order, is_active) VALUES
      ('Smartwatches',     'wt-smartwatches',  _parent_id, 3, 1, true),
      ('Fitness Bands',    'wt-fitness-bands', _parent_id, 3, 2, true),
      ('Smart Glasses',    'wt-smart-glasses', _parent_id, 3, 3, true),
      ('Smart Rings',      'wt-smart-rings',   _parent_id, 3, 4, true)
    ON CONFLICT (slug) DO NOTHING;
    INSERT INTO category_hsn_codes (category_slug, hsn_code, description) VALUES
      ('wt-smartwatches',  '91021200', 'Smartwatches'),
      ('wt-fitness-bands', '91021200', 'Fitness Bands'),
      ('wt-smart-glasses', '90049090', 'Smart Glasses'),
      ('wt-smart-rings',   '71171900', 'Smart Rings'),
      ('wearable-technology','91021200','Wearable Technology')
    ON CONFLICT (category_slug) DO UPDATE SET hsn_code = EXCLUDED.hsn_code;
  END IF;

  -- =====================  FASHION  =====================

  -- Bags & Luggage
  SELECT id INTO _parent_id FROM categories WHERE slug = 'bags-luggage' LIMIT 1;
  IF _parent_id IS NOT NULL THEN
    INSERT INTO categories (name, slug, parent_id, level, display_order, is_active) VALUES
      ('Backpacks',         'bl-backpacks',   _parent_id, 3, 1, true),
      ('Handbags',          'bl-handbags',    _parent_id, 3, 2, true),
      ('Suitcases',         'bl-suitcases',   _parent_id, 3, 3, true),
      ('Duffel Bags',       'bl-duffel-bags', _parent_id, 3, 4, true),
      ('Wallets',           'bl-wallets',     _parent_id, 3, 5, true)
    ON CONFLICT (slug) DO NOTHING;
    INSERT INTO category_hsn_codes (category_slug, hsn_code, description) VALUES
      ('bl-backpacks',  '42029290', 'Backpacks'),
      ('bl-handbags',   '42022210', 'Handbags'),
      ('bl-suitcases',  '42021290', 'Suitcases'),
      ('bl-duffel-bags','42029290', 'Duffel Bags'),
      ('bl-wallets',    '42023100', 'Wallets'),
      ('bags-luggage',  '42029290', 'Bags & Luggage')
    ON CONFLICT (category_slug) DO UPDATE SET hsn_code = EXCLUDED.hsn_code;
  END IF;

  -- Fashion Jewellery
  SELECT id INTO _parent_id FROM categories WHERE slug = 'fashion-jewellery' LIMIT 1;
  IF _parent_id IS NOT NULL THEN
    INSERT INTO categories (name, slug, parent_id, level, display_order, is_active) VALUES
      ('Necklaces',         'fj-necklaces',    _parent_id, 3, 1, true),
      ('Earrings',          'fj-earrings',     _parent_id, 3, 2, true),
      ('Bracelets',         'fj-bracelets',    _parent_id, 3, 3, true),
      ('Rings',             'fj-rings',        _parent_id, 3, 4, true),
      ('Anklets',           'fj-anklets',      _parent_id, 3, 5, true)
    ON CONFLICT (slug) DO NOTHING;
    INSERT INTO category_hsn_codes (category_slug, hsn_code, description) VALUES
      ('fj-necklaces', '71171900', 'Necklaces'),
      ('fj-earrings',  '71171900', 'Earrings'),
      ('fj-bracelets', '71171900', 'Bracelets'),
      ('fj-rings',     '71171900', 'Rings'),
      ('fj-anklets',   '71171900', 'Anklets'),
      ('fashion-jewellery','71171900','Fashion Jewellery')
    ON CONFLICT (category_slug) DO UPDATE SET hsn_code = EXCLUDED.hsn_code;
  END IF;

  -- Kids & Baby Clothing
  SELECT id INTO _parent_id FROM categories WHERE slug = 'kids-baby-clothing' LIMIT 1;
  IF _parent_id IS NOT NULL THEN
    INSERT INTO categories (name, slug, parent_id, level, display_order, is_active) VALUES
      ('Baby Rompers',   'kbc-rompers',   _parent_id, 3, 1, true),
      ('Kids T-Shirts',  'kbc-tshirts',   _parent_id, 3, 2, true),
      ('Kids Dresses',   'kbc-dresses',   _parent_id, 3, 3, true),
      ('Kids Pants',     'kbc-pants',     _parent_id, 3, 4, true),
      ('School Uniforms','kbc-uniforms',  _parent_id, 3, 5, true)
    ON CONFLICT (slug) DO NOTHING;
    INSERT INTO category_hsn_codes (category_slug, hsn_code, description) VALUES
      ('kbc-rompers',  '61119090', 'Baby Rompers'),
      ('kbc-tshirts',  '61091000', 'Kids T-Shirts'),
      ('kbc-dresses',  '62044900', 'Kids Dresses'),
      ('kbc-pants',    '62034990', 'Kids Pants'),
      ('kbc-uniforms', '62114390', 'School Uniforms'),
      ('kids-baby-clothing','61119090','Kids & Baby Clothing')
    ON CONFLICT (category_slug) DO UPDATE SET hsn_code = EXCLUDED.hsn_code;
  END IF;

  -- Sunglasses & Accessories
  SELECT id INTO _parent_id FROM categories WHERE slug = 'sunglasses-accessories' LIMIT 1;
  IF _parent_id IS NOT NULL THEN
    INSERT INTO categories (name, slug, parent_id, level, display_order, is_active) VALUES
      ('Sunglasses',          'sa-sunglasses',       _parent_id, 3, 1, true),
      ('Eyeglass Frames',     'sa-eyeglass-frames',  _parent_id, 3, 2, true),
      ('Lens Care',           'sa-lens-care',        _parent_id, 3, 3, true),
      ('Glasses Cases',       'sa-glasses-cases',    _parent_id, 3, 4, true)
    ON CONFLICT (slug) DO NOTHING;
    INSERT INTO category_hsn_codes (category_slug, hsn_code, description) VALUES
      ('sa-sunglasses',      '90041000', 'Sunglasses'),
      ('sa-eyeglass-frames', '90031900', 'Eyeglass Frames'),
      ('sa-lens-care',       '33049990', 'Lens Care'),
      ('sa-glasses-cases',   '42021290', 'Glasses Cases'),
      ('sunglasses-accessories','90041000','Sunglasses & Accessories')
    ON CONFLICT (category_slug) DO UPDATE SET hsn_code = EXCLUDED.hsn_code;
  END IF;

  -- Watches
  SELECT id INTO _parent_id FROM categories WHERE slug = 'watches' AND level = 2 LIMIT 1;
  IF _parent_id IS NOT NULL THEN
    INSERT INTO categories (name, slug, parent_id, level, display_order, is_active) VALUES
      ('Analog Watches',    'fw-analog',    _parent_id, 3, 1, true),
      ('Digital Watches',   'fw-digital',   _parent_id, 3, 2, true),
      ('Chronograph',       'fw-chronograph',_parent_id, 3, 3, true),
      ('Watch Accessories', 'fw-watch-acc',  _parent_id, 3, 4, true)
    ON CONFLICT (slug) DO NOTHING;
    INSERT INTO category_hsn_codes (category_slug, hsn_code, description) VALUES
      ('fw-analog',     '91021200', 'Analog Watches'),
      ('fw-digital',    '91021200', 'Digital Watches'),
      ('fw-chronograph','91021200', 'Chronograph Watches'),
      ('fw-watch-acc',  '91149090', 'Watch Accessories')
    ON CONFLICT (category_slug) DO UPDATE SET hsn_code = EXCLUDED.hsn_code;
  END IF;

  -- =====================  HOME & GARDEN  =====================

  -- Bedding & Furnishings
  SELECT id INTO _parent_id FROM categories WHERE slug = 'bedding-furnishings' LIMIT 1;
  IF _parent_id IS NOT NULL THEN
    INSERT INTO categories (name, slug, parent_id, level, display_order, is_active) VALUES
      ('Bedsheets',        'bf-bedsheets',  _parent_id, 3, 1, true),
      ('Pillows',          'bf-pillows',    _parent_id, 3, 2, true),
      ('Blankets',         'bf-blankets',   _parent_id, 3, 3, true),
      ('Curtains',         'bf-curtains',   _parent_id, 3, 4, true),
      ('Mattress Protectors','bf-mattress-protectors',_parent_id, 3, 5, true)
    ON CONFLICT (slug) DO NOTHING;
    INSERT INTO category_hsn_codes (category_slug, hsn_code, description) VALUES
      ('bf-bedsheets',  '63023100', 'Bedsheets'),
      ('bf-pillows',    '94049010', 'Pillows'),
      ('bf-blankets',   '63012000', 'Blankets'),
      ('bf-curtains',   '63039200', 'Curtains'),
      ('bf-mattress-protectors','63023100','Mattress Protectors'),
      ('bedding-furnishings','63023100','Bedding & Furnishings')
    ON CONFLICT (category_slug) DO UPDATE SET hsn_code = EXCLUDED.hsn_code;
  END IF;

  -- Cleaning Supplies
  SELECT id INTO _parent_id FROM categories WHERE slug = 'cleaning-supplies' LIMIT 1;
  IF _parent_id IS NOT NULL THEN
    INSERT INTO categories (name, slug, parent_id, level, display_order, is_active) VALUES
      ('Floor Cleaners',    'cs-floor-cleaners',   _parent_id, 3, 1, true),
      ('Disinfectants',     'cs-disinfectants',    _parent_id, 3, 2, true),
      ('Brooms & Mops',     'cs-brooms-mops',     _parent_id, 3, 3, true),
      ('Trash Bags',        'cs-trash-bags',       _parent_id, 3, 4, true)
    ON CONFLICT (slug) DO NOTHING;
    INSERT INTO category_hsn_codes (category_slug, hsn_code, description) VALUES
      ('cs-floor-cleaners','34022090', 'Floor Cleaners'),
      ('cs-disinfectants', '38089290', 'Disinfectants'),
      ('cs-brooms-mops',  '96039090', 'Brooms & Mops'),
      ('cs-trash-bags',   '39232990', 'Trash Bags'),
      ('cleaning-supplies','34022090','Cleaning Supplies')
    ON CONFLICT (category_slug) DO UPDATE SET hsn_code = EXCLUDED.hsn_code;
  END IF;

  -- Cookware
  SELECT id INTO _parent_id FROM categories WHERE slug = 'cookware' AND level = 2 LIMIT 1;
  IF _parent_id IS NOT NULL THEN
    INSERT INTO categories (name, slug, parent_id, level, display_order, is_active) VALUES
      ('Pans',             'cw-pans',       _parent_id, 3, 1, true),
      ('Pots',             'cw-pots',       _parent_id, 3, 2, true),
      ('Pressure Cookers', 'cw-pressure-cookers',_parent_id, 3, 3, true),
      ('Bakeware',         'cw-bakeware',   _parent_id, 3, 4, true),
      ('Kadhai & Woks',    'cw-kadhai-woks',_parent_id, 3, 5, true)
    ON CONFLICT (slug) DO NOTHING;
    INSERT INTO category_hsn_codes (category_slug, hsn_code, description) VALUES
      ('cw-pans',            '73239390', 'Pans'),
      ('cw-pots',            '73239390', 'Pots'),
      ('cw-pressure-cookers','73239390', 'Pressure Cookers'),
      ('cw-bakeware',        '73239390', 'Bakeware'),
      ('cw-kadhai-woks',     '73239390', 'Kadhai & Woks')
    ON CONFLICT (category_slug) DO UPDATE SET hsn_code = EXCLUDED.hsn_code;
  END IF;

  -- Home Décor
  SELECT id INTO _parent_id FROM categories WHERE slug = 'home-d-cor' LIMIT 1;
  IF _parent_id IS NOT NULL THEN
    INSERT INTO categories (name, slug, parent_id, level, display_order, is_active) VALUES
      ('Wall Art & Paintings','hd-wall-art',   _parent_id, 3, 1, true),
      ('Vases',               'hd-vases',      _parent_id, 3, 2, true),
      ('Clocks',              'hd-clocks',     _parent_id, 3, 3, true),
      ('Photo Frames',        'hd-photo-frames',_parent_id, 3, 4, true),
      ('Candles & Holders',   'hd-candles',    _parent_id, 3, 5, true)
    ON CONFLICT (slug) DO NOTHING;
    INSERT INTO category_hsn_codes (category_slug, hsn_code, description) VALUES
      ('hd-wall-art',     '97011090', 'Wall Art & Paintings'),
      ('hd-vases',        '69139090', 'Vases'),
      ('hd-clocks',       '91059190', 'Clocks'),
      ('hd-photo-frames', '83062990', 'Photo Frames'),
      ('hd-candles',      '34060090', 'Candles & Holders'),
      ('home-d-cor',      '83062990', 'Home Décor')
    ON CONFLICT (category_slug) DO UPDATE SET hsn_code = EXCLUDED.hsn_code;
  END IF;

  -- Home Storage
  SELECT id INTO _parent_id FROM categories WHERE slug = 'home-storage' LIMIT 1;
  IF _parent_id IS NOT NULL THEN
    INSERT INTO categories (name, slug, parent_id, level, display_order, is_active) VALUES
      ('Storage Boxes',       'hs-storage-boxes',   _parent_id, 3, 1, true),
      ('Shelving Units',      'hs-shelving',        _parent_id, 3, 2, true),
      ('Organizers',          'hs-organizers',      _parent_id, 3, 3, true),
      ('Wardrobe Organizers', 'hs-wardrobe-org',    _parent_id, 3, 4, true)
    ON CONFLICT (slug) DO NOTHING;
    INSERT INTO category_hsn_codes (category_slug, hsn_code, description) VALUES
      ('hs-storage-boxes','39249090', 'Storage Boxes'),
      ('hs-shelving',     '94036090', 'Shelving Units'),
      ('hs-organizers',   '39249090', 'Organizers'),
      ('hs-wardrobe-org', '39249090', 'Wardrobe Organizers'),
      ('home-storage',    '39249090', 'Home Storage')
    ON CONFLICT (category_slug) DO UPDATE SET hsn_code = EXCLUDED.hsn_code;
  END IF;

  -- Kitchen & Dining
  SELECT id INTO _parent_id FROM categories WHERE slug = 'kitchen-dining' LIMIT 1;
  IF _parent_id IS NOT NULL THEN
    INSERT INTO categories (name, slug, parent_id, level, display_order, is_active) VALUES
      ('Dinner Sets',        'kd-dinner-sets',  _parent_id, 3, 1, true),
      ('Cutlery Sets',       'kd-cutlery',      _parent_id, 3, 2, true),
      ('Water Bottles',      'kd-water-bottles',_parent_id, 3, 3, true),
      ('Lunch Boxes',        'kd-lunch-boxes',  _parent_id, 3, 4, true),
      ('Kitchen Appliances', 'kd-appliances',   _parent_id, 3, 5, true)
    ON CONFLICT (slug) DO NOTHING;
    INSERT INTO category_hsn_codes (category_slug, hsn_code, description) VALUES
      ('kd-dinner-sets',  '69111090', 'Dinner Sets'),
      ('kd-cutlery',      '82159990', 'Cutlery Sets'),
      ('kd-water-bottles','39241090', 'Water Bottles'),
      ('kd-lunch-boxes',  '39241090', 'Lunch Boxes'),
      ('kd-appliances',   '85167990', 'Kitchen Appliances'),
      ('kitchen-dining',  '69111090', 'Kitchen & Dining')
    ON CONFLICT (category_slug) DO UPDATE SET hsn_code = EXCLUDED.hsn_code;
  END IF;

  -- Lighting
  SELECT id INTO _parent_id FROM categories WHERE slug = 'lighting' AND level = 2 LIMIT 1;
  IF _parent_id IS NOT NULL THEN
    INSERT INTO categories (name, slug, parent_id, level, display_order, is_active) VALUES
      ('LED Bulbs',         'lt-led-bulbs',     _parent_id, 3, 1, true),
      ('Table Lamps',       'lt-table-lamps',   _parent_id, 3, 2, true),
      ('Ceiling Lights',    'lt-ceiling-lights', _parent_id, 3, 3, true),
      ('Decorative Lights', 'lt-decorative',     _parent_id, 3, 4, true),
      ('Smart Lights',      'lt-smart-lights',   _parent_id, 3, 5, true)
    ON CONFLICT (slug) DO NOTHING;
    INSERT INTO category_hsn_codes (category_slug, hsn_code, description) VALUES
      ('lt-led-bulbs',     '85395000', 'LED Bulbs'),
      ('lt-table-lamps',   '94054090', 'Table Lamps'),
      ('lt-ceiling-lights','94051090', 'Ceiling Lights'),
      ('lt-decorative',    '94054090', 'Decorative Lights'),
      ('lt-smart-lights',  '94054090', 'Smart Lights')
    ON CONFLICT (category_slug) DO UPDATE SET hsn_code = EXCLUDED.hsn_code;
  END IF;

  -- =====================  BEAUTY & PERSONAL CARE  =====================

  -- Bath & Body
  SELECT id INTO _parent_id FROM categories WHERE slug = 'bath-body' LIMIT 1;
  IF _parent_id IS NOT NULL THEN
    INSERT INTO categories (name, slug, parent_id, level, display_order, is_active) VALUES
      ('Body Wash',       'bb-body-wash',    _parent_id, 3, 1, true),
      ('Soaps',           'bb-soaps',        _parent_id, 3, 2, true),
      ('Body Lotion',     'bb-body-lotion',  _parent_id, 3, 3, true),
      ('Bath Bombs',      'bb-bath-bombs',   _parent_id, 3, 4, true),
      ('Scrubs',          'bb-scrubs',       _parent_id, 3, 5, true)
    ON CONFLICT (slug) DO NOTHING;
    INSERT INTO category_hsn_codes (category_slug, hsn_code, description) VALUES
      ('bb-body-wash',   '34011990', 'Body Wash'),
      ('bb-soaps',       '34011190', 'Soaps'),
      ('bb-body-lotion', '33049990', 'Body Lotion'),
      ('bb-bath-bombs',  '33079090', 'Bath Bombs'),
      ('bb-scrubs',      '33049990', 'Scrubs'),
      ('bath-body',      '34011990', 'Bath & Body')
    ON CONFLICT (category_slug) DO UPDATE SET hsn_code = EXCLUDED.hsn_code;
  END IF;

  -- Beauty Tools & Accessories
  SELECT id INTO _parent_id FROM categories WHERE slug = 'beauty-tools-accessories' LIMIT 1;
  IF _parent_id IS NOT NULL THEN
    INSERT INTO categories (name, slug, parent_id, level, display_order, is_active) VALUES
      ('Hair Dryers',        'bta-hair-dryers',    _parent_id, 3, 1, true),
      ('Straighteners',      'bta-straighteners',  _parent_id, 3, 2, true),
      ('Curling Irons',      'bta-curling-irons',  _parent_id, 3, 3, true),
      ('Makeup Brushes',     'bta-makeup-brushes', _parent_id, 3, 4, true),
      ('Facial Massagers',   'bta-facial-massagers',_parent_id, 3, 5, true)
    ON CONFLICT (slug) DO NOTHING;
    INSERT INTO category_hsn_codes (category_slug, hsn_code, description) VALUES
      ('bta-hair-dryers',     '85163100', 'Hair Dryers'),
      ('bta-straighteners',   '85163200', 'Straighteners'),
      ('bta-curling-irons',   '85163200', 'Curling Irons'),
      ('bta-makeup-brushes',  '96032990', 'Makeup Brushes'),
      ('bta-facial-massagers','90189099', 'Facial Massagers'),
      ('beauty-tools-accessories','85163100','Beauty Tools & Accessories')
    ON CONFLICT (category_slug) DO UPDATE SET hsn_code = EXCLUDED.hsn_code;
  END IF;

  -- Fragrances
  SELECT id INTO _parent_id FROM categories WHERE slug = 'fragrances' LIMIT 1;
  IF _parent_id IS NOT NULL THEN
    INSERT INTO categories (name, slug, parent_id, level, display_order, is_active) VALUES
      ('Perfumes',          'fr-perfumes',     _parent_id, 3, 1, true),
      ('Deodorants',        'fr-deodorants',   _parent_id, 3, 2, true),
      ('Body Mists',        'fr-body-mists',   _parent_id, 3, 3, true),
      ('Attar & Essential Oils','fr-attar',    _parent_id, 3, 4, true)
    ON CONFLICT (slug) DO NOTHING;
    INSERT INTO category_hsn_codes (category_slug, hsn_code, description) VALUES
      ('fr-perfumes',   '33030010', 'Perfumes'),
      ('fr-deodorants', '33072000', 'Deodorants'),
      ('fr-body-mists', '33030090', 'Body Mists'),
      ('fr-attar',      '33019090', 'Attar & Essential Oils'),
      ('fragrances',    '33030010', 'Fragrances')
    ON CONFLICT (category_slug) DO UPDATE SET hsn_code = EXCLUDED.hsn_code;
  END IF;

  -- Grooming & Shaving
  SELECT id INTO _parent_id FROM categories WHERE slug = 'grooming-shaving' LIMIT 1;
  IF _parent_id IS NOT NULL THEN
    INSERT INTO categories (name, slug, parent_id, level, display_order, is_active) VALUES
      ('Trimmers',          'gs-trimmers',      _parent_id, 3, 1, true),
      ('Shavers',           'gs-shavers',       _parent_id, 3, 2, true),
      ('Shaving Cream',     'gs-shaving-cream', _parent_id, 3, 3, true),
      ('Razors',            'gs-razors',        _parent_id, 3, 4, true),
      ('Aftershave',        'gs-aftershave',    _parent_id, 3, 5, true)
    ON CONFLICT (slug) DO NOTHING;
    INSERT INTO category_hsn_codes (category_slug, hsn_code, description) VALUES
      ('gs-trimmers',     '85109000', 'Trimmers'),
      ('gs-shavers',      '85109000', 'Shavers'),
      ('gs-shaving-cream','33071000', 'Shaving Cream'),
      ('gs-razors',       '82121090', 'Razors'),
      ('gs-aftershave',   '33079090', 'Aftershave'),
      ('grooming-shaving','85109000', 'Grooming & Shaving')
    ON CONFLICT (category_slug) DO UPDATE SET hsn_code = EXCLUDED.hsn_code;
  END IF;

  -- =====================  GROCERY & GOURMET FOOD  =====================

  -- Baby Food
  SELECT id INTO _parent_id FROM categories WHERE slug = 'baby-food' LIMIT 1;
  IF _parent_id IS NOT NULL THEN
    INSERT INTO categories (name, slug, parent_id, level, display_order, is_active) VALUES
      ('Baby Cereal',        'bfood-cereal',     _parent_id, 3, 1, true),
      ('Baby Formula',       'bfood-formula',    _parent_id, 3, 2, true),
      ('Baby Snacks',        'bfood-snacks',     _parent_id, 3, 3, true),
      ('Baby Puree',         'bfood-puree',      _parent_id, 3, 4, true)
    ON CONFLICT (slug) DO NOTHING;
    INSERT INTO category_hsn_codes (category_slug, hsn_code, description) VALUES
      ('bfood-cereal',  '19011090', 'Baby Cereal'),
      ('bfood-formula', '19011010', 'Baby Formula'),
      ('bfood-snacks',  '19059040', 'Baby Snacks'),
      ('bfood-puree',   '20079990', 'Baby Puree'),
      ('baby-food',     '19011090', 'Baby Food')
    ON CONFLICT (category_slug) DO UPDATE SET hsn_code = EXCLUDED.hsn_code;
  END IF;

  -- Breakfast Foods
  SELECT id INTO _parent_id FROM categories WHERE slug = 'breakfast-foods' LIMIT 1;
  IF _parent_id IS NOT NULL THEN
    INSERT INTO categories (name, slug, parent_id, level, display_order, is_active) VALUES
      ('Cereals',       'brf-cereals',   _parent_id, 3, 1, true),
      ('Oats',          'brf-oats',      _parent_id, 3, 2, true),
      ('Muesli',        'brf-muesli',    _parent_id, 3, 3, true),
      ('Granola',       'brf-granola',   _parent_id, 3, 4, true)
    ON CONFLICT (slug) DO NOTHING;
    INSERT INTO category_hsn_codes (category_slug, hsn_code, description) VALUES
      ('brf-cereals', '19041090', 'Cereals'),
      ('brf-oats',    '11041200', 'Oats'),
      ('brf-muesli',  '19042000', 'Muesli'),
      ('brf-granola', '19042000', 'Granola'),
      ('breakfast-foods','19041090','Breakfast Foods')
    ON CONFLICT (category_slug) DO UPDATE SET hsn_code = EXCLUDED.hsn_code;
  END IF;

  -- Gourmet & Imported Foods
  SELECT id INTO _parent_id FROM categories WHERE slug = 'gourmet-imported-foods' LIMIT 1;
  IF _parent_id IS NOT NULL THEN
    INSERT INTO categories (name, slug, parent_id, level, display_order, is_active) VALUES
      ('Imported Chocolates', 'gif-chocolates',  _parent_id, 3, 1, true),
      ('Olive Oil',           'gif-olive-oil',   _parent_id, 3, 2, true),
      ('Cheese',              'gif-cheese',      _parent_id, 3, 3, true),
      ('Sauces & Dips',       'gif-sauces',      _parent_id, 3, 4, true),
      ('Dried Fruits & Nuts', 'gif-dry-fruits',  _parent_id, 3, 5, true)
    ON CONFLICT (slug) DO NOTHING;
    INSERT INTO category_hsn_codes (category_slug, hsn_code, description) VALUES
      ('gif-chocolates','18069000', 'Imported Chocolates'),
      ('gif-olive-oil', '15091000', 'Olive Oil'),
      ('gif-cheese',    '04069090', 'Cheese'),
      ('gif-sauces',    '21039090', 'Sauces & Dips'),
      ('gif-dry-fruits','08134090', 'Dried Fruits & Nuts'),
      ('gourmet-imported-foods','21069099','Gourmet & Imported Foods')
    ON CONFLICT (category_slug) DO UPDATE SET hsn_code = EXCLUDED.hsn_code;
  END IF;

  -- Organic & Health Foods
  SELECT id INTO _parent_id FROM categories WHERE slug = 'organic-health-foods' LIMIT 1;
  IF _parent_id IS NOT NULL THEN
    INSERT INTO categories (name, slug, parent_id, level, display_order, is_active) VALUES
      ('Organic Grains',    'ohf-grains',     _parent_id, 3, 1, true),
      ('Organic Honey',     'ohf-honey',      _parent_id, 3, 2, true),
      ('Health Bars',       'ohf-health-bars', _parent_id, 3, 3, true),
      ('Organic Spices',    'ohf-spices',      _parent_id, 3, 4, true)
    ON CONFLICT (slug) DO NOTHING;
    INSERT INTO category_hsn_codes (category_slug, hsn_code, description) VALUES
      ('ohf-grains',     '10063090', 'Organic Grains'),
      ('ohf-honey',      '04090000', 'Organic Honey'),
      ('ohf-health-bars','19042000', 'Health Bars'),
      ('ohf-spices',     '09109190', 'Organic Spices'),
      ('organic-health-foods','21069099','Organic & Health Foods')
    ON CONFLICT (category_slug) DO UPDATE SET hsn_code = EXCLUDED.hsn_code;
  END IF;

  -- Packaged Foods
  SELECT id INTO _parent_id FROM categories WHERE slug = 'packaged-foods' LIMIT 1;
  IF _parent_id IS NOT NULL THEN
    INSERT INTO categories (name, slug, parent_id, level, display_order, is_active) VALUES
      ('Instant Noodles',   'pf-noodles',    _parent_id, 3, 1, true),
      ('Canned Foods',      'pf-canned',     _parent_id, 3, 2, true),
      ('Ready to Eat',      'pf-ready-eat',  _parent_id, 3, 3, true),
      ('Pickles & Chutneys','pf-pickles',    _parent_id, 3, 4, true)
    ON CONFLICT (slug) DO NOTHING;
    INSERT INTO category_hsn_codes (category_slug, hsn_code, description) VALUES
      ('pf-noodles',  '19023010', 'Instant Noodles'),
      ('pf-canned',   '20029090', 'Canned Foods'),
      ('pf-ready-eat','21069099', 'Ready to Eat Meals'),
      ('pf-pickles',  '20019090', 'Pickles & Chutneys'),
      ('packaged-foods','21069099','Packaged Foods')
    ON CONFLICT (category_slug) DO UPDATE SET hsn_code = EXCLUDED.hsn_code;
  END IF;

  -- Snacks & Beverages
  SELECT id INTO _parent_id FROM categories WHERE slug = 'snacks-beverages' LIMIT 1;
  IF _parent_id IS NOT NULL THEN
    INSERT INTO categories (name, slug, parent_id, level, display_order, is_active) VALUES
      ('Chips & Crisps',  'sb-chips',       _parent_id, 3, 1, true),
      ('Biscuits',        'sb-biscuits',     _parent_id, 3, 2, true),
      ('Juices',          'sb-juices',       _parent_id, 3, 3, true),
      ('Soft Drinks',     'sb-soft-drinks',  _parent_id, 3, 4, true),
      ('Dry Fruits',      'sb-dry-fruits',   _parent_id, 3, 5, true)
    ON CONFLICT (slug) DO NOTHING;
    INSERT INTO category_hsn_codes (category_slug, hsn_code, description) VALUES
      ('sb-chips',      '19059040', 'Chips & Crisps'),
      ('sb-biscuits',   '19053100', 'Biscuits'),
      ('sb-juices',     '20098990', 'Juices'),
      ('sb-soft-drinks','22021090', 'Soft Drinks'),
      ('sb-dry-fruits', '08134090', 'Dry Fruits'),
      ('snacks-beverages','19059040','Snacks & Beverages')
    ON CONFLICT (category_slug) DO UPDATE SET hsn_code = EXCLUDED.hsn_code;
  END IF;

  -- Staples (Rice, Flour, Pulses)
  SELECT id INTO _parent_id FROM categories WHERE slug = 'staples-rice-flour-pulses-' LIMIT 1;
  IF _parent_id IS NOT NULL THEN
    INSERT INTO categories (name, slug, parent_id, level, display_order, is_active) VALUES
      ('Rice',         'st-rice',    _parent_id, 3, 1, true),
      ('Flour (Atta)', 'st-flour',   _parent_id, 3, 2, true),
      ('Pulses (Dal)', 'st-pulses',  _parent_id, 3, 3, true),
      ('Sugar & Salt', 'st-sugar',   _parent_id, 3, 4, true),
      ('Cooking Oil',  'st-oil',     _parent_id, 3, 5, true)
    ON CONFLICT (slug) DO NOTHING;
    INSERT INTO category_hsn_codes (category_slug, hsn_code, description) VALUES
      ('st-rice',   '10063090', 'Rice'),
      ('st-flour',  '11010000', 'Flour (Atta)'),
      ('st-pulses', '07134000', 'Pulses (Dal)'),
      ('st-sugar',  '17019910', 'Sugar'),
      ('st-oil',    '15079090', 'Cooking Oil'),
      ('staples-rice-flour-pulses-','10063090','Staples')
    ON CONFLICT (category_slug) DO UPDATE SET hsn_code = EXCLUDED.hsn_code;
  END IF;

  -- =====================  HEALTH, HOUSEHOLD & BABY CARE  =====================

  -- Elder Care
  SELECT id INTO _parent_id FROM categories WHERE slug = 'elder-care' LIMIT 1;
  IF _parent_id IS NOT NULL THEN
    INSERT INTO categories (name, slug, parent_id, level, display_order, is_active) VALUES
      ('Walking Aids',       'ec-walking-aids',  _parent_id, 3, 1, true),
      ('Adult Diapers',      'ec-adult-diapers', _parent_id, 3, 2, true),
      ('Blood Pressure Monitors','ec-bp-monitors',_parent_id, 3, 3, true),
      ('Orthopedic Supports','ec-ortho-supports',_parent_id, 3, 4, true)
    ON CONFLICT (slug) DO NOTHING;
    INSERT INTO category_hsn_codes (category_slug, hsn_code, description) VALUES
      ('ec-walking-aids',  '90211090', 'Walking Aids'),
      ('ec-adult-diapers', '96190090', 'Adult Diapers'),
      ('ec-bp-monitors',   '90189099', 'Blood Pressure Monitors'),
      ('ec-ortho-supports','90211090', 'Orthopedic Supports'),
      ('elder-care',       '90211090', 'Elder Care')
    ON CONFLICT (category_slug) DO UPDATE SET hsn_code = EXCLUDED.hsn_code;
  END IF;

  -- Health Supplements
  SELECT id INTO _parent_id FROM categories WHERE slug = 'health-supplements' LIMIT 1;
  IF _parent_id IS NOT NULL THEN
    INSERT INTO categories (name, slug, parent_id, level, display_order, is_active) VALUES
      ('Multivitamins',     'hsup-multivitamins',  _parent_id, 3, 1, true),
      ('Protein Powder',    'hsup-protein',        _parent_id, 3, 2, true),
      ('Omega 3 & Fish Oil','hsup-omega3',         _parent_id, 3, 3, true),
      ('Ayurvedic Supplements','hsup-ayurvedic',   _parent_id, 3, 4, true)
    ON CONFLICT (slug) DO NOTHING;
    INSERT INTO category_hsn_codes (category_slug, hsn_code, description) VALUES
      ('hsup-multivitamins','21069099', 'Multivitamins'),
      ('hsup-protein',      '21069099', 'Protein Powder'),
      ('hsup-omega3',       '15042090', 'Omega 3 & Fish Oil'),
      ('hsup-ayurvedic',    '30049099', 'Ayurvedic Supplements'),
      ('health-supplements','21069099', 'Health Supplements')
    ON CONFLICT (category_slug) DO UPDATE SET hsn_code = EXCLUDED.hsn_code;
  END IF;

  -- Household Supplies
  SELECT id INTO _parent_id FROM categories WHERE slug = 'household-supplies' LIMIT 1;
  IF _parent_id IS NOT NULL THEN
    INSERT INTO categories (name, slug, parent_id, level, display_order, is_active) VALUES
      ('Laundry Detergent',  'hhs-detergent',   _parent_id, 3, 1, true),
      ('Dishwash',           'hhs-dishwash',    _parent_id, 3, 2, true),
      ('Air Fresheners',     'hhs-fresheners',  _parent_id, 3, 3, true),
      ('Tissue & Paper',     'hhs-tissue',      _parent_id, 3, 4, true)
    ON CONFLICT (slug) DO NOTHING;
    INSERT INTO category_hsn_codes (category_slug, hsn_code, description) VALUES
      ('hhs-detergent', '34022090', 'Laundry Detergent'),
      ('hhs-dishwash',  '34022090', 'Dishwash'),
      ('hhs-fresheners','33074990', 'Air Fresheners'),
      ('hhs-tissue',    '48189090', 'Tissue & Paper'),
      ('household-supplies','34022090','Household Supplies')
    ON CONFLICT (category_slug) DO UPDATE SET hsn_code = EXCLUDED.hsn_code;
  END IF;

  -- Medical Devices
  SELECT id INTO _parent_id FROM categories WHERE slug = 'medical-devices' LIMIT 1;
  IF _parent_id IS NOT NULL THEN
    INSERT INTO categories (name, slug, parent_id, level, display_order, is_active) VALUES
      ('Thermometers',    'md-thermometers',  _parent_id, 3, 1, true),
      ('Oximeters',       'md-oximeters',     _parent_id, 3, 2, true),
      ('Glucometers',     'md-glucometers',   _parent_id, 3, 3, true),
      ('Nebulizers',      'md-nebulizers',    _parent_id, 3, 4, true)
    ON CONFLICT (slug) DO NOTHING;
    INSERT INTO category_hsn_codes (category_slug, hsn_code, description) VALUES
      ('md-thermometers','90251990', 'Thermometers'),
      ('md-oximeters',   '90189099', 'Oximeters'),
      ('md-glucometers', '90189099', 'Glucometers'),
      ('md-nebulizers',  '90189099', 'Nebulizers'),
      ('medical-devices','90189099', 'Medical Devices')
    ON CONFLICT (category_slug) DO UPDATE SET hsn_code = EXCLUDED.hsn_code;
  END IF;

  -- Personal Hygiene
  SELECT id INTO _parent_id FROM categories WHERE slug = 'personal-hygiene' LIMIT 1;
  IF _parent_id IS NOT NULL THEN
    INSERT INTO categories (name, slug, parent_id, level, display_order, is_active) VALUES
      ('Toothpaste',      'ph-toothpaste',  _parent_id, 3, 1, true),
      ('Hand Wash',       'ph-hand-wash',   _parent_id, 3, 2, true),
      ('Sanitizers',      'ph-sanitizers',  _parent_id, 3, 3, true),
      ('Feminine Hygiene','ph-feminine',    _parent_id, 3, 4, true)
    ON CONFLICT (slug) DO NOTHING;
    INSERT INTO category_hsn_codes (category_slug, hsn_code, description) VALUES
      ('ph-toothpaste', '33061010', 'Toothpaste'),
      ('ph-hand-wash',  '34011990', 'Hand Wash'),
      ('ph-sanitizers', '38089290', 'Sanitizers'),
      ('ph-feminine',   '96190010', 'Feminine Hygiene'),
      ('personal-hygiene','33061010','Personal Hygiene')
    ON CONFLICT (category_slug) DO UPDATE SET hsn_code = EXCLUDED.hsn_code;
  END IF;

  -- Wellness Products
  SELECT id INTO _parent_id FROM categories WHERE slug = 'wellness-products' LIMIT 1;
  IF _parent_id IS NOT NULL THEN
    INSERT INTO categories (name, slug, parent_id, level, display_order, is_active) VALUES
      ('Essential Oils',    'wp-essential-oils',_parent_id, 3, 1, true),
      ('Massage Tools',     'wp-massage-tools', _parent_id, 3, 2, true),
      ('Aromatherapy',      'wp-aromatherapy',  _parent_id, 3, 3, true),
      ('Herbal Products',   'wp-herbal',        _parent_id, 3, 4, true)
    ON CONFLICT (slug) DO NOTHING;
    INSERT INTO category_hsn_codes (category_slug, hsn_code, description) VALUES
      ('wp-essential-oils','33019090', 'Essential Oils'),
      ('wp-massage-tools', '90189099', 'Massage Tools'),
      ('wp-aromatherapy',  '33019090', 'Aromatherapy'),
      ('wp-herbal',        '30049099', 'Herbal Products'),
      ('wellness-products','33019090', 'Wellness Products')
    ON CONFLICT (category_slug) DO UPDATE SET hsn_code = EXCLUDED.hsn_code;
  END IF;

  -- =====================  TOYS, GAMES & BABY PRODUCTS  =====================

  -- Baby Toys
  SELECT id INTO _parent_id FROM categories WHERE slug = 'baby-toys' LIMIT 1;
  IF _parent_id IS NOT NULL THEN
    INSERT INTO categories (name, slug, parent_id, level, display_order, is_active) VALUES
      ('Rattles',          'btoy-rattles',   _parent_id, 3, 1, true),
      ('Soft Toys',        'btoy-soft-toys', _parent_id, 3, 2, true),
      ('Teething Toys',    'btoy-teething',  _parent_id, 3, 3, true),
      ('Musical Toys',     'btoy-musical',   _parent_id, 3, 4, true)
    ON CONFLICT (slug) DO NOTHING;
    INSERT INTO category_hsn_codes (category_slug, hsn_code, description) VALUES
      ('btoy-rattles',  '95030090', 'Rattles'),
      ('btoy-soft-toys','95030021', 'Soft Toys'),
      ('btoy-teething', '95030090', 'Teething Toys'),
      ('btoy-musical',  '95030090', 'Musical Toys'),
      ('baby-toys',     '95030090', 'Baby Toys')
    ON CONFLICT (category_slug) DO UPDATE SET hsn_code = EXCLUDED.hsn_code;
  END IF;

  -- Board Games
  SELECT id INTO _parent_id FROM categories WHERE slug = 'board-games' LIMIT 1;
  IF _parent_id IS NOT NULL THEN
    INSERT INTO categories (name, slug, parent_id, level, display_order, is_active) VALUES
      ('Strategy Games',  'bg-strategy',  _parent_id, 3, 1, true),
      ('Card Games',      'bg-card-games',_parent_id, 3, 2, true),
      ('Family Games',    'bg-family',    _parent_id, 3, 3, true),
      ('Chess & Checkers','bg-chess',     _parent_id, 3, 4, true)
    ON CONFLICT (slug) DO NOTHING;
    INSERT INTO category_hsn_codes (category_slug, hsn_code, description) VALUES
      ('bg-strategy',  '95049090', 'Strategy Games'),
      ('bg-card-games','95044000', 'Card Games'),
      ('bg-family',    '95049090', 'Family Games'),
      ('bg-chess',     '95049010', 'Chess & Checkers'),
      ('board-games',  '95049090', 'Board Games')
    ON CONFLICT (category_slug) DO UPDATE SET hsn_code = EXCLUDED.hsn_code;
  END IF;

  -- Educational Toys
  SELECT id INTO _parent_id FROM categories WHERE slug = 'educational-toys' AND level = 2 LIMIT 1;
  IF _parent_id IS NOT NULL THEN
    INSERT INTO categories (name, slug, parent_id, level, display_order, is_active) VALUES
      ('STEM Kits',        'et-stem-kits',  _parent_id, 3, 1, true),
      ('Building Blocks',  'et-blocks',     _parent_id, 3, 2, true),
      ('Science Kits',     'et-science',    _parent_id, 3, 3, true),
      ('Learning Tablets', 'et-tablets',    _parent_id, 3, 4, true)
    ON CONFLICT (slug) DO NOTHING;
    INSERT INTO category_hsn_codes (category_slug, hsn_code, description) VALUES
      ('et-stem-kits','95030090', 'STEM Kits'),
      ('et-blocks',   '95030090', 'Building Blocks'),
      ('et-science',  '95030090', 'Science Kits'),
      ('et-tablets',  '84713010', 'Learning Tablets')
    ON CONFLICT (category_slug) DO UPDATE SET hsn_code = EXCLUDED.hsn_code;
  END IF;

  -- Kids Ride-Ons
  SELECT id INTO _parent_id FROM categories WHERE slug = 'kids-ride-ons' LIMIT 1;
  IF _parent_id IS NOT NULL THEN
    INSERT INTO categories (name, slug, parent_id, level, display_order, is_active) VALUES
      ('Tricycles',         'kro-tricycles',  _parent_id, 3, 1, true),
      ('Electric Cars',     'kro-electric',   _parent_id, 3, 2, true),
      ('Scooters',          'kro-scooters',   _parent_id, 3, 3, true),
      ('Balance Bikes',     'kro-balance',    _parent_id, 3, 4, true)
    ON CONFLICT (slug) DO NOTHING;
    INSERT INTO category_hsn_codes (category_slug, hsn_code, description) VALUES
      ('kro-tricycles','87120030', 'Tricycles'),
      ('kro-electric', '95030090', 'Electric Ride-On Cars'),
      ('kro-scooters', '87120090', 'Scooters'),
      ('kro-balance',  '87120090', 'Balance Bikes'),
      ('kids-ride-ons','87120090', 'Kids Ride-Ons')
    ON CONFLICT (category_slug) DO UPDATE SET hsn_code = EXCLUDED.hsn_code;
  END IF;

  -- Puzzles
  SELECT id INTO _parent_id FROM categories WHERE slug = 'puzzles' LIMIT 1;
  IF _parent_id IS NOT NULL THEN
    INSERT INTO categories (name, slug, parent_id, level, display_order, is_active) VALUES
      ('Jigsaw Puzzles',  'pz-jigsaw',   _parent_id, 3, 1, true),
      ('3D Puzzles',      'pz-3d',       _parent_id, 3, 2, true),
      ('Rubik Cubes',     'pz-rubik',    _parent_id, 3, 3, true),
      ('Brain Teasers',   'pz-brain',    _parent_id, 3, 4, true)
    ON CONFLICT (slug) DO NOTHING;
    INSERT INTO category_hsn_codes (category_slug, hsn_code, description) VALUES
      ('pz-jigsaw', '95030090', 'Jigsaw Puzzles'),
      ('pz-3d',     '95030090', '3D Puzzles'),
      ('pz-rubik',  '95030090', 'Rubik Cubes'),
      ('pz-brain',  '95030090', 'Brain Teasers'),
      ('puzzles',   '95030090', 'Puzzles')
    ON CONFLICT (category_slug) DO UPDATE SET hsn_code = EXCLUDED.hsn_code;
  END IF;

  -- School & Learning Toys
  SELECT id INTO _parent_id FROM categories WHERE slug = 'school-learning-toys' LIMIT 1;
  IF _parent_id IS NOT NULL THEN
    INSERT INTO categories (name, slug, parent_id, level, display_order, is_active) VALUES
      ('Alphabets & Numbers','slt-alphabets', _parent_id, 3, 1, true),
      ('Art & Craft Kits',   'slt-art-craft', _parent_id, 3, 2, true),
      ('Geometry Sets',      'slt-geometry',  _parent_id, 3, 3, true),
      ('Writing Practice',   'slt-writing',   _parent_id, 3, 4, true)
    ON CONFLICT (slug) DO NOTHING;
    INSERT INTO category_hsn_codes (category_slug, hsn_code, description) VALUES
      ('slt-alphabets','95030090', 'Alphabets & Numbers'),
      ('slt-art-craft','95030090', 'Art & Craft Kits'),
      ('slt-geometry', '90172090', 'Geometry Sets'),
      ('slt-writing',  '48201090', 'Writing Practice'),
      ('school-learning-toys','95030090','School & Learning Toys')
    ON CONFLICT (category_slug) DO UPDATE SET hsn_code = EXCLUDED.hsn_code;
  END IF;

  -- Toys & Action Figures
  SELECT id INTO _parent_id FROM categories WHERE slug = 'toys-action-figures' LIMIT 1;
  IF _parent_id IS NOT NULL THEN
    INSERT INTO categories (name, slug, parent_id, level, display_order, is_active) VALUES
      ('Action Figures',   'taf-action',    _parent_id, 3, 1, true),
      ('Dolls',            'taf-dolls',     _parent_id, 3, 2, true),
      ('Cars & Vehicles',  'taf-cars',     _parent_id, 3, 3, true),
      ('Remote Control',   'taf-rc',       _parent_id, 3, 4, true)
    ON CONFLICT (slug) DO NOTHING;
    INSERT INTO category_hsn_codes (category_slug, hsn_code, description) VALUES
      ('taf-action', '95030090', 'Action Figures'),
      ('taf-dolls',  '95030021', 'Dolls'),
      ('taf-cars',   '95030090', 'Toy Cars & Vehicles'),
      ('taf-rc',     '95030090', 'Remote Control Toys'),
      ('toys-action-figures','95030090','Toys & Action Figures')
    ON CONFLICT (category_slug) DO UPDATE SET hsn_code = EXCLUDED.hsn_code;
  END IF;

  -- =====================  SPORTS, FITNESS & OUTDOORS  =====================

  -- Gym Accessories
  SELECT id INTO _parent_id FROM categories WHERE slug = 'gym-accessories' LIMIT 1;
  IF _parent_id IS NOT NULL THEN
    INSERT INTO categories (name, slug, parent_id, level, display_order, is_active) VALUES
      ('Gym Gloves',       'ga-gloves',     _parent_id, 3, 1, true),
      ('Gym Belts',        'ga-belts',      _parent_id, 3, 2, true),
      ('Resistance Bands', 'ga-bands',      _parent_id, 3, 3, true),
      ('Skipping Ropes',   'ga-ropes',      _parent_id, 3, 4, true),
      ('Yoga Mats',        'ga-yoga-mats',  _parent_id, 3, 5, true)
    ON CONFLICT (slug) DO NOTHING;
    INSERT INTO category_hsn_codes (category_slug, hsn_code, description) VALUES
      ('ga-gloves',    '42032990', 'Gym Gloves'),
      ('ga-belts',     '42033000', 'Gym Belts'),
      ('ga-bands',     '95069190', 'Resistance Bands'),
      ('ga-ropes',     '95069190', 'Skipping Ropes'),
      ('ga-yoga-mats', '40169990', 'Yoga Mats'),
      ('gym-accessories','95069190','Gym Accessories')
    ON CONFLICT (category_slug) DO UPDATE SET hsn_code = EXCLUDED.hsn_code;
  END IF;

  -- Outdoor & Adventure
  SELECT id INTO _parent_id FROM categories WHERE slug = 'outdoor-adventure' LIMIT 1;
  IF _parent_id IS NOT NULL THEN
    INSERT INTO categories (name, slug, parent_id, level, display_order, is_active) VALUES
      ('Tents',            'oa-tents',        _parent_id, 3, 1, true),
      ('Sleeping Bags',    'oa-sleeping-bags', _parent_id, 3, 2, true),
      ('Trekking Poles',   'oa-trekking',     _parent_id, 3, 3, true),
      ('Camping Stoves',   'oa-camping-stoves',_parent_id, 3, 4, true),
      ('Backpacks',        'oa-backpacks',    _parent_id, 3, 5, true)
    ON CONFLICT (slug) DO NOTHING;
    INSERT INTO category_hsn_codes (category_slug, hsn_code, description) VALUES
      ('oa-tents',         '63062200', 'Tents'),
      ('oa-sleeping-bags', '94042990', 'Sleeping Bags'),
      ('oa-trekking',      '66019900', 'Trekking Poles'),
      ('oa-camping-stoves','73211190', 'Camping Stoves'),
      ('oa-backpacks',     '42029290', 'Backpacks'),
      ('outdoor-adventure','63062200','Outdoor & Adventure')
    ON CONFLICT (category_slug) DO UPDATE SET hsn_code = EXCLUDED.hsn_code;
  END IF;

  -- Sports Gear
  SELECT id INTO _parent_id FROM categories WHERE slug = 'sports-gear' LIMIT 1;
  IF _parent_id IS NOT NULL THEN
    INSERT INTO categories (name, slug, parent_id, level, display_order, is_active) VALUES
      ('Cricket Bats',    'sg-cricket-bats', _parent_id, 3, 1, true),
      ('Badminton Rackets','sg-badminton',   _parent_id, 3, 2, true),
      ('Footballs',       'sg-footballs',    _parent_id, 3, 3, true),
      ('Tennis Rackets',  'sg-tennis',       _parent_id, 3, 4, true),
      ('Sports Shoes',    'sg-sports-shoes', _parent_id, 3, 5, true)
    ON CONFLICT (slug) DO NOTHING;
    INSERT INTO category_hsn_codes (category_slug, hsn_code, description) VALUES
      ('sg-cricket-bats','95069990', 'Cricket Bats'),
      ('sg-badminton',   '95065100', 'Badminton Rackets'),
      ('sg-footballs',   '95066290', 'Footballs'),
      ('sg-tennis',      '95065100', 'Tennis Rackets'),
      ('sg-sports-shoes','64041100', 'Sports Shoes'),
      ('sports-gear',    '95069990', 'Sports Gear')
    ON CONFLICT (category_slug) DO UPDATE SET hsn_code = EXCLUDED.hsn_code;
  END IF;

  -- Team Sports
  SELECT id INTO _parent_id FROM categories WHERE slug = 'team-sports' LIMIT 1;
  IF _parent_id IS NOT NULL THEN
    INSERT INTO categories (name, slug, parent_id, level, display_order, is_active) VALUES
      ('Cricket Kits',    'ts-cricket',   _parent_id, 3, 1, true),
      ('Football Kits',   'ts-football',  _parent_id, 3, 2, true),
      ('Hockey Equipment','ts-hockey',    _parent_id, 3, 3, true),
      ('Basketball',      'ts-basketball',_parent_id, 3, 4, true)
    ON CONFLICT (slug) DO NOTHING;
    INSERT INTO category_hsn_codes (category_slug, hsn_code, description) VALUES
      ('ts-cricket',   '95069990', 'Cricket Kits'),
      ('ts-football',  '95069990', 'Football Kits'),
      ('ts-hockey',    '95069990', 'Hockey Equipment'),
      ('ts-basketball','95066990', 'Basketball'),
      ('team-sports',  '95069990', 'Team Sports')
    ON CONFLICT (category_slug) DO UPDATE SET hsn_code = EXCLUDED.hsn_code;
  END IF;

  -- Yoga & Meditation
  SELECT id INTO _parent_id FROM categories WHERE slug = 'yoga-meditation' LIMIT 1;
  IF _parent_id IS NOT NULL THEN
    INSERT INTO categories (name, slug, parent_id, level, display_order, is_active) VALUES
      ('Yoga Mats',        'ym-mats',      _parent_id, 3, 1, true),
      ('Meditation Cushions','ym-cushions',_parent_id, 3, 2, true),
      ('Yoga Blocks',      'ym-blocks',    _parent_id, 3, 3, true),
      ('Yoga Straps',      'ym-straps',    _parent_id, 3, 4, true)
    ON CONFLICT (slug) DO NOTHING;
    INSERT INTO category_hsn_codes (category_slug, hsn_code, description) VALUES
      ('ym-mats',     '40169990', 'Yoga Mats'),
      ('ym-cushions', '94049090', 'Meditation Cushions'),
      ('ym-blocks',   '39269099', 'Yoga Blocks'),
      ('ym-straps',   '56079090', 'Yoga Straps'),
      ('yoga-meditation','40169990','Yoga & Meditation')
    ON CONFLICT (category_slug) DO UPDATE SET hsn_code = EXCLUDED.hsn_code;
  END IF;

  -- =====================  AUTOMOTIVE & INDUSTRIAL  =====================

  -- Industrial Supplies
  SELECT id INTO _parent_id FROM categories WHERE slug = 'industrial-supplies' LIMIT 1;
  IF _parent_id IS NOT NULL THEN
    INSERT INTO categories (name, slug, parent_id, level, display_order, is_active) VALUES
      ('Industrial Tapes',   'is-tapes',    _parent_id, 3, 1, true),
      ('Adhesives',          'is-adhesives',_parent_id, 3, 2, true),
      ('Safety Goggles',     'is-goggles',  _parent_id, 3, 3, true),
      ('Industrial Gloves',  'is-gloves',   _parent_id, 3, 4, true)
    ON CONFLICT (slug) DO NOTHING;
    INSERT INTO category_hsn_codes (category_slug, hsn_code, description) VALUES
      ('is-tapes',    '39199090', 'Industrial Tapes'),
      ('is-adhesives','35061000', 'Adhesives'),
      ('is-goggles',  '90049090', 'Safety Goggles'),
      ('is-gloves',   '40151900', 'Industrial Gloves'),
      ('industrial-supplies','39199090','Industrial Supplies')
    ON CONFLICT (category_slug) DO UPDATE SET hsn_code = EXCLUDED.hsn_code;
  END IF;

  -- Lubricants & Oils
  SELECT id INTO _parent_id FROM categories WHERE slug = 'lubricants-oils' LIMIT 1;
  IF _parent_id IS NOT NULL THEN
    INSERT INTO categories (name, slug, parent_id, level, display_order, is_active) VALUES
      ('Engine Oil',     'lo-engine-oil',   _parent_id, 3, 1, true),
      ('Brake Fluid',   'lo-brake-fluid',  _parent_id, 3, 2, true),
      ('Transmission Oil','lo-transmission',_parent_id, 3, 3, true),
      ('Greases',        'lo-greases',      _parent_id, 3, 4, true)
    ON CONFLICT (slug) DO NOTHING;
    INSERT INTO category_hsn_codes (category_slug, hsn_code, description) VALUES
      ('lo-engine-oil',  '27101990', 'Engine Oil'),
      ('lo-brake-fluid', '38190090', 'Brake Fluid'),
      ('lo-transmission','27101990', 'Transmission Oil'),
      ('lo-greases',     '27101990', 'Greases'),
      ('lubricants-oils','27101990', 'Lubricants & Oils')
    ON CONFLICT (category_slug) DO UPDATE SET hsn_code = EXCLUDED.hsn_code;
  END IF;

  -- Safety Equipment
  SELECT id INTO _parent_id FROM categories WHERE slug = 'safety-equipment' LIMIT 1;
  IF _parent_id IS NOT NULL THEN
    INSERT INTO categories (name, slug, parent_id, level, display_order, is_active) VALUES
      ('Helmets',        'se-helmets',    _parent_id, 3, 1, true),
      ('Safety Shoes',   'se-shoes',      _parent_id, 3, 2, true),
      ('First Aid Kits', 'se-first-aid',  _parent_id, 3, 3, true),
      ('Fire Extinguishers','se-fire-ext',_parent_id, 3, 4, true)
    ON CONFLICT (slug) DO NOTHING;
    INSERT INTO category_hsn_codes (category_slug, hsn_code, description) VALUES
      ('se-helmets',  '65061090', 'Helmets'),
      ('se-shoes',    '64039990', 'Safety Shoes'),
      ('se-first-aid','30069100', 'First Aid Kits'),
      ('se-fire-ext', '84241000', 'Fire Extinguishers'),
      ('safety-equipment','65061090','Safety Equipment')
    ON CONFLICT (category_slug) DO UPDATE SET hsn_code = EXCLUDED.hsn_code;
  END IF;

  -- Spare Parts
  SELECT id INTO _parent_id FROM categories WHERE slug = 'spare-parts' LIMIT 1;
  IF _parent_id IS NOT NULL THEN
    INSERT INTO categories (name, slug, parent_id, level, display_order, is_active) VALUES
      ('Brake Pads',     'sp-brake-pads', _parent_id, 3, 1, true),
      ('Air Filters',    'sp-air-filters',_parent_id, 3, 2, true),
      ('Oil Filters',    'sp-oil-filters',_parent_id, 3, 3, true),
      ('Spark Plugs',    'sp-spark-plugs',_parent_id, 3, 4, true),
      ('Batteries',      'sp-batteries',  _parent_id, 3, 5, true)
    ON CONFLICT (slug) DO NOTHING;
    INSERT INTO category_hsn_codes (category_slug, hsn_code, description) VALUES
      ('sp-brake-pads', '68132090', 'Brake Pads'),
      ('sp-air-filters','84219990', 'Air Filters'),
      ('sp-oil-filters','84212300', 'Oil Filters'),
      ('sp-spark-plugs','85111000', 'Spark Plugs'),
      ('sp-batteries',  '85071000', 'Batteries'),
      ('spare-parts',   '87089900', 'Spare Parts')
    ON CONFLICT (category_slug) DO UPDATE SET hsn_code = EXCLUDED.hsn_code;
  END IF;

  -- Tools & Equipment
  SELECT id INTO _parent_id FROM categories WHERE slug = 'tools-equipment' LIMIT 1;
  IF _parent_id IS NOT NULL THEN
    INSERT INTO categories (name, slug, parent_id, level, display_order, is_active) VALUES
      ('Power Drills',    'te-drills',      _parent_id, 3, 1, true),
      ('Screwdrivers',    'te-screwdrivers',_parent_id, 3, 2, true),
      ('Wrenches',        'te-wrenches',    _parent_id, 3, 3, true),
      ('Measuring Tapes', 'te-measuring',   _parent_id, 3, 4, true)
    ON CONFLICT (slug) DO NOTHING;
    INSERT INTO category_hsn_codes (category_slug, hsn_code, description) VALUES
      ('te-drills',      '84672100', 'Power Drills'),
      ('te-screwdrivers','82055990', 'Screwdrivers'),
      ('te-wrenches',    '82041200', 'Wrenches'),
      ('te-measuring',   '90173000', 'Measuring Tapes'),
      ('tools-equipment','82055990', 'Tools & Equipment')
    ON CONFLICT (category_slug) DO UPDATE SET hsn_code = EXCLUDED.hsn_code;
  END IF;

  -- =====================  JEWELLERY & LUXURY  =====================

  -- Fine Jewellery (Gold, Diamond)
  SELECT id INTO _parent_id FROM categories WHERE slug = 'fine-jewellery-gold-diamond-' LIMIT 1;
  IF _parent_id IS NOT NULL THEN
    INSERT INTO categories (name, slug, parent_id, level, display_order, is_active) VALUES
      ('Gold Necklaces',   'fjgd-gold-necklaces', _parent_id, 3, 1, true),
      ('Gold Rings',       'fjgd-gold-rings',     _parent_id, 3, 2, true),
      ('Diamond Rings',    'fjgd-diamond-rings',  _parent_id, 3, 3, true),
      ('Gold Earrings',    'fjgd-gold-earrings',  _parent_id, 3, 4, true),
      ('Gold Bangles',     'fjgd-gold-bangles',   _parent_id, 3, 5, true)
    ON CONFLICT (slug) DO NOTHING;
    INSERT INTO category_hsn_codes (category_slug, hsn_code, description) VALUES
      ('fjgd-gold-necklaces','71131190', 'Gold Necklaces'),
      ('fjgd-gold-rings',    '71131190', 'Gold Rings'),
      ('fjgd-diamond-rings', '71131990', 'Diamond Rings'),
      ('fjgd-gold-earrings', '71131190', 'Gold Earrings'),
      ('fjgd-gold-bangles',  '71131190', 'Gold Bangles'),
      ('fine-jewellery-gold-diamond-','71131190','Fine Jewellery (Gold, Diamond)')
    ON CONFLICT (category_slug) DO UPDATE SET hsn_code = EXCLUDED.hsn_code;
  END IF;

  -- Gift Jewellery
  SELECT id INTO _parent_id FROM categories WHERE slug = 'gift-jewellery' LIMIT 1;
  IF _parent_id IS NOT NULL THEN
    INSERT INTO categories (name, slug, parent_id, level, display_order, is_active) VALUES
      ('Gift Sets',      'gj-gift-sets',   _parent_id, 3, 1, true),
      ('Charm Bracelets','gj-charm',       _parent_id, 3, 2, true),
      ('Pendant Sets',   'gj-pendants',    _parent_id, 3, 3, true),
      ('Couple Rings',   'gj-couple-rings',_parent_id, 3, 4, true)
    ON CONFLICT (slug) DO NOTHING;
    INSERT INTO category_hsn_codes (category_slug, hsn_code, description) VALUES
      ('gj-gift-sets',   '71171900', 'Gift Sets'),
      ('gj-charm',       '71171900', 'Charm Bracelets'),
      ('gj-pendants',    '71171900', 'Pendant Sets'),
      ('gj-couple-rings','71171900', 'Couple Rings'),
      ('gift-jewellery', '71171900', 'Gift Jewellery')
    ON CONFLICT (category_slug) DO UPDATE SET hsn_code = EXCLUDED.hsn_code;
  END IF;

  -- Luxury Watches
  SELECT id INTO _parent_id FROM categories WHERE slug = 'luxury-watches' LIMIT 1;
  IF _parent_id IS NOT NULL THEN
    INSERT INTO categories (name, slug, parent_id, level, display_order, is_active) VALUES
      ('Swiss Watches',     'lw-swiss',      _parent_id, 3, 1, true),
      ('Automatic Watches', 'lw-automatic',  _parent_id, 3, 2, true),
      ('Luxury Smartwatches','lw-smartwatch',_parent_id, 3, 3, true),
      ('Limited Editions',  'lw-limited',    _parent_id, 3, 4, true)
    ON CONFLICT (slug) DO NOTHING;
    INSERT INTO category_hsn_codes (category_slug, hsn_code, description) VALUES
      ('lw-swiss',     '91011100', 'Swiss Watches'),
      ('lw-automatic', '91011900', 'Automatic Watches'),
      ('lw-smartwatch','91021200', 'Luxury Smartwatches'),
      ('lw-limited',   '91011100', 'Limited Edition Watches'),
      ('luxury-watches','91011100','Luxury Watches')
    ON CONFLICT (category_slug) DO UPDATE SET hsn_code = EXCLUDED.hsn_code;
  END IF;

  -- Precious Stones
  SELECT id INTO _parent_id FROM categories WHERE slug = 'precious-stones' LIMIT 1;
  IF _parent_id IS NOT NULL THEN
    INSERT INTO categories (name, slug, parent_id, level, display_order, is_active) VALUES
      ('Diamonds',     'ps-diamonds',   _parent_id, 3, 1, true),
      ('Rubies',       'ps-rubies',     _parent_id, 3, 2, true),
      ('Emeralds',     'ps-emeralds',   _parent_id, 3, 3, true),
      ('Sapphires',    'ps-sapphires',  _parent_id, 3, 4, true)
    ON CONFLICT (slug) DO NOTHING;
    INSERT INTO category_hsn_codes (category_slug, hsn_code, description) VALUES
      ('ps-diamonds',  '71023100', 'Diamonds'),
      ('ps-rubies',    '71031010', 'Rubies'),
      ('ps-emeralds',  '71031020', 'Emeralds'),
      ('ps-sapphires', '71031090', 'Sapphires'),
      ('precious-stones','71023100','Precious Stones')
    ON CONFLICT (category_slug) DO UPDATE SET hsn_code = EXCLUDED.hsn_code;
  END IF;

  -- Silver Jewellery
  SELECT id INTO _parent_id FROM categories WHERE slug = 'silver-jewellery' LIMIT 1;
  IF _parent_id IS NOT NULL THEN
    INSERT INTO categories (name, slug, parent_id, level, display_order, is_active) VALUES
      ('Silver Rings',     'sj-rings',     _parent_id, 3, 1, true),
      ('Silver Chains',    'sj-chains',    _parent_id, 3, 2, true),
      ('Silver Bracelets', 'sj-bracelets', _parent_id, 3, 3, true),
      ('Silver Anklets',   'sj-anklets',   _parent_id, 3, 4, true)
    ON CONFLICT (slug) DO NOTHING;
    INSERT INTO category_hsn_codes (category_slug, hsn_code, description) VALUES
      ('sj-rings',    '71141190', 'Silver Rings'),
      ('sj-chains',   '71141190', 'Silver Chains'),
      ('sj-bracelets','71141190', 'Silver Bracelets'),
      ('sj-anklets',  '71141190', 'Silver Anklets'),
      ('silver-jewellery','71141190','Silver Jewellery')
    ON CONFLICT (category_slug) DO UPDATE SET hsn_code = EXCLUDED.hsn_code;
  END IF;

  -- =====================  BOOKS  =====================

  -- Academic & Textbooks
  SELECT id INTO _parent_id FROM categories WHERE slug = 'academic-textbooks' LIMIT 1;
  IF _parent_id IS NOT NULL THEN
    INSERT INTO categories (name, slug, parent_id, level, display_order, is_active) VALUES
      ('School Textbooks',    'at-school',    _parent_id, 3, 1, true),
      ('College Textbooks',   'at-college',   _parent_id, 3, 2, true),
      ('Reference Books',     'at-reference', _parent_id, 3, 3, true),
      ('Study Guides',        'at-guides',    _parent_id, 3, 4, true)
    ON CONFLICT (slug) DO NOTHING;
    INSERT INTO category_hsn_codes (category_slug, hsn_code, description) VALUES
      ('at-school',   '49019900', 'School Textbooks'),
      ('at-college',  '49019900', 'College Textbooks'),
      ('at-reference','49019900', 'Reference Books'),
      ('at-guides',   '49019900', 'Study Guides'),
      ('academic-textbooks','49019900','Academic & Textbooks')
    ON CONFLICT (category_slug) DO UPDATE SET hsn_code = EXCLUDED.hsn_code;
  END IF;

  -- Comics & Manga
  SELECT id INTO _parent_id FROM categories WHERE slug = 'comics-manga' LIMIT 1;
  IF _parent_id IS NOT NULL THEN
    INSERT INTO categories (name, slug, parent_id, level, display_order, is_active) VALUES
      ('Manga',         'cm-manga',   _parent_id, 3, 1, true),
      ('Graphic Novels','cm-graphic', _parent_id, 3, 2, true),
      ('Superhero Comics','cm-superhero',_parent_id, 3, 3, true),
      ('Indie Comics',  'cm-indie',   _parent_id, 3, 4, true)
    ON CONFLICT (slug) DO NOTHING;
    INSERT INTO category_hsn_codes (category_slug, hsn_code, description) VALUES
      ('cm-manga',    '49011010', 'Manga'),
      ('cm-graphic',  '49011010', 'Graphic Novels'),
      ('cm-superhero','49011010', 'Superhero Comics'),
      ('cm-indie',    '49011010', 'Indie Comics'),
      ('comics-manga','49011010', 'Comics & Manga')
    ON CONFLICT (category_slug) DO UPDATE SET hsn_code = EXCLUDED.hsn_code;
  END IF;

  -- Competitive Exam Prep
  SELECT id INTO _parent_id FROM categories WHERE slug = 'competitive-exam-prep' LIMIT 1;
  IF _parent_id IS NOT NULL THEN
    INSERT INTO categories (name, slug, parent_id, level, display_order, is_active) VALUES
      ('UPSC Books',    'cep-upsc',   _parent_id, 3, 1, true),
      ('SSC Books',     'cep-ssc',    _parent_id, 3, 2, true),
      ('Bank Exam Books','cep-bank',  _parent_id, 3, 3, true),
      ('JEE/NEET Books','cep-jee',    _parent_id, 3, 4, true)
    ON CONFLICT (slug) DO NOTHING;
    INSERT INTO category_hsn_codes (category_slug, hsn_code, description) VALUES
      ('cep-upsc', '49019900', 'UPSC Books'),
      ('cep-ssc',  '49019900', 'SSC Books'),
      ('cep-bank', '49019900', 'Bank Exam Books'),
      ('cep-jee',  '49019900', 'JEE/NEET Books'),
      ('competitive-exam-prep','49019900','Competitive Exam Prep')
    ON CONFLICT (category_slug) DO UPDATE SET hsn_code = EXCLUDED.hsn_code;
  END IF;

  -- E-Books
  SELECT id INTO _parent_id FROM categories WHERE slug = 'e-books' LIMIT 1;
  IF _parent_id IS NOT NULL THEN
    INSERT INTO categories (name, slug, parent_id, level, display_order, is_active) VALUES
      ('Fiction E-Books',     'eb-fiction',     _parent_id, 3, 1, true),
      ('Non-Fiction E-Books', 'eb-non-fiction', _parent_id, 3, 2, true),
      ('Academic E-Books',    'eb-academic',    _parent_id, 3, 3, true),
      ('Self-Help E-Books',   'eb-self-help',   _parent_id, 3, 4, true)
    ON CONFLICT (slug) DO NOTHING;
    INSERT INTO category_hsn_codes (category_slug, hsn_code, description) VALUES
      ('eb-fiction',    '49019900', 'Fiction E-Books'),
      ('eb-non-fiction','49019900', 'Non-Fiction E-Books'),
      ('eb-academic',  '49019900', 'Academic E-Books'),
      ('eb-self-help', '49019900', 'Self-Help E-Books'),
      ('e-books',      '49019900', 'E-Books')
    ON CONFLICT (category_slug) DO UPDATE SET hsn_code = EXCLUDED.hsn_code;
  END IF;

  -- Fiction
  SELECT id INTO _parent_id FROM categories WHERE slug = 'fiction' AND level = 2 LIMIT 1;
  IF _parent_id IS NOT NULL THEN
    INSERT INTO categories (name, slug, parent_id, level, display_order, is_active) VALUES
      ('Fantasy',      'fic-fantasy',    _parent_id, 3, 1, true),
      ('Thriller',     'fic-thriller',   _parent_id, 3, 2, true),
      ('Romance',      'fic-romance',    _parent_id, 3, 3, true),
      ('Science Fiction','fic-scifi',    _parent_id, 3, 4, true)
    ON CONFLICT (slug) DO NOTHING;
    INSERT INTO category_hsn_codes (category_slug, hsn_code, description) VALUES
      ('fic-fantasy', '49011010', 'Fantasy Books'),
      ('fic-thriller','49011010', 'Thriller Books'),
      ('fic-romance', '49011010', 'Romance Books'),
      ('fic-scifi',   '49011010', 'Science Fiction Books')
    ON CONFLICT (category_slug) DO UPDATE SET hsn_code = EXCLUDED.hsn_code;
  END IF;

  -- Non-Fiction
  SELECT id INTO _parent_id FROM categories WHERE slug = 'non-fiction' AND level = 2 LIMIT 1;
  IF _parent_id IS NOT NULL THEN
    INSERT INTO categories (name, slug, parent_id, level, display_order, is_active) VALUES
      ('Biography',       'nf-biography',   _parent_id, 3, 1, true),
      ('Self-Help',       'nf-self-help',   _parent_id, 3, 2, true),
      ('Business & Finance','nf-business',  _parent_id, 3, 3, true),
      ('History',         'nf-history',     _parent_id, 3, 4, true)
    ON CONFLICT (slug) DO NOTHING;
    INSERT INTO category_hsn_codes (category_slug, hsn_code, description) VALUES
      ('nf-biography','49011010', 'Biography'),
      ('nf-self-help','49011010', 'Self-Help Books'),
      ('nf-business', '49011010', 'Business & Finance Books'),
      ('nf-history',  '49011010', 'History Books')
    ON CONFLICT (category_slug) DO UPDATE SET hsn_code = EXCLUDED.hsn_code;
  END IF;

  -- =====================  SOFTWARE & DIGITAL PRODUCTS  =====================

  -- Design Templates
  SELECT id INTO _parent_id FROM categories WHERE slug = 'design-templates' LIMIT 1;
  IF _parent_id IS NOT NULL THEN
    INSERT INTO categories (name, slug, parent_id, level, display_order, is_active) VALUES
      ('Website Templates',  'dt-website',   _parent_id, 3, 1, true),
      ('Logo Templates',     'dt-logo',      _parent_id, 3, 2, true),
      ('Presentation Templates','dt-ppt',    _parent_id, 3, 3, true),
      ('Social Media Templates','dt-social', _parent_id, 3, 4, true)
    ON CONFLICT (slug) DO NOTHING;
    INSERT INTO category_hsn_codes (category_slug, hsn_code, description) VALUES
      ('dt-website', '85234990', 'Website Templates'),
      ('dt-logo',    '85234990', 'Logo Templates'),
      ('dt-ppt',     '85234990', 'Presentation Templates'),
      ('dt-social',  '85234990', 'Social Media Templates'),
      ('design-templates','85234990','Design Templates')
    ON CONFLICT (category_slug) DO UPDATE SET hsn_code = EXCLUDED.hsn_code;
  END IF;

  -- Digital Subscriptions
  SELECT id INTO _parent_id FROM categories WHERE slug = 'digital-subscriptions' LIMIT 1;
  IF _parent_id IS NOT NULL THEN
    INSERT INTO categories (name, slug, parent_id, level, display_order, is_active) VALUES
      ('Streaming Services',  'ds-streaming',  _parent_id, 3, 1, true),
      ('Music Subscriptions', 'ds-music',      _parent_id, 3, 2, true),
      ('Cloud Storage',       'ds-cloud',      _parent_id, 3, 3, true),
      ('News & Magazines',    'ds-news',       _parent_id, 3, 4, true)
    ON CONFLICT (slug) DO NOTHING;
    INSERT INTO category_hsn_codes (category_slug, hsn_code, description) VALUES
      ('ds-streaming','85234990', 'Streaming Services'),
      ('ds-music',    '85234990', 'Music Subscriptions'),
      ('ds-cloud',    '85234990', 'Cloud Storage'),
      ('ds-news',     '49019900', 'News & Magazines'),
      ('digital-subscriptions','85234990','Digital Subscriptions')
    ON CONFLICT (category_slug) DO UPDATE SET hsn_code = EXCLUDED.hsn_code;
  END IF;

  -- Game Codes
  SELECT id INTO _parent_id FROM categories WHERE slug = 'game-codes' LIMIT 1;
  IF _parent_id IS NOT NULL THEN
    INSERT INTO categories (name, slug, parent_id, level, display_order, is_active) VALUES
      ('PC Game Codes',      'gc-pc',         _parent_id, 3, 1, true),
      ('Console Game Codes', 'gc-console',    _parent_id, 3, 2, true),
      ('In-Game Currency',   'gc-currency',   _parent_id, 3, 3, true),
      ('Gift Cards',         'gc-gift-cards', _parent_id, 3, 4, true)
    ON CONFLICT (slug) DO NOTHING;
    INSERT INTO category_hsn_codes (category_slug, hsn_code, description) VALUES
      ('gc-pc',        '85234990', 'PC Game Codes'),
      ('gc-console',   '85234990', 'Console Game Codes'),
      ('gc-currency',  '85234990', 'In-Game Currency'),
      ('gc-gift-cards','49070030', 'Gift Cards'),
      ('game-codes',   '85234990', 'Game Codes')
    ON CONFLICT (category_slug) DO UPDATE SET hsn_code = EXCLUDED.hsn_code;
  END IF;

  -- Online Courses
  SELECT id INTO _parent_id FROM categories WHERE slug = 'online-courses' LIMIT 1;
  IF _parent_id IS NOT NULL THEN
    INSERT INTO categories (name, slug, parent_id, level, display_order, is_active) VALUES
      ('Programming Courses',  'oc-programming', _parent_id, 3, 1, true),
      ('Business Courses',     'oc-business',    _parent_id, 3, 2, true),
      ('Language Courses',     'oc-language',    _parent_id, 3, 3, true),
      ('Design Courses',       'oc-design',      _parent_id, 3, 4, true)
    ON CONFLICT (slug) DO NOTHING;
    INSERT INTO category_hsn_codes (category_slug, hsn_code, description) VALUES
      ('oc-programming','85234990', 'Programming Courses'),
      ('oc-business',   '85234990', 'Business Courses'),
      ('oc-language',   '85234990', 'Language Courses'),
      ('oc-design',     '85234990', 'Design Courses'),
      ('online-courses','85234990', 'Online Courses')
    ON CONFLICT (category_slug) DO UPDATE SET hsn_code = EXCLUDED.hsn_code;
  END IF;

  -- Software Licenses
  SELECT id INTO _parent_id FROM categories WHERE slug = 'software-licenses' LIMIT 1;
  IF _parent_id IS NOT NULL THEN
    INSERT INTO categories (name, slug, parent_id, level, display_order, is_active) VALUES
      ('Antivirus',          'sl-antivirus',  _parent_id, 3, 1, true),
      ('Office Suite',       'sl-office',     _parent_id, 3, 2, true),
      ('Operating Systems',  'sl-os',         _parent_id, 3, 3, true),
      ('Creative Software',  'sl-creative',   _parent_id, 3, 4, true)
    ON CONFLICT (slug) DO NOTHING;
    INSERT INTO category_hsn_codes (category_slug, hsn_code, description) VALUES
      ('sl-antivirus','85234990', 'Antivirus Software'),
      ('sl-office',   '85234990', 'Office Suite'),
      ('sl-os',       '85234990', 'Operating Systems'),
      ('sl-creative', '85234990', 'Creative Software'),
      ('software-licenses','85234990','Software Licenses')
    ON CONFLICT (category_slug) DO UPDATE SET hsn_code = EXCLUDED.hsn_code;
  END IF;

  -- =====================  DONE  =====================
  RAISE NOTICE 'All Level-3 categories and 8-digit HSN codes inserted successfully.';
END $$;
