# Fyrescribe — Claude Working Notes

## What "update documentation" means

When asked to "update documentation", "update CLAUDE.md", or "update the docs":
1. Update the **Current State** section to reflect what is now built and working.
2. Update the **Where We Left Off** section to reflect the current stopping point.
3. Append a new dated entry to **CHANGELOG.md** summarising what was done in the session.
4. Do NOT change the Tech Stack, Key Conventions, or Do Not Touch sections unless explicitly asked.

---

## Current State

Fyrescribe is a fantasy novel writing companion app. Users manage a project (a novel), write their manuscript in a chapter/scene editor, and will eventually use AI to extract world-building lore from their text.

### What is built and working

- **Auth** — Supabase email/password auth via `AuthPage`. `AuthContext` + `ProtectedRoute` gate all app routes.
- **Projects** — `ProjectsPage` lists all projects for the user. `ProjectContext` + localStorage persist the active project across navigation. Projects support inline title rename, duplicate, archive/unarchive, and delete (with typed confirmation).
- **Onboarding** — `OnboardingPage` offers "Start fresh" (opens `NewProjectModal`) or "Import a manuscript" (opens `ImportModal`). Import uploads the file to the `manuscripts` Supabase storage bucket and saves the storage path to `projects.manuscript_path`.
- **Manuscript editor** (`ManuscriptPage`) — Three-panel layout: sidebar (chapter/scene tree), editor (contentEditable), detail panel.
  - On first visit with no chapters, auto-creates Chapter 1 + Scene 1.
  - Chapter/scene names are editable inline (click to rename; Enter or blur saves).
  - Scene content auto-saves with a 1-second debounce.
  - `contentCache` Map ref preserves unsaved content across scene switches.
  - `data-initialized` guard on contentEditable prevents `innerHTML` reset on re-render.
  - `pendingAutoFocus` ref focuses the editor after auto-create.
- **Manuscript import pipeline (Part 1 — text only, no AI)**:
  - On first load with `manuscript_path` set but no chapters yet, the page downloads the file from storage, strips RTF if `.rtf`, then calls `parseManuscript`.
  - `parseManuscript` splits on double newlines, then re-splits each block at embedded heading lines (handles single-newline manuscripts). Book title (single-line pre-heading block) is skipped.
  - Chapters and scenes are inserted into Supabase sequentially.
- **Theme system** — `ThemeContext` + `ThemeSwitcher`. Six themes: Midnight, Fireside, Lavender Haze, Enchanted, Futureworld, Daylight. Preferences persisted to `user_preferences` Supabase table. Futureworld uses Silkscreen + Fira Code fonts; all other themes use Cinzel (display) + EB Garamond (prose) + system sans-serif (body). All theme styles — including fonts — flow exclusively through CSS variables (`--font-body`, `--font-display`, `--font-prose`, plus the full set of color tokens). `applyTheme` clears all managed variables before setting the new theme, guaranteeing no bleed-through.
- **Sparkle toggle** — `GlobalSparkle` + `StarfieldBackground` render an animated star/sparkle overlay, persisted alongside theme preference.
- **Icon sets** — `src/lib/iconSets.ts` defines three icon sets (Fantasy, Sci-Fi, Standard) using Phosphor icons. Each set provides icons for all 13 sidebar slots (manuscript, timeline, all 9 entity categories, inbox, sync). `THEME_DEFAULT_ICON_SET` maps themes to their default set (Midnight/Fireside/Lavender/Enchanted → fantasy, Futureworld → scifi, Daylight → standard). Icon set preference persisted to `user_preferences.icon_set` (migration `20260413000331_...sql`). `ThemeContext` + `ThemeSwitcher` + `Sidebar.tsx` updated to use the active icon set.
- **Entity system** — `EntityGalleryPage` + `EntityDetailPage` with 9 categories: characters, places, events, history, artifacts, creatures, magic, factions, doctrine.
  - `abilities` enum value renamed to `magic`; `history` added as a new enum value (`supabase/migrations/20260413000000_entity_category_updates.sql`). Migration applied to production; `types.ts` updated to match.
  - POV Tracker removed from sidebar (route kept in App.tsx).
  - Each category has structured "At a Glance" fields (seeded from `CATEGORY_FIELDS` constant if empty). Field values that exactly match a project tag name render as clickable gold pills.
  - `sections` JSONB stores rich article sections; each category has a predefined section list.
  - Character entities have a "Magic & Abilities" section (rich text + linked magic entity pills) and a "Related Artifacts" linked section.
  - Creature entities have a "Characters of this Species" linked section (entity_links with `relationship="species"`).
  - Magic entities have sections: Description, Regional Origin, Known Users, Imbued Weapons & Artifacts.
  - History entities have sections: Overview, Causes, Key Figures, Consequences, Legacy.
  - Delete entity via three-dot actions menu → confirmation modal → deletes entity + entity_links (both directions) + entity_tags.
  - Smart tag clicking: 1 matching entity → navigate directly; >1 → filtered gallery at `/world?tag=tagId`. Applies on gallery cards and entity detail header tags.
  - Entity gallery supports tag filtering via `?tag=<id>` search param with "× Clear tag filter" pill.
