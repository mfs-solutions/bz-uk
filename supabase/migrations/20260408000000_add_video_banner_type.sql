-- Add video_url column for video ad banners (YouTube embed URLs)
ALTER TABLE banners ADD COLUMN IF NOT EXISTS video_url TEXT;

-- Drop old constraint and re-create with 'video' type included
ALTER TABLE banners DROP CONSTRAINT IF EXISTS banners_type_check;
ALTER TABLE banners ADD CONSTRAINT banners_type_check CHECK (banner_type IN ('hero', 'ad', 'video'));
