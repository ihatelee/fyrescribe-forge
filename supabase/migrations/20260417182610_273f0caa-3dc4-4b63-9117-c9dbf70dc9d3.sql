-- 1. Add aliases array to entities
ALTER TABLE public.entities
  ADD COLUMN IF NOT EXISTS aliases text[] NOT NULL DEFAULT '{}'::text[];

-- 2. Track rejected mentions so they don't reappear in the Sync Mentions modal
CREATE TABLE IF NOT EXISTS public.rejected_mentions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  entity_id uuid NOT NULL,
  scene_id uuid NOT NULL,
  context text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, entity_id, scene_id, context)
);

CREATE INDEX IF NOT EXISTS rejected_mentions_project_idx
  ON public.rejected_mentions (project_id);

ALTER TABLE public.rejected_mentions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own rejected_mentions"
  ON public.rejected_mentions
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = rejected_mentions.project_id
      AND projects.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = rejected_mentions.project_id
      AND projects.user_id = auth.uid()
  ));