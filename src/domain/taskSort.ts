import type { Task } from "./taskTypes";

export interface TaskGroup {
  key: string;
  label: string;
  isOverdue: boolean;
  tasks: Task[];
}

/**
 * Sort tasks according to the product rules:
 * - Due date ascending (nulls last)
 * - Priority ascending (1 is highest)
 * - Due time ascending (nulls last within same priority)
 * - CreatedAt ascending as final tie-breaker
 */
export function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    if (a.dueDate && !b.dueDate) return -1;
    if (!a.dueDate && b.dueDate) return 1;
    if (a.dueDate && b.dueDate) {
      if (a.dueDate < b.dueDate) return -1;
      if (a.dueDate > b.dueDate) return 1;
    }

    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }

    if (a.dueTime && !b.dueTime) return -1;
    if (!a.dueTime && b.dueTime) return 1;
    if (a.dueTime && b.dueTime) {
      if (a.dueTime < b.dueTime) return -1;
      if (a.dueTime > b.dueTime) return 1;
    }

    if (a.createdAt < b.createdAt) return -1;
    if (a.createdAt > b.createdAt) return 1;

    return 0;
  });
}

function toLocalDateString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDateLabel(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

export function groupTasksByDate(tasks: Task[]): TaskGroup[] {
  const now = new Date();
  const todayStr = toLocalDateString(now);
  const tomorrowStr = toLocalDateString(
    new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1),
  );

  const sorted = sortTasks(tasks);

  const overdue: Task[] = [];
  const todayTasks: Task[] = [];
  const tomorrowTasks: Task[] = [];
  const futureBuckets = new Map<string, Task[]>();
  const noDueDate: Task[] = [];

  for (const task of sorted) {
    if (!task.dueDate) {
      noDueDate.push(task);
    } else if (task.dueDate < todayStr) {
      overdue.push(task);
    } else if (task.dueDate === todayStr) {
      todayTasks.push(task);
    } else if (task.dueDate === tomorrowStr) {
      tomorrowTasks.push(task);
    } else {
      const bucket = futureBuckets.get(task.dueDate) || [];
      bucket.push(task);
      futureBuckets.set(task.dueDate, bucket);
    }
  }

  const groups: TaskGroup[] = [];

  if (overdue.length)
    groups.push({ key: "overdue", label: "Overdue", isOverdue: true, tasks: overdue });
  if (todayTasks.length)
    groups.push({ key: "today", label: "Today", isOverdue: false, tasks: todayTasks });
  if (tomorrowTasks.length)
    groups.push({ key: "tomorrow", label: "Tomorrow", isOverdue: false, tasks: tomorrowTasks });

  for (const date of [...futureBuckets.keys()].sort()) {
    groups.push({
      key: date,
      label: formatDateLabel(date),
      isOverdue: false,
      tasks: futureBuckets.get(date)!,
    });
  }

  if (noDueDate.length)
    groups.push({ key: "no-date", label: "No due date", isOverdue: false, tasks: noDueDate });

  return groups;
}

