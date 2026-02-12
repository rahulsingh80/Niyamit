import type { Task } from "@domain/taskTypes";

const STORAGE_KEY = "niyamit.tasks.v1";

export function loadTasks(): Task[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Task[];

    // Basic shape validation to guard against corrupted data.
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.map((task) => ({
      ...task,
      dueDate: task.dueDate ?? null,
      completed: task.completed ?? false,
    }));
  } catch {
    return [];
  }
}

export function saveTasks(tasks: Task[]): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const raw = JSON.stringify(tasks);
    // This refers to saving the serialized 'tasks' array to the browser's localStorage using the key defined by STORAGE_KEY.
    window.localStorage.setItem(STORAGE_KEY, raw);
  } catch {
    // In a real app, you might surface an error or log somewhere.
  }
}

