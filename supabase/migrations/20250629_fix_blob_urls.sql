-- Fix products with blob: preview URLs saved in image_url and images columns.
-- Root cause: the draft media save handler combined blob preview URLs with uploaded URLs.
-- This migration strips blob: URLs from the text[] arrays and fixes image_url.

-- Step 1: Remove blob: entries from the images text[] array
UPDATE products
SET images = (
  SELECT coalesce(array_agg(elem), '{}')
  FROM unnest(images) AS elem
  WHERE elem NOT LIKE 'blob:%'
)
WHERE image_url LIKE 'blob:%'
   OR EXISTS (
     SELECT 1
     FROM unnest(images) AS elem
     WHERE elem LIKE 'blob:%'
   );

-- Step 2: Remove blob: entries from the videos text[] array (just in case)
UPDATE products
SET videos = (
  SELECT coalesce(array_agg(elem), '{}')
  FROM unnest(videos) AS elem
  WHERE elem NOT LIKE 'blob:%'
)
WHERE EXISTS (
  SELECT 1
  FROM unnest(videos) AS elem
  WHERE elem LIKE 'blob:%'
);

-- Step 3: Fix image_url for any product where it's still a blob: URL
UPDATE products
SET image_url = coalesce(
  (SELECT elem
   FROM unnest(images) AS elem
   WHERE elem LIKE 'https://%'
   LIMIT 1),
  ''
)
WHERE image_url LIKE 'blob:%';
