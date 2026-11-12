-- 1. Add server-side CHECK on video_url: only allow safe YouTube embed URLs
ALTER TABLE banners DROP CONSTRAINT IF EXISTS chk_video_url;
ALTER TABLE banners ADD CONSTRAINT chk_video_url
  CHECK (video_url IS NULL OR video_url ~ '^https://www\.youtube\.com/embed/[a-zA-Z0-9_-]{11}$');

-- 2. Merge separate public-read policies into a single SELECT policy
--    so admins can see ALL banners (including inactive) while public sees only active
DROP POLICY IF EXISTS "Public read active banners" ON banners;
DROP POLICY IF EXISTS "banners_public_read" ON banners;

-- Recreate a unified SELECT policy: public sees active, admins see all
CREATE POLICY "banners_select"
  ON banners FOR SELECT
  USING (
    is_active = true
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );
