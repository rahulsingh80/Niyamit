import React, { useEffect, useRef, useState, useCallback } from "react";
import { useGoogleLogin } from "@react-oauth/google";
import type { Task } from "@domain/taskTypes";
import { advanceRecurrence } from "@domain/dateParser";
import { loadTasks, saveTasks } from "@services/localStorageService";
import { exportTasksAsJson } from "@services/exportService";
import {
  downloadTasksFromDrive,
  getOrCreateTasksFileId,
  mergeTasksByUpdatedAt,
  mergeTasksThreeWay,
  uploadTasksToDrive,
  type MergeTasksResult,
} from "@services/googleDriveService";
import { TaskForm } from "@components/TaskForm";
import { TaskList } from "@components/TaskList";
import "./styles.css";

const TOKEN_KEY = "niyamit_google_token";
const TOKEN_EXPIRY_KEY = "niyamit_google_token_expiry";
const SYNC_BASELINE_KEY = "niyamit_last_synced_tasks";
const USER_IDLE_DELAY_MS = 15 * 1000;
const IDLE_SYNC_INTERVAL_MS = 60 * 1000;
const MAX_HISTORY = 50;

type ConflictChoice = "local" | "remote";

interface ConflictState {
  mergeResult: MergeTasksResult;
  selections: Record<string, ConflictChoice>;
}

function getValidToken(): string | null {
  const token = localStorage.getItem(TOKEN_KEY);
  const expiry = localStorage.getItem(TOKEN_EXPIRY_KEY);
  if (token && expiry && Date.now() < Number(expiry)) return token;
  return null;
}

