-- ============================================================================
-- BzeadStore Categories (3-Level Hierarchy)
-- Level 1: Main Category (Electronics, Fashion, ...)
-- Level 2: Department   (Mobiles & Accessories, Computers & Laptops, ...)
-- Level 3: Subcategory  (Smartphones, Feature Phones, ...)
-- Run this AFTER auth_tables.sql in Supabase SQL Editor
-- ============================================================================

-- ============================================================================
-- 1. TABLE: Single self-referencing categories table
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  parent_id UUID REFERENCES public.categories(id) ON DELETE CASCADE,
  level INT NOT NULL DEFAULT 1 CHECK (level IN (1, 2, 3)),
  display_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_categories_parent ON public.categories (parent_id);
CREATE INDEX IF NOT EXISTS idx_categories_level ON public.categories (level, display_order);
CREATE INDEX IF NOT EXISTS idx_categories_active ON public.categories (is_active, level, display_order);
CREATE INDEX IF NOT EXISTS idx_categories_slug ON public.categories (slug);

-- ============================================================================
-- 2. ENABLE RLS
-- ============================================================================
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 3. RLS POLICIES
-- ============================================================================

-- Everyone can read active categories (mega menu, search, browse)
CREATE POLICY "categories_select_active"
  ON public.categories
  FOR SELECT
  USING (is_active = true);

-- Admins can manage categories
CREATE POLICY "categories_admin_insert"
  ON public.categories
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE POLICY "categories_admin_update"
  ON public.categories
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE POLICY "categories_admin_delete"
  ON public.categories
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- ============================================================================
-- 4. TRIGGER: Auto-update updated_at
-- ============================================================================
DROP TRIGGER IF EXISTS categories_updated_at ON public.categories;
CREATE TRIGGER categories_updated_at
  BEFORE UPDATE ON public.categories
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();


-- ============================================================================
-- 5. SEED DATA: Full 3-level category tree
-- ============================================================================

-- Helper: We use CTEs with DO blocks to insert parent first, then children.
-- Using a transaction block for atomicity.

DO $$
DECLARE
  -- Level 1 IDs
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

  -- Level 2 IDs (temp vars reused per main category)
  _dept UUID;
