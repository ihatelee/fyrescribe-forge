-- Enable required extensions (already present on Supabase but idempotent here).
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove any existing schedule so this migration is re-runnable.
DO $$
BEGIN
  PERFORM cron.unschedule('daily-lore-sync');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Schedule sync-lore edge function daily at 03:00 UTC.
-- The function accepts an empty body and processes all projects that have dirty scenes.
-- Uses the project's anon key (public, safe to embed here) — the edge function
-- authenticates internally with SUPABASE_SERVICE_ROLE_KEY from its own env.
SELECT cron.schedule(
  'daily-lore-sync',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url     := 'https://bedrzyekoynnzdeblunt.supabase.co/functions/v1/sync-lore',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJlZHJ6eWVrb3lubnpkZWJsdW50Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5MjQ4NjksImV4cCI6MjA5MTUwMDg2OX0.ZnwPs0yn7qVCk925uinPmO88xeO4tINS6xxUXd5ocJU'
    ),
    body    := '{"trigger":"scheduled"}'::jsonb
  ) AS request_id;
  $$
);
