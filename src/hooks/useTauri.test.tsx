import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const invoke = vi.fn();
const listen = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...a: unknown[]) => invoke(...a) }));
vi.mock("@tauri-apps/api/event", () => ({ listen: (...a: unknown[]) => listen(...a) }));

import {
  useSystemInfo,
  useBinaryStatus,
  useCacheStats,
  useFileSystem,
  useTauriEvent,
} from "@/hooks/useTauri";

beforeEach(() => {
  invoke.mockReset();
  listen.mockReset();
  listen.mockResolvedValue(() => {});
});

describe("useSystemInfo", () => {
  it("loads system info via get_system_info", async () => {
    const info = { os: "windows" };
    invoke.mockResolvedValueOnce(info);
    const { result } = renderHook(() => useSystemInfo());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(invoke).toHaveBeenCalledWith("get_system_info");
    expect(result.current.info).toEqual(info);
  });

  it("sets error on rejection", async () => {
    invoke.mockRejectedValueOnce(new Error("nope"));
    const { result } = renderHook(() => useSystemInfo());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toContain("nope");
  });
});

describe("useBinaryStatus", () => {
  it("checks binaries on mount", async () => {
    invoke.mockResolvedValue({ ffmpegInstalled: true });
    const { result } = renderHook(() => useBinaryStatus());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(invoke).toHaveBeenCalledWith("check_binaries");
  });

  it.each([
    ["installFfmpeg", "install_ffmpeg"],
    ["installYtdlp", "install_ytdlp"],
    ["updateYtdlp", "update_ytdlp"],
  ] as const)("%s invokes %s then refreshes", async (method, command) => {
    invoke.mockResolvedValue({ ffmpegInstalled: true });
    const { result } = renderHook(() => useBinaryStatus());
    await waitFor(() => expect(result.current.loading).toBe(false));
    invoke.mockClear();
    invoke.mockResolvedValue({ ffmpegInstalled: true });
    await act(async () => {
      await (result.current[method] as () => Promise<void>)();
    });
    expect(invoke).toHaveBeenCalledWith(command);
    expect(invoke).toHaveBeenCalledWith("check_binaries");
  });

  it("installFfmpeg throws a wrapped error on rejection", async () => {
    invoke.mockResolvedValueOnce({ ffmpegInstalled: false });
    const { result } = renderHook(() => useBinaryStatus());
    await waitFor(() => expect(result.current.loading).toBe(false));
    invoke.mockRejectedValueOnce("disk full");
    await expect(
      act(async () => {
        await result.current.installFfmpeg();
      })
    ).rejects.toThrow("disk full");
  });
});

describe("useCacheStats", () => {
  it("loads cache stats on mount", async () => {
    invoke.mockResolvedValue({ totalSize: 5 });
    const { result } = renderHook(() => useCacheStats());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(invoke).toHaveBeenCalledWith("get_cache_stats");
    expect(result.current.stats).toEqual({ totalSize: 5 });
  });

  it("clearCache and clearTemp invoke their commands then refresh", async () => {
    invoke.mockResolvedValue({ totalSize: 0 });
    const { result } = renderHook(() => useCacheStats());
    await waitFor(() => expect(result.current.loading).toBe(false));
    invoke.mockClear();
    invoke.mockResolvedValue({ totalSize: 0 });
    await act(async () => {
      await result.current.clearCache();
      await result.current.clearTemp();
    });
    expect(invoke).toHaveBeenCalledWith("clear_cache");
    expect(invoke).toHaveBeenCalledWith("clear_temp");
    expect(invoke).toHaveBeenCalledWith("get_cache_stats");
  });
});

describe("useFileSystem", () => {
  it("maps each action to the right command", async () => {
    const { result } = renderHook(() => useFileSystem());
    invoke.mockResolvedValue(undefined);
    await act(async () => {
      await result.current.openFolder("/a");
      await result.current.openFile("/b");
      await result.current.showInFolder("/c");
    });
    invoke.mockResolvedValueOnce("/downloads");
    let p: string | undefined;
    await act(async () => {
      p = await result.current.getDefaultDownloadPath();
    });
    expect(invoke).toHaveBeenCalledWith("open_folder", { path: "/a" });
    expect(invoke).toHaveBeenCalledWith("open_file", { path: "/b" });
    expect(invoke).toHaveBeenCalledWith("show_in_folder", { path: "/c" });
    expect(invoke).toHaveBeenCalledWith("get_default_download_path");
    expect(p).toBe("/downloads");
  });
});

describe("useTauriEvent", () => {
  it("subscribes with the given event name and forwards payloads", async () => {
    let captured: ((event: { payload: string }) => void) | undefined;
    listen.mockImplementation((_name: string, cb: (e: { payload: string }) => void) => {
      captured = cb;
      return Promise.resolve(() => {});
    });
    const handler = vi.fn();
    renderHook(() => useTauriEvent<string>("my-event", handler));
    await waitFor(() => expect(listen).toHaveBeenCalled());
    expect(listen.mock.calls[0]![0]).toBe("my-event");
    act(() => {
      captured?.({ payload: "hello" });
    });
    expect(handler).toHaveBeenCalledWith("hello");
  });

  it("calls the unlisten function on unmount", async () => {
    const unlisten = vi.fn();
    listen.mockResolvedValue(unlisten);
    const { unmount } = renderHook(() => useTauriEvent("e", () => {}));
    await waitFor(() => expect(listen).toHaveBeenCalled());
    unmount();
    await waitFor(() => expect(unlisten).toHaveBeenCalled());
  });
});
