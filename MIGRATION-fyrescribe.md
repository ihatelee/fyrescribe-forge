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

# Phase 5b: backend cutover prep

- Rewrote the 4 stored `bedrzyekoynnzdeblunt.supabase.co` URLs in
  `entities.cover_image_url` / `gallery_image_urls` to the new project's
  storage host. All text/jsonb/array columns across every public table were
  scanned first — these 4 were the only hits. One rewritten gallery URL
  still 404s because it was never in the Lovable export to begin with
  (pre-existing dead reference, not migration-caused).
- Deleted the 4 orphaned manuscript files under `batheinradiowavs@gmail.com`
  that referenced project ids no longer in the `projects` table (leftovers
  from deleted/replaced projects — not, as originally assumed, files owned
  by a skipped account). Backed up locally before deleting.
- Set `ANTHROPIC_API_KEY` as an edge function secret.
- Deployed all 13 edge functions with default `verify_jwt = true`
  (no per-function settings exist in `config.toml`, historically or now —
  confirmed all 13 return 401 to unauthenticated calls).
- `claude-sonnet-4-20250514` is retired (404s). Swapped to
  `claude-sonnet-4-5-20250929` in the 10 functions that referenced it
  (model string only). `claude-haiku-4-5-20251001` still works unchanged.
  (Nov 11, 2026: both superseded in turn — `claude-sonnet-4-5-20250929`
  was itself retiring Nov 30, 2026. All Anthropic calls now import a
  model id from `supabase/functions/_shared/models.ts` instead of a
  hardcoded string, currently `claude-sonnet-5-5` / `claude-haiku-5-5`.)
- Set both accounts' passwords via the Admin API; both emails stay
  confirmed.
- Added `.github/workflows/nightly-backup.yml` and `keep-alive.yml`,
  mirroring `fanclub-apps`. Repo secrets `SUPABASE_DB_URL` and
  `SUPABASE_ANON_KEY` (publishable key) set via `gh secret set`.
- Anonymous audit (publishable key): every table returns 0 rows and
  rejects writes, `allowed_emails` unreadable, `manuscripts` bucket
  unlistable, intentionally-public buckets still public.

# Phase 5c: app changes, preview, AI feature testing

- `vite.config.ts`: removed the hardcoded fallback to the old project;
  the build now throws if `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY`
  / `VITE_SUPABASE_PROJECT_ID` are missing, instead of silently serving
  against the wrong backend.
- Removed `@lovable.dev/cloud-auth-js`, `lovable-tagger`, and the dead
  `src/integrations/lovable` module (nothing imported it).
- Replaced `public/_redirects` (Netlify-style) with `vercel.json`'s SPA
  rewrite.
- Hid the Google sign-in button on `AuthPage` (both accounts use
  email/password).
- Created the Vercel project `fyrescribe` from `ihatelee/fyrescribe-forge`,
  env vars set (not Sensitive) across all environments, preview deployed
  and tested signed in as `batheinradiowavs@gmail.com`: manuscript
  open/edit/save/version-history, entities with images, timeline, notes,
  soundscape, theme switching — all pass.
- Supabase Auth URL Configuration (new project only): Site URL
  `https://app.fyrescribe.com`; redirect URLs for `app.fyrescribe.com/**`,
  `fyrescribe.com/**`, and the Vercel preview wildcard.
- Created a throwaway `MIGRATION TEST` project and exercised every AI
  feature (sync-lore, sync-mentions, sync-tags, link-lore, parse-lore-file,
  generate-profile, generate-story-history, generate-timeline,
  check-continuity, merge-entity-sections, summarize-version,
  summarize-entity-version). Deleted it afterward; verified all 14 table
  row counts match the pre-test baseline exactly (found and cleaned up 2
  tables — `entity_versions`, `mention_suggestions` — that the app's own
  project-delete flow doesn't cascade through; pre-existing gap, not
  fixed).

  Two findings from that testing pass:
  - **Fixed (migration-caused):** `claude-sonnet-4-5-20250929` silently
    returned all-empty fields for `parse-lore-file`'s long multi-category
    system prompt. Verified via direct Anthropic API calls with the exact
    deployed prompt: `claude-haiku-4-5-20251001` and `claude-sonnet-4-6`
    both extract correctly, only that one model fails on this prompt.
    Swapped `parse-lore-file` specifically to `claude-sonnet-4-6`.
  - **Pre-existing, not fixed:** accepting an "update"-type Lore Inbox
    suggestion (`LoreInboxPage.tsx`) computes `fieldsToWrite` from the AI's
    `at_a_glance` payload but never writes it to the entity in the merge
    branch — only `sections` get merged, and the background
    `merge-entity-sections` call only fires when the suggestion also
    contains prose `sections`. Field-only updates are silently dropped.

