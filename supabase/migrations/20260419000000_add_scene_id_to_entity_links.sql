ALTER TABLE public.entity_links
ADD COLUMN IF NOT EXISTS scene_id UUID REFERENCES public.scenes(id) ON DELETE SET NULL;
