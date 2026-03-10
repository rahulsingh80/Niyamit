import type { Task } from "@domain/taskTypes";
import type { Project } from "@domain/projectTypes";

export interface AppData {
  tasks: Task[];
  projects: Project[];
}

const DATA_KEY = "niyamit.data.v1";

// Legacy keys for one-time migration
const LEGACY_TASKS_KEY = "niyamit.tasks.v1";
const LEGACY_PROJECTS_KEY = "niyamit.projects.v1";

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

/**
 * Load tasks and projects from localStorage.
 * Automatically migrates from the old separate-key format on first call.
 */
export function loadAppData(): AppData {
  if (typeof window === "undefined") return { tasks: [], projects: [] };

  try {
    const raw = window.localStorage.getItem(DATA_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        tasks: Array.isArray(parsed?.tasks) ? normalizeTasks(parsed.tasks) : [],
        projects: Array.isArray(parsed?.projects) ? parsed.projects as Project[] : [],
      };
    }
  } catch { /* fall through to migration */ }

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

  // Persist in new format and clean up old keys
  const data: AppData = { tasks, projects };
  saveAppData(data);
  window.localStorage.removeItem(LEGACY_TASKS_KEY);
  window.localStorage.removeItem(LEGACY_PROJECTS_KEY);

  return data;
}

export function saveAppData(data: AppData): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DATA_KEY, JSON.stringify(data));
  } catch { /* silently fail */ }
}
