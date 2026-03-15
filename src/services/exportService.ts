import type { Task } from "@domain/taskTypes";
import type { Project } from "@domain/projectTypes";
import { toSerialized } from "@services/localStorageService";

/**
 * Export tasks and projects to a JSON file (activeTasks, completedTasks, projects, tags) and trigger a download.
 */
export function exportDataAsJson(
  tasks: Task[],
  projects: Project[],
  filename = "niyamit-data.json"
) {
  if (typeof window === "undefined") return;

  const backup = toSerialized({ tasks, projects });

  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}
