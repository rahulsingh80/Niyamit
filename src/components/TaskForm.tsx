import React, { useState, FormEvent } from "react";
import type { Task, TaskPriority } from "@domain/taskTypes";
import { parseTitleInput, formatDateHint } from "@domain/dateParser";

interface TaskFormProps {
  onAdd(task: Task): void;
}

const DEFAULT_PRIORITY: TaskPriority = 3;

export const TaskForm: React.FC<TaskFormProps> = ({ onAdd }) => {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState<string | "">("");
  const [dueTime, setDueTime] = useState<string | "">("");
  const [priority, setPriority] = useState<TaskPriority>(DEFAULT_PRIORITY);
  const [dateOverridden, setDateOverridden] = useState(false);
  const [priorityOverridden, setPriorityOverridden] = useState(false);

  const parsed = parseTitleInput(title);
  const hasDateMatch = !dateOverridden && parsed.dueDate !== null;
  const hasPriorityMatch =
    !priorityOverridden && parsed.priority != null;
  const hasAnyHighlight =
    (hasDateMatch && parsed.dateSpan != null) ||
    (hasPriorityMatch && parsed.prioritySpan != null);

  const displayPriority =
    hasPriorityMatch && parsed.priority != null ? parsed.priority : priority;

  // ── Handlers ────────────────────────────────────────────

  function handleTitleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setTitle(e.target.value);
    setDateOverridden(false);
    setPriorityOverridden(false);
  }

  function handleDateChange(e: React.ChangeEvent<HTMLInputElement>) {
    setDueDate(e.target.value);
    if (!e.target.value) setDueTime("");
    if (parsed.dueDate !== null) setDateOverridden(true);
  }

  function handleTimeChange(e: React.ChangeEvent<HTMLInputElement>) {
    setDueTime(e.target.value);
    if (parsed.dueDate !== null) setDateOverridden(true);
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

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;

    const finalDate = hasDateMatch
      ? parsed.dueDate
      : dueDate || null;
    const finalTime = hasDateMatch
      ? parsed.dueTime
      : dueDate && dueTime
        ? dueTime
        : undefined;
    const finalPriority = displayPriority;

    const spansToRemove: [number, number][] = [];
    if (hasDateMatch && parsed.dateSpan) spansToRemove.push(parsed.dateSpan);
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
      priority: finalPriority,
      createdAt: nowIso,
      updatedAt: nowIso,
      completed: false,
    };

    onAdd(newTask);

    setTitle("");
    setNotes("");
    setDueDate("");
    setDueTime("");
    setPriority(DEFAULT_PRIORITY);
    setDateOverridden(false);
    setPriorityOverridden(false);
  }

  // ── Highlight rendering ─────────────────────────────────

  function renderHighlight() {
    const spans: [number, number][] = [];
    if (hasDateMatch && parsed.dateSpan) spans.push(parsed.dateSpan);
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
  if (hasDateMatch && parsed.dueDate)
    hintParts.push(formatDateHint(parsed.dueDate, parsed.dueTime));
  if (hasPriorityMatch && parsed.priority != null)
    hintParts.push(`P${parsed.priority}`);

  // ── JSX ─────────────────────────────────────────────────

  return (
    <form onSubmit={handleSubmit}>
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
      <div className="field-row">
        <div className="field">
          <label htmlFor="dueDate">Due date</label>
          <input
            id="dueDate"
            type="date"
            value={dueDate}
            onChange={handleDateChange}
          />
        </div>
        <div className="field">
          <label htmlFor="dueTime">Time</label>
          <input
            id="dueTime"
            type="time"
            value={dueTime}
            disabled={!dueDate}
            onChange={handleTimeChange}
          />
        </div>
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
