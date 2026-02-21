/**
 * Library-related Tauri hooks
 */

import { invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect, useState } from 'react';

// ============================================================================
// Types
// ============================================================================

export interface LibraryVideo {
  id: string;
  videoId: string;
  title: string;
  thumbnail: string;
  duration: number;
  channel: string;
  filePath: string;
  fileSize: number;
  format: string;
  resolution: string;
  downloadedAt: string;
  sourceUrl: string;
}

export interface LibraryStats {
  totalVideos: number;
  totalSize: number;
  totalDuration: number;
  uniqueChannels: number;
}

// ============================================================================
// Library Hook
// ============================================================================

export function useLibrary() {
  const [videos, setVideos] = useState<LibraryVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch all videos
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await invoke<LibraryVideo[]>('get_library_videos');
      setVideos(result);
      setError(null);
    } catch (e) {
      setError(e?.toString() || 'Failed to fetch library');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Add video
  const addVideo = useCallback(
    async (video: LibraryVideo) => {
      await invoke('add_library_video', { video });
      await refresh();
    },
    [refresh]
  );

  // Delete video
  const deleteVideo = useCallback(
    async (id: string, deleteFile = false) => {
      await invoke('delete_library_video', { id, deleteFile });
      await refresh();
    },
    [refresh]
  );

  // Bulk delete
  const bulkDelete = useCallback(
    async (ids: string[], deleteFiles = false) => {
      const deleted = await invoke<number>('bulk_delete_library_videos', {
        ids,
        deleteFiles,
      });
      await refresh();
      return deleted;
    },
    [refresh]
  );

  // Search videos
  const search = useCallback(async (query: string) => {
    const result = await invoke<LibraryVideo[]>('search_library', { query });
    return result;
  }, []);

  // Import video
  const importVideo = useCallback(
    async (filePath: string, title?: string, channel?: string) => {
      const video = await invoke<LibraryVideo>('import_video', {
        filePath,
        title,
        channel,
      });
      await refresh();
      return video;
    },
    [refresh]
  );

  // Rename video
  const renameVideo = useCallback(
    async (id: string, newTitle: string) => {
      await invoke('rename_library_video', { id, newTitle });
      await refresh();
    },
    [refresh]
  );

  // Check if video file exists
  const checkVideoExists = useCallback(async (filePath: string) => {
    return invoke<boolean>('check_video_exists', { filePath });
  }, []);

  // Get video file size
  const getVideoFileSize = useCallback(async (filePath: string) => {
    return invoke<number>('get_video_file_size', { filePath });
  }, []);

  // Export library to JSON
  const exportLibrary = useCallback(async () => {
    return invoke<string>('export_library_json');
  }, []);

  return {
    videos,
    loading,
    error,
    refresh,
    addVideo,
    deleteVideo,
    bulkDelete,
    search,
    importVideo,
    renameVideo,
    checkVideoExists,
    getVideoFileSize,
    exportLibrary,
  };
}

// ============================================================================
// Library Stats Hook
// ============================================================================

export function useLibraryStats() {
  const [stats, setStats] = useState<LibraryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await invoke<LibraryStats>('get_library_stats');
      setStats(result);
      setError(null);
    } catch (e) {
      setError(e?.toString() || 'Failed to fetch library stats');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { stats, loading, error, refresh };
}

// ============================================================================
// Single Video Hook
// ============================================================================

export function useLibraryVideo(videoId: string) {
  const { videos, deleteVideo, renameVideo, checkVideoExists } = useLibrary();

  const video = videos.find((v) => v.id === videoId) || null;

  const remove = useCallback(
    (deleteFile = false) => deleteVideo(videoId, deleteFile),
    [videoId, deleteVideo]
  );

  const rename = useCallback(
    (newTitle: string) => renameVideo(videoId, newTitle),
    [videoId, renameVideo]
  );

  const checkExists = useCallback(async () => {
    if (!video) return false;
    return checkVideoExists(video.filePath);
  }, [video, checkVideoExists]);

  return { video, remove, rename, checkExists };
}
