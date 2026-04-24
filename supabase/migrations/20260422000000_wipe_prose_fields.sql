-- Wipe AI-generated prose section fields from all entity records.
-- Profiles will be written on demand via the Generate Profile button.
UPDATE public.entities
SET sections = sections
  - 'Overview' - 'Background' - 'Personality' - 'Relationships' - 'Notable Events'
WHERE category = 'characters';

UPDATE public.entities
SET sections = sections
  - 'Description' - 'History' - 'Notable Inhabitants' - 'Points of Interest'
WHERE category = 'places';

UPDATE public.entities
SET sections = sections
  - 'Description' - 'History' - 'Powers' - 'Current Whereabouts'
WHERE category = 'artifacts';

UPDATE public.entities
SET sections = sections
  - 'Description' - 'Regional Origin' - 'Known Users' - 'Imbued Weapons & Artifacts'
WHERE category = 'magic';
