CREATE OR REPLACE FUNCTION auto_add_first_name_alias()
RETURNS TRIGGER AS $$
DECLARE
  first_name TEXT;
BEGIN
  IF NEW.category = 'characters' THEN
    first_name := split_part(trim(NEW.name), ' ', 1);
    IF first_name != trim(NEW.name)
      AND NOT (COALESCE(NEW.aliases, '{}') @> ARRAY[first_name])
    THEN
      NEW.aliases := array_append(COALESCE(NEW.aliases, '{}'), first_name);
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path TO 'public';