import type { Task } from "./taskTypes";

export interface TaskGroup {
  key: string;
  label: string;
  isOverdue: boolean;
  tasks: Task[];
  /** When true, this group is a section heading only (e.g. "Later"); count may be hidden in UI. */
  isSectionHeading?: boolean;
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

/** Number of fixed day sections: TODAY, TOMORROW, and the next 5 days (7 total). */
const FIXED_DAY_COUNT = 7;

function getNextSevenDateStrings(now: Date): { dateStr: string; label: string; key: string }[] {
  const result: { dateStr: string; label: string; key: string }[] = [];
  const labels = ["Today", "Tomorrow"];
  for (let i = 0; i < FIXED_DAY_COUNT; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const dateStr = toLocalDateString(d);
    const label = i < 2 ? labels[i] : formatDateLabel(dateStr);
    const key = i === 0 ? "today" : i === 1 ? "tomorrow" : dateStr;
    result.push({ dateStr, label, key });
  }
  return result;
}

export function groupTasksByDate(tasks: Task[]): TaskGroup[] {
  const now = new Date();
  const nextSeven = getNextSevenDateStrings(now);
  const lastFixedDateStr = nextSeven[FIXED_DAY_COUNT - 1].dateStr;

  const sorted = sortTasks(tasks);

  const overdue: Task[] = [];
  const fixedDayBuckets = nextSeven.map(() => [] as Task[]);
  const laterByDate = new Map<string, Task[]>();
  const noDueDate: Task[] = [];

  for (const task of sorted) {
    if (!task.dueDate) {
      noDueDate.push(task);
    } else if (task.dueDate < nextSeven[0].dateStr) {
      overdue.push(task);
    } else if (task.dueDate <= lastFixedDateStr) {
      const idx = nextSeven.findIndex((n) => n.dateStr === task.dueDate);
      if (idx !== -1) fixedDayBuckets[idx].push(task);
    } else {
      const bucket = laterByDate.get(task.dueDate) ?? [];
      bucket.push(task);
      laterByDate.set(task.dueDate, bucket);
    }
  }

  const groups: TaskGroup[] = [];

  if (overdue.length)
    groups.push({ key: "overdue", label: "Overdue", isOverdue: true, tasks: overdue });

  for (let i = 0; i < FIXED_DAY_COUNT; i++) {
    groups.push({
      key: nextSeven[i].key,
      label: nextSeven[i].label,
      isOverdue: false,
      tasks: fixedDayBuckets[i],
    });
  }

  if (laterByDate.size > 0) {
    groups.push({
      key: "later",
      label: "Later",
      isOverdue: false,
      tasks: [],
      isSectionHeading: true,
    });
    for (const dateStr of [...laterByDate.keys()].sort()) {
      groups.push({
        key: `later-${dateStr}`,
        label: formatDateLabel(dateStr),
        isOverdue: false,
        tasks: laterByDate.get(dateStr)!,
      });
    }
  }

  if (noDueDate.length)
    groups.push({ key: "no-date", label: "No due date", isOverdue: false, tasks: noDueDate });

  return groups;
}

