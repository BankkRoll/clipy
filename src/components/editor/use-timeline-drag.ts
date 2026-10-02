/**
 * Pointer interactions on the timeline: moving clips (including onto other
 * tracks), trimming clip edges, and scrubbing the playhead.
 *
 * Each gesture installs window listeners on mousedown and removes them on
 * mouseup, reading the live store on every move so nothing goes stale.
 * Intermediate updates use `updateClip` (no history); the gesture commits a
 * single undo step when it ends.
 */
import {
  useCallback,
  useEffect,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
} from "react";
import { useEditorStore } from "@/stores/editorStore";
import type { Clip, Track } from "@/types/editor";
import {
  clampTime,
  computeMoveStart,
  computeTrim,
  findClip,
  isCompatibleDrop,
  pixelToTime,
  snapTime,
  trackIdAtY,
} from "@/lib/editor/timeline";

/** Snapping preferences (from the user's editor settings). */
export interface SnapPreferences {
  snapToClips: boolean;
  snapToPlayhead: boolean;
}

/** Gesture starters returned by {@link useTimelineDrag}. */
export interface TimelineDrag {
  startClipDrag: (e: ReactMouseEvent, clip: Clip, track: Track) => void;
  startTrim: (e: ReactMouseEvent, clip: Clip, edge: "start" | "end") => void;
  startPlayheadDrag: (e: ReactMouseEvent) => void;
}

/**
 * Hook providing timeline drag gestures.
 *
 * @param lanes - Track lane elements by track id, for cross-track hit-testing.
 * @param originRef - Element whose left edge is time 0 (the ruler).
 * @param snap - Snapping preferences.
 * @returns Mousedown handlers that start each gesture.
 */
export function useTimelineDrag(
  lanes: RefObject<Map<string, HTMLElement>>,
  originRef: RefObject<HTMLElement>,
  snap: SnapPreferences
): TimelineDrag {
  const cleanupRef = useRef<(() => void) | null>(null);
  const snapRef = useRef(snap);
  snapRef.current = snap;

  useEffect(() => () => cleanupRef.current?.(), []);

  const track = useCallback((onMove: (e: MouseEvent) => void, onUp: () => void) => {
    cleanupRef.current?.();
    const up = () => {
      cleanup();
      onUp();
    };
    const cleanup = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", up);
      cleanupRef.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", up);
    cleanupRef.current = cleanup;
  }, []);

  const snapper = useCallback(
    (excludeClipId: string) => (time: number) => {
      const { project, zoom, duration, currentTime } = useEditorStore.getState();
      return snapTime(time, project!.tracks, {
        zoom,
        duration,
        excludeClipId,
        snapToClips: snapRef.current.snapToClips,
        snapToPlayhead: snapRef.current.snapToPlayhead,
        playhead: currentTime,
      });
    },
    []
  );

  const startClipDrag = useCallback(
    (e: ReactMouseEvent, clip: Clip, sourceTrack: Track) => {
      e.stopPropagation();
      useEditorStore.getState().selectClip(clip.id, e.shiftKey || e.ctrlKey || e.metaKey);
      if (sourceTrack.locked || e.button !== 0) return;

      const startX = e.clientX;
      const initialStart = clip.startTime;
      const clipDuration = clip.endTime - clip.startTime;
      let target: { trackId: string; startTime: number } | null = null;
      let moved = false;

      track(
        (ev) => {
          const { project, zoom, updateClip } = useEditorStore.getState();
          if (!project) return;
          moved = true;
          const start = computeMoveStart(
            initialStart,
            pixelToTime(ev.clientX - startX, zoom),
            clipDuration,
            snapper(clip.id)
          );
          const overId = lanes.current ? trackIdAtY(lanes.current, ev.clientY) : null;
          const over = overId ? project.tracks.find((t) => t.id === overId) : undefined;
          target =
            over && isCompatibleDrop(clip.type, over, sourceTrack.id)
              ? { trackId: over.id, startTime: start }
              : null;
          updateClip(clip.id, { startTime: start, endTime: start + clipDuration });
        },
        () => {
          const store = useEditorStore.getState();
          if (target) store.moveClip(clip.id, target.trackId, target.startTime);
          else if (moved) store.commitHistory("Move clip");
        }
      );
    },
    [track, lanes, snapper]
  );

  const startTrim = useCallback(
    (e: ReactMouseEvent, clip: Clip, edge: "start" | "end") => {
      e.stopPropagation();
      useEditorStore.getState().selectClip(clip.id);
      if (e.button !== 0) return;
      const startX = e.clientX;
      const initialTime = edge === "start" ? clip.startTime : clip.endTime;
      let moved = false;

      track(
        (ev) => {
          const { project, zoom, updateClip } = useEditorStore.getState();
          const live = project ? findClip(project.tracks, clip.id)?.clip : undefined;
          if (!live) return;
          moved = true;
          updateClip(
            clip.id,
            computeTrim({
              clip: live,
              edge,
              initialTime,
              deltaTime: pixelToTime(ev.clientX - startX, zoom),
              snap: snapper(clip.id),
            })
          );
        },
        () => {
          if (moved) useEditorStore.getState().commitHistory("Trim clip");
        }
      );
    },
    [track, snapper]
  );

  const startPlayheadDrag = useCallback(
    (e: ReactMouseEvent) => {
      e.stopPropagation();
      track(
        (ev) => {
          const origin = originRef.current;
          if (!origin) return;
          const { zoom, duration, seek } = useEditorStore.getState();
          const x = ev.clientX - origin.getBoundingClientRect().left;
          seek(clampTime(pixelToTime(x, zoom), duration));
        },
        () => {}
      );
    },
    [track, originRef]
  );

  return { startClipDrag, startTrim, startPlayheadDrag };
}
