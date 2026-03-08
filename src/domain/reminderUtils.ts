import type { Task, Reminder } from "./taskTypes";

/**
 * Compute the date/time when a task's reminder is due.
 * For "at": reminder date + time.
 * For "before": task due (dueDate + dueTime or 05:00) minus minutes.
 */
export function getReminderDueAt(task: Task): Date | null {
  if (!task.reminder) return null;
  const r = task.reminder;
  if (r.type === "at") {
    return new Date(`${r.date}T${r.time}:00`);
  }
  if (!task.dueDate) return null;
  const taskDueTime = task.dueTime ?? "05:00";
  const taskDue = new Date(`${task.dueDate}T${taskDueTime}:00`);
  return new Date(taskDue.getTime() - r.minutes * 60 * 1000);
}

/**
 * Whether the reminder is currently due (reminder time has passed, not acknowledged, snooze expired).
 */
export function isReminderDue(task: Task, now: Date = new Date()): boolean {
  if (!task.reminder || task.completed || task.deleted) return false;
  if (task.reminderAcknowledgedAt) return false;
  if (task.reminderSnoozedUntil) {
    if (new Date(task.reminderSnoozedUntil) > now) return false;
  }
  const dueAt = getReminderDueAt(task);
  if (!dueAt) return false;
  return dueAt <= now;
}

/**
 * Return tasks that have a due reminder, sorted by task due date/time then priority.
 */
export function getDueReminders(tasks: Task[], now: Date = new Date()): Task[] {
  const due = tasks.filter((t) => isReminderDue(t, now));
  due.sort((a, b) => {
    if (a.dueDate && !b.dueDate) return -1;
    if (!a.dueDate && b.dueDate) return 1;
    if (a.dueDate && b.dueDate) {
      if (a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      const at = a.dueTime ?? "05:00";
      const bt = b.dueTime ?? "05:00";
      if (at !== bt) return at.localeCompare(bt);
    }
    return (a.priority ?? 3) - (b.priority ?? 3);
  });
  return due;
}
