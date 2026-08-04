import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProjectSelect, NEW_PROJECT_PREFIX } from "./ProjectSelect";
import type { Project } from "@domain/projectTypes";

function project(overrides: Partial<Project> & { id: string }): Project {
  return { name: overrides.id, createdAt: "2026-01-01T00:00:00.000Z", ...overrides };
}

describe("ProjectSelect smoke test", () => {
  it("hides the 'create' option when the typed text exactly matches an existing project", async () => {
    const user = userEvent.setup();
    render(
      <ProjectSelect projects={[project({ id: "p1", name: "Work" })]} value={null} onChange={() => {}} />,
    );
    const input = screen.getByPlaceholderText("Search or type project name…");
    await user.type(input, "Work");
    expect(screen.queryByText(/Create project:/)).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Work" })).toBeInTheDocument();
  });

  it("shows a 'create' option with the NEW_PROJECT_PREFIX id for a name with no exact match", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ProjectSelect projects={[project({ id: "p1", name: "Work" })]} value={null} onChange={onChange} />);
    const input = screen.getByPlaceholderText("Search or type project name…");
    await user.type(input, "Errands");
    const createOption = screen.getByText("Create project: Errands");
    await user.click(createOption);
    expect(onChange).toHaveBeenCalledWith(`${NEW_PROJECT_PREFIX}Errands`);
  });

  it("filters out soft-deleted projects", async () => {
    const user = userEvent.setup();
    render(
      <ProjectSelect
        projects={[project({ id: "p1", name: "Deleted Project", deleted: true })]}
        value={null}
        onChange={() => {}}
      />,
    );
    const input = screen.getByPlaceholderText("Search or type project name…");
    await user.click(input);
    expect(screen.queryByText("Deleted Project")).not.toBeInTheDocument();
  });
});