- **Manuscript drag and drop** — scenes in the chapter/scene sidebar are `draggable`. Dragging a scene onto a different chapter's container moves it to that chapter in Supabase and updates the `order` field. Dropped-into chapters auto-expand. Visual highlight (gold glow + ring) on drag-over chapter.
- **Timeline** — `TimelinePage` reads from `timeline_events` Supabase table (real data, no placeholder). "Generate from Lore" button invokes the `generate-timeline` Supabase Edge Function which reads Event/History entities + scene excerpts, calls claude-sonnet-4-6 via Anthropic API, and inserts the returned `{label, date_label, date_sort, type}[]` events. Events can be deleted (hover reveals trash icon). Edge function is deployed to production.
  - **Add Event modal** — "Add Event" button wired up. Modal takes: event name, Date/Era dropdown (`ERA_OPTIONS`: Ancient Times → Present Day, each with a numeric `date_sort`), type (Story Event / World History), and an optional checkbox to also create a corresponding `events` lore entity with pre-seeded `fields` and `sections`.
  - **Drag-to-reorder** — timeline events are draggable. Drop above/below a target card; `date_sort` is recalculated by interpolating between neighbours. Gold drop indicator line shows above/below target. Persisted to Supabase.
  - **Bulk delete** — hover-reveal "delete" checkbox per event card. When any are checked a bulk action bar appears ("Delete Selected (N)" + "Clear selection"). Bulk delete cascades correctly.
