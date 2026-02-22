import type { Task } from "@domain/taskTypes";

const DRIVE_API_URL = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3";
const FOLDER_NAME = "Niyamit";
const FILE_NAME = "tasks.json";

interface DriveFile {
  id: string;
  name: string;
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
    throw new Error(`Failed to search Drive: ${response.statusText}`);
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
    throw new Error(`Failed to create folder: ${response.statusText}`);
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
    throw new Error(`Failed to create file: ${response.statusText}`);
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
 * Saves tasks to Google Drive.
 * 1. Finds or creates the "Niyamit" folder.
 * 2. Finds or creates the "tasks.json" file.
 * 3. Updates the file if it exists, otherwise creates it.
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
