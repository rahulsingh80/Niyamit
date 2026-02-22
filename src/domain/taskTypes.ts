// Core task data model shared across clients (web, Android, desktop).
// Stored as JSON, designed to live in Google Drive-backed files.

export type TaskPriority = 1 | 2 | 3 | 4;

export interface Task {
  id: string;
  title: string;
  notes?: string;
  /**
   * ISO date string (YYYY-MM-DD) or null when no due date is set.
   * Kept as string for easy JSON storage and cross-platform use.
   */
  dueDate: string | null;
  /**
   * Lower number == higher priority (1 is highest, 4 is lowest).
   */
  priority: TaskPriority;
  /**
   * ISO datetime string for creation time.
   */
  createdAt: string;
  /**
   * ISO datetime string for last update time.
   */
  updatedAt?: string;
  /**
   * Completion flag kept simple for now.
   */
  completed: boolean;
}

