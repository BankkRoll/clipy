import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, act, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

// react-resizable-panels hit-tests resize handles with getBoundingClientRect,
// which is all zeros in jsdom, so every pointerdown "lands" on a handle and is
// swallowed. A layout-free stand-in keeps the imperative collapse API.
vi.mock("@/components/ui/resizable", async () => {
  const React = await import("react");
  interface PanelProps {
    children?: React.ReactNode;
    onCollapse?: () => void;
    onExpand?: () => void;
  }
  const ResizablePanel = React.forwardRef<unknown, PanelProps>(function Panel(
    { children, onCollapse, onExpand },
    ref
  ) {
    const [collapsed, setCollapsed] = React.useState(false);
    React.useImperativeHandle(ref, () => ({
      isCollapsed: () => collapsed,
      collapse: () => {
        setCollapsed(true);
        onCollapse?.();
      },
      expand: () => {
        setCollapsed(false);
        onExpand?.();
      },
    }));
    return <div data-collapsed={collapsed}>{children}</div>;
  });
  return {
    ResizablePanelGroup: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    ResizablePanel,
    ResizableHandle: () => <div />,
  };
});

import { Editor } from "@/pages/Editor";
import { useEditorStore } from "@/stores/editorStore";
import { emitBackendEvent, mockBackend, type IpcHandler } from "@/test/tauri";
import {
  allClips,
  currentProject,
  loadEditor,
  makeClip,
  makeProject,
  makeTrack,
} from "@/test/editor-fixtures";
import { toBackendProject } from "@/lib/editor/project-mapping";
import type { LibraryVideo } from "@/hooks/useLibrary";
import type { EditorProject } from "@/types/editor";

const LIBRARY: LibraryVideo[] = [
  {
    id: "lib-1",
    videoId: "yt1",
    title: "Library Clip",
    thumbnail: "thumb.jpg",
    duration: 30,
    channel: "Chan",
    filePath: "C:\\videos\\library.mp4",
    fileSize: 10,
    format: "mp4",
    resolution: "1080p",
    downloadedAt: "2026-01-01",
    sourceUrl: "https://youtu.be/x",
  },
];

const SETTINGS = {
  download: { crfQuality: 20, encodingPreset: "slow", videoCodec: "h264" },
  advanced: { hardwareAcceleration: false, hardwareAccelerationType: "auto" },
  editor: { snapToClips: true, snapToPlayhead: true },
};

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
}

function setup(path = "/editor", handlers: Record<string, IpcHandler> = {}) {
  const backend = mockBackend({
    get_library_videos: () => LIBRARY,
    get_settings: () => SETTINGS,
    ...handlers,
  });
  const user = userEvent.setup();
  const utils = render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/editor" element={<Editor />} />
        <Route path="/editor/:projectId" element={<Editor />} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>
  );
  return { backend, user, ...utils };
}

function twoClipProject(): EditorProject {
  return makeProject([
    makeTrack({
      id: "tv",
      type: "video",
      name: "Video 1",
      clips: [
        makeClip({ id: "a", name: "Alpha", startTime: 0, endTime: 10 }),
        makeClip({ id: "b", name: "Bravo", startTime: 10, endTime: 20 }),
      ],
    }),
    makeTrack({ id: "ta", type: "audio", name: "Audio 1", height: 48 }),
  ]);
}

const clipEl = (id: string) => screen.getByTestId(`clip-${id}`);

async function openClipMenu(id: string) {
  fireEvent.contextMenu(clipEl(id));
  return screen.findByRole("menu");
}

