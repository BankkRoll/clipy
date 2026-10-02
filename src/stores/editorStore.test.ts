import { describe, it, expect, beforeEach } from "vitest";
import { useEditorStore, getInitialEditorState, MAX_HISTORY } from "@/stores/editorStore";
import { type Clip } from "@/types/editor";

// Build the payload for addClip (everything except id + trackId).
function makeClipData(
  overrides: Partial<Omit<Clip, "id" | "trackId">> = {}
): Omit<Clip, "id" | "trackId"> {
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
    const id = useEditorStore
      .getState()
      .addClip(videoTrackId(), makeClipData({ startTime: 0, endTime: 10 }));
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
    const id = useEditorStore
      .getState()
      .addClip(
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
    const id = useEditorStore
      .getState()
      .addClip(videoTrackId(), makeClipData({ startTime: 0, endTime: 10 }));
    useEditorStore.getState().splitClip(id, 50);
    const clips = useEditorStore.getState().project!.tracks.find((t) => t.type === "video")!.clips;
    expect(clips).toHaveLength(1);
  });
});

describe("duplicateClip", () => {
  it("creates a copy positioned right after the original", () => {
    const id = useEditorStore
      .getState()
      .addClip(videoTrackId(), makeClipData({ startTime: 0, endTime: 10 }));

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

  it("undo can return to the freshly created project, then stops", () => {
    const initial = JSON.stringify(useEditorStore.getState().project);
    useEditorStore.getState().addClip(videoTrackId(), makeClipData());

    useEditorStore.getState().undo();
    expect(JSON.stringify(useEditorStore.getState().project)).toBe(initial);
    expect(useEditorStore.getState().historyIndex).toBe(0);

    useEditorStore.getState().undo();
    expect(JSON.stringify(useEditorStore.getState().project)).toBe(initial);
    expect(useEditorStore.getState().historyIndex).toBe(0);
  });

  // FIXED: undo()/redo() now restore the top-level `duration` slice in sync with
  // the restored project (previously it stayed stale).
  it("undo restores the top-level store.duration in sync with the project", () => {
    useEditorStore.getState().addClip(videoTrackId(), makeClipData({ endTime: 10 }));
    useEditorStore.getState().addClip(videoTrackId(), makeClipData({ endTime: 30 }));

    expect(useEditorStore.getState().duration).toBe(30);

    useEditorStore.getState().undo();

    // Both project.duration and the top-level store.duration revert together.
    expect(useEditorStore.getState().project!.duration).toBe(10);
    expect(useEditorStore.getState().duration).toBe(10);
    expect(useEditorStore.getState().duration).toBe(useEditorStore.getState().project!.duration);
  });

  it("redo restores the top-level store.duration too", () => {
    useEditorStore.getState().addClip(videoTrackId(), makeClipData({ endTime: 10 }));
    useEditorStore.getState().addClip(videoTrackId(), makeClipData({ endTime: 30 }));

    useEditorStore.getState().undo();
    expect(useEditorStore.getState().duration).toBe(10);

    useEditorStore.getState().redo();
    expect(useEditorStore.getState().duration).toBe(30);
    expect(useEditorStore.getState().duration).toBe(useEditorStore.getState().project!.duration);
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

describe("history baseline and deduplication", () => {
  it("createProject and loadProject record a baseline snapshot", () => {
    const s = useEditorStore.getState();
    expect(s.history).toHaveLength(1);
    expect(s.historyIndex).toBe(0);

    const loaded = { ...s.project!, id: "loaded", duration: 12 };
    s.loadProject(loaded);
    expect(useEditorStore.getState().history).toHaveLength(1);
    expect(useEditorStore.getState().history[0]!.state.id).toBe("loaded");
    expect(useEditorStore.getState().duration).toBe(12);
  });

  it("createProject resets the top-level duration", () => {
    useEditorStore.getState().addClip(videoTrackId(), makeClipData({ endTime: 40 }));
    useEditorStore.getState().createProject("Fresh");
    expect(useEditorStore.getState().duration).toBe(0);
  });

  it("deleteSelected of several clips is a single undo step", () => {
    const id1 = useEditorStore.getState().addClip(videoTrackId(), makeClipData());
    const id2 = useEditorStore.getState().addClip(videoTrackId(), makeClipData());
    useEditorStore.getState().selectClip(id1);
    useEditorStore.getState().selectClip(id2, true);
    const before = useEditorStore.getState().historyIndex;

    useEditorStore.getState().deleteSelected();
    expect(useEditorStore.getState().historyIndex).toBe(before + 1);
    expect(useEditorStore.getState().selectedClipIds).toEqual([]);

    useEditorStore.getState().undo();
    expect(allClips()).toHaveLength(2);
  });

  it("removeClips ignores an empty list and clamps the playhead", () => {
    const id = useEditorStore.getState().addClip(videoTrackId(), makeClipData({ endTime: 20 }));
    const before = useEditorStore.getState().historyIndex;
    useEditorStore.getState().removeClips([]);
    expect(useEditorStore.getState().historyIndex).toBe(before);

    useEditorStore.getState().seek(15);
    useEditorStore.getState().removeClip(id);
    expect(useEditorStore.getState().currentTime).toBe(0);
    expect(useEditorStore.getState().history.at(-1)!.description).toBe("Remove clip");
  });

  it("batch collapses nested changes into one entry and returns the result", () => {
    const before = useEditorStore.getState().historyIndex;
    const result = useEditorStore.getState().batch("Many", () => {
      useEditorStore.getState().addClip(videoTrackId(), makeClipData());
      useEditorStore.getState().batch("Inner", () => {
        useEditorStore.getState().addClip(videoTrackId(), makeClipData());
      });
      return 42;
    });
    expect(result).toBe(42);
    expect(useEditorStore.getState().historyIndex).toBe(before + 1);
    expect(useEditorStore.getState().history.at(-1)!.description).toBe("Many");
  });

  it("batch still records history when the callback throws", () => {
    expect(() =>
      useEditorStore.getState().batch("Boom", () => {
        useEditorStore.getState().addClip(videoTrackId(), makeClipData());
        throw new Error("fail");
      })
    ).toThrow("fail");
    expect(useEditorStore.getState().history.at(-1)!.description).toBe("Boom");
    useEditorStore.getState().addClip(videoTrackId(), makeClipData());
    expect(useEditorStore.getState().history.at(-1)!.description).toBe("Add clip");
  });

  it("commitHistory without an actual change adds no entry", () => {
    const before = useEditorStore.getState().historyIndex;
    useEditorStore.getState().commitHistory("Rename clip");
    expect(useEditorStore.getState().historyIndex).toBe(before);
  });

  it("splitClip is one undo step", () => {
    const id = useEditorStore.getState().addClip(videoTrackId(), makeClipData());
    const before = useEditorStore.getState().historyIndex;
    useEditorStore.getState().splitClip(id, 5);
    expect(useEditorStore.getState().historyIndex).toBe(before + 1);
    useEditorStore.getState().undo();
    expect(allClips()).toHaveLength(1);
    expect(allClips()[0]!.endTime).toBe(10);
  });

  it("caps history length", () => {
    for (let i = 0; i < 60; i++) {
      useEditorStore.getState().addClip(videoTrackId(), makeClipData({ endTime: i + 1 }));
    }
    expect(useEditorStore.getState().history).toHaveLength(MAX_HISTORY);
    expect(useEditorStore.getState().historyIndex).toBe(MAX_HISTORY - 1);
  });

  it("clearHistory keeps the current project as the new baseline", () => {
    useEditorStore.getState().addClip(videoTrackId(), makeClipData());
    useEditorStore.getState().clearHistory();
    expect(useEditorStore.getState().history).toHaveLength(1);
    expect(useEditorStore.getState().historyIndex).toBe(0);

    useEditorStore.getState().closeProject();
    useEditorStore.getState().clearHistory();
    expect(useEditorStore.getState().history).toEqual([]);
    expect(useEditorStore.getState().historyIndex).toBe(-1);
  });

  it("undo drops selection of clips and tracks that no longer exist", () => {
    const id = useEditorStore.getState().addClip(videoTrackId(), makeClipData());
    useEditorStore.getState().selectClip(id);
    useEditorStore.getState().selectTrack(videoTrackId());
    useEditorStore.getState().undo();
    expect(useEditorStore.getState().selectedClipIds).toEqual([]);
    expect(useEditorStore.getState().selectedTrackId).toBe(videoTrackId());

    const trackId = useEditorStore.getState().addTrack("text");
    useEditorStore.getState().selectTrack(trackId);
    useEditorStore.getState().undo();
    expect(useEditorStore.getState().selectedTrackId).toBeNull();
  });

  it("redo does nothing at the end of history", () => {
    useEditorStore.getState().addClip(videoTrackId(), makeClipData());
    const index = useEditorStore.getState().historyIndex;
    useEditorStore.getState().redo();
    expect(useEditorStore.getState().historyIndex).toBe(index);
  });
});

describe("tracks", () => {
  it("updateTrack (mute/lock) is undoable", () => {
    const id = videoTrackId();
    useEditorStore.getState().updateTrack(id, { muted: true });
    useEditorStore.getState().updateTrack(id, { locked: true });
    useEditorStore.getState().undo();
    const track = () => useEditorStore.getState().project!.tracks.find((t) => t.id === id)!;
    expect(track().locked).toBe(false);
    expect(track().muted).toBe(true);
    useEditorStore.getState().undo();
    expect(track().muted).toBe(false);
  });

  it("duplicateTrack copies clips with new ids right after the source", () => {
    const source = videoTrackId();
    const clipId = useEditorStore.getState().addClip(source, makeClipData({ name: "A" }));
    const copyId = useEditorStore.getState().duplicateTrack(source)!;

    const tracks = useEditorStore.getState().project!.tracks;
    expect(tracks[1]!.id).toBe(copyId);
    expect(tracks[1]!.name).toBe("Video 1 (copy)");
    expect(tracks[1]!.clips).toHaveLength(1);
    const copied = tracks[1]!.clips[0]!;
    expect(copied.id).not.toBe(clipId);
    expect(copied.trackId).toBe(copyId);
    expect(copied.name).toBe("A");
    expect(copied.properties).not.toBe(tracks[0]!.clips[0]!.properties);

    useEditorStore.getState().undo();
    expect(useEditorStore.getState().project!.tracks).toHaveLength(2);
    expect(useEditorStore.getState().duplicateTrack("missing")).toBeNull();
  });

  it("removeTrack drops its clips from the selection and duration", () => {
    const id = useEditorStore.getState().addClip(videoTrackId(), makeClipData({ endTime: 30 }));
    useEditorStore.getState().selectClip(id);
    useEditorStore.getState().selectTrack(videoTrackId());
    useEditorStore.getState().removeTrack(videoTrackId());
    const s = useEditorStore.getState();
    expect(s.selectedClipIds).toEqual([]);
    expect(s.selectedTrackId).toBeNull();
    expect(s.duration).toBe(0);
  });

  it("removeTrack keeps an unrelated selected track", () => {
    const audio = useEditorStore.getState().project!.tracks[1]!.id;
    useEditorStore.getState().selectTrack(audio);
    useEditorStore.getState().removeTrack(videoTrackId());
    expect(useEditorStore.getState().selectedTrackId).toBe(audio);
  });

  it("reorderTracks moves a track and ignores an invalid index", () => {
    const [a, b] = useEditorStore.getState().project!.tracks;
    useEditorStore.getState().reorderTracks(0, 1);
    expect(useEditorStore.getState().project!.tracks.map((t) => t.id)).toEqual([b!.id, a!.id]);
    useEditorStore.getState().reorderTracks(9, 0);
    expect(useEditorStore.getState().project!.tracks).toHaveLength(2);
  });

  it("addTrack numbers tracks per type", () => {
    useEditorStore.getState().addTrack("video");
    useEditorStore.getState().addTrack("effect");
    const names = useEditorStore.getState().project!.tracks.map((t) => t.name);
    expect(names).toEqual(["Video 1", "Audio 1", "Video 2", "Effect 1"]);
  });
});

describe("misc actions", () => {
  it("selectClip with addToSelection does not duplicate ids; deselect/clear work", () => {
    useEditorStore.getState().selectClip("a");
    useEditorStore.getState().selectClip("a", true);
    expect(useEditorStore.getState().selectedClipIds).toEqual(["a"]);
    useEditorStore.getState().deselectClip("a");
    expect(useEditorStore.getState().selectedClipIds).toEqual([]);
    useEditorStore.getState().selectClip("b");
    useEditorStore.getState().clearSelection();
    expect(useEditorStore.getState().selectedClipIds).toEqual([]);
  });

  it("project lifecycle: rename, save marks clean, close clears", () => {
    useEditorStore.getState().setProjectName("Renamed");
    expect(useEditorStore.getState().isDirty).toBe(true);
    const saved = useEditorStore.getState().saveProject();
    expect(saved!.name).toBe("Renamed");
    expect(useEditorStore.getState().isDirty).toBe(false);
    useEditorStore.getState().closeProject();
    expect(useEditorStore.getState().project).toBeNull();
    expect(useEditorStore.getState().saveProject()).toBeNull();
    useEditorStore.getState().setProjectName("x");
    expect(useEditorStore.getState().project).toBeNull();
  });

  it("track and clip actions are no-ops without a project", () => {
    useEditorStore.getState().closeProject();
    const s = useEditorStore.getState();
    s.addTrack("video");
    s.removeTrack("x");
    s.updateTrack("x", { muted: true });
    s.reorderTracks(0, 1);
    s.addClip("x", makeClipData());
    s.removeClip("x");
    s.updateClip("x", { name: "y" });
    s.moveClip("x", "y", 1);
    s.splitClip("x", 1);
    s.pushHistory("nothing");
    expect(s.duplicateClip("x")).toBeNull();
    expect(useEditorStore.getState().project).toBeNull();
    expect(useEditorStore.getState().history).toEqual([]);
  });

  it("playback and view controls", () => {
    useEditorStore.getState().addClip(videoTrackId(), makeClipData({ endTime: 10 }));
    const s = useEditorStore.getState();
    s.play();
    expect(useEditorStore.getState().isPlaying).toBe(true);
    s.pause();
    s.togglePlay();
    expect(useEditorStore.getState().isPlaying).toBe(true);
    s.seekRelative(4);
    s.seekRelative(100);
    expect(useEditorStore.getState().currentTime).toBe(10);
    s.seekRelative(-100);
    expect(useEditorStore.getState().currentTime).toBe(0);
    s.toggleMute();
    expect(useEditorStore.getState().isMuted).toBe(true);
    s.zoomIn();
    expect(useEditorStore.getState().zoom).toBeCloseTo(1.2);
    s.zoomOut();
    s.zoomOut();
    expect(useEditorStore.getState().zoom).toBeCloseTo(1 / 1.2);
    s.setScrollX(-5);
    expect(useEditorStore.getState().scrollX).toBe(0);
    s.setScrollX(40);
    s.fitToView();
    expect(useEditorStore.getState()).toMatchObject({ zoom: 1, scrollX: 0 });
  });

  it("export progress bookkeeping", () => {
    const s = useEditorStore.getState();
    s.startExport({} as never);
    expect(useEditorStore.getState().isExporting).toBe(true);
    s.updateExportProgress(40);
    expect(useEditorStore.getState().exportProgress).toBe(40);
    s.cancelExport();
    expect(useEditorStore.getState()).toMatchObject({ isExporting: false, exportProgress: 0 });
  });

  it("splitClip ignores unknown clips", () => {
    useEditorStore.getState().addClip(videoTrackId(), makeClipData());
    useEditorStore.getState().splitClip("missing", 5);
    expect(allClips()).toHaveLength(1);
  });

  it("getInitialEditorState resets everything", () => {
    useEditorStore.setState(getInitialEditorState());
    expect(useEditorStore.getState()).toMatchObject({
      project: null,
      history: [],
      historyIndex: -1,
    });
  });
});
