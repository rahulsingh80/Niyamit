// Core task data model shared across clients (web, Android, desktop).
// Stored as JSON, designed to live in Google Drive-backed files.

export type TaskPriority = 1 | 2 | 3 | 4;

/** Reminder: either at a specific date/time or X minutes before task due. */
export type Reminder =
  | { type: "at"; date: string; time: string }
  | { type: "before"; minutes: number };

export interface RecurrenceRule {
  type: "weekdays" | "interval" | "dayOfMonth" | "dayOfYear";
  /** Day-of-week indices (0 = Sun … 6 = Sat). Used when type = 'weekdays'. */
  weekdays?: number[];
  /** Repeat every N days. Used when type = 'interval'. */
  intervalDays?: number;
  /** Day of the month (1–31). Used when type = 'dayOfMonth'. */
  dayOfMonth?: number;
  /** Month index (0–11). Used when type = 'dayOfYear'. */
  month?: number;
  /** Day within the month (1–31). Used when type = 'dayOfYear'. */
  day?: number;
  /** When the interval was derived from "every Nth <weekday>", stores the weekday for display. */
  anchorWeekday?: number;
}

export interface Task {
  id: string;
  title: string;
  notes?: string;
  /**
   * ISO date string (YYYY-MM-DD) or null when no due date is set.
   * For recurring tasks this is the next upcoming occurrence.
   */
  dueDate: string | null;
  /**
   * Time of day (HH:MM, 24-hour) or undefined when no time is set.
   */
  dueTime?: string;
  /**
   * If present the task repeats according to this rule.
   */
  recurrence?: RecurrenceRule;
  /**
   * Lower number == higher priority (1 is highest, 4 is lowest).
   */
  priority: TaskPriority;
  createdAt: string;
  updatedAt?: string;
  completed: boolean;
  deleted?: boolean;
  /**
   * Tasks sharing the same cloneGroupId are clones of each other.
   * Changes (except title) propagate across the group.
   * Completing one completes all. Changing the title detaches the clone.
   */
  cloneGroupId?: string;
  /** The project this task belongs to (at most one). */
  projectId?: string;
  /** Optional reminder (at a specific time or X before due). */
  reminder?: Reminder;
  /** When the user acknowledged the reminder; once set, reminder is hidden. */
  reminderAcknowledgedAt?: string;
  /** Snooze until this time (ISO); reminder shows again when now >= this. */
  reminderSnoozedUntil?: string;
}