beforeEach(() => {
  loadEditor(null);
  Object.values(toast).forEach((fn) => fn.mockReset());
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Editor page: initialization", () => {
  it("creates a project for a deep link instead of hanging", async () => {
    setup("/editor/some-old-id");
    expect(await screen.findByLabelText("Project name")).toHaveValue("Untitled Project");
    expect(useEditorStore.getState().project).not.toBeNull();
  });

  it("keeps an existing project in the store", async () => {
    loadEditor(twoClipProject());
    setup("/editor/project-1");
    expect(await screen.findByLabelText("Project name")).toHaveValue("Test Project");
    expect(clipEl("a")).toBeInTheDocument();
  });

  it("imports a library video passed as ?import= and cleans the URL", async () => {
    setup("/editor?import=lib-1");
    await waitFor(() => expect(allClips()).toHaveLength(1));
    const [clip] = allClips();
    expect(clip).toMatchObject({
      name: "Library Clip",
      sourcePath: "C:\\videos\\library.mp4",
      endTime: 30,
    });
    expect(screen.getByTestId("location")).toHaveTextContent(`/editor/${currentProject().id}`);
    expect(toast.success).toHaveBeenCalledWith('Added "Library Clip" to timeline');
  });

  it("reports an import id that is not in the library", async () => {
    setup("/editor?import=missing");
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("That video is no longer in your library")
    );
    expect(allClips()).toHaveLength(0);
    expect(screen.getByTestId("location")).not.toHaveTextContent("import");
  });
});

