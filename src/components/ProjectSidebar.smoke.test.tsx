import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProjectSidebar } from "./ProjectSidebar";
import type { Project } from "@domain/projectTypes";
import type { Task } from "@domain/taskTypes";

function project(overrides: Partial<Project> & { id: string }): Project {
  return { name: overrides.id, createdAt: "2026-01-01T00:00:00.000Z", ...overrides };
}

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

function baseProps() {
  return {
    projects: [],
    selectedProjectId: null,
    selectedTag: null,
    isFormOpen: false,
    editingTask: null,
    allProjects: [],
    allTags: [],
    onSelectProject: vi.fn(),
    onSelectTag: vi.fn(),
    onCreateProject: vi.fn(),
    onRenameProject: vi.fn(),
    onDeleteProject: vi.fn(),
    onRenameTag: vi.fn(),
    onDeleteTag: vi.fn(),
    onMoveTaskToProject: vi.fn(),
    onMoveProject: vi.fn(),
    onReorderProject: vi.fn(),
    onOpenCreateForm: vi.fn(),
    onCancelEdit: vi.fn(),
    onAddTask: vi.fn(),
    onUpdateTask: vi.fn(),
    onDeleteTask: vi.fn(),
  };
}

describe("ProjectSidebar smoke test", () => {
  it("shows the 'Create Task' trigger button when the form is closed", () => {
    render(<ProjectSidebar {...baseProps()} />);
    expect(screen.getByRole("button", { name: "+ Create Task" })).toBeInTheDocument();
  });

  it("shows the 'Create Task' panel title when opening the form with no editing task", () => {
    render(<ProjectSidebar {...baseProps()} isFormOpen={true} />);
    expect(screen.getByRole("heading", { name: "Create Task" })).toBeInTheDocument();
  });

  it("shows the 'Update Task' panel title when editing an existing task", () => {
    render(<ProjectSidebar {...baseProps()} isFormOpen={true} editingTask={task({ id: "t1", title: "Existing" })} />);
    expect(screen.getByRole("heading", { name: "Update Task" })).toBeInTheDocument();
  });

  it("renders 'No tags yet' when there are no tags", () => {
    render(<ProjectSidebar {...baseProps()} />);
    expect(screen.getByText("No tags yet")).toBeInTheDocument();
  });

  it("rejects creating a project with a duplicate name (case-insensitive)", async () => {
    const user = userEvent.setup();
    const onCreateProject = vi.fn();
    render(
      <ProjectSidebar
        {...baseProps()}
        allProjects={[project({ id: "p1", name: "Work" })]}
        onCreateProject={onCreateProject}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Create project" }));
    await user.type(screen.getByPlaceholderText("Project name"), "work");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(onCreateProject).not.toHaveBeenCalled();
    expect(screen.getByText('"work" already exists')).toBeInTheDocument();
  });

  it("creates a project with a unique name", async () => {
    const user = userEvent.setup();
    const onCreateProject = vi.fn();
    render(<ProjectSidebar {...baseProps()} onCreateProject={onCreateProject} />);
    await user.click(screen.getByRole("button", { name: "Create project" }));
    await user.type(screen.getByPlaceholderText("Project name"), "Errands");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(onCreateProject).toHaveBeenCalledWith("Errands");
  });

  it("starts with Projects/Tags collapsed when collapseProjectsAndTagsByDefault is true", () => {
    render(
      <ProjectSidebar
        {...baseProps()}
        allTags={["errand"]}
        collapseProjectsAndTagsByDefault={true}
      />,
    );
    expect(screen.getByRole("button", { name: "Expand Projects" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expand Tags" })).toBeInTheDocument();
    expect(screen.queryByText("@errand")).not.toBeInTheDocument();
  });
});
