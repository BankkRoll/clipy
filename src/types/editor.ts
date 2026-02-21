/**
 * Editor-related type definitions
 */

export interface EditorProject {
  id: string;
  name: string;
  createdAt: string;
  modifiedAt: string;
  duration: number;
  tracks: Track[];
  settings: ProjectSettings;
}

export interface ProjectSettings {
  width: number;
  height: number;
  fps: number;
  sampleRate: number;
}

export interface Track {
  id: string;
  type: TrackType;
  name: string;
  clips: Clip[];
  muted: boolean;
  locked: boolean;
  volume: number;
  height: number;
}

export type TrackType = "video" | "audio" | "text" | "effect";

export interface Clip {
  id: string;
  trackId: string;
  type: ClipType;
  name: string;
  startTime: number;
  endTime: number;
  sourceStart: number;
  sourceEnd: number;
  sourcePath: string;
  thumbnails: string[];
  properties: ClipProperties;
}

export type ClipType = "video" | "audio" | "text" | "image";

export interface ClipProperties {
  volume: number;
  opacity: number;
  speed: number;
  fadeIn: number;
  fadeOut: number;
  filters: Filter[];
  transform: Transform;
  text?: TextProperties;
}

export interface Transform {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
}

export interface TextProperties {
  content: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  color: string;
  backgroundColor: string;
  align: "left" | "center" | "right";
  verticalAlign: "top" | "middle" | "bottom";
}

export interface Filter {
  id: string;
  type: FilterType;
  enabled: boolean;
  params: Record<string, number | string | boolean>;
}

export type FilterType =
  | "brightness"
  | "contrast"
  | "saturation"
  | "hue"
  | "blur"
  | "sharpen"
  | "grayscale"
  | "sepia"
  | "invert";

export interface Transition {
  id: string;
  type: TransitionType;
  duration: number;
  params: Record<string, number | string>;
}

export type TransitionType = "fade" | "dissolve" | "wipe" | "slide" | "zoom";

export interface Keyframe {
  time: number;
  value: number;
  easing: EasingType;
}

export type EasingType = "linear" | "ease-in" | "ease-out" | "ease-in-out";

export interface HistoryEntry {
  id: string;
  type: string;
  description: string;
  timestamp: number;
  state: EditorProject;
}

export interface ExportSettings {
  format: "mp4" | "webm" | "mkv";
  quality: "low" | "medium" | "high" | "ultra";
  resolution: string;
  fps: number;
  videoBitrate: number;
  audioBitrate: number;
  useHardwareAcceleration: boolean;
  outputPath: string;
}
