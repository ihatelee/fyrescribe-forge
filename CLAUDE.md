# Fyrescribe — Claude Working Notes

## Repo & Services

- **Repo**: [github.com/ihatelee/fyrescribe-forge](https://github.com/ihatelee/fyrescribe-forge)
- **Supabase project ref**: `bedrzyekoynnzdeblunt`
- **Supabase credentials**: `src/integrations/supabase/client.ts`; generated types: `src/integrations/supabase/types.ts`
- **AI model**: `claude-sonnet-4-20250514` (edge functions)

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 18 + TypeScript + Vite |
| Styling | Tailwind CSS v3 + shadcn/ui (Radix primitives) |
| Routing | React Router v6 |
| Server state | TanStack Query v5 |
| Backend / DB | Supabase (Postgres + Auth + Storage + Edge Functions) |
| Runtime / package manager | Bun |
| Testing | Vitest + Testing Library |
| Linting | ESLint + typescript-eslint |

**Path alias:** `@/` → `src/`

## Key Directories

```
src/
  components/        shared UI components
  contexts/          ThemeContext, AuthContext, ProjectContext
  lib/               utilities (manuscriptParser, iconSets)
  pages/             route-level pages
  integrations/supabase/  generated client + types
supabase/
  functions/         Deno edge functions (sync-lore, parse-lore-file, generate-timeline)
  migrations/        SQL migrations — add new files, never edit existing
```

## Hard Rules

- **RTF parser** (`src/lib/manuscriptParser.ts` `stripRtf`) — do not modify without testing against a real RTF export. Regex order matters; one wrong change silently corrupts text.
- **Supabase RLS policies** — do not alter without careful review. A wrong policy exposes data across users or locks the app entirely.
- **`is_dirty` on `scenes`** — do not remove or bypass. It is the trigger mechanism for the lore sync pipeline.
- **`entity_category` enum values** — do not rename/remove without a corresponding `ALTER TYPE … RENAME VALUE` migration. Existing rows reference these strings directly.
- **Migrations** — add new files to `supabase/migrations/`. Never edit existing migration files.
- **No default exports for utilities** — named exports only (e.g. `manuscriptParser.ts`).
- **contentEditable editors** — use `data-initialized` guard; set `el.dataset.initialized = "true"` after first `innerHTML` write to prevent resets on re-render.
- **Debounced saves** — 1 s `useDebouncedCallback`; write directly to Supabase with no optimistic UI.
- **Design tokens** — all theme styles (colours + fonts) flow through CSS variables only. Key tokens: `gold`, `gold-bright`, `fyrescribe-raised`, `fyrescribe-hover`, `text-dimmed`, `text-secondary`. Defined in `tailwind.config.ts`.

## Story History (character pages)

Story History is additive and non-destructive. Max 2 paragraphs. The Update History function passes existing history to the AI as context and builds on it — it never replaces it. The prompt must be strictly factual: summarise only events explicitly present in the manuscript mention contexts. No inference, speculation, or embellishment beyond what is in the text.

## "Update documentation" means

1. Append a dated entry to **CHANGELOG.md** summarising what was done.
2. Do NOT change this file unless explicitly asked.
