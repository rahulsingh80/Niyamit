import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TaskList } from "./TaskList";
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

describe("TaskList smoke test", () => {
  it("renders all fixed-day headings even with zero tasks (groupTasksByDate never returns an empty group list)", () => {
    render(<TaskList tasks={[]} onCompleteTask={() => {}} />);
    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByText("Tomorrow")).toBeInTheDocument();
  });

  it("renders a task's title under its date-group heading", () => {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    render(<TaskList tasks={[task({ title: "Buy milk", dueDate: todayStr })]} onCompleteTask={() => {}} />);
    expect(screen.getByText("Buy milk")).toBeInTheDocument();
  });

  it("truncates a long project name in the project pill with an ellipsis", () => {
    const project: Project = { id: "p1", name: "A Very Long Project Name Indeed", createdAt: "2026-01-01T00:00:00.000Z" };
    render(
      <TaskList
        tasks={[task({ title: "Task with project", projectId: "p1" })]}
        onCompleteTask={() => {}}
        projects={[project]}
      />,
    );
    const pill = screen.getByTitle("A Very Long Project Name Indeed");
    expect(pill.textContent).toMatch(/…$/);
    expect(pill.textContent!.length).toBeLessThan(project.name.length);
  });

  it("does not render a project pill when the task's project is missing from the projects list", () => {
    render(
      <TaskList
        tasks={[task({ title: "Orphaned task", projectId: "missing-project" })]}
        onCompleteTask={() => {}}
        projects={[]}
      />,
    );
    expect(screen.getByText("Orphaned task")).toBeInTheDocument();
    expect(screen.queryByText(/project-tag-pill/)).not.toBeInTheDocument();
  });

  it("marks Today/Tomorrow sections as droppable but not the Overdue section", () => {
    const { container } = render(
      <TaskList
        tasks={[task({ title: "Overdue task", dueDate: "2020-01-01" })]}
        onCompleteTask={() => {}}
        onUpdateTask={() => {}}
      />,
    );
    const overdueSection = screen.getByText("Overdue").closest("section");
    const todaySection = screen.getByText("Today").closest("section");
    expect(overdueSection).not.toHaveClass("date-group-droppable");
    expect(todaySection).toHaveClass("date-group-droppable");
    expect(container).toBeTruthy();
  });

  it("shows a per-task checkbox only when both onToggleTaskSelection is provided and showBulkCheckboxes is true", () => {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const { rerender } = render(
      <TaskList tasks={[task({ title: "T1", dueDate: todayStr })]} onCompleteTask={() => {}} showBulkCheckboxes={false} />,
    );
    expect(screen.queryByLabelText("Select task for bulk actions")).not.toBeInTheDocument();

    rerender(
      <TaskList
        tasks={[task({ title: "T1", dueDate: todayStr })]}
        onCompleteTask={() => {}}
        onToggleTaskSelection={() => {}}
        showBulkCheckboxes={true}
      />,
    );
    expect(screen.getByLabelText("Select task for bulk actions")).toBeInTheDocument();
  });
});
