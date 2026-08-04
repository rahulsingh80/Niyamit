import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  mergeProjectsByUpdatedAt,
  mergeTasksByUpdatedAt,
  mergeTasksThreeWay,
  mergeAppData,
  getOrCreateDataFileId,
  downloadAppDataFromDrive,
  uploadAppDataToDrive,
} from "./googleDriveService";
import type { Task } from "@domain/taskTypes";
import type { Project } from "@domain/projectTypes";

function task(overrides: Partial<Task> & { id: string }): Task {
  return {
    title: "Task",
    dueDate: null,
    priority: 3,
    createdAt: "2026-01-01T00:00:00.000Z",
    completed: false,
    ...overrides,
  };
}

function project(overrides: Partial<Project> & { id: string }): Project {
  return {
    name: overrides.id,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("mergeProjectsByUpdatedAt", () => {
  it("keeps a project that only exists locally", () => {
    const local = [project({ id: "a" })];
    expect(mergeProjectsByUpdatedAt(local, [])).toEqual(local);
  });

  it("keeps a project that only exists remotely", () => {
    const remote = [project({ id: "a" })];
    expect(mergeProjectsByUpdatedAt([], remote)).toEqual(remote);
  });

  it("prefers the newer-updatedAt version when both sides have the project", () => {
    const local = project({ id: "a", name: "Local", updatedAt: "2026-02-01T00:00:00.000Z" });
    const remote = project({ id: "a", name: "Remote", updatedAt: "2026-01-01T00:00:00.000Z" });
    expect(mergeProjectsByUpdatedAt([local], [remote])).toEqual([local]);
  });

  it("prefers remote when timestamps are exactly equal", () => {
    const local = project({ id: "a", name: "Local", updatedAt: "2026-01-01T00:00:00.000Z" });
    const remote = project({ id: "a", name: "Remote", updatedAt: "2026-01-01T00:00:00.000Z" });
    expect(mergeProjectsByUpdatedAt([local], [remote])).toEqual([remote]);
  });

  it("falls back to createdAt when updatedAt is missing", () => {
    const local = project({ id: "a", name: "Local", createdAt: "2026-02-01T00:00:00.000Z" });
    const remote = project({ id: "a", name: "Remote", createdAt: "2026-01-01T00:00:00.000Z" });
    expect(mergeProjectsByUpdatedAt([local], [remote])).toEqual([local]);
  });
});

describe("mergeTasksByUpdatedAt", () => {
  it("keeps a task that only exists locally", () => {
    const local = [task({ id: "a" })];
    expect(mergeTasksByUpdatedAt(local, [])).toEqual(local);
  });

  it("keeps a task that only exists remotely", () => {
    const remote = [task({ id: "a" })];
    expect(mergeTasksByUpdatedAt([], remote)).toEqual(remote);
  });

  it("prefers the newer-updatedAt version", () => {
    const local = task({ id: "a", title: "Local", updatedAt: "2026-02-01T00:00:00.000Z" });
    const remote = task({ id: "a", title: "Remote", updatedAt: "2026-01-01T00:00:00.000Z" });
    expect(mergeTasksByUpdatedAt([local], [remote])).toEqual([local]);
  });
});

describe("mergeTasksThreeWay", () => {
  it("no base, only local created the task -> keeps local, no conflict", () => {
    const local = task({ id: "a" });
    const { mergedTasks, conflicts } = mergeTasksThreeWay([], [local], []);
    expect(mergedTasks).toEqual([local]);
    expect(conflicts).toEqual([]);
  });

  it("no base, only remote created the task -> keeps remote, no conflict", () => {
    const remote = task({ id: "a" });
    const { mergedTasks, conflicts } = mergeTasksThreeWay([], [], [remote]);
    expect(mergedTasks).toEqual([remote]);
    expect(conflicts).toEqual([]);
  });

  it("no base, both sides created an identical task -> merges cleanly", () => {
    const t = task({ id: "a" });
    const { mergedTasks, conflicts } = mergeTasksThreeWay([], [t], [{ ...t }]);
    expect(mergedTasks).toEqual([t]);
    expect(conflicts).toEqual([]);
  });

  it("no base, both sides created a different task with the same id -> new-task-conflict", () => {
    const local = task({ id: "a", title: "Local title" });
    const remote = task({ id: "a", title: "Remote title" });
    const { mergedTasks, conflicts } = mergeTasksThreeWay([], [local], [remote]);
    expect(mergedTasks).toEqual([]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ taskId: "a", reason: "new-task-conflict", localTask: local, remoteTask: remote });
  });

  it("base exists, neither side changed -> keeps base", () => {
    const base = task({ id: "a", title: "Base" });
    const { mergedTasks, conflicts } = mergeTasksThreeWay([base], [{ ...base }], [{ ...base }]);
    expect(mergedTasks).toEqual([base]);
    expect(conflicts).toEqual([]);
  });

  it("base exists, only local changed -> keeps local", () => {
    const base = task({ id: "a", title: "Base" });
    const local = { ...base, title: "Local edit" };
    const { mergedTasks, conflicts } = mergeTasksThreeWay([base], [local], [{ ...base }]);
    expect(mergedTasks).toEqual([local]);
    expect(conflicts).toEqual([]);
  });

  it("base exists, only remote changed -> keeps remote", () => {
    const base = task({ id: "a", title: "Base" });
    const remote = { ...base, title: "Remote edit" };
    const { mergedTasks, conflicts } = mergeTasksThreeWay([base], [{ ...base }], [remote]);
    expect(mergedTasks).toEqual([remote]);
    expect(conflicts).toEqual([]);
  });

  it("base exists, one side deleted (removed) the task while the other modified it -> delete-conflict", () => {
    const base = task({ id: "a", title: "Base" });
    const remote = { ...base, title: "Remote edit" };
    const { mergedTasks, conflicts } = mergeTasksThreeWay([base], [], [remote]);
    expect(mergedTasks).toEqual([]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].reason).toBe("delete-conflict");
  });

  it("base exists, both sides changed to the exact same result -> merges cleanly, no conflict", () => {
    const base = task({ id: "a", title: "Base" });
    const local = { ...base, title: "Same edit" };
    const remote = { ...base, title: "Same edit" };
    const { mergedTasks, conflicts } = mergeTasksThreeWay([base], [local], [remote]);
    expect(mergedTasks).toEqual([local]);
    expect(conflicts).toEqual([]);
  });

  it("base exists, both sides changed different fields -> merges non-conflicting fields independently", () => {
    const base = task({ id: "a", title: "Base", notes: "base notes", priority: 3 });
    const local = { ...base, title: "Local title" }; // only title changed
    const remote = { ...base, priority: 1 as const }; // only priority changed
    const { mergedTasks, conflicts } = mergeTasksThreeWay([base], [local], [remote]);
    expect(conflicts).toEqual([]);
    expect(mergedTasks[0]).toMatchObject({ title: "Local title", priority: 1, notes: "base notes" });
  });

  it("base exists, both sides changed the same field to different values -> field-conflict", () => {
    const base = task({ id: "a", title: "Base" });
    const local = { ...base, title: "Local title" };
    const remote = { ...base, title: "Remote title" };
    const { mergedTasks, conflicts } = mergeTasksThreeWay([base], [local], [remote]);
    expect(mergedTasks).toEqual([]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ taskId: "a", reason: "field-conflict", fields: ["title"] });
  });

  it("merges tasks present across base/local/remote using the union of all ids", () => {
    const onlyBase = task({ id: "gone-both-sides", title: "will be deleted by both" });
    const onlyLocal = task({ id: "new-local" });
    const onlyRemote = task({ id: "new-remote" });
    const { mergedTasks } = mergeTasksThreeWay([onlyBase], [onlyLocal], [onlyRemote]);
    const ids = mergedTasks.map((t) => t.id).sort();
    // onlyBase disappears entirely since neither local nor remote lists include it, and diffing
    // reports "neither changed" only when both provide the same task -- here both omit it so it is dropped silently.
    expect(ids).toEqual(["new-local", "new-remote"]);
  });
});

