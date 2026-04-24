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
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_alias_first_name ON entities;

CREATE TRIGGER trg_auto_alias_first_name
BEFORE INSERT ON entities
FOR EACH ROW
EXECUTE FUNCTION auto_add_first_name_alias();