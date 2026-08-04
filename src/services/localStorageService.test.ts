import { describe, it, expect, beforeEach } from "vitest";
import { toSerialized, fromSerialized, loadAppData, saveAppData } from "./localStorageService";
import type { AppData } from "./localStorageService";
import type { Task } from "@domain/taskTypes";
import type { Project } from "@domain/projectTypes";

let idCounter = 0;
function task(overrides: Partial<Task> = {}): Task {
  idCounter += 1;
  return {
    id: `t${idCounter}`,
    title: `Task ${idCounter}`,
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

beforeEach(() => {
  idCounter = 0;
  window.localStorage.clear();
});

describe("toSerialized", () => {
  it("puts a task that is both completed and deleted only into deletedTasks", () => {
    const t = task({ completed: true, deleted: true });
    const result = toSerialized({ tasks: [t], projects: [] });
    expect(result.deletedTasks).toEqual([t]);
    expect(result.activeTasks).toEqual([]);
    expect(result.completedTasks).toEqual([]);
  });

  it("buckets active, completed, and deleted tasks separately", () => {
    const active = task();
    const completed = task({ completed: true });
    const deleted = task({ deleted: true });
    const result = toSerialized({ tasks: [active, completed, deleted], projects: [] });
    expect(result.activeTasks).toEqual([active]);
    expect(result.completedTasks).toEqual([completed]);
    expect(result.deletedTasks).toEqual([deleted]);
  });

  it("buckets active and deleted projects separately", () => {
    const active = project({ id: "a" });
    const deleted = project({ id: "b", deleted: true });
    const result = toSerialized({ tasks: [], projects: [active, deleted] });
    expect(result.activeProjects).toEqual([active]);
    expect(result.deletedProjects).toEqual([deleted]);
  });

  it("dedupes tags across tasks and returns them sorted", () => {
    const t1 = task({ tags: ["b", "a"] });
    const t2 = task({ tags: ["a", "c"] });
    const result = toSerialized({ tasks: [t1, t2], projects: [] });
    expect(result.tags).toEqual(["a", "b", "c"]);
  });

  it("handles empty input", () => {
    const result = toSerialized({ tasks: [], projects: [] });
    expect(result).toEqual({
      activeTasks: [],
      completedTasks: [],
      deletedTasks: [],
      activeProjects: [],
      deletedProjects: [],
      tags: [],
    });
  });
});

describe("fromSerialized", () => {
  it("parses a v2 shape with activeTasks/completedTasks only (deletedTasks defaults to [])", () => {
    const active = task();
    const completed = task({ completed: true });
    const result = fromSerialized({
      activeTasks: [active],
      completedTasks: [completed],
      activeProjects: [],
      deletedProjects: [],
    });
    expect(result?.tasks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: active.id }),
      expect.objectContaining({ id: completed.id }),
    ]));
    expect(result?.tasks).toHaveLength(2);
  });

  it("parses a v2 shape including deletedTasks, activeProjects, and deletedProjects", () => {
    const deleted = task({ deleted: true });
    const p1 = project({ id: "p1" });
    const p2 = project({ id: "p2", deleted: true });
    const result = fromSerialized({
      activeTasks: [],
      completedTasks: [],
      deletedTasks: [deleted],
      activeProjects: [p1],
      deletedProjects: [p2],
    });
    expect(result?.tasks.map((t) => t.id)).toEqual([deleted.id]);
    expect(result?.projects).toEqual(expect.arrayContaining([p1, p2]));
  });

  it("falls back to a top-level 'projects' array when activeProjects/deletedProjects are absent", () => {
    const p = project({ id: "p1" });
    const result = fromSerialized({
      activeTasks: [],
      completedTasks: [],
      projects: [p],
    });
    expect(result?.projects).toEqual([p]);
  });

  it("parses the legacy tasks+projects shape", () => {
    const t = task();
    const p = project({ id: "p1" });
    const result = fromSerialized({ tasks: [t], projects: [p] });
    expect(result?.tasks[0].id).toBe(t.id);
    expect(result?.projects).toEqual([p]);
  });

  it("legacy shape with only 'tasks' key defaults projects to an empty array", () => {
    const t = task();
    const result = fromSerialized({ tasks: [t] });
    expect(result?.projects).toEqual([]);
  });

  it("a duplicate task id present in both activeTasks and completedTasks resolves to the completedTasks version (later entries win)", () => {
    const activeVersion = task({ id: "dup", title: "Active version" });
    const completedVersion: Task = { ...activeVersion, title: "Completed version", completed: true };
    const result = fromSerialized({
      activeTasks: [activeVersion],
      completedTasks: [completedVersion],
    });
    expect(result?.tasks).toHaveLength(1);
    expect(result?.tasks[0].title).toBe("Completed version");
  });

  it("returns null for null input", () => {
    expect(fromSerialized(null)).toBeNull();
  });

  it("returns null for an array input", () => {
    expect(fromSerialized([1, 2, 3])).toBeNull();
  });

  it("returns null for a non-array, non-object primitive", () => {
    expect(fromSerialized("hello")).toBeNull();
  });

  it("returns null for an object matching neither v2 nor legacy shape", () => {
    expect(fromSerialized({ foo: "bar" })).toBeNull();
  });
});

