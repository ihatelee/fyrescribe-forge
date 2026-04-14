# Changelog

All notable changes to Fyrescribe are recorded here.

---

## 2026-04-13 (session 19)

### Codebase audit — no code changes

Read-only audit against the outstanding feature list. Findings recorded in CLAUDE.md "What is NOT yet built":

- `LoreInboxPage.tsx:373` — one `as unknown as SuggestionPayload` cast remains (Supabase types `payload` as `Json`).
- `source_sentence` — stored in `payload` JSONB and typed in `SuggestionPayload` but never rendered in any JSX. Only `source_location` is displayed.
- `sync-lore` — only ever emits `new_entity` suggestions; `field_update`, `contradiction`, `new_tag` types exist in the DB enum but are never produced.
- `parse-lore-file` PDF extraction — `extractTextFromPdf()` BT/ET regex approach untested against real PDFs; no PDF-related fixes in git history.
- `LoreUploadModal.handleCreate` — inserts entity but writes nothing to `entity_links` or `entity_tags`; uploaded entities arrive unlinked.
- Global lore search — does not exist anywhere in the frontend.

---

## 2026-04-13 (session 18)

### Lovable pull — remove "+ Add field" button; parse-lore-file prompt fix

**`src/pages/EntityDetailPage.tsx`** (Lovable)
- Removed the "+ Add field" button from the At a Glance panel. Fields are seeded from `CATEGORY_FIELDS` on first load and are not user-extensible.

**`supabase/functions/parse-lore-file/index.ts`**
- Added `"Magic & Abilities"` to the characters entry in the sections list of the system prompt, matching `CATEGORY_SECTIONS["characters"]` in `EntityDetailPage`.

---

## 2026-04-13 (sessions 16–17 consolidated)

### Type cleanup, timeline entity links, lore entry upload, README + LICENSE

**Type cleanup**
- Added proper TypeScript types for `EntitySections`, `EntityFields`, and `SuggestionPayload` in `src/types/supabase.ts`, eliminating `as any` / `as unknown as` casts across `ThemeContext.tsx`, `EntityGalleryPage.tsx`, `ProjectsPage.tsx`, `LoreInboxPage.tsx`, `EntityDetailPage.tsx`, and `OnboardingPage.tsx`.
- Added `supabase/.temp/` to `.gitignore`.

**Timeline ↔ entity links**
- `TimelinePage.tsx` `TimelineEvent` interface: added `entity_id: string | null`.
- `AddEventModal.handleSubmit`: entity insert now uses `.select("id").single()`; writes `entity_id` back to the timeline event row; patches `eventData.entity_id` in-memory before `onCreated`.
- `supabase/functions/generate-timeline/index.ts`: entity fetch includes `id`; builds a `Map<string, string>` (lowercase name → entity UUID); each inserted row now sets `entity_id` via case-insensitive exact name match.

**`supabase/functions/parse-lore-file/index.ts`** (new, deployed to production)
- Accepts `multipart/form-data` with `file` (PDF or TXT) and `category`.
- TXT: decoded as UTF-8. PDF: `extractTextFromPdf()` scans `BT…ET` blocks; falls back to raw scan. Truncates to 8,000 chars.
- Calls `claude-sonnet-4-20250514` with a category-aware system prompt enforcing exact `fields` and `sections` key names for all 9 entity categories, matching `EntityDetailPage`'s `CATEGORY_FIELDS` / `CATEGORY_SECTIONS` constants.
- Returns `{ name, summary, fields: Record<string, string>, sections: Record<string, string> }`.
- Full error coverage: 400, 422, 500 paths all return `{ error: string }` with specific messages.

**`src/components/LoreUploadModal.tsx`**
- Removed `mockParse` and `setTimeout` stub.
- `handleImport` calls `supabase.functions.invoke("parse-lore-file", { body: formData })`.
- `ExtractedField` gains `group: "field" | "section"` discriminator; `extractedName` + `extractedSummary` state added.
- Field preview split into "At a Glance" and "Sections" groups with per-item toggles.
- `handleCreate` writes `name`, `summary`, `fields`, and `sections` columns in one insert (previously `sections` was never written on upload).

**Docs**
- `README.md` replaced with a proper project description (features, stack, env vars, repo link).
- `LICENSE` added (MIT, Lee Williams 2026).

---

## 2026-04-13 (session 17)

### parse-lore-file edge function + LoreUploadModal full wiring

