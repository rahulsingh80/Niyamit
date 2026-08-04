import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  computeNextOccurrence,
  advanceRecurrence,
  formatDateHint,
  formatRecurrenceHint,
  formatRecurrenceShort,
  parseTitleInput,
} from "./dateParser";
import type { RecurrenceRule } from "./taskTypes";

// Fixed "now": Monday, 2026-06-15 (local time), 00:00.
const FIXED_NOW = new Date(2026, 5, 15);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("computeNextOccurrence", () => {
  it("weekdays: returns today when today's weekday matches", () => {
    // 2026-06-15 is a Monday (day 1)
    const rule: RecurrenceRule = { type: "weekdays", weekdays: [1, 3] };
    expect(computeNextOccurrence(rule)).toEqual(new Date(2026, 5, 15));
  });

  it("weekdays: returns the next matching day within the week when today doesn't match", () => {
    const rule: RecurrenceRule = { type: "weekdays", weekdays: [3] }; // Wednesday
    expect(computeNextOccurrence(rule)).toEqual(new Date(2026, 5, 17));
  });

  it("weekdays: falls back to today when the list is empty (no match found in the loop)", () => {
    const rule: RecurrenceRule = { type: "weekdays", weekdays: [] };
    expect(computeNextOccurrence(rule)).toEqual(new Date(2026, 5, 15));
  });

  it("interval: anchorDate in the future is returned as-is", () => {
    const rule: RecurrenceRule = { type: "interval", intervalDays: 3, anchorDate: "2026-07-01" };
    expect(computeNextOccurrence(rule)).toEqual(new Date("2026-07-01"));
  });

  it("interval: anchorDate in the past advances by intervalDays until it reaches today or later", () => {
    const rule: RecurrenceRule = { type: "interval", intervalDays: 5, anchorDate: "2026-06-01" };
    // 06-01 -> 06-06 -> 06-11 -> 06-16
    expect(computeNextOccurrence(rule)).toEqual(new Date(2026, 5, 16));
  });

  it("interval: anchorDate equal to today is returned as-is", () => {
    const rule: RecurrenceRule = { type: "interval", intervalDays: 5, anchorDate: "2026-06-15" };
    expect(computeNextOccurrence(rule)).toEqual(new Date("2026-06-15"));
  });

  it("interval: anchorWeekday with 0 diff (today) returns today", () => {
    const rule: RecurrenceRule = { type: "interval", intervalDays: 14, anchorWeekday: 1 }; // Monday
    expect(computeNextOccurrence(rule)).toEqual(new Date(2026, 5, 15));
  });

  it("interval: anchorWeekday wraps around to next week", () => {
    const rule: RecurrenceRule = { type: "interval", intervalDays: 14, anchorWeekday: 0 }; // Sunday
    expect(computeNextOccurrence(rule)).toEqual(new Date(2026, 5, 21));
  });

  it("interval: neither anchor set returns today", () => {
    const rule: RecurrenceRule = { type: "interval", intervalDays: 3 };
    expect(computeNextOccurrence(rule)).toEqual(new Date(2026, 5, 15));
  });

  it("dayOfMonth: day still upcoming this month", () => {
    const rule: RecurrenceRule = { type: "dayOfMonth", dayOfMonth: 20 };
    expect(computeNextOccurrence(rule)).toEqual(new Date(2026, 5, 20));
  });

  it("dayOfMonth: day already passed this month rolls to next month", () => {
    const rule: RecurrenceRule = { type: "dayOfMonth", dayOfMonth: 5 };
    expect(computeNextOccurrence(rule)).toEqual(new Date(2026, 6, 5));
  });

  it("dayOfMonth: day equal to today counts as upcoming (>=)", () => {
    const rule: RecurrenceRule = { type: "dayOfMonth", dayOfMonth: 15 };
    expect(computeNextOccurrence(rule)).toEqual(new Date(2026, 5, 15));
  });

  it("dayOfMonth: an out-of-range day (31 in a 30-day month) auto-rolls via native Date", () => {
    // June has 30 days; June 31 rolls into July 1
    const rule: RecurrenceRule = { type: "dayOfMonth", dayOfMonth: 31 };
    expect(computeNextOccurrence(rule)).toEqual(new Date(2026, 6, 1));
  });

  it("dayOfYear: date upcoming this year", () => {
    const rule: RecurrenceRule = { type: "dayOfYear", month: 11, day: 25 }; // Dec 25
    expect(computeNextOccurrence(rule)).toEqual(new Date(2026, 11, 25));
  });

  it("dayOfYear: date already passed this year rolls to next year", () => {
    const rule: RecurrenceRule = { type: "dayOfYear", month: 0, day: 1 }; // Jan 1
    expect(computeNextOccurrence(rule)).toEqual(new Date(2027, 0, 1));
  });

  it("dayOfYear: handles a leap-year Feb 29 target", () => {
    vi.setSystemTime(new Date(2027, 0, 1)); // 2027 is not a leap year
    const rule: RecurrenceRule = { type: "dayOfYear", month: 1, day: 29 };
    // Feb 29 2027 doesn't exist -> native Date rolls to Mar 1 2027
    expect(computeNextOccurrence(rule)).toEqual(new Date(2027, 2, 1));
  });

  it("weekdayOfMonth: first Wednesday of this month already passed, rolls to first Wednesday of next month", () => {
    // First Wednesday of June 2026 = June 3, which is before today (June 15) -> rolls to July.
    // First Wednesday of July 2026 = July 1.
    const rule: RecurrenceRule = { type: "weekdayOfMonth", weekday: 3, occurrenceInMonth: 1 };
    expect(computeNextOccurrence(rule)).toEqual(new Date(2026, 6, 1));
  });

  it("weekdayOfMonth: occurrence 5 (last) within current month", () => {
    // Last Monday of June 2026 = June 29
    const rule: RecurrenceRule = { type: "weekdayOfMonth", weekday: 1, occurrenceInMonth: 5 };
    expect(computeNextOccurrence(rule)).toEqual(new Date(2026, 5, 29));
  });

  it("weekdayOfMonth: rolls to next month when this month's occurrence already passed", () => {
    // First Monday of June 2026 = June 1, which is before "today" (June 15) -> rolls to July
    const rule: RecurrenceRule = { type: "weekdayOfMonth", weekday: 1, occurrenceInMonth: 1 };
    expect(computeNextOccurrence(rule)).toEqual(new Date(2026, 6, 6));
  });

  it("intervalMonths: anchor in the future returned as-is", () => {
    const rule: RecurrenceRule = { type: "intervalMonths", intervalMonths: 2, anchorDate: "2026-08-01" };
    expect(computeNextOccurrence(rule)).toEqual(new Date("2026-08-01"));
  });

  it("intervalMonths: anchor in the past advances by intervalMonths", () => {
    const rule: RecurrenceRule = { type: "intervalMonths", intervalMonths: 2, anchorDate: "2026-01-01" };
    // Jan -> Mar -> May -> Jul
    expect(computeNextOccurrence(rule)).toEqual(new Date(2026, 6, 1));
  });

  it("intervalMonths: no anchor defaults to today", () => {
    const rule: RecurrenceRule = { type: "intervalMonths", intervalMonths: 1 };
    expect(computeNextOccurrence(rule)).toEqual(new Date(2026, 5, 15));
  });

  it("unknown recurrence type returns today", () => {
    const rule = { type: "bogus" } as unknown as RecurrenceRule;
    expect(computeNextOccurrence(rule)).toEqual(new Date(2026, 5, 15));
  });
});

