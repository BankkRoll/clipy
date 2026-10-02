import { describe, it, expect, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useVideoInfo, useDownloadCommands, useDownloadSync } from "@/hooks/useDownload";
import { useDownloadStore, UNKNOWN_FAILURE_REASON } from "@/stores/downloadStore";
import { emitBackendEvent, mockBackend } from "@/test/tauri";
import {
  downloadFixture,
  downloadTaskFixture,
  progressFixture,
  videoInfoFixture,
} from "@/test/fixtures";
import { DEFAULT_DOWNLOAD_OPTIONS } from "@/types/download";

const downloads = () => useDownloadStore.getState().downloads;

describe("useVideoInfo", () => {
  it("fetchVideoInfo invokes fetch_video_info and stores the result", async () => {
    const info = videoInfoFixture();
    const backend = mockBackend({ fetch_video_info: () => info });
    const { result } = renderHook(() => useVideoInfo());
    await act(() => result.current.fetchVideoInfo("https://yt/x"));
    expect(backend.callsTo("fetch_video_info")[0]?.args).toEqual({ url: "https://yt/x" });
    expect(result.current.videoInfo).toEqual(info);
    expect(result.current.loading).toBe(false);
  });

  it("fetchVideoInfo sets error and throws on rejection", async () => {
    mockBackend({
      fetch_video_info: () => {
        throw "unsupported URL";
      },
    });
    const { result } = renderHook(() => useVideoInfo());
    let thrown: unknown;
    await act(() => result.current.fetchVideoInfo("u").catch((e: unknown) => void (thrown = e)));
    expect((thrown as Error).message).toBe("unsupported URL");
    expect(result.current.error).toBe("unsupported URL");
  });

  it("falls back to a generic error message", async () => {
    mockBackend({
      fetch_video_info: () => {
        throw "";
      },
    });
    const { result } = renderHook(() => useVideoInfo());
    await expect(act(() => result.current.fetchVideoInfo("u"))).rejects.toThrow(
      "Failed to fetch video info"
    );
  });

  it("validateUrl / extractVideoId / getAvailableQualities call their commands", async () => {
    const backend = mockBackend({
      validate_url: () => true,
      extract_video_id: () => "abc",
      get_available_qualities: () => ["1080"],
    });
    const info = videoInfoFixture();
    const { result } = renderHook(() => useVideoInfo());
    await expect(result.current.validateUrl("u")).resolves.toBe(true);
    await expect(result.current.extractVideoId("u")).resolves.toBe("abc");
    await expect(result.current.getAvailableQualities(info)).resolves.toEqual(["1080"]);
    expect(backend.callsTo("get_available_qualities")[0]?.args).toEqual({ videoInfo: info });
  });

  it("clear resets videoInfo and error", async () => {
    mockBackend({ fetch_video_info: () => videoInfoFixture() });
    const { result } = renderHook(() => useVideoInfo());
    await act(() => result.current.fetchVideoInfo("u"));
    act(() => result.current.clear());
    expect(result.current.videoInfo).toBeNull();
    expect(result.current.error).toBeNull();
  });
});

describe("useDownloadCommands", () => {
  it("startDownload sends the payload and adds a pending row under the backend id", async () => {
    const backend = mockBackend({ start_download: () => "backend-id" });
    const info = videoInfoFixture();
    const options = { ...DEFAULT_DOWNLOAD_OPTIONS, outputPath: "D:\\out" };
    const { result } = renderHook(() => useDownloadCommands());

    let id = "";
    await act(async () => {
      id = await result.current.startDownload("https://x", info, options, {
        quality: "720p",
        format: "webm",
      });
    });

    expect(id).toBe("backend-id");
    expect(backend.callsTo("start_download")[0]?.args).toEqual({
      url: "https://x",
      videoInfo: info,
      options,
    });
    expect(downloads()[0]).toMatchObject({
      id: "backend-id",
      status: "pending",
      quality: "720p",
      format: "webm",
      outputPath: "D:\\out",
      title: info.title,
    });
  });

  it("does not add a row when the backend rejects", async () => {
    mockBackend({
      start_download: () => {
        throw "queue full";
      },
    });
    const { result } = renderHook(() => useDownloadCommands());
    await expect(
      result.current.startDownload("u", videoInfoFixture(), DEFAULT_DOWNLOAD_OPTIONS, {
        quality: "1080p",
        format: "mp4",
      })
    ).rejects.toBe("queue full");
    expect(downloads()).toEqual([]);
  });

  it.each([
    ["pauseDownload", "pause_download", "downloading", "paused"],
    ["resumeDownload", "resume_download", "paused", "pending"],
    ["cancelDownload", "cancel_download", "downloading", "cancelled"],
    ["retryDownload", "retry_download", "failed", "pending"],
  ] as const)("%s invokes %s then updates the row", async (method, command, from, to) => {
    const backend = mockBackend();
    useDownloadStore.setState({ downloads: [downloadFixture({ status: from })] });
    const { result } = renderHook(() => useDownloadCommands());
    await act(() => result.current[method]("d1"));
    expect(backend.callsTo(command)[0]?.args).toEqual({ id: "d1" });
    expect(downloads()[0]?.status).toBe(to);
  });

  it("leaves the row alone when a command is rejected", async () => {
    mockBackend({
      pause_download: () => {
        throw "not found";
      },
    });
    useDownloadStore.setState({ downloads: [downloadFixture()] });
    const { result } = renderHook(() => useDownloadCommands());
    await expect(result.current.pauseDownload("d1")).rejects.toBe("not found");
    expect(downloads()[0]?.status).toBe("downloading");
  });

  it("clearCompleted clears the backend queue and the store", async () => {
    const backend = mockBackend();
    useDownloadStore.setState({
      downloads: [downloadFixture({ status: "completed" }), downloadFixture({ id: "d2" })],
    });
    const { result } = renderHook(() => useDownloadCommands());
    await act(() => result.current.clearCompleted());
    expect(backend.callsTo("clear_completed_downloads")).toHaveLength(1);
    expect(downloads().map((d) => d.id)).toEqual(["d2"]);
  });

  it("setMaxConcurrent invokes set_max_concurrent_downloads", async () => {
    const backend = mockBackend();
    const { result } = renderHook(() => useDownloadCommands());
    await act(() => result.current.setMaxConcurrent(5));
    expect(backend.callsTo("set_max_concurrent_downloads")[0]?.args).toEqual({ max: 5 });
  });
});

