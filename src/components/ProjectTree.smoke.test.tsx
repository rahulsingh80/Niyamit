import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProjectTree } from "./ProjectTree";
import type { Project } from "@domain/projectTypes";

function project(overrides: Partial<Project> & { id: string }): Project {
  return { name: overrides.id, createdAt: "2026-01-01T00:00:00.000Z", ...overrides };
}

function noop() {}

describe("ProjectTree smoke test", () => {
  it("always renders the 'All Tasks' root node plus each active project", () => {
    render(
      <ProjectTree
        projects={[project({ id: "a", name: "Work" }), project({ id: "b", name: "Home" })]}
        selectedProjectId={null}
        onSelectProject={noop}
        onRenameProject={noop}
        onDeleteProject={noop}
        onMoveTaskToProject={noop}
      />,
    );
    expect(screen.getByText("All Tasks")).toBeInTheDocument();
    expect(screen.getByText("Work")).toBeInTheDocument();
    expect(screen.getByText("Home")).toBeInTheDocument();
  });

  it("excludes soft-deleted projects from the tree", () => {
    render(
      <ProjectTree
        projects={[project({ id: "a", name: "Deleted", deleted: true })]}
        selectedProjectId={null}
        onSelectProject={noop}
        onRenameProject={noop}
        onDeleteProject={noop}
        onMoveTaskToProject={noop}
      />,
    );
    expect(screen.queryByText("Deleted")).not.toBeInTheDocument();
  });

  it("calls onSelectProject(null) when 'All Tasks' is clicked", async () => {
    const user = userEvent.setup();
    const onSelectProject = vi.fn();
    render(
      <ProjectTree
        projects={[]}
        selectedProjectId="a"
        onSelectProject={onSelectProject}
        onRenameProject={noop}
        onDeleteProject={noop}
        onMoveTaskToProject={noop}
      />,
    );
    await user.click(screen.getByText("All Tasks"));
    expect(onSelectProject).toHaveBeenCalledWith(null);
  });

  it("'Move under…' submenu excludes the project itself and its descendants (no cycle)", async () => {
    const user = userEvent.setup();
    const parent = project({ id: "parent", name: "Parent" });
    const child = project({ id: "child", name: "Child", parentId: "parent" });
    const other = project({ id: "other", name: "Other" });
    render(
      <ProjectTree
        projects={[parent, child, other]}
        selectedProjectId={null}
        onSelectProject={noop}
        onRenameProject={noop}
        onDeleteProject={noop}
        onMoveTaskToProject={noop}
        onMoveProject={noop}
      />,
    );
    const parentNode = screen.getByText("Parent").closest('[role="treeitem"]')!;
    await user.pointer({ keys: "[MouseRight]", target: parentNode });

    await user.click(screen.getByRole("menuitem", { name: /Move under/ }));
    // "Other" is a valid move target; "Parent" (self) and "Child" (descendant) must not appear.
    expect(screen.getByRole("menuitem", { name: "Other" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Parent" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Child" })).not.toBeInTheDocument();
  });

  it("shows 'Move to top level' only for a project that has a parent", async () => {
    const user = userEvent.setup();
    const parent = project({ id: "parent", name: "Parent" });
    const child = project({ id: "child", name: "Child", parentId: "parent" });
    render(
      <ProjectTree
        projects={[parent, child]}
        selectedProjectId={null}
        onSelectProject={noop}
        onRenameProject={noop}
        onDeleteProject={noop}
        onMoveTaskToProject={noop}
        onMoveProject={noop}
      />,
    );
    const parentNode = screen.getByText("Parent").closest('[role="treeitem"]')!;
    await user.pointer({ keys: "[MouseRight]", target: parentNode });
    expect(screen.queryByRole("menuitem", { name: "Move to top level" })).not.toBeInTheDocument();
  });
});