describe("loadAppData", () => {
  it("returns empty data when nothing is in storage", () => {
    expect(loadAppData()).toEqual({ tasks: [], projects: [] });
  });

  it("loads valid v2 data from the current storage key", () => {
    const t = task();
    saveAppData({ tasks: [t], projects: [] });
    const loaded = loadAppData();
    expect(loaded.tasks).toHaveLength(1);
    expect(loaded.tasks[0].id).toBe(t.id);
  });

  it("falls through to migration when the v2 key contains corrupt JSON", () => {
    window.localStorage.setItem("niyamit.data.v2", "{not valid json");
    expect(loadAppData()).toEqual({ tasks: [], projects: [] });
    // Corrupt key should be cleaned up as part of the fallback migration path.
    expect(window.localStorage.getItem("niyamit.data.v2")).not.toBe("{not valid json");
  });

  it("falls through to migration when the v2 key contains valid JSON in an unrecognized shape", () => {
    window.localStorage.setItem("niyamit.data.v2", JSON.stringify({ foo: "bar" }));
    expect(loadAppData()).toEqual({ tasks: [], projects: [] });
  });

  it("migrates from the legacy v1 single-data-key format and removes the old key", () => {
    const t = task();
    window.localStorage.setItem("niyamit.data.v1", JSON.stringify({ tasks: [t], projects: [] }));
    const loaded = loadAppData();
    expect(loaded.tasks[0].id).toBe(t.id);
    expect(window.localStorage.getItem("niyamit.data.v1")).toBeNull();
    // Should have been persisted to the new v2 key.
    expect(window.localStorage.getItem("niyamit.data.v2")).not.toBeNull();
  });

  it("ignores invalid JSON in the legacy v1 key and falls through further", () => {
    window.localStorage.setItem("niyamit.data.v1", "{not valid");
    expect(loadAppData()).toEqual({ tasks: [], projects: [] });
  });

  it("migrates from legacy separate tasks/projects keys", () => {
    const t = task();
    const p = project({ id: "p1" });
    window.localStorage.setItem("niyamit.tasks.v1", JSON.stringify([t]));
    window.localStorage.setItem("niyamit.projects.v1", JSON.stringify([p]));
    const loaded = loadAppData();
    expect(loaded.tasks[0].id).toBe(t.id);
    expect(loaded.projects).toEqual([p]);
    expect(window.localStorage.getItem("niyamit.tasks.v1")).toBeNull();
    expect(window.localStorage.getItem("niyamit.projects.v1")).toBeNull();
  });

  it("migrates legacy tasks key alone without a projects key", () => {
    const t = task();
    window.localStorage.setItem("niyamit.tasks.v1", JSON.stringify([t]));
    const loaded = loadAppData();
    expect(loaded.tasks[0].id).toBe(t.id);
    expect(loaded.projects).toEqual([]);
  });

  it("ignores a legacy tasks key that isn't an array", () => {
    window.localStorage.setItem("niyamit.tasks.v1", JSON.stringify({ not: "an array" }));
    expect(loadAppData()).toEqual({ tasks: [], projects: [] });
  });

  it("ignores invalid JSON in a legacy separate key without throwing", () => {
    window.localStorage.setItem("niyamit.tasks.v1", "{not valid");
    expect(() => loadAppData()).not.toThrow();
    expect(loadAppData()).toEqual({ tasks: [], projects: [] });
  });
});

describe("saveAppData", () => {
  it("round-trips tasks and projects through toSerialized/fromSerialized via localStorage", () => {
    const t = task();
    const p = project({ id: "p1" });
    const data: AppData = { tasks: [t], projects: [p] };
    saveAppData(data);
    const loaded = loadAppData();
    expect(loaded.tasks[0].id).toBe(t.id);
    expect(loaded.projects[0].id).toBe(p.id);
  });

  it("silently swallows a localStorage.setItem failure (e.g. quota exceeded)", () => {
    const original = window.localStorage.setItem;
    window.localStorage.setItem = () => {
      throw new DOMException("QuotaExceededError");
    };
    try {
      expect(() => saveAppData({ tasks: [], projects: [] })).not.toThrow();
    } finally {
      window.localStorage.setItem = original;
    }
  });
});
