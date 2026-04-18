-- Remove duplicate RLS policy on entity_mentions.
-- Two policies were created by separate migrations:
--   "Users manage own entity_mentions"        (20260417041534) — WITH CHECK, correct
--   "Users can manage their own mentions"     (20260418000000) — no WITH CHECK, weaker
-- Keep the first; drop the second.
DROP POLICY IF EXISTS "Users can manage their own mentions" ON public.entity_mentions;

-- Drop orphaned scene_tags table.
-- Created in the initial migration but never referenced in any application code.
DROP TABLE IF EXISTS public.scene_tags;
