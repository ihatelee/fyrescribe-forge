-- Create enums
CREATE TYPE public.entity_category AS ENUM ('characters', 'places', 'events', 'artifacts', 'creatures', 'abilities', 'factions', 'doctrine');
CREATE TYPE public.timeline_event_type AS ENUM ('world_history', 'story_event');
CREATE TYPE public.lore_suggestion_type AS ENUM ('new_entity', 'field_update', 'contradiction', 'new_tag');
CREATE TYPE public.lore_suggestion_status AS ENUM ('pending', 'accepted', 'edited', 'rejected');
CREATE TYPE public.sync_trigger AS ENUM ('scheduled', 'manual');
CREATE TYPE public.sync_status AS ENUM ('running', 'completed', 'failed');

-- Projects
CREATE TABLE public.projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  cover_image_url TEXT,
  last_sync_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own projects" ON public.projects FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Entities
CREATE TABLE public.entities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  category entity_category NOT NULL,
  name TEXT NOT NULL,
  summary TEXT,
  fields JSONB DEFAULT '{}',
  cover_image_url TEXT,
  is_dirty BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.entities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own entities" ON public.entities FOR ALL
  USING (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = entities.project_id AND projects.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = entities.project_id AND projects.user_id = auth.uid()));

-- Entity links
CREATE TABLE public.entity_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_a_id UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  entity_b_id UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  relationship TEXT
);
ALTER TABLE public.entity_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own entity_links" ON public.entity_links FOR ALL
  USING (EXISTS (SELECT 1 FROM public.entities e JOIN public.projects p ON p.id = e.project_id WHERE e.id = entity_links.entity_a_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.entities e JOIN public.projects p ON p.id = e.project_id WHERE e.id = entity_links.entity_a_id AND p.user_id = auth.uid()));

-- Tags
CREATE TABLE public.tags (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT
);
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own tags" ON public.tags FOR ALL
  USING (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = tags.project_id AND projects.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = tags.project_id AND projects.user_id = auth.uid()));

-- Entity tags
CREATE TABLE public.entity_tags (
  entity_id UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  PRIMARY KEY (entity_id, tag_id)
);
ALTER TABLE public.entity_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own entity_tags" ON public.entity_tags FOR ALL
  USING (EXISTS (SELECT 1 FROM public.entities e JOIN public.projects p ON p.id = e.project_id WHERE e.id = entity_tags.entity_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.entities e JOIN public.projects p ON p.id = e.project_id WHERE e.id = entity_tags.entity_id AND p.user_id = auth.uid()));

-- Chapters
CREATE TABLE public.chapters (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  "order" INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.chapters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own chapters" ON public.chapters FOR ALL
  USING (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = chapters.project_id AND projects.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = chapters.project_id AND projects.user_id = auth.uid()));

-- Scenes
CREATE TABLE public.scenes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  chapter_id UUID NOT NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT DEFAULT '',
  pov_character_id UUID REFERENCES public.entities(id) ON DELETE SET NULL,
  "order" INTEGER NOT NULL DEFAULT 0,
  is_dirty BOOLEAN DEFAULT false,
  word_count INTEGER DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.scenes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own scenes" ON public.scenes FOR ALL
  USING (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = scenes.project_id AND projects.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = scenes.project_id AND projects.user_id = auth.uid()));

-- Scene tags
CREATE TABLE public.scene_tags (
  scene_id UUID NOT NULL REFERENCES public.scenes(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  PRIMARY KEY (scene_id, tag_id)
);
ALTER TABLE public.scene_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own scene_tags" ON public.scene_tags FOR ALL
  USING (EXISTS (SELECT 1 FROM public.scenes s JOIN public.projects p ON p.id = s.project_id WHERE s.id = scene_tags.scene_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.scenes s JOIN public.projects p ON p.id = s.project_id WHERE s.id = scene_tags.scene_id AND p.user_id = auth.uid()));

-- Timeline events
CREATE TABLE public.timeline_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  entity_id UUID REFERENCES public.entities(id) ON DELETE SET NULL,
  label TEXT NOT NULL,
  date_label TEXT,
  date_sort INTEGER DEFAULT 0,
  type timeline_event_type NOT NULL DEFAULT 'story_event'
);
ALTER TABLE public.timeline_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own timeline_events" ON public.timeline_events FOR ALL
  USING (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = timeline_events.project_id AND projects.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = timeline_events.project_id AND projects.user_id = auth.uid()));

-- Lore suggestions
CREATE TABLE public.lore_suggestions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  entity_id UUID REFERENCES public.entities(id) ON DELETE SET NULL,
  type lore_suggestion_type NOT NULL,
  payload JSONB DEFAULT '{}',
  status lore_suggestion_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMP WITH TIME ZONE
);
ALTER TABLE public.lore_suggestions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own lore_suggestions" ON public.lore_suggestions FOR ALL
  USING (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = lore_suggestions.project_id AND projects.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = lore_suggestions.project_id AND projects.user_id = auth.uid()));

-- Sync log
CREATE TABLE public.sync_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  triggered_by sync_trigger NOT NULL,
  scenes_processed INTEGER DEFAULT 0,
  suggestions_created INTEGER DEFAULT 0,
  status sync_status NOT NULL DEFAULT 'running',
  ran_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.sync_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own sync_log" ON public.sync_log FOR ALL
  USING (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = sync_log.project_id AND projects.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = sync_log.project_id AND projects.user_id = auth.uid()));

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_entities_updated_at BEFORE UPDATE ON public.entities FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_scenes_updated_at BEFORE UPDATE ON public.scenes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();