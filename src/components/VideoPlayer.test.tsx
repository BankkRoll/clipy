import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockConvertFileSrc } from "@tauri-apps/api/mocks";
import { VideoPlayer, type VideoPlayerProps } from "@/components/VideoPlayer";

const LOCAL = "C:\\Videos\\clip (1).mp4";

function video() {
  return document.querySelector("video")!;
}

/** Give the jsdom video element the media state a real browser would have. */
function fakeMedia(el: HTMLVideoElement, duration = 100) {
  let currentTime = 0;
  Object.defineProperty(el, "duration", { configurable: true, value: duration });
  Object.defineProperty(el, "currentTime", {
    configurable: true,
    get: () => currentTime,
    set: (v: number) => {
      currentTime = v;
    },
  });
  fireEvent.loadedMetadata(el);
  fireEvent.canPlay(el);
}

function setup(props: Partial<VideoPlayerProps> = {}) {
  const onClose = vi.fn();
  const user = userEvent.setup();
  const view = render(
    <VideoPlayer src={LOCAL} title="My clip" subtitle="My channel" onClose={onClose} {...props} />
  );
  return { onClose, user, ...view };
}

let errorSpy: ReturnType<typeof vi.spyOn>;
let warnSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  mockConvertFileSrc("windows");
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("VideoPlayer sources", () => {
  it("routes local files and posters through the media protocol", () => {
    setup({ poster: "C:\\thumbs\\a.jpg" });
    expect(video().getAttribute("src")).toMatch(/clipy-media/);
    expect(video().getAttribute("src")).toContain("%281%29");
    expect(video().getAttribute("poster")).toMatch(/clipy-media/);
    expect(screen.getByText("My clip")).toBeInTheDocument();
    expect(screen.getByText("My channel")).toBeInTheDocument();
  });

  it("passes remote URLs through untouched", () => {
    setup({ src: "https://cdn.example/v.mp4", poster: "https://cdn.example/p.jpg" });
    expect(video().getAttribute("src")).toBe("https://cdn.example/v.mp4");
    expect(video().getAttribute("poster")).toBe("https://cdn.example/p.jpg");
  });

  it("does not mistake a local path starting with 'http' for a URL", () => {
    setup({ src: "httpdocs/clip.mp4" });
    expect(video().getAttribute("src")).toMatch(/clipy-media/);
  });

  it("renders inline without overlay chrome when asked", () => {
    const { container } = render(<VideoPlayer src={LOCAL} isFullscreen={false} autoPlay={false} />);
    expect(container.firstElementChild).not.toHaveClass("fixed");
    expect(screen.queryByRole("button", { name: "Close player" })).toBeNull();
  });
});

describe("VideoPlayer loading and errors", () => {
  it("shows a spinner until the media can play, then the play overlay", () => {
    setup({ autoPlay: false });
    expect(screen.queryByRole("button", { name: "Play video" })).toBeNull();
    fakeMedia(video());
    expect(screen.getByRole("button", { name: "Play video" })).toBeInTheDocument();
    fireEvent.waiting(video());
    expect(screen.queryByRole("button", { name: "Play video" })).toBeNull();
  });

  it.each([
    [1, "Video playback was aborted"],
    [2, "Network error while loading video"],
    [3, "Video decoding failed"],
    [4, "Video format not supported or file not found"],
  ])("explains media error code %i", (code, message) => {
    setup();
    Object.defineProperty(video(), "error", { configurable: true, value: { code, message: "" } });
    fireEvent.error(video());
    expect(screen.getByText("Unable to play video")).toBeInTheDocument();
    expect(screen.getByText(`${message} (code ${code})`)).toBeInTheDocument();
  });

  it("includes the browser's detail and handles a missing MediaError", () => {
    setup();
    Object.defineProperty(video(), "error", {
      configurable: true,
      value: { code: 4, message: "MEDIA_ELEMENT_ERROR: URL safety check" },
    });
    fireEvent.error(video());
    expect(screen.getByText(/code 4: MEDIA_ELEMENT_ERROR: URL safety check/)).toBeInTheDocument();
  });

  it("falls back to a generic message without a MediaError", () => {
    setup();
    Object.defineProperty(video(), "error", { configurable: true, value: null });
    fireEvent.error(video());
    expect(screen.getByText("Failed to load video")).toBeInTheDocument();
  });

  it("clears a previous error when the source changes", () => {
    const { rerender } = setup();
    Object.defineProperty(video(), "error", { configurable: true, value: null });
    fireEvent.error(video());
    expect(screen.getByText("Unable to play video")).toBeInTheDocument();
    rerender(<VideoPlayer src="C:\\Videos\\other.mp4" />);
    expect(screen.queryByText("Unable to play video")).toBeNull();
  });
});

