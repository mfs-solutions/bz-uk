-- ============================================================================
-- Add new categories: Medical Equipment, Safety & PPE, and expand Towels
-- 3-layer structure (L1 → L2 → L3) with 8-digit India CBIC HSN codes.
-- Uses ON CONFLICT (slug) DO NOTHING for idempotency / safe re-runs.
-- ============================================================================

DO $$
DECLARE
  -- Existing Level 1 IDs
  _home_kitchen  UUID;
  _beauty_health UUID;

  -- New Level 1 IDs
  _medical       UUID;
  _safety        UUID;
  _industrial    UUID;

  -- Reusable Level 2 ID
  _dept UUID;
BEGIN

  -- ══════════════════════════════════════════════════════════════════
  -- Look up existing Level 1 IDs
  -- ══════════════════════════════════════════════════════════════════
  SELECT id INTO _home_kitchen  FROM public.categories WHERE slug = 'home-kitchen';
  SELECT id INTO _beauty_health FROM public.categories WHERE slug = 'beauty-health';

  -- ══════════════════════════════════════════════════════════════════
  -- 1. NEW Level 1: Medical Equipment & Supplies
  -- ══════════════════════════════════════════════════════════════════
  INSERT INTO public.categories (name, slug, parent_id, level, display_order)
  VALUES ('Medical Equipment & Supplies', 'medical-equipment', NULL, 1, 12)
  ON CONFLICT (slug) DO NOTHING;
  SELECT id INTO _medical FROM public.categories WHERE slug = 'medical-equipment';

  -- ── 1a. Diagnostic Instruments (Level 2) ──
  INSERT INTO public.categories (name, slug, parent_id, level, display_order)
  VALUES ('Diagnostic Instruments', 'diagnostic-instruments', _medical, 2, 1)
  ON CONFLICT (slug) DO NOTHING;
  SELECT id INTO _dept FROM public.categories WHERE slug = 'diagnostic-instruments';
  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('Stethoscopes',            'stethoscopes',             _dept, 3, 1),
    ('Blood Pressure Monitors', 'blood-pressure-monitors',  _dept, 3, 2),
    ('Thermometers',            'thermometers',             _dept, 3, 3),
    ('Pulse Oximeters',         'pulse-oximeters',          _dept, 3, 4),
    ('Glucometers',             'glucometers',              _dept, 3, 5),
    ('Otoscopes',               'otoscopes',                _dept, 3, 6),
    ('Weighing Scales',         'medical-weighing-scales',  _dept, 3, 7)
  ON CONFLICT (slug) DO NOTHING;

  -- ── 1b. Surgical & Disposable Supplies (Level 2) ──
  INSERT INTO public.categories (name, slug, parent_id, level, display_order)
  VALUES ('Surgical & Disposable Supplies', 'surgical-disposable-supplies', _medical, 2, 2)
  ON CONFLICT (slug) DO NOTHING;
  SELECT id INTO _dept FROM public.categories WHERE slug = 'surgical-disposable-supplies';
  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('Syringes',                'syringes',                 _dept, 3, 1),
    ('Surgical Gloves',         'surgical-gloves',          _dept, 3, 2),
    ('Examination Gloves',      'examination-gloves',       _dept, 3, 3),
    ('Bandages & Dressings',    'bandages-dressings',       _dept, 3, 4),
    ('Surgical Masks',          'surgical-masks',           _dept, 3, 5),
    ('Surgical Instruments',    'surgical-instruments',     _dept, 3, 6),
    ('IV Sets & Cannulas',      'iv-sets-cannulas',         _dept, 3, 7),
    ('Sutures',                 'sutures',                  _dept, 3, 8)
  ON CONFLICT (slug) DO NOTHING;

  -- ── 1c. Patient Care & Mobility (Level 2) ──
  INSERT INTO public.categories (name, slug, parent_id, level, display_order)
  VALUES ('Patient Care & Mobility', 'patient-care-mobility', _medical, 2, 3)
  ON CONFLICT (slug) DO NOTHING;
  SELECT id INTO _dept FROM public.categories WHERE slug = 'patient-care-mobility';
  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('Wheelchairs',             'wheelchairs',              _dept, 3, 1),
    ('Walking Aids',            'walking-aids',             _dept, 3, 2),
    ('Hospital Beds',           'hospital-beds',            _dept, 3, 3),
    ('Nebulizers',              'nebulizers',               _dept, 3, 4),
    ('Hearing Aids',            'hearing-aids',             _dept, 3, 5),
    ('Orthopedic Supports',     'orthopedic-supports',      _dept, 3, 6)
  ON CONFLICT (slug) DO NOTHING;

  -- ── 1d. First Aid (Level 2) ──
  INSERT INTO public.categories (name, slug, parent_id, level, display_order)
  VALUES ('First Aid', 'first-aid', _medical, 2, 4)
  ON CONFLICT (slug) DO NOTHING;
  SELECT id INTO _dept FROM public.categories WHERE slug = 'first-aid';
  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('First Aid Kits',          'first-aid-kits',           _dept, 3, 1),
    ('Antiseptic Solutions',    'antiseptic-solutions',     _dept, 3, 2),
    ('Adhesive Tapes',          'adhesive-tapes',           _dept, 3, 3),
    ('Cotton & Gauze',          'cotton-gauze',             _dept, 3, 4)
  ON CONFLICT (slug) DO NOTHING;

  -- ══════════════════════════════════════════════════════════════════
  -- 2. NEW Level 1: Safety & PPE
  -- ══════════════════════════════════════════════════════════════════
  INSERT INTO public.categories (name, slug, parent_id, level, display_order)
  VALUES ('Safety & PPE', 'safety-ppe', NULL, 1, 13)
  ON CONFLICT (slug) DO NOTHING;
  SELECT id INTO _safety FROM public.categories WHERE slug = 'safety-ppe';

  -- ── 2a. PPE Kits & Coveralls (Level 2) ──
  INSERT INTO public.categories (name, slug, parent_id, level, display_order)
  VALUES ('PPE Kits & Coveralls', 'ppe-kits-coveralls', _safety, 2, 1)
  ON CONFLICT (slug) DO NOTHING;
  SELECT id INTO _dept FROM public.categories WHERE slug = 'ppe-kits-coveralls';
  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('PPE Kits',                'ppe-kits',                 _dept, 3, 1),
    ('Coveralls',               'coveralls',                _dept, 3, 2),
    ('Isolation Gowns',         'isolation-gowns',          _dept, 3, 3),
    ('Aprons',                  'safety-aprons',            _dept, 3, 4),
    ('Shoe Covers',             'shoe-covers',              _dept, 3, 5)
  ON CONFLICT (slug) DO NOTHING;

  -- ── 2b. Masks & Respirators (Level 2) ──
  INSERT INTO public.categories (name, slug, parent_id, level, display_order)
  VALUES ('Masks & Respirators', 'masks-respirators', _safety, 2, 2)
  ON CONFLICT (slug) DO NOTHING;
  SELECT id INTO _dept FROM public.categories WHERE slug = 'masks-respirators';
  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('Face Masks',              'face-masks',               _dept, 3, 1),
    ('N95 Respirators',         'n95-respirators',          _dept, 3, 2),
    ('Cloth Masks',             'cloth-masks',              _dept, 3, 3),
    ('Face Shields',            'face-shields',             _dept, 3, 4),
    ('Dust Masks',              'dust-masks',               _dept, 3, 5)
  ON CONFLICT (slug) DO NOTHING;

  -- ── 2c. Safety Gloves (Level 2) ──
  INSERT INTO public.categories (name, slug, parent_id, level, display_order)
  VALUES ('Safety Gloves', 'safety-gloves', _safety, 2, 3)
  ON CONFLICT (slug) DO NOTHING;
  SELECT id INTO _dept FROM public.categories WHERE slug = 'safety-gloves';
  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('Nitrile Gloves',          'nitrile-gloves',           _dept, 3, 1),
    ('Latex Gloves',            'latex-gloves',             _dept, 3, 2),
    ('Rubber Gloves',           'rubber-gloves',            _dept, 3, 3),
    ('Industrial Gloves',       'industrial-gloves',        _dept, 3, 4),
    ('Cut-Resistant Gloves',    'cut-resistant-gloves',     _dept, 3, 5)
  ON CONFLICT (slug) DO NOTHING;

  -- ── 2d. Eye & Head Protection (Level 2) ──
  INSERT INTO public.categories (name, slug, parent_id, level, display_order)
  VALUES ('Eye & Head Protection', 'eye-head-protection', _safety, 2, 4)
  ON CONFLICT (slug) DO NOTHING;
  SELECT id INTO _dept FROM public.categories WHERE slug = 'eye-head-protection';
  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('Safety Goggles',          'safety-goggles',           _dept, 3, 1),
    ('Safety Glasses',          'safety-glasses',           _dept, 3, 2),
    ('Hard Hats',               'hard-hats',                _dept, 3, 3),
    ('Welding Helmets',         'welding-helmets',          _dept, 3, 4)
  ON CONFLICT (slug) DO NOTHING;

  -- ── 2e. Safety Footwear & Hi-Vis (Level 2) ──
  INSERT INTO public.categories (name, slug, parent_id, level, display_order)
  VALUES ('Safety Footwear & Hi-Vis', 'safety-footwear-hivis', _safety, 2, 5)
  ON CONFLICT (slug) DO NOTHING;
  SELECT id INTO _dept FROM public.categories WHERE slug = 'safety-footwear-hivis';
  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('Safety Shoes',            'safety-shoes',             _dept, 3, 1),
    ('Safety Boots',            'safety-boots',             _dept, 3, 2),
    ('Hi-Vis Jackets',          'hi-vis-jackets',           _dept, 3, 3),
    ('Reflective Vests',        'reflective-vests',         _dept, 3, 4)
  ON CONFLICT (slug) DO NOTHING;

  -- ── 2f. Sanitizers & Disinfectants (Level 2) ──
  INSERT INTO public.categories (name, slug, parent_id, level, display_order)
  VALUES ('Sanitizers & Disinfectants', 'sanitizers-disinfectants', _safety, 2, 6)
  ON CONFLICT (slug) DO NOTHING;
  SELECT id INTO _dept FROM public.categories WHERE slug = 'sanitizers-disinfectants';
  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('Hand Sanitizers',         'hand-sanitizers',          _dept, 3, 1),
    ('Surface Disinfectants',   'surface-disinfectants',    _dept, 3, 2),
    ('Disinfectant Sprays',     'disinfectant-sprays',      _dept, 3, 3)
  ON CONFLICT (slug) DO NOTHING;

  -- ══════════════════════════════════════════════════════════════════
  -- 3. NEW Level 1: Industrial & Lab Supplies
  -- ══════════════════════════════════════════════════════════════════
  INSERT INTO public.categories (name, slug, parent_id, level, display_order)
  VALUES ('Industrial & Lab Supplies', 'industrial-lab-supplies', NULL, 1, 14)
  ON CONFLICT (slug) DO NOTHING;
  SELECT id INTO _industrial FROM public.categories WHERE slug = 'industrial-lab-supplies';

  -- ── 3a. Lab Equipment (Level 2) ──
  INSERT INTO public.categories (name, slug, parent_id, level, display_order)
  VALUES ('Lab Equipment', 'lab-equipment', _industrial, 2, 1)
  ON CONFLICT (slug) DO NOTHING;
  SELECT id INTO _dept FROM public.categories WHERE slug = 'lab-equipment';
  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('Microscopes',             'microscopes',              _dept, 3, 1),
    ('Lab Glassware',           'lab-glassware',            _dept, 3, 2),
    ('Pipettes',                'pipettes',                 _dept, 3, 3),
    ('Centrifuges',             'centrifuges',              _dept, 3, 4),
    ('Lab Consumables',         'lab-consumables',          _dept, 3, 5)
  ON CONFLICT (slug) DO NOTHING;

  -- ── 3b. Safety Signage & Barriers (Level 2) ──
  INSERT INTO public.categories (name, slug, parent_id, level, display_order)
  VALUES ('Safety Signage & Barriers', 'safety-signage-barriers', _industrial, 2, 2)
  ON CONFLICT (slug) DO NOTHING;
  SELECT id INTO _dept FROM public.categories WHERE slug = 'safety-signage-barriers';
  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('Safety Signs',            'safety-signs',             _dept, 3, 1),
    ('Caution Tapes',           'caution-tapes',            _dept, 3, 2),
    ('Traffic Cones',           'traffic-cones',            _dept, 3, 3)
  ON CONFLICT (slug) DO NOTHING;

  -- ══════════════════════════════════════════════════════════════════
  -- 4. EXPAND existing: Home & Kitchen → Bedding & Bath → Towel types
  -- ══════════════════════════════════════════════════════════════════

  -- The existing "towels" is a generic L3 under bedding-bath.
  -- We expand it into a dedicated L2 with specific towel types.

  -- Create new Level 2: Towels & Bath Linen under Home & Kitchen
  INSERT INTO public.categories (name, slug, parent_id, level, display_order)
  VALUES ('Towels & Bath Linen', 'towels-bath-linen', _home_kitchen, 2, 7)
  ON CONFLICT (slug) DO NOTHING;
  SELECT id INTO _dept FROM public.categories WHERE slug = 'towels-bath-linen';
  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('Bath Towels',             'bath-towels',              _dept, 3, 1),
    ('Hand Towels',             'hand-towels',              _dept, 3, 2),
    ('Face Towels',             'face-towels',              _dept, 3, 3),
    ('Beach Towels',            'beach-towels',             _dept, 3, 4),
    ('Kitchen Towels',          'kitchen-towels',           _dept, 3, 5),
    ('Towel Sets',              'towel-sets',               _dept, 3, 6),
    ('Bath Robes',              'bath-robes',               _dept, 3, 7),
    ('Bath Mats',               'bath-mats',                _dept, 3, 8)
  ON CONFLICT (slug) DO NOTHING;

  -- ══════════════════════════════════════════════════════════════════
  -- 5. EXPAND existing: Beauty & Health → add Wellness Devices
  -- ══════════════════════════════════════════════════════════════════

  INSERT INTO public.categories (name, slug, parent_id, level, display_order)
  VALUES ('Wellness Devices', 'wellness-devices', _beauty_health, 2, 7)
  ON CONFLICT (slug) DO NOTHING;
  SELECT id INTO _dept FROM public.categories WHERE slug = 'wellness-devices';
  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('Massagers',               'massagers',                _dept, 3, 1),
    ('Body Weighing Scales',    'body-weighing-scales',     _dept, 3, 2),
    ('Steam Inhalers',          'steam-inhalers',           _dept, 3, 3),
    ('Hot Water Bags',          'hot-water-bags',           _dept, 3, 4)
  ON CONFLICT (slug) DO NOTHING;

