import { describe, it, expect } from "vitest";
import { getDescendantIds } from "./projectTypes";
import type { Project } from "./projectTypes";

function project(overrides: Partial<Project> & { id: string }): Project {
  return {
    name: overrides.id,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("getDescendantIds", () => {
  it("returns just the project id when it has no children", () => {
    const projects = [project({ id: "a" }), project({ id: "b" })];
    expect(getDescendantIds("a", projects)).toEqual(["a"]);
  });

  it("collects deeply nested descendants recursively", () => {
    const projects = [
      project({ id: "a" }),
      project({ id: "b", parentId: "a" }),
      project({ id: "c", parentId: "b" }),
      project({ id: "d", parentId: "c" }),
    ];
    expect(getDescendantIds("a", projects)).toEqual(["a", "b", "c", "d"]);
  });

  it("excludes children marked deleted", () => {
    const projects = [
      project({ id: "a" }),
      project({ id: "b", parentId: "a", deleted: true }),
      project({ id: "c", parentId: "a" }),
    ];
    expect(getDescendantIds("a", projects)).toEqual(["a", "c"]);
  });

  it("excludes descendants of a deleted child even if grandchild is not deleted", () => {
    const projects = [
      project({ id: "a" }),
      project({ id: "b", parentId: "a", deleted: true }),
      project({ id: "c", parentId: "b" }),
    ];
    expect(getDescendantIds("a", projects)).toEqual(["a"]);
  });

  it("collects multiple siblings at the same level", () => {
    const projects = [
      project({ id: "a" }),
      project({ id: "b", parentId: "a" }),
      project({ id: "c", parentId: "a" }),
    ];
    expect(getDescendantIds("a", projects)).toEqual(["a", "b", "c"]);
  });

  it("returns just the id when the project is not present in the array at all", () => {
    expect(getDescendantIds("missing", [])).toEqual(["missing"]);
  });
});
