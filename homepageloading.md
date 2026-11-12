# Homepage loading improvements

This document records the changes made in the BZEAD UK repository and how to
adapt them for bzead.com, bzead.in, bzead.asia and bzead.eu. Check the code,
data, assets and deployment settings in each repository before applying them:
the other storefronts may not have the same categories or configuration.

## What we observed

- One Chrome DevTools Network capture, with **Disable cache** enabled, reported
  276 requests, 104 MB transferred, DOMContentLoaded at 486 ms and the browser
  `load` event at 2.3 minutes. The load event is not the same as the time at
  which the page first becomes visible or usable.
- Several category PNGs were approximately 1.6–2.3 MB each and took roughly
  43–48 seconds in that capture. Examples were 1254 × 1254 pixels, although
  their displayed icons are at most 96 × 96 CSS pixels.
- A later capture showed a `sponsored_products` request taking about 14 seconds
  and a hero banner metadata request taking about 2.4 seconds. These are
  observations from individual captures, not universal timings.
- The UK frontend uses static category icon files from the repository. It still
  fetches category records from Supabase. Hero banner metadata and image URLs
  are fetched from Supabase; the images are then downloaded from their URLs.

These observations identify worthwhile optimizations, but do not prove one
single cause of the entire 104 MB transfer or the load-event delay.

## 1. Smaller category icons

**Files:** [Categories.tsx](./src/components/layout/Categories.tsx) and
[category-icons](./public/images/category-icons).

We generated 23 WebP variants from the mapped PNGs:

- Maximum dimensions: 288 × 288 pixels, preserving aspect ratio. This supports
  up to three physical pixels per CSS pixel at the 96-pixel display size.
- Pillow `thumbnail` with Lanczos resampling; WebP quality 82 and method 6.
- The 23 source PNGs total **35,616,303 bytes**; the WebP variants total
  **388,332 bytes** (approximately **98.9% smaller**). These totals compare all
  unique mapped files, not necessarily what every visitor downloads.
- `imageMap` now points to `/images/category-icons/*.webp`. Category aliases
  continue to map to the same image, and an unmapped category retains the
  existing `c.image_url` fallback.
- Original PNGs were retained so other consumers or saved URLs do not break.

### Applying to another repository

1. Inspect its category mapping, actual filenames, and displayed dimensions.
   Include every mapped category and alias, preserving case on Linux.
2. Create optimized variants from that repository's source images. For example,
   with Python and Pillow installed, this command converts files named in a
   manually reviewed list; add or remove names to match the target site:

   ```python
   from pathlib import Path
   from PIL import Image

   source_dir = Path("public/images")
   output_dir = source_dir / "category-icons"
   output_dir.mkdir(parents=True, exist_ok=True)
   filenames = ["ELECTRONICS.png", "FASHION.png"]  # Replace with the full reviewed list.

   for filename in filenames:
       source = source_dir / filename
       target = output_dir / f"{source.stem}.webp"
       with Image.open(source) as image:
           image.thumbnail((288, 288), Image.Resampling.LANCZOS)
           image.save(target, "WEBP", quality=82, method=6)
       print(f"{source}: {source.stat().st_size} -> {target.stat().st_size} bytes")
   ```

3. Update the category mapping to the exact new filenames. Check image quality,
   transparency, all category aliases and the browser support required by that
   storefront. Retain the original files until all other usages are checked.
4. Verify each mapped URL exists in the production build and is returned as an
   image, not the SPA HTML fallback. On the UK site the old Grocery URL used
   `GROCERY.png`, but the actual file was `Grocery.png`; Linux paths are
   case-sensitive.

## 2. Fetch only homepage category records

**File:** [productService.ts](./src/lib/productService.ts).

Previously `fetchCategories()` downloaded the entire paginated category tree
and then selected level 1 in the browser. It now calls
`fetchCategoriesFlat(activeOnly, 1)`, which adds `.eq('level', 1)` to the
Supabase query. The existing active filter, ordering and 1,000-row pagination
are retained. Calls without a level filter, including `fetchCategoryTree()`,
still fetch the full tree. [Categories.tsx](./src/components/layout/Categories.tsx)
now logs a category-fetch error to the console.

For each other storefront, verify that `level = 1` means a top-level category,
that the relevant RLS policies permit the query, and that other callers still
receive the full tree where needed. This change reduces category data
transferred; it does not eliminate the Supabase request or its latency.

## 3. Cache hero banner metadata and prioritize the active image

**Files:** [HeroCarousel.tsx](./src/components/layout/HeroCarousel.tsx) and
[homePageCache.ts](./src/lib/homePageCache.ts).

- Hero banner metadata (`id`, image URL, alt text and link) is stored in
  `localStorage` under `beauzead_home_hero_banners_v1:<MARKET>`, using
  `VITE_MARKET` or `GLOBAL` as the market key.
