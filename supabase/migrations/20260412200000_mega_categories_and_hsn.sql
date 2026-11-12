-- ============================================================
-- MEGA MIGRATION: Fix 170000 orphans + add all missing categories
-- Creates: 7 new L1, 55+ L2, 350+ L3, all HSN codes
-- Fixes: 61 broken parent lookups from 170000 migration
-- ============================================================

DO $$
DECLARE
  _l1 UUID;
  _l2 UUID;
BEGIN

  -- ════════════════════════════════════════════════════════════
  -- PART 1: NEW L1 CATEGORIES
  -- ════════════════════════════════════════════════════════════

  INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
  VALUES ('Office Supplies & Stationery', 'office-supplies-stationery', NULL, 1, 15, true)
  ON CONFLICT (slug) DO NOTHING;

  INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
  VALUES ('Garden & Outdoor Living', 'garden-outdoor-living', NULL, 1, 16, true)
  ON CONFLICT (slug) DO NOTHING;

  INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
  VALUES ('Musical Instruments', 'musical-instruments', NULL, 1, 17, true)
  ON CONFLICT (slug) DO NOTHING;

  INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
  VALUES ('Jewellery & Luxury', 'jewellery-luxury', NULL, 1, 18, true)
  ON CONFLICT (slug) DO NOTHING;

  INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
  VALUES ('Software & Digital Products', 'software-digital-products', NULL, 1, 19, true)
  ON CONFLICT (slug) DO NOTHING;

  INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
  VALUES ('Travel & Luggage', 'travel-luggage', NULL, 1, 20, true)
  ON CONFLICT (slug) DO NOTHING;

  INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
  VALUES ('Home Appliances', 'home-appliances', NULL, 1, 21, true)
  ON CONFLICT (slug) DO NOTHING;

  -- ════════════════════════════════════════════════════════════
  -- PART 2: L2 + L3 UNDER NEW L1 CATEGORIES
  -- ════════════════════════════════════════════════════════════

  -- ═══ office-supplies-stationery ═══
  SELECT id INTO _l1 FROM public.categories WHERE slug = 'office-supplies-stationery' AND level = 1 LIMIT 1;
  IF _l1 IS NOT NULL THEN
    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES ('Writing Instruments', 'writing-instruments', _l1, 2, 1, true)
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO _l2 FROM public.categories WHERE slug = 'writing-instruments' LIMIT 1;
    IF _l2 IS NOT NULL THEN
      INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
        ('Ball Pens', 'ball-pens', _l2, 3, 1, true),
        ('Gel Pens', 'gel-pens', _l2, 3, 2, true),
        ('Fountain Pens', 'fountain-pens', _l2, 3, 3, true),
        ('Roller Ball Pens', 'roller-ball-pens', _l2, 3, 4, true),
        ('Mechanical Pencils', 'mechanical-pencils', _l2, 3, 5, true),
        ('Graphite Pencils', 'graphite-pencils', _l2, 3, 6, true),
        ('Colour Pencils', 'colour-pencils', _l2, 3, 7, true),
        ('Markers & Highlighters', 'markers-highlighters', _l2, 3, 8, true),
        ('Whiteboard Markers', 'whiteboard-markers', _l2, 3, 9, true),
        ('Permanent Markers', 'permanent-markers', _l2, 3, 10, true),
        ('Sketch Pens', 'sketch-pens', _l2, 3, 11, true),
        ('Crayons', 'crayons', _l2, 3, 12, true),
        ('Erasers', 'erasers', _l2, 3, 13, true),
        ('Sharpeners', 'sharpeners', _l2, 3, 14, true),
        ('Correction Fluid / Tape', 'correction-fluid', _l2, 3, 15, true),
        ('Refills & Cartridges', 'pen-refills', _l2, 3, 16, true)
      ON CONFLICT (slug) DO NOTHING;
    END IF;

    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES ('Paper & Notebooks', 'paper-notebooks', _l1, 2, 2, true)
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO _l2 FROM public.categories WHERE slug = 'paper-notebooks' LIMIT 1;
    IF _l2 IS NOT NULL THEN
      INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
        ('Notebooks & Journals', 'notebooks-journals', _l2, 3, 1, true),
        ('Spiral Notebooks', 'spiral-notebooks', _l2, 3, 2, true),
        ('Ruled Sheets & Loose Leaves', 'ruled-sheets', _l2, 3, 3, true),
        ('Sticky Notes', 'sticky-notes', _l2, 3, 4, true),
        ('Printer Paper (A4/Letter)', 'printer-paper', _l2, 3, 5, true),
        ('Graph Paper', 'graph-paper', _l2, 3, 6, true),
        ('Drawing Sheets', 'drawing-sheets', _l2, 3, 7, true),
        ('Envelopes', 'envelopes', _l2, 3, 8, true)
      ON CONFLICT (slug) DO NOTHING;
    END IF;

    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES ('Desk Accessories', 'desk-accessories', _l1, 2, 3, true)
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO _l2 FROM public.categories WHERE slug = 'desk-accessories' LIMIT 1;
    IF _l2 IS NOT NULL THEN
      INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
        ('Pen Stands & Holders', 'pen-stands', _l2, 3, 1, true),
        ('Desk Organisers', 'desk-organisers', _l2, 3, 2, true),
        ('Paper Clips', 'paper-clips', _l2, 3, 3, true),
        ('Staplers', 'staplers', _l2, 3, 4, true),
        ('Staple Pins', 'staple-pins', _l2, 3, 5, true),
        ('Tape Dispensers', 'tape-dispensers', _l2, 3, 6, true),
        ('Adhesive Tape (Office)', 'adhesive-tape-office', _l2, 3, 7, true),
        ('Scissors (Office)', 'scissors-office', _l2, 3, 8, true),
        ('Rubber Bands', 'rubber-bands', _l2, 3, 9, true),
        ('Push Pins & Thumbtacks', 'push-pins', _l2, 3, 10, true),
        ('Letter Openers', 'letter-openers', _l2, 3, 11, true),
        ('Stamp Pads & Ink', 'stamp-pads', _l2, 3, 12, true)
      ON CONFLICT (slug) DO NOTHING;
    END IF;

    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES ('Filing & Organization', 'filing-organization', _l1, 2, 4, true)
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO _l2 FROM public.categories WHERE slug = 'filing-organization' LIMIT 1;
    IF _l2 IS NOT NULL THEN
      INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
        ('File Folders', 'file-folders', _l2, 3, 1, true),
        ('Ring Binders', 'ring-binders', _l2, 3, 2, true),
        ('Document Wallets', 'document-wallets', _l2, 3, 3, true),
        ('Magazine Holders', 'magazine-holders', _l2, 3, 4, true),
        ('Filing Cabinets', 'filing-cabinets', _l2, 3, 5, true),
        ('Expanding Files', 'expanding-files', _l2, 3, 6, true),
        ('Clip Boards', 'clip-boards', _l2, 3, 7, true)
      ON CONFLICT (slug) DO NOTHING;
    END IF;

    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES ('Printers & Ink', 'printers-ink', _l1, 2, 5, true)
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO _l2 FROM public.categories WHERE slug = 'printers-ink' LIMIT 1;
    IF _l2 IS NOT NULL THEN
      INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
        ('Inkjet Printers', 'inkjet-printers', _l2, 3, 1, true),
        ('Laser Printers', 'laser-printers', _l2, 3, 2, true),
        ('Ink Cartridges', 'ink-cartridges', _l2, 3, 3, true),
        ('Toner Cartridges', 'toner-cartridges', _l2, 3, 4, true),
        ('Printer Paper Rolls', 'printer-paper-rolls', _l2, 3, 5, true),
        ('Label Printers', 'label-printers', _l2, 3, 6, true)
      ON CONFLICT (slug) DO NOTHING;
    END IF;

    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES ('Art & Craft Supplies', 'art-craft-supplies', _l1, 2, 6, true)
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO _l2 FROM public.categories WHERE slug = 'art-craft-supplies' LIMIT 1;
    IF _l2 IS NOT NULL THEN
      INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
        ('Acrylic Paints', 'acrylic-paints', _l2, 3, 1, true),
        ('Watercolour Paints', 'watercolour-paints', _l2, 3, 2, true),
        ('Oil Paints', 'oil-paints', _l2, 3, 3, true),
        ('Paint Brushes', 'paint-brushes', _l2, 3, 4, true),
        ('Canvas & Easels', 'canvas-easels', _l2, 3, 5, true),
        ('Sketch Pads', 'sketch-pads', _l2, 3, 6, true),
        ('Glue Sticks & Craft Glue', 'glue-sticks-craft', _l2, 3, 7, true),
        ('Craft Paper', 'craft-paper', _l2, 3, 8, true),
        ('Beading & Jewellery Making', 'beading-jewellery-making', _l2, 3, 9, true),
        ('Sewing & Embroidery Kits', 'sewing-embroidery', _l2, 3, 10, true)
      ON CONFLICT (slug) DO NOTHING;
    END IF;

  END IF;

  -- ═══ garden-outdoor-living ═══
  SELECT id INTO _l1 FROM public.categories WHERE slug = 'garden-outdoor-living' AND level = 1 LIMIT 1;
  IF _l1 IS NOT NULL THEN
    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES ('Garden Tools', 'garden-tools', _l1, 2, 1, true)
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO _l2 FROM public.categories WHERE slug = 'garden-tools' LIMIT 1;
    IF _l2 IS NOT NULL THEN
      INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
        ('Pruning Shears', 'pruning-shears', _l2, 3, 1, true),
        ('Garden Hoses', 'garden-hoses', _l2, 3, 2, true),
        ('Watering Cans', 'watering-cans', _l2, 3, 3, true),
        ('Spades & Shovels', 'spades-shovels', _l2, 3, 4, true),
        ('Lawn Mowers', 'lawn-mowers', _l2, 3, 5, true),
        ('Rakes', 'rakes', _l2, 3, 6, true)
      ON CONFLICT (slug) DO NOTHING;
    END IF;

    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES ('Plants & Seeds', 'plants-seeds', _l1, 2, 2, true)
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO _l2 FROM public.categories WHERE slug = 'plants-seeds' LIMIT 1;
    IF _l2 IS NOT NULL THEN
      INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
        ('Flower Seeds', 'flower-seeds', _l2, 3, 1, true),
        ('Vegetable Seeds', 'vegetable-seeds', _l2, 3, 2, true),
        ('Indoor Plants', 'indoor-plants', _l2, 3, 3, true),
        ('Pots & Planters', 'pots-planters', _l2, 3, 4, true),
        ('Fertilizers', 'fertilizers', _l2, 3, 5, true),
        ('Soil & Growing Media', 'soil-growing-media', _l2, 3, 6, true)
      ON CONFLICT (slug) DO NOTHING;
    END IF;

    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES ('Outdoor Furniture', 'outdoor-furniture', _l1, 2, 3, true)
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO _l2 FROM public.categories WHERE slug = 'outdoor-furniture' LIMIT 1;
    IF _l2 IS NOT NULL THEN
      INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
        ('Garden Chairs', 'garden-chairs', _l2, 3, 1, true),
        ('Garden Tables', 'garden-tables', _l2, 3, 2, true),
        ('Hammocks', 'hammocks', _l2, 3, 3, true),
        ('Outdoor Umbrellas', 'outdoor-umbrellas', _l2, 3, 4, true),
        ('BBQ Grills', 'bbq-grills', _l2, 3, 5, true),
        ('Fire Pits', 'fire-pits', _l2, 3, 6, true)
      ON CONFLICT (slug) DO NOTHING;
    END IF;

    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES ('Pest Control', 'pest-control-garden', _l1, 2, 4, true)
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO _l2 FROM public.categories WHERE slug = 'pest-control-garden' LIMIT 1;
    IF _l2 IS NOT NULL THEN
      INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
        ('Insecticides', 'insecticides-garden', _l2, 3, 1, true),
        ('Mosquito Repellents', 'mosquito-repellents', _l2, 3, 2, true),
        ('Rat Traps', 'rat-traps', _l2, 3, 3, true),
        ('Weed Killers', 'weed-killers', _l2, 3, 4, true)
      ON CONFLICT (slug) DO NOTHING;
    END IF;

  END IF;

  -- ═══ musical-instruments ═══
  SELECT id INTO _l1 FROM public.categories WHERE slug = 'musical-instruments' AND level = 1 LIMIT 1;
  IF _l1 IS NOT NULL THEN
    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES ('String Instruments', 'string-instruments', _l1, 2, 1, true)
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO _l2 FROM public.categories WHERE slug = 'string-instruments' LIMIT 1;
    IF _l2 IS NOT NULL THEN
      INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
        ('Acoustic Guitars', 'acoustic-guitars', _l2, 3, 1, true),
        ('Electric Guitars', 'electric-guitars', _l2, 3, 2, true),
        ('Ukuleles', 'ukuleles', _l2, 3, 3, true),
        ('Violins', 'violins', _l2, 3, 4, true),
        ('Guitar Strings & Picks', 'guitar-strings-picks', _l2, 3, 5, true)
      ON CONFLICT (slug) DO NOTHING;
    END IF;

    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES ('Keyboard Instruments', 'keyboard-instruments', _l1, 2, 2, true)
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO _l2 FROM public.categories WHERE slug = 'keyboard-instruments' LIMIT 1;
    IF _l2 IS NOT NULL THEN
      INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
        ('Digital Pianos', 'digital-pianos', _l2, 3, 1, true),
        ('Synthesizers', 'synthesizers', _l2, 3, 2, true),
        ('MIDI Controllers', 'midi-controllers', _l2, 3, 3, true),
        ('Keyboard Stands', 'keyboard-stands', _l2, 3, 4, true)
      ON CONFLICT (slug) DO NOTHING;
    END IF;

    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES ('Percussion', 'percussion', _l1, 2, 3, true)
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO _l2 FROM public.categories WHERE slug = 'percussion' LIMIT 1;
    IF _l2 IS NOT NULL THEN
      INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
        ('Drum Kits', 'drum-kits', _l2, 3, 1, true),
        ('Electronic Drums', 'electronic-drums', _l2, 3, 2, true),
        ('Tablas', 'tablas', _l2, 3, 3, true),
        ('Cajons', 'cajons', _l2, 3, 4, true),
        ('Cymbals', 'cymbals', _l2, 3, 5, true)
      ON CONFLICT (slug) DO NOTHING;
    END IF;

    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES ('Wind Instruments', 'wind-instruments', _l1, 2, 4, true)
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO _l2 FROM public.categories WHERE slug = 'wind-instruments' LIMIT 1;
    IF _l2 IS NOT NULL THEN
      INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
        ('Flutes', 'flutes', _l2, 3, 1, true),
        ('Harmonicas', 'harmonicas', _l2, 3, 2, true),
        ('Saxophones', 'saxophones', _l2, 3, 3, true),
        ('Trumpets', 'trumpets', _l2, 3, 4, true)
      ON CONFLICT (slug) DO NOTHING;
    END IF;

    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES ('DJ & Recording Equipment', 'dj-recording', _l1, 2, 5, true)
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO _l2 FROM public.categories WHERE slug = 'dj-recording' LIMIT 1;
    IF _l2 IS NOT NULL THEN
      INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
        ('DJ Controllers', 'dj-controllers', _l2, 3, 1, true),
        ('Audio Interfaces', 'audio-interfaces', _l2, 3, 2, true),
        ('Studio Microphones', 'studio-microphones', _l2, 3, 3, true),
        ('Mixers', 'mixers-audio', _l2, 3, 4, true),
        ('Studio Monitors', 'studio-monitors', _l2, 3, 5, true)
      ON CONFLICT (slug) DO NOTHING;
    END IF;

  END IF;

  -- ═══ jewellery-luxury ═══
  SELECT id INTO _l1 FROM public.categories WHERE slug = 'jewellery-luxury' AND level = 1 LIMIT 1;
  IF _l1 IS NOT NULL THEN
    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES ('Fine Jewellery (Gold, Diamond)', 'fine-jewellery-gold-diamond', _l1, 2, 1, true)
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO _l2 FROM public.categories WHERE slug = 'fine-jewellery-gold-diamond' LIMIT 1;
    IF _l2 IS NOT NULL THEN
      INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
        ('Gold Necklaces', 'fjgd-gold-necklaces', _l2, 3, 1, true),
        ('Gold Rings', 'fjgd-gold-rings', _l2, 3, 2, true),
        ('Diamond Rings', 'fjgd-diamond-rings', _l2, 3, 3, true),
        ('Gold Earrings', 'fjgd-gold-earrings', _l2, 3, 4, true),
        ('Gold Bangles', 'fjgd-gold-bangles', _l2, 3, 5, true),
        ('Platinum Jewellery', 'fjgd-platinum', _l2, 3, 6, true),
        ('Gold Chains', 'fjgd-gold-chains', _l2, 3, 7, true)
      ON CONFLICT (slug) DO NOTHING;
    END IF;

    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES ('Silver Jewellery', 'silver-jewellery', _l1, 2, 2, true)
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO _l2 FROM public.categories WHERE slug = 'silver-jewellery' LIMIT 1;
    IF _l2 IS NOT NULL THEN
      INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
        ('Silver Rings', 'sj-rings', _l2, 3, 1, true),
        ('Silver Chains', 'sj-chains', _l2, 3, 2, true),
        ('Silver Bracelets', 'sj-bracelets', _l2, 3, 3, true),
        ('Silver Anklets', 'sj-anklets', _l2, 3, 4, true),
        ('Silver Earrings', 'sj-earrings', _l2, 3, 5, true),
        ('Silver Coins', 'sj-coins', _l2, 3, 6, true)
      ON CONFLICT (slug) DO NOTHING;
    END IF;

    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES ('Fashion Jewellery', 'fashion-jewellery-cat', _l1, 2, 3, true)
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO _l2 FROM public.categories WHERE slug = 'fashion-jewellery-cat' LIMIT 1;
    IF _l2 IS NOT NULL THEN
      INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
        ('Necklaces', 'fj-necklaces', _l2, 3, 1, true),
        ('Earrings', 'fj-earrings', _l2, 3, 2, true),
        ('Bracelets', 'fj-bracelets', _l2, 3, 3, true),
        ('Rings', 'fj-rings', _l2, 3, 4, true),
        ('Anklets', 'fj-anklets', _l2, 3, 5, true)
      ON CONFLICT (slug) DO NOTHING;
    END IF;

    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES ('Gift Jewellery', 'gift-jewellery', _l1, 2, 4, true)
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO _l2 FROM public.categories WHERE slug = 'gift-jewellery' LIMIT 1;
    IF _l2 IS NOT NULL THEN
      INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
        ('Gift Sets', 'gj-gift-sets', _l2, 3, 1, true),
        ('Charm Bracelets', 'gj-charm', _l2, 3, 2, true),
        ('Pendant Sets', 'gj-pendants', _l2, 3, 3, true),
        ('Couple Rings', 'gj-couple-rings', _l2, 3, 4, true)
      ON CONFLICT (slug) DO NOTHING;
    END IF;

    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES ('Luxury Watches', 'luxury-watches', _l1, 2, 5, true)
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO _l2 FROM public.categories WHERE slug = 'luxury-watches' LIMIT 1;
    IF _l2 IS NOT NULL THEN
      INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
        ('Swiss Watches', 'lw-swiss', _l2, 3, 1, true),
        ('Automatic Watches', 'lw-automatic', _l2, 3, 2, true),
        ('Luxury Smartwatches', 'lw-smartwatch', _l2, 3, 3, true),
        ('Limited Edition Watches', 'lw-limited', _l2, 3, 4, true)
      ON CONFLICT (slug) DO NOTHING;
    END IF;

    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES ('Precious Stones', 'precious-stones', _l1, 2, 6, true)
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO _l2 FROM public.categories WHERE slug = 'precious-stones' LIMIT 1;
    IF _l2 IS NOT NULL THEN
      INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
        ('Diamonds', 'ps-diamonds', _l2, 3, 1, true),
        ('Rubies', 'ps-rubies', _l2, 3, 2, true),
        ('Emeralds', 'ps-emeralds', _l2, 3, 3, true),
        ('Sapphires', 'ps-sapphires', _l2, 3, 4, true)
      ON CONFLICT (slug) DO NOTHING;
    END IF;

  END IF;

  -- ═══ software-digital-products ═══
  SELECT id INTO _l1 FROM public.categories WHERE slug = 'software-digital-products' AND level = 1 LIMIT 1;
  IF _l1 IS NOT NULL THEN
    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES ('Software Licenses', 'software-licenses', _l1, 2, 1, true)
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO _l2 FROM public.categories WHERE slug = 'software-licenses' LIMIT 1;
    IF _l2 IS NOT NULL THEN
      INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
        ('Antivirus', 'sl-antivirus', _l2, 3, 1, true),
        ('Office Suite', 'sl-office', _l2, 3, 2, true),
        ('Operating Systems', 'sl-os', _l2, 3, 3, true),
        ('Creative Software', 'sl-creative', _l2, 3, 4, true)
      ON CONFLICT (slug) DO NOTHING;
    END IF;

    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES ('Online Courses', 'online-courses', _l1, 2, 2, true)
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO _l2 FROM public.categories WHERE slug = 'online-courses' LIMIT 1;
    IF _l2 IS NOT NULL THEN
      INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
        ('Programming Courses', 'oc-programming', _l2, 3, 1, true),
        ('Business Courses', 'oc-business', _l2, 3, 2, true),
        ('Language Courses', 'oc-language', _l2, 3, 3, true),
        ('Design Courses', 'oc-design', _l2, 3, 4, true)
      ON CONFLICT (slug) DO NOTHING;
    END IF;

    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES ('Digital Subscriptions', 'digital-subscriptions', _l1, 2, 3, true)
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO _l2 FROM public.categories WHERE slug = 'digital-subscriptions' LIMIT 1;
    IF _l2 IS NOT NULL THEN
      INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
        ('Streaming Services', 'ds-streaming', _l2, 3, 1, true),
        ('Music Subscriptions', 'ds-music', _l2, 3, 2, true),
        ('Cloud Storage', 'ds-cloud', _l2, 3, 3, true),
        ('News & Magazines', 'ds-news', _l2, 3, 4, true)
      ON CONFLICT (slug) DO NOTHING;
    END IF;

    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES ('Game Codes & In-Game Currency', 'game-codes', _l1, 2, 4, true)
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO _l2 FROM public.categories WHERE slug = 'game-codes' LIMIT 1;
    IF _l2 IS NOT NULL THEN
      INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
        ('PC Game Codes', 'gc-pc', _l2, 3, 1, true),
        ('Console Game Codes', 'gc-console', _l2, 3, 2, true),
        ('In-Game Currency', 'gc-currency', _l2, 3, 3, true),
        ('Gift Cards', 'gc-gift-cards', _l2, 3, 4, true)
      ON CONFLICT (slug) DO NOTHING;
    END IF;

    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES ('Design Templates', 'design-templates', _l1, 2, 5, true)
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO _l2 FROM public.categories WHERE slug = 'design-templates' LIMIT 1;
    IF _l2 IS NOT NULL THEN
      INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
        ('Website Templates', 'dt-website', _l2, 3, 1, true),
        ('Logo Templates', 'dt-logo', _l2, 3, 2, true),
        ('Presentation Templates', 'dt-ppt', _l2, 3, 3, true),
        ('Social Media Templates', 'dt-social', _l2, 3, 4, true)
      ON CONFLICT (slug) DO NOTHING;
    END IF;

    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES ('E-Books', 'e-books', _l1, 2, 6, true)
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO _l2 FROM public.categories WHERE slug = 'e-books' LIMIT 1;
    IF _l2 IS NOT NULL THEN
      INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
        ('Fiction E-Books', 'eb-fiction', _l2, 3, 1, true),
        ('Non-Fiction E-Books', 'eb-non-fiction', _l2, 3, 2, true),
        ('Academic E-Books', 'eb-academic', _l2, 3, 3, true),
        ('Self-Help E-Books', 'eb-self-help', _l2, 3, 4, true)
      ON CONFLICT (slug) DO NOTHING;
    END IF;

  END IF;

  -- ═══ travel-luggage ═══
  SELECT id INTO _l1 FROM public.categories WHERE slug = 'travel-luggage' AND level = 1 LIMIT 1;
  IF _l1 IS NOT NULL THEN
    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES ('Suitcases & Trolley Bags', 'suitcases-trolley', _l1, 2, 1, true)
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO _l2 FROM public.categories WHERE slug = 'suitcases-trolley' LIMIT 1;
    IF _l2 IS NOT NULL THEN
      INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
        ('Cabin Luggage', 'tl-cabin', _l2, 3, 1, true),
        ('Check-In Luggage', 'tl-checkin', _l2, 3, 2, true),
        ('Luggage Sets', 'tl-sets', _l2, 3, 3, true),
        ('Hard-Shell Suitcases', 'tl-hardshell', _l2, 3, 4, true),
        ('Soft-Shell Suitcases', 'tl-softshell', _l2, 3, 5, true)
      ON CONFLICT (slug) DO NOTHING;
    END IF;

    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES ('Backpacks & Rucksacks', 'travel-backpacks', _l1, 2, 2, true)
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO _l2 FROM public.categories WHERE slug = 'travel-backpacks' LIMIT 1;
    IF _l2 IS NOT NULL THEN
      INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
        ('Travel Backpacks', 'tl-travel-bp', _l2, 3, 1, true),
        ('Hiking Backpacks', 'tl-hiking-bp', _l2, 3, 2, true),
        ('Laptop Backpacks', 'tl-laptop-bp', _l2, 3, 3, true),
        ('Anti-Theft Backpacks', 'tl-antitheft-bp', _l2, 3, 4, true)
      ON CONFLICT (slug) DO NOTHING;
    END IF;

    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES ('Duffel & Gym Bags', 'duffel-gym-bags', _l1, 2, 3, true)
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO _l2 FROM public.categories WHERE slug = 'duffel-gym-bags' LIMIT 1;
    IF _l2 IS NOT NULL THEN
      INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
        ('Duffel Bags', 'tl-duffel', _l2, 3, 1, true),
        ('Gym Bags', 'tl-gym', _l2, 3, 2, true),
        ('Garment Bags', 'tl-garment', _l2, 3, 3, true)
      ON CONFLICT (slug) DO NOTHING;
    END IF;

    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES ('Travel Accessories', 'travel-accessories-cat', _l1, 2, 4, true)
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO _l2 FROM public.categories WHERE slug = 'travel-accessories-cat' LIMIT 1;
    IF _l2 IS NOT NULL THEN
      INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
        ('Passport Holders', 'tl-passport', _l2, 3, 1, true),
        ('Neck Pillows', 'tl-neck-pillow', _l2, 3, 2, true),
        ('Luggage Tags', 'tl-tags', _l2, 3, 3, true),
        ('Travel Organizers', 'tl-organizers', _l2, 3, 4, true),
        ('Luggage Locks', 'tl-locks', _l2, 3, 5, true),
        ('Packing Cubes', 'tl-packing-cubes', _l2, 3, 6, true)
      ON CONFLICT (slug) DO NOTHING;
    END IF;

  END IF;

  -- ═══ home-appliances ═══
  SELECT id INTO _l1 FROM public.categories WHERE slug = 'home-appliances' AND level = 1 LIMIT 1;
  IF _l1 IS NOT NULL THEN
    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES ('Washing Machines', 'washing-machines', _l1, 2, 1, true)
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO _l2 FROM public.categories WHERE slug = 'washing-machines' LIMIT 1;
    IF _l2 IS NOT NULL THEN
      INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
        ('Front Load', 'ha-front-load', _l2, 3, 1, true),
        ('Top Load', 'ha-top-load', _l2, 3, 2, true),
        ('Semi-Automatic', 'ha-semi-auto', _l2, 3, 3, true),
        ('Washer Dryer Combo', 'ha-washer-dryer', _l2, 3, 4, true)
      ON CONFLICT (slug) DO NOTHING;
    END IF;

    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES ('Refrigerators', 'refrigerators', _l1, 2, 2, true)
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO _l2 FROM public.categories WHERE slug = 'refrigerators' LIMIT 1;
    IF _l2 IS NOT NULL THEN
      INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
        ('Single Door', 'ha-single-door', _l2, 3, 1, true),
        ('Double Door', 'ha-double-door', _l2, 3, 2, true),
        ('Side-by-Side', 'ha-side-by-side', _l2, 3, 3, true),
        ('Mini Fridge', 'ha-mini-fridge', _l2, 3, 4, true)
      ON CONFLICT (slug) DO NOTHING;
    END IF;

    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES ('Air Conditioners', 'air-conditioners', _l1, 2, 3, true)
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO _l2 FROM public.categories WHERE slug = 'air-conditioners' LIMIT 1;
    IF _l2 IS NOT NULL THEN
      INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
        ('Split ACs', 'ha-split-ac', _l2, 3, 1, true),
        ('Window ACs', 'ha-window-ac', _l2, 3, 2, true),
        ('Portable ACs', 'ha-portable-ac', _l2, 3, 3, true),
        ('Air Coolers', 'ha-air-coolers', _l2, 3, 4, true)
      ON CONFLICT (slug) DO NOTHING;
    END IF;

    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES ('Water Purifiers', 'water-purifiers', _l1, 2, 4, true)
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO _l2 FROM public.categories WHERE slug = 'water-purifiers' LIMIT 1;
    IF _l2 IS NOT NULL THEN
      INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
        ('RO Purifiers', 'ha-ro', _l2, 3, 1, true),
        ('UV Purifiers', 'ha-uv', _l2, 3, 2, true),
        ('Gravity Purifiers', 'ha-gravity', _l2, 3, 3, true),
        ('Water Filters', 'ha-filters', _l2, 3, 4, true)
      ON CONFLICT (slug) DO NOTHING;
    END IF;

    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES ('Fans & Ventilation', 'fans-ventilation', _l1, 2, 5, true)
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO _l2 FROM public.categories WHERE slug = 'fans-ventilation' LIMIT 1;
    IF _l2 IS NOT NULL THEN
      INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
        ('Ceiling Fans', 'ha-ceiling-fans', _l2, 3, 1, true),
        ('Table Fans', 'ha-table-fans', _l2, 3, 2, true),
        ('Exhaust Fans', 'ha-exhaust-fans', _l2, 3, 3, true),
        ('Tower Fans', 'ha-tower-fans', _l2, 3, 4, true)
      ON CONFLICT (slug) DO NOTHING;
    END IF;

    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES ('Vacuum Cleaners', 'vacuum-cleaners', _l1, 2, 6, true)
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO _l2 FROM public.categories WHERE slug = 'vacuum-cleaners' LIMIT 1;
    IF _l2 IS NOT NULL THEN
      INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
        ('Upright Vacuum', 'ha-upright', _l2, 3, 1, true),
        ('Robot Vacuum', 'ha-robot', _l2, 3, 2, true),
        ('Handheld Vacuum', 'ha-handheld', _l2, 3, 3, true),
        ('Wet & Dry Vacuum', 'ha-wet-dry', _l2, 3, 4, true)
      ON CONFLICT (slug) DO NOTHING;
    END IF;

  END IF;

  -- ════════════════════════════════════════════════════════════
  -- PART 3: MISSING L2 + L3 UNDER EXISTING L1 CATEGORIES
  -- ════════════════════════════════════════════════════════════

  -- ═══ electronics ═══
  SELECT id INTO _l1 FROM public.categories WHERE slug = 'electronics' AND level = 1 LIMIT 1;
  IF _l1 IS NOT NULL THEN
    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES ('Printers & Scanners', 'printers-scanners', _l1, 2, 9, true)
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO _l2 FROM public.categories WHERE slug = 'printers-scanners' LIMIT 1;
    IF _l2 IS NOT NULL THEN
      INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
        ('Inkjet Printers', 'el-inkjet', _l2, 3, 1, true),
        ('Laser Printers', 'el-laser', _l2, 3, 2, true),
        ('Scanners', 'el-scanners', _l2, 3, 3, true),
        ('3D Printers', 'el-3d-printers', _l2, 3, 4, true)
      ON CONFLICT (slug) DO NOTHING;
    END IF;

    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES ('Drones', 'drones', _l1, 2, 10, true)
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO _l2 FROM public.categories WHERE slug = 'drones' LIMIT 1;
    IF _l2 IS NOT NULL THEN
      INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
        ('Camera Drones', 'camera-drones', _l2, 3, 1, true),
        ('FPV Drones', 'fpv-drones', _l2, 3, 2, true),
        ('Drone Accessories', 'drone-accessories', _l2, 3, 3, true)
      ON CONFLICT (slug) DO NOTHING;
    END IF;

    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES ('Tablets', 'tablets-cat', _l1, 2, 11, true)
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO _l2 FROM public.categories WHERE slug = 'tablets-cat' LIMIT 1;
    IF _l2 IS NOT NULL THEN
      INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
        ('Android Tablets', 'tab-android', _l2, 3, 1, true),
        ('iPads', 'tab-ipads', _l2, 3, 2, true),
        ('Windows Tablets', 'tab-windows', _l2, 3, 3, true),
        ('E-Readers', 'tab-ereaders', _l2, 3, 4, true)
      ON CONFLICT (slug) DO NOTHING;
    END IF;

  END IF;

  -- ═══ fashion ═══
  SELECT id INTO _l1 FROM public.categories WHERE slug = 'fashion' AND level = 1 LIMIT 1;
  IF _l1 IS NOT NULL THEN
    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES ('Ethnic Wear - Men', 'mens-ethnic-wear', _l1, 2, 6, true)
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO _l2 FROM public.categories WHERE slug = 'mens-ethnic-wear' LIMIT 1;
    IF _l2 IS NOT NULL THEN
      INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
        ('Kurtas', 'mens-kurtas', _l2, 3, 1, true),
        ('Sherwanis', 'mens-sherwanis', _l2, 3, 2, true),
        ('Dhotis & Lungis', 'dhotis-lungis', _l2, 3, 3, true),
        ('Nehru Jackets', 'nehru-jackets', _l2, 3, 4, true)
      ON CONFLICT (slug) DO NOTHING;
    END IF;

    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES ('Ethnic Wear - Women', 'womens-ethnic-wear', _l1, 2, 7, true)
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO _l2 FROM public.categories WHERE slug = 'womens-ethnic-wear' LIMIT 1;
    IF _l2 IS NOT NULL THEN
      INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
        ('Sarees', 'sarees', _l2, 3, 1, true),
        ('Salwar Suits', 'salwar-suits', _l2, 3, 2, true),
        ('Lehengas', 'lehengas', _l2, 3, 3, true),
        ('Kurtis', 'kurtis', _l2, 3, 4, true),
        ('Dupattas', 'dupattas', _l2, 3, 5, true)
      ON CONFLICT (slug) DO NOTHING;
    END IF;

    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES ('Sportswear', 'sportswear', _l1, 2, 8, true)
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO _l2 FROM public.categories WHERE slug = 'sportswear' LIMIT 1;
    IF _l2 IS NOT NULL THEN
      INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
        ('Track Pants', 'track-pants', _l2, 3, 1, true),
        ('Sports Bras', 'sports-bras', _l2, 3, 2, true),
        ('Gym Shorts', 'gym-shorts', _l2, 3, 3, true),
        ('Compression Wear', 'compression-wear', _l2, 3, 4, true)
      ON CONFLICT (slug) DO NOTHING;
    END IF;

    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES ('Swimwear', 'swimwear', _l1, 2, 9, true)
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO _l2 FROM public.categories WHERE slug = 'swimwear' LIMIT 1;
    IF _l2 IS NOT NULL THEN
      INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
        ('Men''s Swimwear', 'mens-swimwear', _l2, 3, 1, true),
        ('Women''s Swimwear', 'womens-swimwear', _l2, 3, 2, true),
        ('Kids'' Swimwear', 'kids-swimwear', _l2, 3, 3, true)
      ON CONFLICT (slug) DO NOTHING;
    END IF;

    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES ('Bags & Luggage', 'bags-luggage', _l1, 2, 10, true)
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO _l2 FROM public.categories WHERE slug = 'bags-luggage' LIMIT 1;
    IF _l2 IS NOT NULL THEN
      INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
        ('Backpacks', 'bl-backpacks', _l2, 3, 1, true),
        ('Handbags', 'bl-handbags', _l2, 3, 2, true),
        ('Suitcases', 'bl-suitcases', _l2, 3, 3, true),
        ('Duffel Bags', 'bl-duffel-bags', _l2, 3, 4, true),
        ('Wallets', 'bl-wallets', _l2, 3, 5, true)
      ON CONFLICT (slug) DO NOTHING;
    END IF;

    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES ('Sunglasses & Eyewear', 'sunglasses-accessories', _l1, 2, 11, true)
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO _l2 FROM public.categories WHERE slug = 'sunglasses-accessories' LIMIT 1;
    IF _l2 IS NOT NULL THEN
      INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
        ('Sunglasses', 'sa-sunglasses', _l2, 3, 1, true),
        ('Eyeglass Frames', 'sa-eyeglass-frames', _l2, 3, 2, true),
        ('Lens Care', 'sa-lens-care', _l2, 3, 3, true),
        ('Glasses Cases', 'sa-glasses-cases', _l2, 3, 4, true)
      ON CONFLICT (slug) DO NOTHING;
    END IF;

  END IF;

  -- ═══ grocery ═══
  SELECT id INTO _l1 FROM public.categories WHERE slug = 'grocery' AND level = 1 LIMIT 1;
  IF _l1 IS NOT NULL THEN
    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES ('Dairy & Eggs', 'dairy-eggs', _l1, 2, 6, true)
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO _l2 FROM public.categories WHERE slug = 'dairy-eggs' LIMIT 1;
    IF _l2 IS NOT NULL THEN
      INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
        ('Milk', 'milk', _l2, 3, 1, true),
        ('Cheese', 'cheese-dairy', _l2, 3, 2, true),
        ('Butter & Ghee', 'butter-ghee', _l2, 3, 3, true),
        ('Yoghurt & Curd', 'yoghurt-curd', _l2, 3, 4, true),
        ('Eggs', 'eggs', _l2, 3, 5, true),
        ('Paneer', 'paneer', _l2, 3, 6, true)
      ON CONFLICT (slug) DO NOTHING;
    END IF;

    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES ('Spices & Masalas', 'spices-masalas', _l1, 2, 7, true)
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO _l2 FROM public.categories WHERE slug = 'spices-masalas' LIMIT 1;
    IF _l2 IS NOT NULL THEN
      INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
        ('Whole Spices', 'whole-spices', _l2, 3, 1, true),
        ('Ground Spices', 'ground-spices', _l2, 3, 2, true),
        ('Masala Blends', 'masala-blends', _l2, 3, 3, true),
        ('Dry Herbs', 'dry-herbs', _l2, 3, 4, true)
      ON CONFLICT (slug) DO NOTHING;
    END IF;

    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES ('Condiments & Sauces', 'condiments-sauces', _l1, 2, 8, true)
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO _l2 FROM public.categories WHERE slug = 'condiments-sauces' LIMIT 1;
    IF _l2 IS NOT NULL THEN
      INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
        ('Ketchup', 'ketchup', _l2, 3, 1, true),
        ('Mayonnaise', 'mayonnaise', _l2, 3, 2, true),
        ('Soy Sauce', 'soy-sauce', _l2, 3, 3, true),
        ('Vinegar', 'vinegar', _l2, 3, 4, true),
        ('Chilli Sauce', 'chilli-sauce', _l2, 3, 5, true)
      ON CONFLICT (slug) DO NOTHING;
    END IF;

    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES ('Frozen Foods', 'frozen-foods', _l1, 2, 9, true)
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO _l2 FROM public.categories WHERE slug = 'frozen-foods' LIMIT 1;
    IF _l2 IS NOT NULL THEN
      INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
        ('Frozen Vegetables', 'frozen-vegetables', _l2, 3, 1, true),
        ('Frozen Snacks', 'frozen-snacks', _l2, 3, 2, true),
        ('Ice Cream', 'ice-cream', _l2, 3, 3, true),
        ('Frozen Parathas', 'frozen-parathas', _l2, 3, 4, true)
      ON CONFLICT (slug) DO NOTHING;
    END IF;

    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES ('Baby Food', 'baby-food', _l1, 2, 10, true)
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO _l2 FROM public.categories WHERE slug = 'baby-food' LIMIT 1;
    IF _l2 IS NOT NULL THEN
      INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
        ('Baby Cereal', 'bfood-cereal', _l2, 3, 1, true),
        ('Baby Formula', 'bfood-formula', _l2, 3, 2, true),
        ('Baby Snacks', 'bfood-snacks', _l2, 3, 3, true),
        ('Baby Puree', 'bfood-puree', _l2, 3, 4, true)
      ON CONFLICT (slug) DO NOTHING;
    END IF;

    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES ('Breakfast Foods', 'breakfast-foods', _l1, 2, 11, true)
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO _l2 FROM public.categories WHERE slug = 'breakfast-foods' LIMIT 1;
    IF _l2 IS NOT NULL THEN
      INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
        ('Cereals', 'brf-cereals', _l2, 3, 1, true),
        ('Oats', 'brf-oats', _l2, 3, 2, true),
        ('Muesli', 'brf-muesli', _l2, 3, 3, true),
        ('Granola', 'brf-granola', _l2, 3, 4, true)
      ON CONFLICT (slug) DO NOTHING;
    END IF;

    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES ('Gourmet & Imported Foods', 'gourmet-imported-foods', _l1, 2, 12, true)
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO _l2 FROM public.categories WHERE slug = 'gourmet-imported-foods' LIMIT 1;
    IF _l2 IS NOT NULL THEN
      INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
        ('Imported Chocolates', 'gif-chocolates', _l2, 3, 1, true),
        ('Olive Oil', 'gif-olive-oil', _l2, 3, 2, true),
        ('Cheese', 'gif-cheese', _l2, 3, 3, true),
        ('Sauces & Dips', 'gif-sauces', _l2, 3, 4, true),
        ('Dried Fruits & Nuts', 'gif-dry-fruits', _l2, 3, 5, true)
      ON CONFLICT (slug) DO NOTHING;
    END IF;

    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES ('Organic & Health Foods', 'organic-health-foods', _l1, 2, 13, true)
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO _l2 FROM public.categories WHERE slug = 'organic-health-foods' LIMIT 1;
    IF _l2 IS NOT NULL THEN
      INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
        ('Organic Grains', 'ohf-grains', _l2, 3, 1, true),
        ('Organic Honey', 'ohf-honey', _l2, 3, 2, true),
        ('Health Bars', 'ohf-health-bars', _l2, 3, 3, true),
        ('Organic Spices', 'ohf-spices', _l2, 3, 4, true)
      ON CONFLICT (slug) DO NOTHING;
    END IF;

  END IF;

  -- ═══ beauty-health ═══
  SELECT id INTO _l1 FROM public.categories WHERE slug = 'beauty-health' AND level = 1 LIMIT 1;
  IF _l1 IS NOT NULL THEN
    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES ('Bath & Body', 'bath-body', _l1, 2, 8, true)
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO _l2 FROM public.categories WHERE slug = 'bath-body' LIMIT 1;
    IF _l2 IS NOT NULL THEN
      INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
        ('Body Wash', 'bb-body-wash', _l2, 3, 1, true),
        ('Soaps', 'bb-soaps', _l2, 3, 2, true),
        ('Body Lotion', 'bb-body-lotion', _l2, 3, 3, true),
        ('Bath Bombs', 'bb-bath-bombs', _l2, 3, 4, true),
        ('Scrubs', 'bb-scrubs', _l2, 3, 5, true)
      ON CONFLICT (slug) DO NOTHING;
    END IF;

    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES ('Beauty Tools & Accessories', 'beauty-tools-accessories', _l1, 2, 9, true)
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO _l2 FROM public.categories WHERE slug = 'beauty-tools-accessories' LIMIT 1;
    IF _l2 IS NOT NULL THEN
      INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
        ('Hair Dryers', 'bta-hair-dryers', _l2, 3, 1, true),
        ('Straighteners', 'bta-straighteners', _l2, 3, 2, true),
        ('Curling Irons', 'bta-curling-irons', _l2, 3, 3, true),
        ('Makeup Brushes', 'bta-makeup-brushes', _l2, 3, 4, true),
        ('Facial Massagers', 'bta-facial-massagers', _l2, 3, 5, true)
      ON CONFLICT (slug) DO NOTHING;
    END IF;

    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES ('Oral Care', 'oral-care', _l1, 2, 10, true)
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO _l2 FROM public.categories WHERE slug = 'oral-care' LIMIT 1;
    IF _l2 IS NOT NULL THEN
      INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
        ('Toothbrushes', 'toothbrushes', _l2, 3, 1, true),
        ('Mouthwash', 'mouthwash', _l2, 3, 2, true),
        ('Dental Floss', 'dental-floss', _l2, 3, 3, true),
        ('Toothpaste', 'toothpaste-care', _l2, 3, 4, true)
      ON CONFLICT (slug) DO NOTHING;
    END IF;

    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES ('Elder Care', 'elder-care', _l1, 2, 11, true)
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO _l2 FROM public.categories WHERE slug = 'elder-care' LIMIT 1;
    IF _l2 IS NOT NULL THEN
      INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
        ('Walking Aids', 'ec-walking-aids', _l2, 3, 1, true),
        ('Adult Diapers', 'ec-adult-diapers', _l2, 3, 2, true),
        ('Blood Pressure Monitors', 'ec-bp-monitors', _l2, 3, 3, true),
        ('Orthopedic Supports', 'ec-ortho-supports', _l2, 3, 4, true)
      ON CONFLICT (slug) DO NOTHING;
    END IF;

    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES ('Personal Hygiene', 'personal-hygiene', _l1, 2, 12, true)
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO _l2 FROM public.categories WHERE slug = 'personal-hygiene' LIMIT 1;
    IF _l2 IS NOT NULL THEN
      INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
        ('Toothpaste', 'ph-toothpaste', _l2, 3, 1, true),
        ('Hand Wash', 'ph-hand-wash', _l2, 3, 2, true),
        ('Sanitizers', 'ph-sanitizers', _l2, 3, 3, true),
        ('Feminine Hygiene', 'ph-feminine', _l2, 3, 4, true)
      ON CONFLICT (slug) DO NOTHING;
    END IF;

  END IF;

  -- ═══ sports-outdoors ═══
  SELECT id INTO _l1 FROM public.categories WHERE slug = 'sports-outdoors' AND level = 1 LIMIT 1;
  IF _l1 IS NOT NULL THEN
    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES ('Gym Accessories', 'gym-accessories', _l1, 2, 5, true)
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO _l2 FROM public.categories WHERE slug = 'gym-accessories' LIMIT 1;
    IF _l2 IS NOT NULL THEN
      INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
        ('Gym Gloves', 'ga-gloves', _l2, 3, 1, true),
        ('Gym Belts', 'ga-belts', _l2, 3, 2, true),
        ('Resistance Bands (Gym)', 'ga-bands', _l2, 3, 3, true),
        ('Skipping Ropes', 'ga-ropes', _l2, 3, 4, true),
        ('Yoga Mats', 'ga-yoga-mats', _l2, 3, 5, true)
      ON CONFLICT (slug) DO NOTHING;
    END IF;

    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES ('Sports Gear', 'sports-gear', _l1, 2, 6, true)
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO _l2 FROM public.categories WHERE slug = 'sports-gear' LIMIT 1;
    IF _l2 IS NOT NULL THEN
      INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
        ('Cricket Bats', 'sg-cricket-bats', _l2, 3, 1, true),
        ('Badminton Rackets', 'sg-badminton', _l2, 3, 2, true),
        ('Footballs', 'sg-footballs', _l2, 3, 3, true),
        ('Tennis Rackets', 'sg-tennis', _l2, 3, 4, true),
        ('Sports Shoes', 'sg-sports-shoes', _l2, 3, 5, true)
      ON CONFLICT (slug) DO NOTHING;
    END IF;

    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES ('Team Sports', 'team-sports', _l1, 2, 7, true)
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO _l2 FROM public.categories WHERE slug = 'team-sports' LIMIT 1;
    IF _l2 IS NOT NULL THEN
      INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
        ('Cricket Kits', 'ts-cricket', _l2, 3, 1, true),
        ('Football Kits', 'ts-football', _l2, 3, 2, true),
        ('Hockey Equipment', 'ts-hockey', _l2, 3, 3, true),
        ('Basketball', 'ts-basketball', _l2, 3, 4, true)
      ON CONFLICT (slug) DO NOTHING;
    END IF;

    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES ('Yoga & Meditation', 'yoga-meditation', _l1, 2, 8, true)
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO _l2 FROM public.categories WHERE slug = 'yoga-meditation' LIMIT 1;
    IF _l2 IS NOT NULL THEN
      INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
        ('Yoga Mats', 'ym-mats', _l2, 3, 1, true),
        ('Meditation Cushions', 'ym-cushions', _l2, 3, 2, true),
        ('Yoga Blocks', 'ym-blocks', _l2, 3, 3, true),
        ('Yoga Straps', 'ym-straps', _l2, 3, 4, true)
      ON CONFLICT (slug) DO NOTHING;
    END IF;

    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES ('Water Sports', 'water-sports', _l1, 2, 9, true)
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO _l2 FROM public.categories WHERE slug = 'water-sports' LIMIT 1;
    IF _l2 IS NOT NULL THEN
      INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
        ('Swim Goggles', 'swim-goggles', _l2, 3, 1, true),
        ('Swimming Floats', 'swimming-floats', _l2, 3, 2, true),
        ('Surfboards', 'surfboards', _l2, 3, 3, true),
        ('Life Jackets', 'life-jackets', _l2, 3, 4, true)
      ON CONFLICT (slug) DO NOTHING;
    END IF;

    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES ('Martial Arts', 'martial-arts', _l1, 2, 10, true)
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO _l2 FROM public.categories WHERE slug = 'martial-arts' LIMIT 1;
    IF _l2 IS NOT NULL THEN
      INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
        ('Boxing Gloves', 'boxing-gloves', _l2, 3, 1, true),
        ('Punching Bags', 'punching-bags', _l2, 3, 2, true),
        ('Karate Belts', 'karate-belts', _l2, 3, 3, true),
        ('Shin Guards', 'shin-guards', _l2, 3, 4, true)
      ON CONFLICT (slug) DO NOTHING;
    END IF;

  END IF;

  -- ═══ toys-baby ═══
  SELECT id INTO _l1 FROM public.categories WHERE slug = 'toys-baby' AND level = 1 LIMIT 1;
  IF _l1 IS NOT NULL THEN
    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES ('Baby Toys', 'baby-toys', _l1, 2, 4, true)
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO _l2 FROM public.categories WHERE slug = 'baby-toys' LIMIT 1;
    IF _l2 IS NOT NULL THEN
      INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
        ('Rattles', 'btoy-rattles', _l2, 3, 1, true),
        ('Soft Toys', 'btoy-soft-toys', _l2, 3, 2, true),
        ('Teething Toys', 'btoy-teething', _l2, 3, 3, true),
        ('Musical Toys', 'btoy-musical', _l2, 3, 4, true)
      ON CONFLICT (slug) DO NOTHING;
    END IF;

    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES ('Puzzles', 'puzzles-games', _l1, 2, 5, true)
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO _l2 FROM public.categories WHERE slug = 'puzzles-games' LIMIT 1;
    IF _l2 IS NOT NULL THEN
      INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
        ('Jigsaw Puzzles', 'pz-jigsaw', _l2, 3, 1, true),
        ('3D Puzzles', 'pz-3d', _l2, 3, 2, true),
        ('Rubik Cubes', 'pz-rubik', _l2, 3, 3, true),
        ('Brain Teasers', 'pz-brain', _l2, 3, 4, true)
      ON CONFLICT (slug) DO NOTHING;
    END IF;

    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES ('Kids Ride-Ons', 'kids-ride-ons', _l1, 2, 6, true)
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO _l2 FROM public.categories WHERE slug = 'kids-ride-ons' LIMIT 1;
    IF _l2 IS NOT NULL THEN
      INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
        ('Tricycles', 'kro-tricycles', _l2, 3, 1, true),
        ('Electric Cars', 'kro-electric', _l2, 3, 2, true),
        ('Scooters', 'kro-scooters', _l2, 3, 3, true),
        ('Balance Bikes', 'kro-balance', _l2, 3, 4, true)
      ON CONFLICT (slug) DO NOTHING;
    END IF;

    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES ('School & Learning Toys', 'school-learning-toys', _l1, 2, 7, true)
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO _l2 FROM public.categories WHERE slug = 'school-learning-toys' LIMIT 1;
    IF _l2 IS NOT NULL THEN
      INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
        ('Alphabets & Numbers', 'slt-alphabets', _l2, 3, 1, true),
        ('Art & Craft Kits', 'slt-art-craft', _l2, 3, 2, true),
        ('Geometry Sets', 'slt-geometry', _l2, 3, 3, true),
        ('Writing Practice', 'slt-writing', _l2, 3, 4, true)
      ON CONFLICT (slug) DO NOTHING;
    END IF;

  END IF;

  -- ═══ home-kitchen ═══
  SELECT id INTO _l1 FROM public.categories WHERE slug = 'home-kitchen' AND level = 1 LIMIT 1;
  IF _l1 IS NOT NULL THEN
    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES ('Bathroom Accessories', 'bathroom-accessories', _l1, 2, 9, true)
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO _l2 FROM public.categories WHERE slug = 'bathroom-accessories' LIMIT 1;
    IF _l2 IS NOT NULL THEN
      INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
        ('Soap Dispensers', 'soap-dispensers', _l2, 3, 1, true),
        ('Shower Curtains', 'shower-curtains', _l2, 3, 2, true),
        ('Bathroom Shelves', 'bathroom-shelves', _l2, 3, 3, true),
        ('Toilet Seat Covers', 'toilet-seat-covers', _l2, 3, 4, true),
        ('Towel Racks', 'towel-racks', _l2, 3, 5, true)
      ON CONFLICT (slug) DO NOTHING;
    END IF;

    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES ('Home Improvement', 'home-improvement', _l1, 2, 10, true)
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO _l2 FROM public.categories WHERE slug = 'home-improvement' LIMIT 1;
    IF _l2 IS NOT NULL THEN
      INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
        ('Paint & Primers', 'hi-paint', _l2, 3, 1, true),
        ('Plumbing Supplies', 'hi-plumbing', _l2, 3, 2, true),
        ('Electrical Fittings', 'hi-electrical', _l2, 3, 3, true),
        ('Door Hardware', 'hi-door-hardware', _l2, 3, 4, true),
        ('Wallpaper', 'hi-wallpaper', _l2, 3, 5, true),
        ('Tiles & Flooring', 'hi-tiles', _l2, 3, 6, true)
      ON CONFLICT (slug) DO NOTHING;
    END IF;

    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES ('Laundry & Ironing', 'laundry-ironing', _l1, 2, 11, true)
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO _l2 FROM public.categories WHERE slug = 'laundry-ironing' LIMIT 1;
    IF _l2 IS NOT NULL THEN
      INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
        ('Irons', 'li-irons', _l2, 3, 1, true),
        ('Ironing Boards', 'li-ironing-boards', _l2, 3, 2, true),
        ('Drying Racks', 'li-drying-racks', _l2, 3, 3, true),
        ('Laundry Baskets', 'li-laundry-baskets', _l2, 3, 4, true),
        ('Clothes Hangers', 'li-hangers', _l2, 3, 5, true)
      ON CONFLICT (slug) DO NOTHING;
    END IF;

  END IF;

  -- ═══ automotive ═══
  SELECT id INTO _l1 FROM public.categories WHERE slug = 'automotive' AND level = 1 LIMIT 1;
  IF _l1 IS NOT NULL THEN
    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES ('Spare Parts', 'spare-parts', _l1, 2, 4, true)
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO _l2 FROM public.categories WHERE slug = 'spare-parts' LIMIT 1;
    IF _l2 IS NOT NULL THEN
      INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
        ('Brake Pads', 'sp-brake-pads', _l2, 3, 1, true),
        ('Air Filters', 'sp-air-filters', _l2, 3, 2, true),
        ('Oil Filters', 'sp-oil-filters', _l2, 3, 3, true),
        ('Spark Plugs', 'sp-spark-plugs', _l2, 3, 4, true),
        ('Batteries', 'sp-batteries', _l2, 3, 5, true)
      ON CONFLICT (slug) DO NOTHING;
    END IF;

    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES ('Lubricants & Oils', 'lubricants-oils', _l1, 2, 5, true)
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO _l2 FROM public.categories WHERE slug = 'lubricants-oils' LIMIT 1;
    IF _l2 IS NOT NULL THEN
      INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
        ('Engine Oil', 'lo-engine-oil', _l2, 3, 1, true),
        ('Brake Fluid', 'lo-brake-fluid', _l2, 3, 2, true),
        ('Transmission Oil', 'lo-transmission', _l2, 3, 3, true),
        ('Greases', 'lo-greases', _l2, 3, 4, true)
      ON CONFLICT (slug) DO NOTHING;
    END IF;

  END IF;

  -- ═══ books-media ═══
  SELECT id INTO _l1 FROM public.categories WHERE slug = 'books-media' AND level = 1 LIMIT 1;
  IF _l1 IS NOT NULL THEN
    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES ('Academic & Textbooks', 'academic-textbooks', _l1, 2, 5, true)
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO _l2 FROM public.categories WHERE slug = 'academic-textbooks' LIMIT 1;
    IF _l2 IS NOT NULL THEN
      INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
        ('School Textbooks', 'at-school', _l2, 3, 1, true),
        ('College Textbooks', 'at-college', _l2, 3, 2, true),
        ('Reference Books', 'at-reference', _l2, 3, 3, true),
        ('Study Guides', 'at-guides', _l2, 3, 4, true)
      ON CONFLICT (slug) DO NOTHING;
    END IF;

    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES ('Comics & Manga', 'comics-manga', _l1, 2, 6, true)
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO _l2 FROM public.categories WHERE slug = 'comics-manga' LIMIT 1;
    IF _l2 IS NOT NULL THEN
      INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
        ('Manga', 'cm-manga', _l2, 3, 1, true),
        ('Graphic Novels', 'cm-graphic', _l2, 3, 2, true),
        ('Superhero Comics', 'cm-superhero', _l2, 3, 3, true),
        ('Indie Comics', 'cm-indie', _l2, 3, 4, true)
      ON CONFLICT (slug) DO NOTHING;
    END IF;

    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES ('Competitive Exam Prep', 'competitive-exam-prep', _l1, 2, 7, true)
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO _l2 FROM public.categories WHERE slug = 'competitive-exam-prep' LIMIT 1;
    IF _l2 IS NOT NULL THEN
      INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
        ('UPSC Books', 'cep-upsc', _l2, 3, 1, true),
        ('SSC Books', 'cep-ssc', _l2, 3, 2, true),
        ('Bank Exam Books', 'cep-bank', _l2, 3, 3, true),
        ('JEE/NEET Books', 'cep-jee', _l2, 3, 4, true)
      ON CONFLICT (slug) DO NOTHING;
    END IF;

    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES ('Audiobooks', 'audiobooks', _l1, 2, 8, true)
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO _l2 FROM public.categories WHERE slug = 'audiobooks' LIMIT 1;
    IF _l2 IS NOT NULL THEN
      INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
        ('Fiction Audiobooks', 'audiobooks-fiction', _l2, 3, 1, true),
        ('Non-Fiction Audiobooks', 'audiobooks-non-fiction', _l2, 3, 2, true),
        ('Kids Audiobooks', 'audiobooks-kids', _l2, 3, 3, true)
      ON CONFLICT (slug) DO NOTHING;
    END IF;

    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES ('Magazines & Newspapers', 'magazines-newspapers', _l1, 2, 9, true)
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO _l2 FROM public.categories WHERE slug = 'magazines-newspapers' LIMIT 1;
    IF _l2 IS NOT NULL THEN
      INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
        ('Magazines', 'magazines', _l2, 3, 1, true),
        ('Newspapers', 'newspapers', _l2, 3, 2, true)
      ON CONFLICT (slug) DO NOTHING;
    END IF;

  END IF;

  -- ═══ pets ═══
  SELECT id INTO _l1 FROM public.categories WHERE slug = 'pets' AND level = 1 LIMIT 1;
  IF _l1 IS NOT NULL THEN
    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES ('Bird Supplies', 'bird-supplies', _l1, 2, 4, true)
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO _l2 FROM public.categories WHERE slug = 'bird-supplies' LIMIT 1;
    IF _l2 IS NOT NULL THEN
      INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
        ('Bird Cages', 'bird-cages', _l2, 3, 1, true),
        ('Bird Feed', 'bird-feed', _l2, 3, 2, true),
        ('Bird Toys', 'bird-toys', _l2, 3, 3, true)
      ON CONFLICT (slug) DO NOTHING;
    END IF;

    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES ('Fish & Aquarium', 'fish-aquarium', _l1, 2, 5, true)
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO _l2 FROM public.categories WHERE slug = 'fish-aquarium' LIMIT 1;
    IF _l2 IS NOT NULL THEN
      INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
        ('Aquarium Tanks', 'aquarium-tanks', _l2, 3, 1, true),
        ('Fish Food', 'fish-food', _l2, 3, 2, true),
        ('Aquarium Accessories', 'aquarium-accessories', _l2, 3, 3, true),
        ('Aquarium Filters', 'aquarium-filters', _l2, 3, 4, true)
      ON CONFLICT (slug) DO NOTHING;
    END IF;

  END IF;

  -- ═══ gaming ═══
  SELECT id INTO _l1 FROM public.categories WHERE slug = 'gaming' AND level = 1 LIMIT 1;
  IF _l1 IS NOT NULL THEN
    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES ('VR / AR', 'vr-ar', _l1, 2, 4, true)
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO _l2 FROM public.categories WHERE slug = 'vr-ar' LIMIT 1;
    IF _l2 IS NOT NULL THEN
      INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
        ('VR Headsets', 'vr-headsets', _l2, 3, 1, true),
        ('VR Controllers', 'vr-controllers', _l2, 3, 2, true),
        ('AR Glasses', 'ar-glasses', _l2, 3, 3, true)
      ON CONFLICT (slug) DO NOTHING;
    END IF;

    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active)
    VALUES ('Gaming Furniture', 'gaming-furniture', _l1, 2, 5, true)
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO _l2 FROM public.categories WHERE slug = 'gaming-furniture' LIMIT 1;
    IF _l2 IS NOT NULL THEN
      INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
        ('Gaming Chairs', 'gaming-chairs', _l2, 3, 1, true),
        ('Gaming Desks', 'gaming-desks', _l2, 3, 2, true)
      ON CONFLICT (slug) DO NOTHING;
    END IF;

  END IF;

  -- ════════════════════════════════════════════════════════════
  -- PART 4: Additional L3 product types under existing L2s
  -- ════════════════════════════════════════════════════════════

  SELECT id INTO _l2 FROM public.categories WHERE slug = 'makeup' AND level = 2 LIMIT 1;
  IF _l2 IS NOT NULL THEN
    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
      ('Nail Polish', 'nail-polish', _l2, 3, 5, true),
      ('Blush', 'blush', _l2, 3, 6, true),
      ('Concealer', 'concealer', _l2, 3, 7, true),
      ('Primer', 'primer-makeup', _l2, 3, 8, true),
      ('Setting Spray', 'setting-spray', _l2, 3, 9, true),
      ('Compact Powder', 'compact-powder', _l2, 3, 10, true),
      ('Mascara', 'mascara', _l2, 3, 11, true)
    ON CONFLICT (slug) DO NOTHING;
  END IF;

  SELECT id INTO _l2 FROM public.categories WHERE slug = 'kitchen' AND level = 2 LIMIT 1;
  IF _l2 IS NOT NULL THEN
    INSERT INTO public.categories (name, slug, parent_id, level, display_order, is_active) VALUES
      ('Mixer Grinders', 'mixer-grinders', _l2, 3, 6, true),
      ('Juicers', 'juicers', _l2, 3, 7, true),
      ('Food Processors', 'food-processors', _l2, 3, 8, true),
      ('Microwave Ovens', 'microwave-ovens', _l2, 3, 9, true),
      ('Toasters', 'toasters', _l2, 3, 10, true),
      ('Electric Kettles', 'electric-kettles', _l2, 3, 11, true),
      ('Air Fryers', 'air-fryers', _l2, 3, 12, true),
      ('Induction Cooktops', 'induction-cooktops', _l2, 3, 13, true)
    ON CONFLICT (slug) DO NOTHING;
  END IF;

  RAISE NOTICE 'All categories inserted successfully.';
