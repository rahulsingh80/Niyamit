import type { Task } from "@domain/taskTypes";
import type { Project } from "@domain/projectTypes";
import type { AppData } from "@services/localStorageService";

const DRIVE_API_URL = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3";
const FOLDER_NAME = "Niyamit";
const DATA_FILE_NAME = "niyamit-data.json";
const LEGACY_TASKS_FILE = "tasks.json";
const LEGACY_PROJECTS_FILE = "projects.json";

interface DriveFile {
  id: string;
  name: string;
}

export interface TaskConflict {
  taskId: string;
  fields: string[];
  baseTask?: Task;
  localTask?: Task;
  remoteTask?: Task;
  reason: "field-conflict" | "delete-conflict" | "new-task-conflict";
}

export interface MergeTasksResult {
  mergedTasks: Task[];
  conflicts: TaskConflict[];
}

export interface MergeAppDataResult {
  mergedData: AppData;
  conflicts: TaskConflict[];
}

// ── Low-level Drive helpers ─────────────────────────────

async function searchFileOrFolder(
  accessToken: string,
  name: string,
  mimeType: string,
  parentId?: string
): Promise<DriveFile | null> {
  let query = `name = '${name}' and mimeType = '${mimeType}' and trashed = false`;
  if (parentId) query += ` and '${parentId}' in parents`;
  const response = await fetch(
    `${DRIVE_API_URL}/files?q=${encodeURIComponent(query)}&spaces=drive&fields=files(id,name)`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!response.ok) throw new Error(`${response.status} Failed to search Drive: ${response.statusText}`);
  const data = await response.json();
  return data.files?.[0] ?? null;
}

async function createFolder(accessToken: string, name: string): Promise<string> {
  const response = await fetch(`${DRIVE_API_URL}/files`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder" }),
  });
  if (!response.ok) throw new Error(`${response.status} Failed to create folder: ${response.statusText}`);
  return (await response.json()).id;
}

async function createJsonFile(
  accessToken: string, name: string, folderId: string, content: string
): Promise<string> {
  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify({ name, parents: [folderId] })], { type: "application/json" }));
  form.append("file", new Blob([content], { type: "application/json" }));
  const response = await fetch(`${DRIVE_UPLOAD_URL}/files?uploadType=multipart`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });
  if (!response.ok) throw new Error(`${response.status} Failed to create file: ${response.statusText}`);
  return (await response.json()).id;
}

async function updateJsonFile(accessToken: string, fileId: string, content: string): Promise<void> {
  const response = await fetch(`${DRIVE_UPLOAD_URL}/files/${fileId}?uploadType=media`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: content,
  });
  if (!response.ok) throw new Error(`Failed to update file: ${response.statusText}`);
}

