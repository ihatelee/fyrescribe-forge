# Changelog

All notable changes to Fyrescribe are recorded here. Older entries: see CHANGELOG_ARCHIVE.md.

---

## 2026-04-22 — Sync-lore fixes: short description, informal place names, merge error surfacing

- `supabase/functions/sync-lore/index.ts` — **Fix 1 (description/overview duplication):** Added `short_description` to the `AISuggestion` interface. `buildPrompt` now requests `short_description` as an explicit top-level field (one sentence, ≤20 words, must differ in length and content from `sections.Overview`). The sections `Overview` prompt is updated to request a full paragraph. Row builder maps `short_description` → `payload.description`; `sections.Overview` is preserved as a separate full-paragraph field. Falls back to first non-empty section only when the AI omits `short_description`.
- `supabase/functions/sync-lore/index.ts` — **Fix 2 (informal place names):** Updated the `location` bullet in `buildPrompt` to explicitly instruct the AI to extract any named location regardless of genre or formality — houses, bars, streets, neighborhoods, and buildings are all valid if they have a proper name. Added examples ("The Spot", "Joe's Bar", "Elm Street").
- `src/pages/LoreInboxPage.tsx` — **Fix 3 (merge visibility + error logging):** `acceptOneSuggestion` now returns `noNewInfo: boolean` (true when a duplicate entity is found but the incoming suggestion has no section content to add). `handleAccept` stores this in new `acceptedNoNewInfo` state. The accepted banner now shows "No new information to add." instead of "Entity merged." in this case, so the user understands why the entity page didn't visibly change. Background merge path improved: `mergeError` from the edge function invoke is now checked and logged; missing `merged_sections` in the response is logged; entity update errors are logged separately.

---

## 2026-04-18 — Universal ambiance player (placeholder)

- `src/components/AmbiancePlayer.tsx` (new) — replaces `OutrunMusicPlayer`. Multi-track sequential playlist per theme; tracks loop back to track 1 after the last. `PLAYLISTS` map holds CDN mp3 URL arrays keyed by `ThemeName`. Non-Outrun themes have empty arrays — the component returns `null` for those themes so the player stays hidden until real URLs are added. Volume persisted to `fyrescribe_ambiance_volume`. No autoplay on mount or theme change.
- `src/pages/ManuscriptPage.tsx` — swapped `OutrunMusicPlayer` import for `AmbiancePlayer`; removed `theme === "outrun"` render guard (player self-hides via `null` return when playlist is empty); `hidden md:block` wrapper retained for mobile suppression.

---

## 2026-04-17 — Lore Inbox: fast accept + Accept All

- `src/pages/LoreInboxPage.tsx` — **Fast accept (optimistic UI):** `handleAccept` no longer blocks on the AI `merge-entity-sections` call. Extracted core logic into `acceptOneSuggestion` which applies a shallow section merge immediately (so the card dismisses at once), then fires the AI merge in the background as a fire-and-forget `.then()` chain that silently patches the entity when done.
- `src/pages/LoreInboxPage.tsx` — **Accept All:** Added `handleAcceptAll` which snapshots the pending list and iterates it sequentially (to avoid tag name races), dismissing each card in turn. Header toolbar now shows an "Accept All" button alongside the pending count when suggestions exist. A green status banner ("Accepted N entities") appears on completion and auto-dismisses after 4 s.

---

## 2026-04-18 — Mobile & manuscript bug fixes

