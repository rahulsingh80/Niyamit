import React, { useState, FormEvent } from "react";
import type { Task, TaskPriority } from "@domain/taskTypes";

interface TaskFormProps {
  onAdd(task: Task): void;
}

const DEFAULT_PRIORITY: TaskPriority = 2;

export const TaskForm: React.FC<TaskFormProps> = ({ onAdd }) => {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState<string | "">("");
  const [priority, setPriority] = useState<TaskPriority>(DEFAULT_PRIORITY);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      return;
    }

    const nowIso = new Date().toISOString();

    const newTask: Task = {
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      title: trimmedTitle,
      notes: notes.trim() || undefined,
      dueDate: dueDate || null,
      priority,
      createdAt: nowIso,
      completed: false,
    };

    onAdd(newTask);

    // Reset form
    setTitle("");
    setNotes("");
    setDueDate("");
    setPriority(DEFAULT_PRIORITY);
  }

  return (
    <form onSubmit={handleSubmit} className="card">
      <h2>Create Task</h2>
      <div className="field">
        <label htmlFor="title">Title</label>
        <input
          id="title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What do you need to do?"
          required
        />
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
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="priority">Priority</label>
          <select
            id="priority"
            value={priority}
            onChange={(e) => setPriority(Number(e.target.value) as TaskPriority)}
          >
            <option value={4}>P4 – Highest</option>
            <option value={3}>P3 – High</option>
            <option value={2}>P2 – Medium</option>
            <option value={1}>P1 – Low</option>
          </select>
        </div>
      </div>
      <button type="submit" className="primary">
        Add task
      </button>
    </form>
  );
};

