/**
 * Live-preview math: how a clip's transform, opacity, fades and volume map
 * onto the preview elements at a given playhead time.
 */
import type { CSSProperties } from "react";
import type { Clip, ProjectSettings, TextProperties, Transform } from "@/types/editor";

/**
 * CSS transform for a clip in the preview box.
 *
 * Offsets are authored in project-canvas pixels; they are expressed in
 * container-query units so the preview matches export at any preview size
 * (the preview box declares `container-type: size`).
 *
 * @param transform - Clip transform.
 * @param canvas - Project canvas size the offsets are relative to.
 * @returns A CSS `transform` value, or `undefined` for the identity transform.
 */
export function buildTransformCss(
  transform: Transform,
  canvas: Pick<ProjectSettings, "width" | "height">
): string | undefined {
  const { x, y, scaleX, scaleY, rotation } = transform;
  if (x === 0 && y === 0 && scaleX === 1 && scaleY === 1 && rotation === 0) return undefined;
  const tx = (x / canvas.width) * 100;
  const ty = (y / canvas.height) * 100;
  return `translate(${tx}cqw, ${ty}cqh) scale(${scaleX}, ${scaleY}) rotate(${rotation}deg)`;
}

/**
 * Fade envelope for a clip at a timeline time: ramps 0→1 over `fadeIn` and
 * 1→0 over `fadeOut`.
 *
 * @param clip - Clip being rendered.
 * @param time - Timeline time in seconds.
 * @returns Multiplier in `[0, 1]`.
 */
export function fadeFactor(clip: Clip, time: number): number {
  const { fadeIn, fadeOut } = clip.properties;
  let factor = 1;
  if (fadeIn > 0) factor = Math.min(factor, (time - clip.startTime) / fadeIn);
  if (fadeOut > 0) factor = Math.min(factor, (clip.endTime - time) / fadeOut);
  return Math.max(0, Math.min(1, factor));
}

/**
 * Effective preview opacity: clip opacity times the fade envelope.
 *
 * @param clip - Clip being rendered.
 * @param time - Timeline time in seconds.
 * @returns Opacity in `[0, 1]`.
 */
export function previewOpacity(clip: Clip, time: number): number {
  return Math.max(0, Math.min(1, clip.properties.opacity * fadeFactor(clip, time)));
}

/** Inputs to {@link mediaElementVolume}. */
export interface VolumeInput {
  /** Master volume, 0..1. */
  master: number;
  /** Master mute toggle. */
  muted: boolean;
  /** Clip being played. */
  clip: Clip;
  /** Timeline time, for fades. */
  time: number;
}

/**
 * Volume to assign to an `HTMLMediaElement` for a clip.
 *
 * Clip volume goes up to 200% in the UI but media elements throw on values
 * above 1, so the result is clamped; a clip volume of 0 really is silent.
 *
 * @param input - Master volume, mute flag, clip and time.
 * @returns Volume in `[0, 1]`.
 */
export function mediaElementVolume({ master, muted, clip, time }: VolumeInput): number {
  if (muted) return 0;
  const v = master * clip.properties.volume * fadeFactor(clip, time);
  return Math.max(0, Math.min(1, v));
}

/**
 * User-facing message for a media element load failure.
 *
 * @param code - `MediaError.code`, or `undefined` when the element has no error object.
 * @returns A short description.
 */
export function describeMediaError(code: number | undefined): string {
  switch (code) {
    case 4: // MEDIA_ERR_SRC_NOT_SUPPORTED
      return "Media format not supported or file not found";
    case 2: // MEDIA_ERR_NETWORK
      return "Network error loading media";
    case 3: // MEDIA_ERR_DECODE
      return "Media decoding failed";
    default:
      return "Failed to load media";
  }
}

const DROP_SHADOW = "0 2px 4px rgba(0,0,0,0.5)";

/**
 * Text-shadow approximating a glyph outline. `-webkit-text-stroke` would eat
 * into thin glyphs, so eight offset shadows are used instead.
 *
 * @param color - Outline color; `undefined`/`"transparent"` means none.
 * @returns A CSS `text-shadow` value.
 */
export function outlineShadow(color: string | undefined): string {
  if (!color || color === "transparent") return DROP_SHADOW;
  const w = "0.06em";
  const offsets = [
    [`-${w}`, `-${w}`],
    [w, `-${w}`],
    [`-${w}`, w],
    [w, w],
    ["0", `-${w}`],
    ["0", w],
    [`-${w}`, "0"],
    [w, "0"],
  ];
  return [...offsets.map(([x, y]) => `${x} ${y} 0 ${color}`), DROP_SHADOW].join(", ");
}

/**
 * Inline style for one caption word, applying the clip's highlight style
 * when the word is being spoken.
 *
 * @param text - Text properties of the caption clip.
 * @param active - Whether the word is currently spoken.
 * @returns Style for the word's `<span>`.
 */
export function captionWordStyle(text: TextProperties, active: boolean): CSSProperties {
  const style = text.highlightStyle ?? "color";
  const highlight = active && style !== "none" ? text.highlightColor : undefined;
  if (!highlight) {
    return { display: "inline-block", transition: "transform 80ms linear, color 80ms linear" };
  }
  switch (style) {
    case "box":
      return {
        display: "inline-block",
        backgroundColor: highlight,
        borderRadius: "0.15em",
        padding: "0 0.15em",
      };
    case "scale":
      return {
        display: "inline-block",
        color: highlight,
        transform: "scale(1.15)",
        transition: "transform 80ms linear, color 80ms linear",
      };
    default:
      return {
        display: "inline-block",
        color: highlight,
        transition: "transform 80ms linear, color 80ms linear",
      };
  }
}
