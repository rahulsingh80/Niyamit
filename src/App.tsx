import React, { useEffect, useState } from "react";
import type { Task } from "@domain/taskTypes";
import { loadTasks, saveTasks } from "@services/localStorageService";
import { exportTasksAsJson } from "@services/exportService";
import { TaskForm } from "@components/TaskForm";
import { TaskList } from "@components/TaskList";
import "./styles.css";

export const App: React.FC<{ initialTasks?: Task[] }> = ({ initialTasks }) => {
  const [tasks, setTasks] = useState<Task[]>(() => {
    if (initialTasks) return initialTasks;
    return loadTasks();
  });

  useEffect(() => {
    saveTasks(tasks);
  }, [tasks]);

  function handleAddTask(task: Task) {
    setTasks((prev) => [...prev, task]);
  }

  function handleExport() {
    exportTasksAsJson(tasks);
  }

  return (
    <div className="app-root">
      <header className="app-header">
        <div>
          <h1>Niyamit</h1>
          <p className="subtitle">
            Offline-first tasks. JSON-backed. Google Drive sync ready.
          </p>
        </div>
        <button type="button" className="secondary" onClick={handleExport}>
          Export as JSON
        </button>
      </header>

      <main className="app-main">
        <TaskForm onAdd={handleAddTask} />
        <TaskList tasks={tasks} />
      </main>

      <footer className="app-footer">
        <small>
          Data is currently stored in your browser&apos;s local storage. Future
          iterations will sync JSON files to Google Drive.
        </small>
      </footer>
    </div>
  );
};

