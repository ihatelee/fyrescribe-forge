ALTER TABLE public.entities ADD COLUMN IF NOT EXISTS synced_scenes uuid[] DEFAULT '{}';
