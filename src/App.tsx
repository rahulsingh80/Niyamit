import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useGoogleLogin } from "@react-oauth/google";
import type { Task } from "@domain/taskTypes";
import type { Project } from "@domain/projectTypes";
import { getDescendantIds } from "@domain/projectTypes";
import { advanceRecurrence } from "@domain/dateParser";
import { loadAppData, saveAppData, type AppData } from "@services/localStorageService";
import { exportDataAsJson } from "@services/exportService";
import {
  downloadAppDataFromDrive,
  getOrCreateDataFileId,
  mergeAppData,
  uploadAppDataToDrive,
} from "@services/googleDriveService";
import { ProjectSidebar } from "@components/ProjectSidebar";
import { TaskList } from "@components/TaskList";
import "./styles.css";

const TOKEN_KEY = "niyamit_google_token";
const TOKEN_EXPIRY_KEY = "niyamit_google_token_expiry";
const SYNC_BASELINE_KEY = "niyamit_last_synced_data";
const USER_IDLE_DELAY_MS = 15 * 1000;
const IDLE_SYNC_INTERVAL_MS = 60 * 1000;
const MAX_HISTORY = 50;

type ConflictChoice = "local" | "remote";

interface ConflictState {
  mergeResult: { mergedData: AppData; conflicts: TaskConflict[] };
  selections: Record<string, ConflictChoice>;
}

type TaskConflict = import("@services/googleDriveService").TaskConflict;

function getValidToken(): string | null {
  const token = localStorage.getItem(TOKEN_KEY);
  const expiry = localStorage.getItem(TOKEN_EXPIRY_KEY);
  if (token && expiry && Date.now() < Number(expiry)) return token;
  return null;
}

function loadLastSyncedBaseline(): AppData | null {
  const raw = localStorage.getItem(SYNC_BASELINE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as AppData;
    }
    // Handle legacy format: bare Task[]
    if (Array.isArray(parsed)) return { tasks: parsed as Task[], projects: [] };
    return null;
  } catch {
    return null;
  }
}

