/**
 * Core Tauri API hooks
 */

import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { useCallback, useEffect, useRef, useState } from 'react';

// ============================================================================
// System Hooks
// ============================================================================

export interface SystemInfo {
  appVersion: string;
  appDataPath: string;
  cachePath: string;
  binariesPath: string;
  tempPath: string;
  os: string;
  arch: string;
}

export interface BinaryStatus {
  ffmpegInstalled: boolean;
  ffmpegVersion: string | null;
  ffmpegPath: string | null;
  ytdlpInstalled: boolean;
  ytdlpVersion: string | null;
  ytdlpPath: string | null;
}

export interface CacheStats {
  totalSize: number;
  thumbnailCount: number;
  thumbnailSize: number;
  tempFileCount: number;
  tempFileSize: number;
}

export function useSystemInfo() {
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    invoke<SystemInfo>('get_system_info')
      .then(setInfo)
      .catch((e) => setError(e.toString()))
      .finally(() => setLoading(false));
  }, []);

  return { info, loading, error };
}

export function useBinaryStatus() {
  const [status, setStatus] = useState<BinaryStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await invoke<BinaryStatus>('check_binaries');
      setStatus(result);
      setError(null);
    } catch (e) {
      setError(e?.toString() || 'Failed to check binaries');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const installFfmpeg = useCallback(async () => {
    try {
      await invoke('install_ffmpeg');
      await refresh();
    } catch (e) {
      throw new Error(e?.toString() || 'Failed to install FFmpeg');
    }
  }, [refresh]);

  const installYtdlp = useCallback(async () => {
    try {
      await invoke('install_ytdlp');
      await refresh();
    } catch (e) {
      throw new Error(e?.toString() || 'Failed to install yt-dlp');
    }
  }, [refresh]);

  const updateYtdlp = useCallback(async () => {
    try {
      await invoke('update_ytdlp');
      await refresh();
    } catch (e) {
      throw new Error(e?.toString() || 'Failed to update yt-dlp');
    }
  }, [refresh]);

  return {
    status,
    loading,
    error,
    refresh,
    installFfmpeg,
    installYtdlp,
    updateYtdlp,
  };
}

export function useCacheStats() {
  const [stats, setStats] = useState<CacheStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await invoke<CacheStats>('get_cache_stats');
      setStats(result);
      setError(null);
    } catch (e) {
      setError(e?.toString() || 'Failed to get cache stats');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const clearCache = useCallback(async () => {
    await invoke('clear_cache');
    await refresh();
  }, [refresh]);

  const clearTemp = useCallback(async () => {
    await invoke('clear_temp');
    await refresh();
  }, [refresh]);

  return { stats, loading, error, refresh, clearCache, clearTemp };
}

// ============================================================================
// File System Hooks
// ============================================================================

export function useFileSystem() {
  const openFolder = useCallback(async (path: string) => {
    await invoke('open_folder', { path });
  }, []);

  const openFile = useCallback(async (path: string) => {
    await invoke('open_file', { path });
  }, []);

  const showInFolder = useCallback(async (path: string) => {
    await invoke('show_in_folder', { path });
  }, []);

  const getDefaultDownloadPath = useCallback(async () => {
    return invoke<string>('get_default_download_path');
  }, []);

  return { openFolder, openFile, showInFolder, getDefaultDownloadPath };
}

// ============================================================================
// Event Listener Hook
// ============================================================================

export function useTauriEvent<T>(
  eventName: string,
  handler: (payload: T) => void
) {
  // Use a ref to store the handler to avoid re-subscribing on every render
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;

    listen<T>(eventName, (event) => {
      handlerRef.current(event.payload);
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, [eventName]); // Only re-subscribe when eventName changes
}

// ============================================================================
// Navigation Event Hook
// ============================================================================

export function useNavigationEvent(navigate: (path: string) => void) {
  useTauriEvent<string>('navigate', navigate);
}
