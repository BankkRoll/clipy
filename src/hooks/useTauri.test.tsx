import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const invoke = vi.fn();
const listen = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...a: unknown[]) => invoke(...a) }));
vi.mock("@tauri-apps/api/event", () => ({ listen: (...a: unknown[]) => listen(...a) }));
const getVersion = vi.fn();
vi.mock("@tauri-apps/api/app", () => ({ getVersion: () => getVersion() }));

import {
  useSystemInfo,
  useBinaryStatus,
  useCacheStats,
  useFileSystem,
  useTauriEvent,
  useNavigationEvent,
  useAppVersion,
} from "@/hooks/useTauri";
import { APP_VERSION } from "@/lib/constants";

beforeEach(() => {
  invoke.mockReset();
  listen.mockReset();
  listen.mockResolvedValue(() => {});
  getVersion.mockReset();
});

describe("useAppVersion", () => {
  it("starts with the bundled version and switches to the runtime one", async () => {
    getVersion.mockResolvedValue("9.9.9");
    const { result } = renderHook(() => useAppVersion());
    expect(result.current).toBe(APP_VERSION);
    await waitFor(() => expect(result.current).toBe("9.9.9"));
  });

  it("keeps the bundled version when the plugin fails or returns nothing", async () => {
    getVersion.mockRejectedValueOnce(new Error("no plugin"));
    const failing = renderHook(() => useAppVersion());
    getVersion.mockResolvedValueOnce("");
    const empty = renderHook(() => useAppVersion());
    await waitFor(() => expect(getVersion).toHaveBeenCalledTimes(2));
    await act(async () => {});
    expect(failing.result.current).toBe(APP_VERSION);
    expect(empty.result.current).toBe(APP_VERSION);
  });

  it("ignores a version that resolves after unmount", async () => {
    let resolve!: (v: string) => void;
    getVersion.mockReturnValue(new Promise<string>((r) => (resolve = r)));
    const { result, unmount } = renderHook(() => useAppVersion());
    unmount();
    await act(async () => resolve("1.2.3"));
    expect(result.current).toBe(APP_VERSION);
  });
});

describe("refresh failures", () => {
  it("useBinaryStatus records the error", async () => {
    invoke.mockRejectedValue("no binaries");
    const { result } = renderHook(() => useBinaryStatus());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("no binaries");
    invoke.mockRejectedValue("");
    await act(() => result.current.refresh());
    expect(result.current.error).toBe("Failed to check binaries");
  });

  it("useCacheStats records the error", async () => {
    invoke.mockRejectedValue("");
    const { result } = renderHook(() => useCacheStats());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("Failed to get cache stats");
  });

  it("binary commands fall back to a generic message", async () => {
    invoke.mockResolvedValue(null);
    const { result } = renderHook(() => useBinaryStatus());
    await waitFor(() => expect(result.current.loading).toBe(false));
    invoke.mockRejectedValue("");
    await expect(act(() => result.current.installYtdlp())).rejects.toThrow(
      "Failed to install yt-dlp"
    );
    await expect(act(() => result.current.updateYtdlp())).rejects.toThrow(
      "Failed to update yt-dlp"
    );
    await expect(act(() => result.current.installFfmpeg())).rejects.toThrow(
      "Failed to install FFmpeg"
    );
  });
});

describe("useNavigationEvent", () => {
  it("forwards navigate payloads", async () => {
    let captured: ((event: { payload: string }) => void) | undefined;
    listen.mockImplementation((_name: string, cb: (e: { payload: string }) => void) => {
      captured = cb;
      return Promise.resolve(() => {});
    });
    const navigate = vi.fn();
    renderHook(() => useNavigationEvent(navigate));
    await waitFor(() => expect(listen).toHaveBeenCalledWith("navigate", expect.any(Function)));
    act(() => captured?.({ payload: "/library" }));
    expect(navigate).toHaveBeenCalledWith("/library");
  });
});

describe("useTauriEvent teardown race", () => {
  it("unlistens immediately when unmounted before listen resolves", async () => {
    const unlisten = vi.fn();
    let resolve!: (fn: () => void) => void;
    listen.mockReturnValue(new Promise((r) => (resolve = r)));
    const { unmount } = renderHook(() => useTauriEvent("e", () => {}));
    unmount();
    expect(unlisten).not.toHaveBeenCalled();
    await act(async () => resolve(unlisten));
    expect(unlisten).toHaveBeenCalledTimes(1);
  });
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
