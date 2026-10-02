/**
 * Pure timeline geometry and editing math.
 *
 * Responsibilities:
 * - time <-> pixel conversion at a given zoom
 * - locating clips (by id, or the one under the playhead)
 * - snapping, ruler markers, append positions
 * - drag/trim/drop rules shared by the timeline UI
 */
import type { Clip, ClipType, Track, TrackType } from "@/types/editor";
import { formatDuration } from "@/lib/utils";

/** Timeline pixels per second of media at zoom 1. */
export const PIXELS_PER_SECOND = 50;

/** Distance, in screen pixels, within which an edge snaps to a snap point. */
export const SNAP_THRESHOLD_PX = 10;

/** Shortest clip a trim can produce, in seconds. */
export const MIN_CLIP_DURATION = 0.1;

/** Narrowest the timeline content area ever renders, in pixels. */
export const MIN_TIMELINE_WIDTH = 800;

/**
 * Convert a timeline time to a horizontal pixel offset.
 *
 * @param time - Seconds from the timeline origin.
 * @param zoom - Current timeline zoom factor.
 * @returns Pixel offset from the left edge of the timeline content.
 */
export function timeToPixel(time: number, zoom: number): number {
  return time * PIXELS_PER_SECOND * zoom;
}

/**
 * Convert a horizontal pixel offset to a timeline time.
 *
 * @param px - Pixel offset from the left edge of the timeline content.
 * @param zoom - Current timeline zoom factor.
 * @returns Seconds from the timeline origin.
 */
export function pixelToTime(px: number, zoom: number): number {
  return px / (PIXELS_PER_SECOND * zoom);
}

/**
 * Width of the scrollable timeline content.
 *
 * @param duration - Project duration in seconds.
 * @param zoom - Current timeline zoom factor.
 * @returns Content width in pixels, never below {@link MIN_TIMELINE_WIDTH}.
 */
export function timelineWidth(duration: number, zoom: number): number {
  return Math.max(timeToPixel(duration, zoom), MIN_TIMELINE_WIDTH);
}

/**
 * Clamp a time into the playable range.
 *
 * @param time - Candidate time in seconds.
 * @param duration - Project duration in seconds.
 * @returns `time` limited to `[0, duration]`.
 */
export function clampTime(time: number, duration: number): number {
  return Math.max(0, Math.min(time, duration));
}

/**
 * Find the clip of a given track type that is visible at `time`.
 * Tracks are searched in order and muted (hidden) tracks are skipped, so the
 * top-most visible track wins.
 *
 * @param tracks - Project tracks in display order.
 * @param time - Timeline time in seconds.
 * @param trackType - Which kind of track to search.
 * @returns The active clip, or `null` when nothing covers `time`.
 */
export function findActiveClip(tracks: Track[], time: number, trackType: TrackType): Clip | null {
  for (const track of tracks) {
    if (track.type !== trackType || track.muted) continue;
    const clip = track.clips.find((c) => time >= c.startTime && time < c.endTime);
    if (clip) return clip;
  }
  return null;
}

/**
 * Locate a clip and its owning track by id.
 *
 * @param tracks - Project tracks.
 * @param clipId - Clip to find.
 * @returns The clip with its track, or `null` when the id is unknown.
 */
export function findClip(tracks: Track[], clipId: string): { clip: Clip; track: Track } | null {
  for (const track of tracks) {
    const clip = track.clips.find((c) => c.id === clipId);
    if (clip) return { clip, track };
  }
  return null;
}

/**
 * Map a timeline time to the position inside the clip's source media,
 * honouring trim-in and playback speed.
 *
 * @param clip - Clip being played.
 * @param time - Timeline time in seconds.
 * @returns Source media time, capped at the clip's trim-out point.
 */
export function getSourceTimeForClip(clip: Clip, time: number): number {
  const speed = clip.properties.speed || 1;
  const sourceTime = clip.sourceStart + (time - clip.startTime) * speed;
  return Math.min(sourceTime, clip.sourceEnd);
}

