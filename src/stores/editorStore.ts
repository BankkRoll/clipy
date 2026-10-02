/**
 * Editor store: the single source of truth for the open project, playback,
 * timeline view state, selection and undo history.
 *
 * History model: `history[historyIndex]` is always a snapshot of the current
 * project. Creating or loading a project records a baseline snapshot at index
 * 0, so undo can always return to the untouched project. Compound operations
 * run inside {@link EditorState.batch} so they produce exactly one undo step.
 */
import { create } from "zustand";
import {
  type EditorProject,
  type Track,
  type Clip,
  type HistoryEntry,
  type ExportSettings,
} from "@/types/editor";
import { generateId } from "@/lib/utils";

/** Maximum number of undo snapshots kept in memory. */
export const MAX_HISTORY = 50;

/** Shape of the editor store: state slices plus the actions that mutate them. */
export interface EditorState {
  // Project state
  project: EditorProject | null;
  isLoading: boolean;
  isDirty: boolean;

  // Playback state
  currentTime: number;
  isPlaying: boolean;
  duration: number;
  volume: number;
  isMuted: boolean;

  // Timeline state
  zoom: number;
  scrollX: number;
  selectedClipIds: string[];
  selectedTrackId: string | null;

  // History
  history: HistoryEntry[];
  historyIndex: number;

  // Export
  isExporting: boolean;
  exportProgress: number;

  // Project actions
  createProject: (name: string) => void;
  loadProject: (project: EditorProject) => void;
  saveProject: () => EditorProject | null;
  closeProject: () => void;
  setProjectName: (name: string) => void;

  // Track actions
  addTrack: (type: Track["type"]) => string;
  removeTrack: (trackId: string) => void;
  updateTrack: (trackId: string, updates: Partial<Track>) => void;
  reorderTracks: (fromIndex: number, toIndex: number) => void;
  duplicateTrack: (trackId: string) => string | null;

  // Clip actions
  addClip: (trackId: string, clip: Omit<Clip, "id" | "trackId">) => string;
  removeClip: (clipId: string) => void;
  removeClips: (clipIds: string[]) => void;
  updateClip: (clipId: string, updates: Partial<Clip>) => void;
  moveClip: (clipId: string, newTrackId: string, newStartTime: number) => void;
  splitClip: (clipId: string, splitTime: number) => void;
  duplicateClip: (clipId: string) => string | null;

  // Selection actions
  selectClip: (clipId: string, addToSelection?: boolean) => void;
  deselectClip: (clipId: string) => void;
  clearSelection: () => void;
  selectTrack: (trackId: string | null) => void;
  deleteSelected: () => void;