async function downloadJsonFileRaw(accessToken: string, fileId: string): Promise<unknown> {
  const response = await fetch(`${DRIVE_API_URL}/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(`${response.status} Failed to download file: ${response.statusText}`);
  const text = await response.text();
  try { return text ? JSON.parse(text) : null; }
  catch { return null; }
}

async function getOrCreateFolderId(accessToken: string): Promise<string> {
  const folder = await searchFileOrFolder(accessToken, FOLDER_NAME, "application/vnd.google-apps.folder");
  return folder?.id ?? await createFolder(accessToken, FOLDER_NAME);
}

// ── Public API ──────────────────────────────────────────

/**
 * Gets or creates the unified data file. If the new file doesn't exist but
 * legacy tasks.json / projects.json do, migrates them into the new file.
 */
export async function getOrCreateDataFileId(accessToken: string): Promise<string> {
  const folderId = await getOrCreateFolderId(accessToken);

  const dataFile = await searchFileOrFolder(accessToken, DATA_FILE_NAME, "application/json", folderId);
  if (dataFile?.id) return dataFile.id;

  // Migrate from legacy separate files
  let tasks: Task[] = [];
  let projects: Project[] = [];

  const legacyTasks = await searchFileOrFolder(accessToken, LEGACY_TASKS_FILE, "application/json", folderId);
  if (legacyTasks?.id) {
    const raw = await downloadJsonFileRaw(accessToken, legacyTasks.id);
    if (Array.isArray(raw)) tasks = raw as Task[];
  }

  const legacyProjects = await searchFileOrFolder(accessToken, LEGACY_PROJECTS_FILE, "application/json", folderId);
  if (legacyProjects?.id) {
    const raw = await downloadJsonFileRaw(accessToken, legacyProjects.id);
    if (Array.isArray(raw)) projects = raw as Project[];
  }

  const initial: AppData = { tasks, projects };
  return createJsonFile(accessToken, DATA_FILE_NAME, folderId, JSON.stringify(initial, null, 2));
}

export async function downloadAppDataFromDrive(accessToken: string, fileId: string): Promise<AppData> {
  const raw = await downloadJsonFileRaw(accessToken, fileId);
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    return {
      tasks: Array.isArray(obj.tasks) ? obj.tasks as Task[] : [],
      projects: Array.isArray(obj.projects) ? obj.projects as Project[] : [],
    };
  }
  // Handle legacy format: bare Task[]
  if (Array.isArray(raw)) return { tasks: raw as Task[], projects: [] };
  return { tasks: [], projects: [] };
}

export async function uploadAppDataToDrive(accessToken: string, fileId: string, data: AppData): Promise<void> {
  await updateJsonFile(accessToken, fileId, JSON.stringify(data, null, 2));
}

// ── Merge logic ─────────────────────────────────────────

export function mergeProjectsByUpdatedAt(localProjects: Project[], remoteProjects: Project[]): Project[] {
  const map = new Map<string, Project>();
  for (const p of remoteProjects) map.set(p.id, p);
  for (const p of localProjects) {
    const existing = map.get(p.id);
    if (!existing) {
      map.set(p.id, p);
    } else {
      const localTime = new Date(p.updatedAt || p.createdAt).getTime();
      const remoteTime = new Date(existing.updatedAt || existing.createdAt).getTime();
      if (localTime > remoteTime) map.set(p.id, p);
    }
  }
  return Array.from(map.values());
}

export function mergeTasksByUpdatedAt(localTasks: Task[], remoteTasks: Task[]): Task[] {
  const map = new Map<string, Task>();
  for (const t of remoteTasks) map.set(t.id, t);
  for (const t of localTasks) {
    const existing = map.get(t.id);
    if (!existing) {
      map.set(t.id, t);
    } else {
      const localTime = new Date(t.updatedAt || t.createdAt).getTime();
      const remoteTime = new Date(existing.updatedAt || existing.createdAt).getTime();
      if (localTime > remoteTime) map.set(t.id, t);
    }
  }
  return Array.from(map.values());
}

function areEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function asTaskMap(tasks: Task[]): Map<string, Task> {
  return new Map(tasks.map((t) => [t.id, t]));
}

function listTaskKeys(base?: Task, local?: Task, remote?: Task): string[] {
  const keys = new Set<string>();
  for (const obj of [base, local, remote]) {
    if (!obj) continue;
    for (const key of Object.keys(obj)) keys.add(key);
  }
  return Array.from(keys);
}

function mergeTaskThreeWay(
  baseTask: Task | undefined,
  localTask: Task | undefined,
  remoteTask: Task | undefined
): { mergedTask?: Task; conflict?: TaskConflict } {
  const taskId = localTask?.id || remoteTask?.id || baseTask?.id;
  if (!taskId) return {};

  if (!baseTask) {
    if (!localTask && !remoteTask) return {};
    if (!localTask) return { mergedTask: remoteTask };
    if (!remoteTask) return { mergedTask: localTask };
    if (areEqual(localTask, remoteTask)) return { mergedTask: localTask };
    return {
      conflict: { taskId, fields: listTaskKeys(undefined, localTask, remoteTask), localTask, remoteTask, reason: "new-task-conflict" },
    };
  }

  const localChanged = !areEqual(localTask, baseTask);
  const remoteChanged = !areEqual(remoteTask, baseTask);

  if (!localChanged && !remoteChanged) return { mergedTask: baseTask };
  if (localChanged && !remoteChanged) return { mergedTask: localTask };
  if (!localChanged && remoteChanged) return { mergedTask: remoteTask };

  if (!localTask || !remoteTask) {
    return {
      conflict: { taskId, fields: listTaskKeys(baseTask, localTask, remoteTask), baseTask, localTask, remoteTask, reason: "delete-conflict" },
    };
  }

  if (areEqual(localTask, remoteTask)) return { mergedTask: localTask };

  const keys = listTaskKeys(baseTask, localTask, remoteTask);
  const merged: Record<string, unknown> = {};
  const conflictingFields: string[] = [];

  for (const key of keys) {
    const baseValue = (baseTask as unknown as Record<string, unknown>)[key];
    const localValue = (localTask as unknown as Record<string, unknown>)[key];
    const remoteValue = (remoteTask as unknown as Record<string, unknown>)[key];
    const localFieldChanged = !areEqual(localValue, baseValue);
    const remoteFieldChanged = !areEqual(remoteValue, baseValue);

    if (localFieldChanged && !remoteFieldChanged) { merged[key] = localValue; continue; }
    if (!localFieldChanged && remoteFieldChanged) { merged[key] = remoteValue; continue; }
    if (!localFieldChanged && !remoteFieldChanged) { merged[key] = baseValue; continue; }
    if (areEqual(localValue, remoteValue)) { merged[key] = localValue; } else { conflictingFields.push(key); }
  }

  if (conflictingFields.length > 0) {
    return {
      conflict: { taskId, fields: conflictingFields, baseTask, localTask, remoteTask, reason: "field-conflict" },
    };
  }

  return { mergedTask: merged as unknown as Task };
}

export function mergeTasksThreeWay(baseTasks: Task[], localTasks: Task[], remoteTasks: Task[]): MergeTasksResult {
  const baseMap = asTaskMap(baseTasks);
  const localMap = asTaskMap(localTasks);
  const remoteMap = asTaskMap(remoteTasks);
  const allIds = new Set<string>([...baseMap.keys(), ...localMap.keys(), ...remoteMap.keys()]);
  const mergedMap = new Map<string, Task>();
  const conflicts: TaskConflict[] = [];

  for (const id of allIds) {
    const result = mergeTaskThreeWay(baseMap.get(id), localMap.get(id), remoteMap.get(id));
    if (result.conflict) { conflicts.push(result.conflict); continue; }
    if (result.mergedTask) mergedMap.set(id, result.mergedTask);
  }
  return { mergedTasks: Array.from(mergedMap.values()), conflicts };
}

/**
 * Full AppData merge: three-way for tasks, updatedAt-based for projects.
 */
export function mergeAppData(
  base: AppData | null,
  local: AppData,
  remote: AppData,
): MergeAppDataResult {
  const taskResult = base
    ? mergeTasksThreeWay(base.tasks, local.tasks, remote.tasks)
    : { mergedTasks: mergeTasksByUpdatedAt(local.tasks, remote.tasks), conflicts: [] };

  const mergedProjects = mergeProjectsByUpdatedAt(local.projects, remote.projects);

  return {
    mergedData: { tasks: taskResult.mergedTasks, projects: mergedProjects },
    conflicts: taskResult.conflicts,
  };
}