- The shared cache reader rejects entries older than one hour. The hero reader
  also checks the expected array and string fields.
- On a repeat visit, valid cached metadata renders immediately while a fresh
  request for active, position-ordered hero banners runs. A successful response
  replaces the metadata and updates the cache. An error is logged and existing
  cached banners remain displayed. An empty successful response clears them.
- On a first visit without cached data, the Supabase request is still required.
  The existing five-second timer ends the loading placeholder if the response
  is slow; it does not cancel the request. A late successful response can
  still populate the carousel.
- The active image has `loading="eager"`, `fetchPriority="high"` and
  `decoding="async"`; other slides have `loading="lazy"` and low fetch
  priority. Browser lazy loading is a hint, not a guarantee that only the active
  image will download. Selecting another slide makes that slide eager.
- The cache stores metadata, **not image bytes**. Browser/CDN caching and image
  sizes still determine how quickly the image itself loads. Cache entries can
  briefly show outdated banners while the refresh is pending or unavailable.

The existing homepage ad-banner metadata cache is separate. These frontend
changes do not automatically optimize images stored in Supabase or add an
image transformation service. The first hero image was subsequently optimized
separately as described below.

### Production test: optimizing the first hero image

A read-only audit found seven active hero banners. Their image files totaled
approximately 12.1 MB; six PNGs were between 1.55 and 2.45 MB each. The first
banner was a 1738 × 905 PNG of **1,783,469 bytes**. In the earlier browser
capture, its request took approximately 22 seconds.

With the user's approval, we:

1. Downloaded the original and created a separate WebP with Pillow, using
   Lanczos resizing to **1280 × 667**, quality **82**, and encoding method **6**.
   The result was **64,080 bytes**, approximately **96.4% smaller**. The images
   were visually compared, but visual quality and crop should still be checked
   on the target storefront's mobile and desktop displays.
2. Uploaded the WebP to the public `hero-banners` bucket under a **new filename**,
   with `image/webp` and `Cache-Control: max-age=3600`. We did not overwrite
   or delete the original PNG.
3. Verified the new public URL returned HTTP 200, the correct content type and
   the same bytes as the prepared file. There was no separate staging project
   available; with explicit approval, we updated only the first active hero
   banner record to the new URL, conditional on its original URL and position
   remaining unchanged. The public banner API then returned the new URL.
4. In a subsequent browser screenshot with **Disable cache** enabled, the
   optimized banner loaded successfully in **278 ms**. This and the earlier
   22-second request are separate observations, not a controlled benchmark;
   network conditions and request contention may differ.

The original URL remains available for rollback. To roll back, restore the
original image URL in the banner record after confirming the record has not
since changed; the frontend's cached metadata may briefly show the previous
URL while refreshing. **Only the first hero banner was optimized** in this
production test; the other six hero images were not changed.

For the other storefronts, first determine whether they share this Supabase
project and banner record. If they do, this data change may already affect
them; do not make a duplicate change blindly. For independent banners, retain
the originals, verify optimized copies and links in staging where possible,
and switch one at a time with a rollback plan. Browser load times are not
guaranteed solely by reducing file size.

## 4. Banner rotation

- Main hero carousel: **15 seconds** when there are at least two banners
  ([HeroCarousel.tsx](./src/components/layout/HeroCarousel.tsx)).
- Homepage ad carousels between product sections: **15 seconds** when there
  are at least two banners
  ([BzeadHomePage.tsx](./src/pages/BzeadHomePage.tsx)).
- Video ads remain at **30 seconds**
  ([VideoAdsBanner.tsx](./src/components/layout/VideoAdsBanner.tsx)).

The rotation interval changes presentation; it is not itself a measured
download-speed optimization. Manual navigation remains available.

## 5. Asset cleanup and icons

At the user's request, the old `public/images/banners` folder and 22 image
files with no literal repository references were removed. Most of the latter
were byte-for-byte duplicates of files retained elsewhere. Repository search
cannot establish whether a URL is stored in Supabase or linked externally:
**do not repeat these deletions in another repository without checking its
database, deployed references and external consumers**. Removing files that
were never requested reduces deployment size, not visitor download time.

The Apple touch icon in [index.html](./index.html) was switched from the
removed `public/favicon.png` to the existing `public/bzead-tab-icon.png`.
This was asset cleanup, not a demonstrated homepage speed fix.

## Verification and rollout checklist

1. Compare code and assets in the target repository; adapt category names,
   cache keys, market isolation, queries and image paths instead of blindly
   copying changes. If files are shared with other apps, assess compatibility.
2. Validate every mapped icon exists and is a valid image; check its visual
   appearance and size at mobile and desktop resolutions.
