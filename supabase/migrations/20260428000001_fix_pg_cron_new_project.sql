-- Drop the old cron job that had the previous project's URL and anon key hardcoded.
DO $$
BEGIN
  PERFORM cron.unschedule('daily-lore-sync');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Recreate with the new project URL and anon key.
SELECT cron.schedule(
  'daily-lore-sync',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url     := 'https://ignglmxrpbxlgjmjzuql.supabase.co/functions/v1/sync-lore',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer sb_publishable_tdRzYHZsWkMKrymz-e7eqQ_EMg5cYi-'
    ),
    body    := '{"trigger":"scheduled"}'::jsonb
  ) AS request_id;
  $$
);
