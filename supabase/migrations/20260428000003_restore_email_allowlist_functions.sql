-- allowed_emails table and RLS already exist on this project; restore missing functions only.

CREATE OR REPLACE FUNCTION public.check_email_allowed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.allowed_emails
    WHERE lower(email) = lower(NEW.email)
  ) THEN
    RAISE EXCEPTION 'Registration is not allowed for this email address';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_email_allowed(check_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.allowed_emails
    WHERE lower(email) = lower(check_email)
  );
$$;

DROP TRIGGER IF EXISTS enforce_email_allowlist ON auth.users;

CREATE TRIGGER enforce_email_allowlist
BEFORE INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.check_email_allowed();

GRANT EXECUTE ON FUNCTION public.is_email_allowed(text) TO anon;
