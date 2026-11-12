-- Add notification_preferences JSONB column to profiles table
-- Stores: { emailNotifications: bool, orderUpdates: bool, promotions: bool }
-- Default: all enabled except promotions

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notification_preferences JSONB
  NOT NULL
  DEFAULT '{"emailNotifications": true, "orderUpdates": true, "promotions": false}'::jsonb;
