import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import { useEditorActions } from "@/components/editor/use-editor-actions";
import { useExportFlow } from "@/components/editor/use-export-flow";
import { useCaptionGeneration } from "@/components/editor/use-caption-generation";
import { useEditorShortcuts } from "@/components/editor/use-editor-shortcuts";
import { usePlaybackClock } from "@/components/editor/use-playback-clock";
import { useEditorStore } from "@/stores/editorStore";
import { emitBackendEvent, mockBackend } from "@/test/tauri";
import {
  allClips,
  currentProject,
  loadEditor,
  makeClip,
  makeProject,
  makeTrack,
} from "@/test/editor-fixtures";
import type { ExportDialogSettings } from "@/lib/editor/export";

function project() {
  return makeProject([
    makeTrack({ id: "tv", clips: [makeClip({ id: "v", startTime: 0, endTime: 10 })] }),
    makeTrack({
      id: "tl",
      type: "audio",
      locked: true,
      clips: [makeClip({ id: "l", type: "audio", startTime: 0, endTime: 5 })],
    }),
    makeTrack({ id: "tt", type: "text" }),
  ]);
}

beforeEach(() => {
  loadEditor(project());
  Object.values(toast).forEach((fn) => fn.mockReset());
});

describe("useEditorActions guards", () => {
  it("refuses to cut, duplicate, split or delete clips on locked tracks", async () => {
    const backend = mockBackend({ "plugin:dialog|ask": () => true });
    const { result } = renderHook(() => useEditorActions());
    act(() => result.current.cutClip("l"));
    act(() => result.current.duplicateClip("l"));
    act(() => useEditorStore.getState().seek(2));
    act(() => result.current.splitClip("l"));
    expect(toast.error).toHaveBeenCalledTimes(3);
    expect(toast.error).toHaveBeenCalledWith("Track is locked");
    await act(() => result.current.deleteClips(["l"]));
    expect(backend.callsTo("plugin:dialog|ask")).toHaveLength(0);
    expect(allClips()).toHaveLength(2);
  });

  it("ignores unknown clip ids", async () => {
    const { result } = renderHook(() => useEditorActions());
    act(() => {
      result.current.copyClip("nope");
      result.current.cutClip("nope");
      result.current.duplicateClip("nope");
      result.current.splitClip("nope");
    });
    await act(() => result.current.deleteClips(["nope"]));
    expect(toast.success).not.toHaveBeenCalled();
    expect(result.current.clipboard).toBeNull();
  });

  it("clip commands do nothing once the project is closed", () => {
    const { result } = renderHook(() => useEditorActions());
    loadEditor(null);
    act(() => result.current.cutClip("v"));
    expect(result.current.clipboard).toBeNull();
  });

  it("selection shortcuts need exactly one selected clip", () => {
    const { result } = renderHook(() => useEditorActions());
    act(() => result.current.copySelected());
    expect(result.current.clipboard).toBeNull();
    act(() => {
      useEditorStore.getState().selectClip("v");
      useEditorStore.getState().selectClip("l", true);
    });
    act(() => result.current.duplicateSelected());
    expect(allClips()).toHaveLength(2);
  });

  it("pastes onto the requested track, the selected track or the first compatible one", () => {
    const { result } = renderHook(() => useEditorActions());
    act(() => result.current.pasteClip());
    expect(allClips()).toHaveLength(2);

    act(() => result.current.copyClip("v"));
    const extra = useEditorStore.getState().addTrack("video");
    act(() => result.current.pasteClip(extra));
    expect(currentProject().tracks.find((t) => t.id === extra)!.clips).toHaveLength(1);

    act(() => useEditorStore.getState().selectTrack("tt"));
    act(() => result.current.pasteClip("tl"));
    expect(currentProject().tracks[0]!.clips).toHaveLength(2);
  });

  it("explains when no track can take the pasted clip", () => {
    const { result } = renderHook(() => useEditorActions());
    act(() => result.current.copyClip("l"));
    act(() => result.current.pasteClip());
    expect(toast.error).toHaveBeenCalledWith("No suitable track found");
  });

  it("requires a project for add, paste and save", async () => {
    mockBackend();
    const { result } = renderHook(() => useEditorActions());
    act(() => result.current.copyClip("v"));
    loadEditor(null);
    act(() => result.current.pasteClip());
    expect(result.current.addText()).toBeNull();
    act(() =>
      result.current.addLibraryVideo({
        id: "x",
        title: "X",
        filePath: "/x.mp4",
        duration: 0,
      } as never)
    );
    expect(toast.error).toHaveBeenCalledWith("No project loaded");
    await act(() => result.current.saveProject());
    expect(toast.error).toHaveBeenCalledWith("Nothing to save yet");
  });

  it("library videos without a duration fall back to 60s", () => {
    const { result } = renderHook(() => useEditorActions());
    act(() =>
      result.current.addLibraryVideo({
        id: "x",
        title: "X",
        filePath: "/x.mp4",
        duration: 0,
      } as never)
    );
    expect(allClips().find((c) => c.name === "X")).toMatchObject({ startTime: 10, endTime: 70 });
  });

  it("import exits quietly when the dialog is cancelled", async () => {
    const backend = mockBackend({ "plugin:dialog|open": () => null });
    const { result } = renderHook(() => useEditorActions());
    await act(() => result.current.importFiles());
    expect(backend.callsTo("get_video_metadata")).toHaveLength(0);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("import of only unsupported files adds nothing", async () => {
    mockBackend({ "plugin:dialog|open": () => "C:\\readme.md" });
    const { result } = renderHook(() => useEditorActions());
    await act(() => result.current.importFiles());
    expect(allClips()).toHaveLength(2);
    expect(toast.success).not.toHaveBeenCalled();
  });
});

describe("useExportFlow", () => {
  const settings: ExportDialogSettings = {
    format: "mp4",
    videoCodec: "h264",
    audioCodec: "aac",
    audioBitrate: "192",
    resolution: "original",
    frameRate: "original",
    crfQuality: 23,
    encodingPreset: "medium",
    hardwareAcceleration: true,
    hardwareAccelerationType: "auto",
    outputPath: "C:\\o.mp4",
  };

  it("requires an output path and a project", async () => {
    const backend = mockBackend();
    const { result } = renderHook(() => useExportFlow());
    await act(() => result.current.startExport({ ...settings, outputPath: "" }));
    loadEditor(null);
    await act(() => result.current.startExport(settings));
    expect(toast.error).toHaveBeenCalledTimes(2);
    expect(backend.callsTo("export_project")).toHaveLength(0);
  });

  it("reports the output path when the command resolves first", async () => {
    mockBackend({ export_project: () => "C:\\final.mp4" });
    const onFinished = vi.fn();
    const { result } = renderHook(() => useExportFlow(onFinished));
    await act(() => result.current.startExport(settings));
    expect(toast.success).toHaveBeenCalledWith("Export complete: C:\\final.mp4");
    expect(onFinished).toHaveBeenCalled();
    await emitBackendEvent("export-progress", { status: "completed", progress: 100, error: null });
    expect(toast.success).toHaveBeenCalledTimes(1);
  });

  it("falls back to a generic message for failures without details", async () => {
    let fail!: (e: unknown) => void;
    mockBackend({ export_project: () => new Promise((_, r) => (fail = r)) });
    const { result } = renderHook(() => useExportFlow());
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.startExport(settings);
    });
    await emitBackendEvent("export-progress", { status: "failed", progress: 0, error: null });
    expect(toast.error).toHaveBeenCalledWith("Export failed: Unknown error");
    await act(async () => {
      fail("boom");
      await pending;
    });
    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  it("reports a failed cancel", async () => {
    mockBackend({
      cancel_export: () => {
        throw "no export running";
      },
    });
    const { result } = renderHook(() => useExportFlow());
    await act(() => result.current.cancelExport());
    expect(toast.error).toHaveBeenCalledWith("Failed to cancel export");
  });
});

describe("useCaptionGeneration", () => {
  it("needs a video clip", async () => {
    const backend = mockBackend();
    loadEditor(makeProject([makeTrack({ type: "audio" })]));
    const { result } = renderHook(() => useCaptionGeneration());
    await act(() => result.current.generate({ model: "tiny.en", styleId: "clean" }));
    expect(toast.error).toHaveBeenCalledWith("Add a video to the timeline first");
    expect(backend.callsTo("generate_captions")).toHaveLength(0);
  });

  it("shows the message of an Error thrown by the backend", async () => {
    mockBackend({
      generate_captions: () => {
        throw new Error("whisper crashed");
      },
    });
    const { result } = renderHook(() => useCaptionGeneration());
    await act(() => result.current.generate({ model: "tiny.en", styleId: "clean" }));
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("Caption generation failed"));
    expect(result.current.generating).toBe(false);
  });

  it("treats negative progress as indeterminate", async () => {
    mockBackend();
    const { result } = renderHook(() => useCaptionGeneration());
    await waitFor(async () => {
      await emitBackendEvent("caption-progress", {
        stage: "download",
        progress: -1,
        message: "Downloading",
      });
      expect(result.current.stage).toBe("Downloading");
    });
    expect(result.current.progress).toBeNull();
  });
});

describe("useEditorShortcuts", () => {
  it("skips events already handled elsewhere and keys without a handler", () => {
    const undo = vi.fn();
    renderHook(() => useEditorShortcuts({ undo }));
    const handled = new KeyboardEvent("keydown", { key: "z", ctrlKey: true, cancelable: true });
    handled.preventDefault();
    window.dispatchEvent(handled);
    expect(undo).not.toHaveBeenCalled();

    const unbound = new KeyboardEvent("keydown", { key: " ", cancelable: true });
    window.dispatchEvent(unbound);
    expect(unbound.defaultPrevented).toBe(false);

    const notAShortcut = new KeyboardEvent("keydown", { key: "q", cancelable: true });
    window.dispatchEvent(notAShortcut);
    expect(notAShortcut.defaultPrevented).toBe(false);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true }));
    expect(undo).toHaveBeenCalledTimes(1);
  });
});

describe("usePlaybackClock", () => {
  it("a frame that fires after playback stopped does nothing", () => {
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      frames.push(cb);
      return frames.length;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    renderHook(() => usePlaybackClock());
    act(() => useEditorStore.getState().play());
    act(() => useEditorStore.getState().pause());
    act(() => frames[0]!(performance.now() + 1000));
    expect(useEditorStore.getState().currentTime).toBe(0);
    expect(frames).toHaveLength(1);
    vi.restoreAllMocks();
  });
});
