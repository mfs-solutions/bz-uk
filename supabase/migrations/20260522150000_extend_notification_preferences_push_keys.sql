-- Extend `profiles.notification_preferences` default with push-notification keys.
--
-- Adds new master + per-category push toggles used by:
--   - src/components/settings/PushNotificationSettings.tsx (UI)
--   - supabase/functions/send-push-notification/index.ts   (server-side filter)
--
-- Backwards compatible: existing rows are left untouched; missing keys are
-- resolved to defaults at read time via the helpers in
-- `src/lib/notificationPreferences.ts` (client) and the inline fallbacks in
-- the edge function. Only the column DEFAULT is updated so NEW signups get
-- the full shape immediately.
--
-- Defaults:
--   push_enabled     = true   (master switch)
--   push_orders      = true
--   push_returns     = true
--   push_account     = true
--   push_system      = true
--   push_promotions  = false  (marketing requires explicit opt-in)

ALTER TABLE public.profiles
  ALTER COLUMN notification_preferences
  SET DEFAULT '{
    "emailNotifications": true,
    "orderUpdates": true,
    "promotions": false,
    "push_enabled": true,
    "push_orders": true,
    "push_returns": true,
    "push_account": true,
    "push_system": true,
    "push_promotions": false
  }'::jsonb;
