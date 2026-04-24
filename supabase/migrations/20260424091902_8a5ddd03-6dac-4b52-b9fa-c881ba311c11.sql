-- ── mention_suggestions ────────────────────────────────────────────────
CREATE TABLE public.mention_suggestions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL,
  entity_id UUID NOT NULL,
  scene_id UUID NOT NULL,
  context TEXT NOT NULL,
  position INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  CONSTRAINT mention_suggestions_status_chk
    CHECK (status IN ('pending', 'accepted', 'rejected'))
);

-- Unique key so re-running Sync Mentions can upsert without duplicates
CREATE UNIQUE INDEX mention_suggestions_unique
  ON public.mention_suggestions (project_id, entity_id, scene_id, context);

CREATE INDEX mention_suggestions_project_status_idx
  ON public.mention_suggestions (project_id, status);

ALTER TABLE public.mention_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own mention_suggestions"
  ON public.mention_suggestions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = mention_suggestions.project_id
        AND p.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = mention_suggestions.project_id
        AND p.user_id = auth.uid()
    )
  );

-- ── tag_suggestions ───────────────────────────────────────────────────
CREATE TABLE public.tag_suggestions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL,
  entity_id UUID NOT NULL,
  entity_category TEXT NOT NULL,
  field_key TEXT NOT NULL,
  target_entity_id UUID NOT NULL,
  target_entity_category TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  CONSTRAINT tag_suggestions_status_chk
    CHECK (status IN ('pending', 'accepted', 'rejected'))
);

-- One pending suggestion per (entity, field, target)
CREATE UNIQUE INDEX tag_suggestions_unique
  ON public.tag_suggestions (project_id, entity_id, field_key, target_entity_id);

CREATE INDEX tag_suggestions_project_status_idx
  ON public.tag_suggestions (project_id, status);

ALTER TABLE public.tag_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own tag_suggestions"
  ON public.tag_suggestions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = tag_suggestions.project_id
        AND p.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = tag_suggestions.project_id
        AND p.user_id = auth.uid()
    )
  );