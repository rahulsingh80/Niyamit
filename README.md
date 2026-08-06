# Niyamit – Offline-first Task Manager (Web)

Niyamit is a task manager whose "backend" is **your own Google Drive**. Data lives as JSON — first in the browser's local storage, then optionally synced to a `Niyamit` folder in Drive — and the core data model and business logic are written to be shared by future non-web clients (Android, desktop).

This iteration is a **React + TypeScript + Vite** single-page app with no router and no server component. It supports:

- **Natural-language task entry** — type a title like `Buy milk tomorrow 5pm !!2 #groceries @errand` and the due date, time, priority, project, and tag are parsed out automatically
- **Recurring tasks** (daily/weekly/specific weekdays, day-of-month, day-of-year, Nth-weekday-of-month, every-N-months), with completing one occurrence automatically creating the next
- **Projects**, arranged as a tree (drag-and-drop, reorder, move under another project), and **tags**
- **Task clones** — linked copies that stay in sync (completing or editing one updates all of them) until one is renamed or explicitly un-cloned
- **Reminders**, either at a specific date/time or a fixed offset before the due date, surfaced in a dismissible/snoozable banner
- **Undo/redo** across all edits, including completion and deletion
- **Bulk actions** — multi-select tasks to delete, reprioritize, move to a project, or tag them all at once
- **Google Drive sync** with three-way merge against the last-synced baseline, and a conflict-resolution UI when both sides changed the same field
- **JSON export/import** for manual backup, independent of Drive
- **Offline-first persistence** in `localStorage`, with automatic migration from older storage formats

---

## Project Structure

```
index.html                    Vite HTML shell
src/main.tsx                  React entry point; wraps <App> in GoogleOAuthProvider
src/App.tsx                   Single stateful root: CRUD, sync lifecycle, undo/redo, bulk selection
src/styles.css                App styling

src/domain/                   Platform-agnostic data model + business logic (no React/DOM)
  taskTypes.ts                 Task, Reminder, RecurrenceRule types (the canonical schema)
  projectTypes.ts               Project type + getDescendantIds (projects form a tree)
  taskSort.ts                  sortTasks / groupTasksByDate — canonical ordering & date bucketing
  dateParser.ts                Natural-language parser for the task title, recurrence math
  reminderUtils.ts             getReminderDueAt / isReminderDue / getDueReminders
  reminderPresets.ts           "Remind me before due" preset options

src/services/                 Persistence & sync (also platform-agnostic where possible)
  localStorageService.ts       On-disk JSON shape, load/save, migration from older formats
  googleDriveService.ts        Drive REST calls + three-way merge / conflict detection
  exportService.ts             JSON export/import (manual backup)

src/components/               UI (React), one file per component
  TaskForm.tsx, TaskList.tsx, ProjectSidebar.tsx, ProjectTree.tsx,
  BulkActionBar.tsx, RemindersSection.tsx, ProjectSelect.tsx, TagSelect.tsx, HelpPage.tsx

src/hooks/useNarrowPhoneLayout.ts   Responsive layout hook (collapses sidebar sections on phones)

src/test/setup.ts              Vitest + Testing Library setup (jsdom polyfills)
*.test.ts / *.test.tsx         Colocated next to the code they test (Vitest convention)

tsconfig.json, vite.config.ts  Path aliases (@domain, @services, @components) kept in sync
```

The **domain** and **services** folders have no React or DOM dependency, so the same task/project shapes, sorting rules, date parsing, and Drive merge logic can be reused by a future React Native or desktop client.

---

## Task & Project Data Model

Defined in `src/domain/taskTypes.ts` and `src/domain/projectTypes.ts`:

