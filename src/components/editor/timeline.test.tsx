import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import { TooltipProvider } from "@/components/ui/tooltip";
import { Timeline } from "@/components/editor/timeline";
import type { ClipMenuActions } from "@/components/editor/timeline-clip";
import { useEditorStore } from "@/stores/editorStore";
import { mockBackend } from "@/test/tauri";
import {
  allClips,
  currentProject,
  loadEditor,
  makeClip,
  makeProject,
  makeTrack,
} from "@/test/editor-fixtures";
import { PIXELS_PER_SECOND } from "@/lib/editor/timeline";

function actions(): ClipMenuActions {
  return {
    copyClip: vi.fn(),
    cutClip: vi.fn(),
    pasteClip: vi.fn(),
    duplicateClip: vi.fn(),
    splitClip: vi.fn(),
    deleteClips: vi.fn(() => Promise.resolve()),
  };
}

function project() {
  return makeProject([
    makeTrack({
      id: "tv",
      type: "video",
      name: "Video 1",
      clips: [
        makeClip({
          id: "a",
          name: "Alpha",
          startTime: 0,
          endTime: 10,
          sourceStart: 2,
          sourceEnd: 12,
        }),
        makeClip({ id: "b", name: "Bravo", startTime: 10, endTime: 20 }),
      ],
    }),
    makeTrack({ id: "tv2", type: "video", name: "Video 2" }),
    makeTrack({ id: "ta", type: "audio", name: "Audio 1", height: 48 }),
  ]);
}

function setup(
  opts: { snap?: { snapToClips: boolean; snapToPlayhead: boolean }; canPaste?: boolean } = {}
) {
  const menu = actions();
  const user = userEvent.setup();
  const utils = render(
    <TooltipProvider>
      <Timeline
        actions={menu}
        canPaste={opts.canPaste ?? false}
        snap={opts.snap ?? { snapToClips: true, snapToPlayhead: false }}
      />
    </TooltipProvider>
  );
  return { menu, user, ...utils };
}

function stubRect(el: HTMLElement, rect: Partial<DOMRect>) {
  vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    width: 0,
    height: 0,
    x: 0,
    y: 0,
    toJSON: () => ({}),
    ...rect,
  });
}

const clip = (id: string) => allClips().find((c) => c.id === id)!;
const px = (seconds: number) => seconds * PIXELS_PER_SECOND;

function drag(el: HTMLElement, from: { x: number; y?: number }, to: { x: number; y?: number }) {
  fireEvent.mouseDown(el, { button: 0, clientX: from.x, clientY: from.y ?? 0 });
  fireEvent.mouseMove(window, { clientX: to.x, clientY: to.y ?? 0 });
  fireEvent.mouseUp(window);
}

beforeEach(() => {
  loadEditor(project());
  Object.values(toast).forEach((fn) => fn.mockReset());
});

describe("Timeline layout", () => {
  it("renders the ruler and tracks in one scroll container so they scroll together", () => {
    setup();
    const scroller = screen.getByTestId("timeline-scroll");
    expect(within(scroller).getByTestId("timeline-ruler")).toBeInTheDocument();
    expect(within(scroller).getByTestId("lane-tv")).toBeInTheDocument();
    expect(screen.getByTestId("timeline-ruler").style.width).toBe(
      screen.getByTestId("lane-tv").style.width
    );
  });

  it("shows an empty state without tracks", () => {
    loadEditor(makeProject([]));
    setup();
    expect(screen.getByText("No tracks")).toBeInTheDocument();
  });

  it("zooms in and out", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(screen.getByTestId("zoom-level")).toHaveTextContent("120%");
    await user.click(screen.getByRole("button", { name: "Zoom out" }));
    expect(screen.getByTestId("zoom-level")).toHaveTextContent("100%");
  });

  it("adds tracks from the Add Track menu", async () => {
    const { user } = setup();
    for (const label of ["Video Track", "Audio Track", "Text Track"]) {
      await user.click(screen.getByRole("button", { name: /Add Track/ }));
      await user.click(await screen.findByRole("menuitem", { name: label }));
    }
    expect(currentProject().tracks.map((t) => t.type)).toEqual([
      "video",
      "video",
      "audio",
      "video",
      "audio",
      "text",
    ]);
  });
});

