-- NOTE: This migration is a no-op on this project — the `pg_cron` extension is
-- not installed, so the job below was never scheduled. The previous version of
-- this file embedded a service token literal, which has since been rotated and
-- scrubbed. If pg_cron is later enabled, schedule the job using a token loaded
-- from Supabase Vault (e.g. `vault.decrypted_secrets`), never a hardcoded value.

DO $$
BEGIN
  -- Best-effort: unschedule if pg_cron happens to be available now or later.
  PERFORM cron.unschedule('daily-lore-sync');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