- **`Task`** — `id`, `title`, `notes?`, `dueDate` (`YYYY-MM-DD` or `null`), `dueTime?` (`HH:MM`), `recurrence?` (`RecurrenceRule`), `priority` (`1`–`4`, 1 is highest), `createdAt`, `updatedAt?`, `completed`, `deleted?`, `cloneGroupId?`, `projectId?`, `reminder?`, `reminderAcknowledgedAt?`, `reminderSnoozedUntil?`, `tags?`
- **`RecurrenceRule`** — one of six shapes (`weekdays`, `interval`, `dayOfMonth`, `dayOfYear`, `weekdayOfMonth`, `intervalMonths`), each with its own parameters (e.g. `interval` + `anchorWeekday` for "every other Tuesday")
- **`Reminder`** — either `{ type: "at", date, time }` or `{ type: "before", minutes }`
- **`Project`** — `id`, `name`, `parentId?` (forms a tree), `sortOrder?`, `createdAt`, `updatedAt?`, `deleted?`

This model is intentionally JSON-friendly so the same shape can be written to files in Google Drive and consumed by future clients.

---

## Sorting & Grouping

Defined in `src/domain/taskSort.ts`:

- **`sortTasks(tasks)`** — due date ascending (nulls last) → priority ascending (1 first) → due time ascending (nulls last) → `createdAt` ascending as a final tie-breaker. The UI never sorts on its own; every list goes through this helper.
- **`groupTasksByDate(tasks)`** — buckets tasks into **Overdue**, **Today**, **Tomorrow**, the next 5 fixed days (always shown, even if empty), **Later** (grouped and sorted by date), and **No due date**.

---

## Natural-Language Title Parsing

`src/domain/dateParser.ts` parses trailing shortcuts out of the task title as you type (see the in-app Help page for the full list), for example:

```
Pay rent 1st of every month !!1 #Bills
Water plants every 3 days
Call mom !tomorrow 10:00
Team standup every mon, wed, fri at 09:00
```

Recognized tail tokens — date/time, recurrence, `!!1`–`!!4` priority, `!`-prefixed reminders, `#project` (or `#"multi word"`), and `@tag` — can appear in any order and are stripped from the visible title once parsed.

---

## Local Storage & Persistence

`src/services/localStorageService.ts` owns the JSON shape written to `localStorage` (key `niyamit.data.v2`): separate `activeTasks` / `completedTasks` / `deletedTasks` arrays, `activeProjects` / `deletedProjects`, and a derived `tags` list. It transparently migrates from older single-key and separate-key storage formats on first load. Every change is saved automatically; sync to Drive is opportunistic (on idle, on manual button click, on startup, or after conflict resolution), not on every keystroke.

---

## Google Drive Sync

`src/services/googleDriveService.ts` reads/writes a single `niyamit-data.json` file inside a `Niyamit` folder in the signed-in user's Drive (via the `drive.file` OAuth scope — the app can only see files it created). On sync it:

1. Downloads the remote file and compares it against the local data and the last-synced baseline (**three-way merge**).
2. Applies field-level merges automatically when only one side changed a given field.
3. Surfaces a **conflict dialog** when both local and remote changed the *same* field differently, letting you pick local or Drive per task.

Requires a `.env` with `VITE_GOOGLE_CLIENT_ID` (a Google OAuth 2.0 "Single-page application" client ID) — see the comments in `.env` for where to create one.

---

## Running the App

```bash
npm install
npm run dev       # start Vite dev server
npm run build     # production build (vite build only — does not type-check; see below)
npm run preview   # preview the production build
npm run deploy    # build + publish dist/ to GitHub Pages
```

---

## Testing

```bash
npm test              # run the full Vitest suite once
npm run test:watch    # watch mode
npm run test:coverage # run with coverage (v8 provider)
```

Tests use **Vitest + React Testing Library**, colocated next to the code they cover (`Component.tsx` next to `Component.test.tsx`), per common React/JS convention. `src/domain` and `src/services` — the platform-agnostic business logic — are held to an enforced coverage threshold (80% lines/statements/functions, 75% branches, configured in `vite.config.ts`); `src/App.tsx` and `src/components` have lighter smoke tests (render + key interactions) rather than exhaustive coverage.

Since `vite build` doesn't type-check (esbuild/swc strip types without checking them), run `npx tsc --noEmit` to catch type errors before relying on a green build.

---

## Next Steps

- Android and desktop clients reusing `src/domain/` and `src/services/` as-is
- Expanding UI-layer test coverage beyond smoke tests, if/when the component layer stabilizes
