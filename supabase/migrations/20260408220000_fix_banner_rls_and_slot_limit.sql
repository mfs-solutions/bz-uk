-- Fix: Replace overly permissive SELECT policy with active-only for public
DROP POLICY IF EXISTS "Anyone can read active banners" ON banners;
CREATE POLICY "Public read active banners" ON banners FOR SELECT
  USING (is_active = true);

-- Re-create admin full-access policy
DROP POLICY IF EXISTS "Admins manage banners" ON banners;
CREATE POLICY "Admins manage banners" ON banners FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Server-side max 5 ad banners per slot
CREATE OR REPLACE FUNCTION check_max_ad_banners_per_slot()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.banner_type = 'ad' AND NEW.ad_slot IS NOT NULL THEN
    IF (SELECT COUNT(*) FROM banners
        WHERE banner_type = 'ad'
          AND ad_slot = NEW.ad_slot
          AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
       ) >= 5 THEN
      RAISE EXCEPTION 'Maximum 5 ad banners per slot (slot %). Limit reached.', NEW.ad_slot;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_max_ad_banners_per_slot ON banners;
CREATE TRIGGER trg_max_ad_banners_per_slot
  BEFORE INSERT OR UPDATE ON banners
  FOR EACH ROW EXECUTE FUNCTION check_max_ad_banners_per_slot();
