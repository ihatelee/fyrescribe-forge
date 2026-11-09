-- Fix: deleting a project (or an entity/scene underneath it) left orphaned
-- rows in entity_versions, mention_suggestions, rejected_mentions, and
-- tag_suggestions. These four tables had no foreign key constraint at all
-- on their project_id/entity_id/scene_id columns — RLS enforced read/write
-- access via a join to projects, but nothing enforced referential
-- integrity or cascaded deletes. Every other table referencing projects/
-- entities/scenes already has ON DELETE CASCADE (see entity_mentions,
-- scene_versions, lore_suggestions, etc.); this brings these four in line.

-- Defensive cleanup of any existing orphaned rows. As of writing this
-- migration, a prior manual cleanup after Phase 5c testing left zero
-- orphans in the new project, but ADD CONSTRAINT below will fail if any
-- exist at apply time, so this runs unconditionally.
DELETE FROM public.entity_versions ev
WHERE NOT EXISTS (SELECT 1 FROM public.projects p WHERE p.id = ev.project_id)
   OR NOT EXISTS (SELECT 1 FROM public.entities e WHERE e.id = ev.entity_id);

DELETE FROM public.mention_suggestions m
WHERE NOT EXISTS (SELECT 1 FROM public.projects p WHERE p.id = m.project_id)
   OR NOT EXISTS (SELECT 1 FROM public.entities e WHERE e.id = m.entity_id)
   OR NOT EXISTS (SELECT 1 FROM public.scenes s WHERE s.id = m.scene_id);

DELETE FROM public.rejected_mentions r
WHERE NOT EXISTS (SELECT 1 FROM public.projects p WHERE p.id = r.project_id)
   OR NOT EXISTS (SELECT 1 FROM public.entities e WHERE e.id = r.entity_id)
   OR NOT EXISTS (SELECT 1 FROM public.scenes s WHERE s.id = r.scene_id);

DELETE FROM public.tag_suggestions t
WHERE NOT EXISTS (SELECT 1 FROM public.projects p WHERE p.id = t.project_id)
   OR NOT EXISTS (SELECT 1 FROM public.entities e WHERE e.id = t.entity_id)
   OR NOT EXISTS (SELECT 1 FROM public.entities e2 WHERE e2.id = t.target_entity_id);

-- entity_versions
ALTER TABLE public.entity_versions
  ADD CONSTRAINT entity_versions_project_id_fkey
    FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE,
  ADD CONSTRAINT entity_versions_entity_id_fkey
    FOREIGN KEY (entity_id) REFERENCES public.entities(id) ON DELETE CASCADE;

-- mention_suggestions
ALTER TABLE public.mention_suggestions
  ADD CONSTRAINT mention_suggestions_project_id_fkey
    FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE,
  ADD CONSTRAINT mention_suggestions_entity_id_fkey
    FOREIGN KEY (entity_id) REFERENCES public.entities(id) ON DELETE CASCADE,
  ADD CONSTRAINT mention_suggestions_scene_id_fkey
    FOREIGN KEY (scene_id) REFERENCES public.scenes(id) ON DELETE CASCADE;

-- rejected_mentions
ALTER TABLE public.rejected_mentions
  ADD CONSTRAINT rejected_mentions_project_id_fkey
    FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE,
  ADD CONSTRAINT rejected_mentions_entity_id_fkey
    FOREIGN KEY (entity_id) REFERENCES public.entities(id) ON DELETE CASCADE,
  ADD CONSTRAINT rejected_mentions_scene_id_fkey
    FOREIGN KEY (scene_id) REFERENCES public.scenes(id) ON DELETE CASCADE;

-- tag_suggestions
ALTER TABLE public.tag_suggestions
  ADD CONSTRAINT tag_suggestions_project_id_fkey
    FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE,
  ADD CONSTRAINT tag_suggestions_entity_id_fkey
    FOREIGN KEY (entity_id) REFERENCES public.entities(id) ON DELETE CASCADE,
  ADD CONSTRAINT tag_suggestions_target_entity_id_fkey
    FOREIGN KEY (target_entity_id) REFERENCES public.entities(id) ON DELETE CASCADE;
