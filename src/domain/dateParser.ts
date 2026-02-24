import type { TaskPriority, RecurrenceRule } from "./taskTypes";

// ── Public types ────────────────────────────────────────

export interface ParsedInput {
  title: string;
  dueDate: string | null;
  dueTime?: string;
  recurrence?: RecurrenceRule;
  priority?: TaskPriority;
  /** Span [start, end) of schedule text (date or recurrence) in the raw input */
  scheduleSpan?: [number, number];
  /** Span [start, end) of !!N priority text in the raw input */
  prioritySpan?: [number, number];
}

// ── Constants ───────────────────────────────────────────

const MONTH_MAP: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

const DAY_MAP: Record<string, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

const MONTH_RE =
  "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?" +
  "|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";

const DAY_RE =
  "mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?" +
  "|fri(?:day)?|sat(?:urday)?|sun(?:day)?";

const TIME_TAIL = "(?:\\s+(?:at\\s+)?(\\d{1,2}:\\d{2}))?";

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  "twenty-one": 21, "twenty-two": 22, "twenty-three": 23,
  "twenty-four": 24, "twenty-five": 25, "twenty-six": 26,
  "twenty-seven": 27, "twenty-eight": 28, "twenty-nine": 29,
  thirty: 30, "thirty-one": 31,
};

const ORDINAL_WORDS: Record<string, number> = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5,
  sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
  eleventh: 11, twelfth: 12, thirteenth: 13, fourteenth: 14, fifteenth: 15,
  sixteenth: 16, seventeenth: 17, eighteenth: 18, nineteenth: 19, twentieth: 20,
  alternate: 2, other: 2,
};

const DAY_NAMES_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// ── Low-level helpers ───────────────────────────────────

function re(pattern: string): RegExp {
  return new RegExp(pattern, "i");
}

function toDateStr(d: Date): string {
  return (
    `${d.getFullYear()}-` +
    `${String(d.getMonth() + 1).padStart(2, "0")}-` +
    `${String(d.getDate()).padStart(2, "0")}`
  );
}

function parseTime(s: string): string | undefined {
  const [hStr, mStr] = s.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59)
    return undefined;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function cleanTitle(raw: string): string {
  return raw.replace(/[\s.,;:!?-]+$/, "").trim();
}

function nextWeekday(dayIdx: number): Date {
  const now = new Date();
  let diff = dayIdx - now.getDay();
  if (diff <= 0) diff += 7;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff);
}

function nextMonthDay(month: number, day: number, year?: number): Date {
  if (year != null) return new Date(year, month, day);
  const now = new Date();
  const thisYear = new Date(now.getFullYear(), month, day);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return thisYear >= today
    ? thisYear
    : new Date(now.getFullYear() + 1, month, day);
}

function parseNumberOrWord(s: string): number | null {
  const lower = s.toLowerCase().trim();
  const numMatch = lower.match(/^(\d+)(?:st|nd|rd|th)?$/);
  if (numMatch) return parseInt(numMatch[1], 10);
  if (lower in NUMBER_WORDS) return NUMBER_WORDS[lower];
  if (lower in ORDINAL_WORDS) return ORDINAL_WORDS[lower];
  return null;
}