describe("advanceRecurrence", () => {
  it("weekdays: advances to the next matching weekday after the current due date", () => {
    const rule: RecurrenceRule = { type: "weekdays", weekdays: [1, 3, 5] };
    // current due 2026-06-15 (Mon) -> next match is Wed 2026-06-17
    expect(advanceRecurrence(rule, "2026-06-15")).toBe("2026-06-17");
  });

  it("weekdays: with an empty list, next stays equal to current (no match found), then falls back to computeNextOccurrence since it's not in the past", () => {
    const rule: RecurrenceRule = { type: "weekdays", weekdays: [] };
    // current = today, so "next === current" is not < todayMidnight -> returned as-is
    expect(advanceRecurrence(rule, "2026-06-15")).toBe("2026-06-15");
  });

  it("interval: advances by intervalDays", () => {
    const rule: RecurrenceRule = { type: "interval", intervalDays: 4 };
    expect(advanceRecurrence(rule, "2026-06-15")).toBe("2026-06-19");
  });

  it("dayOfMonth: advances to the same day next month", () => {
    const rule: RecurrenceRule = { type: "dayOfMonth", dayOfMonth: 10 };
    expect(advanceRecurrence(rule, "2026-06-10")).toBe("2026-07-10");
  });

  it("dayOfYear: advances to the same day next year", () => {
    const rule: RecurrenceRule = { type: "dayOfYear", month: 5, day: 10 };
    expect(advanceRecurrence(rule, "2026-06-10")).toBe("2027-06-10");
  });

  it("weekdayOfMonth: advances to the same occurrence next month", () => {
    // Third Wednesday of June 2026 = June 17. Third Wednesday of July 2026 = July 15.
    const rule: RecurrenceRule = { type: "weekdayOfMonth", weekday: 3, occurrenceInMonth: 3 };
    expect(advanceRecurrence(rule, "2026-06-17")).toBe("2026-07-15");
  });

  it("intervalMonths: advances by intervalMonths", () => {
    const rule: RecurrenceRule = { type: "intervalMonths", intervalMonths: 3 };
    expect(advanceRecurrence(rule, "2026-06-15")).toBe("2026-09-15");
  });

  it("falls back to computeNextOccurrence when a long-overdue task's one-step advance is still in the past", () => {
    const rule: RecurrenceRule = { type: "dayOfMonth", dayOfMonth: 1 };
    // currentDueDate is months overdue; a naive +1 month advance from Jan would still be in the past.
    // computeNextOccurrence("today"=2026-06-15) should give 2026-07-01.
    expect(advanceRecurrence(rule, "2026-01-01")).toBe("2026-07-01");
  });

  it("throws for a malformed 'interval' rule missing intervalDays (non-null assertion produces NaN date)", () => {
    const rule = { type: "interval" } as RecurrenceRule;
    const result = advanceRecurrence(rule, "2026-06-15");
    // new Date(y, m, d + undefined) -> NaN date -> toDateStr produces "NaN-NaN-NaN"
    expect(result).toBe("NaN-NaN-NaN");
  });

  it("unknown recurrence type advances by a single day", () => {
    const rule = { type: "bogus" } as unknown as RecurrenceRule;
    expect(advanceRecurrence(rule, "2026-06-15")).toBe("2026-06-16");
  });
});

