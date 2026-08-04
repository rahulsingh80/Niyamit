import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { sortTasks, groupTasksByDate } from "./taskSort";
import type { Task } from "./taskTypes";

let idCounter = 0;
function task(overrides: Partial<Task> = {}): Task {
  idCounter += 1;
  return {
    id: `t${idCounter}`,
    title: `Task ${idCounter}`,
    dueDate: null,
    priority: 3,
    createdAt: `2026-01-01T00:00:0${idCounter}.000Z`,
    completed: false,
    ...overrides,
  };
}

describe("sortTasks", () => {
  beforeEach(() => {
    idCounter = 0;
  });

  it("returns an empty array unchanged", () => {
    expect(sortTasks([])).toEqual([]);
  });

  it("does not mutate the input array", () => {
    const tasks = [task({ dueDate: "2026-02-01" }), task({ dueDate: "2026-01-01" })];
    const copy = [...tasks];
    sortTasks(tasks);
    expect(tasks).toEqual(copy);
  });

  it("puts tasks with null due dates after tasks with due dates", () => {
    const withDate = task({ dueDate: "2026-01-01" });
    const withoutDate = task({ dueDate: null });
    const sorted = sortTasks([withoutDate, withDate]);
    expect(sorted).toEqual([withDate, withoutDate]);
  });

  it("orders all-null-due-date tasks by priority then createdAt (due date comparison is a no-op)", () => {
    const low = task({ dueDate: null, priority: 4, createdAt: "2026-01-01T00:00:00.000Z" });
    const high = task({ dueDate: null, priority: 1, createdAt: "2026-01-02T00:00:00.000Z" });
    expect(sortTasks([low, high])).toEqual([high, low]);
  });

  it("sorts ascending by due date first", () => {
    const later = task({ dueDate: "2026-02-01" });
    const earlier = task({ dueDate: "2026-01-01" });
    expect(sortTasks([later, earlier])).toEqual([earlier, later]);
  });

  it("breaks a due-date tie by priority ascending (1 is highest)", () => {
    const p4 = task({ dueDate: "2026-01-01", priority: 4 });
    const p1 = task({ dueDate: "2026-01-01", priority: 1 });
    expect(sortTasks([p4, p1])).toEqual([p1, p4]);
  });

  it("breaks a date+priority tie by due time, with no-time-set sorted after a set time", () => {
    const noTime = task({ dueDate: "2026-01-01", priority: 2, dueTime: undefined });
    const withTime = task({ dueDate: "2026-01-01", priority: 2, dueTime: "09:00" });
    expect(sortTasks([noTime, withTime])).toEqual([withTime, noTime]);
  });

  it("breaks a date+priority+time tie by createdAt ascending", () => {
    const newer = task({ dueDate: "2026-01-01", priority: 2, dueTime: "09:00", createdAt: "2026-01-01T02:00:00.000Z" });
    const older = task({ dueDate: "2026-01-01", priority: 2, dueTime: "09:00", createdAt: "2026-01-01T01:00:00.000Z" });
    expect(sortTasks([newer, older])).toEqual([older, newer]);
  });

  it("returns a stable 0 comparison when every field is identical", () => {
    const a = task({ dueDate: "2026-01-01", priority: 2, dueTime: "09:00", createdAt: "2026-01-01T01:00:00.000Z" });
    const b = { ...a, id: "other" };
    expect(sortTasks([a, b])).toEqual([a, b]);
  });

  it("fully orders a mixed set of tasks across every tie-break rule, in both comparator directions", () => {
    const d1 = task({ dueDate: "2026-01-01", priority: 2, dueTime: "08:00" });
    const d2 = task({ dueDate: "2026-01-01", priority: 2, dueTime: "09:00" });
    const d3 = task({ dueDate: "2026-01-02", priority: 1 });
    const noDateOlder = task({ dueDate: null, createdAt: "2026-01-01T00:00:00.000Z" });
    const noDateNewer = task({ dueDate: null, createdAt: "2026-01-02T00:00:00.000Z" });

    // Shuffle relative to the expected sorted order so comparisons happen in both directions.
    const shuffled = [noDateNewer, d3, noDateOlder, d2, d1];
    expect(sortTasks(shuffled)).toEqual([d1, d2, d3, noDateOlder, noDateNewer]);

    const reversed = [...shuffled].reverse();
    expect(sortTasks(reversed)).toEqual([d1, d2, d3, noDateOlder, noDateNewer]);
  });
});

