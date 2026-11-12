-- ============================================================================
-- Notification System for Sellers
-- ============================================================================

-- Create notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'identity_approved', 'identity_rejected', 'identity_pending',
    'product_approved', 'product_rejected',
    'order_new', 'order_cancelled',
    'payout_completed', 'payout_failed',
    'system', 'info'
  )),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications(user_id, is_read) WHERE is_read = FALSE;
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at DESC);

-- RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Sellers can read their own notifications
CREATE POLICY "Users can view own notifications"
  ON public.notifications
  FOR SELECT
  USING (auth.uid() = user_id);

-- Sellers can update (mark as read) their own notifications
CREATE POLICY "Users can update own notifications"
  ON public.notifications
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Service role (triggers) can insert notifications for any user
CREATE POLICY "Service can insert notifications"
  ON public.notifications
  FOR INSERT
  WITH CHECK (true);

-- ============================================================================
-- Trigger: Auto-notify seller when product approval_status changes
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_notify_product_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only fire when approval_status changes
  IF OLD.approval_status IS DISTINCT FROM NEW.approval_status THEN
    IF NEW.approval_status = 'approved' THEN
      INSERT INTO public.notifications (user_id, type, title, message, metadata)
      VALUES (
        NEW.seller_id,
        'product_approved',
        'Product Approved!',
        'Congratulations! Your product "' || COALESCE(NEW.name, 'Untitled') || '" has been approved by admin and is now live on the marketplace.',
        jsonb_build_object('product_id', NEW.id, 'product_name', NEW.name)
      );
    ELSIF NEW.approval_status = 'rejected' THEN
      INSERT INTO public.notifications (user_id, type, title, message, metadata)
      VALUES (
        NEW.seller_id,
        'product_rejected',
        'Product Rejected',
        'Your product "' || COALESCE(NEW.name, 'Untitled') || '" has been rejected by admin. Please review the listing guidelines and re-submit.',
        jsonb_build_object('product_id', NEW.id, 'product_name', NEW.name)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_product_status_notification ON public.products;
CREATE TRIGGER trg_product_status_notification
  AFTER UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_notify_product_status_change();

-- ============================================================================
-- Trigger: Auto-notify seller when KYC / identity verification status changes
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_notify_kyc_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  seller_name TEXT;
BEGIN
  IF OLD.kyc_status IS DISTINCT FROM NEW.kyc_status THEN
    -- Try to get a friendly name
    seller_name := COALESCE(NEW.full_name, NEW.business_name, 'Seller');

    IF NEW.kyc_status = 'approved' THEN
      INSERT INTO public.notifications (user_id, type, title, message, metadata)
      VALUES (
        NEW.seller_id,
        'identity_approved',
        'Identity Verified!',
        'Congratulations ' || seller_name || '! Your identity verification has been approved. You can now create your Brand ID and list your products.',
        jsonb_build_object('kyc_id', NEW.id)
      );
    ELSIF NEW.kyc_status = 'rejected' THEN
      INSERT INTO public.notifications (user_id, type, title, message, metadata)
      VALUES (
        NEW.seller_id,
        'identity_rejected',
        'Verification Rejected',
        'Hi ' || seller_name || ', your identity verification has been rejected. Please review the requirements and re-submit your documents.',
        jsonb_build_object('kyc_id', NEW.id)
      );
    ELSIF NEW.kyc_status = 'pending' AND (OLD.kyc_status IS NULL OR OLD.kyc_status = 'unverified') THEN
      INSERT INTO public.notifications (user_id, type, title, message, metadata)
      VALUES (
        NEW.seller_id,
        'identity_pending',
        'Verification Submitted',
        'Hi ' || seller_name || ', your identity verification documents have been received and are under review. We''ll notify you once the review is complete.',
        jsonb_build_object('kyc_id', NEW.id)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_kyc_status_notification ON public.seller_kyc;
CREATE TRIGGER trg_kyc_status_notification
  AFTER UPDATE ON public.seller_kyc
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_notify_kyc_status_change();

-- Enable realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;