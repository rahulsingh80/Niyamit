import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TagSelect } from "./TagSelect";

describe("TagSelect smoke test", () => {
  it("shows a 'create' option for a new tag name", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TagSelect allTags={["errand"]} value={null} onChange={onChange} />);
    const input = screen.getByPlaceholderText("Search or type tag name…");
    await user.type(input, "urgent");
    const createOption = screen.getByText("Create tag: @urgent");
    await user.click(createOption);
    expect(onChange).toHaveBeenCalledWith("urgent");
  });

  it("never shows a 'create' option for a tag name containing a space", async () => {
    const user = userEvent.setup();
    render(<TagSelect allTags={["errand"]} value={null} onChange={() => {}} />);
    const input = screen.getByPlaceholderText("Search or type tag name…");
    await user.type(input, "has space");
    expect(screen.queryByText(/Create tag:/)).not.toBeInTheDocument();
  });

  it("hides the create option for an exact existing tag match", async () => {
    const user = userEvent.setup();
    render(<TagSelect allTags={["errand"]} value={null} onChange={() => {}} />);
    const input = screen.getByPlaceholderText("Search or type tag name…");
    await user.type(input, "errand");
    expect(screen.queryByText(/Create tag:/)).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "@errand" })).toBeInTheDocument();
  });
});
