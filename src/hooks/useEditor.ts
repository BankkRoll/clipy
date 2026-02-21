/**
 * Editor-related Tauri hooks
 */

import { invoke } from '@tauri-apps/api/core';
import { useCallback, useState } from 'react';
import { useTauriEvent } from './useTauri';

// ============================================================================
// Types
// ============================================================================

export interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
  fps: number;
  videoCodec: string;
  audioCodec: string;
  bitrate: number;
  hasAudio: boolean;
}

export interface Project {
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
  trackType: 'video' | 'audio' | 'text' | 'effect';
  name: string;
  clips: Clip[];
  muted: boolean;
  locked: boolean;
  volume: number;
  height: number;
}

export interface Clip {
  id: string;
  trackId: string;
  clipType: 'video' | 'audio' | 'text' | 'image';
  name: string;
  startTime: number;
  endTime: number;
  sourceStart: number;
  sourceEnd: number;
  sourcePath: string;
  thumbnails: string[];
  properties: ClipProperties;
}

export interface ClipProperties {
  volume: number;
  opacity: number;
  speed: number;
  fadeIn: number;
  fadeOut: number;
  filters: Filter[];
  transform: Transform;
  text: TextProperties | null;
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
  align: 'left' | 'center' | 'right';
  verticalAlign: 'top' | 'middle' | 'bottom';
}

export interface Filter {
  id: string;
  filterType: string;
  enabled: boolean;
  params: Record<string, unknown>;
}

export interface ExportSettings {
  format: string;
  quality: string;
  resolution: string;
  fps: number;
  videoBitrate: number;
  audioBitrate: number;
  useHardwareAcceleration: boolean;
  outputPath: string;
  videoCodec?: string;
  audioCodec?: string;
  crfQuality?: number;
  encodingPreset?: string;
  hardwareAccelerationType?: string;
}

export interface ExportProgress {
  projectId: string;
  progress: number;
  currentFrame: number;
  totalFrames: number;
  elapsedTime: number;
  estimatedTime: number;
  status: 'preparing' | 'exporting' | 'finalizing' | 'completed' | 'failed' | 'cancelled';
  error: string | null;
}

export interface ExportFormat {
  id: string;
  name: string;
  extension: string;
  description: string;
}

export interface ExportResolution {
  id: string;
  name: string;
  width: number;
  height: number;
}

// ============================================================================
// Video Metadata Hook
// ============================================================================

export function useVideoMetadata() {
  const [metadata, setMetadata] = useState<VideoMetadata | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getMetadata = useCallback(async (path: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<VideoMetadata>('get_video_metadata', { path });
      setMetadata(result);
      return result;
    } catch (e) {
      const errorMsg = e?.toString() || 'Failed to get video metadata';
      setError(errorMsg);
      throw new Error(errorMsg);
    } finally {
      setLoading(false);
    }
  }, []);

  return { metadata, loading, error, getMetadata };
}

// ============================================================================
// Thumbnail Hook
// ============================================================================

export function useThumbnails() {
  const generateThumbnail = useCallback(
    async (videoPath: string, outputPath: string, timeOffset: number) => {
      await invoke('generate_thumbnail', { videoPath, outputPath, timeOffset });
    },
    []
  );

  const generateTimelineThumbnails = useCallback(
    async (videoPath: string, outputDir: string, count: number, width: number) => {
      const thumbnails = await invoke<string[]>('generate_timeline_thumbnails', {
        videoPath,
        outputDir,
        count,
        width,
      });
      return thumbnails;
    },
    []
  );

  return { generateThumbnail, generateTimelineThumbnails };
}

// ============================================================================
// Waveform Hook
// ============================================================================

export function useWaveform() {
  const [waveform, setWaveform] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const extractWaveform = useCallback(async (videoPath: string, samples: number) => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<number[]>('extract_waveform', { videoPath, samples });
      setWaveform(result);
      return result;
    } catch (e) {
      const errorMsg = e?.toString() || 'Failed to extract waveform';
      setError(errorMsg);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  return { waveform, loading, error, extractWaveform };
}

// ============================================================================
// Project Hook
// ============================================================================

export function useProject() {
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createProject = useCallback(
    async (name: string, width: number, height: number, fps: number) => {
      const newProject = await invoke<Project>('create_project', {
        name,
        width,
        height,
        fps,
      });
      setProject(newProject);
      return newProject;
    },
    []
  );

  const loadProject = useCallback(async (path: string) => {
    setLoading(true);
    setError(null);
    try {
      const loadedProject = await invoke<Project>('load_project', { path });
      setProject(loadedProject);
      return loadedProject;
    } catch (e) {
      const errorMsg = e?.toString() || 'Failed to load project';
      setError(errorMsg);
      throw new Error(errorMsg);
    } finally {
      setLoading(false);
    }
  }, []);

  const saveProject = useCallback(
    async (path: string) => {
      if (!project) throw new Error('No project to save');
      await invoke('save_project', { project, path });
    },
    [project]
  );

  return {
    project,
    setProject,
    loading,
    error,
    createProject,
    loadProject,
    saveProject,
  };
}

// ============================================================================
// Export Hook
// ============================================================================

export function useExport() {
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Listen for export progress
  useTauriEvent<ExportProgress>('export-progress', (p) => {
    setProgress(p);
    if (p.status === 'completed' || p.status === 'failed' || p.status === 'cancelled') {
      setExporting(false);
    }
    if (p.error) {
      setError(p.error);
    }
  });

  const startExport = useCallback(async (project: Project, settings: ExportSettings) => {
    setExporting(true);
    setProgress(null);
    setError(null);
    try {
      const outputPath = await invoke<string>('export_project', { project, settings });
      return outputPath;
    } catch (e) {
      const errorMsg = e?.toString() || 'Export failed';
      setError(errorMsg);
      setExporting(false);
      throw new Error(errorMsg);
    }
  }, []);

  const cancelExport = useCallback(async () => {
    await invoke('cancel_export');
    setExporting(false);
  }, []);

  const getExportStatus = useCallback(async () => {
    return invoke<string | null>('get_export_status');
  }, []);

  return {
    exporting,
    progress,
    error,
    startExport,
    cancelExport,
    getExportStatus,
  };
}

// ============================================================================
// Export Options Hook
// ============================================================================

export function useExportOptions() {
  const [formats, setFormats] = useState<ExportFormat[]>([]);
  const [resolutions, setResolutions] = useState<ExportResolution[]>([]);

  const loadOptions = useCallback(async () => {
    const [f, r] = await Promise.all([
      invoke<ExportFormat[]>('get_export_formats'),
      invoke<ExportResolution[]>('get_export_resolutions'),
    ]);
    setFormats(f);
    setResolutions(r);
  }, []);

  return { formats, resolutions, loadOptions };
}
