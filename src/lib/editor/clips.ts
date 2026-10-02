/**
 * Factories for new timeline clips, so every entry point (library, disk
 * import, text tool, captions) builds clips with the same defaults.
 */
import type { Clip, ClipProperties, ClipType, TextProperties, Transform } from "@/types/editor";

/** Payload accepted by the store's `addClip` (everything but id + trackId). */
export type NewClip = Omit<Clip, "id" | "trackId">;

/** Seconds a new text overlay lasts. */
export const DEFAULT_TEXT_DURATION = 5;

/**
 * Identity transform (no offset, unit scale, no rotation).
 *
 * @returns A fresh transform object.
 */
export function defaultTransform(): Transform {
  return { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 };
}

/**
 * Default clip properties: full volume and opacity, normal speed, no effects.
 *
 * @param text - Optional text properties for text clips.
 * @returns A fresh properties object.
 */
export function defaultClipProperties(text?: TextProperties): ClipProperties {
  return {
    volume: 1,
    opacity: 1,
    speed: 1,
    fadeIn: 0,
    fadeOut: 0,
    filters: [],
    transform: defaultTransform(),
    ...(text ? { text } : {}),
  };
}

/** Input to {@link createMediaClip}. */
export interface MediaClipInput {
  type: Exclude<ClipType, "text">;
  name: string;
  sourcePath: string;
  startTime: number;
  duration: number;
}

/**
 * Build a clip for a media file (video, audio or still image).
 *
 * @param input - Media details and timeline placement.
 * @returns Clip payload spanning the whole source.
 */
export function createMediaClip({
  type,
  name,
  sourcePath,
  startTime,
  duration,
}: MediaClipInput): NewClip {
  return {
    type,
    name,
    startTime,
    endTime: startTime + duration,
    sourceStart: 0,
    sourceEnd: duration,
    sourcePath,
    thumbnails: [],
    properties: defaultClipProperties(),
  };
}

/**
 * Build the default "Enter your text here" overlay.
 *
 * @param startTime - Timeline start in seconds (usually the playhead).
 * @returns Text clip payload lasting {@link DEFAULT_TEXT_DURATION} seconds.
 */
export function createTextClip(startTime: number): NewClip {
  return {
    type: "text",
    name: "New Text",
    startTime,
    endTime: startTime + DEFAULT_TEXT_DURATION,
    sourceStart: 0,
    sourceEnd: DEFAULT_TEXT_DURATION,
    sourcePath: "",
    thumbnails: [],
    properties: defaultClipProperties({
      content: "Enter your text here",
      fontFamily: "Arial",
      fontSize: 48,
      fontWeight: 400,
      color: "#ffffff",
      backgroundColor: "transparent",
      align: "center",
      verticalAlign: "middle",
    }),
  };
}

/**
 * Turn a copied clip into a paste payload placed at `startTime`.
 *
 * @param clip - Clip from the clipboard.
 * @param startTime - Where the pasted copy should begin.
 * @returns Clip payload with a "(pasted)" name and the original length.
 */
export function pastedClip(clip: Clip, startTime: number): NewClip {
  const { id: _id, trackId: _trackId, ...rest } = JSON.parse(JSON.stringify(clip)) as Clip;
  return {
    ...rest,
    name: `${clip.name} (pasted)`,
    startTime,
    endTime: startTime + (clip.endTime - clip.startTime),
  };
}
