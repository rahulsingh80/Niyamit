# Niyamit – Offline-first Task Manager (Web)

Niyamit is a lightweight, task manager. The core idea is that **data lives as JSON files**, ideally in **Google Drive**, and all clients share a **common TypeScript data model and logic**.

This first iteration is a **React + TypeScript web app** that:

- **Adds tasks** with title, notes, due date, and priority
- **Sorts tasks** by the specified rules
- **Persists tasks** in browser local storage (offline-first)
- **Exports tasks** as a JSON file for backup

Later iterations can add:

- Google Drive REST API sync (read/write JSON task files)
- Android client
- Desktop client

---

## Project Structure

- `index.html` – Minimal HTML shell with `#root` where the React app mounts
- `src/main.tsx` – React entry point (creates root and renders `App`)
- `src/App.tsx` – Top-level application component and layout
- `src/styles.css` – Basic modern UI styling
- `src/domain/taskTypes.ts` – **Shared task data model** (TypeScript types)
- `src/domain/taskSort.ts` – **Shared sorting logic** for tasks
- `src/components/TaskForm.tsx` – Form to create new tasks
- `src/components/TaskList.tsx` – Task list, using shared sorting logic
- `src/services/localStorageService.ts` – `loadTasks` / `saveTasks` (storage abstraction)
- `src/services/exportService.ts` – JSON export / download helper
- `tsconfig.json` – TypeScript compiler options and path aliases
- `package.json` – Placeholder Node project metadata and scripts

The **domain** and **services** folders are designed to be reused across other platforms (e.g. React Native, desktop), so all core behavior (data shapes, sorting, persistence abstraction) is not tied to React.

---

## Task Data Model

Defined in `src/domain/taskTypes.ts`:

- **`Task`**
  - `id: string` – Unique task ID (UUID-like)
  - `title: string` – Task title
  - `notes?: string` – Optional longer description
  - `dueDate: string | null` – ISO date string `YYYY-MM-DD` or `null` for no due date
  - `priority: 1 | 2 | 3 | 4` – Priority (4 is highest)
  - `createdAt: string` – ISO datetime string when the task was created
  - `completed: boolean` – Whether the task is completed

This model is intentionally simple and JSON-friendly so the same shape can be written to files in Google Drive and consumed by future clients.

---

## Sorting Logic

Defined in `src/domain/taskSort.ts` as `sortTasks(tasks: Task[]): Task[]`.

Sorting rules:

1. **Due date ascending** (earlier dates first)
2. **Null / missing due dates at the bottom**
3. **Priority descending** (4 > 3 > 2 > 1)
4. **CreatedAt ascending** (older tasks first when other fields are equal)

The React UI never sorts on its own; it always calls the shared `sortTasks` helper, so this logic can be reused across platforms.

---

## UI Overview

### Task Form

Implemented in `src/components/TaskForm.tsx`:

- Fields:
  - Title (required)
  - Notes (optional)
  - Due date (HTML `type="date"`)
  - Priority (select between P1–P4, with P4 as highest)
- On submit:
  - Builds a `Task` object
  - Generates an ID
  - Sets `createdAt` to the current ISO datetime
  - Normalizes `dueDate` to `string | null`
  - Calls `onAdd(task)` (passed from `App`)

### Task List

Implemented in `src/components/TaskList.tsx`:

- Accepts `tasks: Task[]` as props
- Uses `sortTasks` from `src/domain/taskSort.ts`
- Renders a clean list with:
  - Title and notes
  - Priority pill (`P1`–`P4`)
  - Due date (or “No due date”)
  - Created-at timestamp (localized)

---

## Local Storage Service

Implemented in `src/services/localStorageService.ts`:

- **`loadTasks(): Task[]`**
  - Reads from `window.localStorage` using key `niyamit.tasks.v1`
  - Parses JSON into `Task[]`
  - Returns `[]` if data is missing or invalid
  - Normalizes `dueDate` to `null` when absent
- **`saveTasks(tasks: Task[]): void`**
  - Stringifies the array and writes to local storage
  - Swallows errors (you could add logging/UX hooks later)

In `App.tsx`, tasks are loaded on initial render and saved whenever the tasks array changes.

---

## Export / Backup Feature

Implemented in `src/services/exportService.ts` as `exportTasksAsJson(tasks, filename?)`:

1. Converts the `Task[]` array to a **pretty-printed JSON string**
2. Wraps it in a **`Blob`** with `application/json` MIME type
3. Creates an **object URL** for the blob
4. Creates a temporary `<a>` element, sets `href` and `download`
5. Programmatically clicks the link to trigger a **download**
6. Cleans up the link and revokes the object URL

`App.tsx` wires this to the **“Export as JSON”** button in the header.

---

## Offline-First Behavior

- All data is stored in **local storage** and kept entirely on the client
- The app bootstraps from local storage if available
- No network calls are required for the current iteration

This fits the future direction where:

- Tasks are still JSON
- A sync layer will read/write the same JSON structure to files in Google Drive

---

## Google Drive Integration (Future Iteration)

You can later add a dedicated sync service, for example:

- `src/services/googleDriveService.ts`
  - `loadFromDrive(): Promise<Task[]>`
  - `saveToDrive(tasks: Task[]): Promise<void>`

That service would:

- Use the **Google Drive REST API**
- Authenticate the user (OAuth 2)
- Read/write a JSON file (e.g. `niyamit-tasks.json`) in the user’s Drive
- Merge remote and local changes, then update local storage

All UI components can remain mostly unchanged because they already depend on the shared domain types and in-memory task list.

---

## Running the App

This repository intentionally avoids pinning dependency versions because your environment currently lacks Node/npm. To run this as a real React app:

1. **Initialize a bundler** (recommended: Vite with React + TypeScript)
2. Wire it to use:
   - `index.html` as the HTML shell
   - `src/main.tsx` as the entry point
3. Install dependencies:
   - `react`
   - `react-dom`
   - `typescript`
   - Your chosen bundler (e.g. `vite`)
4. Configure dev and build scripts in `package.json`.

For example, with Vite:

```bash
npm install react react-dom typescript vite @types/react @types/react-dom
```

Then configure `vite.config` to point to `index.html` and `src/main.tsx`.

---

## Next Steps

- Add Google authentication and Drive file sync
- Implement task completion and filters
- Add labels / projects and advanced filtering
- Build Android and desktop clients that reuse:
  - `src/domain/taskTypes.ts`
  - `src/domain/taskSort.ts`
  - Storage + sync abstractions

