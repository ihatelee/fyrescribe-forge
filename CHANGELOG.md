# Changelog

All notable changes to Fyrescribe are recorded here.

---

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
