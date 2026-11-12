-- =============================================================================
-- BUYER CANCEL ORDER — SECURITY DEFINER RPC
--
-- Buyers have SELECT-only access to public.orders via RLS. They have no
-- UPDATE policy, so the previous client-side cancel flow silently failed
-- (0 rows affected → "Order status has already changed" error in the UI).
--
-- This function validates ownership + cancellable status server-side and
-- performs the cancellation in a single transaction. Side-effect rows
-- (order_cancellations, order_status_history) are written here too so the
-- buyer client only needs one RPC call.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.cancel_order_by_user(
  p_order_id uuid,
  p_reason   text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid           uuid := auth.uid();
  v_order         record;
  v_updated_rows  int;
  v_normalized    text;
  v_cancellable   text[] := ARRAY['pending','new','processing','accepted'];
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cancellation reason required');
  END IF;

  SELECT id, status, total_amount, user_id
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  LIMIT 1;

  IF v_order.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF v_order.user_id <> v_uid THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not your order');
  END IF;

  v_normalized := CASE WHEN v_order.status = 'pending' THEN 'new' ELSE v_order.status END;
  IF NOT (v_normalized = ANY(v_cancellable)) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   format('Cannot cancel order in "%s" status', v_order.status)
    );
  END IF;

  UPDATE public.orders
  SET status              = 'cancelled',
      cancellation_reason = p_reason,
      cancelled_at        = now(),
      cancelled_by        = v_uid,
      updated_at          = now()
  WHERE id = p_order_id
    AND status = v_order.status;

  GET DIAGNOSTICS v_updated_rows = ROW_COUNT;

  IF v_updated_rows = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   'Order status has already changed. Please refresh and try again.'
    );
  END IF;

  INSERT INTO public.order_cancellations (
    order_id, cancelled_by, role, reason, status, refund_status, refund_amount
  ) VALUES (
    p_order_id, v_uid, 'buyer', p_reason, 'cancelled',
    CASE WHEN coalesce(v_order.total_amount, 0) > 0 THEN 'pending' ELSE 'not_applicable' END,
    coalesce(v_order.total_amount, 0)
  );

  INSERT INTO public.order_status_history (
    order_id, from_status, to_status, changed_by, role, note
  ) VALUES (
    p_order_id, v_order.status, 'cancelled', v_uid, 'buyer',
    'Cancelled by buyer: ' || p_reason
  );

  RETURN jsonb_build_object(
    'success',     true,
    'order_id',    p_order_id,
    'from_status', v_order.status,
    'to_status',   'cancelled'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_order_by_user(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_order_by_user(uuid, text) TO authenticated;

COMMIT;
