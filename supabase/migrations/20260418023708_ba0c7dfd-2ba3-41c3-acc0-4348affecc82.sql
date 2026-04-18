-- 1. Lock down allowed_emails: remove permissive authenticated policies.
-- Only service_role (used by edge functions / admin) should mutate this table.
-- The signup-time check uses public.is_email_allowed() which is SECURITY DEFINER,
-- so regular users no longer need direct SELECT access.

DROP POLICY IF EXISTS "Authenticated users can delete allowed emails" ON public.allowed_emails;
DROP POLICY IF EXISTS "Authenticated users can insert allowed emails" ON public.allowed_emails;
DROP POLICY IF EXISTS "Authenticated users can view allowed emails" ON public.allowed_emails;

-- No new policies = default deny for non-service_role. service_role bypasses RLS.

-- 2. Enforce the email allowlist server-side at signup, regardless of client
-- (covers Google OAuth and direct REST calls to the auth API).
DROP TRIGGER IF EXISTS enforce_email_allowlist ON auth.users;

CREATE TRIGGER enforce_email_allowlist
BEFORE INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.check_email_allowed();