**`supabase/functions/parse-lore-file/index.ts`** (new)
- Accepts `multipart/form-data` POST with `file` (PDF or TXT) and `category` fields.
- TXT: decoded as UTF-8. PDF: `extractTextFromPdf()` scans `BT…ET` blocks for parenthesised strings with escape handling; falls back to raw scan if no blocks found. Truncates to 8,000 chars before sending to Claude.
- Calls `claude-sonnet-4-20250514` with a category-aware system prompt that lists exact `fields` and `sections` key names for all 9 entity categories, matching `EntityDetailPage`'s `CATEGORY_FIELDS` / `CATEGORY_SECTIONS` constants exactly.
- Returns `{ name: string, summary: string, fields: Record<string, string>, sections: Record<string, string> }`.
- Error coverage: 400 (unsupported type, missing fields), 422 (blank PDF extraction), 500 (missing API key, Anthropic HTTP error with body, invalid JSON from Claude, unhandled exception) — all with specific messages.

**`src/components/LoreUploadModal.tsx`**
- Removed `mockParse` function and `setTimeout` stub entirely.
- `handleImport` now builds a `FormData` and calls `supabase.functions.invoke("parse-lore-file", { body: formData })`.
- Added `extractedName` and `extractedSummary` state to hold the top-level values from the response.
- `ExtractedField` interface gains `group: "field" | "section"` discriminator.
- `handleImport` maps `data.fields` entries as `group: "field"` and `data.sections` entries as `group: "section"` into the unified `fields` state array.
- Field preview panel restructured: name + summary shown as a read-only header block; fields listed under "At a Glance" heading; sections listed under "Sections" heading.
- `handleCreate` splits the `fields` array by `group` into `entityFields` and `entitySections`; inserts with `name`, `summary`, `fields`, and `sections` columns (previously `sections` was never written on upload).
- `hasIncluded` also passes if `extractedName` is non-empty.

---

## 2026-04-13 (session 16)

### Type cleanup + timeline ↔ entity links

**`src/types/supabase.ts`** (new)
- Added proper TypeScript types for `EntitySections`, `EntityFields`, and `SuggestionPayload`, eliminating `as any` / `as unknown as` casts that were papering over Supabase type-gap issues.

**`.gitignore`**
- Added `supabase/.temp/` — Supabase CLI temp directory was being tracked as untracked files.

**`src/pages/TimelinePage.tsx`**
- `TimelineEvent` interface: added `entity_id: string | null`. The column already existed on the DB row and `select("*")` returns it; the interface was just missing the field.
- `AddEventModal.handleSubmit`: entity insert changed from fire-and-forget to `.select("id").single()`. On success, calls `supabase.from("timeline_events").update({ entity_id: entityData.id }).eq("id", eventData.id)` to write the FK back. Also patches `eventData.entity_id` in-memory before passing to `onCreated` so local state is immediately consistent without a refetch.

**`supabase/functions/generate-timeline/index.ts`**
- Entity fetch now selects `id` in addition to `name, category, summary`.
- Builds `entityIdByName: Map<string, string>` — lowercase entity name → entity UUID — immediately after the fetch.
- Each inserted row now includes `entity_id: entityIdByName.get(e.label.toLowerCase()) ?? null`, linking generated timeline events to existing lore entities via case-insensitive exact name match.

---

## 2026-04-13 (session 15)

### Viewport scroll fix + Outrun music player moved to chapter sidebar

**`src/index.css`**
- Added `html, body, #root { height: 100%; overflow: hidden; }` — eliminates page-level scroll globally.

**`src/components/AppLayout.tsx`**
- Outer div: `min-h-screen` → `h-screen overflow-hidden flex flex-col`.
- `main`: `min-h-screen` → `flex-1 min-h-0 overflow-auto` — correctly fills remaining viewport height without overflowing.

**`src/pages/ManuscriptPage.tsx`**
- Fixed wrong height offset: `h-[calc(100vh-48px)]` → `h-[calc(100vh-80px)]` (48px was `top-12`; titlebar is `h-20` = 80px).
- Chapter sidebar outer div: `overflow-y-auto` removed → `overflow-hidden`. Inner chapters div: gains `overflow-y-auto min-h-0` so chapters scroll within the panel while bottom controls remain fixed.
- Added `OutrunMusicPlayer` import; player rendered above "New chapter" button conditionally when `theme === "outrun"`.

**`src/components/OutrunGlobals.tsx`**
- Emptied (returns `null`). Player now lives in ManuscriptPage; no duplicate audio element.

---

## 2026-04-13 (session 14)

