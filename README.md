# Fyrescribe

> World-building and lore management for fantasy novelists.

Fyrescribe is a dark, atmospheric web app for fantasy writers to manage their manuscript, world, and lore in one place. Write chapters and scenes, build out your world with rich entity pages, and let AI sync lore directly from your manuscript.

## Features

- **Manuscript Editor** — chapters, scenes, autosave, drag-and-drop reordering, RTF/TXT import
- **World & Lore** — 9 entity categories: Characters, Places, Events, History, Artifacts, Creatures, Magic, Factions, Doctrine
- **Entity Detail Pages** — Wikipedia-style with At a Glance fields, rich text sections, gallery, and linked entities
- **Lore Entry Upload** — upload a PDF or TXT character/lore sheet and auto-populate an entity page via AI extraction
- **AI Lore Sync** — daily or manual sync scans your manuscript scenes and surfaces new entities, field updates, and contradictions
- **Lore Inbox** — review, accept, edit, or reject AI-suggested lore changes
- **Timeline** — generate and manage a visual timeline linked to world entities
- **6 Color Themes** — customisable dark atmospheric themes
- **Auth & Projects** — multi-project support with full auth

## Tech Stack

- React + TypeScript
- Tailwind CSS
- Supabase (database, auth, edge functions, storage)
- Vite
- Claude AI (claude-sonnet-4-20250514)

## Environment Variables

The following secrets are required for edge functions:

- `ANTHROPIC_API_KEY` — Anthropic API key for AI lore sync and lore entry upload
- Supabase keys are managed via the Supabase project dashboard

## Repository

[github.com/ihatelee/fyrescribe-forge](https://github.com/ihatelee/fyrescribe-forge)
