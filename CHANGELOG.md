# Changelog

All notable changes to Fyrescribe are recorded here. Older entries: see CHANGELOG_ARCHIVE.md.

---

## 2026-11-11 — Remove analyze-lore

- Deleted `supabase/functions/analyze-lore/` and undeployed it from `kxryozryqbajtgrfystu`. It had been dead code since 2026-04-17: `link-lore` was built as its direct replacement in commit `3f0b337` ("Add Link Lore AI relationship inference"), the same commit that removed `analyze-lore`'s only caller (`LinkLoreModal.tsx`'s old raw `fetch`). It wrote to no tables and had no caller for ~7 months. 12 Anthropic-calling functions remain; `sync-mentions` (no AI call) makes 13 total.

---

## 2026-11-11 — Refusal handling, generator effort, analyze-lore audit

- **Effort**: `generate-profile`, `generate-story-history`, `generate-timeline`, `check-continuity` moved from the model's default (`high`) to explicit `medium`. The 8 extraction/summarization calls stay at `low`.
- **Refusal handling** (`stop_reason: "refusal"` — a normal HTTP 200, new on Sonnet 5.5/Haiku 5.5): `_shared/anthropic.ts` — `checkRefusal()` now returns the full `stop_details`; added `logRefusal()` (function name + scene/entity/project id + stop_details, to the edge function logs) and `refusalPayload()` (a named `{ refused: true, message, name, category }` body, always HTTP 200 so `supabase-js` surfaces it on `data`, never `error`). Every one of the 12 call sites now logs and returns this instead of a generic 500.
- **`sync-lore` no longer aborts on a refusal.** A declined scene is logged, added to a `refused_scenes` list on that project's result, and the loop moves on to the next scene. The Sidebar surfaces a toast plus an inline count naming the declined scene(s); the rest of the batch's suggestions are unaffected.
- **`link-lore`'s two passes are independent.** A refusal on the main relationship pass returns the named payload. A refusal on the field-tagging sub-pass no longer silently returns 0 — it's flagged separately (`field_tagging_refused`) in the same successful response, and the main pass's suggestions still save.
- **`sync-tags`** flags a refused pass (`refused`) while still returning whatever tag suggestions were already pending.
- **UI**: `Sidebar.tsx`, `LoreInboxPage.tsx`, `LoreUploadModal.tsx`, `ManuscriptPage.tsx`, `EntityDetailPage.tsx`, `TimelinePage.tsx` all check for a refusal on their respective calls and show the AI's message naming the scene/entity/chapter — no blank result, no infinite spinner, no system-prompt changes (the dark-fantasy tone instructions are untouched).
- **`analyze-lore` audited, not removed**: dead code since 2026-04-17 — `link-lore` was built as its direct replacement in the same commit that deleted its only caller. Still migrated to the shared model constant for consistency.

---

## 2026-11-11 — Migrate all Anthropic calls to Sonnet 5.5 / Haiku 5.5

- New `supabase/functions/_shared/models.ts` — `CLAUDE_SONNET_MODEL` (`claude-sonnet-5-5`) and `CLAUDE_HAIKU_MODEL` (`claude-haiku-5-5`). All 12 functions that call Anthropic now import from it; no hardcoded model string remains anywhere. Driver: `claude-sonnet-4-5-20250929` was retiring Nov 30, 2026.
- `supabase/functions/_shared/anthropic.ts` — added `extractText()` (joins `text`-type content blocks instead of reading `content[0].text`, since a response can now start with `thinking` blocks) and `checkRefusal()` (`stop_reason: "refusal"` is a normal HTTP 200 on these models). Every call site now uses both.
- `output_config: { effort: "low" }` set on the 8 extraction/summarization calls (`sync-lore`, `link-lore` ×2, `sync-tags`, `analyze-lore`, `parse-lore-file`, `merge-entity-sections`, `summarize-version`, `summarize-entity-version`). `generate-profile`, `generate-story-history`, `generate-timeline`, `check-continuity` left at the model's default effort.
- `max_tokens` raised on every affected call (thinking now counts against the same budget) — e.g. the two Haiku summarizers from 200–256 to 1024, the four default-effort Sonnet calls to 4096–8192.
- No sampling params, prefills, or forced `tool_choice` existed in this codebase, so nothing to remove there.
- `README.md`, `MIGRATION-fyrescribe.md`, `CLAUDE.md` — stale hardcoded model-id references updated to point at `_shared/models.ts`.

