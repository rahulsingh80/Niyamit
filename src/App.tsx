import React, { useEffect, useRef, useState, useCallback } from "react";
import { useGoogleLogin } from "@react-oauth/google";
import type { Task } from "@domain/taskTypes";
import { advanceRecurrence } from "@domain/dateParser";
import { loadTasks, saveTasks } from "@services/localStorageService";
import { exportTasksAsJson } from "@services/exportService";
import { syncTasksWithDrive } from "@services/googleDriveService";
import { TaskForm } from "@components/TaskForm";
import { TaskList } from "@components/TaskList";
import "./styles.css";

const TOKEN_KEY = "niyamit_google_token";
const TOKEN_EXPIRY_KEY = "niyamit_google_token_expiry";
const SYNC_INTERVAL_MS = 5 * 60 * 1000;
const MAX_HISTORY = 50;

function getValidToken(): string | null {
  const token = localStorage.getItem(TOKEN_KEY);
  const expiry = localStorage.getItem(TOKEN_EXPIRY_KEY);
  if (token && expiry && Date.now() < Number(expiry)) return token;
  return null;
}

export const App: React.FC<{ initialTasks?: Task[] }> = ({ initialTasks }) => {
  const [tasks, setTasks] = useState<Task[]>(() => {
    if (initialTasks) return initialTasks;
    return loadTasks();
  });
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [showSyncSuccess, setShowSyncSuccess] = useState(false);
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null);

  // Undo/redo stacks store full task snapshots
  const [undoStack, setUndoStack] = useState<Task[][]>([]);
  const [redoStack, setRedoStack] = useState<Task[][]>([]);

  const tasksRef = useRef(tasks);
  const syncingRef = useRef(false);
  const successTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  useEffect(() => {
    saveTasks(tasks);
  }, [tasks]);

  // Push current state onto undo stack before mutating
  const pushUndo = useCallback((currentTasks: Task[]) => {
    setUndoStack((prev) => {
      const next = [...prev, currentTasks];
      if (next.length > MAX_HISTORY) next.shift();
      return next;
    });
    setRedoStack([]);
  }, []);

  function flashHighlight(taskId: string) {
    clearTimeout(highlightTimerRef.current);
    setHighlightedTaskId(taskId);
    highlightTimerRef.current = setTimeout(() => setHighlightedTaskId(null), 1200);
  }

  // ── Sync ──────────────────────────────────────────────

  async function syncWithDrive(token: string, currentTasks: Task[]) {
    if (syncingRef.current) return;
    syncingRef.current = true;
    try {
      setIsSyncing(true);
      const mergedTasks = await syncTasksWithDrive(token, currentTasks);
      setTasks(mergedTasks);
      setSyncError(null);
      setShowSyncSuccess(true);
      clearTimeout(successTimerRef.current);
      successTimerRef.current = setTimeout(() => setShowSyncSuccess(false), 3000);
    } catch (error: any) {
      console.error("Error syncing to drive:", error);
      setSyncError(error.message || "Unknown error");
      if (error.message?.includes("401") || error.message?.includes("403")) {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(TOKEN_EXPIRY_KEY);
      }
    } finally {
      syncingRef.current = false;
      setIsSyncing(false);
    }
  }

  function trySyncIfAuthenticated(currentTasks: Task[]) {
    const token = getValidToken();
    if (token) syncWithDrive(token, currentTasks);
  }

  useEffect(() => {
    const token = getValidToken();
    if (token) {
      syncWithDrive(token, tasksRef.current);
    } else {
      setSyncError(
        "Not signed in to Google Drive. Click \u2018Sync to Drive\u2019 to connect.",
      );
    }
    const id = setInterval(() => {
      trySyncIfAuthenticated(tasksRef.current);
    }, SYNC_INTERVAL_MS);
    return () => {
      clearInterval(id);
      clearTimeout(successTimerRef.current);
      clearTimeout(highlightTimerRef.current);
    };
  }, []);

  const login = useGoogleLogin({
    scope: "https://www.googleapis.com/auth/drive.file",
    onSuccess: (tokenResponse) => {
      const expiryTime = Date.now() + tokenResponse.expires_in * 1000;
      localStorage.setItem(TOKEN_KEY, tokenResponse.access_token);
      localStorage.setItem(TOKEN_EXPIRY_KEY, expiryTime.toString());
      syncWithDrive(tokenResponse.access_token, tasksRef.current);
    },
    onError: (error) => {
      console.error("Login Failed:", error);
      setSyncError("Google login failed.");
    },
  });

  // ── Task CRUD ─────────────────────────────────────────

  function handleAddTask(task: Task) {
    pushUndo(tasks);
    const newTasks = [...tasks, task];
    setTasks(newTasks);
    setIsFormOpen(false);
    setEditingTask(null);
    trySyncIfAuthenticated(newTasks);
  }

  function handleUpdateTask(updated: Task) {
    pushUndo(tasks);
    const newTasks = tasks.map((t) => (t.id === updated.id ? updated : t));
    setTasks(newTasks);
    setEditingTask(null);
    setIsFormOpen(false);
    trySyncIfAuthenticated(newTasks);
  }

  function handleDeleteTask(id: string) {
    pushUndo(tasks);
    const nowIso = new Date().toISOString();
    const newTasks = tasks.map((t) =>
      t.id === id ? { ...t, deleted: true, updatedAt: nowIso } : t,
    );
    setTasks(newTasks);
    setEditingTask(null);
    setIsFormOpen(false);
    trySyncIfAuthenticated(newTasks);
  }

  function handleCompleteTask(id: string) {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;

    pushUndo(tasks);

    const nowIso = new Date().toISOString();
    let newTasks = tasks.map((t) =>
      t.id === id ? { ...t, completed: true, updatedAt: nowIso } : t,
    );

    if (task.recurrence && task.dueDate) {
      const nextDate = advanceRecurrence(task.recurrence, task.dueDate);
      const nextTask: Task = {
        id: crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`,
        title: task.title,
        notes: task.notes,
        dueDate: nextDate,
        dueTime: task.dueTime,
        recurrence: task.recurrence,
        priority: task.priority,
        createdAt: nowIso,
        updatedAt: nowIso,
        completed: false,
      };
      newTasks = [...newTasks, nextTask];
    }

    // If we were editing this task, close the form
    if (editingTask?.id === id) {
      setEditingTask(null);
      setIsFormOpen(false);
    }

    setTasks(newTasks);
    trySyncIfAuthenticated(newTasks);
  }

  // ── Task selection ────────────────────────────────────

  function handleSelectTask(id: string) {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;

    if (editingTask?.id === id) {
      setEditingTask(null);
      setIsFormOpen(false);
    } else {
      setEditingTask(task);
      setIsFormOpen(true);
    }
  }

  function handleCancelEdit() {
    setEditingTask(null);
    setIsFormOpen(false);
  }

  function handleOpenCreateForm() {
    setEditingTask(null);
    setIsFormOpen(true);
  }

  // ── Undo / Redo ───────────────────────────────────────

  function handleUndo() {
    if (undoStack.length === 0) return;
    const previousTasks = undoStack[undoStack.length - 1];

    setRedoStack((prev) => [...prev, tasks]);
    setUndoStack((prev) => prev.slice(0, -1));
    setTasks(previousTasks);

    // Find a task that was reverted and flash it
    const revertedId = findRevertedTaskId(tasks, previousTasks);
    if (revertedId) flashHighlight(revertedId);

    // Close edit form if the task we were editing is gone or changed
    if (editingTask) {
      const stillExists = previousTasks.find(
        (t) => t.id === editingTask.id && !t.completed && !t.deleted,
      );
      if (!stillExists) {
        setEditingTask(null);
        setIsFormOpen(false);
      } else {
        setEditingTask(stillExists);
      }
    }

    trySyncIfAuthenticated(previousTasks);
  }

  function handleRedo() {
    if (redoStack.length === 0) return;
    const nextTasks = redoStack[redoStack.length - 1];

    setUndoStack((prev) => [...prev, tasks]);
    setRedoStack((prev) => prev.slice(0, -1));
    setTasks(nextTasks);

    const revertedId = findRevertedTaskId(tasks, nextTasks);
    if (revertedId) flashHighlight(revertedId);

    if (editingTask) {
      const stillExists = nextTasks.find(
        (t) => t.id === editingTask.id && !t.completed && !t.deleted,
      );
      if (!stillExists) {
        setEditingTask(null);
        setIsFormOpen(false);
      } else {
        setEditingTask(stillExists);
      }
    }

    trySyncIfAuthenticated(nextTasks);
  }

  function handleExport() {
    exportTasksAsJson(tasks);
  }

  const panelTitle = editingTask ? "Update Task" : "Create Task";

  return (
    <div className="app-root">
      <header className="app-header">
        <div>
          <h1>Niyamit</h1>
          <p className="subtitle">
            Offline-first tasks. JSON-backed. Google Drive sync ready.
          </p>
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <div className="undo-redo-group">
            <button
              type="button"
              className="icon-btn"
              onClick={handleUndo}
              disabled={undoStack.length === 0}
              aria-label="Undo"
              title="Undo"
            >
              ↩
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={handleRedo}
              disabled={redoStack.length === 0}
              aria-label="Redo"
              title="Redo"
            >
              ↪
            </button>
          </div>
          <button type="button" className="secondary" onClick={handleExport}>
            Export as JSON
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => login()}
            disabled={isSyncing}
          >
            {isSyncing ? "Syncing\u2026" : "Sync to Drive"}
          </button>
          {showSyncSuccess && !isSyncing && (
            <span className="sync-status success">Synced</span>
          )}
        </div>
      </header>

      {syncError && (
        <div className="sync-error-banner">
          <span>Sync failed: {syncError}</span>
          <button
            type="button"
            className="sync-error-dismiss"
            onClick={() => setSyncError(null)}
            aria-label="Dismiss error"
          >
            ✕
          </button>
        </div>
      )}

      <main
        className={`app-main ${isFormOpen ? "layout-split" : "layout-centered"}`}
      >
        {isFormOpen ? (
          <>
            <div className="form-panel card">
              <div className="panel-header">
                <h2>{panelTitle}</h2>
                <button
                  type="button"
                  className="close-btn"
                  onClick={handleCancelEdit}
                  aria-label="Close form"
                >
                  ✕
                </button>
              </div>
              <TaskForm
                key={editingTask?.id ?? "__create__"}
                onAdd={handleAddTask}
                editingTask={editingTask}
                onUpdate={handleUpdateTask}
                onDelete={handleDeleteTask}
                onCancelEdit={handleCancelEdit}
              />
            </div>
            <TaskList
              tasks={tasks}
              onCompleteTask={handleCompleteTask}
              onSelectTask={handleSelectTask}
              selectedTaskId={editingTask?.id}
              highlightedTaskId={highlightedTaskId}
            />
          </>
        ) : (
          <>
            <button
              type="button"
              className="primary create-task-btn"
              onClick={handleOpenCreateForm}
            >
              + Create Task
            </button>
            <div className="list-centered">
              <TaskList
                tasks={tasks}
                onCompleteTask={handleCompleteTask}
                onSelectTask={handleSelectTask}
                highlightedTaskId={highlightedTaskId}
              />
            </div>
          </>
        )}
      </main>

      <footer className="app-footer">
        <small>
          Data is currently stored in your browser&apos;s local storage. You can
          manually sync JSON files to your Google Drive.
        </small>
      </footer>
    </div>
  );
};

/**
 * Find the id of a task that meaningfully changed between two snapshots,
 * so we can highlight it after undo/redo.
 */
function findRevertedTaskId(
  oldTasks: Task[],
  newTasks: Task[],
): string | null {
  const oldMap = new Map(oldTasks.map((t) => [t.id, t]));
  const newMap = new Map(newTasks.map((t) => [t.id, t]));

  // Task that was completed/deleted and is now active again
  for (const [id, newT] of newMap) {
    const oldT = oldMap.get(id);
    if (!oldT) continue;
    if ((oldT.completed && !newT.completed) || (oldT.deleted && !newT.deleted)) {
      return id;
    }
  }

  // Task that was active and is now completed/deleted (redo case)
  for (const [id, newT] of newMap) {
    const oldT = oldMap.get(id);
    if (!oldT) continue;
    if ((!oldT.completed && newT.completed) || (!oldT.deleted && newT.deleted)) {
      return id;
    }
  }

  // Any field changed
  for (const [id, newT] of newMap) {
    const oldT = oldMap.get(id);
    if (!oldT) continue;
    if (JSON.stringify(oldT) !== JSON.stringify(newT)) return id;
  }

  // Task removed (existed in old, not in new) — can't highlight
  // Task added (exists in new, not in old)
  for (const [id] of newMap) {
    if (!oldMap.has(id)) return id;
  }

  return null;
}
