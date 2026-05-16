-- Retire entity_tags table and remove history from entity_category enum.

-- Part 1: Drop entity_tags
DROP TABLE IF EXISTS public.entity_tags;

-- Part 2: Remove 'history' from entity_category enum.
-- Postgres does not support DROP VALUE, so the safe approach is:
--   1. Reassign existing history entities to 'events' (no data loss)
--   2. Create a new enum without 'history'
--   3. Migrate the column to the new enum
--   4. Swap the type names

-- Step 1: Reassign any entities with category = 'history' to 'events'
UPDATE public.entities SET category = 'events' WHERE category = 'history';

-- Step 2: Create replacement enum without 'history'
CREATE TYPE public.entity_category_new AS ENUM (
  'characters',
  'places',
  'events',
  'artifacts',
  'creatures',
  'magic',
  'factions',
  'doctrine'
);

-- Step 3: Migrate the column (cast via text)
ALTER TABLE public.entities
  ALTER COLUMN category TYPE public.entity_category_new
  USING category::text::public.entity_category_new;

-- Step 4: Swap enum names
DROP TYPE public.entity_category;
ALTER TYPE public.entity_category_new RENAME TO entity_category;