describe("useDownloadSync", () => {
  it("hydrates the store from get_downloads on mount", async () => {
    mockBackend({ get_downloads: () => [downloadTaskFixture({ id: "restored" })] });
    renderHook(() => useDownloadSync());
    await waitFor(() => expect(downloads().map((d) => d.id)).toEqual(["restored"]));
  });

  it("tolerates a null queue and logs a failed load", async () => {
    mockBackend({ get_downloads: () => null });
    const first = renderHook(() => useDownloadSync());
    await act(async () => {});
    expect(downloads()).toEqual([]);
    first.unmount();

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockBackend({
      get_downloads: () => {
        throw "queue unavailable";
      },
    });
    renderHook(() => useDownloadSync());
    await waitFor(() => expect(errorSpy).toHaveBeenCalled());
    expect(downloads()).toEqual([]);
    errorSpy.mockRestore();
  });

  it("folds download-progress events into the store", async () => {
    mockBackend({ get_downloads: () => [] });
    useDownloadStore.setState({ downloads: [downloadFixture()] });
    renderHook(() => useDownloadSync());
    await act(async () => {});
    await emitBackendEvent("download-progress", progressFixture({ progress: 77 }));
    expect(downloads()[0]?.progress).toBe(77);
  });

  it("uses the event message as the failure reason", async () => {
    const backend = mockBackend({ get_downloads: () => [] });
    useDownloadStore.setState({ downloads: [downloadFixture()] });
    renderHook(() => useDownloadSync());
    await act(async () => {});
    await emitBackendEvent(
      "download-progress",
      progressFixture({ status: "failed", message: "HTTP Error 403" })
    );
    expect(downloads()[0]).toMatchObject({ status: "failed", error: "HTTP Error 403" });
    expect(backend.callsTo("get_downloads")).toHaveLength(1);
  });

  it("looks the failure reason up from the backend task when the event has none", async () => {
    let tasks = [downloadTaskFixture()];
    mockBackend({ get_downloads: () => tasks });
    renderHook(() => useDownloadSync());
    await waitFor(() => expect(downloads()).toHaveLength(1));

    tasks = [downloadTaskFixture({ status: "failed", error: "Video unavailable" })];
    await emitBackendEvent("download-progress", progressFixture({ status: "failed" }));
    await waitFor(() => expect(downloads()[0]?.error).toBe("Video unavailable"));
    expect(downloads()[0]?.status).toBe("failed");
  });

  it("falls back to a generic reason when the backend has none either", async () => {
    let fail = false;
    mockBackend({
      get_downloads: () => {
        if (fail) throw "gone";
        return [];
      },
    });
    useDownloadStore.setState({ downloads: [downloadFixture(), downloadFixture({ id: "d2" })] });
    renderHook(() => useDownloadSync());
    await act(async () => {});

    await emitBackendEvent("download-progress", progressFixture({ status: "failed" }));
    await waitFor(() => expect(downloads()[0]?.error).toBe(UNKNOWN_FAILURE_REASON));

    fail = true;
    await emitBackendEvent(
      "download-progress",
      progressFixture({ downloadId: "d2", status: "failed" })
    );
    await waitFor(() => expect(downloads()[1]?.error).toBe(UNKNOWN_FAILURE_REASON));
  });
});
