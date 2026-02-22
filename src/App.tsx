import React, { useEffect, useState } from "react";
import { useGoogleLogin } from "@react-oauth/google";
import type { Task } from "@domain/taskTypes";
import { loadTasks, saveTasks } from "@services/localStorageService";
import { exportTasksAsJson } from "@services/exportService";
import { syncTasksWithDrive } from "@services/googleDriveService";
import { TaskForm } from "@components/TaskForm";
import { TaskList } from "@components/TaskList";
import "./styles.css";

const TOKEN_KEY = "niyamit_google_token";
const TOKEN_EXPIRY_KEY = "niyamit_google_token_expiry";

export const App: React.FC<{ initialTasks?: Task[] }> = ({ initialTasks }) => {
  const [tasks, setTasks] = useState<Task[]>(() => {
    if (initialTasks) return initialTasks;
    return loadTasks();
  });
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  // Save tasks to local storage whenever they change
  useEffect(() => {
    saveTasks(tasks);
  }, [tasks]);

  // Attempt to sync on app open if we have a valid cached token
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    const expiry = localStorage.getItem(TOKEN_EXPIRY_KEY);

    if (token && expiry && Date.now() < Number(expiry)) {
      syncWithDrive(token, tasks);
    }
  }, []); // Only run once on mount

  async function syncWithDrive(token: string, currentTasks: Task[]) {
    try {
      setIsSyncing(true);
      setSyncStatus("Syncing with Drive...");
      const mergedTasks = await syncTasksWithDrive(token, currentTasks);
      
      // Update local state with the merged result
      setTasks(mergedTasks);
      
      setSyncStatus("Successfully synced!");
      setTimeout(() => setSyncStatus(null), 3000);
    } catch (error: any) {
      console.error("Error syncing to drive:", error);
      setSyncStatus(`Sync failed: ${error.message}`);
      
      // Clear invalid tokens if unauthorized
      if (error.message.includes("401") || error.message.includes("403")) {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(TOKEN_EXPIRY_KEY);
      }
    } finally {
      setIsSyncing(false);
    }
  }

  const login = useGoogleLogin({
    scope: "https://www.googleapis.com/auth/drive.file",
    onSuccess: (tokenResponse) => {
      // Cache the token
      const expiryTime = Date.now() + (tokenResponse.expires_in * 1000);
      localStorage.setItem(TOKEN_KEY, tokenResponse.access_token);
      localStorage.setItem(TOKEN_EXPIRY_KEY, expiryTime.toString());
      
      syncWithDrive(tokenResponse.access_token, tasks);
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
              updatedAt: new Date().toISOString(),
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

