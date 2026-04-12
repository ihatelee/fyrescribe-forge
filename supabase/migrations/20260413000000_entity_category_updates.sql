-- Rename abilities → magic (renames the enum value in all existing rows automatically)
ALTER TYPE public.entity_category RENAME VALUE 'abilities' TO 'magic';

-- Add history to the entity_category enum
ALTER TYPE public.entity_category ADD VALUE IF NOT EXISTS 'history';