  // Playback actions
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  seek: (time: number) => void;
  seekRelative: (delta: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;

  // Timeline actions
  setZoom: (zoom: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  setScrollX: (scrollX: number) => void;
  fitToView: () => void;

  // History actions
  undo: () => void;
  redo: () => void;
  pushHistory: (description: string) => void;
  commitHistory: (description: string) => void;
  clearHistory: () => void;
  /**
   * Run `fn` with history recording suspended, then record a single entry.
   * Nested batches collapse into the outermost one.
   */
  batch: <T>(description: string, fn: () => T) => T;

  // Export actions
  startExport: (settings: ExportSettings) => void;
  updateExportProgress: (progress: number) => void;
  cancelExport: () => void;
}

/** The data (non-action) part of {@link EditorState}. */
export type EditorDataState = Pick<
  EditorState,
  | "project"
  | "isLoading"
  | "isDirty"
  | "currentTime"
  | "isPlaying"
  | "duration"
  | "volume"
  | "isMuted"
  | "zoom"
  | "scrollX"
  | "selectedClipIds"
  | "selectedTrackId"
  | "history"
  | "historyIndex"
  | "isExporting"
  | "exportProgress"
>;

/**
 * Fresh data state for the editor store, used on startup and to reset the
 * store between tests.
 *
 * @returns A new object each call, safe to pass to `setState`.
 * @example
 * useEditorStore.setState(getInitialEditorState());
 */
export function getInitialEditorState(): EditorDataState {
  return {
    project: null,
    isLoading: false,
    isDirty: false,
    currentTime: 0,
    isPlaying: false,
    duration: 0,
    volume: 1,
    isMuted: false,
    zoom: 1,
    scrollX: 0,
    selectedClipIds: [],
    selectedTrackId: null,
    history: [],
    historyIndex: -1,
    isExporting: false,
    exportProgress: 0,
  };
}

const createDefaultProject = (name: string): EditorProject => ({
  id: generateId(),
  name,
  createdAt: new Date().toISOString(),
  modifiedAt: new Date().toISOString(),
  duration: 0,
  tracks: [
    {
      id: generateId(),
      type: "video",
      name: "Video 1",
      clips: [],
      muted: false,
      locked: false,
      volume: 1,
      height: 64,
    },
    {
      id: generateId(),
      type: "audio",
      name: "Audio 1",
      clips: [],
      muted: false,
      locked: false,
      volume: 1,
      height: 48,
    },
  ],
  settings: {
    width: 1920,
    height: 1080,
    fps: 30,
    sampleRate: 48000,
  },
});

const snapshot = (project: EditorProject, description: string): HistoryEntry => ({
  id: generateId(),
  type: "edit",
  description,
  timestamp: Date.now(),
  state: JSON.parse(JSON.stringify(project)) as EditorProject,
});

const projectDuration = (tracks: Track[]): number =>
  Math.max(...tracks.flatMap((t) => t.clips.map((c) => c.endTime)), 0);

// Depth of nested `batch` calls; while > 0, pushHistory is a no-op so the
// outermost batch can record one entry for the whole compound operation.
let historyBatchDepth = 0;

/** Global editor store hook. */
export const useEditorStore = create<EditorState>((set, get) => ({
  ...getInitialEditorState(),

  // Project actions
  createProject: (name) => {
    const project = createDefaultProject(name);
    set({
      project,
      isDirty: false,
      currentTime: 0,
      isPlaying: false,
      duration: 0,
      zoom: 1,
      scrollX: 0,
      selectedClipIds: [],
      selectedTrackId: null,
      history: [snapshot(project, "New project")],
      historyIndex: 0,
    });
  },

  loadProject: (project) => {
    set({
      project,
      isDirty: false,
      currentTime: 0,
      isPlaying: false,
      duration: project.duration,
      selectedClipIds: [],
      selectedTrackId: null,
      history: [snapshot(project, "Open project")],
      historyIndex: 0,
    });
  },

  saveProject: () => {
    const { project } = get();
    if (project) {
      const updated = {
        ...project,
        modifiedAt: new Date().toISOString(),
      };
      set({ project: updated, isDirty: false });
      return updated;
    }
    return null;
  },

  closeProject: () => {
    set({
      project: null,
      isDirty: false,
      currentTime: 0,
      isPlaying: false,
      duration: 0,
      selectedClipIds: [],
      selectedTrackId: null,
      history: [],
      historyIndex: -1,
    });
  },

  setProjectName: (name) => {
    set((state) => ({
      project: state.project ? { ...state.project, name } : null,
      isDirty: true,
    }));
  },

  // Track actions
  addTrack: (type) => {
    const trackId = generateId();
    const trackNames: Record<Track["type"], string> = {
      video: "Video",
      audio: "Audio",
      text: "Text",
      effect: "Effect",
    };

    set((state) => {
      if (!state.project) return state;

      const tracksOfType = state.project.tracks.filter((t) => t.type === type);
      const newTrack: Track = {
        id: trackId,
        type,
        name: `${trackNames[type]} ${tracksOfType.length + 1}`,
        clips: [],
        muted: false,
        locked: false,
        volume: 1,
        height: type === "video" ? 64 : 48,
      };

      return {
        project: {
          ...state.project,
          tracks: [...state.project.tracks, newTrack],
        },
        isDirty: true,
      };
    });

    get().pushHistory(`Add ${type} track`);
    return trackId;
  },

  removeTrack: (trackId) => {
    set((state) => {
      if (!state.project) return state;

      const removedIds = new Set(
        state.project.tracks.find((t) => t.id === trackId)?.clips.map((c) => c.id) ?? []
      );
      const tracks = state.project.tracks.filter((t) => t.id !== trackId);
      const duration = projectDuration(tracks);

      return {
        project: { ...state.project, tracks, duration },
        duration,
        isDirty: true,
        selectedTrackId: state.selectedTrackId === trackId ? null : state.selectedTrackId,
        selectedClipIds: state.selectedClipIds.filter((id) => !removedIds.has(id)),
      };
    });

    get().pushHistory("Remove track");
  },

  updateTrack: (trackId, updates) => {
    set((state) => {
      if (!state.project) return state;

      return {
        project: {
          ...state.project,
          tracks: state.project.tracks.map((t) => (t.id === trackId ? { ...t, ...updates } : t)),
        },
        isDirty: true,
      };
    });

    get().pushHistory("Update track");
  },

  reorderTracks: (fromIndex, toIndex) => {
    set((state) => {
      if (!state.project) return state;

      const tracks = [...state.project.tracks];
      const [removed] = tracks.splice(fromIndex, 1);
      if (removed) {
        tracks.splice(toIndex, 0, removed);
      }

      return {
        project: { ...state.project, tracks },
        isDirty: true,
      };
    });

    get().pushHistory("Reorder tracks");
  },

  duplicateTrack: (trackId) => {
    const project = get().project;
    const index = project ? project.tracks.findIndex((t) => t.id === trackId) : -1;
    if (!project || index < 0) return null;
    const source = project.tracks[index]!;

    const newTrackId = generateId();
    const copy: Track = {
      ...JSON.parse(JSON.stringify(source)),
      id: newTrackId,
      name: `${source.name} (copy)`,
      clips: source.clips.map((c) => ({
        ...(JSON.parse(JSON.stringify(c)) as Clip),
        id: generateId(),
        trackId: newTrackId,
      })),
    };

    const tracks = [...project.tracks];
    tracks.splice(index + 1, 0, copy);
    set({ project: { ...project, tracks }, isDirty: true });

    get().pushHistory("Duplicate track");
    return newTrackId;
  },

  // Clip actions
  addClip: (trackId, clipData) => {
    const clipId = generateId();

    set((state) => {
      if (!state.project) return state;

      const clip: Clip = {
        ...clipData,
        id: clipId,
        trackId,
      };

      const tracks = state.project.tracks.map((t) =>
        t.id === trackId ? { ...t, clips: [...t.clips, clip] } : t
      );
      const duration = projectDuration(tracks);

      return {
        project: { ...state.project, tracks, duration },
        duration,
        isDirty: true,
      };
    });

    get().pushHistory("Add clip");
    return clipId;
  },

  removeClip: (clipId) => {
    get().removeClips([clipId]);
  },

  removeClips: (clipIds) => {
    if (clipIds.length === 0) return;
    const ids = new Set(clipIds);

    set((state) => {
      if (!state.project) return state;

      const tracks = state.project.tracks.map((t) => ({
        ...t,
        clips: t.clips.filter((c) => !ids.has(c.id)),
      }));
      const duration = projectDuration(tracks);

      return {
        project: { ...state.project, tracks, duration },
        duration,
        currentTime: Math.min(state.currentTime, duration),
        isDirty: true,
        selectedClipIds: state.selectedClipIds.filter((id) => !ids.has(id)),
      };
    });

    get().pushHistory(clipIds.length === 1 ? "Remove clip" : "Remove clips");
  },

  updateClip: (clipId, updates) => {
    set((state) => {
      if (!state.project) return state;

      const tracks = state.project.tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) => (c.id === clipId ? { ...c, ...updates } : c)),
      }));
      const duration = projectDuration(tracks);

      return {
        project: { ...state.project, tracks, duration },
        duration,
        isDirty: true,
      };
    });
  },

  moveClip: (clipId, newTrackId, newStartTime) => {
    set((state) => {
      if (!state.project) return state;

      let movedClip: Clip | null = null;

      const tracksWithRemoval = state.project.tracks.map((t) => {
        const clip = t.clips.find((c) => c.id === clipId);
        if (clip) {
          movedClip = {
            ...clip,
            trackId: newTrackId,
            startTime: newStartTime,
            endTime: newStartTime + (clip.endTime - clip.startTime),
          };
        }
        return {
          ...t,
          clips: t.clips.filter((c) => c.id !== clipId),
        };
      });

      if (!movedClip) return state;

      const tracks = tracksWithRemoval.map((t) =>
        t.id === newTrackId ? { ...t, clips: [...t.clips, movedClip!] } : t
      );
      const duration = projectDuration(tracks);

      return {
        project: { ...state.project, tracks, duration },
        duration,
        isDirty: true,
      };
    });

    get().pushHistory("Move clip");
  },

  splitClip: (clipId, splitTime) => {
    const state = get();
    if (!state.project) return;

    let foundClip: Clip | null = null;
    let foundTrackId: string | null = null;

    for (const track of state.project.tracks) {
      const clip = track.clips.find((c) => c.id === clipId);
      if (clip && splitTime > clip.startTime && splitTime < clip.endTime) {
        foundClip = clip;
        foundTrackId = track.id;
        break;
      }
    }

    if (!foundClip || !foundTrackId) return;
    const original = foundClip;
    const trackId = foundTrackId;

    const sourceProgress =
      (splitTime - original.startTime) / (original.endTime - original.startTime);
    const sourceSplitTime =
      original.sourceStart + sourceProgress * (original.sourceEnd - original.sourceStart);

    const secondClip: Omit<Clip, "id" | "trackId"> = {
      ...original,
      name: `${original.name} (2)`,
      startTime: splitTime,
      sourceStart: sourceSplitTime,
    };

    get().batch("Split clip", () => {
      get().updateClip(clipId, { endTime: splitTime, sourceEnd: sourceSplitTime });
      get().addClip(trackId, secondClip);
    });
  },

  duplicateClip: (clipId) => {
    const state = get();
    if (!state.project) return null;

    for (const track of state.project.tracks) {
      const clip = track.clips.find((c) => c.id === clipId);
      if (clip) {
        const duration = clip.endTime - clip.startTime;
        const newClip: Omit<Clip, "id" | "trackId"> = {
          ...clip,
          name: `${clip.name} (copy)`,
          startTime: clip.endTime,
          endTime: clip.endTime + duration,
        };
        return get().addClip(track.id, newClip);
      }
    }

    return null;
  },

  // Selection actions
  selectClip: (clipId, addToSelection = false) => {
    set((state) => ({
      selectedClipIds: addToSelection
        ? state.selectedClipIds.includes(clipId)
          ? state.selectedClipIds
          : [...state.selectedClipIds, clipId]
        : [clipId],
    }));
  },

  deselectClip: (clipId) => {
    set((state) => ({
      selectedClipIds: state.selectedClipIds.filter((id) => id !== clipId),
    }));
  },

  clearSelection: () => {
    set({ selectedClipIds: [] });
  },

  selectTrack: (trackId) => {
    set({ selectedTrackId: trackId });
  },

  deleteSelected: () => {
    const { selectedClipIds, removeClips } = get();
    removeClips(selectedClipIds);
  },

  // Playback actions
  play: () => set({ isPlaying: true }),
  pause: () => set({ isPlaying: false }),
  togglePlay: () => set((state) => ({ isPlaying: !state.isPlaying })),

  seek: (time) => {
    const { duration } = get();
    set({ currentTime: Math.max(0, Math.min(time, duration)) });
  },

  seekRelative: (delta) => {
    const { currentTime, duration } = get();
    set({ currentTime: Math.max(0, Math.min(currentTime + delta, duration)) });
  },

  setVolume: (volume) => {
    set({ volume: Math.max(0, Math.min(1, volume)), isMuted: false });
  },

  toggleMute: () => set((state) => ({ isMuted: !state.isMuted })),

  // Timeline actions
  setZoom: (zoom) => {
    set({ zoom: Math.max(0.1, Math.min(10, zoom)) });
  },

  zoomIn: () => {
    set((state) => ({ zoom: Math.min(10, state.zoom * 1.2) }));
  },

  zoomOut: () => {
    set((state) => ({ zoom: Math.max(0.1, state.zoom / 1.2) }));
  },

  setScrollX: (scrollX) => {
    set({ scrollX: Math.max(0, scrollX) });
  },

  fitToView: () => {
    set({ zoom: 1, scrollX: 0 });
  },

  // History actions
  undo: () => {
    const { history, historyIndex } = get();
    const entry = history[historyIndex - 1];
    if (historyIndex > 0 && entry) {
      restore(entry, historyIndex - 1);
    }
  },

  redo: () => {
    const { history, historyIndex } = get();
    const entry = history[historyIndex + 1];
    if (entry) {
      restore(entry, historyIndex + 1);
    }
  },

  // Call at the END of a continuous interaction (drag, slider release, blur)
  // so the many intermediate updateClip() calls collapse into one undo step.
  commitHistory: (description) => {
    get().pushHistory(description);
  },

  pushHistory: (description) => {
    if (historyBatchDepth > 0) return;
    const { project, history, historyIndex } = get();
    if (!project) return;

    const entry = snapshot(project, description);
    // Commits fired on blur/slider-release without an actual change would
    // otherwise create undo steps that do nothing.
    const current = history[historyIndex];
    if (current && JSON.stringify(current.state) === JSON.stringify(entry.state)) return;

    const newHistory = [...history.slice(0, historyIndex + 1), entry].slice(-MAX_HISTORY);

    set({
      history: newHistory,
      historyIndex: newHistory.length - 1,
    });
  },

  clearHistory: () => {
    const { project } = get();
    set(
      project
        ? { history: [snapshot(project, "Clear history")], historyIndex: 0 }
        : { history: [], historyIndex: -1 }
    );
  },

  batch: (description, fn) => {
    historyBatchDepth += 1;
    try {
      return fn();
    } finally {
      historyBatchDepth -= 1;
      if (historyBatchDepth === 0) get().pushHistory(description);
    }
  },

  // Export actions
  startExport: (_settings) => {
    set({ isExporting: true, exportProgress: 0 });
  },

  updateExportProgress: (progress) => {
    set({ exportProgress: progress });
  },

  cancelExport: () => {
    set({ isExporting: false, exportProgress: 0 });
  },
}));

function restore(entry: HistoryEntry, index: number) {
  const project = JSON.parse(JSON.stringify(entry.state)) as EditorProject;
  const ids = new Set(project.tracks.flatMap((t) => t.clips.map((c) => c.id)));
  const trackIds = new Set(project.tracks.map((t) => t.id));
  useEditorStore.setState((state) => ({
    project,
    // `duration` is derived from clips; keep the top-level slice in sync so the
    // ruler and playhead math never read a stale value after undo/redo.
    duration: project.duration,
    currentTime: Math.min(state.currentTime, project.duration),
    historyIndex: index,
    isDirty: true,
    selectedClipIds: state.selectedClipIds.filter((id) => ids.has(id)),
    selectedTrackId:
      state.selectedTrackId && trackIds.has(state.selectedTrackId) ? state.selectedTrackId : null,
  }));
}
