-- Wipe AI-generated prose fields from entities so profiles can be regenerated cleanly.
-- Preserves non-prose fields like "Story History", "Magic & Abilities", and any custom keys.

UPDATE public.entities
SET sections = sections - 'Overview' - 'Background' - 'Personality' - 'Relationships' - 'Notable Events'
WHERE category = 'characters'
  AND (sections ?| ARRAY['Overview','Background','Personality','Relationships','Notable Events']);

UPDATE public.entities
SET sections = sections - 'Description' - 'History' - 'Notable Inhabitants' - 'Points of Interest'
WHERE category = 'places'
  AND (sections ?| ARRAY['Description','History','Notable Inhabitants','Points of Interest']);

UPDATE public.entities
SET sections = sections - 'Appearance' - 'Behaviour' - 'Abilities' - 'Habitat' - 'Lore'
WHERE category = 'creatures'
  AND (sections ?| ARRAY['Appearance','Behaviour','Abilities','Habitat','Lore']);

UPDATE public.entities
SET sections = sections - 'Description' - 'History' - 'Powers' - 'Current Whereabouts'
WHERE category = 'artifacts'
  AND (sections ?| ARRAY['Description','History','Powers','Current Whereabouts']);

UPDATE public.entities
SET sections = sections - 'Summary' - 'Causes' - 'Key Participants' - 'Consequences' - 'Aftermath'
WHERE category = 'events'
  AND (sections ?| ARRAY['Summary','Causes','Key Participants','Consequences','Aftermath']);

UPDATE public.entities
SET sections = sections - 'Description' - 'Regional Origin' - 'Known Users' - 'Imbued Weapons & Artifacts'
WHERE category = 'magic'
  AND (sections ?| ARRAY['Description','Regional Origin','Known Users','Imbued Weapons & Artifacts']);

UPDATE public.entities
SET sections = sections - 'Overview' - 'History' - 'Structure' - 'Notable Members' - 'Goals'
WHERE category = 'factions'
  AND (sections ?| ARRAY['Overview','History','Structure','Notable Members','Goals']);

UPDATE public.entities
SET sections = sections - 'Core Tenets' - 'Origins' - 'Followers' - 'Contradictions'
WHERE category = 'doctrine'
  AND (sections ?| ARRAY['Core Tenets','Origins','Followers','Contradictions']);

UPDATE public.entities
SET sections = sections - 'Overview' - 'Causes' - 'Key Figures' - 'Consequences' - 'Legacy'
WHERE category = 'history'
  AND (sections ?| ARRAY['Overview','Causes','Key Figures','Consequences','Legacy']);