END $$;

-- ════════════════════════════════════════════════════════════
-- PART 5: HSN CODES FOR ALL NEW CATEGORIES
-- ════════════════════════════════════════════════════════════

INSERT INTO public.category_hsn_codes (category_slug, hsn_code, description) VALUES
  ('office-supplies-stationery', '48201090', 'Office Supplies & Stationery'),
  ('garden-outdoor-living', '82013000', 'Garden & Outdoor Living'),
  ('musical-instruments', '92029090', 'Musical Instruments'),
  ('jewellery-luxury', '71131190', 'Jewellery & Luxury'),
  ('software-digital-products', '85234990', 'Software & Digital Products'),
  ('travel-luggage', '42021290', 'Travel & Luggage'),
  ('home-appliances', '85167990', 'Home Appliances'),
  ('writing-instruments', '96081090', 'Writing Instruments'),
  ('ball-pens', '96081090', 'Ball Pens'),
  ('gel-pens', '96081090', 'Gel Pens'),
  ('fountain-pens', '96081010', 'Fountain Pens'),
  ('roller-ball-pens', '96081090', 'Roller Ball Pens'),
  ('mechanical-pencils', '96092000', 'Mechanical Pencils'),
  ('graphite-pencils', '96091010', 'Graphite Pencils'),
  ('colour-pencils', '96091090', 'Colour Pencils'),
  ('markers-highlighters', '96082090', 'Markers & Highlighters'),
  ('whiteboard-markers', '96082090', 'Whiteboard Markers'),
  ('permanent-markers', '96082090', 'Permanent Markers'),
  ('sketch-pens', '96082090', 'Sketch Pens'),
  ('crayons', '96091090', 'Crayons'),
  ('erasers', '40169990', 'Erasers'),
  ('sharpeners', '82141000', 'Sharpeners'),
  ('correction-fluid', '96089990', 'Correction Fluid / Tape'),
  ('pen-refills', '96089990', 'Refills & Cartridges'),
  ('paper-notebooks', '48201090', 'Paper & Notebooks'),
  ('notebooks-journals', '48201090', 'Notebooks & Journals'),
  ('spiral-notebooks', '48201090', 'Spiral Notebooks'),
  ('ruled-sheets', '48201090', 'Ruled Sheets & Loose Leaves'),
  ('sticky-notes', '48211090', 'Sticky Notes'),
  ('printer-paper', '48025690', 'Printer Paper'),
  ('graph-paper', '48201090', 'Graph Paper'),
  ('drawing-sheets', '48023900', 'Drawing Sheets'),
  ('envelopes', '48171000', 'Envelopes'),
  ('desk-accessories', '39269099', 'Desk Accessories'),
  ('pen-stands', '39269099', 'Pen Stands & Holders'),
  ('desk-organisers', '39249090', 'Desk Organisers'),
  ('paper-clips', '73199090', 'Paper Clips'),
  ('staplers', '84729090', 'Staplers'),
  ('staple-pins', '83052000', 'Staple Pins'),
  ('tape-dispensers', '39269099', 'Tape Dispensers'),
  ('adhesive-tape-office', '39191090', 'Adhesive Tape (Office)'),
  ('scissors-office', '82130000', 'Scissors (Office)'),
  ('rubber-bands', '40082190', 'Rubber Bands'),
  ('push-pins', '73170090', 'Push Pins & Thumbtacks'),
  ('letter-openers', '82141000', 'Letter Openers'),
  ('stamp-pads', '96121090', 'Stamp Pads & Ink'),
  ('filing-organization', '48203000', 'Filing & Organization'),
  ('file-folders', '48203000', 'File Folders'),
  ('ring-binders', '48203000', 'Ring Binders'),
  ('document-wallets', '48203000', 'Document Wallets'),
  ('magazine-holders', '39249090', 'Magazine Holders'),
  ('filing-cabinets', '94036090', 'Filing Cabinets'),
  ('expanding-files', '48203000', 'Expanding Files'),
  ('clip-boards', '48203000', 'Clip Boards'),
  ('printers-ink', '84433210', 'Printers & Ink'),
  ('inkjet-printers', '84433210', 'Inkjet Printers'),
  ('laser-printers', '84433290', 'Laser Printers'),
  ('ink-cartridges', '84439990', 'Ink Cartridges'),
  ('toner-cartridges', '84439990', 'Toner Cartridges'),
  ('printer-paper-rolls', '48025690', 'Printer Paper Rolls'),
  ('label-printers', '84433210', 'Label Printers'),
  ('art-craft-supplies', '32091090', 'Art & Craft Supplies'),
  ('acrylic-paints', '32091090', 'Acrylic Paints'),
  ('watercolour-paints', '32091090', 'Watercolour Paints'),
  ('oil-paints', '32091090', 'Oil Paints'),
  ('paint-brushes', '96032990', 'Paint Brushes'),
  ('canvas-easels', '59070090', 'Canvas & Easels'),
  ('sketch-pads', '48201090', 'Sketch Pads'),
  ('glue-sticks-craft', '35061000', 'Glue Sticks & Craft Glue'),
  ('craft-paper', '48239090', 'Craft Paper'),
  ('beading-jewellery-making', '71179090', 'Beading & Jewellery Making'),
  ('sewing-embroidery', '73199090', 'Sewing & Embroidery Kits'),
  ('garden-tools', '82013000', 'Garden Tools'),
  ('pruning-shears', '82013000', 'Pruning Shears'),
  ('garden-hoses', '39173990', 'Garden Hoses'),
  ('watering-cans', '73249000', 'Watering Cans'),
  ('spades-shovels', '82011000', 'Spades & Shovels'),
  ('lawn-mowers', '84333000', 'Lawn Mowers'),
  ('rakes', '82013000', 'Rakes'),
  ('plants-seeds', '12099990', 'Plants & Seeds'),
  ('flower-seeds', '12099990', 'Flower Seeds'),
  ('vegetable-seeds', '12099190', 'Vegetable Seeds'),
  ('indoor-plants', '06029090', 'Indoor Plants'),
  ('pots-planters', '69139090', 'Pots & Planters'),
  ('fertilizers', '31059090', 'Fertilizers'),
  ('soil-growing-media', '25309090', 'Soil & Growing Media'),
  ('outdoor-furniture', '94017900', 'Outdoor Furniture'),
  ('garden-chairs', '94017900', 'Garden Chairs'),
  ('garden-tables', '94036090', 'Garden Tables'),
  ('hammocks', '63062200', 'Hammocks'),
  ('outdoor-umbrellas', '66019100', 'Outdoor Umbrellas'),
  ('bbq-grills', '73211190', 'BBQ Grills'),
  ('fire-pits', '73211190', 'Fire Pits'),
  ('pest-control-garden', '38089110', 'Pest Control'),
  ('insecticides-garden', '38089110', 'Insecticides'),
  ('mosquito-repellents', '38089290', 'Mosquito Repellents'),
  ('rat-traps', '73269099', 'Rat Traps'),
  ('weed-killers', '38083090', 'Weed Killers'),
  ('string-instruments', '92029090', 'String Instruments'),
  ('acoustic-guitars', '92029090', 'Acoustic Guitars'),
  ('electric-guitars', '92029090', 'Electric Guitars'),
  ('ukuleles', '92029090', 'Ukuleles'),
  ('violins', '92021000', 'Violins'),
  ('guitar-strings-picks', '92099900', 'Guitar Strings & Picks'),
  ('keyboard-instruments', '92017000', 'Keyboard Instruments'),
  ('digital-pianos', '92017000', 'Digital Pianos'),
  ('synthesizers', '92099900', 'Synthesizers'),
  ('midi-controllers', '92099900', 'MIDI Controllers'),
  ('keyboard-stands', '92099900', 'Keyboard Stands'),
  ('percussion', '92061000', 'Percussion'),
  ('drum-kits', '92061000', 'Drum Kits'),
  ('electronic-drums', '92069000', 'Electronic Drums'),
  ('tablas', '92060090', 'Tablas'),
  ('cajons', '92060090', 'Cajons'),
  ('cymbals', '92069000', 'Cymbals'),
  ('wind-instruments', '92051000', 'Wind Instruments'),
  ('flutes', '92051000', 'Flutes'),
  ('harmonicas', '92059090', 'Harmonicas'),
  ('saxophones', '92059090', 'Saxophones'),
  ('trumpets', '92059090', 'Trumpets'),
  ('dj-recording', '85437099', 'DJ & Recording Equipment'),
  ('dj-controllers', '85437099', 'DJ Controllers'),
  ('audio-interfaces', '85437099', 'Audio Interfaces'),
  ('studio-microphones', '85181090', 'Studio Microphones'),
  ('mixers-audio', '85437099', 'Mixers'),
  ('studio-monitors', '85182200', 'Studio Monitors'),
  ('fine-jewellery-gold-diamond', '71131190', 'Fine Jewellery'),
  ('fjgd-gold-necklaces', '71131190', 'Gold Necklaces'),
  ('fjgd-gold-rings', '71131190', 'Gold Rings'),
  ('fjgd-diamond-rings', '71131990', 'Diamond Rings'),
  ('fjgd-gold-earrings', '71131190', 'Gold Earrings'),
  ('fjgd-gold-bangles', '71131190', 'Gold Bangles'),
  ('fjgd-platinum', '71131990', 'Platinum Jewellery'),
  ('fjgd-gold-chains', '71131190', 'Gold Chains'),
  ('silver-jewellery', '71141190', 'Silver Jewellery'),
  ('sj-rings', '71141190', 'Silver Rings'),
  ('sj-chains', '71141190', 'Silver Chains'),
  ('sj-bracelets', '71141190', 'Silver Bracelets'),
  ('sj-anklets', '71141190', 'Silver Anklets'),
  ('sj-earrings', '71141190', 'Silver Earrings'),
  ('sj-coins', '71069290', 'Silver Coins'),
  ('fashion-jewellery-cat', '71171900', 'Fashion Jewellery'),
  ('fj-necklaces', '71171900', 'Necklaces'),
  ('fj-earrings', '71171900', 'Earrings'),
  ('fj-bracelets', '71171900', 'Bracelets'),
  ('fj-rings', '71171900', 'Fashion Rings'),
  ('fj-anklets', '71171900', 'Anklets'),
  ('gift-jewellery', '71171900', 'Gift Jewellery'),
  ('gj-gift-sets', '71171900', 'Gift Sets'),
  ('gj-charm', '71171900', 'Charm Bracelets'),
  ('gj-pendants', '71171900', 'Pendant Sets'),
  ('gj-couple-rings', '71171900', 'Couple Rings'),
  ('luxury-watches', '91011100', 'Luxury Watches'),
  ('lw-swiss', '91011100', 'Swiss Watches'),
  ('lw-automatic', '91011900', 'Automatic Watches'),
  ('lw-smartwatch', '91021200', 'Luxury Smartwatches'),
  ('lw-limited', '91011100', 'Limited Edition Watches'),
  ('precious-stones', '71023100', 'Precious Stones'),
  ('ps-diamonds', '71023100', 'Diamonds'),
  ('ps-rubies', '71031010', 'Rubies'),
  ('ps-emeralds', '71031020', 'Emeralds'),
  ('ps-sapphires', '71031090', 'Sapphires'),
  ('software-licenses', '85234990', 'Software Licenses'),
  ('sl-antivirus', '85234990', 'Antivirus'),
  ('sl-office', '85234990', 'Office Suite'),
  ('sl-os', '85234990', 'Operating Systems'),
  ('sl-creative', '85234990', 'Creative Software'),
  ('online-courses', '85234990', 'Online Courses'),
  ('oc-programming', '85234990', 'Programming Courses'),
  ('oc-business', '85234990', 'Business Courses'),
  ('oc-language', '85234990', 'Language Courses'),
  ('oc-design', '85234990', 'Design Courses'),
  ('digital-subscriptions', '85234990', 'Digital Subscriptions'),
  ('ds-streaming', '85234990', 'Streaming Services'),
  ('ds-music', '85234990', 'Music Subscriptions'),
  ('ds-cloud', '85234990', 'Cloud Storage'),
  ('ds-news', '49019900', 'News & Magazines'),
  ('game-codes', '85234990', 'Game Codes'),
  ('gc-pc', '85234990', 'PC Game Codes'),
  ('gc-console', '85234990', 'Console Game Codes'),
  ('gc-currency', '85234990', 'In-Game Currency'),
  ('gc-gift-cards', '49070030', 'Gift Cards'),
  ('design-templates', '85234990', 'Design Templates'),
  ('dt-website', '85234990', 'Website Templates'),
  ('dt-logo', '85234990', 'Logo Templates'),
  ('dt-ppt', '85234990', 'Presentation Templates'),
  ('dt-social', '85234990', 'Social Media Templates'),
  ('e-books', '49019900', 'E-Books'),
  ('eb-fiction', '49019900', 'Fiction E-Books'),
  ('eb-non-fiction', '49019900', 'Non-Fiction E-Books'),
  ('eb-academic', '49019900', 'Academic E-Books'),
  ('eb-self-help', '49019900', 'Self-Help E-Books'),
  ('suitcases-trolley', '42021290', 'Suitcases & Trolley Bags'),
  ('tl-cabin', '42021290', 'Cabin Luggage'),
  ('tl-checkin', '42021290', 'Check-In Luggage'),
  ('tl-sets', '42021290', 'Luggage Sets'),
  ('tl-hardshell', '42021290', 'Hard-Shell Suitcases'),
  ('tl-softshell', '42021290', 'Soft-Shell Suitcases'),
  ('travel-backpacks', '42029290', 'Backpacks & Rucksacks'),
  ('tl-travel-bp', '42029290', 'Travel Backpacks'),
  ('tl-hiking-bp', '42029290', 'Hiking Backpacks'),
  ('tl-laptop-bp', '42029290', 'Laptop Backpacks'),
  ('tl-antitheft-bp', '42029290', 'Anti-Theft Backpacks'),
  ('duffel-gym-bags', '42029290', 'Duffel & Gym Bags'),
  ('tl-duffel', '42029290', 'Duffel Bags'),
  ('tl-gym', '42029290', 'Gym Bags'),
  ('tl-garment', '42029290', 'Garment Bags'),
  ('travel-accessories-cat', '42023190', 'Travel Accessories'),
  ('tl-passport', '42023190', 'Passport Holders'),
  ('tl-neck-pillow', '94049090', 'Neck Pillows'),
  ('tl-tags', '42023190', 'Luggage Tags'),
  ('tl-organizers', '42029290', 'Travel Organizers'),
  ('tl-locks', '83011000', 'Luggage Locks'),
  ('tl-packing-cubes', '42029290', 'Packing Cubes'),
  ('washing-machines', '84501100', 'Washing Machines'),
  ('ha-front-load', '84501100', 'Front Load'),
  ('ha-top-load', '84501200', 'Top Load'),
  ('ha-semi-auto', '84501900', 'Semi-Automatic'),
  ('ha-washer-dryer', '84501100', 'Washer Dryer Combo'),
  ('refrigerators', '84181000', 'Refrigerators'),
  ('ha-single-door', '84181000', 'Single Door'),
  ('ha-double-door', '84182100', 'Double Door'),
  ('ha-side-by-side', '84182100', 'Side-by-Side'),
  ('ha-mini-fridge', '84181000', 'Mini Fridge'),
  ('air-conditioners', '84151010', 'Air Conditioners'),
  ('ha-split-ac', '84151010', 'Split ACs'),
  ('ha-window-ac', '84151020', 'Window ACs'),
  ('ha-portable-ac', '84158190', 'Portable ACs'),
  ('ha-air-coolers', '84146090', 'Air Coolers'),
  ('water-purifiers', '84212100', 'Water Purifiers'),
  ('ha-ro', '84212100', 'RO Purifiers'),
  ('ha-uv', '84212100', 'UV Purifiers'),
  ('ha-gravity', '84212100', 'Gravity Purifiers'),
  ('ha-filters', '84212100', 'Water Filters'),
  ('fans-ventilation', '84145190', 'Fans & Ventilation'),
  ('ha-ceiling-fans', '84145190', 'Ceiling Fans'),
  ('ha-table-fans', '84145990', 'Table Fans'),
  ('ha-exhaust-fans', '84145990', 'Exhaust Fans'),
  ('ha-tower-fans', '84145990', 'Tower Fans'),
  ('vacuum-cleaners', '85081100', 'Vacuum Cleaners'),
  ('ha-upright', '85081100', 'Upright Vacuum'),
  ('ha-robot', '85081100', 'Robot Vacuum'),
  ('ha-handheld', '85081100', 'Handheld Vacuum'),
  ('ha-wet-dry', '85081100', 'Wet & Dry Vacuum'),
  ('printers-scanners', '84433210', 'Printers & Scanners'),
  ('el-inkjet', '84433210', 'Inkjet Printers'),
  ('el-laser', '84433290', 'Laser Printers'),
  ('el-scanners', '84716090', 'Scanners'),
  ('el-3d-printers', '84779000', '3D Printers'),
  ('drones', '88062100', 'Drones'),
  ('camera-drones', '88062100', 'Camera Drones'),
  ('fpv-drones', '88062100', 'FPV Drones'),
  ('drone-accessories', '88071000', 'Drone Accessories'),
  ('tablets-cat', '84713010', 'Tablets'),
  ('tab-android', '84713010', 'Android Tablets'),
  ('tab-ipads', '84713010', 'iPads'),
  ('tab-windows', '84713010', 'Windows Tablets'),
  ('tab-ereaders', '84713010', 'E-Readers'),
  ('mens-ethnic-wear', '62053090', 'Ethnic Wear - Men'),
  ('mens-kurtas', '62053090', 'Kurtas'),
  ('mens-sherwanis', '62043990', 'Sherwanis'),
  ('dhotis-lungis', '62114390', 'Dhotis & Lungis'),
  ('nehru-jackets', '62043990', 'Nehru Jackets'),
  ('womens-ethnic-wear', '62044900', 'Ethnic Wear - Women'),
  ('sarees', '62044900', 'Sarees'),
  ('salwar-suits', '62044900', 'Salwar Suits'),
  ('lehengas', '62044900', 'Lehengas'),
  ('kurtis', '62044900', 'Kurtis'),
  ('dupattas', '62142000', 'Dupattas'),
  ('sportswear', '61034200', 'Sportswear'),
  ('track-pants', '61034200', 'Track Pants'),
  ('sports-bras', '62121090', 'Sports Bras'),
  ('gym-shorts', '61034200', 'Gym Shorts'),
  ('compression-wear', '61124900', 'Compression Wear'),
  ('swimwear', '61123100', 'Swimwear'),
  ('mens-swimwear', '61123100', 'Mens Swimwear'),
  ('womens-swimwear', '61123100', 'Womens Swimwear'),
  ('kids-swimwear', '61123100', 'Kids Swimwear'),
  ('bags-luggage', '42029290', 'Bags & Luggage'),
  ('bl-backpacks', '42029290', 'Backpacks'),
  ('bl-handbags', '42022210', 'Handbags'),
  ('bl-suitcases', '42021290', 'Suitcases'),
  ('bl-duffel-bags', '42029290', 'Duffel Bags'),
  ('bl-wallets', '42023100', 'Wallets'),
  ('sunglasses-accessories', '90041000', 'Sunglasses & Eyewear'),
  ('sa-sunglasses', '90041000', 'Sunglasses'),
  ('sa-eyeglass-frames', '90031900', 'Eyeglass Frames'),
  ('sa-lens-care', '33049990', 'Lens Care'),
  ('sa-glasses-cases', '42021290', 'Glasses Cases'),
  ('dairy-eggs', '04012000', 'Dairy & Eggs'),
  ('milk', '04012000', 'Milk'),
  ('cheese-dairy', '04069090', 'Cheese'),
  ('butter-ghee', '04051090', 'Butter & Ghee'),
  ('yoghurt-curd', '04031090', 'Yoghurt & Curd'),
  ('eggs', '04070090', 'Eggs'),
  ('paneer', '04061000', 'Paneer'),
  ('spices-masalas', '09109190', 'Spices & Masalas'),
  ('whole-spices', '09109190', 'Whole Spices'),
  ('ground-spices', '09109190', 'Ground Spices'),
  ('masala-blends', '09109190', 'Masala Blends'),
  ('dry-herbs', '09109990', 'Dry Herbs'),
  ('condiments-sauces', '21032000', 'Condiments & Sauces'),
  ('ketchup', '21032000', 'Ketchup'),
  ('mayonnaise', '21039090', 'Mayonnaise'),
  ('soy-sauce', '21031000', 'Soy Sauce'),
  ('vinegar', '22090000', 'Vinegar'),
  ('chilli-sauce', '21032000', 'Chilli Sauce'),
  ('frozen-foods', '07109090', 'Frozen Foods'),
  ('frozen-vegetables', '07109090', 'Frozen Vegetables'),
  ('frozen-snacks', '21069099', 'Frozen Snacks'),
  ('ice-cream', '21050000', 'Ice Cream'),
  ('frozen-parathas', '19059090', 'Frozen Parathas'),
  ('baby-food', '19011090', 'Baby Food'),
  ('bfood-cereal', '19011090', 'Baby Cereal'),
  ('bfood-formula', '19011010', 'Baby Formula'),
  ('bfood-snacks', '19059040', 'Baby Snacks'),
  ('bfood-puree', '20079990', 'Baby Puree'),
  ('breakfast-foods', '19041090', 'Breakfast Foods'),
  ('brf-cereals', '19041090', 'Cereals'),
  ('brf-oats', '11041200', 'Oats'),
  ('brf-muesli', '19042000', 'Muesli'),
  ('brf-granola', '19042000', 'Granola'),
  ('gourmet-imported-foods', '21069099', 'Gourmet & Imported Foods'),
  ('gif-chocolates', '18069000', 'Imported Chocolates'),
  ('gif-olive-oil', '15091000', 'Olive Oil'),
  ('gif-cheese', '04069090', 'Cheese (Gourmet)'),
  ('gif-sauces', '21039090', 'Sauces & Dips'),
  ('gif-dry-fruits', '08134090', 'Dried Fruits & Nuts'),
  ('organic-health-foods', '21069099', 'Organic & Health Foods'),
  ('ohf-grains', '10063090', 'Organic Grains'),
  ('ohf-honey', '04090000', 'Organic Honey'),
  ('ohf-health-bars', '19042000', 'Health Bars'),
  ('ohf-spices', '09109190', 'Organic Spices'),
  ('bath-body', '34011990', 'Bath & Body'),
  ('bb-body-wash', '34011990', 'Body Wash'),
  ('bb-soaps', '34011190', 'Soaps'),
  ('bb-body-lotion', '33049990', 'Body Lotion'),
  ('bb-bath-bombs', '33079090', 'Bath Bombs'),
  ('bb-scrubs', '33049990', 'Scrubs'),
  ('beauty-tools-accessories', '85163100', 'Beauty Tools & Accessories'),
  ('bta-hair-dryers', '85163100', 'Hair Dryers'),
  ('bta-straighteners', '85163200', 'Straighteners'),
  ('bta-curling-irons', '85163200', 'Curling Irons'),
  ('bta-makeup-brushes', '96032990', 'Makeup Brushes'),
  ('bta-facial-massagers', '90189099', 'Facial Massagers'),
  ('oral-care', '33061010', 'Oral Care'),
  ('toothbrushes', '96032100', 'Toothbrushes'),
  ('mouthwash', '33069090', 'Mouthwash'),
  ('dental-floss', '33069090', 'Dental Floss'),
  ('toothpaste-care', '33061010', 'Toothpaste'),
  ('elder-care', '90211090', 'Elder Care'),
  ('ec-walking-aids', '90211090', 'Walking Aids'),
  ('ec-adult-diapers', '96190090', 'Adult Diapers'),
  ('ec-bp-monitors', '90189099', 'Blood Pressure Monitors'),
  ('ec-ortho-supports', '90211090', 'Orthopedic Supports'),
  ('personal-hygiene', '33061010', 'Personal Hygiene'),
  ('ph-toothpaste', '33061010', 'Toothpaste (Hygiene)'),
  ('ph-hand-wash', '34011990', 'Hand Wash'),
  ('ph-sanitizers', '38089290', 'Sanitizers'),
  ('ph-feminine', '96190010', 'Feminine Hygiene'),
  ('nail-polish', '33043000', 'Nail Polish'),
  ('blush', '33049990', 'Blush'),
  ('concealer', '33049990', 'Concealer'),
  ('primer-makeup', '33049990', 'Primer'),
  ('setting-spray', '33049990', 'Setting Spray'),
  ('compact-powder', '33049910', 'Compact Powder'),
  ('mascara', '33042010', 'Mascara'),
  ('gym-accessories', '95069190', 'Gym Accessories'),
  ('ga-gloves', '42032990', 'Gym Gloves'),
  ('ga-belts', '42033000', 'Gym Belts'),
  ('ga-bands', '95069190', 'Resistance Bands (Gym)'),
  ('ga-ropes', '95069190', 'Skipping Ropes'),
  ('ga-yoga-mats', '40169990', 'Yoga Mats'),
  ('sports-gear', '95069990', 'Sports Gear'),
  ('sg-cricket-bats', '95069990', 'Cricket Bats'),
  ('sg-badminton', '95065100', 'Badminton Rackets'),
  ('sg-footballs', '95066290', 'Footballs'),
  ('sg-tennis', '95065100', 'Tennis Rackets'),
  ('sg-sports-shoes', '64041100', 'Sports Shoes'),
  ('team-sports', '95069990', 'Team Sports'),
  ('ts-cricket', '95069990', 'Cricket Kits'),
  ('ts-football', '95069990', 'Football Kits'),
  ('ts-hockey', '95069990', 'Hockey Equipment'),
  ('ts-basketball', '95066990', 'Basketball'),
  ('yoga-meditation', '40169990', 'Yoga & Meditation'),
  ('ym-mats', '40169990', 'Yoga Mats (YM)'),
  ('ym-cushions', '94049090', 'Meditation Cushions'),
  ('ym-blocks', '39269099', 'Yoga Blocks'),
  ('ym-straps', '56079090', 'Yoga Straps'),
  ('water-sports', '95069990', 'Water Sports'),
  ('swim-goggles', '90049090', 'Swim Goggles'),
  ('swimming-floats', '95069990', 'Swimming Floats'),
  ('surfboards', '95062900', 'Surfboards'),
  ('life-jackets', '63072010', 'Life Jackets'),
  ('martial-arts', '95069990', 'Martial Arts'),
  ('boxing-gloves', '42032990', 'Boxing Gloves'),
  ('punching-bags', '95069990', 'Punching Bags'),
  ('karate-belts', '63079090', 'Karate Belts'),
  ('shin-guards', '95069990', 'Shin Guards'),
  ('baby-toys', '95030090', 'Baby Toys'),
  ('btoy-rattles', '95030090', 'Rattles'),
  ('btoy-soft-toys', '95030021', 'Soft Toys'),
  ('btoy-teething', '95030090', 'Teething Toys'),
  ('btoy-musical', '95030090', 'Musical Toys'),
  ('puzzles-games', '95030090', 'Puzzles'),
  ('pz-jigsaw', '95030090', 'Jigsaw Puzzles'),
  ('pz-3d', '95030090', '3D Puzzles'),
  ('pz-rubik', '95030090', 'Rubik Cubes'),
  ('pz-brain', '95030090', 'Brain Teasers'),
  ('kids-ride-ons', '87120090', 'Kids Ride-Ons'),
  ('kro-tricycles', '87120030', 'Tricycles'),
  ('kro-electric', '95030090', 'Electric Cars'),
  ('kro-scooters', '87120090', 'Scooters'),
  ('kro-balance', '87120090', 'Balance Bikes'),
  ('school-learning-toys', '95030090', 'School & Learning Toys'),
  ('slt-alphabets', '95030090', 'Alphabets & Numbers'),
  ('slt-art-craft', '95030090', 'Art & Craft Kits'),
  ('slt-geometry', '90172090', 'Geometry Sets'),
  ('slt-writing', '48201090', 'Writing Practice'),
  ('bathroom-accessories', '73249000', 'Bathroom Accessories'),
  ('soap-dispensers', '84798990', 'Soap Dispensers'),
  ('shower-curtains', '39249090', 'Shower Curtains'),
  ('bathroom-shelves', '73249000', 'Bathroom Shelves'),
  ('toilet-seat-covers', '39222000', 'Toilet Seat Covers'),
  ('towel-racks', '73249000', 'Towel Racks'),
  ('home-improvement', '32091090', 'Home Improvement'),
  ('hi-paint', '32091090', 'Paint & Primers'),
  ('hi-plumbing', '73249000', 'Plumbing Supplies'),
  ('hi-electrical', '85366990', 'Electrical Fittings'),
  ('hi-door-hardware', '83024900', 'Door Hardware'),
  ('hi-wallpaper', '48142000', 'Wallpaper'),
  ('hi-tiles', '69089090', 'Tiles & Flooring'),
  ('laundry-ironing', '85163200', 'Laundry & Ironing'),
  ('li-irons', '85163200', 'Irons'),
  ('li-ironing-boards', '94036090', 'Ironing Boards'),
  ('li-drying-racks', '73269099', 'Drying Racks'),
  ('li-laundry-baskets', '46021900', 'Laundry Baskets'),
  ('li-hangers', '39249090', 'Clothes Hangers'),
  ('mixer-grinders', '85094000', 'Mixer Grinders'),
  ('juicers', '85094000', 'Juicers'),
  ('food-processors', '85094000', 'Food Processors'),
  ('microwave-ovens', '85165000', 'Microwave Ovens'),
  ('toasters', '85167190', 'Toasters'),
  ('electric-kettles', '85167100', 'Electric Kettles'),
  ('air-fryers', '85167990', 'Air Fryers'),
  ('induction-cooktops', '85166090', 'Induction Cooktops'),
  ('spare-parts', '87089900', 'Spare Parts'),
  ('sp-brake-pads', '68132090', 'Brake Pads'),
  ('sp-air-filters', '84219990', 'Air Filters'),
  ('sp-oil-filters', '84212300', 'Oil Filters'),
  ('sp-spark-plugs', '85111000', 'Spark Plugs'),
  ('sp-batteries', '85071000', 'Batteries'),
  ('lubricants-oils', '27101990', 'Lubricants & Oils'),
  ('lo-engine-oil', '27101990', 'Engine Oil'),
  ('lo-brake-fluid', '38190090', 'Brake Fluid'),
  ('lo-transmission', '27101990', 'Transmission Oil'),
  ('lo-greases', '27101990', 'Greases'),
  ('academic-textbooks', '49019900', 'Academic & Textbooks'),
  ('at-school', '49019900', 'School Textbooks'),
  ('at-college', '49019900', 'College Textbooks'),
  ('at-reference', '49019900', 'Reference Books'),
  ('at-guides', '49019900', 'Study Guides'),
  ('comics-manga', '49011010', 'Comics & Manga'),
  ('cm-manga', '49011010', 'Manga'),
  ('cm-graphic', '49011010', 'Graphic Novels'),
  ('cm-superhero', '49011010', 'Superhero Comics'),
  ('cm-indie', '49011010', 'Indie Comics'),
  ('competitive-exam-prep', '49019900', 'Competitive Exam Prep'),
  ('cep-upsc', '49019900', 'UPSC Books'),
  ('cep-ssc', '49019900', 'SSC Books'),
  ('cep-bank', '49019900', 'Bank Exam Books'),
  ('cep-jee', '49019900', 'JEE/NEET Books'),
  ('audiobooks', '85234990', 'Audiobooks'),
  ('audiobooks-fiction', '85234990', 'Fiction Audiobooks'),
  ('audiobooks-non-fiction', '85234990', 'Non-Fiction Audiobooks'),
  ('audiobooks-kids', '85234990', 'Kids Audiobooks'),
  ('magazines-newspapers', '49029090', 'Magazines & Newspapers'),
  ('magazines', '49029090', 'Magazines'),
  ('newspapers', '49021090', 'Newspapers'),
  ('bird-supplies', '23099090', 'Bird Supplies'),
  ('bird-cages', '73143900', 'Bird Cages'),
  ('bird-feed', '23099090', 'Bird Feed'),
  ('bird-toys', '95030090', 'Bird Toys'),
  ('fish-aquarium', '70200090', 'Fish & Aquarium'),
  ('aquarium-tanks', '70200090', 'Aquarium Tanks'),
  ('fish-food', '23099090', 'Fish Food'),
  ('aquarium-accessories', '84818090', 'Aquarium Accessories'),
  ('aquarium-filters', '84212100', 'Aquarium Filters'),
  ('vr-ar', '90049090', 'VR / AR'),
  ('vr-headsets', '90049090', 'VR Headsets'),
  ('vr-controllers', '95049090', 'VR Controllers'),
  ('ar-glasses', '90049090', 'AR Glasses'),
  ('gaming-furniture', '94013090', 'Gaming Furniture'),
  ('gaming-chairs', '94013090', 'Gaming Chairs'),
  ('gaming-desks', '94036090', 'Gaming Desks')
ON CONFLICT (category_slug) DO UPDATE SET hsn_code = EXCLUDED.hsn_code, description = EXCLUDED.description;

-- Fix tissue/paper-products to have correct individual HSN codes
INSERT INTO public.category_hsn_codes (category_slug, hsn_code, description) VALUES
  ('hhs-tissue', '48189090', 'Tissue & Paper Products')
ON CONFLICT (category_slug) DO UPDATE SET hsn_code = EXCLUDED.hsn_code;

-- ════════════════════════════════════════════════════════════
-- DONE
-- ════════════════════════════════════════════════════════════