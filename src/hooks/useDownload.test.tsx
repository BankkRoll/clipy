import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const invoke = vi.fn();
const listen = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...a: unknown[]) => invoke(...a) }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: (...a: unknown[]) => listen(...a),
}));

import {
  useVideoInfo,
  useDownloadQueue,
  type DownloadTask,
  type VideoInfo,
  type DownloadOptions,
} from "@/hooks/useDownload";

function task(overrides: Partial<DownloadTask> = {}): DownloadTask {
  return {
    id: "d1",
    videoId: "v",
    title: "T",
    thumbnail: "",
    url: "u",
    status: "pending",
    progress: 0,
    downloadedBytes: 0,
    totalBytes: 0,
    speed: 0,
    eta: 0,
    quality: "1080",
    format: "mp4",
    outputPath: "",
    error: null,
    createdAt: "",
    completedAt: null,
    duration: 0,
    channel: "",
    ...overrides,
  };
}

beforeEach(() => {
  invoke.mockReset();
  listen.mockReset();
  // listen resolves to an unlisten fn
  listen.mockResolvedValue(() => {});
  invoke.mockResolvedValue([]);
});

describe("useVideoInfo", () => {
  it("fetchVideoInfo invokes fetch_video_info and stores result", async () => {
    const info = { id: "x", title: "Hi" } as unknown as VideoInfo;
    invoke.mockResolvedValueOnce(info);
    const { result } = renderHook(() => useVideoInfo());
    await act(async () => {
      await result.current.fetchVideoInfo("https://yt/x");
    });
    expect(invoke).toHaveBeenCalledWith("fetch_video_info", { url: "https://yt/x" });
    expect(result.current.videoInfo).toEqual(info);
    expect(result.current.loading).toBe(false);
  });

  it("fetchVideoInfo sets error and throws on rejection", async () => {
    invoke.mockRejectedValueOnce("fail");
    const { result } = renderHook(() => useVideoInfo());
    let thrown: unknown;
    await act(async () => {
      await result.current.fetchVideoInfo("u").catch((e) => {
        thrown = e;
      });
    });
    expect((thrown as Error).message).toBe("fail");
    expect(result.current.error).toBe("fail");
  });

  it("validateUrl / extractVideoId / getAvailableQualities call correct commands", async () => {
    const { result } = renderHook(() => useVideoInfo());
    invoke.mockResolvedValueOnce(true);
    invoke.mockResolvedValueOnce("abc");
    invoke.mockResolvedValueOnce(["1080"]);
    const info = { id: "x" } as unknown as VideoInfo;
    await act(async () => {
      await result.current.validateUrl("u");
      await result.current.extractVideoId("u");
      await result.current.getAvailableQualities(info);
    });
    expect(invoke).toHaveBeenCalledWith("validate_url", { url: "u" });
    expect(invoke).toHaveBeenCalledWith("extract_video_id", { url: "u" });
    expect(invoke).toHaveBeenCalledWith("get_available_qualities", { videoInfo: info });
  });

  it("clear resets videoInfo and error", async () => {
    const info = { id: "x" } as unknown as VideoInfo;
    invoke.mockResolvedValueOnce(info);
    const { result } = renderHook(() => useVideoInfo());
    await act(async () => {
      await result.current.fetchVideoInfo("u");
    });
    act(() => {
      result.current.clear();
    });
    expect(result.current.videoInfo).toBeNull();
    expect(result.current.error).toBeNull();
  });
});

describe("useDownloadQueue", () => {
  it("fetches downloads on mount via get_downloads", async () => {
    const downloads = [task()];
    invoke.mockResolvedValue(downloads);
    const { result } = renderHook(() => useDownloadQueue());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(invoke).toHaveBeenCalledWith("get_downloads");
    expect(result.current.downloads).toEqual(downloads);
  });

  it("subscribes to download-progress event", async () => {
    renderHook(() => useDownloadQueue());
    await waitFor(() => expect(listen).toHaveBeenCalled());
    expect(listen.mock.calls[0]![0]).toBe("download-progress");
  });

  it("computes status-derived buckets", async () => {
    invoke.mockResolvedValue([
      task({ id: "1", status: "downloading" }),
      task({ id: "2", status: "pending" }),
      task({ id: "3", status: "completed" }),
      task({ id: "4", status: "failed" }),
      task({ id: "5", status: "processing" }),
    ]);
    const { result } = renderHook(() => useDownloadQueue());
    await waitFor(() => expect(result.current.downloads).toHaveLength(5));
    expect(result.current.activeDownloads.map((d) => d.id).sort()).toEqual(["1", "5"]);
    expect(result.current.pendingDownloads.map((d) => d.id)).toEqual(["2"]);
    expect(result.current.completedDownloads.map((d) => d.id)).toEqual(["3"]);
    expect(result.current.failedDownloads.map((d) => d.id)).toEqual(["4"]);
  });

  it("startDownload invokes start_download with url/videoInfo/options", async () => {
    const { result } = renderHook(() => useDownloadQueue());
    await waitFor(() => expect(result.current.loading).toBe(false));
    invoke.mockReset();
    invoke.mockResolvedValueOnce("new-id").mockResolvedValue([]);
    const info = { id: "x" } as unknown as VideoInfo;
    const opts = { quality: "1080" } as unknown as DownloadOptions;
    let id: string | undefined;
    await act(async () => {
      id = await result.current.startDownload("u", info, opts);
    });
    expect(invoke).toHaveBeenCalledWith("start_download", { url: "u", videoInfo: info, options: opts });
    expect(id).toBe("new-id");
  });

  it.each([
    ["pauseDownload", "pause_download"],
    ["resumeDownload", "resume_download"],
    ["cancelDownload", "cancel_download"],
    ["retryDownload", "retry_download"],
  ] as const)("%s invokes %s with id then refreshes", async (method, command) => {
    const { result } = renderHook(() => useDownloadQueue());
    await waitFor(() => expect(result.current.loading).toBe(false));
    invoke.mockClear();
    invoke.mockResolvedValue([]);
    await act(async () => {
      await (result.current[method] as (id: string) => Promise<void>)("d1");
    });
    expect(invoke).toHaveBeenCalledWith(command, { id: "d1" });
    expect(invoke).toHaveBeenCalledWith("get_downloads");
  });

  it("clearCompleted invokes clear_completed_downloads", async () => {
    const { result } = renderHook(() => useDownloadQueue());
    await waitFor(() => expect(result.current.loading).toBe(false));
    invoke.mockClear();
    invoke.mockResolvedValue([]);
    await act(async () => {
      await result.current.clearCompleted();
    });
    expect(invoke).toHaveBeenCalledWith("clear_completed_downloads");
  });

  it("setMaxConcurrent invokes set_max_concurrent_downloads with max", async () => {
    const { result } = renderHook(() => useDownloadQueue());
    await waitFor(() => expect(result.current.loading).toBe(false));
    invoke.mockResolvedValueOnce(undefined);
    await act(async () => {
      await result.current.setMaxConcurrent(7);
    });
    expect(invoke).toHaveBeenCalledWith("set_max_concurrent_downloads", { max: 7 });
  });
});
