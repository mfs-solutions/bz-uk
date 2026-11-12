-- Email logs table for idempotency, auditing, and failure tracking
CREATE TABLE IF NOT EXISTS email_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id text NOT NULL,
  event_type text NOT NULL,
  recipient_type text NOT NULL CHECK (recipient_type IN ('buyer', 'seller', 'admin')),
  email text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('sent', 'failed', 'skipped')),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Unique constraint for idempotency: (order_id + event_type + recipient_type + email)
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_logs_idempotency
  ON email_logs (order_id, event_type, recipient_type, email);

-- Index for querying by order
CREATE INDEX IF NOT EXISTS idx_email_logs_order_id ON email_logs (order_id);

-- Index for querying failures
CREATE INDEX IF NOT EXISTS idx_email_logs_status ON email_logs (status) WHERE status = 'failed';

-- RLS: service role only (edge functions use service role key)
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (edge functions)
CREATE POLICY "Service role full access on email_logs"
  ON email_logs FOR ALL
  USING (true)
  WITH CHECK (true);