describe("groupTasksByDate", () => {
  beforeEach(() => {
    idCounter = 0;
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 15)); // 2026-06-15 local time
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("buckets a task due yesterday as Overdue", () => {
    const t = task({ dueDate: "2026-06-14" });
    const groups = groupTasksByDate([t]);
    const overdue = groups.find((g) => g.key === "overdue");
    expect(overdue?.tasks).toEqual([t]);
  });

  it("buckets a task due today under the 'today' key, not overdue", () => {
    const t = task({ dueDate: "2026-06-15" });
    const groups = groupTasksByDate([t]);
    expect(groups.find((g) => g.key === "overdue")).toBeUndefined();
    const today = groups.find((g) => g.key === "today");
    expect(today?.tasks).toEqual([t]);
    expect(today?.label).toBe("Today");
  });

  it("buckets a task due tomorrow under the 'tomorrow' key", () => {
    const t = task({ dueDate: "2026-06-16" });
    const groups = groupTasksByDate([t]);
    const tomorrow = groups.find((g) => g.key === "tomorrow");
    expect(tomorrow?.tasks).toEqual([t]);
    expect(tomorrow?.label).toBe("Tomorrow");
  });

  it("buckets a task due on the 7th fixed day (today+6) into a fixed-date group, not Later", () => {
    // today = 2026-06-15, so day index 6 (7th day) = 2026-06-21
    const t = task({ dueDate: "2026-06-21" });
    const groups = groupTasksByDate([t]);
    const fixedGroup = groups.find((g) => g.key === "2026-06-21");
    expect(fixedGroup?.tasks).toEqual([t]);
    expect(groups.find((g) => g.key === "later")).toBeUndefined();
  });

  it("buckets a task due after the 7-day window under 'Later', sorted by date", () => {
    const far = task({ dueDate: "2026-07-01" });
    const nearer = task({ dueDate: "2026-06-25" });
    const groups = groupTasksByDate([far, nearer]);
    const laterHeading = groups.find((g) => g.key === "later");
    expect(laterHeading?.isSectionHeading).toBe(true);
    const laterKeys = groups.filter((g) => g.key.startsWith("later-")).map((g) => g.key);
    expect(laterKeys).toEqual(["later-2026-06-25", "later-2026-07-01"]);
  });

  it("sorts 'Later' dates chronologically across a month/year boundary", () => {
    const janNext = task({ dueDate: "2027-01-05" });
    const decThis = task({ dueDate: "2026-12-20" });
    const groups = groupTasksByDate([janNext, decThis]);
    const laterKeys = groups.filter((g) => g.key.startsWith("later-")).map((g) => g.key);
    expect(laterKeys).toEqual(["later-2026-12-20", "later-2027-01-05"]);
  });

  it("puts tasks with no due date into the 'No due date' group", () => {
    const t = task({ dueDate: null });
    const groups = groupTasksByDate([t]);
    const noDate = groups.find((g) => g.key === "no-date");
    expect(noDate?.tasks).toEqual([t]);
    expect(noDate?.label).toBe("No due date");
  });

  it("omits the Overdue and No-due-date groups entirely when empty", () => {
    const t = task({ dueDate: "2026-06-15" });
    const groups = groupTasksByDate([t]);
    expect(groups.find((g) => g.key === "overdue")).toBeUndefined();
    expect(groups.find((g) => g.key === "no-date")).toBeUndefined();
  });

  it("always includes all 7 fixed-day groups even when empty", () => {
    const groups = groupTasksByDate([]);
    const fixedKeys = groups.map((g) => g.key);
    expect(fixedKeys).toEqual(["today", "tomorrow", "2026-06-17", "2026-06-18", "2026-06-19", "2026-06-20", "2026-06-21"]);
  });

  it("omits the 'Later' heading entirely when there are no later-dated tasks", () => {
    const groups = groupTasksByDate([task({ dueDate: "2026-06-15" })]);
    expect(groups.find((g) => g.key === "later")).toBeUndefined();
  });
});