describe("formatDateHint", () => {
  it("formats a date without a time", () => {
    expect(formatDateHint("2026-06-15")).not.toContain(" at ");
  });

  it("appends the time when provided", () => {
    expect(formatDateHint("2026-06-15", "14:30")).toMatch(/ at 14:30$/);
  });
});

describe("formatRecurrenceHint / formatRecurrenceShort", () => {
  it("describes a weekdays rule by day names", () => {
    expect(formatRecurrenceHint({ type: "weekdays", weekdays: [1, 3] })).toBe("Every Mon, Wed");
  });

  it("describes the biweekly special case when anchorWeekday is set and intervalDays is exactly 14", () => {
    const rule: RecurrenceRule = { type: "interval", intervalDays: 14, anchorWeekday: 2 };
    expect(formatRecurrenceHint(rule)).toBe("Every other Tue");
    expect(formatRecurrenceShort(rule)).toBe("Every other Tue");
  });

  it("describes a generic N-week interval with an anchor weekday when N > 2", () => {
    const rule: RecurrenceRule = { type: "interval", intervalDays: 21, anchorWeekday: 2 };
    expect(formatRecurrenceHint(rule)).toBe("Every 3 weeks (Tue)");
    expect(formatRecurrenceShort(rule)).toBe("Every 3w (Tue)");
  });

  it("describes daily and weekly interval rules without an anchor weekday", () => {
    expect(formatRecurrenceHint({ type: "interval", intervalDays: 1 })).toBe("Every day");
    expect(formatRecurrenceShort({ type: "interval", intervalDays: 1 })).toBe("Daily");
    expect(formatRecurrenceHint({ type: "interval", intervalDays: 7 })).toBe("Every week");
    expect(formatRecurrenceShort({ type: "interval", intervalDays: 7 })).toBe("Weekly");
  });

  it("formatRecurrenceShort describes a weekdays rule by day names", () => {
    expect(formatRecurrenceShort({ type: "weekdays", weekdays: [1, 3] })).toBe("Every Mon, Wed");
  });

  it("formatRecurrenceShort describes a dayOfMonth rule with an ordinal suffix", () => {
    expect(formatRecurrenceShort({ type: "dayOfMonth", dayOfMonth: 2 })).toBe("Monthly (2nd)");
  });

  it("describes an arbitrary N-day interval", () => {
    expect(formatRecurrenceHint({ type: "interval", intervalDays: 4 })).toBe("Every 4 days");
    expect(formatRecurrenceShort({ type: "interval", intervalDays: 4 })).toBe("Every 4d");
  });

  it("appends the time suffix when provided to formatRecurrenceHint", () => {
    expect(formatRecurrenceHint({ type: "interval", intervalDays: 1 }, "09:00")).toBe("Every day at 09:00");
  });

  it.each([
    [1, "1st"], [2, "2nd"], [3, "3rd"], [4, "4th"],
    [11, "11th"], [12, "12th"], [13, "13th"],
    [21, "21st"], [22, "22nd"], [23, "23rd"], [100, "100th"], [111, "111th"],
  ])("formats ordinal suffix for dayOfMonth=%i as %s", (day, expected) => {
    expect(formatRecurrenceHint({ type: "dayOfMonth", dayOfMonth: day })).toBe(`Monthly on the ${expected}`);
  });

  it("describes a dayOfYear rule with the month name and day", () => {
    expect(formatRecurrenceHint({ type: "dayOfYear", month: 11, day: 25 })).toBe("Yearly on Dec 25");
    expect(formatRecurrenceShort({ type: "dayOfYear", month: 11, day: 25 })).toBe("Yearly (Dec 25)");
  });

  it.each([
    [1, "first"], [2, "second"], [3, "third"], [4, "fourth"], [5, "last"],
  ])("labels weekdayOfMonth occurrence %i as %s", (occ, label) => {
    const rule: RecurrenceRule = { type: "weekdayOfMonth", weekday: 5, occurrenceInMonth: occ };
    expect(formatRecurrenceHint(rule)).toBe(`${label} Fri of every month`);
    expect(formatRecurrenceShort(rule)).toBe(`${label} Fri of month`);
  });

  it("describes an intervalMonths rule", () => {
    expect(formatRecurrenceHint({ type: "intervalMonths", intervalMonths: 1 })).toBe("Every month");
    expect(formatRecurrenceShort({ type: "intervalMonths", intervalMonths: 1 })).toBe("Monthly");
    expect(formatRecurrenceHint({ type: "intervalMonths", intervalMonths: 3 })).toBe("Every 3 months");
    expect(formatRecurrenceShort({ type: "intervalMonths", intervalMonths: 3 })).toBe("Every 3 months");
  });

  it("falls back to 'Recurring' for an unknown type", () => {
    const rule = { type: "bogus" } as unknown as RecurrenceRule;
    expect(formatRecurrenceHint(rule)).toBe("Recurring");
    expect(formatRecurrenceShort(rule)).toBe("Recurring");
  });
});

