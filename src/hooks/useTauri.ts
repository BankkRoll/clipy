/**
 * Core Tauri API hooks: system info, bundled binaries, cache, file system,
 * backend events and the app version.
 */

import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";
import { APP_VERSION } from "@/lib/constants";

// ============================================================================
// System Hooks
// ============================================================================

/** Result of the `get_system_info` command. */
export interface SystemInfo {
  appVersion: string;
  appDataPath: string;
  cachePath: string;
  binariesPath: string;
  tempPath: string;
  os: string;
  arch: string;
}

/** Result of the `check_binaries` command. */
export interface BinaryStatus {
  ffmpegInstalled: boolean;
  ffmpegVersion: string | null;
  ffmpegPath: string | null;
  ytdlpInstalled: boolean;
  ytdlpVersion: string | null;
  ytdlpPath: string | null;
}

/** Result of the `get_cache_stats` command; sizes in bytes. */
export interface CacheStats {
  totalSize: number;
  thumbnailCount: number;
  thumbnailSize: number;
  tempFileCount: number;
  tempFileSize: number;
}

/**
 * Load host/system information once on mount.
 *
 * @returns The info (null until loaded), loading flag and error message.
 */
export function useSystemInfo() {
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    invoke<SystemInfo>("get_system_info")
      .then(setInfo)
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  return { info, loading, error };
}

/**
 * Track FFmpeg / yt-dlp install status and expose install/update commands.
 * The commands rethrow failures as `Error` so callers can show a message.
 *
 * @returns Status, loading/error state, `refresh` and install/update commands.
 */
export function useBinaryStatus() {
  const [status, setStatus] = useState<BinaryStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await invoke<BinaryStatus>("check_binaries");
      setStatus(result);
      setError(null);
    } catch (e) {
      setError(e?.toString() || "Failed to check binaries");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const runAndRefresh = useCallback(
    async (command: string, fallback: string) => {
      try {
        await invoke(command);
      } catch (e) {
        throw new Error(e?.toString() || fallback);
      }
      await refresh();
    },
    [refresh]
  );

  const installFfmpeg = useCallback(
    () => runAndRefresh("install_ffmpeg", "Failed to install FFmpeg"),
    [runAndRefresh]
  );
  const installYtdlp = useCallback(
    () => runAndRefresh("install_ytdlp", "Failed to install yt-dlp"),
    [runAndRefresh]
  );
  const updateYtdlp = useCallback(
    () => runAndRefresh("update_ytdlp", "Failed to update yt-dlp"),
    [runAndRefresh]
  );

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

/**
 * Track cache usage and expose cache-clearing commands.
 *
 * @returns Stats, loading/error state, `refresh`, `clearCache` and `clearTemp`.
 */
export function useCacheStats() {
  const [stats, setStats] = useState<CacheStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await invoke<CacheStats>("get_cache_stats");
      setStats(result);
      setError(null);
    } catch (e) {
      setError(e?.toString() || "Failed to get cache stats");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const clearCache = useCallback(async () => {
    await invoke("clear_cache");
    await refresh();
  }, [refresh]);

  const clearTemp = useCallback(async () => {
    await invoke("clear_temp");
    await refresh();
  }, [refresh]);

  return { stats, loading, error, refresh, clearCache, clearTemp };
}

/**
 * Resolve the running app's version via the Tauri app plugin.
 *
 * @returns The version; the bundled {@link APP_VERSION} until (or unless) the
 *   plugin answers.
 */
export function useAppVersion(): string {
  const [version, setVersion] = useState(APP_VERSION);

  useEffect(() => {
    let cancelled = false;
    getVersion()
      .then((v) => {
        if (!cancelled && v) setVersion(v);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return version;
}

// ============================================================================
// File System Hooks
// ============================================================================

/**
 * File-system commands implemented by the backend.
 *
 * @returns `openFolder`, `openFile`, `showInFolder` and `getDefaultDownloadPath`.
 */
export function useFileSystem() {
  const openFolder = useCallback(async (path: string) => {
    await invoke("open_folder", { path });
  }, []);

  const openFile = useCallback(async (path: string) => {
    await invoke("open_file", { path });
  }, []);

  const showInFolder = useCallback(async (path: string) => {
    await invoke("show_in_folder", { path });
  }, []);

  const getDefaultDownloadPath = useCallback(async () => {
    return invoke<string>("get_default_download_path");
  }, []);

  return { openFolder, openFile, showInFolder, getDefaultDownloadPath };
}

// ============================================================================
// Event Listener Hook
// ============================================================================

/**
 * Subscribe to a backend event for the lifetime of the component.
 *
 * The latest `handler` is always called, so callers need not memoize it.
 *
 * @param eventName - Event to listen for, e.g. `download-progress`.
 * @param handler - Receives the event payload.
 */
export function useTauriEvent<T>(eventName: string, handler: (payload: T) => void): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    let disposed = false;
    let unlisten: UnlistenFn | undefined;

    void listen<T>(eventName, (event) => {
      handlerRef.current(event.payload);
    }).then((fn) => {
      // NOTE: listen() resolves asynchronously; if the component unmounted in
      // the meantime, tear the listener down immediately instead of leaking it.
      if (disposed) fn();
      else unlisten = fn;
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [eventName]);
}

// ============================================================================
// Navigation Event Hook
// ============================================================================

/**
 * Follow `navigate` events emitted by the system tray menu.
 *
 * @param navigate - Called with the requested route path.
 */
export function useNavigationEvent(navigate: (path: string) => void): void {
  useTauriEvent<string>("navigate", navigate);
}