### Outrun theme polish — player persistence, volume memory, manuscript labels, scifi icon sync

**`src/components/OutrunGlobals.tsx`** (new)
- Thin wrapper that renders `OutrunMusicPlayer` as `fixed left-0 bottom-0 w-[190px] z-[45]` (visually overlapping the sidebar bottom) only when `theme === "outrun"`. Mounted in `App.tsx` outside the route tree so it never remounts on navigation.

**`src/App.tsx`**
- Imports and renders `<OutrunGlobals />` alongside `<GlobalSparkle />`.

**`src/components/Sidebar.tsx`**
- Removed `OutrunMusicPlayer` import, render, and the `pb-[72px]` padding on the bottom nav section. Player is now owned by `OutrunGlobals`.

**`src/components/OutrunMusicPlayer.tsx`**
- Added `VOLUME_KEY = "fyrescribe_outrun_volume"` and `readVolume()` helper.
- `volume` state lazy-initialised from `localStorage`, falling back to `0.05` (5%).
- Volume `useEffect` now writes to `localStorage` on every change, persisting across remounts and reloads.

**`src/components/ThemeSwitcher.tsx`**
- Added `effectiveIconSet = theme === "outrun" ? "scifi" : iconSetName`.
- Icon-set check mark now uses `effectiveIconSet` — Sci-Fi appears selected when outrun is active, regardless of the saved `iconSetName` preference.

**`src/pages/ManuscriptPage.tsx`**
- Added `useTheme` import and call; derived `labelStyle = theme === "outrun" ? { color: "hsl(var(--neon-yellow))" } : undefined`.
- Applied `labelStyle` to the "Chapters" uppercase label (right sidebar) and the `Ch X · Scene Title` toolbar breadcrumb.

---

## 2026-04-13 (session 13)

### Outrun theme polish — player placement, neon yellow, logo color

**`src/components/AppLayout.tsx`**
- Reverted to simple form: removed `useTheme`, `OutrunMusicPlayer` import, right panel div, and `pr-[180px]` offset. No layout changes for the outrun theme.

**`src/components/Sidebar.tsx`**
- Re-added `OutrunMusicPlayer` import and `theme` from `useTheme()`.
- Player rendered as `absolute bottom-0 left-0 right-0 z-10 bg-fyrescribe-base` — positioned within the sidebar's `fixed` container, which acts as the CSS containing block.
- Bottom nav section gets `pb-[72px]` when `theme === "outrun"` to clear the absolutely positioned player.
- `NavItem` applies `borderColor` + `color` of `hsl(var(--neon-yellow))` via inline style when the item is active and the theme is "outrun".

**`src/components/OutrunMusicPlayer.tsx`**
- Play/pause button and volume slider now use `--neon-yellow` (acid yellow-green) instead of `--gold` (green), giving the player a two-tone accent that makes the new color visible.

**`src/assets/fyrescribe_logo_bit.svg`**
- Changed `.cls-1{fill:#fff}` → `.cls-1{fill:#00FF41}`. The bit logo is now outrun green without needing any CSS filter.

---

## 2026-04-13 (session 12)

### Outrun theme fixes

**`src/components/AppLayout.tsx`**
- Imports `useTheme` and `OutrunMusicPlayer`.
- When `theme === "outrun"`: renders a `fixed right-0 top-20 bottom-0 w-[180px]` right panel with the music player pinned to the bottom; adds `pr-[180px]` to `<main>` so content is not overlapped.

**`src/components/Sidebar.tsx`**
- Removed `OutrunMusicPlayer` import and render (player moved to AppLayout right panel).
- Removed `theme` from `useTheme()` destructure (no longer needed here).

