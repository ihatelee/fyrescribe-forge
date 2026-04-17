CREATE TABLE IF NOT EXISTS public.entity_mentions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  scene_id uuid NOT NULL REFERENCES public.scenes(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  context text,
  position integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_entity_mentions_entity ON public.entity_mentions(entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_mentions_scene ON public.entity_mentions(scene_id);
CREATE INDEX IF NOT EXISTS idx_entity_mentions_project ON public.entity_mentions(project_id);

ALTER TABLE public.entity_mentions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own entity_mentions"
  ON public.entity_mentions
  FOR ALL
  USING (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = entity_mentions.project_id AND projects.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = entity_mentions.project_id AND projects.user_id = auth.uid()));