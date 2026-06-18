import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...a: unknown[]) => invoke(...a) }));

import { useLibrary, useLibraryStats } from "@/hooks/useLibrary";
import type { LibraryVideo } from "@/hooks/useLibrary";

const VIDEO: LibraryVideo = {
  id: "a",
  videoId: "v",
  title: "T",
  thumbnail: "",
  duration: 1,
  channel: "C",
  filePath: "/f",
  fileSize: 1,
  format: "mp4",
  resolution: "1080p",
  downloadedAt: "2024-01-01",
  sourceUrl: "u",
};

beforeEach(() => {
  invoke.mockReset();
  invoke.mockResolvedValue([VIDEO]);
});

describe("useLibrary", () => {
  it("fetches videos on mount via get_library_videos", async () => {
    const { result } = renderHook(() => useLibrary());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(invoke).toHaveBeenCalledWith("get_library_videos");
    expect(result.current.videos).toEqual([VIDEO]);
  });

  it("sets error when fetch rejects", async () => {
    invoke.mockRejectedValueOnce("nope");
    const { result } = renderHook(() => useLibrary());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("nope");
  });

  it("addVideo invokes add_library_video then refreshes", async () => {
    const { result } = renderHook(() => useLibrary());
    await waitFor(() => expect(result.current.loading).toBe(false));
    invoke.mockClear();
    invoke.mockResolvedValue([VIDEO]);
    await act(async () => {
      await result.current.addVideo(VIDEO);
    });
    expect(invoke).toHaveBeenCalledWith("add_library_video", { video: VIDEO });
    expect(invoke).toHaveBeenCalledWith("get_library_videos");
  });

  it("deleteVideo defaults deleteFile to false", async () => {
    const { result } = renderHook(() => useLibrary());
    await waitFor(() => expect(result.current.loading).toBe(false));
    invoke.mockResolvedValue([VIDEO]);
    await act(async () => {
      await result.current.deleteVideo("a");
    });
    expect(invoke).toHaveBeenCalledWith("delete_library_video", { id: "a", deleteFile: false });
  });

  it("deleteVideo passes deleteFile true when given", async () => {
    const { result } = renderHook(() => useLibrary());
    await waitFor(() => expect(result.current.loading).toBe(false));
    invoke.mockResolvedValue([VIDEO]);
    await act(async () => {
      await result.current.deleteVideo("a", true);
    });
    expect(invoke).toHaveBeenCalledWith("delete_library_video", { id: "a", deleteFile: true });
  });

  it("bulkDelete invokes bulk_delete_library_videos and returns count", async () => {
    const { result } = renderHook(() => useLibrary());
    await waitFor(() => expect(result.current.loading).toBe(false));
    invoke.mockReset();
    invoke.mockResolvedValueOnce(2).mockResolvedValue([VIDEO]);
    let count: number | undefined;
    await act(async () => {
      count = await result.current.bulkDelete(["a", "b"], true);
    });
    expect(invoke).toHaveBeenCalledWith("bulk_delete_library_videos", {
      ids: ["a", "b"],
      deleteFiles: true,
    });
    expect(count).toBe(2);
  });

  it("search invokes search_library and returns results without refreshing", async () => {
    const { result } = renderHook(() => useLibrary());
    await waitFor(() => expect(result.current.loading).toBe(false));
    invoke.mockClear();
    invoke.mockResolvedValueOnce([VIDEO]);
    let out: LibraryVideo[] | undefined;
    await act(async () => {
      out = await result.current.search("query");
    });
    expect(invoke).toHaveBeenCalledWith("search_library", { query: "query" });
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(out).toEqual([VIDEO]);
  });

  it("importVideo invokes import_video with file/title/channel and returns video", async () => {
    const { result } = renderHook(() => useLibrary());
    await waitFor(() => expect(result.current.loading).toBe(false));
    invoke.mockReset();
    invoke.mockResolvedValueOnce(VIDEO).mockResolvedValue([VIDEO]);
    let out: LibraryVideo | undefined;
    await act(async () => {
      out = await result.current.importVideo("/p", "Title", "Chan");
    });
    expect(invoke).toHaveBeenCalledWith("import_video", {
      filePath: "/p",
      title: "Title",
      channel: "Chan",
    });
    expect(out).toEqual(VIDEO);
  });

  it("renameVideo invokes rename_library_video then refreshes", async () => {
    const { result } = renderHook(() => useLibrary());
    await waitFor(() => expect(result.current.loading).toBe(false));
    invoke.mockResolvedValue([VIDEO]);
    await act(async () => {
      await result.current.renameVideo("a", "New");
    });
    expect(invoke).toHaveBeenCalledWith("rename_library_video", { id: "a", newTitle: "New" });
  });

  it("checkVideoExists and getVideoFileSize use correct commands", async () => {
    const { result } = renderHook(() => useLibrary());
    await waitFor(() => expect(result.current.loading).toBe(false));
    invoke.mockResolvedValueOnce(true).mockResolvedValueOnce(123);
    let exists: boolean | undefined;
    let size: number | undefined;
    await act(async () => {
      exists = await result.current.checkVideoExists("/f");
      size = await result.current.getVideoFileSize("/f");
    });
    expect(invoke).toHaveBeenCalledWith("check_video_exists", { filePath: "/f" });
    expect(invoke).toHaveBeenCalledWith("get_video_file_size", { filePath: "/f" });
    expect(exists).toBe(true);
    expect(size).toBe(123);
  });

  it("exportLibrary invokes export_library_json", async () => {
    const { result } = renderHook(() => useLibrary());
    await waitFor(() => expect(result.current.loading).toBe(false));
    invoke.mockResolvedValueOnce("[]");
    let out: string | undefined;
    await act(async () => {
      out = await result.current.exportLibrary();
    });
    expect(invoke).toHaveBeenCalledWith("export_library_json");
    expect(out).toBe("[]");
  });
});

describe("useLibraryStats", () => {
  it("fetches stats on mount via get_library_stats", async () => {
    const stats = { totalVideos: 1, totalSize: 2, totalDuration: 3, uniqueChannels: 1 };
    invoke.mockReset();
    invoke.mockResolvedValue(stats);
    const { result } = renderHook(() => useLibraryStats());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(invoke).toHaveBeenCalledWith("get_library_stats");
    expect(result.current.stats).toEqual(stats);
  });

  it("sets error on rejection", async () => {
    invoke.mockReset();
    invoke.mockRejectedValue("bad");
    const { result } = renderHook(() => useLibraryStats());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("bad");
  });
});
