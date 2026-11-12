-- Allow video MIME types in the video-ads storage bucket.
-- The bucket was created earlier without specifying allowed_mime_types,
-- so Supabase defaulted to image/* only.

UPDATE storage.buckets
SET
  allowed_mime_types = ARRAY[
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'video/x-msvideo',
    'video/mpeg'
  ],
  file_size_limit = 524288000   -- 500 MB in bytes
WHERE id = 'video-ads';
