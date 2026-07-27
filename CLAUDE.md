# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # start Vite dev server
npm run build     # tsc noEmit is NOT run as part of build; vite build only (esbuild strips types, doesn't check them)
npm run preview   # preview production build
npm run deploy     # build + publish dist/ to GitHub Pages via gh-pages (homepage: rahulsingh80.github.io/Niyamit)
```

There is no test runner configured — `npm test` is a placeholder that exits 1. There is no lint script either. When making changes, verify with `npx tsc --noEmit` for type errors since the build doesn't check types.

Requires a `.env` with `VITE_GOOGLE_CLIENT_ID` (a Google OAuth 2.0 "Single-page application" client ID) for Drive sync / login to work in dev; see `.env` comments for setup.

## Architecture

Niyamit is an offline-first task manager (React + TypeScript + Vite). Single-page app, no router, no backend server — the "backend" is the user's own Google Drive.

**Data model lives in `src/domain/`, is platform-agnostic (plain types + pure functions, no React), and is meant to be reused by future non-web clients** (README describes an eventual Android/desktop client sharing this layer). When changing task/project shapes or business rules, keep this layer free of React/DOM dependencies.

- `src/domain/taskTypes.ts` — `Task`, `Reminder`, `RecurrenceRule` types. This is the canonical schema; other layers derive from it.
- `src/domain/projectTypes.ts` — `Project` type + `getDescendantIds` (projects form a tree via `parentId`/`sortOrder`).
- `src/domain/taskSort.ts` — `sortTasks` (canonical ordering: due date → priority → due time → createdAt) and `groupTasksByDate` (buckets into Overdue / Today / Tomorrow / next-5-days / Later-by-date / No due date). All UI list ordering must go through these, not ad hoc sorts.
- `src/domain/dateParser.ts` — natural-language parser for the task input box (e.g. "buy milk tomorrow 5pm !!2 #work @errand" → due date/time, recurrence, priority, project tag, reminder, tags), returning both parsed fields and text `span`s so the UI can strip the parsed portion from the visible title.
- `src/domain/reminderUtils.ts` — `getReminderDueAt` / `isReminderDue` / `getDueReminders`, used to drive the reminders banner.

**Persistence & sync** (`src/services/`):
- `localStorageService.ts` — owns the on-disk/localStorage JSON shape (`SerializedAppData`: separate `activeTasks`/`completedTasks`/`deletedTasks`/`activeProjects`/`deletedProjects`/`tags` arrays) via `toSerialized`/`fromSerialized`, distinct from the in-memory `AppData` shape (`{ tasks, projects }` flat arrays with `completed`/`deleted` flags). Handles migration from older storage key formats (v1 single-key, legacy separate task/project keys). This same serialized shape is the file format written to Google Drive, so changes here affect both localStorage and Drive files.
- `googleDriveService.ts` — raw Drive REST calls (folder/file get-or-create, download/upload) plus the **three-way merge** (`mergeAppData` → `mergeTasksThreeWay`/`mergeProjectsByUpdatedAt`) used to reconcile local vs. remote state against the last-synced baseline. Field-level conflicts (both sides changed the same field differently) surface as `TaskConflict` objects for the user to resolve manually in the UI; no silent last-write-wins at the field level.
- `exportService.ts` — JSON export/import (manual backup, independent of Drive sync).

**`src/App.tsx`** is the single stateful root — it holds `tasks`/`projects` state, drives the sync lifecycle (idle-detection → auto-sync → conflict modal), undo/redo (bounded history stack of full `AppData` snapshots), bulk selection, and all CRUD handlers. There is no state management library; everything is `useState`/`useRef` plus prop drilling into `src/components/*`. Key behaviors worth knowing before touching `App.tsx`:
- **Sync is opportunistic, not push-on-every-change**: local edits mark `hasPendingChanges` and reset an idle timer; sync fires on idle, on manual button click, on startup (if a valid token exists), or after conflict resolution — never synchronously on every keystroke.
- **Clone groups** (`Task.cloneGroupId`): tasks cloned from one another share most fields; completing one completes the whole active group; editing the title detaches (un-clones) a task from its group; a group reduced to one remaining active member is auto-detached (`cleanupSingletonCloneGroup`).
- **Recurrence**: completing a task with `recurrence` set spawns a fresh next-occurrence task (via `advanceRecurrence` in `dateParser.ts`) rather than un-completing the original.
- **Undo/redo** snapshots `{tasks, projects}` before each mutation (`pushUndo`), capped at `MAX_HISTORY` (50).

Path aliases `@domain/*`, `@services/*`, `@components/*` are defined in both `tsconfig.json` and `vite.config.ts` — keep them in sync if adding new top-level `src/` folders that need aliasing.