function ordinalSuffix(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function parseDayList(text: string): number[] | null {
  const parts = text.split(/\s*[,&]\s*|\s+and\s+/i);
  const days: number[] = [];
  for (const part of parts) {
    const trimmed = part.trim().toLowerCase();
    if (!trimmed) continue;
    const abbrev = trimmed.substring(0, 3);
    if (abbrev in DAY_MAP) {
      days.push(DAY_MAP[abbrev]);
    } else {
      return null;
    }
  }
  return days.length > 0 ? [...new Set(days)] : null;
}

// ── Next-occurrence computation ─────────────────────────

export function computeNextOccurrence(rule: RecurrenceRule): Date {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (rule.type) {
    case "weekdays": {
      for (let offset = 0; offset <= 7; offset++) {
        const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
        if (rule.weekdays!.includes(d.getDay())) return d;
      }
      return today;
    }
    case "interval": {
      if (rule.anchorWeekday != null) {
        let diff = rule.anchorWeekday - today.getDay();
        if (diff < 0) diff += 7;
        if (diff === 0) return today;
        return new Date(today.getFullYear(), today.getMonth(), today.getDate() + diff);
      }
      return today;
    }
    case "dayOfMonth": {
      const day = rule.dayOfMonth!;
      const thisMonth = new Date(today.getFullYear(), today.getMonth(), day);
      if (thisMonth >= today) return thisMonth;
      return new Date(today.getFullYear(), today.getMonth() + 1, day);
    }
    case "dayOfYear": {
      const thisYear = new Date(today.getFullYear(), rule.month!, rule.day!);
      if (thisYear >= today) return thisYear;
      return new Date(today.getFullYear() + 1, rule.month!, rule.day!);
    }
    default:
      return today;
  }
}

/**
 * Given the current due date of a recurring task, compute the next occurrence
 * (strictly after the current date). Falls back to computeNextOccurrence if
 * the one-step advance still lands in the past (e.g. task was long overdue).
 */
export function advanceRecurrence(
  rule: RecurrenceRule,
  currentDueDate: string,
): string {
  const [y, m, d] = currentDueDate.split("-").map(Number);
  const current = new Date(y, m - 1, d);
  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  let next: Date;

  switch (rule.type) {
    case "weekdays": {
      next = current;
      for (let offset = 1; offset <= 7; offset++) {
        const candidate = new Date(
          current.getFullYear(),
          current.getMonth(),
          current.getDate() + offset,
        );
        if (rule.weekdays!.includes(candidate.getDay())) {
          next = candidate;
          break;
        }
      }
      break;
    }
    case "interval": {
      next = new Date(
        current.getFullYear(),
        current.getMonth(),
        current.getDate() + rule.intervalDays!,
      );
      break;
    }
    case "dayOfMonth": {
      next = new Date(current.getFullYear(), current.getMonth() + 1, rule.dayOfMonth!);
      break;
    }
    case "dayOfYear": {
      next = new Date(current.getFullYear() + 1, rule.month!, rule.day!);
      break;
    }
    default:
      next = new Date(current.getFullYear(), current.getMonth(), current.getDate() + 1);
  }

  if (next < todayMidnight) {
    next = computeNextOccurrence(rule);
  }

  return toDateStr(next);
}

// ── Formatting helpers ──────────────────────────────────

export function formatDateHint(dateStr: string, timeStr?: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const formatted = date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  return timeStr ? `${formatted} at ${timeStr}` : formatted;
}

export function formatRecurrenceHint(rule: RecurrenceRule, time?: string): string {
  let desc: string;
  switch (rule.type) {
    case "weekdays":
      desc = "Every " + rule.weekdays!.map((d) => DAY_NAMES_SHORT[d]).join(", ");
      break;
    case "interval":
      if (rule.anchorWeekday != null && rule.intervalDays! % 7 === 0) {
        const weeks = rule.intervalDays! / 7;
        const dayName = DAY_NAMES_SHORT[rule.anchorWeekday];
        desc =
          weeks === 2
            ? `Every other ${dayName}`
            : `Every ${weeks} weeks (${dayName})`;
      } else if (rule.intervalDays === 1) {
        desc = "Every day";
      } else if (rule.intervalDays === 7) {
        desc = "Every week";
      } else {
        desc = `Every ${rule.intervalDays} days`;
      }
      break;
    case "dayOfMonth":
      desc = `Monthly on the ${ordinalSuffix(rule.dayOfMonth!)}`;
      break;
    case "dayOfYear":
      desc = `Yearly on ${MONTH_NAMES_SHORT[rule.month!]} ${rule.day}`;
      break;
    default:
      desc = "Recurring";
  }
  if (time) desc += ` at ${time}`;
  return desc;
}

export function formatRecurrenceShort(rule: RecurrenceRule): string {
  switch (rule.type) {
    case "weekdays":
      return "Every " + rule.weekdays!.map((d) => DAY_NAMES_SHORT[d]).join(", ");
    case "interval":
      if (rule.anchorWeekday != null && rule.intervalDays! % 7 === 0) {
        const weeks = rule.intervalDays! / 7;
        const dayName = DAY_NAMES_SHORT[rule.anchorWeekday];
        return weeks === 2 ? `Every other ${dayName}` : `Every ${weeks}w (${dayName})`;
      }
      if (rule.intervalDays === 1) return "Daily";
      if (rule.intervalDays === 7) return "Weekly";
      return `Every ${rule.intervalDays}d`;
    case "dayOfMonth":
      return `Monthly (${ordinalSuffix(rule.dayOfMonth!)})`;
    case "dayOfYear":
      return `Yearly (${MONTH_NAMES_SHORT[rule.month!]} ${rule.day})`;
    default:
      return "Recurring";
  }
}

// ── Internal match types ────────────────────────────────

interface DateMatch {
  prefix: string;
  dueDate: string;
  dueTime?: string;
}

interface RecurrenceMatch {
  prefix: string;
  recurrence: RecurrenceRule;
  dueTime?: string;
}

interface PriorityMatch {
  prefix: string;
  priority: TaskPriority;
}

// ── Priority matcher ────────────────────────────────────

function tryMatchPriority(input: string): PriorityMatch | null {
  const m = input.match(/^(.*?)\s+!!([1-4])\s*$/);
  if (!m) return null;
  return {
    prefix: m[1],
    priority: parseInt(m[2], 10) as TaskPriority,
  };
}

// ── Date matcher ────────────────────────────────────────

function tryMatchDate(input: string): DateMatch | null {
  let m: RegExpMatchArray | null;

  m = input.match(
    re(`^(.*?)\\s+in\\s+(\\d+)\\s+(days?|weeks?|months?|years?)${TIME_TAIL}\\s*$`),
  );
  if (m) {
    const n = parseInt(m[2], 10);
    const unit = m[3].toLowerCase().replace(/s$/, "");
    const time = m[4] ? parseTime(m[4]) : undefined;
    const now = new Date();
    let d: Date;
    if (unit === "day")
      d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + n);
    else if (unit === "week")
      d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + n * 7);
    else if (unit === "month")
      d = new Date(now.getFullYear(), now.getMonth() + n, now.getDate());
    else d = new Date(now.getFullYear() + n, now.getMonth(), now.getDate());
    return { prefix: m[1], dueDate: toDateStr(d), dueTime: time };
  }

  m = input.match(
    re(`^(.*?)[.,;]?\\s+(\\d{1,2})\\s+(${MONTH_RE})(?:\\s+(\\d{4}))?${TIME_TAIL}\\s*$`),
  );
  if (m) {
    const day = parseInt(m[2], 10);
    const mi = MONTH_MAP[m[3].toLowerCase().substring(0, 3)];
    if (mi != null) {
      const year = m[4] ? parseInt(m[4], 10) : undefined;
      const time = m[5] ? parseTime(m[5]) : undefined;
      return { prefix: m[1], dueDate: toDateStr(nextMonthDay(mi, day, year)), dueTime: time };
    }
  }

  m = input.match(
    re(`^(.*?)[.,;]?\\s+(${MONTH_RE})\\s+(\\d{1,2})(?:\\s+(\\d{4}))?${TIME_TAIL}\\s*$`),
  );
  if (m) {
    const mi = MONTH_MAP[m[2].toLowerCase().substring(0, 3)];
    const day = parseInt(m[3], 10);
    if (mi != null) {
      const year = m[4] ? parseInt(m[4], 10) : undefined;
      const time = m[5] ? parseTime(m[5]) : undefined;
      return { prefix: m[1], dueDate: toDateStr(nextMonthDay(mi, day, year)), dueTime: time };
    }
  }

  m = input.match(re(`^(.*?)\\s+(today|tomorrow|tod|tom)${TIME_TAIL}\\s*$`));
  if (m) {
    const word = m[2].toLowerCase();
    const offset = word === "tomorrow" || word === "tom" ? 1 : 0;
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    const time = m[3] ? parseTime(m[3]) : undefined;
    return { prefix: m[1], dueDate: toDateStr(d), dueTime: time };
  }

  m = input.match(re(`^(.*?)\\s+(${DAY_RE})${TIME_TAIL}\\s*$`));
  if (m) {
    const di = DAY_MAP[m[2].toLowerCase().substring(0, 3)];
    if (di != null) {
      const time = m[3] ? parseTime(m[3]) : undefined;
      return { prefix: m[1], dueDate: toDateStr(nextWeekday(di)), dueTime: time };
    }
  }

  return null;
}