- `src/pages/ManuscriptPage.tsx` — **Bug 1 (dropdown backgrounds on mobile):** Format menu and Version menu dropdowns were `position: absolute` inside an ancestor with `overflow: hidden`, causing them to be clipped on mobile. Both dropdowns now use `position: fixed` with coordinates captured via `getBoundingClientRect()` at open time (same pattern as `POVSelector`). Added `formatButtonRef`, `versionMenuButtonRef`, `formatMenuPos`/`versionMenuPos` state, and `openFormatMenu`/`openVersionMenu` callbacks. Parent wrappers no longer need `relative`.
- `src/pages/ManuscriptPage.tsx` — **Bug 2 (focus mode exit on mobile):** Focus mode toolbar rendered the full `formattingControls` set inline, leaving no room for the Exit button on narrow screens. Restructured to mirror the main toolbar: desktop shows all controls + Exit text; mobile shows a compact Format button + an X icon button (`ml-auto flex-shrink-0`) that is always visible and cannot be pushed off-screen. Focus mode container also gets `paddingBottom: env(safe-area-inset-bottom, 0px)` for iOS notch safety.
- `src/pages/ManuscriptPage.tsx` — **Bug 3 (no bottom padding):** Scroll container changed from `py-10` to `pt-10 pb-32 lg:pb-24` — 8 rem bottom padding on mobile, 6 rem on desktop.
- `src/pages/ManuscriptPage.tsx` — **Bug 4 (iOS Safari bottom bar):** Main editor container changed from `h-[calc(100vh-80px)]` to `h-[calc(100dvh-80px)]`.
- `src/components/AppLayout.tsx` — **Bug 4:** Root layout container changed from `h-screen` to `h-[100dvh]`.
- `src/index.css` — **Bug 4:** `html, body, #root` height declaration now sets `100vh` then overrides with `100dvh` (ignored by browsers that don't support it, used by iOS Safari 16+ and Chrome 108+).

---

## 2026-04-17 — Migration cleanup + drop scene_tags

- `supabase/migrations/20260417145501_3211b5b1.sql` — added `IF NOT EXISTS` to `CREATE TABLE lore_link_suggestions` so clean DB replays no longer fail when the duplicate migration (`20260419100000`) runs after it.
- `supabase/migrations/20260419100000_create_lore_link_suggestions.sql` — converted to a documented no-op. The table was already created by `20260417145501`; the duplicate `CREATE TABLE` without an `IF NOT EXISTS` guard would have errored on replay.
- `supabase/migrations/20260417000000_notes_user_id_rls.sql` — wrapped the `ALTER TABLE notes` block in a `DO $$ BEGIN IF EXISTS (...) THEN ... END IF; END $$` conditional. On clean replay the notes table is created later (`20260417002613`), so this migration is now a safe no-op when the table doesn't exist yet.
- `supabase/migrations/20260420000000_db_cleanup.sql` — new migration. Drops duplicate RLS policy `"Users can manage their own mentions"` from `entity_mentions` (the weaker version lacking `WITH CHECK`, created by `20260418000000`); the correct policy `"Users manage own entity_mentions"` (with `WITH CHECK`, from `20260417041534`) is retained. Also drops the orphaned `scene_tags` table, which was created in the initial migration but has never been referenced in any application code.

---

## 2026-04-17 — Extend search to manuscript content

- `src/hooks/useLoreSearch.ts` — added `SceneSearchResult` interface (`type: "scene"`, `id`, `title`, `chapterTitle`, `content`). Added a fourth parallel query (`scenes` table, `ilike` on `content`, with `chapters(title)` join, limit 10) to the existing `Promise.all`. Results mapped to `SceneSearchResult[]` and returned as `sceneResults`. Hook now returns `{ results, sceneResults, isLoading, error }`.
- `src/components/LoreSearchModal.tsx` — added `extractSnippet` helper (strips HTML, finds query term, returns ~60 chars either side with ellipsis). Added `handleSceneSelect` navigating to `/project/:projectId/manuscript?scene=:sceneId`. Results area now shows an "Entities" section header + entity list, then a "Manuscript" section header + scene list with `FileText` icon, scene title, chapter name, and content snippet. Empty state updated to "No results found" (covers both types). Placeholder updated to "Search entities and manuscript content". Max-height increased from `max-h-80` to `max-h-96` to accommodate two sections.

---

## 2026-04-17 — Lore sheets export switched from .pdf to .docx

- `src/lib/exportLore.ts` — replaced `jspdf` renderer with `docx` package. Structure per entity: entity name as `HEADING_1`, italic category label (9pt grey), non-empty sections as `HEADING_2` + body paragraphs, At a Glance fields as a borderless two-column table (key bold 35% / value 65%, light bottom-border separators on each row), linked entities (non-field-picker relationships) as a `bullet: { level: 0 }` list. Category group dividers (bold uppercase, thick bottom border) appear before the first entity in each group; page break inserted before every entity except the first. Document styles: H1 18pt bold, H2 11pt bold. Filename changed from `…-lore-sheets.pdf` to `…-lore-sheets.docx`.
- `src/components/ExportModal.tsx` — updated Lore Sheets description from ".pdf" to ".docx"; updated Everything description to "Downloads both .docx files".

---

## 2026-04-17 — Export: Manuscript as .docx + Lore Sheets as .pdf

- `src/lib/exportManuscript.ts` — new utility. Fetches chapters (ordered by `order`) and scenes (ordered by `order`), strips HTML from scene content, and builds a `docx.Document`: project title as TITLE, each chapter as HEADING_1 with a page break before it (except the first), each scene as HEADING_2, body text as 12pt paragraphs. Uses `Packer.toBlob()` and a programmatic `<a download>` click. Depends on the `docx` npm package.
- `src/lib/exportLore.ts` — new utility. Fetches all non-archived entities and all their `entity_links` (both directions). Groups and sorts entities by category order (characters → places → factions → events → history → artifacts → creatures → magic → doctrine), then alphabetically by name. For each entity, renders to A4 pages via `jsPDF`: entity name (20pt bold), category label (9pt grey, uppercase), horizontal rule, then each non-empty section as a labelled text block with line wrapping. At a Glance fields rendered as a two-column grid (key label + value). Linked entities (non-field relationships) listed with name · relationship. Depends on the `jspdf` npm package.
- `src/components/ExportModal.tsx` — new modal with three radio-card options: Manuscript (.docx), Lore Sheets (.pdf), Everything (both). Single Export CTA; shows spinner during generation. Error message on failure. Closes on success.
- `src/pages/ProjectsPage.tsx` — added `exportTarget` state, `Download` icon import, `ExportModal` import. New "Export" `DropdownMenuItem` added above "Archive" in the project card 3-dot menu. Renders `<ExportModal>` when `exportTarget` is set.

---

## 2026-04-17 — Scene version history + mobile responsive layout (pull)

### Scene version history
- `supabase/migrations/20260417201706_…sql` — creates `scene_versions` table: `scene_id` (FK → scenes, cascade delete), `project_id` (FK → projects), `name TEXT`, `content TEXT`, `word_count INTEGER`, `word_delta INTEGER` (delta from prior version), `summary TEXT`, `created_at`. Two indexes (scene_id+created_at, project_id). RLS: project owner only.
- `supabase/functions/summarize-version/index.ts` — new edge function. Fetches the saved version and the immediately preceding version for the same scene. Diffs them via a single-sentence AI prompt (max 18 words) using Lovable's AI gateway (`google/gemini-2.5-flash`). Writes the summary back to `scene_versions.summary`. Falls back gracefully if no prior version exists (summarises the scene as-is instead of diffing).
- `src/components/SaveVersionPopover.tsx` — small inline popover (absolute-positioned, opens above trigger) with an optional version name field and Save/Cancel. Enter key submits; Escape closes.
- `src/components/VersionHistoryPanel.tsx` — slide-in panel listing all versions for the active scene, newest first. Each card shows name, date, word count, delta (+/−), and the AI-generated summary (polling until it appears). Restore button: two-step confirm; sets scene content and marks `is_dirty`. Delete button: two-step confirm; removes the version row.
- `src/pages/ManuscriptPage.tsx` — integrated versioning: `handleSaveVersion` captures freshest content from `contentCache`, computes word delta vs prior version, inserts into `scene_versions`, then fire-and-forgets `summarize-version`. `handleRestoreVersion` writes restored content back to the scene and sets `is_dirty`. New toolbar controls: Save Version button (opens `SaveVersionPopover`), History button (opens `VersionHistoryPanel`). Version saved/failed toast (2.5 s). Chapter panel and format menu now have collapsible state tracked in component. Text size defaults to `small` on mobile and `medium` on desktop.

### Mobile responsive layout
- `src/components/AppLayout.tsx` — sidebar now split into two paths: desktop (`hidden lg:block` fixed sidebar) and mobile/tablet-portrait (slide-in drawer triggered by a custom `mobile-nav-toggle` / `mobile-nav-close` window event). Drawer has a backdrop overlay that closes on tap. Body scroll locked while drawer is open.
- `src/components/Titlebar.tsx` — accepts `showSidebarToggle` prop; renders a hamburger `Menu` button (mobile-only, `lg:hidden`) that fires the `mobile-nav-toggle` event. Titlebar labels ("Settings", "Ambiance", "Profile") hidden on mobile (`hidden lg:inline`). Logo slightly smaller on mobile.
- `src/components/MobileUnavailable.tsx` — new utility component. Shows a "not available on mobile" message with a `Monitor` icon for features that require desktop. Wrapped in `lg:hidden` so it never renders on desktop.
- `src/pages/NotesPage.tsx` — notes list panel becomes a fixed left drawer on mobile (`translate-x` toggle), with a `PanelLeft` floating button to reopen it and a backdrop overlay to close it. Desktop layout unchanged (`lg:relative lg:w-[280px]`).

---

## 2026-04-17 — Code audit and cleanup

### Audit findings

**Dead files removed:**
- `src/components/NavLink.tsx` — React Router NavLink wrapper component never imported by any file. Deleted.
- `src/types/lore.ts` — Exported `LoreSuggestionType`, `LoreSuggestion`, and `LORE_TYPE_TO_CATEGORY`, none of which were imported anywhere. The `LoreSuggestion` interface had the wrong shape (fields as top-level columns rather than inside `payload: SuggestionPayload`); the correct interface lives in `LoreInboxPage.tsx`. Deleted.

**No action needed (actively used, not dead code):**
- `entity_tags` — still in active use across `EntityDetailPage`, `EntityGalleryPage`, `LoreInboxPage`, and `LoreUploadModal`. It stores user-defined coloured label tags; `entity_links` stores structured entity-to-entity field relationships. These are different systems and were never in conflict.
- `CATEGORY_FIELDS` / `CATEGORY_SECTIONS` — still in active use in `EntityDetailPage` (field key seeding and At a Glance panel) and `LoreUploadModal`. The CHANGELOG note about removing them referred only to the `sync-lore` edge function; the frontend constants remain correct.
- `console.error` calls — all are genuine error-path logging (40+ occurrences). No casual `console.log` debug statements exist anywhere in `src/`.
- Duplicate `runFieldTaggingPass` in `link-lore` and `sync-tags` — intentional; Supabase deploys each edge function independently and cannot share module code.
- All imports across `src/` — verified clean, no unused imports found.
- All `useState` declarations — verified all setters are called; no dead state.

### Changes made
- Deleted `src/components/NavLink.tsx`
- Deleted `src/types/lore.ts`

---

## 2026-04-17 — Sync Tags: review modal + Lovable refinements (pull)

- `src/components/SyncTagsModal.tsx` (Lovable) — new review modal matching the LinkLoreModal pattern. `sync-tags` now returns a `suggestions` array (each entry: `entity_id/name/category`, `field_key`, `target_entity_id/name/category`) instead of auto-inserting. Modal groups suggestions by source entity, shows field key and proposed target with category badge. Accept writes to `entity_links` immediately; Reject is local-only (suggestions are stateless — AI may resurface on next run). Empty state shown when no suggestions remain.
- `supabase/functions/sync-tags/index.ts` (Lovable) — changed return shape: `runFieldTaggingPass` now returns `TagSuggestion[]` instead of a count, and no longer inserts into `entity_links` directly. Edge function returns `{ suggestions: TagSuggestion[] }`. Insertion happens client-side on accept.
- `supabase/functions/link-lore/index.ts` (Lovable) — updated call to `runFieldTaggingPass` to match new signature.
- `src/components/Sidebar.tsx` (Lovable) — `handleSyncTagsInner` updated to collect the `suggestions` array; after `handleSyncTags` runs it stores the array in `tagSuggestions` state and opens `SyncTagsModal`.

---

## 2026-04-17 — Sync Tags: AI-powered At a Glance field population

- `supabase/functions/sync-tags/index.ts` — new standalone edge function. Fetches all non-archived entities and their `entity_mentions` contexts. Builds a prompt targeting structured entity-picker fields by category (characters: Place of Birth / Currently Residing / Allegiance; artifacts: Origin / Current Owner; factions: Leader / Headquarters; creatures: Habitat; magic: Regional Origin). AI returns `[{ entity_id, field_key, target_entity_id }]`. Validates: entity and target IDs must exist in the project, field must be valid for the entity's category, target must be the correct category, field must not already be set. Inserts into `entity_links` with `relationship = field_key`. Never overwrites existing values.
- `supabase/functions/link-lore/index.ts` — added a second AI pass (`runFieldTaggingPass`) that runs inline after the freeform relationship pass. Same field-tagging logic; uses the already-fetched `entities` array so no extra DB query for entity data. Returns `field_links_created` count alongside `suggestions_created`.
- `src/pages/EntityDetailPage.tsx` — added `"Regional Origin": "places"` to `ENTITY_FIELD_MAP` so magic entities render Regional Origin as an entity-picker badge (was previously a free-text field).
- `src/components/Sidebar.tsx` — added `syncingTags` / `tagsMessage` state, `handleSyncTagsInner` (shared inner), `handleSyncTags` (standalone button handler). "Sync Tags" button added below Link Lore with identical style. Full Sync chain extended: sync-lore → sync-mentions → link-lore → sync-tags.

---

## 2026-04-16 — Smart merge on duplicate entity accept

- `supabase/functions/merge-entity-sections/index.ts` — new edge function. Accepts `{ existing_sections, new_sections }` (both `Record<string, string>`). Calls AI to merge them into a single coherent record preserving all facts from both. Strips code fences, falls back to shallow merge if parse fails.
- `src/pages/LoreInboxPage.tsx` — `handleAccept` now checks for an existing entity with the same name + category (`.maybeSingle()`). If found: calls `merge-entity-sections`, then updates the existing entity's `sections` (and `summary` if previously blank). If not found: creates a new entity as before. Accepted banner now reads "Entity merged." vs "Entity created." depending on which path was taken.
- `supabase/functions/sync-lore/index.ts` — tightened existing-entities context: now selects `sections` in addition to `name/category/summary`, and falls back to the first non-empty section value (up to 100 chars) when `summary` is blank, so the AI has enough context to avoid re-suggesting well-documented entities.

---

## 2026-04-17 — Link Lore AI relationship inference

- `supabase/migrations/20260419100000_create_lore_link_suggestions.sql` — creates `lore_link_suggestions` table (project_id, entity_a_id, entity_b_id, relationship, confidence INTEGER, status TEXT default 'pending', created_at) with RLS scoped to project owner.
- `supabase/functions/link-lore/index.ts` — new edge function. Fetches all non-archived entities (id, name, category, summary, sections) and existing entity_links for the project. Builds a plain-text context block and sends a single AI call (claude-sonnet-4-20250514) requesting a JSON array of `{ entity_a_id, entity_b_id, relationship, confidence }`. Strips code fences from response, filters to confidence ≥ 7, deduplicates against existing linked pairs. Full-refresh: deletes existing pending suggestions then bulk-inserts new ones. Returns `{ suggestions_created: number }`.
- `src/components/LinkLoreModal.tsx` — rewritten. On open, loads `lore_link_suggestions` where `status = pending` for the project (ordered by confidence desc). Accept: inserts into `entity_links` + updates suggestion `status = accepted`. Dismiss: updates `status = dismissed`. Both remove the card immediately. Shows confidence score (X/10) per card. Counter "X of Y reviewed" in header. Empty states: no pending suggestions vs. all reviewed.
- `src/components/Sidebar.tsx` — added `linkingLore` / `linkLoreMessage` state, `handleLinkLoreInner` (shared inner logic), `handleLinkLore` (standalone button handler with loading state + 4 s message). Link Lore button added below Sync Mentions with identical button style. Full Sync chain extended: sync-lore → sync-mentions → link-lore.

---

## 2026-04-17 — Entity linking wiring + Story History fix + Appearance Log position

- `supabase/migrations/20260419000000_add_scene_id_to_entity_links.sql` — adds nullable `scene_id UUID REFERENCES scenes(id) ON DELETE SET NULL` to `entity_links`.
- `src/pages/EntityDetailPage.tsx` — `LinkedEntityRow` 3-dot menu: replaced `Trash2` "Remove link" with gold-fill checkbox + "Delete Relationship" label, matching the delete design pattern used on lore tiles and timeline events. Moved `<AppearanceLog>` from end of page to immediately before Related Artifacts (so it appears higher for all entity categories). Story History contentEditable: added `[&_p]:mb-4 [&_p:last-child]:mb-0` so AI-generated `<p>` tags render with paragraph spacing.
- `supabase/functions/generate-story-history/index.ts` — rewrote system prompt to be strictly factual (no inference or embellishment). Restructured user prompt to two clearly labelled blocks: `Existing history` and `New mention contexts`. Removed unused `fields`/`sections` summary context that invited embellishment.
- `CLAUDE.md` — added Story History behaviour notes to Hard Rules.

---

## 2026-04-18 — Appearance Log data wiring

- `src/components/AppearanceLog.tsx` (Lovable) — queries `entity_mentions` with inner joins to `scenes` and `chapters`, sorts by chapter/scene order then character position, bolds entity name in context via `HighlightedContext`, paginates (10/25/50/100), shows empty state, navigates to `/project/:projectId/manuscript?scene=:sceneId` on row click.
- `src/pages/EntityDetailPage.tsx` (Lovable) — renders `<AppearanceLog entityId={entity.id} entityName={entity.name} projectId={projectId} />` after the entity body.
- `src/pages/ManuscriptPage.tsx` (Lovable) — added `useSearchParams` to read `?scene=` on load and jump directly to the referenced scene.

---

## 2026-04-18 — Sync Mentions

- `supabase/migrations/20260418000000_create_entity_mentions.sql` — creates `entity_mentions` table (entity_id, scene_id, project_id, context TEXT, position INTEGER) with RLS scoped to project owner.
- `supabase/functions/sync-mentions/index.ts` — new edge function. Fetches all non-archived entities and all scenes for the project. Strips HTML from scene content, then scans for each entity name (case-insensitive, word-boundary checked). Extracts context (6 words before + match + 6 words after) and records character offset as `position`. Full refresh: deletes existing rows for the project, then bulk-inserts in chunks of 500.
- `src/components/Sidebar.tsx` — added `syncingMentions` / `mentionsMessage` state, `handleSyncMentionsInner` (shared inner logic), and `handleSyncMentions` (standalone button handler). Sync Mentions button appears directly below Sync Lore with matching style and loading/status message. Full Sync now chains `handleSyncMentionsInner` after `sync-lore` completes.

---

## 2026-04-17 — Rename dyslexia font toggle to Sans-Serif + swap to Inter

- `src/components/AccessibilityPanel.tsx` — toggle label changed from "Dyslexia-Friendly Font" to "Sans-Serif Font".
- `src/index.css` — replaced OpenDyslexic `@font-face` with Inter Google Fonts import (`wght@400;500;600`). CSS rule updated to `font-family: 'Inter', sans-serif`.

---

## 2026-04-17 — High contrast fix + Settings icon position

- `src/contexts/ThemeContext.tsx` — root cause: `applyTheme` sets CSS custom properties as inline styles; stylesheet `html.high-contrast { }` rules can never win against them. Fix: moved HC overrides into JS — `applyAccessibility` now calls `root.style.setProperty` for each HC var (dark or light variants for daylight theme), and restores theme values when HC is disabled. Merged the two separate `useEffect` calls (theme + accessibility) into one so theme changes can never wipe HC overrides mid-render.
- `src/index.css` — removed the (non-functional) CSS custom-property overrides from `.high-contrast`; replaced with a `focus-visible` outline boost that CSS can control.
- `src/components/Titlebar.tsx` — moved Settings (AccessibilityPanel) to the left of Ambiance (ThemeSwitcher).

---

## 2026-04-17 — Accessibility panel persistence + high contrast + dyslexia font

- `supabase/migrations/20260417200000_add_accessibility_prefs_to_user_preferences.sql` — idempotent migration adding `interface_scale INTEGER DEFAULT 100`, `high_contrast BOOLEAN DEFAULT false`, `dyslexia_font BOOLEAN DEFAULT false` to `user_preferences`.
- `src/contexts/ThemeContext.tsx` — `applyTheme` now sets `data-theme` attribute on `<html>` for reliable CSS targeting. Preferences load from DB on auth, apply immediately via `applyAccessibility`, and persist on every change via `persistPrefs`. Scale applied via `root.style.fontSize` (rem-driven). High contrast / dyslexia font applied as CSS classes on `<html>`.
- `src/index.css` — replaced cdnfonts import with `@font-face` using the jsdelivr woff2 URL (`open-dyslexic@1.0.3`). High contrast CSS strengthened: all text vars lifted to `--text-primary`, borders at 55% opacity, `--bg-raised`/`--bg-hover` surface tokens boosted. Daylight theme gets dark borders via `html[data-theme="daylight"].high-contrast`.
- `src/components/AccessibilityPanel.tsx` — panel built by Lovable: scale pill buttons (75/100/125/150%) and toggle switches for High Contrast and Dyslexia Font, rendered from the Titlebar.

---

## 2026-04-17 — Timeline event cap, raised threshold, delete button styling

- `supabase/functions/generate-timeline/index.ts` — prompt now instructs AI to return at most 4 events per scene (0–1 if nothing notable happens).
- `src/pages/TimelinePage.tsx` — default "Major only" threshold raised from 7+ to 9+; label and empty-state hint updated accordingly. Delete checkbox replaced with the same custom gold-fill style used on lore tiles and POV Character control (button with `bg-gold border-gold` + `Check` icon when selected; `onClick` properly wired to `toggleSelectEvent`).

---

## 2026-04-17 — Timeline significance threshold

- `supabase/migrations/20260417100000_add_significance_score_to_timeline_events.sql` — adds `significance_score INTEGER DEFAULT 5` to `timeline_events`.
- `supabase/functions/generate-timeline/index.ts` — updated AI prompt to return `significance_score` 1–10 per event (8–10: world-changing; 5–7: notable; 1–4: minor). Score is clamped 1–10 and persisted on insert. Events without a score fall back to 5.
- `src/pages/TimelinePage.tsx` — added `majorOnly` state (default `true`) filtering to score ≥ 7. Toggle pill "Major only (7+)" / "All events" sits at the right of the filter bar. Score badge appears on each event card. Manually-added events default to score 10 so they always appear. Empty state message hints to toggle "All events" if the threshold is hiding results.

---

## 2026-04-17 — Move category tag to bottom left of lore tile

- `src/pages/EntityGalleryPage.tsx` — grid tile: removed category tag from the header row and repositioned it as `absolute bottom-3 left-3`, mirroring the delete button on the opposite corner. List view category position unchanged (already left-aligned in the row).

---

## 2026-04-17 — Lore tile 3-dot button visibility + delete button spacing

- `src/pages/EntityGalleryPage.tsx` — `EntityMenu` trigger: removed `opacity-0 group-hover:opacity-100`; button is now always visible with `bg-fyrescribe-base border border-border` styling matching other app buttons.
- Grid tile card: added `pb-10` so the delete button has clear space below card content and never overlaps the summary or tags.

---

## 2026-04-17 — Lore tile delete checkbox fixes

- `src/pages/EntityGalleryPage.tsx` — grid tile: replaced `<label>` (which only called `stopPropagation`, never toggling state) with a `<button>` that calls `toggleSelectEntity`. Lifted the active background to the whole button — gold tint (`bg-gold/10 border-gold/30`) when selected, destructive hover when not — so the entire "delete" area responds as one unit.

---

## 2026-04-17 — Lore tile delete checkbox styling

- `src/pages/EntityGalleryPage.tsx` — replaced native `<input type="checkbox">` on both grid and list view tiles with a custom `<span>` matching the POV Character checkbox style exactly: 12×12 px, `rounded-sm`, `border-text-dimmed` unchecked, `bg-gold border-gold` with a white `Check` icon when checked.

---

## 2026-04-17 — Notes editor font size control

- `src/pages/NotesPage.tsx` — added `TextSizeSelector` (Small / Medium / Large / XL) to the notes toolbar, matching the manuscript editor control exactly. Editor body font size now responds to selection; defaults to Small (16 px) to match prior notes styling.

---

## 2026-04-17 — Notes persistence (user_id + RLS)

- `supabase/migrations/20260417000000_notes_user_id_rls.sql` — adds `user_id UUID` column to `notes` table, enables RLS, and creates policy scoping all operations to `auth.uid() = user_id`.
- `src/pages/NotesPage.tsx` — imports `useAuth`; guards `handleNewNote` with `user` check; passes `user_id: user.id` on insert so new notes are owned and visible only to the creating user.

---

## 2026-04-17 — Notes page (per-project notepad)

- New `notes` table (project_id, title, content, timestamps) with RLS scoped to project owner; cascade-deletes with project. Migration adds standard `update_updated_at_column` trigger.
- `src/pages/NotesPage.tsx` — two-panel layout: left list (New Note button, title + snippet, active-note highlight, hover-revealed 3-dot menu with Delete) and right editor (large title input + contentEditable body). Toolbar matches manuscript style: Bold, Italic, Bullet list, Numbered list, Insert checkbox — no font-size controls. Notes persist via debounced (800ms) Supabase updates; `data-initialized` guard on contentEditable prevents cursor reset. Custom-styled checkboxes (gold when checked) toggle in-place by mutating the `checked` attribute so state survives serialisation.
- `src/App.tsx` — registered `/notes` route under `ProtectedRoute`.
- `src/components/Sidebar.tsx` — added Notes nav entry under "Write" using lucide `StickyNote` (kept outside the themed icon sets to avoid extending every theme).

---

## 2026-04-16 — text-dimmed +10% lightness across all themes

- `src/contexts/ThemeContext.tsx` — increased `--text-dimmed` lightness by 10 percentage points in all six themes: midnight 30%→40%, fireside 28%→38%, outrun 20%→30%, lavender 28%→38%, daylight 55%→65%, enchanted 26%→36%.

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
