import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@react-oauth/google", () => ({
  useGoogleLogin: () => vi.fn(),
}));

vi.mock("@services/googleDriveService", () => ({
  getOrCreateDataFileId: vi.fn().mockRejectedValue(new Error("no network in tests")),
  downloadAppDataFromDrive: vi.fn(),
  uploadAppDataToDrive: vi.fn(),
  mergeAppData: vi.fn(),
}));

import { App } from "./App";

beforeEach(() => {
  window.localStorage.clear();
});

describe("App smoke test", () => {
  it("renders without crashing against empty localStorage", () => {
    render(<App />);
    expect(screen.getByText("Niyamit")).toBeInTheDocument();
    // groupTasksByDate always includes the 7 fixed-day buckets even with zero tasks,
    // so the empty-state message never actually renders; assert the list scaffolding instead.
    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByText("Tomorrow")).toBeInTheDocument();
  });

  it("adding a task via the form makes it appear in the list", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "+ Create Task" }));

    const titleInput = screen.getByPlaceholderText(/What do you need to do/i);
    await user.type(titleInput, "Buy milk");
    await user.click(screen.getByRole("button", { name: "Add task" }));

    expect(await screen.findByText("Buy milk")).toBeInTheDocument();
  });
});
