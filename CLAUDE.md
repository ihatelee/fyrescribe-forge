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
- **Lore sync pipeline** — `supabase/functions/sync-lore/index.ts` edge function reads scenes where `is_dirty = true` for a project, calls claude-sonnet-4-6, and writes structured `new_entity` suggestions to `lore_suggestions`. Each suggestion payload contains: `name`, `category`, `description`, `confidence`, `source_scene_title`, `fields` (all At a Glance keys for the category, AI-populated where inferable), `sections` (non-empty article sections with substantive AI-written content), `tags` (lowercase cross-reference strings). Clears `is_dirty` on processed scenes, updates `projects.last_sync_at`, and logs to `sync_log`. Deployed to production. Daily pg_cron job (`daily-lore-sync`, 03:00 UTC) calls the function for all projects via `net.http_post`.
- **Lore Inbox** (`LoreInboxPage`) — fully wired to Supabase. Shows pending `lore_suggestions` for the active project. Each card displays: type badge, category badge, entity name, description, populated At a Glance fields (two-column grid), article section names (pills), suggested tags (gold pills), confidence bar, source scene. **Accept**: inserts entity with pre-populated `fields` and `sections` JSONBs; upserts new tags into `tags` table and links via `entity_tags`; shows "Entity created → View" banner. **Edit**: inline name/description edit before accepting (sets status `edited`). **Reject**: marks `rejected` with `reviewed_at`.
- **Sidebar — Sync Now** — `Sidebar.tsx` fetches live pending count from `lore_suggestions` (replacing hardcoded prop). "Sync Now" button invokes `sync-lore` for the active project, shows spinner, displays brief result message ("N new suggestions" / "Up to date"), then refreshes the count.
- **Storage buckets** — `entity-images` (entity gallery images), `manuscripts` (uploaded manuscript files). Both use RLS policies keyed on `storage.foldername(name)[1] = auth.uid()`.
- **Other pages** — `POVTrackerPage` exists (scaffolded).

### What is NOT yet built

- POV tracker logic.
- Word count tracking (column exists on `scenes`, not yet wired up).
- Project archiving (column `archived_at` exists on `projects`, not yet used in UI).
- Timeline: manual "Add Event" button (button exists in UI but is not wired up).
- Lore Inbox: `field_update`, `contradiction`, and `new_tag` suggestion types are displayed but the sync function only produces `new_entity` suggestions today.

---

## Where We Left Off

**Session: 2026-04-12 (session 5)**

Completed the lore sync pipeline and Lore Inbox end-to-end:

- **`sync-lore` edge function** built and deployed. Reads dirty scenes, calls claude-sonnet-4-6 with a category-reference block so the AI populates exact At a Glance field keys and article section names. Payload stores `fields`, `sections`, `tags` alongside the existing `name`/`category`/`description`/`confidence`. Daily pg_cron job wired up.
- **Lore Inbox UI** (`LoreInboxPage`) fully wired. Accept flow creates the entity with pre-populated `fields` + `sections` JSONBs and upserts/links tags. Edit mode allows name/description correction before accepting. Card preview shows all AI-extracted data.
- **Sidebar Sync Now** button added; live pending count replaces hardcoded prop.

**Next logical steps:**
- Deploy `sync-lore`: `supabase functions deploy sync-lore` (if not already done via dashboard).
- Confirm `ANTHROPIC_API_KEY` secret is set (Settings → Edge Functions → Secrets).
- Test Sync Now end-to-end with real manuscript content.
- Consider extending the sync prompt to also produce `field_update` and `contradiction` suggestion types.
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
