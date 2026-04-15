-- Add scene_id to lore_suggestions so every suggestion can be traced back
-- to the exact scene that triggered it.
ALTER TABLE public.lore_suggestions
  ADD COLUMN IF NOT EXISTS scene_id UUID REFERENCES public.scenes(id) ON DELETE SET NULL;
