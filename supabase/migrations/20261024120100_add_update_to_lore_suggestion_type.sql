-- Live schema has a 5th lore_suggestion_type value ('update', sortorder 5)
-- that was never captured in a migration — it was added directly to
-- production at some point. 37 live lore_suggestions rows use it
-- (discovered when the Phase 5a data import failed on this exact value).
ALTER TYPE lore_suggestion_type ADD VALUE IF NOT EXISTS 'update' AFTER 'new_tag';