END $$;

-- ============================================================================
-- HSN codes for all new categories (India CBIC 8-digit)
-- Reference: Customs Tariff Act Schedule I/II, CBIC circulars
-- ON CONFLICT (category_slug) DO NOTHING for idempotency
-- ============================================================================
INSERT INTO public.category_hsn_codes (category_slug, hsn_code, description) VALUES

  -- ═══ Medical Equipment & Supplies (L1) ═══
  ('medical-equipment',        '90189099', 'Medical instruments & appliances — other'),

  -- Diagnostic Instruments (L2 + L3)
  ('diagnostic-instruments',   '90189099', 'Medical diagnostic instruments'),
  ('stethoscopes',             '90189011', 'Stethoscopes'),
  ('blood-pressure-monitors',  '90189019', 'Sphygmomanometers / blood pressure monitors'),
  ('thermometers',             '90251990', 'Clinical thermometers — other'),
  ('pulse-oximeters',          '90189099', 'Pulse oximeters'),
  ('glucometers',              '90272090', 'Glucometers / blood glucose monitoring'),
  ('otoscopes',                '90189039', 'Otoscopes & auriscopes'),
  ('medical-weighing-scales',  '84231010', 'Personal weighing machines — medical'),

  -- Surgical & Disposable Supplies (L2 + L3)
  ('surgical-disposable-supplies', '90189099', 'Surgical & disposable medical supplies'),
  ('syringes',                 '90183100', 'Hypodermic syringes'),
  ('surgical-gloves',          '40151200', 'Surgical gloves of vulcanised rubber'),
  ('examination-gloves',       '40151900', 'Examination gloves of vulcanised rubber — other'),
  ('bandages-dressings',       '30059010', 'Bandages & dressings — wadding, gauze'),
  ('surgical-masks',           '63079030', 'Surgical face masks of textile material'),
  ('surgical-instruments',     '90189041', 'Surgical knives, scissors & blades'),
  ('iv-sets-cannulas',         '90183990', 'Cannulae, IV sets — other'),
  ('sutures',                  '30061010', 'Sterile surgical catgut & sutures'),

  -- Patient Care & Mobility (L2 + L3)
  ('patient-care-mobility',    '90211090', 'Orthopedic / patient care appliances'),
  ('wheelchairs',              '87131000', 'Wheelchairs — not mechanically propelled'),
  ('walking-aids',             '90211010', 'Walking sticks, crutches & walking aids'),
  ('hospital-beds',            '94029090', 'Hospital beds — medical furniture'),
  ('nebulizers',               '90192090', 'Nebulizers / inhalers for medical use'),
  ('hearing-aids',             '90214000', 'Hearing aids'),
  ('orthopedic-supports',      '90211090', 'Orthopedic braces, supports & splints'),

  -- First Aid (L2 + L3)
  ('first-aid',                '30059090', 'First aid supplies'),
  ('first-aid-kits',           '30069100', 'First aid boxes and kits'),
  ('antiseptic-solutions',     '30049099', 'Antiseptic / disinfectant medicaments'),
  ('adhesive-tapes',           '30059090', 'Adhesive medical tapes & plasters'),
  ('cotton-gauze',             '30059010', 'Absorbent cotton & surgical gauze'),

  -- ═══ Safety & PPE (L1) ═══
  ('safety-ppe',               '63079090', 'Safety & personal protective equipment'),

  -- PPE Kits & Coveralls (L2 + L3)
  ('ppe-kits-coveralls',       '62101090', 'Garments of protective / PPE type'),
  ('ppe-kits',                 '62101020', 'PPE kits — complete personal protective sets'),
  ('coveralls',                '62101010', 'Coveralls / boiler suits of protective type'),
  ('isolation-gowns',          '62101090', 'Isolation gowns — protective garments'),
  ('safety-aprons',            '62101090', 'Safety aprons — protective'),
  ('shoe-covers',              '64069090', 'Shoe covers — disposable protective'),

  -- Masks & Respirators (L2 + L3)
  ('masks-respirators',        '63079090', 'Masks & respiratory protection'),
  ('face-masks',               '63079030', 'Textile face masks — protective'),
  ('n95-respirators',          '63079040', 'N95 / FFP2 respirator masks'),
  ('cloth-masks',              '63079010', 'Cloth face masks — reusable'),
  ('face-shields',             '39269099', 'Face shields / visors of plastic'),
  ('dust-masks',               '63079090', 'Dust masks — non-medical textile'),

  -- Safety Gloves (L2 + L3)
  ('safety-gloves',            '40151990', 'Safety gloves — rubber & synthetic'),
  ('nitrile-gloves',           '40151910', 'Nitrile gloves — disposable'),
  ('latex-gloves',             '40151200', 'Latex gloves — vulcanised rubber'),
  ('rubber-gloves',            '40151990', 'Rubber gloves — general purpose'),
  ('industrial-gloves',        '42032910', 'Industrial gloves of leather'),
  ('cut-resistant-gloves',     '61161090', 'Cut-resistant gloves — knitted'),

  -- Eye & Head Protection (L2 + L3)
  ('eye-head-protection',      '90049010', 'Eye & head protective equipment'),
  ('safety-goggles',           '90049010', 'Safety goggles — protective'),
  ('safety-glasses',           '90049090', 'Safety glasses — protective'),
  ('hard-hats',                '65061010', 'Safety helmets / hard hats'),
  ('welding-helmets',          '65061090', 'Welding helmets & shields'),

  -- Safety Footwear & Hi-Vis (L2 + L3)
  ('safety-footwear-hivis',    '64034000', 'Safety footwear & visibility gear'),
  ('safety-shoes',             '64034000', 'Safety shoes with protective toe-cap'),
  ('safety-boots',             '64035190', 'Safety boots with protective features'),
  ('hi-vis-jackets',           '62101090', 'High visibility jackets — reflective'),
  ('reflective-vests',         '62101090', 'Reflective safety vests'),

  -- Sanitizers & Disinfectants (L2 + L3)
  ('sanitizers-disinfectants', '38089410', 'Disinfectants & sanitizers'),
  ('hand-sanitizers',          '38089410', 'Hand sanitizer — alcohol-based'),
  ('surface-disinfectants',    '38089490', 'Surface disinfectants — chemical'),
  ('disinfectant-sprays',      '38089490', 'Disinfectant sprays — aerosol'),

  -- ═══ Industrial & Lab Supplies (L1) ═══
  ('industrial-lab-supplies',  '90279090', 'Industrial & laboratory supplies'),

  -- Lab Equipment (L2 + L3)
  ('lab-equipment',            '90279090', 'Laboratory instruments & apparatus'),
  ('microscopes',              '90119000', 'Optical microscopes — compound'),
  ('lab-glassware',            '70179090', 'Laboratory glassware — borosilicate'),
  ('pipettes',                 '70179020', 'Pipettes — glass, graduated'),
  ('centrifuges',              '84211990', 'Centrifuges — laboratory'),
  ('lab-consumables',          '39269099', 'Lab consumables — plastic articles'),

  -- Safety Signage & Barriers (L2 + L3)
  ('safety-signage-barriers',  '83100000', 'Sign plates & name plates'),
  ('safety-signs',             '83100000', 'Safety signs — metal / plastic'),
  ('caution-tapes',            '39199090', 'Caution barrier tape — self-adhesive plastic'),
  ('traffic-cones',            '39269099', 'Traffic cones — plastic articles'),

  -- ═══ Towels & Bath Linen — expanded under Home & Kitchen ═══
  ('towels-bath-linen',        '63026000', 'Towels & bath linen — terry towelling'),
  ('bath-towels',              '63026000', 'Bath towels — terry towelling of cotton'),
  ('hand-towels',              '63026000', 'Hand towels — terry towelling of cotton'),
  ('face-towels',              '63026000', 'Face towels — terry towelling of cotton'),
  ('beach-towels',             '63026000', 'Beach towels — terry towelling of cotton'),
  ('kitchen-towels',           '63029300', 'Kitchen towels of man-made fibres'),
  ('towel-sets',               '63026000', 'Towel sets — terry towelling of cotton'),
  ('bath-robes',               '62089200', 'Bath robes of man-made fibres'),
  ('bath-mats',                '57050090', 'Bath mats — textile floor covering'),

  -- ═══ Wellness Devices — expanded under Beauty & Health ═══
  ('wellness-devices',         '90189099', 'Wellness & personal care devices'),
  ('massagers',                '90191090', 'Massage apparatus — mechano-therapy'),
  ('body-weighing-scales',     '84231010', 'Body weighing scales — personal'),
  ('steam-inhalers',           '90192090', 'Steam inhalers — vaporizers'),
  ('hot-water-bags',           '39249090', 'Hot water bags / bottles — rubber or plastic')

ON CONFLICT (category_slug) DO NOTHING;
