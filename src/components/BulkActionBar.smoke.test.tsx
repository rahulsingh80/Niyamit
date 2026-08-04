import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BulkActionBar } from "./BulkActionBar";
import type { Task } from "@domain/taskTypes";

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

function noop() {}

describe("BulkActionBar smoke test", () => {
  it("renders nothing when there is no selection", () => {
    const { container } = render(
      <BulkActionBar
        selectedTaskIds={[]}
        tasks={[]}
        projects={[]}
        allTags={[]}
        onClearSelection={noop}
        onBulkDelete={noop}
        onBulkSetPriority={noop}
        onBulkAddToProject={noop}
        onBulkApplyTag={noop}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the singular/plural selection count", () => {
    const { rerender } = render(
      <BulkActionBar
        selectedTaskIds={["a"]}
        tasks={[task({ id: "a" })]}
        projects={[]}
        allTags={[]}
        onClearSelection={noop}
        onBulkDelete={noop}
        onBulkSetPriority={noop}
        onBulkAddToProject={noop}
        onBulkApplyTag={noop}
      />,
    );
    expect(screen.getByText("1 task selected")).toBeInTheDocument();

    rerender(
      <BulkActionBar
        selectedTaskIds={["a", "b"]}
        tasks={[task({ id: "a" }), task({ id: "b" })]}
        projects={[]}
        allTags={[]}
        onClearSelection={noop}
        onBulkDelete={noop}
        onBulkSetPriority={noop}
        onBulkAddToProject={noop}
        onBulkApplyTag={noop}
      />,
    );
    expect(screen.getByText("2 tasks selected")).toBeInTheDocument();
  });

  it("confirms a bulk delete through the confirmation modal", async () => {
    const user = userEvent.setup();
    const onBulkDelete = vi.fn();
    render(
      <BulkActionBar
        selectedTaskIds={["a"]}
        tasks={[task({ id: "a" })]}
        projects={[]}
        allTags={[]}
        onClearSelection={noop}
        onBulkDelete={onBulkDelete}
        onBulkSetPriority={noop}
        onBulkAddToProject={noop}
        onBulkApplyTag={noop}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = screen.getByRole("dialog", { name: "Confirm delete" });
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(onBulkDelete).toHaveBeenCalledWith(["a"]);
  });

  it("closes an open modal on Escape", async () => {
    const user = userEvent.setup();
    render(
      <BulkActionBar
        selectedTaskIds={["a"]}
        tasks={[task({ id: "a" })]}
        projects={[]}
        allTags={[]}
        onClearSelection={noop}
        onBulkDelete={noop}
        onBulkSetPriority={noop}
        onBulkAddToProject={noop}
        onBulkApplyTag={noop}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Change priority" }));
    expect(screen.getByRole("dialog", { name: "Change priority" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("disables the Apply-tag submit button for a blank or space-containing tag", async () => {
    const user = userEvent.setup();
    render(
      <BulkActionBar
        selectedTaskIds={["a"]}
        tasks={[task({ id: "a" })]}
        projects={[]}
        allTags={[]}
        onClearSelection={noop}
        onBulkDelete={noop}
        onBulkSetPriority={noop}
        onBulkAddToProject={noop}
        onBulkApplyTag={noop}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Apply tag" }));
    const dialog = screen.getByRole("dialog", { name: "Apply tag" });
    const submit = within(dialog).getByRole("button", { name: "Apply tag" });
    expect(submit).toBeDisabled();

    const input = screen.getByPlaceholderText("Search or type tag name…");
    await user.type(input, "has space");
    expect(within(dialog).getByRole("button", { name: "Apply tag" })).toBeDisabled();
  });
});
