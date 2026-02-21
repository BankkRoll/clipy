import { useCallback, useMemo } from "react";
import { formatDuration } from "@/lib/utils";
import { PIXELS_PER_SECOND, SNAP_THRESHOLD } from "../constants";
import type { EditorProject } from "@/types/editor";

export function useTimeline(
  project: EditorProject | null,
  duration: number,
  zoom: number
) {
  const timelineWidth = useMemo(() => {
    return Math.max(duration * PIXELS_PER_SECOND * zoom, 800);
  }, [duration, zoom]);

  const pixelToTime = useCallback(
    (px: number) => {
      return px / (PIXELS_PER_SECOND * zoom);
    },
    [zoom]
  );

  const timeToPixel = useCallback(
    (time: number) => {
      return time * PIXELS_PER_SECOND * zoom;
    },
    [zoom]
  );

  const snapTime = useCallback(
    (time: number, excludeClipId?: string) => {
      if (!project) return time;

      const snapPoints: number[] = [0, duration];

      project.tracks.forEach((track) => {
        track.clips.forEach((clip) => {
          if (clip.id !== excludeClipId) {
            snapPoints.push(clip.startTime, clip.endTime);
          }
        });
      });

      const snapPixels = SNAP_THRESHOLD / (PIXELS_PER_SECOND * zoom);
      for (const point of snapPoints) {
        if (Math.abs(time - point) < snapPixels) {
          return point;
        }
      }

      return time;
    },
    [project, duration, zoom]
  );

  const timeRulerMarkers = useMemo(() => {
    const markers: { time: number; label: string; major: boolean }[] = [];
    const visibleDuration = Math.max(duration, 60);

    let interval = 1;
    if (zoom < 0.3) interval = 10;
    else if (zoom < 0.5) interval = 5;
    else if (zoom < 1) interval = 2;
    else if (zoom > 2) interval = 0.5;
    else if (zoom > 4) interval = 0.25;

    for (let t = 0; t <= visibleDuration; t += interval) {
      const isMajor = t % (interval * 2) === 0 || interval >= 5;
      markers.push({
        time: t,
        label: formatDuration(t),
        major: isMajor,
      });
    }

    return markers;
  }, [duration, zoom]);

  return {
    timelineWidth,
    pixelToTime,
    timeToPixel,
    snapTime,
    timeRulerMarkers,
  };
}
