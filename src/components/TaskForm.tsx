import React, { useState, useEffect, useRef, FormEvent } from "react";
import type { Task, TaskPriority, RecurrenceRule, Reminder } from "@domain/taskTypes";
import type { Project } from "@domain/projectTypes";
import {
  parseTitleInput,
  formatDateHint,
  formatRecurrenceHint,
  computeNextOccurrence,
} from "@domain/dateParser";
import { REMINDER_BEFORE_PRESETS, getReminderBeforeByMinutes } from "@domain/reminderPresets";

interface TaskFormProps {
  onAdd(task: Task): void;
  editingTask?: Task | null;
  onUpdate?(task: Task): void;
  onDelete?(id: string): void;
  onCancelEdit?(): void;
  projects?: Project[];
  defaultProjectId?: string | null;
  /** All existing tag names (for @ autocomplete). */
  allTags?: string[];
}

const DEFAULT_PRIORITY: TaskPriority = 3;
const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEKDAY_INDICES = [1, 2, 3, 4, 5, 6, 0];
const MONTH_OPTIONS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function toDateStr(d: Date): string {
  return (
    `${d.getFullYear()}-` +
    `${String(d.getMonth() + 1).padStart(2, "0")}-` +
    `${String(d.getDate()).padStart(2, "0")}`
  );
}

/** Reminder autocomplete options (text to insert after !). */
const REMINDER_AC_OPTIONS = [
  "tom 12:00", "tomorrow 12:00", "today 17:00", "17:00",
  "10 min", "30 min", "1 hour", "3 hours", "1 day", "2 days", "3 days", "1 week",
];

/**
 * Find reminder trigger at end of title: ! or !partial (for autocomplete).
 */
function parseReminderTagAtEnd(title: string): { query: string; span: [number, number] } | null {
  const m = title.match(/\s+!(\S*)$/);
  if (!m) return null;
  const start = m.index!;
  return { query: m[1], span: [start, start + m[0].length] };
}

/**
 * Find an @tag at the very end of the title (for autocomplete while typing).
 * Tag is single word (no spaces).
 */
function parseTagAtEnd(title: string): { query: string; span: [number, number] } | null {
  const m = title.match(/@([^\s@]*)$/);
  if (!m) return null;
  const start = m.index!;
  return { query: m[1], span: [start, start + m[0].length] };
}

/**
 * Find a project tag at the very end of the title (for autocomplete while typing).
 * Supports both `#word` and `#"multi word` (open quote, user still typing).
 */