/** Options controlling which points a time snaps to. */
export interface SnapOptions {
  /** Current zoom; the snap threshold is constant in screen pixels. */
  zoom: number;
  /** Project duration; the end of the timeline is always a snap point. */
  duration: number;
  /** Clip being dragged, whose own edges must not attract it. */
  excludeClipId?: string | undefined;
  /** Snap to other clips' edges. Defaults to `true`. */
  snapToClips?: boolean | undefined;
  /** Snap to the playhead. Defaults to `false`. */
  snapToPlayhead?: boolean | undefined;
  /** Playhead time used when `snapToPlayhead` is on. */
  playhead?: number | undefined;
}

/**
 * Collect the times a dragged edge may snap to.
 *
 * @param tracks - Project tracks.
 * @param options - Snap configuration.
 * @returns Snap points in seconds (unsorted, may contain duplicates).
 */
export function collectSnapPoints(tracks: Track[], options: SnapOptions): number[] {
  const points = [0, options.duration];
  if (options.snapToClips ?? true) {
    for (const track of tracks) {
      for (const clip of track.clips) {
        if (clip.id !== options.excludeClipId) points.push(clip.startTime, clip.endTime);
      }
    }
  }
  if (options.snapToPlayhead && options.playhead !== undefined) points.push(options.playhead);
  return points;
}

/**
 * Snap a time to the nearest snap point within {@link SNAP_THRESHOLD_PX}.
 *
 * @param time - Candidate time in seconds.
 * @param tracks - Project tracks.
 * @param options - Snap configuration.
 * @returns The snapped time, or `time` unchanged when nothing is close enough.
 * @example
 * snapTime(4.95, tracks, { zoom: 1, duration: 30 }); // 5 if a clip edge sits at 5
 */
