-- 1. Add "Delhivery" to international_courier_type (if not already present)
INSERT INTO international_courier_type (name)
SELECT 'Delhivery'
WHERE NOT EXISTS (
  SELECT 1 FROM international_courier_type WHERE name = 'Delhivery'
);

-- 2. Remove "Standard International Courier" from international (keep only Self Shipping + Delhivery)
DELETE FROM international_courier_type
WHERE name NOT IN ('Self Shipping', 'Delhivery');

-- 3. Keep domestic couriers constrained to Self Shipping + Delhivery
DELETE FROM domestic_courier_type
WHERE name NOT IN ('Self Shipping', 'Delhivery');
