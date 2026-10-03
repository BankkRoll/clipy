import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { StrictMode } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { App } from "@/App";
import { useDownloadStore } from "@/stores/downloadStore";
import { useThemeStore } from "@/stores/settingsStore";
import { useUIStore } from "@/stores/uiStore";
import { logger } from "@/lib/logger";
import { emitBackendEvent, mockBackend, type IpcHandler } from "@/test/tauri";
import {
  downloadFixture,
  downloadTaskFixture,
  libraryStatsFixture,
  progressFixture,
  settingsFixture,
} from "@/test/fixtures";

function setup(path: string, handlers: Record<string, IpcHandler> = {}) {
  window.history.pushState({}, "", path);
  const backend = mockBackend({
    get_settings: () => settingsFixture(),
    get_downloads: () => [],
    get_library_videos: () => [],
    get_library_stats: () => libraryStatsFixture(),
    "plugin:app|version": () => "2.1.0",
    ...handlers,
  });
  const view = render(<App />);
  return { backend, ...view };
}

let logSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => {
  logSpy.mockRestore();
  window.history.pushState({}, "", "/");
});

describe("App", () => {
  describe("first-run gate", () => {
    it("shows only the setup wizard on first run", async () => {
      setup("/library");
      expect(screen.getByText("Welcome to Clipy")).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Library" })).toBeNull();
    });

    it("reports app_ready once, even on first run, for installer smoke tests", async () => {
      const { backend } = setup("/");
      await waitFor(() => expect(backend.callsTo("app_ready")).toHaveLength(1));
    });

    it("tolerates a backend without app_ready", async () => {
      setup("/", {
        app_ready: () => {
          throw "unknown command";
        },
      });
      expect(await screen.findByText("Welcome to Clipy")).toBeInTheDocument();
    });

    it("switches to the app once onboarding completes", async () => {
      setup("/");
      act(() => useUIStore.getState().completeOnboarding());
      expect(await screen.findByRole("link", { name: "Home" })).toBeInTheDocument();
    });
  });

  describe("after onboarding", () => {
    beforeEach(() => {
      useUIStore.setState({ isFirstRun: false });
    });

    it("renders the layout and the requested route", async () => {
      setup("/library");
      expect(await screen.findByRole("heading", { name: "Library" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Library" })).toHaveAttribute("aria-current", "page");
    });

    it("redirects unknown routes to Home", async () => {
      setup("/does-not-exist");
      expect(await screen.findByRole("textbox", { name: "Video URL" })).toBeInTheDocument();
      expect(window.location.pathname).toBe("/");
    });

    it("follows navigate events from the tray", async () => {
      setup("/");
      await screen.findByRole("textbox", { name: "Video URL" });
      await emitBackendEvent("navigate", "/downloads");
      expect(await screen.findByRole("heading", { name: "Downloads" })).toBeInTheDocument();
      expect(window.location.pathname).toBe("/downloads");
    });

    it("restores the backend download queue on start", async () => {
      setup("/downloads", { get_downloads: () => [downloadTaskFixture({ title: "Restored" })] });
      expect(await screen.findByText("Restored")).toBeInTheDocument();
    });

    it("records download progress whichever route is showing", async () => {
      useDownloadStore.setState({ downloads: [downloadFixture()] });
      setup("/library");
      await screen.findByRole("heading", { name: "Library" });
      await waitFor(() => expect(logSpy).toHaveBeenCalled());
      await emitBackendEvent(
        "download-progress",
        progressFixture({ status: "completed", filePath: "C:\\v\\done.mp4" })
      );
      expect(useDownloadStore.getState().downloads[0]).toMatchObject({
        status: "completed",
        filePath: "C:\\v\\done.mp4",
      });
    });
  });

  it("prints the banner once even when effects run twice in StrictMode", async () => {
    const banner = vi.spyOn(logger, "banner");
    mockBackend({ get_settings: () => settingsFixture(), "plugin:app|version": () => "2.1.0" });
    render(
      <StrictMode>
        <App />
      </StrictMode>
    );
    await waitFor(() => expect(banner).toHaveBeenCalled());
    await act(async () => {});
    expect(banner).toHaveBeenCalledTimes(1);
  });

  it("prints the banner with the runtime version, or dev when unavailable", async () => {
    const banner = vi.spyOn(logger, "banner");
    const first = setup("/");
    await waitFor(() => expect(banner).toHaveBeenCalledWith("2.1.0"));
    first.unmount();

    setup("/", {
      "plugin:app|version": () => {
        throw "no app plugin";
      },
    });
    await waitFor(() => expect(banner).toHaveBeenCalledWith("dev"));
  });

  it("applies backend settings app-wide (theme and debug logging)", async () => {
    setup("/", {
      get_settings: () =>
        settingsFixture({ appearance: { theme: "dark" }, advanced: { debugMode: true } }),
    });
    await waitFor(() => expect(document.documentElement.classList.contains("dark")).toBe(true));
    expect(useThemeStore.getState().theme).toBe("dark");
    expect(logger.isDebugMode()).toBe(true);
  });

  it("follows the OS color scheme on the system theme", async () => {
    const listeners: ((e: MediaQueryListEvent) => void)[] = [];
    const remove = vi.fn();
    vi.spyOn(window, "matchMedia").mockImplementation(
      (query: string) =>
        ({
          matches: false,
          media: query,
          addEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => listeners.push(cb),
          removeEventListener: remove,
        }) as unknown as MediaQueryList
    );
    const { unmount } = setup("/");
    await waitFor(() => expect(document.documentElement.classList.contains("light")).toBe(true));
    act(() => listeners.forEach((cb) => cb({ matches: true } as MediaQueryListEvent)));
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.classList.contains("light")).toBe(false);
    unmount();
    expect(remove).toHaveBeenCalled();
    vi.mocked(window.matchMedia).mockRestore();
  });
});
