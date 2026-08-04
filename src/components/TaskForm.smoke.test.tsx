import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TaskForm } from "./TaskForm";
import type { Task } from "@domain/taskTypes";

describe("TaskForm smoke test", () => {
  it("renders in create mode with an 'Add task' button and no delete/cancel", () => {
    render(<TaskForm onAdd={() => {}} />);
    expect(screen.getByRole("button", { name: "Add task" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete task" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
  });

  it("renders in edit mode with 'Save changes', 'Delete task', and 'Cancel', prefilled with the task title", () => {
    const editingTask: Task = {
      id: "t1",
      title: "Existing task",
      dueDate: "2026-06-20",
      dueTime: "09:00",
      recurrence: { type: "interval", intervalDays: 3 },
      priority: 2,
      createdAt: "2026-01-01T00:00:00.000Z",
      completed: false,
      reminder: { type: "before", minutes: 30 },
    };
    render(<TaskForm onAdd={() => {}} editingTask={editingTask} onUpdate={() => {}} onDelete={() => {}} onCancelEdit={() => {}} />);
    expect(screen.getByRole("button", { name: "Save changes" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete task" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/What do you need to do/i)).toHaveValue("Existing task");
  });

  it("strips a combined date/priority/project/tag shortcut from the title on submit", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<TaskForm onAdd={onAdd} projects={[]} allTags={[]} />);

    const input = screen.getByPlaceholderText(/What do you need to do/i);
    await user.type(input, "Buy milk !!1 #Groceries @errand");
    await user.click(screen.getByRole("button", { name: "Add task" }));

    expect(onAdd).toHaveBeenCalledTimes(1);
    const created = onAdd.mock.calls[0][0] as Task;
    expect(created.title).toBe("Buy milk");
    expect(created.priority).toBe(1);
    expect(created.tags).toEqual(["errand"]);
    expect(created.projectId).toBe("new:Groceries");
  });

  it("clicking Cancel in edit mode calls onCancelEdit", async () => {
    const user = userEvent.setup();
    const onCancelEdit = vi.fn();
    const editingTask: Task = {
      id: "t1",
      title: "Existing task",
      dueDate: null,
      priority: 3,
      createdAt: "2026-01-01T00:00:00.000Z",
      completed: false,
    };
    render(<TaskForm onAdd={() => {}} editingTask={editingTask} onUpdate={() => {}} onDelete={() => {}} onCancelEdit={onCancelEdit} />);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancelEdit).toHaveBeenCalledTimes(1);
  });
});
