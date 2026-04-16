ALTER TABLE public.entities
ADD COLUMN IF NOT EXISTS is_pov_character BOOLEAN DEFAULT false;
