import { describe, it, expect } from "vitest";
import { getReminderDueAt, isReminderDue, getDueReminders } from "./reminderUtils";
import type { Task } from "./taskTypes";

let idCounter = 0;
function task(overrides: Partial<Task> = {}): Task {
  idCounter += 1;
  return {
    id: `t${idCounter}`,
    title: `Task ${idCounter}`,
    dueDate: null,
    priority: 3,
    createdAt: "2026-01-01T00:00:00.000Z",
    completed: false,
    ...overrides,
  };
}

describe("getReminderDueAt", () => {
  it("returns null when there is no reminder", () => {
    expect(getReminderDueAt(task())).toBeNull();
  });

  it("resolves an 'at' reminder from its own date+time, ignoring the task's dueDate", () => {
    const t = task({ dueDate: "2026-05-01", reminder: { type: "at", date: "2026-03-10", time: "14:30" } });
    expect(getReminderDueAt(t)).toEqual(new Date("2026-03-10T14:30:00"));
  });

  it("returns null for a 'before' reminder when the task has no dueDate", () => {
    const t = task({ dueDate: null, reminder: { type: "before", minutes: 30 } });
    expect(getReminderDueAt(t)).toBeNull();
  });

  it("defaults to 05:00 due time for a 'before' reminder when dueTime is not set", () => {
    const t = task({ dueDate: "2026-03-10", dueTime: undefined, reminder: { type: "before", minutes: 60 } });
    expect(getReminderDueAt(t)).toEqual(new Date("2026-03-10T04:00:00"));
  });

  it("subtracts minutes from the task's due date+time for a 'before' reminder", () => {
    const t = task({ dueDate: "2026-03-10", dueTime: "10:00", reminder: { type: "before", minutes: 15 } });
    expect(getReminderDueAt(t)).toEqual(new Date("2026-03-10T09:45:00"));
  });

  it("handles a 0-minute 'before' reminder as exactly the due time", () => {
    const t = task({ dueDate: "2026-03-10", dueTime: "10:00", reminder: { type: "before", minutes: 0 } });
    expect(getReminderDueAt(t)).toEqual(new Date("2026-03-10T10:00:00"));
  });

  it("crosses a day boundary when minutes exceed the time-of-day", () => {
    const t = task({ dueDate: "2026-03-10", dueTime: "00:30", reminder: { type: "before", minutes: 60 } });
    expect(getReminderDueAt(t)).toEqual(new Date("2026-03-09T23:30:00"));
  });
});

describe("isReminderDue", () => {
  const now = new Date("2026-03-10T10:00:00");

  it("is false when there is no reminder", () => {
    expect(isReminderDue(task(), now)).toBe(false);
  });

  it("is false when the task is completed, even if the reminder time has passed", () => {
    const t = task({ completed: true, reminder: { type: "at", date: "2026-03-10", time: "09:00" } });
    expect(isReminderDue(t, now)).toBe(false);
  });

  it("is false when the task is deleted", () => {
    const t = task({ deleted: true, reminder: { type: "at", date: "2026-03-10", time: "09:00" } });
    expect(isReminderDue(t, now)).toBe(false);
  });

  it("is false when already acknowledged", () => {
    const t = task({
      reminder: { type: "at", date: "2026-03-10", time: "09:00" },
      reminderAcknowledgedAt: "2026-03-10T09:05:00",
    });
    expect(isReminderDue(t, now)).toBe(false);
  });

  it("is false when snoozed until a future time", () => {
    const t = task({
      reminder: { type: "at", date: "2026-03-10", time: "09:00" },
      reminderSnoozedUntil: "2026-03-10T11:00:00",
    });
    expect(isReminderDue(t, now)).toBe(false);
  });

  it("is true when the snooze time has already passed", () => {
    const t = task({
      reminder: { type: "at", date: "2026-03-10", time: "09:00" },
      reminderSnoozedUntil: "2026-03-10T09:30:00",
    });
    expect(isReminderDue(t, now)).toBe(true);
  });

  it("is true at the exact boundary when dueAt equals now", () => {
    const t = task({ reminder: { type: "at", date: "2026-03-10", time: "10:00" } });
    expect(isReminderDue(t, now)).toBe(true);
  });

  it("is false when the reminder time is still in the future", () => {
    const t = task({ reminder: { type: "at", date: "2026-03-10", time: "10:01" } });
    expect(isReminderDue(t, now)).toBe(false);
  });

  it("is false for a 'before' reminder when the task has no due date", () => {
    const t = task({ dueDate: null, reminder: { type: "before", minutes: 30 } });
    expect(isReminderDue(t, now)).toBe(false);
  });
});

describe("getDueReminders", () => {
  const now = new Date("2026-03-10T12:00:00");

  it("returns an empty array when there are no tasks", () => {
    expect(getDueReminders([], now)).toEqual([]);
  });

  it("excludes tasks whose reminder is not yet due", () => {
    const notDue = task({ reminder: { type: "at", date: "2026-03-10", time: "23:00" } });
    expect(getDueReminders([notDue], now)).toEqual([]);
  });

  it("sorts due reminders by task due date, then due time (missing time defaults to 05:00), then priority", () => {
    const laterDate = task({
      dueDate: "2026-03-11",
      reminder: { type: "at", date: "2026-03-09", time: "08:00" },
    });
    const noTimeSameDate = task({
      dueDate: "2026-03-10",
      dueTime: undefined,
      priority: 4,
      reminder: { type: "at", date: "2026-03-09", time: "08:00" },
    });
    const earlyTimeSameDate = task({
      dueDate: "2026-03-10",
      dueTime: "04:00",
      priority: 1,
      reminder: { type: "at", date: "2026-03-09", time: "08:00" },
    });
    const sorted = getDueReminders([laterDate, noTimeSameDate, earlyTimeSameDate], now);
    expect(sorted).toEqual([earlyTimeSameDate, noTimeSameDate, laterDate]);
  });

  it("sorts tasks with no due date after dated tasks, and breaks ties by priority (missing priority defaults to 3)", () => {
    const noDueA = task({
      dueDate: null,
      reminder: { type: "at", date: "2026-03-09", time: "08:00" },
      priority: 4,
    });
    const noDueB = task({
      dueDate: null,
      reminder: { type: "at", date: "2026-03-09", time: "08:00" },
      priority: 1,
    });
    const dated = task({
      dueDate: "2026-03-10",
      dueTime: "01:00",
      reminder: { type: "at", date: "2026-03-09", time: "08:00" },
    });
    const sorted = getDueReminders([noDueA, noDueB, dated], now);
    expect(sorted).toEqual([dated, noDueB, noDueA]);
  });

  it("orders correctly regardless of input order (exercises both comparator directions)", () => {
    const earlier = task({ dueDate: "2026-03-10", dueTime: "01:00", reminder: { type: "at", date: "2026-03-09", time: "08:00" } });
    const later = task({ dueDate: "2026-03-10", dueTime: "02:00", reminder: { type: "at", date: "2026-03-09", time: "08:00" } });
    const latest = task({ dueDate: "2026-03-11", reminder: { type: "at", date: "2026-03-09", time: "08:00" } });

    expect(getDueReminders([latest, later, earlier], now)).toEqual([earlier, later, latest]);
    expect(getDueReminders([earlier, later, latest], now)).toEqual([earlier, later, latest]);
  });
});
