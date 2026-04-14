-- Make manuscripts bucket private
UPDATE storage.buckets SET public = false WHERE id = 'manuscripts';

-- Drop the broad public SELECT policy
DROP POLICY IF EXISTS "Manuscript files are publicly accessible" ON storage.objects;

-- Add owner-scoped SELECT policy
CREATE POLICY "Users read own manuscripts"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'manuscripts' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Fix INSERT/UPDATE/DELETE policies to use 'authenticated' role instead of 'public'
DROP POLICY IF EXISTS "Users can upload manuscript files" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own manuscript files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own manuscript files" ON storage.objects;

CREATE POLICY "Users can upload manuscript files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'manuscripts' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their own manuscript files"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'manuscripts' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own manuscript files"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'manuscripts' AND auth.uid()::text = (storage.foldername(name))[1]);