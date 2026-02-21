import { create } from "zustand";
import {
  type EditorProject,
  type Track,
  type Clip,
  type HistoryEntry,
  type ExportSettings,
} from "@/types/editor";
import { generateId } from "@/lib/utils";

interface EditorState {
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

  // Clip actions
  addClip: (trackId: string, clip: Omit<Clip, "id" | "trackId">) => string;
  removeClip: (clipId: string) => void;
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
  clearHistory: () => void;

  // Export actions
  startExport: (settings: ExportSettings) => void;
  updateExportProgress: (progress: number) => void;
  cancelExport: () => void;
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

export const useEditorStore = create<EditorState>((set, get) => ({
  // Initial state
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

  // Project actions
  createProject: (name) => {
    const project = createDefaultProject(name);
    set({
      project,
      isDirty: false,
      currentTime: 0,
      isPlaying: false,
      zoom: 1,
      scrollX: 0,
      selectedClipIds: [],
      selectedTrackId: null,
      history: [],
      historyIndex: -1,
    });
  },

  loadProject: (project) => {
    set({
      project,
      isDirty: false,
      currentTime: 0,
      isPlaying: false,
      duration: project.duration,
      history: [],
      historyIndex: -1,
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

      return {
        project: {
          ...state.project,
          tracks: state.project.tracks.filter((t) => t.id !== trackId),
        },
        isDirty: true,
        selectedTrackId: state.selectedTrackId === trackId ? null : state.selectedTrackId,
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

      const allClips = tracks.flatMap((t) => t.clips);
      const duration = Math.max(...allClips.map((c) => c.endTime), 0);

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
    set((state) => {
      if (!state.project) return state;

      const tracks = state.project.tracks.map((t) => ({
        ...t,
        clips: t.clips.filter((c) => c.id !== clipId),
      }));

      const allClips = tracks.flatMap((t) => t.clips);
      const duration = Math.max(...allClips.map((c) => c.endTime), 0);

      return {
        project: { ...state.project, tracks, duration },
        duration,
        isDirty: true,
        selectedClipIds: state.selectedClipIds.filter((id) => id !== clipId),
      };
    });

    get().pushHistory("Remove clip");
  },

  updateClip: (clipId, updates) => {
    set((state) => {
      if (!state.project) return state;

      const tracks = state.project.tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) => (c.id === clipId ? { ...c, ...updates } : c)),
      }));

      const allClips = tracks.flatMap((t) => t.clips);
      const duration = Math.max(...allClips.map((c) => c.endTime), 0);

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

      // Find and remove clip from current track
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

      // Add clip to new track
      const tracks = tracksWithRemoval.map((t) =>
        t.id === newTrackId ? { ...t, clips: [...t.clips, movedClip!] } : t
      );

      const allClips = tracks.flatMap((t) => t.clips);
      const duration = Math.max(...allClips.map((c) => c.endTime), 0);

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

    const sourceProgress = (splitTime - foundClip.startTime) / (foundClip.endTime - foundClip.startTime);
    const sourceSplitTime = foundClip.sourceStart + sourceProgress * (foundClip.sourceEnd - foundClip.sourceStart);

    const firstClip: Partial<Clip> = {
      endTime: splitTime,
      sourceEnd: sourceSplitTime,
    };

    const secondClip: Omit<Clip, "id" | "trackId"> = {
      ...foundClip,
      name: `${foundClip.name} (2)`,
      startTime: splitTime,
      sourceStart: sourceSplitTime,
    };

    get().updateClip(clipId, firstClip);
    get().addClip(foundTrackId, secondClip);
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
        ? [...state.selectedClipIds, clipId]
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
    const { selectedClipIds, removeClip } = get();
    selectedClipIds.forEach((id) => removeClip(id));
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
    if (historyIndex > 0) {
      const entry = history[historyIndex - 1];
      if (entry) {
        set({
          project: entry.state,
          historyIndex: historyIndex - 1,
        });
      }
    }
  },

  redo: () => {
    const { history, historyIndex } = get();
    if (historyIndex < history.length - 1) {
      const entry = history[historyIndex + 1];
      if (entry) {
        set({
          project: entry.state,
          historyIndex: historyIndex + 1,
        });
      }
    }
  },

  pushHistory: (description) => {
    const { project, history, historyIndex } = get();
    if (!project) return;

    const entry: HistoryEntry = {
      id: generateId(),
      type: "edit",
      description,
      timestamp: Date.now(),
      state: JSON.parse(JSON.stringify(project)) as EditorProject,
    };

    const newHistory = [...history.slice(0, historyIndex + 1), entry].slice(-50);

    set({
      history: newHistory,
      historyIndex: newHistory.length - 1,
    });
  },

  clearHistory: () => {
    set({ history: [], historyIndex: -1 });
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
