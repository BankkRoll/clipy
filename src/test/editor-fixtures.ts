/**
 * Builders for editor projects, tracks and clips used across editor tests,
 * plus a helper to reset the editor store to a known project.
 */
import type { Clip, EditorProject, Track } from "@/types/editor";
import { useEditorStore, getInitialEditorState } from "@/stores/editorStore";

let seq = 0;
const nextId = (prefix: string) => `${prefix}-${++seq}`;

/**
 * Build a clip with sensible defaults.
 *
 * @param overrides - Fields to replace; `properties` is shallow-merged.
 * @returns A complete clip.
 */
export function makeClip(
  overrides: Partial<Omit<Clip, "properties">> & { properties?: Partial<Clip["properties"]> } = {}
): Clip {
  const { properties, ...rest } = overrides;
  return {
    id: nextId("clip"),
    trackId: "t-video",
    type: "video",
    name: "Clip",
    startTime: 0,
    endTime: 10,
    sourceStart: 0,
    sourceEnd: 10,
    sourcePath: "C:\\media\\clip.mp4",
    thumbnails: [],
    ...rest,
    properties: {
      volume: 1,
      opacity: 1,
      speed: 1,
      fadeIn: 0,
      fadeOut: 0,
      filters: [],
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      ...properties,
    },
  };
}

/**
 * Build a track; clips get their `trackId` rewritten to the track's id.
 *
 * @param overrides - Fields to replace.
 * @returns A complete track.
 */
export function makeTrack(overrides: Partial<Track> = {}): Track {
  const id = overrides.id ?? nextId("track");
  return {
    id,
    type: "video",
    name: "Track",
    muted: false,
    locked: false,
    volume: 1,
    height: 64,
    ...overrides,
    clips: (overrides.clips ?? []).map((c) => ({ ...c, trackId: id })),
  };
}

/**
 * Build a project whose duration is derived from its clips.
 *
 * @param tracks - Project tracks.
 * @param overrides - Other fields to replace.
 * @returns A complete project.
 */
export function makeProject(
  tracks: Track[],
  overrides: Partial<EditorProject> = {}
): EditorProject {
  return {
    id: "project-1",
    name: "Test Project",
    createdAt: "2026-01-01T00:00:00.000Z",
    modifiedAt: "2026-01-01T00:00:00.000Z",
    duration: Math.max(0, ...tracks.flatMap((t) => t.clips.map((c) => c.endTime))),
    tracks,
    settings: { width: 1920, height: 1080, fps: 30, sampleRate: 48000 },
    ...overrides,
  };
}

/**
 * Reset the editor store and load `project` into it (with a baseline undo
 * snapshot, exactly like opening a file).
 *
 * @param project - Project to load, or `null` for an empty store.
 */
export function loadEditor(project: EditorProject | null): void {
  useEditorStore.setState(getInitialEditorState());
  if (project) useEditorStore.getState().loadProject(project);
}

/**
 * The live project from the editor store.
 *
 * @returns The current project (throws if none is loaded).
 */
export function currentProject(): EditorProject {
  const project = useEditorStore.getState().project;
  if (!project) throw new Error("no project loaded");
  return project;
}

/**
 * Every clip in the live project, in track order.
 *
 * @returns Flat clip list.
 */
export function allClips(): Clip[] {
  return currentProject().tracks.flatMap((t) => t.clips);
}
