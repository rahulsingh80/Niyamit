import React, { useEffect, useRef, useState } from "react";
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
const SYNC_INTERVAL_MS = 5 * 60 * 1000;

function getValidToken(): string | null {
  const token = localStorage.getItem(TOKEN_KEY);
  const expiry = localStorage.getItem(TOKEN_EXPIRY_KEY);
  if (token && expiry && Date.now() < Number(expiry)) return token;
  return null;
}

export const App: React.FC<{ initialTasks?: Task[] }> = ({ initialTasks }) => {
  const [tasks, setTasks] = useState<Task[]>(() => {
    if (initialTasks) return initialTasks;
    return loadTasks();
  });
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [showSyncSuccess, setShowSyncSuccess] = useState(false);

  const tasksRef = useRef(tasks);
  const syncingRef = useRef(false);
  const successTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  useEffect(() => {
    saveTasks(tasks);
  }, [tasks]);

  async function syncWithDrive(token: string, currentTasks: Task[]) {
    if (syncingRef.current) return;
    syncingRef.current = true;
    try {
      setIsSyncing(true);
      const mergedTasks = await syncTasksWithDrive(token, currentTasks);
      setTasks(mergedTasks);
      setSyncError(null);
      setShowSyncSuccess(true);
      clearTimeout(successTimerRef.current);
      successTimerRef.current = setTimeout(() => setShowSyncSuccess(false), 3000);
    } catch (error: any) {
      console.error("Error syncing to drive:", error);
      setSyncError(error.message || "Unknown error");
      if (error.message?.includes("401") || error.message?.includes("403")) {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(TOKEN_EXPIRY_KEY);
      }
    } finally {
      syncingRef.current = false;
      setIsSyncing(false);
    }
  }

  function trySyncIfAuthenticated(currentTasks: Task[]) {
    const token = getValidToken();
    if (token) syncWithDrive(token, currentTasks);
  }

  // Sync on mount + every 5 minutes
  useEffect(() => {
    const token = getValidToken();
    if (token) {
      syncWithDrive(token, tasksRef.current);
    } else {
      setSyncError(
        "Not signed in to Google Drive. Click \u2018Sync to Drive\u2019 to connect.",
      );
    }
    const id = setInterval(() => {
      trySyncIfAuthenticated(tasksRef.current);
    }, SYNC_INTERVAL_MS);
    return () => {
      clearInterval(id);
      clearTimeout(successTimerRef.current);
    };
  }, []);

  const login = useGoogleLogin({
    scope: "https://www.googleapis.com/auth/drive.file",
    onSuccess: (tokenResponse) => {
      const expiryTime = Date.now() + tokenResponse.expires_in * 1000;
      localStorage.setItem(TOKEN_KEY, tokenResponse.access_token);
      localStorage.setItem(TOKEN_EXPIRY_KEY, expiryTime.toString());
      syncWithDrive(tokenResponse.access_token, tasksRef.current);
    },
    onError: (error) => {
      console.error("Login Failed:", error);
      setSyncError("Google login failed.");
    },
  });

  function handleAddTask(task: Task) {
    const newTasks = [...tasks, task];
    setTasks(newTasks);
    setIsFormOpen(false);
    trySyncIfAuthenticated(newTasks);
  }

  function handleCompleteTask(id: string) {
    const newTasks = tasks.map((t) =>
      t.id === id
        ? { ...t, completed: true, updatedAt: new Date().toISOString() }
        : t,
    );
    setTasks(newTasks);
    trySyncIfAuthenticated(newTasks);
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
            {isSyncing ? "Syncing\u2026" : "Sync to Drive"}
          </button>
          {showSyncSuccess && !isSyncing && (
            <span className="sync-status success">Synced</span>
          )}
        </div>
      </header>

      {syncError && (
        <div className="sync-error-banner">
          <span>Sync failed: {syncError}</span>
          <button
            type="button"
            className="sync-error-dismiss"
            onClick={() => setSyncError(null)}
            aria-label="Dismiss error"
          >
            ✕
          </button>
        </div>
      )}

      <main
        className={`app-main ${isFormOpen ? "layout-split" : "layout-centered"}`}
      >
        {isFormOpen ? (
          <>
            <div className="form-panel card">
              <div className="panel-header">
                <h2>Create Task</h2>
                <button
                  type="button"
                  className="close-btn"
                  onClick={() => setIsFormOpen(false)}
                  aria-label="Close form"
                >
                  ✕
                </button>
              </div>
              <TaskForm onAdd={handleAddTask} />
            </div>
            <TaskList tasks={tasks} onCompleteTask={handleCompleteTask} />
          </>
        ) : (
          <>
            <button
              type="button"
              className="primary create-task-btn"
              onClick={() => setIsFormOpen(true)}
            >
              + Create Task
            </button>
            <div className="list-centered">
              <TaskList tasks={tasks} onCompleteTask={handleCompleteTask} />
            </div>
          </>
        )}
      </main>

      <footer className="app-footer">
        <small>
          Data is currently stored in your browser&apos;s local storage. You can
          manually sync JSON files to your Google Drive.
        </small>
      </footer>
    </div>
  );
};