- **Lore sync pipeline** — `supabase/functions/sync-lore/index.ts` edge function. Confirmed working end-to-end with real manuscript content. Architecture: one Anthropic API call per scene, returning a JSON array of all named entities found (no per-scene cap; `max_tokens: 4000`). Scenes are queried with their parent chapter title (`chapters(title)` join). Prompt is aggressive: extract every named entity — if it has a proper noun, suggest it. Shows `LOCATION: Chapter Title › Scene Title` in the prompt for structural context. Confidence threshold is 0.4. Each suggestion payload contains: `name`, `category`, `description`, `confidence`, `source_scene_title`, `source_location` (formatted as `"Chapter Title › Scene Title"`), `source_sentence` (verbatim sentence where entity first appears), `fields` (all At a Glance keys for the category, AI-populated where inferable, matched case-insensitively), `sections` (non-empty article sections, case-insensitive key match), `tags` (lowercase cross-reference strings). Deduplicates by name across scenes (highest confidence wins). Clears `is_dirty` on processed scenes, updates `projects.last_sync_at`, and logs to `sync_log`. Deployed to production. Daily pg_cron job (`daily-lore-sync`, 03:00 UTC) calls the function for all projects via `net.http_post`. Force sync mode (`force=true`) ignores `is_dirty` and processes all scenes — accessible via the "all" button in the sidebar.
- **Lore Inbox** (`LoreInboxPage`) — fully wired to Supabase. Shows pending `lore_suggestions` for the active project. Each card displays: type badge, category badge, entity name, description, populated At a Glance fields (two-column grid), article section names (pills), suggested tags (gold pills), confidence bar, source scene. **Accept**: inserts entity with pre-populated `fields` and `sections` JSONBs; upserts new tags into `tags` table and links via `entity_tags`; shows "Entity created → View" banner. **Edit**: inline name/description edit before accepting (sets status `edited`). **Reject**: marks `rejected` with `reviewed_at`.
- **Sidebar — Sync Lore** — `Sidebar.tsx` fetches live pending count from `lore_suggestions` (replacing hardcoded prop). "Sync Lore" button invokes `sync-lore` for the active project, shows spinner, displays brief result message ("N new suggestions" / "No edited scenes" / "N scenes processed, 0 suggestions"), then refreshes the count. Small "all" button triggers force sync. Button has no `disabled` state (handler guards internally).
- **Entity gallery — view toggle** — card/list toggle in the gallery header, persisted to `localStorage` (`fyrescribe_entity_view_mode`). List view shows category badge, name, summary, tags (up to 3 + overflow count), and 3-dot menu per row.
- **Entity gallery — 3-dot menu** — Archive (soft-delete via `archived_at`) and Delete (PERMANENTLY DELETE confirmation, cascades `entity_links` + `entity_tags`) on every entity card and list row, matching the projects page interaction pattern. Archived entities appear in a collapsible section at the bottom; click to unarchive. Migration: `20260412210000_entity_archived_at.sql`.
- **Entity gallery — bulk delete** — hover-reveal "delete" checkbox on each card and list row. Bulk action bar ("Delete Selected (N)" + "Clear selection") appears when any are checked. Cascades `entity_links` + `entity_tags` before deleting the entity, matching the single-delete behaviour.
- **Storage buckets** — `entity-images` (entity gallery images), `manuscripts` (uploaded manuscript files). Both use RLS policies keyed on `storage.foldername(name)[1] = auth.uid()`.
- **Other pages** — `POVTrackerPage` exists (scaffolded).

### What is NOT yet built

- POV tracker logic.
- Word count tracking (column exists on `scenes`, not yet wired up).
- Project archiving (column `archived_at` exists on `projects`, not yet used in UI).
- Timeline: manual "Add Event" is now wired up — see above.
- Lore Inbox: `field_update`, `contradiction`, and `new_tag` suggestion types are displayed but the sync function only produces `new_entity` suggestions today.
- Sync Lore progress UI — no per-scene progress feedback while sync is running; sidebar just shows a spinner for the full duration.
- `source_sentence` and `source_location` stored in suggestion payload; `source_location` now displayed in the Lore Inbox card. `source_sentence` stored but not yet surfaced in the UI.

---

## Next Session

1. **Regenerate `types.ts`** — run `supabase gen types typescript` after all pending migrations to eliminate the 9 `as any` / `as unknown as` casts scattered across `ThemeContext.tsx`, `EntityGalleryPage.tsx`, `ProjectsPage.tsx`, `LoreInboxPage.tsx`, `EntityDetailPage.tsx`, and `OnboardingPage.tsx`. All are Supabase type-gap issues, not logic bugs.
2. **Wire up timeline ↔ entity links** — `entity_id` FK exists on `timeline_events` but is never written or read. Three places to fix: (a) `TimelinePage.tsx` `TimelineEvent` interface + select query, (b) `supabase/functions/generate-timeline/index.ts` insert, (c) `AddEventModal` — write the created entity's ID back to the timeline event row.
3. **Character sheet upload** — add PDF/plain-text upload to `EntityDetailPage` (characters category). Parse the file (strip RTF/PDF formatting), extract field values, pre-populate the At a Glance fields and sections. No edge function exists yet.
4. **README** — replace the Lovable boilerplate in `README.md` with a real Fyrescribe project description (what it is, stack, local dev setup).
5. **LICENSE file** — add a `LICENSE` file to the project root.
6. **Hand off to Lovable for Session 4 visual polish pass and domain connection.**

