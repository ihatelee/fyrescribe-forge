# Changelog

All notable changes to Fyrescribe are recorded here. Older entries: see CHANGELOG_ARCHIVE.md.

---

## 2026-04-16 — Entity name editable inline on entity detail page

- `src/pages/EntityDetailPage.tsx` — replaced static `<h1>` name display with an inline edit pattern: clicking the name enters edit mode (input pre-filled with current name, gold underline); Enter/blur commits if non-empty; Escape reverts; blank input reverts without saving. Pencil icon fades in on hover as edit affordance. Save writes directly to `entities.name` via Supabase and patches local entity state.

---

## 2026-04-16 — POV dropdown: clipping fix, alignment fix, POV-only filter

- `src/components/POVSelector.tsx` — three fixes in one file:
  1. **Clipping (Fix 1)**: dropdown now uses `position: fixed` with coordinates computed from `buttonRef.getBoundingClientRect()` at open time, escaping any `overflow: hidden` ancestor (the table wrapper's `rounded-xl` clip).
  2. **Alignment (Fix 2)**: fixed left edge aligns to the button's left edge rather than the container's right edge, sitting flush in its column.
  3. **POV-only filter (Fix 3)**: query now adds `.eq("is_pov_character", true)`; empty state message updated to "No POV characters set. Mark characters as POV on their entity pages."

---

## 2026-04-16 — POV Tracker dropdown + POV Character checkbox

**POV Tracker dropdown styling**
- `src/pages/POVTrackerPage.tsx` — replaced native `<select>` with `POVSelector` component; removed the now-redundant characters fetch and `saving` state (both handled inside `POVSelector`); `handlePovChange` simplified to a local state updater only. Dropdown now matches the manuscript editor POV control exactly.

**POV Character checkbox on character sheets**
- `supabase/migrations/20260416000100_add_is_pov_character_to_entities.sql` — `ADD COLUMN IF NOT EXISTS is_pov_character BOOLEAN DEFAULT false` on `entities`.
- `src/pages/EntityDetailPage.tsx` — added `isPovCharacter` state, seeded from `dbEntity.is_pov_character` on fetch; added a "POV Character?" label + checkbox in the top-right controls area (between the MoreVertical menu and the X button), rendered only when `entity.category === 'characters'`; toggling writes `is_pov_character` immediately to Supabase with optimistic update and rollback on error.

---

## 2026-04-16 — POV Tracker wired to live data

- `supabase/migrations/20260416000000_add_pov_character_id_to_scenes.sql` — `ADD COLUMN IF NOT EXISTS pov_character_id UUID REFERENCES entities(id) ON DELETE SET NULL` on `scenes`.
- `src/lib/iconSets.ts` — added `pov: Eye` to `IconSet` interface and all three icon sets (fantasy / scifi / standard).
- `src/components/Sidebar.tsx` — added `"pov"` to `WRITE_KEYS`; label "POV Tracker", path `/pov-tracker`. Nav item now visible and active-state-aware.
- `src/pages/POVTrackerPage.tsx` — full rewrite; fetches chapters, scenes, and character entities for the active project; renders a table grouped by chapter; each scene row has a POV dropdown populated from `entities` where `category = 'characters'`; selecting a character immediately writes `pov_character_id` to the scene row with a per-row saving spinner; blank option clears the value.

---

## 2026-04-16 — Thesaurus: button-triggered only (no auto-open on selection)

- `src/pages/ManuscriptPage.tsx` — removed `onMouseUp={handleThesaurus}` from both contentEditable divs; added a "Thesaurus" toolbar button (`BookOpen` icon) to `formattingControls` so it appears in both the main editor and focus mode toolbars. The range is now captured at button-click time; the selection persists as an inactive selection after the button receives focus, so `savedRangeRef` logic is unchanged.

---

## 2026-04-16 — Thesaurus: fallback to `ml` query for common words

- `src/pages/ManuscriptPage.tsx` `handleThesaurus` — if the `rel_syn` (strict synonyms) query returns no results, immediately falls back to a `ml` (means-like) query against the same word. Fixes zero-result lookups for common words like "branch", "river", "stumbled". Strict synonyms are still returned when available.

---

## 2026-04-16 — Thesaurus wired to Datamuse API

- `src/pages/ManuscriptPage.tsx` — removed hardcoded `THESAURUS_DATA` dict; `handleThesaurus` now calls `https://api.datamuse.com/words?rel_syn=<word>&max=10` directly from the frontend (no edge function); returns early for words under 3 characters or multi-word selections; saves the selection `Range` before opening the panel so clicking a synonym (which blurs the editor) can still restore and replace it; `replaceWithSynonym` updated to use the saved range and trigger a debounced save after DOM mutation. `ThesaurusPanel` gains a `loading` prop that shows a spinner while the fetch is in flight. Both contentEditable divs (main editor + focus mode) wire `onMouseUp` to `handleThesaurus`, so double-clicking a word auto-fetches synonyms.

---

## 2026-04-16 — LoreUploadModal writes entity_tags on create

- `src/components/LoreUploadModal.tsx` — added `extractedTags` state; `handleImport` now captures `data.tags` from the `parse-lore-file` response (guards against absent/non-array values); `handleCreate` writes to `entity_tags` after inserting the entity row using the same upsert-or-create pattern as `LoreInboxPage.handleAccept` — fetches existing project tags by name, inserts only genuinely new ones, then bulk-inserts `entity_tags` rows. If no tags are returned, nothing is inserted.

---

## 2026-04-16 — Sidebar active state fix

- `src/components/Sidebar.tsx` `isActive` — added fallback check: if the exact path doesn't match, test whether the pathname ends with `/<segment>`. Fixes the Manuscript nav item showing as inactive when the app lands on `/project/:projectId/manuscript` (the route used after project selection and onboarding).

---

## 2026-04-14 (session 21 — Task 4)

### sync-lore extracts structured sections + at_a_glance per entity type

- `supabase/functions/sync-lore/index.ts` — removed dead `CATEGORY_FIELDS`/`CATEGORY_SECTIONS` constants; updated `AISuggestion` interface: dropped `description`, added `sections: Record<string,string>` (article body) and `at_a_glance: Record<string,string>` (short facts); rebuilt `buildPrompt` to request per-type allowed keys for both objects (e.g. character sections = Overview/Background/Personality/Relationships, at_a_glance = Place of Birth/Eye Color/etc.) with evidence-only inclusion; row builder derives `description` from `sections.Overview ?? sections.Description`; stamps `first_mentioned = source_sentence` and `first_appearance = scene_id` server-side into payload (never AI-generated); auth switched from `getClaims` → `getUser` (Lovable fix); `scene_id` moved inside payload (Lovable fix); insert error now logged.
- `src/pages/LoreInboxPage.tsx` — `SuggestionPayload` interface updated: replaced `fields` with `at_a_glance`, added `first_mentioned` and `first_appearance`; removed `CATEGORY_FIELDS` constant; `handleAccept` now builds `fieldsToWrite` from `payload.at_a_glance` directly, appends `First Mentioned` and (for characters) `First Appearance` from server-stamped values; no longer depends on any hardcoded field-key list.

---

## 2026-04-14 (session 21 — Task 3)

### sync-lore emits all 4 suggestion types + scene_id on every row

- `supabase/migrations/20260414230000_add_scene_id_to_lore_suggestions.sql` — adds `scene_id UUID REFERENCES public.scenes(id) ON DELETE SET NULL` to `lore_suggestions`. Nullable so existing rows are unaffected.
- `supabase/functions/sync-lore/index.ts` — replaced 9-category `AISuggestion` interface with 4-type system (`character | location | item | lore`); simplified prompt to one JSON-array call per scene; `scene_id` and `source_location` stamped server-side after the AI call; deduplication now keys on `type:name` (case-insensitive), first occurrence wins; row builder stores `scene_id` at top level and `type` + `category` (mapped via `TYPE_TO_CATEGORY`) in payload; `CATEGORY_FIELDS`/`CATEGORY_SECTIONS`/confidence/fields/sections/tags removed from this path.
- `src/integrations/supabase/types.ts` — added `scene_id: string | null` to `lore_suggestions` Row, Insert, Update types.
- `src/types/lore.ts` — new file; exports `LoreSuggestionType`, `LoreSuggestion` interface, and `LORE_TYPE_TO_CATEGORY` map for use by frontend consumers.

### Known follow-ups
- `LoreInboxPage` still reads `payload.category`, `payload.confidence`, `payload.fields`, `payload.sections` — new suggestions will have `payload.type` + `payload.category` (mapped) but no fields/sections/confidence. UI update is a separate task.
- "View in manuscript →" link can now be wired to `scene_id` (was blocked on this column existing).

---

## 2026-04-14 (session 20 closeout)

### Completed
- source_sentence displayed in Lore Inbox suggestion cards with link back to manuscript
- Global lore search added (useLoreSearch hook + LoreSearchModal + Cmd+K trigger)
- PDF extraction overhauled: replaced BT/ET regex → pdfjs-dist → unpdf (final solution). unpdf is Deno-compatible with no worker dependency. Successfully extracts text from Canva PDFs.
- System prompt loosened to handle unstructured lore documents

### Known limitation
- "View in manuscript →" link on Lore Inbox cards goes to /manuscript only — no scene_id in payload. Will be fixed in Task 3 (sync-lore suggestion types).

---

## 2026-04-14 (session 20)

### `parse-lore-file` PDF extraction replaced with binary-safe printable-ASCII approach

- `supabase/functions/parse-lore-file/index.ts` — `extractTextFromPdf` rewritten; decodes raw bytes as latin1 then extracts all printable-ASCII runs ≥ 4 chars; filters out PDF operator tokens (1–3 uppercase letters), structural keywords (`obj`, `endobj`, `stream`, `endstream`, `xref`, `trailer`, `startxref`, `null`, `true`, `false`, `dict`, `array`), numeric-only strings, short hex strings, and runs with no letters; handles compressed streams, CIDFont, and Type3 fonts where BT/ET scanning fails; 8,000 char truncation kept.
- Deploy: **pending** — local CLI returned 403 (authentication/privilege issue); run `supabase login` then `supabase functions deploy parse-lore-file --project-ref bedrzyekoynnzdeblunt`.


### Global lore search added — searches entity name, summary, fields, sections via ilike

- `src/hooks/useLoreSearch.ts` — new hook; accepts `projectId` and `query`; runs three parallel Supabase queries (name/summary OR, fields JSONB cast, sections JSONB cast); deduplicates by id; 300 ms debounce; excludes archived entities.
- `src/components/LoreSearchModal.tsx` — new Dialog-based command-palette UI; search input with spinner, result list (name + category badge + 80-char summary preview), idle and empty states; navigates to `/entity/:id` on selection.
- `src/components/Sidebar.tsx` — search icon button added to the World & Lore section header (tooltip shows ⌘K); `Cmd+K` / `Ctrl+K` global keyboard shortcut; `LoreSearchModal` rendered at component root.

### `source_sentence` displayed in Lore Inbox suggestion cards with link back to source scene

- `src/pages/LoreInboxPage.tsx` — added `useNavigate` call inside `SuggestionCard`; added blockquote rendering `payload.source_sentence` (gold left-border, muted italic text, `text-dimmed`) and a "View in manuscript →" link navigating to `/manuscript`; both are conditionally rendered only when `source_sentence` is non-null, hidden during edit mode.
- No DB or type changes required: `source_sentence` was already typed in `SuggestionPayload` and fetched via the existing `select("*")` query.
- Note: no `scene_id` is stored in the payload by `sync-lore`, so the link goes to the manuscript page rather than a specific scene.

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
