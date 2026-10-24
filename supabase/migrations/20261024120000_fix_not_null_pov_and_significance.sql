-- Match live schema: these columns were NOT NULL in production but an
-- earlier ADD COLUMN ... NOT NULL migration became a silent no-op on replay
-- because the column already existed by that point (IF NOT EXISTS short-circuits
-- the whole clause). No row has a NULL in either column.
ALTER TABLE entities ALTER COLUMN is_pov_character SET NOT NULL;
ALTER TABLE timeline_events ALTER COLUMN significance_score SET NOT NULL;
