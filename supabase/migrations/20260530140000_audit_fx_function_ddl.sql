-- =============================================================================
-- DDL AUDIT GUARD FOR FX / ORDER / MARKUP FUNCTIONS
--
-- Why this exists:
--   On 2026-05-26 create_order_secure was silently reverted OUT-OF-BAND on the
--   live database to a pre-fix body (v_fx := greatest(coalesce(p_fx_rate,1),..)),
--   which mislabeled a foreign-currency order total (ORD-1779833529, £3805 vs
--   £29.58). Postgres keeps no DDL history and Supabase records nothing beyond
--   schema_migrations, so that revert left no trace and was undetectable.
--
-- What this does:
--   Logs every CREATE/ALTER of the critical FX / order / markup functions into
--   public.fx_function_ddl_audit, capturing who changed it, when, and the new
--   body. Any future out-of-band revert is therefore RECORDED, not silent.
--
-- Safety guarantees (verified before writing this migration):
--   * A ddl_command_end event trigger fires ONLY on DDL (CREATE/ALTER/DROP),
--     NEVER on DML (INSERT/UPDATE/SELECT) and NEVER on function execution.
--     => Order creation, markup calculation, FX and payouts are unaffected.
--   * None of the watched functions run DDL internally (no CREATE TEMP TABLE
--     etc.), so the trigger never fires during checkout.
--   * The trigger body is wrapped in an exception-swallowing block: if auditing
--     ever fails it can NEVER abort the underlying DDL command.
--   * It only acts on a fixed allow-list of function names; all other DDL is
--     ignored (pass-through, zero behaviour change).
-- =============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Audit table. RLS enabled with no policies => no client (anon/authenticated)
--    can read or write it. Inserts happen only via the SECURITY DEFINER event
--    trigger function (owner bypasses RLS). service_role retains full access.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fx_function_ddl_audit (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  changed_at       timestamptz NOT NULL DEFAULT now(),
  db_user          text        NOT NULL DEFAULT current_user,
  object_identity  text        NOT NULL,
  command_tag      text        NOT NULL,
  function_body    text
);

ALTER TABLE public.fx_function_ddl_audit ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 2. Event trigger function. Fail-safe: never raises, never blocks DDL.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_fx_function_ddl()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r       record;
  v_name  text;
  v_body  text;
  v_watch text[] := ARRAY[
    'public.create_order_secure',
    'public.lock_order_fx_snapshot',
    'public.refresh_order_seller_subtotal',
    'public.get_public_product_prices_with_overrides',
    'public.get_public_product_prices',
    'public.apply_order_item_price_snapshots',
    'public.sync_country_price_markup_percent',
    'public.sync_products_default_selling_price'
  ];
BEGIN
  FOR r IN SELECT * FROM pg_event_trigger_ddl_commands() LOOP
    IF r.object_type = 'function' THEN
      -- object_identity looks like 'public.create_order_secure(uuid, ...)'
      v_name := split_part(r.object_identity, '(', 1);
      IF v_name = ANY (v_watch) THEN
        BEGIN
          SELECT pg_get_functiondef(r.objid) INTO v_body;
        EXCEPTION WHEN OTHERS THEN
          v_body := NULL;
        END;
        INSERT INTO public.fx_function_ddl_audit
          (db_user, object_identity, command_tag, function_body)
        VALUES
          (current_user, r.object_identity, r.command_tag, v_body);
      END IF;
    END IF;
  END LOOP;
EXCEPTION WHEN OTHERS THEN
  -- Auditing must NEVER break a legitimate deploy/migration. Swallow everything.
  NULL;
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. The event trigger. CREATE OR REPLACE FUNCTION emits the 'CREATE FUNCTION'
--    tag; plain redefinitions and signature changes are both covered.
-- ----------------------------------------------------------------------------
DROP EVENT TRIGGER IF EXISTS trg_audit_fx_function_ddl;

CREATE EVENT TRIGGER trg_audit_fx_function_ddl
  ON ddl_command_end
  WHEN TAG IN ('CREATE FUNCTION', 'ALTER FUNCTION')
  EXECUTE FUNCTION public.audit_fx_function_ddl();

COMMIT;
