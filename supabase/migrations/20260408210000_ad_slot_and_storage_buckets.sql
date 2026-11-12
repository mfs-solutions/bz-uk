-- Add ad_slot column for 3 ad banner placement slots
ALTER TABLE banners ADD COLUMN IF NOT EXISTS ad_slot integer;

-- Set existing ad banners to slot 1 by default
UPDATE banners SET ad_slot = 1 WHERE banner_type = 'ad' AND ad_slot IS NULL;

-- Constraint: ad_slot must be 1, 2, or 3 when banner_type is 'ad'
DO $$ BEGIN
  ALTER TABLE banners ADD CONSTRAINT chk_ad_slot
    CHECK (banner_type != 'ad' OR (ad_slot IS NOT NULL AND ad_slot BETWEEN 1 AND 3));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Storage buckets (hero-banners, ad-banners, video-ads) created via API
-- with public read + authenticated upload/delete policies.
