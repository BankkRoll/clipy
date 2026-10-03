import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const check = vi.fn();
const relaunch = vi.fn();
vi.mock("@tauri-apps/plugin-updater", () => ({ check: () => check() }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: () => relaunch() }));

import { AppUpdater, AUTO_CHECK_DELAY_MS } from "@/components/dialogs/app-updater";
import { resetUpdaterStore, useUpdaterStore } from "@/stores/updaterStore";

function fakeUpdate(install = vi.fn(async () => {})) {
  return {
    version: "2.1.0",
    currentVersion: "2.0.0",
    body: "- Fixes",
    downloadAndInstall: install,
  };
}

beforeEach(() => {
  check.mockReset();
  relaunch.mockReset();
  resetUpdaterStore();
});

describe("AppUpdater automatic check", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("checks once after the startup delay when enabled", async () => {
    check.mockResolvedValue(null);
    const { rerender } = render(<AppUpdater autoCheck />);
    expect(check).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTO_CHECK_DELAY_MS);
    });
    expect(check).toHaveBeenCalledTimes(1);
    rerender(<AppUpdater autoCheck={false} />);
    rerender(<AppUpdater autoCheck />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTO_CHECK_DELAY_MS);
    });
    expect(check).toHaveBeenCalledTimes(1);
  });

  it.each([[false], [undefined]])("does not check when autoCheck is %s", async (autoCheck) => {
    render(<AppUpdater autoCheck={autoCheck} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTO_CHECK_DELAY_MS * 2);
    });
    expect(check).not.toHaveBeenCalled();
  });

  it("cancels the pending check on unmount", async () => {
    const { unmount } = render(<AppUpdater autoCheck />);
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTO_CHECK_DELAY_MS);
    });
    expect(check).not.toHaveBeenCalled();
  });
});

describe("AppUpdater dialog", () => {
  it("renders nothing until an update is found", () => {
    const { container } = render(<AppUpdater autoCheck={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("walks through install and restart", async () => {
    const user = userEvent.setup();
    check.mockResolvedValue(fakeUpdate());
    render(<AppUpdater autoCheck={false} />);
    await act(() => useUpdaterStore.getState().checkForUpdate({ manual: true }));

    expect(screen.getByText("Clipy 2.1.0 is available")).toBeInTheDocument();
    expect(screen.getByText("Fixes")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Update Now/ }));
    expect(await screen.findByText("Ready to install!")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Restart Now/ }));
    expect(relaunch).toHaveBeenCalledTimes(1);
  });

  it("closes on Later and on Escape, and skips a version", async () => {
    const user = userEvent.setup();
    check.mockResolvedValue(fakeUpdate());
    render(<AppUpdater autoCheck={false} />);

    await act(() => useUpdaterStore.getState().checkForUpdate({ manual: true }));
    await user.click(screen.getByRole("button", { name: "Remind Me Later" }));
    expect(useUpdaterStore.getState().open).toBe(false);

    await act(() => useUpdaterStore.setState({ open: true }));
    await user.keyboard("{Escape}");
    expect(useUpdaterStore.getState().open).toBe(false);

    await act(() => useUpdaterStore.setState({ open: true }));
    await user.click(screen.getByRole("button", { name: "Skip this version" }));
    expect(useUpdaterStore.getState().status).toBe("idle");
  });

  it("shows install errors with a retry", async () => {
    const user = userEvent.setup();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const install = vi.fn(async () => {
      throw "bad signature";
    });
    check.mockResolvedValue(fakeUpdate(install));
    render(<AppUpdater autoCheck={false} />);
    await act(() => useUpdaterStore.getState().checkForUpdate({ manual: true }));
    await user.click(screen.getByRole("button", { name: /Update Now/ }));
    expect(await screen.findByText("bad signature")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Try Again/ }));
    expect(install).toHaveBeenCalledTimes(2);
  });
});