BEGIN

  -- ========== ELECTRONICS ==========
  INSERT INTO public.categories (name, slug, parent_id, level, display_order)
  VALUES ('Electronics', 'electronics', NULL, 1, 1) RETURNING id INTO _electronics;

  -- Mobiles & Accessories
  INSERT INTO public.categories (name, slug, parent_id, level, display_order)
  VALUES ('Mobiles & Accessories', 'mobiles-accessories', _electronics, 2, 1) RETURNING id INTO _dept;
  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('Smartphones', 'smartphones', _dept, 3, 1),
    ('Feature Phones', 'feature-phones', _dept, 3, 2),
    ('Chargers & Cables', 'chargers-cables', _dept, 3, 3),
    ('Phone Cases', 'phone-cases', _dept, 3, 4),
    ('Screen Protectors', 'screen-protectors', _dept, 3, 5);

  -- Computers & Laptops
  INSERT INTO public.categories (name, slug, parent_id, level, display_order)
  VALUES ('Computers & Laptops', 'computers-laptops', _electronics, 2, 2) RETURNING id INTO _dept;
  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('Laptops', 'laptops', _dept, 3, 1),
    ('Desktops', 'desktops', _dept, 3, 2),
    ('Monitors', 'monitors', _dept, 3, 3),
    ('Keyboards & Mice', 'keyboards-mice', _dept, 3, 4);

  -- Audio
  INSERT INTO public.categories (name, slug, parent_id, level, display_order)
  VALUES ('Audio', 'audio', _electronics, 2, 3) RETURNING id INTO _dept;
  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('Headphones', 'headphones', _dept, 3, 1),
    ('Earbuds', 'earbuds', _dept, 3, 2),
    ('Speakers', 'speakers', _dept, 3, 3);

  -- Cameras
  INSERT INTO public.categories (name, slug, parent_id, level, display_order)
  VALUES ('Cameras', 'cameras', _electronics, 2, 4) RETURNING id INTO _dept;
  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('DSLR', 'dslr', _dept, 3, 1),
    ('Mirrorless', 'mirrorless', _dept, 3, 2),
    ('Action Cameras', 'action-cameras', _dept, 3, 3);

  -- Smart Devices
  INSERT INTO public.categories (name, slug, parent_id, level, display_order)
  VALUES ('Smart Devices', 'smart-devices', _electronics, 2, 5) RETURNING id INTO _dept;
  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('Smartwatches', 'smartwatches', _dept, 3, 1),
    ('Smart Home', 'smart-home', _dept, 3, 2);


  -- ========== FASHION ==========
  INSERT INTO public.categories (name, slug, parent_id, level, display_order)
  VALUES ('Fashion', 'fashion', NULL, 1, 2) RETURNING id INTO _fashion;

  -- Men
  INSERT INTO public.categories (name, slug, parent_id, level, display_order)
  VALUES ('Men', 'men', _fashion, 2, 1) RETURNING id INTO _dept;
  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('Shirts', 'shirts', _dept, 3, 1),
    ('T-Shirts', 't-shirts', _dept, 3, 2),
    ('Jeans', 'jeans', _dept, 3, 3),
    ('Footwear', 'mens-footwear', _dept, 3, 4);

  -- Women
  INSERT INTO public.categories (name, slug, parent_id, level, display_order)
  VALUES ('Women', 'women', _fashion, 2, 2) RETURNING id INTO _dept;
  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('Dresses', 'dresses', _dept, 3, 1),
    ('Tops', 'tops', _dept, 3, 2),
    ('Handbags', 'handbags', _dept, 3, 3),
    ('Jewelry', 'jewelry', _dept, 3, 4);

  -- Kids
  INSERT INTO public.categories (name, slug, parent_id, level, display_order)
  VALUES ('Kids', 'kids', _fashion, 2, 3) RETURNING id INTO _dept;
  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('Boys Clothing', 'boys-clothing', _dept, 3, 1),
    ('Girls Clothing', 'girls-clothing', _dept, 3, 2),
    ('School Wear', 'school-wear', _dept, 3, 3);


  -- ========== HOME & KITCHEN ==========
  INSERT INTO public.categories (name, slug, parent_id, level, display_order)
  VALUES ('Home & Kitchen', 'home-kitchen', NULL, 1, 3) RETURNING id INTO _home_kitchen;

  INSERT INTO public.categories (name, slug, parent_id, level, display_order)
  VALUES ('Furniture', 'furniture', _home_kitchen, 2, 1) RETURNING id INTO _dept;
  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('Sofas', 'sofas', _dept, 3, 1),
    ('Beds', 'beds', _dept, 3, 2),
    ('Tables', 'tables', _dept, 3, 3);

  INSERT INTO public.categories (name, slug, parent_id, level, display_order)
  VALUES ('Kitchen', 'kitchen', _home_kitchen, 2, 2) RETURNING id INTO _dept;
  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('Cookware', 'cookware', _dept, 3, 1),
    ('Storage', 'storage', _dept, 3, 2),
    ('Appliances', 'kitchen-appliances', _dept, 3, 3);

  INSERT INTO public.categories (name, slug, parent_id, level, display_order)
  VALUES ('Decor', 'decor', _home_kitchen, 2, 3) RETURNING id INTO _dept;
  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('Wall Art', 'wall-art', _dept, 3, 1),
    ('Lighting', 'lighting', _dept, 3, 2);


  -- ========== BEAUTY & HEALTH ==========
  INSERT INTO public.categories (name, slug, parent_id, level, display_order)
  VALUES ('Beauty & Health', 'beauty-health', NULL, 1, 4) RETURNING id INTO _beauty_health;

  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('Skincare', 'skincare', _beauty_health, 2, 1),
    ('Haircare', 'haircare', _beauty_health, 2, 2),
    ('Makeup', 'makeup', _beauty_health, 2, 3),
    ('Grooming', 'grooming', _beauty_health, 2, 4),
    ('Supplements', 'supplements', _beauty_health, 2, 5);


  -- ========== GROCERY ==========
  INSERT INTO public.categories (name, slug, parent_id, level, display_order)
  VALUES ('Grocery', 'grocery', NULL, 1, 5) RETURNING id INTO _grocery;

  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('Snacks', 'snacks', _grocery, 2, 1),
    ('Beverages', 'beverages', _grocery, 2, 2),
    ('Packaged Food', 'packaged-food', _grocery, 2, 3),
    ('Household Essentials', 'household-essentials', _grocery, 2, 4);


  -- ========== SPORTS & OUTDOORS ==========
  INSERT INTO public.categories (name, slug, parent_id, level, display_order)
  VALUES ('Sports & Outdoors', 'sports-outdoors', NULL, 1, 6) RETURNING id INTO _sports;

  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('Fitness Equipment', 'fitness-equipment', _sports, 2, 1),
    ('Cycling', 'cycling', _sports, 2, 2),
    ('Camping', 'camping', _sports, 2, 3),
    ('Outdoor Gear', 'outdoor-gear', _sports, 2, 4);


  -- ========== TOYS & BABY ==========
  INSERT INTO public.categories (name, slug, parent_id, level, display_order)
  VALUES ('Toys & Baby', 'toys-baby', NULL, 1, 7) RETURNING id INTO _toys_baby;

  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('Toys & Games', 'toys-games', _toys_baby, 2, 1),
    ('Baby Care', 'baby-care', _toys_baby, 2, 2),
    ('School Supplies', 'school-supplies', _toys_baby, 2, 3);


  -- ========== AUTOMOTIVE ==========
  INSERT INTO public.categories (name, slug, parent_id, level, display_order)
  VALUES ('Automotive', 'automotive', NULL, 1, 8) RETURNING id INTO _automotive;

  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('Car Accessories', 'car-accessories', _automotive, 2, 1),
    ('Bike Accessories', 'bike-accessories', _automotive, 2, 2),
    ('Tools', 'automotive-tools', _automotive, 2, 3);


  -- ========== BOOKS & MEDIA ==========
  INSERT INTO public.categories (name, slug, parent_id, level, display_order)
  VALUES ('Books & Media', 'books-media', NULL, 1, 9) RETURNING id INTO _books_media;

  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('Books', 'books', _books_media, 2, 1),
    ('Educational', 'educational', _books_media, 2, 2),
    ('Movies', 'movies', _books_media, 2, 3),
    ('Music', 'music', _books_media, 2, 4);


  -- ========== GAMING ==========
  INSERT INTO public.categories (name, slug, parent_id, level, display_order)
  VALUES ('Gaming', 'gaming', NULL, 1, 10) RETURNING id INTO _gaming;

  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('Consoles', 'consoles', _gaming, 2, 1),
    ('Video Games', 'video-games', _gaming, 2, 2),
    ('Gaming Accessories', 'gaming-accessories', _gaming, 2, 3);


  -- ========== PETS ==========
  INSERT INTO public.categories (name, slug, parent_id, level, display_order)
  VALUES ('Pets', 'pets', NULL, 1, 11) RETURNING id INTO _pets;

  INSERT INTO public.categories (name, slug, parent_id, level, display_order) VALUES
    ('Pet Food', 'pet-food', _pets, 2, 1),
    ('Pet Accessories', 'pet-accessories', _pets, 2, 2),
    ('Pet Grooming', 'pet-grooming', _pets, 2, 3);

END;
$$;
