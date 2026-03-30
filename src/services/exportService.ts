import type { Task } from "@domain/taskTypes";
import type { Project } from "@domain/projectTypes";
import { fromSerialized, toSerialized, type AppData } from "@services/localStorageService";

export type ImportJsonResult =
  | { ok: true; data: AppData }
  | { ok: false; error: "invalid_json" | "invalid_format" };

/** Parse JSON text from a backup file. Same shape as {@link exportDataAsJson} output or legacy tasks/projects. */
export function parseImportedAppDataJson(raw: string): ImportJsonResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "invalid_json" };
  }
  const data = fromSerialized(parsed);
  if (!data) return { ok: false, error: "invalid_format" };
  return { ok: true, data };
}

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