---

## 2026-11-09 — Lore Inbox tabs (Entries · Connections · Mentions · Tags)

- `LoreInboxPage.tsx`: tab bar with per-tab pending counts (they sum to the sidebar badge). With no `?tab=`, opens the first tab that has items. Counts stay live via the `fyrescribe:lore-inbox-changed` window event (`src/components/lore-inbox/shared.ts`).
- New `src/components/lore-inbox/{ConnectionsTab,MentionsTab,TagsTab}.tsx`: the former pop-up lists, moved onto the page and loading pending rows from the DB. Mentions gained per-item **Accept**; leaving the tab no longer auto-accepts remaining mentions (the old pop-up accepted them on close).
- Removed `LinkLoreModal`, `SyncMentionsModal`, `SyncTagsModal`. Sync Connections / Sync Mentions / Sync Tags now open `/lore-inbox?tab=…`. The World gallery's **Link Lore** button opens the Connections tab. Full Sync refreshes the inbox lists when done.
- Entries tab empty state reads "No new entries to review" (the inbox as a whole may not be clear).

---

## 2026-11-09 — Audit follow-ups: dependencies, version history, AI retries, changelog

- **Dependencies**: in-range security updates (dompurify 3.4.17, supabase-js 2.119, react-router-dom 6.30.6, vite 5.4.21). Removed 31 unused packages (jspdf, zod, recharts, react-hook-form, date-fns, cmdk, vaul, embla, unused Radix) and 38 unused `src/components/ui` files. `bun.lock` is now the only lockfile (`bun.lockb`, `package-lock.json` deleted). Remaining advisories: dev-only tooling (vite/vitest dev server) and two react-router v6 items that need SSR or untrusted link targets (neither applies).
- **Version history** (`VersionHistoryPanel`, `EntityVersionHistoryPanel`): the 4 s poll selects list columns only; the full version is fetched on restore.
- **Edge functions**: new `supabase/functions/_shared/anthropic.ts` (`fetchAnthropic`) — 110 s per-attempt timeout, up to 3 attempts on 429/529/5xx/network errors, honours Retry-After, stays inside a 140 s budget. All 12 functions that call Anthropic use it. **Needs deploy:** `supabase functions deploy --project-ref kxryozryqbajtgrfystu`.
- **Changelog**: entries before 2026-06-12 moved to CHANGELOG_ARCHIVE.md.

---

## 2026-11-09 — Save-failure warning + auto-retry for autosaves

- `src/lib/saveStatus.ts` (new) — `runSave(key, fn)` wraps an autosave write; on failure it retries with backoff (5s, 10s, 20s, then every 30s) until it succeeds or a newer call for the same key supersedes it. Exposes `useSaveStatus(keyPrefix?)` (`{ failing }`) and `hasUnsavedWork()`. Tests: `src/lib/saveStatus.test.ts`.
- `src/hooks/use-debounce.ts` — added `pendingCount()` so `hasUnsavedWork()` can see queued-but-not-yet-fired debounced saves.
- `ManuscriptPage.tsx`, `NotesPage.tsx`, `EntityDetailPage.tsx` — `saveScene`, `persistNote`, and `saveSectionsToDb` now go through `runSave`. Manuscript's status bar and Notes' header label replace "Saving…"/"Auto-saved" with a destructive-colored "Couldn't save. Retrying…" while a save is failing. Entity pages show a single auto-dismissing toast on the same condition (no page had a save indicator before).
- `App.tsx` — app-wide `beforeunload` guard: prompts before closing/reloading the tab only while `hasUnsavedWork()` is true.
- `README.md` — lore sync is on-demand only now; changed "daily or manual sync" to "on-demand sync".

