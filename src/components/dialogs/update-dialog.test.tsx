import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UpdateDialog } from "@/components/dialogs";

type Props = Parameters<typeof UpdateDialog>[0];

function setup(props: Partial<Props> = {}, { withSkip = true } = {}) {
  const handlers = {
    onOpenChange: vi.fn(),
    onUpdate: vi.fn(),
    onLater: vi.fn(),
    onSkip: vi.fn(),
    onRestart: vi.fn(),
  };
  const { onSkip, ...rest } = handlers;
  const user = userEvent.setup();
  render(
    <UpdateDialog
      open
      type="app"
      currentVersion="2.0.0"
      newVersion="2.1.0"
      {...rest}
      {...(withSkip ? { onSkip } : {})}
      {...props}
    />
  );
  return { user, ...handlers };
}

describe("UpdateDialog", () => {
  it("is not rendered when closed", () => {
    setup({ open: false });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("offers an app update with notes, skip, later and update", async () => {
    const { user, onSkip, onLater, onUpdate } = setup({ releaseNotes: ["Faster", "Fixes"] });
    expect(screen.getByRole("dialog", { name: "Update Available" })).toBeInTheDocument();
    expect(screen.getByText("Clipy 2.1.0 is available")).toBeInTheDocument();
    expect(screen.getByText("v2.0.0")).toBeInTheDocument();
    expect(screen.getByText("v2.1.0")).toBeInTheDocument();
    expect(screen.getByText("Faster")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Skip this version" }));
    await user.click(screen.getByRole("button", { name: "Remind Me Later" }));
    await user.click(screen.getByRole("button", { name: "Update Now" }));
    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(onLater).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it("describes a yt-dlp update and hides skip when not offered", async () => {
    const { user, onLater } = setup({ type: "ytdlp", releaseNotes: [] }, { withSkip: false });
    expect(screen.getByRole("dialog", { name: "Component Update" })).toBeInTheDocument();
    expect(screen.getByText("yt-dlp 2.1.0 is available")).toBeInTheDocument();
    expect(screen.getByText("Updates in background, no restart needed")).toBeInTheDocument();
    expect(screen.queryByText("What's new:")).toBeNull();
    expect(screen.queryByRole("button", { name: "Skip this version" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Later" }));
    expect(onLater).toHaveBeenCalled();
  });

  it("shows download progress with a background option", async () => {
    const { user, onLater } = setup({
      downloadStatus: "downloading",
      downloadProgress: 42.4,
      releaseNotes: ["hidden while downloading"],
    });
    expect(screen.getByText("Downloading update...")).toBeInTheDocument();
    expect(screen.getByText("42%")).toBeInTheDocument();
    expect(screen.queryByText("hidden while downloading")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Download in Background" }));
    expect(onLater).toHaveBeenCalled();
  });

  it.each([
    ["app", "Clipy will restart to complete the update.", "Restart Now"],
    ["ytdlp", "The update will be applied in the background.", "Apply Update"],
  ] as const)("is ready to install (%s)", async (type, note, action) => {
    const { user, onRestart, onLater } = setup({ type, downloadStatus: "ready" });
    expect(screen.getByText("Ready to install!")).toBeInTheDocument();
    expect(screen.getByText(note)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: action }));
    await user.click(screen.getByRole("button", { name: "Later" }));
    expect(onRestart).toHaveBeenCalled();
    expect(onLater).toHaveBeenCalled();
  });

  it("reports an error and lets the user retry or close", async () => {
    const { user, onUpdate, onOpenChange } = setup({
      downloadStatus: "error",
      errorMessage: "Signature mismatch",
    });
    expect(screen.getByText("Update failed")).toBeInTheDocument();
    expect(screen.getByText("Signature mismatch")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try Again" }));
    expect(onUpdate).toHaveBeenCalled();
    await user.click(screen.getAllByRole("button", { name: "Close" })[0]!);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("uses a default error message", () => {
    setup({ downloadStatus: "error" });
    expect(screen.getByText("Please try again later.")).toBeInTheDocument();
  });
});
