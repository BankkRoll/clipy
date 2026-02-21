import { useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { VideoPlayer } from "@/components/VideoPlayer";
import {
  DownloadItem,
  DownloadsHeader,
  EmptyDownloads,
  STATUS_PRIORITY,
} from "@/components/downloads";
import { useDownloadStore } from "@/stores/downloadStore";
import type { Download, DownloadProgress } from "@/types/download";
import { useFileSystem, useTauriEvent } from "@/hooks";
import { ask } from "@tauri-apps/plugin-dialog";
import { logger } from "@/lib/logger";

export function Downloads() {
  const navigate = useNavigate();
  const [playingDownload, setPlayingDownload] = useState<Download | null>(null);

  const {
    downloads,
    updateProgress,
    updateDownload,
    setStatus,
    pauseDownload,
    resumeDownload,
    cancelDownload,
    retryDownload,
    removeDownload,
    clearCompleted,
  } = useDownloadStore();

  const { showInFolder } = useFileSystem();

  // Listen for download progress events from Tauri backend
  useTauriEvent<DownloadProgress>("download-progress", (progress) => {
    // Log all progress events for debugging
    console.log("[Download Progress]", progress.downloadId, progress.progress + "%", progress.status);
    logger.debug("Downloads", "Progress received:", progress);

    if (progress.status === "completed" || progress.status === "failed" || progress.status === "cancelled") {
      setStatus(progress.downloadId, progress.status);
      if (progress.status === "completed" && progress.filePath) {
        logger.debug("Downloads", "Download completed with file path:", progress.filePath);
        updateDownload(progress.downloadId, { outputPath: progress.filePath });
      }
    } else {
      updateProgress(
        progress.downloadId,
        progress.progress,
        progress.downloadedBytes,
        progress.speed,
        progress.eta
      );
    }
  });

  // Memoized sorted downloads
  const sortedDownloads = useMemo(
    () => [...downloads].sort((a, b) => STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status]),
    [downloads]
  );

  const activeCount = useMemo(
    () => downloads.filter((d) => d.status === "downloading" || d.status === "fetching" || d.status === "processing").length,
    [downloads]
  );

  const completedCount = useMemo(
    () => downloads.filter((d) => d.status === "completed" || d.status === "failed" || d.status === "cancelled").length,
    [downloads]
  );

  const handleRemoveDownload = useCallback(async (downloadId: string) => {
    const confirmed = await ask("Remove this download from the list?", {
      title: "Remove Download",
      kind: "warning",
    });
    if (confirmed) {
      removeDownload(downloadId);
    }
  }, [removeDownload]);

  const handleClearCompleted = useCallback(async () => {
    const confirmed = await ask("Clear all completed and failed downloads from the list?", {
      title: "Clear Downloads",
      kind: "warning",
    });
    if (confirmed) {
      clearCompleted();
    }
  }, [clearCompleted]);

  const handleOpenFolder = useCallback(async (path: string) => {
    try {
      await showInFolder(path);
    } catch (err) {
      logger.error("Downloads", "Failed to show in folder:", err);
    }
  }, [showInFolder]);

  const handleViewInLibrary = useCallback(() => {
    navigate("/library");
  }, [navigate]);

  const handleStartDownloading = useCallback(() => {
    navigate("/");
  }, [navigate]);

  // Handlers that call backend commands
  const handlePauseDownload = useCallback(async (id: string) => {
    try {
      await invoke("pause_download", { id });
      pauseDownload(id); // Update UI immediately
    } catch (err) {
      logger.error("Downloads", "Failed to pause download:", err);
    }
  }, [pauseDownload]);

  const handleResumeDownload = useCallback(async (id: string) => {
    try {
      await invoke("resume_download", { id });
      resumeDownload(id); // Update UI immediately
    } catch (err) {
      logger.error("Downloads", "Failed to resume download:", err);
    }
  }, [resumeDownload]);

  const handleCancelDownload = useCallback(async (id: string) => {
    try {
      await invoke("cancel_download", { id });
      cancelDownload(id); // Update UI immediately
    } catch (err) {
      logger.error("Downloads", "Failed to cancel download:", err);
    }
  }, [cancelDownload]);

  const handleRetryDownload = useCallback(async (id: string) => {
    try {
      await invoke("retry_download", { id });
      retryDownload(id); // Update UI immediately
    } catch (err) {
      logger.error("Downloads", "Failed to retry download:", err);
    }
  }, [retryDownload]);

  return (
    <div className="flex h-full flex-col">
      <DownloadsHeader
        activeCount={activeCount}
        completedCount={completedCount}
        onClearCompleted={handleClearCompleted}
        onViewLibrary={handleViewInLibrary}
      />

      <div className="flex-1 overflow-auto p-6">
        {downloads.length === 0 ? (
          <EmptyDownloads onStartDownloading={handleStartDownloading} />
        ) : (
          <div className="space-y-3">
            {sortedDownloads.map((download) => (
              <DownloadItem
                key={download.id}
                download={download}
                onPlay={() => setPlayingDownload(download)}
                onPause={() => handlePauseDownload(download.id)}
                onResume={() => handleResumeDownload(download.id)}
                onCancel={() => handleCancelDownload(download.id)}
                onRetry={() => handleRetryDownload(download.id)}
                onRemove={() => handleRemoveDownload(download.id)}
                onOpenFolder={() => handleOpenFolder(download.outputPath)}
                onViewLibrary={handleViewInLibrary}
              />
            ))}
          </div>
        )}
      </div>

      {playingDownload && (
        <VideoPlayer
          src={playingDownload.outputPath}
          title={playingDownload.title}
          subtitle={playingDownload.channel}
          poster={playingDownload.thumbnail}
          onClose={() => setPlayingDownload(null)}
          autoPlay
        />
      )}
    </div>
  );
}
