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
   * Higher number == higher priority (4 is highest).
   */
  priority: TaskPriority;
  /**
   * ISO datetime string for creation time.
   */
  createdAt: string;
  /**
   * Completion flag kept simple for now.
   */
  completed: boolean;
}