// ── Recurrence matcher ──────────────────────────────────

function tryMatchRecurrence(input: string): RecurrenceMatch | null {
  let m: RegExpMatchArray | null;

  // "on X of every month/year [at TIME]"
  m = input.match(
    re(`^(.*?)\\s+on\\s+(.+?)\\s+of\\s+every\\s+(month|year)${TIME_TAIL}\\s*$`),
  );
  if (m) {
    const xText = m[2].trim();
    const scope = m[3].toLowerCase();
    const time = m[4] ? parseTime(m[4]) : undefined;
    if (scope === "month") {
      const num = parseNumberOrWord(xText);
      if (num && num >= 1 && num <= 31) {
        return { prefix: m[1], recurrence: { type: "dayOfMonth", dayOfMonth: num }, dueTime: time };
      }
    } else {
      // "on DD Month of every year"
      let dm = xText.match(re(`^(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_RE})$`));
      if (dm) {
        const day = parseInt(dm[1], 10);
        const mi = MONTH_MAP[dm[2].toLowerCase().substring(0, 3)];
        if (mi != null && day >= 1 && day <= 31) {
          return { prefix: m[1], recurrence: { type: "dayOfYear", month: mi, day }, dueTime: time };
        }
      }
      dm = xText.match(re(`^(${MONTH_RE})\\s+(\\d{1,2})(?:st|nd|rd|th)?$`));
      if (dm) {
        const mi = MONTH_MAP[dm[1].toLowerCase().substring(0, 3)];
        const day = parseInt(dm[2], 10);
        if (mi != null && day >= 1 && day <= 31) {
          return { prefix: m[1], recurrence: { type: "dayOfYear", month: mi, day }, dueTime: time };
        }
      }
    }
  }

  // "every X of every month [at TIME]"
  m = input.match(
    re(`^(.*?)\\s+every\\s+(.+?)\\s+of\\s+every\\s+month${TIME_TAIL}\\s*$`),
  );
  if (m) {
    const num = parseNumberOrWord(m[2].trim());
    const time = m[3] ? parseTime(m[3]) : undefined;
    if (num && num >= 1 && num <= 31) {
      return { prefix: m[1], recurrence: { type: "dayOfMonth", dayOfMonth: num }, dueTime: time };
    }
  }

  // "every <body> [at TIME]"
  m = input.match(re(`^(.*?)\\s+every\\s+(.+?)${TIME_TAIL}\\s*$`));
  if (!m) return null;

  const prefix = m[1];
  const body = m[2].trim();
  const time = m[3] ? parseTime(m[3]) : undefined;

  // ─ Special keywords ─
  if (/^day$/i.test(body))
    return { prefix, recurrence: { type: "interval", intervalDays: 1 }, dueTime: time };
  if (/^weekday$/i.test(body))
    return { prefix, recurrence: { type: "weekdays", weekdays: [1, 2, 3, 4, 5] }, dueTime: time };
  if (/^weekend$/i.test(body))
    return { prefix, recurrence: { type: "weekdays", weekdays: [0, 6] }, dueTime: time };
  if (/^week$/i.test(body))
    return { prefix, recurrence: { type: "interval", intervalDays: 7 }, dueTime: time };
  if (/^month$/i.test(body)) {
    return {
      prefix,
      recurrence: { type: "dayOfMonth", dayOfMonth: new Date().getDate() },
      dueTime: time,
    };
  }
  if (/^year$/i.test(body)) {
    const now = new Date();
    return {
      prefix,
      recurrence: { type: "dayOfYear", month: now.getMonth(), day: now.getDate() },
      dueTime: time,
    };
  }

  // ─ "N days/weeks" ─
  const intervalM = body.match(re(`^(\\d+)\\s+(days?|weeks?)$`));
  if (intervalM) {
    const n = parseInt(intervalM[1], 10);
    if (n > 0) {
      const unit = intervalM[2].toLowerCase().replace(/s$/, "");
      return {
        prefix,
        recurrence: { type: "interval", intervalDays: unit === "week" ? n * 7 : n },
        dueTime: time,
      };
    }
  }

  // ─ "Nth / alternate / other <dayname>" ─
  const nthRE = `^(?:(\\d+)(?:st|nd|rd|th)?|alternate|other|second|third|fourth)\\s+(${DAY_RE})$`;
  const nthM = body.match(re(nthRE));
  if (nthM) {
    let n: number;
    if (nthM[1]) {
      n = parseInt(nthM[1], 10);
    } else {
      const word = body.split(/\s+/)[0].toLowerCase();
      n =
        word === "third" ? 3
        : word === "fourth" ? 4
        : 2;
    }
    const dayIdx = DAY_MAP[nthM[2].toLowerCase().substring(0, 3)];
    if (dayIdx != null && n > 0) {
      return {
        prefix,
        recurrence: { type: "interval", intervalDays: n * 7, anchorWeekday: dayIdx },
        dueTime: time,
      };
    }
  }

  // ─ Day list: "mon, tue, fri" / "mon and fri" ─
  const dayList = parseDayList(body);
  if (dayList) {
    return { prefix, recurrence: { type: "weekdays", weekdays: dayList }, dueTime: time };
  }

  // ─ "DD Month" / "Month DD" (day of year) ─
  let dym = body.match(re(`^(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_RE})$`));
  if (dym) {
    const day = parseInt(dym[1], 10);
    const mi = MONTH_MAP[dym[2].toLowerCase().substring(0, 3)];
    if (mi != null && day >= 1 && day <= 31)
      return { prefix, recurrence: { type: "dayOfYear", month: mi, day }, dueTime: time };
  }
  dym = body.match(re(`^(${MONTH_RE})\\s+(\\d{1,2})(?:st|nd|rd|th)?$`));
  if (dym) {
    const mi = MONTH_MAP[dym[1].toLowerCase().substring(0, 3)];
    const day = parseInt(dym[2], 10);
    if (mi != null && day >= 1 && day <= 31)
      return { prefix, recurrence: { type: "dayOfYear", month: mi, day }, dueTime: time };
  }

  // ─ "Nth / N / word" → day of month ─
  const dayOfMonthBody = body.replace(/\s+of\s+every\s+month$/i, "").trim();
  const num = parseNumberOrWord(dayOfMonthBody);
  if (num && num >= 1 && num <= 31) {
    return { prefix, recurrence: { type: "dayOfMonth", dayOfMonth: num }, dueTime: time };
  }

  return null;
}