describe("Timeline seeking", () => {
  it("ruler click seeks and is clamped to the timeline", () => {
    setup();
    const ruler = screen.getByTestId("timeline-ruler");
    stubRect(ruler, { left: 100 });
    fireEvent.click(ruler, { clientX: 100 + px(4) });
    expect(useEditorStore.getState().currentTime).toBe(4);
    fireEvent.click(ruler, { clientX: 100 + px(500) });
    expect(useEditorStore.getState().currentTime).toBe(20);
  });

  it("lane click seeks using that lane's own position and clears the selection", () => {
    setup();
    act(() => useEditorStore.getState().selectClip("a"));
    const lane = screen.getByTestId("lane-ta");
    stubRect(lane, { left: 160 });
    fireEvent.click(lane, { clientX: 160 + px(3) });
    expect(useEditorStore.getState().currentTime).toBe(3);
    expect(useEditorStore.getState().selectedClipIds).toEqual([]);
    expect(useEditorStore.getState().selectedTrackId).toBe("ta");
  });

  it("dragging the playhead scrubs relative to the ruler origin", () => {
    setup();
    stubRect(screen.getByTestId("timeline-ruler"), { left: 50 });
    const handle = screen.getByTestId("lane-playhead-tv");
    drag(handle, { x: 50 }, { x: 50 + px(7) });
    expect(useEditorStore.getState().currentTime).toBe(7);

    fireEvent.mouseDown(screen.getByTestId("ruler-playhead"), { button: 0 });
    fireEvent.mouseMove(window, { clientX: 0 });
    fireEvent.mouseUp(window);
    expect(useEditorStore.getState().currentTime).toBe(0);
    // Clicking the handle itself must not also seek via the ruler.
    fireEvent.click(screen.getByTestId("ruler-playhead"), { clientX: 999 });
    expect(useEditorStore.getState().currentTime).toBe(0);
  });
});

describe("Timeline clip dragging", () => {
  it("selects on mousedown (shift adds) and moves within the track as one undo step", () => {
    setup();
    fireEvent.mouseDown(screen.getByTestId("clip-b"), { button: 0, clientX: 0 });
    fireEvent.mouseUp(window);
    fireEvent.mouseDown(screen.getByTestId("clip-a"), { button: 0, clientX: 0, shiftKey: true });
    fireEvent.mouseUp(window);
    expect(useEditorStore.getState().selectedClipIds).toEqual(["b", "a"]);

    const before = useEditorStore.getState().historyIndex;
    drag(screen.getByTestId("clip-b"), { x: 0 }, { x: px(3) });
    expect(clip("b")).toMatchObject({ startTime: 13, endTime: 23, trackId: "tv" });
    expect(useEditorStore.getState().historyIndex).toBe(before + 1);
    act(() => useEditorStore.getState().undo());
    expect(clip("b").startTime).toBe(10);
  });

  it("a click without movement does not add an undo step; right-click only selects", () => {
    setup();
    const before = useEditorStore.getState().historyIndex;
    fireEvent.mouseDown(screen.getByTestId("clip-a"), { button: 0, clientX: 5 });
    fireEvent.mouseUp(window);
    fireEvent.mouseDown(screen.getByTestId("clip-b"), { button: 2, clientX: 5 });
    fireEvent.mouseMove(window, { clientX: 500 });
    fireEvent.mouseUp(window);
    expect(useEditorStore.getState().historyIndex).toBe(before);
    expect(clip("b").startTime).toBe(10);
    expect(useEditorStore.getState().selectedClipIds).toEqual(["b"]);
  });

  it("moves a clip onto a compatible track under the pointer", () => {
    setup();
    stubRect(screen.getByTestId("lane-tv"), { top: 0, bottom: 64 });
    stubRect(screen.getByTestId("lane-tv2"), { top: 64, bottom: 128 });
    stubRect(screen.getByTestId("lane-ta"), { top: 128, bottom: 176 });

    drag(screen.getByTestId("clip-b"), { x: 0, y: 10 }, { x: px(1), y: 100 });
    expect(clip("b")).toMatchObject({ trackId: "tv2", startTime: 11 });
    expect(currentProject().tracks[1]!.clips.map((c) => c.id)).toEqual(["b"]);
  });

  it("refuses to drop a video clip onto an audio track", () => {
    setup();
    stubRect(screen.getByTestId("lane-ta"), { top: 128, bottom: 176 });
    drag(screen.getByTestId("clip-b"), { x: 0, y: 10 }, { x: 0, y: 150 });
    expect(clip("b").trackId).toBe("tv");
  });

  it("locked tracks select but do not move", () => {
    loadEditor(
      makeProject([
        makeTrack({
          id: "tl",
          locked: true,
          clips: [makeClip({ id: "l", startTime: 0, endTime: 5 })],
        }),
      ])
    );
    setup();
    expect(screen.queryByTestId("trim-start-l")).toBeNull();
    drag(screen.getByTestId("clip-l"), { x: 0 }, { x: px(5) });
    expect(clip("l").startTime).toBe(0);
    expect(useEditorStore.getState().selectedClipIds).toEqual(["l"]);
  });

  it("snaps to the playhead only when the editor setting allows it", () => {
    const { unmount } = setup({ snap: { snapToClips: true, snapToPlayhead: true } });
    act(() => useEditorStore.getState().seek(7));
    drag(screen.getByTestId("clip-a"), { x: 0 }, { x: px(6.94) });
    expect(clip("a").startTime).toBe(7);
    unmount();

    loadEditor(project());
    setup({ snap: { snapToClips: true, snapToPlayhead: false } });
    act(() => useEditorStore.getState().seek(7));
    drag(screen.getByTestId("clip-a"), { x: 0 }, { x: px(6.94) });
    expect(clip("a").startTime).toBeCloseTo(6.94);
  });

  it("does not snap to clip edges when snapToClips is off", () => {
    const short = makeClip({ id: "c", startTime: 0, endTime: 2 });
    const tracks = [...project().tracks];
    tracks[1] = makeTrack({ id: "tv2", clips: [short] });
    loadEditor(makeProject(tracks));
    const { unmount } = setup({ snap: { snapToClips: false, snapToPlayhead: false } });
    drag(screen.getByTestId("clip-c"), { x: 0 }, { x: px(9.9) });
    expect(clip("c").startTime).toBeCloseTo(9.9);
    unmount();

    loadEditor(makeProject(tracks));
    setup({ snap: { snapToClips: true, snapToPlayhead: false } });
    drag(screen.getByTestId("clip-c"), { x: 0 }, { x: px(9.9) });
    expect(clip("c").startTime).toBe(10);
  });
});

