import type { Task } from "@domain/taskTypes";

/**
 * Export tasks to a JSON file and trigger a download in the browser.
 */
export function exportTasksAsJson(
  tasks: Task[],
  filename = "niyamit-tasks.json"
) {
  if (typeof window === "undefined") return;

  const activeTasks = tasks.filter((task) => !task.completed);
  const completedTasks = tasks.filter((task) => task.completed);

  const backup = {
    activeTasks,
    completedTasks,
  };

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

