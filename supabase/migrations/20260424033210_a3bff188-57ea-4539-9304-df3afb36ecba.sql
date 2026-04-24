CREATE OR REPLACE FUNCTION public.auto_add_first_name_alias()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  first_name TEXT;
BEGIN
  IF NEW.category = 'characters' THEN
    first_name := split_part(trim(NEW.name), ' ', 1);
    IF first_name != ''
      AND NOT (COALESCE(NEW.aliases, '{}') @> ARRAY[first_name])
    THEN
      NEW.aliases := array_append(COALESCE(NEW.aliases, '{}'), first_name);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;