describe("Timeline trimming", () => {
  it("trims the start edge, moving the source in-point", () => {
    setup();
    drag(screen.getByTestId("trim-start-a"), { x: 0 }, { x: px(2) });
    expect(clip("a")).toMatchObject({ startTime: 2, sourceStart: 4, endTime: 10 });
    expect(useEditorStore.getState().history.at(-1)!.description).toBe("Trim clip");
  });

  it("trims the end edge and snaps to the neighbour", () => {
    setup();
    drag(screen.getByTestId("trim-end-b"), { x: 0 }, { x: px(-3) });
    expect(clip("b")).toMatchObject({ endTime: 17, sourceEnd: 7 });
    drag(screen.getByTestId("trim-end-a"), { x: 0 }, { x: px(-0.05) });
    expect(clip("a").endTime).toBe(10);
  });

  it("ignores non-primary buttons on trim handles", () => {
    setup();
    fireEvent.mouseDown(screen.getByTestId("trim-end-a"), { button: 2, clientX: 0 });
    fireEvent.mouseMove(window, { clientX: px(3) });
    fireEvent.mouseUp(window);
    expect(clip("a").endTime).toBe(10);
  });

  it("stops listening after unmount mid-drag", () => {
    const { unmount } = setup();
    fireEvent.mouseDown(screen.getByTestId("trim-end-a"), { button: 0, clientX: 0 });
    unmount();
    fireEvent.mouseMove(window, { clientX: px(3) });
    expect(clip("a").endTime).toBe(10);
  });

  it("a gesture whose clip disappears mid-drag is ignored", () => {
    setup();
    fireEvent.mouseDown(screen.getByTestId("trim-end-a"), { button: 0, clientX: 0 });
    act(() => useEditorStore.getState().removeClip("a"));
    fireEvent.mouseMove(window, { clientX: px(3) });
    fireEvent.mouseUp(window);
    expect(allClips().map((c) => c.id)).toEqual(["b"]);

    fireEvent.mouseDown(screen.getByTestId("clip-b"), { button: 0, clientX: 0 });
    act(() => useEditorStore.getState().closeProject());
    fireEvent.mouseMove(window, { clientX: px(3) });
    fireEvent.mouseUp(window);
    expect(useEditorStore.getState().project).toBeNull();
  });
});