describe("mergeAppData", () => {
  it("uses a two-way updatedAt merge (no conflicts possible) when base is null", () => {
    const local = { tasks: [task({ id: "a", title: "Local", updatedAt: "2026-02-01T00:00:00.000Z" })], projects: [] };
    const remote = { tasks: [task({ id: "a", title: "Remote", updatedAt: "2026-01-01T00:00:00.000Z" })], projects: [] };
    const result = mergeAppData(null, local, remote);
    expect(result.conflicts).toEqual([]);
    expect(result.mergedData.tasks[0].title).toBe("Local");
  });

  it("uses the three-way merge (with possible conflicts) when base is provided", () => {
    const base = { tasks: [task({ id: "a", title: "Base" })], projects: [] };
    const local = { tasks: [{ ...base.tasks[0], title: "Local title" }], projects: [] };
    const remote = { tasks: [{ ...base.tasks[0], title: "Remote title" }], projects: [] };
    const result = mergeAppData(base, local, remote);
    expect(result.conflicts).toHaveLength(1);
  });

  it("always merges projects by updatedAt, never producing conflicts, regardless of base presence", () => {
    const local = { tasks: [], projects: [project({ id: "p", name: "Local", updatedAt: "2026-02-01T00:00:00.000Z" })] };
    const remote = { tasks: [], projects: [project({ id: "p", name: "Remote", updatedAt: "2026-01-01T00:00:00.000Z" })] };
    const withBase = mergeAppData({ tasks: [], projects: [] }, local, remote);
    const withoutBase = mergeAppData(null, local, remote);
    expect(withBase.conflicts).toEqual([]);
    expect(withoutBase.conflicts).toEqual([]);
    expect(withBase.mergedData.projects[0].name).toBe("Local");
    expect(withoutBase.mergedData.projects[0].name).toBe("Local");
  });
});

