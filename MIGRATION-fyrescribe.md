# Phase 5a: Lovable export → fyrescribe Supabase project

Imported the Lovable-exported data into the new, empty `fyrescribe` Supabase
project. No app code or edge functions were touched; `supabase/config.toml`
now points at the new project.

## Accounts imported

Only two of the six exported accounts were imported, per decision:

| Email | Original auth id | Rows | Storage files |
|---|---|---|---|
| `batheinradiowavs@gmail.com` | `bec809d4-f9bb-47b1-938f-b9effa4fb512` | 2 projects, the bulk of the data | 15 (10 entity-images + 5 manuscripts) |
| `hello@emmanicolephotos.com` | `49dad142-c5fb-48e6-8107-a4170cebaad4` | 1 project | 1 entity-image |

Both were created via the Auth Admin API with their **original ids and
emails**, email pre-confirmed, random unusable password (set a real password
in Phase 5b). `allowed_emails` was loaded with only these two entries before
the users were created.

**Not imported** (by explicit decision): `fanclub@ihatelee.com`,
`samlingx@gmail.com`, `claudecode@ihatelee.com`, `thomson.elin@gmail.com`, and
the deleted test account (`9ffeff9a-...`, no email on record). None of their
rows or files were loaded.

## Schema

All 54 existing migrations were replayed in order against the empty project,
plus three new migrations (committed to branch `phase5a-import-inspection`):

1. `20261024120000_fix_not_null_pov_and_significance.sql` — sets
   `entities.is_pov_character` and `timeline_events.significance_score` to
   `NOT NULL`, matching live. An earlier `ADD COLUMN IF NOT EXISTS ... NOT
   NULL` migration had silently no-opped the constraint on replay because the
   column already existed by that point.
2. `20261024120100_add_update_to_lore_suggestion_type.sql` — adds the
   `'update'` value to the `lore_suggestion_type` enum. **This was discovered
   during this import**, not during the Part 1 schema diff: it had been added
   directly to production without ever being captured in a migration, and 37
   live `lore_suggestions` rows use it. The data load failed on this exact
   value until the fix was applied.
3. Migration `20260516000000_retire_entity_tags_and_history_category.sql`
   (already in the repo, previously unapplied to production) was replayed
   as-is, per decision: `entity_category` drops `'history'` and the empty
   `entity_tags` table is removed. Zero rows used either.

Resulting schema matches the live export exactly: enums, functions,
triggers, RLS policies (31/32 matched before this retirement; the retirement
accounts for the 32nd), and storage bucket flags (`entity-images` public,
`manuscripts` private, `soundscapes` public — all pre-existing from the
migrations, no size/mime-type limits).

## Data loaded

919 rows in the export; 672 loaded, 247 skipped (all itemized):

| Table | Exported | Loaded | Skipped | Why skipped |
|---|---|---|---|---|
| `allowed_emails` | 11 | 2 | 9 | not among the 2 imported accounts |
| `projects` | 4 | 3 | 1 | owned by `samlingx@gmail.com` (not imported) |
| `chapters` | 5 | 4 | 1 | same |
| `entities` | 54 | 53 | 1 | same |
| `scenes` | 6 | 5 | 1 | same |
| `user_preferences` | 4 | 1 | 3 | owned by `fanclub@ihatelee.com`, `thomson.elin@gmail.com`, deleted test account |
| `notes` | 10 | 10 | 0 | — |
| `entity_versions` | 2 | 2 | 0 | — |
| `entity_mentions` | 83 | 83 | 0 | — |
| `entity_links` | 34 | 34 | 0 | — |
| `lore_suggestions` | 349 | 349 | 0 | — |
| `lore_link_suggestions` | 16 | 16 | 0 | — |
| `scene_versions` | 1 | 1 | 0 | — |
| `timeline_events` | 17 | 17 | 0 | — |
| `sync_log` | 91 | 91 | 0 | — |
| `tags` | 1 | 1 | 0 | — |
| `mention_suggestions` | 231 | 0 | 231 | **all** rows referenced two project ids that don't exist anywhere in the export — dangling data from projects deleted before export, unrelated to which accounts were chosen |
| `tag_suggestions`, `entity_tags`, `rejected_mentions` | 0 | 0 | 0 | empty tables |

All ids and timestamps were preserved from the export. The `trg_auto_alias_first_name`,
`update_entities_updated_at`, `update_notes_updated_at`, and
`update_scenes_updated_at` triggers were disabled for the load and re-enabled
immediately after, in a single transaction.

## Storage loaded

24 of 41 exported files uploaded, to the same bucket/path structure:

- `entity-images`: 11 files (1 for `hello@emmanicolephotos.com`, 10 for `batheinradiowavs@gmail.com`)
- `manuscripts`: 5 files, all for `batheinradiowavs@gmail.com`
- `soundscapes`: 8 files (global assets, no owner prefix)

Skipped: all 17 files belonging to the deleted test account (16 duplicate
manuscripts + 1 entity image).

**Note for awareness, not acted on**: of `batheinradiowavs@gmail.com`'s 5
uploaded manuscript files, only 1 (`77005dc7-.../manuscript.txt`) is
referenced by that account's current `projects.manuscript_path`. The other 4
sit under project ids that no longer exist in the `projects` table (the same
two ids `mention_suggestions` dangled on, plus two more) — leftover files
from deleted/replaced projects. They were uploaded because the task's skip
criteria was account-level, not project-level, and the owning account was
imported. They're unreachable from the current app UI but do consume
storage.

Also for awareness: `entities.gallery_image_urls` / `cover_image_url` values
in the imported data are full URLs pointing at the **old** project
(`bedrzyekoynnzdeblunt.supabase.co`), preserved verbatim from the export.
They won't resolve against the new project's storage until a follow-up pass
rewrites them — out of scope for this phase.

## Verification

- Every loaded table's row count matches the itemized plan above.
- Storage file counts match per bucket; bucket public/private flags match
  the live export exactly.
- RLS is enabled on all 19 public tables.
- `entity_category` (8 values), `lore_suggestion_type` (5 values, including
  the newly-added `'update'`), and all other enums match the live export.
- Database size: ~13 MB. Storage: ~37.5 MB. Both comfortably within
  Supabase's free-tier limits — worth re-confirming current limits directly
  with Supabase since they can change.

## Not done in this phase

- No passwords set on the two imported accounts (Phase 5b).
- No rewriting of old-project storage URLs embedded in `entities` data.
- No cleanup of the 4 orphaned manuscript files noted above.
- No app code or edge function changes; no deploys.
