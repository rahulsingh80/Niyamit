import React, { useState } from "react";
import type { Task } from "@domain/taskTypes";
import { getReminderDueAt } from "@domain/reminderUtils";
import { formatDateHint } from "@domain/dateParser";

interface RemindersSectionProps {
  reminders: Task[];
  onAcknowledge(taskId: string): void;
  onSnooze(taskId: string, snoozedUntilIso: string): void;
}

const SNOOZE_OPTIONS: { label: string; minutes: number }[] = [
  { label: "1 hour", minutes: 60 },
  { label: "2 hours", minutes: 120 },
  { label: "1 day", minutes: 1440 },
  { label: "2 days", minutes: 2880 },
];

function formatReminderDue(task: Task): string {
  const at = getReminderDueAt(task);
  if (!at) return "";
  const dateStr = at.toISOString().slice(0, 10);
  const timeStr = `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
  return formatDateHint(dateStr, timeStr);
}

function taskDueAsDate(task: Task): Date {
  const time = task.dueTime ?? "05:00";
  return new Date(`${task.dueDate}T${time}:00`);
}

export const RemindersSection: React.FC<RemindersSectionProps> = ({
  reminders,
  onAcknowledge,
  onSnooze,
}) => {
  const [expanded, setExpanded] = useState(true);

  if (reminders.length === 0) return null;

  return (
    <section className="reminders-section card" aria-label="Due reminders">
      <button
        type="button"
        className="reminders-section-header"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
      >
        <span className="reminders-section-title">Reminders</span>
        <span className="reminders-section-count">{reminders.length}</span>
        <span className="reminders-section-chevron" aria-hidden="true">
          {expanded ? "\u25B2" : "\u25BC"}
        </span>
      </button>
      {expanded && (
        <ul className="reminders-list">
          {reminders.map((task) => {
            const taskDue = task.dueDate ? taskDueAsDate(task) : null;
            const oneHourBeforeDue = taskDue ? new Date(taskDue.getTime() - 60 * 60 * 1000) : null;
            return (
              <li key={task.id} className="reminder-item">
                <div className="reminder-item-main">
                  <span className="reminder-task-title">{task.title}</span>
                  {task.dueDate && (
                    <span className="reminder-task-due">
                      Due {formatDateHint(task.dueDate, task.dueTime)}
                    </span>
                  )}
                  <span className="reminder-due">{formatReminderDue(task)}</span>
                </div>
                <div className="reminder-item-actions">
                  <select
                    className="reminder-snooze-select"
                    aria-label={`Snooze reminder for ${task.title}`}
                    value=""
                    onChange={(e) => {
                      const minutes = Number(e.target.value);
                      if (!minutes) return;
                      const until = new Date(Date.now() + minutes * 60 * 1000);
                      if (oneHourBeforeDue && until > oneHourBeforeDue) {
                        onSnooze(task.id, oneHourBeforeDue.toISOString());
                      } else {
                        onSnooze(task.id, until.toISOString());
                      }
                      e.target.value = "";
                    }}
                  >
                    <option value="">Snooze</option>
                    {SNOOZE_OPTIONS.map((opt) => {
                      const until = new Date(Date.now() + opt.minutes * 60 * 1000);
                      const disabled = oneHourBeforeDue != null && until > oneHourBeforeDue;
                      return (
                        <option key={opt.minutes} value={opt.minutes} disabled={disabled}>
                          {opt.label}
                        </option>
                      );
                    })}
                  </select>
                  <button
                    type="button"
                    className="secondary reminder-ack-btn"
                    onClick={() => onAcknowledge(task.id)}
                  >
                    Done
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};