// ── Network-calling functions (fetch mocked) ────────────────────────────

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    statusText: ok ? "OK" : "Error",
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe("network-calling Drive functions", () => {
  const TOKEN = "fake-token";

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("getOrCreateDataFileId returns the existing data file id without migrating (fast path)", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ files: [{ id: "folder-1", name: "Niyamit" }] })) // folder search
      .mockResolvedValueOnce(jsonResponse({ files: [{ id: "file-1", name: "niyamit-data.json" }] })); // data file search

    const fileId = await getOrCreateDataFileId(TOKEN);
    expect(fileId).toBe("file-1");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("getOrCreateDataFileId migrates from legacy tasks.json/projects.json when the data file doesn't exist", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const legacyTasks = [task({ id: "legacy-1" })];
    const legacyProjects = [project({ id: "legacy-p1" })];
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ files: [{ id: "folder-1", name: "Niyamit" }] })) // folder search
      .mockResolvedValueOnce(jsonResponse({ files: [] })) // data file search: not found
      .mockResolvedValueOnce(jsonResponse({ files: [{ id: "legacy-tasks-id", name: "tasks.json" }] })) // legacy tasks search
      .mockResolvedValueOnce(jsonResponse(legacyTasks)) // download legacy tasks
      .mockResolvedValueOnce(jsonResponse({ files: [{ id: "legacy-projects-id", name: "projects.json" }] })) // legacy projects search
      .mockResolvedValueOnce(jsonResponse(legacyProjects)) // download legacy projects
      .mockResolvedValueOnce(jsonResponse({ id: "new-file-id" })); // create new file

    const fileId = await getOrCreateDataFileId(TOKEN);
    expect(fileId).toBe("new-file-id");

    const createCall = fetchMock.mock.calls.find((c) => String(c[0]).includes("uploadType=multipart"));
    expect(createCall).toBeDefined();
  });

  it("getOrCreateDataFileId with no data file and no legacy files creates an empty data file", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ files: [{ id: "folder-1", name: "Niyamit" }] }))
      .mockResolvedValueOnce(jsonResponse({ files: [] })) // data file: not found
      .mockResolvedValueOnce(jsonResponse({ files: [] })) // legacy tasks: not found
      .mockResolvedValueOnce(jsonResponse({ files: [] })) // legacy projects: not found
      .mockResolvedValueOnce(jsonResponse({ id: "new-file-id" }));

    const fileId = await getOrCreateDataFileId(TOKEN);
    expect(fileId).toBe("new-file-id");
  });

  it("ignores malformed (non-array) legacy file content during migration", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ files: [{ id: "folder-1", name: "Niyamit" }] }))
      .mockResolvedValueOnce(jsonResponse({ files: [] }))
      .mockResolvedValueOnce(jsonResponse({ files: [{ id: "legacy-tasks-id", name: "tasks.json" }] }))
      .mockResolvedValueOnce(jsonResponse({ not: "an array" })) // malformed legacy tasks content
      .mockResolvedValueOnce(jsonResponse({ files: [] })) // no legacy projects
      .mockResolvedValueOnce(jsonResponse({ id: "new-file-id" }));

    const fileId = await getOrCreateDataFileId(TOKEN);
    expect(fileId).toBe("new-file-id");
  });

  it("throws a descriptive error when a Drive search request fails", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false, 401));
    await expect(getOrCreateDataFileId(TOKEN)).rejects.toThrow(/401/);
  });

  it("downloadAppDataFromDrive parses a v2 object response", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ activeTasks: [task({ id: "a" })], completedTasks: [], activeProjects: [], deletedProjects: [] }),
    );
    const data = await downloadAppDataFromDrive(TOKEN, "file-1");
    expect(data.tasks).toHaveLength(1);
  });

  it("downloadAppDataFromDrive treats a raw array response as a legacy tasks-only file", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(jsonResponse([task({ id: "a" })]));
    const data = await downloadAppDataFromDrive(TOKEN, "file-1");
    expect(data).toEqual({ tasks: [task({ id: "a" })], projects: [] });
  });

  it("downloadAppDataFromDrive returns empty AppData for a null/empty response", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce({ ok: true, text: async () => "" } as Response);
    const data = await downloadAppDataFromDrive(TOKEN, "file-1");
    expect(data).toEqual({ tasks: [], projects: [] });
  });

  it("downloadAppDataFromDrive returns empty AppData when the raw body is malformed JSON", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce({ ok: true, text: async () => "{not valid" } as Response);
    const data = await downloadAppDataFromDrive(TOKEN, "file-1");
    expect(data).toEqual({ tasks: [], projects: [] });
  });

  it("uploadAppDataToDrive serializes AppData and PATCHes the file content", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce({ ok: true, statusText: "OK" } as Response);

    await uploadAppDataToDrive(TOKEN, "file-1", { tasks: [task({ id: "a" })], projects: [] });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("file-1");
    expect(init?.method).toBe("PATCH");
    const body = JSON.parse(init?.body as string);
    expect(body.activeTasks).toHaveLength(1);
  });

  it("uploadAppDataToDrive throws when the PATCH request fails", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce({ ok: false, statusText: "Forbidden" } as Response);
    await expect(uploadAppDataToDrive(TOKEN, "file-1", { tasks: [], projects: [] })).rejects.toThrow(/Forbidden/);
  });
});
