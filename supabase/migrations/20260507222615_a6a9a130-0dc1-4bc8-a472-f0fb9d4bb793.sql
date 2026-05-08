ALTER TABLE public.timeline_events
ADD COLUMN IF NOT EXISTS significance_score integer NOT NULL DEFAULT 5;

ALTER TABLE public.timeline_events
ADD CONSTRAINT timeline_events_significance_score_range
CHECK (significance_score BETWEEN 1 AND 10);