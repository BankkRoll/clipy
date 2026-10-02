/**
 * Media file classification for the editor's import flow.
 */
import type { ClipType } from "@/types/editor";

/** Extensions imported as video clips. */
export const VIDEO_EXTENSIONS = ["mp4", "mkv", "avi", "mov", "webm"] as const;
/** Extensions imported as audio clips. */
export const AUDIO_EXTENSIONS = ["mp3", "wav", "ogg", "m4a"] as const;
/** Extensions imported as still-image clips. */
export const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "webp"] as const;

/** Seconds an imported still image lasts on the timeline. */
export const DEFAULT_IMAGE_DURATION = 5;
/** Fallback length when the backend cannot report a media duration. */
export const FALLBACK_MEDIA_DURATION = 60;

/** File-type filters for the "Import from disk" dialog. */
export const MEDIA_DIALOG_FILTERS = [
  {
    name: "Media Files",
    extensions: [...VIDEO_EXTENSIONS, ...AUDIO_EXTENSIONS, ...IMAGE_EXTENSIONS],
  },
  { name: "Video", extensions: [...VIDEO_EXTENSIONS] },
  { name: "Audio", extensions: [...AUDIO_EXTENSIONS] },
  { name: "Images", extensions: [...IMAGE_EXTENSIONS] },
];

/** Kind of media a file holds, as far as the editor cares. */
export type MediaKind = Exclude<ClipType, "text">;

/**
 * Classify a path by its extension (case-insensitive).
 *
 * @param path - File path or name.
 * @returns The media kind, or `null` for unsupported files.
 * @example
 * classifyMediaExtension("C:\\clips\\Intro.MP4"); // "video"
 */
export function classifyMediaExtension(path: string): MediaKind | null {
  const name = fileNameFromPath(path);
  const dot = name.lastIndexOf(".");
  if (dot < 0) return null;
  const ext = name.slice(dot + 1).toLowerCase();
  if ((VIDEO_EXTENSIONS as readonly string[]).includes(ext)) return "video";
  if ((AUDIO_EXTENSIONS as readonly string[]).includes(ext)) return "audio";
  if ((IMAGE_EXTENSIONS as readonly string[]).includes(ext)) return "image";
  return null;
}

/**
 * Last path segment, accepting both `/` and `\` separators.
 *
 * @param path - File path.
 * @returns The file name, or `"Media"` for an empty path.
 */
export function fileNameFromPath(path: string): string {
  return path.split(/[/\\]/).pop() || "Media";
}
