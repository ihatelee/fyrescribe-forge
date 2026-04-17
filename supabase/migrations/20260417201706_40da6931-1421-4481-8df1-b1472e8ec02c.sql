
CREATE TABLE public.scene_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scene_id UUID NOT NULL REFERENCES public.scenes(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT,
  content TEXT NOT NULL DEFAULT '',
  word_count INTEGER NOT NULL DEFAULT 0,
  word_delta INTEGER NOT NULL DEFAULT 0,
  summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX scene_versions_scene_id_idx ON public.scene_versions(scene_id, created_at DESC);
CREATE INDEX scene_versions_project_id_idx ON public.scene_versions(project_id);

ALTER TABLE public.scene_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own scene_versions"
  ON public.scene_versions
  FOR ALL
  USING (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = scene_versions.project_id AND projects.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = scene_versions.project_id AND projects.user_id = auth.uid()));
