import React, { useState, FormEvent } from "react";
import type { Task, TaskPriority, RecurrenceRule } from "@domain/taskTypes";
import {
  parseTitleInput,
  formatDateHint,
  formatRecurrenceHint,
  computeNextOccurrence,
} from "@domain/dateParser";

interface TaskFormProps {
  onAdd(task: Task): void;
}

const DEFAULT_PRIORITY: TaskPriority = 3;
const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEKDAY_INDICES = [1, 2, 3, 4, 5, 6, 0]; // Mon…Sun mapped to JS day-of-week
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

export const TaskForm: React.FC<TaskFormProps> = ({ onAdd }) => {
  // ── State ───────────────────────────────────────────────
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [priority, setPriority] = useState<TaskPriority>(DEFAULT_PRIORITY);

  // Schedule: one-time vs recurring
  const [whenMode, setWhenMode] = useState<"one-time" | "recurring">("one-time");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");

  // Recurrence form state
  const [recType, setRecType] = useState<RecurrenceRule["type"]>("weekdays");
  const [recWeekdays, setRecWeekdays] = useState<number[]>([]);
  const [recIntervalDays, setRecIntervalDays] = useState(1);
  const [recDayOfMonth, setRecDayOfMonth] = useState(1);
  const [recMonth, setRecMonth] = useState(0);
  const [recDay, setRecDay] = useState(1);

  // Override flags
  const [scheduleOverridden, setScheduleOverridden] = useState(false);
  const [priorityOverridden, setPriorityOverridden] = useState(false);
  const [timeManuallySet, setTimeManuallySet] = useState(false);

  // ── Parsed state ────────────────────────────────────────
  const parsed = parseTitleInput(title);
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

  // ── Handlers ────────────────────────────────────────────

  function handleTitleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setTitle(e.target.value);
    setScheduleOverridden(false);
    setPriorityOverridden(false);
    setTimeManuallySet(false);
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

    // Determine final time
    const finalTime = timeManuallySet
      ? dueTime || undefined
      : hasScheduleMatch
        ? parsed.dueTime
        : dueTime || undefined;

    // Determine final schedule
    let finalDate: string | null;
    let finalRecurrence: RecurrenceRule | undefined;

    if (hasScheduleMatch) {
      finalDate = parsed.dueDate;
      finalRecurrence = parsed.recurrence;
    } else if (whenMode === "recurring") {
      finalRecurrence = buildRecurrenceFromForm();
      if (finalRecurrence) {
        finalDate = toDateStr(computeNextOccurrence(finalRecurrence));
      } else {
        finalDate = null;
      }
    } else {
      finalDate = dueDate || null;
      finalRecurrence = undefined;
    }

    const finalPriority = displayPriority;

    // Build final title by removing matched spans
    const spansToRemove: [number, number][] = [];
    if (hasScheduleMatch && parsed.scheduleSpan)
      spansToRemove.push(parsed.scheduleSpan);
    if (hasPriorityMatch && parsed.prioritySpan)
      spansToRemove.push(parsed.prioritySpan);

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
    const newTask: Task = {
      id: crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`,
      title: finalTitle,
      notes: notes.trim() || undefined,
      dueDate: finalDate,
      dueTime: finalTime,
      recurrence: finalRecurrence,
      priority: finalPriority,
      createdAt: nowIso,
      updatedAt: nowIso,
      completed: false,
    };

    onAdd(newTask);
    resetForm();
  }

  function buildRecurrenceFromForm(): RecurrenceRule | undefined {
    switch (recType) {
      case "weekdays":
        if (recWeekdays.length === 0) return undefined;
        return { type: "weekdays", weekdays: [...recWeekdays] };
      case "interval":
        if (recIntervalDays < 1) return undefined;
        return { type: "interval", intervalDays: recIntervalDays };
      case "dayOfMonth":
        if (recDayOfMonth < 1 || recDayOfMonth > 31) return undefined;
        return { type: "dayOfMonth", dayOfMonth: recDayOfMonth };
      case "dayOfYear":
        if (recDay < 1 || recDay > 31) return undefined;
        return { type: "dayOfYear", month: recMonth, day: recDay };
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
  }

  // ── Highlight rendering ─────────────────────────────────

  function renderHighlight() {
    const spans: [number, number][] = [];
    if (hasScheduleMatch && parsed.scheduleSpan)
      spans.push(parsed.scheduleSpan);
    if (hasPriorityMatch && parsed.prioritySpan)
      spans.push(parsed.prioritySpan);
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

  // ── Hint text ───────────────────────────────────────────

  const hintParts: string[] = [];
  if (hasScheduleMatch) {
    if (parsed.recurrence) {
      hintParts.push(
        formatRecurrenceHint(
          parsed.recurrence,
          timeManuallySet ? dueTime || undefined : parsed.dueTime,
        ),
      );
    } else if (parsed.dueDate) {
      hintParts.push(
        formatDateHint(
          parsed.dueDate,
          timeManuallySet ? dueTime || undefined : parsed.dueTime,
        ),
      );
    }
  }
  if (hasPriorityMatch && parsed.priority != null)
    hintParts.push(`P${parsed.priority}`);

  // ── JSX ─────────────────────────────────────────────────

  return (
    <form onSubmit={handleSubmit}>
      {/* ── Title ─────────────────────── */}
      <div className="field">
        <label htmlFor="title">Title</label>
        <div
          className={`title-input-wrapper${hasAnyHighlight ? " has-highlight" : ""}`}
        >
          {hasAnyHighlight && renderHighlight()}
          <input
            id="title"
            type="text"
            value={title}
            onChange={handleTitleChange}
            placeholder="What do you need to do?"
            required
          />
        </div>
        {hintParts.length > 0 && (
          <span className="date-hint">
            {"\u2192 "}
            {hintParts.join(" \u00b7 ")}
          </span>
        )}
      </div>

      {/* ── Notes ─────────────────────── */}
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

      {/* ── When ──────────────────────── */}
      <fieldset className="when-section">
        <legend>When</legend>
        <div className="when-mode-toggle">
          <label className={whenMode === "one-time" ? "active" : ""}>
            <input
              type="radio"
              name="whenMode"
              value="one-time"
              checked={whenMode === "one-time"}
              onChange={() => handleWhenModeChange("one-time")}
            />
            One-time
          </label>
          <label className={whenMode === "recurring" ? "active" : ""}>
            <input
              type="radio"
              name="whenMode"
              value="recurring"
              checked={whenMode === "recurring"}
              onChange={() => handleWhenModeChange("recurring")}
            />
            Recurring
          </label>
        </div>

        {whenMode === "one-time" && (
          <div className="field">
            <label htmlFor="dueDate">Date</label>
            <input
              id="dueDate"
              type="date"
              value={dueDate}
              onChange={handleDateChange}
            />
          </div>
        )}

        {whenMode === "recurring" && (
          <div className="recurring-options">
            <div className="field">
              <label htmlFor="recType">Repeat</label>
              <select
                id="recType"
                value={recType}
                onChange={(e) =>
                  handleRecTypeChange(e.target.value as RecurrenceRule["type"])
                }
              >
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
                    <button
                      key={dayIdx}
                      type="button"
                      className={`weekday-chip${active ? " active" : ""}`}
                      onClick={() => toggleWeekday(dayIdx)}
                      aria-pressed={active}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            )}

            {recType === "interval" && (
              <div className="field">
                <label htmlFor="recInterval">Every</label>
                <div className="inline-field">
                  <input
                    id="recInterval"
                    type="number"
                    min={1}
                    value={recIntervalDays}
                    onChange={(e) => {
                      setRecIntervalDays(Math.max(1, Number(e.target.value)));
                      overrideSchedule();
                    }}
                  />
                  <span className="field-suffix">days</span>
                </div>
              </div>
            )}

            {recType === "dayOfMonth" && (
              <div className="field">
                <label htmlFor="recDayOfMonth">Day</label>
                <input
                  id="recDayOfMonth"
                  type="number"
                  min={1}
                  max={31}
                  value={recDayOfMonth}
                  onChange={(e) => {
                    setRecDayOfMonth(
                      Math.min(31, Math.max(1, Number(e.target.value))),
                    );
                    overrideSchedule();
                  }}
                />
              </div>
            )}

            {recType === "dayOfYear" && (
              <div className="field-row">
                <div className="field">
                  <label htmlFor="recMonth">Month</label>
                  <select
                    id="recMonth"
                    value={recMonth}
                    onChange={(e) => {
                      setRecMonth(Number(e.target.value));
                      overrideSchedule();
                    }}
                  >
                    {MONTH_OPTIONS.map((name, i) => (
                      <option key={i} value={i}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="recDay">Day</label>
                  <input
                    id="recDay"
                    type="number"
                    min={1}
                    max={31}
                    value={recDay}
                    onChange={(e) => {
                      setRecDay(
                        Math.min(31, Math.max(1, Number(e.target.value))),
                      );
                      overrideSchedule();
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        <div className="field">
          <label htmlFor="dueTime">Time</label>
          <input
            id="dueTime"
            type="time"
            value={dueTime}
            onChange={handleTimeChange}
          />
        </div>
      </fieldset>

      {/* ── Priority ──────────────────── */}
      <div className="field-row">
        <div className="field">
          <label htmlFor="priority">Priority</label>
          <select
            id="priority"
            value={displayPriority}
            onChange={handlePriorityChange}
          >
            <option value={1}>P1 – Highest</option>
            <option value={2}>P2 – High</option>
            <option value={3}>P3 – Medium</option>
            <option value={4}>P4 – Low</option>
          </select>
        </div>
      </div>

      <button type="submit" className="primary">
        Add task
      </button>
    </form>
  );
};
