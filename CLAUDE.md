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
- **Projects** — `ProjectsPage` lists all projects for the user. `ProjectContext` + localStorage persist the active project across navigation.
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
- **Entity system** — `EntityGalleryPage` + `EntityDetailPage` with categories: characters, places, events, artifacts, creatures, abilities, factions, doctrine. Entities have a `sections` JSONB field for rich article body content and a `gallery_image_urls` array.
- **Storage buckets** — `entity-images` (entity gallery images), `manuscripts` (uploaded manuscript files). Both use RLS policies keyed on `storage.foldername(name)[1] = auth.uid()`.
- **Other pages** — `TimelinePage`, `POVTrackerPage`, `LoreInboxPage` exist (scaffolded, content unknown).

### What is NOT yet built

- Part 2 of manuscript import: AI analysis to extract lore suggestions into `lore_suggestions` table.
- Lore Inbox review flow (accept/reject/edit suggestions).
- POV tracker logic.
- Timeline editing.
- Word count tracking (column exists on `scenes`, not yet wired up).
- Project archiving (column `archived_at` exists on `projects`, not yet used in UI).

---

## Where We Left Off

**Session: 2026-04-11**

Fixed the manuscript parser to handle single-newline manuscripts (where the entire file arrives as one block). Added `splitBlockAtEmbeddedHeadings` which re-splits each double-newline block at any embedded heading line, then wired it into the `parseManuscript` pipeline with `.flatMap()`. Also added a rule to skip single-line pre-heading blocks (the book title). Removed debug `console.log` statements. Committed and pushed as `c10d499`.

The manuscript import pipeline (Part 1) should now correctly detect chapter headings and build the chapter/scene tree from a real novel manuscript.

**Next logical steps:**
- Test the import end-to-end with a real manuscript file to confirm chapters parse correctly.
- Begin Part 2: AI-powered lore extraction from manuscript scenes into `lore_suggestions`.

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
