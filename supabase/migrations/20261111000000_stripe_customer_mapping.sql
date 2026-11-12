CREATE TABLE public.stripe_customers (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_account_id text NOT NULL,
  livemode boolean NOT NULL,
  stripe_customer_id text NOT NULL,
  PRIMARY KEY (user_id, stripe_account_id, livemode),
  UNIQUE (stripe_account_id, livemode, stripe_customer_id)
);

ALTER TABLE public.stripe_customers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.stripe_customers FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.stripe_customers TO service_role;
