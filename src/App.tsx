import React, { useEffect, useState } from "react";
import { useGoogleLogin } from "@react-oauth/google";
import type { Task } from "@domain/taskTypes";
import { loadTasks, saveTasks } from "@services/localStorageService";
import { exportTasksAsJson } from "@services/exportService";
import { saveTasksToDrive } from "@services/googleDriveService";
import { TaskForm } from "@components/TaskForm";
import { TaskList } from "@components/TaskList";
import "./styles.css";

export const App: React.FC<{ initialTasks?: Task[] }> = ({ initialTasks }) => {
  const [tasks, setTasks] = useState<Task[]>(() => {
    if (initialTasks) return initialTasks;
    return loadTasks();
  });
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  useEffect(() => {
    saveTasks(tasks);
  }, [tasks]);

  const login = useGoogleLogin({
    scope: "https://www.googleapis.com/auth/drive.file",
    onSuccess: async (tokenResponse) => {
      try {
        setIsSyncing(true);
        setSyncStatus("Syncing to Drive...");
        await saveTasksToDrive(tokenResponse.access_token, tasks);
        setSyncStatus("Successfully synced to Drive!");
        setTimeout(() => setSyncStatus(null), 3000);
      } catch (error: any) {
        console.error("Error syncing to drive:", error);
        setSyncStatus(`Sync failed: ${error.message}`);
      } finally {
        setIsSyncing(false);
      }
    },
    onError: (error) => {
      console.error("Login Failed:", error);
      setSyncStatus("Login failed.");
    }
  });

  function handleAddTask(task: Task) {
    setTasks((prev) => [...prev, task]);
  }

  function handleCompleteTask(id: string) {
    setTasks((prev) =>
      prev.map((task) =>
        task.id === id
          ? {
              ...task,
              completed: true,
            }
          : task
      )
    );
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
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <button type="button" className="secondary" onClick={handleExport}>
            Export as JSON
          </button>
          <button 
            type="button" 
            className="secondary" 
            onClick={() => login()}
            disabled={isSyncing}
          >
            {isSyncing ? "Syncing..." : "Sync to Drive"}
          </button>
          {syncStatus && <span style={{ fontSize: "0.85em", color: "#666" }}>{syncStatus}</span>}
        </div>
      </header>

      <main className="app-main">
        <TaskForm onAdd={handleAddTask} />
        <TaskList tasks={tasks} onCompleteTask={handleCompleteTask} />
      </main>

      <footer className="app-footer">
        <small>
          Data is currently stored in your browser&apos;s local storage. You can manually
          sync JSON files to your Google Drive.
        </small>
      </footer>
    </div>
  );
};

