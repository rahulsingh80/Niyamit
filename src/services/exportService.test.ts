import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseImportedAppDataJson, exportDataAsJson } from "./exportService";
import type { Task } from "@domain/taskTypes";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    title: "Task",
    dueDate: null,
    priority: 3,
    createdAt: "2026-01-01T00:00:00.000Z",
    completed: false,
    ...overrides,
  };
}

describe("parseImportedAppDataJson", () => {
  it("parses valid v2-shaped JSON", () => {
    const json = JSON.stringify({
      activeTasks: [task()],
      completedTasks: [],
      activeProjects: [],
      deletedProjects: [],
    });
    const result = parseImportedAppDataJson(json);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.tasks).toHaveLength(1);
  });

  it("parses valid legacy-shaped JSON", () => {
    const json = JSON.stringify({ tasks: [task()], projects: [] });
    const result = parseImportedAppDataJson(json);
    expect(result.ok).toBe(true);
  });

  it("returns invalid_json for syntactically broken JSON", () => {
    const result = parseImportedAppDataJson("{not valid json");
    expect(result).toEqual({ ok: false, error: "invalid_json" });
  });

  it("returns invalid_json for an empty string", () => {
    const result = parseImportedAppDataJson("");
    expect(result).toEqual({ ok: false, error: "invalid_json" });
  });

  it("returns invalid_format for valid JSON that doesn't match any known shape", () => {
    const result = parseImportedAppDataJson(JSON.stringify({ foo: "bar" }));
    expect(result).toEqual({ ok: false, error: "invalid_format" });
  });
});

describe("exportDataAsJson", () => {
  let createObjectURLSpy: ReturnType<typeof vi.spyOn>;
  let revokeObjectURLSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    createObjectURLSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-url");
    revokeObjectURLSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  });

  afterEach(() => {
    createObjectURLSpy.mockRestore();
    revokeObjectURLSpy.mockRestore();
  });

  it("creates and clicks a download link with a custom filename, then cleans up", () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const appendSpy = vi.spyOn(document.body, "appendChild");
    const removeSpy = vi.spyOn(document.body, "removeChild");

    exportDataAsJson([task()], [], "my-backup.json");

    expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(appendSpy).toHaveBeenCalledTimes(1);
    expect(removeSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURLSpy).toHaveBeenCalledWith("blob:mock-url");

    const link = appendSpy.mock.calls[0][0] as HTMLAnchorElement;
    expect(link.download).toBe("my-backup.json");

    clickSpy.mockRestore();
    appendSpy.mockRestore();
    removeSpy.mockRestore();
  });

  it("generates a default timestamp-based filename when none is provided", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 15, 9, 5));
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const appendSpy = vi.spyOn(document.body, "appendChild");

    exportDataAsJson([], []);

    const link = appendSpy.mock.calls[0][0] as HTMLAnchorElement;
    expect(link.download).toBe("niyamit-data_2026-06-15_09-05.json");

    clickSpy.mockRestore();
    appendSpy.mockRestore();
    vi.useRealTimers();
  });

  it("produces valid JSON output even for empty tasks/projects arrays", async () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    exportDataAsJson([], []);

    const blob = createObjectURLSpy.mock.calls[0][0] as Blob;
    const text = await blob.text();
    const parsed = JSON.parse(text);
    expect(parsed.activeTasks).toEqual([]);
    expect(parsed.activeProjects).toEqual([]);

    clickSpy.mockRestore();
  });
});
