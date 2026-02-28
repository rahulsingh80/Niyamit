import type { Task } from "@domain/taskTypes";

const DRIVE_API_URL = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3";
const FOLDER_NAME = "Niyamit";
const FILE_NAME = "tasks.json";

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

/**
 * Searches for a file or folder by name. If parentId is provided, searches inside that folder.
 */
async function searchFileOrFolder(
  accessToken: string,
  name: string,
  mimeType: string,
  parentId?: string
): Promise<DriveFile | null> {
  let query = `name = '${name}' and mimeType = '${mimeType}' and trashed = false`;
  if (parentId) {
    query += ` and '${parentId}' in parents`;
  }

  const response = await fetch(
    `${DRIVE_API_URL}/files?q=${encodeURIComponent(query)}&spaces=drive&fields=files(id,name)`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`${response.status} Failed to search Drive: ${response.statusText}`);
  }

  const data = await response.json();
  return data.files && data.files.length > 0 ? data.files[0] : null;
}

/**
 * Creates the Niyamit folder in the root of Google Drive.
 */
async function createFolder(accessToken: string, name: string): Promise<string> {
  const metadata = {
    name,
    mimeType: "application/vnd.google-apps.folder",
  };

  const response = await fetch(`${DRIVE_API_URL}/files`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(metadata),
  });

  if (!response.ok) {
    throw new Error(`${response.status} Failed to create folder: ${response.statusText}`);
  }

  const data = await response.json();
  return data.id;
}

/**
 * Uploads a new JSON file to the specified folder.
 */
async function createJsonFile(
  accessToken: string,
  name: string,
  folderId: string,
  content: string
): Promise<string> {
  const metadata = {
    name,
    parents: [folderId],
  };

  const form = new FormData();
  form.append(
    "metadata",
    new Blob([JSON.stringify(metadata)], { type: "application/json" })
  );
  form.append("file", new Blob([content], { type: "application/json" }));

  const response = await fetch(`${DRIVE_UPLOAD_URL}/files?uploadType=multipart`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: form,
  });

  if (!response.ok) {
    throw new Error(`${response.status} Failed to create file: ${response.statusText}`);
  }

  const data = await response.json();
  return data.id;
}

/**
 * Updates an existing JSON file.
 */
async function updateJsonFile(
  accessToken: string,
  fileId: string,
  content: string
): Promise<void> {
  const response = await fetch(`${DRIVE_UPLOAD_URL}/files/${fileId}?uploadType=media`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: content,
  });

  if (!response.ok) {
    throw new Error(`Failed to update file: ${response.statusText}`);
  }
}

/**
 * Downloads the content of an existing JSON file.
 */
async function downloadJsonFile(
  accessToken: string,
  fileId: string
): Promise<Task[]> {
  const response = await fetch(`${DRIVE_API_URL}/files/${fileId}?alt=media`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`${response.status} Failed to download file: ${response.statusText}`);
  }

  const text = await response.text();
  try {
    return text ? JSON.parse(text) : [];
  } catch (err) {
    console.error("Failed to parse tasks from Drive", err);
    return [];
  }
}

/**
 * Merges local tasks with remote tasks based on updatedAt timestamp.
 */
