-- Allow unauthenticated (anon) users to call is_email_allowed via RPC.
-- Required for the signup flow, which checks the allowlist before the user has a session.
GRANT EXECUTE ON FUNCTION public.is_email_allowed(text) TO anon;
