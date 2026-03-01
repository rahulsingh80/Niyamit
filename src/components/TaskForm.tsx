import React, { useState, useEffect, useRef, FormEvent } from "react";
import type { Task, TaskPriority, RecurrenceRule } from "@domain/taskTypes";
import type { Project } from "@domain/projectTypes";
import {
  parseTitleInput,
  formatDateHint,
  formatRecurrenceHint,
  computeNextOccurrence,
} from "@domain/dateParser";

interface TaskFormProps {
  onAdd(task: Task): void;
  editingTask?: Task | null;
  onUpdate?(task: Task): void;
  onDelete?(id: string): void;
  onCancelEdit?(): void;
  projects?: Project[];
  defaultProjectId?: string | null;
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

  // Project autocomplete state
  const [showAutoComplete, setShowAutoComplete] = useState(false);
  const [acHighlight, setAcHighlight] = useState(0);
  // Tracks a confirmed project selection from autocomplete (handles multi-word names)
  const [confirmedProject, setConfirmedProject] = useState<{ id: string | null; name: string } | null>(null);

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
    requestAnimationFrame(() => {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    });
  }, [editingTask]);

  // ── Find project tag and parse schedule/priority ────────
  // Find the project tag anywhere in the title (for highlighting, hint, submit)
  const tagInTitle = findProjectTagAnywhere(title, confirmedProject);

  // Strip the project tag before parsing date/time/priority so all three
  // can appear at the end of the title in any order.
  const { cleaned: titleForParsing, toOriginal } = tagInTitle
    ? stripSpanFromTitle(title, tagInTitle.span)
    : { cleaned: title, toOriginal: (p: number) => p };

  const rawParsed = parseTitleInput(titleForParsing);
  const parsed = {
    ...rawParsed,
    scheduleSpan: rawParsed.scheduleSpan
      ? [toOriginal(rawParsed.scheduleSpan[0]), toOriginal(rawParsed.scheduleSpan[1])] as [number, number]
      : undefined,
    prioritySpan: rawParsed.prioritySpan
      ? [toOriginal(rawParsed.prioritySpan[0]), toOriginal(rawParsed.prioritySpan[1])] as [number, number]
      : undefined,
  };

  const hasScheduleMatch =
    !scheduleOverridden &&
    (parsed.dueDate !== null || parsed.recurrence != null) &&
    parsed.scheduleSpan != null;
  const hasPriorityMatch = !priorityOverridden && parsed.priority != null;
  const hasAnyHighlight =
    (hasScheduleMatch && parsed.scheduleSpan != null) ||
    (hasPriorityMatch && parsed.prioritySpan != null);
  const displayPriority =
    hasPriorityMatch && parsed.priority != null ? parsed.priority : priority;

  // ── Project autocomplete (end-anchored for typing) ─────
  const projectTag = parseProjectTagAtEnd(title);
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

  useEffect(() => {
    setShowAutoComplete(!!(projectTag && (acCandidates.length > 0 || showCreateOption)));
    setAcHighlight(0);
  }, [title]);

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

  // ── Handlers ────────────────────────────────────────────
  function handleTitleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const newTitle = e.target.value;
    setTitle(newTitle);
    setScheduleOverridden(false);
    setPriorityOverridden(false);
    setTimeManuallySet(false);
    if (confirmedProject && !newTitle.includes(buildTagStr(confirmedProject.name))) {
      setConfirmedProject(null);
    }
  }

  function handleTitleKeyDown(e: React.KeyboardEvent) {
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

    // Gather spans to strip from title (schedule, priority, project tag)
    const spansToRemove: [number, number][] = [];
    if (hasScheduleMatch && parsed.scheduleSpan)
      spansToRemove.push(parsed.scheduleSpan);
    if (hasPriorityMatch && parsed.prioritySpan)
      spansToRemove.push(parsed.prioritySpan);

    // Resolve project from #tag in title (uses the already-computed tagInTitle)
    let resolvedProjectId: string | undefined;
    if (tagInTitle && tagInTitle.query.length > 0) {
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
        updatedAt: nowIso,
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
        createdAt: nowIso,
        updatedAt: nowIso,
        completed: false,
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
    setShowAutoComplete(false);
    setConfirmedProject(null);
  }

  // ── Highlight rendering ─────────────────────────────────
  const projectHighlightSpan: [number, number] | null =
    tagInTitle && tagInTitle.query.length > 0 ? tagInTitle.span : null;

  function renderHighlight() {
    const spans: [number, number][] = [];
    if (hasScheduleMatch && parsed.scheduleSpan) spans.push(parsed.scheduleSpan);
    if (hasPriorityMatch && parsed.prioritySpan) spans.push(parsed.prioritySpan);
    if (projectHighlightSpan) spans.push(projectHighlightSpan);
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

  const hasHighlightIncludingProject =
    hasAnyHighlight || projectHighlightSpan != null;

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
            placeholder='What do you need to do? Use # for project'
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
        </div>
        {hintParts.length > 0 && (
          <span className="date-hint">
            {"\u2192 "}{hintParts.join(" \u00b7 ")}
          </span>
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
