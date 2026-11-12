-- Add NDR (Non-Delivery Report) fields to shiprocket_shipments
ALTER TABLE shiprocket_shipments
  ADD COLUMN IF NOT EXISTS ndr_reason TEXT,
  ADD COLUMN IF NOT EXISTS ndr_action_required BOOLEAN DEFAULT FALSE;

-- Add 'failed_delivery' to status helpers / comments for documentation
COMMENT ON COLUMN shiprocket_shipments.ndr_reason IS 'Reason for failed delivery (NDR), populated by webhook';
COMMENT ON COLUMN shiprocket_shipments.ndr_action_required IS 'True when admin action is needed (reattempt/RTO)';

-- Index for admin queries: find shipments needing NDR action
CREATE INDEX IF NOT EXISTS idx_shiprocket_shipments_ndr_pending
  ON shiprocket_shipments (ndr_action_required)
  WHERE ndr_action_required = TRUE;
