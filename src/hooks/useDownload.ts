/**
 * Download-related Tauri hooks.
 *
 * - {@link useVideoInfo}: fetch metadata for a URL before downloading
 * - {@link useDownloadCommands}: queue commands that keep the download store in step
 * - {@link useDownloadSync}: the app's single `download-progress` subscription
 */

import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";
import { useTauriEvent } from "./useTauri";
import { UNKNOWN_FAILURE_REASON, useDownloadStore } from "@/stores/downloadStore";
import { logger } from "@/lib/logger";
import type { DownloadOptions, DownloadProgress, DownloadTask } from "@/types/download";
import type { VideoInfo } from "@/types/video";

export type { VideoInfo, VideoFormat } from "@/types/video";
export type {
  DownloadOptions,
  DownloadProgress,
  DownloadStatus,
  DownloadTask,
} from "@/types/download";

// ============================================================================
// Video Info Hook
// ============================================================================

/**
 * Fetch video metadata from the backend.
 *
 * @returns The last fetched info, loading/error state, and command wrappers.
 */
export function useVideoInfo() {
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchVideoInfo = useCallback(async (url: string) => {
    setLoading(true);
    setError(null);
    setVideoInfo(null);

    try {
      const info = await invoke<VideoInfo>("fetch_video_info", { url });
      setVideoInfo(info);
      return info;
    } catch (e) {
      const errorMsg = e?.toString() || "Failed to fetch video info";
      setError(errorMsg);
      throw new Error(errorMsg);
    } finally {
      setLoading(false);
    }
  }, []);

  const getAvailableQualities = useCallback((info: VideoInfo) => {
    return invoke<string[]>("get_available_qualities", { videoInfo: info });
  }, []);

  const validateUrl = useCallback((url: string) => {
    return invoke<boolean>("validate_url", { url });
  }, []);

  const extractVideoId = useCallback((url: string) => {
    return invoke<string | null>("extract_video_id", { url });
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
// Download Commands
// ============================================================================

/** How a started download is labelled in the downloads list. */
export interface DownloadDisplay {
  /** e.g. `1080p` or `Audio`. */
  quality: string;
  /** Container or audio format, e.g. `mp4`. */
  format: string;
}

/**
 * Download queue commands. Each one calls the backend first and only then
 * mirrors the change into the download store, so a rejected command leaves the
 * list untouched. Errors propagate to the caller.
 *
 * @returns Command functions bound to the backend and the download store.
 */
export function useDownloadCommands() {
  const startDownload = useCallback(
    async (
      url: string,
      videoInfo: VideoInfo,
      options: DownloadOptions,
      display: DownloadDisplay
    ): Promise<string> => {
      const id = await invoke<string>("start_download", { url, videoInfo, options });
      useDownloadStore.getState().addDownloadWithId(id, {
        videoId: videoInfo.id,
        title: videoInfo.title,
        thumbnail: videoInfo.thumbnail,
        url,
        status: "pending",
        progress: 0,
        totalBytes: 0,
        downloadedBytes: 0,
        speed: 0,
        eta: 0,
        quality: display.quality,
        format: display.format,
        outputPath: options.outputPath,
        error: null,
        completedAt: null,
        duration: videoInfo.duration,
        channel: videoInfo.channel,
      });
      return id;
    },
    []
  );

  const pauseDownload = useCallback(async (id: string) => {
    await invoke("pause_download", { id });
    useDownloadStore.getState().pauseDownload(id);
  }, []);

  const resumeDownload = useCallback(async (id: string) => {
    await invoke("resume_download", { id });
    useDownloadStore.getState().resumeDownload(id);
  }, []);

  const cancelDownload = useCallback(async (id: string) => {
    await invoke("cancel_download", { id });
    useDownloadStore.getState().cancelDownload(id);
  }, []);

  const retryDownload = useCallback(async (id: string) => {
    await invoke("retry_download", { id });
    useDownloadStore.getState().retryDownload(id);
  }, []);

  const clearCompleted = useCallback(async () => {
    await invoke("clear_completed_downloads");
    useDownloadStore.getState().clearCompleted();
  }, []);

  const setMaxConcurrent = useCallback(async (max: number) => {
    await invoke("set_max_concurrent_downloads", { max });
  }, []);

  return {
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
// Download Sync
// ============================================================================

async function fetchTasks(): Promise<DownloadTask[]> {
  return (await invoke<DownloadTask[] | null>("get_downloads")) ?? [];
}

/**
 * Keep the download store in sync with the backend queue.
 *
 * Mount exactly once (in `App`): it is the only `download-progress` listener,
 * so finished file paths and failure reasons are recorded no matter which route
 * is showing. On mount it merges `get_downloads` so a reload keeps the queue.
 */
export function useDownloadSync(): void {
  useEffect(() => {
    void fetchTasks()
      .then((tasks) => useDownloadStore.getState().syncFromBackend(tasks))
      .catch((err) => logger.error("Downloads", "Failed to load download queue:", err));
  }, []);

  useTauriEvent<DownloadProgress>("download-progress", (progress) => {
    const store = useDownloadStore.getState();
    store.applyProgress(progress);

    // NOTE: the backend's failure event carries no reason; the task returned by
    // get_downloads does, so look it up rather than showing a bare "Failed".
    if (progress.status === "failed" && !progress.message) {
      const id = progress.downloadId;
      void fetchTasks()
        .then((tasks) => tasks.find((t) => t.id === id)?.error)
        .catch(() => undefined)
        .then((reason) => store.setStatus(id, "failed", reason || UNKNOWN_FAILURE_REASON));
    }
  });
}
