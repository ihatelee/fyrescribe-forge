-- Create allowed_emails table
CREATE TABLE public.allowed_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.allowed_emails ENABLE ROW LEVEL SECURITY;

-- Only authenticated users can view/manage the allowlist
CREATE POLICY "Authenticated users can view allowed emails"
ON public.allowed_emails FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert allowed emails"
ON public.allowed_emails FOR INSERT TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can delete allowed emails"
ON public.allowed_emails FOR DELETE TO authenticated
USING (true);

-- Function to check if an email is in the allowlist
-- Called as a database hook or from edge function
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