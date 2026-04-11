
INSERT INTO storage.buckets (id, name, public)
VALUES ('manuscripts', 'manuscripts', true);

CREATE POLICY "Manuscript files are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'manuscripts');

CREATE POLICY "Users can upload their own manuscripts"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'manuscripts' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their own manuscripts"
ON storage.objects FOR UPDATE
USING (bucket_id = 'manuscripts' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own manuscripts"
ON storage.objects FOR DELETE
USING (bucket_id = 'manuscripts' AND auth.uid()::text = (storage.foldername(name))[1]);
