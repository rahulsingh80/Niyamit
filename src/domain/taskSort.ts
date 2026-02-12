import type { Task } from "./taskTypes";

/**
 * Sort tasks according to the product rules:
 * - Due date ascending
 * - Null / missing due dates at the bottom
 * - Priority descending (4 is highest)
 * - CreatedAt ascending as final tie-breaker
 */
export function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    // 1. Due date ascending, nulls last
    if (a.dueDate && !b.dueDate) return -1;
    if (!a.dueDate && b.dueDate) return 1;
    if (a.dueDate && b.dueDate) {
      if (a.dueDate < b.dueDate) return -1;
      if (a.dueDate > b.dueDate) return 1;
    }

    // 2. Priority descending
    if (a.priority !== b.priority) {
      return b.priority - a.priority;
    }

    // 3. CreatedAt ascending
    if (a.createdAt < b.createdAt) return -1;
    if (a.createdAt > b.createdAt) return 1;

    return 0;
  });
}

