/**
 * Editor commands shared by the toolbar, context menus and keyboard
 * shortcuts: project open/save, media import, text overlays, and clip
 * clipboard/split/duplicate/delete.
 *
 * Every clip command takes the clip id explicitly and reads the latest store
 * state when it runs, so callers (e.g. a context menu that selects a clip and
 * acts on it in the same tick) never act on a stale selection.
 */
import { useCallback, useState } from "react";
import { ask, open, save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { useEditorStore } from "@/stores/editorStore";
import { useProject, useVideoMetadata } from "@/hooks/useEditor";
import type { LibraryVideo } from "@/hooks/useLibrary";
import { logger } from "@/lib/logger";
import type { Clip, ClipType } from "@/types/editor";
import { createMediaClip, createTextClip, pastedClip } from "@/lib/editor/clips";
import {
  DEFAULT_IMAGE_DURATION,
  FALLBACK_MEDIA_DURATION,
  MEDIA_DIALOG_FILTERS,
  classifyMediaExtension,
  fileNameFromPath,
} from "@/lib/editor/media";
import {
  findClip,
  nextAppendStart,
  trackAcceptsClip,
  trackTypeForClip,
} from "@/lib/editor/timeline";
import { fromBackendProject, toBackendProject } from "@/lib/editor/project-mapping";

const PROJECT_FILTERS = [{ name: "Clipy Project", extensions: ["clipy"] }];

/** Commands returned by {@link useEditorActions}. */
export interface EditorActions {
  /** Clip currently on the clipboard, if any. */
  clipboard: Clip | null;
  openProject: () => Promise<void>;
  saveProject: () => Promise<void>;
  importFiles: () => Promise<void>;
  addLibraryVideo: (video: LibraryVideo) => void;
  /** Adds a text overlay at the playhead and selects it; returns its id. */
  addText: () => string | null;
  copyClip: (clipId: string) => void;
  cutClip: (clipId: string) => void;
  /** Paste at the playhead, onto `trackId` when it accepts the clip type. */
  pasteClip: (trackId?: string) => void;
  duplicateClip: (clipId: string) => void;
  splitClip: (clipId: string) => void;
  deleteClips: (clipIds: string[]) => Promise<void>;
  copySelected: () => void;
  cutSelected: () => void;
  duplicateSelected: () => void;
  splitSelected: () => void;
  deleteSelected: () => Promise<void>;
}

interface MediaItem {
  type: Exclude<ClipType, "text">;
  name: string;
  path: string;
  duration: number;
}

/** Append media after the last clip, each on the first track of its type, as one undo step. */
function appendMedia(items: MediaItem[], description: string) {
  const store = useEditorStore.getState();
  store.batch(description, () => {
    for (const { type, name, path, duration } of items) {
      const tracks = useEditorStore.getState().project!.tracks;
      const trackType = trackTypeForClip(type);
      const trackId = tracks.find((t) => t.type === trackType)?.id ?? store.addTrack(trackType);
      const startTime = nextAppendStart(useEditorStore.getState().project!.tracks);
      store.addClip(
        trackId,
        createMediaClip({ type, name, sourcePath: path, startTime, duration })
      );
    }
  });
}

function singleSelection(): string | null {
  const ids = useEditorStore.getState().selectedClipIds;
  return ids.length === 1 ? ids[0]! : null;
}

function locate(clipId: string) {
  const project = useEditorStore.getState().project;
  return project ? findClip(project.tracks, clipId) : null;
}

/**
 * Hook exposing editor commands bound to the editor store and backend.
 *
 * @returns The command set; see {@link EditorActions}.
 */
export function useEditorActions(): EditorActions {
  const [clipboard, setClipboard] = useState<Clip | null>(null);
  const { getMetadata } = useVideoMetadata();
  const { loadProject: loadProjectFile } = useProject();

  const openProject = useCallback(async () => {
    try {
      const path = await open({ filters: PROJECT_FILTERS });
      if (!path || typeof path !== "string") return;
      const loaded = await loadProjectFile(path);
      useEditorStore.getState().loadProject(fromBackendProject(loaded));
      toast.success("Project loaded");
    } catch (err) {
      logger.error("Editor", "Load failed:", err);
      toast.error("Failed to load project");
    }
  }, [loadProjectFile]);

  const saveProject = useCallback(async () => {
    const project = useEditorStore.getState().project;
    if (!project) {
      toast.error("Nothing to save yet");
      return;
    }
    try {
      const path = await save({ filters: PROJECT_FILTERS, defaultPath: `${project.name}.clipy` });
      if (!path) return;
      await invoke("save_project", { project: toBackendProject(project), path });
      useEditorStore.getState().saveProject();
      toast.success("Project saved");
    } catch (err) {
      logger.error("Editor", "Save failed:", err);
      toast.error("Failed to save project");
    }
  }, []);

  const importFiles = useCallback(async () => {
    try {
      const selected = await open({ multiple: true, filters: MEDIA_DIALOG_FILTERS });
      if (!selected || !useEditorStore.getState().project) return;

      const files = Array.isArray(selected) ? selected : [selected];
      const items: MediaItem[] = [];
      for (const filePath of files) {
        const name = fileNameFromPath(filePath);
        const kind = classifyMediaExtension(filePath);
        if (!kind) {
          toast.error(`Unsupported file type: ${name}`);
          continue;
        }
        let duration = kind === "image" ? DEFAULT_IMAGE_DURATION : FALLBACK_MEDIA_DURATION;
        if (kind !== "image") {
          try {
            const metadata = await getMetadata(filePath);
            duration = metadata.duration || FALLBACK_MEDIA_DURATION;
          } catch {
            logger.warn("Editor", "Could not get metadata for:", filePath);
          }
        }
        items.push({ type: kind, name, path: filePath, duration });
      }

      if (items.length > 0) {
        appendMedia(items, "Import media");
        toast.success(`Added ${items.length} file(s) to timeline`);
      }
    } catch (err) {
      logger.error("Editor", "Import failed:", err);
      toast.error("Failed to import files");
    }
  }, [getMetadata]);

  const addLibraryVideo = useCallback((video: LibraryVideo) => {
    if (!useEditorStore.getState().project) {
      toast.error("No project loaded");
      return;
    }
    appendMedia(
      [
        {
          type: "video",
          name: video.title,
          path: video.filePath,
          duration: video.duration || FALLBACK_MEDIA_DURATION,
        },
      ],
      "Add media"
    );
    toast.success(`Added "${video.title}" to timeline`);
  }, []);

  const addText = useCallback(() => {
    const store = useEditorStore.getState();
    if (!store.project) return null;
    const clipId = store.batch("Add text", () => {
      const trackId = store.addTrack("text");
      return store.addClip(trackId, createTextClip(store.currentTime));
    });
    store.selectClip(clipId);
    toast.success("Text added - Edit in the Text panel on the right");
    return clipId;
  }, []);

  const copyClip = useCallback((clipId: string) => {
    const found = locate(clipId);
    if (!found) return;
    setClipboard(JSON.parse(JSON.stringify(found.clip)) as Clip);
    toast.success("Clip copied");
  }, []);

  const cutClip = useCallback((clipId: string) => {
    const found = locate(clipId);
    if (!found) return;
    if (found.track.locked) {
      toast.error("Track is locked");
      return;
    }
    setClipboard(JSON.parse(JSON.stringify(found.clip)) as Clip);
    useEditorStore.getState().removeClip(clipId);
    toast.success("Clip cut");
  }, []);

  const pasteClip = useCallback(
    (trackId?: string) => {
      const store = useEditorStore.getState();
      if (!clipboard || !store.project) return;
      const accepts = (id: string | null | undefined) => {
        const track = store.project!.tracks.find((t) => t.id === id);
        return track && !track.locked && trackAcceptsClip(track.type, clipboard.type)
          ? track
          : null;
      };
      const target =
        accepts(trackId) ??
        accepts(store.selectedTrackId) ??
        store.project.tracks.find((t) => !t.locked && trackAcceptsClip(t.type, clipboard.type));
      if (!target) {
        toast.error("No suitable track found");
        return;
      }
      store.addClip(target.id, pastedClip(clipboard, store.currentTime));
      toast.success("Clip pasted");
    },
    [clipboard]
  );

  const duplicateClip = useCallback((clipId: string) => {
    const found = locate(clipId);
    if (!found) return;
    if (found.track.locked) {
      toast.error("Track is locked");
      return;
    }
    useEditorStore.getState().duplicateClip(clipId);
    toast.success("Clip duplicated");
  }, []);

  const splitClip = useCallback((clipId: string) => {
    const found = locate(clipId);
    if (!found) return;
    const { currentTime, splitClip: split } = useEditorStore.getState();
    if (found.track.locked) {
      toast.error("Track is locked");
      return;
    }
    if (currentTime <= found.clip.startTime || currentTime >= found.clip.endTime) {
      toast.error("Playhead must be within clip to split");
      return;
    }
    split(clipId, currentTime);
    toast.success("Clip split at playhead");
  }, []);

  const deleteClips = useCallback(async (clipIds: string[]) => {
    const deletable = clipIds.filter((id) => {
      const found = locate(id);
      return found && !found.track.locked;
    });
    if (deletable.length === 0) return;
    const confirmed = await ask(`Delete ${deletable.length} clip(s)?`, {
      title: "Delete Clips",
      kind: "warning",
    });
    if (!confirmed) return;
    useEditorStore.getState().removeClips(deletable);
    toast.success(`Deleted ${deletable.length} clip(s)`);
  }, []);

  const withSelection = (fn: (id: string) => void) => () => {
    const id = singleSelection();
    if (id) fn(id);
  };

  return {
    clipboard,
    openProject,
    saveProject,
    importFiles,
    addLibraryVideo,
    addText,
    copyClip,
    cutClip,
    pasteClip,
    duplicateClip,
    splitClip,
    deleteClips,
    copySelected: withSelection(copyClip),
    cutSelected: withSelection(cutClip),
    duplicateSelected: withSelection(duplicateClip),
    splitSelected: withSelection(splitClip),
    deleteSelected: () => deleteClips(useEditorStore.getState().selectedClipIds),
  };
}
