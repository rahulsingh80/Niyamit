import type { Task } from "@domain/taskTypes";
import type { Project } from "@domain/projectTypes";

export interface AppData {
  tasks: Task[];
  projects: Project[];
}

/** JSON file format: separate sections for active, completed, deleted tasks, projects, and tags. */
export interface SerializedAppData {
  activeTasks: Task[];
  completedTasks: Task[];
  deletedTasks: Task[];
  projects: Project[];
  tags: string[];
}

const DATA_KEY = "niyamit.data.v2";

// Legacy keys for one-time migration
const LEGACY_TASKS_KEY = "niyamit.tasks.v1";
const LEGACY_PROJECTS_KEY = "niyamit.projects.v1";
const LEGACY_DATA_KEY_V1 = "niyamit.data.v1";

function normalizeTasks(tasks: unknown[]): Task[] {
  return (tasks as Task[]).map((task) => ({
    ...task,
    dueDate: task.dueDate ?? null,
    dueTime: task.dueTime || undefined,
    recurrence: task.recurrence || undefined,
    completed: task.completed ?? false,
    reminder: task.reminder || undefined,
    reminderAcknowledgedAt: task.reminderAcknowledgedAt || undefined,
    reminderSnoozedUntil: task.reminderSnoozedUntil || undefined,
    tags: task.tags ?? undefined,
  }));
}

function isActiveTask(t: Task): boolean {
  return !t.completed && !t.deleted;
}

/** Recurring tasks are never treated as completed for serialization; they stay in the active list. */
function isCompletedTask(t: Task): boolean {
  return t.completed && !t.deleted && !t.recurrence;
}

/** Convert in-memory AppData to the serialized JSON shape (activeTasks, completedTasks, deletedTasks, projects, tags). */
export function toSerialized(data: AppData): SerializedAppData {
  const activeTasks = data.tasks.filter((t) => isActiveTask(t) || t.recurrence);
  const completedTasks = data.tasks.filter(isCompletedTask);
  const deletedTasks = data.tasks.filter((t) => t.deleted);
  const tagSet = new Set<string>();
  data.tasks.forEach((t) => t.tags?.forEach((tag) => tagSet.add(tag)));
  return {
    activeTasks,
    completedTasks,
    deletedTasks,
    projects: data.projects,
    tags: Array.from(tagSet).sort(),
  };
}

/** Parse serialized JSON into in-memory AppData. Supports v2 (activeTasks/completedTasks/deletedTasks/tags) and legacy (tasks + projects). */
export function fromSerialized(parsed: unknown): AppData | null {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const obj = parsed as Record<string, unknown>;

  if (Array.isArray(obj.activeTasks) && Array.isArray(obj.completedTasks)) {
    const deletedTasks = Array.isArray(obj.deletedTasks) ? obj.deletedTasks : [];
    const tasks = normalizeTasks([...obj.activeTasks, ...obj.completedTasks, ...deletedTasks]);
    const projects = Array.isArray(obj.projects) ? (obj.projects as Project[]) : [];
    return { tasks, projects };
  }

  if (Array.isArray(obj.tasks)) {
    const tasks = normalizeTasks(obj.tasks);
    const projects = Array.isArray(obj.projects) ? (obj.projects as Project[]) : [];
    return { tasks, projects };
  }

  return null;
}

/**
 * Load tasks and projects from localStorage.
 * Automatically migrates from the old separate-key or v1 single-tasks format on first call.
 */
export function loadAppData(): AppData {
  if (typeof window === "undefined") return { tasks: [], projects: [] };

  try {
    const raw = window.localStorage.getItem(DATA_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const data = fromSerialized(parsed);
      if (data) return data;
    }
  } catch { /* fall through to migration */ }

  try {
    const rawV1 = window.localStorage.getItem(LEGACY_DATA_KEY_V1);
    if (rawV1) {
      const parsed = JSON.parse(rawV1);
      const data = fromSerialized(parsed);
      if (data) {
        saveAppData(data);
        window.localStorage.removeItem(LEGACY_DATA_KEY_V1);
        return data;
      }
    }
  } catch { /* ignore */ }

  // Migrate from legacy separate keys
  let tasks: Task[] = [];
  let projects: Project[] = [];
  try {
    const rawTasks = window.localStorage.getItem(LEGACY_TASKS_KEY);
    if (rawTasks) {
      const parsed = JSON.parse(rawTasks);
      if (Array.isArray(parsed)) tasks = normalizeTasks(parsed);
    }
  } catch { /* ignore */ }
  try {
    const rawProjects = window.localStorage.getItem(LEGACY_PROJECTS_KEY);
    if (rawProjects) {
      const parsed = JSON.parse(rawProjects);
      if (Array.isArray(parsed)) projects = parsed as Project[];
    }
  } catch { /* ignore */ }

  const data: AppData = { tasks, projects };
  saveAppData(data);
  window.localStorage.removeItem(LEGACY_TASKS_KEY);
  window.localStorage.removeItem(LEGACY_PROJECTS_KEY);
  window.localStorage.removeItem(LEGACY_DATA_KEY_V1);

  return data;
}

export function saveAppData(data: AppData): void {
  if (typeof window === "undefined") return;
  try {
    const serialized = toSerialized(data);
    window.localStorage.setItem(DATA_KEY, JSON.stringify(serialized));
  } catch { /* silently fail */ }
}