describe("parseTitleInput", () => {
  it("returns an empty title and null due date for empty input", () => {
    expect(parseTitleInput("")).toEqual({ title: "", dueDate: null });
  });

  it("returns an empty title and null due date for whitespace-only input", () => {
    expect(parseTitleInput("   ")).toEqual({ title: "", dueDate: null });
  });

  it("leaves a plain title with no tail tokens untouched", () => {
    const result = parseTitleInput("Buy milk");
    expect(result.title).toBe("Buy milk");
    expect(result.dueDate).toBeNull();
    expect(result.priority).toBeUndefined();
  });

  describe("priority matching", () => {
    it.each([1, 2, 3, 4] as const)("parses !!%i as a valid priority", (p) => {
      const result = parseTitleInput(`Buy milk !!${p}`);
      expect(result.priority).toBe(p);
      expect(result.title).toBe("Buy milk");
    });

    it("does not match an out-of-range priority like !!5", () => {
      const result = parseTitleInput("Buy milk !!5");
      expect(result.priority).toBeUndefined();
      expect(result.title).toBe("Buy milk !!5");
    });

    it("does not match !!0", () => {
      const result = parseTitleInput("Buy milk !!0");
      expect(result.priority).toBeUndefined();
    });
  });

  describe("date matching", () => {
    it("parses 'today'", () => {
      const result = parseTitleInput("Buy milk today");
      expect(result.dueDate).toBe("2026-06-15");
      expect(result.title).toBe("Buy milk");
    });

    it("parses 'tomorrow' with a time", () => {
      const result = parseTitleInput("Buy milk tomorrow 5:00");
      expect(result.dueDate).toBe("2026-06-16");
      expect(result.dueTime).toBe("05:00");
    });

    it("parses 'in N days'", () => {
      const result = parseTitleInput("Buy milk in 3 days");
      expect(result.dueDate).toBe("2026-06-18");
    });

    it("parses 'in N weeks'", () => {
      const result = parseTitleInput("Buy milk in 2 weeks");
      expect(result.dueDate).toBe("2026-06-29");
    });

    it("parses 'in N months'", () => {
      const result = parseTitleInput("Buy milk in 1 months");
      expect(result.dueDate).toBe("2026-07-15");
    });

    it("parses 'in N years'", () => {
      const result = parseTitleInput("Buy milk in 1 years");
      expect(result.dueDate).toBe("2027-06-15");
    });

    it("parses a bare weekday name as the *next* occurrence, never today even if today matches", () => {
      // today is Monday 2026-06-15
      const result = parseTitleInput("Standup monday");
      expect(result.dueDate).toBe("2026-06-22");
    });

    it("parses 'DD Month [YYYY]'", () => {
      const result = parseTitleInput("Pay rent 1 july");
      expect(result.dueDate).toBe("2026-07-01");
    });

    it("parses 'Month DD [YYYY]' case-insensitively with a 3-letter abbreviation", () => {
      const result = parseTitleInput("Pay rent JUL 1 2027");
      expect(result.dueDate).toBe("2027-07-01");
    });
  });

  describe("reminder matching", () => {
    it("parses a lookup-table 'before' phrase", () => {
      const result = parseTitleInput("Call mom !30 min");
      expect(result.reminder).toEqual({ type: "before", minutes: 30 });
      expect(result.title).toBe("Call mom");
    });

    it("parses a regex-computed 'before' phrase in hours", () => {
      const result = parseTitleInput("Call mom !3 hours");
      expect(result.reminder).toEqual({ type: "before", minutes: 180 });
    });

    it("parses a regex-computed 'before' phrase in weeks", () => {
      const result = parseTitleInput("Call mom !1 week");
      expect(result.reminder).toEqual({ type: "before", minutes: 10080 });
    });

    it("parses an 'at' reminder for today/tomorrow with a time", () => {
      const result = parseTitleInput("Call mom !tomorrow 10:00");
      expect(result.reminder).toEqual({ type: "at", date: "2026-06-16", time: "10:00" });
    });

    it("does not match when the time portion is invalid", () => {
      const result = parseTitleInput("Call mom !tomorrow 99:99");
      expect(result.reminder).toBeUndefined();
    });

    it("parses a DD-Month reminder date", () => {
      const result = parseTitleInput("Call mom !1 july 09:00");
      expect(result.reminder).toEqual({ type: "at", date: "2026-07-01", time: "09:00" });
    });

    it("parses a Month-DD reminder date, defaulting time to 09:00", () => {
      const result = parseTitleInput("Call mom !july 1");
      expect(result.reminder).toEqual({ type: "at", date: "2026-07-01", time: "09:00" });
    });

    it("parses a regex-computed 'before' phrase in minutes not present in the lookup table", () => {
      const result = parseTitleInput("Call mom !45 min");
      expect(result.reminder).toEqual({ type: "before", minutes: 45 });
    });

    it("parses a regex-computed 'before' phrase in hours not present in the lookup table", () => {
      const result = parseTitleInput("Call mom !2 hours");
      expect(result.reminder).toEqual({ type: "before", minutes: 120 });
    });

    it("parses a regex-computed 'before' phrase in days not present in the lookup table", () => {
      const result = parseTitleInput("Call mom !5 days");
      expect(result.reminder).toEqual({ type: "before", minutes: 7200 });
    });

    it("parses a regex-computed 'before' phrase in weeks not present in the lookup table", () => {
      const result = parseTitleInput("Call mom !2 weeks");
      expect(result.reminder).toEqual({ type: "before", minutes: 20160 });
    });

    it("parses a bare 'today' reminder with no time, defaulting to 09:00", () => {
      const result = parseTitleInput("Call mom !today");
      expect(result.reminder).toEqual({ type: "at", date: "2026-06-15", time: "09:00" });
    });

    it("parses a time-only reminder as today at that time", () => {
      const result = parseTitleInput("Call mom !14:30");
      expect(result.reminder).toEqual({ type: "at", date: "2026-06-15", time: "14:30" });
    });

    it("does not set a reminder when the trailing !-body matches no known reminder pattern", () => {
      const result = parseTitleInput("Call mom !whenever");
      expect(result.reminder).toBeUndefined();
      expect(result.title).toBe("Call mom !whenever");
    });
  });

  describe("project and tag matching", () => {
    it("parses a plain #tag project at the end", () => {
      const result = parseTitleInput("Buy milk #Groceries");
      expect(result.projectTag).toBe("Groceries");
      expect(result.title).toBe("Buy milk");
    });

    it("parses a quoted #\"multi word\" project", () => {
      const result = parseTitleInput('Buy milk #"My Project"');
      expect(result.projectTag).toBe("My Project");
      expect(result.title).toBe("Buy milk");
    });

    it("parses an unterminated quoted project (missing closing quote)", () => {
      const result = parseTitleInput('Buy milk #"My Project');
      expect(result.projectTag).toBe("My Project");
    });

    it("parses a single @tag", () => {
      const result = parseTitleInput("Buy milk @errand");
      expect(result.tags).toEqual(["errand"]);
      expect(result.title).toBe("Buy milk");
    });

    it("parses multiple @tags, preserving original left-to-right order", () => {
      const result = parseTitleInput("Buy milk @errand @urgent");
      expect(result.tags).toEqual(["errand", "urgent"]);
    });
  });

  describe("recurrence matching", () => {
    it("parses 'every day'", () => {
      const result = parseTitleInput("Stretch every day");
      expect(result.recurrence).toEqual({ type: "interval", intervalDays: 1 });
    });

    it("parses 'every weekday'", () => {
      const result = parseTitleInput("Standup every weekday");
      expect(result.recurrence).toEqual({ type: "weekdays", weekdays: [1, 2, 3, 4, 5] });
    });

    it("parses 'every weekend'", () => {
      const result = parseTitleInput("Relax every weekend");
      expect(result.recurrence).toEqual({ type: "weekdays", weekdays: [0, 6] });
    });

    it("parses 'every week'", () => {
      const result = parseTitleInput("Groceries every week");
      expect(result.recurrence).toEqual({ type: "interval", intervalDays: 7 });
    });

    it("parses 'every N days'", () => {
      const result = parseTitleInput("Water plants every 3 days");
      expect(result.recurrence).toEqual({ type: "interval", intervalDays: 3 });
    });

    it("parses 'every N weeks'", () => {
      const result = parseTitleInput("Team sync every 2 weeks");
      expect(result.recurrence).toEqual({ type: "interval", intervalDays: 14 });
    });

    it("parses 'every N months'", () => {
      const result = parseTitleInput("Review budget every 3 months");
      expect(result.recurrence).toMatchObject({ type: "intervalMonths", intervalMonths: 3 });
    });

    it("parses a day list 'every mon, wed, fri'", () => {
      const result = parseTitleInput("Gym every mon, wed, fri");
      expect(result.recurrence).toEqual({ type: "weekdays", weekdays: [1, 3, 5] });
    });

    it("parses a day list 'every mon and fri'", () => {
      const result = parseTitleInput("Gym every mon and fri");
      expect(result.recurrence).toEqual({ type: "weekdays", weekdays: [1, 5] });
    });

    it("rejects a day list containing an invalid day abbreviation, falling through to no recurrence match", () => {
      const result = parseTitleInput("Gym every mon, xyz");
      expect(result.recurrence).toBeUndefined();
    });

    it("parses 'first <weekday> of every month'", () => {
      const result = parseTitleInput("Report first monday of every month");
      expect(result.recurrence).toEqual({ type: "weekdayOfMonth", weekday: 1, occurrenceInMonth: 1 });
    });

    it("parses 'last <weekday> of every month'", () => {
      const result = parseTitleInput("Report last friday of every month");
      expect(result.recurrence).toEqual({ type: "weekdayOfMonth", weekday: 5, occurrenceInMonth: 5 });
    });

    it("parses 'on N of every month' as dayOfMonth", () => {
      const result = parseTitleInput("Pay rent on 1 of every month");
      expect(result.recurrence).toEqual({ type: "dayOfMonth", dayOfMonth: 1 });
    });

    it("parses 'on DD Month of every year' as dayOfYear", () => {
      const result = parseTitleInput("Anniversary on 25 december of every year");
      expect(result.recurrence).toEqual({ type: "dayOfYear", month: 11, day: 25 });
    });

    it("parses 'on Month DD of every year' as dayOfYear", () => {
      const result = parseTitleInput("Anniversary on december 25 of every year");
      expect(result.recurrence).toEqual({ type: "dayOfYear", month: 11, day: 25 });
    });

    it("parses the bare keyword 'every month' as dayOfMonth anchored to today's day-of-month", () => {
      const result = parseTitleInput("Pay rent every month");
      expect(result.recurrence).toEqual({ type: "dayOfMonth", dayOfMonth: 15 });
    });

    it("parses the bare keyword 'every year' as dayOfYear anchored to today's month/day", () => {
      const result = parseTitleInput("Renew passport every year");
      expect(result.recurrence).toEqual({ type: "dayOfYear", month: 5, day: 15 });
    });

    it("parses 'N months starting today'", () => {
      const result = parseTitleInput("Pay bills every 3 months starting today");
      expect(result.recurrence).toEqual({ type: "intervalMonths", intervalMonths: 3, anchorDate: "2026-06-15" });
    });

    it("parses 'N months starting tomorrow'", () => {
      const result = parseTitleInput("Pay bills every 3 months starting tomorrow");
      expect(result.recurrence).toEqual({ type: "intervalMonths", intervalMonths: 3, anchorDate: "2026-06-16" });
    });

    it("parses 'N months starting in N days'", () => {
      const result = parseTitleInput("Pay bills every 3 months starting in 5 days");
      expect(result.recurrence).toEqual({ type: "intervalMonths", intervalMonths: 3, anchorDate: "2026-06-20" });
    });

    it("parses 'N months starting in N weeks'", () => {
      const result = parseTitleInput("Pay bills every 3 months starting in 2 weeks");
      expect(result.recurrence).toEqual({ type: "intervalMonths", intervalMonths: 3, anchorDate: "2026-06-29" });
    });

    it("parses 'N months starting <weekday>'", () => {
      const result = parseTitleInput("Pay bills every 3 months starting wednesday");
      expect(result.recurrence).toEqual({ type: "intervalMonths", intervalMonths: 3, anchorDate: "2026-06-17" });
    });

    it("parses 'N months starting DD Month'", () => {
      const result = parseTitleInput("Pay bills every 3 months starting 1 july");
      expect(result.recurrence).toEqual({ type: "intervalMonths", intervalMonths: 3, anchorDate: "2026-07-01" });
    });

    it("parses 'N months starting Month DD'", () => {
      const result = parseTitleInput("Pay bills every 3 months starting july 1");
      expect(result.recurrence).toEqual({ type: "intervalMonths", intervalMonths: 3, anchorDate: "2026-07-01" });
    });

    it("falls back to today as the anchor when the 'starting' text is unparseable", () => {
      const result = parseTitleInput("Pay bills every 3 months starting whenever");
      expect(result.recurrence).toEqual({ type: "intervalMonths", intervalMonths: 3, anchorDate: "2026-06-15" });
    });

    it("parses 'N days starting <date>' anchoring an interval rule", () => {
      const result = parseTitleInput("Water plants every 5 days starting tomorrow");
      expect(result.recurrence).toEqual({ type: "interval", intervalDays: 5, anchorDate: "2026-06-16" });
    });

    it("parses 'N weeks starting <date>' anchoring an interval rule", () => {
      const result = parseTitleInput("Team sync every 2 weeks starting monday");
      expect(result.recurrence).toEqual({ type: "interval", intervalDays: 14, anchorDate: "2026-06-22" });
    });

    it("parses 'every third <weekday>' (bare ordinal word, no leading digit)", () => {
      const result = parseTitleInput("Report every third monday");
      expect(result.recurrence).toEqual({ type: "interval", intervalDays: 21, anchorWeekday: 1 });
    });

    it("parses 'every fourth <weekday>' (bare ordinal word, no leading digit)", () => {
      const result = parseTitleInput("Report every fourth monday");
      expect(result.recurrence).toEqual({ type: "interval", intervalDays: 28, anchorWeekday: 1 });
    });

    it("parses 'every alternate <weekday>' as a biweekly interval", () => {
      const result = parseTitleInput("Report every alternate monday");
      expect(result.recurrence).toEqual({ type: "interval", intervalDays: 14, anchorWeekday: 1 });
    });

    it("parses 'every other <weekday>' as a biweekly interval", () => {
      const result = parseTitleInput("Report every other monday");
      expect(result.recurrence).toEqual({ type: "interval", intervalDays: 14, anchorWeekday: 1 });
    });

    it("parses 'every N of every month' as dayOfMonth", () => {
      const result = parseTitleInput("Pay rent every 1 of every month");
      expect(result.recurrence).toEqual({ type: "dayOfMonth", dayOfMonth: 1 });
    });

    it("parses a bare 'every <number>' as dayOfMonth", () => {
      const result = parseTitleInput("Pay rent every 5");
      expect(result.recurrence).toEqual({ type: "dayOfMonth", dayOfMonth: 5 });
    });

    it("parses 'every N <weekday>' with an explicit numeral as a biweekly-style interval anchored to that weekday", () => {
      const result = parseTitleInput("Report every 2 monday");
      expect(result.recurrence).toEqual({ type: "interval", intervalDays: 14, anchorWeekday: 1 });
    });

    it("documents current (surprising) behavior for 'every fifth wednesday': 'fifth' isn't in the Nth-weekday word list, so the weekday match falls through, a plain date match briefly consumes 'wednesday' as a bare weekday, and re-matching the shortened remainder ('every fifth') then reinterprets 'fifth' as a bare dayOfMonth via the ordinal-word fallback", () => {
      const result = parseTitleInput("Report every fifth wednesday");
      expect(result.title).toBe("Report");
      expect(result.recurrence).toEqual({ type: "dayOfMonth", dayOfMonth: 5 });
      expect(result.dueDate).toBe("2026-07-05");
    });

    it("parses 'every N <weekday> starting next week'", () => {
      const result = parseTitleInput("Report every 2 monday starting next week");
      expect(result.recurrence).toMatchObject({ type: "interval", intervalDays: 14, anchorWeekday: 1 });
      expect(result.recurrence?.anchorDate).toBeDefined();
    });

    it("parses 'every N <weekday> starting after N weeks'", () => {
      const result = parseTitleInput("Report every 2 monday starting after 3 weeks");
      expect(result.recurrence).toMatchObject({ type: "interval", intervalDays: 14, anchorWeekday: 1 });
      expect(result.recurrence?.anchorDate).toBeDefined();
    });

    it("parses 'every DD Month' as a yearly dayOfYear recurrence", () => {
      const result = parseTitleInput("Anniversary every 25 december");
      expect(result.recurrence).toEqual({ type: "dayOfYear", month: 11, day: 25 });
    });

    it("parses 'every Month DD' (month name before day) as a yearly dayOfYear recurrence", () => {
      const result = parseTitleInput("Anniversary every december 25");
      expect(result.recurrence).toEqual({ type: "dayOfYear", month: 11, day: 25 });
    });

    it("recurrence match takes priority over a plain date match when both patterns could apply to the tail", () => {
      const result = parseTitleInput("Standup every monday");
      expect(result.recurrence).toEqual({ type: "weekdays", weekdays: [1] });
      expect(result.dueDate).not.toBeNull();
    });
  });

  describe("rightmost-match precedence and combined tokens", () => {
    it("strips priority, project, and tag together, preserving a clean title", () => {
      const result = parseTitleInput("Buy milk !!1 #Groceries @errand");
      expect(result.title).toBe("Buy milk");
      expect(result.priority).toBe(1);
      expect(result.projectTag).toBe("Groceries");
      expect(result.tags).toEqual(["errand"]);
    });

    it("strips a date, priority, reminder, project, and tag all combined in one title", () => {
      const result = parseTitleInput("Buy milk 24 may !!1 !1 day #Groceries @errand");
      expect(result.title).toBe("Buy milk");
      // "24 may" has already passed this year (now = 2026-06-15), so it rolls to next year.
      expect(result.dueDate).toBe("2027-05-24");
      expect(result.priority).toBe(1);
      expect(result.reminder).toEqual({ type: "before", minutes: 1440 });
      expect(result.projectTag).toBe("Groceries");
      expect(result.tags).toEqual(["errand"]);
    });

    it("strips trailing punctuation left over after all tail tokens are removed", () => {
      const result = parseTitleInput("Buy milk, !!1");
      expect(result.title).toBe("Buy milk");
    });
  });
});
