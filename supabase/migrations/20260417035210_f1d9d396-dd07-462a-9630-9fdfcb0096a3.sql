ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS interface_scale integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS high_contrast boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dyslexia_font boolean NOT NULL DEFAULT false;