## 2026-11-09 — Post-migration audit: speed + reliability (no design or feature changes)

- `src/hooks/use-debounce.ts` — Autosave hook now **flushes** pending saves on unmount, tab hide, and pagehide (previously dropped them — edits in the last ~1 s before navigating away were lost). Added optional per-key debouncing so saves for different records never cancel each other. Tests: `src/hooks/use-debounce.test.ts`.
- `ManuscriptPage.tsx` — `saveScene` debounced per scene (switching scenes within 1 s no longer drops the previous scene's save).
- `NotesPage.tsx` — `persistNote` debounced per note + field (a title edit followed by a body edit within 800 ms no longer drops the title; switching notes no longer drops a pending save).
- `EntityDetailPage.tsx` — `saveSectionsToDb` takes the entity id at call time (previously read at fire time — navigating to a linked entity within 1 s could write the old entity's sections onto the new one).
- `App.tsx` — Route-level code splitting (`React.lazy`) with idle-time prefetch of all page chunks. `main.tsx` — one-time reload on `vite:preloadError` so open tabs recover after a deploy.
- `ExportModal.tsx` — `docx` export code loaded on demand. `vite.config.ts` — React and Supabase split into long-cached vendor chunks. Initial JS: 1,503 kB → ~800 kB (429 → ~238 kB gzip).
- `TimelinePage.tsx`, `EntityGalleryPage.tsx` — Bulk delete is one request (two for entities) instead of one per row; rows are removed from the UI only if the delete succeeds.
- `VersionHistoryPanel.tsx`, `EntityVersionHistoryPanel.tsx` — 4 s poll pauses while the tab is hidden; a failed poll keeps the current list instead of blanking it.
- `index.html` — Removed Lovable author / twitter:site meta and a leftover TODO.
- `CLAUDE.md` — Supabase ref updated to the new project (`kxryozryqbajtgrfystu`), repo link and model list corrected.
- Verified: `vite build`, `tsc -p tsconfig.app.json --noEmit` (0), `vitest run` (7/7).

---

## 2026-06-12 — Audit cleanup: sync-mentions auth, LinkLoreModal types, CLAUDE.md project ref

- `supabase/functions/sync-mentions/index.ts` — Auth switched from `getClaims(token)` to `getUser()`, matching every other edge function. `getUser()` validates the session against the auth server (catches revoked sessions); `getClaims` only validated the JWT locally. `userId` now comes from `user.id` instead of `claims.sub`; the unused `token` variable removed. Handler structure, 401 path, and ownership check unchanged.
- `src/components/LinkLoreModal.tsx` — Removed the `(data as any[])` cast on the suggestion query result. Root cause: `lore_link_suggestions` has two FKs to `entities`, so the generated Supabase types could not disambiguate the embeds and inference collapsed to `SelectQueryError`. Fixed by hinting the embeds explicitly (`entity_a:entities!entity_a_id(...)`, `entity_b:entities!entity_b_id(...)`) — runtime-equivalent PostgREST syntax — so the rows now typecheck end-to-end with no cast. Schema drift in this query now fails the build instead of failing silently. (`exportLore.ts` casts intentionally left for a later pass.)
- `CLAUDE.md` — Supabase project ref corrected from the stale `ignglmxrpbxlgjmjzuql` to `bedrzyekoynnzdeblunt` (matches vite.config.ts and all repo credentials).
- CHANGELOG archive task: **no-op**. No entries dated before 2026-04-01 exist — project history starts 2026-04-11, and everything before session 11 (2026-04-13) was already moved to CHANGELOG_ARCHIVE.md in a prior pass (commit `1f00f08`).
- Verified with `tsc -p tsconfig.app.json --noEmit` (exit 0; note: the root `tsconfig.json` is solution-style and checks nothing on its own) and `vitest run` (1/1 passing).

---
