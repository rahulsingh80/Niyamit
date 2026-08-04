import { describe, it, expect, vi } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RemindersSection } from "./RemindersSection";
import type { Task } from "@domain/taskTypes";

function task(overrides: Partial<Task> & { id: string }): Task {
  return {
    title: "Reminder task",
    dueDate: null,
    priority: 3,
    createdAt: "2026-01-01T00:00:00.000Z",
    completed: false,
    ...overrides,
  };
}

describe("RemindersSection smoke test", () => {
  it("renders nothing when there are no due reminders", () => {
    const { container } = render(
      <RemindersSection reminders={[]} onAcknowledge={() => {}} onSnooze={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders expanded by default and collapses on header click", async () => {
    const user = userEvent.setup();
    render(
      <RemindersSection
        reminders={[task({ id: "a", title: "Call mom" })]}
        onAcknowledge={() => {}}
        onSnooze={() => {}}
      />,
    );
    expect(screen.getByText("Call mom")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Reminders/ }));
    expect(screen.queryByText("Call mom")).not.toBeInTheDocument();
  });

  it("calls onAcknowledge when 'Done' is clicked", async () => {
    const user = userEvent.setup();
    const onAcknowledge = vi.fn();
    render(
      <RemindersSection
        reminders={[task({ id: "a", title: "Call mom" })]}
        onAcknowledge={onAcknowledge}
        onSnooze={() => {}}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(onAcknowledge).toHaveBeenCalledWith("a");
  });

  it("disables snooze options that would push past one hour before the task is due", () => {
    // Due in 30 minutes -> "1 hour", "2 hours", "1 day", "2 days" snooze options would all overshoot.
    const dueAt = new Date(Date.now() + 30 * 60 * 1000);
    const dueDate = dueAt.toISOString().slice(0, 10);
    const dueTime = `${String(dueAt.getHours()).padStart(2, "0")}:${String(dueAt.getMinutes()).padStart(2, "0")}`;
    render(
      <RemindersSection
        reminders={[task({ id: "a", title: "Soon due", dueDate, dueTime })]}
        onAcknowledge={() => {}}
        onSnooze={() => {}}
      />,
    );
    const select = screen.getByLabelText("Snooze reminder for Soon due");
    const oneHourOption = within(select).getByRole("option", { name: "1 hour" }) as HTMLOptionElement;
    expect(oneHourOption.disabled).toBe(true);
  });

  it("calls onSnooze with the computed snooze time for a non-disabled option", () => {
    const onSnooze = vi.fn();
    // Due in 3 hours: the "1 hour" snooze option comfortably fits before the one-hour-before-due cutoff.
    const dueAt = new Date(Date.now() + 180 * 60 * 1000);
    const dueDate = dueAt.toISOString().slice(0, 10);
    const dueTime = `${String(dueAt.getHours()).padStart(2, "0")}:${String(dueAt.getMinutes()).padStart(2, "0")}`;
    render(
      <RemindersSection
        reminders={[task({ id: "a", title: "Soon due", dueDate, dueTime })]}
        onAcknowledge={() => {}}
        onSnooze={onSnooze}
      />,
    );
    const select = screen.getByLabelText("Snooze reminder for Soon due") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "60" } });
    expect(onSnooze).toHaveBeenCalledWith("a", expect.any(String));
  });

  it("has no reminder-due tasks that aren't rendered (reminders prop is trusted as-is, no internal filtering)", () => {
    render(
      <RemindersSection
        reminders={[task({ id: "a", title: "First" }), task({ id: "b", title: "Second" })]}
        onAcknowledge={() => {}}
        onSnooze={() => {}}
      />,
    );
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("First")).toBeInTheDocument();
    expect(screen.getByText("Second")).toBeInTheDocument();
  });
});