function loadLastSyncedSnapshot(): Task[] | null {
  const raw = localStorage.getItem(SYNC_BASELINE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Task[]) : null;
  } catch {
    return null;
  }
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
  const [hasPendingChanges, setHasPendingChanges] = useState(false);
  const [isIdle, setIsIdle] = useState(false);
  const [conflictState, setConflictState] = useState<ConflictState | null>(null);
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null);

  // Undo/redo stacks store full task snapshots
  const [undoStack, setUndoStack] = useState<Task[][]>([]);
  const [redoStack, setRedoStack] = useState<Task[][]>([]);

  const tasksRef = useRef(tasks);
  const syncingRef = useRef(false);
  const pendingSyncAfterCurrentRef = useRef(false);
  const hasPendingChangesRef = useRef(false);
  const isIdleRef = useRef(false);
  const conflictStateRef = useRef<ConflictState | null>(null);
  const localRevisionRef = useRef(0);
  const lastSyncedSnapshotRef = useRef<Task[] | null>(loadLastSyncedSnapshot());
  const successTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const idleIntervalRef = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  useEffect(() => {
    conflictStateRef.current = conflictState;
  }, [conflictState]);

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

  function setPendingChanges(next: boolean) {
    hasPendingChangesRef.current = next;
    setHasPendingChanges(next);
  }

  function stopIdleIntervalSync() {
    clearInterval(idleIntervalRef.current);
  }

  function markActiveInteraction() {
    isIdleRef.current = false;
    setIsIdle(false);
    stopIdleIntervalSync();
    clearTimeout(idleTimerRef.current);
  }

  function startIdleCountdown() {
    clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      isIdleRef.current = true;
      setIsIdle(true);
      void runSync("idle-timeout");
      stopIdleIntervalSync();
      idleIntervalRef.current = setInterval(() => {
        void runSync("idle-interval");
      }, IDLE_SYNC_INTERVAL_MS);
    }, USER_IDLE_DELAY_MS);
  }

  function applyLocalChange(newTasks: Task[]) {
    localRevisionRef.current += 1;
    tasksRef.current = newTasks;
    setTasks(newTasks);
    setPendingChanges(true);
    markActiveInteraction();
    startIdleCountdown();
  }

  async function runSync(
    reason: "startup" | "idle-timeout" | "idle-interval" | "manual" | "queued" | "conflict-resolution",
    tokenFromLogin?: string,
  ) {
    if (syncingRef.current) {
      pendingSyncAfterCurrentRef.current = true;
      return;
    }
    if (conflictStateRef.current && reason !== "conflict-resolution") return;

    const token = tokenFromLogin || getValidToken();
    if (!token) return;

    syncingRef.current = true;
    try {
      setIsSyncing(true);

      const fileId = await getOrCreateTasksFileId(token);
      const remoteTasks = await downloadTasksFromDrive(token, fileId);
      const localRevisionAtMerge = localRevisionRef.current;
      const mergeResult =
        lastSyncedSnapshotRef.current
          ? mergeTasksThreeWay(
              lastSyncedSnapshotRef.current,
              tasksRef.current,
              remoteTasks,
            )
          : {
              mergedTasks: mergeTasksByUpdatedAt(tasksRef.current, remoteTasks),
              conflicts: [],
            };

      if (mergeResult.conflicts.length > 0) {
        const selections: Record<string, ConflictChoice> = {};
        for (const conflict of mergeResult.conflicts) {
          selections[conflict.taskId] = "local";
        }
        setConflictState({ mergeResult, selections });
        setSyncError("Sync conflicts detected. Please choose which changes to keep.");
        setPendingChanges(true);
        return;
      }

      await uploadTasksToDrive(token, fileId, mergeResult.mergedTasks);
      lastSyncedSnapshotRef.current = mergeResult.mergedTasks;
      localStorage.setItem(SYNC_BASELINE_KEY, JSON.stringify(mergeResult.mergedTasks));

      const newerLocalChangesExist = localRevisionRef.current !== localRevisionAtMerge;
      if (!newerLocalChangesExist) {
        tasksRef.current = mergeResult.mergedTasks;
        setTasks(mergeResult.mergedTasks);
        setPendingChanges(false);
      } else {
        setPendingChanges(true);
      }

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
        localStorage.removeItem(SYNC_BASELINE_KEY);
        lastSyncedSnapshotRef.current = null;
      }
    } finally {
      syncingRef.current = false;
      setIsSyncing(false);

      if (pendingSyncAfterCurrentRef.current && isIdleRef.current) {
        pendingSyncAfterCurrentRef.current = false;
        void runSync("queued");
      } else {
        pendingSyncAfterCurrentRef.current = false;
      }
    }
  }

  useEffect(() => {
    const token = getValidToken();
    if (token) {
      void runSync("startup", token);
    } else {
      setSyncError(
        "Not signed in to Google Drive. Click \u2018Sync to Drive\u2019 to connect.",
      );
    }
    startIdleCountdown();
    return () => {
      clearTimeout(successTimerRef.current);
      clearTimeout(highlightTimerRef.current);
      clearTimeout(idleTimerRef.current);
      clearInterval(idleIntervalRef.current);
    };
  }, []);

  const login = useGoogleLogin({
    scope: "https://www.googleapis.com/auth/drive.file",
    onSuccess: (tokenResponse) => {
      const expiryTime = Date.now() + tokenResponse.expires_in * 1000;
      localStorage.setItem(TOKEN_KEY, tokenResponse.access_token);
      localStorage.setItem(TOKEN_EXPIRY_KEY, expiryTime.toString());
      void runSync("manual", tokenResponse.access_token);
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
    applyLocalChange(newTasks);
    setIsFormOpen(false);
    setEditingTask(null);
  }

  function handleUpdateTask(updated: Task) {
    pushUndo(tasks);
    const newTasks = tasks.map((t) => (t.id === updated.id ? updated : t));
    applyLocalChange(newTasks);
    setEditingTask(null);
    setIsFormOpen(false);
  }

  function handleDeleteTask(id: string) {
    pushUndo(tasks);
    const nowIso = new Date().toISOString();
    const newTasks = tasks.map((t) =>
      t.id === id ? { ...t, deleted: true, updatedAt: nowIso } : t,
    );
    applyLocalChange(newTasks);
    setEditingTask(null);
    setIsFormOpen(false);
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

    applyLocalChange(newTasks);
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
    applyLocalChange(previousTasks);

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

  }

  function handleRedo() {
    if (redoStack.length === 0) return;
    const nextTasks = redoStack[redoStack.length - 1];

    setUndoStack((prev) => [...prev, tasks]);
    setRedoStack((prev) => prev.slice(0, -1));
    applyLocalChange(nextTasks);

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

  }

  function handleExport() {
    exportTasksAsJson(tasks);
  }

  function handleSyncButtonClick() {
    const token = getValidToken();
    if (token) {
      void runSync("manual", token);
      return;
    }
    login();
  }

  function updateConflictChoice(taskId: string, choice: ConflictChoice) {
    setConflictState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        selections: {
          ...prev.selections,
          [taskId]: choice,
        },
      };
    });
  }

  async function handleApplyConflictResolution() {
    if (!conflictState) return;
    const { mergeResult } = conflictState;

    const resolvedMap = new Map(mergeResult.mergedTasks.map((t) => [t.id, t]));
    for (const conflict of mergeResult.conflicts) {
      const choice = conflictState.selections[conflict.taskId] || "local";
      const chosenTask = choice === "local" ? conflict.localTask : conflict.remoteTask;
      if (chosenTask) {
        resolvedMap.set(conflict.taskId, chosenTask);
      } else {
        resolvedMap.delete(conflict.taskId);
      }
    }

    const resolvedTasks = Array.from(resolvedMap.values());
    setConflictState(null);
    applyLocalChange(resolvedTasks);
    await runSync("conflict-resolution");
  }

  const syncStatusLabel = isSyncing
    ? "Syncing"
    : syncError
      ? "Sync error"
      : hasPendingChanges
        ? "Sync pending"
        : "Synced";

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
            onClick={handleSyncButtonClick}
            disabled={isSyncing}
          >
            {isSyncing ? "Syncing\u2026" : "Sync to Drive"}
          </button>
          <span
            className={`sync-status ${isSyncing ? "active" : ""} ${syncError ? "warning" : hasPendingChanges ? "" : "success"}`}
          >
            <span className="sync-dot" aria-hidden="true" />
            {syncStatusLabel}
          </span>
        </div>
      </header>

      {syncError && (
        <div className="sync-error-banner">
          <span>{syncError}</span>
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

      {conflictState && (
        <div className="sync-conflict-backdrop" role="presentation">
          <div
            className="sync-conflict-modal card"
            role="dialog"
            aria-modal="true"
            aria-label="Sync conflicts"
          >
            <h3>Resolve sync conflicts</h3>
            <p className="sync-conflict-subtitle">
              We found {conflictState.mergeResult.conflicts.length} conflict(s). Choose
              whether to keep local or Drive changes for each task.
            </p>
            <div className="sync-conflict-list">
              {conflictState.mergeResult.conflicts.map((conflict) => (
                <div key={conflict.taskId} className="sync-conflict-item">
                  <div className="sync-conflict-main">
                    <strong>
                      {conflict.localTask?.title || conflict.remoteTask?.title || "Untitled task"}
                    </strong>
                    <span className="sync-conflict-fields">
                      Fields: {conflict.fields.join(", ") || "multiple"}
                    </span>
                  </div>
                  <div className="sync-conflict-actions">
                    <button
                      type="button"
                      className={conflictState.selections[conflict.taskId] === "local" ? "primary" : "secondary"}
                      onClick={() => updateConflictChoice(conflict.taskId, "local")}
                    >
                      Keep local
                    </button>
                    <button
                      type="button"
                      className={conflictState.selections[conflict.taskId] === "remote" ? "primary" : "secondary"}
                      onClick={() => updateConflictChoice(conflict.taskId, "remote")}
                    >
                      Keep Drive
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="sync-conflict-footer">
              <button type="button" className="secondary" onClick={() => setConflictState(null)}>
                Decide later
              </button>
              <button type="button" className="primary" onClick={handleApplyConflictResolution}>
                Apply choices and sync
              </button>
            </div>
          </div>
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
