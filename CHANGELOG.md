# Changelog

All notable changes to Fyrescribe are recorded here.

---

## 2026-04-12 (session 6)

### Bug fixes — lore sync pipeline

**Sidebar (`Sidebar.tsx`)**
- Removed `disabled` attribute and `disabled:opacity-40 disabled:cursor-not-allowed` styling from the Sync button — it appeared permanently greyed-out because the base color (`text-text-dimmed`) matched the disabled appearance. The `handleSync` handler already returns early if there is no active project.
- Renamed "Sync Now" → "Sync Lore".
- Base color raised to `text-text-secondary` so the button is visibly actionable at all times.

**ManuscriptPage (`ManuscriptPage.tsx`)**
- Added `is_dirty: true` to the manuscript import scene insert batch. Previously scenes were inserted without the flag, inheriting the DB default `false`, so `sync-lore` never found them unless the user manually edited each scene first.
- Added `is_dirty: true` to the blank-project auto-create Scene 1 insert for the same reason.
- Root cause of "sync only works once": `is_dirty` was `false` on all freshly-inserted scenes. The debounced `saveScene` already correctly sets `is_dirty: true` on every edit; that path was not the bug.
- `is_dirty` lifecycle is now fully correct: `true` on insert → sync reads and clears to `false` → any subsequent edit sets it back to `true` → next sync picks up changes.

---

## 2026-04-12 (session 5)

### Lore sync pipeline

**`supabase/functions/sync-lore/index.ts`** (new edge function)
- Reads scenes where `is_dirty = true` for a given project (or all projects if no `project_id` supplied).
- Calls claude-sonnet-4-6 with a CATEGORY REFERENCE block listing every At a Glance field key and article section name per category, so the AI uses exact key strings.
- Each suggestion payload includes: `name`, `category`, `description`, `confidence`, `source_scene_title`, `fields` (all category keys pre-populated; AI fills what it can infer), `sections` (non-empty only, substantive content), `tags` (lowercase cross-reference strings).
- Writes results to `lore_suggestions` (`type = new_entity`, `status = pending`).
- Clears `is_dirty` on processed scenes; updates `projects.last_sync_at`; logs to `sync_log`.

**`supabase/migrations/20260412100000_pg_cron_lore_sync.sql`**
- Enables `pg_cron` + `pg_net`; schedules `daily-lore-sync` at 03:00 UTC via `net.http_post`.

### Lore Inbox UI

**`LoreInboxPage.tsx`** — full rewrite from placeholder data:
- Fetches pending `lore_suggestions` for the active project, newest first.
- Card shows: type badge, category badge, entity name, description, populated At a Glance fields (two-column grid), article section names as pills, suggested tags as gold pills, confidence bar, source scene.
- **Accept**: inserts entity with `fields` + `sections` JSONBs; upserts new tags into `tags` table and links via `entity_tags`; shows "Entity created → View" banner.
- **Edit**: inline name/description edit before accepting; sets status `edited`.
- **Reject**: marks `rejected` with `reviewed_at`.

**`Sidebar.tsx`**
- Removed hardcoded `loreSuggestionCount` prop; sidebar now fetches live pending count from Supabase.
- Added **Sync Now** button: invokes `sync-lore` for the active project, shows spinner, displays result message ("N new suggestions" / "Up to date"), refreshes count.

---

## 2026-04-12 (session 4)

### Post-migration cast cleanup

- `20260413000000_entity_category_updates.sql` confirmed applied to production.
- `types.ts` `entity_category` enum now authoritative: `abilities`→`magic`, `history` present. All `as EntityCategory` / `as any` workaround casts removed.
- `EntityGalleryPage`: `activeFilter` state typed as `EntityCategory | "all"`; URL param (`useParams`) and select `onChange` both resolved via `ENTITY_CATEGORIES.find()` — no casts needed; Supabase query result narrowed to `EntityRow[]` instead of `any`.

---

## 2026-04-12

### Deployment and type-sync cleanup

- Deployed `generate-timeline` Supabase Edge Function to production.
- Synced `src/integrations/supabase/types.ts` to match the live production DB. Discovered that migration `20260413000000_entity_category_updates.sql` (rename `abilities`→`magic`, add `history`) has not been applied to production; types reflect the real DB state (`abilities`, no `history`).
- Added `as EntityCategory` casts on `"history"` and `"magic"` values in `EntityGalleryPage.tsx`, and `as any` cast on `filterCategory` in `EntityDetailPage.tsx` (`LinkEntityModal`) to keep the build passing until the migration is applied to production.

---

## 2026-04-11 (session 3)

### Entity system — 10-feature batch

**DB / Types**
- Renamed `abilities` enum value to `magic`; added `history` as a new `entity_category` value (`supabase/migrations/20260413000000_entity_category_updates.sql`).
- Updated `src/integrations/supabase/types.ts` to match.

**Sidebar**
- Removed POV Tracker from nav (route kept).
- Added History entry (BookMarked icon) between Events and Artifacts.
- Renamed Abilities → Magic (Wand2 icon).

**EntityGalleryPage**
- History and Magic categories added to filter pills.
- Smart tag clicking: 1 matching entity → navigate directly; >1 → `/world?tag=<id>`.
- Tag filter via `?tag=<id>` search param with "× Clear tag filter" pill.
- Heading shows "Tagged: [name]" when tag filter active.

