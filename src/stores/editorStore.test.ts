import { describe, it, expect, beforeEach } from "vitest";
import { useEditorStore } from "@/stores/editorStore";
import { type Clip } from "@/types/editor";

// Build the payload for addClip (everything except id + trackId).
function makeClipData(overrides: Partial<Omit<Clip, "id" | "trackId">> = {}): Omit<
  Clip,
  "id" | "trackId"
> {
  return {
    type: "video",
    name: "Clip",
    startTime: 0,
    endTime: 10,
    sourceStart: 0,
    sourceEnd: 10,
    sourcePath: "/tmp/source.mp4",
    thumbnails: [],
    properties: {
      volume: 1,
      opacity: 1,
      speed: 1,
      fadeIn: 0,
      fadeOut: 0,
      filters: [],
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    },
    ...overrides,
  };
}

// Returns the id of the first video track of the current project.
function videoTrackId(): string {
  const track = useEditorStore.getState().project!.tracks.find((t) => t.type === "video")!;
  return track.id;
}

function allClips(): Clip[] {
  return useEditorStore.getState().project!.tracks.flatMap((t) => t.clips);
}

function findClip(id: string): Clip | undefined {
  return allClips().find((c) => c.id === id);
}

beforeEach(() => {
  // Re-create a fresh project for each test (also resets history/selection).
  useEditorStore.getState().createProject("Test Project");
});

describe("addClip", () => {
  it("adds a clip to the track and updates duration", () => {
    const id = useEditorStore.getState().addClip(videoTrackId(), makeClipData({ endTime: 15 }));

    expect(findClip(id)).toBeDefined();
    expect(useEditorStore.getState().duration).toBe(15);
    expect(useEditorStore.getState().project!.duration).toBe(15);
  });
});

describe("moveClip", () => {
  it("moves a clip to a new track and start time, preserving its length", () => {
    const id = useEditorStore.getState().addClip(
      videoTrackId(),
      makeClipData({ startTime: 0, endTime: 10 })
    );
    const audioTrack = useEditorStore.getState().project!.tracks.find((t) => t.type === "audio")!;

    useEditorStore.getState().moveClip(id, audioTrack.id, 20);

    const moved = findClip(id)!;
    expect(moved.trackId).toBe(audioTrack.id);
    expect(moved.startTime).toBe(20);
    expect(moved.endTime).toBe(30); // length (10) preserved
  });

  it("is a no-op for an unknown clip id", () => {
    const before = JSON.stringify(useEditorStore.getState().project);
    useEditorStore.getState().moveClip("missing", videoTrackId(), 5);
    expect(JSON.stringify(useEditorStore.getState().project)).toBe(before);
  });
});

describe("splitClip", () => {
  it("splits a clip into two at the split time", () => {
    const id = useEditorStore.getState().addClip(
      videoTrackId(),
      makeClipData({ startTime: 0, endTime: 10, sourceStart: 0, sourceEnd: 10 })
    );

    useEditorStore.getState().splitClip(id, 4);

    const clips = useEditorStore.getState().project!.tracks.find((t) => t.type === "video")!.clips;
    expect(clips).toHaveLength(2);

    const first = clips.find((c) => c.id === id)!;
    const second = clips.find((c) => c.id !== id)!;

    expect(first.endTime).toBe(4);
    expect(first.sourceEnd).toBe(4); // linear source mapping
    expect(second.startTime).toBe(4);
    expect(second.endTime).toBe(10);
    expect(second.sourceStart).toBe(4);
    expect(second.name).toContain("(2)");
  });

  it("does nothing if the split time is outside the clip bounds", () => {
    const id = useEditorStore.getState().addClip(
      videoTrackId(),
      makeClipData({ startTime: 0, endTime: 10 })
    );
    useEditorStore.getState().splitClip(id, 50);
    const clips = useEditorStore.getState().project!.tracks.find((t) => t.type === "video")!.clips;
    expect(clips).toHaveLength(1);
  });
});

describe("duplicateClip", () => {
  it("creates a copy positioned right after the original", () => {
    const id = useEditorStore.getState().addClip(
      videoTrackId(),
      makeClipData({ startTime: 0, endTime: 10 })
    );

    const newId = useEditorStore.getState().duplicateClip(id);
    expect(newId).not.toBeNull();

    const copy = findClip(newId!)!;
    expect(copy.startTime).toBe(10);
    expect(copy.endTime).toBe(20); // original length (10) appended
    expect(copy.name).toContain("(copy)");
  });

  it("returns null for an unknown clip id", () => {
    expect(useEditorStore.getState().duplicateClip("missing")).toBeNull();
  });
});

