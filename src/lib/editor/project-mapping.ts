/**
 * Conversion between the frontend editor project (`type`-keyed) and the shape
 * the Rust backend serializes (`trackType` / `clipType` / `filterType`, and
 * `text: null` instead of an absent key).
 *
 * Used by save_project, load_project and export_project so the three never
 * drift apart.
 */
import type { EditorProject, FilterType } from "@/types/editor";
import type { Project as BackendProject } from "@/hooks/useEditor";

/**
 * Map an editor project to the backend's project shape.
 *
 * @param project - Project from the editor store.
 * @returns Payload for `save_project` / `export_project`.
 */
export function toBackendProject(project: EditorProject): BackendProject {
  return {
    id: project.id,
    name: project.name,
    createdAt: project.createdAt,
    modifiedAt: project.modifiedAt,
    duration: project.duration,
    tracks: project.tracks.map((t) => ({
      id: t.id,
      trackType: t.type,
      name: t.name,
      clips: t.clips.map((c) => ({
        id: c.id,
        trackId: c.trackId,
        clipType: c.type,
        name: c.name,
        startTime: c.startTime,
        endTime: c.endTime,
        sourceStart: c.sourceStart,
        sourceEnd: c.sourceEnd,
        sourcePath: c.sourcePath,
        thumbnails: c.thumbnails,
        properties: {
          volume: c.properties.volume,
          opacity: c.properties.opacity,
          speed: c.properties.speed,
          fadeIn: c.properties.fadeIn,
          fadeOut: c.properties.fadeOut,
          filters: c.properties.filters.map((f) => ({
            id: f.id,
            filterType: f.type,
            enabled: f.enabled,
            params: f.params,
          })),
          transform: c.properties.transform,
          text: c.properties.text ?? null,
        },
      })),
      muted: t.muted,
      locked: t.locked,
      volume: t.volume,
      height: t.height,
    })),
    settings: project.settings,
  };
}

/**
 * Map a project returned by `load_project` back to the editor shape.
 * Inverse of {@link toBackendProject}.
 *
 * @param loaded - Backend project.
 * @returns Project ready for the editor store.
 */
export function fromBackendProject(loaded: BackendProject): EditorProject {
  return {
    id: loaded.id,
    name: loaded.name,
    createdAt: loaded.createdAt,
    modifiedAt: loaded.modifiedAt,
    duration: loaded.duration,
    tracks: loaded.tracks.map((t) => ({
      id: t.id,
      type: t.trackType,
      name: t.name,
      clips: t.clips.map((c) => ({
        id: c.id,
        trackId: c.trackId,
        type: c.clipType,
        name: c.name,
        startTime: c.startTime,
        endTime: c.endTime,
        sourceStart: c.sourceStart,
        sourceEnd: c.sourceEnd,
        sourcePath: c.sourcePath,
        thumbnails: c.thumbnails,
        properties: {
          volume: c.properties.volume,
          opacity: c.properties.opacity,
          speed: c.properties.speed,
          fadeIn: c.properties.fadeIn,
          fadeOut: c.properties.fadeOut,
          filters: c.properties.filters.map((f) => ({
            id: f.id,
            type: f.filterType as FilterType,
            enabled: f.enabled,
            params: f.params as Record<string, number | string | boolean>,
          })),
          transform: c.properties.transform,
          ...(c.properties.text ? { text: c.properties.text } : {}),
        },
      })),
      muted: t.muted,
      locked: t.locked,
      volume: t.volume,
      height: t.height,
    })),
    settings: loaded.settings,
  };
}
