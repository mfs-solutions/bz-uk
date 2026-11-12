-- Add banner_type column to differentiate hero carousel vs ad banners
ALTER TABLE banners ADD COLUMN IF NOT EXISTS banner_type TEXT NOT NULL DEFAULT 'hero';

-- Allow 'hero' (top carousel) and 'ad' (between sections)
ALTER TABLE banners ADD CONSTRAINT banners_type_check CHECK (banner_type IN ('hero', 'ad'));

-- Index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_banners_type_active ON banners (banner_type, is_active, position);
