-- ============================================================================
-- Cleanup: remove orphaned categories (level > 1 with NULL parent_id)
-- Root cause: migration 20260316150000_expand_categories_and_hsn.sql used
-- wrong slugs to look up parent IDs. When SELECT INTO returned NULL,
-- child categories were inserted with parent_id = NULL, creating orphans
-- that appeared as broken top-level items in the MegaMenu.
--
-- Slug mismatches:
--   home-kitchen   → actual: home-garden
--   beauty-health  → actual: beauty-personal-care
--   grocery        → actual: grocery-gourmet-food
--   sports-outdoors→ actual: sports-fitness-outdoors
--   toys-baby      → actual: toys-games-baby-products
--   automotive     → actual: automotive-industrial
--   books-media    → actual: books
--   gaming         → (does not exist)
--   pets           → (does not exist)
--
-- This migration:
-- 1. Deletes orphaned categories (already applied via Supabase API)
-- 2. Adds a CHECK constraint to prevent future orphans
-- ============================================================================

-- 1. Delete orphaned categories (level > 1 but no parent)
DELETE FROM public.categories
WHERE parent_id IS NULL AND level > 1;

-- 2. Prevent future orphans: level > 1 MUST have a parent_id
ALTER TABLE public.categories
  DROP CONSTRAINT IF EXISTS categories_parent_required_for_children;

ALTER TABLE public.categories
  ADD CONSTRAINT categories_parent_required_for_children
  CHECK (level = 1 OR parent_id IS NOT NULL);
