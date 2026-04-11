-- Add sections jsonb column for article body content
ALTER TABLE public.entities
ADD COLUMN IF NOT EXISTS sections jsonb DEFAULT '{}'::jsonb;

-- Add gallery_image_urls for gallery images
ALTER TABLE public.entities
ADD COLUMN IF NOT EXISTS gallery_image_urls text[] DEFAULT '{}';

-- Create storage bucket for entity images
INSERT INTO storage.buckets (id, name, public)
VALUES ('entity-images', 'entity-images', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: anyone can view (public bucket)
CREATE POLICY "Entity images are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'entity-images');

-- Authenticated users can upload to their own folder
CREATE POLICY "Users can upload entity images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'entity-images' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Authenticated users can update their own images
CREATE POLICY "Users can update own entity images"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'entity-images' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Authenticated users can delete their own images
CREATE POLICY "Users can delete own entity images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'entity-images' AND auth.uid()::text = (storage.foldername(name))[1]);