describe("VideoPlayer playback controls", () => {
  it("autoplays, and logs when autoplay is blocked", async () => {
    const play = vi
      .spyOn(HTMLMediaElement.prototype, "play")
      .mockRejectedValueOnce(new Error("NotAllowedError"));
    setup();
    expect(play).toHaveBeenCalled();
    await waitFor(() => expect(warnSpy).toHaveBeenCalled());
  });

  it("toggles play and pause from the buttons and the video surface", async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play");
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause");
    const { user } = setup({ autoPlay: false });
    fakeMedia(video());
    await user.click(screen.getByRole("button", { name: "Play video" }));
    expect(play).toHaveBeenCalledTimes(1);
    fireEvent.play(video());
    await user.click(screen.getByRole("button", { name: "Pause" }));
    expect(pause).toHaveBeenCalledTimes(1);
    fireEvent.pause(video());
    await user.click(video());
    expect(play).toHaveBeenCalledTimes(2);
    fireEvent.play(video());
    fireEvent.ended(video());
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
  });

  it("skips within bounds and shows the time", async () => {
    const { user } = setup({ autoPlay: false });
    fakeMedia(video(), 100);
    await user.click(screen.getByRole("button", { name: "Forward 10 seconds" }));
    expect(video().currentTime).toBe(10);
    await user.click(screen.getByRole("button", { name: "Back 10 seconds" }));
    await user.click(screen.getByRole("button", { name: "Back 10 seconds" }));
    expect(video().currentTime).toBe(0);
    video().currentTime = 95;
    fireEvent.timeUpdate(video());
    expect(screen.getByText("1:35")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Forward 10 seconds" }));
    expect(video().currentTime).toBe(100);
  });

  it("mutes, unmutes and sets volume from the slider", async () => {
    const { user } = setup({ autoPlay: false });
    await user.click(screen.getByRole("button", { name: "Mute" }));
    expect(video().muted).toBe(true);
    await user.click(screen.getByRole("button", { name: "Unmute" }));
    expect(video().muted).toBe(false);

    const slider = screen.getAllByRole("slider")[0]!;
    slider.focus();
    await user.keyboard("{Home}");
    expect(video().volume).toBe(0);
    expect(screen.getByRole("button", { name: "Unmute" })).toBeInTheDocument();
    await user.keyboard("{ArrowRight}");
    expect(video().volume).toBeCloseTo(0.01);
  });

  it("changes playback speed from the menu", async () => {
    const { user } = setup({ autoPlay: false });
    await user.click(screen.getByRole("button", { name: "Playback speed" }));
    await user.click(await screen.findByRole("menuitem", { name: "1.5x" }));
    expect(video().playbackRate).toBe(1.5);
    await user.click(screen.getByRole("button", { name: "Playback speed" }));
    await user.click(await screen.findByRole("menuitem", { name: "Normal" }));
    expect(video().playbackRate).toBe(1);
  });

  it("previews and seeks on the progress bar", () => {
    setup({ autoPlay: false });
    fakeMedia(video(), 200);
    const bar = screen.getByTestId("progress-bar");
    vi.spyOn(bar, "getBoundingClientRect").mockReturnValue({
      left: 0,
      width: 100,
    } as DOMRect);
    fireEvent.mouseMove(bar, { clientX: 25 });
    expect(screen.getByText("0:50")).toBeInTheDocument();
    fireEvent.click(bar, { clientX: 50 });
    expect(video().currentTime).toBe(100);
    fireEvent.mouseLeave(bar);
    expect(screen.queryByText("0:50")).toBeNull();
  });

  it("ignores progress bar input before metadata loads", () => {
    setup({ autoPlay: false });
    const bar = screen.getByTestId("progress-bar");
    fireEvent.mouseMove(bar, { clientX: 25 });
    fireEvent.click(bar, { clientX: 50 });
    expect(screen.getAllByText("0:00")).toHaveLength(2);
  });

  it("tracks buffered ranges", () => {
    setup({ autoPlay: false });
    fakeMedia(video(), 100);
    Object.defineProperty(video(), "buffered", {
      configurable: true,
      value: { length: 1, end: () => 40 },
    });
    fireEvent.progress(video());
    const buffered = screen.getByTestId("progress-bar").children[1] as HTMLElement;
    expect(buffered.style.width).toBe("40%");
    Object.defineProperty(video(), "buffered", { configurable: true, value: { length: 0 } });
    fireEvent.progress(video());
    expect(buffered.style.width).toBe("40%");
  });

  it("closes from the close button", async () => {
    const { user, onClose } = setup();
    await user.click(screen.getByRole("button", { name: "Close player" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("VideoPlayer fullscreen and picture-in-picture", () => {
  afterEach(() => {
    Object.defineProperty(document, "fullscreenElement", { configurable: true, value: null });
    Object.defineProperty(document, "pictureInPictureElement", { configurable: true, value: null });
  });

  it("enters and exits fullscreen and follows fullscreenchange", async () => {
    const request = vi.spyOn(Element.prototype, "requestFullscreen");
    const exit = vi.spyOn(document, "exitFullscreen");
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Enter fullscreen" }));
    expect(request).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Exit fullscreen" })).toBeInTheDocument();

    Object.defineProperty(document, "fullscreenElement", { configurable: true, value: video() });
    await user.click(screen.getByRole("button", { name: "Exit fullscreen" }));
    expect(exit).toHaveBeenCalled();

    Object.defineProperty(document, "fullscreenElement", { configurable: true, value: video() });
    fireEvent(document, new Event("fullscreenchange"));
    expect(screen.getByRole("button", { name: "Exit fullscreen" })).toBeInTheDocument();
  });

  it("toggles fullscreen on double click and logs failures", async () => {
    const request = vi
      .spyOn(Element.prototype, "requestFullscreen")
      .mockRejectedValue(new Error("denied"));
    const { user } = setup();
    await user.dblClick(video());
    expect(request).toHaveBeenCalled();
    await waitFor(() => expect(errorSpy).toHaveBeenCalled());
  });

  it("enters and leaves picture-in-picture and logs failures", async () => {
    const request = vi.spyOn(HTMLVideoElement.prototype, "requestPictureInPicture");
    const exit = vi.spyOn(document, "exitPictureInPicture");
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Picture in picture" }));
    expect(request).toHaveBeenCalled();

    Object.defineProperty(document, "pictureInPictureElement", {
      configurable: true,
      value: video(),
    });
    await user.click(screen.getByRole("button", { name: "Picture in picture" }));
    expect(exit).toHaveBeenCalled();

    exit.mockRejectedValueOnce(new Error("nope"));
    await user.click(screen.getByRole("button", { name: "Picture in picture" }));
    await waitFor(() => expect(errorSpy).toHaveBeenCalled());
  });
});

describe("VideoPlayer keyboard shortcuts", () => {
  it("maps keys to playback actions", async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play");
    const request = vi.spyOn(Element.prototype, "requestFullscreen");
    const { user } = setup({ autoPlay: false });
    fakeMedia(video(), 100);

    await user.keyboard(" ");
    await user.keyboard("k");
    expect(play).toHaveBeenCalledTimes(2);

    await user.keyboard("{ArrowRight}");
    expect(video().currentTime).toBe(5);
    await user.keyboard("{Shift>}{ArrowRight}{/Shift}");
    expect(video().currentTime).toBe(15);
    await user.keyboard("{ArrowLeft}");
    expect(video().currentTime).toBe(10);
    await user.keyboard("{Shift>}{ArrowLeft}{/Shift}");
    expect(video().currentTime).toBe(0);

    await user.keyboard("{ArrowDown}");
    expect(video().volume).toBeCloseTo(0.9);
    await user.keyboard("{ArrowUp}{ArrowUp}");
    expect(video().volume).toBe(1);

    await user.keyboard("m");
    expect(video().muted).toBe(true);

    await user.keyboard("7");
    expect(video().currentTime).toBe(70);

    await user.keyboard(">");
    expect(video().playbackRate).toBe(1.25);
    await user.keyboard("<<");
    expect(video().playbackRate).toBe(0.75);

    await user.keyboard("f");
    expect(request).toHaveBeenCalled();
  });

  it("clamps speed at both ends and ignores digits before metadata", async () => {
    const { user } = setup({ autoPlay: false });
    await user.keyboard("5");
    expect(screen.getAllByText("0:00")).toHaveLength(2);
    await user.keyboard(">>>>>>>>");
    expect(video().playbackRate).toBe(2);
    await user.keyboard("<<<<<<<<<<");
    expect(video().playbackRate).toBe(0.25);
  });

  it("Escape closes unless fullscreen", async () => {
    const { user, onClose } = setup();
    Object.defineProperty(document, "fullscreenElement", { configurable: true, value: video() });
    await user.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
    Object.defineProperty(document, "fullscreenElement", { configurable: true, value: null });
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ignores keys while typing, with modifiers, or under another dialog", async () => {
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause");
    const play = vi.spyOn(HTMLMediaElement.prototype, "play");
    const user = userEvent.setup();
    render(
      <>
        <input aria-label="search" />
        <VideoPlayer src={LOCAL} autoPlay={false} />
      </>
    );
    fakeMedia(video());
    await user.click(screen.getByRole("textbox", { name: "search" }));
    await user.keyboard(" k");
    (document.activeElement as HTMLElement).blur();
    await user.keyboard("{Control>}k{/Control}");

    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    document.body.appendChild(dialog);
    await user.keyboard("k");
    dialog.remove();

    expect(play).not.toHaveBeenCalled();
    expect(pause).not.toHaveBeenCalled();
    await user.keyboard("k");
    expect(play).toHaveBeenCalledTimes(1);
  });
});

describe("VideoPlayer control visibility", () => {
  it("hides controls after inactivity while playing and on mouse leave", () => {
    vi.useFakeTimers();
    const { container, unmount } = setup({ autoPlay: false });
    const root = container.firstElementChild as HTMLElement;
    const topBar = () => screen.getByText("My clip").closest("div.absolute") as HTMLElement;

    fireEvent.mouseMove(root);
    act(() => vi.advanceTimersByTime(3000));
    expect(topBar()).toHaveClass("opacity-100");

    fireEvent.play(video());
    fireEvent.mouseMove(root);
    fireEvent.mouseMove(root);
    act(() => vi.advanceTimersByTime(3000));
    expect(topBar()).toHaveClass("opacity-0");

    fireEvent.mouseMove(root);
    expect(topBar()).toHaveClass("opacity-100");
    fireEvent.mouseLeave(root);
    expect(topBar()).toHaveClass("opacity-0");

    fireEvent.pause(video());
    fireEvent.mouseLeave(root);
    fireEvent.mouseMove(root);
    unmount();
  });
});