// ── Unified schedule matcher (recurrence OR date) ───────

type ScheduleMatch =
  | { kind: "date"; match: DateMatch }
  | { kind: "recurrence"; match: RecurrenceMatch };

function tryMatchSchedule(input: string): ScheduleMatch | null {
  const rec = tryMatchRecurrence(input);
  if (rec) return { kind: "recurrence", match: rec };
  const date = tryMatchDate(input);
  if (date) return { kind: "date", match: date };
  return null;
}

// ── Main parser ─────────────────────────────────────────

/**
 * Parses schedule (date/time OR recurrence), and priority from the tail
 * of a task title. Both can appear at the end in either order.
 */
export function parseTitleInput(rawTitle: string): ParsedInput {
  const firstNonWs = rawTitle.search(/\S/);
  if (firstNonWs === -1) return { title: "", dueDate: null };
  const input = rawTitle.trim();

  let scheduleResult: ScheduleMatch | null = null;
  let priorityMatch: PriorityMatch | null = null;
  let scheduleSpan: [number, number] | undefined;
  let prioritySpan: [number, number] | undefined;
  let titlePrefix = input;

  // Strategy 1: priority at the very end, then schedule on the remainder
  const p1 = tryMatchPriority(input);
  if (p1) {
    priorityMatch = p1;
    prioritySpan = [firstNonWs + p1.prefix.length, firstNonWs + input.length];
    titlePrefix = p1.prefix;

    const s1 = tryMatchSchedule(p1.prefix);
    if (s1) {
      scheduleResult = s1;
      const schPrefix = s1.kind === "date" ? s1.match.prefix : s1.match.prefix;
      scheduleSpan = [firstNonWs + schPrefix.length, firstNonWs + p1.prefix.length];
      titlePrefix = schPrefix;
    }
  }

  // Strategy 2: schedule at the very end (only if none found yet)
  if (!scheduleResult) {
    const s2 = tryMatchSchedule(input);
    if (s2) {
      scheduleResult = s2;
      const schPrefix = s2.kind === "date" ? s2.match.prefix : s2.match.prefix;
      scheduleSpan = [firstNonWs + schPrefix.length, firstNonWs + input.length];

      if (!priorityMatch) {
        titlePrefix = schPrefix;
        const p2 = tryMatchPriority(schPrefix);
        if (p2) {
          priorityMatch = p2;
          prioritySpan = [firstNonWs + p2.prefix.length, firstNonWs + schPrefix.length];
          titlePrefix = p2.prefix;
        }
      }
    }
  }

  // Build result
  let dueDate: string | null = null;
  let dueTime: string | undefined;
  let recurrence: RecurrenceRule | undefined;

  if (scheduleResult) {
    if (scheduleResult.kind === "date") {
      dueDate = scheduleResult.match.dueDate;
      dueTime = scheduleResult.match.dueTime;
    } else {
      recurrence = scheduleResult.match.recurrence;
      dueTime = scheduleResult.match.dueTime;
      dueDate = toDateStr(computeNextOccurrence(recurrence));
    }
  }

  return {
    title: cleanTitle(titlePrefix),
    dueDate,
    dueTime,
    recurrence,
    priority: priorityMatch?.priority,
    scheduleSpan,
    prioritySpan,
  };
}