describe("Editor page: project files", () => {
  it("saves the live project mapped to the backend shape", async () => {
    loadEditor(twoClipProject());
    useEditorStore.getState().setProjectName("My Cut");
    const { backend, user } = setup("/editor", {
      "plugin:dialog|save": () => "C:\\out\\cut.clipy",
    });
    await user.click(await screen.findByRole("button", { name: "Save" }));

    await waitFor(() => expect(backend.callsTo("save_project")).toHaveLength(1));
    const [dialogCall] = backend.callsTo("plugin:dialog|save");
    expect(dialogCall!.args.options).toMatchObject({ defaultPath: "My Cut.clipy" });
    const { args } = backend.callsTo("save_project")[0]!;
    expect(args.path).toBe("C:\\out\\cut.clipy");
    const sent = args.project as ReturnType<typeof toBackendProject>;
    expect(sent.tracks[0]!.trackType).toBe("video");
    expect(sent.tracks[0]!.clips.map((c) => c.clipType)).toEqual(["video", "video"]);
    expect(sent.name).toBe("My Cut");
    expect(useEditorStore.getState().isDirty).toBe(false);
    expect(toast.success).toHaveBeenCalledWith("Project saved");
  });

  it("does nothing when the save dialog is cancelled and reports backend errors", async () => {
    loadEditor(twoClipProject());
    const { backend, user } = setup("/editor", { "plugin:dialog|save": () => null });
    await user.click(await screen.findByRole("button", { name: "Save" }));
    await waitFor(() => expect(backend.callsTo("plugin:dialog|save")).toHaveLength(1));
    expect(backend.callsTo("save_project")).toHaveLength(0);

    backend.on("plugin:dialog|save", () => "C:\\x.clipy");
    backend.on("save_project", () => {
      throw "disk full";
    });
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Failed to save project"));
  });

  it("opens a project and maps it back from the backend shape (round trip)", async () => {
    const saved = twoClipProject();
    saved.name = "From Disk";
    const { backend, user } = setup("/editor", {
      "plugin:dialog|open": () => "C:\\p.clipy",
      load_project: () => JSON.parse(JSON.stringify(toBackendProject(saved))),
    });
    await user.click(await screen.findByRole("button", { name: "Open" }));
    await waitFor(() => expect(currentProject().name).toBe("From Disk"));
    expect(backend.callsTo("load_project")[0]!.args).toEqual({ path: "C:\\p.clipy" });
    expect(currentProject()).toEqual(saved);
    expect(useEditorStore.getState().historyIndex).toBe(0);
    expect(toast.success).toHaveBeenCalledWith("Project loaded");
  });

  it("ignores a cancelled open dialog and reports load failures", async () => {
    const { backend, user } = setup("/editor", { "plugin:dialog|open": () => null });
    await user.click(await screen.findByRole("button", { name: "Open" }));
    await waitFor(() => expect(backend.callsTo("plugin:dialog|open")).toHaveLength(1));
    expect(backend.callsTo("load_project")).toHaveLength(0);

    backend.on("plugin:dialog|open", () => "C:\\bad.clipy");
    backend.on("load_project", () => {
      throw "corrupt";
    });
    await user.click(screen.getByRole("button", { name: "Open" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Failed to load project"));
  });
});

describe("Editor page: media", () => {
  it("imports files from disk with metadata durations and full volume", async () => {
    const { backend, user } = setup("/editor", {
      "plugin:dialog|open": () => [
        "C:\\in\\shot.mp4",
        "C:\\in\\song.mp3",
        "C:\\in\\still.png",
        "C:\\in\\notes.txt",
        "C:\\in\\broken.mov",
      ],
      get_video_metadata: (args) => {
        if (String(args.path).includes("broken")) throw "ffprobe failed";
        return { duration: String(args.path).endsWith(".mp3") ? 4 : 12 };
      },
    });
    await user.click(await screen.findByRole("button", { name: /Import from disk/ }));
    await waitFor(() => expect(allClips()).toHaveLength(4));

    const tracks = currentProject().tracks;
    const video = tracks.find((t) => t.type === "video")!.clips;
    const audio = tracks.find((t) => t.type === "audio")!.clips;
    expect(video.map((c) => [c.type, c.name, c.startTime, c.endTime])).toEqual([
      ["video", "shot.mp4", 0, 12],
      ["image", "still.png", 16, 21],
      ["video", "broken.mov", 21, 81],
    ]);
    expect(audio.map((c) => [c.name, c.startTime, c.endTime])).toEqual([["song.mp3", 12, 16]]);
    expect(allClips().every((c) => c.properties.volume === 1)).toBe(true);
    expect(backend.callsTo("get_video_metadata").map((c) => c.args.path)).toEqual([
      "C:\\in\\shot.mp4",
      "C:\\in\\song.mp3",
      "C:\\in\\broken.mov",
    ]);
    expect(toast.error).toHaveBeenCalledWith("Unsupported file type: notes.txt");
    expect(toast.success).toHaveBeenCalledWith("Added 4 file(s) to timeline");

    // The whole import is one undo step.
    act(() => useEditorStore.getState().undo());
    expect(allClips()).toHaveLength(0);
  });

  it("creates a track when none of the needed type exists and handles dialog errors", async () => {
    loadEditor(makeProject([makeTrack({ id: "only-text", type: "text" })]));
    const { backend, user } = setup("/editor", {
      "plugin:dialog|open": () => "C:\\in\\a.wav",
      get_video_metadata: () => ({ duration: 0 }),
    });
    await user.click(await screen.findByRole("button", { name: /Import from disk/ }));
    await waitFor(() => expect(allClips()).toHaveLength(1));
    expect(currentProject().tracks.map((t) => t.type)).toEqual(["text", "audio"]);
    expect(allClips()[0]!.endTime).toBe(60);

    backend.on("plugin:dialog|open", () => {
      throw "dialog crashed";
    });
    await user.click(screen.getByRole("button", { name: /Import from disk/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Failed to import files"));
  });

  it("adds a library video by clicking it", async () => {
    const { user } = setup();
    await user.click(await screen.findByTitle("Library Clip"));
    expect(allClips()).toHaveLength(1);
    expect(allClips()[0]!.properties.volume).toBe(1);
  });

  it("adds a text overlay, selects it and opens the Text tab", async () => {
    const { user } = setup();
    await user.click(await screen.findByRole("tab", { name: /Text/ }));
    await user.click(screen.getByRole("button", { name: /Add Text Overlay/ }));
    const [clip] = allClips();
    expect(clip!.type).toBe("text");
    expect(useEditorStore.getState().selectedClipIds).toEqual([clip!.id]);
    expect(screen.getByLabelText("Text content")).toHaveValue("Enter your text here");
  });
});

describe("Editor page: preview", () => {
  it("renders the video at the playhead via mediaSrc with filters and transform", async () => {
    const project = twoClipProject();
    project.tracks[0]!.clips[0]!.properties.filters = [
      { id: "f", type: "blur", enabled: true, params: { value: 2 } },
    ];
    project.tracks[0]!.clips[0]!.properties.transform = {
      x: 192,
      y: 0,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
    };
    loadEditor(project);
    setup();
    const video = await screen.findByTestId("preview-video");
    expect(video.getAttribute("src")).toContain("clipy-media");
    expect(video.getAttribute("src")).toContain("clip.mp4");
    expect(video.style.filter).toBe("blur(2px)");
    expect(video.style.transform).toContain("translate(10cqw, 0cqh)");
  });

  it("renders image clips with <img>", async () => {
    loadEditor(
      makeProject([
        makeTrack({
          clips: [makeClip({ id: "img", type: "image", name: "Still", sourcePath: "C:\\p.png" })],
        }),
      ])
    );
    setup();
    const img = await screen.findByAltText("Still");
    expect(img.tagName).toBe("IMG");
    expect(img.getAttribute("src")).toContain("p.png");
    expect(screen.queryByTestId("preview-video")).toBeNull();
  });
});

describe("Editor page: timeline + context menus", () => {
  it("context-menu Copy acts on the right-clicked clip, not the previous selection", async () => {
    loadEditor(twoClipProject());
    const { user } = setup();
    await screen.findByTestId("clip-a");
    fireEvent.mouseDown(clipEl("a"), { button: 0, clientX: 10 });
    fireEvent.mouseUp(window);
    expect(useEditorStore.getState().selectedClipIds).toEqual(["a"]);

    const menu = await openClipMenu("b");
    await user.click(within(menu).getByRole("menuitem", { name: /Copy/ }));
    expect(toast.success).toHaveBeenCalledWith("Clip copied");

    act(() => useEditorStore.getState().seek(15));
    const menu2 = await openClipMenu("a");
    await user.click(within(menu2).getByRole("menuitem", { name: /Paste/ }));
    const pasted = allClips().find((c) => c.name.endsWith("(pasted)"))!;
    expect(pasted.name).toBe("Bravo (pasted)");
    expect(pasted.startTime).toBe(15);
  });

  it("context-menu Cut, Duplicate, Split and Delete use the clicked clip id", async () => {
    loadEditor(twoClipProject());
    const { backend, user } = setup("/editor", { "plugin:dialog|ask": () => true });
    await screen.findByTestId("clip-a");
    act(() => useEditorStore.getState().selectClip("a"));

    await user.click(within(await openClipMenu("b")).getByRole("menuitem", { name: /Duplicate/ }));
    expect(allClips().map((c) => c.name)).toEqual(["Alpha", "Bravo", "Bravo (copy)"]);

    act(() => useEditorStore.getState().seek(5));
    await user.click(
      within(await openClipMenu("a")).getByRole("menuitem", { name: /Split at Playhead/ })
    );
    expect(allClips().map((c) => c.name)).toContain("Alpha (2)");

    await user.click(within(await openClipMenu("b")).getByRole("menuitem", { name: /Delete/ }));
    await waitFor(() => expect(allClips().some((c) => c.id === "b")).toBe(false));
    expect(backend.callsTo("plugin:dialog|ask")[0]!.args.message).toBe("Delete 1 clip(s)?");

    act(() => useEditorStore.getState().selectClip("a"));
    const copyId = allClips().find((c) => c.name === "Bravo (copy)")!.id;
    await user.click(within(await openClipMenu(copyId)).getByRole("menuitem", { name: /Cut/ }));
    expect(allClips().some((c) => c.id === copyId)).toBe(false);
    expect(allClips().some((c) => c.id === "a")).toBe(true);
  });

  it("toolbar Copy/Paste/Split/Delete act on the selection", async () => {
    loadEditor(twoClipProject());
    const { backend, user } = setup("/editor", { "plugin:dialog|ask": () => true });
    await screen.findByTestId("clip-a");
    act(() => {
      useEditorStore.getState().selectClip("a");
      useEditorStore.getState().seek(12);
    });
    await user.click(screen.getByRole("button", { name: "Copy" }));
    await user.click(screen.getByRole("button", { name: "Paste" }));
    expect(allClips().map((c) => c.name)).toContain("Alpha (pasted)");
    act(() => useEditorStore.getState().selectClip("b"));
    await user.click(screen.getByRole("button", { name: "Split at playhead" }));
    expect(allClips().map((c) => c.name)).toContain("Bravo (2)");
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(backend.callsTo("plugin:dialog|ask")).toHaveLength(1));
    await waitFor(() => expect(allClips().some((c) => c.id === "b")).toBe(false));
  });

  it("does not delete when the confirmation is declined", async () => {
    loadEditor(twoClipProject());
    const { backend, user } = setup("/editor", { "plugin:dialog|ask": () => false });
    await user.click(within(await openClipMenu("a")).getByRole("menuitem", { name: /Delete/ }));
    await waitFor(() => expect(backend.callsTo("plugin:dialog|ask")).toHaveLength(1));
    expect(allClips()).toHaveLength(2);
  });

  it("duplicate track copies clips and delete track asks first", async () => {
    loadEditor(twoClipProject());
    const { backend, user } = setup("/editor", { "plugin:dialog|ask": () => true });
    fireEvent.contextMenu(await screen.findByTestId("track-header-tv"));
    await user.click(
      within(await screen.findByRole("menu")).getByRole("menuitem", { name: /Duplicate Track/ })
    );
    const tracks = currentProject().tracks;
    expect(tracks).toHaveLength(3);
    expect(tracks[1]!.name).toBe("Video 1 (copy)");
    expect(tracks[1]!.clips.map((c) => c.name)).toEqual(["Alpha", "Bravo"]);
    expect(tracks[1]!.clips.every((c) => !["a", "b"].includes(c.id))).toBe(true);

    fireEvent.contextMenu(screen.getByTestId(`track-header-${tracks[1]!.id}`));
    await user.click(
      within(await screen.findByRole("menu")).getByRole("menuitem", { name: /Delete Track/ })
    );
    await waitFor(() => expect(currentProject().tracks).toHaveLength(2));
    expect(backend.callsTo("plugin:dialog|ask")).toHaveLength(1);
    expect(toast.success).toHaveBeenCalledWith("Track deleted");
  });
});

describe("Editor page: keyboard shortcuts", () => {
  beforeEach(() => loadEditor(twoClipProject()));

  const press = (key: string, init: KeyboardEventInit = {}) =>
    act(() => {
      fireEvent.keyDown(window, { key, ...init });
    });

  it("space toggles playback and arrows/Home/End move the playhead", async () => {
    setup();
    await screen.findByTestId("clip-a");
    vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1);
    press(" ");
    expect(useEditorStore.getState().isPlaying).toBe(true);
    press(" ");
    expect(useEditorStore.getState().isPlaying).toBe(false);
    press("ArrowRight");
    expect(useEditorStore.getState().currentTime).toBe(1);
    press("ArrowRight", { shiftKey: true });
    expect(useEditorStore.getState().currentTime).toBe(6);
    press("ArrowLeft");
    expect(useEditorStore.getState().currentTime).toBe(5);
    press("ArrowLeft", { shiftKey: true });
    expect(useEditorStore.getState().currentTime).toBe(0);
    press("End");
    expect(useEditorStore.getState().currentTime).toBe(20);
    press("Home");
    expect(useEditorStore.getState().currentTime).toBe(0);
  });

  it("s splits the selected clip at the playhead; outside the clip it explains why", async () => {
    setup();
    await screen.findByTestId("clip-a");
    act(() => {
      useEditorStore.getState().selectClip("a");
      useEditorStore.getState().seek(4);
    });
    press("s");
    expect(allClips().find((c) => c.id === "a")!.endTime).toBe(4);
    act(() => useEditorStore.getState().seek(15));
    press("s");
    expect(toast.error).toHaveBeenCalledWith("Playhead must be within clip to split");
  });

  it("clipboard, duplicate, delete and undo/redo shortcuts", async () => {
    const { backend } = setup("/editor", { "plugin:dialog|ask": () => true });
    await screen.findByTestId("clip-a");
    act(() => useEditorStore.getState().selectClip("a"));
    press("c", { ctrlKey: true });
    act(() => useEditorStore.getState().seek(3));
    press("v", { ctrlKey: true });
    expect(allClips().map((c) => c.name)).toContain("Alpha (pasted)");
    press("d", { metaKey: true });
    expect(allClips().map((c) => c.name)).toContain("Alpha (copy)");

    press("z", { ctrlKey: true });
    expect(allClips().map((c) => c.name)).not.toContain("Alpha (copy)");
    press("Z", { ctrlKey: true, shiftKey: true });
    expect(allClips().map((c) => c.name)).toContain("Alpha (copy)");

    press("x", { ctrlKey: true });
    expect(allClips().some((c) => c.id === "a")).toBe(false);

    act(() => useEditorStore.getState().selectClip("b"));
    press("Delete");
    await waitFor(() => expect(allClips().some((c) => c.id === "b")).toBe(false));
    expect(backend.callsTo("plugin:dialog|ask")).toHaveLength(1);
  });

  it("Ctrl+S saves", async () => {
    const { backend } = setup("/editor", { "plugin:dialog|save": () => "C:\\s.clipy" });
    await screen.findByTestId("clip-a");
    press("s", { ctrlKey: true });
    await waitFor(() => expect(backend.callsTo("save_project")).toHaveLength(1));
    expect(allClips()).toHaveLength(2);
  });

  it("ignores shortcuts typed into text fields", async () => {
    setup();
    const name = await screen.findByLabelText("Project name");
    act(() => useEditorStore.getState().selectClip("a"));
    fireEvent.keyDown(name, { key: " " });
    fireEvent.keyDown(name, { key: "s" });
    fireEvent.keyDown(name, { key: "Delete" });
    expect(useEditorStore.getState().isPlaying).toBe(false);
    expect(allClips()).toHaveLength(2);
  });
});

describe("Editor page: captions", () => {
  it("generates captions into a new text track as one undo step", async () => {
    loadEditor(twoClipProject());
    let resolve!: (v: unknown) => void;
    const { backend, user } = setup("/editor", {
      generate_captions: () => new Promise((r) => (resolve = r)),
    });
    await user.click(await screen.findByRole("tab", { name: /Captions/ }));
    await user.click(screen.getByRole("button", { name: /Generate Captions/ }));
    await waitFor(() => expect(backend.callsTo("generate_captions")).toHaveLength(1));
    expect(backend.callsTo("generate_captions")[0]!.args).toEqual({
      sourcePath: "C:\\media\\clip.mp4",
      model: "base.en",
    });

    await emitBackendEvent("caption-progress", {
      stage: "transcribe",
      progress: 0.42,
      message: "Transcribing 42%",
    });
    expect(screen.getAllByText("Transcribing 42%").length).toBeGreaterThan(0);

    const before = useEditorStore.getState().historyIndex;
    await act(async () => {
      resolve({
        language: "en",
        model: "base.en",
        words: [
          { text: "hello", start_ms: 0, end_ms: 400, confidence: 1 },
          { text: "there", start_ms: 400, end_ms: 800, confidence: 1 },
          { text: "later", start_ms: 3000, end_ms: 3500, confidence: 1 },
        ],
      });
    });
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Added 2 captions"));
    const textTrack = currentProject().tracks.find((t) => t.type === "text")!;
    expect(textTrack.clips.map((c) => c.properties.text?.content)).toEqual([
      "HELLO THERE",
      "LATER",
    ]);
    expect(useEditorStore.getState().historyIndex).toBe(before + 1);
  });

  it("reports no speech and backend failures", async () => {
    loadEditor(twoClipProject());
    const { backend, user } = setup("/editor", {
      generate_captions: () => ({ language: "en", model: "base.en", words: [] }),
    });
    await user.click(await screen.findByRole("tab", { name: /Captions/ }));
    await user.click(screen.getByRole("button", { name: /Generate Captions/ }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("No speech detected in this clip")
    );

    backend.on("generate_captions", () => {
      throw "model missing";
    });
    await user.click(screen.getByRole("button", { name: /Generate Captions/ }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Caption generation failed: model missing")
    );
    expect(currentProject().tracks.some((t) => t.type === "text")).toBe(false);
  });
});

describe("Editor page: export", () => {
  async function openExport(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole("button", { name: "Export" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Output location"), "C:\\out.mp4");
    return dialog;
  }

  it("sends export_project with mapped settings and toasts completion once", async () => {
    loadEditor(twoClipProject());
    let finish!: (v: unknown) => void;
    const { backend, user } = setup("/editor", {
      export_project: () => new Promise((r) => (finish = r)),
    });
    const dialog = await openExport(user);
    await waitFor(() => expect(within(dialog).getByTestId("crf-value")).toHaveTextContent("20"));
    await user.click(within(dialog).getByRole("button", { name: "Export" }));

    await waitFor(() => expect(backend.callsTo("export_project")).toHaveLength(1));
    const { args } = backend.callsTo("export_project")[0]!;
    expect(args.settings).toMatchObject({
      format: "mp4",
      outputPath: "C:\\out.mp4",
      fps: 30,
      crfQuality: 20,
      videoBitrate: 15000,
      encodingPreset: "slow",
      useHardwareAcceleration: false,
    });
    expect((args.project as { tracks: unknown[] }).tracks).toHaveLength(2);

    await emitBackendEvent("export-progress", {
      projectId: "project-1",
      progress: 50,
      currentFrame: 1,
      totalFrames: 2,
      elapsedTime: 1,
      estimatedTime: 120,
      status: "exporting",
      error: null,
    });
    expect(within(screen.getByRole("dialog")).getByText("Encoding video...")).toBeInTheDocument();
    expect(screen.getByText("ETA: 2m")).toBeInTheDocument();

    await emitBackendEvent("export-progress", {
      projectId: "project-1",
      progress: 100,
      currentFrame: 2,
      totalFrames: 2,
      elapsedTime: 2,
      estimatedTime: 0,
      status: "completed",
      error: null,
    });
    await act(async () => finish("C:\\out.mp4"));
    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledWith("Export complete");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("surfaces a failed export-progress event", async () => {
    loadEditor(twoClipProject());
    let fail!: (e: unknown) => void;
    const { user } = setup("/editor", {
      export_project: () => new Promise((_, r) => (fail = r)),
    });
    const dialog = await openExport(user);
    await user.click(within(dialog).getByRole("button", { name: "Export" }));
    await emitBackendEvent("export-progress", {
      projectId: "project-1",
      progress: 10,
      currentFrame: 0,
      totalFrames: 0,
      elapsedTime: 0,
      estimatedTime: 0,
      status: "failed",
      error: "ffmpeg exited with 1",
    });
    expect(toast.error).toHaveBeenCalledWith("Export failed: ffmpeg exited with 1");
    await act(async () => fail("ffmpeg exited with 1"));
    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  it("surfaces a rejected export command and supports cancel", async () => {
    loadEditor(twoClipProject());
    const { backend, user } = setup("/editor", {
      export_project: () => {
        throw "An export is already in progress";
      },
    });
    const dialog = await openExport(user);
    await user.click(within(dialog).getByRole("button", { name: "Export" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Export failed: An export is already in progress")
    );

    backend.on("export_project", () => new Promise(() => {}));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Export" }));
    await user.click(await screen.findByRole("button", { name: "Cancel Export" }));
    await waitFor(() => expect(backend.callsTo("cancel_export")).toHaveLength(1));
    expect(toast.info).toHaveBeenCalledWith("Export cancelled");
  });
});

describe("Editor page: playback clock and panels", () => {
  it("advances the playhead on animation frames and stops at the end", async () => {
    loadEditor(twoClipProject());
    setup();
    await screen.findByTestId("clip-a");
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      frames.push(cb);
      return frames.length;
    });
    const cancel = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    let now = 1000;
    vi.spyOn(performance, "now").mockImplementation(() => now);

    act(() => useEditorStore.getState().play());
    now += 500;
    act(() => frames.shift()!(now));
    expect(useEditorStore.getState().currentTime).toBeCloseTo(0.5);

    act(() => useEditorStore.getState().seek(19.9));
    now += 500;
    act(() => frames.shift()!(now));
    expect(useEditorStore.getState().isPlaying).toBe(false);
    expect(useEditorStore.getState().currentTime).toBe(0);
    expect(cancel).toHaveBeenCalled();
  });

  it("collapses and restores the side panels", async () => {
    const { user } = setup();
    await user.click(await screen.findByRole("button", { name: "Hide media panel" }));
    await user.click(await screen.findByRole("button", { name: "Show media panel" }));
    await user.click(await screen.findByRole("button", { name: "Hide properties panel" }));
    await user.click(await screen.findByRole("button", { name: "Show properties panel" }));
    expect(screen.getByRole("button", { name: "Hide properties panel" })).toBeInTheDocument();
  });
});
