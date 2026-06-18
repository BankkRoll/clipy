import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const invoke = vi.fn();
const listen = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...a: unknown[]) => invoke(...a) }));
vi.mock("@tauri-apps/api/event", () => ({ listen: (...a: unknown[]) => listen(...a) }));

import {
  useVideoMetadata,
  useThumbnails,
  useWaveform,
  useProject,
  useExport,
  useExportOptions,
  type Project,
  type ExportSettings,
} from "@/hooks/useEditor";

beforeEach(() => {
  invoke.mockReset();
  listen.mockReset();
  listen.mockResolvedValue(() => {});
});

describe("useVideoMetadata", () => {
  it("getMetadata invokes get_video_metadata with path", async () => {
    const meta = { duration: 10 };
    invoke.mockResolvedValueOnce(meta);
    const { result } = renderHook(() => useVideoMetadata());
    await act(async () => {
      await result.current.getMetadata("/v.mp4");
    });
    expect(invoke).toHaveBeenCalledWith("get_video_metadata", { path: "/v.mp4" });
    expect(result.current.metadata).toEqual(meta);
  });

  it("getMetadata sets error and throws on rejection", async () => {
    invoke.mockRejectedValueOnce("err");
    const { result } = renderHook(() => useVideoMetadata());
    let thrown: unknown;
    await act(async () => {
      await result.current.getMetadata("/v").catch((e) => {
        thrown = e;
      });
    });
    expect((thrown as Error).message).toBe("err");
    expect(result.current.error).toBe("err");
  });
});

describe("useThumbnails", () => {
  it("generateThumbnail passes videoPath/outputPath/timeOffset", async () => {
    invoke.mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useThumbnails());
    await act(async () => {
      await result.current.generateThumbnail("/v", "/o.png", 5);
    });
    expect(invoke).toHaveBeenCalledWith("generate_thumbnail", {
      videoPath: "/v",
      outputPath: "/o.png",
      timeOffset: 5,
    });
  });

  it("generateTimelineThumbnails returns the list", async () => {
    invoke.mockResolvedValueOnce(["/a.png", "/b.png"]);
    const { result } = renderHook(() => useThumbnails());
    let out: string[] | undefined;
    await act(async () => {
      out = await result.current.generateTimelineThumbnails("/v", "/dir", 2, 160);
    });
    expect(invoke).toHaveBeenCalledWith("generate_timeline_thumbnails", {
      videoPath: "/v",
      outputDir: "/dir",
      count: 2,
      width: 160,
    });
    expect(out).toEqual(["/a.png", "/b.png"]);
  });
});

describe("useWaveform", () => {
  it("extractWaveform invokes extract_waveform and stores result", async () => {
    invoke.mockResolvedValueOnce([0.1, 0.2]);
    const { result } = renderHook(() => useWaveform());
    let out: number[] | undefined;
    await act(async () => {
      out = await result.current.extractWaveform("/v", 100);
    });
    expect(invoke).toHaveBeenCalledWith("extract_waveform", { videoPath: "/v", samples: 100 });
    expect(out).toEqual([0.1, 0.2]);
    expect(result.current.waveform).toEqual([0.1, 0.2]);
  });

  it("extractWaveform returns [] and sets error on rejection", async () => {
    invoke.mockRejectedValueOnce("boom");
    const { result } = renderHook(() => useWaveform());
    let out: number[] | undefined;
    await act(async () => {
      out = await result.current.extractWaveform("/v", 1);
    });
    expect(out).toEqual([]);
    expect(result.current.error).toBe("boom");
  });
});

describe("useProject", () => {
  it("createProject invokes create_project with name/width/height/fps", async () => {
    const proj = { id: "p" } as unknown as Project;
    invoke.mockResolvedValueOnce(proj);
    const { result } = renderHook(() => useProject());
    await act(async () => {
      await result.current.createProject("My", 1920, 1080, 30);
    });
    expect(invoke).toHaveBeenCalledWith("create_project", {
      name: "My",
      width: 1920,
      height: 1080,
      fps: 30,
    });
    expect(result.current.project).toEqual(proj);
  });

  it("loadProject invokes load_project and sets project", async () => {
    const proj = { id: "p" } as unknown as Project;
    invoke.mockResolvedValueOnce(proj);
    const { result } = renderHook(() => useProject());
    await act(async () => {
      await result.current.loadProject("/p.json");
    });
    expect(invoke).toHaveBeenCalledWith("load_project", { path: "/p.json" });
    expect(result.current.project).toEqual(proj);
  });

  it("saveProject throws when there is no project", async () => {
    const { result } = renderHook(() => useProject());
    await expect(
      act(async () => {
        await result.current.saveProject("/p.json");
      })
    ).rejects.toThrow("No project to save");
  });

  it("saveProject invokes save_project with project and path", async () => {
    const proj = { id: "p" } as unknown as Project;
    invoke.mockResolvedValueOnce(proj);
    const { result } = renderHook(() => useProject());
    await act(async () => {
      await result.current.createProject("n", 1, 1, 1);
    });
    invoke.mockResolvedValueOnce(undefined);
    await act(async () => {
      await result.current.saveProject("/out.json");
    });
    expect(invoke).toHaveBeenCalledWith("save_project", { project: proj, path: "/out.json" });
  });
});

describe("useExport", () => {
  it("subscribes to export-progress event", async () => {
    renderHook(() => useExport());
    await waitFor(() => expect(listen).toHaveBeenCalled());
    expect(listen.mock.calls[0]![0]).toBe("export-progress");
  });

  it("startExport invokes export_project and returns output path", async () => {
    invoke.mockResolvedValueOnce("/out.mp4");
    const { result } = renderHook(() => useExport());
    const proj = { id: "p" } as unknown as Project;
    const settings = { format: "mp4" } as unknown as ExportSettings;
    let out: string | undefined;
    await act(async () => {
      out = await result.current.startExport(proj, settings);
    });
    expect(invoke).toHaveBeenCalledWith("export_project", { project: proj, settings });
    expect(out).toBe("/out.mp4");
    expect(result.current.exporting).toBe(true);
  });

  it("startExport sets error, stops exporting, and throws on rejection", async () => {
    invoke.mockRejectedValueOnce("xfail");
    const { result } = renderHook(() => useExport());
    let thrown: unknown;
    await act(async () => {
      await result.current.startExport({} as Project, {} as ExportSettings).catch((e) => {
        thrown = e;
      });
    });
    expect((thrown as Error).message).toBe("xfail");
    expect(result.current.error).toBe("xfail");
    expect(result.current.exporting).toBe(false);
  });

  it("cancelExport invokes cancel_export and clears exporting", async () => {
    invoke.mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useExport());
    await act(async () => {
      await result.current.cancelExport();
    });
    expect(invoke).toHaveBeenCalledWith("cancel_export");
    expect(result.current.exporting).toBe(false);
  });
});

describe("useExportOptions", () => {
  it("loadOptions fetches formats and resolutions", async () => {
    invoke.mockResolvedValueOnce([{ id: "mp4" }]).mockResolvedValueOnce([{ id: "1080" }]);
    const { result } = renderHook(() => useExportOptions());
    await act(async () => {
      await result.current.loadOptions();
    });
    expect(invoke).toHaveBeenCalledWith("get_export_formats");
    expect(invoke).toHaveBeenCalledWith("get_export_resolutions");
    expect(result.current.formats).toEqual([{ id: "mp4" }]);
    expect(result.current.resolutions).toEqual([{ id: "1080" }]);
  });
});
