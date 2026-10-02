import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TooltipProvider } from "@/components/ui/tooltip";
import { EditorToolbar, type EditorToolbarProps } from "@/components/editor/editor-toolbar";
import { PlaybackControls } from "@/components/editor/playback-controls";
import { MediaPanel, type MediaPanelProps } from "@/components/editor/media-panel";
import { CaptionsPanel } from "@/components/editor/captions-panel";
import { useEditorStore } from "@/stores/editorStore";
import {
  currentProject,
  loadEditor,
  makeClip,
  makeProject,
  makeTrack,
} from "@/test/editor-fixtures";
import type { LibraryVideo } from "@/hooks/useLibrary";

beforeEach(() => {
  loadEditor(
    makeProject([
      makeTrack({ id: "tv", clips: [makeClip({ id: "a", startTime: 0, endTime: 30 })] }),
    ])
  );
});

describe("EditorToolbar", () => {
  function setup(overrides: Partial<EditorToolbarProps> = {}) {
    const props: EditorToolbarProps = {
      onOpen: vi.fn(),
      onSave: vi.fn(),
      onExport: vi.fn(),
      onCopy: vi.fn(),
      onPaste: vi.fn(),
      onSplit: vi.fn(),
      onDelete: vi.fn(),
      canPaste: false,
      ...overrides,
    };
    render(
      <TooltipProvider>
        <EditorToolbar {...props} />
      </TooltipProvider>
    );
    return { props, user: userEvent.setup() };
  }

  it("enables commands based on selection, clipboard and history", async () => {
    const { props, user } = setup();
    for (const name of ["Undo", "Redo", "Copy", "Paste", "Split at playhead", "Delete"]) {
      expect(screen.getByRole("button", { name })).toBeDisabled();
    }
    act(() => {
      useEditorStore.getState().selectClip("a");
      useEditorStore.getState().updateTrack("tv", { muted: true });
    });
    expect(screen.getByRole("button", { name: "Undo" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByRole("button", { name: "Redo" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Redo" }));
    expect(currentProject().tracks[0]!.muted).toBe(true);

    await user.click(screen.getByRole("button", { name: "Copy" }));
    await user.click(screen.getByRole("button", { name: "Split at playhead" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: /Open/ }));
    await user.click(screen.getByRole("button", { name: /Save/ }));
    await user.click(screen.getByRole("button", { name: /Export/ }));
    expect(props.onCopy).toHaveBeenCalled();
    expect(props.onSplit).toHaveBeenCalled();
    expect(props.onDelete).toHaveBeenCalled();
    expect(props.onOpen).toHaveBeenCalled();
    expect(props.onSave).toHaveBeenCalled();
    expect(props.onExport).toHaveBeenCalled();
  });

  it("pastes when the clipboard has a clip and renames the project", async () => {
    const { props, user } = setup({ canPaste: true });
    await user.click(screen.getByRole("button", { name: "Paste" }));
    expect(props.onPaste).toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Project name"), { target: { value: "Renamed" } });
    expect(currentProject().name).toBe("Renamed");
  });

  it("shows an empty name without a project", () => {
    loadEditor(null);
    setup();
    expect(screen.getByLabelText("Project name")).toHaveValue("");
  });
});

describe("PlaybackControls", () => {
  function setup() {
    render(
      <TooltipProvider>
        <PlaybackControls />
      </TooltipProvider>
    );
    return userEvent.setup();
  }

  it("transport buttons move the playhead and toggle play", async () => {
    const user = setup();
    await user.click(screen.getByRole("button", { name: "Forward 5 seconds" }));
    expect(useEditorStore.getState().currentTime).toBe(5);
    await user.click(screen.getByRole("button", { name: "Back 5 seconds" }));
    expect(useEditorStore.getState().currentTime).toBe(0);
    await user.click(screen.getByRole("button", { name: "Go to end" }));
    expect(screen.getByTestId("timecode")).toHaveTextContent("0:30/0:30");
    await user.click(screen.getByRole("button", { name: "Go to start" }));
    expect(useEditorStore.getState().currentTime).toBe(0);
    await user.click(screen.getByRole("button", { name: "Play" }));
    expect(useEditorStore.getState().isPlaying).toBe(true);
    await user.click(screen.getByRole("button", { name: "Pause" }));
    expect(useEditorStore.getState().isPlaying).toBe(false);
  });

  it("master volume and mute", async () => {
    const user = setup();
    const thumb = document.querySelector('[aria-label="Master volume"] [role="slider"]')!;
    fireEvent.keyDown(thumb, { key: "ArrowLeft" });
    expect(useEditorStore.getState().volume).toBeCloseTo(0.99);
    await user.click(screen.getByRole("button", { name: "Mute" }));
    expect(useEditorStore.getState().isMuted).toBe(true);
    expect(thumb).toHaveAttribute("aria-valuenow", "0");
    await user.click(screen.getByRole("button", { name: "Unmute" }));
    expect(useEditorStore.getState().isMuted).toBe(false);
  });
});

describe("MediaPanel", () => {
  const video: LibraryVideo = {
    id: "v",
    videoId: "y",
    title: "Talk",
    thumbnail: "",
    duration: 65,
    channel: "c",
    filePath: "/talk.mp4",
    fileSize: 1,
    format: "mp4",
    resolution: "720p",
    downloadedAt: "",
    sourceUrl: "",
  };

  function setup(overrides: Partial<MediaPanelProps> = {}) {
    const props: MediaPanelProps = {
      libraryVideos: [],
      libraryLoading: false,
      onImport: vi.fn(),
      onAddLibraryVideo: vi.fn(),
      onAddText: vi.fn(),
      onCollapse: vi.fn(),
      captions: { generating: false, progress: null, stage: null, generate: vi.fn() },
      ...overrides,
    };
    render(<MediaPanel {...props} />);
    return { props, user: userEvent.setup() };
  }

  it("shows a spinner while the library loads", () => {
    setup({ libraryLoading: true });
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("lists library videos without thumbnails and adds them", async () => {
    const { props, user } = setup({ libraryVideos: [video] });
    expect(screen.getByText("1:05")).toBeInTheDocument();
    expect(screen.queryByRole("img")).toBeNull();
    await user.click(screen.getByTitle("Talk"));
    expect(props.onAddLibraryVideo).toHaveBeenCalledWith(video);
    await user.click(screen.getByRole("button", { name: /Import from disk/ }));
    expect(props.onImport).toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Hide media panel" }));
    expect(props.onCollapse).toHaveBeenCalled();
  });

  it("shows the empty library message", () => {
    setup();
    expect(screen.getByText("No media yet")).toBeInTheDocument();
  });

  it("adds tracks from the Audio tab and text from the Text tab", async () => {
    const { props, user } = setup();
    await user.click(screen.getByRole("tab", { name: /Audio/ }));
    await user.click(screen.getByRole("button", { name: /Add Audio Track/ }));
    await user.click(screen.getByRole("button", { name: /Add Video Track/ }));
    expect(currentProject().tracks.map((t) => t.type)).toEqual(["video", "audio", "video"]);
    await user.click(screen.getByRole("tab", { name: /Text/ }));
    await user.click(screen.getByRole("button", { name: /Add Text Overlay/ }));
    expect(props.onAddText).toHaveBeenCalled();
  });

  it("knows whether the timeline has a video for captions", async () => {
    loadEditor(makeProject([makeTrack({ type: "audio" })]));
    const { user } = setup();
    await user.click(screen.getByRole("tab", { name: /Captions/ }));
    expect(screen.getByText("Add a video to the timeline first.")).toBeInTheDocument();
    loadEditor(null);
  });
});

describe("CaptionsPanel", () => {
  it("generates with the chosen model and style", async () => {
    const onGenerate = vi.fn(() => Promise.resolve());
    const user = userEvent.setup();
    render(<CaptionsPanel hasVideo onGenerate={onGenerate} />);
    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: /Tiny/ }));
    await user.click(screen.getByRole("button", { name: /Karaoke/ }));
    await user.click(screen.getByRole("button", { name: /Generate Captions/ }));
    expect(onGenerate).toHaveBeenCalledWith({ model: "tiny.en", styleId: "karaoke" });
  });

  it("shows indeterminate and determinate progress while generating", () => {
    const { rerender } = render(<CaptionsPanel hasVideo generating />);
    expect(screen.getAllByText(/Preparing|Working/).length).toBeGreaterThan(0);
    expect(screen.getByText(/first run downloads the model/)).toBeInTheDocument();
    rerender(<CaptionsPanel hasVideo generating progress={0.5} stageLabel="Transcribing" />);
    expect(screen.getAllByText("Transcribing").length).toBeGreaterThan(0);
    expect(screen.queryByText(/first run downloads the model/)).toBeNull();
  });

  it("is disabled without a video or handler", () => {
    render(<CaptionsPanel hasVideo={false} />);
    expect(screen.getByRole("button", { name: /Generate Captions/ })).toBeDisabled();
    expect(screen.getByText("Add a video to the timeline first.")).toBeInTheDocument();
  });
});