function genId(): string {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

export const App: React.FC<{ initialTasks?: Task[] }> = ({ initialTasks }) => {
  const initialData = initialTasks ? { tasks: initialTasks, projects: [] } : loadAppData();
  const [tasks, setTasks] = useState<Task[]>(initialData.tasks);
  const [projects, setProjects] = useState<Project[]>(initialData.projects);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [showSyncSuccess, setShowSyncSuccess] = useState(false);
  const [hasPendingChanges, setHasPendingChanges] = useState(false);
  const [isIdle, setIsIdle] = useState(false);
  const [conflictState, setConflictState] = useState<ConflictState | null>(null);
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null);

  const [undoStack, setUndoStack] = useState<AppData[]>([]);
  const [redoStack, setRedoStack] = useState<AppData[]>([]);

  const tasksRef = useRef(tasks);
  const syncingRef = useRef(false);
  const pendingSyncAfterCurrentRef = useRef(false);
  const hasPendingChangesRef = useRef(false);
  const isIdleRef = useRef(false);
  const conflictStateRef = useRef<ConflictState | null>(null);
  const localRevisionRef = useRef(0);
  const lastSyncedBaselineRef = useRef<AppData | null>(loadLastSyncedBaseline());
  const projectsRef = useRef(projects);
  const successTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const idleIntervalRef = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(() => { tasksRef.current = tasks; }, [tasks]);
  useEffect(() => { projectsRef.current = projects; }, [projects]);
  useEffect(() => { conflictStateRef.current = conflictState; }, [conflictState]);
  useEffect(() => { saveAppData({ tasks, projects }); }, [tasks, projects]);

  const pushUndo = useCallback(() => {
    setUndoStack((prev) => {
      const next = [...prev, { tasks, projects }];
      if (next.length > MAX_HISTORY) next.shift();
      return next;
    });
    setRedoStack([]);
  }, [tasks, projects]);

  function flashHighlight(taskId: string) {
    clearTimeout(highlightTimerRef.current);
    setHighlightedTaskId(taskId);
    highlightTimerRef.current = setTimeout(() => setHighlightedTaskId(null), 1200);
  }

  // ── Sync helpers ──────────────────────────────────────
  function setPendingFlag(next: boolean) {
    hasPendingChangesRef.current = next;
    setHasPendingChanges(next);
  }
  function stopIdleIntervalSync() { clearInterval(idleIntervalRef.current); }
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
      idleIntervalRef.current = setInterval(() => void runSync("idle-interval"), IDLE_SYNC_INTERVAL_MS);
    }, USER_IDLE_DELAY_MS);
  }

  function applyLocalChange(newTasks: Task[], newProjects?: Project[]) {
    localRevisionRef.current += 1;
    tasksRef.current = newTasks;
    setTasks(newTasks);
    if (newProjects !== undefined) setProjects(newProjects);
    setPendingFlag(true);
    markActiveInteraction();
    startIdleCountdown();
  }

  // ── Sync ──────────────────────────────────────────────
  async function runSync(
    reason: "startup" | "idle-timeout" | "idle-interval" | "manual" | "queued" | "conflict-resolution",
    tokenFromLogin?: string,
  ) {
    if (syncingRef.current) { pendingSyncAfterCurrentRef.current = true; return; }
    if (conflictStateRef.current && reason !== "conflict-resolution") return;
    const token = tokenFromLogin || getValidToken();
    if (!token) return;

    syncingRef.current = true;
    try {
      setIsSyncing(true);
      const fileId = await getOrCreateDataFileId(token);
      const remoteData = await downloadAppDataFromDrive(token, fileId);
      const localRevisionAtMerge = localRevisionRef.current;
      const localData: AppData = { tasks: tasksRef.current, projects: projectsRef.current };

      const { mergedData, conflicts } = mergeAppData(
        lastSyncedBaselineRef.current,
        localData,
        remoteData,
      );

      if (conflicts.length > 0) {
        const selections: Record<string, ConflictChoice> = {};
        for (const c of conflicts) selections[c.taskId] = "local";
        setConflictState({ mergeResult: { mergedData, conflicts }, selections });
        setSyncError("Sync conflicts detected. Please choose which changes to keep.");
        setPendingFlag(true);
        return;
      }

      await uploadAppDataToDrive(token, fileId, mergedData);
      lastSyncedBaselineRef.current = mergedData;
      localStorage.setItem(SYNC_BASELINE_KEY, JSON.stringify(mergedData));

      if (localRevisionRef.current === localRevisionAtMerge) {
        tasksRef.current = mergedData.tasks;
        setTasks(mergedData.tasks);
        projectsRef.current = mergedData.projects;
        setProjects(mergedData.projects);
        setPendingFlag(false);
      } else {
        setPendingFlag(true);
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
        lastSyncedBaselineRef.current = null;
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
    if (token) void runSync("startup", token);
    else setSyncError("Not signed in to Google Drive. Click \u2018Sync to Drive\u2019 to connect.");
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
      localStorage.setItem(TOKEN_KEY, tokenResponse.access_token);
      localStorage.setItem(TOKEN_EXPIRY_KEY, (Date.now() + tokenResponse.expires_in * 1000).toString());
      void runSync("manual", tokenResponse.access_token);
    },
    onError: (error) => { console.error("Login Failed:", error); setSyncError("Google login failed."); },
  });

  // ── Task CRUD ─────────────────────────────────────────

  function resolveProjectFromTask(task: Task): { task: Task; newProject?: Project } {
    if (task.projectId?.startsWith("new:")) {
      const name = task.projectId.slice(4);
      const newProj: Project = { id: genId(), name, createdAt: new Date().toISOString() };
      return { task: { ...task, projectId: newProj.id }, newProject: newProj };
    }
    return { task };
  }

  function handleAddTask(task: Task) {
    pushUndo();
    const { task: resolved, newProject } = resolveProjectFromTask(task);
    const newProjects = newProject ? [...projects, newProject] : projects;
    applyLocalChange([...tasks, resolved], newProjects);
    setIsFormOpen(false);
    setEditingTask(null);
  }

  function handleUpdateTask(updated: Task) {
    pushUndo();
    const { task: resolved, newProject } = resolveProjectFromTask(updated);
    const original = tasks.find((t) => t.id === resolved.id);
    let newTasks: Task[];

    if (original?.cloneGroupId && resolved.title !== original.title) {
      const detached = { ...resolved, cloneGroupId: undefined };
      newTasks = tasks.map((t) => (t.id === resolved.id ? detached : t));
      cleanupSingletonCloneGroup(newTasks, original.cloneGroupId, resolved.id);
    } else if (original?.cloneGroupId) {
      newTasks = tasks.map((t) => {
        if (t.id === resolved.id) return resolved;
        if (t.cloneGroupId === original.cloneGroupId && !t.completed && !t.deleted) {
          return { ...t, notes: resolved.notes, dueDate: resolved.dueDate, dueTime: resolved.dueTime, recurrence: resolved.recurrence, priority: resolved.priority, updatedAt: resolved.updatedAt };
        }
        return t;
      });
    } else {
      newTasks = tasks.map((t) => (t.id === resolved.id ? resolved : t));
    }

    const newProjects = newProject ? [...projects, newProject] : projects;
    applyLocalChange(newTasks, newProjects);
    setEditingTask(null);
    setIsFormOpen(false);
  }

  function handleDeleteTask(id: string) {
    pushUndo();
    const nowIso = new Date().toISOString();
    applyLocalChange(tasks.map((t) => t.id === id ? { ...t, deleted: true, updatedAt: nowIso } : t));
    setEditingTask(null);
    setIsFormOpen(false);
  }

  function handleCompleteTask(id: string) {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    pushUndo();
    const nowIso = new Date().toISOString();

    const idsToComplete = new Set([id]);
    if (task.cloneGroupId) {
      for (const t of tasks) {
        if (t.cloneGroupId === task.cloneGroupId && !t.completed && !t.deleted)
          idsToComplete.add(t.id);
      }
    }

    let newTasks = tasks.map((t) => idsToComplete.has(t.id) ? { ...t, completed: true, updatedAt: nowIso } : t);

    const nextTasks: Task[] = [];
    for (const cid of idsToComplete) {
      const ct = tasks.find((t) => t.id === cid);
      if (ct?.recurrence && ct.dueDate) {
        nextTasks.push({
          id: genId(), title: ct.title, notes: ct.notes,
          dueDate: advanceRecurrence(ct.recurrence, ct.dueDate),
          dueTime: ct.dueTime, recurrence: ct.recurrence, priority: ct.priority,
          projectId: ct.projectId,
          createdAt: nowIso, updatedAt: nowIso, completed: false,
        });
      }
    }
    if (nextTasks.length > 0) newTasks = [...newTasks, ...nextTasks];

    if (editingTask && idsToComplete.has(editingTask.id)) { setEditingTask(null); setIsFormOpen(false); }
    applyLocalChange(newTasks);
  }

  // ── Task selection ────────────────────────────────────
  function handleSelectTask(id: string) {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    if (editingTask?.id === id) { setEditingTask(null); setIsFormOpen(false); }
    else { setEditingTask(task); setIsFormOpen(true); }
  }
  function handleCancelEdit() { setEditingTask(null); setIsFormOpen(false); }
  function handleOpenCreateForm() { setEditingTask(null); setIsFormOpen(true); }

  // ── Clone / Un-clone ──────────────────────────────────
  function handleCloneTask(id: string) {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    pushUndo();
    const nowIso = new Date().toISOString();
    const groupId = task.cloneGroupId || genId();
    const cloned: Task = {
      ...task, id: genId(), cloneGroupId: groupId,
      projectId: selectedProjectId ? task.projectId : task.projectId,
      createdAt: nowIso, updatedAt: nowIso, completed: false, deleted: undefined,
    };
    const newTasks = tasks.map((t) => t.id === id ? { ...t, cloneGroupId: groupId, updatedAt: nowIso } : t);
    newTasks.push(cloned);
    applyLocalChange(newTasks);
  }

  function handleUncloneTask(id: string) {
    const task = tasks.find((t) => t.id === id);
    if (!task?.cloneGroupId) return;
    pushUndo();
    const nowIso = new Date().toISOString();
    const groupId = task.cloneGroupId;
    const newTasks = tasks.map((t) => t.id === id ? { ...t, cloneGroupId: undefined, updatedAt: nowIso } : t);
    cleanupSingletonCloneGroup(newTasks, groupId, id);
    applyLocalChange(newTasks);
    if (editingTask?.id === id) { const u = newTasks.find((t) => t.id === id); if (u) setEditingTask(u); }
  }

  function cleanupSingletonCloneGroup(taskList: Task[], groupId: string, excludeId: string) {
    const remaining = taskList.filter((t) => t.cloneGroupId === groupId && t.id !== excludeId && !t.completed && !t.deleted);
    if (remaining.length === 1) {
      const idx = taskList.findIndex((t) => t.id === remaining[0].id);
      if (idx !== -1) taskList[idx] = { ...taskList[idx], cloneGroupId: undefined };
    }
  }

  // ── Project CRUD ──────────────────────────────────────
  const activeProjects = projects.filter((p) => !p.deleted);

  function isProjectNameTaken(name: string, excludeId?: string): boolean {
    return activeProjects.some(
      (p) => p.name.toLowerCase() === name.toLowerCase() && p.id !== excludeId,
    );
  }

  function handleCreateProject(name: string, parentId?: string) {
    if (isProjectNameTaken(name)) return;
    pushUndo();
    const nowIso = new Date().toISOString();
    const siblings = activeProjects.filter((p) => (p.parentId || undefined) === parentId);
    const maxOrder = siblings.reduce((m, p) => Math.max(m, p.sortOrder ?? 0), 0);
    const newProject: Project = { id: genId(), name, parentId, sortOrder: maxOrder + 1, createdAt: nowIso, updatedAt: nowIso };
    applyLocalChange(tasks, [...projects, newProject]);
  }

  function handleRenameProject(id: string, newName: string) {
    if (isProjectNameTaken(newName, id)) return;
    pushUndo();
    const nowIso = new Date().toISOString();
    applyLocalChange(tasks, projects.map((p) => p.id === id ? { ...p, name: newName, updatedAt: nowIso } : p));
  }

  function handleDeleteProject(id: string) {
    pushUndo();
    const nowIso = new Date().toISOString();
    const idsToDelete = new Set(getDescendantIds(id, projects));
    const newProjects = projects.map((p) => idsToDelete.has(p.id) ? { ...p, deleted: true, updatedAt: nowIso } : p);
    const newTasks = tasks.map((t) => t.projectId && idsToDelete.has(t.projectId) ? { ...t, projectId: undefined, updatedAt: nowIso } : t);
    applyLocalChange(newTasks, newProjects);
    if (selectedProjectId && idsToDelete.has(selectedProjectId)) setSelectedProjectId(null);
  }

  function handleMoveTaskToProject(taskId: string, projectId: string) {
    pushUndo();
    const nowIso = new Date().toISOString();
    applyLocalChange(tasks.map((t) => t.id === taskId ? { ...t, projectId, updatedAt: nowIso } : t));
  }

  function handleMoveProject(id: string, newParentId: string | undefined) {
    pushUndo();
    const nowIso = new Date().toISOString();
    const siblings = activeProjects.filter((p) => (p.parentId || undefined) === newParentId && p.id !== id);
    const maxOrder = siblings.reduce((m, p) => Math.max(m, p.sortOrder ?? 0), 0);
    applyLocalChange(tasks, projects.map((p) =>
      p.id === id ? { ...p, parentId: newParentId, sortOrder: maxOrder + 1, updatedAt: nowIso } : p,
    ));
  }

  function handleReorderProject(id: string, direction: "up" | "down") {
    const project = activeProjects.find((p) => p.id === id);
    if (!project) return;
    const siblings = activeProjects
      .filter((p) => (p.parentId || undefined) === (project.parentId || undefined))
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name));
    const idx = siblings.findIndex((p) => p.id === id);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= siblings.length) return;

    pushUndo();
    const nowIso = new Date().toISOString();
    const a = siblings[idx];
    const b = siblings[swapIdx];
    const aOrder = a.sortOrder ?? idx;
    const bOrder = b.sortOrder ?? swapIdx;
    applyLocalChange(tasks, projects.map((p) => {
      if (p.id === a.id) return { ...p, sortOrder: bOrder, updatedAt: nowIso };
      if (p.id === b.id) return { ...p, sortOrder: aOrder, updatedAt: nowIso };
      return p;
    }));
  }

  // ── Undo / Redo ───────────────────────────────────────
  function handleUndo() {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setRedoStack((r) => [...r, { tasks, projects }]);
    setUndoStack((u) => u.slice(0, -1));
    applyLocalChange(prev.tasks, prev.projects);
    const revertedId = findRevertedTaskId(tasks, prev.tasks);
    if (revertedId) flashHighlight(revertedId);
    if (editingTask) {
      const still = prev.tasks.find((t) => t.id === editingTask.id && !t.completed && !t.deleted);
      if (!still) { setEditingTask(null); setIsFormOpen(false); } else setEditingTask(still);
    }
  }

  function handleRedo() {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setUndoStack((u) => [...u, { tasks, projects }]);
    setRedoStack((r) => r.slice(0, -1));
    applyLocalChange(next.tasks, next.projects);
    const revertedId = findRevertedTaskId(tasks, next.tasks);
    if (revertedId) flashHighlight(revertedId);
    if (editingTask) {
      const still = next.tasks.find((t) => t.id === editingTask.id && !t.completed && !t.deleted);
      if (!still) { setEditingTask(null); setIsFormOpen(false); } else setEditingTask(still);
    }
  }

  function handleExport() { exportDataAsJson(tasks, projects); }
  function handleSyncButtonClick() {
    const token = getValidToken();
    if (token) { void runSync("manual", token); return; }
    login();
  }

  function updateConflictChoice(taskId: string, choice: ConflictChoice) {
    setConflictState((prev) => prev ? { ...prev, selections: { ...prev.selections, [taskId]: choice } } : prev);
  }

  async function handleApplyConflictResolution() {
    if (!conflictState) return;
    const resolvedMap = new Map(conflictState.mergeResult.mergedData.tasks.map((t) => [t.id, t]));
    for (const c of conflictState.mergeResult.conflicts) {
      const chosen = (conflictState.selections[c.taskId] || "local") === "local" ? c.localTask : c.remoteTask;
      if (chosen) resolvedMap.set(c.taskId, chosen); else resolvedMap.delete(c.taskId);
    }
    setConflictState(null);
    applyLocalChange(Array.from(resolvedMap.values()), conflictState.mergeResult.mergedData.projects);
    await runSync("conflict-resolution");
  }

  // ── Filtered tasks for project view ───────────────────
  const filteredTasks = useMemo(() => {
    if (!selectedProjectId) return tasks;
    const ids = new Set(getDescendantIds(selectedProjectId, projects));
    return tasks.filter((t) => t.projectId && ids.has(t.projectId));
  }, [tasks, projects, selectedProjectId]);

  const selectedProject = selectedProjectId
    ? projects.find((p) => p.id === selectedProjectId && !p.deleted) ?? null
    : null;

  const syncStatusLabel = isSyncing ? "Syncing" : syncError ? "Sync error" : hasPendingChanges ? "Sync pending" : "Synced";

  // ── Render ────────────────────────────────────────────
  return (
    <div className="app-root">
      <header className="app-header">
        <div>
          <h1>Niyamit</h1>
          <p className="subtitle">Offline-first tasks. JSON-backed. Google Drive sync ready.</p>
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <div className="undo-redo-group">
            <button type="button" className="icon-btn" onClick={handleUndo} disabled={undoStack.length === 0} aria-label="Undo" title="Undo">↩</button>
            <button type="button" className="icon-btn" onClick={handleRedo} disabled={redoStack.length === 0} aria-label="Redo" title="Redo">↪</button>
          </div>
          <button type="button" className="secondary" onClick={handleExport}>Export as JSON</button>
          <button type="button" className="secondary" onClick={handleSyncButtonClick} disabled={isSyncing}>
            {isSyncing ? "Syncing\u2026" : "Sync to Drive"}
          </button>
          <span className={`sync-status ${isSyncing ? "active" : ""} ${syncError ? "warning" : hasPendingChanges ? "" : "success"}`}>
            <span className="sync-dot" aria-hidden="true" />
            {syncStatusLabel}
          </span>
        </div>
      </header>

      {syncError && (
        <div className="sync-error-banner">
          <span>{syncError}</span>
          <button type="button" className="sync-error-dismiss" onClick={() => setSyncError(null)} aria-label="Dismiss error">✕</button>
        </div>
      )}

      {conflictState && (
        <div className="sync-conflict-backdrop" role="presentation">
          <div className="sync-conflict-modal card" role="dialog" aria-modal="true" aria-label="Sync conflicts">
            <h3>Resolve sync conflicts</h3>
            <p className="sync-conflict-subtitle">
              We found {conflictState.mergeResult.conflicts.length} conflict(s). Choose whether to keep local or Drive changes for each task.
            </p>
            <div className="sync-conflict-list">
              {conflictState.mergeResult.conflicts.map((conflict) => (
                <div key={conflict.taskId} className="sync-conflict-item">
                  <div className="sync-conflict-main">
                    <strong>{conflict.localTask?.title || conflict.remoteTask?.title || "Untitled task"}</strong>
                    <span className="sync-conflict-fields">Fields: {conflict.fields.join(", ") || "multiple"}</span>
                  </div>
                  <div className="sync-conflict-actions">
                    <button type="button" className={conflictState.selections[conflict.taskId] === "local" ? "primary" : "secondary"} onClick={() => updateConflictChoice(conflict.taskId, "local")}>Keep local</button>
                    <button type="button" className={conflictState.selections[conflict.taskId] === "remote" ? "primary" : "secondary"} onClick={() => updateConflictChoice(conflict.taskId, "remote")}>Keep Drive</button>
                  </div>
                </div>
              ))}
            </div>
            <div className="sync-conflict-footer">
              <button type="button" className="secondary" onClick={() => setConflictState(null)}>Decide later</button>
              <button type="button" className="primary" onClick={handleApplyConflictResolution}>Apply choices and sync</button>
            </div>
          </div>
        </div>
      )}

      <main className="app-main layout-sidebar">
        <ProjectSidebar
          projects={projects}
          allProjects={projects}
          selectedProjectId={selectedProjectId}
          isFormOpen={isFormOpen}
          editingTask={editingTask}
          onSelectProject={setSelectedProjectId}
          onCreateProject={handleCreateProject}
          onRenameProject={handleRenameProject}
          onDeleteProject={handleDeleteProject}
          onMoveTaskToProject={handleMoveTaskToProject}
          onMoveProject={handleMoveProject}
          onReorderProject={handleReorderProject}
          onOpenCreateForm={handleOpenCreateForm}
          onCancelEdit={handleCancelEdit}
          onAddTask={handleAddTask}
          onUpdateTask={handleUpdateTask}
          onDeleteTask={handleDeleteTask}
        />

        <div className="content-area">
          {selectedProject && (
            <div className="project-view-header">
              <h2>{selectedProject.name}</h2>
              <span className="task-count">
                {filteredTasks.filter((t) => !t.completed && !t.deleted).length}
              </span>
            </div>
          )}
          <TaskList
            tasks={filteredTasks}
            onCompleteTask={handleCompleteTask}
            onSelectTask={handleSelectTask}
            onCloneTask={handleCloneTask}
            onUncloneTask={handleUncloneTask}
            selectedTaskId={editingTask?.id}
            highlightedTaskId={highlightedTaskId}
            projects={projects}
          />
        </div>
      </main>

      <footer className="app-footer">
        <small>Data is currently stored in your browser&apos;s local storage. You can manually sync JSON files to your Google Drive.</small>
      </footer>
    </div>
  );
};

function findRevertedTaskId(oldTasks: Task[], newTasks: Task[]): string | null {
  const oldMap = new Map(oldTasks.map((t) => [t.id, t]));
  const newMap = new Map(newTasks.map((t) => [t.id, t]));
  for (const [id, newT] of newMap) {
    const oldT = oldMap.get(id);
    if (!oldT) continue;
    if ((oldT.completed && !newT.completed) || (oldT.deleted && !newT.deleted)) return id;
  }
  for (const [id, newT] of newMap) {
    const oldT = oldMap.get(id);
    if (!oldT) continue;
    if ((!oldT.completed && newT.completed) || (!oldT.deleted && newT.deleted)) return id;
  }
  for (const [id, newT] of newMap) {
    const oldT = oldMap.get(id);
    if (!oldT) continue;
    if (JSON.stringify(oldT) !== JSON.stringify(newT)) return id;
  }
  for (const [id] of newMap) {
    if (!oldMap.has(id)) return id;
  }
  return null;
}