# Phase 5d: cutover

- Merged `phase5c-cutover-prep` → `main` (fast-forward); Vercel's GitHub
  integration auto-deployed it to production, confirmed Ready.
- Added `app.fyrescribe.com` and `fyrescribe.com` to the Vercel project.
  `fyrescribe.com` is configured as a 308 redirect to `app.fyrescribe.com`
  (it was never a working domain — no DNS records existed for it before
  this migration).
- Namecheap DNS (A `@` → `216.198.79.1`, CNAME `app` →
  `92e31278610fee92.vercel-dns-017.com.`) set by Lee. Verified via
  1.1.1.1/8.8.8.8 and `curl --resolve` against both target IPs: `app.`
  serves the Vercel app (200, `server: Vercel`), apex 308s to `app.`.
  Confirmed live: signed in as `batheinradiowavs@gmail.com`, real projects
  load correctly.
- Removed `app.fyrescribe.com` from the Lovable project's connected
  domains. Deleted the `_lovable.app.fyrescribe.com` TXT verification
  record in Namecheap.
- Re-ran the anonymous audit post-cutover: unchanged, all passes.
- `nightly-backup.yml` could not be run from this session (Claude Code's
  own safety classifier blocks triggering a workflow that dumps the full
  DB to an artifact) — `keep-alive.yml` ran successfully. Run
  `nightly-backup.yml` manually once (Actions tab → Run workflow) to
  confirm it works end to end.

## Rollback

- **DNS**: revert the `app` CNAME and apex `A` record at Namecheap to
  whatever they pointed at before this migration (Lovable's values — not
  recorded here since `app.fyrescribe.com` was the only one configured and
  its prior value wasn't captured before the switch). Re-add
  `app.fyrescribe.com` to the Lovable project's domains and restore the
  `_lovable.app.fyrescribe.com` TXT record (Lovable will show the exact
  value to re-add during reconnection).
- **App**: the `main` branch before this migration is commit `caf210e`.
  `git revert` or redeploy that commit's Vercel build if the new app code
  needs to be rolled back independently of DNS.
- **Backend**: the old Lovable-managed project (`bedrzyekoynnzdeblunt`)
  was never written to during this migration — it's untouched and still
  has all original data, so rollback at the DNS level alone fully restores
  the pre-migration state. The new `fyrescribe` Supabase project can be
  left running (nightly backups via GitHub Actions) or paused once the
  cutover is confirmed stable.

# Post-migration fixes (2026-11-09)

Two pre-existing Fyrescribe bugs noted during Phase 5c testing (see above)
were fixed on branch `fix/lore-inbox-fields-and-cascade-fks`, merged to
`main` as `ea985ce`.

- **Lore Inbox dropped at-a-glance fields on accept.** In
  `LoreInboxPage.tsx`, `acceptOneSuggestion` computed `fieldsToWrite` from
  the AI's `at_a_glance` payload, but the merge branch (used whenever a
  fuzzy name+category match finds an existing entity — the normal case for
  "update" suggestions) only ever wrote `sections`, `summary`, and
  `aliases`; `fields` was only included on the create-new-entity path. Now
  the merge branch spreads `fieldsToWrite` over the entity's existing
  `fields`, independent of whether prose sections are also present. Covers
  both accept and edit-then-accept. Added `src/pages/LoreInboxPage.test.tsx`.
- **Deleting a project orphaned rows.** `entity_versions`,
  `mention_suggestions`, `rejected_mentions`, and `tag_suggestions` had no
  foreign key constraints at all on their `project_id`/`entity_id`/
  `scene_id` columns. Migration
  `20261109063350_add_cascade_fks_project_delete_cleanup.sql` adds
  `ON DELETE CASCADE` FKs on all 11 affected columns, matching the pattern
  already used by `entity_mentions`/`scene_versions`/etc. Verified zero
  orphans existed beforehand; verified zero orphans remain anywhere after
  deleting a throwaway test project, with real data row counts unchanged.