describe("Timeline clip context menu", () => {
  it("passes the right-clicked clip id to every command", async () => {
    const { menu, user } = setup({ canPaste: true });
    act(() => {
      useEditorStore.getState().selectClip("a");
      useEditorStore.getState().seek(15);
    });
    const open = async () => {
      fireEvent.contextMenu(screen.getByTestId("clip-b"));
      return screen.findByRole("menu");
    };
    for (const [label, fn] of [
      [/Cut/, menu.cutClip],
      [/Copy/, menu.copyClip],
      [/Duplicate/, menu.duplicateClip],
      [/Split at Playhead/, menu.splitClip],
    ] as const) {
      await user.click(within(await open()).getByRole("menuitem", { name: label }));
      expect(fn).toHaveBeenLastCalledWith("b");
    }
    await user.click(within(await open()).getByRole("menuitem", { name: /Paste/ }));
    expect(menu.pasteClip).toHaveBeenCalledWith("tv");
    await user.click(within(await open()).getByRole("menuitem", { name: /Delete/ }));
    expect(menu.deleteClips).toHaveBeenCalledWith(["b"]);
  });

  it("disables paste without a clipboard and split when the playhead is outside", async () => {
    setup({ canPaste: false });
    fireEvent.contextMenu(screen.getByTestId("clip-b"));
    const menuEl = await screen.findByRole("menu");
    expect(within(menuEl).getByRole("menuitem", { name: /Paste/ })).toHaveAttribute(
      "data-disabled"
    );
    expect(within(menuEl).getByRole("menuitem", { name: /Split/ })).toHaveAttribute(
      "data-disabled"
    );
  });
});

describe("Timeline track headers", () => {
  it("reorders tracks with the arrow buttons", async () => {
    const { user } = setup();
    const [up] = screen.getAllByRole("button", { name: "Move track up" });
    expect(up).toBeDisabled();
    await user.click(screen.getAllByRole("button", { name: "Move track down" })[0]!);
    expect(currentProject().tracks.map((t) => t.id)).toEqual(["tv2", "tv", "ta"]);
    await user.click(screen.getAllByRole("button", { name: "Move track up" })[1]!);
    expect(currentProject().tracks.map((t) => t.id)).toEqual(["tv", "tv2", "ta"]);
    expect(screen.getAllByRole("button", { name: "Move track down" })[2]).toBeDisabled();
  });

  it("mute and lock toggles are undoable", async () => {
    const { user } = setup();
    const header = within(screen.getByTestId("track-header-tv"));
    await user.click(header.getByRole("button", { name: "Hide track" }));
    await user.click(header.getByRole("button", { name: "Lock track" }));
    expect(currentProject().tracks[0]).toMatchObject({ muted: true, locked: true });
    expect(header.getByRole("button", { name: "Show track" })).toBeInTheDocument();
    await user.click(header.getByRole("button", { name: "Unlock track" }));
    expect(currentProject().tracks[0]!.locked).toBe(false);
    act(() => useEditorStore.getState().undo());
    expect(currentProject().tracks[0]!.locked).toBe(true);
    act(() => useEditorStore.getState().undo());
    act(() => useEditorStore.getState().undo());
    expect(currentProject().tracks[0]!.muted).toBe(false);
  });

  it("track context menu toggles visibility/lock and duplicates with clips", async () => {
    const { user } = setup();
    const open = async () => {
      fireEvent.contextMenu(screen.getByTestId("track-header-tv"));
      return screen.findByRole("menu");
    };
    await user.click(within(await open()).getByRole("menuitem", { name: "Hide Track" }));
    await user.click(within(await open()).getByRole("menuitem", { name: "Show Track" }));
    await user.click(within(await open()).getByRole("menuitem", { name: "Lock Track" }));
    await user.click(within(await open()).getByRole("menuitem", { name: "Unlock Track" }));
    expect(currentProject().tracks[0]).toMatchObject({ muted: false, locked: false });

    await user.click(within(await open()).getByRole("menuitem", { name: "Duplicate Track" }));
    expect(currentProject().tracks[1]!.clips).toHaveLength(2);
    expect(toast.success).toHaveBeenCalledWith("Track duplicated");
  });

  it("asks before deleting a track and keeps it when declined", async () => {
    const backend = mockBackend({ "plugin:dialog|ask": () => false });
    const { user } = setup();
    fireEvent.contextMenu(screen.getByTestId("track-header-ta"));
    await user.click(
      within(await screen.findByRole("menu")).getByRole("menuitem", { name: /Delete Track/ })
    );
    await waitFor(() => expect(backend.callsTo("plugin:dialog|ask")).toHaveLength(1));
    expect(currentProject().tracks).toHaveLength(3);
  });

  it("never deletes the last track", async () => {
    loadEditor(makeProject([makeTrack({ id: "solo" })]));
    const { user } = setup();
    fireEvent.contextMenu(screen.getByTestId("track-header-solo"));
    const item = within(await screen.findByRole("menu")).getByRole("menuitem", {
      name: /Delete Track/,
    });
    expect(item).toHaveAttribute("data-disabled");
    await user.click(item);
    expect(currentProject().tracks).toHaveLength(1);
  });
});
