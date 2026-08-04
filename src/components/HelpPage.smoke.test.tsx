import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HelpPage } from "./HelpPage";

describe("HelpPage smoke test", () => {
  it("renders the help content", () => {
    render(<HelpPage onClose={() => {}} />);
    expect(screen.getByText("Niyamit Help")).toBeInTheDocument();
  });

  it("calls onClose when the 'Back to app' button is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<HelpPage onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "Back to app" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
