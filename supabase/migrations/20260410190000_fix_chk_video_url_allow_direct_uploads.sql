-- Fix chk_video_url constraint to allow both:
--   1. YouTube embed URLs: https://www.youtube.com/embed/{11-char-id}
--   2. Direct video file URLs (Supabase Storage public URLs or any https video URL)
--      e.g. https://*.supabase.co/storage/v1/object/public/video-ads/...mp4

ALTER TABLE banners DROP CONSTRAINT IF EXISTS chk_video_url;

ALTER TABLE banners ADD CONSTRAINT chk_video_url
  CHECK (
    video_url IS NULL
    OR video_url ~ '^https://www\.youtube\.com/embed/[a-zA-Z0-9_-]{11}(\?.*)?$'
    OR video_url ~ '^https://.+\.(mp4|webm|mov|mpeg|avi)(\?.*)?$'
    OR video_url ~ '^https://.+/storage/v1/object/public/.+'
  );