describe("undo / redo", () => {
  it("undo restores the previous project state (clip list)", () => {
    // addClip #1 pushes history, addClip #2 pushes history again.
    const firstId = useEditorStore.getState().addClip(videoTrackId(), makeClipData());
    useEditorStore.getState().addClip(videoTrackId(), makeClipData({ name: "Second" }));

    expect(allClips()).toHaveLength(2);

    useEditorStore.getState().undo();

    const clipsAfterUndo = allClips();
    expect(clipsAfterUndo).toHaveLength(1);
    expect(clipsAfterUndo[0]?.id).toBe(firstId);
  });

  it("redo re-applies an undone change", () => {
    useEditorStore.getState().addClip(videoTrackId(), makeClipData());
    useEditorStore.getState().addClip(videoTrackId(), makeClipData({ name: "Second" }));

    useEditorStore.getState().undo();
    expect(allClips()).toHaveLength(1);

    useEditorStore.getState().redo();
    expect(allClips()).toHaveLength(2);
  });

  it("undo does nothing at the start of history", () => {
    useEditorStore.getState().addClip(videoTrackId(), makeClipData());
    const snapshot = JSON.stringify(useEditorStore.getState().project);

    // historyIndex is 0 after a single push; undo requires index > 0.
    useEditorStore.getState().undo();
    expect(JSON.stringify(useEditorStore.getState().project)).toBe(snapshot);
  });

  // KNOWN BUG: undo()/redo() restore `project` (which carries project.duration)
  // but never write the top-level `duration` slice of the store. So after an
  // undo, store.duration is stale and disagrees with store.project.duration.
  // This test DOCUMENTS the current (buggy) behavior so the suite stays green.
  it("undo leaves the top-level store.duration stale (documents known bug)", () => {
    useEditorStore.getState().addClip(videoTrackId(), makeClipData({ endTime: 10 }));
    useEditorStore.getState().addClip(videoTrackId(), makeClipData({ endTime: 30 }));

    expect(useEditorStore.getState().duration).toBe(30);

    useEditorStore.getState().undo();

    // project.duration correctly reverts...
    expect(useEditorStore.getState().project!.duration).toBe(10);
    // ...but the top-level store.duration is NOT restored (still 30).
    expect(useEditorStore.getState().duration).toBe(30);
  });

  // KNOWN BUG (correct behavior, intentionally failing):
  // undo() SHOULD also restore the top-level store.duration to match the
  // restored project. When the bug is fixed, remove the `.fails` marker.
  it.fails("undo should restore top-level store.duration (correct behavior)", () => {
    useEditorStore.getState().addClip(videoTrackId(), makeClipData({ endTime: 10 }));
    useEditorStore.getState().addClip(videoTrackId(), makeClipData({ endTime: 30 }));

    useEditorStore.getState().undo();

    expect(useEditorStore.getState().duration).toBe(
      useEditorStore.getState().project!.duration
    );
  });
});

describe("selection", () => {
  it("selectClip replaces selection by default", () => {
    useEditorStore.getState().selectClip("a");
    useEditorStore.getState().selectClip("b");
    expect(useEditorStore.getState().selectedClipIds).toEqual(["b"]);
  });

  it("selectClip can add to selection", () => {
    useEditorStore.getState().selectClip("a");
    useEditorStore.getState().selectClip("b", true);
    expect(useEditorStore.getState().selectedClipIds).toEqual(["a", "b"]);
  });

  it("deleteSelected removes all selected clips", () => {
    const id1 = useEditorStore.getState().addClip(videoTrackId(), makeClipData());
    const id2 = useEditorStore.getState().addClip(videoTrackId(), makeClipData());
    useEditorStore.getState().selectClip(id1);
    useEditorStore.getState().selectClip(id2, true);

    useEditorStore.getState().deleteSelected();
    expect(allClips()).toHaveLength(0);
  });
});

describe("playback bounds", () => {
  it("seek clamps to [0, duration]", () => {
    useEditorStore.getState().addClip(videoTrackId(), makeClipData({ endTime: 10 }));
    useEditorStore.getState().seek(999);
    expect(useEditorStore.getState().currentTime).toBe(10);
    useEditorStore.getState().seek(-5);
    expect(useEditorStore.getState().currentTime).toBe(0);
  });

  it("setVolume clamps to [0, 1] and unmutes", () => {
    useEditorStore.getState().setVolume(5);
    expect(useEditorStore.getState().volume).toBe(1);
    expect(useEditorStore.getState().isMuted).toBe(false);
    useEditorStore.getState().setVolume(-1);
    expect(useEditorStore.getState().volume).toBe(0);
  });

  it("setZoom clamps to [0.1, 10]", () => {
    useEditorStore.getState().setZoom(100);
    expect(useEditorStore.getState().zoom).toBe(10);
    useEditorStore.getState().setZoom(0);
    expect(useEditorStore.getState().zoom).toBe(0.1);
  });
});