---

## Where We Left Off

**Session: 2026-04-13 (session 10 — Lovable pull)**

`git pull` brought in 30 Lovable commits. All our prior changes intact. Lovable added:

- **Timeline overhaul**: Add Event modal (era dropdown, type, optional lore entity creation), drag-to-reorder (date_sort interpolation), bulk delete with checkboxes.
- **Icon sets**: `iconSets.ts` with Fantasy/Sci-Fi/Standard Phosphor icon sets; theme-defaulted; persisted to `user_preferences.icon_set`.
- **Entity gallery bulk delete**: hover-reveal checkboxes + bulk action bar, matching Timeline pattern.

No code was written by Claude this session — documentation-only update after pull.

**Pending / next logical steps:**
- Display `source_sentence` in the Lore Inbox card (stored in payload, not yet shown in UI).
- Add a progress toast or per-scene counter to the sidebar sync flow so users can see it working on large manuscripts.
- Consider extending sync to produce `field_update` and `contradiction` suggestion types.
- Word count tracking — wire up `scenes.word_count` to the editor's save path.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 18 + TypeScript + Vite |
| Styling | Tailwind CSS v3 + shadcn/ui (Radix primitives) |
| Routing | React Router v6 |
| Server state | TanStack Query v5 |
| Backend / DB | Supabase (Postgres + Auth + Storage) |
| Runtime / package manager | Bun |
| Testing | Vitest + Testing Library |
| Linting | ESLint + typescript-eslint |

**Path aliases:** `@/` → `src/`

**Supabase project:** credentials in `src/integrations/supabase/client.ts`; generated types in `src/integrations/supabase/types.ts`.

---

## Key Conventions

- **No default exports for utilities** — `manuscriptParser.ts` exports named functions.
- **contentEditable editors use `data-initialized`** — set `el.dataset.initialized = "true"` after the first `innerHTML` write; check it before writing to prevent resets on re-render.
- **Debounced saves** — use `useDebouncedCallback` (1 s) for scene content; call `supabase.from("scenes").update(...)` directly (no optimistic UI).
- **Sequential chapter insert** — when bulk-importing, insert each chapter one at a time to get its UUID before batch-inserting its scenes.
- **Storage paths** — `{user_id}/{project_id}/manuscript.{ext}` for manuscripts; `{user_id}/{entity_id}/{filename}` for entity images.
- **RLS everywhere** — every table has RLS enabled. Policies join back to `projects.user_id = auth.uid()`.
- **Heading detection regex** — `HEADING_RE = /^(chapter|part|prologue|epilogue|interlude)\b/i` in `manuscriptParser.ts`. Add new heading keywords here if needed.
- **Design tokens** — dark theme only. Key custom colours: `gold`, `gold-bright`, `fyrescribe-raised`, `fyrescribe-hover`, `text-dimmed`, `text-secondary`. Defined in `tailwind.config.ts`.
- **Font** — `font-display` class for headings (display/serif font); body uses system sans-serif stack.
- **Migrations** — live in `supabase/migrations/`. Run via Supabase CLI. Do not edit existing migrations; add new ones.

---

## Do Not Touch

- **RTF parser regexes** (`src/lib/manuscriptParser.ts` `stripRtf`) — do not modify without testing against a real RTF export first. The regex order matters; changing one rule can silently corrupt text.
- **Supabase RLS policies** — do not alter without careful review. Every table has RLS enabled; a wrong policy can expose data across users or lock the app out entirely.
- **`is_dirty` flag on `scenes`** — do not remove or bypass this flag. It is the trigger mechanism for the lore sync pipeline (Part 2), which queries dirty scenes to feed AI analysis.
- **`entity_category` enum values** — do not rename or remove enum values without a corresponding `ALTER TYPE … RENAME VALUE` / new-value migration. Existing DB rows reference these strings directly.
