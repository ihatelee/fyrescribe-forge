CREATE TABLE IF NOT EXISTS public.entity_mentions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID REFERENCES entities(id) ON DELETE CASCADE NOT NULL,
  scene_id UUID REFERENCES scenes(id) ON DELETE CASCADE NOT NULL,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  context TEXT,
  position INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.entity_mentions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own mentions" ON public.entity_mentions;

CREATE POLICY "Users can manage their own mentions"
ON public.entity_mentions
FOR ALL
USING (
  project_id IN (
    SELECT id FROM projects WHERE user_id = auth.uid()
  )
);
