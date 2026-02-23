import type { TaskPriority } from "./taskTypes";

export interface ParsedInput {
  title: string;
  dueDate: string | null;
  dueTime?: string;
  priority?: TaskPriority;
  /** Span [start, end) of date/time text in the original input */
  dateSpan?: [number, number];
  /** Span [start, end) of !!N text in the original input */
  prioritySpan?: [number, number];
}

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

function re(pattern: string): RegExp {
  return new RegExp(pattern, "i");
}

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

// ── Internal match helpers ──────────────────────────────

interface DateMatch {
  prefix: string;
  dueDate: string;
  dueTime?: string;
}

interface PriorityMatch {
  prefix: string;
  priority: TaskPriority;
}

function tryMatchPriority(input: string): PriorityMatch | null {
  const m = input.match(/^(.*?)\s+!!([1-4])\s*$/);
  if (!m) return null;
  return {
    prefix: m[1],
    priority: parseInt(m[2], 10) as TaskPriority,
  };
}

function tryMatchDate(input: string): DateMatch | null {
  let m: RegExpMatchArray | null;

  m = input.match(
    re(
      `^(.*?)\\s+in\\s+(\\d+)\\s+(days?|weeks?|months?|years?)${TIME_TAIL}\\s*$`,
    ),
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
    re(
      `^(.*?)[.,;]?\\s+(\\d{1,2})\\s+(${MONTH_RE})(?:\\s+(\\d{4}))?${TIME_TAIL}\\s*$`,
    ),
  );
  if (m) {
    const day = parseInt(m[2], 10);
    const mi = MONTH_MAP[m[3].toLowerCase().substring(0, 3)];
    if (mi != null) {
      const year = m[4] ? parseInt(m[4], 10) : undefined;
      const time = m[5] ? parseTime(m[5]) : undefined;
      return {
        prefix: m[1],
        dueDate: toDateStr(nextMonthDay(mi, day, year)),
        dueTime: time,
      };
    }
  }

  m = input.match(
    re(
      `^(.*?)[.,;]?\\s+(${MONTH_RE})\\s+(\\d{1,2})(?:\\s+(\\d{4}))?${TIME_TAIL}\\s*$`,
    ),
  );
  if (m) {
    const mi = MONTH_MAP[m[2].toLowerCase().substring(0, 3)];
    const day = parseInt(m[3], 10);
    if (mi != null) {
      const year = m[4] ? parseInt(m[4], 10) : undefined;
      const time = m[5] ? parseTime(m[5]) : undefined;
      return {
        prefix: m[1],
        dueDate: toDateStr(nextMonthDay(mi, day, year)),
        dueTime: time,
      };
    }
  }

  m = input.match(
    re(`^(.*?)\\s+(today|tomorrow|tod|tom)${TIME_TAIL}\\s*$`),
  );
  if (m) {
    const word = m[2].toLowerCase();
    const offset = word === "tomorrow" || word === "tom" ? 1 : 0;
    const now = new Date();
    const d = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + offset,
    );
    const time = m[3] ? parseTime(m[3]) : undefined;
    return { prefix: m[1], dueDate: toDateStr(d), dueTime: time };
  }

  m = input.match(re(`^(.*?)\\s+(${DAY_RE})${TIME_TAIL}\\s*$`));
  if (m) {
    const di = DAY_MAP[m[2].toLowerCase().substring(0, 3)];
    if (di != null) {
      const time = m[3] ? parseTime(m[3]) : undefined;
      return {
        prefix: m[1],
        dueDate: toDateStr(nextWeekday(di)),
        dueTime: time,
      };
    }
  }

  return null;
}

// ── Main parser ─────────────────────────────────────────

/**
 * Parses date/time and priority from the tail of a task title.
 *
 * Both date/time and !!N priority can appear at the end in either order.
 * If followed by extra text, neither is matched.
 */
export function parseTitleInput(rawTitle: string): ParsedInput {
  const firstNonWs = rawTitle.search(/\S/);
  if (firstNonWs === -1) return { title: "", dueDate: null };
  const input = rawTitle.trim();

  let dateMatch: DateMatch | null = null;
  let priorityMatch: PriorityMatch | null = null;
  let dateSpan: [number, number] | undefined;
  let prioritySpan: [number, number] | undefined;
  let titlePrefix = input;

  // Strategy 1: priority at the very end, then date on the remainder
  const p1 = tryMatchPriority(input);
  if (p1) {
    priorityMatch = p1;
    prioritySpan = [firstNonWs + p1.prefix.length, firstNonWs + input.length];
    titlePrefix = p1.prefix;

    const d1 = tryMatchDate(p1.prefix);
    if (d1) {
      dateMatch = d1;
      dateSpan = [firstNonWs + d1.prefix.length, firstNonWs + p1.prefix.length];
      titlePrefix = d1.prefix;
    }
  }

  // Strategy 2: date at the very end (only if no date found yet)
  if (!dateMatch) {
    const d2 = tryMatchDate(input);
    if (d2) {
      dateMatch = d2;
      dateSpan = [firstNonWs + d2.prefix.length, firstNonWs + input.length];

      if (!priorityMatch) {
        titlePrefix = d2.prefix;
        const p2 = tryMatchPriority(d2.prefix);
        if (p2) {
          priorityMatch = p2;
          prioritySpan = [
            firstNonWs + p2.prefix.length,
            firstNonWs + d2.prefix.length,
          ];
          titlePrefix = p2.prefix;
        }
      }
    }
  }

  return {
    title: cleanTitle(titlePrefix),
    dueDate: dateMatch?.dueDate ?? null,
    dueTime: dateMatch?.dueTime,
    priority: priorityMatch?.priority,
    dateSpan,
    prioritySpan,
  };
}
