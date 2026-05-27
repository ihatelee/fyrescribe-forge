
-- Lock down allowed_emails: revoke all client access; only service role / SECURITY DEFINER funcs may read.
REVOKE ALL ON public.allowed_emails FROM anon, authenticated;
GRANT ALL ON public.allowed_emails TO service_role;
ALTER TABLE public.allowed_emails ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Deny all client access to allowed_emails" ON public.allowed_emails;
CREATE POLICY "Deny all client access to allowed_emails"
  ON public.allowed_emails
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- Restrict soundscapes bucket mutations to file owners (folder = uid)
DROP POLICY IF EXISTS "Authenticated users can upload soundscapes" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update soundscapes" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete soundscapes" ON storage.objects;

CREATE POLICY "Users upload own soundscapes"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'soundscapes' AND (auth.uid())::text = (storage.foldername(name))[1]);

CREATE POLICY "Users update own soundscapes"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'soundscapes' AND (auth.uid())::text = (storage.foldername(name))[1]);

CREATE POLICY "Users delete own soundscapes"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'soundscapes' AND (auth.uid())::text = (storage.foldername(name))[1]);

-- Revoke EXECUTE on SECURITY DEFINER functions from anon/authenticated.
-- check_email_allowed and auto_add_first_name_alias are trigger functions; update_updated_at_column too.
-- is_email_allowed is currently unused from the client.
REVOKE EXECUTE ON FUNCTION public.check_email_allowed() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_email_allowed(text) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.auto_add_first_name_alias() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon, authenticated, PUBLIC;
