ALTER TABLE public.timeline_events
  ADD COLUMN IF NOT EXISTS significance_score INTEGER DEFAULT 5;