**EntityDetailPage** — major rewrite
- `CATEGORY_FIELDS`: structured At a Glance keys per category; seeded on load if fields empty.
- Field values that exactly match a project tag name render as clickable gold pills.
- Character entities: "Magic & Abilities" section (rich text + linked magic pills) + "Related Artifacts" linked section.
- Creature entities: "Characters of this Species" (entity_links with `relationship="species"`).
- Magic sections: Description, Regional Origin, Known Users, Imbued Weapons & Artifacts.
- History sections: Overview, Causes, Key Figures, Consequences, Legacy.
- Delete entity: three-dot actions menu → `DeleteModal` → deletes entity + entity_links (both directions) + entity_tags → navigate to gallery.
- Smart tag clicking on entity detail header tags (same 1-entity / >1-entities logic).
- `LinkEntityModal` extended with `filterCategory` and `relationship` props.

### Drag and drop scenes (ManuscriptPage)
- Scenes in the chapter/scene sidebar are `draggable`.
- Dragging a scene onto another chapter's container calls `handleDropSceneOnChapter`: updates `chapter_id` and `order` in Supabase, expands the target chapter.
- Scene being dragged renders at 40% opacity; target chapter highlights with gold glow.

### Timeline — generate from lore
- `TimelinePage.tsx` now reads from `timeline_events` Supabase table (real data).
- "Generate from Lore" button invokes new `supabase/functions/generate-timeline/index.ts` Supabase Edge Function.
- Edge function: fetches Event/History entities + scene excerpts, calls Anthropic claude-sonnet-4-6, inserts `{label, date_label, date_sort, type}[]` into `timeline_events`.
- Events show a hover-reveal Trash2 delete button.
- Error banner shown if edge function call fails (e.g. missing ANTHROPIC_API_KEY secret).

## 2026-04-11 (session 2)

### Theme system — pulled from upstream
- Six themes (Midnight, Fireside, Lavender Haze, Enchanted, Futureworld, Daylight) via `ThemeContext` + `ThemeSwitcher`. Preferences persisted to `user_preferences` Supabase table (`supabase/migrations/20260412005546_...sql`).
- Sparkle toggle (`GlobalSparkle` + `StarfieldBackground`) — animated star overlay, persisted alongside theme.
- Titlebar updated with `ThemeSwitcher` and profile dropdown; inline project title rename.
- `ProjectsPage` gains duplicate, archive/unarchive, and delete-with-confirmation actions.

### Theme switching bug fix
- **Problem**: switching away from Futureworld left green text and Silkscreen font visible on some elements.
- **Root cause**: `--font-ui` was handled via `removeProperty` (unreliable) rather than explicit values, and it served two conflicting roles (system-sans fallback for `body` vs. Cinzel fallback for `.font-display`).
- **Fix**: split `--font-ui` into `--font-body` + `--font-display`; added all three font vars (`--font-body`, `--font-display`, `--font-prose`) to every theme's `THEME_VARS` with explicit values. `applyTheme` now clears all managed variables before setting the incoming theme (clear-then-set), guaranteeing no value from a previous theme survives. Removed the `if (theme === "futureworld")` special-case block entirely.
- Updated `index.css`: `body`, `.font-display`, `.font-prose` reference `var(--font-body)`, `var(--font-display)`, `var(--font-prose)` with no fallbacks (always defined). Scrollbar and contenteditable placeholder now use `hsl(var(--bg-hover))` / `hsl(var(--text-dimmed))` instead of hardcoded midnight values.

## 2026-04-11

### Manuscript editor UX
- Auto-create Chapter 1 + Scene 1 on first project visit when no chapters exist; editor gains focus immediately via `pendingAutoFocus` ref.
- Inline rename for chapter and scene titles: click a title to enter edit mode, press Enter or blur to save to Supabase.
- Chapter chevron expands/collapses only; title click is reserved for rename.
- Active scene title in sidebar is also click-to-rename.

### Manuscript import pipeline (Part 1 — text, no AI)
- `OnboardingPage` `ImportModal`: after uploading to the `manuscripts` storage bucket, now correctly saves the storage path back to `projects.manuscript_path` (was missing, causing import to silently fail).
- New `manuscripts` Supabase storage bucket with RLS policies (`supabase/migrations/20260411232720_...sql`).
- New `manuscript_path TEXT` column on `projects` (`supabase/migrations/20260411233707_...sql`).
- `ManuscriptPage`: on first load with `manuscript_path` set and no chapters, downloads the file, strips RTF (for `.rtf` files), and runs `parseManuscript` to build the chapter/scene tree. Inserts chapters sequentially then batch-inserts scenes. Shows status messages during import.

### Manuscript parser (`src/lib/manuscriptParser.ts`)
- Replaced flat `splitIntoScenes` with `parseManuscript` returning `ParsedChapter[]` with proper chapter → scene nesting.
- Added `HEADING_RE` (`chapter|part|prologue|epilogue|interlude`) and `INVISIBLE_PREFIX_RE` (BOM, ZWSP, NBSP) for robust heading detection.
- Added `splitBlockAtEmbeddedHeadings`: re-splits double-newline blocks at any embedded heading line so single-newline manuscripts (where all content arrives as one block) are parsed correctly.
- Single-line pre-heading blocks (book title) are now skipped rather than treated as scene content.
- Removed temporary debug `console.log` statements.

### Entity persistence
- Entity detail sections (JSONB) and gallery images persist correctly across navigation.
