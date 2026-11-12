-- Rename "Home, Kitchen & Living" to "Home & Garden"
UPDATE categories
SET name       = 'Home & Garden',
    slug       = 'home-garden',
    updated_at = now()
WHERE name = 'Home, Kitchen & Living';
