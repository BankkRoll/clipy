/**
 * Download-related Tauri hooks
 */

import { invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect, useState } from 'react';
import { useTauriEvent } from './useTauri';

// ============================================================================
// Types
// ============================================================================

export interface VideoInfo {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  duration: number;
  channel: string;
  channelId: string;
  uploadDate: string;
  viewCount: number;
  likeCount: number;
  formats: VideoFormat[];
  isLive: boolean;
  isPrivate: boolean;
}

export interface VideoFormat {
  formatId: string;
  extension: string;
  resolution: string;
  width: number;
  height: number;
  fps: number;
  vcodec: string;
  acodec: string;
  filesize: number | null;
  filesizeApprox: number | null;
  tbr: number;
  hasVideo: boolean;
  hasAudio: boolean;
}

export interface DownloadOptions {
  quality: string;
  format: string;
  audioOnly: boolean;
  outputPath: string;
  filename: string;
  embedThumbnail: boolean;
  embedMetadata: boolean;
}

export interface DownloadTask {
  id: string;
  videoId: string;
  title: string;
  thumbnail: string;
  url: string;
  status: DownloadStatus;
  progress: number;
  downloadedBytes: number;
  totalBytes: number;
  speed: number;
  eta: number;
  quality: string;
  format: string;
  outputPath: string;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
  duration: number;
  channel: string;
}

export type DownloadStatus =
  | 'pending'
  | 'fetching'
  | 'downloading'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'paused';

export interface DownloadProgress {
  downloadId: string;
  status: DownloadStatus;
  progress: number;
  downloadedBytes: number;
  totalBytes: number;
  speed: number;
  eta: number;
}

// ============================================================================
// Video Info Hook
// ============================================================================

export function useVideoInfo() {
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchVideoInfo = useCallback(async (url: string) => {
    setLoading(true);
    setError(null);
    setVideoInfo(null);

    try {
      const info = await invoke<VideoInfo>('fetch_video_info', { url });
      setVideoInfo(info);
      return info;
    } catch (e) {
      const errorMsg = e?.toString() || 'Failed to fetch video info';
      setError(errorMsg);
      throw new Error(errorMsg);
    } finally {
      setLoading(false);
    }
  }, []);

  const getAvailableQualities = useCallback((info: VideoInfo) => {
    return invoke<string[]>('get_available_qualities', { videoInfo: info });
  }, []);

  const validateUrl = useCallback((url: string) => {
    return invoke<boolean>('validate_url', { url });
  }, []);

  const extractVideoId = useCallback((url: string) => {
    return invoke<string | null>('extract_video_id', { url });
  }, []);

  const clear = useCallback(() => {
    setVideoInfo(null);
    setError(null);
  }, []);

  return {
    videoInfo,
    loading,
    error,
    fetchVideoInfo,
    getAvailableQualities,
    validateUrl,
    extractVideoId,
    clear,
  };
}

// ============================================================================
// Download Queue Hook
// ============================================================================

export function useDownloadQueue() {
  const [downloads, setDownloads] = useState<DownloadTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch downloads
  const refresh = useCallback(async () => {
    try {
      const result = await invoke<DownloadTask[]>('get_downloads');
      setDownloads(result);
      setError(null);
    } catch (e) {
      setError(e?.toString() || 'Failed to fetch downloads');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Listen for progress updates
  useTauriEvent<DownloadProgress>('download-progress', (progress) => {
    setDownloads((prev) =>
      prev.map((d) =>
        d.id === progress.downloadId
          ? {
              ...d,
              status: progress.status,
              progress: progress.progress,
              downloadedBytes: progress.downloadedBytes,
              totalBytes: progress.totalBytes,
              speed: progress.speed,
              eta: progress.eta,
            }
          : d
      )
    );
  });

  // Start download
  const startDownload = useCallback(
    async (url: string, videoInfo: VideoInfo, options: DownloadOptions) => {
      const downloadId = await invoke<string>('start_download', {
        url,
        videoInfo,
        options,
      });
      await refresh();
      return downloadId;
    },
    [refresh]
  );

  // Pause download
  const pauseDownload = useCallback(
    async (id: string) => {
      await invoke('pause_download', { id });
      await refresh();
    },
    [refresh]
  );

  // Resume download
  const resumeDownload = useCallback(
    async (id: string) => {
      await invoke('resume_download', { id });
      await refresh();
    },
    [refresh]
  );

  // Cancel download
  const cancelDownload = useCallback(
    async (id: string) => {
      await invoke('cancel_download', { id });
      await refresh();
    },
    [refresh]
  );

  // Retry failed download
  const retryDownload = useCallback(
    async (id: string) => {
      await invoke('retry_download', { id });
      await refresh();
    },
    [refresh]
  );

  // Clear completed
  const clearCompleted = useCallback(async () => {
    await invoke('clear_completed_downloads');
    await refresh();
  }, [refresh]);

  // Set max concurrent downloads
  const setMaxConcurrent = useCallback(async (max: number) => {
    await invoke('set_max_concurrent_downloads', { max });
  }, []);

  // Computed values
  const activeDownloads = downloads.filter(
    (d) => d.status === 'downloading' || d.status === 'fetching' || d.status === 'processing'
  );
  const pendingDownloads = downloads.filter((d) => d.status === 'pending');
  const completedDownloads = downloads.filter((d) => d.status === 'completed');
  const failedDownloads = downloads.filter((d) => d.status === 'failed');

  return {
    downloads,
    activeDownloads,
    pendingDownloads,
    completedDownloads,
    failedDownloads,
    loading,
    error,
    refresh,
    startDownload,
    pauseDownload,
    resumeDownload,
    cancelDownload,
    retryDownload,
    clearCompleted,
    setMaxConcurrent,
  };
}

// ============================================================================
// Single Download Hook
// ============================================================================

export function useDownload(downloadId: string) {
  const { downloads, pauseDownload, resumeDownload, cancelDownload, retryDownload } =
    useDownloadQueue();

  const download = downloads.find((d) => d.id === downloadId) || null;

  const pause = useCallback(() => pauseDownload(downloadId), [downloadId, pauseDownload]);
  const resume = useCallback(() => resumeDownload(downloadId), [downloadId, resumeDownload]);
  const cancel = useCallback(() => cancelDownload(downloadId), [downloadId, cancelDownload]);
  const retry = useCallback(() => retryDownload(downloadId), [downloadId, retryDownload]);

  return { download, pause, resume, cancel, retry };
}
