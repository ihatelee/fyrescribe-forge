CREATE TABLE public.lore_link_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  entity_a_id UUID REFERENCES public.entities(id) ON DELETE CASCADE NOT NULL,
  entity_b_id UUID REFERENCES public.entities(id) ON DELETE CASCADE NOT NULL,
  relationship TEXT NOT NULL,
  confidence INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.lore_link_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own link suggestions"
ON public.lore_link_suggestions
FOR ALL
USING (
  project_id IN (
    SELECT id FROM public.projects WHERE user_id = auth.uid()
  )
);
