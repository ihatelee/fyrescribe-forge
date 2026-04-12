-- Add soft-archive support to entities
ALTER TABLE public.entities ADD COLUMN IF NOT EXISTS archived_at timestamptz DEFAULT NULL;