3. Run the relevant tests and checks. In this repository the targeted commands
   were:

   ```bash
   npm test -- src/__tests__/homePageCache.test.ts src/__tests__/heroCarousel.test.tsx src/__tests__/homeCategories.test.ts
   npx tsc -b --pretty false
   npx eslint src/components/layout/Categories.tsx src/components/layout/HeroCarousel.tsx src/lib/homePageCache.ts src/__tests__/homePageCache.test.ts src/__tests__/heroCarousel.test.tsx src/__tests__/homeCategories.test.ts
   ```

   The hero tests cover cached rendering, refresh failure, manual navigation and
   the 15-second hero interval. Category tests cover the level filter,
   pagination and unrestricted full-tree fetch. The ad interval was checked
   in code, not by an automated timing test.
4. Deploy to staging and test a first visit with empty site storage and cache,
   then a repeat visit with caching enabled. Verify hero images, links,
   rotation, failed requests, category links and different screen sizes.
5. In DevTools Network, compare **Img**, **Fetch/XHR**, transferred bytes,
   timing and error responses before and after deployment on the same network
   and device conditions. Use Performance/Lighthouse to compare visible
   rendering, especially LCP, rather than treating `load` as the only metric.
   Reload with both cache disabled and enabled. Do not share HAR files without
   removing credentials, cookies and customer data.
6. Confirm the production build serves the new WebP files and check cache
   headers on the deployed host. The UK live response previously reported
   `max-age=0` for an asset despite a longer cache rule in
   [amplify.yml](./amplify.yml); inspect deployed headers rather than assuming
   the rule is effective. Use versioned or content-hashed URLs before assigning
   long-lived immutable browser caching.

## Remaining work, not implemented here

- Investigate slow `sponsored_products` and pricing requests in the browser
  waterfall and Supabase query performance tools. Homepage section loading
  currently waits for the sponsored query before fetching fallback products.
- Product sections can contain up to 100 products each; product images are not
  currently marked for lazy loading. A smaller initial selection, lazy loading
  and optimized product images may help, but should be designed and tested
  separately to preserve storefront behavior.
- Investigate and optimize the remaining six hero images, remote ad images,
  videos and other large resources identified in the Network panel. Not all
  of the 104 MB was attributable to the category icons.
- The UK Supabase project was observed in Singapore. Location can add latency
  for UK visitors, but migration was **not performed** and is not established
  as the solution to the long load event. Measure first; migrating production
  requires a separate data, storage, auth and integration cutover plan.

## Category-page loading

The Fashion category was observed loading 1,909 active category records in
two requests, followed by up to 500 full product records. In one direct API
test the product response was about 2.9 MB and its URL was about 22 KB because
descendant IDs are repeated in three filters. Timings and category sizes vary.

The category-loading implementation starts the category lookup and the
category-tree fetch concurrently. It reuses the already-fetched tree for category names instead of
performing another names query, skips an exact product count, and marks category
product images for lazy loading. Products are now fetched in batches of 25.
An intersection observer loads the next batch near the bottom, with a manual
load-more button as a fallback and a retry button for failed subsequent batches.
An exact multiple of 25 requires one additional empty request to determine the end.

Filtering and sorting run on the product query before pagination, using the same
product price, rating, stock and category fields as before. Price range bounds
come from a separate highest-price query that runs alongside the first product
request. Ordering includes a unique ID tie-breaker, although offset pagination
can still shift if products are inserted or removed between requests. The page
does not display an overall result count; the brand list and section counts
describe loaded products. Featured products retain
subcategory grouping; other sort choices use a single list so their ordering is
visible across the whole category. Failed category/product queries show an
error, and obsolete responses from previous categories or filters are ignored.
These changes reduce product data transferred initially but do not shorten the
category-filter URL. Verify deployment and measure performance separately
before assuming the changes are live or quantifying the improvement.

Direct navigation to `/category/fashion` was observed redirecting to
`/category/fashion/` with HTTP 404, even though the response included the app
shell. Configure and verify the Amplify SPA rewrite described in
[APP_DOCUMENTATION.md](./APP_DOCUMENTATION.md), preserving generated share
pages and static files. This is a hosting configuration issue and was not
changed by the frontend update. Verify direct URLs, refreshes and internal
navigation after deployment.

## UK implementation references

- `73a9d43` — asset cleanup and Apple touch icon change.
- `63a1b58` — optimized category icons, filtered category query, hero metadata
  cache, image priority hints and tests.
- `b940e9d` — 15-second hero and ad rotation, with a hero timing test.
- The first hero banner optimization was a **Supabase production data and
  storage change**, not a Git commit or frontend deployment.

These changes must be deployed to the relevant storefront before live
performance can be measured. Results vary with network, device, cache state,
Supabase data, images and deployment settings.
