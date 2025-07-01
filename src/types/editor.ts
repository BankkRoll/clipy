export interface EditorProject {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
  filePath: string;
  timeline: TimelineData;
  metadata: ProjectMetadata;
}

export interface ProjectMetadata {
  duration: number;
  resolution: {
    width: number;
    height: number;
  };
  frameRate: number;
  audioSampleRate: number;
  videoCodec?: string;
  audioCodec?: string;
}

export interface TimelineData {
  tracks: TimelineTrack[];
  currentTime: number;
  zoomLevel: number;
  selection?: TimelineSelection;
}

export interface TimelineTrack {
  id: string;
  type: TrackType;
  name: string;
  enabled: boolean;
  muted?: boolean;
  volume?: number;
  clips: TimelineClip[];
}

export type TrackType = 'video' | 'audio' | 'subtitle';

export interface TimelineClip {
  id: string;
  filePath: string;
  startTime: number;
  endTime: number;
  duration: number;
  trimStart?: number;
  trimEnd?: number;
  effects?: ClipEffect[];
}

export interface TimelineSelection {
  startTime: number;
  endTime: number;
  trackIds: string[];
}

export interface ClipEffect {
  id: string;
  type: EffectType;
  enabled: boolean;
  parameters: Record<string, unknown>;
}

export type EffectType = 
  | 'fade-in'
  | 'fade-out'
  | 'speed'
  | 'crop'
  | 'resize'
  | 'color-correction'
  | 'audio-normalize'
  | 'audio-amplify';

export type EditorTool = 
  | 'select'
  | 'trim'
  | 'split'
  | 'fade'
  | 'speed'
  | 'crop'
  | 'text';

export interface EditorToolState {
  activeTool: EditorTool;
  toolOptions: Record<string, unknown>;
}

export interface ExportSettings {
  format: ExportFormat;
  quality: ExportQuality;
  resolution?: VideoResolution;
  frameRate?: number;
  bitrate?: number;
  audioSettings?: AudioExportSettings;
  outputPath: string;
  filename: string;
}

export type ExportFormat = 'mp4' | 'webm' | 'mkv' | 'avi' | 'mov' | 'mp3' | 'm4a';

export type ExportQuality = 'lossless' | 'high' | 'medium' | 'low' | 'custom';

export interface VideoResolution {
  width: number;
  height: number;
  label: string;
}

export interface AudioExportSettings {
  codec: 'aac' | 'mp3' | 'opus' | 'flac';
  bitrate: number;
  sampleRate: number;
  channels: number;
}

export interface TrimOperation {
  filePath: string;
  startTime: number;
  endTime: number;
  outputPath: string;
}

export interface SplitOperation {
  filePath: string;
  splitTime: number;
  outputPaths: [string, string];
}

export interface MergeOperation {
  filePaths: string[];
  outputPath: string;
  crossfadeDuration?: number;
}

export interface CropOperation {
  filePath: string;
  x: number;
  y: number;
  width: number;
  height: number;
  outputPath: string;
}

export interface EditorState {
  project?: EditorProject;
  timeline: TimelineData;
  playback: PlaybackState;
  tools: EditorToolState;
  export: ExportState;
}

export interface PlaybackState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  playbackRate: number;
}

export interface ExportState {
  isExporting: boolean;
  progress: number;
  currentFile?: string;
  estimatedTimeRemaining?: number;
}

export interface EditorEvents {
  'project-opened': (project: EditorProject) => void;
  'project-saved': (project: EditorProject) => void;
  'clip-added': (clip: TimelineClip, trackId: string) => void;
  'clip-removed': (clipId: string, trackId: string) => void;
  'clip-trimmed': (clipId: string, startTime: number, endTime: number) => void;
  'timeline-updated': (timeline: TimelineData) => void;
  'playback-changed': (state: PlaybackState) => void;
  'export-started': (settings: ExportSettings) => void;
  'export-progress': (progress: number) => void;
  'export-completed': (outputPath: string) => void;
  'export-failed': (error: string) => void;
}

export interface EditorPreset {
  id: string;
  name: string;
  description: string;
  exportSettings: ExportSettings;
  category: PresetCategory;
}

export type PresetCategory = 
  | 'web'
  | 'social-media'
  | 'mobile'
  | 'broadcast'
  | 'archive'
  | 'custom';

import type {
  EditorExportResponse,
  EditorMergeResponse,
  EditorOpenResponse,
  EditorSaveResponse,
  EditorSplitResponse,
  EditorTrimResponse
} from './api';

export interface EditorManagerContext {
  open: (filePath: string) => Promise<EditorOpenResponse>;
  save: (projectData: unknown) => Promise<EditorSaveResponse>;
  export: (projectData: unknown, outputPath: string) => Promise<EditorExportResponse>;
  trim: (filePath: string, startTime: number, endTime: number) => Promise<EditorTrimResponse>;
  split: (filePath: string, splitTime: number) => Promise<EditorSplitResponse>;
  merge: (filePaths: string[], outputPath: string) => Promise<EditorMergeResponse>;
}

export interface EditorFileData {
    filePath: string;
    duration: number;
    metadata: Record<string, unknown>;
}

export interface EditorProjectData {
    status: string;
    projectPath: string;
}

export interface EditorExportData {
    status: string;
    outputPath: string;
}

export interface EditorTrimData {
    status: string;
    outputPath: string;
}

export interface EditorSplitData {
    status: string;
    outputPaths: string[];
}

export interface EditorMergeData {
    status: string;
    outputPath: string;
} 