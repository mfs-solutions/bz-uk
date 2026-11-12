CREATE TABLE IF NOT EXISTS public.account_deletion_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid,
  email text,
  reason text NOT NULL,
  deleted_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT account_deletion_logs_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS account_deletion_logs_deleted_at_idx
  ON public.account_deletion_logs USING btree (deleted_at DESC);

ALTER TABLE public.account_deletion_logs ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE public.account_deletion_logs TO anon;
GRANT ALL ON TABLE public.account_deletion_logs TO authenticated;
GRANT ALL ON TABLE public.account_deletion_logs TO service_role;