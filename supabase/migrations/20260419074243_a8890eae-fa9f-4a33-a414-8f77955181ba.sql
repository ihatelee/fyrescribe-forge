-- Create public soundscapes bucket for ambient theme music
INSERT INTO storage.buckets (id, name, public)
VALUES ('soundscapes', 'soundscapes', true)
ON CONFLICT (id) DO NOTHING;

-- Public read access (audio files served directly to all visitors)
CREATE POLICY "Soundscapes are publicly readable"
ON storage.objects FOR SELECT
USING (bucket_id = 'soundscapes');

-- Only authenticated users can upload/update/delete (project owner via backend UI)
CREATE POLICY "Authenticated users can upload soundscapes"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'soundscapes');

CREATE POLICY "Authenticated users can update soundscapes"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'soundscapes');

CREATE POLICY "Authenticated users can delete soundscapes"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'soundscapes');