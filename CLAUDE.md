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
- **Global layout** — `AppLayout.tsx` uses `h-screen overflow-hidden flex flex-col`; `main` is `flex-1 min-h-0 overflow-auto`. `index.css` sets `html, body, #root { height: 100%; overflow: hidden }`. No page-level scroll — all scrolling is internal to each panel.
- **Manuscript editor** (`ManuscriptPage`) — Three-panel layout: sidebar (chapter/scene tree), editor (contentEditable), detail panel. Height: `h-[calc(100vh-80px)]` (full viewport minus h-20 titlebar). Right chapter panel is `overflow-hidden flex-col`; inner chapters list scrolls (`flex-1 overflow-y-auto min-h-0`); bottom controls (and outrun player) are pinned.
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
- **Theme system** — `ThemeContext` + `ThemeSwitcher`. Six themes: Midnight, Fireside, Lavender Haze, Enchanted, **Outrun** (formerly Futureworld), Daylight. Preferences persisted to `user_preferences` Supabase table. Outrun uses Silkscreen + Fira Code fonts; all other themes use Cinzel (display) + EB Garamond (prose) + system sans-serif (body). All theme styles — including fonts — flow exclusively through CSS variables (`--font-body`, `--font-display`, `--font-prose`, plus the full set of color tokens). `applyTheme` clears all managed variables before setting the new theme, guaranteeing no bleed-through.
- **Sparkle toggle** — `GlobalSparkle` renders `StarfieldBackground` (stars + sparkles) on all themes, or `OutrunGridBackground` when the active theme is "outrun". Persisted alongside theme preference. Sparkle button label changes to "Time to Run" (hardcoded string in `ThemeSwitcher`).
- **Outrun visual overhaul** — When theme is "outrun": logo swaps to `fyrescribe_logo_bit.svg` (fill set to `#00FF41` directly in the SVG) in `Titlebar` and `OnboardingPage`; sparkle animation is `OutrunGridBackground` (CSS `perspective`/`rotateX` grid with animated `background-position-y` scroll, horizon glow line removed, all colors from `--gold` CSS variable); outrun palette includes `--neon-yellow: 72 100% 50%` (#CCFF00, acid yellow-green), used for: active nav item border + text in `Sidebar`, play button + volume slider in `OutrunMusicPlayer`, "Chapters" label and chapter/scene breadcrumb in `ManuscriptPage`.
- **Outrun music player** — `OutrunMusicPlayer` rendered inside ManuscriptPage's right chapter sidebar panel, above the "New chapter" button, only when `theme === "outrun"`. Volume persisted to `localStorage` under key `fyrescribe_outrun_volume`; default 0.05 (5%) if no saved value. Streams from `OUTRUN_MUSIC_URL` constant (currently Nihilore – Motion Blur). Auto-plays on mount (theme activation); pauses on unmount (theme change). Gracefully falls back to paused state if autoplay is blocked. Controls: play/pause (neon yellow) + volume slider (neon yellow fill). Credit: "♪ Nihilore". `OutrunGlobals.tsx` exists in `App.tsx` but is now empty (returns null).
- **Icon sets** — `src/lib/iconSets.ts` defines three icon sets (Fantasy, Sci-Fi, Standard) using Phosphor icons. Each set provides icons for all 13 sidebar slots (manuscript, timeline, all 9 entity categories, inbox, sync). `THEME_DEFAULT_ICON_SET` maps themes to their default set (Midnight/Fireside/Lavender/Enchanted → fantasy, Outrun → scifi, Daylight → standard). Icon set preference persisted to `user_preferences.icon_set` (migration `20260413000331_...sql`). `ThemeContext` forces scifi icons when theme is "outrun" (`ICON_SETS[theme === "outrun" ? "scifi" : iconSetName]`). `ThemeSwitcher` uses `effectiveIconSet` (same logic) for the check mark so the dropdown always reflects the active icon set.
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
- **Timeline** — `TimelinePage` reads from `timeline_events` Supabase table (real data, no placeholder). "Generate from Lore" button invokes the `generate-timeline` Supabase Edge Function which reads Event/History entities + scene excerpts, calls claude-sonnet-4-6 via Anthropic API, and inserts the returned events. Events can be deleted (hover reveals trash icon). Edge function is deployed to production.
  - **Add Event modal** — "Add Event" button wired up. Modal takes: event name, Date/Era dropdown (`ERA_OPTIONS`: Ancient Times → Present Day, each with a numeric `date_sort`), type (Story Event / World History), and an optional checkbox to also create a corresponding `events` lore entity with pre-seeded `fields` and `sections`.
  - **Drag-to-reorder** — timeline events are draggable. Drop above/below a target card; `date_sort` is recalculated by interpolating between neighbours. Gold drop indicator line shows above/below target. Persisted to Supabase.
  - **Bulk delete** — hover-reveal "delete" checkbox per event card. When any are checked a bulk action bar appears ("Delete Selected (N)" + "Clear selection"). Bulk delete cascades correctly.
  - **entity_id FK wired up** — `TimelineEvent` interface includes `entity_id: string | null`. `AddEventModal` writes the created entity's `id` back to the timeline event row via a follow-up `update` call. `generate-timeline` edge function builds a name→id lookup map from the project's events/history entities and populates `entity_id` on each inserted row via case-insensitive exact-name match.
- **Lore sync pipeline** — `supabase/functions/sync-lore/index.ts` edge function. Confirmed working end-to-end with real manuscript content. Architecture: one Anthropic API call per scene, returning a JSON array of all named entities found (no per-scene cap; `max_tokens: 4000`). Scenes are queried with their parent chapter title (`chapters(title)` join). Prompt is aggressive: extract every named entity — if it has a proper noun, suggest it. Shows `LOCATION: Chapter Title › Scene Title` in the prompt for structural context. Confidence threshold is 0.4. Each suggestion payload contains: `name`, `category`, `description`, `confidence`, `source_scene_title`, `source_location` (formatted as `"Chapter Title › Scene Title"`), `source_sentence` (verbatim sentence where entity first appears), `fields` (all At a Glance keys for the category, AI-populated where inferable, matched case-insensitively), `sections` (non-empty article sections, case-insensitive key match), `tags` (lowercase cross-reference strings). Deduplicates by name across scenes (highest confidence wins). Clears `is_dirty` on processed scenes, updates `projects.last_sync_at`, and logs to `sync_log`. Deployed to production. Daily pg_cron job (`daily-lore-sync`, 03:00 UTC) calls the function for all projects via `net.http_post`. Force sync mode (`force=true`) ignores `is_dirty` and processes all scenes — accessible via the "all" button in the sidebar.
- **Lore Inbox** (`LoreInboxPage`) — fully wired to Supabase. Shows pending `lore_suggestions` for the active project. Each card displays: type badge, category badge, entity name, description, populated At a Glance fields (two-column grid), article section names (pills), suggested tags (gold pills), confidence bar, source scene. **Accept**: inserts entity with pre-populated `fields` and `sections` JSONBs; upserts new tags into `tags` table and links via `entity_tags`; shows "Entity created → View" banner. **Edit**: inline name/description edit before accepting (sets status `edited`). **Reject**: marks `rejected` with `reviewed_at`.
- **Sidebar — Sync Lore** — `Sidebar.tsx` fetches live pending count from `lore_suggestions` (replacing hardcoded prop). "Sync Lore" button invokes `sync-lore` for the active project, shows spinner, displays brief result message ("N new suggestions" / "No edited scenes" / "N scenes processed, 0 suggestions"), then refreshes the count. Small "all" button triggers force sync. Button has no `disabled` state (handler guards internally).
- **Entity gallery — view toggle** — card/list toggle in the gallery header, persisted to `localStorage` (`fyrescribe_entity_view_mode`). List view shows category badge, name, summary, tags (up to 3 + overflow count), and 3-dot menu per row.
- **Entity gallery — 3-dot menu** — Archive (soft-delete via `archived_at`) and Delete (PERMANENTLY DELETE confirmation, cascades `entity_links` + `entity_tags`) on every entity card and list row, matching the projects page interaction pattern. Archived entities appear in a collapsible section at the bottom; click to unarchive. Migration: `20260412210000_entity_archived_at.sql`.
- **Entity gallery — bulk delete** — hover-reveal "delete" checkbox on each card and list row. Bulk action bar ("Delete Selected (N)" + "Clear selection") appears when any are checked. Cascades `entity_links` + `entity_tags` before deleting the entity, matching the single-delete behaviour.
- **Lore entry upload** — `LoreUploadModal` (`src/components/LoreUploadModal.tsx`) accepts PDF or plain-text files, calls the `parse-lore-file` Supabase Edge Function, shows a structured field preview, and creates the entity on confirm. Edge function (`supabase/functions/parse-lore-file/index.ts`): accepts `multipart/form-data` with `file` + `category`; extracts text (UTF-8 for TXT, BT/ET block scan for text-based PDFs); sends to `claude-sonnet-4-20250514` with a category-aware system prompt that enforces exact `fields` and `sections` key names matching `EntityDetailPage`'s `CATEGORY_FIELDS` / `CATEGORY_SECTIONS`; returns `{ name, summary, fields, sections }`. Modal preview groups extracted data under "At a Glance" and "Sections" headings with per-item include/exclude toggles. `handleCreate` writes all four columns (`name`, `summary`, `fields`, `sections`) to the `entities` table in one insert. Deployed to production (pending `supabase login` + `supabase link`).
- **Storage buckets** — `entity-images` (entity gallery images), `manuscripts` (uploaded manuscript files). Both use RLS policies keyed on `storage.foldername(name)[1] = auth.uid()`.
- **Other pages** — `POVTrackerPage` exists (scaffolded).

### What is NOT yet built

- POV tracker logic.
- Word count tracking (column exists on `scenes`, not yet wired up).
- Project archiving (column `archived_at` exists on `projects`, not yet used in UI).
- Lore Inbox: `field_update`, `contradiction`, and `new_tag` suggestion types are displayed but the sync function only produces `new_entity` suggestions today.
- Sync Lore progress UI — no per-scene progress feedback while sync is running; sidebar just shows a spinner for the full duration.
- `source_sentence` and `source_location` stored in suggestion payload; `source_location` now displayed in the Lore Inbox card. `source_sentence` stored but not yet surfaced in the UI.

---

## Next Session

1. **Visual polish pass** — general UI refinements across pages (Lovable).
2. **Domain connection** — connect to `fyrescribe.com` (Lovable).

---

## Where We Left Off

**Session: 2026-04-13 (session 18 — Lovable pull + parse-lore-file prompt fix)**

- `git pull` — Lovable removed the "+ Add field" button from `EntityDetailPage`'s At a Glance panel (`EntityDetailPage.tsx`, 20 deletions / 6 insertions).
- `supabase/functions/parse-lore-file/index.ts`: added `"Magic & Abilities"` to the characters entry in the sections list of the system prompt, matching `CATEGORY_SECTIONS` in `EntityDetailPage`.

**Pending / next logical steps:**
- Visual polish pass (Lovable).
- Domain connection to `fyrescribe.com` (Lovable).
- Display `source_sentence` in the Lore Inbox card (stored in payload, not yet shown in UI).
- Add a progress toast or per-scene counter to the sidebar sync flow.
- Word count tracking — wire up `scenes.word_count` to the editor's save path.
- The MP3 URL is HTTP, not HTTPS — may be blocked on HTTPS deployments.

---

**Session: 2026-04-13 (session 17 — parse-lore-file edge function + LoreUploadModal wiring)**

- `supabase/functions/parse-lore-file/index.ts` (new edge function): accepts `multipart/form-data` (`file` + `category`); extracts text from TXT (UTF-8) or PDF (BT/ET block scan, no OCR); calls `claude-sonnet-4-20250514` with a category-aware system prompt listing exact `fields` and `sections` key names; returns `{ name, summary, fields, sections }`. Full error coverage: 400 unsupported type, 422 blank PDF, 500 Anthropic errors with specific messages.
- `src/components/LoreUploadModal.tsx`: removed `mockParse` stub and `setTimeout`; replaced `handleImport` with `supabase.functions.invoke("parse-lore-file", { body: formData })`; added `extractedName` + `extractedSummary` state; `ExtractedField` gains `group: "field" | "section"` discriminator; field preview panel split into "At a Glance" and "Sections" groups; `handleCreate` writes `name`, `summary`, `fields`, and `sections` columns in a single insert (previously `sections` was never written).
- All changes committed and pushed. Edge function **not yet deployed** — requires `supabase login` + `supabase link` first.

**Pending / next logical steps:**
- Deploy `parse-lore-file` to production: `supabase login` → `supabase link --project-ref bedrzyekoynnzdeblunt` → `supabase functions deploy parse-lore-file --no-verify-jwt`.
- Display `source_sentence` in the Lore Inbox card (stored in payload, not yet shown in UI).
- Add a progress toast or per-scene counter to the sidebar sync flow.
- Word count tracking — wire up `scenes.word_count` to the editor's save path.
- The MP3 URL is HTTP, not HTTPS — may be blocked on HTTPS deployments.

---

**Session: 2026-04-13 (session 16 — type cleanup + timeline ↔ entity links)**

- `src/types/supabase.ts` added; `package-lock.json` updated — proper types for `EntitySections`, `EntityFields`, `SuggestionPayload` eliminating `as any` / `as unknown as` casts.
- `supabase/.temp/` added to `.gitignore`.
- `TimelinePage.tsx` `TimelineEvent` interface: `entity_id: string | null` added (field already exists on the DB row; `select("*")` picks it up automatically).
- `AddEventModal.handleSubmit`: entity insert now uses `.select("id").single()`; on success, calls `supabase.from("timeline_events").update({ entity_id })` to write the link back; also patches `eventData.entity_id` in-memory before `onCreated` so state is immediately correct.
- `supabase/functions/generate-timeline/index.ts`: entity fetch now includes `id`; a `Map<string, string>` (lowercase name → entity id) is built; each row insert now sets `entity_id` via case-insensitive exact name match.

**Pending / next logical steps:**
- Display `source_sentence` in the Lore Inbox card (stored in payload, not yet shown in UI).
- Add a progress toast or per-scene counter to the sidebar sync flow so users can see it working on large manuscripts.
- Consider extending sync to produce `field_update` and `contradiction` suggestion types.
- Word count tracking — wire up `scenes.word_count` to the editor's save path.
- The MP3 URL is HTTP, not HTTPS — browsers may block on HTTPS deployments (mixed content). May need to proxy or re-host the track.

---

**Session: 2026-04-13 (session 15 — viewport scroll fix + music player in chapter panel)**

- `src/index.css`: added `html, body, #root { height: 100%; overflow: hidden; }` to eliminate page-level scroll on all pages.
- `AppLayout.tsx`: outer div changed from `min-h-screen` to `h-screen overflow-hidden flex flex-col`; `main` changed from `min-h-screen` to `flex-1 min-h-0 overflow-auto`.
- `ManuscriptPage.tsx`: outer flex container changed from `h-[calc(100vh-48px)]` (wrong 48px offset) to `h-[calc(100vh-80px)]` (correct 80px = h-20 titlebar).
- `ManuscriptPage.tsx` chapter sidebar restructured: outer div `overflow-hidden`, inner chapters div `flex-1 overflow-y-auto min-h-0` — chapters scroll internally, bottom controls stay fixed.
- `ManuscriptPage.tsx`: `OutrunMusicPlayer` now rendered inside the chapter sidebar, above the "New chapter" button, only when `theme === "outrun"`. Imported `OutrunMusicPlayer` directly.
- `OutrunGlobals.tsx`: emptied (returns null) — player is now in ManuscriptPage; no more duplicate audio element or left-sidebar overlay.

**Pending / next logical steps:**
- Music stops when navigating away from ManuscriptPage (audio now lives in ManuscriptPage, not outside route tree). Acceptable for now; could be fixed by lifting audio to context if needed.
- The MP3 URL is HTTP, not HTTPS — browsers may block on HTTPS deployments (mixed content). May need to proxy or re-host the track.
- Display `source_sentence` in the Lore Inbox card (stored in payload, not yet shown in UI).
- Add a progress toast or per-scene counter to the sidebar sync flow so users can see it working on large manuscripts.
- Consider extending sync to produce `field_update` and `contradiction` suggestion types.
- Word count tracking — wire up `scenes.word_count` to the editor's save path.

---

**Session: 2026-04-13 (session 14 — Outrun player persistence + polish)**

- `OutrunGlobals.tsx` created; mounted in `App.tsx` alongside `GlobalSparkle` (outside route tree) so the music player never remounts on navigation.
- `OutrunMusicPlayer` volume defaults to 0.05 (5%), persisted to `localStorage` key `fyrescribe_outrun_volume`; restored on every mount.
- `ThemeSwitcher` now uses `effectiveIconSet` (scifi when outrun, else saved preference) for the icon-set check mark — dropdown correctly reflects forced override.
- `ManuscriptPage` applies `--neon-yellow` to "Chapters" label and chapter/scene breadcrumb via `labelStyle` when outrun.
- `Sidebar` cleaned up: player no longer rendered here, `pb-[72px]` removed.

---

**Session: 2026-04-13 (session 13 — Outrun theme polish)**

- Music player moved back to `Sidebar.tsx` using `absolute bottom-0 left-0 right-0` within the sidebar's fixed container. `pb-[72px]` added to bottom nav section when outrun to prevent overlap. `AppLayout.tsx` reverted to its simple form (no right panel, no `pr` offset).
- `--neon-yellow` now visibly used: active nav item border+text in `Sidebar` (outrun only); play button and volume slider in `OutrunMusicPlayer`.
- `fyrescribe_logo_bit.svg` fill updated from `#fff` to `#00FF41` — logo is now outrun green without any CSS filter.

---

**Session: 2026-04-13 (session 12 — Outrun theme fixes)**

Fixes and additions to the Outrun theme:

- **Music player moved to right panel**: removed from `Sidebar.tsx`; now rendered inside a new right panel in `AppLayout.tsx` (`fixed right-0 top-20 bottom-0 w-[180px]`). Main content gets `pr-[180px]` offset when outrun is active.
- **Icon set forced to scifi on outrun**: `ThemeContext.tsx` now computes `icons` as `ICON_SETS[theme === "outrun" ? "scifi" : iconSetName]`, ignoring saved preference while outrun is active.
- **Neon yellow added**: `--neon-yellow: 72 100% 50%` (#CCFF00) added to the outrun theme vars in `ThemeContext.tsx`.
- **Volume slider overflow fixed**: added `overflow-hidden` to the controls row and `min-w-0` to the slider input in `OutrunMusicPlayer.tsx`.
- **Horizon line removed from grid animation**: deleted the horizon glow `<div>` from `OutrunGridBackground.tsx`. Grid now flows without a hard break.

**Pending / next logical steps:**
- The MP3 URL is HTTP, not HTTPS — if the app is served over HTTPS, browsers will block the audio as mixed content. May need to proxy or re-host the track.
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
