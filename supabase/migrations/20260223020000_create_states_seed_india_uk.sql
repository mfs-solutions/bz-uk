-- ================================================================
-- States Table + Seed Data (India & United Kingdom)
-- ================================================================

CREATE TABLE IF NOT EXISTS states (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  state_name   text NOT NULL,
  state_code   character varying(10) NOT NULL,
  country_id   uuid NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
  is_active    boolean DEFAULT true,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_states_country_id ON states(country_id);

-- Enable RLS
ALTER TABLE states ENABLE ROW LEVEL SECURITY;

-- RLS: anyone can read
CREATE POLICY "Allow public select on states"
  ON states FOR SELECT
  TO anon, authenticated
  USING (true);

-- ================================================================
-- INDIA (country_id = 508157e5-f8b4-4801-ae01-70c8a46671ff)
-- 28 States + 8 Union Territories
-- ================================================================

INSERT INTO states (state_name, state_code, country_id) VALUES
-- States
('Andhra Pradesh',        'AP',  '508157e5-f8b4-4801-ae01-70c8a46671ff'),
('Arunachal Pradesh',     'AR',  '508157e5-f8b4-4801-ae01-70c8a46671ff'),
('Assam',                 'AS',  '508157e5-f8b4-4801-ae01-70c8a46671ff'),
('Bihar',                 'BR',  '508157e5-f8b4-4801-ae01-70c8a46671ff'),
('Chhattisgarh',          'CG',  '508157e5-f8b4-4801-ae01-70c8a46671ff'),
('Goa',                   'GA',  '508157e5-f8b4-4801-ae01-70c8a46671ff'),
('Gujarat',               'GJ',  '508157e5-f8b4-4801-ae01-70c8a46671ff'),
('Haryana',               'HR',  '508157e5-f8b4-4801-ae01-70c8a46671ff'),
('Himachal Pradesh',      'HP',  '508157e5-f8b4-4801-ae01-70c8a46671ff'),
('Jharkhand',             'JH',  '508157e5-f8b4-4801-ae01-70c8a46671ff'),
('Karnataka',             'KA',  '508157e5-f8b4-4801-ae01-70c8a46671ff'),
('Kerala',                'KL',  '508157e5-f8b4-4801-ae01-70c8a46671ff'),
('Madhya Pradesh',        'MP',  '508157e5-f8b4-4801-ae01-70c8a46671ff'),
('Maharashtra',           'MH',  '508157e5-f8b4-4801-ae01-70c8a46671ff'),
('Manipur',               'MN',  '508157e5-f8b4-4801-ae01-70c8a46671ff'),
('Meghalaya',             'ML',  '508157e5-f8b4-4801-ae01-70c8a46671ff'),
('Mizoram',               'MZ',  '508157e5-f8b4-4801-ae01-70c8a46671ff'),
('Nagaland',              'NL',  '508157e5-f8b4-4801-ae01-70c8a46671ff'),
('Odisha',                'OD',  '508157e5-f8b4-4801-ae01-70c8a46671ff'),
('Punjab',                'PB',  '508157e5-f8b4-4801-ae01-70c8a46671ff'),
('Rajasthan',             'RJ',  '508157e5-f8b4-4801-ae01-70c8a46671ff'),
('Sikkim',                'SK',  '508157e5-f8b4-4801-ae01-70c8a46671ff'),
('Tamil Nadu',            'TN',  '508157e5-f8b4-4801-ae01-70c8a46671ff'),
('Telangana',             'TS',  '508157e5-f8b4-4801-ae01-70c8a46671ff'),
('Tripura',               'TR',  '508157e5-f8b4-4801-ae01-70c8a46671ff'),
('Uttar Pradesh',         'UP',  '508157e5-f8b4-4801-ae01-70c8a46671ff'),
('Uttarakhand',           'UK',  '508157e5-f8b4-4801-ae01-70c8a46671ff'),
('West Bengal',           'WB',  '508157e5-f8b4-4801-ae01-70c8a46671ff'),
-- Union Territories
('Andaman and Nicobar Islands', 'AN', '508157e5-f8b4-4801-ae01-70c8a46671ff'),
('Chandigarh',            'CH',  '508157e5-f8b4-4801-ae01-70c8a46671ff'),
('Dadra and Nagar Haveli and Daman and Diu', 'DD', '508157e5-f8b4-4801-ae01-70c8a46671ff'),
('Delhi',                 'DL',  '508157e5-f8b4-4801-ae01-70c8a46671ff'),
('Jammu and Kashmir',     'JK',  '508157e5-f8b4-4801-ae01-70c8a46671ff'),
('Ladakh',                'LA',  '508157e5-f8b4-4801-ae01-70c8a46671ff'),
('Lakshadweep',           'LD',  '508157e5-f8b4-4801-ae01-70c8a46671ff'),
('Puducherry',            'PY',  '508157e5-f8b4-4801-ae01-70c8a46671ff');

-- ================================================================
-- UNITED KINGDOM (country_id = 5040c610-e64f-44ca-b6ec-3e0ddb20d32b)
-- 4 Countries/Regions + Crown Dependencies
-- ================================================================

INSERT INTO states (state_name, state_code, country_id) VALUES
('England',               'ENG', '5040c610-e64f-44ca-b6ec-3e0ddb20d32b'),
('Scotland',              'SCT', '5040c610-e64f-44ca-b6ec-3e0ddb20d32b'),
('Wales',                 'WLS', '5040c610-e64f-44ca-b6ec-3e0ddb20d32b'),
('Northern Ireland',      'NIR', '5040c610-e64f-44ca-b6ec-3e0ddb20d32b');
