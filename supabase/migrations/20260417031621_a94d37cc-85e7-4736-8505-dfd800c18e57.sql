-- Add user_id column to notes table for ownership tracking
ALTER TABLE public.notes
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Backfill user_id from owning project for any existing notes
UPDATE public.notes n
SET user_id = p.user_id
FROM public.projects p
WHERE n.project_id = p.id
  AND n.user_id IS NULL;

-- Make user_id required going forward
ALTER TABLE public.notes
  ALTER COLUMN user_id SET NOT NULL;