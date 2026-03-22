import type { Task } from "@domain/taskTypes";
import type { Project } from "@domain/projectTypes";
import { toSerialized } from "@services/localStorageService";

function formatExportTimestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}`;
}

/**
 * Export tasks and projects to a JSON file (activeTasks, completedTasks, projects, tags) and trigger a download.
 * Default filename: niyamit-data-YYYY-MM-DD-HH-mm.json (local time).
 */
export function exportDataAsJson(
  tasks: Task[],
  projects: Project[],
  filename?: string
) {
  if (typeof window === "undefined") return;

  const downloadName = filename ?? `niyamit-data_${formatExportTimestamp()}.json`;

  const backup = toSerialized({ tasks, projects });

  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = downloadName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}