export function mergeTasksByUpdatedAt(localTasks: Task[], remoteTasks: Task[]): Task[] {
  const map = new Map<string, Task>();
  for (const t of remoteTasks) {
    map.set(t.id, t);
  }
  for (const t of localTasks) {
    const existing = map.get(t.id);
    if (!existing) {
      map.set(t.id, t);
    } else {
      const localTime = new Date(t.updatedAt || t.createdAt).getTime();
      const remoteTime = new Date(existing.updatedAt || existing.createdAt).getTime();
      if (localTime > remoteTime) {
        map.set(t.id, t);
      }
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
      conflict: {
        taskId,
        fields: listTaskKeys(undefined, localTask, remoteTask),
        localTask,
        remoteTask,
        reason: "new-task-conflict",
      },
    };
  }

  const localChanged = !areEqual(localTask, baseTask);
  const remoteChanged = !areEqual(remoteTask, baseTask);

  if (!localChanged && !remoteChanged) return { mergedTask: baseTask };
  if (localChanged && !remoteChanged) return { mergedTask: localTask };
  if (!localChanged && remoteChanged) return { mergedTask: remoteTask };

  if (!localTask || !remoteTask) {
    return {
      conflict: {
        taskId,
        fields: listTaskKeys(baseTask, localTask, remoteTask),
        baseTask,
        localTask,
        remoteTask,
        reason: "delete-conflict",
      },
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

    if (localFieldChanged && !remoteFieldChanged) {
      merged[key] = localValue;
      continue;
    }
    if (!localFieldChanged && remoteFieldChanged) {
      merged[key] = remoteValue;
      continue;
    }
    if (!localFieldChanged && !remoteFieldChanged) {
      merged[key] = baseValue;
      continue;
    }

    if (areEqual(localValue, remoteValue)) {
      merged[key] = localValue;
    } else {
      conflictingFields.push(key);
    }
  }

  if (conflictingFields.length > 0) {
    return {
      conflict: {
        taskId,
        fields: conflictingFields,
        baseTask,
        localTask,
        remoteTask,
        reason: "field-conflict",
      },
    };
  }

  return { mergedTask: merged as unknown as Task };
}

export function mergeTasksThreeWay(
  baseTasks: Task[],
  localTasks: Task[],
  remoteTasks: Task[]
): MergeTasksResult {
  const baseMap = asTaskMap(baseTasks);
  const localMap = asTaskMap(localTasks);
  const remoteMap = asTaskMap(remoteTasks);

  const allIds = new Set<string>([
    ...baseMap.keys(),
    ...localMap.keys(),
    ...remoteMap.keys(),
  ]);

  const mergedMap = new Map<string, Task>();
  const conflicts: TaskConflict[] = [];

  for (const id of allIds) {
    const result = mergeTaskThreeWay(baseMap.get(id), localMap.get(id), remoteMap.get(id));
    if (result.conflict) {
      conflicts.push(result.conflict);
      continue;
    }
    if (result.mergedTask) mergedMap.set(id, result.mergedTask);
  }

  return {
    mergedTasks: Array.from(mergedMap.values()),
    conflicts,
  };
}

export async function getOrCreateTasksFileId(accessToken: string): Promise<string> {
  let folder = await searchFileOrFolder(
    accessToken,
    FOLDER_NAME,
    "application/vnd.google-apps.folder"
  );
  let folderId = folder?.id;

  if (!folderId) {
    folderId = await createFolder(accessToken, FOLDER_NAME);
  }

  const file = await searchFileOrFolder(
    accessToken,
    FILE_NAME,
    "application/json",
    folderId
  );

  if (file?.id) return file.id;

  return createJsonFile(accessToken, FILE_NAME, folderId, JSON.stringify([], null, 2));
}

export async function downloadTasksFromDrive(
  accessToken: string,
  fileId: string
): Promise<Task[]> {
  return downloadJsonFile(accessToken, fileId);
}

export async function uploadTasksToDrive(
  accessToken: string,
  fileId: string,
  tasks: Task[]
): Promise<void> {
  await updateJsonFile(accessToken, fileId, JSON.stringify(tasks, null, 2));
}

/**
 * Saves tasks to Google Drive.
 * 1. Finds or creates the "Niyamit" folder.
 * 2. Finds or creates the "tasks.json" file.
 * 3. Updates the file if it exists, otherwise creates it.
 * @deprecated Use syncTasksWithDrive for two-way sync instead.
 */
export async function saveTasksToDrive(
  accessToken: string,
  tasks: Task[]
): Promise<void> {
  // 1. Get or create folder
  let folder = await searchFileOrFolder(
    accessToken,
    FOLDER_NAME,
    "application/vnd.google-apps.folder"
  );
  let folderId = folder?.id;

  if (!folderId) {
    folderId = await createFolder(accessToken, FOLDER_NAME);
  }

  // 2. Get or create tasks file
  const file = await searchFileOrFolder(
    accessToken,
    FILE_NAME,
    "application/json",
    folderId
  );

  const jsonContent = JSON.stringify(tasks, null, 2);

  if (file?.id) {
    // 3a. Update existing file
    await updateJsonFile(accessToken, file.id, jsonContent);
  } else {
    // 3b. Create new file
    await createJsonFile(accessToken, FILE_NAME, folderId, jsonContent);
  }
}

/**
 * Syncs tasks with Google Drive.
 * 1. Finds or creates the "Niyamit" folder.
 * 2. Finds or creates the "tasks.json" file.
 * 3. If file exists, downloads and merges remote tasks with local tasks.
 * 4. Uploads the merged result and returns it.
 */
export async function syncTasksWithDrive(
  accessToken: string,
  localTasks: Task[]
): Promise<Task[]> {
  let folder = await searchFileOrFolder(
    accessToken,
    FOLDER_NAME,
    "application/vnd.google-apps.folder"
  );
  let folderId = folder?.id;

  if (!folderId) {
    folderId = await createFolder(accessToken, FOLDER_NAME);
  }

  const file = await searchFileOrFolder(
    accessToken,
    FILE_NAME,
    "application/json",
    folderId
  );

  let mergedTasks = [...localTasks];

  if (file?.id) {
    const remoteTasks = await downloadJsonFile(accessToken, file.id);
    mergedTasks = mergeTasksByUpdatedAt(localTasks, remoteTasks);
    
    const jsonContent = JSON.stringify(mergedTasks, null, 2);
    await updateJsonFile(accessToken, file.id, jsonContent);
  } else {
    const jsonContent = JSON.stringify(mergedTasks, null, 2);
    await createJsonFile(accessToken, FILE_NAME, folderId, jsonContent);
  }

  return mergedTasks;
}
