import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { PreviewPlayer } from "@/components/editor/preview-player";
import { useEditorStore } from "@/stores/editorStore";
import { mockBackend } from "@/test/tauri";
import { loadEditor, makeClip, makeProject, makeTrack } from "@/test/editor-fixtures";
import { createTextClip } from "@/lib/editor/clips";
import { sharpenFilterId } from "@/lib/editor/filters";

const video = () => screen.getByTestId("preview-video") as HTMLVideoElement;
const audio = () => screen.getByTestId("preview-audio") as HTMLAudioElement;

let play: ReturnType<typeof vi.spyOn>;
let pause: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mockBackend();
  play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  loadEditor(
    makeProject([
      makeTrack({
        id: "tv",
        clips: [
          makeClip({
            id: "v1",
            startTime: 0,
            endTime: 10,
            sourceStart: 5,
            sourceEnd: 15,
            sourcePath: "C:\\media\\a (1).mp4",
            properties: { volume: 2, speed: 2, fadeIn: 2, opacity: 0.8 },
          }),
          makeClip({ id: "img", type: "image", name: "Poster", startTime: 10, endTime: 15 }),
        ],
      }),
      makeTrack({
        id: "ta",
        type: "audio",
        clips: [
          makeClip({
            id: "a1",
            type: "audio",
            startTime: 0,
            endTime: 4,
            sourcePath: "C:\\media\\song.mp3",
          }),
        ],
      }),
      makeTrack({
        id: "tt",
        type: "text",
        clips: [{ ...makeClip({ id: "t1" }), ...createTextClip(0), id: "t1" }],
      }),
    ])
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PreviewPlayer", () => {
  it("shows an empty state when nothing is under the playhead", () => {
    loadEditor(makeProject([makeTrack({ clips: [] })]));
    render(<PreviewPlayer />);
    expect(screen.getByText("No preview")).toBeInTheDocument();
  });

  it("loads the active video via mediaSrc and syncs time, volume and speed", () => {
    render(<PreviewPlayer />);
    const v = video();
    expect(v.getAttribute("src")).toContain("clipy-media");
    expect(v.getAttribute("src")).toContain("%281%29");
    expect(screen.getByRole("status", { name: "Loading video" })).toBeInTheDocument();
    fireEvent.loadedData(v);
    expect(screen.queryByRole("status", { name: "Loading video" })).toBeNull();

    act(() => useEditorStore.getState().seek(1));
    expect(v.currentTime).toBe(7);
    expect(v.playbackRate).toBe(2);
    // 200% clip volume clamps to 1; fade-in halves it at t=1.
    expect(v.volume).toBe(1);
    expect(v.style.opacity).toBe("0.4");

    act(() => useEditorStore.getState().setVolume(0.2));
    expect(v.volume).toBeCloseTo(0.2);
    act(() => useEditorStore.getState().toggleMute());
    expect(v.volume).toBe(0);
    expect(v.muted).toBe(true);
  });

  it("plays and pauses media in step with the store", () => {
    render(<PreviewPlayer />);
    act(() => useEditorStore.getState().play());
    expect(play).toHaveBeenCalled();
    play.mockClear();
    act(() => useEditorStore.getState().pause());
    expect(pause).toHaveBeenCalled();
  });

  it("only corrects playback drift above the playing tolerance", () => {
    render(<PreviewPlayer />);
    act(() => useEditorStore.getState().play());
    const v = video();
    v.currentTime = 5.2;
    act(() => useEditorStore.getState().seek(0.05));
    expect(v.currentTime).toBe(5.2);
    act(() => useEditorStore.getState().seek(3));
    expect(v.currentTime).toBe(11);
  });

  it("swallows play() rejections from the media element", async () => {
    play.mockRejectedValue(new Error("autoplay blocked"));
    render(<PreviewPlayer />);
    act(() => useEditorStore.getState().play());
    await Promise.resolve();
    expect(play).toHaveBeenCalled();
  });

  it("drives the audio element and pauses it when no audio clip is active", () => {
    render(<PreviewPlayer />);
    expect(audio().getAttribute("src")).toContain("song.mp3");
    pause.mockClear();
    act(() => useEditorStore.getState().seek(6));
    expect(audio().getAttribute("src")).toBeNull();
    expect(pause).toHaveBeenCalled();
  });

  it("renders image clips with <img> and their effects", () => {
    act(() => useEditorStore.getState().seek(12));
    render(<PreviewPlayer />);
    const img = screen.getByAltText("Poster");
    expect(img.tagName).toBe("IMG");
    expect(screen.queryByTestId("preview-video")).toBeNull();
  });

  it("applies the clip transform and filters, including the SVG sharpen", () => {
    useEditorStore.getState().updateClip("v1", {
      properties: {
        ...useEditorStore.getState().project!.tracks[0]!.clips[0]!.properties,
        transform: { x: 0, y: 108, scaleX: 2, scaleY: 2, rotation: 90 },
        filters: [
          { id: "f1", type: "contrast", enabled: true, params: { value: 1.5 } },
          { id: "f2", type: "sharpen", enabled: true, params: { value: 5 } },
        ],
      },
    });
    act(() => useEditorStore.getState().seek(3));
    const { container } = render(<PreviewPlayer />);
    const v = video();
    expect(v.style.transform).toBe("translate(0cqw, 10cqh) scale(2, 2) rotate(90deg)");
    expect(v.style.filter).toContain("contrast(1.5)");
    expect(v.style.filter).toContain(`url(#${sharpenFilterId("v1")})`);
    const kernel = container.querySelector("feConvolveMatrix");
    expect(kernel?.getAttribute("kernelMatrix")).toBe("0 -0.5 0 -0.5 3 -0.5 0 -0.5 0");
  });

  it("shows a readable error when the media fails to load", () => {
    render(<PreviewPlayer />);
    const v = video();
    Object.defineProperty(v, "error", { value: { code: 4, message: "nope" }, configurable: true });
    fireEvent.error(v);
    expect(screen.getByText("Media format not supported or file not found")).toBeInTheDocument();
    expect(screen.getByText(/Path: C:\\media\\a \(1\)\.mp4/)).toBeInTheDocument();

    Object.defineProperty(v, "error", { value: null, configurable: true });
    fireEvent.error(v);
    expect(screen.getByText("Failed to load media")).toBeInTheDocument();
    fireEvent.canPlay(v);
  });

  it("renders an empty preview without a project", () => {
    loadEditor(null);
    render(<PreviewPlayer />);
    expect(screen.getByText("No preview")).toBeInTheDocument();
  });

  it("does not restart media that is already playing and treats speed 0 as 1x", () => {
    useEditorStore.getState().updateClip("v1", {
      properties: {
        ...useEditorStore.getState().project!.tracks[0]!.clips[0]!.properties,
        speed: 0,
      },
    });
    render(<PreviewPlayer />);
    Object.defineProperty(video(), "paused", { value: false, configurable: true });
    Object.defineProperty(audio(), "paused", { value: false, configurable: true });
    act(() => useEditorStore.getState().play());
    expect(play).not.toHaveBeenCalled();
    expect(video().playbackRate).toBe(1);
  });

  it("draws text overlays on top", () => {
    act(() => useEditorStore.getState().seek(1));
    render(<PreviewPlayer />);
    expect(screen.getByText("Enter your text here")).toBeInTheDocument();
  });
});
