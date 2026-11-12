-- Fix log_wallet_transaction_audit: financial_audit_log has user_id, not seller_id.
-- The original trigger referenced a non-existent column, which made every
-- seller_wallet_transactions INSERT (and therefore credit_seller_on_delivery, which
-- runs on order status -> delivered) fail. That blocked every Shiprocket DELIVERED
-- webhook from updating the order. Fixing here so all future deliveries credit cleanly.

CREATE OR REPLACE FUNCTION public.log_wallet_transaction_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.financial_audit_log (event_type, order_id, user_id, amount, currency, metadata)
  VALUES (
    CASE WHEN NEW.type = 'credit' THEN 'seller_credited' ELSE 'seller_debited' END,
    NEW.order_id,
    NEW.seller_id,
    NEW.amount,
    'INR',
    jsonb_build_object('source', NEW.source, 'wallet_txn_id', NEW.id)
  );
  RETURN NEW;
END;
$function$;
