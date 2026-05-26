
CREATE TABLE public.entity_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id UUID NOT NULL,
  project_id UUID NOT NULL,
  name TEXT,
  sections JSONB NOT NULL DEFAULT '{}'::jsonb,
  fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  summary TEXT,
  change_summary TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_entity_versions_entity ON public.entity_versions(entity_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.entity_versions TO authenticated;
GRANT ALL ON public.entity_versions TO service_role;

ALTER TABLE public.entity_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own entity_versions"
ON public.entity_versions
FOR ALL
TO authenticated
USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = entity_versions.project_id AND p.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = entity_versions.project_id AND p.user_id = auth.uid()));
