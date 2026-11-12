-- Migration: add exchange_rate column to countries table
-- Stores the USD-based exchange rate for each country's currency.
-- Updated periodically from the ExchangeRate-API response.
-- NULL means rate not yet fetched; 1.0 is the USD baseline.

ALTER TABLE countries
  ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(20, 6) DEFAULT NULL;

COMMENT ON COLUMN countries.exchange_rate IS 'Exchange rate relative to USD (1 USD = N units of this country currency). Updated from ExchangeRate-API.';