export function snapTime(time: number, tracks: Track[], options: SnapOptions): number {
  const threshold = pixelToTime(SNAP_THRESHOLD_PX, options.zoom);
  let best = time;
  let bestDistance = threshold;
  for (const point of collectSnapPoints(tracks, options)) {
    const distance = Math.abs(time - point);
    if (distance < bestDistance) {
      best = point;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * New start time for a clip being dragged. Either edge may snap: the start
 * edge is tried first, then the end edge.
 *
 * @param initialStart - Clip start when the drag began.
 * @param deltaTime - Pointer movement converted to seconds.
 * @param clipDuration - Length of the dragged clip.
 * @param snap - Snapping function (identity to disable snapping).
 * @returns Non-negative start time.
 */
export function computeMoveStart(
  initialStart: number,
  deltaTime: number,
  clipDuration: number,
  snap: (time: number) => number
): number {
  const rawStart = Math.max(0, initialStart + deltaTime);
  const snappedStart = snap(rawStart);
  if (snappedStart !== rawStart) return snappedStart;
  const rawEnd = rawStart + clipDuration;
  const snappedEnd = snap(rawEnd);
  return Math.max(0, snappedEnd - clipDuration);
}

/** Input to {@link computeTrim}. */
export interface TrimInput {
  /** Live clip being trimmed (its current, partially-trimmed state). */
  clip: Clip;
  /** Which edge is being dragged. */
  edge: "start" | "end";
  /** Edge time when the drag began. */
  initialTime: number;
  /** Pointer movement converted to seconds. */
  deltaTime: number;
  /** Snapping function (identity to disable snapping). */
  snap: (time: number) => number;
}

/**
 * Compute the clip update for a trim drag.
 *
 * The source in/out points move with the edge, scaled by playback speed. For
 * time-based media the start edge cannot be pulled before the beginning of the
 * source file.
 *
 * @param input - Trim parameters.
 * @returns Partial clip update to pass to `updateClip`.
 */
export function computeTrim({
  clip,
  edge,
  initialTime,
  deltaTime,
  snap,
}: TrimInput): Partial<Clip> {
  const speed = clip.properties.speed || 1;
  if (edge === "start") {
    const hasSource = clip.type === "video" || clip.type === "audio";
    const earliest = hasSource ? Math.max(0, clip.startTime - clip.sourceStart / speed) : 0;
    let newStart = Math.max(earliest, initialTime + deltaTime);
    newStart = Math.max(earliest, snap(newStart));
    newStart = Math.min(newStart, clip.endTime - MIN_CLIP_DURATION);
    const trimAmount = newStart - clip.startTime;
    return { startTime: newStart, sourceStart: clip.sourceStart + trimAmount * speed };
  }

  let newEnd = Math.max(clip.startTime + MIN_CLIP_DURATION, initialTime + deltaTime);
  newEnd = Math.max(clip.startTime + MIN_CLIP_DURATION, snap(newEnd));
  const trimAmount = newEnd - clip.endTime;
  return { endTime: newEnd, sourceEnd: clip.sourceEnd + trimAmount * speed };
}

/** One tick on the time ruler. */
export interface RulerMarker {
  time: number;
  label: string;
  /** Major ticks are full height and labelled. */
  major: boolean;
}

/**
 * Seconds between ruler ticks for a zoom level. Larger zoom = finer ticks.
 *
 * @param zoom - Current timeline zoom factor.
 * @returns Tick interval in seconds.
 */
export function rulerInterval(zoom: number): number {
  if (zoom < 0.3) return 10;
  if (zoom < 0.5) return 5;
  if (zoom < 1) return 2;
  if (zoom > 4) return 0.25;
  if (zoom > 2) return 0.5;
  return 1;
}

/**
 * Build ruler ticks covering `[0, maxTime]`.
 *
 * Ticks are computed by index rather than by repeated addition so fractional
 * intervals do not accumulate floating-point drift.
 *
 * @param maxTime - Last time the ruler must cover, in seconds.
 * @param zoom - Current timeline zoom factor.
 * @returns Markers in ascending time order.
 */
export function buildRulerMarkers(maxTime: number, zoom: number): RulerMarker[] {
  const interval = rulerInterval(zoom);
  const markers: RulerMarker[] = [];
  const count = Math.floor(maxTime / interval + 1e-9);
  for (let i = 0; i <= count; i++) {
    const time = i * interval;
    markers.push({ time, label: formatDuration(time), major: i % 2 === 0 || interval >= 5 });
  }
  return markers;
}

/**
 * Where newly imported media should be placed: right after the last clip on
 * any track.
 *
 * @param tracks - Project tracks.
 * @returns Start time in seconds (0 for an empty project).
 */
export function nextAppendStart(tracks: Track[]): number {
  return Math.max(0, ...tracks.flatMap((t) => t.clips.map((c) => c.endTime)));
}

/**
 * Track type a clip type belongs on by default.
 *
 * @param clipType - Type of the clip.
 * @returns The matching track type (images live on video tracks).
 */
export function trackTypeForClip(clipType: ClipType): TrackType {
  return clipType === "image" ? "video" : clipType;
}

/**
 * Whether a clip may be dropped onto a track during a cross-track drag.
 * Video/image clips go on video or effect tracks, audio on audio, text on text.
 *
 * @param clipType - Type of the dragged clip.
 * @param target - Track under the pointer.
 * @param sourceTrackId - Track the drag started on (dropping there is a plain move).
 * @returns `true` when the drop should relocate the clip to `target`.
 */
export function isCompatibleDrop(
  clipType: ClipType,
  target: Track,
  sourceTrackId: string
): boolean {
  if (target.id === sourceTrackId || target.locked) return false;
  return trackAcceptsClip(target.type, clipType);
}

/**
 * Whether a track of `trackType` can hold a clip of `clipType`.
 *
 * @param trackType - Track type.
 * @param clipType - Clip type.
 * @returns `true` for video/image on video or effect tracks, and matching types otherwise.
 */
export function trackAcceptsClip(trackType: TrackType, clipType: ClipType): boolean {
  if (clipType === "video" || clipType === "image") {
    return trackType === "video" || trackType === "effect";
  }
  return clipType === trackType;
}

/**
 * Hit-test a pointer Y coordinate against track lanes.
 *
 * @param lanes - Track id to lane element entries.
 * @param clientY - Pointer Y in viewport coordinates.
 * @returns Id of the lane under the pointer, or `null`.
 */
export function trackIdAtY(lanes: Iterable<[string, Element]>, clientY: number): string | null {
  for (const [trackId, el] of lanes) {
    const rect = el.getBoundingClientRect();
    if (clientY >= rect.top && clientY <= rect.bottom) return trackId;
  }
  return null;
}
