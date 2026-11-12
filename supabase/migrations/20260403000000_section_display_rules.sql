-- Section display rules: controls how many rows to show per product section on the homepage
CREATE TABLE IF NOT EXISTS section_display_rules (
  id SERIAL PRIMARY KEY,
  min_products INT NOT NULL,
  max_products INT NOT NULL,
  display_rows INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_range CHECK (min_products <= max_products),
  CONSTRAINT chk_positive CHECK (min_products >= 0 AND display_rows > 0)
);

-- Seed the initial rules
INSERT INTO section_display_rules (min_products, max_products, display_rows) VALUES
  (1,  11, 2),
  (12, 15, 3),
  (16, 19, 4),
  (20, 23, 5),
  (24, 999, 5);

-- Allow all authenticated and anonymous users to read the rules (public config)
ALTER TABLE section_display_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read section_display_rules"
  ON section_display_rules FOR SELECT
  USING (true);
