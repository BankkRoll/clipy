/**
 * Downloads page: the live download queue with per-item controls.
 *
 * Progress arrives through the store (see `useDownloadSync` in App); this page
 * only renders it and sends queue commands.
 */
import { useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ask } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import { VideoPlayer } from "@/components/VideoPlayer";
import {
  DownloadItem,
  DownloadsHeader,
  EmptyDownloads,
  STATUS_PRIORITY,
} from "@/components/downloads";
import { useDownloadStore } from "@/stores/downloadStore";
import type { Download, DownloadStatus } from "@/types/download";
import { useDownloadCommands, useFileSystem } from "@/hooks";
import { logger } from "@/lib/logger";

const RUNNING: ReadonlySet<DownloadStatus> = new Set(["downloading", "fetching", "processing"]);
const FINISHED: ReadonlySet<DownloadStatus> = new Set(["completed", "failed", "cancelled"]);

/** Downloads page component. */
export function Downloads() {
  const navigate = useNavigate();
  const [playingDownload, setPlayingDownload] = useState<Download | null>(null);

  const downloads = useDownloadStore((state) => state.downloads);
  const removeDownload = useDownloadStore((state) => state.removeDownload);
  const commands = useDownloadCommands();
  const { showInFolder, openFolder } = useFileSystem();

  const sortedDownloads = useMemo(
    () => [...downloads].sort((a, b) => STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status]),
    [downloads]
  );
  const activeCount = useMemo(
    () => downloads.filter((d) => RUNNING.has(d.status)).length,
    [downloads]
  );
  const completedCount = useMemo(
    () => downloads.filter((d) => FINISHED.has(d.status)).length,
    [downloads]
  );

  const runCommand = useCallback(async (label: string, command: () => Promise<void>) => {
    try {
      await command();
    } catch (err) {
      logger.error("Downloads", `Failed to ${label} download:`, err);
      toast.error(`Failed to ${label} download`, { description: String(err) });
    }
  }, []);

  const handleRemoveDownload = useCallback(
    async (downloadId: string) => {
      const confirmed = await ask("Remove this download from the list?", {
        title: "Remove Download",
        kind: "warning",
      });
      if (confirmed) removeDownload(downloadId);
    },
    [removeDownload]
  );

  const handleClearCompleted = useCallback(async () => {
    const confirmed = await ask("Clear all completed and failed downloads from the list?", {
      title: "Clear Downloads",
      kind: "warning",
    });
    if (confirmed) await runCommand("clear", commands.clearCompleted);
  }, [commands.clearCompleted, runCommand]);

  const handleOpenFolder = useCallback(
    async (download: Download) => {
      try {
        // NOTE: until the backend reports the final file, only the output
        // directory is known, so open that instead of selecting a file.
        if (download.filePath) await showInFolder(download.filePath);
        else await openFolder(download.outputPath);
      } catch (err) {
        logger.error("Downloads", "Failed to show in folder:", err);
        toast.error("Failed to open folder");
      }
    },
    [showInFolder, openFolder]
  );

  const handleViewInLibrary = useCallback(() => navigate("/library"), [navigate]);
  const handleStartDownloading = useCallback(() => navigate("/"), [navigate]);

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
                onPause={() => runCommand("pause", () => commands.pauseDownload(download.id))}
                onResume={() => runCommand("resume", () => commands.resumeDownload(download.id))}
                onCancel={() => runCommand("cancel", () => commands.cancelDownload(download.id))}
                onRetry={() => runCommand("retry", () => commands.retryDownload(download.id))}
                onRemove={() => handleRemoveDownload(download.id)}
                onOpenFolder={() => handleOpenFolder(download)}
                onViewLibrary={handleViewInLibrary}
              />
            ))}
          </div>
        )}
      </div>

      {playingDownload?.filePath && (
        <VideoPlayer
          src={playingDownload.filePath}
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