function parseProjectTagAtEnd(title: string): { query: string; span: [number, number] } | null {
  // Try quoted form first: #"some text   (open) or #"some text"   (closed, at end)
  const quoted = title.match(/#"([^"]*)"?$/);
  if (quoted) {
    const start = quoted.index!;
    return { query: quoted[1], span: [start, start + quoted[0].length] };
  }
  const plain = title.match(/#(\S*)$/);
  if (!plain) return null;
  const start = plain.index!;
  return { query: plain[1], span: [start, start + plain[0].length] };
}

/** Checks whether a project name contains spaces and thus needs quoting. */
function needsQuoting(name: string): boolean {
  return name.includes(" ");
}

/** Build the tag string for a project name, quoting if it contains spaces. */
function buildTagStr(name: string): string {
  return needsQuoting(name) ? `#"${name}"` : `#${name}`;
}

/**
 * Find a `#tag` anywhere in the title. Prefers a confirmed multi-word name.
 * Supports both `#word` and `#"multi word"` (closed-quote) forms.
 */
function findProjectTagAnywhere(
  title: string,
  confirmed: { name: string } | null,
): { query: string; span: [number, number] } | null {
  if (confirmed) {
    const tagStr = buildTagStr(confirmed.name);
    const idx = title.indexOf(tagStr);
    if (idx !== -1) return { query: confirmed.name, span: [idx, idx + tagStr.length] };
  }
  // Try quoted form: #"multi word"
  const quotedRegex = /#"([^"]+)"/g;
  let lastQuoted: RegExpExecArray | null = null;
  let mq: RegExpExecArray | null;
  while ((mq = quotedRegex.exec(title)) !== null) lastQuoted = mq;
  if (lastQuoted) {
    return { query: lastQuoted[1], span: [lastQuoted.index, lastQuoted.index + lastQuoted[0].length] };
  }
  // Fall back to plain #word
  const plainRegex = /#(\S+)/g;
  let lastPlain: RegExpExecArray | null = null;
  let mp: RegExpExecArray | null;
  while ((mp = plainRegex.exec(title)) !== null) lastPlain = mp;
  if (lastPlain) return { query: lastPlain[1], span: [lastPlain.index, lastPlain.index + lastPlain[0].length] };
  return null;
}

/**
 * Strip a span from a string, removing one adjacent space to avoid doubles.
 * Returns the cleaned string and a function to map positions back to the original.
 */
function stripSpanFromTitle(
  title: string,
  span: [number, number],
): { cleaned: string; toOriginal: (pos: number) => number } {
  let [start, end] = span;
  if (end < title.length && title[end] === " ") end++;
  else if (start > 0 && title[start - 1] === " ") start--;
  const removedLen = end - start;
  const cleaned = title.substring(0, start) + title.substring(end);
  return {
    cleaned,
    toOriginal: (p: number) => (p < start ? p : p + removedLen),
  };
}

export const TaskForm: React.FC<TaskFormProps> = ({
  onAdd,
  editingTask,
  onUpdate,
  onDelete,
  onCancelEdit,
  projects = [],
  defaultProjectId,
  allTags = [],
}) => {
  const isEditMode = editingTask != null;

  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [priority, setPriority] = useState<TaskPriority>(DEFAULT_PRIORITY);
  const [whenMode, setWhenMode] = useState<"one-time" | "recurring">("one-time");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [recType, setRecType] = useState<RecurrenceRule["type"]>("weekdays");
  const [recWeekdays, setRecWeekdays] = useState<number[]>([]);
  const [recIntervalDays, setRecIntervalDays] = useState(1);
  const [recDayOfMonth, setRecDayOfMonth] = useState(1);
  const [recMonth, setRecMonth] = useState(0);
  const [recDay, setRecDay] = useState(1);
  const [scheduleOverridden, setScheduleOverridden] = useState(false);
  const [priorityOverridden, setPriorityOverridden] = useState(false);
  const [timeManuallySet, setTimeManuallySet] = useState(false);

  // Reminder state
  const [reminderType, setReminderType] = useState<"none" | "at" | "before">("none");
  const [reminderAtDate, setReminderAtDate] = useState("");
  const [reminderAtTime, setReminderAtTime] = useState("");
  const [reminderBeforeMinutes, setReminderBeforeMinutes] = useState(30);
  const [reminderOverridden, setReminderOverridden] = useState(false);

  // Project autocomplete state
  const [showAutoComplete, setShowAutoComplete] = useState(false);
  const [acHighlight, setAcHighlight] = useState(0);
  // Reminder autocomplete (when typing !)
  const [showReminderAutoComplete, setShowReminderAutoComplete] = useState(false);
  const [reminderAcHighlight, setReminderAcHighlight] = useState(0);
  // Tracks a confirmed project selection from autocomplete (handles multi-word names)
  const [confirmedProject, setConfirmedProject] = useState<{ id: string | null; name: string } | null>(null);
  // Tags added via form chips or @ in title (merged on submit)
  const [formTags, setFormTags] = useState<string[]>([]);
  // Tag autocomplete (@)
  const [showTagAutoComplete, setShowTagAutoComplete] = useState(false);
  const [tagAcHighlight, setTagAcHighlight] = useState(0);

  const titleInputRef = useRef<HTMLInputElement>(null);

  // ── Populate form for editing ──────────────────────────
  useEffect(() => {
    if (!editingTask) {
      resetForm();
      return;
    }
    setTitle(editingTask.title);
    setNotes(editingTask.notes || "");
    setPriority(editingTask.priority);
    setDueTime(editingTask.dueTime || "");
    setScheduleOverridden(true);
    setPriorityOverridden(true);
    setTimeManuallySet(!!editingTask.dueTime);
    if (editingTask.reminder) {
      if (editingTask.reminder.type === "at") {
        setReminderType("at");
        setReminderAtDate(editingTask.reminder.date);
        setReminderAtTime(editingTask.reminder.time);
        setReminderBeforeMinutes(30);
      } else {
        setReminderType("before");
        setReminderBeforeMinutes(editingTask.reminder.minutes);
        setReminderAtDate("");
        setReminderAtTime("");
      }
      setReminderOverridden(false);
    } else {
      setReminderType("none");
      setReminderAtDate("");
      setReminderAtTime("");
      setReminderBeforeMinutes(30);
      setReminderOverridden(false);
    }
    if (editingTask.recurrence) {
      setWhenMode("recurring");
      setRecType(editingTask.recurrence.type);
      setRecWeekdays(editingTask.recurrence.weekdays || []);
      setRecIntervalDays(editingTask.recurrence.intervalDays || 1);
      setRecDayOfMonth(editingTask.recurrence.dayOfMonth || 1);
      setRecMonth(editingTask.recurrence.month || 0);
      setRecDay(editingTask.recurrence.day || 1);
      setDueDate(editingTask.dueDate || "");
    } else {
      setWhenMode("one-time");
      setDueDate(editingTask.dueDate || "");
      setRecType("weekdays");
      setRecWeekdays([]);
      setRecIntervalDays(1);
      setRecDayOfMonth(1);
      setRecMonth(0);
      setRecDay(1);
    }
    setFormTags(editingTask.tags ?? []);
    requestAnimationFrame(() => {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    });
  }, [editingTask]);

  // ── Parse schedule, priority, reminder, project from tail (any order) ────────
  const rawParsed = parseTitleInput(title);
  const parsed = rawParsed;

  // Project: use parsed project when at end, else find #tag anywhere (middle of title)
  const hasProjectMatch = parsed.projectTag != null && parsed.projectSpan != null;
  const tagInTitle = hasProjectMatch
    ? { query: parsed.projectTag!, span: parsed.projectSpan! }
    : findProjectTagAnywhere(title, confirmedProject);

  const hasScheduleMatch =
    !scheduleOverridden &&
    (parsed.dueDate !== null || parsed.recurrence != null) &&
    parsed.scheduleSpan != null;
  const hasPriorityMatch = !priorityOverridden && parsed.priority != null;
  const hasReminderMatch = !reminderOverridden && parsed.reminder != null && parsed.reminderSpan != null;
  const hasTagMatch = (parsed.tags?.length ?? 0) > 0 && (parsed.tagSpans?.length ?? 0) > 0;
  const hasAnyHighlight =
    (hasScheduleMatch && parsed.scheduleSpan != null) ||
    (hasPriorityMatch && parsed.prioritySpan != null) ||
    (hasReminderMatch && parsed.reminderSpan != null) ||
    (hasProjectMatch && parsed.projectSpan != null) ||
    hasTagMatch;
  const displayPriority =
    hasPriorityMatch && parsed.priority != null ? parsed.priority : priority;

  // Effective due date/time for reminder validation (task due or parsed)
  const effectiveDueDate = hasScheduleMatch ? parsed.dueDate : dueDate || null;
  const effectiveDueTime = timeManuallySet ? dueTime : (hasScheduleMatch ? parsed.dueTime : dueTime);
  const taskHasDueDate = effectiveDueDate != null && effectiveDueDate !== "";

  // ── Project / tag / reminder autocomplete (end-anchored) ─
  const projectTag = parseProjectTagAtEnd(title);
  const tagTag = parseTagAtEnd(title);
  const reminderTag = parseReminderTagAtEnd(title);
  const acCandidates = projectTag
    ? projects.filter((p) =>
        p.name.toLowerCase().startsWith(projectTag.query.toLowerCase()),
      )
    : [];
  const showCreateOption =
    projectTag &&
    projectTag.query.length > 0 &&
    !projects.some(
      (p) => p.name.toLowerCase() === projectTag.query.toLowerCase(),
    );
  const tagAcCandidates = tagTag
    ? allTags.filter((t) =>
        t.toLowerCase().startsWith(tagTag.query.toLowerCase()),
      )
    : [];
  const showCreateTagOption =
    tagTag &&
    tagTag.query.length > 0 &&
    !allTags.some((t) => t.toLowerCase() === tagTag.query.toLowerCase());
  const reminderAcCandidates = reminderTag
    ? REMINDER_AC_OPTIONS.filter((opt) =>
        opt.toLowerCase().startsWith(reminderTag.query.toLowerCase()),
      )
    : [];

  useEffect(() => {
    const showProjectAc =
      !reminderTag &&
      !tagTag &&
      projectTag &&
      (acCandidates.length > 0 || showCreateOption);
    setShowAutoComplete(!!showProjectAc);
    setAcHighlight(0);
  }, [title]);
  useEffect(() => {
    setShowTagAutoComplete(
      !!(
        !reminderTag &&
        tagTag &&
        (tagAcCandidates.length > 0 || showCreateTagOption)
      ),
    );
    setTagAcHighlight(0);
  }, [title]);
  useEffect(() => {
    const showReminderAc =
      reminderTag &&
      (reminderTag.query === "" || reminderAcCandidates.length > 0);
    setShowReminderAutoComplete(!!showReminderAc);
    setReminderAcHighlight(0);
  }, [title]);

  // Sync reminder form state from parsed reminder when not overridden
  useEffect(() => {
    if (reminderOverridden || !parsed.reminder) return;
    if (parsed.reminder.type === "at") {
      setReminderType("at");
      setReminderAtDate(parsed.reminder.date);
      setReminderAtTime(parsed.reminder.time);
    } else {
      setReminderType("before");
      setReminderBeforeMinutes(parsed.reminder.minutes);
    }
  }, [parsed.reminder, reminderOverridden]);

  function selectProject(name: string) {
    if (!projectTag) return;
    const [start] = projectTag.span;
    const before = title.substring(0, start);
    const after = `${buildTagStr(name)} `;
    setTitle(before + after);
    setShowAutoComplete(false);
    const matched = projects.find((p) => p.name.toLowerCase() === name.toLowerCase());
    setConfirmedProject({ id: matched?.id ?? null, name });
    titleInputRef.current?.focus();
  }

  function selectReminderOption(option: string) {
    if (!reminderTag) return;
    const [start] = reminderTag.span;
    const before = title.substring(0, start);
    const after = ` !${option} `;
    setTitle(before + after);
    setShowReminderAutoComplete(false);
    setReminderOverridden(false);
    titleInputRef.current?.focus();
  }

  function selectTag(tagName: string) {
    if (!tagTag) return;
    const [start, end] = tagTag.span;
    let before = title.substring(0, start).trimEnd();
    const after = title.substring(end);
    const newTitle = (before + (after ? " " + after : "")).trim();
    setTitle(newTitle);
    setShowTagAutoComplete(false);
    setFormTags((prev) =>
      prev.includes(tagName) ? prev : [...prev, tagName],
    );
    titleInputRef.current?.focus();
  }

  function removeTag(tagToRemove: string) {
    setFormTags((prev) => prev.filter((t) => t !== tagToRemove));
    const idx = parsed.tags?.indexOf(tagToRemove) ?? -1;
    if (idx >= 0 && parsed.tagSpans?.[idx]) {
      const [s, e] = parsed.tagSpans[idx];
      let newTitle = title.substring(0, s).trimEnd() + title.substring(e).replace(/^\s+/, "");
      setTitle(newTitle.trim());
    }
  }

  // ── Handlers ────────────────────────────────────────────
  function handleTitleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const newTitle = e.target.value;
    setTitle(newTitle);
    setScheduleOverridden(false);
    setPriorityOverridden(false);
    setReminderOverridden(false);
    setTimeManuallySet(false);
    if (confirmedProject && !newTitle.includes(buildTagStr(confirmedProject.name))) {
      setConfirmedProject(null);
    }
  }

  const reminderAcList = reminderAcCandidates.length > 0 ? reminderAcCandidates : REMINDER_AC_OPTIONS;
  const tagAcListLength = tagAcCandidates.length + (showCreateTagOption ? 1 : 0);
  function handleTitleKeyDown(e: React.KeyboardEvent) {
    if (showReminderAutoComplete) {
      const total = reminderAcList.length;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setReminderAcHighlight((h) => (h + 1) % total);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setReminderAcHighlight((h) => (h - 1 + total) % total);
      } else if (e.key === "Enter" && total > 0) {
        e.preventDefault();
        selectReminderOption(reminderAcList[reminderAcHighlight]);
      } else if (e.key === "Escape") {
        setShowReminderAutoComplete(false);
      }
      return;
    }
    if (showTagAutoComplete) {
      if (e.key === "ArrowDown" && tagAcListLength > 0) {
        e.preventDefault();
        setTagAcHighlight((h) => (h + 1) % tagAcListLength);
      } else if (e.key === "ArrowUp" && tagAcListLength > 0) {
        e.preventDefault();
        setTagAcHighlight((h) => (h - 1 + tagAcListLength) % tagAcListLength);
      } else if (e.key === "Enter" && tagAcListLength > 0) {
        e.preventDefault();
        if (tagAcHighlight < tagAcCandidates.length) {
          selectTag(tagAcCandidates[tagAcHighlight]);
        } else if (showCreateTagOption && tagTag) {
          selectTag(tagTag.query);
        }
      } else if (e.key === "Escape") {
        setShowTagAutoComplete(false);
      }
      return;
    }
    if (!showAutoComplete) return;
    const totalItems = acCandidates.length + (showCreateOption ? 1 : 0);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAcHighlight((h) => (h + 1) % totalItems);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setAcHighlight((h) => (h - 1 + totalItems) % totalItems);
    } else if (e.key === "Enter" && totalItems > 0) {
      e.preventDefault();
      if (acHighlight < acCandidates.length) {
        selectProject(acCandidates[acHighlight].name);
      } else if (showCreateOption && projectTag) {
        selectProject(projectTag.query);
      }
    } else if (e.key === "Escape") {
      setShowAutoComplete(false);
    }
  }

  function overrideSchedule() {
    if (parsed.dueDate !== null || parsed.recurrence != null)
      setScheduleOverridden(true);
  }
  function handleWhenModeChange(mode: "one-time" | "recurring") {
    setWhenMode(mode);
    overrideSchedule();
  }
  function handleDateChange(e: React.ChangeEvent<HTMLInputElement>) {
    setDueDate(e.target.value);
    overrideSchedule();
  }
  function handleTimeChange(e: React.ChangeEvent<HTMLInputElement>) {
    setDueTime(e.target.value);
    setTimeManuallySet(true);
  }
  function handlePriorityChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newValue = Number(e.target.value) as TaskPriority;
    setPriority(newValue);
    if (parsed.priority != null && !priorityOverridden && parsed.prioritySpan) {
      setPriorityOverridden(true);
      const [start, end] = parsed.prioritySpan;
      const cleaned = (title.substring(0, start) + title.substring(end))
        .replace(/\s{2,}/g, " ")
        .trimEnd();
      setTitle(cleaned);
    }
  }
  function toggleWeekday(dayIdx: number) {
    setRecWeekdays((prev) =>
      prev.includes(dayIdx) ? prev.filter((d) => d !== dayIdx) : [...prev, dayIdx],
    );
    overrideSchedule();
  }
  function handleRecTypeChange(type: RecurrenceRule["type"]) {
    setRecType(type);
    overrideSchedule();
  }

  // ── Submit ──────────────────────────────────────────────
  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;

    const finalTime = timeManuallySet
      ? dueTime || undefined
      : hasScheduleMatch
        ? parsed.dueTime
        : dueTime || undefined;

    let finalDate: string | null;
    let finalRecurrence: RecurrenceRule | undefined;
    if (hasScheduleMatch) {
      finalDate = parsed.dueDate;
      finalRecurrence = parsed.recurrence;
    } else if (whenMode === "recurring") {
      finalRecurrence = buildRecurrenceFromForm();
      finalDate = finalRecurrence
        ? toDateStr(computeNextOccurrence(finalRecurrence))
        : null;
    } else {
      finalDate = dueDate || null;
      finalRecurrence = undefined;
    }

    const finalPriority = displayPriority;

    // Build reminder (validate: at = after now and before task due; before = only if task has due)
    let finalReminder: Reminder | undefined;
    if (reminderType === "at" && reminderAtDate && reminderAtTime) {
      const reminderAt = new Date(`${reminderAtDate}T${reminderAtTime}:00`);
      const now = new Date();
      if (reminderAt > now) {
        if (finalDate && finalTime) {
          const taskDue = new Date(`${finalDate}T${finalTime}:00`);
          if (reminderAt < taskDue) finalReminder = { type: "at", date: reminderAtDate, time: reminderAtTime };
        } else if (finalDate) {
          const taskDue = new Date(`${finalDate}T05:00:00`);
          if (reminderAt < taskDue) finalReminder = { type: "at", date: reminderAtDate, time: reminderAtTime };
        } else {
          finalReminder = { type: "at", date: reminderAtDate, time: reminderAtTime };
        }
      }
    } else if (reminderType === "before" && finalDate) {
      finalReminder = { type: "before", minutes: reminderBeforeMinutes };
    }

    // Gather spans to strip from title (schedule, priority, reminder, project tag)
    const spansToRemove: [number, number][] = [];
    if (hasScheduleMatch && parsed.scheduleSpan)
      spansToRemove.push(parsed.scheduleSpan);
    if (hasPriorityMatch && parsed.prioritySpan)
      spansToRemove.push(parsed.prioritySpan);
    if (hasReminderMatch && parsed.reminderSpan)
      spansToRemove.push(parsed.reminderSpan);
    if (hasProjectMatch && parsed.projectSpan)
      spansToRemove.push(parsed.projectSpan);
    if (parsed.tagSpans) {
      for (const span of parsed.tagSpans) spansToRemove.push(span);
    }

    // Resolve project from #tag in title (parsed from end or found anywhere)
    let resolvedProjectId: string | undefined;
    if (hasProjectMatch) {
      const name = parsed.projectTag!;
      const match = projects.find(
        (p) => p.name.toLowerCase() === name.toLowerCase(),
      );
      resolvedProjectId = match ? match.id : `new:${name}`;
    } else if (tagInTitle && tagInTitle.query.length > 0) {
      let tagStart = tagInTitle.span[0];
      let tagEnd = tagInTitle.span[1];
      if (tagEnd < title.length && title[tagEnd] === " ") tagEnd++;
      else if (tagStart > 0 && title[tagStart - 1] === " ") tagStart--;
      spansToRemove.push([tagStart, tagEnd]);
      if (confirmedProject) {
        resolvedProjectId = confirmedProject.id ?? `new:${confirmedProject.name}`;
      } else {
        const match = projects.find(
          (p) => p.name.toLowerCase() === tagInTitle.query.toLowerCase(),
        );
        resolvedProjectId = match ? match.id : `new:${tagInTitle.query}`;
      }
    }

    let finalTitle: string;
    if (spansToRemove.length > 0) {
      spansToRemove.sort((a, b) => b[0] - a[0]);
      finalTitle = title;
      for (const [s, e] of spansToRemove) {
        finalTitle = finalTitle.substring(0, s) + finalTitle.substring(e);
      }
      finalTitle = finalTitle
        .replace(/\s{2,}/g, " ")
        .replace(/[\s.,;:!?-]+$/, "")
        .trim();
    } else {
      finalTitle = title.trim();
    }
    if (!finalTitle) return;

    const nowIso = new Date().toISOString();

    // Determine projectId: explicit tag > existing task value > default from selected project
    const projectId =
      resolvedProjectId ||
      (isEditMode ? editingTask?.projectId : undefined) ||
      defaultProjectId ||
      undefined;

    const reminderPayload = finalReminder
      ? { reminder: finalReminder, reminderAcknowledgedAt: undefined, reminderSnoozedUntil: undefined }
      : { reminder: undefined, reminderAcknowledgedAt: undefined, reminderSnoozedUntil: undefined };

    const finalTags = [...new Set([...formTags, ...(parsed.tags ?? [])])];

    if (isEditMode && editingTask && onUpdate) {
      onUpdate({
        ...editingTask,
        title: finalTitle,
        notes: notes.trim() || undefined,
        dueDate: finalDate,
        dueTime: finalTime,
        recurrence: finalRecurrence,
        priority: finalPriority,
        projectId,
        tags: finalTags.length > 0 ? finalTags : undefined,
        updatedAt: nowIso,
        ...reminderPayload,
      });
    } else {
      onAdd({
        id: crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`,
        title: finalTitle,
        notes: notes.trim() || undefined,
        dueDate: finalDate,
        dueTime: finalTime,
        recurrence: finalRecurrence,
        priority: finalPriority,
        projectId,
        tags: finalTags.length > 0 ? finalTags : undefined,
        createdAt: nowIso,
        updatedAt: nowIso,
        completed: false,
        ...(finalReminder ? reminderPayload : {}),
      });
    }
    resetForm();
  }

  function buildRecurrenceFromForm(): RecurrenceRule | undefined {
    switch (recType) {
      case "weekdays":
        return recWeekdays.length === 0 ? undefined : { type: "weekdays", weekdays: [...recWeekdays] };
      case "interval":
        return recIntervalDays < 1 ? undefined : { type: "interval", intervalDays: recIntervalDays };
      case "dayOfMonth":
        return recDayOfMonth < 1 || recDayOfMonth > 31 ? undefined : { type: "dayOfMonth", dayOfMonth: recDayOfMonth };
      case "dayOfYear":
        return recDay < 1 || recDay > 31 ? undefined : { type: "dayOfYear", month: recMonth, day: recDay };
      default:
        return undefined;
    }
  }

  function resetForm() {
    setTitle("");
    setNotes("");
    setDueDate("");
    setDueTime("");
    setPriority(DEFAULT_PRIORITY);
    setWhenMode("one-time");
    setRecType("weekdays");
    setRecWeekdays([]);
    setRecIntervalDays(1);
    setRecDayOfMonth(1);
    setRecMonth(0);
    setRecDay(1);
    setScheduleOverridden(false);
    setPriorityOverridden(false);
    setTimeManuallySet(false);
    setReminderType("none");
    setReminderAtDate("");
    setReminderAtTime("");
    setReminderBeforeMinutes(30);
    setReminderOverridden(false);
    setShowAutoComplete(false);
    setShowReminderAutoComplete(false);
    setShowTagAutoComplete(false);
    setConfirmedProject(null);
    setFormTags([]);
  }

  // ── Highlight rendering ─────────────────────────────────
  const projectHighlightSpan: [number, number] | null =
    tagInTitle && tagInTitle.query.length > 0 ? tagInTitle.span : null;

  function renderHighlight() {
    const spans: [number, number][] = [];
    if (hasScheduleMatch && parsed.scheduleSpan) spans.push(parsed.scheduleSpan);
    if (hasPriorityMatch && parsed.prioritySpan) spans.push(parsed.prioritySpan);
    if (hasReminderMatch && parsed.reminderSpan) spans.push(parsed.reminderSpan);
    if (hasProjectMatch && parsed.projectSpan) spans.push(parsed.projectSpan);
    else if (projectHighlightSpan) spans.push(projectHighlightSpan);
    if (parsed.tagSpans) spans.push(...parsed.tagSpans);
    if (tagHighlightSpan && !parsed.tagSpans?.some(([s]) => s === tagHighlightSpan[0])) {
      spans.push(tagHighlightSpan);
    }
    if (spans.length === 0) return null;
    spans.sort((a, b) => a[0] - b[0]);
    const parts: React.ReactNode[] = [];
    let pos = 0;
    for (let i = 0; i < spans.length; i++) {
      const [start, end] = spans[i];
      if (start > pos) parts.push(title.substring(pos, start));
      parts.push(<mark key={i}>{title.substring(start, end)}</mark>);
      pos = end;
    }
    if (pos < title.length) parts.push(title.substring(pos));
    return (
      <div className="title-highlight" aria-hidden="true">
        {parts}
      </div>
    );
  }

  const tagHighlightSpan =
    tagTag && tagTag.query.length > 0 ? tagTag.span : null;
  const hasHighlightIncludingProject =
    hasAnyHighlight || projectHighlightSpan != null || tagHighlightSpan != null;

  // ── Hint text ───────────────────────────────────────────
  const hintParts: string[] = [];
  if (hasScheduleMatch) {
    if (parsed.recurrence)
      hintParts.push(formatRecurrenceHint(parsed.recurrence, timeManuallySet ? dueTime || undefined : parsed.dueTime));
    else if (parsed.dueDate)
      hintParts.push(formatDateHint(parsed.dueDate, timeManuallySet ? dueTime || undefined : parsed.dueTime));
  }
  if (hasPriorityMatch && parsed.priority != null)
    hintParts.push(`P${parsed.priority}`);
  if (hasReminderMatch || reminderType !== "none") {
    if (reminderType === "at" && reminderAtDate && reminderAtTime)
      hintParts.push(`Reminder: ${formatDateHint(reminderAtDate, reminderAtTime)}`);
    else if (reminderType === "before")
      hintParts.push(`Reminder: ${getReminderBeforeByMinutes(reminderBeforeMinutes)?.label ?? `${reminderBeforeMinutes} min before`}`);
  }
  if (tagInTitle && tagInTitle.query.length > 0) {
    if (confirmedProject) {
      hintParts.push(confirmedProject.id ? `#${confirmedProject.name}` : `#${confirmedProject.name} (new)`);
    } else {
      const matchedProject = projects.find(
        (p) => p.name.toLowerCase() === tagInTitle.query.toLowerCase(),
      );
      hintParts.push(matchedProject ? `#${matchedProject.name}` : `#${tagInTitle.query} (new)`);
    }
  }
  const displayTags = [...new Set([...formTags, ...(parsed.tags ?? [])])];
  if (displayTags.length > 0) {
    hintParts.push(displayTags.map((t) => `@${t}`).join(" "));
  }

  // ── JSX ─────────────────────────────────────────────────
  return (
    <form onSubmit={handleSubmit}>
      <div className="field">
        <label htmlFor="title">Title</label>
        <div className={`title-input-wrapper${hasHighlightIncludingProject ? " has-highlight" : ""}`}>
          {hasHighlightIncludingProject && renderHighlight()}
          <input
            ref={titleInputRef}
            id="title"
            type="text"
            value={title}
            onChange={handleTitleChange}
            onKeyDown={handleTitleKeyDown}
            placeholder='What do you need to do? Use # for project, @ for tag'
            required
          />
          {showAutoComplete && (
            <div className="project-autocomplete">
              {acCandidates.map((p, i) => (
                <div
                  key={p.id}
                  className={`project-autocomplete-item${i === acHighlight ? " highlighted" : ""}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    selectProject(p.name);
                  }}
                >
                  {p.name}
                </div>
              ))}
              {showCreateOption && projectTag && (
                <div
                  className={`project-autocomplete-item create${acHighlight === acCandidates.length ? " highlighted" : ""}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    selectProject(projectTag.query);
                  }}
                >
                  Create &ldquo;{projectTag.query}&rdquo;
                </div>
              )}
            </div>
          )}
          {showReminderAutoComplete && (
            <div className="project-autocomplete reminder-autocomplete">
              {reminderAcCandidates.length > 0 ? (
                reminderAcCandidates.map((opt, i) => (
                  <div
                    key={opt}
                    className={`project-autocomplete-item${i === reminderAcHighlight ? " highlighted" : ""}`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      selectReminderOption(opt);
                    }}
                  >
                    !{opt}
                  </div>
                ))
              ) : (
                REMINDER_AC_OPTIONS.map((opt, i) => (
                  <div
                    key={opt}
                    className={`project-autocomplete-item${i === reminderAcHighlight ? " highlighted" : ""}`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      selectReminderOption(opt);
                    }}
                  >
                    !{opt}
                  </div>
                ))
              )}
            </div>
          )}
          {showTagAutoComplete && (
            <div className="project-autocomplete tag-autocomplete">
              {tagAcCandidates.map((tag, i) => (
                <div
                  key={tag}
                  className={`project-autocomplete-item${i === tagAcHighlight ? " highlighted" : ""}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    selectTag(tag);
                  }}
                >
                  @{tag}
                </div>
              ))}
              {showCreateTagOption && tagTag && (
                <div
                  className={`project-autocomplete-item create${tagAcHighlight === tagAcCandidates.length ? " highlighted" : ""}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    selectTag(tagTag.query);
                  }}
                >
                  Create &ldquo;@{tagTag.query}&rdquo;
                </div>
              )}
            </div>
          )}
        </div>
        {hintParts.length > 0 && (
          <span className="date-hint">
            {"\u2192 "}{hintParts.join(" \u00b7 ")}
          </span>
        )}
        {displayTags.length > 0 && (
          <div className="task-form-tags">
            {displayTags.map((t) => (
              <span key={t} className="pill tag-pill">
                @{t}
                <button
                  type="button"
                  className="tag-pill-remove"
                  onClick={() => removeTag(t)}
                  aria-label={`Remove tag ${t}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="field">
        <label htmlFor="notes">Notes</label>
        <textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional details"
          rows={3}
        />
      </div>

      <fieldset className="when-section">
        <legend>When</legend>
        <div className="when-mode-toggle">
          <label className={whenMode === "one-time" ? "active" : ""}>
            <input type="radio" name="whenMode" value="one-time" checked={whenMode === "one-time"} onChange={() => handleWhenModeChange("one-time")} />
            One-time
          </label>
          <label className={whenMode === "recurring" ? "active" : ""}>
            <input type="radio" name="whenMode" value="recurring" checked={whenMode === "recurring"} onChange={() => handleWhenModeChange("recurring")} />
            Recurring
          </label>
        </div>

        {whenMode === "one-time" && (
          <div className="field">
            <label htmlFor="dueDate">Date</label>
            <input id="dueDate" type="date" value={dueDate} onChange={handleDateChange} />
          </div>
        )}

        {whenMode === "recurring" && (
          <div className="recurring-options">
            <div className="field">
              <label htmlFor="recType">Repeat</label>
              <select id="recType" value={recType} onChange={(e) => handleRecTypeChange(e.target.value as RecurrenceRule["type"])}>
                <option value="weekdays">Specific weekdays</option>
                <option value="interval">Every X days</option>
                <option value="dayOfMonth">Day of month</option>
                <option value="dayOfYear">Day of year</option>
              </select>
            </div>
            {recType === "weekdays" && (
              <div className="weekday-picker">
                {WEEKDAY_LABELS.map((label, i) => {
                  const dayIdx = WEEKDAY_INDICES[i];
                  const active = recWeekdays.includes(dayIdx);
                  return (
                    <button key={dayIdx} type="button" className={`weekday-chip${active ? " active" : ""}`} onClick={() => toggleWeekday(dayIdx)} aria-pressed={active}>{label}</button>
                  );
                })}
              </div>
            )}
            {recType === "interval" && (
              <div className="field">
                <label htmlFor="recInterval">Every</label>
                <div className="inline-field">
                  <input id="recInterval" type="number" min={1} value={recIntervalDays} onChange={(e) => { setRecIntervalDays(Math.max(1, Number(e.target.value))); overrideSchedule(); }} />
                  <span className="field-suffix">days</span>
                </div>
              </div>
            )}
            {recType === "dayOfMonth" && (
              <div className="field">
                <label htmlFor="recDayOfMonth">Day</label>
                <input id="recDayOfMonth" type="number" min={1} max={31} value={recDayOfMonth} onChange={(e) => { setRecDayOfMonth(Math.min(31, Math.max(1, Number(e.target.value)))); overrideSchedule(); }} />
              </div>
            )}
            {recType === "dayOfYear" && (
              <div className="field-row">
                <div className="field">
                  <label htmlFor="recMonth">Month</label>
                  <select id="recMonth" value={recMonth} onChange={(e) => { setRecMonth(Number(e.target.value)); overrideSchedule(); }}>
                    {MONTH_OPTIONS.map((name, i) => <option key={i} value={i}>{name}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="recDay">Day</label>
                  <input id="recDay" type="number" min={1} max={31} value={recDay} onChange={(e) => { setRecDay(Math.min(31, Math.max(1, Number(e.target.value)))); overrideSchedule(); }} />
                </div>
              </div>
            )}
          </div>
        )}

        <div className="field">
          <label htmlFor="dueTime">Time</label>
          <input id="dueTime" type="time" value={dueTime} onChange={handleTimeChange} />
        </div>
      </fieldset>

      <fieldset className="when-section reminder-section">
        <legend>Reminder</legend>
        <div className="when-mode-toggle">
          <label className={reminderType === "none" ? "active" : ""}>
            <input type="radio" name="reminderType" value="none" checked={reminderType === "none"} onChange={() => { setReminderType("none"); setReminderOverridden(true); }} />
            None
          </label>
          <label className={reminderType === "at" ? "active" : ""}>
            <input type="radio" name="reminderType" value="at" checked={reminderType === "at"} onChange={() => { setReminderType("at"); setReminderOverridden(true); }} />
            At date & time
          </label>
          <label className={reminderType === "before" ? "active" : ""}>
            <input type="radio" name="reminderType" value="before" checked={reminderType === "before"} onChange={() => { setReminderType("before"); setReminderOverridden(true); }} />
            Before due
          </label>
        </div>
        {reminderType === "at" && (
          <div className="field-row">
            <div className="field">
              <label htmlFor="reminderAtDate">Date</label>
              <input id="reminderAtDate" type="date" value={reminderAtDate} onChange={(e) => { setReminderAtDate(e.target.value); setReminderOverridden(true); }} />
            </div>
            <div className="field">
              <label htmlFor="reminderAtTime">Time</label>
              <input id="reminderAtTime" type="time" value={reminderAtTime} onChange={(e) => { setReminderAtTime(e.target.value); setReminderOverridden(true); }} />
            </div>
          </div>
        )}
        {reminderType === "before" && (
          taskHasDueDate ? (
            <div className="field">
              <label htmlFor="reminderBefore">When</label>
              <select id="reminderBefore" value={reminderBeforeMinutes} onChange={(e) => { setReminderBeforeMinutes(Number(e.target.value)); setReminderOverridden(true); }}>
                {REMINDER_BEFORE_PRESETS.map((p) => (
                  <option key={p.minutes} value={p.minutes}>{p.label}</option>
                ))}
              </select>
            </div>
          ) : (
            <p className="reminder-before-hint">Set a due date above to choose when to be reminded.</p>
          )
        )}
      </fieldset>

      <div className="field-row">
        <div className="field">
          <label htmlFor="priority">Priority</label>
          <select id="priority" value={displayPriority} onChange={handlePriorityChange}>
            <option value={1}>P1 – Highest</option>
            <option value={2}>P2 – High</option>
            <option value={3}>P3 – Medium</option>
            <option value={4}>P4 – Low</option>
          </select>
        </div>
      </div>

      <div className={`form-actions${isEditMode ? " edit-mode" : ""}`}>
        <button type="submit" className="primary">
          {isEditMode ? "Save changes" : "Add task"}
        </button>
        {isEditMode && (
          <>
            <button type="button" className="danger-outline" onClick={() => onDelete?.(editingTask!.id)}>Delete task</button>
            <button type="button" className="ghost" onClick={onCancelEdit}>Cancel</button>
          </>
        )}
      </div>
    </form>
  );
};
