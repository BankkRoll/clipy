import { describe, it, expect, vi } from "vitest";
import { screen, within, waitFor } from "@testing-library/react";
import { Downloads } from "@/pages/Downloads";
import { useDownloadStore } from "@/stores/downloadStore";
import { mockBackend, type IpcHandler } from "@/test/tauri";
import { currentLocation, renderWithRouter } from "@/test/render";
import { downloadFixture } from "@/test/fixtures";
import type { Download } from "@/types/download";

function setup(downloads: Download[], handlers: Record<string, IpcHandler> = {}) {
  useDownloadStore.setState({ downloads });
  const backend = mockBackend({ "plugin:dialog|ask": () => true, ...handlers });
  const view = renderWithRouter(<Downloads />, { route: "/downloads" });
  return { backend, ...view };
}

const row = (id: string) => within(screen.getByTestId(`download-${id}`));

describe("Downloads page", () => {
  it("shows the empty state and links to Home", async () => {
    const { user } = setup([]);
    expect(screen.getByText("No downloads")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Start Downloading" }));
    expect(currentLocation()).toBe("/");
  });

  it("sorts rows by status priority and counts active/finished", () => {
    setup([
      downloadFixture({ id: "c", status: "completed", title: "Completed one" }),
      downloadFixture({ id: "p", status: "pending", title: "Queued one" }),
      downloadFixture({ id: "d", status: "downloading", title: "Active one" }),
      downloadFixture({ id: "f", status: "failed", title: "Failed one" }),
    ]);
    const titles = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(titles).toEqual(["Active one", "Queued one", "Completed one", "Failed one"]);
    expect(screen.getByText("1 active")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear finished" })).toBeInTheDocument();
  });

  it.each([
    ["Pause", "pause_download", "downloading", "paused"],
    ["Resume", "resume_download", "paused", "pending"],
    ["Cancel", "cancel_download", "pending", "cancelled"],
    ["Retry", "retry_download", "failed", "pending"],
  ] as const)("%s invokes %s with the id", async (label, command, from, to) => {
    const { backend, user } = setup([downloadFixture({ status: from })]);
    await user.click(row("d1").getByRole("button", { name: label }));
    await waitFor(() =>
      expect(backend.callsTo(command)).toEqual([{ cmd: command, args: { id: "d1" } }])
    );
    expect(useDownloadStore.getState().downloads[0]?.status).toBe(to);
  });

  it("toasts and keeps the row when a command fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { user } = setup([downloadFixture()], {
      pause_download: () => {
        throw "Download not found";
      },
    });
    await user.click(row("d1").getByRole("button", { name: "Pause" }));
    expect(await screen.findByText("Failed to pause download")).toBeInTheDocument();
    expect(useDownloadStore.getState().downloads[0]?.status).toBe("downloading");
    errorSpy.mockRestore();
  });

  it("removes a finished row only after confirmation", async () => {
    let confirm = false;
    const { backend, user } = setup([downloadFixture({ status: "cancelled" })], {
      "plugin:dialog|ask": () => confirm,
    });
    await user.click(row("d1").getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(backend.callsTo("plugin:dialog|ask")).toHaveLength(1));
    expect(useDownloadStore.getState().downloads).toHaveLength(1);

    confirm = true;
    await user.click(row("d1").getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(useDownloadStore.getState().downloads).toHaveLength(0));
    expect(useDownloadStore.getState().dismissedIds).toEqual(["d1"]);
  });

  it("clears finished downloads in the backend and the list after confirmation", async () => {
    let confirm = false;
    const { backend, user } = setup(
      [
        downloadFixture({ status: "completed" }),
        downloadFixture({ id: "d2", status: "downloading" }),
      ],
      { "plugin:dialog|ask": () => confirm }
    );
    await user.click(screen.getByRole("button", { name: "Clear finished" }));
    await waitFor(() => expect(backend.callsTo("plugin:dialog|ask")).toHaveLength(1));
    expect(backend.callsTo("clear_completed_downloads")).toHaveLength(0);

    confirm = true;
    await user.click(screen.getByRole("button", { name: "Clear finished" }));
    await waitFor(() => expect(backend.callsTo("clear_completed_downloads")).toHaveLength(1));
    expect(useDownloadStore.getState().downloads.map((d) => d.id)).toEqual(["d2"]);
  });

  it("shows the backend failure reason", () => {
    setup([downloadFixture({ status: "failed", error: "HTTP Error 403: Forbidden" })]);
    expect(row("d1").getByRole("alert")).toHaveTextContent("HTTP Error 403: Forbidden");
  });

  it("shows a generic failure line when no reason is known yet", () => {
    setup([downloadFixture({ status: "failed" })]);
    expect(row("d1").getByRole("alert")).toHaveTextContent("Download failed");
  });

  it("disables Play until the final file path is known", () => {
    setup([downloadFixture({ status: "completed" })]);
    expect(row("d1").getByRole("button", { name: "Play" })).toBeDisabled();
  });

  it("plays the real file, not the output directory", async () => {
    const { user } = setup([
      downloadFixture({ status: "completed", filePath: "C:\\Users\\me\\Videos\\Clipy\\rick.mp4" }),
    ]);
    await user.click(row("d1").getByRole("button", { name: "Play" }));
    const video = document.querySelector("video");
    expect(video?.getAttribute("src")).toContain("rick.mp4");
    await user.click(screen.getByRole("button", { name: "Close player" }));
    expect(document.querySelector("video")).toBeNull();
  });

  it("shows the file in its folder once known, else opens the output directory", async () => {
    const { backend, user } = setup([
      downloadFixture({ id: "a", status: "completed", filePath: "C:\\v\\a.mp4" }),
      downloadFixture({ id: "b", status: "completed", outputPath: "C:\\v" }),
    ]);
    await user.click(row("a").getByRole("button", { name: "Show in folder" }));
    await user.click(row("b").getByRole("button", { name: "Show in folder" }));
    await waitFor(() => expect(backend.callsTo("open_folder")).toHaveLength(1));
    expect(backend.callsTo("show_in_folder")[0]?.args).toEqual({ path: "C:\\v\\a.mp4" });
    expect(backend.callsTo("open_folder")[0]?.args).toEqual({ path: "C:\\v" });
  });

  it("toasts when the folder cannot be opened", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { user } = setup([downloadFixture({ status: "completed", filePath: "x" })], {
      show_in_folder: () => {
        throw "missing";
      },
    });
    await user.click(row("d1").getByRole("button", { name: "Show in folder" }));
    expect(await screen.findByText("Failed to open folder")).toBeInTheDocument();
    errorSpy.mockRestore();
  });

  it("navigates to the library from the header and from a completed row", async () => {
    const { user } = setup([downloadFixture({ status: "completed" })]);
    await user.click(row("d1").getByRole("button", { name: "View in Library" }));
    expect(currentLocation()).toBe("/library");
  });

  it("header View Library button navigates too", async () => {
    const { user } = setup([]);
    await user.click(screen.getByRole("button", { name: /View Library/ }));
    expect(currentLocation()).toBe("/library");
  });
});
