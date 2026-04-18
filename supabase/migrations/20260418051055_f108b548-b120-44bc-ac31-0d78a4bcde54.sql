-- Remove duplicate {public}-role storage policies on the manuscripts bucket.
-- Equivalent {authenticated}-role policies already exist and provide the
-- correct, scoped access. The {public} duplicates are redundant and broaden
-- the role surface unnecessarily.

DROP POLICY IF EXISTS "Users can delete their own manuscripts" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own manuscripts" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own manuscripts" ON storage.objects;