**`src/contexts/ThemeContext.tsx`**
- Added `--neon-yellow: 72 100% 50%` (#CCFF00, acid yellow-green) to the outrun theme vars.
- `icons` computation now forces `"scifi"` icon set when `theme === "outrun"`, overriding any saved `iconSetName` preference.

**`src/components/OutrunMusicPlayer.tsx`**
- Added `overflow-hidden` to the controls flex row.
- Added `min-w-0` to the volume range input so it respects flex constraints and no longer overflows.

**`src/components/OutrunGridBackground.tsx`**
- Removed the horizon glow line `<div>` (the element with `top: 42%`, `height: 1px`, and `box-shadow`). Grid now renders without a hard horizontal break.

---

## 2026-04-13 (session 11)

### Outrun theme overhaul + music player

**`src/contexts/ThemeContext.tsx`**
- `ThemeName` union: `"futureworld"` → `"outrun"`.
- `THEME_VARS` key renamed accordingly (vars unchanged).

**`src/components/ThemeSwitcher.tsx`**
- THEMES array: `{ value: "futureworld", label: "Futureworld" }` → `{ value: "outrun", label: "Outrun" }`.
- Sparkle toggle label: `"Make it Sparkle"` → `"Time to Run"`.

**`src/lib/iconSets.ts`**
- `THEME_DEFAULT_ICON_SET`: `futureworld` key renamed to `outrun`.

**`src/components/Titlebar.tsx`**, **`src/pages/OnboardingPage.tsx`**
- Import `fyrescribe_logo_bit.svg`; swap logo src when `theme === "outrun"`, default logo on all other themes.

**`src/components/OutrunGridBackground.tsx`** (new)
- CSS-only retro perspective grid: a `perspective(500px) rotateX(72deg)` div with repeating `background-image` grid lines, animated via `background-position-y` for a forward-motion illusion. Horizon glow line via `box-shadow`. All colors use `hsl(var(--gold) / alpha)` — no new CSS variables.

**`src/components/GlobalSparkle.tsx`**
- When `theme === "outrun"`, renders `OutrunGridBackground` instead of `StarfieldBackground`.

**`src/components/OutrunMusicPlayer.tsx`** (new)
- Streams audio from `OUTRUN_MUSIC_URL` constant (Nihilore – Motion Blur). Auto-plays on mount; cleanup pauses on unmount (i.e. when theme changes away). Autoplay-block fallback: stays in paused state if browser denies autoplay. Controls: play/pause button + volume slider. Credit label: "♪ Nihilore".

**`src/components/Sidebar.tsx`**
- Imports `OutrunMusicPlayer`; renders it below the sync/inbox section when `theme === "outrun"`.

---

## 2026-04-13 (session 10)

### Lovable pull — timeline overhaul, icon sets, entity bulk delete

All changes in this session came from Lovable (30 commits via `git pull`). No Claude-authored code.

**`src/pages/TimelinePage.tsx`**
- "Add Event" button now opens `AddEventModal`: event name field, Date/Era dropdown (`ERA_OPTIONS`: Ancient Times / Distant Past / Generations Ago / Years Ago / Recent Past / Present Day, each mapped to a numeric `date_sort`), type selector (Story Event / World History), and an optional "Also create an Events lore entry" checkbox that inserts a corresponding entity with pre-seeded `fields` and `sections`.
- Drag-to-reorder: events are `draggable`. Drop indicator (gold line) shows above/below the hovered card. On drop, `date_sort` is recalculated by interpolating between the new neighbours; persisted to Supabase.
- Bulk delete: hover-reveal "delete" checkbox per event. Bulk action bar ("Delete Selected (N)" + "Clear selection") appears when any are checked.

**`src/lib/iconSets.ts`** (new file)
- Three icon sets (Fantasy, Sci-Fi, Standard) using `@phosphor-icons/react`, covering all 13 sidebar slots.
- `THEME_DEFAULT_ICON_SET`: Midnight/Fireside/Lavender/Enchanted → fantasy; Futureworld → scifi; Daylight → standard.

**`src/contexts/ThemeContext.tsx`**, **`src/components/ThemeSwitcher.tsx`**, **`src/components/Sidebar.tsx`**
- Updated to load and apply the active icon set from `user_preferences.icon_set`.

**`supabase/migrations/20260413000331_573063f8-dc9e-48a7-a61e-a6694657ec32.sql`**
- Adds `icon_set text NOT NULL DEFAULT 'fantasy'` to `user_preferences`.

**`src/pages/EntityGalleryPage.tsx`**
- Bulk delete: hover-reveal "delete" checkbox on card (bottom-right) and list (leading column) rows. Bulk action bar matches the Timeline pattern. Cascades `entity_links` + `entity_tags` before deleting entities.

---

## 2026-04-12 (session 9)

### sync-lore — chapter context, source_location, uncapped detection

**`supabase/functions/sync-lore/index.ts`**
- Scenes query now joins `chapters(title)` so each scene carries its parent chapter title. A `SceneRow` type flattens the nested relation.
- `buildPrompt` receives `chapterTitle` and shows `LOCATION: Chapter Title › Scene Title` at the top of each prompt, giving the AI structural context about where in the manuscript it's reading.
- `source_location` added to the suggestion payload, formatted as `"Chapter Title › Scene Title"` — stamped by `syncProject` after the API call (not by the AI) so it's always accurate. Falls back to scene title alone if no chapter title exists. `source_scene_title` kept for backwards compatibility.
- Removed the "up to 5 entities" cap from the prompt. AI now returns every named entity it finds per scene. `max_tokens` raised 1500 → 4000 to accommodate dense scenes.

**`src/pages/LoreInboxPage.tsx`**
- `SuggestionPayload` interface gains `source_location` and `source_sentence` fields.
- Suggestion card now displays `source_location` (with fallback to `source_scene_title`) instead of the bare scene title.

---

## 2026-04-12 (session 8)

### Lore sync — confirmed working end to end

Pipeline validated with real manuscript content. Entity detection, fields, sections, tags, and confidence scores all populating correctly in the Lore Inbox.

**`supabase/functions/sync-lore/index.ts`**
- Confidence threshold lowered 0.6 → 0.4. Entities mentioned only briefly (a name dropped once, a place referenced in passing) now surface in the inbox instead of being silently dropped.
- Prompt rewritten from "identify the single most important entity" to "extract ALL named entities." Every named character (including minor ones), place, organisation, artifact, creature, event, doctrine, and magic system is extracted. If it has a proper noun, it gets suggested.
- Returns up to 5 entities per scene (array) instead of 1 object. Still one scene per API call so truncation risk is negligible (5 small objects ≈ 1,000 tokens, `max_tokens` 1,500).
- Added `source_sentence` field to the suggestion payload: verbatim sentence from the scene where the entity first appears. Stored in the JSONB payload; not yet displayed in the Lore Inbox card UI.
- `callAnthropicForScene` return type changed from `AISuggestion | null` to `AISuggestion[]`.

---

## 2026-04-12 (session 7)

### Entity gallery improvements

**`EntityGalleryPage.tsx`**
- Added card/list view toggle in the gallery header. Preference persisted to `localStorage` (`fyrescribe_entity_view_mode`). List view shows category badge, name, summary, and up to 3 tags per row.
- Added 3-dot menu on every entity card and list row with **Archive** and **Delete** actions, matching the projects page interaction pattern.
  - Archive: sets `archived_at` on the entity; entity moves to a collapsible "Archived (N)" section at the bottom. Click to unarchive.
  - Delete: requires typing `PERMANENTLY DELETE`; cascades to `entity_links` (both directions) and `entity_tags`.
- `archived_at` added to the `entities` query select.

**`supabase/migrations/20260412210000_entity_archived_at.sql`**
- Adds `archived_at timestamptz` column to `public.entities`.

**`src/integrations/supabase/types.ts`**
- Added `archived_at: string | null` to entities Row / Insert / Update.

### Lore sync pipeline — architecture overhaul

**`supabase/functions/sync-lore/index.ts`**

The function went through three iterations this session to fix persistent `Unterminated string in JSON` errors caused by the Anthropic response being truncated at the `max_tokens` ceiling:

1. **Attempt 1 — increase tokens + tighten prompt**: raised `max_tokens` to 4000, capped suggestions at 3, shortened description/section word limits. Still truncating on real manuscript content.
2. **Attempt 2 — 5-scene chunks**: split scenes into batches of 5, one API call per batch, dedup across batches. Still truncating because even a 5-scene batch with rich sections exceeded output budget.
3. **Final fix — one call per scene**: `callAnthropicForScene()` makes one Anthropic call per scene, asking for a **single JSON object** (or `null`). `max_tokens` dropped to 1000. One entity object is ~200–400 tokens; truncation is now impossible regardless of manuscript size.

Key properties of the final architecture:
- `callAnthropicForScene()` never throws — every failure mode (HTTP error, JSON parse error, non-object response) logs the raw text and returns `null`, so one bad scene never aborts the sync.
- Deduplication by name (case-insensitive) across all scenes; highest-confidence version wins.
- `is_dirty` lifecycle unchanged: set on insert/edit, cleared after sync.
- Force sync mode (`force=true`, triggered by the "all" button in the sidebar) still works — processes all scenes regardless of `is_dirty`.

**Also fixed (earlier in session):**
- `handleAddScene` in `ManuscriptPage.tsx` was missing `is_dirty: true` on manual scene creation.
- Field and section key matching changed to case-insensitive so AI casing variations (e.g. `"place of birth"` vs `"Place of Birth"`) no longer silently drop data.
- Added array/type guard (`parsed === null || typeof parsed !== "object"`) to catch malformed AI responses before they crash the function.

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
